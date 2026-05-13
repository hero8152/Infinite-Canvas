import json
import uuid
import base64
import urllib.request
import urllib.parse
import urllib.error
import os
import re
import random
import time
import shutil
import asyncio
import sqlite3
import requests
from typing import List, Dict, Any, Optional
from threading import Lock
import httpx
from PIL import Image
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File, Header, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response, StreamingResponse
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware
from app_config import (
    AI_API_KEY,
    AI_BASE_URL,
    AI_REQUEST_TIMEOUT,
    APP_HOST,
    APP_PORT,
    CANVAS_DIR,
    CANVAS_TRASH_RETENTION_MS,
    CHAT_MODEL,
    CHAT_MODELS,
    COMFYUI_ADDRESS,
    COMFYUI_INSTANCES,
    CORS_ALLOW_HEADERS,
    CONVERSATION_DIR,
    CORS_ALLOW_ORIGINS,
    DATA_DIR,
    GLOBAL_CONFIG_FILE,
    HISTORY_FILE,
    IMAGE_MODEL,
    IMAGE_MODELS,
    IMAGE_POLL_INTERVAL,
    MAX_HISTORY_MESSAGES,
    MODELSCOPE_API_KEY,
    MODELSCOPE_CHAT_BASE_URL,
    MODELSCOPE_CHAT_MODELS,
    OUTPUT_DIR,
    STATIC_DIR,
    SYSTEM_PROMPT,
    WORKFLOW_DIR,
    ensure_runtime_dirs,
)
from task_status import (
    TASK_FAILED,
    TASK_QUEUED,
    TASK_RUNNING,
    TASK_SUCCEEDED,
    TASK_TIMEOUT,
    cloud_status_payload,
    normalize_modelscope_status,
)

app = FastAPI()

# --- WebSocket 状态管理器 ---
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.user_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, client_id: str = None):
        await websocket.accept()
        self.active_connections.append(websocket)
        if client_id:
            self.user_connections[client_id] = websocket
        print(f"WS Connected. Total: {len(self.active_connections)}")
        await self.broadcast_count()

    async def disconnect(self, websocket: WebSocket, client_id: str = None):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        if client_id and client_id in self.user_connections:
            del self.user_connections[client_id]
        print(f"WS Disconnected. Total: {len(self.active_connections)}")
        await self.broadcast_count()

    async def broadcast_count(self):
        count = len(self.active_connections)
        data = json.dumps({"type": "stats", "online_count": count})
        for connection in self.active_connections[:]:
            try:
                await connection.send_text(data)
            except Exception as e:
                print(f"Broadcast error: {e}")
                if connection in self.active_connections:
                    self.active_connections.remove(connection)

    async def broadcast_new_image(self, image_data: dict):
        data = json.dumps({"type": "new_image", "data": image_data})
        for connection in self.active_connections[:]:
            try:
                await connection.send_text(data)
            except Exception as e:
                print(f"Broadcast image error: {e}")
                if connection in self.active_connections:
                    self.active_connections.remove(connection)

    async def send_personal_message(self, message: dict, client_id: str):
        ws = self.user_connections.get(client_id)
        if ws:
            try:
                await ws.send_text(json.dumps(message))
            except Exception as e:
                print(f"Personal message error for {client_id}: {e}")

manager = ConnectionManager()
GLOBAL_LOOP = None

@app.on_event("startup")
async def startup_event():
    global GLOBAL_LOOP
    GLOBAL_LOOP = asyncio.get_running_loop()
    init_batch_tryon_db()
    recover_batch_tryon_state()

@app.websocket("/ws/stats")
async def websocket_endpoint(websocket: WebSocket, client_id: str = None):
    await manager.connect(websocket, client_id)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        await manager.disconnect(websocket, client_id)
    except Exception as e:
        print(f"WS Error: {e}")
        await manager.disconnect(websocket, client_id)

# --- 配置区域 ---

CLIENT_ID = str(uuid.uuid4())

QUEUE = []
QUEUE_LOCK = Lock()
HISTORY_LOCK = Lock()
GLOBAL_CONFIG_LOCK = Lock()
CONVERSATION_LOCK = Lock()
CANVAS_LOCK = Lock()
BATCH_TRYON_LOCK = Lock()
LOAD_LOCK = Lock()
NEXT_TASK_ID = 1
BATCH_TRYON_DB = os.path.join(DATA_DIR, "batch_tryon.db")
BATCH_TRYON_WORKERS: Dict[str, asyncio.Task] = {}

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOW_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=CORS_ALLOW_HEADERS,
)

BACKEND_LOCAL_LOAD = {addr: 0 for addr in COMFYUI_INSTANCES}

ensure_runtime_dirs()

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/output", StaticFiles(directory=OUTPUT_DIR), name="output")

# --- Pydantic 模型 ---

class GenerateRequest(BaseModel):
    prompt: str = ""
    width: int = 1024
    height: int = 1024
    workflow_json: str = "Z-Image.json"
    params: Dict[str, Any] = {}
    type: str = "zimage"
    client_id: str = ""
    convert_to_jpg: bool = False

class DeleteHistoryRequest(BaseModel):
    timestamp: float

class TokenRequest(BaseModel):
    token: str

class CloudGenRequest(BaseModel):
    prompt: str
    api_key: str = ""
    base_url: str = ""
    resolution: str = "1024*1024"
    type: str = "zimage"
    image_urls: List[str] = []
    client_id: Optional[str] = None

class CloudPollRequest(BaseModel):
    task_id: str
    api_key: str = ""
    base_url: str = ""
    client_id: Optional[str] = None

class AIReference(BaseModel):
    url: str = ""
    name: str = ""

class BatchTryonImage(BaseModel):
    url: str
    name: str = ""
    id: str = ""

class BatchTryonGroup(BaseModel):
    id: str = ""
    name: str = "Group"
    clothing_images: List[BatchTryonImage] = []
    model_images: List[BatchTryonImage] = []

class BatchTryonCreateRequest(BaseModel):
    title: str = "Batch try-on"
    prompt: str = Field(min_length=1, max_length=4000)
    model: str = ""
    size: str = "1024x1024"
    quality: str = "auto"
    pairing_mode: str = "pair"
    groups: List[BatchTryonGroup] = []
    clothing_images: List[BatchTryonImage] = []
    model_images: List[BatchTryonImage] = []
    autostart: bool = True

class BatchTryonControlRequest(BaseModel):
    model: str = ""

class OnlineImageRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    model: str = ""
    size: str = "1024x1024"
    quality: str = "auto"
    reference_images: List[AIReference] = []

class ChatRequest(BaseModel):
    conversation_id: str = ""
    message: str = Field(min_length=1, max_length=20000)
    model: str = ""
    image_model: str = ""
    mode: str = "chat"
    size: str = "1024x1024"
    quality: str = "auto"
    reference_images: List[AIReference] = []
    provider: str = "comfly"
    ms_model: str = ""
    ms_api_key: str = ""
    ms_base_url: str = ""

class MsGenerateRequest(BaseModel):
    prompt: str
    model: str = "black-forest-labs/FLUX.2-klein-9B"
    api_key: str = ""
    base_url: str = ""
    image_urls: List[str] = []
    width: int = 0
    height: int = 0
    loras: Optional[Any] = None
    client_id: Optional[str] = None

class CanvasLLMRequest(BaseModel):
    message: str = Field(min_length=1, max_length=20000)
    system_prompt: str = "You are a helpful assistant."
    model: str = ""
    messages: List[Dict[str, str]] = []
    provider: str = "comfly"
    ms_model: str = ""
    ms_api_key: str = ""
    ms_base_url: str = ""

class ConversationCreateRequest(BaseModel):
    title: str = "新对话"

class CanvasCreateRequest(BaseModel):
    title: str = "未命名画布"
    icon: str = "🧩"

class CanvasSaveRequest(BaseModel):
    title: str = "未命名画布"
    icon: str = "🧩"
    nodes: List[Dict[str, Any]] = []
    connections: List[Dict[str, Any]] = []
    viewport: Dict[str, Any] = {}

# --- 负载均衡 ---

def check_images_exist(backend_addr, images):
    if not images: return True
    for img in images:
        try:
            url = f"http://{backend_addr}/view?filename={urllib.parse.quote(img)}&type=input"
            r = requests.get(url, stream=True, timeout=0.5)
            r.close()
            if r.status_code != 200: return False
        except: return False
    return True

def get_best_backend(required_images: List[str] = None):
    best_backend = COMFYUI_INSTANCES[0]
    min_queue_size = float('inf')
    candidates_with_images = []
    candidates_others = []
    backend_stats = {}

    for addr in COMFYUI_INSTANCES:
        try:
            with urllib.request.urlopen(f"http://{addr}/queue", timeout=1) as response:
                data = json.loads(response.read())
                remote_load = len(data.get('queue_running', [])) + len(data.get('queue_pending', []))
                with LOAD_LOCK:
                    local_load = BACKEND_LOCAL_LOAD.get(addr, 0)
                effective_load = max(remote_load, local_load)
                has_images = check_images_exist(addr, required_images)
                backend_stats[addr] = {"load": effective_load, "has_images": has_images}
                if has_images:
                    candidates_with_images.append(addr)
                else:
                    candidates_others.append(addr)
        except Exception as e:
            print(f"Backend {addr} unreachable: {e}")
            continue

    target_candidates = candidates_with_images if candidates_with_images else candidates_others
    if not target_candidates:
        if candidates_others:
            target_candidates = candidates_others
        else:
            return COMFYUI_INSTANCES[0]

    for addr in target_candidates:
        load = backend_stats[addr]["load"]
        if load < min_queue_size:
            min_queue_size = load
            best_backend = addr

    return best_backend

# --- 辅助工具 ---

def download_image(comfy_address, comfy_url_path, prefix="studio_"):
    filename = f"{prefix}{uuid.uuid4().hex[:10]}.png"
    local_path = os.path.join(OUTPUT_DIR, filename)
    full_url = f"http://{comfy_address}{comfy_url_path}"
    try:
        with urllib.request.urlopen(full_url) as response, open(local_path, 'wb') as out_file:
            shutil.copyfileobj(response, out_file)
        return f"/output/{filename}"
    except Exception as e:
        print(f"下载图片失败: {e}")
        if comfy_url_path.startswith("/view"):
            return comfy_url_path.replace("/view", "/api/view", 1)
        return full_url

def save_to_history(record):
    with HISTORY_LOCK:
        history = []
        if os.path.exists(HISTORY_FILE):
            try:
                with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
                    history = json.load(f)
            except: pass
        if "timestamp" not in record:
            record["timestamp"] = time.time()
        history.insert(0, record)
        with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
            json.dump(history[:5000], f, ensure_ascii=False, indent=4)

def get_comfy_history(comfy_address, prompt_id):
    try:
        with urllib.request.urlopen(f"http://{comfy_address}/history/{prompt_id}") as response:
            return json.loads(response.read())
    except Exception as e:
        return {}

