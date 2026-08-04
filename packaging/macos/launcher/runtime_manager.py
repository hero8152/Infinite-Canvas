from __future__ import annotations

import hashlib
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
import zipfile
from pathlib import Path
from typing import Any

from app_runtime import DEFAULT_APP_HOST, DEFAULT_APP_PORT, app_base_url, resolve_app_port
from packaging.macos.launcher.layout import MODE_RUNTIME, MacLaunchLayout, compute_layout, storage_root_from_env


MANIFEST_PATH = Path("bootstrap") / "manifest.json"
PAYLOAD_PATH = Path("bootstrap") / "app-base.zip"
CURRENT_RELEASE_FILE = "current.txt"
LAUNCHER_BACKUPS_DIR = "launcher"
BACKUP_METADATA_FILE = "metadata.json"
BACKUP_PAYLOAD_FILE = "payload.zip"
LAUNCHER_STATE_FILE = "launcher-state.json"
PAYLOAD_FINGERPRINT_FILE = ".payload-fingerprint"
PORT_SCAN_LIMIT = 100


def read_manifest(layout: MacLaunchLayout) -> dict[str, Any]:
    return json.loads((layout.bootstrap_dir / "manifest.json").read_text(encoding="utf-8"))


def read_version_from_text(path: Path) -> str:
    if not path.exists():
        return ""
    lines = path.read_text(encoding="utf-8").strip().splitlines()
    return lines[0].strip() if lines else ""


def read_version_from_payload(layout: MacLaunchLayout) -> str:
    payload = layout.bootstrap_dir / "app-base.zip"
    if not payload.exists():
        return ""
    try:
        with zipfile.ZipFile(payload) as archive:
            with archive.open("VERSION") as version_file:
                lines = version_file.read().decode("utf-8", errors="replace").strip().splitlines()
                return lines[0].strip() if lines else ""
    except Exception:
        return ""


def payload_fingerprint(payload: Path) -> str:
    digest = hashlib.sha256()
    with payload.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def current_release_name(app_bundle: Path, storage_root: str | Path | None = None) -> str:
    provisional = compute_layout(app_bundle, storage_root=storage_root)
    current_file = provisional.current_release_file
    value = read_version_from_text(current_file)
    if value:
        return value
    payload_version = read_version_from_payload(provisional)
    if payload_version:
        return payload_version
    return "current"


def current_payload_version(app_bundle: Path, storage_root: str | Path | None = None) -> str:
    """Return the app version inside the active runtime, not just current.txt."""
    release_name = current_release_name(app_bundle, storage_root=storage_root)
    layout = compute_layout(app_bundle, storage_root=storage_root, release_name=release_name)
    candidates = [release_name]
    runtime_version = read_version_from_text(layout.runtime_root / release_name / "VERSION")
    if runtime_version:
        candidates.append(runtime_version)
    payload_version = read_version_from_payload(layout)
    if payload_version:
        candidates.append(payload_version)

    selected = candidates[0]
    for candidate in candidates[1:]:
        if compare_versions(candidate, selected) > 0:
            selected = candidate
    return selected


def ensure_storage_dirs(layout: MacLaunchLayout) -> None:
    for path in (layout.storage_root, layout.data_root, layout.logs_root, layout.backups_root, layout.runtime_root):
        path.mkdir(parents=True, exist_ok=True)


def launcher_backups_root(layout: MacLaunchLayout) -> Path:
    return layout.backups_root / LAUNCHER_BACKUPS_DIR


def launcher_state_path(layout: MacLaunchLayout) -> Path:
    return layout.data_root / LAUNCHER_STATE_FILE


def load_launcher_state(layout: MacLaunchLayout) -> dict[str, Any]:
    path = launcher_state_path(layout)
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_launcher_state(layout: MacLaunchLayout, state: dict[str, Any]) -> None:
    path = launcher_state_path(layout)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def is_port_available(port: int, host: str = DEFAULT_APP_HOST) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind((host, port))
        except OSError:
            return False
    return True


