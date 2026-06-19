import json
import uuid
import base64
import hashlib
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
import zipfile
from io import BytesIO
from typing import List, Dict, Any, Optional
from threading import Lock
import httpx
from PIL import Image
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File, Header, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse, Response, StreamingResponse
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware
from app_config import (
    AI_API_KEY,
    AI_BASE_URL,
    AI_REQUEST_TIMEOUT,
    APP_HOST,
    APP_PORT,
    API_ENV_FILE,
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
    FLATLAY_GENERATE_MODEL,
    FLATLAY_VISION_MODEL,
    GLOBAL_CONFIG_FILE,
    HISTORY_FILE,
    IMAGE_MODEL,
    IMAGE_MODELS,
    IMAGE_POLL_INTERVAL,
    MAX_HISTORY_MESSAGES,
    MODELSCOPE_API_KEY,
    MODELSCOPE_CHAT_BASE_URL,
    MODELSCOPE_CHAT_MODELS,
    RMBG_API_KEY,
    RMBG_BASE_URL,
    RMBG_DEFAULT_VARIANT,
    RMBG_LOCAL_BASE_URL,
    RMBG_PROVIDER,
    OUTPUT_DIR,
    STATIC_DIR,
    SYSTEM_PROMPT,
    VIDEO_MODELS,
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

BATCH_TRYON_DEFAULT_MODEL = "gemini-3.1-flash-image-preview"
BATCH_TRYON_DEFAULT_SIZE = "auto"
BATCH_TRYON_RATIO_SIZES = {"1:1", "2:3", "3:4"}
BATCH_TRYON_SIZE_VALUES = {BATCH_TRYON_DEFAULT_SIZE, *BATCH_TRYON_RATIO_SIZES}

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
    init_flatlay_db()
    recover_flatlay_state()

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
FLATLAY_LOCK = Lock()
LOAD_LOCK = Lock()
NEXT_TASK_ID = 1
BATCH_TRYON_DB = os.path.join(DATA_DIR, "batch_tryon.db")
BATCH_TRYON_WORKERS: Dict[str, asyncio.Task] = {}
FLATLAY_DB = os.path.join(DATA_DIR, "flatlay.db")
FLATLAY_WORKERS: Dict[str, asyncio.Task] = {}
GALLERY_META_FILE = os.path.join(DATA_DIR, "gallery_meta.json")
GALLERY_LOCK = Lock()
ASSET_ROOT_DIR = os.path.join(STATIC_DIR, "assets")
ASSET_LIBRARY_DIR = os.path.join(ASSET_ROOT_DIR, "library")
ASSET_LIBRARY_FILE = os.path.join(DATA_DIR, "asset_library.json")
ASSET_LIBRARY_LOCK = Lock()
FRONTEND_BUILD_DIR = os.path.join(STATIC_DIR, "app")
FRONTEND_ASSETS_DIR = os.path.join(FRONTEND_BUILD_DIR, "assets")
FRONTEND_INDEX_FILE = os.path.join(FRONTEND_BUILD_DIR, "index.html")
API_PROVIDERS_FILE = os.path.join(DATA_DIR, "api_providers.json")
PROVIDER_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{1,40}$")
IMAGE_TASK_TIMEOUT = float(os.getenv("IMAGE_TASK_TIMEOUT", str(AI_REQUEST_TIMEOUT)))
APIMART_IMAGE_TASK_TIMEOUT = float(os.getenv("APIMART_IMAGE_TASK_TIMEOUT", "1800"))
APIMART_IMAGE_POLL_INTERVAL = float(os.getenv("APIMART_IMAGE_POLL_INTERVAL", "5"))
APIMART_IMAGE_INITIAL_POLL_DELAY = float(os.getenv("APIMART_IMAGE_INITIAL_POLL_DELAY", "10"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOW_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=CORS_ALLOW_HEADERS,
)

BACKEND_LOCAL_LOAD = {addr: 0 for addr in COMFYUI_INSTANCES}

ensure_runtime_dirs()
os.makedirs(ASSET_LIBRARY_DIR, exist_ok=True)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/output", StaticFiles(directory=OUTPUT_DIR), name="output")
app.mount("/assets", StaticFiles(directory=ASSET_ROOT_DIR), name="assets")
if os.path.isdir(FRONTEND_ASSETS_DIR):
    app.mount("/app/assets", StaticFiles(directory=FRONTEND_ASSETS_DIR), name="app-assets")

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

class GalleryFavoriteRequest(BaseModel):
    favorite: bool = True

class GalleryDownloadRequest(BaseModel):
    asset_ids: List[str] = []

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
    role: str = ""

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
    model: str = BATCH_TRYON_DEFAULT_MODEL
    size: str = BATCH_TRYON_DEFAULT_SIZE
    quality: str = "auto"
    pairing_mode: str = "pair"
    groups: List[BatchTryonGroup] = []
    clothing_images: List[BatchTryonImage] = []
    model_images: List[BatchTryonImage] = []
    autostart: bool = True

class BatchTryonControlRequest(BaseModel):
    model: str = ""

class FlatlayImage(BaseModel):
    url: str
    name: str = ""
    id: str = ""

class FlatlayCreateRequest(BaseModel):
    title: str = "Flatlay batch"
    target_category: str = "auto"
    vision_model: str = ""
    generate_model: str = ""
    size: str = "1536x1024"
    quality: str = "auto"
    rmbg_provider: str = "none"
    rmbg_variant: str = "lite"
    rmbg_base_url: str = ""
    rmbg_api_key: str = ""
    images: List[FlatlayImage] = []
    autostart: bool = True

class FlatlayControlRequest(BaseModel):
    mode: str = "generation"
    phrase: str = ""
    rmbg_provider: str = ""
    rmbg_variant: str = ""
    rmbg_base_url: str = ""
    rmbg_api_key: str = ""

class FlatlayPhraseRequest(BaseModel):
    phrase: str = Field(min_length=1, max_length=120)

class OnlineImageRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    provider_id: str = "comfly"
    model: str = ""
    size: str = "1024x1024"
    quality: str = "auto"
    reference_images: List[AIReference] = []

CANVAS_TASKS: Dict[str, Dict[str, Any]] = {}
CANVAS_TASK_LOCK = Lock()
VIDEO_POLL_TIMEOUT = float(os.getenv("VIDEO_POLL_TIMEOUT", "1800"))

class CanvasVideoRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    provider_id: str = "comfly"
    model: str = "veo3-fast"
    duration: int = 5
    aspect_ratio: str = "16:9"
    resolution: str = ""
    size: str = ""
    images: List[AIReference] = []
    videos: List[str] = []
    enhance_prompt: bool = False
    enable_upsample: bool = False
    watermark: bool = False
    seed: Optional[int] = None
    camera_fixed: bool = False
    camerafixed: bool = False
    return_last_frame: bool = False
    generate_audio: bool = False

class ApiProviderPayload(BaseModel):
    id: str = ""
    name: str = ""
    base_url: str = ""
    protocol: str = "openai"
    enabled: bool = True
    primary: bool = False
    image_generation_endpoint: str = ""
    image_edit_endpoint: str = ""
    image_models: List[str] = []
    chat_models: List[str] = []
    video_models: List[str] = []
    ms_loras: Dict[str, Any] = {}
    ms_defaults_version: str = ""
    api_key: Optional[str] = None
    clear_key: bool = False

class ProviderConnectionPayload(BaseModel):
    id: str = ""
    provider_id: str = ""
    name: str = ""
    base_url: str = ""
    protocol: str = "openai"
    image_generation_endpoint: str = ""
    image_edit_endpoint: str = ""
    api_key: str = ""

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
    images: List[str] = []
    provider: str = "comfly"
    ms_model: str = ""
    ms_api_key: str = ""
    ms_base_url: str = ""

class ConversationCreateRequest(BaseModel):
    title: str = "新对话"

class CanvasCreateRequest(BaseModel):
    title: str = "未命名画布"
    icon: str = "🧩"
    kind: str = "classic"

class CanvasSaveRequest(BaseModel):
    title: str = "未命名画布"
    icon: str = "🧩"
    nodes: List[Dict[str, Any]] = []
    connections: List[Dict[str, Any]] = []
    viewport: Dict[str, Any] = {}
    logs: List[Dict[str, Any]] = []
    settings: Dict[str, Any] = {}
    client_id: str = ""
    base_updated_at: int = 0

class CanvasAssetCheckRequest(BaseModel):
    urls: List[str] = []

class CanvasAssetDownloadRequest(BaseModel):
    urls: List[str] = []
    filename: str = "canvas-assets.zip"

class AssetLibraryCategoryRequest(BaseModel):
    name: str = "图片资产"

class AssetLibraryAddRequest(BaseModel):
    category_id: str = ""
    url: str = ""
    name: str = ""

class AssetLibraryRenameRequest(BaseModel):
    name: str = ""

class ComfyInstancesPayload(BaseModel):
    instances: List[str] = []

class WorkflowField(BaseModel):
    id: str
    node: str = ""
    input: str = ""
    name: str = ""
    type: str = "text"
    default: Any = None
    min: Optional[float] = None
    max: Optional[float] = None
    step: Optional[float] = None
    options: List[str] = []

class WorkflowConfig(BaseModel):
    title: str = ""
    fields: List[WorkflowField] = []
    mini_cards: Dict[str, Any] = {}

class WorkflowUploadRequest(BaseModel):
    name: str
    workflow: Dict[str, Any]

class WorkflowRunRequest(BaseModel):
    prompt: str = ""
    width: int = 1024
    height: int = 1024
    type: str = "custom"
    fields: Dict[str, Any] = {}
    config: WorkflowConfig = WorkflowConfig()
    client_id: str = ""

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

BUILTIN_WORKFLOWS = {"Z-Image.json", "Z-Image-Enhance.json", "2511.json", "klein-enhance.json", "Flux2-Klein.json", "upscale.json"}
CUSTOM_WORKFLOW_FOLDER = "custom"
WORKFLOW_NAME_RE = re.compile(r"^(?:custom/)?[a-zA-Z0-9_\u4e00-\u9fff.\-]+\.json$")

def normalize_workflow_name(workflow_json):
    name = str(workflow_json or "").strip().replace("\\", "/")
    if not name or not WORKFLOW_NAME_RE.match(name):
        raise HTTPException(status_code=400, detail="无效的 workflow 文件名")
    return name

def resolve_workflow_path(workflow_json):
    name = normalize_workflow_name(workflow_json)
    workflow_root = os.path.abspath(WORKFLOW_DIR)
    path = os.path.abspath(os.path.join(WORKFLOW_DIR, *name.split("/")))
    if os.path.commonpath([workflow_root, path]) != workflow_root or not os.path.exists(path):
        raise HTTPException(status_code=404, detail=f"Workflow file not found: {name}")
    return path

def workflow_config_path(workflow_json):
    name = normalize_workflow_name(workflow_json)
    return os.path.abspath(os.path.join(WORKFLOW_DIR, *name.split("/"))).replace(".json", ".config.json")

def is_builtin_workflow(workflow_json):
    name = normalize_workflow_name(workflow_json)
    return "/" not in name and os.path.basename(name) in BUILTIN_WORKFLOWS

def is_custom_workflow(workflow_json):
    name = normalize_workflow_name(workflow_json)
    return name.startswith(f"{CUSTOM_WORKFLOW_FOLDER}/") and not os.path.basename(name).endswith(".config.json")

def require_custom_workflow(workflow_json):
    if not is_custom_workflow(workflow_json):
        raise HTTPException(status_code=400, detail="只能修改 workflows/custom 下的自定义工作流")
    return normalize_workflow_name(workflow_json)

def normalize_comfy_instance(value):
    text = str(value or "").strip()
    text = re.sub(r"^https?://", "", text).strip().strip("/")
    if not re.fullmatch(r"[a-zA-Z0-9_.:-]+", text):
        raise HTTPException(status_code=400, detail=f"ComfyUI 地址不合法：{value}")
    if ":" not in text:
        raise HTTPException(status_code=400, detail=f"ComfyUI 地址需要包含端口：{value}")
    return text

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

def normalize_canvas_kind(kind="classic"):
    return "smart" if str(kind or "").strip().lower() == "smart" else "classic"

def new_canvas(title="未命名画布", icon="layers", kind="classic"):
    timestamp = now_ms()
    canvas_kind = normalize_canvas_kind(kind)
    canvas = {
        "id": uuid.uuid4().hex,
        "title": (title or ("智能画布" if canvas_kind == "smart" else "未命名画布"))[:80],
        "icon": (icon or ("sparkles" if canvas_kind == "smart" else "🧩"))[:32],
        "kind": canvas_kind,
        "created_at": timestamp,
        "updated_at": timestamp,
        "nodes": [],
        "connections": [],
        "viewport": {"x": 0, "y": 0, "scale": 1},
        "logs": [],
        "settings": {},
    }
    save_canvas(canvas)
    return canvas

def normalize_canvas_record(canvas):
    canvas.setdefault("nodes", [])
    canvas.setdefault("connections", [])
    canvas.setdefault("viewport", {"x": 0, "y": 0, "scale": 1})
    canvas.setdefault("logs", [])
    canvas.setdefault("settings", {})
    canvas["kind"] = normalize_canvas_kind(canvas.get("kind"))
    canvas.setdefault("created_at", now_ms())
    canvas.setdefault("updated_at", canvas.get("created_at") or now_ms())
    return canvas

def load_canvas(canvas_id):
    path = canvas_path(canvas_id)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="画布不存在")
    with open(path, 'r', encoding='utf-8') as f:
        canvas = normalize_canvas_record(json.load(f))
    if canvas.get("deleted_at"):
        raise HTTPException(status_code=404, detail="画布已在回收站")
    return canvas

def load_canvas_any(canvas_id):
    path = canvas_path(canvas_id)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="画布不存在")
    with open(path, 'r', encoding='utf-8') as f:
        return normalize_canvas_record(json.load(f))