def resolve_workflow_path(workflow_json):
    name = os.path.basename(workflow_json or "")
    if not name or name != workflow_json or not name.endswith(".json"):
        raise HTTPException(status_code=400, detail="无效的 workflow 文件名")
    path = os.path.abspath(os.path.join(WORKFLOW_DIR, name))
    workflow_root = os.path.abspath(WORKFLOW_DIR)
    if os.path.commonpath([workflow_root, path]) != workflow_root or not os.path.exists(path):
        raise HTTPException(status_code=404, detail=f"Workflow file not found: {name}")
    return path

def safe_user_id(user_id, request: Request):
    candidate = (user_id or "").strip()
    if not candidate and request.client:
        candidate = f"ip-{request.client.host}"
    if not candidate:
        candidate = "anonymous"
    candidate = re.sub(r"[^a-zA-Z0-9_.-]", "-", candidate)[:80].strip(".-")
    return candidate or "anonymous"

def user_dir(user_id):
    path = os.path.join(CONVERSATION_DIR, user_id)
    os.makedirs(path, exist_ok=True)
    return path

def conversation_path(user_id, conversation_id):
    cleaned = re.sub(r"[^a-zA-Z0-9_-]", "", conversation_id or "")
    if not cleaned:
        raise HTTPException(status_code=400, detail="无效的对话 ID")
    return os.path.join(user_dir(user_id), f"{cleaned}.json")

def now_ms():
    return int(time.time() * 1000)

def save_conversation(user_id, conversation):
    with CONVERSATION_LOCK:
        path = conversation_path(user_id, conversation["id"])
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(conversation, f, ensure_ascii=False, indent=2)

def new_conversation(user_id, title="新对话"):
    timestamp = now_ms()
    conversation = {
        "id": uuid.uuid4().hex,
        "title": (title or "新对话")[:80],
        "created_at": timestamp,
        "updated_at": timestamp,
        "messages": [],
    }
    save_conversation(user_id, conversation)
    return conversation

def load_conversation(user_id, conversation_id):
    path = conversation_path(user_id, conversation_id)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="对话不存在")
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def list_conversations(user_id):
    records = []
    for filename in os.listdir(user_dir(user_id)):
        if not filename.endswith(".json"):
            continue
        path = os.path.join(user_dir(user_id), filename)
        try:
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except Exception:
            continue
        messages = data.get("messages", [])
        last_message = next((m for m in reversed(messages) if m.get("role") != "system"), None)
        records.append({
            "id": data.get("id"),
            "title": data.get("title", "新对话"),
            "created_at": data.get("created_at", 0),
            "updated_at": data.get("updated_at", 0),
            "last_message": (last_message or {}).get("content", ""),
        })
    return sorted(records, key=lambda item: item["updated_at"], reverse=True)

def canvas_path(canvas_id):
    cleaned = re.sub(r"[^a-zA-Z0-9_-]", "", canvas_id or "")
    if not cleaned:
        raise HTTPException(status_code=400, detail="无效的画布 ID")
    return os.path.join(CANVAS_DIR, f"{cleaned}.json")

def save_canvas(canvas):
    canvas["updated_at"] = now_ms()
    with CANVAS_LOCK:
        with open(canvas_path(canvas["id"]), 'w', encoding='utf-8') as f:
            json.dump(canvas, f, ensure_ascii=False, indent=2)

def new_canvas(title="未命名画布", icon="layers"):
    timestamp = now_ms()
    canvas = {
        "id": uuid.uuid4().hex,
        "title": (title or "未命名画布")[:80],
        "icon": (icon or "🧩")[:4],
        "created_at": timestamp,
        "updated_at": timestamp,
        "nodes": [],
        "connections": [],
        "viewport": {"x": 0, "y": 0, "scale": 1},
    }
    save_canvas(canvas)
    return canvas

def load_canvas(canvas_id):
    path = canvas_path(canvas_id)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="画布不存在")
    with open(path, 'r', encoding='utf-8') as f:
        canvas = json.load(f)
    if canvas.get("deleted_at"):
        raise HTTPException(status_code=404, detail="画布已在回收站")
    return canvas

def load_canvas_any(canvas_id):
    path = canvas_path(canvas_id)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="画布不存在")
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def canvas_record(data):
    return {
        "id": data.get("id"),
        "title": data.get("title", "未命名画布"),
        "icon": data.get("icon", "🧩"),
        "created_at": data.get("created_at", 0),
        "updated_at": data.get("updated_at", 0),
        "deleted_at": data.get("deleted_at", 0),
        "node_count": len(data.get("nodes", [])),
    }

def cleanup_expired_canvas_trash():
    cutoff = now_ms() - CANVAS_TRASH_RETENTION_MS
    with CANVAS_LOCK:
        for filename in os.listdir(CANVAS_DIR):
            if not filename.endswith(".json"):
                continue
            path = os.path.join(CANVAS_DIR, filename)
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                deleted_at = int(data.get("deleted_at") or 0)
                if deleted_at and deleted_at < cutoff:
                    os.remove(path)
            except Exception:
                continue

def iter_canvas_records(include_deleted=False):
    cleanup_expired_canvas_trash()
    records = []
    for filename in os.listdir(CANVAS_DIR):
        if not filename.endswith(".json"):
            continue
        try:
            with open(os.path.join(CANVAS_DIR, filename), 'r', encoding='utf-8') as f:
                data = json.load(f)
        except Exception:
            continue
        is_deleted = bool(data.get("deleted_at"))
        if include_deleted != is_deleted:
            continue
        records.append(canvas_record(data))
    return records

def list_canvases():
    records = iter_canvas_records(include_deleted=False)
    return sorted(records, key=lambda item: item["updated_at"], reverse=True)

def list_deleted_canvases():
    records = iter_canvas_records(include_deleted=True)
    return sorted(records, key=lambda item: item["deleted_at"], reverse=True)

def display_title(text):
    title = re.sub(r"\s+", " ", text or "").strip()
    return title[:24] or "新对话"

def legacy_modelscope_token():
    if not os.path.exists(GLOBAL_CONFIG_FILE):
        return ""
    with GLOBAL_CONFIG_LOCK:
        try:
            with open(GLOBAL_CONFIG_FILE, 'r', encoding='utf-8') as f:
                config = json.load(f)
            return str(config.get("modelscope_token", "")).strip()
        except Exception:
            return ""

def modelscope_api_key(provided=""):
    return (provided or "").strip() or MODELSCOPE_API_KEY.strip() or legacy_modelscope_token()

def comfly_api_key(provided=""):
    return (provided or "").strip() or AI_API_KEY.strip()

def safe_base_url(provided: str, fallback: str):
    candidate = (provided or fallback or "").strip().rstrip("/")
    parsed = urllib.parse.urlparse(candidate)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(status_code=400, detail=f"API Base URL 不合法：{candidate}")
    return candidate

def comfly_base_url(provided=""):
    return safe_base_url(provided, AI_BASE_URL)

def modelscope_base_url(provided="", chat=False):
    base = safe_base_url(provided, "https://api-inference.modelscope.cn")
    if chat and not base.endswith("/v1"):
        base = f"{base}/v1"
    if not chat and base.endswith("/v1"):
        base = base[:-3].rstrip("/")
    return base

def resolve_chat_provider(provider: str, model: str, ms_model: str, comfly_key: str = "", comfly_base: str = "", ms_key: str = "", ms_base: str = ""):
    if provider == "modelscope":
        clean_ms_key = modelscope_api_key(ms_key)
        if not clean_ms_key:
            raise HTTPException(status_code=400, detail="未配置 MODELSCOPE_API_KEY，请在 API/.env 中填写。")
        base = modelscope_base_url(ms_base, chat=True) if ms_base else MODELSCOPE_CHAT_BASE_URL
        hdrs = {"Authorization": f"Bearer {clean_ms_key}", "Content-Type": "application/json"}
        mdl = selected_model(ms_model or model, MODELSCOPE_CHAT_MODELS[0] if MODELSCOPE_CHAT_MODELS else "MiniMax/MiniMax-M2.7")
        return base, hdrs, mdl
    base = comfly_base_url(comfly_base) + "/v1"
    hdrs = api_headers(api_key=comfly_key)
    mdl = selected_model(model, CHAT_MODEL)
    return base, hdrs, mdl

def api_headers(json_body=True, api_key=""):
    clean_key = comfly_api_key(api_key)
    if not clean_key:
        raise HTTPException(status_code=400, detail="未配置 COMFLY_API_KEY：请在登录页输入 Comfly API Key，或在 API/.env 中填写。")
    headers = {"Accept": "application/json", "Authorization": f"Bearer {clean_key}"}
    if json_body:
        headers["Content-Type"] = "application/json"
    return headers

def selected_model(requested, fallback):
    model = (requested or fallback).strip()
    if not model:
        raise HTTPException(status_code=400, detail="模型名称不能为空")
    if len(model) > 120 or not re.fullmatch(r"[a-zA-Z0-9_.:/+-]+", model):
        raise HTTPException(status_code=400, detail=f"模型名称不合法：{model}")
    return model