def select_launch_port(layout: MacLaunchLayout, preferred_port: int | str | None = None) -> tuple[int, bool]:
    state = load_launcher_state(layout)
    requested = resolve_app_port(preferred_port, DEFAULT_APP_PORT)
    last_port = resolve_app_port(state.get("last_port"), requested)
    candidates: list[int] = []
    for value in (requested, last_port, DEFAULT_APP_PORT):
        port = resolve_app_port(value, DEFAULT_APP_PORT)
        if port not in candidates:
            candidates.append(port)
    for offset in range(0, PORT_SCAN_LIMIT):
        port = DEFAULT_APP_PORT + offset
        if 1 <= port <= 65535 and port not in candidates:
            candidates.append(port)
    for port in candidates:
        if is_port_available(port):
            return port, port != requested
    raise RuntimeError("未找到可用端口，请关闭占用端口的程序后重试。")


def persist_selected_port(layout: MacLaunchLayout, port: int) -> None:
    state = load_launcher_state(layout)
    state["last_port"] = port
    save_launcher_state(layout, state)


def ensure_runtime_release(layout: MacLaunchLayout, release_name: str) -> Path:
    release_dir = layout.runtime_root / release_name
    payload = layout.bootstrap_dir / "app-base.zip"
    fingerprint = payload_fingerprint(payload)
    fingerprint_file = release_dir / PAYLOAD_FINGERPRINT_FILE
    if release_dir.exists() and read_version_from_text(fingerprint_file) == fingerprint:
        return release_dir
    if release_dir.exists() and compare_versions(read_version_from_text(release_dir / "VERSION"), read_version_from_payload(layout)) > 0:
        return release_dir
    if release_dir.exists():
        shutil.rmtree(release_dir)
    release_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(payload) as archive:
        archive.extractall(release_dir)
    fingerprint_file.write_text(f"{fingerprint}\n", encoding="utf-8")
    layout.current_release_file.write_text(f"{release_name}\n", encoding="utf-8")
    return release_dir


def prepare_layout(app_bundle: Path, storage_root: str | Path | None = None) -> MacLaunchLayout:
    release_name = current_release_name(app_bundle, storage_root=storage_root)
    layout = compute_layout(app_bundle, storage_root=storage_root, release_name=release_name)
    ensure_storage_dirs(layout)
    work_dir = ensure_runtime_release(layout, release_name)
    return compute_layout(app_bundle, storage_root=storage_root, release_name=work_dir.name)


def build_launch_env(layout: MacLaunchLayout, launcher_exe: str = "", port: int = DEFAULT_APP_PORT) -> dict[str, str]:
    env = os.environ.copy()
    manifest = read_manifest(layout)
    env["INFINITE_CANVAS_DATA_ROOT"] = str(layout.storage_root)
    env["INFINITE_CANVAS_STORAGE_ROOT"] = str(layout.storage_root)
    env["INFINITE_CANVAS_MANAGED_BY_LAUNCHER"] = "1"
    env["INFINITE_CANVAS_LAUNCHER_MODE"] = layout.mode
    env["INFINITE_CANVAS_UPDATE_BASE_URL"] = str(manifest.get("update_base_url") or "").strip()
    env["INFINITE_CANVAS_UPDATE_VERSION_ENDPOINT"] = str(manifest.get("version_endpoint") or "macos-VERSION").strip()
    env["INFINITE_CANVAS_UPDATE_MANIFEST_ENDPOINT"] = str(manifest.get("manifest_endpoint") or "macos-manifest.json").strip()
    env["INFINITE_CANVAS_UPDATE_PAYLOAD_ENDPOINT"] = str(manifest.get("payload_endpoint") or "macos-app-base.zip").strip()
    env["INFINITE_CANVAS_PORT"] = str(resolve_app_port(port, DEFAULT_APP_PORT))
    env["INFINITE_CANVAS_HOST"] = DEFAULT_APP_HOST
    if launcher_exe:
        env["INFINITE_CANVAS_LAUNCHER_EXE"] = launcher_exe
    return env