def canvas_record(data):
    kind = normalize_canvas_kind(data.get("kind"))
    return {
        "id": data.get("id"),
        "title": data.get("title", "智能画布" if kind == "smart" else "未命名画布"),
        "icon": data.get("icon", "sparkles" if kind == "smart" else "🧩"),
        "kind": kind,
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

def provider_key_env(provider_id):
    provider_id = (provider_id or "").strip().lower()
    if provider_id == "comfly":
        return "COMFLY_API_KEY"
    if provider_id == "modelscope":
        return "MODELSCOPE_API_KEY"
    return f"API_PROVIDER_{re.sub(r'[^A-Za-z0-9]', '_', provider_id).upper()}_KEY"

def mask_secret(value):
    if not value:
        return ""
    text = str(value)
    return f"••••••••{text[-4:] if len(text) > 4 else text}"

def model_list_from_values(values):
    deduped = []
    for value in values or []:
        item = str(value or "").strip()
        if item and item not in deduped:
            selected_model(item, item)
            deduped.append(item)
    return deduped

def normalize_endpoint_override(value):
    endpoint = str(value or "").strip()
    if not endpoint:
        return ""
    if re.match(r"^https?://", endpoint):
        parsed = urllib.parse.urlparse(endpoint)
        if not parsed.netloc:
            raise HTTPException(status_code=400, detail=f"Endpoint URL 不合法：{endpoint}")
        return endpoint.rstrip("/")
    if not endpoint.startswith("/"):
        endpoint = "/" + endpoint
    if ".." in endpoint.split("/"):
        raise HTTPException(status_code=400, detail="Endpoint 不能包含路径穿越")
    return endpoint.rstrip("/") or ""

def normalize_ms_loras(value):
    if not isinstance(value, dict):
        return {}
    normalized = {}
    for model, loras in value.items():
        raw_model = str(model or "").strip()
        if not raw_model:
            continue
        model_id = selected_model(raw_model, raw_model)
        if isinstance(loras, dict):
            normalized[model_id] = {str(k).strip(): v for k, v in loras.items() if str(k).strip()}
        elif isinstance(loras, list):
            normalized[model_id] = [item for item in loras if isinstance(item, (str, dict))]
    return normalized

def provider_endpoint_url(provider, kind="generation", fallback_base=""):
    key = "image_edit_endpoint" if kind == "edit" else "image_generation_endpoint"
    override = normalize_endpoint_override((provider or {}).get(key) or "")
    base = (fallback_base or (provider or {}).get("base_url") or "").strip().rstrip("/")
    if override and re.match(r"^https?://", override):
        return override
    if not base:
        raise HTTPException(status_code=400, detail=f"{(provider or {}).get('name') or 'API 平台'} 未配置 Base URL")
    if override:
        return f"{base}{override}" if override.startswith("/") else f"{base}/{override}"
    suffix = "/images/edits" if kind == "edit" else "/images/generations"
    return f"{base}{suffix}" if base.endswith("/v1") else f"{base}/v1{suffix}"

def default_api_providers():
    return [
        {
            "id": "comfly",
            "name": "Comfly",
            "base_url": AI_BASE_URL,
            "protocol": "openai",
            "enabled": True,
            "primary": True,
            "image_generation_endpoint": "",
            "image_edit_endpoint": "",
            "image_models": IMAGE_MODELS,
            "chat_models": CHAT_MODELS,
            "video_models": VIDEO_MODELS,
            "ms_loras": {},
            "ms_defaults_version": "",
        },
        {
            "id": "modelscope",
            "name": "ModelScope",
            "base_url": MODELSCOPE_CHAT_BASE_URL,
            "protocol": "openai",
            "enabled": True,
            "primary": False,
            "image_generation_endpoint": "",
            "image_edit_endpoint": "",
            "image_models": ["Tongyi-MAI/Z-Image-Turbo", "Qwen/Qwen-Image-Edit-2511", "black-forest-labs/FLUX.2-klein-9B"],
            "chat_models": MODELSCOPE_CHAT_MODELS,
            "video_models": [],
            "ms_loras": {},
            "ms_defaults_version": "1",
        },
    ]

def normalize_provider(item):
    provider_id = str(item.get("id") or "").strip().lower()
    if not PROVIDER_ID_RE.fullmatch(provider_id):
        raise HTTPException(status_code=400, detail=f"API 平台 ID 不合法：{provider_id or '(empty)'}")
    name = re.sub(r"\s+", " ", str(item.get("name") or provider_id).strip())[:60] or provider_id
    base_url = str(item.get("base_url") or "").strip().rstrip("/")
    if base_url and not re.match(r"^https?://", base_url):
        raise HTTPException(status_code=400, detail=f"{name} 的 Base URL 需要以 http:// 或 https:// 开头")
    protocol = str(item.get("protocol") or "openai").strip().lower()
    if protocol not in {"openai", "apimart"}:
        protocol = "openai"
    return {
        "id": provider_id,
        "name": name,
        "base_url": base_url,
        "protocol": protocol,
        "enabled": bool(item.get("enabled", True)),
        "primary": bool(item.get("primary", False)),
        "image_generation_endpoint": normalize_endpoint_override(item.get("image_generation_endpoint") or ""),
        "image_edit_endpoint": normalize_endpoint_override(item.get("image_edit_endpoint") or ""),
        "image_models": model_list_from_values(item.get("image_models") or []),
        "chat_models": model_list_from_values(item.get("chat_models") or []),
        "video_models": model_list_from_values(item.get("video_models") or []),
        "ms_loras": normalize_ms_loras(item.get("ms_loras") or {}),
        "ms_defaults_version": str(item.get("ms_defaults_version") or "")[:40],
    }

def merge_default_api_providers(providers):
    merged = [dict(item) for item in providers]
    for default in default_api_providers():
        current = next((item for item in merged if item.get("id") == default["id"]), None)
        if not current:
            merged.append(default)
            continue
        for key in ("name", "base_url", "protocol", "image_generation_endpoint", "image_edit_endpoint", "ms_defaults_version"):
            if not current.get(key):
                current[key] = default.get(key)
        for key in ("image_models", "chat_models", "video_models"):
            current[key] = model_list_from_values([*(current.get(key) or []), *(default.get(key) or [])])
        if not isinstance(current.get("ms_loras"), dict):
            current["ms_loras"] = {}
    if not any(item.get("primary") and item.get("enabled", True) for item in merged):
        for item in merged:
            if item.get("id") != "modelscope" and item.get("enabled", True):
                item["primary"] = True
                break
    return merged

def load_api_providers():
    defaults = default_api_providers()
    if not os.path.exists(API_PROVIDERS_FILE):
        return defaults
    try:
        with open(API_PROVIDERS_FILE, "r", encoding="utf-8") as f:
            raw = json.load(f)
        providers = [normalize_provider(item) for item in raw if isinstance(item, dict)]
        return merge_default_api_providers(providers or defaults)
    except HTTPException:
        raise
    except Exception as e:
        print(f"加载 API 平台配置失败: {e}")
        return defaults

def save_api_providers(providers):
    os.makedirs(DATA_DIR, exist_ok=True)
    normalized = [normalize_provider(item) for item in providers]
    seen_ids = set()
    for item in normalized:
        if item["id"] in seen_ids:
            raise HTTPException(status_code=400, detail=f"API 平台 ID 重复：{item['id']}")
        seen_ids.add(item["id"])
    primary_seen = False
    for item in normalized:
        if item.get("primary") and item.get("enabled", True) and not primary_seen:
            primary_seen = True
        else:
            item["primary"] = False
    with GLOBAL_CONFIG_LOCK:
        with open(API_PROVIDERS_FILE, "w", encoding="utf-8") as f:
            json.dump(normalized, f, ensure_ascii=False, indent=2)
    return normalized

def public_provider(provider):
    key = os.getenv(provider_key_env(provider["id"]), "")
    return {
        **provider,
        "has_key": bool(key),
        "key_preview": mask_secret(key),
        "key_env": provider_key_env(provider["id"]),
    }

def get_primary_provider_id(providers=None):
    providers = providers if providers is not None else load_api_providers()
    primary = next((p for p in providers if p.get("primary") and p.get("enabled", True)), None)
    if primary:
        return primary["id"]
    non_ms = next((p for p in providers if p.get("id") != "modelscope" and p.get("enabled", True)), None)
    return non_ms["id"] if non_ms else (providers[0]["id"] if providers else "comfly")

def get_api_provider(provider_id=""):
    providers = load_api_providers()
    target = (provider_id or "").strip().lower()
    if not target or not any(p["id"] == target for p in providers):
        target = get_primary_provider_id(providers)
    provider = next((p for p in providers if p["id"] == target), None)
    if not provider:
        raise HTTPException(status_code=400, detail=f"未找到 API 平台：{target}")
    if not provider.get("enabled", True):
        raise HTTPException(status_code=400, detail=f"API 平台已禁用：{provider.get('name') or target}")
    return provider

def get_api_provider_exact(provider_id):
    target = (provider_id or "").strip().lower()
    provider = next((p for p in load_api_providers() if p["id"] == target), None)
    if not provider:
        raise HTTPException(status_code=400, detail=f"未找到 API 平台：{target or '(empty)'}")
    if not provider.get("enabled", True):
        raise HTTPException(status_code=400, detail=f"API 平台已禁用：{provider.get('name') or target}")
    return provider

def provider_protocol(provider):
    return str((provider or {}).get("protocol") or "openai").strip().lower()

def is_apimart_provider(provider):
    base_url = str((provider or {}).get("base_url") or "").lower()
    return provider_protocol(provider) == "apimart" or "apimart.ai" in base_url

def env_quote(value):
    text = str(value or "")
    if not text or re.search(r"\s|#|['\"]", text):
        return '"' + text.replace("\\", "\\\\").replace('"', '\\"') + '"'
    return text

def update_env_values(updates):
    os.makedirs(os.path.dirname(API_ENV_FILE), exist_ok=True)
    lines = []
    if os.path.exists(API_ENV_FILE):
        with open(API_ENV_FILE, "r", encoding="utf-8-sig") as f:
            lines = f.read().splitlines()
    seen = set()
    next_lines = []
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in line:
            next_lines.append(line)
            continue
        key = line.split("=", 1)[0].strip()
        if key in updates:
            next_lines.append(f"{key}={env_quote(updates[key])}")
            os.environ[key] = str(updates[key] or "")
            seen.add(key)
        else:
            next_lines.append(line)
    for key, value in updates.items():
        if key not in seen:
            next_lines.append(f"{key}={env_quote(value)}")
            os.environ[key] = str(value or "")
    with open(API_ENV_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(next_lines).rstrip() + "\n")

def resolve_chat_provider(provider: str, model: str, ms_model: str, comfly_key: str = "", comfly_base: str = "", ms_key: str = "", ms_base: str = ""):
    if provider == "modelscope":
        clean_ms_key = modelscope_api_key(ms_key)
        if not clean_ms_key:
            raise HTTPException(status_code=400, detail="未配置 MODELSCOPE_API_KEY，请在 API/.env 中填写。")
        base = modelscope_base_url(ms_base, chat=True) if ms_base else MODELSCOPE_CHAT_BASE_URL
        hdrs = {"Authorization": f"Bearer {clean_ms_key}", "Content-Type": "application/json"}
        mdl = selected_model(ms_model or model, MODELSCOPE_CHAT_MODELS[0] if MODELSCOPE_CHAT_MODELS else "MiniMax/MiniMax-M2.7")
        return base, hdrs, mdl
    api_provider = get_api_provider(provider or "")
    base_root = (comfly_base if api_provider["id"] == "comfly" and comfly_base else api_provider.get("base_url") or AI_BASE_URL).rstrip("/")
    if not base_root:
        raise HTTPException(status_code=400, detail=f"{api_provider.get('name') or api_provider['id']} 未配置 Base URL")
    base = base_root if base_root.endswith("/v1") else base_root + "/v1"
    hdrs = api_headers(provider=api_provider, api_key=comfly_key if api_provider["id"] == "comfly" else "")
    mdl = selected_model(model, (api_provider.get("chat_models") or [CHAT_MODEL])[0])
    return base, hdrs, mdl

def api_headers(json_body=True, api_key="", provider=None):
    if provider:
        clean_key = (api_key or "").strip() or os.getenv(provider_key_env(provider["id"]), "").strip()
        if not clean_key:
            raise HTTPException(status_code=400, detail=f"未配置 {provider.get('name') or provider['id']} 的 API Key，请在 API 平台管理中填写。")
    else:
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
    if len(model) > 240 or any(ord(ch) < 32 or ord(ch) == 127 for ch in model):
        raise HTTPException(status_code=400, detail=f"模型名称不合法：{model}")
    return model

def text_from_chat_response(data):
    if isinstance(data, dict) and "data" in data and isinstance(data.get("data"), dict) and "choices" not in data:
        data = data["data"]
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

IMAGE_URL_KEYS = {
    "url",
    "image_url",
    "imageUrl",
    "image",
    "output",
    "output_url",
    "outputUrl",
    "download_url",
    "downloadUrl",
    "preview_url",
    "previewUrl",
    "src",
    "uri",
}
IMAGE_B64_KEYS = {"b64_json", "base64", "image_base64", "imageBase64"}
IMAGE_CONTAINER_KEYS = {
    "data",
    "result",
    "results",
    "images",
    "outputs",
    "items",
}
IMAGE_TASK_SUCCESS_STATUSES = {
    "SUCCESS",
    "SUCCEED",
    "SUCCEEDED",
    "COMPLETED",
    "COMPLETE",
    "DONE",
    "FINISHED",
    "FINISH",
    "OK",
    "READY",
}
IMAGE_TASK_FAILURE_STATUSES = {
    "FAILURE",
    "FAILED",
    "FAIL",
    "ERROR",
    "ERRORED",
    "CANCELED",
    "CANCELLED",
    "TIMEOUT",
    "TIMEDOUT",
    "REJECTED",
    "EXPIRED",
}

def _image_b64_from_data_url(value):
    text = str(value or "").strip()
    if text.startswith("data:image/") and ";base64," in text:
        return text.split(",", 1)[1]
    return ""

def _append_image_output(outputs, item):
    value = str((item or {}).get("value") or "").strip()
    kind = str((item or {}).get("type") or "").strip()
    if not value or not kind:
        return
    if not any(existing["type"] == kind and existing["value"] == value for existing in outputs):
        outputs.append({"type": kind, "value": value})

def _collect_image_output(value, outputs, key="", depth=0):
    if value is None or depth > 8:
        return
    key = str(key or "")
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return
        data_url_b64 = _image_b64_from_data_url(text)
        if data_url_b64:
            _append_image_output(outputs, {"type": "b64", "value": data_url_b64})
        elif key in IMAGE_B64_KEYS:
            _append_image_output(outputs, {"type": "b64", "value": text})
        elif key in IMAGE_URL_KEYS or key in IMAGE_CONTAINER_KEYS:
            if (
                text.startswith("http://")
                or text.startswith("https://")
                or text.startswith("/output/")
                or text.startswith("/assets/")
            ):
                _append_image_output(outputs, {"type": "url", "value": text})
        return
    if isinstance(value, list):
        for item in value:
            _collect_image_output(item, outputs, key=key, depth=depth + 1)
        return
    if isinstance(value, dict):
        for child_key, child_value in value.items():
            child_key = str(child_key or "")
            if child_key in IMAGE_URL_KEYS or child_key in IMAGE_B64_KEYS or child_key in IMAGE_CONTAINER_KEYS or key in IMAGE_CONTAINER_KEYS:
                _collect_image_output(child_value, outputs, key=child_key, depth=depth + 1)

def image_output_items(raw):
    outputs = []
    if isinstance(raw, dict):
        _collect_image_output(raw, outputs)
    elif isinstance(raw, list):
        _collect_image_output(raw, outputs, key="images")
    return outputs

def extract_image(data):
    if isinstance(data, dict) and isinstance(data.get("data"), dict) and isinstance(data["data"].get("data"), dict):
        data = data["data"]["data"]
    if isinstance(data, dict):
        images = data.get("data") or []
        if isinstance(images, list):
            for first in images:
                if not isinstance(first, dict):
                    continue
                if first.get("url"):
                    return {"type": "url", "value": first["url"]}
                if first.get("b64_json"):
                    return {"type": "b64", "value": first["b64_json"]}
        found = image_output_items(data)
        if found:
            return found[0]
        if not images:
            raise HTTPException(status_code=502, detail="生图接口没有返回图片数据")
    raise HTTPException(status_code=502, detail="无法识别生图接口返回格式")

def extract_task_id(data):
    if data.get("task_id"):
        return str(data["task_id"])
    if data.get("id") and str(data.get("id", "")).startswith("task"):
        return str(data["id"])
    nested = data.get("data")
    if isinstance(nested, list) and nested:
        first = nested[0]
        if isinstance(first, dict):
            return extract_task_id(first)
    nested = data.get("data")
    if isinstance(nested, dict):
        return extract_task_id(nested)
    return None

async def wait_for_image_task(client, task_id, api_key="", base_url="", provider=None):
    is_apimart = is_apimart_provider(provider)
    provider_base = (provider.get("base_url") if provider else "") or base_url or AI_BASE_URL
    base = safe_base_url(provider_base, AI_BASE_URL)
    task_url = f"{base}/tasks/{task_id}" if is_apimart and base.endswith("/v1") else f"{base}/v1/tasks/{task_id}" if is_apimart else f"{base}/images/tasks/{task_id}" if base.endswith("/v1") else f"{base}/v1/images/tasks/{task_id}"
    timeout = APIMART_IMAGE_TASK_TIMEOUT if is_apimart else IMAGE_TASK_TIMEOUT
    interval = APIMART_IMAGE_POLL_INTERVAL if is_apimart else IMAGE_POLL_INTERVAL
    initial_delay = APIMART_IMAGE_INITIAL_POLL_DELAY if is_apimart else 0
    deadline = time.monotonic() + timeout
    last_payload = {}
    while time.monotonic() < deadline:
        if initial_delay:
            await asyncio.sleep(min(initial_delay, max(0.0, deadline - time.monotonic())))
            initial_delay = 0
        if is_apimart:
            response = await httpx_request_with_connect_retries(
                client,
                "GET",
                task_url,
                headers=api_headers(api_key=api_key, provider=provider),
                label="APIMart image task poll",
            )
        else:
            response = await client.get(task_url, headers=api_headers(api_key=api_key, provider=provider))
        response.raise_for_status()
        last_payload = response.json()
        task_data = last_payload.get("data") if isinstance(last_payload.get("data"), dict) else last_payload
        status = str(task_data.get("status", "")).upper()
        if status in IMAGE_TASK_SUCCESS_STATUSES:
            return last_payload
        if not status and image_output_items(last_payload):
            return last_payload
        if status in IMAGE_TASK_FAILURE_STATUSES:
            error = task_data.get("error") if isinstance(task_data.get("error"), dict) else {}
            reason = (
                task_data.get("fail_reason")
                or task_data.get("message")
                or task_data.get("detail")
                or (error.get("message") if isinstance(error, dict) else task_data.get("error"))
                or last_payload.get("message")
                or "生图任务失败"
            )
            raise HTTPException(status_code=502, detail=f"生图任务失败：{reason}")
        await asyncio.sleep(min(interval, max(0.0, deadline - time.monotonic())))
    raise HTTPException(status_code=504, detail=f"生图任务超时（已等待 {int(timeout)} 秒），task_id={task_id}")

async def httpx_request_with_connect_retries(client, method, url, *, attempts=3, delay=0.8, label="upstream request", **kwargs):
    retryable = (httpx.ConnectError, httpx.ConnectTimeout, httpx.PoolTimeout)
    last_error = None
    for attempt in range(1, max(1, attempts) + 1):
        try:
            return await client.request(method, url, **kwargs)
        except retryable as exc:
            last_error = exc
            if attempt >= attempts:
                raise
            print(f"{label} connect retry {attempt}/{attempts}: {exc.__class__.__name__}: {str(exc)[:160]}")
            await asyncio.sleep(delay * attempt)
    raise last_error

def output_file_from_url(url):
    if not url or not url.startswith("/output/"):
        return None
    filename = os.path.basename(urllib.parse.unquote(url.split("?", 1)[0]))
    path = os.path.abspath(os.path.join(OUTPUT_DIR, filename))
    output_root = os.path.abspath(OUTPUT_DIR)
    if os.path.commonpath([output_root, path]) != output_root or not os.path.exists(path):
        return None
    return path

def local_asset_file_from_url(url):
    value = str(url or "").strip()
    parsed_path = urllib.parse.unquote(urllib.parse.urlparse(value).path)
    if parsed_path.startswith("/output/"):
        return output_file_from_url(parsed_path)
    if parsed_path.startswith("/static/assets/"):
        rel = parsed_path[len("/static/assets/"):]
        root = os.path.abspath(os.path.join(STATIC_DIR, "assets"))
    elif parsed_path.startswith("/assets/"):
        rel = parsed_path[len("/assets/"):]
        root = os.path.abspath(os.path.join(STATIC_DIR, "assets"))
    else:
        return None
    path = os.path.abspath(os.path.join(root, rel))
    if os.path.commonpath([root, path]) != root or not os.path.exists(path) or not os.path.isfile(path):
        return None
    return path

def content_type_for_path(path):
    ext = os.path.splitext(path)[1].lower()
    if ext in [".mp4", ".m4v"]:
        return "video/mp4"
    if ext == ".webm":
        return "video/webm"
    if ext == ".mov":
        return "video/quicktime"
    if ext in [".jpg", ".jpeg"]:
        return "image/jpeg"
    if ext == ".webp":
        return "image/webp"
    return "image/png"

def sanitize_asset_library_name(name, fallback="asset"):
    clean = re.sub(r"[\\/:*?\"<>|\x00-\x1f]+", "-", str(name or "").strip())
    clean = re.sub(r"\s+", " ", clean).strip(" .-_")
    return (clean or fallback)[:120]

def default_asset_library():
    return {
        "categories": [
            {"id": "cat_default_images", "name": "图片资产", "type": "image", "items": []}
        ]
    }

def normalize_asset_library(lib):
    if not isinstance(lib, dict):
        lib = default_asset_library()
    categories = []
    seen = set()
    for cat in lib.get("categories") or []:
        if not isinstance(cat, dict):
            continue
        cat_id = re.sub(r"[^a-zA-Z0-9_-]", "", str(cat.get("id") or ""))[:64]
        if not cat_id or cat_id in seen:
            cat_id = f"cat_{uuid.uuid4().hex[:12]}"
        seen.add(cat_id)
        items = []
        item_seen = set()
        for item in cat.get("items") or []:
            if not isinstance(item, dict):
                continue
            item_id = re.sub(r"[^a-zA-Z0-9_-]", "", str(item.get("id") or ""))[:64]
            url = str(item.get("url") or "").strip()
            if not item_id or item_id in item_seen or not url:
                item_id = f"asset_{uuid.uuid4().hex[:12]}"
            item_seen.add(item_id)
            items.append({
                "id": item_id,
                "name": sanitize_asset_library_name(item.get("name"), "asset"),
                "url": url,
                "created_at": int(item.get("created_at") or now_ms()),
            })
        categories.append({
            "id": cat_id,
            "name": sanitize_asset_library_name(cat.get("name"), "图片资产"),
            "type": "image",
            "items": items,
        })
    if not categories:
        categories = default_asset_library()["categories"]
    return {"categories": categories}

def load_asset_library():
    with ASSET_LIBRARY_LOCK:
        if not os.path.exists(ASSET_LIBRARY_FILE):
            lib = default_asset_library()
            with open(ASSET_LIBRARY_FILE, "w", encoding="utf-8") as f:
                json.dump(lib, f, ensure_ascii=False, indent=2)
            return lib
        try:
            with open(ASSET_LIBRARY_FILE, "r", encoding="utf-8") as f:
                return normalize_asset_library(json.load(f))
        except Exception:
            return default_asset_library()

def save_asset_library(lib):
    normalized = normalize_asset_library(lib)
    with ASSET_LIBRARY_LOCK:
        with open(ASSET_LIBRARY_FILE, "w", encoding="utf-8") as f:
            json.dump(normalized, f, ensure_ascii=False, indent=2)
    return normalized

def find_asset_category(lib, category_id):
    category_id = str(category_id or "").strip()
    return next((cat for cat in lib.get("categories", []) if cat.get("id") == category_id), None)

def all_asset_library_urls(lib):
    urls = set()
    for cat in lib.get("categories", []):
        for item in cat.get("items", []):
            if item.get("url"):
                urls.add(item["url"])
    return urls

def asset_library_relative_url(path):
    root = os.path.abspath(ASSET_ROOT_DIR)
    path = os.path.abspath(path)
    if os.path.commonpath([root, path]) != root:
        return ""
    rel = os.path.relpath(path, root).replace(os.sep, "/")
    return f"/assets/{rel}"

def remove_asset_library_file_if_unused(url, lib):
    if not url or url in all_asset_library_urls(lib):
        return
    parsed_path = urllib.parse.unquote(urllib.parse.urlparse(url).path)
    if not parsed_path.startswith("/assets/library/"):
        return
    rel = parsed_path[len("/assets/"):]
    path = os.path.abspath(os.path.join(ASSET_ROOT_DIR, rel))
    library_root = os.path.abspath(ASSET_LIBRARY_DIR)
    if os.path.commonpath([library_root, path]) == library_root and os.path.exists(path):
        try:
            os.remove(path)
        except OSError:
            pass

def parse_size_pair(size):
    match = re.fullmatch(r"\s*(\d+)\s*[xX*]\s*(\d+)\s*", str(size or ""))
    if not match:
        return 0, 0
    return int(match.group(1)), int(match.group(2))

def apimart_size_resolution(size):
    width, height = parse_size_pair(size)
    if not width or not height:
        raw = str(size or "").strip().lower()
        if raw in {"1k", "2k", "4k"}:
            return "1:1", raw
        if re.fullmatch(r"(auto|\d+\s*:\s*\d+)", raw):
            return raw.replace(" ", ""), "1k"
        return "1:1", "1k"
    long_edge = max(width, height)
    pixels = width * height
    resolution = "4k" if long_edge >= 3000 or pixels > 4_500_000 else "2k" if long_edge >= 1800 or pixels > 1_800_000 else "1k"
    common = [(1,1,"1:1"), (3,2,"3:2"), (2,3,"2:3"), (4,3,"4:3"), (3,4,"3:4"), (16,9,"16:9"), (9,16,"9:16"), (21,9,"21:9")]
    ratio = width / height
    best = min(common, key=lambda item: abs(ratio - item[0] / item[1]))
    return best[2], resolution

GPT_IMAGE2_MAX_EDGE = 3840
GPT_IMAGE2_MAX_PIXELS = 8_294_400
GPT_IMAGE2_MIN_PIXELS = 655_360

def is_gpt_image_2_model(model):
    return str(model or "").strip().lower() == "gpt-image-2"

def normalize_gpt_image_2_size(size):
    width, height = parse_size_pair(size)
    if not width or not height:
        return size or "auto"
    if width == height and (width > 2048 or width * height > 4_194_304):
        return "3840x2160"
    ratio = width / height
    if ratio > 3:
        width = height * 3
    elif ratio < 1 / 3:
        height = width * 3
    scale = min(1.0, GPT_IMAGE2_MAX_EDGE / max(width, height), (GPT_IMAGE2_MAX_PIXELS / max(1, width * height)) ** 0.5)
    width = max(16, int((width * scale) // 16) * 16)
    height = max(16, int((height * scale) // 16) * 16)
    if width * height < GPT_IMAGE2_MIN_PIXELS:
        grow = (GPT_IMAGE2_MIN_PIXELS / max(1, width * height)) ** 0.5
        width = int((width * grow + 15) // 16) * 16
        height = int((height * grow + 15) // 16) * 16
    return f"{width}x{height}"

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

def reference_to_data_url(ref, max_size=None):
    path = output_file_from_url(ref.get("url", ""))
    if not path:
        return ref.get("url", "")
    if max_size:
        try:
            with Image.open(path) as img:
                img.load()
                if max(img.size) > max_size:
                    img.thumbnail((max_size, max_size), Image.LANCZOS)
                has_alpha = img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)
                if has_alpha:
                    img = img.convert("RGBA")
                    fmt, mime = "PNG", "image/png"
                else:
                    img = img.convert("RGB")
                    fmt, mime = "JPEG", "image/jpeg"
                buf = BytesIO()
                if fmt == "JPEG":
                    img.save(buf, format=fmt, quality=88, optimize=True)
                else:
                    img.save(buf, format=fmt, optimize=True)
                encoded = base64.b64encode(buf.getvalue()).decode("ascii")
                return f"data:{mime};base64,{encoded}"
        except Exception as e:
            print(f"reference resize failed, fallback to raw: {e}")
    with open(path, "rb") as f:
        encoded = base64.b64encode(f.read()).decode("ascii")
    return f"data:{content_type_for_path(path)};base64,{encoded}"

def image_url_to_chat_part(url):
    value = str(url or "").strip()
    if not value:
        return None
    if value.startswith("data:image/") or re.match(r"^https?://", value):
        return {"type": "image_url", "image_url": {"url": value}}
    path = output_file_from_url(value)
    if not path:
        return None
    try:
        return {"type": "image_url", "image_url": {"url": reference_to_data_url({"url": value}, max_size=1536)}}
    except Exception as e:
        print(f"canvas llm image encode failed: {e}")
        return None

async def save_remote_video_to_output(url, prefix="video_"):
    if not url:
        return ""
    if url.startswith("/output/"):
        return url
    filename = f"{prefix}{uuid.uuid4().hex[:10]}.mp4"
    path = os.path.join(OUTPUT_DIR, filename)
    try:
        timeout = httpx.Timeout(connect=20.0, read=VIDEO_POLL_TIMEOUT, write=60.0, pool=20.0)
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            response = await client.get(url)
            response.raise_for_status()
            content_type = (response.headers.get("Content-Type") or "").lower()
            ext = os.path.splitext(urllib.parse.urlparse(url).path)[1].lower()
            if ext in {".mp4", ".webm", ".mov", ".m4v"}:
                filename = filename[:-4] + ext
                path = os.path.join(OUTPUT_DIR, filename)
            elif "webm" in content_type:
                filename = filename[:-4] + ".webm"
                path = os.path.join(OUTPUT_DIR, filename)
            elif "quicktime" in content_type or "mov" in content_type:
                filename = filename[:-4] + ".mov"
                path = os.path.join(OUTPUT_DIR, filename)
            with open(path, "wb") as f:
                f.write(response.content)
            return f"/output/{filename}"
    except Exception as e:
        print(f"保存上游视频失败: {e}")
        return url

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

async def generate_modelscope_provider_image(prompt, size, model, reference_images=None, provider=None):
    clean_token = os.getenv(provider_key_env("modelscope"), "").strip() or MODELSCOPE_API_KEY.strip()
    if not clean_token:
        raise HTTPException(status_code=400, detail="未配置 ModelScope API Key，请在 API 平台管理中填写。")
    width, height = parse_size_pair(size)
    refs = [reference_to_data_url(ref, max_size=1536) for ref in (reference_images or [])[:4] if ref.get("url")]
    base_root = ((provider or {}).get("base_url") or MODELSCOPE_CHAT_BASE_URL).rstrip("/")
    api_root = base_root if base_root.endswith("/v1") else f"{base_root}/v1"
    headers = {
        "Authorization": f"Bearer {clean_token}",
        "Content-Type": "application/json",
        "X-ModelScope-Async-Mode": "true",
    }
    selected = selected_model(model, "Tongyi-MAI/Z-Image-Turbo")
    body = {"model": selected, "prompt": prompt.strip()}
    if width and height:
        body.update({"width": width, "height": height, "size": f"{width}x{height}"})
    if refs:
        body["image_url"] = refs
    loras = ((provider or {}).get("ms_loras") or {}).get(selected)
    if loras:
        body["loras"] = loras
    async with httpx.AsyncClient(timeout=AI_REQUEST_TIMEOUT) as client:
        response = await client.post(provider_endpoint_url(provider or {"base_url": api_root}, "generation", fallback_base=api_root), headers=headers, json=body)
        response.raise_for_status()
        raw = response.json()
        task_id = raw.get("task_id")
        if not task_id:
            return extract_image(raw), raw
        deadline = time.monotonic() + AI_REQUEST_TIMEOUT
        last_payload = raw
        while time.monotonic() < deadline:
            await asyncio.sleep(IMAGE_POLL_INTERVAL)
            result = await client.get(f"{api_root}/tasks/{task_id}", headers={**headers, "X-ModelScope-Task-Type": "image_generation"})
            result.raise_for_status()
            data = result.json()
            last_payload = data
            status = str(data.get("task_status") or "").upper()
            if status == "SUCCEED":
                images = data.get("output_images") or []
                if not images:
                    raise HTTPException(status_code=502, detail=f"ModelScope 成功但没有返回图片：{data}")
                return {"type": "url", "value": images[0]}, data
            if status in {"FAILED", "FAIL", "ERROR", "CANCELED", "CANCELLED", "TIMEOUT", "REVOKED"}:
                detail = data.get("error_info") or data.get("message") or data.get("detail") or str(data)
                raise HTTPException(status_code=502, detail=f"ModelScope 任务失败：{detail}")
        raise HTTPException(status_code=504, detail=f"ModelScope 生图任务超时：{last_payload}")

async def generate_ai_image(prompt, size, quality, model, reference_images=None, api_key="", base_url="", extra_fields=None, provider_id=""):
    provider = get_api_provider(provider_id or "comfly")
    if provider["id"] == "modelscope":
        return await generate_modelscope_provider_image(prompt, size, model, reference_images, provider)
    refs = [ref for ref in (reference_images or []) if ref.get("url")]
    is_apimart = is_apimart_provider(provider)
    if is_gpt_image_2_model(model) and not is_apimart:
        size = normalize_gpt_image_2_size(size)
    base = (base_url if provider["id"] == "comfly" and base_url else provider.get("base_url") or AI_BASE_URL).rstrip("/")
    if not base:
        raise HTTPException(status_code=400, detail=f"{provider.get('name') or provider['id']} 未配置 Base URL")
    gen_url = provider_endpoint_url(provider, "generation", fallback_base=base)
    edit_url = provider_endpoint_url(provider, "edit", fallback_base=base)
    mask_refs = [ref for ref in refs if str(ref.get("role") or "").strip().lower() == "mask" or str(ref.get("name") or "").lower().endswith("_mask.png")]
    image_refs = [ref for ref in refs if ref not in mask_refs]
    request_fields = {"model": model, "prompt": prompt, "response_format": "url", "n": "1"}
    if size:
        request_fields["size"] = size
    if quality:
        request_fields["quality"] = quality
    for key, value in (extra_fields or {}).items():
        if value not in (None, ""):
            request_fields[key] = str(value)
    request_timeout = httpx.Timeout(connect=20.0, read=600.0, write=120.0, pool=20.0) if (is_apimart or is_gpt_image_2_model(model)) else AI_REQUEST_TIMEOUT
    async with httpx.AsyncClient(timeout=request_timeout) as client:
        if is_apimart:
            apimart_size, resolution = apimart_size_resolution(size)
            body = {
                "model": model,
                "prompt": prompt,
                "n": 1,
                "size": apimart_size,
                "resolution": resolution,
                "official_fallback": False,
            }
            if image_refs:
                body["image_urls"] = [reference_to_data_url(ref, max_size=1536) for ref in image_refs[:14]]
            response = await httpx_request_with_connect_retries(
                client,
                "POST",
                gen_url,
                headers=api_headers(api_key=api_key if provider["id"] == "comfly" else "", provider=provider),
                json=body,
                label="APIMart image generation submit",
            )
        elif is_gpt_image_2_model(model) and not mask_refs:
            body = {"model": model, "prompt": prompt, "size": size}
            if quality:
                body["quality"] = quality
            if image_refs:
                body["image"] = [reference_to_data_url(ref, max_size=1536) for ref in image_refs[:4]]
            response = await client.post(gen_url, headers=api_headers(api_key=api_key if provider["id"] == "comfly" else "", provider=provider), json=body)
        elif image_refs:
            files = []
            opened = []
            edit_failed = None
            try:
                for ref in image_refs[:4]:
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
                response = await client.post(edit_url, headers=api_headers(json_body=False, api_key=api_key if provider["id"] == "comfly" else "", provider=provider), data=request_fields, files=files)
                if response.status_code >= 400:
                    edit_failed = f"{response.status_code}: {response.text[:500]}"
                    response = None
            finally:
                for fh in opened:
                    fh.close()
            if response is None:
                print(f"/images/edits failed ({edit_failed}) → 回退到 /images/generations + image JSON")
                body = {**request_fields, "n": 1, "image": [reference_to_data_url(ref, max_size=1536) for ref in image_refs[:4]]}
                response = await client.post(gen_url, headers=api_headers(api_key=api_key if provider["id"] == "comfly" else "", provider=provider), json=body)
        else:
            json_fields = {**request_fields, "n": 1}
            response = await client.post(
                gen_url,
                headers=api_headers(api_key=api_key if provider["id"] == "comfly" else "", provider=provider),
                json=json_fields,
            )
        response.raise_for_status()
        raw = response.json()
        try:
            return extract_image(raw), raw
        except HTTPException:
            task_id = extract_task_id(raw)
            if not task_id:
                raise
        task_result = await wait_for_image_task(client, task_id, api_key=api_key if provider["id"] == "comfly" else "", base_url=base, provider=provider)
        return extract_image(task_result), task_result

FLATLAY_TARGET_RULES = {
    "auto": {
        "vision": "如果画面里同时出现上装和下装，只能选视觉上最主要、最居中、最突出的一件，绝不允许输出组合。",
        "generate": "如果原图里还有其他搭配，也只能围绕该短语代表的一件主单品生成。禁止把另一件衣服、整套穿搭或多件组合一起生成。",
    },
    "upper": {
        "vision": "只允许从上装里选一件主单品，例如上衣、衬衫、针织衫、背心、卫衣、外套。即使画面里同时有裤子或裙子，也不要输出下装。",
        "generate": "该批次已指定为上装。只保留一件上装主单品，禁止生成裤子、半裙、短裙、长裙、连衣裙或任何下装。",
    },
    "lower": {
        "vision": "只允许从下装里选一件主单品，例如长裤、短裤、半裙、长裙。即使画面里同时有上衣，也不要输出上装。",
        "generate": "该批次已指定为下装。只保留一件下装主单品，禁止生成衬衫、针织衫、外套、背心、上衣或任何上装。",
    },
    "onepiece": {
        "vision": "只允许从连身装里选一件主单品，例如连衣裙、连体裤、背带裙。不要输出分体的上装或下装。",
        "generate": "该批次已指定为连身装。只保留一件连身主单品，例如连衣裙或连体裤。禁止生成上装加下装的分体搭配。",
    },
}

FLATLAY_PROMPT_PRIMARY = (
    "根据用户模特展示图里的{phrase}，生成用于创建高质量平铺单品图。"
    "生成一张新的商品图，这张图要在纯白背景上，并排展示该单品的正面和背面平铺效果。"
    "构图规范：正面视图必须在左侧，背面视图必须在右侧，两者并排居中。"
    "背景统一：永远是纯白色、无缝、无阴影的背景。"
    "元素排除：必须移除原图中的模特、搭配的其他衣物、鞋子和配饰，只保留目标单品。"
    "要求尽量还原原图单品的版型、材质、纹理、颜色和关键细节，但不要生成多余搭配。"
)
FLATLAY_PROMPT_FALLBACKS = [
    "请把模特图里的{phrase}单独提取出来，重新生成一张白底平铺单品图。正面在左，背面在右，并排居中，背景纯白无阴影。只保留目标单品，不要模特，不要搭配，不要配饰。",
    "围绕模特图中的{phrase}创建商品级平铺图，输出一张左右双视图图像。左侧为正面，右侧为背面，纯白背景，去除模特与其他服饰，只保留该单品。",
]

def flatlay_connect():
    os.makedirs(DATA_DIR, exist_ok=True)
    conn = sqlite3.connect(FLATLAY_DB)
    conn.row_factory = sqlite3.Row
    return conn

def flatlay_json(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))

def normalize_flatlay_category(value):
    category = (value or "auto").strip().lower()
    if category not in FLATLAY_TARGET_RULES:
        raise HTTPException(status_code=400, detail=f"不支持的平面图品类：{category}")
    return category

def normalize_flatlay_rmbg_provider(value):
    provider = (value or RMBG_PROVIDER or "none").strip().lower()
    aliases = {"off": "none", "disabled": "none", "local": "local_birefnet", "removebg": "remove_bg"}
    provider = aliases.get(provider, provider)
    if provider not in {"none", "local_birefnet", "remove_bg"}:
        raise HTTPException(status_code=400, detail=f"不支持的去底 provider：{provider}")
    return provider

def normalize_flatlay_rmbg_variant(value):
    variant = (value or RMBG_DEFAULT_VARIANT or "lite").strip().lower()
    if variant not in {"lite", "base"}:
        raise HTTPException(status_code=400, detail=f"不支持的去底模型：{variant}")
    return variant

def init_flatlay_db():
    with FLATLAY_LOCK:
        conn = flatlay_connect()
        try:
            conn.executescript(
                """
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS flatlay_batches (
                    id TEXT PRIMARY KEY,
                    title TEXT,
                    target_category TEXT,
                    vision_model TEXT,
                    generate_model TEXT,
                    size TEXT,
                    quality TEXT,
                    rmbg_provider TEXT,
                    rmbg_variant TEXT,
                    status TEXT,
                    created_at REAL,
                    updated_at REAL
                );
                CREATE TABLE IF NOT EXISTS flatlay_items (
                    id TEXT PRIMARY KEY,
                    batch_id TEXT NOT NULL,
                    item_index INTEGER NOT NULL,
                    source_json TEXT NOT NULL,
                    status TEXT NOT NULL,
                    phrase TEXT,
                    prompt TEXT,
                    rerun_mode TEXT DEFAULT 'full',
                    combined_url TEXT,
                    rmbg_url TEXT,
                    front_url TEXT,
                    back_url TEXT,
                    error_message TEXT,
                    attempts INTEGER DEFAULT 0,
                    created_at REAL,
                    updated_at REAL,
                    started_at REAL,
                    completed_at REAL
                );
                CREATE TABLE IF NOT EXISTS flatlay_steps (
                    id TEXT PRIMARY KEY,
                    item_id TEXT NOT NULL,
                    step_name TEXT NOT NULL,
                    status TEXT NOT NULL,
                    detail_json TEXT,
                    error_message TEXT,
                    started_at REAL,
                    completed_at REAL
                );
                CREATE INDEX IF NOT EXISTS idx_flatlay_items_batch ON flatlay_items(batch_id, item_index);
                CREATE INDEX IF NOT EXISTS idx_flatlay_items_status ON flatlay_items(status);
                CREATE INDEX IF NOT EXISTS idx_flatlay_steps_item ON flatlay_steps(item_id, started_at);
                """
            )
            item_columns = {row["name"] for row in conn.execute("PRAGMA table_info(flatlay_items)").fetchall()}
            if "rerun_mode" not in item_columns:
                conn.execute("ALTER TABLE flatlay_items ADD COLUMN rerun_mode TEXT DEFAULT 'full'")
            conn.commit()
        finally:
            conn.close()

def recover_flatlay_state():
    with FLATLAY_LOCK:
        conn = flatlay_connect()
        try:
            now = time.time()
            conn.execute(
                """
                UPDATE flatlay_items
                SET status='pending', updated_at=?, error_message='Recovered after server restart.'
                WHERE status IN ('analyzing', 'generating', 'rmbg', 'splitting', 'running')
                """,
                (now,),
            )
            conn.execute(
                """
                UPDATE flatlay_batches
                SET status='paused', updated_at=?
                WHERE status='running'
                """,
                (now,),
            )
            conn.commit()
        finally:
            conn.close()

def normalize_flatlay_image(image: FlatlayImage):
    item = image.model_dump()
    url = (item.get("url") or "").strip()
    if not output_file_from_url(url):
        raise HTTPException(status_code=400, detail=f"图片必须先上传到本地输出目录：{url}")
    return {
        "id": (item.get("id") or uuid.uuid4().hex)[:80],
        "url": url,
        "name": (item.get("name") or os.path.basename(url))[:180],
    }

def flatlay_counts_for_conn(conn, batch_id):
    rows = conn.execute(
        "SELECT status, COUNT(*) AS count FROM flatlay_items WHERE batch_id=? GROUP BY status",
        (batch_id,),
    ).fetchall()
    counts = {row["status"]: int(row["count"]) for row in rows}
    total = sum(counts.values())
    processing = sum(counts.get(key, 0) for key in ["analyzing", "generating", "rmbg", "splitting", "running"])
    return {
        "total": total,
        "pending": counts.get("pending", 0),
        "processing": processing,
        "completed": counts.get("completed", 0),
        "failed": counts.get("failed", 0),
    }

def flatlay_batch_record(row, counts=None):
    data = dict(row)
    data["counts"] = counts or {"total": 0, "pending": 0, "processing": 0, "completed": 0, "failed": 0}
    return data

def flatlay_item_record(row):
    data = dict(row)
    try:
        data["source_image"] = json.loads(data.pop("source_json") or "{}")
    except Exception:
        data["source_image"] = {}
    return data

def flatlay_step_record(row):
    data = dict(row)
    try:
        data["detail"] = json.loads(data.pop("detail_json") or "{}")
    except Exception:
        data["detail"] = {}
    return data

def list_flatlay_batches(limit=50):
    limit = max(1, min(int(limit or 50), 100))
    with FLATLAY_LOCK:
        conn = flatlay_connect()
        try:
            rows = conn.execute(
                "SELECT * FROM flatlay_batches ORDER BY updated_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
            return [flatlay_batch_record(row, flatlay_counts_for_conn(conn, row["id"])) for row in rows]
        finally:
            conn.close()

def get_flatlay_detail(batch_id):
    with FLATLAY_LOCK:
        conn = flatlay_connect()
        try:
            batch = conn.execute("SELECT * FROM flatlay_batches WHERE id=?", (batch_id,)).fetchone()
            if not batch:
                raise HTTPException(status_code=404, detail="平面图批次不存在")
            items = conn.execute(
                "SELECT * FROM flatlay_items WHERE batch_id=? ORDER BY item_index ASC",
                (batch_id,),
            ).fetchall()
            item_ids = [row["id"] for row in items]
            steps = []
            if item_ids:
                placeholders = ",".join("?" for _ in item_ids)
                steps = conn.execute(
                    f"SELECT * FROM flatlay_steps WHERE item_id IN ({placeholders}) ORDER BY started_at ASC",
                    item_ids,
                ).fetchall()
            return {
                "batch": flatlay_batch_record(batch, flatlay_counts_for_conn(conn, batch_id)),
                "items": [flatlay_item_record(row) for row in items],
                "steps": [flatlay_step_record(row) for row in steps],
            }
        finally:
            conn.close()

def create_flatlay_batch(payload: FlatlayCreateRequest):
    images = [normalize_flatlay_image(item) for item in payload.images]
    if not images:
        raise HTTPException(status_code=400, detail="请先上传模特图")
    if len(images) > 500:
        raise HTTPException(status_code=400, detail="单个平面图批次最多 500 张图片")
    title = (payload.title or "Flatlay batch").strip()[:120] or "Flatlay batch"
    category = normalize_flatlay_category(payload.target_category)
    vision_model = selected_model(payload.vision_model or FLATLAY_VISION_MODEL, FLATLAY_VISION_MODEL)
    generate_model = selected_model(payload.generate_model or FLATLAY_GENERATE_MODEL, FLATLAY_GENERATE_MODEL)
    provider = normalize_flatlay_rmbg_provider(payload.rmbg_provider)
    variant = normalize_flatlay_rmbg_variant(payload.rmbg_variant)
    batch_id = f"fl_{time.strftime('%Y%m%d')}_{uuid.uuid4().hex[:8]}"
    now = time.time()
    with FLATLAY_LOCK:
        conn = flatlay_connect()
        try:
            conn.execute(
                """
                INSERT INTO flatlay_batches(
                    id, title, target_category, vision_model, generate_model, size, quality,
                    rmbg_provider, rmbg_variant, status, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
                """,
                (batch_id, title, category, vision_model, generate_model, payload.size, payload.quality, provider, variant, now, now),
            )
            for index, image in enumerate(images, start=1):
                conn.execute(
                    """
                    INSERT INTO flatlay_items(
                        id, batch_id, item_index, source_json, status, phrase, prompt, rerun_mode,
                        combined_url, rmbg_url, front_url, back_url, error_message, attempts,
                        created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, 'pending', NULL, NULL, 'full', NULL, NULL, NULL, NULL, NULL, 0, ?, ?)
                    """,
                    (f"fli_{uuid.uuid4().hex[:12]}", batch_id, index, flatlay_json(image), now, now),
                )
            conn.commit()
        finally:
            conn.close()
    return batch_id

def set_flatlay_batch_status(batch_id, status):
    with FLATLAY_LOCK:
        conn = flatlay_connect()
        try:
            row = conn.execute("SELECT id FROM flatlay_batches WHERE id=?", (batch_id,)).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="平面图批次不存在")
            conn.execute("UPDATE flatlay_batches SET status=?, updated_at=? WHERE id=?", (status, time.time(), batch_id))
            conn.commit()
        finally:
            conn.close()

def prepare_flatlay_run(batch_id):
    with FLATLAY_LOCK:
        conn = flatlay_connect()
        try:
            batch = conn.execute("SELECT * FROM flatlay_batches WHERE id=?", (batch_id,)).fetchone()
            if not batch:
                raise HTTPException(status_code=404, detail="平面图批次不存在")
            counts = flatlay_counts_for_conn(conn, batch_id)
            if counts["pending"] == 0:
                final_status = "failed" if counts["failed"] and not counts["completed"] else ("partial" if counts["failed"] else "completed")
                conn.execute("UPDATE flatlay_batches SET status=?, updated_at=? WHERE id=?", (final_status, time.time(), batch_id))
                conn.commit()
                return False
            conn.execute("UPDATE flatlay_batches SET status='running', updated_at=? WHERE id=?", (time.time(), batch_id))
            conn.commit()
            return True
        finally:
            conn.close()

def claim_next_flatlay_item(batch_id):
    with FLATLAY_LOCK:
        conn = flatlay_connect()
        try:
            batch = conn.execute("SELECT * FROM flatlay_batches WHERE id=?", (batch_id,)).fetchone()
            if not batch or batch["status"] != "running":
                return None, None
            item = conn.execute(
                """
                SELECT * FROM flatlay_items
                WHERE batch_id=? AND status='pending'
                ORDER BY item_index ASC
                LIMIT 1
                """,
                (batch_id,),
            ).fetchone()
            if not item:
                return dict(batch), None
            now = time.time()
            conn.execute(
                """
                UPDATE flatlay_items
                SET status='running', attempts=attempts+1, started_at=?, updated_at=?, error_message=NULL
                WHERE id=?
                """,
                (now, now, item["id"]),
            )
            conn.execute("UPDATE flatlay_batches SET updated_at=? WHERE id=?", (now, batch_id))
            conn.commit()
            item = conn.execute("SELECT * FROM flatlay_items WHERE id=?", (item["id"],)).fetchone()
            return dict(batch), flatlay_item_record(item)
        finally:
            conn.close()

def flatlay_update_item(item_id, **fields):
    if not fields:
        return
    fields["updated_at"] = time.time()
    names = list(fields.keys())
    values = [fields[name] for name in names]
    assignments = ", ".join(f"{name}=?" for name in names)
    with FLATLAY_LOCK:
        conn = flatlay_connect()
        try:
            conn.execute(f"UPDATE flatlay_items SET {assignments} WHERE id=?", [*values, item_id])
            row = conn.execute("SELECT batch_id FROM flatlay_items WHERE id=?", (item_id,)).fetchone()
            if row:
                conn.execute("UPDATE flatlay_batches SET updated_at=? WHERE id=?", (time.time(), row["batch_id"]))
            conn.commit()
        finally:
            conn.close()

def begin_flatlay_step(item_id, step_name, detail=None):
    step_id = f"fls_{uuid.uuid4().hex[:12]}"
    with FLATLAY_LOCK:
        conn = flatlay_connect()
        try:
            conn.execute(
                """
                INSERT INTO flatlay_steps(id, item_id, step_name, status, detail_json, error_message, started_at, completed_at)
                VALUES (?, ?, ?, 'running', ?, NULL, ?, NULL)
                """,
                (step_id, item_id, step_name, flatlay_json(detail or {}), time.time()),
            )
            conn.commit()
        finally:
            conn.close()
    return step_id

def finish_flatlay_step(step_id, detail=None, error_message=None):
    with FLATLAY_LOCK:
        conn = flatlay_connect()
        try:
            conn.execute(
                """
                UPDATE flatlay_steps
                SET status=?, detail_json=?, error_message=?, completed_at=?
                WHERE id=?
                """,
                ("failed" if error_message else "completed", flatlay_json(detail or {}), error_message, time.time(), step_id),
            )
            conn.commit()
        finally:
            conn.close()

def finalize_flatlay_if_idle(batch_id):
    with FLATLAY_LOCK:
        conn = flatlay_connect()
        try:
            batch = conn.execute("SELECT status FROM flatlay_batches WHERE id=?", (batch_id,)).fetchone()
            if not batch:
                return
            counts = flatlay_counts_for_conn(conn, batch_id)
            if batch["status"] == "running" and counts["pending"] == 0 and counts["processing"] == 0:
                status = "failed" if counts["failed"] and not counts["completed"] else ("partial" if counts["failed"] else "completed")
                conn.execute("UPDATE flatlay_batches SET status=?, updated_at=? WHERE id=?", (status, time.time(), batch_id))
                conn.commit()
        finally:
            conn.close()

def reset_flatlay_failed_items(batch_id):
    with FLATLAY_LOCK:
        conn = flatlay_connect()
        try:
            row = conn.execute("SELECT id FROM flatlay_batches WHERE id=?", (batch_id,)).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="平面图批次不存在")
            conn.execute(
                """
                UPDATE flatlay_items
                SET status='pending', error_message=NULL, completed_at=NULL, updated_at=?
                WHERE batch_id=? AND status='failed'
                """,
                (time.time(), batch_id),
            )
            conn.commit()
        finally:
            conn.close()

def reset_flatlay_item(item_id, mode="generation"):
    rerun_mode = "full" if mode == "full" else "generation"
    with FLATLAY_LOCK:
        conn = flatlay_connect()
        try:
            row = conn.execute("SELECT batch_id FROM flatlay_items WHERE id=?", (item_id,)).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="平面图任务不存在")
            phrase_sql = ", phrase=NULL" if rerun_mode == "full" else ""
            conn.execute(
                f"""
                UPDATE flatlay_items
                SET status='pending', rerun_mode=?, prompt=NULL, combined_url=NULL, rmbg_url=NULL,
                    front_url=NULL, back_url=NULL, error_message=NULL, completed_at=NULL, updated_at=?{phrase_sql}
                WHERE id=?
                """,
                (rerun_mode, time.time(), item_id),
            )
            conn.commit()
            return row["batch_id"]
        finally:
            conn.close()

def update_flatlay_phrase(item_id, phrase):
    clean = re.sub(r"[\r\n。,.，、；;]+", "", (phrase or "").strip())[:120]
    if not clean:
        raise HTTPException(status_code=400, detail="单品短语不能为空")
    with FLATLAY_LOCK:
        conn = flatlay_connect()
        try:
            row = conn.execute("SELECT batch_id FROM flatlay_items WHERE id=?", (item_id,)).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="平面图任务不存在")
            conn.execute("UPDATE flatlay_items SET phrase=?, updated_at=? WHERE id=?", (clean, time.time(), item_id))
            conn.commit()
            return row["batch_id"]
        finally:
            conn.close()

def flatlay_vision_prompt(category):
    rule = FLATLAY_TARGET_RULES[category]["vision"]
    return (
        "请识别模特图里最主要的一件服装，并只输出一个单品短语。"
        f"{rule}"
        "输出规则：1. 只能输出一件衣服，不能输出两件或多件。"
        "2. 禁止出现“和”“及”“与”“+”“/”“套装”“两件”“搭配”等组合表达。"
        "3. 不要输出颜色，不要输出解释，不要加标点，不要换行。"
        "4. 输出长度控制在 2 到 10 个字之间。"
        "5. 如果不确定，也必须只选最可能的一件主单品。"
    )

def flatlay_prompt_candidates(phrase, category):
    suffix = FLATLAY_TARGET_RULES[category]["generate"]
    prompts = [FLATLAY_PROMPT_PRIMARY, *FLATLAY_PROMPT_FALLBACKS]
    return [f"{prompt.format(phrase=phrase.strip())}{suffix}" for prompt in prompts]

async def flatlay_describe_phrase(source_image, category, model, api_key="", base_url=""):
    data_url = reference_to_data_url(source_image)
    if not data_url:
        raise HTTPException(status_code=400, detail="源图不存在，无法识别单品")
    payload = {
        "model": model,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": data_url}},
                {"type": "text", "text": flatlay_vision_prompt(category)},
            ],
        }],
        "max_tokens": 80,
    }
    async with httpx.AsyncClient(timeout=AI_REQUEST_TIMEOUT) as client:
        response = await client.post(
            f"{comfly_base_url(base_url)}/v1/chat/completions",
            headers=api_headers(api_key=api_key),
            json=payload,
        )
        response.raise_for_status()
        raw = response.json()
    phrase = text_from_chat_response(raw).strip()
    phrase = re.sub(r"[\r\n。,.，、；;]+", "", phrase)[:120]
    if not phrase:
        raise HTTPException(status_code=502, detail="视觉模型没有返回单品短语")
    return phrase, raw