def text_from_chat_response(data):
    choices = data.get("choices") or []
    if not choices:
        return ""
    message = choices[0].get("message") or {}
    content = message.get("content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict):
                parts.append(item.get("text") or item.get("content") or "")
        return "\n".join(part for part in parts if part)
    return str(content)

def text_delta_from_chat_chunk(data):
    choices = data.get("choices") or []
    if not choices:
        return ""
    delta = choices[0].get("delta") or {}
    content = delta.get("content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict):
                parts.append(item.get("text") or item.get("content") or "")
        return "".join(parts)
    return str(content) if content else ""

def sse_event(data):
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"

def extract_image(data):
    if isinstance(data.get("data"), dict) and isinstance(data["data"].get("data"), dict):
        data = data["data"]["data"]
    images = data.get("data") or []
    if not images:
        raise HTTPException(status_code=502, detail="生图接口没有返回图片数据")
    first = images[0]
    if first.get("url"):
        return {"type": "url", "value": first["url"]}
    if first.get("b64_json"):
        return {"type": "b64", "value": first["b64_json"]}
    raise HTTPException(status_code=502, detail="无法识别生图接口返回格式")

def extract_task_id(data):
    if data.get("task_id"):
        return str(data["task_id"])
    if data.get("id") and str(data.get("id", "")).startswith("task"):
        return str(data["id"])
    nested = data.get("data")
    if isinstance(nested, dict):
        return extract_task_id(nested)
    return None

async def wait_for_image_task(client, task_id, api_key="", base_url=""):
    deadline = time.monotonic() + AI_REQUEST_TIMEOUT
    last_payload = {}
    base = comfly_base_url(base_url)
    while time.monotonic() < deadline:
        response = await client.get(f"{base}/v1/images/tasks/{task_id}", headers=api_headers(api_key=api_key))
        response.raise_for_status()
        last_payload = response.json()
        task_data = last_payload.get("data") if isinstance(last_payload.get("data"), dict) else last_payload
        status = str(task_data.get("status", "")).upper()
        if status == "SUCCESS":
            return last_payload
        if status == "FAILURE":
            reason = task_data.get("fail_reason") or last_payload.get("message") or "生图任务失败"
            raise HTTPException(status_code=502, detail=f"生图任务失败：{reason}")
        await asyncio.sleep(IMAGE_POLL_INTERVAL)
    raise HTTPException(status_code=504, detail=f"生图任务超时，task_id={task_id}")

def output_file_from_url(url):
    if not url or not url.startswith("/output/"):
        return None
    filename = os.path.basename(urllib.parse.unquote(url.split("?", 1)[0]))
    path = os.path.abspath(os.path.join(OUTPUT_DIR, filename))
    output_root = os.path.abspath(OUTPUT_DIR)
    if os.path.commonpath([output_root, path]) != output_root or not os.path.exists(path):
        return None
    return path

def content_type_for_path(path):
    ext = os.path.splitext(path)[1].lower()
    if ext in [".jpg", ".jpeg"]:
        return "image/jpeg"
    if ext == ".webp":
        return "image/webp"
    return "image/png"

def convert_output_to_jpg(url, quality=88):
    path = output_file_from_url(url)
    if not path:
        return url
    root, ext = os.path.splitext(path)
    if ext.lower() in [".jpg", ".jpeg"]:
        return url
    jpg_path = f"{root}.jpg"
    try:
        with Image.open(path) as img:
            if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
                bg = Image.new("RGB", img.size, (255, 255, 255))
                bg.paste(img.convert("RGBA"), mask=img.convert("RGBA").split()[-1])
                img = bg
            else:
                img = img.convert("RGB")
            img.save(jpg_path, "JPEG", quality=quality, optimize=True)
        return f"/output/{os.path.basename(jpg_path)}"
    except Exception as e:
        print(f"转换 JPG 失败: {e}")
        return url

def reference_to_data_url(ref):
    path = output_file_from_url(ref.get("url", ""))
    if not path:
        return ref.get("url", "")
    with open(path, "rb") as f:
        encoded = base64.b64encode(f.read()).decode("ascii")
    return f"data:{content_type_for_path(path)};base64,{encoded}"

async def save_ai_image_to_output(image_data, prefix="online_"):
    filename = f"{prefix}{uuid.uuid4().hex[:10]}.png"
    path = os.path.join(OUTPUT_DIR, filename)
    if image_data["type"] == "b64":
        with open(path, "wb") as f:
            f.write(base64.b64decode(image_data["value"]))
        return f"/output/{filename}"
    value = image_data["value"]
    if value.startswith("/output/"):
        return value
    try:
        async with httpx.AsyncClient(timeout=AI_REQUEST_TIMEOUT) as client:
            response = await client.get(value)
            response.raise_for_status()
            content_type = response.headers.get("Content-Type", "")
            if "jpeg" in content_type or "jpg" in content_type:
                filename = filename[:-4] + ".jpg"
                path = os.path.join(OUTPUT_DIR, filename)
            elif "webp" in content_type:
                filename = filename[:-4] + ".webp"
                path = os.path.join(OUTPUT_DIR, filename)
            with open(path, "wb") as f:
                f.write(response.content)
            return f"/output/{filename}"
    except Exception as e:
        print(f"保存上游图片失败: {e}")
        return value

async def generate_ai_image(prompt, size, quality, model, reference_images=None, api_key="", base_url=""):
    refs = [ref for ref in (reference_images or []) if ref.get("url")]
    base = comfly_base_url(base_url)
    async with httpx.AsyncClient(timeout=AI_REQUEST_TIMEOUT) as client:
        if refs:
            files = []
            opened = []
            try:
                for ref in refs[:4]:
                    path = output_file_from_url(ref.get("url", ""))
                    if not path:
                        continue
                    fh = open(path, "rb")
                    opened.append(fh)
                    files.append(("image", (os.path.basename(path), fh, content_type_for_path(path))))
                data = {"model": model, "prompt": prompt, "size": size, "quality": quality, "response_format": "url", "n": "1"}
                response = await client.post(f"{base}/v1/images/edits", headers=api_headers(json_body=False, api_key=api_key), data=data, files=files)
            finally:
                for fh in opened:
                    fh.close()
        else:
            response = await client.post(
                f"{base}/v1/images/generations",
                headers=api_headers(api_key=api_key),
                json={"model": model, "prompt": prompt, "size": size, "quality": quality, "response_format": "url", "n": 1},
            )
        response.raise_for_status()
        raw = response.json()
        try:
            return extract_image(raw), raw
        except HTTPException:
            task_id = extract_task_id(raw)
            if not task_id:
                raise
        task_result = await wait_for_image_task(client, task_id, api_key=api_key, base_url=base_url)
        return extract_image(task_result), task_result

def batch_tryon_connect():
    os.makedirs(DATA_DIR, exist_ok=True)
    conn = sqlite3.connect(BATCH_TRYON_DB)
    conn.row_factory = sqlite3.Row
    return conn

def init_batch_tryon_db():
    with BATCH_TRYON_LOCK:
        conn = batch_tryon_connect()
        try:
            conn.executescript(
                """
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS batch_tryon_batches (
                    id TEXT PRIMARY KEY,
                    title TEXT,
                    pairing_mode TEXT,
                    prompt TEXT,
                    model TEXT,
                    size TEXT,
                    quality TEXT,
                    status TEXT,
                    created_at REAL,
                    updated_at REAL
                );
                CREATE TABLE IF NOT EXISTS batch_tryon_tasks (
                    id TEXT PRIMARY KEY,
                    batch_id TEXT NOT NULL,
                    group_id TEXT,
                    task_index INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    clothing_json TEXT NOT NULL,
                    model_json TEXT NOT NULL,
                    result_url TEXT,
                    error_message TEXT,
                    attempts INTEGER DEFAULT 0,
                    created_at REAL,
                    updated_at REAL,
                    started_at REAL,
                    completed_at REAL
                );
                CREATE TABLE IF NOT EXISTS batch_tryon_groups (
                    id TEXT PRIMARY KEY,
                    batch_id TEXT NOT NULL,
                    group_index INTEGER NOT NULL,
                    name TEXT,
                    clothing_json TEXT NOT NULL,
                    model_json TEXT NOT NULL,
                    collapsed INTEGER DEFAULT 0,
                    created_at REAL,
                    updated_at REAL
                );
                CREATE INDEX IF NOT EXISTS idx_batch_tryon_tasks_batch ON batch_tryon_tasks(batch_id, task_index);
                CREATE INDEX IF NOT EXISTS idx_batch_tryon_tasks_status ON batch_tryon_tasks(status);
                CREATE INDEX IF NOT EXISTS idx_batch_tryon_groups_batch ON batch_tryon_groups(batch_id, group_index);
                """
            )
            task_columns = {row["name"] for row in conn.execute("PRAGMA table_info(batch_tryon_tasks)").fetchall()}
            if "group_id" not in task_columns:
                conn.execute("ALTER TABLE batch_tryon_tasks ADD COLUMN group_id TEXT")
            conn.commit()
        finally:
            conn.close()

def recover_batch_tryon_state():
    with BATCH_TRYON_LOCK:
        conn = batch_tryon_connect()
        try:
            now = time.time()
            conn.execute(
                """
                UPDATE batch_tryon_tasks
                SET status='pending', updated_at=?, error_message='Recovered after server restart.'
                WHERE status='running'
                """,
                (now,),
            )
            conn.execute(
                """
                UPDATE batch_tryon_batches
                SET status='paused', updated_at=?
                WHERE status='running'
                """,
                (now,),
            )
            conn.commit()
        finally:
            conn.close()

def batch_tryon_json(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))

def normalize_batch_tryon_image(image: BatchTryonImage):
    item = image.model_dump()
    url = (item.get("url") or "").strip()
    if not output_file_from_url(url):
        raise HTTPException(status_code=400, detail=f"图片必须先上传到本地输出目录：{url}")
    return {
        "id": (item.get("id") or uuid.uuid4().hex)[:80],
        "url": url,
        "name": (item.get("name") or os.path.basename(url))[:160],
    }

def normalize_batch_tryon_groups(payload: BatchTryonCreateRequest):
    source_groups = payload.groups or [
        BatchTryonGroup(
            id="",
            name=payload.title or "Batch try-on",
            clothing_images=payload.clothing_images,
            model_images=payload.model_images,
        )
    ]
    groups = []
    for index, group in enumerate(source_groups, start=1):
        clothing = [normalize_batch_tryon_image(item) for item in group.clothing_images]
        models = [normalize_batch_tryon_image(item) for item in group.model_images]
        group_id = (group.id or f"btg_{uuid.uuid4().hex[:10]}").strip()[:80]
        groups.append({
            "id": group_id or f"btg_{uuid.uuid4().hex[:10]}",
            "source_key": f"{index}:{group_id or uuid.uuid4().hex}",
            "index": index,
            "name": (group.name or f"Group {index}").strip()[:120] or f"Group {index}",
            "clothing_images": clothing,
            "model_images": models,
        })
    return groups

def build_batch_tryon_pairs(clothing_images, model_images, pairing_mode):
    mode = (pairing_mode or "pair").strip()
    if not clothing_images or not model_images:
        raise HTTPException(status_code=400, detail="请先添加服装和模特图片")

    pairs = []
    if mode == "pair":
        if len(clothing_images) != len(model_images):
            raise HTTPException(status_code=400, detail=f"1:1 模式要求服装和模特数量相同，当前 {len(clothing_images)} vs {len(model_images)}")
        pairs = [([clothing], model) for clothing, model in zip(clothing_images, model_images)]
    elif mode == "fixedModel":
        pairs = [([clothing], model_images[0]) for clothing in clothing_images]
    elif mode == "fixedClothing":
        pairs = [([clothing_images[0]], model) for model in model_images]
    elif mode == "matrix":
        pairs = [([clothing], model) for clothing in clothing_images for model in model_images]
    else:
        raise HTTPException(status_code=400, detail=f"不支持的配对模式：{mode}")

    if len(pairs) > 500:
        raise HTTPException(status_code=400, detail="单个批次最多 500 个任务，请拆分后再生成")
    return mode, pairs

def batch_tryon_counts_for_conn(conn, batch_id):
    rows = conn.execute(
        "SELECT status, COUNT(*) AS count FROM batch_tryon_tasks WHERE batch_id=? GROUP BY status",
        (batch_id,),
    ).fetchall()
    counts = {row["status"]: int(row["count"]) for row in rows}
    total = sum(counts.values())
    return {
        "total": total,
        "pending": counts.get("pending", 0),
        "running": counts.get("running", 0),
        "completed": counts.get("completed", 0),
        "failed": counts.get("failed", 0),
    }

def batch_tryon_batch_record(row, counts=None):
    data = dict(row)
    data["counts"] = counts or {"total": 0, "pending": 0, "running": 0, "completed": 0, "failed": 0}
    return data

def batch_tryon_task_record(row):
    data = dict(row)
    try:
        data["clothing_images"] = json.loads(data.pop("clothing_json") or "[]")
    except Exception:
        data["clothing_images"] = []
    try:
        data["model_image"] = json.loads(data.pop("model_json") or "{}")
    except Exception:
        data["model_image"] = {}
    return data

def batch_tryon_group_record(row):
    data = dict(row)
    try:
        data["clothing_images"] = json.loads(data.pop("clothing_json") or "[]")
    except Exception:
        data["clothing_images"] = []
    try:
        data["model_images"] = json.loads(data.pop("model_json") or "[]")
    except Exception:
        data["model_images"] = []
    data["collapsed"] = bool(data.get("collapsed"))
    return data

def list_batch_tryon_batches(limit=30):
    limit = max(1, min(int(limit or 30), 100))
    with BATCH_TRYON_LOCK:
        conn = batch_tryon_connect()
        try:
            rows = conn.execute(
                "SELECT * FROM batch_tryon_batches ORDER BY updated_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
            return [batch_tryon_batch_record(row, batch_tryon_counts_for_conn(conn, row["id"])) for row in rows]
        finally:
            conn.close()

def get_batch_tryon_detail(batch_id):
    with BATCH_TRYON_LOCK:
        conn = batch_tryon_connect()
        try:
            batch = conn.execute("SELECT * FROM batch_tryon_batches WHERE id=?", (batch_id,)).fetchone()
            if not batch:
                raise HTTPException(status_code=404, detail="批次不存在")
            tasks = conn.execute(
                "SELECT * FROM batch_tryon_tasks WHERE batch_id=? ORDER BY task_index ASC",
                (batch_id,),
            ).fetchall()
            groups = conn.execute(
                "SELECT * FROM batch_tryon_groups WHERE batch_id=? ORDER BY group_index ASC",
                (batch_id,),
            ).fetchall()
            return {
                "batch": batch_tryon_batch_record(batch, batch_tryon_counts_for_conn(conn, batch_id)),
                "groups": [batch_tryon_group_record(row) for row in groups],
                "tasks": [batch_tryon_task_record(row) for row in tasks],
            }
        finally:
            conn.close()

def create_batch_tryon_batch(payload: BatchTryonCreateRequest):
    groups = normalize_batch_tryon_groups(payload)
    mode = (payload.pairing_mode or "pair").strip()
    prepared_tasks = []
    for group in groups:
        mode, pairs = build_batch_tryon_pairs(group["clothing_images"], group["model_images"], mode)
        for clothing_refs, model_ref in pairs:
            prepared_tasks.append((group["source_key"], clothing_refs, model_ref))
    if len(prepared_tasks) > 500:
        raise HTTPException(status_code=400, detail="单个批次最多 500 个任务，请拆分后再生成")
    model = selected_model(payload.model, IMAGE_MODEL)
    batch_id = f"bt_{time.strftime('%Y%m%d')}_{uuid.uuid4().hex[:8]}"
    now = time.time()
    title = (payload.title or "Batch try-on").strip()[:120] or "Batch try-on"
    stored_group_ids = {}
    for group in groups:
        stored_group_ids[group["source_key"]] = f"btg_{batch_id[3:]}_{uuid.uuid4().hex[:6]}"

    with BATCH_TRYON_LOCK:
        conn = batch_tryon_connect()
        try:
            conn.execute(
                """
                INSERT INTO batch_tryon_batches(id, title, pairing_mode, prompt, model, size, quality, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
                """,
                (batch_id, title, mode, payload.prompt.strip(), model, payload.size, payload.quality, now, now),
            )
            for group in groups:
                conn.execute(
                    """
                    INSERT INTO batch_tryon_groups(
                        id, batch_id, group_index, name, clothing_json, model_json,
                        collapsed, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
                    """,
                    (
                        stored_group_ids[group["source_key"]],
                        batch_id,
                        group["index"],
                        group["name"],
                        batch_tryon_json(group["clothing_images"]),
                        batch_tryon_json(group["model_images"]),
                        now,
                        now,
                    ),
                )
            for index, (group_id, clothing_refs, model_ref) in enumerate(prepared_tasks, start=1):
                conn.execute(
                    """
                    INSERT INTO batch_tryon_tasks(
                        id, batch_id, group_id, task_index, status, clothing_json, model_json,
                        result_url, error_message, attempts, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, 'pending', ?, ?, NULL, NULL, 0, ?, ?)
                    """,
                    (
                        f"btt_{uuid.uuid4().hex[:12]}",
                        batch_id,
                        stored_group_ids.get(group_id),
                        index,
                        batch_tryon_json(clothing_refs),
                        batch_tryon_json(model_ref),
                        now,
                        now,
                    ),
                )
            conn.commit()
        finally:
            conn.close()
    return batch_id

def set_batch_tryon_batch_status(batch_id, status):
    with BATCH_TRYON_LOCK:
        conn = batch_tryon_connect()
        try:
            row = conn.execute("SELECT id, status FROM batch_tryon_batches WHERE id=?", (batch_id,)).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="批次不存在")
            conn.execute(
                "UPDATE batch_tryon_batches SET status=?, updated_at=? WHERE id=?",
                (status, time.time(), batch_id),
            )
            conn.commit()
        finally:
            conn.close()

def prepare_batch_tryon_run(batch_id):
    with BATCH_TRYON_LOCK:
        conn = batch_tryon_connect()
        try:
            batch = conn.execute("SELECT * FROM batch_tryon_batches WHERE id=?", (batch_id,)).fetchone()
            if not batch:
                raise HTTPException(status_code=404, detail="批次不存在")
            counts = batch_tryon_counts_for_conn(conn, batch_id)
            if counts["pending"] == 0:
                final_status = "failed" if counts["failed"] and not counts["completed"] else "completed"
                conn.execute(
                    "UPDATE batch_tryon_batches SET status=?, updated_at=? WHERE id=?",
                    (final_status, time.time(), batch_id),
                )
                conn.commit()
                return False
            conn.execute(
                "UPDATE batch_tryon_batches SET status='running', updated_at=? WHERE id=?",
                (time.time(), batch_id),
            )
            conn.commit()
            return True
        finally:
            conn.close()

def claim_next_batch_tryon_task(batch_id):
    with BATCH_TRYON_LOCK:
        conn = batch_tryon_connect()
        try:
            batch = conn.execute("SELECT * FROM batch_tryon_batches WHERE id=?", (batch_id,)).fetchone()
            if not batch or batch["status"] != "running":
                return None, None
            task = conn.execute(
                """
                SELECT * FROM batch_tryon_tasks
                WHERE batch_id=? AND status='pending'
                ORDER BY task_index ASC
                LIMIT 1
                """,
                (batch_id,),
            ).fetchone()
            if not task:
                return dict(batch), None
            now = time.time()
            conn.execute(
                """
                UPDATE batch_tryon_tasks
                SET status='running', attempts=attempts+1, started_at=?, updated_at=?, error_message=NULL
                WHERE id=?
                """,
                (now, now, task["id"]),
            )
            conn.execute(
                "UPDATE batch_tryon_batches SET updated_at=? WHERE id=?",
                (now, batch_id),
            )
            conn.commit()
            task = conn.execute("SELECT * FROM batch_tryon_tasks WHERE id=?", (task["id"],)).fetchone()
            return dict(batch), batch_tryon_task_record(task)
        finally:
            conn.close()

def complete_batch_tryon_task(task_id, result_url):
    now = time.time()
    with BATCH_TRYON_LOCK:
        conn = batch_tryon_connect()
        try:
            conn.execute(
                """
                UPDATE batch_tryon_tasks
                SET status='completed', result_url=?, error_message=NULL, completed_at=?, updated_at=?
                WHERE id=?
                """,
                (result_url, now, now, task_id),
            )
            batch_id = conn.execute("SELECT batch_id FROM batch_tryon_tasks WHERE id=?", (task_id,)).fetchone()["batch_id"]
            conn.execute("UPDATE batch_tryon_batches SET updated_at=? WHERE id=?", (now, batch_id))
            conn.commit()
        finally:
            conn.close()

def fail_batch_tryon_task(task_id, error_message):
    now = time.time()
    clean_error = str(error_message or "生成失败")[:1000]
    with BATCH_TRYON_LOCK:
        conn = batch_tryon_connect()
        try:
            conn.execute(
                """
                UPDATE batch_tryon_tasks
                SET status='failed', error_message=?, completed_at=?, updated_at=?
                WHERE id=?
                """,
                (clean_error, now, now, task_id),
            )
            row = conn.execute("SELECT batch_id FROM batch_tryon_tasks WHERE id=?", (task_id,)).fetchone()
            if row:
                conn.execute("UPDATE batch_tryon_batches SET updated_at=? WHERE id=?", (now, row["batch_id"]))
            conn.commit()
        finally:
            conn.close()

def finalize_batch_tryon_if_idle(batch_id):
    with BATCH_TRYON_LOCK:
        conn = batch_tryon_connect()
        try:
            batch = conn.execute("SELECT status FROM batch_tryon_batches WHERE id=?", (batch_id,)).fetchone()
            if not batch:
                return
            counts = batch_tryon_counts_for_conn(conn, batch_id)
            if batch["status"] == "running" and counts["pending"] == 0 and counts["running"] == 0:
                status = "failed" if counts["failed"] and not counts["completed"] else "completed"
                conn.execute(
                    "UPDATE batch_tryon_batches SET status=?, updated_at=? WHERE id=?",
                    (status, time.time(), batch_id),
                )
                conn.commit()
        finally:
            conn.close()

def reset_batch_tryon_failed_tasks(batch_id):
    with BATCH_TRYON_LOCK:
        conn = batch_tryon_connect()
        try:
            row = conn.execute("SELECT id FROM batch_tryon_batches WHERE id=?", (batch_id,)).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="批次不存在")
            conn.execute(
                """
                UPDATE batch_tryon_tasks
                SET status='pending', result_url=NULL, error_message=NULL, completed_at=NULL, updated_at=?
                WHERE batch_id=? AND status='failed'
                """,
                (time.time(), batch_id),
            )
            conn.commit()
        finally:
            conn.close()

