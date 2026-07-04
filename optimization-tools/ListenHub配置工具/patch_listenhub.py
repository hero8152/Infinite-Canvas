import os
import re
import shutil
import sys
import time
from pathlib import Path


HELPER_BLOCK = '''def is_listenhub_provider(provider):
    base_url = str((provider or {}).get("base_url") or "").lower()
    return "listenhub.ai" in base_url or "marswave.ai" in base_url

'''


IMAGE_BLOCK = '''def listenhub_image_config(size):
    width, height = parse_size_pair(size)
    if not width or not height:
        raw = str(size or "").strip().lower()
        if ":" in raw:
            return {"aspectRatio": raw, "imageSize": "1K"}
        return {"aspectRatio": "1:1", "imageSize": "1K"}
    common_ratios = [
        (1, 1, "1:1"), (16, 9, "16:9"), (9, 16, "9:16"),
        (4, 3, "4:3"), (3, 4, "3:4"), (3, 2, "3:2"), (2, 3, "2:3"),
    ]
    ratio = width / height
    best_ratio = min(common_ratios, key=lambda x: abs(ratio - x[0] / x[1]))[2]
    pixels = width * height
    if pixels >= 3000 * 2000:
        resolution = "4K"
    elif pixels >= 1920 * 1080:
        resolution = "2K"
    else:
        resolution = "1K"
    return {"aspectRatio": best_ratio, "imageSize": resolution}


async def generate_listenhub_provider_image(prompt, size, model, reference_images=None, provider=None):
    provider = provider or {}
    base_url = str(provider.get("base_url") or "").rstrip("/")
    if not base_url:
        raise HTTPException(status_code=400, detail="ListenHub Base URL is not configured")
    if not base_url.endswith("/v1"):
        if "/openapi" in base_url and not base_url.endswith("/openapi/v1"):
            gen_url = f"{base_url}/v1/images/generation"
        else:
            gen_url = f"{base_url}/images/generation"
    else:
        gen_url = f"{base_url}/images/generation"

    lh_provider = "google"
    lh_model = str(model or "").strip()
    if "/" in lh_model:
        parts = lh_model.split("/", 1)
        lh_provider = parts[0]
        lh_model = parts[1]
    elif "gpt" in lh_model.lower() or "openai" in lh_model.lower():
        lh_provider = "openai"

    ref_parts = []
    for ref in (reference_images or []):
        part = gemini_reference_part(ref)
        if part:
            ref_parts.append(part)

    image_config = listenhub_image_config(size)
    if lh_provider == "openai" or "gpt-image-2" in lh_model.lower():
        image_config["imageSize"] = "1K"

    body = {
        "provider": lh_provider,
        "model": lh_model,
        "prompt": prompt.strip(),
        "imageConfig": image_config,
    }
    if ref_parts:
        body["referenceImages"] = ref_parts

    headers = api_headers(provider=provider)
    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=20.0, read=1800.0, write=120.0, pool=20.0)) as client:
        response = await client.post(gen_url, headers=headers, json=body)
        response.raise_for_status()
        raw = response.json()
        return extract_image(raw), raw


'''


CONNECTION_BLOCK = '''    if "listenhub.ai" in base_url.lower() or "marswave.ai" in base_url.lower():
        image_models = ["openai/gpt-image-2", "google/imagen"]
        chat_models = ["gpt-4o", "gpt-4o-mini"]
        video_models = ["pixverse"]
        all_models = image_models + chat_models + video_models
        return {
            "ok": True,
            "status": 200,
            "message": "ListenHub provider channel is available",
            "model_count": len(all_models),
            "image_models": image_models,
            "chat_models": chat_models,
            "video_models": video_models,
            "all": all_models,
            "image_request_mode": "openai",
        }
'''


FETCH_BLOCK = '''    if "listenhub.ai" in str(base_url or "").lower() or "marswave.ai" in str(base_url or "").lower():
        image_models = ["openai/gpt-image-2", "google/imagen"]
        chat_models = ["gpt-4o", "gpt-4o-mini"]
        video_models = ["pixverse"]
        all_models = image_models + chat_models + video_models
        return {
            "total": len(all_models),
            "image_models": image_models,
            "chat_models": chat_models,
            "video_models": video_models,
            "all": all_models,
        }
'''


ROUTE_BLOCK = '''    if is_listenhub_provider(provider):
        return await generate_listenhub_provider_image(prompt, size, model, reference_images, provider)
'''


def log(level, message):
    print("[{}] {}".format(level, message))


def read_text(path):
    return Path(path).read_text(encoding="utf-8")


def write_text(path, content):
    Path(path).write_text(content, encoding="utf-8", newline="\n")


def find_project_root():
    script_dir = Path(__file__).resolve().parent
    candidates = [
        Path.cwd(),
        script_dir,
        script_dir.parent,
        script_dir.parent.parent,
        script_dir.parent.parent / "Infinite-Canvas",
        script_dir.parent.parent.parent / "Infinite-Canvas",
        Path("E:/Infinite-Canvas"),
    ]
    seen = set()
    for candidate in candidates:
        root = candidate.resolve()
        if str(root).lower() in seen:
            continue
        seen.add(str(root).lower())
        if (root / "main.py").is_file() and (root / "static").exists():
            return root
    user_input = input("Enter Infinite-Canvas project root: ").strip().strip('"')
    if user_input:
        root = Path(user_input).resolve()
        if (root / "main.py").is_file():
            return root
    return None