def flatlay_save_bytes(data, prefix="flatlay_", ext=".png"):
    filename = f"{prefix}{uuid.uuid4().hex[:10]}{ext}"
    path = os.path.join(OUTPUT_DIR, filename)
    with open(path, "wb") as f:
        f.write(data)
    return f"/output/{filename}"

def flatlay_image_bytes(url):
    path = output_file_from_url(url)
    if not path:
        raise HTTPException(status_code=400, detail=f"无法读取本地图片：{url}")
    with open(path, "rb") as f:
        return f.read(), os.path.basename(path), content_type_for_path(path)

def split_flatlay_front_back(image_bytes):
    with Image.open(BytesIO(image_bytes)) as source:
        width, height = source.size
        half = width // 2
        front = source.crop((0, 0, half, height))
        back = source.crop((half, 0, width, height))
        front_buffer = BytesIO()
        back_buffer = BytesIO()
        front.save(front_buffer, format="PNG")
        back.save(back_buffer, format="PNG")
        return front_buffer.getvalue(), back_buffer.getvalue()

async def flatlay_remove_background(image_bytes, filename, provider, variant, api_key="", base_url=""):
    provider = normalize_flatlay_rmbg_provider(provider)
    if provider == "none":
        return image_bytes, "image/png", {"provider": "none"}
    clean_key = (api_key or RMBG_API_KEY or "").strip()
    if provider == "local_birefnet":
        base = (base_url or RMBG_LOCAL_BASE_URL or "").strip().rstrip("/")
        if not base:
            raise HTTPException(status_code=400, detail="未配置本地 RMBG_BASE_URL")
        headers = {"Authorization": f"Bearer {clean_key}"} if clean_key else {}
        endpoint = f"{base}/v1/remove-background"
        files = {"image": (filename or "combined.png", image_bytes, content_type_for_path(filename or "combined.png"))}
        data = {"model_variant": normalize_flatlay_rmbg_variant(variant)}
    else:
        base = (base_url or RMBG_BASE_URL or "").strip().rstrip("/")
        if not base:
            raise HTTPException(status_code=400, detail="未配置 remove.bg/RMBG Base URL")
        parsed = urllib.parse.urlparse(base)
        is_remove_bg = "remove.bg" in parsed.netloc
        if is_remove_bg:
            endpoint = base if base.endswith("removebg") or base.endswith("v1.0/removebg") else f"{base}/v1.0/removebg"
            headers = {"X-Api-Key": clean_key} if clean_key else {}
            files = {"image_file": (filename or "combined.png", image_bytes, content_type_for_path(filename or "combined.png"))}
            data = {"size": "full"}
        else:
            endpoint = base if base.endswith("remove-background") or base.endswith("v1/remove-background") else f"{base}/v1/remove-background"
            headers = {"Authorization": f"Bearer {clean_key}"} if clean_key else {}
            files = {"image": (filename or "combined.png", image_bytes, content_type_for_path(filename or "combined.png"))}
            data = None
    async with httpx.AsyncClient(timeout=AI_REQUEST_TIMEOUT) as client:
        response = await client.post(endpoint, headers=headers, files=files, data=data)
        response.raise_for_status()
        return response.content, response.headers.get("content-type", "image/png"), {"provider": provider, "endpoint": endpoint}