def reset_batch_tryon_task(task_id):
    with BATCH_TRYON_LOCK:
        conn = batch_tryon_connect()
        try:
            row = conn.execute("SELECT batch_id FROM batch_tryon_tasks WHERE id=?", (task_id,)).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="任务不存在")
            conn.execute(
                """
                UPDATE batch_tryon_tasks
                SET status='pending', result_url=NULL, error_message=NULL, completed_at=NULL, updated_at=?
                WHERE id=?
                """,
                (time.time(), task_id),
            )
            conn.commit()
            return row["batch_id"]
        finally:
            conn.close()

def error_detail(exc):
    if isinstance(exc, HTTPException):
        return exc.detail
    if isinstance(exc, httpx.HTTPStatusError):
        return f"上游接口错误 {exc.response.status_code}: {exc.response.text[:500]}"
    return str(exc)

async def run_batch_tryon_worker(batch_id, api_key="", base_url=""):
    try:
        while True:
            batch, task = claim_next_batch_tryon_task(batch_id)
            if not task:
                finalize_batch_tryon_if_idle(batch_id)
                return

            refs = [*task.get("clothing_images", []), task.get("model_image", {})]
            try:
                image_data, raw = await generate_ai_image(
                    batch.get("prompt") or "",
                    batch.get("size") or "1024x1024",
                    batch.get("quality") or "auto",
                    selected_model(batch.get("model"), IMAGE_MODEL),
                    refs,
                    api_key=api_key,
                    base_url=base_url,
                )
                local_url = await save_ai_image_to_output(image_data, prefix="batch_tryon_")
                complete_batch_tryon_task(task["id"], local_url)
                record = {
                    "prompt": batch.get("prompt") or "",
                    "images": [local_url],
                    "timestamp": time.time(),
                    "type": "batch_tryon",
                    "model": batch.get("model"),
                    "status": TASK_SUCCEEDED,
                    "params": {
                        "batch_id": batch_id,
                        "group_id": task.get("group_id"),
                        "task_id": task["id"],
                        "pairing_mode": batch.get("pairing_mode"),
                        "clothing_images": task.get("clothing_images", []),
                        "model_image": task.get("model_image", {}),
                    },
                    "raw_usage": raw.get("usage") if isinstance(raw, dict) else None,
                }
                save_to_history(record)
                await manager.broadcast_new_image(record)
            except Exception as exc:
                fail_batch_tryon_task(task["id"], error_detail(exc))
            finally:
                finalize_batch_tryon_if_idle(batch_id)
    finally:
        current = BATCH_TRYON_WORKERS.get(batch_id)
        if current is asyncio.current_task():
            BATCH_TRYON_WORKERS.pop(batch_id, None)

