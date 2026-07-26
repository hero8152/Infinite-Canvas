from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import time
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


def wait_for_task(client, task_id: str, timeout: float) -> dict:
    deadline = time.monotonic() + timeout
    last = {}
    while time.monotonic() < deadline:
        response = client.get(f"/api/ecommerce/tasks/{task_id}")
        response.raise_for_status()
        last = response.json()
        if last.get("status") not in {"queued", "running"}:
            return last
        time.sleep(2)
    raise TimeoutError(f"电商任务等待超时：{task_id}，最后状态 {last.get('status')}")


def main() -> int:
    parser = argparse.ArgumentParser(description="使用已安全保存的 API 配置运行真实电商换衣全流程")
    parser.add_argument("--case-dir", required=True)
    parser.add_argument("--provider", default="shiying")
    parser.add_argument("--model", default="gemini-3-pro-image-preview")
    parser.add_argument("--timeout", type=float, default=1200)
    args = parser.parse_args()

    case_dir = Path(args.case_dir).resolve()
    source_path = case_dir / "原图" / "人物原图.jpg"
    garment_path = case_dir / "原图" / "服装原图.jpg"
    generated_dir = case_dir / "生成图"
    generated_dir.mkdir(parents=True, exist_ok=True)
    if not source_path.is_file() or not garment_path.is_file():
        raise FileNotFoundError("案例目录缺少 原图/人物原图.jpg 或 原图/服装原图.jpg")

    os.environ.setdefault("CANVAS_DESKTOP_TOKEN", "ecommerce-real-case")
    from fastapi.testclient import TestClient
    import main as canvas_main

    started = time.time()
    report: dict = {
        "status": "running",
        "provider": args.provider,
        "model": args.model,
        "source": str(source_path),
        "garment": str(garment_path),
    }
    try:
        with TestClient(canvas_main.app) as client:
            bootstrap = client.get("/api/auth/bootstrap?token=ecommerce-real-case", follow_redirects=False)
            if bootstrap.status_code != 303:
                raise RuntimeError(f"测试会话鉴权失败：HTTP {bootstrap.status_code}")
            client.cookies.update(bootstrap.cookies)

            with source_path.open("rb") as source, garment_path.open("rb") as garment:
                upload = client.post("/api/ai/upload", files=[
                    ("files", (source_path.name, source, "image/jpeg")),
                    ("files", (garment_path.name, garment, "image/jpeg")),
                ])
            upload.raise_for_status()
            uploaded = upload.json().get("files") or []
            if len(uploaded) != 2:
                raise RuntimeError(f"案例图上传数量异常：{len(uploaded)}")

            response = client.post("/api/ecommerce/tasks", json={
                "operation": "try_on",
                "mode": "preview",
                "provider_id": args.provider,
                "model": args.model,
                "inputs": [
                    {**uploaded[0], "role": "source"},
                    {**uploaded[1], "role": "garment"},
                ],
                "options": {"garment_category": "auto"},
            })
            response.raise_for_status()
            task_id = response.json()["id"]
            report["task_id"] = task_id
            task = wait_for_task(client, task_id, args.timeout)
            report.update({
                "task_status": task.get("status"),
                "garment_analysis": task.get("garment_analysis"),
                "route_attempts": task.get("route_attempts") or [],
            })
            if task.get("status") != "succeeded":
                raise RuntimeError(task.get("error") or "真实电商任务失败")

            result = task.get("result") or {}
            image_urls = result.get("images") or []
            if not image_urls:
                raise RuntimeError("真实电商任务成功但没有生成图")
            generated_path = canvas_main.output_file_from_url(image_urls[0])
            if not generated_path or not Path(generated_path).is_file():
                raise RuntimeError("生成图未保存到本地媒体目录")
            generated_copy = generated_dir / f"换衣生成图{Path(generated_path).suffix.lower()}"
            shutil.copy2(generated_path, generated_copy)
            image_item = (result.get("image_items") or [{}])[0]
            actual_size = ""
            if image_item.get("width") and image_item.get("height"):
                actual_size = f"{image_item['width']}x{image_item['height']}"

            capabilities = client.get("/api/ecommerce/capabilities").json()
            checks = {
                item["id"]: True
                for item in capabilities.get("quality_checks", {}).get("try_on", [])
            }
            approval = client.post(
                f"/api/ecommerce/tasks/{task_id}/approve",
                json={"output_index": 0, "checks": checks, "note": "自动化链路验收；视觉质量仍需人工复核"},
            )
            approval.raise_for_status()
            exported = client.post(f"/api/ecommerce/tasks/{task_id}/export")
            exported.raise_for_status()
            export_data = exported.json().get("export") or {}

            asset_saved = client.post("/api/asset-library/items", json={
                "library_id": "default",
                "category_id": "characters",
                "url": export_data.get("url") or image_urls[0],
                "name": f"shiying-电商换衣案例-{task_id[-8:]}.png",
            })
            asset_saved.raise_for_status()

            report.update({
                "status": "ok",
                "result": {
                    "provider_id": result.get("provider_id"),
                    "provider_name": result.get("provider_name"),
                    "model": result.get("model"),
                    "requested_size": result.get("size"),
                    "actual_size": actual_size,
                    "generation_elapsed_seconds": result.get("generation_elapsed_seconds"),
                    "generated_url": image_urls[0],
                    "generated_file": str(generated_copy),
                },
                "approval": approval.json().get("approval"),
                "export": export_data,
                "asset_saved": True,
                "total_elapsed_seconds": round(time.time() - started, 3),
            })
    except Exception as exc:
        report.update({
            "status": "failed",
            "error": str(exc),
            "total_elapsed_seconds": round(time.time() - started, 3),
        })
        raise
    finally:
        (case_dir / "测试报告.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