async def process_flatlay_item(batch, item, api_key="", base_url="", rmbg_api_key="", rmbg_base_url=""):
    item_id = item["id"]
    category = normalize_flatlay_category(batch.get("target_category"))
    source = item.get("source_image") or {}
    phrase = (item.get("phrase") or "").strip()
    rerun_mode = item.get("rerun_mode") or "full"
    active_step = None
    try:
        if not phrase or rerun_mode == "full":
            flatlay_update_item(item_id, status="analyzing")
            step = begin_flatlay_step(item_id, "analyze", {"model": batch.get("vision_model"), "category": category})
            active_step = step
            phrase, raw = await flatlay_describe_phrase(source, category, batch.get("vision_model") or FLATLAY_VISION_MODEL, api_key=api_key, base_url=base_url)
            flatlay_update_item(item_id, phrase=phrase)
            finish_flatlay_step(step, {"phrase": phrase, "request_id": raw.get("id") if isinstance(raw, dict) else None})
            active_step = None

        prompts = flatlay_prompt_candidates(phrase, category)
        combined_url = ""
        prompt_used = ""
        last_error = None
        for index, prompt in enumerate(prompts, start=1):
            flatlay_update_item(item_id, status="generating", prompt=prompt)
            step = begin_flatlay_step(item_id, "generate", {"attempt": index, "model": batch.get("generate_model")})
            active_step = step
            try:
                image_data, raw = await generate_ai_image(
                    prompt,
                    batch.get("size") or "1536x1024",
                    batch.get("quality") or "auto",
                    selected_model(batch.get("generate_model"), FLATLAY_GENERATE_MODEL),
                    [source],
                    api_key=api_key,
                    base_url=base_url,
                )
                combined_url = await save_ai_image_to_output(image_data, prefix="flatlay_combined_")
                prompt_used = prompt
                finish_flatlay_step(step, {"result_url": combined_url, "request_id": raw.get("id") if isinstance(raw, dict) else None})
                active_step = None
                break
            except Exception as exc:
                last_error = exc
                finish_flatlay_step(step, {"attempt": index}, error_detail(exc))
                active_step = None
                if index == len(prompts):
                    raise
        if not combined_url:
            raise last_error or HTTPException(status_code=502, detail="平面图生成失败")
        flatlay_update_item(item_id, combined_url=combined_url, prompt=prompt_used)

        split_source_url = combined_url
        rmbg_url = ""
        provider = normalize_flatlay_rmbg_provider(batch.get("rmbg_provider"))
        if provider != "none":
            flatlay_update_item(item_id, status="rmbg")
            step = begin_flatlay_step(item_id, "rmbg", {"provider": provider, "variant": batch.get("rmbg_variant")})
            active_step = step
            source_bytes, filename, _ = flatlay_image_bytes(combined_url)
            rmbg_bytes, content_type, detail = await flatlay_remove_background(
                source_bytes,
                filename,
                provider,
                batch.get("rmbg_variant") or RMBG_DEFAULT_VARIANT,
                api_key=rmbg_api_key,
                base_url=rmbg_base_url,
            )
            ext = ".png" if "png" in content_type.lower() else ".jpg"
            rmbg_url = flatlay_save_bytes(rmbg_bytes, prefix="flatlay_rmbg_", ext=ext)
            split_source_url = rmbg_url
            flatlay_update_item(item_id, rmbg_url=rmbg_url)
            finish_flatlay_step(step, {"result_url": rmbg_url, **detail})
            active_step = None

        flatlay_update_item(item_id, status="splitting")
        step = begin_flatlay_step(item_id, "split", {"source": split_source_url})
        active_step = step
        split_bytes, _, _ = flatlay_image_bytes(split_source_url)
        front_bytes, back_bytes = split_flatlay_front_back(split_bytes)
        front_url = flatlay_save_bytes(front_bytes, prefix="flatlay_front_")
        back_url = flatlay_save_bytes(back_bytes, prefix="flatlay_back_")
        flatlay_update_item(
            item_id,
            status="completed",
            front_url=front_url,
            back_url=back_url,
            error_message=None,
            completed_at=time.time(),
        )
        finish_flatlay_step(step, {"front_url": front_url, "back_url": back_url})
        active_step = None
        record = {
            "prompt": prompt_used,
            "images": [front_url, back_url],
            "timestamp": time.time(),
            "type": "flatlay",
            "model": batch.get("generate_model"),
            "status": TASK_SUCCEEDED,
            "params": {
                "batch_id": batch.get("id"),
                "item_id": item_id,
                "phrase": phrase,
                "source_image": source,
                "combined_url": combined_url,
                "rmbg_url": rmbg_url,
                "front_url": front_url,
                "back_url": back_url,
            },
        }
        save_to_history(record)
        await manager.broadcast_new_image(record)
    except Exception as exc:
        if active_step:
            finish_flatlay_step(active_step, error_message=error_detail(exc))
        flatlay_update_item(item_id, status="failed", error_message=error_detail(exc), completed_at=time.time())

