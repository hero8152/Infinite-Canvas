# -*- coding: ascii -*-
# Clean Jimeng/Dreamina CLI compatibility patch for Infinite-Canvas.
# Generated from the current optimized Infinite-Canvas files.
# This script is intentionally ASCII-only to avoid Windows console encoding issues.

import os
import re
import shutil
import time
import subprocess
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

MAIN_IMAGE_MODELS = 'JIMENG_DEFAULT_IMAGE_MODELS = [\n    "5.0",\n    "4.7",\n    "4.6",\n    "4.5",\n    "4.1",\n    "4.0",\n    "3.1",\n    "3.0",\n]\n'
MAIN_VIDEO_MODELS = 'JIMENG_DEFAULT_VIDEO_MODELS = [\n    "seedance2.0_vip",\n    "seedance2.0fast_vip",\n    "seedance2.0mini",\n    "seedance2.0",\n    "seedance2.0fast",\n    "seedance1.5pro",\n    "seedance1.0",\n    "seedance1.0fast",\n]\n'
MAIN_JIMENG_BACKEND = 'JIMENG_RATIO_CHOICES = [(21, 9), (16, 9), (3, 2), (4, 3), (1, 1), (3, 4), (2, 3), (9, 16)]\ndef jimeng_ratio_from_size(size, fallback="1:1"):\n    width, height = parse_size_pair(size)\n    if not width or not height:\n        raw = str(size or "").strip()\n        match = re.fullmatch(r"(\\d+)\\s*:\\s*(\\d+)", raw)\n        if match:\n            width, height = int(match.group(1)), int(match.group(2))\n        else:\n            return fallback\n    ratio = width / max(1, height)\n    left, right = min(JIMENG_RATIO_CHOICES, key=lambda item: abs(ratio - item[0] / item[1]))\n    return f"{left}:{right}"\n\n# \u5b98\u65b9 dreamina \u652f\u6301\u7684\u56fe\u7247\u6a21\u578b\uff08\u6765\u81ea text2image/image2image -h\uff09\u3002\n# image2image \u4e0d\u652f\u6301 3.0/3.1\u3002\nJIMENG_TEXT2IMAGE_MODELS = {"3.0", "3.1", "4.0", "4.1", "4.5", "4.6", "4.7", "5.0"}\nJIMENG_IMAGE2IMAGE_MODELS = {"4.0", "4.1", "4.5", "4.6", "4.7", "5.0"}\n\ndef jimeng_normalize_image_model(model):\n    match = re.search(r"(\\d+\\.\\d+)", str(model or ""))\n    return match.group(1) if match else ""\n\ndef jimeng_image_model_version(model, mode="text2image"):\n    version = jimeng_normalize_image_model(model)\n    allowed = JIMENG_IMAGE2IMAGE_MODELS if mode == "image2image" else JIMENG_TEXT2IMAGE_MODELS\n    return version if version in allowed else ""\n\ndef jimeng_image_resolution(model, size, mode="text2image"):\n    text = str(model or "").lower()\n    if "4k" in text:\n        desired = "4k"\n    elif "1k" in text:\n        desired = "1k"\n    elif "2k" in text:\n        desired = "2k"\n    else:\n        width, height = parse_size_pair(size)\n        desired = "4k" if max(width, height) > 2048 else "2k"\n    # \u6309\u5b98\u65b9\u89c4\u5219\u6536\u655b\u5230\u6a21\u578b\u5141\u8bb8\u7684\u5206\u8fa8\u7387\n    version = jimeng_normalize_image_model(model)\n    if mode == "image2image":\n        # image2image \u53ea\u652f\u6301 2k/4k\n        return "4k" if desired == "4k" else "2k"\n    if version in ("3.0", "3.1"):\n        # 3.0/3.1 \u53ea\u652f\u6301 1k/2k\n        return "1k" if desired == "1k" else "2k"\n    # 4.x/5.0 \u53ea\u652f\u6301 2k/4k\n    return "4k" if desired == "4k" else "2k"\n\n# \u4ec5 VIP seedance \u652f\u6301 1080P\uff1b\u5176\u4f59\u6a21\u578b\u6700\u9ad8 720P\uff08\u5b98\u65b9\u65e0 480P \u9009\u9879\uff09\nJIMENG_VIDEO_TEXT_MODELS = {"seedance2.0", "seedance2.0fast", "seedance2.0_vip", "seedance2.0fast_vip", "seedance2.0mini"}\nJIMENG_VIDEO_MULTIMODAL_MODELS = JIMENG_VIDEO_TEXT_MODELS\nJIMENG_VIDEO_IMAGE2VIDEO_MODELS = {\n    "seedance1.0fast", "seedance1.0", "seedance1.5pro",\n    "seedance2.0", "seedance2.0fast", "seedance2.0_vip", "seedance2.0fast_vip", "seedance2.0mini",\n}\nJIMENG_VIDEO_FRAMES_MODELS = {\n    "seedance1.5pro",\n    "seedance2.0", "seedance2.0fast", "seedance2.0_vip", "seedance2.0fast_vip", "seedance2.0mini",\n}\nJIMENG_VIDEO_4K_MODELS = {"seedance2.0_vip"}\n\ndef jimeng_video_resolution(model, resolution):\n    version = jimeng_video_model_version(model)\n    requested = str(resolution or "").strip().upper()\n    if requested not in {"480P", "720P", "1080P", "4K"}:\n        text = str(model or "").lower()\n        requested = "4K" if "4k" in text else ("1080P" if "1080" in text else "720P")\n    if requested in {"1080P", "4K"} and version in JIMENG_VIDEO_4K_MODELS:\n        return requested\n    return "720P"\n\n# \u5404\u6a21\u578b\u652f\u6301\u7684\u65f6\u957f\u533a\u95f4\uff08\u79d2\uff09\uff1a3.0 \u7cfb\u5217 3-10\uff0c3.5pro 4-12\uff0cseedance 4-15\ndef jimeng_video_duration_range(model):\n    version = jimeng_video_model_version(model)\n    if version in ("seedance1.0", "seedance1.0fast"):\n        return 3, 10\n    if version == "seedance1.5pro":\n        return 4, 12\n    return 4, 15\n\ndef jimeng_video_duration(duration, model=None):\n    low, high = jimeng_video_duration_range(model)\n    default = max(low, min(high, 5))\n    try:\n        text = str(duration).strip() if duration is not None else ""\n        value = default if text == "" else int(text)\n    except Exception:\n        value = default\n    return max(low, min(high, value))\n\ndef jimeng_transition_duration(total_duration, transition_count):\n    count = max(1, int(transition_count or 1))\n    try:\n        total = float(total_duration or 5)\n    except Exception:\n        total = 5.0\n    return max(0.5, min(8.0, total / count))\n\ndef jimeng_video_model_version(model):\n    value = str(model or "").strip()\n    low = value.lower()\n    aliases = {\n        "seedance2.0fast_vip": "seedance2.0fast_vip",\n        "seedance2.0_vip": "seedance2.0_vip",\n        "seedance2.0mini": "seedance2.0mini",\n        "seedance2.0fast": "seedance2.0fast",\n        "seedance2.0": "seedance2.0",\n        "seedance1.5pro": "seedance1.5pro",\n        "seedance1.0fast": "seedance1.0fast",\n        "seedance1.0": "seedance1.0",\n        "3.0_fast": "seedance1.0fast",\n        "3.0fast": "seedance1.0fast",\n        "3.0_pro": "seedance1.5pro",\n        "3.0pro": "seedance1.5pro",\n        "3.5_pro": "seedance1.5pro",\n        "3.5pro": "seedance1.5pro",\n        "3.0": "seedance1.0",\n    }\n    for key, mapped in aliases.items():\n        if key in low:\n            return mapped\n    return ""\n\ndef jimeng_video_resolution_arg(model, resolution):\n    return jimeng_video_resolution(model, resolution).lower()\n\ndef jimeng_video_ratio_arg(aspect_ratio):\n    value = str(aspect_ratio or "").strip()\n    allowed = {"1:1", "3:4", "16:9", "4:3", "9:16", "21:9"}\n    if value in allowed:\n        return value\n    return ""\n\ndef jimeng_video_model_for_command(model, command):\n    model_version = jimeng_video_model_version(model)\n    allowed_by_command = {\n        "text2video": JIMENG_VIDEO_TEXT_MODELS,\n        "multimodal2video": JIMENG_VIDEO_MULTIMODAL_MODELS,\n        "image2video": JIMENG_VIDEO_IMAGE2VIDEO_MODELS,\n        "frames2video": JIMENG_VIDEO_FRAMES_MODELS,\n    }\n    allowed = allowed_by_command.get(command)\n    return model_version if model_version and (allowed is None or model_version in allowed) else ""\n\ndef jimeng_append_model_resolution_args(args, payload: CanvasVideoRequest, include_model=False, command=""):\n    model_version = jimeng_video_model_for_command(payload.model, command)\n    if include_model and model_version:\n        args.append(f"--model_version={model_version}")\n    if payload.resolution and command != "multiframe2video":\n        args.append(f"--video_resolution={jimeng_video_resolution_arg(payload.model, payload.resolution)}")\n\ndef jimeng_video_ref_role(ref):\n    role = getattr(ref, "role", "")\n    if isinstance(ref, dict):\n        role = ref.get("role", role)\n    return str(role or "").lower()\n\ndef jimeng_video_ref_url(ref):\n    url = getattr(ref, "url", "")\n    if isinstance(ref, dict):\n        url = ref.get("url", url)\n    return str(url or "").strip()\n\ndef jimeng_local_output_url(path, kind="image"):\n    path = os.path.abspath(str(path or ""))\n    if not os.path.isfile(path):\n        return ""\n    output_root = os.path.abspath(OUTPUT_OUTPUT_DIR)\n    try:\n        if os.path.commonpath([output_root, path]) == output_root:\n            return output_url_for(os.path.basename(path), "output")\n    except Exception:\n        pass\n    ext = os.path.splitext(path)[1].lower()\n    allowed = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".mp4", ".webm", ".mov", ".m4v", ".avi", ".mkv"}\n    if ext not in allowed:\n        ct = content_type_for_path(path)\n        ext = ".mp4" if ct.startswith("video/") else ".png"\n    prefix = "jimeng_video_" if kind == "video" else "jimeng_"\n    filename = f"{prefix}{uuid.uuid4().hex[:10]}{ext}"\n    dest = output_path_for(filename, "output")\n    shutil.copyfile(path, dest)\n    return output_url_for(filename, "output")\n\nasync def jimeng_store_output_value(value, kind="image"):\n    text = str(value or "").strip()\n    if not text:\n        return ""\n    if text.startswith("/output/") or text.startswith("/assets/"):\n        return text\n    if text.startswith("file://"):\n        text = urllib.parse.unquote(urllib.parse.urlparse(text).path)\n        if os.name == "nt" and re.match(r"^/[A-Za-z]:/", text):\n            text = text[1:]\n    if jimeng_use_wsl() and text.startswith("/mnt/"):\n        text = wsl_path_to_windows(text)\n    if text.startswith(("http://", "https://")):\n        if kind == "video":\n            return await save_remote_video_to_output(text, prefix="jimeng_video_")\n        return await save_ai_image_to_output({"type": "url", "value": text}, prefix="jimeng_")\n    if os.path.isfile(text):\n        return jimeng_local_output_url(text, kind)\n    return ""\n\nasync def jimeng_query_result(submit_id, kind="image"):\n    args = [\n        "query_result",\n        f"--submit_id={submit_id}",\n        f"--download_dir={jimeng_cli_path_arg(OUTPUT_OUTPUT_DIR)}",\n    ]\n    return await run_jimeng_cli(args, timeout=min(300, jimeng_poll_seconds() + 60))\n\nasync def jimeng_store_outputs(raw, kind="image", allow_query=True):\n    failure = jimeng_failure_reason(raw)\n    if failure:\n        raise HTTPException(status_code=502, detail=f"\u5373\u68a6\u751f\u6210\u5931\u8d25\uff1a{failure}")\n    values = jimeng_output_values(raw)\n    urls = []\n    for value in values:\n        local_url = await jimeng_store_output_value(value, kind)\n        if local_url and local_url not in urls:\n            urls.append(local_url)\n    if urls:\n        return urls\n    submit_id = jimeng_submit_id(raw)\n    if submit_id and allow_query:\n        queried = await jimeng_query_result(submit_id, kind)\n        try:\n            return await jimeng_store_outputs(queried, kind, allow_query=False)\n        except HTTPException as exc:\n            if getattr(exc, "status_code", None) == 502:\n                status_text = json.dumps(queried, ensure_ascii=False)[:800] if isinstance(queried, (dict, list)) else str(queried)[:800]\n                raise HTTPException(status_code=502, detail=f"\u5373\u68a6\u4efb\u52a1\u5df2\u8fd4\u56de\u4f46\u6ca1\u6709\u4e0b\u8f7d\u5230\u5a92\u4f53\uff1a{status_text}") from exc\n            raise\n    status_text = json.dumps(raw, ensure_ascii=False)[:800] if isinstance(raw, (dict, list)) else str(raw)[:800]\n    if submit_id:\n        raise JimengPendingError(submit_id, kind, jimeng_queue_info(raw), raw)\n    raise HTTPException(status_code=502, detail=f"\u5373\u68a6 CLI \u672a\u8fd4\u56de\u53ef\u7528\u5a92\u4f53\u7ed3\u679c\uff1a{status_text}")\n\nasync def jimeng_prepare_local_media(ref_url, kind="image"):\n    text = str(ref_url or "").strip()\n    if not text:\n        return "", []\n    if text.startswith("/output/") or text.startswith("/assets/"):\n        path = output_file_from_url(text)\n        if path:\n            return path, []\n        raise HTTPException(status_code=404, detail=f"\u5373\u68a6\u53c2\u8003\u7d20\u6750\u4e0d\u5b58\u5728\uff1a{text}")\n    if text.startswith("file://"):\n        path = urllib.parse.unquote(urllib.parse.urlparse(text).path)\n        if os.name == "nt" and re.match(r"^/[A-Za-z]:/", path):\n            path = path[1:]\n        if os.path.isfile(path):\n            return path, []\n    if os.path.isfile(text):\n        return text, []\n    suffix = ".mp4" if kind == "video" else (".mp3" if kind == "audio" else ".png")\n    temp_paths = []\n    if text.startswith("data:"):\n        if ";base64," not in text:\n            raise HTTPException(status_code=400, detail="\u5373\u68a6\u53c2\u8003\u7d20\u6750 data URL \u7f3a\u5c11 base64 \u6570\u636e")\n        header, encoded = text.split(";base64,", 1)\n        mime = header.split(":", 1)[1].split(";", 1)[0] if ":" in header else ""\n        suffix = mimetypes.guess_extension(mime) or suffix\n        fd, path = tempfile.mkstemp(prefix="jimeng_ref_", suffix=suffix)\n        with os.fdopen(fd, "wb") as f:\n            f.write(base64.b64decode(encoded))\n        temp_paths.append(path)\n        return path, temp_paths\n    if text.startswith(("http://", "https://")):\n        async with httpx.AsyncClient(timeout=httpx.Timeout(connect=20.0, read=300.0, write=60.0, pool=20.0), follow_redirects=True) as client:\n            response = await client.get(text)\n            response.raise_for_status()\n            clean_path = urllib.parse.urlparse(text).path\n            suffix = os.path.splitext(clean_path)[1] or mimetypes.guess_extension(response.headers.get("content-type", "")) or suffix\n            fd, path = tempfile.mkstemp(prefix="jimeng_ref_", suffix=suffix)\n            with os.fdopen(fd, "wb") as f:\n                f.write(response.content)\n            temp_paths.append(path)\n            return path, temp_paths\n    raise HTTPException(status_code=400, detail=f"\u5373\u68a6 CLI \u53ea\u652f\u6301\u672c\u5730\u6587\u4ef6\u53c2\u8003\u7d20\u6750\uff0c\u65e0\u6cd5\u8bfb\u53d6\uff1a{text[:120]}")\n\nasync def generate_jimeng_provider_image(prompt, size, model, reference_images=None, provider=None):\n    refs = [ref for ref in (reference_images or []) if ref.get("url")]\n    temp_paths = []\n    try:\n        args = []\n        if refs:\n            image_paths = []\n            for ref in refs[:10]:\n                image_path, created = await jimeng_prepare_local_media(ref.get("url"), "image")\n                temp_paths.extend(created)\n                image_paths.append(image_path)\n            if not image_paths:\n                raise HTTPException(status_code=400, detail="\u5373\u68a6 CLI \u672a\u8bfb\u53d6\u5230\u6709\u6548\u53c2\u8003\u56fe")\n            model_version = jimeng_image_model_version(model, "image2image")\n            args = [\n                "image2image",\n                f"--images={\',\'.join(jimeng_cli_path_arg(path) for path in image_paths)}",\n                f"--prompt={prompt}",\n                f"--ratio={jimeng_ratio_from_size(size)}",\n                f"--resolution_type={jimeng_image_resolution(model, size, \'image2image\')}",\n                f"--poll={jimeng_poll_seconds()}",\n            ]\n            if model_version:\n                args.append(f"--model_version={model_version}")\n        else:\n            model_version = jimeng_image_model_version(model, "text2image")\n            args = [\n                "text2image",\n                f"--prompt={prompt}",\n                f"--ratio={jimeng_ratio_from_size(size)}",\n                f"--resolution_type={jimeng_image_resolution(model, size, \'text2image\')}",\n                f"--poll={jimeng_poll_seconds()}",\n            ]\n            if model_version:\n                args.append(f"--model_version={model_version}")\n        raw = await run_jimeng_cli(args, timeout=jimeng_poll_seconds() + 120)\n        urls = await jimeng_store_outputs(raw, "image")\n        return {"type": "url", "value": urls[0]}, raw\n    finally:\n        for path in temp_paths:\n            try:\n                os.remove(path)\n            except Exception:\n                pass\n\nasync def generate_jimeng_video(payload: CanvasVideoRequest, provider):\n    image_refs = [ref for ref in (payload.images or []) if jimeng_video_ref_url(ref)]\n    video_refs = [url for url in (payload.videos or []) if str(url or "").strip()]\n    audio_refs = [url for url in (payload.audios or []) if str(url or "").strip()][:3]\n    duration = jimeng_video_duration(payload.duration, payload.model)\n    temp_paths = []\n    try:\n        if payload.multimodal or video_refs or audio_refs:\n            image_paths = []\n            video_paths = []\n            audio_paths = []\n            for ref in image_refs[:9]:\n                image_path, created = await jimeng_prepare_local_media(jimeng_video_ref_url(ref), "image")\n                temp_paths.extend(created)\n                image_paths.append(image_path)\n            for ref_url in video_refs[:3]:\n                video_path, created = await jimeng_prepare_local_media(ref_url, "video")\n                temp_paths.extend(created)\n                video_paths.append(video_path)\n            for ref_url in audio_refs:\n                audio_path, created = await jimeng_prepare_local_media(ref_url, "audio")\n                temp_paths.extend(created)\n                audio_paths.append(audio_path)\n            args = [\n                "multimodal2video",\n                f"--prompt={payload.prompt}",\n                f"--duration={duration}",\n                f"--poll={jimeng_poll_seconds()}",\n            ]\n            ratio = jimeng_video_ratio_arg(payload.aspect_ratio)\n            if ratio:\n                args.append(f"--ratio={ratio}")\n            jimeng_append_model_resolution_args(args, payload, include_model=True, command="multimodal2video")\n            for image_path in image_paths:\n                args.append(f"--image={jimeng_cli_path_arg(image_path)}")\n            for video_path in video_paths:\n                args.append(f"--video={jimeng_cli_path_arg(video_path)}")\n            for audio_path in audio_paths:\n                args.append(f"--audio={jimeng_cli_path_arg(audio_path)}")\n        elif len(image_refs) >= 2:\n            first_frame = next((ref for ref in image_refs if jimeng_video_ref_role(ref) == "first_frame"), None)\n            last_frame = next((ref for ref in image_refs if jimeng_video_ref_role(ref) == "last_frame"), None)\n            if first_frame and last_frame:\n                first_path, created = await jimeng_prepare_local_media(jimeng_video_ref_url(first_frame), "image")\n                temp_paths.extend(created)\n                last_path, created = await jimeng_prepare_local_media(jimeng_video_ref_url(last_frame), "image")\n                temp_paths.extend(created)\n                args = [\n                    "frames2video",\n                    f"--first={jimeng_cli_path_arg(first_path)}",\n                    f"--last={jimeng_cli_path_arg(last_path)}",\n                    f"--prompt={payload.prompt}",\n                    f"--duration={duration}",\n                    f"--poll={jimeng_poll_seconds()}",\n                ]\n                jimeng_append_model_resolution_args(args, payload, include_model=True, command="frames2video")\n            else:\n                image_paths = []\n                for ref in image_refs:\n                    image_path, created = await jimeng_prepare_local_media(jimeng_video_ref_url(ref), "image")\n                    temp_paths.extend(created)\n                    image_paths.append(image_path)\n                args = [\n                    "multiframe2video",\n                    f"--images={\',\'.join(jimeng_cli_path_arg(path) for path in image_paths)}",\n                    f"--poll={jimeng_poll_seconds()}",\n                ]\n                if len(image_paths) == 2:\n                    args.extend([\n                        f"--prompt={payload.prompt}",\n                        f"--duration={jimeng_transition_duration(duration, 1)}",\n                    ])\n                else:\n                    transition_duration = jimeng_transition_duration(duration, max(1, len(image_paths) - 1))\n                    for _ in range(max(1, len(image_paths) - 1)):\n                        args.append(f"--transition-prompt={payload.prompt}")\n                        args.append(f"--transition-duration={transition_duration}")\n        elif image_refs:\n            image_path, created = await jimeng_prepare_local_media(jimeng_video_ref_url(image_refs[0]), "image")\n            temp_paths.extend(created)\n            ratio = jimeng_video_ratio_arg(payload.aspect_ratio)\n            multimodal_model = jimeng_video_model_for_command(payload.model, "multimodal2video")\n            if ratio and (not jimeng_video_model_version(payload.model) or multimodal_model):\n                args = [\n                    "multimodal2video",\n                    f"--image={jimeng_cli_path_arg(image_path)}",\n                    f"--prompt={payload.prompt}",\n                    f"--duration={duration}",\n                    f"--ratio={ratio}",\n                    f"--poll={jimeng_poll_seconds()}",\n                ]\n                jimeng_append_model_resolution_args(args, payload, include_model=True, command="multimodal2video")\n            else:\n                args = [\n                    "image2video",\n                    f"--image={jimeng_cli_path_arg(image_path)}",\n                    f"--prompt={payload.prompt}",\n                    f"--duration={duration}",\n                    f"--poll={jimeng_poll_seconds()}",\n                ]\n                jimeng_append_model_resolution_args(args, payload, include_model=True, command="image2video")\n        else:\n            args = [\n                "text2video",\n                f"--prompt={payload.prompt}",\n                f"--duration={duration}",\n                f"--ratio={payload.aspect_ratio or \'16:9\'}",\n                f"--video_resolution={jimeng_video_resolution_arg(payload.model, payload.resolution)}",\n                f"--poll={jimeng_poll_seconds()}",\n            ]\n            model_version = jimeng_video_model_for_command(payload.model, "text2video")\n            if model_version:\n                args.append(f"--model_version={model_version}")\n        raw = await run_jimeng_cli(args, timeout=jimeng_poll_seconds() + 180)\n        urls = await jimeng_store_outputs(raw, "video")\n        return {"videos": urls, "task_id": jimeng_submit_id(raw) or None, "raw": raw}\n    finally:\n        for path in temp_paths:\n            try:\n                os.remove(path)\n            except Exception:\n                pass\n\n'
CANVAS_VIDEO_BLOCK = 'function providerVideoModels(providerId){\n    const provider = apiProviders.find(p => p.id === providerId);\n    return uniqueModels(provider?.video_models || []);\n}\nconst JIMENG_SEEDANCE2_VIDEO_MODELS = [\'seedance2.0_vip\', \'seedance2.0fast_vip\', \'seedance2.0mini\', \'seedance2.0\', \'seedance2.0fast\'];\nconst JIMENG_DEFAULT_VIDEO_MODELS = [\'seedance2.0_vip\', \'seedance2.0fast_vip\', \'seedance2.0mini\', \'seedance2.0\', \'seedance2.0fast\', \'seedance1.5pro\', \'seedance1.0\', \'seedance1.0fast\'];\nconst JIMENG_HIGH_RES_VIDEO_MODELS = new Set([\'seedance2.0_vip\']);\nconst JIMENG_VIDEO_MODELS_BY_COMMAND = {\n    text2video: JIMENG_DEFAULT_VIDEO_MODELS,\n    image2video: JIMENG_DEFAULT_VIDEO_MODELS,\n    multimodal2video: JIMENG_DEFAULT_VIDEO_MODELS,\n    frames2video: JIMENG_DEFAULT_VIDEO_MODELS.filter(m => m !== \'seedance1.0\' && m !== \'seedance1.0fast\'),\n    multiframe2video: JIMENG_DEFAULT_VIDEO_MODELS,\n};\nfunction isJimengVideoProvider(providerId){\n    const provider = apiProviders.find(p => p.id === providerId) || {};\n    const key = String(providerId || provider.id || \'\').trim().toLowerCase();\n    const protocol = String(provider.protocol || \'\').trim().toLowerCase();\n    const name = String(provider.name || \'\').trim().toLowerCase();\n    const baseUrl = String(provider.base_url || provider.baseUrl || provider.api_base || \'\').trim().toLowerCase();\n    const videoModels = (provider.video_models || []).map(model => String(model || \'\').trim().toLowerCase());\n    const imageModels = (provider.image_models || []).map(model => String(model || \'\').trim().toLowerCase());\n    const modelHints = [...videoModels, ...imageModels];\n    return key === \'jimeng\'\n        || key === \'dreamina\'\n        || protocol === \'jimeng\'\n        || protocol === \'dreamina\'\n        || name.includes(\'jimeng\')\n        || name.includes(\'dreamina\')\n        || baseUrl.includes(\'jimeng\')\n        || baseUrl.includes(\'dreamina\')\n        || modelHints.some(model => model.startsWith(\'seedance\') || model.includes(\'jimeng\') || model.includes(\'dreamina\'));\n}\nfunction videoNodeJimengCommand(node, mediaInputs=[]){\n    const refs = (mediaInputs || []).flatMap(src => src.refs || []);\n    const imageCount = refs.filter(ref => ref?.url && mediaKindForRef(ref) === \'image\').length;\n    const hasVideo = refs.some(ref => ref?.url && mediaKindForRef(ref) === \'video\');\n    const hasAudio = refs.some(ref => ref?.url && mediaKindForRef(ref) === \'audio\');\n    if(node?.multimodal || hasVideo || hasAudio) return \'multimodal2video\';\n    if(node?.useFrameRoles && imageCount >= 2) return \'frames2video\';\n    if(imageCount >= 2) return \'multiframe2video\';\n    if(imageCount === 1) return \'image2video\';\n    return \'text2video\';\n}\nfunction filterJimengVideoModels(models, providerId, node=null, mediaInputs=[]){\n    if(!isJimengVideoProvider(providerId)) return models;\n    const allowed = JIMENG_VIDEO_MODELS_BY_COMMAND[videoNodeJimengCommand(node, mediaInputs)] || JIMENG_DEFAULT_VIDEO_MODELS;\n    return allowed.filter(model => (models || []).includes(model));\n}\nfunction jimengVideoResolutionOptions(model, providerId, node=null, mediaInputs=[]){\n    if(!isJimengVideoProvider(providerId)) return null;\n    const command = videoNodeJimengCommand(node, mediaInputs);\n    if(command === \'multiframe2video\') return [[\'\', \'Auto\']];\n    const modelKey = String(model || \'\').trim().toLowerCase();\n    if(JIMENG_HIGH_RES_VIDEO_MODELS.has(modelKey)) return [[\'\', \'Auto\'], [\'720p\',\'720P\'], [\'1080p\',\'1080P\'], [\'4k\',\'4K\']];\n    return [[\'\', \'Auto\'], [\'720p\',\'720P\']];\n}\nfunction sanitizeVideoNodeProviderModel(node, mediaInputs=[]){\n    if(!node || node.type !== \'video\') return;\n    node.apiProvider = resolveVideoProviderId(node.apiProvider || \'comfly\');\n    const models = filterJimengVideoModels(providerVideoModels(node.apiProvider), node.apiProvider, node, mediaInputs);\n    if(!models.length) node.model = \'\';\n    else if(!models.includes(node.model)) node.model = models[0] || \'\';\n}\nfunction videoModelOptions(selectedModel, providerId, node=null, mediaInputs=[]){\n    const models = filterJimengVideoModels(providerVideoModels(providerId), providerId, node, mediaInputs);\n    if(!models.length){\n        return `<option value="" disabled selected>${tr(\'canvas.noModelsHint\') || \'??????? API ????\'}</option>`;\n    }\n    const selected = selectedModel || models[0];\n    return uniqueModels([selected, ...models]).filter(Boolean).map(model => `<option value="${escapeHtml(model)}" ${model === selected ? \'selected\' : \'\'}>${escapeHtml(model)}</option>`).join(\'\');\n}\n'
SMART_JIMENG_BLOCK = "const JIMENG_SEEDANCE2_VIDEO_MODELS = ['seedance2.0_vip', 'seedance2.0fast_vip', 'seedance2.0mini', 'seedance2.0', 'seedance2.0fast'];\nconst JIMENG_DEFAULT_VIDEO_MODELS = ['seedance2.0_vip', 'seedance2.0fast_vip', 'seedance2.0mini', 'seedance2.0', 'seedance2.0fast', 'seedance1.5pro', 'seedance1.0', 'seedance1.0fast'];\nconst JIMENG_HIGH_RES_VIDEO_MODELS = new Set(['seedance2.0_vip']);\nconst JIMENG_VIDEO_MODELS_BY_COMMAND = {\n    text2video: JIMENG_DEFAULT_VIDEO_MODELS,\n    multimodal2video: JIMENG_DEFAULT_VIDEO_MODELS,\n    image2video: JIMENG_DEFAULT_VIDEO_MODELS,\n    frames2video: JIMENG_DEFAULT_VIDEO_MODELS.filter(m => m !== 'seedance1.0' && m !== 'seedance1.0fast'),\n    multiframe2video: JIMENG_DEFAULT_VIDEO_MODELS,\n};\nfunction jimengVideoCommand(){\n    const node = activeComposerNode() || selectedNode();\n    const refs = node ? visibleReferenceImagesFor(node) : [];\n    const imageRefs = imageRefsOnly(refs);\n    const hasVideoRef = videoRefsOnly(refs).length > 0 || Boolean(manualSmartVideoLink(settings));\n    if(settings.videoMultimodal || hasVideoRef) return 'multimodal2video';\n    if(imageRefs.length >= 2) return settings.videoUseFrameRoles ? 'frames2video' : 'multiframe2video';\n    if(imageRefs.length >= 1) return 'image2video';\n    return 'text2video';\n}\nfunction isJimengVideoProvider(providerId=settings.videoProvider){\n    const key = String(providerId || '').trim().toLowerCase();\n    const provider = (apiProviders || []).find(p => p.id === providerId) || {};\n    const protocol = String(provider.protocol || '').trim().toLowerCase();\n    const name = String(provider.name || '').trim().toLowerCase();\n    const baseUrl = String(provider.base_url || provider.baseUrl || provider.api_base || '').trim().toLowerCase();\n    const videoModels = (provider.video_models || []).map(model => String(model || '').trim().toLowerCase());\n    const imageModels = (provider.image_models || []).map(model => String(model || '').trim().toLowerCase());\n    const modelHints = [...videoModels, ...imageModels];\n    return key === 'jimeng'\n        || key === 'dreamina'\n        || protocol === 'jimeng'\n        || protocol === 'dreamina'\n        || name.includes('jimeng')\n        || name.includes('dreamina')\n        || baseUrl.includes('jimeng')\n        || baseUrl.includes('dreamina')\n        || modelHints.some(model => model.startsWith('seedance') || model.includes('jimeng') || model.includes('dreamina'));\n}\nfunction filterJimengVideoModels(models, providerId=settings.videoProvider){\n    if(!isJimengVideoProvider(providerId)) return models;\n    const allowed = JIMENG_VIDEO_MODELS_BY_COMMAND[jimengVideoCommand()];\n    if(!allowed) return JIMENG_DEFAULT_VIDEO_MODELS.filter(m => (models || []).includes(m));\n    return allowed.filter(m => (models || []).includes(m));\n}\nfunction jimengVideoResolutionOptions(model=settings.videoModel, providerId=settings.videoProvider){\n    if(!isJimengVideoProvider(providerId)) return null;\n    const command = jimengVideoCommand();\n    if(command === 'multiframe2video') return [['', tr('smart.videoResAuto')]];\n    const modelKey = String(model || '').trim().toLowerCase();\n    if(JIMENG_HIGH_RES_VIDEO_MODELS.has(modelKey)) return [['', tr('smart.videoResAuto')], ['720p','720P'], ['1080p','1080P'], ['4k','4K']];\n    return [['', tr('smart.videoResAuto')], ['720p','720P']];\n}\nlet _jimengLastVideoCommand = null;\n"
API_IMAGE_CONST = "const JIMENG_DEFAULT_IMAGE_MODELS = ['5.0', '4.7', '4.6', '4.5', '4.1', '4.0', '3.1', '3.0'];\n"
API_VIDEO_CONST = "const JIMENG_DEFAULT_VIDEO_MODELS = ['seedance2.0_vip', 'seedance2.0fast_vip', 'seedance2.0mini', 'seedance2.0', 'seedance2.0fast', 'seedance1.5pro', 'seedance1.0', 'seedance1.0fast'];\n"