def backup(path):
    backup_path = Path(str(path) + ".bak")
    if backup_path.exists():
        backup_path = Path(str(path) + ".bak." + time.strftime("%Y%m%d-%H%M%S"))
    shutil.copy2(path, backup_path)
    log("BACKUP", "{} -> {}".format(path, backup_path))
    return backup_path


def replace_once(content, old, new, label):
    if old not in content:
        return content, False
    log("PATCH", label)
    return content.replace(old, new, 1), True


def insert_after_regex(content, pattern, insert, label):
    if insert.strip() in content:
        log("SKIP", label + " already exists")
        return content, False
    match = re.search(pattern, content, flags=re.S)
    if not match:
        raise RuntimeError("Anchor not found: " + label)
    log("PATCH", label)
    return content[:match.end()] + "\n" + insert + content[match.end():], True


def insert_before_text(content, anchor, insert, label):
    if insert.strip() in content:
        log("SKIP", label + " already exists")
        return content, False
    index = content.find(anchor)
    if index < 0:
        raise RuntimeError("Anchor not found: " + label)
    log("PATCH", label)
    return content[:index] + insert + content[index:], True


def patch_main(path):
    original = read_text(path)
    content = original

    content, _ = insert_after_regex(
        content,
        r'def is_jimeng_provider\(provider\):\n    return .*?\n',
        HELPER_BLOCK,
        "ListenHub provider detector",
    )

    content, _ = insert_before_text(
        content,
        "def volcengine_endpoint_url(provider):",
        IMAGE_BLOCK,
        "ListenHub image generation functions",
    )

    if "return await generate_listenhub_provider_image(prompt, size, model, reference_images, provider)" not in content:
        content, did = replace_once(
            content,
            'async def generate_ai_image(prompt, size, quality, model, reference_images=None, provider_id="comfly"):\n    provider = get_api_provider(provider_id)\n',
            'async def generate_ai_image(prompt, size, quality, model, reference_images=None, provider_id="comfly"):\n    provider = get_api_provider(provider_id)\n' + ROUTE_BLOCK,
            "generate_ai_image ListenHub route",
        )
        if not did:
            raise RuntimeError("Anchor not found: generate_ai_image ListenHub route")
    else:
        log("SKIP", "generate_ai_image ListenHub route already exists")

    if '"message": "ListenHub provider channel is available"' not in content:
        content, did = replace_once(
            content,
            '    base_url = (payload.base_url or "").strip().rstrip("/")\n',
            '    base_url = (payload.base_url or "").strip().rstrip("/")\n' + CONNECTION_BLOCK,
            "provider connection ListenHub shortcut",
        )
        if not did:
            raise RuntimeError("Anchor not found: provider connection ListenHub shortcut")
    else:
        log("SKIP", "provider connection ListenHub shortcut already exists")

    if '"openai/gpt-image-2", "google/imagen"' in content and "ListenHub provider channel is available" in content:
        fetch_exists = re.search(
            r'async def fetch_models_from_upstream\(.*?\):.*?"openai/gpt-image-2", "google/imagen"',
            content,
            flags=re.S,
        )
    else:
        fetch_exists = None
    if not fetch_exists:
        pattern = (
            r'(async def fetch_models_from_upstream\(base_url: str, api_key: str, '
            r'protocol: str = "openai", image_request_mode: str = "openai"\):\n'
            r'(?:    """.*?"""\n)?)'
        )
        match = re.search(pattern, content, flags=re.S)
        if not match:
            raise RuntimeError("Anchor not found: fetch_models_from_upstream ListenHub shortcut")
        log("PATCH", "fetch_models_from_upstream ListenHub shortcut")
        content = content[:match.end()] + FETCH_BLOCK + content[match.end():]
    else:
        log("SKIP", "fetch_models_from_upstream ListenHub shortcut already exists")

    if content == original:
        log("INFO", "No changes needed")
        return False
    write_text(path, content)
    return True


def main():
    root = find_project_root()
    if not root:
        log("ERROR", "Could not locate Infinite-Canvas project root")
        return 1
    main_py = root / "main.py"
    log("INFO", "Project root: {}".format(root))
    backup_path = backup(main_py)
    try:
        patch_main(main_py)
        try:
            import py_compile
            py_compile.compile(str(main_py), doraise=True)
            log("VERIFY", "python compile main.py")
        except Exception as exc:
            raise RuntimeError("Python compile failed: {}".format(exc))
    except Exception as exc:
        shutil.copy2(backup_path, main_py)
        log("ERROR", str(exc))
        log("ROLLBACK", "main.py restored from backup")
        return 1
    log("SUCCESS", "ListenHub patch applied")
    return 0


if __name__ == "__main__":
    sys.exit(main())