async def run_flatlay_worker(batch_id, api_key="", base_url="", rmbg_api_key="", rmbg_base_url=""):
    try:
        while True:
            batch, item = claim_next_flatlay_item(batch_id)
            if not item:
                finalize_flatlay_if_idle(batch_id)
                return
            await process_flatlay_item(batch, item, api_key=api_key, base_url=base_url, rmbg_api_key=rmbg_api_key, rmbg_base_url=rmbg_base_url)
            finalize_flatlay_if_idle(batch_id)
    finally:
        current = FLATLAY_WORKERS.get(batch_id)
        if current is asyncio.current_task():
            FLATLAY_WORKERS.pop(batch_id, None)

def start_flatlay_worker(batch_id, api_key="", base_url="", rmbg_api_key="", rmbg_base_url=""):
    current = FLATLAY_WORKERS.get(batch_id)
    if current and not current.done():
        return
    FLATLAY_WORKERS[batch_id] = asyncio.create_task(run_flatlay_worker(
        batch_id,
        api_key=api_key,
        base_url=base_url,
        rmbg_api_key=rmbg_api_key,
        rmbg_base_url=rmbg_base_url,
    ))

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

def normalize_batch_tryon_size(value):
    size = (value or "").strip()
    if not size:
        return BATCH_TRYON_DEFAULT_SIZE
    return size if size in BATCH_TRYON_SIZE_VALUES else BATCH_TRYON_DEFAULT_SIZE

def batch_tryon_generation_fields(value):
    size = normalize_batch_tryon_size(value)
    if size in BATCH_TRYON_RATIO_SIZES:
        return BATCH_TRYON_DEFAULT_SIZE, {
            "aspect_ratio": size,
            "aspectRatio": size,
        }
    return size, {}

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
    elif mode == "multiClothing":
        pairs = [(list(clothing_images), model_images[0])]
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
    model = selected_model(payload.model, BATCH_TRYON_DEFAULT_MODEL)
    size = normalize_batch_tryon_size(payload.size)
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
                (batch_id, title, mode, payload.prompt.strip(), model, size, payload.quality, now, now),
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
    if isinstance(exc, httpx.TimeoutException):
        return f"上游生图接口超时（{AI_REQUEST_TIMEOUT:g} 秒），可能仍在排队或生成过慢"
    if isinstance(exc, httpx.HTTPStatusError):
        return f"上游接口错误 {exc.response.status_code}: {exc.response.text[:500]}"
    if isinstance(exc, httpx.RequestError):
        text = str(exc).strip()
        return f"请求上游生图接口失败：{text or exc.__class__.__name__}"
    return str(exc).strip() or exc.__class__.__name__

async def run_batch_tryon_worker(batch_id, api_key="", base_url=""):
    try:
        while True:
            batch, task = claim_next_batch_tryon_task(batch_id)
            if not task:
                finalize_batch_tryon_if_idle(batch_id)
                return

            refs = [*task.get("clothing_images", []), task.get("model_image", {})]
            try:
                request_size, extra_fields = batch_tryon_generation_fields(batch.get("size"))
                image_data, raw = await generate_ai_image(
                    batch.get("prompt") or "",
                    request_size,
                    batch.get("quality") or "auto",
                    selected_model(batch.get("model"), BATCH_TRYON_DEFAULT_MODEL),
                    refs,
                    api_key=api_key,
                    base_url=base_url,
                    extra_fields=extra_fields,
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

GALLERY_SOURCE_LABELS = {
    "zimage": "Text to image",
    "cloud": "Text to image",
    "enhance": "Detail enhance",
    "klein": "Image edit",
    "angle": "Angle control",
    "online": "Online generate",
    "batch_tryon": "Batch try-on",
    "flatlay": "Flatlay",
    "chat": "Chat",
    "canvas": "Canvas",
}

GALLERY_ARTIFACT_LABELS = {
    "image": "Image",
    "result": "Result",
    "combined": "Combined",
    "rmbg": "RMBG",
    "front": "Front",
    "back": "Back",
    "source": "Source",
}

def gallery_meta():
    with GALLERY_LOCK:
        if not os.path.exists(GALLERY_META_FILE):
            return {"assets": {}}
        try:
            with open(GALLERY_META_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict) and isinstance(data.get("assets"), dict):
                return data
        except Exception:
            pass
        return {"assets": {}}

def save_gallery_meta(data):
    with GALLERY_LOCK:
        os.makedirs(DATA_DIR, exist_ok=True)
        with open(GALLERY_META_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

def update_gallery_meta(asset_id, **fields):
    data = gallery_meta()
    assets = data.setdefault("assets", {})
    current = assets.setdefault(asset_id, {})
    current.update(fields)
    current["updated_at"] = time.time()
    save_gallery_meta(data)
    return current

def normalize_epoch(value):
    try:
        ts = float(value or 0)
    except Exception:
        return 0
    if ts > 10_000_000_000:
        ts = ts / 1000
    return ts

def gallery_asset_id(url):
    clean = (url or "").strip()
    return "ga_" + hashlib.sha1(clean.encode("utf-8")).hexdigest()[:18]

def gallery_source_label(source):
    return GALLERY_SOURCE_LABELS.get(source or "", (source or "Unknown").replace("_", " ").title())

def gallery_artifact_label(kind):
    return GALLERY_ARTIFACT_LABELS.get(kind or "image", (kind or "image").replace("_", " ").title())

def gallery_filename(url):
    if not url:
        return "asset"
    parsed = urllib.parse.urlparse(url)
    name = os.path.basename(urllib.parse.unquote(parsed.path or url))
    return name or "asset"

def gallery_file_size(url):
    path = output_file_from_url(url)
    if not path:
        return 0
    try:
        return os.path.getsize(path)
    except Exception:
        return 0

def gallery_image_size(url):
    path = output_file_from_url(url)
    if not path:
        return {"width": 0, "height": 0}
    try:
        with Image.open(path) as img:
            return {"width": int(img.width), "height": int(img.height)}
    except Exception:
        return {"width": 0, "height": 0}

def gallery_asset(url, source, artifact_type="image", title="", prompt="", model="", status="", created_at=0, updated_at=0, **extra):
    clean_url = (url or "").strip()
    if not clean_url:
        return None
    image_size = gallery_image_size(clean_url)
    asset = {
        "id": gallery_asset_id(clean_url),
        "url": clean_url,
        "filename": gallery_filename(clean_url),
        "source": source or "unknown",
        "sources": [source or "unknown"],
        "source_label": gallery_source_label(source),
        "source_labels": [gallery_source_label(source)],
        "artifact_type": artifact_type or "image",
        "artifact_label": gallery_artifact_label(artifact_type or "image"),
        "title": title or gallery_filename(clean_url),
        "prompt": prompt or "",
        "model": model or "",
        "status": status or TASK_SUCCEEDED,
        "created_at": normalize_epoch(created_at) or time.time(),
        "updated_at": normalize_epoch(updated_at) or normalize_epoch(created_at) or time.time(),
        "width": image_size["width"],
        "height": image_size["height"],
        "size_bytes": gallery_file_size(clean_url),
        "contexts": [],
    }
    asset.update(extra)
    asset["contexts"].append({
        "source": asset["source"],
        "source_label": asset["source_label"],
        "batch_id": asset.get("batch_id", ""),
        "item_id": asset.get("item_id", ""),
        "task_id": asset.get("task_id", ""),
        "canvas_id": asset.get("canvas_id", ""),
        "canvas_title": asset.get("canvas_title", ""),
    })
    return asset

def merge_gallery_asset(assets, candidate):
    if not candidate:
        return
    existing = assets.get(candidate["id"])
    if not existing:
        assets[candidate["id"]] = candidate
        return
    for source in candidate.get("sources", []):
        if source not in existing["sources"]:
            existing["sources"].append(source)
            existing["source_labels"].append(gallery_source_label(source))
    seen_contexts = {
        (
            ctx.get("source", ""),
            ctx.get("batch_id", ""),
            ctx.get("item_id", ""),
            ctx.get("task_id", ""),
            ctx.get("canvas_id", ""),
        )
        for ctx in existing.get("contexts", [])
    }
    for ctx in candidate.get("contexts", []):
        key = (
            ctx.get("source", ""),
            ctx.get("batch_id", ""),
            ctx.get("item_id", ""),
            ctx.get("task_id", ""),
            ctx.get("canvas_id", ""),
        )
        if key not in seen_contexts:
            existing["contexts"].append(ctx)
            seen_contexts.add(key)
    existing["updated_at"] = max(existing.get("updated_at", 0), candidate.get("updated_at", 0))
    existing["created_at"] = max(existing.get("created_at", 0), candidate.get("created_at", 0))
    for key in ["prompt", "phrase", "model", "batch_id", "item_id", "task_id", "group_id", "canvas_id", "canvas_title"]:
        if not existing.get(key) and candidate.get(key):
            existing[key] = candidate[key]
    if existing.get("artifact_type") == "image" and candidate.get("artifact_type") != "image":
        existing["artifact_type"] = candidate["artifact_type"]
        existing["artifact_label"] = candidate["artifact_label"]

def read_history_records():
    if not os.path.exists(HISTORY_FILE):
        return []
    try:
        with HISTORY_LOCK:
            with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
        return data if isinstance(data, list) else []
    except Exception:
        return []

def gallery_refs_from_params(params):
    refs = []
    if not isinstance(params, dict):
        return refs
    for key in ["reference_images", "clothing_images"]:
        items = params.get(key) or []
        if isinstance(items, list):
            refs.extend(item for item in items if isinstance(item, dict) and item.get("url"))
    for key in ["model_image", "source_image"]:
        item = params.get(key)
        if isinstance(item, dict) and item.get("url"):
            refs.append(item)
    return refs[:12]

def flatlay_artifact_type_for_url(url, params):
    if not isinstance(params, dict):
        return "image"
    for key, kind in [
        ("combined_url", "combined"),
        ("rmbg_url", "rmbg"),
        ("front_url", "front"),
        ("back_url", "back"),
    ]:
        if params.get(key) == url:
            return kind
    return "image"

def add_history_gallery_assets(assets):
    for record in read_history_records():
        images = record.get("images") or []
        if not isinstance(images, list):
            continue
        source = record.get("type") or "zimage"
        params = record.get("params") if isinstance(record.get("params"), dict) else {}
        for index, url in enumerate(images):
            artifact = flatlay_artifact_type_for_url(url, params) if source == "flatlay" else ("result" if source == "batch_tryon" else "image")
            title = f"{gallery_source_label(source)} · {gallery_artifact_label(artifact)}"
            merge_gallery_asset(assets, gallery_asset(
                url=url,
                source=source,
                artifact_type=artifact,
                title=title,
                prompt=record.get("prompt", ""),
                model=record.get("model", ""),
                status=record.get("status", TASK_SUCCEEDED),
                created_at=record.get("timestamp"),
                updated_at=record.get("timestamp"),
                batch_id=params.get("batch_id", ""),
                item_id=params.get("item_id", ""),
                task_id=params.get("task_id", ""),
                group_id=params.get("group_id", ""),
                phrase=params.get("phrase", ""),
                image_index=index,
                params=params,
                source_images=gallery_refs_from_params(params),
            ))

def add_flatlay_gallery_assets(assets):
    init_flatlay_db()
    with FLATLAY_LOCK:
        conn = flatlay_connect()
        try:
            rows = conn.execute(
                """
                SELECT i.*, b.title AS batch_title, b.generate_model, b.target_category, b.created_at AS batch_created_at
                FROM flatlay_items i
                JOIN flatlay_batches b ON b.id = i.batch_id
                ORDER BY i.updated_at DESC
                """
            ).fetchall()
        finally:
            conn.close()
    for row in rows:
        item = flatlay_item_record(row)
        source_image = item.get("source_image") or {}
        urls = [
            ("combined", item.get("combined_url")),
            ("rmbg", item.get("rmbg_url")),
            ("front", item.get("front_url")),
            ("back", item.get("back_url")),
        ]
        for artifact, url in urls:
            if not url:
                continue
            merge_gallery_asset(assets, gallery_asset(
                url=url,
                source="flatlay",
                artifact_type=artifact,
                title=f"{row['batch_title'] or 'Flatlay'} · {gallery_artifact_label(artifact)}",
                prompt=item.get("prompt", ""),
                model=row["generate_model"] or "",
                status=item.get("status", ""),
                created_at=item.get("completed_at") or item.get("updated_at") or item.get("created_at"),
                updated_at=item.get("updated_at"),
                batch_id=item.get("batch_id", ""),
                item_id=item.get("id", ""),
                item_index=item.get("item_index"),
                batch_title=row["batch_title"] or "",
                phrase=item.get("phrase", ""),
                target_category=row["target_category"] or "",
                source_images=[source_image] if source_image.get("url") else [],
            ))

def add_batch_tryon_gallery_assets(assets):
    init_batch_tryon_db()
    with BATCH_TRYON_LOCK:
        conn = batch_tryon_connect()
        try:
            rows = conn.execute(
                """
                SELECT t.*, b.title AS batch_title, b.model, b.pairing_mode, g.name AS group_name
                FROM batch_tryon_tasks t
                JOIN batch_tryon_batches b ON b.id = t.batch_id
                LEFT JOIN batch_tryon_groups g ON g.id = t.group_id
                WHERE t.result_url IS NOT NULL AND t.result_url != ''
                ORDER BY t.updated_at DESC
                """
            ).fetchall()
        finally:
            conn.close()
    for row in rows:
        task = batch_tryon_task_record(row)
        refs = [*task.get("clothing_images", []), task.get("model_image") or {}]
        merge_gallery_asset(assets, gallery_asset(
            url=task.get("result_url"),
            source="batch_tryon",
            artifact_type="result",
            title=f"{row['batch_title'] or 'Batch try-on'} · Result",
            prompt="",
            model=row["model"] or "",
            status=task.get("status", ""),
            created_at=task.get("completed_at") or task.get("updated_at") or task.get("created_at"),
            updated_at=task.get("updated_at"),
            batch_id=task.get("batch_id", ""),
            task_id=task.get("id", ""),
            group_id=task.get("group_id", ""),
            group_name=row["group_name"] or "",
            pairing_mode=row["pairing_mode"] or "",
            source_images=[ref for ref in refs if isinstance(ref, dict) and ref.get("url")],
        ))

def add_chat_gallery_assets(assets):
    for root, _, files in os.walk(CONVERSATION_DIR):
        for filename in files:
            if not filename.endswith(".json"):
                continue
            try:
                with open(os.path.join(root, filename), "r", encoding="utf-8") as f:
                    conversation = json.load(f)
            except Exception:
                continue
            for message in conversation.get("messages", []):
                url = message.get("image_url")
                if not url:
                    continue
                merge_gallery_asset(assets, gallery_asset(
                    url=url,
                    source="chat",
                    artifact_type="image",
                    title=conversation.get("title") or "Chat image",
                    prompt=message.get("content", ""),
                    model=message.get("model", ""),
                    status=message.get("status", TASK_SUCCEEDED),
                    created_at=message.get("created_at"),
                    updated_at=conversation.get("updated_at") or message.get("created_at"),
                    conversation_id=conversation.get("id", ""),
                    conversation_title=conversation.get("title", ""),
                ))

def add_canvas_gallery_assets(assets):
    for record in iter_canvas_records(include_deleted=False):
        try:
            canvas = load_canvas(record["id"])
        except Exception:
            continue
        for node in canvas.get("nodes", []):
            if node.get("type") != "output":
                continue
            for index, url in enumerate(node.get("images") or []):
                merge_gallery_asset(assets, gallery_asset(
                    url=url,
                    source="canvas",
                    artifact_type="result",
                    title=canvas.get("title") or "Canvas output",
                    prompt="",
                    model="",
                    status=TASK_SUCCEEDED,
                    created_at=canvas.get("updated_at"),
                    updated_at=canvas.get("updated_at"),
                    canvas_id=canvas.get("id", ""),
                    canvas_title=canvas.get("title", ""),
                    node_id=node.get("id", ""),
                    image_index=index,
                ))

def all_gallery_assets(include_hidden=False):
    assets = {}
    add_flatlay_gallery_assets(assets)
    add_batch_tryon_gallery_assets(assets)
    add_history_gallery_assets(assets)
    add_chat_gallery_assets(assets)
    add_canvas_gallery_assets(assets)
    meta_assets = gallery_meta().get("assets", {})
    result = []
    for asset in assets.values():
        meta = meta_assets.get(asset["id"], {})
        asset["favorite"] = bool(meta.get("favorite"))
        asset["hidden"] = bool(meta.get("hidden"))
        if asset["hidden"] and not include_hidden:
            continue
        result.append(asset)
    return sorted(result, key=lambda item: item.get("created_at", 0), reverse=True)

def find_gallery_asset(asset_id, include_hidden=False):
    for asset in all_gallery_assets(include_hidden=include_hidden):
        if asset["id"] == asset_id:
            return asset
    return None

def csv_values(value):
    if not value or value == "all":
        return set()
    return {part.strip() for part in str(value).split(",") if part.strip() and part.strip() != "all"}

def gallery_date_cutoff(date_filter):
    now = time.time()
    if date_filter == "today":
        local = time.localtime(now)
        return time.mktime((local.tm_year, local.tm_mon, local.tm_mday, 0, 0, 0, local.tm_wday, local.tm_yday, local.tm_isdst))
    if date_filter == "7d":
        return now - 7 * 24 * 3600
    if date_filter == "30d":
        return now - 30 * 24 * 3600
    return 0

def gallery_matches_query(asset, query):
    q = (query or "").strip().lower()
    if not q:
        return True
    haystack = " ".join(str(asset.get(key, "")) for key in [
        "title", "prompt", "phrase", "model", "filename", "batch_id", "item_id",
        "task_id", "group_id", "canvas_title", "conversation_title"
    ])
    haystack += " " + " ".join(asset.get("sources") or [])
    return q in haystack.lower()

def filter_gallery_assets(assets, q="", source="all", artifact_type="all", status="all", favorite: Optional[bool] = None, model="all", date="all"):
    sources = csv_values(source)
    artifacts = csv_values(artifact_type)
    statuses = csv_values(status)
    models = csv_values(model)
    cutoff = gallery_date_cutoff(date)
    result = []
    for asset in assets:
        if sources and not (set(asset.get("sources") or []) & sources):
            continue
        if artifacts and asset.get("artifact_type") not in artifacts:
            continue
        if statuses and asset.get("status") not in statuses:
            continue
        if favorite is not None and bool(asset.get("favorite")) != favorite:
            continue
        if models and asset.get("model") not in models:
            continue
        if cutoff and asset.get("created_at", 0) < cutoff:
            continue
        if not gallery_matches_query(asset, q):
            continue
        result.append(asset)
    return result

def gallery_facets(assets):
    sources = {}
    artifacts = {}
    statuses = {}
    models = {}
    favorites = 0
    for asset in assets:
        if asset.get("favorite"):
            favorites += 1
        for source in asset.get("sources") or [asset.get("source", "unknown")]:
            sources[source] = sources.get(source, 0) + 1
        artifact = asset.get("artifact_type") or "image"
        artifacts[artifact] = artifacts.get(artifact, 0) + 1
        status = asset.get("status") or TASK_SUCCEEDED
        statuses[status] = statuses.get(status, 0) + 1
        model = asset.get("model") or ""
        if model:
            models[model] = models.get(model, 0) + 1
    return {
        "sources": [{"value": key, "label": gallery_source_label(key), "count": count} for key, count in sorted(sources.items())],
        "artifact_types": [{"value": key, "label": gallery_artifact_label(key), "count": count} for key, count in sorted(artifacts.items())],
        "statuses": [{"value": key, "label": key, "count": count} for key, count in sorted(statuses.items())],
        "models": [{"value": key, "label": key, "count": count} for key, count in sorted(models.items())],
        "favorites": favorites,
    }

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

def frontend_index_response():
    if not os.path.exists(FRONTEND_INDEX_FILE):
        return Response(
            "<!doctype html><html><head><title>Feebee Studios</title></head>"
            "<body><h1>Frontend build missing</h1>"
            "<p>Run <code>npm --prefix frontend run build</code> to generate the Quiet Creative OS shell.</p>"
            "</body></html>",
            status_code=503,
            media_type="text/html",
            headers={"Cache-Control": "no-store"},
        )
    return FileResponse(
        FRONTEND_INDEX_FILE,
        headers={"Cache-Control": "no-store"},
    )


@app.get("/")
async def index():
    return frontend_index_response()


@app.get("/app")
async def app_index():
    return frontend_index_response()


@app.get("/app/{path:path}")
async def app_fallback(path: str):
    return frontend_index_response()


@app.get("/legacy")
@app.get("/legacy/")
async def legacy_index():
    return RedirectResponse(url="/app", status_code=302)

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

def classify_provider_models(models):
    image_models = []
    chat_models = []
    video_models = []
    for raw in models or []:
        model_id = str(raw.get("id") if isinstance(raw, dict) else raw or "").strip()
        if not model_id:
            continue
        lower = model_id.lower()
        if any(token in lower for token in ("veo", "sora", "wan", "seedance", "video", "t2v", "i2v")):
            video_models.append(model_id)
        elif any(token in lower for token in ("image", "gpt-image", "nano", "flux", "z-image", "klein", "banana")):
            image_models.append(model_id)
        else:
            chat_models.append(model_id)
    return {
        "image_models": model_list_from_values(image_models),
        "chat_models": model_list_from_values(chat_models),
        "video_models": model_list_from_values(video_models),
    }

async def fetch_provider_model_ids(provider, api_key=""):
    base = str(provider.get("base_url") or "").strip().rstrip("/")
    if not base:
        raise HTTPException(status_code=400, detail="Base URL 不能为空")
    url = f"{base}/models" if base.endswith("/v1") else f"{base}/v1/models"
    headers = api_headers(provider=provider, api_key=api_key)
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(url, headers=headers)
        response.raise_for_status()
        raw = response.json()
    data = raw.get("data") if isinstance(raw, dict) else raw
    if isinstance(data, dict) and isinstance(data.get("data"), list):
        data = data["data"]
    ids = []
    for item in data or []:
        value = item.get("id") if isinstance(item, dict) else item
        if value:
            ids.append(str(value))
    return model_list_from_values(ids), raw

@app.get("/api/providers")
async def api_providers():
    providers = load_api_providers()
    return {"providers": [public_provider(p) for p in providers], "primary_provider_id": get_primary_provider_id(providers)}

@app.put("/api/providers")
async def save_providers(payload: List[ApiProviderPayload]):
    providers = []
    env_updates = {}
    for item in payload:
        data = item.dict(exclude={"api_key", "clear_key"})
        provider = normalize_provider(data)
        providers.append(provider)
        if item.clear_key:
            env_updates[provider_key_env(provider["id"])] = ""
        elif item.api_key is not None and item.api_key.strip():
            env_updates[provider_key_env(provider["id"])] = item.api_key.strip()
        if provider["id"] == "comfly":
            env_updates["COMFLY_BASE_URL"] = provider.get("base_url") or AI_BASE_URL
            if provider.get("image_models"):
                env_updates["IMAGE_MODELS"] = ",".join(provider["image_models"])
            if provider.get("chat_models"):
                env_updates["CHAT_MODELS"] = ",".join(provider["chat_models"])
            if provider.get("video_models"):
                env_updates["VIDEO_MODELS"] = ",".join(provider["video_models"])
        elif provider["id"] == "modelscope":
            if provider.get("base_url"):
                env_updates["MODELSCOPE_CHAT_BASE_URL"] = provider["base_url"]
            if provider.get("chat_models"):
                env_updates["MODELSCOPE_CHAT_MODELS"] = ",".join(provider["chat_models"])
    saved = save_api_providers(providers)
    if env_updates:
        update_env_values(env_updates)
    return {"providers": [public_provider(p) for p in saved], "primary_provider_id": get_primary_provider_id(saved)}

@app.post("/api/providers/test-connection")
async def test_provider_connection(payload: ProviderConnectionPayload):
    data = payload.dict()
    if data.get("provider_id") and not data.get("id"):
        data["id"] = data["provider_id"]
    provider = normalize_provider(data)
    try:
        ids, raw = await fetch_provider_model_ids(provider, api_key=payload.api_key.strip())
        return {"ok": True, "models": ids, **classify_provider_models(ids), "raw_count": len(ids)}
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=f"连接失败：{exc.response.text}") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"连接失败：{exc}") from exc

