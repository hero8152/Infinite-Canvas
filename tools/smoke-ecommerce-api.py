from __future__ import annotations

import asyncio
import io
import json
import os
import sys
import tempfile
import time
from pathlib import Path
from unittest.mock import patch

from PIL import Image


PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


def png_bytes(color: str) -> bytes:
    output = io.BytesIO()
    Image.new("RGB", (96, 128), color).save(output, "PNG")
    return output.getvalue()


def wait_for_task(client, task_id: str) -> dict:
    for _ in range(100):
        response = client.get(f"/api/ecommerce/tasks/{task_id}")
        if response.status_code != 200:
            raise AssertionError(response.text)
        task = response.json()
        if task.get("status") not in {"queued", "running"}:
            return task
        time.sleep(0.02)
    raise AssertionError(f"Task {task_id} did not finish")


def wait_for_tasks(client, task_ids: list[str]) -> dict[str, dict]:
    for _ in range(100):
        response = client.post("/api/ecommerce/tasks/status", json={"ids": task_ids})
        if response.status_code != 200:
            raise AssertionError(response.text)
        payload = response.json()
        states = {item["id"]: item.get("status") for item in payload.get("tasks") or []}
        if not payload.get("missing") and all(states.get(task_id) not in {None, "queued", "running"} for task_id in task_ids):
            return {task_id: client.get(f"/api/ecommerce/tasks/{task_id}").json() for task_id in task_ids}
        time.sleep(0.02)
    raise AssertionError(f"Tasks did not finish: {task_ids}")


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="canvas-ecommerce-smoke-") as data_dir:
        os.environ.update(
            CANVAS_DATA_DIR=data_dir,
            CANVAS_DESKTOP_TOKEN="ecommerce-smoke-token",
            CANVAS_HOST="127.0.0.1",
            CANVAS_PORT="3998",
            CANVAS_RUNTIME_MODE="desktop",
            GRSAI_API_KEY="ecommerce-smoke-configured-key",
        )
        from fastapi.testclient import TestClient
        import main as canvas_main

        calls = []

        async def fake_batch(**kwargs):
            await asyncio.sleep(0)
            calls.append(dict(kwargs))
            source = next(
                item["url"]
                for item in kwargs["references"]
                if item.get("role") in {"source", "subject"} or item.get("reference_type") == "subject"
            )
            now = time.time()
            return {
                "provider": {"id": kwargs["provider_id"], "name": kwargs["provider_id"]},
                "model": kwargs["model"],
                "count": kwargs["count"],
                "references": kwargs["references"],
                "images": [source for _ in range(kwargs["count"])],
                "image_items": [{"url": source} for _ in range(kwargs["count"])],
                "raw": {"id": f"mock-{len(calls)}"},
                "generation_started_at": now - 0.01,
                "generation_completed_at": now,
                "generation_elapsed_seconds": 0.01,
            }

        async def no_classification(_path):
            return {}

        async def fake_vision_caption(*_args, **_kwargs):
            await asyncio.sleep(0)
            return '{"subject":"商品主体","garment":"服装参考","composition":"居中构图","lighting":"柔和棚拍光","background":"纯色背景","constraints":"保持主体一致"}'

        with (
            TestClient(canvas_main.app) as client,
            patch.object(canvas_main, "execute_ai_image_batch", side_effect=fake_batch),
            patch.object(canvas_main, "classify_asset_image_best_effort", side_effect=no_classification),
            patch.object(canvas_main, "caption_image_with_provider", side_effect=fake_vision_caption),
        ):
            bootstrap = client.get("/api/auth/bootstrap?token=ecommerce-smoke-token", follow_redirects=False)
            if bootstrap.status_code != 303:
                raise AssertionError(bootstrap.text)
            client.cookies.update(bootstrap.cookies)

            upload = client.post("/api/ai/upload", files=[
                ("files", ("source.png", png_bytes("white"), "image/png")),
                ("files", ("garment.png", png_bytes("red"), "image/png")),
                ("files", ("prop.png", png_bytes("blue"), "image/png")),
                ("files", ("background.png", png_bytes("green"), "image/png")),
                ("files", ("shoes.png", png_bytes("black"), "image/png")),
                ("files", ("accessory.png", png_bytes("yellow"), "image/png")),
                ("files", ("pose.png", png_bytes("purple"), "image/png")),
            ])
            if upload.status_code != 200:
                raise AssertionError(upload.text)
            files = {Path(item["name"]).stem: item for item in upload.json()["files"]}
            source = {**files["source"], "role": "source"}

            payloads = {
                "try_on": {"inputs": [source, {**files["garment"], "role": "garment"}], "options": {"garment_category": "auto"}},
                "pose_transfer": {"inputs": [source], "options": {"pose_source": "preset", "pose_preset": "walking"}},
                "prop_replace": {"inputs": [source, {**files["prop"], "role": "prop"}], "options": {"target_description": "left-hand bag"}},
                "angle_change": {
                    "inputs": [source],
                    "options": {"azimuth": 45, "elevation": 0, "distance": "medium"},
                    "aspect_ratio": "4:5",
                    "resolution": "2k",
                    "quality": "high",
                    "count": 1,
                },
                "background_change": {"inputs": [source], "options": {"background_mode": "preset", "background_preset": "studio_white"}},
                "universal": {
                    "inputs": [
                        {**files["source"], "role": "subject", "reference_type": "subject", "reference_id": "model", "label": "模特"},
                        {**files["garment"], "role": "full_garment", "reference_type": "full_garment", "reference_id": "dress", "label": "蓝色连衣裙"},
                        {**files["shoes"], "role": "shoes", "reference_type": "shoes", "reference_id": "shoes", "label": "黑色高跟鞋"},
                        {**files["accessory"], "role": "accessory", "reference_type": "accessory", "reference_id": "necklace", "label": "银色项链"},
                        {**files["pose"], "role": "pose", "reference_type": "pose", "reference_id": "pose", "label": "自然站姿"},
                        {**files["background"], "role": "scene", "reference_type": "scene", "reference_id": "scene", "label": "简洁棚拍场景"},
                    ],
                    "options": {},
                    "provider_id": "grsai",
                    "model": "gpt-image-2-vip",
                },
            }

            task_ids = {}
            for operation, values in payloads.items():
                response = client.post("/api/ecommerce/tasks", json={"operation": operation, "mode": "preview", **values})
                if response.status_code != 200:
                    raise AssertionError(f"{operation}: {response.text}")
                task_ids[operation] = response.json()["id"]

            completed = wait_for_tasks(client, list(task_ids.values()))
            tasks = {}
            for operation, task_id in task_ids.items():
                task = completed[task_id]
                if task.get("status") != "succeeded" or len(task.get("result", {}).get("images", [])) != 1:
                    raise AssertionError(f"{operation}: {task}")
                if client.get(task["result"]["images"][0]).status_code != 200:
                    raise AssertionError(f"{operation}: generated preview is not downloadable")
                if operation == "universal" and "AUTO FINAL COMPOSITION" not in task.get("prompt", ""):
                    raise AssertionError(f"{operation}: auto prompt missing: {task.get('prompt')}")
                tasks[operation] = task

            selected_parameters = next((call for call in calls if call.get("size") == "1632x2040"), None)
            if not selected_parameters or selected_parameters.get("quality") != "high" or selected_parameters.get("count") != 1:
                raise AssertionError(f"Selected generation parameters did not reach the image batch: {calls}")

            blocked = client.post(f"/api/ecommerce/tasks/{tasks['try_on']['id']}/export")
            if blocked.status_code != 409:
                raise AssertionError("Unapproved export was not blocked")

            background = tasks["background_change"]
            quality = client.get("/api/ecommerce/capabilities").json()["quality_checks"]["background_change"]
            approval = client.post(
                f"/api/ecommerce/tasks/{background['id']}/approve",
                json={"output_index": 0, "checks": {item["id"]: True for item in quality}, "note": "smoke"},
            )
            if approval.status_code != 200:
                raise AssertionError(approval.text)
            exported = client.post(f"/api/ecommerce/tasks/{background['id']}/export")
            if exported.status_code != 200 or not exported.json().get("export", {}).get("url"):
                raise AssertionError(exported.text)
            export_url = exported.json()["export"]["url"]
            saved = client.post("/api/asset-library/items", json={
                "library_id": "default",
                "category_id": "characters",
                "url": export_url,
                "name": "ecommerce-smoke.png",
            })
            if saved.status_code != 200:
                raise AssertionError(saved.text)

            retry_payload = {"operation": "angle_change", "mode": "preview", **payloads["angle_change"], "parent_task_id": tasks["angle_change"]["id"]}
            retry = client.post("/api/ecommerce/tasks", json=retry_payload)
            retry_task = wait_for_task(client, retry.json()["id"])
            if retry_task.get("parent_task_id") != tasks["angle_change"]["id"]:
                raise AssertionError("Version parent link was not preserved")

            persisted = canvas_main.DATABASE.load_tasks("ecommerce")
            result = {
                "operations": sorted(tasks),
                "single_candidate_tasks": len(tasks),
                "concurrent_submissions": len(task_ids),
                "mock_upstream_calls": len(calls),
                "official_export": export_url,
                "asset_saved": True,
                "version_parent_link": True,
                "selected_parameters": {"aspect_ratio": "4:5", "size": "1632x2040", "quality": "high", "count": 1},
                "persisted_tasks": len(persisted),
                "status": "ok",
            }
            print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