def service_executable(layout: MacLaunchLayout) -> Path:
    return layout.contents_dir / "MacOS" / "Infinite Canvas Service"


def service_runner_script(layout: MacLaunchLayout) -> Path:
    script = layout.data_root / "run-service.py"
    script.write_text(
        "import runpy\n"
        "runpy.run_path('main.py', run_name='__main__')\n",
        encoding="utf-8",
    )
    return script


def launch_server(
    layout: MacLaunchLayout,
    launcher_exe: str = "",
    port: int = DEFAULT_APP_PORT,
) -> subprocess.Popen[str]:
    env = build_launch_env(layout, launcher_exe=launcher_exe, port=port)
    service = service_executable(layout)
    command = [str(service)] if service.exists() else [sys.executable, str(service_runner_script(layout))]
    return subprocess.Popen(
        command,
        cwd=str(layout.work_dir),
        env=env,
    )


def wait_for_server(port: int = DEFAULT_APP_PORT, timeout_seconds: int = 25) -> bool:
    url = app_base_url(port) + "/api/app-info"
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.status == 200:
                    return True
        except Exception:
            time.sleep(0.5)
    return False


def resolve_runtime_context(app_bundle: Path, storage_root: str | Path | None = None) -> MacLaunchLayout:
    configured_storage_root = storage_root or storage_root_from_env() or None
    return prepare_layout(app_bundle, storage_root=configured_storage_root)


def compare_versions(left: str, right: str) -> int:
    def normalize(value: str) -> list[int]:
        parts = []
        for item in str(value or "").replace("-", ".").split("."):
            item = item.strip()
            if not item:
                continue
            try:
                parts.append(int(item))
            except ValueError:
                parts.append(0)
        return parts or [0]

    a = normalize(left)
    b = normalize(right)
    size = max(len(a), len(b))
    a.extend([0] * (size - len(a)))
    b.extend([0] * (size - len(b)))
    if a > b:
        return 1
    if a < b:
        return -1
    return 0


def count_files(root: Path) -> int:
    if not root.exists():
        return 0
    return sum(1 for child in root.rglob("*") if child.is_file())


def launcher_status(app_bundle: Path, storage_root: str | Path | None = None) -> dict[str, str]:
    layout = resolve_runtime_context(app_bundle, storage_root=storage_root)
    manifest = read_manifest(layout)
    state = load_launcher_state(layout)
    return {
        "managed_by_launcher": "1",
        "mode": layout.mode,
        "storage_root": str(layout.storage_root),
        "work_dir": str(layout.work_dir),
        "update_base_url": str(manifest.get("update_base_url") or "").strip(),
        "version_endpoint": str(manifest.get("version_endpoint") or "macos-VERSION").strip(),
        "manifest_endpoint": str(manifest.get("manifest_endpoint") or "macos-manifest.json").strip(),
        "payload_endpoint": str(manifest.get("payload_endpoint") or "macos-app-base.zip").strip(),
        "last_port": str(resolve_app_port(state.get("last_port"), DEFAULT_APP_PORT)),
    }


def replace_payload(target_dir: Path, payload_zip: Path) -> None:
    with tempfile.TemporaryDirectory() as tempdir:
        temp_root = Path(tempdir)
        with zipfile.ZipFile(payload_zip) as archive:
            archive.extractall(temp_root)
        if target_dir.exists():
            shutil.rmtree(target_dir)
        shutil.copytree(temp_root, target_dir)


def backup_metadata_path(backup_dir: Path) -> Path:
    return backup_dir / BACKUP_METADATA_FILE