@app.post("/api/providers/fetch-models")
async def fetch_provider_models(payload: ProviderConnectionPayload):
    data = payload.dict()
    if data.get("provider_id") and not data.get("id"):
        data["id"] = data["provider_id"]
    provider = normalize_provider(data)
    try:
        ids, _ = await fetch_provider_model_ids(provider, api_key=payload.api_key.strip())
        return {"models": ids, **classify_provider_models(ids)}
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=f"拉取模型失败：{exc.response.text}") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"拉取模型失败：{exc}") from exc

@app.post("/api/providers/probe-async")
async def probe_provider_async(payload: ProviderConnectionPayload):
    data = payload.dict()
    if data.get("provider_id") and not data.get("id"):
        data["id"] = data["provider_id"]
    provider = normalize_provider(data)
    base = (provider.get("base_url") or "").rstrip("/")
    if not base:
        raise HTTPException(status_code=400, detail="Base URL 不能为空")
    tasks_url = f"{base}/tasks/healthcheck_probe_do_not_submit" if base.endswith("/v1") else f"{base}/v1/tasks/healthcheck_probe_do_not_submit"
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(tasks_url, headers=api_headers(provider=provider, api_key=payload.api_key.strip()))
    except HTTPException:
        raise
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"异步协议探测失败：{exc}") from exc
    body = response.text[:800]
    lower = body.lower()
    if response.status_code in {400, 422} and ("task" in lower or "任务" in lower or "invalid" in lower):
        return {"ok": True, "status_code": response.status_code, "protocol": "apimart", "detail": body}
    if response.status_code in {401, 403}:
        return {"ok": False, "status_code": response.status_code, "detail": "API Key 无效或无权限"}
    if response.status_code == 404:
        return {"ok": False, "status_code": response.status_code, "detail": "未发现 /v1/tasks 异步协议"}
    if response.status_code < 500:
        return {"ok": True, "status_code": response.status_code, "protocol": provider_protocol(provider), "detail": body}
    raise HTTPException(status_code=response.status_code, detail=f"异步协议探测失败：{body}")

@app.get("/api/providers/{provider_id}/fetch-models")
async def fetch_saved_provider_models(provider_id: str):
    provider = get_api_provider_exact(provider_id)
    try:
        ids, _ = await fetch_provider_model_ids(provider)
        return {"models": ids, **classify_provider_models(ids)}
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=f"拉取模型失败：{exc.response.text}") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"拉取模型失败：{exc}") from exc

@app.get("/api/config")
async def ai_config(x_comfly_api_key: str = Header(default=""), x_comfly_base_url: str = Header(default="")):
    preferred_chat_model = next((m for m in CHAT_MODELS if m == "gpt-5.5"), CHAT_MODELS[0] if CHAT_MODELS else CHAT_MODEL)
    providers = load_api_providers()
    return {
        "base_url": comfly_base_url(x_comfly_base_url),
        "chat_model": preferred_chat_model,
        "image_model": IMAGE_MODEL,
        "chat_models": CHAT_MODELS,
        "image_models": IMAGE_MODELS,
        "video_models": VIDEO_MODELS,
        "flatlay_vision_model": FLATLAY_VISION_MODEL,
        "flatlay_generate_model": FLATLAY_GENERATE_MODEL,
        "flatlay_rmbg_provider": RMBG_PROVIDER,
        "flatlay_rmbg_variant": RMBG_DEFAULT_VARIANT,
        "flatlay_rmbg_base_url": RMBG_BASE_URL,
        "flatlay_local_rmbg_base_url": RMBG_LOCAL_BASE_URL,
        "has_rmbg_key": bool(RMBG_API_KEY),
        "has_api_key": bool(comfly_api_key(x_comfly_api_key)),
        "ms_chat_models": MODELSCOPE_CHAT_MODELS,
        "has_ms_key": bool(modelscope_api_key()),
        "api_providers": [public_provider(p) for p in providers],
        "primary_provider_id": get_primary_provider_id(providers),
    }

@app.get("/api/models")
async def ai_models():
    return {"chat_models": CHAT_MODELS, "image_models": IMAGE_MODELS, "video_models": VIDEO_MODELS}

# --- ModelScope Token (从 env 读取，不再支持通过 UI 修改) ---

@app.get("/api/config/token")
async def get_global_token():
    # Do not expose server-side secrets to the browser. Frontend callers use
    # this only to decide whether the backend can fall back to its configured key.
    return {"token": "", "has_token": bool(modelscope_api_key())}

# --- 在线生图 (COMFLY) ---

@app.post("/api/online-image")
async def online_image(payload: OnlineImageRequest, x_comfly_api_key: str = Header(default=""), x_comfly_base_url: str = Header(default="")):
    provider = get_api_provider(payload.provider_id)
    model = selected_model(payload.model, (provider.get("image_models") or [IMAGE_MODEL])[0])
    refs = [ref.dict() for ref in payload.reference_images if ref.url]
    try:
        image_data, raw = await generate_ai_image(payload.prompt, payload.size, payload.quality, model, refs, api_key=x_comfly_api_key, base_url=x_comfly_base_url, provider_id=provider["id"])
        local_url = await save_ai_image_to_output(image_data, prefix="online_")
    except httpx.HTTPStatusError as exc:
        print(f"Online image upstream error {exc.response.status_code}: {exc.response.text}")
        raise HTTPException(status_code=exc.response.status_code, detail=f"上游生图接口错误：{exc.response.text}") from exc
    except httpx.HTTPError as exc:
        reason = str(exc) or exc.__class__.__name__
        print(f"Online image request error: {exc.__class__.__name__}: {reason!r}")
        raise HTTPException(status_code=502, detail=f"请求上游生图接口失败：{reason}") from exc

    result = {
        "prompt": payload.prompt,
        "images": [local_url],
        "timestamp": time.time(),
        "type": "online",
        "model": model,
        "provider_id": provider["id"],
        "status": TASK_SUCCEEDED,
        "params": {"provider_id": provider["id"], "model": model, "size": payload.size, "quality": payload.quality, "reference_images": refs},
        "raw_usage": raw.get("usage") if isinstance(raw, dict) else None,
    }
    save_to_history(result)
    if GLOBAL_LOOP:
        asyncio.run_coroutine_threadsafe(manager.broadcast_new_image(result), GLOBAL_LOOP)
    return result

async def run_canvas_image_task(task_id: str, payload: OnlineImageRequest, api_key: str = "", base_url: str = ""):
    with CANVAS_TASK_LOCK:
        if task_id in CANVAS_TASKS:
            CANVAS_TASKS[task_id]["status"] = TASK_RUNNING
            CANVAS_TASKS[task_id]["updated_at"] = time.time()
    try:
        result = await online_image(payload, x_comfly_api_key=api_key, x_comfly_base_url=base_url)
        with CANVAS_TASK_LOCK:
            CANVAS_TASKS[task_id].update({
                "status": TASK_SUCCEEDED,
                "result": result,
                "error": "",
                "updated_at": time.time(),
            })
    except Exception as exc:
        detail = getattr(exc, "detail", None) or str(exc)
        status_code = getattr(exc, "status_code", 500)
        task_status = TASK_TIMEOUT if status_code == 504 or "timeout" in str(detail).lower() or "超时" in str(detail) else TASK_FAILED
        with CANVAS_TASK_LOCK:
            CANVAS_TASKS[task_id].update({
                "status": task_status,
                "error": str(detail),
                "status_code": status_code,
                "updated_at": time.time(),
            })

@app.post("/api/canvas-image-tasks")
async def create_canvas_image_task(payload: OnlineImageRequest, x_comfly_api_key: str = Header(default=""), x_comfly_base_url: str = Header(default="")):
    task_id = f"canvas_img_{uuid.uuid4().hex}"
    with CANVAS_TASK_LOCK:
        CANVAS_TASKS[task_id] = {
            "id": task_id,
            "type": "online-image",
            "status": TASK_QUEUED,
            "created_at": time.time(),
            "updated_at": time.time(),
            "result": None,
            "error": "",
        }
    asyncio.create_task(run_canvas_image_task(task_id, payload, api_key=x_comfly_api_key, base_url=x_comfly_base_url))
    return {"task_id": task_id, "status": TASK_QUEUED}

@app.get("/api/canvas-image-tasks/{task_id}")
async def get_canvas_image_task(task_id: str):
    with CANVAS_TASK_LOCK:
        task = dict(CANVAS_TASKS.get(task_id) or {})
    if not task:
        raise HTTPException(status_code=404, detail="画布任务不存在，可能服务已重启或任务已过期")
    return task

VIDEO_URL_KEYS = (
    "url",
    "video_url",
    "videoUrl",
    "mp4_url",
    "mp4Url",
    "output",
    "output_url",
    "outputUrl",
    "download_url",
    "downloadUrl",
    "video",
    "src",
    "uri",
    "preview_url",
    "previewUrl",
)
VIDEO_TASK_SUCCESS_STATUSES = {
    "SUCCESS",
    "SUCCEED",
    "SUCCEEDED",
    "COMPLETED",
    "COMPLETE",
    "DONE",
    "FINISHED",
    "FINISH",
    "OK",
    "READY",
}
VIDEO_TASK_FAILURE_STATUSES = {
    "FAILURE",
    "FAILED",
    "FAIL",
    "ERROR",
    "ERRORED",
    "CANCELED",
    "CANCELLED",
    "TIMEOUT",
    "TIMEDOUT",
    "REJECTED",
    "EXPIRED",
}

