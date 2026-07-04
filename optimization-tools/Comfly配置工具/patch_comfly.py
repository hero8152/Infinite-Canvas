# -*- coding: utf-8 -*-
import os
import shutil
import sys

def find_main_py():
    candidates = [
        "main.py",                      # 当前目录
        "../Infinite-Canvas/main.py",   # 邻近 sibling 目录
        "E:/Infinite-Canvas/main.py",   # E盘默认目录
        "../大雄画布/main.py",           # 邻近大雄画布目录
        "E:/大雄画布/main.py",           # E盘大雄画布目录
    ]
    for path in candidates:
        abs_path = os.path.abspath(path)
        if os.path.exists(abs_path):
            return abs_path
    
    print(u"【提示】未能在默认位置自动找到 main.py。")
    try:
        if sys.version_info[0] >= 3:
            user_input = input("请输入您的 Infinite-Canvas 根目录路径 (例如 E:\\Infinite-Canvas): ")
        else:
            user_input = raw_input("请输入您的 Infinite-Canvas 根目录路径 (例如 E:\\Infinite-Canvas): ")
        
        if user_input:
            test_path = os.path.join(user_input.strip(), "main.py")
            if os.path.exists(test_path):
                return os.path.abspath(test_path)
    except Exception as e:
        print(u"输入处理出错: %s" % e)
    return None

