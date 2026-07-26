from __future__ import annotations

import argparse
import os
import sys
import json
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Optional


@dataclass(frozen=True)
class RuntimeOptions:
    host: str
    port: int
    data_dir: str
    app_root: str
    portable_root: str
    desktop_token: str
    parent_pid: int
    mode: str


def bootstrap_runtime(argv: Optional[Iterable[str]] = None) -> RuntimeOptions:
    """Read backend flags before main.py resolves any filesystem paths."""

    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--host", default=os.getenv("CANVAS_HOST", "0.0.0.0"))
    parser.add_argument("--port", type=int, default=int(os.getenv("CANVAS_PORT", "3000")))
    parser.add_argument("--data-dir", default=os.getenv("CANVAS_DATA_DIR", ""))
    parser.add_argument("--app-root", default=os.getenv("CANVAS_APP_ROOT", ""))
    parser.add_argument("--portable-root", default=os.getenv("CANVAS_PORTABLE_ROOT", ""))
    parser.add_argument("--desktop-token", default=os.getenv("CANVAS_DESKTOP_TOKEN", ""))
    parser.add_argument("--parent-pid", type=int, default=int(os.getenv("CANVAS_PARENT_PID", "0") or 0))
    parser.add_argument("--runtime-mode", default=os.getenv("CANVAS_RUNTIME_MODE", "source"))
    parsed, _unknown = parser.parse_known_args(list(argv) if argv is not None else sys.argv[1:])

    if not (1 <= parsed.port <= 65535):
        raise ValueError(f"端口必须位于 1-65535：{parsed.port}")

    env_updates = {
        "CANVAS_HOST": parsed.host,
        "CANVAS_PORT": str(parsed.port),
        "CANVAS_DATA_DIR": parsed.data_dir,
        "CANVAS_APP_ROOT": parsed.app_root,
        "CANVAS_PORTABLE_ROOT": parsed.portable_root,
        "CANVAS_DESKTOP_TOKEN": parsed.desktop_token,
        "CANVAS_PARENT_PID": str(parsed.parent_pid),
        "CANVAS_RUNTIME_MODE": parsed.runtime_mode,
    }
    for key, value in env_updates.items():
        if value != "":
            os.environ[key] = value

    return RuntimeOptions(
        host=str(parsed.host),
        port=int(parsed.port),
        data_dir=str(parsed.data_dir),
        app_root=str(parsed.app_root),
        portable_root=str(parsed.portable_root),
        desktop_token=str(parsed.desktop_token),
        parent_pid=max(0, int(parsed.parent_pid)),
        mode=str(parsed.runtime_mode or "source"),
    )


RUNTIME_OPTIONS = bootstrap_runtime()

_ACTIVE_SERVER = None


def request_shutdown() -> bool:
    server = _ACTIVE_SERVER
    if server is None:
        return False
    server.should_exit = True
    return True


def _write_runtime_state(status: str) -> None:
    root = Path(RUNTIME_OPTIONS.data_dir or os.getenv("CANVAS_DATA_DIR", "data")) / "run"
    root.mkdir(parents=True, exist_ok=True)
    payload = {
        "pid": os.getpid(),
        "parent_pid": RUNTIME_OPTIONS.parent_pid,
        "host": RUNTIME_OPTIONS.host,
        "port": RUNTIME_OPTIONS.port,
        "mode": RUNTIME_OPTIONS.mode,
        "status": status,
        "updated_at": int(time.time() * 1000),
    }
    temp = root / ".backend.json.tmp"
    temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temp, root / "backend.json")
    (root / "backend.pid").write_text(str(os.getpid()) + "\n", encoding="ascii")


def _parent_alive(parent_pid: int) -> bool:
    if parent_pid <= 0:
        return True
    if os.name != "nt":
        try:
            os.kill(parent_pid, 0)
            return True
        except OSError:
            return False
    import ctypes
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    handle = kernel32.OpenProcess(0x00100000, False, parent_pid)
    if not handle:
        return False
    try:
        return kernel32.WaitForSingleObject(handle, 0) == 0x00000102
    finally:
        kernel32.CloseHandle(handle)


def _watch_parent() -> None:
    while _parent_alive(RUNTIME_OPTIONS.parent_pid):
        time.sleep(1)
    request_shutdown()


def run_uvicorn(app) -> None:
    import uvicorn
    global _ACTIVE_SERVER
    config = uvicorn.Config(
        app,
        host=RUNTIME_OPTIONS.host,
        port=RUNTIME_OPTIONS.port,
        ws_ping_interval=None,
        ws_ping_timeout=None,
        workers=1,
    )
    server = uvicorn.Server(config)
    _ACTIVE_SERVER = server
    _write_runtime_state("starting")
    if RUNTIME_OPTIONS.parent_pid:
        threading.Thread(target=_watch_parent, name="canvas-parent-watch", daemon=True).start()
    try:
        _write_runtime_state("running")
        server.run()
    finally:
        _write_runtime_state("stopped")
        pid_file = Path(RUNTIME_OPTIONS.data_dir or os.getenv("CANVAS_DATA_DIR", "data")) / "run" / "backend.pid"
        try:
            pid_file.unlink()
        except FileNotFoundError:
            pass
        _ACTIVE_SERVER = None