def _collect_video_url(value, urls):
    if not value:
        return
    if isinstance(value, str):
        if (
            value.startswith("http://")
            or value.startswith("https://")
            or value.startswith("/output/")
            or value.startswith("/assets/")
        ):
            urls.append(value)
        return
    if isinstance(value, list):
        for item in value:
            _collect_video_url(item, urls)
        return
    if isinstance(value, dict):
        for key in VIDEO_URL_KEYS:
            if key in value:
                _collect_video_url(value.get(key), urls)

def video_output_urls(raw):
    urls = []
    if not isinstance(raw, dict):
        return urls
    candidates = [raw]
    data = raw.get("data")
    if isinstance(data, dict):
        candidates.append(data)
    elif isinstance(data, list):
        candidates.extend(item for item in data if isinstance(item, dict))
    for node in list(candidates):
        result = node.get("result") if isinstance(node, dict) else None
        if isinstance(result, dict):
            candidates.append(result)
        elif isinstance(result, list):
            candidates.extend(item for item in result if isinstance(item, dict))
    for node in candidates:
        if not isinstance(node, dict):
            continue
        for key in ("videos", "outputs"):
            if key in node:
                _collect_video_url(node.get(key), urls)
        for key in VIDEO_URL_KEYS:
            if key in node:
                _collect_video_url(node.get(key), urls)
    deduped = []
    for url in urls:
        if isinstance(url, str) and url and url not in deduped:
            deduped.append(url)
    return deduped

def video_api_root(provider, base_url=""):
    root = (base_url if provider.get("id") == "comfly" and base_url else provider.get("base_url") or AI_BASE_URL).rstrip("/")
    if root.endswith("/v1") or root.endswith("/v2"):
        root = root.rsplit("/", 1)[0]
    return root

def apimart_video_size(size):
    value = str(size or "16:9").strip()
    if value == "keep_ratio":
        return "adaptive"
    allowed = {"16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "adaptive"}
    return value if value in allowed else "16:9"

def valid_apimart_video_image_input(value):
    return isinstance(value, str) and (value.startswith("http://") or value.startswith("https://") or value.startswith("asset://"))

def extract_apimart_asset_url(payload):
    if isinstance(payload, list):
        for item in payload:
            found = extract_apimart_asset_url(item)
            if found:
                return found
        return ""
    if not isinstance(payload, dict):
        return ""
    for key in ("url", "asset_url", "assetUrl", "uri", "file_url", "fileUrl"):
        value = str(payload.get(key) or "").strip()
        if valid_apimart_video_image_input(value):
            return value
    for key in ("asset_id", "assetId", "file_id", "fileId", "id"):
        value = str(payload.get(key) or "").strip()
        if value:
            return value if value.startswith("asset://") else f"asset://{value}"
    for key in ("data", "file", "asset", "result"):
        found = extract_apimart_asset_url(payload.get(key))
        if found:
            return found
    return ""

def apimart_upload_payload_from_bytes(data: bytes, mime: str, name_hint: str = "image"):
    max_bytes = 9_500_000
    clean_mime = (mime or "image/png").split(";", 1)[0].strip().lower()
    if clean_mime == "image/jpg":
        clean_mime = "image/jpeg"
    ext_by_mime = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp",
    }
    if len(data) <= max_bytes and clean_mime in ext_by_mime:
        return f"{name_hint}{ext_by_mime[clean_mime]}", data, clean_mime
    with Image.open(BytesIO(data)) as img:
        has_alpha = img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)
        if has_alpha:
            rgba = img.convert("RGBA")
            background = Image.new("RGB", rgba.size, (255, 255, 255))
            background.paste(rgba, mask=rgba.split()[-1])
            target = background
        else:
            target = img.convert("RGB")
        quality = 92
        while quality >= 62:
            buf = BytesIO()
            target.save(buf, format="JPEG", quality=quality, optimize=True)
            payload = buf.getvalue()
            if len(payload) <= max_bytes:
                return f"{name_hint}.jpg", payload, "image/jpeg"
            quality -= 8
    raise ValueError("data URL 图片超过 10MB，且压缩后仍无法满足 APIMart 限制")

def apimart_upload_error(reason):
    return f"ERR:{reason}"

def apimart_upload_error_reason(value, fallback="未知错误"):
    text = str(value or "")
    return text[4:] if text.startswith("ERR:") else fallback

async def upload_image_for_apimart(client, provider, ref_url):
    ref_url = str(ref_url or "").strip()
    if not ref_url:
        return apimart_upload_error("空地址")
    if ref_url.startswith("http://") or ref_url.startswith("https://") or ref_url.startswith("asset://"):
        return ref_url
    if ref_url.startswith("data:"):
        try:
            if ";base64," not in ref_url:
                return apimart_upload_error("不支持的 data URL（缺少 base64 段）")
            header, encoded = ref_url.split(";base64,", 1)
            mime = header.split(":", 1)[1].split(";", 1)[0] if ":" in header else "image/png"
            raw = base64.b64decode(encoded, validate=True)
            filename, content, content_type = apimart_upload_payload_from_bytes(raw, mime, "canvas_image")
            upload_url = f"{video_api_root(provider)}/v1/uploads/images"
            response = await client.post(
                upload_url,
                headers=api_headers(json_body=False, provider=provider),
                files={"file": (filename, content, content_type)},
                timeout=60,
            )
            if response.status_code not in (200, 201):
                print(f"APIMart 上传 data URL 失败 ({response.status_code}): {response.text[:300]}")
                return apimart_upload_error(f"APIMart 上传失败({response.status_code})")
            url = extract_apimart_asset_url(response.json())
            if valid_apimart_video_image_input(url):
                return url
            return apimart_upload_error("APIMart 上传响应未包含可用 URL")
        except ValueError as e:
            return apimart_upload_error(str(e))
        except Exception as e:
            print(f"APIMart 上传 data URL 异常: {e}")
            return apimart_upload_error(f"上传异常 {e}")
    path = output_file_from_url(ref_url) or local_asset_file_from_url(ref_url)
    if not path:
        return apimart_upload_error("本地文件不存在或已被删除")
    upload_url = f"{video_api_root(provider)}/v1/uploads/images"
    try:
        with open(path, "rb") as fh:
            response = await client.post(
                upload_url,
                headers=api_headers(json_body=False, provider=provider),
                files={"file": (os.path.basename(path), fh, content_type_for_path(path))},
                timeout=60,
            )
        if response.status_code not in (200, 201):
            print(f"APIMart 文件上传失败 ({response.status_code}): {response.text[:300]}")
            return apimart_upload_error(f"APIMart 上传失败({response.status_code})")
        url = extract_apimart_asset_url(response.json())
        if valid_apimart_video_image_input(url):
            return url
        return apimart_upload_error("APIMart 上传响应未包含可用 URL")
    except Exception as e:
        print(f"APIMart 文件上传异常: {e}")
        return apimart_upload_error(f"上传异常 {e}")

async def wait_for_video_task(client, task_id, api_key="", base_url="", provider=None):
    provider = provider or get_api_provider("comfly")
    root = video_api_root(provider, base_url)
    if is_apimart_provider(provider):
        task_path = f"{root}/tasks/{task_id}" if root.endswith("/v1") else f"{root}/v1/tasks/{task_id}"
        task_url = f"{task_path}?language=zh"
    else:
        task_url = f"{root}/v2/videos/generations/{task_id}"
    deadline = time.monotonic() + VIDEO_POLL_TIMEOUT
    delay = max(2.0, IMAGE_POLL_INTERVAL)
    last_payload = {}
    while time.monotonic() < deadline:
        await asyncio.sleep(delay)
        response = await client.get(task_url, headers=api_headers(api_key=api_key if provider["id"] == "comfly" else "", provider=provider))
        response.raise_for_status()
        raw = response.json()
        last_payload = raw
        task_data = raw.get("data") if isinstance(raw.get("data"), dict) else raw
        status = str(task_data.get("status") or task_data.get("task_status") or raw.get("status") or raw.get("task_status") or "").upper()
        if status in VIDEO_TASK_SUCCESS_STATUSES:
            return raw
        if not status and video_output_urls(raw):
            return raw
        if status in VIDEO_TASK_FAILURE_STATUSES:
            error = task_data.get("error") if isinstance(task_data.get("error"), dict) else {}
            reason = task_data.get("fail_reason") or task_data.get("message") or error.get("message") or raw.get("error") or raw.get("message") or str(raw)
            raise HTTPException(status_code=502, detail=f"视频生成任务失败：{reason}")
        delay = min(delay * 1.6, 12)
    raise HTTPException(status_code=504, detail=f"视频生成任务超时：{last_payload or task_id}")

@app.post("/api/canvas-video")
async def canvas_video(payload: CanvasVideoRequest, x_comfly_api_key: str = Header(default=""), x_comfly_base_url: str = Header(default="")):
    provider = get_api_provider(payload.provider_id)
    base = video_api_root(provider, x_comfly_base_url)
    if not base:
        raise HTTPException(status_code=400, detail=f"{provider.get('name') or provider['id']} 未配置 Base URL")
    is_apimart = is_apimart_provider(provider)
    submit_url = f"{base}/videos/generations" if is_apimart and base.endswith("/v1") else f"{base}/v1/videos/generations" if is_apimart else f"{base}/v2/videos/generations"
    model = selected_model(payload.model, (provider.get("video_models") or VIDEO_MODELS or ["veo3-fast"])[0])
    body = {}
    try:
        async with httpx.AsyncClient(timeout=VIDEO_POLL_TIMEOUT) as client:
            if is_apimart:
                image_with_roles = []
                invalid_images = []
                for ref in payload.images[:9]:
                    if not ref.url:
                        continue
                    role = str(ref.role or "").strip()
                    up_url = await upload_image_for_apimart(client, provider, ref.url)
                    if valid_apimart_video_image_input(up_url):
                        if role in {"first_frame", "last_frame", "reference_image"}:
                            image_with_roles.append({"url": up_url, "role": role})
                    else:
                        invalid_images.append((ref.url, apimart_upload_error_reason(up_url)))
                image_payload = []
                if not image_with_roles:
                    for ref in payload.images[:9]:
                        if not ref.url:
                            continue
                        up_url = await upload_image_for_apimart(client, provider, ref.url)
                        if valid_apimart_video_image_input(up_url):
                            image_payload.append(up_url)
                        else:
                            invalid_images.append((ref.url, apimart_upload_error_reason(up_url)))
                if payload.images and not image_with_roles and not image_payload:
                    sample, reason = invalid_images[0] if invalid_images else ("", "未知错误")
                    preview = str(sample or "").strip()
                    if len(preview) > 120:
                        preview = preview[:117] + "..."
                    raise HTTPException(status_code=400, detail=f"输入图片无法转换为视频接口支持的格式：{preview or '(empty)'}。原因：{reason}")
                body = {
                    "prompt": payload.prompt,
                    "model": model,
                    "duration": max(1, min(60, int(payload.duration or 5))),
                    "size": apimart_video_size(payload.aspect_ratio or payload.size),
                    "resolution": payload.resolution or "480p",
                }
                if image_with_roles:
                    body["image_with_roles"] = image_with_roles
                elif image_payload:
                    body["image_urls"] = image_payload[:9]
                if payload.videos:
                    body["video_urls"] = [v for v in payload.videos if v][:3]
            else:
                image_payload = []
                image_with_roles = []
                for ref in payload.images[:4]:
                    if not ref.url:
                        continue
                    data_url = reference_to_data_url(ref.dict(), max_size=1536)
                    image_payload.append(data_url)
                    role = str(ref.role or "").strip()
                    if role in {"first_frame", "last_frame", "reference_image"}:
                        image_with_roles.append({"url": data_url, "role": role})
                body = {
                    "prompt": payload.prompt,
                    "model": model,
                    "duration": max(1, min(60, int(payload.duration or 5))),
                    "watermark": bool(payload.watermark),
                }
                if payload.aspect_ratio:
                    body["aspect_ratio"] = payload.aspect_ratio
                    body["ratio"] = payload.aspect_ratio
                if payload.size:
                    body["size"] = payload.size
                if payload.resolution:
                    body["resolution"] = payload.resolution
                if image_payload:
                    body["images"] = image_payload
                if image_with_roles:
                    body["image_with_roles"] = image_with_roles
                if payload.videos:
                    body["videos"] = [v for v in payload.videos if v]
                if payload.enhance_prompt:
                    body["enhance_prompt"] = True
                if payload.enable_upsample:
                    body["enable_upsample"] = True
                if payload.camera_fixed or payload.camerafixed:
                    body["camerafixed"] = True
            if payload.seed is not None:
                body["seed"] = payload.seed
            if payload.return_last_frame:
                body["return_last_frame"] = True
            if payload.generate_audio:
                body["generate_audio"] = True
            response = await client.post(submit_url, headers=api_headers(api_key=x_comfly_api_key if provider["id"] == "comfly" else "", provider=provider), json=body)
            response.raise_for_status()
            raw = response.json()
            task_id = extract_task_id(raw) or raw.get("task_id") or raw.get("id")
            result = raw
            if task_id and not video_output_urls(raw):
                result = await wait_for_video_task(client, task_id, api_key=x_comfly_api_key, base_url=x_comfly_base_url, provider=provider)
            urls = video_output_urls(result)
            if not urls:
                raise HTTPException(status_code=502, detail=f"视频生成成功但没有返回视频：{result}")
            local_urls = [await save_remote_video_to_output(url) for url in urls]
            record = {
                "prompt": payload.prompt,
                "images": local_urls,
                "videos": local_urls,
                "timestamp": time.time(),
                "type": "video",
                "model": body["model"],
                "provider_id": provider["id"],
                "status": TASK_SUCCEEDED,
                "params": {**body, "reference_images": [ref.dict() for ref in payload.images if ref.url]},
            }
            save_to_history(record)
            if GLOBAL_LOOP:
                asyncio.run_coroutine_threadsafe(manager.broadcast_new_image(record), GLOBAL_LOOP)
            return {"videos": local_urls, "task_id": task_id, "raw": result}
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=f"上游视频接口错误：{exc.response.text}") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"请求上游视频接口失败：{exc}") from exc

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

# --- 模特图转平面图 (COMFLY + optional RMBG，持久化任务队列) ---

@app.get("/api/flatlay/batches")
async def flatlay_batches(limit: int = 50):
    init_flatlay_db()
    return {"batches": list_flatlay_batches(limit)}

@app.post("/api/flatlay/batches")
async def flatlay_create_batch(payload: FlatlayCreateRequest, x_comfly_api_key: str = Header(default=""), x_comfly_base_url: str = Header(default="")):
    init_flatlay_db()
    if payload.autostart:
        api_headers(json_body=False, api_key=x_comfly_api_key)
    batch_id = create_flatlay_batch(payload)
    if payload.autostart and prepare_flatlay_run(batch_id):
        start_flatlay_worker(
            batch_id,
            api_key=x_comfly_api_key,
            base_url=x_comfly_base_url,
            rmbg_api_key=payload.rmbg_api_key,
            rmbg_base_url=payload.rmbg_base_url,
        )
    return get_flatlay_detail(batch_id)

@app.get("/api/flatlay/batches/{batch_id}")
async def flatlay_get_batch(batch_id: str):
    init_flatlay_db()
    return get_flatlay_detail(batch_id)

@app.post("/api/flatlay/batches/{batch_id}/pause")
async def flatlay_pause_batch(batch_id: str):
    init_flatlay_db()
    set_flatlay_batch_status(batch_id, "paused")
    return get_flatlay_detail(batch_id)

@app.post("/api/flatlay/batches/{batch_id}/resume")
async def flatlay_resume_batch(batch_id: str, payload: FlatlayControlRequest, x_comfly_api_key: str = Header(default=""), x_comfly_base_url: str = Header(default="")):
    init_flatlay_db()
    api_headers(json_body=False, api_key=x_comfly_api_key)
    if prepare_flatlay_run(batch_id):
        start_flatlay_worker(
            batch_id,
            api_key=x_comfly_api_key,
            base_url=x_comfly_base_url,
            rmbg_api_key=payload.rmbg_api_key,
            rmbg_base_url=payload.rmbg_base_url,
        )
    return get_flatlay_detail(batch_id)

@app.post("/api/flatlay/batches/{batch_id}/retry-failed")
async def flatlay_retry_failed(batch_id: str, payload: FlatlayControlRequest, x_comfly_api_key: str = Header(default=""), x_comfly_base_url: str = Header(default="")):
    init_flatlay_db()
    api_headers(json_body=False, api_key=x_comfly_api_key)
    reset_flatlay_failed_items(batch_id)
    if prepare_flatlay_run(batch_id):
        start_flatlay_worker(
            batch_id,
            api_key=x_comfly_api_key,
            base_url=x_comfly_base_url,
            rmbg_api_key=payload.rmbg_api_key,
            rmbg_base_url=payload.rmbg_base_url,
        )
    return get_flatlay_detail(batch_id)

@app.patch("/api/flatlay/items/{item_id}/phrase")
async def flatlay_update_phrase(item_id: str, payload: FlatlayPhraseRequest):
    init_flatlay_db()
    batch_id = update_flatlay_phrase(item_id, payload.phrase)
    return get_flatlay_detail(batch_id)

@app.post("/api/flatlay/items/{item_id}/rerun")
async def flatlay_rerun_item(item_id: str, payload: FlatlayControlRequest, x_comfly_api_key: str = Header(default=""), x_comfly_base_url: str = Header(default="")):
    init_flatlay_db()
    api_headers(json_body=False, api_key=x_comfly_api_key)
    batch_id = reset_flatlay_item(item_id, mode=payload.mode)
    if prepare_flatlay_run(batch_id):
        start_flatlay_worker(
            batch_id,
            api_key=x_comfly_api_key,
            base_url=x_comfly_base_url,
            rmbg_api_key=payload.rmbg_api_key,
            rmbg_base_url=payload.rmbg_base_url,
        )
    return get_flatlay_detail(batch_id)

# --- Canvas LLM ---