def apply_patch():
    main_file = find_main_py()
    if not main_file:
        print(u"错误：未能定位到 main.py 文件，请确认路径是否正确！")
        return False

    print(u"发现目标文件：%s" % main_file)
    print(u"正在备份 main.py -> main.py.bak ...")
    shutil.copy2(main_file, main_file + ".bak")

    with open(main_file, "r", encoding="utf-8") as f:
        content = f.read()

    if "def comfly_normalize_size(" in content:
        print(u"提示：检测到该 main.py 中已包含 Comfly 尺寸优化逻辑，仅注入开发配置部分...")

    # 1. 注入 comfly_normalize_size 与 generate_comfly_async_image 定义在 generate_ai_image 前面
    target1 = 'async def generate_ai_image(prompt, size, quality, model, reference_images=None, provider_id="comfly"):'
    repl1 = '''def comfly_normalize_size(size):
    width, height = parse_size_pair(size)
    if not width or not height:
        return "1024x1024"
    ratio = width / height
    if ratio > 3.0:
        ratio = 3.0
    elif ratio < 1.0 / 3.0:
        ratio = 1.0 / 3.0
    pixels = width * height
    if pixels >= 3_500_000:
        target_pixels = 8_294_400
    elif pixels >= 1_500_000:
        target_pixels = 2_359_296
    else:
        target_pixels = 1_572_516

    # 针对 1:1 (正方形) 做精准对齐：
    # 1K -> 1254x1254, 2K -> 1536x1536, 4K -> 2880x2880
    if 0.95 <= ratio <= 1.05:
        if target_pixels == 8_294_400:
            return "2880x2880"
        elif target_pixels == 2_359_296:
            return "1536x1536"
        else:
            return "1254x1254"

    import math
    h = math.sqrt(target_pixels / ratio)
    w = h * ratio

    w_final = int((w + 8) // 16) * 16
    h_final = int((h + 8) // 16) * 16

    if max(w_final, h_final) > 3840:
        scale = 3840 / max(w_final, h_final)
        w_final = int((w_final * scale) // 16) * 16
        h_final = int((h_final * scale) // 16) * 16

    w_final = max(16, w_final)
    h_final = max(16, h_final)
    while w_final * h_final > 8_294_400:
        if w_final > h_final:
            w_final -= 16
        else:
            h_final -= 16

    return f"{w_final}x{h_final}"

async def generate_comfly_async_image(prompt, size, quality, model, reference_images, provider):
    size = comfly_normalize_size(size)
    base_url = (provider.get("base_url") or AI_BASE_URL).rstrip("/")
    if not base_url:
        raise HTTPException(status_code=400, detail=f"{provider.get('name') or provider['id']} 未配置 Base URL")

    refs = [ref for ref in (reference_images or []) if ref.get("url")]
    mask_refs = [ref for ref in refs if str(ref.get("role") or "").strip().lower() == "mask" or str(ref.get("name") or "").lower().endswith("_mask.png")]
    image_refs = [ref for ref in refs if ref not in mask_refs]

    is_edit = len(image_refs) > 0
    if is_edit:
        submit_url = f"{base_url}/v1/images/edits?async=true"
    else:
        submit_url = f"{base_url}/v1/images/generations?async=true"

    task_url_template = f"{base_url}/v1/images/tasks/{{task_id}}"
    
    headers = api_headers(provider=provider, model=model)
    client_timeout = httpx.Timeout(connect=20.0, read=1800.0, write=120.0, pool=20.0)

    async with httpx.AsyncClient(timeout=client_timeout) as client:
        if is_edit:
            data = {"model": model, "prompt": prompt, "size": size}
            if quality:
                data["quality"] = quality

            files = []
            opened = []
            try:
                for ref in image_refs[:ONLINE_IMAGE_REFERENCE_MAX]:
                    path = output_file_from_url(ref.get("url", ""))
                    if not path:
                        continue
                    fh = open(path, "rb")
                    opened.append(fh)
                    files.append(("image", (os.path.basename(path), fh, content_type_for_path(path))))
                if mask_refs:
                    mask_path = output_file_from_url(mask_refs[0].get("url", ""))
                    if mask_path:
                        fh = open(mask_path, "rb")
                        opened.append(fh)
                        files.append(("mask", (os.path.basename(mask_path), fh, content_type_for_path(mask_path))))
                
                form_headers = api_headers(json_body=False, provider=provider, model=model)
                response = await client.post(submit_url, headers=form_headers, data=data, files=files)
            finally:
                for fh in opened:
                    fh.close()
        else:
            body = {"model": model, "prompt": prompt, "size": size, "response_format": "url", "n": 1}
            if quality:
                body["quality"] = quality
            response = await client.post(submit_url, headers=headers, json=body)

        response.raise_for_status()
        raw = response.json()
        task_id = raw.get("task_id")
        if not task_id:
            return extract_image(raw), raw

        deadline = time.monotonic() + AI_REQUEST_TIMEOUT
        last_payload = raw
        while time.monotonic() < deadline:
            await asyncio.sleep(IMAGE_POLL_INTERVAL)
            task_url = task_url_template.format(task_id=task_id)
            result = await client.get(task_url, headers=headers)
            result.raise_for_status()
            data = result.json()
            last_payload = data
            
            task_data = data.get("data") or {}
            status = str(task_data.get("status") or "").upper()
            if status == "SUCCESS":
                images_payload = task_data.get("data") or []
                if not images_payload:
                    images_payload = data.get("data") or []
                    if isinstance(images_payload, dict):
                        images_payload = images_payload.get("data") or []
                
                if not images_payload:
                    raise HTTPException(status_code=502, detail=f"Comfly/Zhenzhen 异步成功但未返回数据：{data}")
                
                formatted_response = {
                    "data": images_payload
                }
                return extract_image(formatted_response), data
                
            if status in {"FAILED", "FAIL", "ERROR", "CANCELED", "CANCELLED", "TIMEOUT", "REVOKED"}:
                fail_reason = task_data.get("fail_reason") or task_data.get("message") or str(task_data)
                raise HTTPException(status_code=502, detail=f"Comfly/Zhenzhen 异步任务失败：{fail_reason}")
                
        raise HTTPException(status_code=504, detail=f"Comfly/Zhenzhen 异步任务轮询超时：{last_payload}")

def comfly_normalize_size(size):
    width, height = parse_size_pair(size)
    if not width or not height:
        return "1024x1024"
    ratio = max(1.0 / 3.0, min(3.0, width / height))
    ratio_choices = [(1, 1), (2, 3), (3, 2), (3, 4), (4, 3), (9, 16), (16, 9), (21, 9), (9, 21)]
    nearest_w, nearest_h = min(ratio_choices, key=lambda item: abs(ratio - item[0] / item[1]))
    nearest_ratio = nearest_w / nearest_h
    if abs(ratio - nearest_ratio) / nearest_ratio <= 0.03:
        ratio = nearest_ratio
    pixels = width * height
    long_side = max(width, height)
    if long_side >= 3000 or pixels >= 5_000_000:
        target_pixels = 8_294_400
    elif (nearest_w, nearest_h) in {(21, 9), (9, 21)}:
        target_pixels = 1_572_516
    elif long_side >= 1800 or pixels >= 1_800_000:
        target_pixels = 4_194_304
    else:
        target_pixels = 1_572_516

    max_side = 3840
    best = None
    for h_final in range(1, max_side + 1):
        ideal_w = ratio * h_final
        for w_final in (int(ideal_w), int(ideal_w) + 1):
            if w_final < 1 or w_final > max_side:
                continue
            area = w_final * h_final
            if area > target_pixels:
                continue
            ratio_error = abs((w_final / h_final) - ratio) / ratio
            area_loss = (target_pixels - area) / target_pixels
            score = ratio_error * 8 + area_loss
            candidate = (score, ratio_error, area_loss, -area, w_final, h_final)
            if best is None or candidate < best:
                best = candidate
    if not best:
        return "1024x1024"
    return f"{best[4]}x{best[5]}"

async def generate_ai_image(prompt, size, quality, model, reference_images=None, provider_id="comfly"):'''

    # 2. 注入 Comfly / Zhenzhen 提供商检测及动态尺寸重写逻辑
    if "if is_listenhub_provider(provider):" in content:
        target2 = '''    provider = get_api_provider(provider_id)
    if is_listenhub_provider(provider):
        return await generate_listenhub_provider_image(prompt, size, model, reference_images, provider)'''
        repl2 = '''    provider = get_api_provider(provider_id)
    if is_listenhub_provider(provider):
        return await generate_listenhub_provider_image(prompt, size, model, reference_images, provider)
    
    is_comfly = (provider["id"] in ("comfly", "zhenzhen") 
                 or any(k in str(provider.get("base_url") or "").lower() for k in ["comfly.org", "comfly.chat", "t8star.org"]))
    if is_comfly:
        return await generate_comfly_async_image(prompt, size, quality, model, reference_images, provider)'''
    else:
        target2 = '''    provider = get_api_provider(provider_id)'''
        repl2 = '''    provider = get_api_provider(provider_id)
    
    is_comfly = (provider["id"] in ("comfly", "zhenzhen") 
                 or any(k in str(provider.get("base_url") or "").lower() for k in ["comfly.org", "comfly.chat", "t8star.org"]))
    if is_comfly:
        return await generate_comfly_async_image(prompt, size, quality, model, reference_images, provider)'''

    # 3. 注入 Comfly / Zhenzhen 强制 OpenAI 协议切换逻辑
    target3 = '''    is_gpt2 = is_gpt_image_2_model(model)
    is_apimart = is_apimart_provider(provider)'''

    repl3 = '''    is_gpt2 = is_gpt_image_2_model(model)
    is_apimart = False if is_comfly else is_apimart_provider(provider)'''

    # 4. 注入火山/方舟自动探测的域名绕过逻辑
    target4 = '''async def probe_volcengine_auto_detect(client, base_url: str, api_key: str):
    task_ok, task_probe = await probe_volcengine_task_endpoint(client, base_url, api_key)'''

    repl4 = '''async def probe_volcengine_auto_detect(client, base_url: str, api_key: str):
    base_lower = str(base_url or "").lower()
    if any(k in base_lower for k in ["comfly", "t8star", "zhenzhen"]):
        return False, {"status": 400, "message": "跳过已知 OpenAI/APIMart 协议域名探测", "raw": {}}
    task_ok, task_probe = await probe_volcengine_task_endpoint(client, base_url, api_key)'''

    # 5. 注入 is_async_openai_provider 并改写 video_submit_url_candidates
    target5 = '''def video_submit_url_candidates(provider, base_url):
    if is_agnes_provider(provider):
        return [f"{base_url}/v1/videos"]
    if is_apimart_provider(provider):
        return [f"{base_url}/videos/generations" if base_url.endswith("/v1") else f"{base_url}/v1/videos/generations"]
    if is_volcengine_provider(provider):
        parsed = urllib.parse.urlparse(base_url)
        if parsed.path and parsed.path.rstrip("/"):
            return [base_url]
        return [f"{base_url}/api/v3/contents/generations/tasks"]
    if is_yuli_provider(provider):
        return [f"{base_url}/v1/video/create"]
    return [f"{base_url}/v1/videos/generations", f"{base_url}/v2/videos/generations"]'''

    repl5 = '''def is_async_openai_provider(provider):
    if not provider:
        return False
    base_url = str(provider.get("base_url") or "").lower()
    pid = str(provider.get("id") or "").lower()
    protocol = str(provider.get("protocol") or "").lower()
    return (
        pid in ("comfly", "zhenzhen") 
        or any(k in base_url for k in ["comfly.org", "comfly.chat", "t8star.org"])
        or "async" in protocol
    )

def video_submit_url_candidates(provider, base_url):
    if is_agnes_provider(provider):
        return [f"{base_url}/v1/videos"]
    if is_apimart_provider(provider):
        return [f"{base_url}/videos/generations" if base_url.endswith("/v1") else f"{base_url}/v1/videos/generations"]
    if is_volcengine_provider(provider):
        parsed = urllib.parse.urlparse(base_url)
        if parsed.path and parsed.path.rstrip("/"):
            return [base_url]
        return [f"{base_url}/api/v3/contents/generations/tasks"]
    if is_yuli_provider(provider):
        return [f"{base_url}/v1/video/create"]
    if is_async_openai_provider(provider):
        return [f"{base_url}/v2/videos/generations"]
    return [f"{base_url}/v1/videos/generations", f"{base_url}/v2/videos/generations"]'''

    # 6. 改写 video_task_url_candidates
    target6 = '''    if is_yuli_provider(provider):
        # 玉玉API 两种视频格式：OpenAI（/v1/videos/{id}）与原生（/v1/video/query?id=）。
        # 两个都试，谁返回成功就用谁，兼容 veo OpenAI 路径与 doubao 原生路径。
        return [f"{base_url}/v1/videos/{task_id}", f"{base_url}/v1/video/query?id={task_id}"]
    v1_task = f"{base_url}/v1/videos/generations/{task_id}"'''

    repl6 = '''    if is_yuli_provider(provider):
        # 玉玉API 两种视频格式：OpenAI（/v1/videos/{id}）与原生（/v1/video/query?id=）。
        # 两个都试，谁返回成功就用谁，兼容 veo OpenAI 路径与 doubao 原生路径。
        return [f"{base_url}/v1/videos/{task_id}", f"{base_url}/v1/video/query?id={task_id}"]
    if is_async_openai_provider(provider):
        return [f"{base_url}/v2/videos/generations/{task_id}"]
    v1_task = f"{base_url}/v1/videos/generations/{task_id}"'''

    if target1 in content:
        content = content.replace(target1, repl1, 1)
        print(u"已成功配置 comfly_normalize_size 模块")
    elif "def comfly_normalize_size(" not in content:
        print(u"错误：未能在 main.py 中定位 generate_ai_image 的入口，补丁打入失败。")
        return False
    elif "score = ratio_error * 8 + area_loss" not in content and target1 in content:
        content = content.replace(target1, repl1.rsplit("async def generate_ai_image", 1)[0] + target1, 1)
        print(u"已更新 Comfly image-2 尺寸最大化算法")

    if target2 in content:
        content = content.replace(target2, repl2, 1)
        print(u"已成功配置 Comfly/Zhenzhen 提供商识别逻辑")
    elif "is_comfly = (provider" not in content:
        print(u"错误：未能在 main.py 中定位 provider 获取逻辑。")
        return False

    if target3 in content:
        content = content.replace(target3, repl3, 1)
        print(u"已成功配置 Comfly/Zhenzhen 专属协议免 APIMart 锁定逻辑")
    elif "is_apimart = False if is_comfly" not in content:
        print(u"错误：未能在 main.py 中定位 is_apimart 判定代码。")
        return False

    if target4 in content:
        content = content.replace(target4, repl4, 1)
        print(u"已成功配置 火山/方舟自动识别规避逻辑")
    elif "跳过已知 OpenAI/APIMart 协议域名探测" not in content:
        print(u"错误：未能在 main.py 中定位 probe_volcengine_auto_detect 入口。")
        return False

    if target5 in content:
        content = content.replace(target5, repl5, 1)
        print(u"已成功配置 异步 OpenAI 提交端点注入")
    elif "is_async_openai_provider" not in content:
        print(u"错误：未能在 main.py 中定位 video_submit_url_candidates。")
        return False

    if target6 in content:
        content = content.replace(target6, repl6, 1)
        print(u"已成功配置 异步 OpenAI 任务轮询端点注入")
    elif "v2/videos/generations/" not in content:
        print(u"错误(" + main_file + ")：未能在 main.py 中定位 video_task_url_candidates。")
        return False

    with open(main_file, "w", encoding="utf-8") as f:
        f.write(content)

    print(u"修改成功！请尝试重启画布服务。")
    
    # 尝试编译验证
    py_dir = os.path.dirname(main_file)
    py_exe = os.path.join(py_dir, "python", "python.exe")
    if os.path.exists(py_exe):
        import subprocess
        print(u"正在通过画布自带环境验证语法...")
        res = subprocess.call([py_exe, "-m", "py_compile", main_file])
        if res == 0:
            print(u"语法校验通过！")
        else:
            print(u"【警告】语法校验未通过，可能存在拼写错误。")
            
    return True

if __name__ == "__main__":
    success = apply_patch()
    if not success:
        sys.exit(1)