def start_batch_tryon_worker(batch_id, api_key="", base_url=""):
    current = BATCH_TRYON_WORKERS.get(batch_id)
    if current and not current.done():
        return
    BATCH_TRYON_WORKERS[batch_id] = asyncio.create_task(run_batch_tryon_worker(batch_id, api_key=api_key, base_url=base_url))

def upstream_message_from_record(item):
    role = item.get("role")
    if role not in {"user", "assistant"} or item.get("type") == "image":
        return None
    refs = item.get("attachments") or []
    if refs and role == "user":
        content = [{"type": "text", "text": item.get("content", "")}]
        for ref in refs[:4]:
            url = reference_to_data_url(ref)
            if url:
                content.append({"type": "image_url", "image_url": {"url": url}})
        return {"role": role, "content": content}
    return {"role": role, "content": item.get("content", "")}

# --- 路由接口 ---

@app.get("/")
async def index():
    return FileResponse(
        os.path.join(STATIC_DIR, "index.html"),
        headers={"Cache-Control": "no-store"},
    )

@app.get("/api/view")
def view_image(filename: str, type: str = "input", subfolder: str = ""):
    for addr in COMFYUI_INSTANCES:
        try:
            url = f"http://{addr}/view"
            params = {"filename": filename, "type": type, "subfolder": subfolder}
            r = requests.get(url, params=params, timeout=1)
            if r.status_code == 200:
                return Response(content=r.content, media_type=r.headers.get('Content-Type'))
        except Exception:
            continue
    raise HTTPException(status_code=404, detail="Image not found on any available backend")

@app.get("/api/download-output")
def download_output(url: str, name: str = ""):
    path = output_file_from_url(url)
    if not path:
        raise HTTPException(status_code=404, detail="文件不存在")
    filename = os.path.basename(name) if name else os.path.basename(path)
    return FileResponse(path, media_type=content_type_for_path(path), filename=filename)

@app.post("/api/upload")
async def upload_image(files: List[UploadFile] = File(...)):
    uploaded_files = []
    files_content = []
    for file in files:
        content = await file.read()
        files_content.append((file, content))

    for file, content in files_content:
        success_count = 0
        last_result = None
        for addr in COMFYUI_INSTANCES:
            try:
                files_data = {'image': (file.filename, content, file.content_type)}
                response = requests.post(f"http://{addr}/upload/image", files=files_data, timeout=5)
                if response.status_code == 200:
                    last_result = response.json()
                    success_count += 1
            except Exception as e:
                print(f"Upload error for {addr}: {e}")

        if success_count > 0 and last_result:
            uploaded_files.append({"comfy_name": last_result.get("name", file.filename)})
        else:
            raise HTTPException(status_code=500, detail="Failed to upload to any backend")

    return {"files": uploaded_files}

@app.post("/api/ai/upload")
async def upload_ai_reference(files: List[UploadFile] = File(...)):
    uploaded = []
    for file in files:
        content = await file.read()
        if not content:
            continue
        ext = os.path.splitext(file.filename or "")[1].lower()
        if ext not in [".png", ".jpg", ".jpeg", ".webp"]:
            content_type = (file.content_type or "").lower()
            ext = ".jpg" if "jpeg" in content_type else ".webp" if "webp" in content_type else ".png"
        filename = f"ai_ref_{uuid.uuid4().hex[:12]}{ext}"
        path = os.path.join(OUTPUT_DIR, filename)
        with open(path, "wb") as f:
            f.write(content)
        uploaded.append({"url": f"/output/{filename}", "name": file.filename or filename})
    return {"files": uploaded}

@app.get("/api/config")
async def ai_config(x_comfly_api_key: str = Header(default=""), x_comfly_base_url: str = Header(default="")):
    preferred_chat_model = next((m for m in CHAT_MODELS if m == "gpt-5.5"), CHAT_MODELS[0] if CHAT_MODELS else CHAT_MODEL)
    return {
        "base_url": comfly_base_url(x_comfly_base_url),
        "chat_model": preferred_chat_model,
        "image_model": IMAGE_MODEL,
        "chat_models": CHAT_MODELS,
        "image_models": IMAGE_MODELS,
        "has_api_key": bool(comfly_api_key(x_comfly_api_key)),
        "ms_chat_models": MODELSCOPE_CHAT_MODELS,
        "has_ms_key": bool(modelscope_api_key()),
    }

@app.get("/api/models")
async def ai_models():
    return {"chat_models": CHAT_MODELS, "image_models": IMAGE_MODELS}

# --- ModelScope Token (从 env 读取，不再支持通过 UI 修改) ---

@app.get("/api/config/token")
async def get_global_token():
    # Do not expose server-side secrets to the browser. Frontend callers use
    # this only to decide whether the backend can fall back to its configured key.
    return {"token": "", "has_token": bool(modelscope_api_key())}

# --- 在线生图 (COMFLY) ---

@app.post("/api/online-image")
async def online_image(payload: OnlineImageRequest, x_comfly_api_key: str = Header(default=""), x_comfly_base_url: str = Header(default="")):
    model = selected_model(payload.model, IMAGE_MODEL)
    refs = [ref.dict() for ref in payload.reference_images if ref.url]
    try:
        image_data, raw = await generate_ai_image(payload.prompt, payload.size, payload.quality, model, refs, api_key=x_comfly_api_key, base_url=x_comfly_base_url)
        local_url = await save_ai_image_to_output(image_data, prefix="online_")
    except httpx.HTTPStatusError as exc:
        print(f"Online image upstream error {exc.response.status_code}: {exc.response.text}")
        raise HTTPException(status_code=exc.response.status_code, detail=f"上游生图接口错误：{exc.response.text}") from exc
    except httpx.HTTPError as exc:
        print(f"Online image request error: {exc}")
        raise HTTPException(status_code=502, detail=f"请求上游生图接口失败：{exc}") from exc

    result = {
        "prompt": payload.prompt,
        "images": [local_url],
        "timestamp": time.time(),
        "type": "online",
        "model": model,
        "status": TASK_SUCCEEDED,
        "params": {"model": model, "size": payload.size, "quality": payload.quality, "reference_images": refs},
        "raw_usage": raw.get("usage") if isinstance(raw, dict) else None,
    }
    save_to_history(result)
    if GLOBAL_LOOP:
        asyncio.run_coroutine_threadsafe(manager.broadcast_new_image(result), GLOBAL_LOOP)
    return result

# --- 批量试穿 (COMFLY，持久化任务队列) ---

@app.get("/api/batch-tryon/batches")
async def batch_tryon_batches(limit: int = 30):
    init_batch_tryon_db()
    return {"batches": list_batch_tryon_batches(limit)}

@app.post("/api/batch-tryon/batches")
async def batch_tryon_create_batch(payload: BatchTryonCreateRequest, x_comfly_api_key: str = Header(default=""), x_comfly_base_url: str = Header(default="")):
    init_batch_tryon_db()
    if payload.autostart:
        api_headers(json_body=False, api_key=x_comfly_api_key)
    batch_id = create_batch_tryon_batch(payload)
    if payload.autostart and prepare_batch_tryon_run(batch_id):
        start_batch_tryon_worker(batch_id, api_key=x_comfly_api_key, base_url=x_comfly_base_url)
    return get_batch_tryon_detail(batch_id)

@app.get("/api/batch-tryon/batches/{batch_id}")
async def batch_tryon_get_batch(batch_id: str):
    init_batch_tryon_db()
    return get_batch_tryon_detail(batch_id)

@app.post("/api/batch-tryon/batches/{batch_id}/start")
async def batch_tryon_start_batch(batch_id: str, payload: BatchTryonControlRequest, x_comfly_api_key: str = Header(default=""), x_comfly_base_url: str = Header(default="")):
    init_batch_tryon_db()
    api_headers(json_body=False, api_key=x_comfly_api_key)
    if prepare_batch_tryon_run(batch_id):
        start_batch_tryon_worker(batch_id, api_key=x_comfly_api_key, base_url=x_comfly_base_url)
    return get_batch_tryon_detail(batch_id)

@app.post("/api/batch-tryon/batches/{batch_id}/pause")
async def batch_tryon_pause_batch(batch_id: str):
    init_batch_tryon_db()
    set_batch_tryon_batch_status(batch_id, "paused")
    return get_batch_tryon_detail(batch_id)

@app.post("/api/batch-tryon/batches/{batch_id}/resume")
async def batch_tryon_resume_batch(batch_id: str, payload: BatchTryonControlRequest, x_comfly_api_key: str = Header(default=""), x_comfly_base_url: str = Header(default="")):
    init_batch_tryon_db()
    api_headers(json_body=False, api_key=x_comfly_api_key)
    if prepare_batch_tryon_run(batch_id):
        start_batch_tryon_worker(batch_id, api_key=x_comfly_api_key, base_url=x_comfly_base_url)
    return get_batch_tryon_detail(batch_id)

@app.post("/api/batch-tryon/batches/{batch_id}/retry-failed")
async def batch_tryon_retry_failed(batch_id: str, payload: BatchTryonControlRequest, x_comfly_api_key: str = Header(default=""), x_comfly_base_url: str = Header(default="")):
    init_batch_tryon_db()
    api_headers(json_body=False, api_key=x_comfly_api_key)
    reset_batch_tryon_failed_tasks(batch_id)
    if prepare_batch_tryon_run(batch_id):
        start_batch_tryon_worker(batch_id, api_key=x_comfly_api_key, base_url=x_comfly_base_url)
    return get_batch_tryon_detail(batch_id)

