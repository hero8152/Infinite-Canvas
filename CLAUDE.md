# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概览

**Infinite-Canvas**：基于 FastAPI 的单进程 AI 图像/对话工作台，前端通过 `static/index.html` 的左侧导航 + iframe 集成多个独立功能页（文生图 / 细节增强 / 图片编辑 / 角度控制 / 在线生图 / GPT 对话 / 无限画布）。后端支持三类生成后端：本地 ComfyUI（多实例负载均衡）、Comfly（OpenAI 兼容代理）、ModelScope。

## 运行与环境

```bash
# Windows（推荐，含离线 wheel）
安装依赖.bat        # python -m pip install --no-index --find-links=packages -r requirements.txt
run.bat            # 等价于 python main.py，自动打开 http://127.0.0.1:3000

# 跨平台
pip install -r requirements.txt
python main.py     # 监听 0.0.0.0:3000
```

仓库没有 lint / 测试脚本，也没有打包流程；改动后通过浏览器手动验证各 iframe 页面。

### 配置文件 `API/.env`（**手动创建，未入库**）

`main.py` 启动时调用 `load_env_file()` 读取 `API/.env`（UTF-8-SIG）。必备键：

```env
COMFLY_BASE_URL=https://ai.comfly.chat
COMFLY_API_KEY=sk-...
MODELSCOPE_API_KEY=ms-...
COMFYUI_INSTANCES=127.0.0.1:8188,127.0.0.1:4090   # 逗号分隔，第一个为默认
CHAT_MODELS=gpt-4o-mini,gemini-3.1-flash-image-preview-2k
IMAGE_MODELS=nano-banana-pro
MODELSCOPE_CHAT_MODELS=Qwen/Qwen3-235B-A22B
SYSTEM_PROMPT=...
MAX_HISTORY_MESSAGES=30
REQUEST_TIMEOUT=120
IMAGE_POLL_INTERVAL=2
```

`model_list()` 会把 `CHAT_MODELS` / `IMAGE_MODELS` 解析为前端 `/api/models` 暴露的下拉列表；未配置则回落到 `CHAT_MODEL` / `IMAGE_MODEL` 单值加默认补全。

## 整体架构

### 单文件 FastAPI 后端 `main.py`

所有逻辑集中在一个 1700+ 行的文件，按功能区分块（`# --- 配置区域 ---` / `# --- Pydantic 模型 ---` / `# --- 历史记录 ---` 等）。新增功能时优先在现有分块内追加，而不是拆模块——前端 iframe / 工作流 / 端口都按这个假设硬编码。

关键全局状态：

- `QUEUE` + `QUEUE_LOCK` + `NEXT_TASK_ID`：本地 ComfyUI 任务的进程内队列，前端 `/api/queue_status` 轮询此结构展示位置。
- `BACKEND_LOCAL_LOAD` + `LOAD_LOCK`：每个 ComfyUI 实例的进行中任务数，`get_best_backend()` 据此 + 远端 `/queue` 排队长度做加权选择。
- `manager: ConnectionManager`（`/ws/stats`）：广播在线人数与新生成图像（`broadcast_new_image`），跨端实时同步靠它。
- `GLOBAL_LOOP`：在 `startup` 事件里抓住主 event loop，供同步线程里的图像生成 finally 段通过 `asyncio.run_coroutine_threadsafe` 回发广播。
- 多把 `Lock`：`HISTORY_LOCK` / `CONVERSATION_LOCK` / `CANVAS_LOCK` / `GLOBAL_CONFIG_LOCK`。**任何读写对应 JSON 文件的逻辑都必须套对应锁**，否则会与广播/并发请求竞争。

### ComfyUI 多实例调度（容易踩坑）

`/api/generate`（本地 ComfyUI 通用入口）流程：

1. 从 `req.params` 里扫描出所有 `image` 字段 → `required_images`。
2. `get_best_backend(required_images)` 优先选已经拥有这些输入图的实例；都没有则按 `本地load*0.7 + 远端queue*0.3` 选最低分。
3. 若目标实例缺图，**会从其他 `COMFYUI_INSTANCES` 拉取再 POST `/upload/image` 同步过去**（见 1608 后的同步循环）。修改输入图字段或新增上传逻辑时，要保持 `params[node_id]["image"]` 这个约定。
4. 渲染后 `download_image()` 保存到 `output/`，可选转 JPG，写 `history.json`，并广播 `new_image`。

