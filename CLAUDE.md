# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Infinite-Canvas (AI Studio)** — a monolithic AI image/video/LLM generation platform supporting multiple API providers through a unified UI. Single-developer project, Chinese-language primary audience.

## Architecture

```
main.py              — FastAPI monolith (~11,700 lines): API routes, data models, all business logic
static/              — Frontend: vanilla HTML/JS/CSS (no bundler, no framework)
  index.html         — Main studio shell (SPA with iframe-based page routing)
  canvas.html        — Node-based workflow canvas for image/video generation pipelines
  smart-canvas.html  — Chat-like AI composer with inline image generation
  gpt-chat.html      — LLM chat interface
  enhance.html       — Image enhancement/upscaling
  klein.html         — Flux2-Klein model interface
  zimage.html        — Z-Image model interface
  online.html        — Online API image generation
  angle.html         — ModelScope angle control
  api-settings.html  — API provider configuration UI
  asset-manager.html — Local asset library management
  comfyui-settings.html — Local ComfyUI instance management
  js/                — Page-specific JS modules (canvas.js, smart-canvas.js, etc.)
  js/i18n/           — Internationalization (zh-CN + en), loaded by i18n.js
  vendor/            — Locally mirrored third-party libs (Tailwind CSS, Lucide icons, Three.js)
  system-prompts/    — Markdown prompt templates for smart-canvas
  runninghub/        — Static RunningHub provider config + thumbnails
data/                — JSON file storage (api_providers, conversations, canvases, prompt libraries, etc.)
API/                 — `.env` file for API keys (gitignored)
assets/              — input/output/library/uploads directories for generated/uploaded media
workflows/           — ComfyUI workflow JSON files
packages/            — Offline pip wheel cache for portable Python
python/              — Bundled portable Python runtime (Windows)
tools/               — PowerShell scripts for Jimeng CLI install/login
```

## Running the Project

```bash
# Windows — double-click run.bat or:
python\python.exe main.py

# macOS — double-click mac-启动服务.command or:
python3 main.py

# The server starts on http://127.0.0.1:3000/
```

No build step. The frontend is static HTML served by FastAPI's `StaticFiles` mount. CDN dependencies are mirrored locally in `static/vendor/` for offline use.

## Key Technical Details

### Backend (`main.py`)

- **Framework**: FastAPI with CORS middleware (allow all origins), WebSocket support for live stats
- **Data persistence**: JSON files in `data/` directory, protected by per-resource `threading.Lock` instances
- **API providers** are configured in `data/api_providers.json`, managed via `/api/providers` endpoints. Provider protocols: `openai`, `apimart`, `gemini`, `volcengine`, `runninghub`, `jimeng`
- **API keys** stored in `API/.env` (key=value format), read via `load_env_file()`
- **Image generation flow**: `/api/online-image` (single) or `/api/canvas-image-tasks` (batched, sequential queue with `QUEUE_LOCK`)
- **Video generation**: `/api/canvas-video` with provider-specific dispatch (Volcengine Ark, Jimeng/dreamina CLI, RunningHub, OpenAI-compatible)
- **LLM chat**: `/api/canvas-llm` and `/api/conversations` endpoints, conversation state stored as JSON files
- **Local ComfyUI**: Polls configurable ComfyUI instances (`COMFYUI_INSTANCES` list), proxy image viewing through `/api/view`
- **ModelScope**: API calls to `modelscope.cn` for free model access, uses repo file API (not raw web)
- **Jimeng (即梦)**: CLI-based integration — spawns `dreamina` as subprocess for login, submit, and poll
- **DashScope Qwen**: `generate_dashscope_qwen_image()` for Aliyun DashScope Qwen image generation. `is_qwen_image_model()` and `is_dashscope_image_provider()` added for provider dispatch
- **GPT Image**: `is_gpt_image_model()` generalizes the old `is_gpt_image_2_model()` to support all GPT image models. Multipart form uses `image[]` field name when multi-image
- **Auto-update**: `/api/check-update` checks GitHub/ModelScope for new VERSION; `/api/update-from-github` stages and applies updates with rollback support
- **App version** stored in `VERSION` file (format: `YYYY.MM.DD`), automatically appended as query param to static assets for cache busting

### Frontend

- **No framework** — vanilla JS with DOM manipulation
- **Tailwind CSS** loaded from local mirror (`static/vendor/js/tailwindcss-cdn.js`)
- **Icons**: Lucide (local mirror)
- **3D**: Three.js 0.160.0 (local mirror) — used in canvas for node graph visualization
- **i18n**: Custom system in `static/js/i18n/` — `StudioI18n` global, translations loaded as JS modules. `tr(key)` for translation, `langIsEn()` for language check
- **Theme**: Dark/light via CSS custom properties on `html.theme-dark`, toggled by `theme.js`
- **Inter-page communication**: `window.postMessage` for cross-iframe events (lang change, canvas updates, provider changes)
- **Version cache busting**: Static assets get `?v=<VERSION>` query strings generated by `versioned_static_html()` in Python

### Data Model

- **Canvas save/sync**: Uses optimistic concurrency — `saveCanvas()` sends `base_updated_at`, server returns 409 if stale (another tab saved first). `touchCanvasOpened()` bumps `updated_at` on open. Polling (`checkRemoteCanvasVersion()`) checks `/api/canvases/{id}/meta` every 2.5s. WebSocket broadcasts ignored when `client_id` matches own `CLIENT_ID`.
- **Event delegation**: Node hover detection uses `board mousemove` + `e.target.closest('.node')` — no per-element listeners. Drag/resize/knife modes skip hover to avoid conflicts. in `data/canvases/<id>.json`. Node types:
  - `image` — reference image (paste/drag/upload)
  - `prompt` — text prompt
  - `generator` — API image generation (OpenAI-compatible providers)
  - `msgen` — ModelScope free image generation (Z-Image, Qwen-Edit, custom models)
  - `rh` — RunningHub workflow/AI app execution
  - `comfy` — Local ComfyUI (text-to-image, enhance, edit, custom workflow)
  - `ltxDirector` — ComfyUI LTXDirector video with multi-segment timeline
  - `video` — API video generation
  - `llm` — LLM chat node
  - `output` — Collects generated images/videos from upstream nodes
  - `group` / `promptGroup` — Logical grouping of nodes
  - `loop` — Serial/parallel batch execution with configurable count
  - Output nodes now display `providerLabel` and `modelLabel` tags on each image (set in `appendOutputImages()`)
  - Link hover highlighting via `hoveredNodeId` in board `mousemove` event delegation (`renderLinks()` adds `link-hover` class)
- **Asset Library**: `data/asset_library.json` — metadata index for files in `assets/library/`
- **Prompt Libraries**: `data/prompt_libraries.json` — categorized prompt templates
- **History**: `history.json` — task execution log with results
- **Conversations**: `data/conversations/<id>.json` — LLM chat history

## File Size Warning

`main.py` is ~11,700 lines. When editing, use targeted search (Grep) to locate the relevant section. Major section markers (comments like `# --- 路由接口 ---`) help navigation. The file is too large to read in one operation — always use `offset`/`limit` parameters.