@app.post("/api/canvas-llm")
async def canvas_llm(payload: CanvasLLMRequest, x_comfly_api_key: str = Header(default=""), x_comfly_base_url: str = Header(default="")):
    chat_base, chat_hdrs, model = resolve_chat_provider(
        payload.provider, payload.model, payload.ms_model,
        comfly_key=x_comfly_api_key, comfly_base=x_comfly_base_url,
        ms_key=payload.ms_api_key, ms_base=payload.ms_base_url,
    )
    llm_provider = get_api_provider(payload.provider) if payload.provider not in {"modelscope"} else {}
    upstream_messages = [{"role": "system", "content": payload.system_prompt or SYSTEM_PROMPT}]
    for item in payload.messages[-MAX_HISTORY_MESSAGES:]:
        role = item.get("role")
        content = item.get("content")
        if role in {"user", "assistant"} and content:
            upstream_messages.append({"role": role, "content": content})
    image_parts = [part for part in (image_url_to_chat_part(url) for url in payload.images[:12]) if part]
    if image_parts:
        upstream_messages.append({
            "role": "user",
            "content": [{"type": "text", "text": payload.message}, *image_parts],
        })
    else:
        upstream_messages.append({"role": "user", "content": payload.message})
    try:
        async with httpx.AsyncClient(timeout=AI_REQUEST_TIMEOUT) as client:
            response = await client.post(
                f"{chat_base}/chat/completions",
                headers=chat_hdrs,
                json={"model": model, "messages": upstream_messages, **({"stream": False} if is_apimart_provider(llm_provider) else {})},
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

# --- ComfyUI 自定义工作流 ---

@app.get("/api/comfyui/instances")
def get_comfyui_instances():
    return {"instances": list(COMFYUI_INSTANCES), "primary": COMFYUI_INSTANCES[0] if COMFYUI_INSTANCES else COMFYUI_ADDRESS}

@app.put("/api/comfyui/instances")
def save_comfyui_instances(payload: ComfyInstancesPayload):
    global COMFYUI_INSTANCES, COMFYUI_ADDRESS
    instances = []
    for item in payload.instances:
        normalized = normalize_comfy_instance(item)
        if normalized not in instances:
            instances.append(normalized)
    if not instances:
        raise HTTPException(status_code=400, detail="至少需要一个 ComfyUI 实例")
    COMFYUI_INSTANCES = instances
    COMFYUI_ADDRESS = instances[0]
    for addr in instances:
        backend_stats.setdefault(addr, {"load": 0, "healthy": True})
        BACKEND_LOCAL_LOAD.setdefault(addr, 0)
    for addr in list(backend_stats.keys()):
        if addr not in instances:
            backend_stats.pop(addr, None)
            BACKEND_LOCAL_LOAD.pop(addr, None)
    update_env_values({"COMFYUI_INSTANCES": ",".join(instances), "COMFYUI_ADDRESS": instances[0]})
    return {"instances": list(COMFYUI_INSTANCES), "primary": COMFYUI_ADDRESS}

@app.get("/api/workflows")
def list_workflows():
    os.makedirs(os.path.join(WORKFLOW_DIR, CUSTOM_WORKFLOW_FOLDER), exist_ok=True)
    items = []
    custom_root = os.path.join(WORKFLOW_DIR, CUSTOM_WORKFLOW_FOLDER)
    for fn in sorted(os.listdir(custom_root)):
        if not fn.endswith(".json") or fn.endswith(".config.json"):
            continue
        rel = f"{CUSTOM_WORKFLOW_FOLDER}/{fn}"
        cfg = {}
        cfg_path = workflow_config_path(rel)
        if os.path.exists(cfg_path):
            try:
                with open(cfg_path, "r", encoding="utf-8") as f:
                    cfg = json.load(f) or {}
            except Exception:
                cfg = {}
        items.append({
            "name": rel,
            "title": cfg.get("title") or fn.replace(".json", ""),
            "builtin": False,
            "field_count": len(cfg.get("fields") or []),
        })
    items.sort(key=lambda item: item["title"])
    return {"workflows": items}

@app.post("/api/workflows")
def upload_workflow(payload: WorkflowUploadRequest):
    name = os.path.basename(payload.name.strip())
    if not name.endswith(".json"):
        name = f"{name}.json"
    if name.endswith(".config.json"):
        raise HTTPException(status_code=400, detail="工作流文件名不能使用 .config.json")
    stored_name = f"{CUSTOM_WORKFLOW_FOLDER}/{name}"
    require_custom_workflow(stored_name)
    if not isinstance(payload.workflow, dict) or not payload.workflow:
        raise HTTPException(status_code=400, detail="工作流 JSON 为空")
    sample = next(iter(payload.workflow.values()), None)
    if not isinstance(sample, dict) or "class_type" not in sample:
        raise HTTPException(status_code=400, detail="不是有效的 ComfyUI API 工作流 JSON（需包含 class_type）")
    custom_dir = os.path.join(WORKFLOW_DIR, CUSTOM_WORKFLOW_FOLDER)
    os.makedirs(custom_dir, exist_ok=True)
    path = os.path.join(custom_dir, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload.workflow, f, ensure_ascii=False, indent=2)
    return {"name": stored_name}

@app.post("/api/workflows/{name:path}/run")
def run_workflow_from_settings(name: str, payload: WorkflowRunRequest):
    workflow = get_workflow(name)
    config = payload.config.dict() if payload.config else workflow.get("config") or {}
    params = {}
    field_values = payload.fields or {}
    for field in config.get("fields") or []:
        if not isinstance(field, dict):
            continue
        node_id = str(field.get("node") or "").strip()
        input_name = str(field.get("input") or "").strip()
        field_id = str(field.get("id") or "").strip()
        if not node_id or not input_name or not field_id:
            continue
        value = field_values.get(field_id, field.get("default"))
        params.setdefault(node_id, {})[input_name] = value
    req = GenerateRequest(
        prompt=payload.prompt,
        width=payload.width,
        height=payload.height,
        type=payload.type or "custom",
        workflow_json=normalize_workflow_name(name),
        params=params,
        client_id=payload.client_id,
    )
    return generate(req)

@app.get("/api/workflows/{name:path}")
def get_workflow(name: str):
    path = resolve_workflow_path(name)
    with open(path, "r", encoding="utf-8") as f:
        workflow = json.load(f)
    cfg = {"title": os.path.basename(name).replace(".json", ""), "fields": []}
    cfg_path = workflow_config_path(name)
    if os.path.exists(cfg_path):
        try:
            with open(cfg_path, "r", encoding="utf-8") as f:
                cfg = json.load(f) or cfg
        except Exception:
            pass
    return {"name": normalize_workflow_name(name), "workflow": workflow, "config": cfg, "builtin": is_builtin_workflow(name)}

@app.put("/api/workflows/{name:path}/config")
def save_workflow_config(name: str, payload: WorkflowConfig):
    require_custom_workflow(name)
    resolve_workflow_path(name)
    cfg_path = workflow_config_path(name)
    with open(cfg_path, "w", encoding="utf-8") as f:
        json.dump(payload.dict(), f, ensure_ascii=False, indent=2)
    return {"config": payload.dict()}

@app.delete("/api/workflows/{name:path}")
def delete_workflow(name: str):
    require_custom_workflow(name)
    path = resolve_workflow_path(name)
    cfg_path = workflow_config_path(name)
    os.remove(path)
    if os.path.exists(cfg_path):
        os.remove(cfg_path)
    return {"ok": True}

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
    return {"canvas": new_canvas(payload.title, payload.icon, payload.kind)}

@app.get("/api/canvases/{canvas_id}")
async def get_canvas(canvas_id: str):
    return {"canvas": load_canvas(canvas_id)}

@app.get("/api/canvases/{canvas_id}/meta")
async def get_canvas_meta(canvas_id: str):
    canvas = load_canvas(canvas_id)
    return {
        "id": canvas.get("id"),
        "title": canvas.get("title", "未命名画布"),
        "icon": canvas.get("icon", "🧩"),
        "kind": normalize_canvas_kind(canvas.get("kind")),
        "created_at": canvas.get("created_at", 0),
        "updated_at": canvas.get("updated_at", 0),
        "deleted_at": canvas.get("deleted_at", 0),
        "node_count": len(canvas.get("nodes", [])),
        "connection_count": len(canvas.get("connections", [])),
        "log_count": len(canvas.get("logs", [])),
    }

@app.put("/api/canvases/{canvas_id}")
async def update_canvas(canvas_id: str, payload: CanvasSaveRequest):
    canvas = load_canvas(canvas_id)
    if payload.base_updated_at and int(canvas.get("updated_at") or 0) > int(payload.base_updated_at):
        raise HTTPException(
            status_code=409,
            detail={
                "message": "画布已被其他客户端更新，请刷新后再保存。",
                "server_updated_at": canvas.get("updated_at", 0),
                "client_base_updated_at": payload.base_updated_at,
            },
        )
    canvas["title"] = (payload.title or canvas.get("title") or "未命名画布")[:80]
    canvas["icon"] = (payload.icon or canvas.get("icon") or "layers")[:32]
    canvas["nodes"] = payload.nodes
    canvas["connections"] = payload.connections
    canvas["viewport"] = payload.viewport
    canvas["logs"] = payload.logs[-500:] if isinstance(payload.logs, list) else []
    canvas["settings"] = payload.settings if isinstance(payload.settings, dict) else {}
    canvas["kind"] = normalize_canvas_kind(canvas.get("kind"))
    if payload.client_id:
        canvas["last_client_id"] = re.sub(r"[^a-zA-Z0-9_-]", "", payload.client_id)[:80]
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

@app.post("/api/canvas-assets/check")
async def check_canvas_assets(payload: CanvasAssetCheckRequest):
    exists = {}
    for url in payload.urls[:1000]:
        key = str(url or "").strip()
        if not key:
            continue
        if re.match(r"^https?://", key) or key.startswith("data:"):
            exists[key] = True
        else:
            exists[key] = bool(local_asset_file_from_url(key))
    return {"exists": exists}

@app.post("/api/canvas-assets/download")
async def download_canvas_assets(payload: CanvasAssetDownloadRequest):
    files = []
    seen_paths = set()
    for url in payload.urls[:2000]:
        path = local_asset_file_from_url(url)
        if not path or path in seen_paths:
            continue
        seen_paths.add(path)
        files.append((path, os.path.basename(path)))
    if not files:
        raise HTTPException(status_code=400, detail="没有可下载的本地资产")
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        manifest = []
        for path, filename in files:
            arcname = filename
            stem, ext = os.path.splitext(filename)
            index = 2
            while arcname in archive.namelist():
                arcname = f"{stem}-{index}{ext}"
                index += 1
            archive.write(path, arcname)
            manifest.append({"source": f"/output/{filename}" if path.startswith(os.path.abspath(OUTPUT_DIR)) else filename, "file": arcname})
        archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    buffer.seek(0)
    filename = re.sub(r"[^a-zA-Z0-9_.-]", "-", payload.filename or "canvas-assets.zip")
    if not filename.endswith(".zip"):
        filename += ".zip"
    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

@app.get("/api/asset-library")
async def get_asset_library():
    return {"library": load_asset_library()}

@app.post("/api/asset-library/categories")
async def create_asset_library_category(payload: AssetLibraryCategoryRequest):
    lib = load_asset_library()
    category = {
        "id": f"cat_{uuid.uuid4().hex[:12]}",
        "name": sanitize_asset_library_name(payload.name, "图片资产"),
        "type": "image",
        "items": [],
    }
    lib.setdefault("categories", []).append(category)
    lib = save_asset_library(lib)
    return {"library": lib, "category": category}

@app.patch("/api/asset-library/categories/{category_id}")
async def rename_asset_library_category(category_id: str, payload: AssetLibraryRenameRequest):
    lib = load_asset_library()
    category = find_asset_category(lib, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="分类不存在")
    category["name"] = sanitize_asset_library_name(payload.name, category.get("name") or "图片资产")
    lib = save_asset_library(lib)
    return {"library": lib, "category": category}

@app.delete("/api/asset-library/categories/{category_id}")
async def delete_asset_library_category(category_id: str):
    lib = load_asset_library()
    category = find_asset_category(lib, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="分类不存在")
    if len(lib.get("categories", [])) <= 1:
        raise HTTPException(status_code=400, detail="至少保留一个资产文件夹")
    removed_urls = [item.get("url") for item in category.get("items", []) if item.get("url")]
    lib["categories"] = [cat for cat in lib.get("categories", []) if cat.get("id") != category_id]
    lib = save_asset_library(lib)
    for url in removed_urls:
        remove_asset_library_file_if_unused(url, lib)
    return {"library": lib}

@app.post("/api/asset-library/items")
async def add_asset_library_item(payload: AssetLibraryAddRequest):
    lib = load_asset_library()
    category = find_asset_category(lib, payload.category_id) or (lib.get("categories") or [None])[0]
    if not category:
        raise HTTPException(status_code=404, detail="分类不存在")
    src = local_asset_file_from_url(payload.url)
    if not src:
        raise HTTPException(status_code=400, detail="只支持保存本地 /output 或 /assets 图片")
    ext = os.path.splitext(src)[1].lower() or ".png"
    if ext not in {".png", ".jpg", ".jpeg", ".webp", ".gif"}:
        raise HTTPException(status_code=400, detail="资产库只支持图片文件")
    safe_name = sanitize_asset_library_name(payload.name or os.path.basename(src), "asset")
    if not os.path.splitext(safe_name)[1]:
        safe_name += ext
    dest_name = f"lib_{uuid.uuid4().hex[:12]}_{safe_name}"
    dest_path = os.path.join(ASSET_LIBRARY_DIR, dest_name)
    os.makedirs(ASSET_LIBRARY_DIR, exist_ok=True)
    shutil.copy2(src, dest_path)
    item = {
        "id": f"asset_{uuid.uuid4().hex[:12]}",
        "name": os.path.splitext(safe_name)[0][:120],
        "url": asset_library_relative_url(dest_path),
        "created_at": now_ms(),
    }
    category.setdefault("items", []).append(item)
    lib = save_asset_library(lib)
    return {"library": lib, "item": item}

@app.patch("/api/asset-library/items/{item_id}")
async def rename_asset_library_item(item_id: str, payload: AssetLibraryRenameRequest):
    lib = load_asset_library()
    for category in lib.get("categories", []):
        for item in category.get("items", []):
            if item.get("id") == item_id:
                item["name"] = sanitize_asset_library_name(payload.name, item.get("name") or "asset")
                lib = save_asset_library(lib)
                return {"library": lib, "item": item}
    raise HTTPException(status_code=404, detail="资产不存在")

@app.delete("/api/asset-library/items/{item_id}")
async def delete_asset_library_item(item_id: str):
    lib = load_asset_library()
    removed_url = ""
    for category in lib.get("categories", []):
        kept = []
        for item in category.get("items", []):
            if item.get("id") == item_id:
                removed_url = item.get("url", "")
            else:
                kept.append(item)
        category["items"] = kept
    if not removed_url:
        raise HTTPException(status_code=404, detail="资产不存在")
    lib = save_asset_library(lib)
    remove_asset_library_file_if_unused(removed_url, lib)
    return {"library": lib}

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
        image_provider = get_api_provider(payload.provider if payload.provider != "modelscope" else "comfly")
        model = selected_model(payload.image_model or payload.model, (image_provider.get("image_models") or [IMAGE_MODEL])[0])
        try:
            image_data, raw = await generate_ai_image(payload.message, payload.size, payload.quality, model, refs, api_key=x_comfly_api_key, base_url=x_comfly_base_url, provider_id=image_provider["id"])
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
    llm_provider = get_api_provider(payload.provider) if payload.provider not in {"modelscope"} else {}
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
                if is_apimart_provider(llm_provider):
                    response = await client.post(
                        f"{chat_base}/chat/completions",
                        headers=chat_hdrs,
                        json={"model": model, "messages": upstream_messages, "stream": False},
                    )
                    if response.status_code >= 400:
                        yield sse_event({"type": "error", "detail": f"上游接口错误：{response.text}"})
                        return
                    raw = response.json()
                    text = text_from_chat_response(raw).strip() or "接口返回了空回复。"
                    content_parts.append(text)
                    raw_usage = raw.get("usage") if isinstance(raw, dict) else None
                    yield sse_event({"type": "delta", "delta": text})
                else:
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

@app.get("/api/gallery/assets")
async def gallery_assets(
    q: str = "",
    source: str = "all",
    artifact_type: str = "all",
    status: str = "all",
    favorite: Optional[bool] = None,
    model: str = "all",
    date: str = "all",
    page: int = 1,
    page_size: int = 36,
):
    page = max(1, int(page or 1))
    page_size = max(12, min(int(page_size or 36), 96))
    all_assets = all_gallery_assets(include_hidden=False)
    filtered = filter_gallery_assets(
        all_assets,
        q=q,
        source=source,
        artifact_type=artifact_type,
        status=status,
        favorite=favorite,
        model=model,
        date=date,
    )
    total = len(filtered)
    pages = max(1, (total + page_size - 1) // page_size)
    page = min(page, pages)
    start = (page - 1) * page_size
    end = start + page_size
    return {
        "assets": filtered[start:end],
        "page": page,
        "page_size": page_size,
        "pages": pages,
        "total": total,
        "facets": gallery_facets(all_assets),
    }

@app.patch("/api/gallery/assets/{asset_id}/favorite")
async def gallery_favorite(asset_id: str, payload: GalleryFavoriteRequest):
    asset = find_gallery_asset(asset_id, include_hidden=True)
    if not asset:
        raise HTTPException(status_code=404, detail="资产不存在")
    update_gallery_meta(asset_id, favorite=bool(payload.favorite))
    asset["favorite"] = bool(payload.favorite)
    return {"ok": True, "asset": asset}

@app.delete("/api/gallery/assets/{asset_id}")
async def gallery_hide_asset(asset_id: str, delete_file: bool = False):
    asset = find_gallery_asset(asset_id, include_hidden=True)
    if not asset:
        raise HTTPException(status_code=404, detail="资产不存在")
    update_gallery_meta(asset_id, hidden=True)
    if delete_file:
        path = output_file_from_url(asset.get("url", ""))
        if path and os.path.exists(path):
            try:
                os.remove(path)
            except Exception as exc:
                raise HTTPException(status_code=500, detail=f"删除文件失败：{exc}") from exc
    return {"ok": True}

@app.post("/api/gallery/download")
async def gallery_download(payload: GalleryDownloadRequest):
    asset_ids = [asset_id for asset_id in payload.asset_ids[:200] if asset_id]
    if not asset_ids:
        raise HTTPException(status_code=400, detail="请选择要下载的资产")
    available = {asset["id"]: asset for asset in all_gallery_assets(include_hidden=False)}
    buffer = BytesIO()
    used_names = set()
    count = 0
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for asset_id in asset_ids:
            asset = available.get(asset_id)
            if not asset:
                continue
            path = output_file_from_url(asset.get("url", ""))
            if not path:
                continue
            name = gallery_filename(asset.get("url", ""))
            if name in used_names:
                root, ext = os.path.splitext(name)
                name = f"{root}-{count + 1}{ext}"
            used_names.add(name)
            archive.write(path, arcname=name)
            count += 1
    if count == 0:
        raise HTTPException(status_code=404, detail="没有可下载的本地文件")
    buffer.seek(0)
    headers = {"Content-Disposition": f'attachment; filename="feebee-gallery-{int(time.time())}.zip"'}
    return StreamingResponse(buffer, media_type="application/zip", headers=headers)

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
