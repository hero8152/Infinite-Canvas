from __future__ import annotations

import os
from typing import Dict, Optional


DEFAULT_APP_HOST = "0.0.0.0"
DEFAULT_APP_PORT = 3000


def resolve_runtime_paths(base_dir: str, data_root: Optional[str] = None) -> Dict[str, str]:
    app_dir = os.path.abspath(base_dir)
    writable_root = os.path.abspath(data_root) if data_root else app_dir
    data_dir = os.path.join(writable_root, "data")
    assets_dir = os.path.join(writable_root, "assets")
    static_dir = os.path.join(app_dir, "static")
    workflow_dir = os.path.join(app_dir, "workflows")

    paths = {
        "APP_DIR": app_dir,
        "APP_DATA_ROOT": writable_root,
        "WORKFLOW_DIR": workflow_dir,
        "WORKFLOW_PATH": os.path.join(workflow_dir, "Z-Image.json"),
        "STATIC_DIR": static_dir,
        "OUTPUT_DIR": os.path.join(writable_root, "output"),
        "ASSETS_DIR": assets_dir,
        "OUTPUT_INPUT_DIR": os.path.join(assets_dir, "input"),
        "OUTPUT_OUTPUT_DIR": os.path.join(assets_dir, "output"),
        "ASSET_LIBRARY_DIR": os.path.join(assets_dir, "library"),
        "LOCAL_UPLOAD_DIR": os.path.join(assets_dir, "uploads"),
        "HISTORY_FILE": os.path.join(writable_root, "history.json"),
        "API_ENV_FILE": os.path.join(writable_root, "API", ".env"),
        "DATA_DIR": data_dir,
        "CONVERSATION_DIR": os.path.join(data_dir, "conversations"),
        "CANVAS_DIR": os.path.join(data_dir, "canvases"),
        "ASSET_LIBRARY_PATH": os.path.join(data_dir, "asset_library.json"),
        "API_PROVIDERS_FILE": os.path.join(data_dir, "api_providers.json"),
        "RUNNINGHUB_WORKFLOW_STORE_FILE": os.path.join(data_dir, "runninghub_workflows.json"),
        "SHARED_FOLDERS_FILE": os.path.join(data_dir, "shared_folders.json"),
        "GLOBAL_CONFIG_FILE": os.path.join(writable_root, "global_config.json"),
    }
    paths["STATIC_RUNNINGHUB_DIR"] = os.path.join(paths["STATIC_DIR"], "runninghub")
    paths["STATIC_RUNNINGHUB_THUMBNAIL_DIR"] = os.path.join(paths["STATIC_RUNNINGHUB_DIR"], "thumbnails")
    paths["STATIC_RUNNINGHUB_API_PROVIDERS_FILE"] = os.path.join(
        paths["STATIC_RUNNINGHUB_DIR"], "api_providers.json"
    )
    return paths


def resolve_app_port(port_value: Optional[str | int], default_port: int = DEFAULT_APP_PORT) -> int:
    try:
        port = int(str(port_value or "").strip())
    except (TypeError, ValueError):
        return default_port
    return port if 1 <= port <= 65535 else default_port


def app_base_url(port: Optional[str | int] = DEFAULT_APP_PORT, host: str = "127.0.0.1") -> str:
    resolved = resolve_app_port(port)
    return f"http://{host}:{resolved}"
