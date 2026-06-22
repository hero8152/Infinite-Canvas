# Feebee Studios
Supports comfyui/API calls/modelscope calls

Upstream product parity notes for the current `design/v2.1` line are tracked in [docs/upstream-parity-2026-05.md](docs/upstream-parity-2026-05.md). The port keeps this project's Mistral/pixel design system and excludes upstream runtime bundle/install-script replacement.

支持几乎所有API平台调用，修改API文件中的env的网址和key就可以运行。
支持本地comfyui调用，支持modelscope免费调用。

详细教程：https://youtu.be/1y9ShTvgC_w

设计了极为强大的分组功能，简化了页面显示和操作

---
Supports calls from almost all API platforms; simply modify the `env` URL and key in the API file to run it.

Supports local ComfyUI calls and free calls from ModelScope.

Detailed tutorial: https://youtu.be/1y9ShTvgC_w

Features a powerful grouping function, simplifying page display and operation.

----
不知道为什么上传API和env失败，需要在根目录新建API文件夹，里面增加.env文件，文件内容：

I don't know why uploading the API and env failed. I need to create an API folder in the root directory and add a .env file inside it. The file content is:

---

COMFLY_BASE_URL=https://ai.comfly.chat

COMFLY_API_KEY=sk-

MODELSCOPE_API_KEY=ms-

COMFYUI_INSTANCES=127.0.0.1:8188,127.0.0.1:4090

SYSTEM_PROMPT=You are a helpful assistant.

MAX_HISTORY_MESSAGES=30

REQUEST_TIMEOUT=120

IMAGE_POLL_INTERVAL=2

CHAT_MODELS=gpt-5.5

IMAGE_MODELS=gpt-image-2,nano-banana-pro

MODELSCOPE_CHAT_MODELS=Qwen/Qwen3-235B-A22B

APP_HOST=127.0.0.1

APP_PORT=3000

CORS_ALLOW_ORIGINS=http://127.0.0.1:3000,http://localhost:3000

Development check:

```bash
python scripts/guardrails.py
```

Build a Windows portable test bundle:

```bash
python scripts/build_windows_portable.py
```

The output is `dist/Infinite-Canvas-Windows-Portable.zip`. It contains an embedded Windows Python runtime, extracted offline dependencies, launch scripts, and a clean `API/.env` template without real API keys.

<img width="2196" height="1040" alt="image" src="https://github.com/user-attachments/assets/6d823668-cde2-4836-8332-1858efe5f520" />
<img width="2214" height="771" alt="image" src="https://github.com/user-attachments/assets/52e10958-753f-45ba-a50e-3bbec27be436" />