@app.post("/api/batch-tryon/tasks/{task_id}/retry")
async def batch_tryon_retry_task(task_id: str, payload: BatchTryonControlRequest, x_comfly_api_key: str = Header(default=""), x_comfly_base_url: str = Header(default="")):
    init_batch_tryon_db()
    api_headers(json_body=False, api_key=x_comfly_api_key)
    batch_id = reset_batch_tryon_task(task_id)
    if prepare_batch_tryon_run(batch_id):
        start_batch_tryon_worker(batch_id, api_key=x_comfly_api_key, base_url=x_comfly_base_url)
    return get_batch_tryon_detail(batch_id)

# --- Canvas LLM ---

@app.post("/api/canvas-llm")
async def canvas_llm(payload: CanvasLLMRequest, x_comfly_api_key: str = Header(default=""), x_comfly_base_url: str = Header(default="")):
    chat_base, chat_hdrs, model = resolve_chat_provider(
        payload.provider, payload.model, payload.ms_model,
        comfly_key=x_comfly_api_key, comfly_base=x_comfly_base_url,
        ms_key=payload.ms_api_key, ms_base=payload.ms_base_url,
    )
    upstream_messages = [{"role": "system", "content": payload.system_prompt or SYSTEM_PROMPT}]
    for item in payload.messages[-MAX_HISTORY_MESSAGES:]:
        role = item.get("role")
        content = item.get("content")
        if role in {"user", "assistant"} and content:
            upstream_messages.append({"role": role, "content": content})
    upstream_messages.append({"role": "user", "content": payload.message})
    try:
        async with httpx.AsyncClient(timeout=AI_REQUEST_TIMEOUT) as client:
            response = await client.post(
                f"{chat_base}/chat/completions",
                headers=chat_hdrs,
                json={"model": model, "messages": upstream_messages},
            )
            response.raise_for_status()
            if not response.content:
                raise HTTPException(status_code=502, detail="上游接口返回了空响应")
            raw = response.json()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=f"上游接口错误：{exc.response.text}") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"请求上游接口失败：{exc}") from exc
    text = text_from_chat_response(raw).strip() or "接口返回了空回复。"
    return {"text": text, "model": model, "raw_usage": raw.get("usage") if isinstance(raw, dict) else None}

# --- 对话管理 ---

@app.get("/api/conversations")
async def conversations(request: Request, x_user_id: str = Header(default="")):
    user_id = safe_user_id(x_user_id, request)
    return {"user_id": user_id, "conversations": list_conversations(user_id)}

@app.post("/api/conversations")
async def create_conversation(payload: ConversationCreateRequest, request: Request, x_user_id: str = Header(default="")):
    user_id = safe_user_id(x_user_id, request)
    return {"conversation": new_conversation(user_id, payload.title)}

@app.get("/api/conversations/{conversation_id}")
async def get_conversation(conversation_id: str, request: Request, x_user_id: str = Header(default="")):
    user_id = safe_user_id(x_user_id, request)
    return {"conversation": load_conversation(user_id, conversation_id)}

@app.delete("/api/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, request: Request, x_user_id: str = Header(default="")):
    user_id = safe_user_id(x_user_id, request)
    path = conversation_path(user_id, conversation_id)
    if os.path.exists(path):
        os.remove(path)
    return {"ok": True}

# --- 画布管理 ---

@app.get("/api/canvases")
async def canvases():
    return {"canvases": list_canvases()}

@app.get("/api/canvases/trash")
async def trashed_canvases():
    return {"canvases": list_deleted_canvases(), "retention_days": 30}

@app.post("/api/canvases")
async def create_canvas(payload: CanvasCreateRequest):
    return {"canvas": new_canvas(payload.title, payload.icon)}

@app.get("/api/canvases/{canvas_id}")
async def get_canvas(canvas_id: str):
    return {"canvas": load_canvas(canvas_id)}

@app.put("/api/canvases/{canvas_id}")
async def update_canvas(canvas_id: str, payload: CanvasSaveRequest):
    canvas = load_canvas(canvas_id)
    canvas["title"] = (payload.title or canvas.get("title") or "未命名画布")[:80]
    canvas["icon"] = (payload.icon or canvas.get("icon") or "layers")[:32]
    canvas["nodes"] = payload.nodes
    canvas["connections"] = payload.connections
    canvas["viewport"] = payload.viewport
    save_canvas(canvas)
    return {"canvas": canvas}

@app.delete("/api/canvases/{canvas_id}")
async def delete_canvas(canvas_id: str):
    canvas = load_canvas_any(canvas_id)
    if not canvas.get("deleted_at"):
        canvas["deleted_at"] = now_ms()
        save_canvas(canvas)
    return {"ok": True}

@app.post("/api/canvases/{canvas_id}/restore")
async def restore_canvas(canvas_id: str):
    canvas = load_canvas_any(canvas_id)
    if canvas.get("deleted_at"):
        canvas.pop("deleted_at", None)
        save_canvas(canvas)
    return {"canvas": canvas}

@app.delete("/api/canvases/{canvas_id}/purge")
async def purge_canvas(canvas_id: str):
    path = canvas_path(canvas_id)
    if os.path.exists(path):
        os.remove(path)
    return {"ok": True}

# --- GPT 对话 ---

@app.post("/api/chat")
async def chat(payload: ChatRequest, request: Request, x_user_id: str = Header(default=""), x_comfly_api_key: str = Header(default=""), x_comfly_base_url: str = Header(default="")):
    user_id = safe_user_id(x_user_id, request)
    conversation = (
        load_conversation(user_id, payload.conversation_id)
        if payload.conversation_id
        else new_conversation(user_id, display_title(payload.message))
    )
    if not conversation.get("messages"):
        conversation["title"] = display_title(payload.message)

    refs = [ref.dict() for ref in payload.reference_images if ref.url]
    user_message = {
        "id": uuid.uuid4().hex,
        "role": "user",
        "content": payload.message,
        "created_at": now_ms(),
        "attachments": refs,
        "mode": payload.mode,
    }
    conversation["messages"].append(user_message)
    conversation["updated_at"] = now_ms()
    save_conversation(user_id, conversation)

    if payload.mode == "image":
        model = selected_model(payload.image_model or payload.model, IMAGE_MODEL)
        try:
            image_data, raw = await generate_ai_image(payload.message, payload.size, payload.quality, model, refs, api_key=x_comfly_api_key, base_url=x_comfly_base_url)
            local_url = await save_ai_image_to_output(image_data, prefix="chat_")
        except httpx.HTTPStatusError as exc:
            raise HTTPException(status_code=exc.response.status_code, detail=f"上游生图接口错误：{exc.response.text}") from exc
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"请求上游生图接口失败：{exc}") from exc
        assistant_message = {
            "id": uuid.uuid4().hex,
            "role": "assistant",
            "type": "image",
            "content": payload.message,
            "image_url": local_url,
            "created_at": now_ms(),
            "model": model,
            "status": TASK_SUCCEEDED,
            "raw_usage": raw.get("usage") if isinstance(raw, dict) else None,
        }
    else:
        chat_base, chat_hdrs, model = resolve_chat_provider(
            payload.provider, payload.model, payload.ms_model,
            comfly_key=x_comfly_api_key, comfly_base=x_comfly_base_url,
            ms_key=payload.ms_api_key, ms_base=payload.ms_base_url,
        )
        history = conversation["messages"][-MAX_HISTORY_MESSAGES:]
        upstream_messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        for item in history:
            msg = upstream_message_from_record(item)
            if msg:
                upstream_messages.append(msg)
        try:
            async with httpx.AsyncClient(timeout=AI_REQUEST_TIMEOUT) as client:
                response = await client.post(
                    f"{chat_base}/chat/completions",
                    headers=chat_hdrs,
                    json={"model": model, "messages": upstream_messages},
                )
                response.raise_for_status()
                raw = response.json()
        except httpx.HTTPStatusError as exc:
            raise HTTPException(status_code=exc.response.status_code, detail=f"上游接口错误：{exc.response.text}") from exc
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"请求上游接口失败：{exc}") from exc
        assistant_message = {
            "id": uuid.uuid4().hex,
            "role": "assistant",
            "content": text_from_chat_response(raw).strip() or "接口返回了空回复。",
            "created_at": now_ms(),
            "model": model,
            "raw_usage": raw.get("usage") if isinstance(raw, dict) else None,
        }

    conversation["messages"].append(assistant_message)
    conversation["updated_at"] = now_ms()
    save_conversation(user_id, conversation)
    return {"conversation": conversation, "message": assistant_message}

@app.post("/api/chat/stream")
async def chat_stream(payload: ChatRequest, request: Request, x_user_id: str = Header(default=""), x_comfly_api_key: str = Header(default=""), x_comfly_base_url: str = Header(default="")):
    if payload.mode == "image":
        raise HTTPException(status_code=400, detail="图片模式请使用 /api/chat")

    user_id = safe_user_id(x_user_id, request)
    conversation = (
        load_conversation(user_id, payload.conversation_id)
        if payload.conversation_id
        else new_conversation(user_id, display_title(payload.message))
    )
    if not conversation.get("messages"):
        conversation["title"] = display_title(payload.message)

    refs = [ref.dict() for ref in payload.reference_images if ref.url]
    user_message = {
        "id": uuid.uuid4().hex,
        "role": "user",
        "content": payload.message,
        "created_at": now_ms(),
        "attachments": refs,
        "mode": payload.mode,
    }
    conversation["messages"].append(user_message)
    conversation["updated_at"] = now_ms()
    save_conversation(user_id, conversation)

    chat_base, chat_hdrs, model = resolve_chat_provider(
        payload.provider, payload.model, payload.ms_model,
        comfly_key=x_comfly_api_key, comfly_base=x_comfly_base_url,
        ms_key=payload.ms_api_key, ms_base=payload.ms_base_url,
    )
    history = conversation["messages"][-MAX_HISTORY_MESSAGES:]
    upstream_messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for item in history:
        msg = upstream_message_from_record(item)
        if msg:
            upstream_messages.append(msg)

    async def stream():
        content_parts = []
        raw_usage = None
        yield sse_event({"type": "meta", "conversation": conversation})
        try:
            async with httpx.AsyncClient(timeout=AI_REQUEST_TIMEOUT) as client:
                async with client.stream(
                    "POST",
                    f"{chat_base}/chat/completions",
                    headers=chat_hdrs,
                    json={"model": model, "messages": upstream_messages, "stream": True},
                ) as response:
                    if response.status_code >= 400:
                        detail = await response.aread()
                        yield sse_event({"type": "error", "detail": f"上游接口错误：{detail.decode('utf-8', errors='ignore')}"})
                        return
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        if line.startswith("data:"):
                            line = line[5:].strip()
                        if line == "[DONE]":
                            break
                        try:
                            chunk = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        if isinstance(chunk, dict) and chunk.get("usage"):
                            raw_usage = chunk.get("usage")
                        delta = text_delta_from_chat_chunk(chunk)
                        if delta:
                            content_parts.append(delta)
                            yield sse_event({"type": "delta", "delta": delta})
        except httpx.HTTPError as exc:
            yield sse_event({"type": "error", "detail": f"请求上游接口失败：{exc}"})
            return

        assistant_message = {
            "id": uuid.uuid4().hex,
            "role": "assistant",
            "content": "".join(content_parts).strip() or "接口返回了空回复。",
            "created_at": now_ms(),
            "model": model,
            "raw_usage": raw_usage,
        }
        conversation["messages"].append(assistant_message)
        conversation["updated_at"] = now_ms()
        save_conversation(user_id, conversation)
        yield sse_event({"type": "done", "conversation": conversation, "message": assistant_message})

    return StreamingResponse(stream(), media_type="text/event-stream")