def read_backup_metadata(backup_dir: Path) -> dict[str, Any]:
    metadata = json.loads(backup_metadata_path(backup_dir).read_text(encoding="utf-8"))
    metadata.setdefault("id", backup_dir.name)
    metadata.setdefault("name", backup_dir.name)
    metadata.setdefault("file_count", 0)
    metadata.setdefault("created_at", 0)
    metadata.setdefault("source_version", "")
    metadata.setdefault("target_version", "")
    metadata.setdefault("kind", "")
    metadata.setdefault("mode", "")
    return metadata


def next_backup_dir(backups_root: Path, source_version: str) -> Path:
    safe_version = "".join(ch if ch.isalnum() or ch in "._-" else "-" for ch in (source_version or "unknown"))
    safe_version = safe_version.strip(".-") or "unknown"
    prefix = f"{time.strftime('%Y%m%d-%H%M%S')}-{safe_version}"
    candidate = backups_root / prefix
    suffix = 1
    while candidate.exists():
        candidate = backups_root / f"{prefix}-{suffix}"
        suffix += 1
    return candidate


def create_update_backup(app_bundle: Path, target_version: str, storage_root: str | Path | None = None) -> dict[str, Any]:
    layout = resolve_runtime_context(app_bundle, storage_root=storage_root)
    source_version = current_release_name(app_bundle, storage_root=layout.storage_root)
    backups_root = launcher_backups_root(layout)
    backups_root.mkdir(parents=True, exist_ok=True)
    backup_dir = next_backup_dir(backups_root, source_version)
    backup_dir.mkdir(parents=True, exist_ok=False)
    release_dir = layout.runtime_root / source_version
    if not release_dir.exists():
        release_dir = ensure_runtime_release(layout, source_version)
    metadata: dict[str, Any] = {
        "id": backup_dir.name,
        "name": backup_dir.name,
        "created_at": int(time.time()),
        "mode": MODE_RUNTIME,
        "kind": "runtime_release",
        "source_version": source_version,
        "target_version": str(target_version or "").strip(),
        "file_count": count_files(release_dir),
    }
    backup_metadata_path(backup_dir).write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return metadata


def list_launcher_backups(app_bundle: Path, storage_root: str | Path | None = None) -> list[dict[str, Any]]:
    layout = resolve_runtime_context(app_bundle, storage_root=storage_root)
    items: list[dict[str, Any]] = []
    for metadata_file in sorted(launcher_backups_root(layout).glob(f"*/{BACKUP_METADATA_FILE}")):
        try:
            items.append(read_backup_metadata(metadata_file.parent))
        except Exception:
            continue
    items.sort(key=lambda item: (int(item.get("created_at") or 0), str(item.get("id") or "")), reverse=True)
    return items


def resolve_backup_dir(layout: MacLaunchLayout, backup_id: str) -> Path:
    candidate = (launcher_backups_root(layout) / backup_id).resolve()
    root = launcher_backups_root(layout).resolve()
    if os.path.commonpath([str(root), str(candidate)]) != str(root):
        raise ValueError("backup path is unsafe")
    return candidate


def rollback_launcher_backup(app_bundle: Path, backup_id: str, storage_root: str | Path | None = None) -> dict[str, Any]:
    layout = resolve_runtime_context(app_bundle, storage_root=storage_root)
    backup_dir = resolve_backup_dir(layout, backup_id)
    if not backup_dir.exists():
        raise FileNotFoundError(f"backup not found: {backup_id}")
    metadata = read_backup_metadata(backup_dir)
    source_version = str(metadata.get("source_version") or "").strip()
    release_dir = layout.runtime_root / source_version
    if not release_dir.exists():
        raise FileNotFoundError(f"runtime release missing: {release_dir}")
    layout.current_release_file.write_text(f"{source_version}\n", encoding="utf-8")
    return {
        "ok": True,
        "backup_id": backup_id,
        "name": metadata.get("name") or backup_id,
        "mode": MODE_RUNTIME,
        "restored_version": source_version,
        "count": count_files(release_dir),
    }
