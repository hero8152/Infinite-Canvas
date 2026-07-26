from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import tempfile
import time
import urllib.parse
import urllib.request
from urllib.error import HTTPError
from pathlib import Path

from PIL import Image, ImageOps


PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


DEFAULT_REFERENCES = [
    {
        "role": "subject",
        "reference_type": "subject",
        "reference_id": "model",
        "label": "全身女模特",
        "instruction": "只保留人物身份、脸部、发型、体型和肤色，不保留原服装。",
        "title": "Model in green dress 2.jpg",
        "source_page": "https://commons.wikimedia.org/wiki/File:Model_in_green_dress_2.jpg",
    },
    {
        "role": "full_garment",
        "reference_type": "full_garment",
        "reference_id": "dress",
        "label": "复古长款连衣裙",
        "instruction": "保留连衣裙的版型、袖口、裙摆、颜色和面料质感。",
        "title": "Maxi dress.jpg",
        "source_page": "https://commons.wikimedia.org/wiki/File:Maxi_dress.jpg",
    },
    {
        "role": "shoes",
        "reference_type": "shoes",
        "reference_id": "shoes",
        "label": "黑色高跟鞋",
        "instruction": "穿在模特脚上，鞋型、鞋跟高度、黑色皮革质感要准确。",
        "title": "Black high-heeled shoes for flight attendants at CAMC (20240518150903).jpg",
        "source_page": "https://commons.wikimedia.org/wiki/File:Black_high-heeled_shoes_for_flight_attendants_at_CAMC_(20240518150903).jpg",
    },
    {
        "role": "accessory",
        "reference_type": "accessory",
        "reference_id": "necklace",
        "label": "白色珍珠项链",
        "instruction": "戴在模特颈部锁骨位置，不要变成手持道具。",
        "title": "White pearl necklace.jpg",
        "source_page": "https://commons.wikimedia.org/wiki/File:White_pearl_necklace.jpg",
    },
    {
        "role": "pose",
        "reference_type": "pose",
        "reference_id": "pose",
        "label": "自信站姿动作",
        "instruction": "只迁移动作、重心和手臂姿势，不复制参考图的人脸、服装或背景。",
        "title": "Power pose by Amy Cuddy at PopTech 2011 (6279920726).jpg",
        "source_page": "https://commons.wikimedia.org/wiki/File:Power_pose_by_Amy_Cuddy_at_PopTech_2011_(6279920726).jpg",
    },
    {
        "role": "scene",
        "reference_type": "scene",
        "reference_id": "scene",
        "label": "精品女装店场景",
        "instruction": "作为背景和空间氛围，不复制场景里的无关人物或商品。",
        "title": "Zabo Fashion Boutique in Linz.jpg",
        "source_page": "https://commons.wikimedia.org/wiki/File:Zabo_Fashion_Boutique_in_Linz.jpg",
    },
]


def commons_file_url(title: str) -> str:
    return "https://commons.wikimedia.org/wiki/Special:Redirect/file/" + urllib.parse.quote(title)