# --- 历史记录 ---

@app.get("/api/history")
async def get_history_api(type: str = None):
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if type:
                    data = [item for item in data if item.get("type", "zimage") == type]
                data = [item for item in data if item.get("images") and len(item["images"]) > 0]

                def sort_key(item):
                    ts = item.get("timestamp", 0)
                    if isinstance(ts, (int, float)):
                        return float(ts)
                    return 0

                data.sort(key=sort_key, reverse=True)
                return data
        except Exception as e:
            print(f"读取历史文件失败: {e}")
            return []
    return []

@app.get("/api/queue_status")
async def get_queue_status(client_id: str):
    with QUEUE_LOCK:
        total = len(QUEUE)
        positions = [i + 1 for i, t in enumerate(QUEUE) if t["client_id"] == client_id]
        position = positions[0] if positions else 0
    status = TASK_QUEUED if position else TASK_RUNNING if total else TASK_SUCCEEDED
    return {"total": total, "position": position, "status": status}

@app.post("/api/history/delete")
async def delete_history(req: DeleteHistoryRequest):
    if not os.path.exists(HISTORY_FILE):
        return {"success": False, "message": "History file not found"}
    try:
        with HISTORY_LOCK:
            with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
                history = json.load(f)
            target_record = None
            new_history = []
            for item in history:
                is_match = False
                item_ts = item.get("timestamp", 0)
                if isinstance(req.timestamp, (int, float)) and isinstance(item_ts, (int, float)):
                    if abs(float(item_ts) - float(req.timestamp)) < 0.001:
                        is_match = True
                elif str(item_ts) == str(req.timestamp):
                    is_match = True
                if is_match:
                    target_record = item
                else:
                    new_history.append(item)
            if target_record:
                with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
                    json.dump(new_history, f, ensure_ascii=False, indent=4)

        if target_record:
            for img_url in target_record.get("images", []):
                if img_url.startswith("/output/"):
                    filename = img_url.split("/")[-1]
                    file_path = os.path.join(OUTPUT_DIR, filename)
                    if os.path.exists(file_path):
                        try:
                            os.remove(file_path)
                        except Exception as e:
                            print(f"Failed to delete file {file_path}: {e}")
            return {"success": True}
        else:
            return {"success": False, "message": "Record not found"}
    except Exception as e:
        print(f"Delete history error: {e}")
        return {"success": False, "message": str(e)}

# --- ModelScope 角度控制 ---

@app.post("/api/angle/poll_status")
async def poll_angle_cloud(req: CloudPollRequest):
    base_url = modelscope_base_url(req.base_url) + "/"
    clean_token = modelscope_api_key(req.api_key)
    if not clean_token:
        raise HTTPException(status_code=400, detail="未提供 ModelScope API Key")

    headers = {
        "Authorization": f"Bearer {clean_token}",
        "Content-Type": "application/json",
        "X-ModelScope-Async-Mode": "true"
    }
    task_id = req.task_id
    print(f"Resuming polling for Angle Task: {task_id}")

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            for i in range(300):
                await asyncio.sleep(2)
                try:
                    result = await client.get(
                        f"{base_url}v1/tasks/{task_id}",
                        headers={**headers, "X-ModelScope-Task-Type": "image_generation"},
                    )
                    data = result.json()
                    status = data.get("task_status")

                    if status == "SUCCEED":
                        img_url = data["output_images"][0]
                        local_path = ""
                        try:
                            async with httpx.AsyncClient() as dl_client:
                                img_res = await dl_client.get(img_url)
                                if img_res.status_code == 200:
                                    filename = f"cloud_angle_{int(time.time())}.png"
                                    file_path = os.path.join(OUTPUT_DIR, filename)
                                    with open(file_path, "wb") as f:
                                        f.write(img_res.content)
                                    local_path = f"/output/{filename}"
                                else:
                                    local_path = img_url
                        except Exception:
                            local_path = img_url

                        record = {"timestamp": time.time(), "prompt": f"Resumed {task_id}", "images": [local_path], "type": "angle"}
                        save_to_history(record)
                        if req.client_id:
                            await manager.send_personal_message(cloud_status_payload("modelscope-angle", "SUCCEED", task_id), req.client_id)
                        return {"url": local_path, "task_id": task_id, "status": TASK_SUCCEEDED}

                    elif status == "FAILED":
                        if req.client_id:
                            await manager.send_personal_message(cloud_status_payload("modelscope-angle", "FAILED", task_id), req.client_id)
                        raise HTTPException(status_code=502, detail=f"ModelScope task failed: {data}")

                    if i % 5 == 0 and req.client_id:
                        await manager.send_personal_message(
                            cloud_status_payload("modelscope-angle", status, task_id, progress=i, total=300),
                            req.client_id,
                        )

                except HTTPException:
                    raise
                except Exception as loop_e:
                    print(f"Angle polling error: {loop_e}")
                    continue

            if req.client_id:
                await manager.send_personal_message(cloud_status_payload("modelscope-angle", "TIMEOUT", task_id), req.client_id)
            return {"status": TASK_TIMEOUT, "task_id": task_id, "message": "Task still pending"}

    except Exception as e:
        print(f"Angle polling error: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/angle/generate")