def log(level, message):
    print("[{}] {}".format(level, message))


def find_project_root():
    candidates = [os.getcwd(), os.path.abspath(os.path.join(os.getcwd(), "..")), r"E:\Infinite-Canvas", r"E:\Infinite-Canvas-main"]
    for root in candidates:
        if os.path.isfile(os.path.join(root, "main.py")) and os.path.isdir(os.path.join(root, "static", "js")):
            return root
    try:
        user_input = input("Enter Infinite-Canvas root path, e.g. E:\\Infinite-Canvas: ").strip().strip('"')
    except Exception:
        user_input = ""
    if user_input and os.path.isfile(os.path.join(user_input, "main.py")):
        return os.path.abspath(user_input)
    return ""


def read_text(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def write_text(path, content):
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(content)


def backup(path):
    if os.path.isfile(path):
        shutil.copy2(path, path + ".bak")
        log("BACKUP", "{} -> {}.bak".format(path, path))


def replace_regex(content, pattern, replacement, label, count=1):
    new_content, n = re.subn(pattern, lambda _m: replacement, content, count=count, flags=re.S)
    if n:
        log("PATCH", label)
        return new_content, True
    log("SKIP", label + " already patched or anchor not found")
    return content, False


def replace_between(content, start_marker, end_marker, replacement, label):
    start = content.find(start_marker)
    if start < 0:
        log("SKIP", label + " start anchor not found")
        return content, False
    end = content.find(end_marker, start)
    if end < 0:
        log("SKIP", label + " end anchor not found")
        return content, False
    current = content[start:end]
    if current == replacement:
        log("SKIP", label + " already current")
        return content, False
    log("PATCH", label)
    return content[:start] + replacement + content[end:], True


def patch_main(root):
    path = os.path.join(root, "main.py")
    backup(path)
    content = read_text(path)
    changed = False
    content, did = replace_regex(content, r"JIMENG_DEFAULT_IMAGE_MODELS = \[.*?\]\n", MAIN_IMAGE_MODELS, "main image model defaults")
    changed = changed or did
    content, did = replace_regex(content, r"JIMENG_DEFAULT_VIDEO_MODELS = \[.*?\]\n", MAIN_VIDEO_MODELS, "main video model defaults")
    changed = changed or did
    content, did = replace_between(content, "JIMENG_RATIO_CHOICES =", "IMAGE_TASK_SUCCESS_STATUSES =", MAIN_JIMENG_BACKEND, "main Jimeng backend block")
    changed = changed or did
    if changed:
        write_text(path, content)
    return changed


def patch_api_settings(root):
    path = os.path.join(root, "static", "js", "api-settings.js")
    if not os.path.isfile(path):
        log("WARN", "api-settings.js not found")
        return False
    backup(path)
    content = read_text(path)
    changed = False
    content, did = replace_regex(content, r"const JIMENG_DEFAULT_IMAGE_MODELS = .*?;\n", API_IMAGE_CONST, "api settings image model defaults")
    changed = changed or did
    content, did = replace_regex(content, r"const JIMENG_DEFAULT_VIDEO_MODELS = .*?;\n", API_VIDEO_CONST, "api settings video model defaults")
    changed = changed or did
    exact_replacements = {
        "item.image_models = unique([...(item.image_models || []).filter(model => !JIMENG_LEGACY_IMAGE_MODELS.has(String(model || '').trim())), ...JIMENG_DEFAULT_IMAGE_MODELS]);": "item.image_models = [...JIMENG_DEFAULT_IMAGE_MODELS];",
        "item.video_models = unique([...(item.video_models || []).filter(model => !JIMENG_LEGACY_VIDEO_MODELS.has(String(model || '').trim())), ...JIMENG_DEFAULT_VIDEO_MODELS]);": "item.video_models = [...JIMENG_DEFAULT_VIDEO_MODELS];",
        "if(item.id === 'jimeng') item.image_models = unique([...(item.image_models || []).filter(model => !JIMENG_LEGACY_IMAGE_MODELS.has(String(model || '').trim())), ...JIMENG_DEFAULT_IMAGE_MODELS]);": "if(item.id === 'jimeng') item.image_models = [...JIMENG_DEFAULT_IMAGE_MODELS];",
        "if(item.id === 'jimeng') item.video_models = unique([...(item.video_models || []).filter(model => !JIMENG_LEGACY_VIDEO_MODELS.has(String(model || '').trim())), ...JIMENG_DEFAULT_VIDEO_MODELS]);": "if(item.id === 'jimeng') item.video_models = [...JIMENG_DEFAULT_VIDEO_MODELS];",
    }
    for old_text, new_text in exact_replacements.items():
        if old_text in content:
            content = content.replace(old_text, new_text)
            changed = True
    if changed:
        log("PATCH", "api settings Jimeng list normalization")
        write_text(path, content)
    return changed



def patch_canvas_resolution_render(content):
    old_select = "                    <select class=\"select-lite video-resolution compact-select\">\n                        <option value=\"\">Auto</option>\n                        <option value=\"480p\">480p</option>\n                        <option value=\"720p\">720p</option>\n                        <option value=\"1080p\">1080p</option>\n                        <option value=\"780P\">780P</option>\n                    </select>"
    new_select = "                    <select class=\"select-lite video-resolution compact-select\">\n                        ${videoResolutionOptions.map(([value, label]) => `<option value=\"${escapeHtml(value)}\">${escapeHtml(label)}</option>`).join('')}\n                    </select>"
    resolution_options_insert = "    const videoResolutionOptions = jimengVideoResolutionOptions(node.model, node.apiProvider, node, mediaInputs) || [['', 'Auto'], ['480p','480P'], ['720p','720P'], ['1080p','1080P'], ['780P','780P']];\n    if(!videoResolutionOptions.some(([value]) => value === (node.resolution || ''))) node.resolution = '';\n"
    if old_select in content:
        content = content.replace(old_select, new_select, 1)
    content = content.replace(resolution_options_insert, '')
    fn_start = content.find("function renderVideoBody(node){")
    if fn_start < 0:
        raise RuntimeError("Anchor not found: renderVideoBody")
    anchor = "    const promptInputs = ordered.filter(src => src.prompt && !src.refs?.length);\n"
    idx = content.find(anchor, fn_start)
    if idx < 0:
        raise RuntimeError("Anchor not found: renderVideoBody promptInputs")
    content = content[:idx + len(anchor)] + resolution_options_insert + content[idx + len(anchor):]

    old_bind = "    const resolutionSelect = wrap.querySelector('.video-resolution');\n    providerSelect.value = node.apiProvider;\n    durationSelect.value = String(node.duration || 5);\n    aspectSelect.value = node.aspectRatio || '16:9';\n    resolutionSelect.value = node.resolution || '';\n"
    new_bind = "    const resolutionSelect = wrap.querySelector('.video-resolution');\n    function refreshVideoResolutionOptions(){\n        const options = jimengVideoResolutionOptions(node.model, node.apiProvider, node, mediaInputs) || [['', 'Auto'], ['480p', '480P'], ['720p', '720P'], ['1080p', '1080P'], ['780P', '780P']];\n        if(!options.some(([value]) => value === (node.resolution || ''))) node.resolution = '';\n        resolutionSelect.innerHTML = options.map(([value, label]) => `<option value=\"${escapeHtml(value)}\">${escapeHtml(label)}</option>`).join('');\n        resolutionSelect.value = node.resolution || '';\n    }\n    providerSelect.value = node.apiProvider;\n    durationSelect.value = String(node.duration || 5);\n    aspectSelect.value = node.aspectRatio || '16:9';\n    refreshVideoResolutionOptions();\n"
    if old_bind in content:
        content = content.replace(old_bind, new_bind, 1)
    elif "function refreshVideoResolutionOptions(){" not in content[fn_start:content.find("function renderPromptPreview", fn_start)]:
        raise RuntimeError("Anchor not found: normal canvas video resolution binding")

    old_provider = "        modelSelect.innerHTML = videoModelOptions(node.model, node.apiProvider);\n        scheduleSave();\n    };\n    modelSelect.onchange = e => { e.stopPropagation(); node.model = e.target.value; scheduleSave(); };"
    new_provider = "        modelSelect.innerHTML = videoModelOptions(node.model, node.apiProvider);\n        refreshVideoResolutionOptions();\n        scheduleSave();\n    };\n    modelSelect.onchange = e => { e.stopPropagation(); node.model = e.target.value; refreshVideoResolutionOptions(); scheduleSave(); };"
    if old_provider in content:
        content = content.replace(old_provider, new_provider, 1)
    elif "modelSelect.onchange = e => { e.stopPropagation(); node.model = e.target.value; refreshVideoResolutionOptions(); scheduleSave(); };" not in content[fn_start:content.find("function renderPromptPreview", fn_start)]:
        raise RuntimeError("Anchor not found: normal canvas video model onchange")
    return content, True
def patch_smart_resolution_render(content):
    new_fn = 'function renderVideoResolutionControl(){\n    const options = jimengVideoResolutionOptions(settings.videoModel, settings.videoProvider) || [[\'\', tr(\'smart.videoResAuto\')], [\'480p\',\'480P\'], [\'720p\',\'720P\'], [\'1080p\',\'1080P\']];\n    const value = options.some(([v]) => v === (settings.videoResolution || \'\')) ? (settings.videoResolution || \'\') : \'\';\n    if(value !== (settings.videoResolution || \'\')) settings.videoResolution = value;\n    const labelMap = Object.fromEntries(options);\n    return `<div class="smart-control resolution-control">\n        <button class="smart-pill" type="button"><i data-lucide="monitor"></i><span>${escapeHtml(labelMap[value] || value || tr(\'smart.videoResAuto\'))}</span></button>\n        <div class="smart-popover compact-popover">\n            <div class="smart-popover-title">${escapeHtml(tr(\'smart.videoResolution\'))}</div>\n            <div class="model-list">\n                ${options.map(([v,l]) => `<button type="button" class="direct-option ${v === value ? \'active\' : \'\'}" data-smart-param="videoResolution" data-smart-value="${escapeHtml(v)}"><span>${escapeHtml(l)}</span></button>`).join(\'\')}\n            </div>\n        </div>\n    </div>`;\n}\n'
    new_content, count = re.subn(r"function renderVideoResolutionControl\(\)\{.*?\n\}\nfunction renderVideoToggleControl", new_fn + "function renderVideoToggleControl", content, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError("Anchor not found: smart canvas video resolution render")
    new_content = new_content.replace("if(settings.videoProvider !== 'jimeng' || settings.engine !== 'api' || settings.apiKind !== 'video'){", "if(!isJimengVideoProvider() || settings.engine !== 'api' || settings.apiKind !== 'video'){")
    new_content = new_content.replace("${settings.videoProvider === 'jimeng' ? '' : renderVideoTrustedAssetControl()}", "${isJimengVideoProvider(settings.videoProvider) ? '' : renderVideoTrustedAssetControl()}")
    return new_content, new_content != content

def patch_smart_canvas(root):
    path = os.path.join(root, "static", "js", "smart-canvas.js")
    if not os.path.isfile(path):
        log("WARN", "smart-canvas.js not found")
        return False
    backup(path)
    content = read_text(path)
    changed = False
    pattern = r"const JIMENG_SEEDANCE(?:2)?_VIDEO_MODELS =.*?let _jimengLastVideoCommand = null;"
    new_content, count = re.subn(pattern, lambda _m: SMART_JIMENG_BLOCK, content, count=1, flags=re.S)
    if count:
        content = new_content
        changed = True
        log("PATCH", "smart canvas Jimeng video model/filter block")
    else:
        content, block_changed = replace_between(content, "const JIMENG_SEEDANCE2_VIDEO_MODELS =", "let _jimengLastVideoCommand = null;", SMART_JIMENG_BLOCK, "smart canvas Jimeng video model/filter block")
        changed = changed or block_changed
    content, render_changed = patch_smart_resolution_render(content)
    if render_changed:
        changed = True
        log("PATCH", "smart canvas Jimeng video resolution render")
    if changed:
        write_text(path, content)
    return changed


def patch_normal_canvas(root):
    path = os.path.join(root, "static", "js", "canvas.js")
    if not os.path.isfile(path):
        log("WARN", "canvas.js not found")
        return False
    backup(path)
    content = read_text(path)
    content, changed = replace_between(content, "function providerVideoModels(providerId){", "function allImageModels(providerId){", CANVAS_VIDEO_BLOCK, "normal canvas Jimeng video model/filter block")
    content, render_changed = patch_canvas_resolution_render(content)
    if render_changed:
        changed = True
        log("PATCH", "normal canvas Jimeng video resolution render")
    if changed:
        write_text(path, content)
    return changed



def patch_html_cache_versions(root):
    changed = False
    stamp = str(int(time.time()))
    targets = [
        (os.path.join(root, "static", "canvas.html"), r"(/static/js/canvas\.js\?v=)[^\"']+"),
        (os.path.join(root, "static", "smart-canvas.html"), r"(/static/js/smart-canvas\.js\?v=)[^\"']+"),
    ]
    for path, pattern in targets:
        if not os.path.isfile(path):
            continue
        content = read_text(path)
        new_content, count = re.subn(pattern, lambda m: m.group(1) + "2026.07.4." + stamp, content, count=1)
        if count and new_content != content:
            backup(path)
            write_text(path, new_content)
            log("PATCH", "html cache version " + os.path.basename(path))
            changed = True
    return changed

def verify(root):
    py = os.path.join(root, "python", "python.exe")
    if not os.path.isfile(py):
        py = sys.executable
    main_py = os.path.join(root, "main.py")
    log("VERIFY", "python compile main.py")
    if subprocess.call([py, "-m", "py_compile", main_py]) != 0:
        return False
    node_candidates = [r"C:\Users\William\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe", "node"]
    js_files = [os.path.join(root, "static", "js", "api-settings.js"), os.path.join(root, "static", "js", "smart-canvas.js"), os.path.join(root, "static", "js", "canvas.js")]
    for node in node_candidates:
        try:
            for js in js_files:
                if os.path.isfile(js):
                    subprocess.check_call([node, "--check", js], stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
            log("VERIFY", "JavaScript syntax check passed")
            break
        except Exception:
            continue
    return True


def main():
    root = find_project_root()
    if not root:
        log("ERROR", "Infinite-Canvas root not found")
        return 1
    log("INFO", "Project root: " + root)
    patch_main(root)
    patch_api_settings(root)
    patch_smart_canvas(root)
    patch_normal_canvas(root)
    patch_html_cache_versions(root)
    if not verify(root):
        log("ERROR", "Verification failed")
        return 1
    log("SUCCESS", "Jimeng CLI patch applied")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