def commons_original_url(title: str) -> str:
    query = urllib.parse.urlencode({
        "action": "query",
        "format": "json",
        "prop": "imageinfo",
        "iiprop": "url|mime|size",
        "titles": f"File:{title}",
    })
    request = urllib.request.Request(
        f"https://commons.wikimedia.org/w/api.php?{query}",
        headers={"User-Agent": "Canvas-ecommerce-universal-smoke/1.0 (local validation)"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        data = json.loads(response.read().decode("utf-8"))
    pages = (data.get("query") or {}).get("pages") or {}
    for page in pages.values():
        info = (page.get("imageinfo") or [{}])[0]
        url = str(info.get("url") or "")
        mime = str(info.get("mime") or "")
        if url and mime.startswith("image/"):
            return url
    return commons_file_url(title)


def load_keys_from_markdown(path: Path) -> dict[str, str]:
    if not path.is_file():
        return {}
    current_url = ""
    keys: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        url_match = re.search(r"(?i)\burl\s*[:：=]\s*(\S+)", raw)
        if url_match:
            current_url = url_match.group(1).strip().lower()
            continue
        key_match = re.search(r"(?i)\bkey\s*[:：=]\s*(\S+)", raw)
        if not key_match:
            continue
        value = key_match.group(1).strip()
        if not value:
            continue
        if "shiying" in current_url and "API_PROVIDER_SHIYING_KEY" not in keys:
            keys["API_PROVIDER_SHIYING_KEY"] = value
        elif "grsai" in current_url and "GRSAI_API_KEY" not in keys:
            keys["GRSAI_API_KEY"] = value
    return keys


def download_and_prepare(reference: dict, output_dir: Path, longest_edge: int = 1400) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    target = output_dir / f"{reference['reference_id']}.jpg"
    if target.is_file():
        return target
    source_url = commons_original_url(reference["title"])
    request = urllib.request.Request(
        source_url,
        headers={"User-Agent": "Canvas-ecommerce-universal-smoke/1.0 (local validation)"},
    )
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                content = response.read()
                reference["download_url"] = response.geturl()
            break
        except HTTPError as exc:
            if exc.code != 429 or attempt >= 3:
                raise
            time.sleep(2 + attempt * 3)
    raw_path = output_dir / f"{reference['reference_id']}-raw"
    raw_path.write_bytes(content)
    with Image.open(raw_path) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        width, height = image.size
        scale = min(1.0, float(longest_edge) / max(width, height))
        if scale < 1:
            image = image.resize((max(1, int(width * scale)), max(1, int(height * scale))), Image.Resampling.LANCZOS)
        image.save(target, "JPEG", quality=92, optimize=True)
    raw_path.unlink(missing_ok=True)
    return target


def wait_for_task(client, task_id: str, timeout: float) -> dict:
    deadline = time.monotonic() + timeout
    last = {}
    while time.monotonic() < deadline:
        response = client.get(f"/api/ecommerce/tasks/{task_id}")
        response.raise_for_status()
        last = response.json()
        if last.get("status") not in {"queued", "running"}:
            return last
        time.sleep(3)
    raise TimeoutError(f"全能模式真实任务等待超时：{task_id}，最后状态 {last.get('status')}")


def main() -> int:
    parser = argparse.ArgumentParser(description="真实 API 验证电商全能模式自动提示词")
    parser.add_argument("--case-dir", default="")
    parser.add_argument("--api-key-file", default=str(PROJECT_ROOT / "api文档" / "api key.md"))
    parser.add_argument("--provider", default="shiying")
    parser.add_argument("--model", default="gemini-3-pro-image-preview")
    parser.add_argument("--timeout", type=float, default=1500)
    parser.add_argument("--longest-edge", type=int, default=1400)
    args = parser.parse_args()

    stamp = time.strftime("%Y%m%d-%H%M%S")
    case_dir = Path(args.case_dir).resolve() if args.case_dir else PROJECT_ROOT / "案例" / "全能模式自动提示词" / stamp
    refs_dir = case_dir / "参考图"
    generated_dir = case_dir / "生成图"
    generated_dir.mkdir(parents=True, exist_ok=True)

    keys = load_keys_from_markdown(Path(args.api_key_file))
    for name, value in keys.items():
        os.environ.setdefault(name, value)
    os.environ.setdefault("CANVAS_DESKTOP_TOKEN", "ecommerce-universal-real")
    os.environ.setdefault("CANVAS_RUNTIME_MODE", "desktop")

    report: dict = {
        "status": "running",
        "provider": args.provider,
        "model": args.model,
        "case_dir": str(case_dir),
        "sources": [],
    }
    started = time.time()
    try:
        prepared = []
        for reference in DEFAULT_REFERENCES:
            item = dict(reference)
            local_path = download_and_prepare(item, refs_dir, args.longest_edge)
            item["local_file"] = str(local_path)
            prepared.append(item)
            report["sources"].append({
                "reference_id": item["reference_id"],
                "role": item["reference_type"],
                "label": item["label"],
                "source_page": item["source_page"],
                "download_url": item.get("download_url") or commons_file_url(item["title"]),
                "local_file": str(local_path),
            })

        with tempfile.TemporaryDirectory(prefix="canvas-universal-real-data-") as data_dir:
            os.environ["CANVAS_DATA_DIR"] = data_dir
            from fastapi.testclient import TestClient
            import main as canvas_main

            with TestClient(canvas_main.app) as client:
                bootstrap = client.get("/api/auth/bootstrap?token=ecommerce-universal-real", follow_redirects=False)
                if bootstrap.status_code != 303:
                    raise RuntimeError(f"测试会话鉴权失败：HTTP {bootstrap.status_code}")
                client.cookies.update(bootstrap.cookies)

                files = []
                handles = []
                try:
                    for item in prepared:
                        path = Path(item["local_file"])
                        handle = path.open("rb")
                        handles.append(handle)
                        files.append(("files", (path.name, handle, "image/jpeg")))
                    upload = client.post("/api/ai/upload", files=files)
                    upload.raise_for_status()
                finally:
                    for handle in handles:
                        handle.close()
                uploaded = upload.json().get("files") or []
                if len(uploaded) != len(prepared):
                    raise RuntimeError(f"参考图上传数量异常：{len(uploaded)}")

                inputs = []
                for item, uploaded_item in zip(prepared, uploaded):
                    inputs.append({
                        **uploaded_item,
                        "role": item["role"],
                        "reference_type": item["reference_type"],
                        "reference_id": item["reference_id"],
                        "label": item["label"],
                        "instruction": item["instruction"],
                    })

                response = client.post("/api/ecommerce/tasks", json={
                    "operation": "universal",
                    "mode": "standard",
                    "provider_id": args.provider,
                    "model": args.model,
                    "aspect_ratio": "4:5",
                    "resolution": "2k",
                    "quality": "high",
                    "count": 1,
                    "inputs": inputs,
                    "options": {},
                })
                response.raise_for_status()
                task_id = response.json()["id"]
                report["task_id"] = task_id
                task = wait_for_task(client, task_id, args.timeout)
                report.update({
                    "task_status": task.get("status"),
                    "route_attempts": task.get("route_attempts") or [],
                    "universal_analysis": task.get("universal_analysis"),
                    "prompt": task.get("prompt"),
                })
                if task.get("status") != "succeeded":
                    raise RuntimeError(task.get("error") or "真实全能模式任务失败")
                result = task.get("result") or {}
                image_urls = result.get("images") or []
                if not image_urls:
                    raise RuntimeError("真实全能模式任务成功但没有生成图")
                generated_path = canvas_main.output_file_from_url(image_urls[0])
                if not generated_path or not Path(generated_path).is_file():
                    raise RuntimeError("生成图未保存到本地媒体目录")
                generated_copy = generated_dir / f"全能模式自动提示词生成图{Path(generated_path).suffix.lower()}"
                shutil.copy2(generated_path, generated_copy)
                with Image.open(generated_copy) as image:
                    generated_size = image.size
                report.update({
                    "status": "ok",
                    "result": {
                        "provider_id": result.get("provider_id"),
                        "provider_name": result.get("provider_name"),
                        "model": result.get("model"),
                        "requested_size": result.get("size"),
                        "generated_url": image_urls[0],
                        "generated_file": str(generated_copy),
                        "generated_size": f"{generated_size[0]}x{generated_size[1]}",
                        "generation_elapsed_seconds": result.get("generation_elapsed_seconds"),
                    },
                })
    except Exception as exc:
        report.update({"status": "failed", "error": str(exc)})
        raise
    finally:
        report["total_elapsed_seconds"] = round(time.time() - started, 3)
        case_dir.mkdir(parents=True, exist_ok=True)
        (case_dir / "测试报告.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        if report.get("prompt"):
            (case_dir / "自动提示词.txt").write_text(str(report["prompt"]), encoding="utf-8")

    print(json.dumps({
        "status": report["status"],
        "task_id": report.get("task_id"),
        "generated_file": (report.get("result") or {}).get("generated_file"),
        "generated_size": (report.get("result") or {}).get("generated_size"),
        "case_dir": str(case_dir),
        "total_elapsed_seconds": report["total_elapsed_seconds"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