async def generate_angle_cloud(req: CloudGenRequest):
    base_url = modelscope_base_url(req.base_url) + "/"
    clean_token = modelscope_api_key(req.api_key)
    if not clean_token:
        raise HTTPException(status_code=400, detail="未提供 ModelScope API Key")

    headers = {
        "Authorization": f"Bearer {clean_token}",
        "Content-Type": "application/json",
        "X-ModelScope-Async-Mode": "true"
    }
    payload = {
        "model": "Qwen/Qwen-Image-Edit-2511",
        "prompt": req.prompt.strip(),
        "image_url": req.image_urls
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            submit_res = await client.post(f"{base_url}v1/images/generations", headers=headers, json=payload)
            if submit_res.status_code != 200:
                try:
                    detail = submit_res.json()
                except:
                    detail = submit_res.text
                raise HTTPException(status_code=submit_res.status_code, detail=detail)

            task_id = submit_res.json().get("task_id")
            if not task_id:
                raise HTTPException(status_code=502, detail=f"ModelScope did not return task_id: {submit_res.text}")
            print(f"Angle Task submitted, ID: {task_id}")

            for i in range(300):
                await asyncio.sleep(2)
                try:
                    result = await client.get(
                        f"{base_url}v1/tasks/{task_id}",
                        headers={**headers, "X-ModelScope-Task-Type": "image_generation"},
                    )
                    data = result.json()
                    status = data.get("task_status")

                    if status == "SUCCEED":
                        img_url = data["output_images"][0]
                        local_path = ""
                        try:
                            async with httpx.AsyncClient() as dl_client:
                                img_res = await dl_client.get(img_url)
                                if img_res.status_code == 200:
                                    filename = f"cloud_angle_{int(time.time())}.png"
                                    file_path = os.path.join(OUTPUT_DIR, filename)
                                    with open(file_path, "wb") as f:
                                        f.write(img_res.content)
                                    local_path = f"/output/{filename}"
                                else:
                                    local_path = img_url
                        except Exception:
                            local_path = img_url

                        record = {"timestamp": time.time(), "prompt": req.prompt, "images": [local_path], "type": "angle"}
                        save_to_history(record)
                        if req.client_id:
                            await manager.send_personal_message(cloud_status_payload("modelscope-angle", "SUCCEED", task_id), req.client_id)
                        if GLOBAL_LOOP:
                            asyncio.run_coroutine_threadsafe(manager.broadcast_new_image(record), GLOBAL_LOOP)
                        return {"url": local_path, "task_id": task_id, "status": TASK_SUCCEEDED}

                    elif status == "FAILED":
                        if req.client_id:
                            await manager.send_personal_message(cloud_status_payload("modelscope-angle", "FAILED", task_id), req.client_id)
                        raise HTTPException(status_code=502, detail=f"ModelScope task failed: {data}")

                    if i % 5 == 0 and req.client_id:
                        await manager.send_personal_message(
                            cloud_status_payload("modelscope-angle", status, task_id, progress=i, total=300),
                            req.client_id,
                        )

                except HTTPException:
                    raise
                except Exception as loop_e:
                    print(f"Angle polling error: {loop_e}")
                    continue

            if req.client_id:
                await manager.send_personal_message(cloud_status_payload("modelscope-angle", "TIMEOUT", task_id), req.client_id)
            return {"status": TASK_TIMEOUT, "task_id": task_id, "message": "Task still pending"}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Angle generation error: {e}")
        raise HTTPException(status_code=400, detail=str(e))

# --- ModelScope Z-Image 云端生图 ---

@app.post("/generate")
async def generate_cloud(req: CloudGenRequest):
    base_url = modelscope_base_url(req.base_url) + "/"
    clean_token = modelscope_api_key(req.api_key)
    if not clean_token:
        raise HTTPException(status_code=400, detail="未提供 ModelScope API Key")

    headers = {
        "Authorization": f"Bearer {clean_token}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "Tongyi-MAI/Z-Image-Turbo",
        "prompt": req.prompt.strip(),
        "size": req.resolution,
        "n": 1
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            submit_res = await client.post(
                f"{base_url}v1/images/generations",
                headers={**headers, "X-ModelScope-Async-Mode": "true"},
                json=payload
            )
            if submit_res.status_code != 200:
                try:
                    detail = submit_res.json()
                except:
                    detail = submit_res.text
                raise HTTPException(status_code=submit_res.status_code, detail=detail)

            task_id = submit_res.json().get("task_id")
            if not task_id:
                raise HTTPException(status_code=502, detail=f"ModelScope did not return task_id: {submit_res.text}")
            print(f"Z-Image Task submitted, ID: {task_id}")

            for i in range(200):
                await asyncio.sleep(3)
                try:
                    result = await client.get(
                        f"{base_url}v1/tasks/{task_id}",
                        headers={**headers, "X-ModelScope-Task-Type": "image_generation"},
                    )
                    data = result.json()
                    status = data.get("task_status")

                    if i % 5 == 0:
                        print(f"Task {task_id} status check {i}: {status}")

                    if status == "SUCCEED":
                        img_url = data["output_images"][0]
                        local_path = ""
                        try:
                            async with httpx.AsyncClient() as dl_client:
                                img_res = await dl_client.get(img_url)
                                if img_res.status_code == 200:
                                    filename = f"cloud_{int(time.time())}.png"
                                    file_path = os.path.join(OUTPUT_DIR, filename)
                                    with open(file_path, "wb") as f:
                                        f.write(img_res.content)
                                    local_path = f"/output/{filename}"
                                else:
                                    local_path = img_url
                        except Exception as dl_e:
                            print(f"Download error: {dl_e}")
                            local_path = img_url

                        record = {"timestamp": time.time(), "prompt": req.prompt, "images": [local_path], "type": "cloud", "status": TASK_SUCCEEDED}
                        save_to_history(record)
                        try:
                            await manager.broadcast_new_image(record)
                        except Exception:
                            pass
                        return {"url": local_path, "task_id": task_id, "status": TASK_SUCCEEDED}

                    elif status == "FAILED":
                        raise HTTPException(status_code=502, detail=f"ModelScope task failed: {data}")

                except HTTPException:
                    raise
                except Exception as loop_e:
                    print(f"Polling error (retrying): {loop_e}")
                    continue

            raise Exception("Cloud generation timeout")

    except HTTPException:
        raise
    except Exception as e:
        print(f"Cloud generation error: {e}")
        raise HTTPException(status_code=400, detail=str(e))

# --- ModelScope 通用图片生成（支持图生图） ---

@app.post("/api/ms/generate")
async def ms_generate(req: MsGenerateRequest):
    base_url = modelscope_base_url(req.base_url) + "/"
    clean_token = modelscope_api_key(req.api_key)
    if not clean_token:
        raise HTTPException(status_code=400, detail="未配置 MODELSCOPE_API_KEY，请在 API/.env 中填写。")

    headers = {
        "Authorization": f"Bearer {clean_token}",
        "Content-Type": "application/json",
        "X-ModelScope-Async-Mode": "true"
    }
    payload = {
        "model": req.model,
        "prompt": req.prompt.strip(),
    }
    if req.width and req.height:
        payload["width"] = req.width
        payload["height"] = req.height
    if req.image_urls:
        payload["image_url"] = req.image_urls
    if req.loras is not None:
        payload["loras"] = req.loras

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            submit_res = await client.post(
                f"{base_url}v1/images/generations",
                headers=headers,
                json=payload
            )
            if submit_res.status_code != 200:
                try:
                    detail = submit_res.json()
                except:
                    detail = submit_res.text
                raise HTTPException(status_code=submit_res.status_code, detail=detail)

            task_id = submit_res.json().get("task_id")
            if not task_id:
                raise HTTPException(status_code=502, detail=f"ModelScope did not return task_id: {submit_res.text}")
            print(f"MS Generate Task submitted ({req.model}), ID: {task_id}")

            TERMINAL_FAILED_STATUSES = {"FAILED", "FAIL", "ERROR", "CANCELED", "CANCELLED", "TIMEOUT", "REVOKED"}

            for i in range(300):
                await asyncio.sleep(2)
                try:
                    result = await client.get(
                        f"{base_url}v1/tasks/{task_id}",
                        headers={**headers, "X-ModelScope-Task-Type": "image_generation"},
                    )
                    data = result.json()
                    status = data.get("task_status")
                    print(f"MS Task {task_id} poll {i}: status={status}")

                    if status == "SUCCEED":
                        img_url = data["output_images"][0]
                        local_path = ""
                        try:
                            async with httpx.AsyncClient() as dl_client:
                                img_res = await dl_client.get(img_url)
                                if img_res.status_code == 200:
                                    filename = f"ms_{req.model.replace('/', '_').replace(':', '_')}_{int(time.time())}.png"
                                    file_path = os.path.join(OUTPUT_DIR, filename)
                                    with open(file_path, "wb") as f:
                                        f.write(img_res.content)
                                    local_path = f"/output/{filename}"
                                else:
                                    local_path = img_url
                        except Exception:
                            local_path = img_url

                        record = {
                            "timestamp": time.time(),
                            "prompt": req.prompt,
                            "images": [local_path],
                            "type": "klein",
                            "model": req.model,
                            "status": TASK_SUCCEEDED,
                        }
                        save_to_history(record)
                        if GLOBAL_LOOP:
                            asyncio.run_coroutine_threadsafe(manager.broadcast_new_image(record), GLOBAL_LOOP)
                        return {"url": local_path, "task_id": task_id, "status": TASK_SUCCEEDED}

                    elif status in TERMINAL_FAILED_STATUSES:
                        error_info = data.get("error_info") or data.get("message") or data.get("detail") or str(data)
                        raise HTTPException(status_code=502, detail=f"MS task {status}: {error_info}")

                except HTTPException:
                    raise
                except Exception as loop_e:
                    print(f"MS polling error: {loop_e}")
                    continue

            raise HTTPException(status_code=504, detail="MS 生图超时")

    except HTTPException:
        raise
    except Exception as e:
        print(f"MS generate error: {e}")
        raise HTTPException(status_code=400, detail=str(e))

# --- 本地 ComfyUI 生图 ---

@app.post("/api/generate")
def generate(req: GenerateRequest):
    global NEXT_TASK_ID
    current_task = None
    target_backend = None
    workflow_path = resolve_workflow_path(req.workflow_json)
    with QUEUE_LOCK:
        task_id = NEXT_TASK_ID
        NEXT_TASK_ID += 1
        current_task = {"task_id": task_id, "client_id": req.client_id}
        QUEUE.append(current_task)

    try:
        required_images = []
        for node_id, node_inputs in req.params.items():
            if isinstance(node_inputs, dict) and "image" in node_inputs:
                image_name = node_inputs["image"]
                if isinstance(image_name, str) and image_name:
                    required_images.append(image_name)

        target_backend = get_best_backend(required_images)
        with LOAD_LOCK:
            BACKEND_LOCAL_LOAD[target_backend] += 1

        for image_name in required_images:
            need_sync = False
            try:
                check_url = f"http://{target_backend}/view?filename={urllib.parse.quote(image_name)}&type=input"
                resp = requests.get(check_url, stream=True, timeout=0.5)
                resp.close()
                if resp.status_code != 200:
                    need_sync = True
            except:
                need_sync = True

            if need_sync:
                image_content = None
                image_type = "image/png"
                for addr in COMFYUI_INSTANCES:
                    if addr == target_backend: continue
                    try:
                        src_url = f"http://{addr}/view?filename={urllib.parse.quote(image_name)}&type=input"
                        r = requests.get(src_url, timeout=5)
                        if r.status_code == 200:
                            image_content = r.content
                            image_type = r.headers.get("Content-Type", "image/png")
                            break
                    except: continue

                if image_content:
                    try:
                        files = {'image': (image_name, image_content, image_type)}
                        requests.post(f"http://{target_backend}/upload/image", files=files, timeout=10)
                    except Exception as e:
                        print(f"Sync upload failed: {e}")

        with open(workflow_path, 'r', encoding='utf-8') as f:
            workflow = json.load(f)

        seed = random.randint(1, 10**15)

        if "23" in workflow and req.prompt:
            workflow["23"]["inputs"]["text"] = req.prompt
        if "144" in workflow:
            workflow["144"]["inputs"]["width"] = req.width
            workflow["144"]["inputs"]["height"] = req.height
        if "22" in workflow:
            workflow["22"]["inputs"]["seed"] = seed
        if "158" in workflow:
            workflow["158"]["inputs"]["noise_seed"] = seed
        for node_id in ["146", "181"]:
            if node_id in workflow and "inputs" in workflow[node_id] and "seed" in workflow[node_id]["inputs"]:
                workflow[node_id]["inputs"]["seed"] = seed
        if "184" in workflow and "inputs" in workflow["184"] and "seed" in workflow["184"]["inputs"]:
            workflow["184"]["inputs"]["seed"] = seed
        if "172" in workflow and "inputs" in workflow["172"] and "seed" in workflow["172"]["inputs"]:
            workflow["172"]["inputs"]["seed"] = seed % 4294967295
        if "14" in workflow and "inputs" in workflow["14"] and "seed" in workflow["14"]["inputs"]:
            workflow["14"]["inputs"]["seed"] = seed

        for node_id, node_inputs in req.params.items():
            if node_id in workflow:
                if "inputs" not in workflow[node_id]:
                    workflow[node_id]["inputs"] = {}
                for input_name, value in node_inputs.items():
                    workflow[node_id]["inputs"][input_name] = value

        p = {"prompt": workflow, "client_id": CLIENT_ID}
        data = json.dumps(p).encode('utf-8')
        try:
            post_req = urllib.request.Request(f"http://{target_backend}/prompt", data=data)
            prompt_id = json.loads(urllib.request.urlopen(post_req, timeout=10).read())['prompt_id']
        except urllib.error.HTTPError as e:
            error_body = e.read().decode('utf-8')
            raise Exception(f"HTTP Error {e.code}: {error_body}")

        history_data = None
        for i in range(300):
            try:
                res = get_comfy_history(target_backend, prompt_id)
                if prompt_id in res:
                    history_data = res[prompt_id]
                    break
            except Exception:
                pass
            time.sleep(1)

        if not history_data:
            raise Exception("ComfyUI 渲染超时")

        local_urls = []
        current_timestamp = time.time()
        if 'outputs' in history_data:
            for node_id in history_data['outputs']:
                node_output = history_data['outputs'][node_id]
                if 'images' in node_output:
                    for img in node_output['images']:
                        comfy_url_path = f"/view?filename={img['filename']}&subfolder={img['subfolder']}&type={img['type']}"
                        prefix = f"{req.type}_{int(current_timestamp)}_"
                        local_path = download_image(target_backend, comfy_url_path, prefix=prefix)
                        if req.convert_to_jpg:
                            local_path = convert_output_to_jpg(local_path)
                        local_urls.append(local_path)

        result = {
            "prompt": req.prompt if req.prompt else "Detail Enhance",
            "images": local_urls,
            "seed": seed,
            "timestamp": current_timestamp,
            "type": req.type,
            "status": TASK_SUCCEEDED,
            "params": req.params
        }
        save_to_history(result)
        if GLOBAL_LOOP:
            asyncio.run_coroutine_threadsafe(manager.broadcast_new_image(result), GLOBAL_LOOP)
        return result

    except HTTPException:
        raise
    except Exception as e:
        return {"images": [], "status": TASK_FAILED, "error": str(e)}
    finally:
        if target_backend:
            with LOAD_LOCK:
                if BACKEND_LOCAL_LOAD.get(target_backend, 0) > 0:
                    BACKEND_LOCAL_LOAD[target_backend] -= 1
        if current_task:
            with QUEUE_LOCK:
                if current_task in QUEUE:
                    QUEUE.remove(current_task)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=APP_HOST, port=APP_PORT)
