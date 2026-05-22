import os


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WORKFLOW_DIR = os.path.join(BASE_DIR, "workflows")
WORKFLOW_PATH = os.path.join(WORKFLOW_DIR, "Z-Image.json")
STATIC_DIR = os.path.join(BASE_DIR, "static")
OUTPUT_DIR = os.path.join(BASE_DIR, "output")
HISTORY_FILE = os.path.join(BASE_DIR, "history.json")
API_ENV_FILE = os.path.join(BASE_DIR, "API", ".env")
DATA_DIR = os.path.join(BASE_DIR, "data")
CONVERSATION_DIR = os.path.join(DATA_DIR, "conversations")
CANVAS_DIR = os.path.join(DATA_DIR, "canvases")
GLOBAL_CONFIG_FILE = os.path.join(BASE_DIR, "global_config.json")
CANVAS_TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000


def load_env_file():
    if not os.path.exists(API_ENV_FILE):
        return
    try:
        with open(API_ENV_FILE, "r", encoding="utf-8-sig") as f:
            for raw_line in f.read().splitlines():
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))
    except Exception as e:
        print(f"加载 API/.env 失败: {e}")


def env_list(name, defaults):
    configured = os.getenv(name, "")
    values = [item.strip() for item in configured.split(",") if item.strip()]
    return values or defaults


def model_list(env_name, primary, defaults):
    configured = os.getenv(env_name, "")
    configured_values = [item.strip() for item in configured.split(",") if item.strip()]
    values = configured_values or [primary, *defaults]
    deduped = []
    for value in values:
        if value and value not in deduped:
            deduped.append(value)
    return deduped


load_env_file()

COMFYUI_INSTANCES = [s.strip() for s in os.getenv("COMFYUI_INSTANCES", "127.0.0.1:8188").split(",") if s.strip()]
COMFYUI_ADDRESS = COMFYUI_INSTANCES[0]

APP_HOST = os.getenv("APP_HOST", "127.0.0.1")
APP_PORT = int(os.getenv("APP_PORT", "3000"))
CORS_ALLOW_ORIGINS = env_list("CORS_ALLOW_ORIGINS", ["http://127.0.0.1:3000", "http://localhost:3000"])
CORS_ALLOW_HEADERS = ["Content-Type", "X-User-ID", "X-Comfly-API-Key", "X-Comfly-Base-URL"]

AI_BASE_URL = os.getenv("COMFLY_BASE_URL", "https://ai.comfly.chat").rstrip("/")
AI_API_KEY = os.getenv("COMFLY_API_KEY", "")
MODELSCOPE_API_KEY = os.getenv("MODELSCOPE_API_KEY", "")
MODELSCOPE_CHAT_BASE_URL = "https://api-inference.modelscope.cn/v1"
MODELSCOPE_CHAT_MODELS = [
    m.strip()
    for m in os.getenv("MODELSCOPE_CHAT_MODELS", "Qwen/Qwen3-235B-A22B,MiniMax/MiniMax-M2.7:MiniMax").split(",")
    if m.strip()
]
CHAT_MODEL = os.getenv("CHAT_MODEL", "gpt-4o-mini")
IMAGE_MODEL = os.getenv("IMAGE_MODEL", "gpt-image-2")
VIDEO_MODEL = os.getenv("VIDEO_MODEL", "veo3-fast")
FLATLAY_VISION_MODEL = os.getenv("FLATLAY_VISION_MODEL", os.getenv("COMFLY_VISION_MODEL", "gpt-5.5"))
FLATLAY_GENERATE_MODEL = os.getenv("FLATLAY_GENERATE_MODEL", os.getenv("COMFLY_GENERATE_MODEL", IMAGE_MODEL))
RMBG_PROVIDER = os.getenv("RMBG_PROVIDER", "none").strip().lower()
RMBG_BASE_URL = os.getenv("RMBG_BASE_URL", "").rstrip("/")
RMBG_API_KEY = os.getenv("RMBG_API_KEY", "")
RMBG_LOCAL_BASE_URL = os.getenv("RMBG_LOCAL_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
RMBG_DEFAULT_VARIANT = os.getenv("RMBG_DEFAULT_VARIANT", "lite").strip().lower()
SYSTEM_PROMPT = os.getenv("SYSTEM_PROMPT", "You are a helpful assistant.")
MAX_HISTORY_MESSAGES = int(os.getenv("MAX_HISTORY_MESSAGES", "30"))
AI_REQUEST_TIMEOUT = float(os.getenv("REQUEST_TIMEOUT", "120"))
IMAGE_POLL_INTERVAL = float(os.getenv("IMAGE_POLL_INTERVAL", "2"))

CHAT_MODELS = model_list("CHAT_MODELS", CHAT_MODEL, ["gpt-4o-mini", "gemini-3.1-flash-image-preview-2k"])
IMAGE_MODELS = model_list("IMAGE_MODELS", IMAGE_MODEL, ["nano-banana-pro"])
VIDEO_MODELS = model_list(
    "VIDEO_MODELS",
    VIDEO_MODEL,
    [
        "veo3-fast",
        "veo3",
        "veo2-fast",
        "sora-2",
        "sora-2-pro",
        "wan2.5-t2v-preview",
        "wan2.5-i2v-preview",
        "doubao-seedance-1-0-lite-t2v-250428",
        "doubao-seedance-1-0-lite-i2v-250428",
    ],
)


def ensure_runtime_dirs():
    for path in [OUTPUT_DIR, STATIC_DIR, WORKFLOW_DIR, CONVERSATION_DIR, CANVAS_DIR]:
        os.makedirs(path, exist_ok=True)