`/generate`（ModelScope Z-Image-Turbo 异步任务）与 `/api/online-image`（OpenAI 兼容文生图）是独立路径，不进本地队列。

### 工作流目录 `workflows/`

每个 `.json` 是导出的 ComfyUI API 格式工作流（`Z-Image.json` / `Flux2-Klein.json` / `Z-Image-Enhance.json` / `upscale.json` / `2511.json`）。前端通过 `GenerateRequest.workflow_json` 选择文件，`params` 用 `{node_id: {field: value}}` 形式覆盖节点参数。新增节点替换前先确认前端页面用的节点 ID 一致，否则参数会被忽略。

### 数据持久化（全是文件，无数据库）

```
output/                          # 生成图片落盘，URL 挂载在 /output
history.json                     # 全局生成历史（图片元数据 + 参数）
global_config.json               # 全局 token 等配置，/api/config/token 读写
data/conversations/{user}/{id}.json   # 每用户聊天记录
data/canvases/{id}.json               # 画布数据，含软删除标志（trash 保留 30 天）
API/.env                         # 运行配置（手动创建，gitignore）
```

`safe_user_id()` 会从 `X-User-Id` header 或客户端 IP 派生稳定目录名 —— 修改用户隔离逻辑时要同步检查 `user_dir`、`conversation_path` 等所有调用点。

画布有完整的 软删除→回收站→定期清理 流程（`cleanup_expired_canvas_trash` / `/api/canvases/trash` / `restore` / `purge`），改 schema 时注意 `canvas_record()` 的字段约定。

### 前端架构

`static/index.html` 是外壳：左侧 `nav` + 右侧 N 个 `<iframe>`（默认 `data-src` 懒加载，切换时复制到 `src`）。每个功能页是**自包含的单文件 HTML**（如 `canvas.html` 3477 行，`angle.html` 1270 行），内联 Tailwind CDN + 原生 JS，**没有构建步骤**。

跨 iframe 通信靠 `postMessage`，主题统一由 `static/theme.js` + `theme.css` 管理；改主题色或暗色模式必须同时改 `DESIGN.md`（Mistral 风格设计系统：橙色 `#fa520f` 主 CTA + 米色背景 + 底部 4px sunset 渐变条）。

`/ws/stats` 用于：在线人数广播 + 新生成图实时推送给所有打开的 iframe（画布等会订阅 `new_image` 自动落图）。

## 路由速查（main.py）

| 路径 | 用途 |
|------|------|
| `GET /` | 返回 `static/index.html` |
| `GET /api/config` `/api/models` `/api/config/token` | 前端启动时读模型列表 / token |
| `POST /api/upload` `/api/ai/upload` | 用户上传输入图 / AI 参考图 |
| `POST /api/generate` | **本地 ComfyUI 通用入口**（多实例调度 + 工作流参数覆盖） |
| `POST /generate` | ModelScope Z-Image-Turbo 异步任务 |
| `POST /api/online-image` | OpenAI 兼容文生图（走 Comfly） |
| `POST /api/chat` `/api/chat/stream` | 聊天（流式用 SSE，写入 `data/conversations/`） |
| `POST /api/canvas-llm` | 画布内联 LLM 调用 |
| `GET/POST/PUT/DELETE /api/canvases/...` | 画布 CRUD + 回收站 |
| `GET /api/history` `POST /api/history/delete` | 全局生成历史 |
| `POST /api/angle/generate` `/api/angle/poll_status` | 角度控制页面专用流程 |
| `WS /ws/stats` | 在线人数 + 新图广播 |

## 与项目无关的提示

- 仓库根有 `说明.png` / `运行说明.txt` / `readme.txt`（中英双语用户说明）+ `安装依赖.bat` / `run.bat`（Windows 批处理）。修改启动方式需同步这几份文档。
- `packages/` 内为 **Windows cp314 wheel**，仅供国内离线安装；macOS / Linux 跑 `pip install -r requirements.txt` 走在线源即可。
- `GEMINI.md`、`DESIGN.md` 是给其它 agent 看的项目说明 / 设计系统，改架构或外观时同步更新。
- 没有自动化测试。验证改动靠：启动服务 → 浏览器逐个 iframe（文生图 / 细节增强 / 图片编辑 / 角度控制 / 在线生图 / GPT 对话 / 画布）跑一遍 golden path。
