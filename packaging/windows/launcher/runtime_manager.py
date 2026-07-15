from __future__ import annotations

import hashlib
import json
import os
import socket
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
import zipfile
from pathlib import Path
from typing import Any

from app_runtime import DEFAULT_APP_HOST, DEFAULT_APP_PORT, app_base_url, resolve_app_port
from packaging.windows.launcher.config import load_install_config
from packaging.windows.launcher.layout import MODE_RUNTIME, LaunchLayout, compute_layout


MANIFEST_PATH = Path("bootstrap") / "manifest.json"
PAYLOAD_PATH = Path("bootstrap") / "app-base.zip"
CURRENT_RELEASE_FILE = "current.txt"
LAUNCHER_BACKUPS_DIR = "launcher"
BACKUP_METADATA_FILE = "metadata.json"
BACKUP_PAYLOAD_FILE = "payload.zip"
LAUNCHER_STATE_FILE = "launcher-state.json"
PAYLOAD_FINGERPRINT_FILE = ".payload-fingerprint"
PORT_SCAN_LIMIT = 100


def read_manifest(install_dir: Path) -> dict[str, Any]:
    return json.loads((install_dir / MANIFEST_PATH).read_text(encoding="utf-8"))


def read_version_from_text(path: Path) -> str:
    if not path.exists():
        return ""
    value = path.read_text(encoding="utf-8").strip().splitlines()
    return value[0].strip() if value else ""


def read_version_from_payload(install_dir: Path) -> str:
    payload = install_dir / PAYLOAD_PATH
    if not payload.exists():
        return ""
    try:
        with zipfile.ZipFile(payload) as archive:
            with archive.open("VERSION") as version_file:
                text = version_file.read().decode("utf-8", errors="replace").strip().splitlines()
                return text[0].strip() if text else ""
    except Exception:
        return ""


def payload_fingerprint(payload: Path) -> str:
    digest = hashlib.sha256()
    with payload.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def payload_ready_marker(install_dir: Path, fallback: str = "ready") -> str:
    payload = install_dir / PAYLOAD_PATH
    if payload.exists():
        return payload_fingerprint(payload)
    return fallback


def current_release_name(install_dir: Path) -> str:
    current_file = install_dir / CURRENT_RELEASE_FILE
    if current_file.exists():
        current_value = current_file.read_text(encoding="utf-8").strip()
        if current_value:
            return current_value
    version_value = read_version_from_text(install_dir / "VERSION")
    if version_value:
        return version_value
    payload_version = read_version_from_payload(install_dir)
    if payload_version:
        return payload_version
    return "current"


def current_payload_version(install_dir: Path) -> str:
    """Return the app version inside the active payload, not just the release pointer."""
    release_name = current_release_name(install_dir)
    candidates = [release_name]
    install_version = read_version_from_text(install_dir / "VERSION")
    if install_version:
        candidates.append(install_version)
    try:
        config = load_install_config(install_dir)
        runtime_version = read_version_from_text(config.storage_root / "runtime" / release_name / "VERSION")
        if runtime_version:
            candidates.append(runtime_version)
    except Exception:
        pass
    payload_version = read_version_from_payload(install_dir)
    if payload_version:
        candidates.append(payload_version)

    selected = candidates[0]
    for candidate in candidates[1:]:
        if compare_versions(candidate, selected) > 0:
            selected = candidate
    return selected


def ensure_storage_dirs(layout: LaunchLayout) -> None:
    for path in (layout.storage_root, layout.data_root, layout.logs_root, layout.backups_root, layout.runtime_root):
        path.mkdir(parents=True, exist_ok=True)


def launcher_backups_root(layout: LaunchLayout) -> Path:
    return layout.backups_root / LAUNCHER_BACKUPS_DIR


def launcher_state_path(layout: LaunchLayout) -> Path:
    return layout.data_root / LAUNCHER_STATE_FILE


def load_launcher_state(layout: LaunchLayout) -> dict[str, Any]:
    path = launcher_state_path(layout)
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_launcher_state(layout: LaunchLayout, state: dict[str, Any]) -> None:
    path = launcher_state_path(layout)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def is_port_available(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind((host, port))
        except OSError:
            return False
    return True


def select_launch_port(layout: LaunchLayout, preferred_port: int | str | None = None) -> tuple[int, bool]:
    state = load_launcher_state(layout)
    requested = resolve_app_port(preferred_port, DEFAULT_APP_PORT)
    last_port = resolve_app_port(state.get("last_port"), requested)
    candidates: list[int] = []
    for value in (requested, last_port, DEFAULT_APP_PORT):
        port = resolve_app_port(value, DEFAULT_APP_PORT)
        if port not in candidates:
            candidates.append(port)
    base = DEFAULT_APP_PORT
    for offset in range(0, PORT_SCAN_LIMIT):
        port = base + offset
        if 1 <= port <= 65535 and port not in candidates:
            candidates.append(port)
    for port in candidates:
        if is_port_available(port):
            return port, port != requested
    raise RuntimeError("未找到可用端口，请关闭占用端口的程序后重试。")


def persist_selected_port(layout: LaunchLayout, port: int) -> None:
    state = load_launcher_state(layout)
    state["last_port"] = port
    save_launcher_state(layout, state)


def ensure_runtime_release(layout: LaunchLayout, install_dir: Path, release_name: str) -> Path:
    release_dir = layout.runtime_root / release_name
    payload = install_dir / PAYLOAD_PATH
    fingerprint = payload_fingerprint(payload)
    fingerprint_file = release_dir / PAYLOAD_FINGERPRINT_FILE
    if release_dir.exists() and read_version_from_text(fingerprint_file) == fingerprint:
        return release_dir
    if release_dir.exists() and compare_versions(read_version_from_text(release_dir / "VERSION"), read_version_from_payload(install_dir)) > 0:
        return release_dir
    if release_dir.exists():
        shutil.rmtree(release_dir)
    release_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(payload) as archive:
        archive.extractall(release_dir)
    fingerprint_file.write_text(f"{fingerprint}\n", encoding="utf-8")
    (install_dir / CURRENT_RELEASE_FILE).write_text(f"{release_name}\n", encoding="utf-8")
    return release_dir


def build_launch_env(layout: LaunchLayout, launcher_exe: str = "", port: int = DEFAULT_APP_PORT) -> dict[str, str]:
    env = os.environ.copy()
    manifest = read_manifest(layout.install_dir)
    env["INFINITE_CANVAS_DATA_ROOT"] = str(layout.storage_root)
    env["INFINITE_CANVAS_MANAGED_BY_LAUNCHER"] = "1"
    env["INFINITE_CANVAS_LAUNCHER_MODE"] = layout.mode
    env["INFINITE_CANVAS_UPDATE_BASE_URL"] = str(manifest.get("update_base_url") or "").strip()
    env["INFINITE_CANVAS_UPDATE_VERSION_ENDPOINT"] = str(manifest.get("version_endpoint") or "windows-VERSION").strip()
    env["INFINITE_CANVAS_UPDATE_MANIFEST_ENDPOINT"] = str(manifest.get("manifest_endpoint") or "windows-manifest.json").strip()
    env["INFINITE_CANVAS_UPDATE_PAYLOAD_ENDPOINT"] = str(manifest.get("payload_endpoint") or "windows-app-base.zip").strip()
    env["INFINITE_CANVAS_PORT"] = str(resolve_app_port(port, DEFAULT_APP_PORT))
    env["INFINITE_CANVAS_HOST"] = DEFAULT_APP_HOST
    if launcher_exe:
        env["INFINITE_CANVAS_LAUNCHER_EXE"] = launcher_exe
    return env


def python_executable(work_dir: Path) -> Path:
    candidate = work_dir / "python" / "python.exe"
    if candidate.exists():
        return candidate
    return Path(sys.executable)


def service_executable(layout: LaunchLayout) -> Path:
    return layout.install_dir / "Infinite Canvas Service" / "Infinite Canvas Service.exe"


def launch_server(layout: LaunchLayout, launcher_exe: str = "", port: int = DEFAULT_APP_PORT) -> subprocess.Popen[str]:
    env = build_launch_env(layout, launcher_exe=launcher_exe, port=port)
    service = service_executable(layout)
    if service.exists():
        return subprocess.Popen(
            [str(service)],
            cwd=str(layout.work_dir),
            env=env,
        )
    pyexe = python_executable(layout.work_dir)
    return subprocess.Popen(
        [str(pyexe), "main.py"],
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


def prepare_layout(install_dir: Path) -> LaunchLayout:
    config = load_install_config(install_dir)
    release_name = current_release_name(install_dir)
    layout = compute_layout(config.install_dir, config.storage_root, release_name=release_name)
    ensure_storage_dirs(layout)
    if layout.mode == MODE_RUNTIME:
        work_dir = ensure_runtime_release(layout, install_dir, release_name)
        layout = LaunchLayout(
            install_dir=layout.install_dir,
            storage_root=layout.storage_root,
            data_root=layout.data_root,
            logs_root=layout.logs_root,
            backups_root=layout.backups_root,
            runtime_root=layout.runtime_root,
            mode=layout.mode,
            work_dir=work_dir,
        )
    return layout


def copy_payload_for_in_place(install_dir: Path) -> None:
    manifest = read_manifest(install_dir)
    payload_entries = normalized_payload_entries(manifest.get("payload_entries") or [])
    if not payload_entries:
        return
    payload = install_dir / PAYLOAD_PATH
    fingerprint = payload_fingerprint(payload)
    payload_marker = install_dir / ".payload-ready"
    marker_value = payload_marker.read_text(encoding="utf-8").strip() if payload_marker.exists() else ""
    installed_version = read_version_from_text(install_dir / "VERSION")
    payload_version = read_version_from_payload(install_dir)
    if installed_version and payload_version and compare_versions(payload_version, installed_version) < 0:
        payload_marker.write_text(f"{fingerprint}\n", encoding="utf-8")
        return
    if marker_value == fingerprint and payload_matches_install(install_dir, payload, payload_entries):
        return
    with zipfile.ZipFile(payload) as archive:
        archive.extractall(install_dir)
    payload_marker.write_text(f"{fingerprint}\n", encoding="utf-8")


def normalized_payload_entries(raw_entries: list[Any]) -> list[str]:
    entries = []
    for value in raw_entries:
        item = str(value or "").replace("\\", "/").lstrip("/")
        if not item or item.endswith("/") or ".." in item.split("/"):
            continue
        entries.append(item)
    return sorted(dict.fromkeys(entries))


def payload_matches_install(install_dir: Path, payload: Path, entries: list[str]) -> bool:
    try:
        with zipfile.ZipFile(payload) as archive:
            for relative in entries:
                try:
                    info = archive.getinfo(relative)
                except KeyError:
                    return False
                target = install_dir / relative
                if not target.is_file() or target.stat().st_size != info.file_size:
                    return False
                with archive.open(info) as source:
                    if target.read_bytes() != source.read():
                        return False
    except Exception:
        return False
    return True


def replace_in_place_payload(target_dir: Path, payload_zip: Path) -> None:
    with tempfile.TemporaryDirectory() as tempdir:
        temp_root = Path(tempdir)
        with zipfile.ZipFile(payload_zip) as archive:
            archive.extractall(temp_root)

        for entry in temp_root.iterdir():
            destination = target_dir / entry.name
            if destination.is_dir():
                shutil.rmtree(destination)
            elif destination.exists():
                destination.unlink()

            if entry.is_dir():
                shutil.copytree(entry, destination)
            else:
                shutil.copy2(entry, destination)


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


def launcher_status(install_dir: Path) -> dict[str, str]:
    manifest = read_manifest(install_dir)
    release_name = current_release_name(install_dir)
    config = load_install_config(install_dir)
    layout = compute_layout(config.install_dir, config.storage_root, release_name=release_name)
    state = load_launcher_state(layout)
    return {
        "managed_by_launcher": "1",
        "mode": layout.mode,
        "storage_root": str(layout.storage_root),
        "work_dir": str(layout.work_dir),
        "update_base_url": str(manifest.get("update_base_url") or "").strip(),
        "version_endpoint": str(manifest.get("version_endpoint") or "windows-VERSION").strip(),
        "manifest_endpoint": str(manifest.get("manifest_endpoint") or "windows-manifest.json").strip(),
        "payload_endpoint": str(manifest.get("payload_endpoint") or "windows-app-base.zip").strip(),
        "last_port": str(resolve_app_port(state.get("last_port"), DEFAULT_APP_PORT)),
    }


def resolve_runtime_context(install_dir: Path) -> LaunchLayout:
    config = load_install_config(install_dir)
    provisional = compute_layout(config.install_dir, config.storage_root, release_name=current_release_name(install_dir))
    ensure_storage_dirs(provisional)
    if provisional.mode == MODE_RUNTIME:
        return prepare_layout(install_dir)
    copy_payload_for_in_place(install_dir)
    return prepare_layout(install_dir)


def payload_entries_for_backup(install_dir: Path) -> list[str]:
    try:
        manifest = read_manifest(install_dir)
    except Exception:
        manifest = {}
    raw_entries = manifest.get("payload_entries") or []
    entries = []
    for value in raw_entries:
        item = str(value or "").replace("\\", "/").lstrip("/")
        if not item or item.endswith("/") or ".." in item.split("/"):
            continue
        entries.append(item)
    if entries:
        return sorted(dict.fromkeys(entries))
    payload = install_dir / PAYLOAD_PATH
    if not payload.exists():
        return []
    with zipfile.ZipFile(payload) as archive:
        return sorted(
            {
                name for name in archive.namelist()
                if name and not name.endswith("/") and ".." not in name.split("/")
            }
        )


def count_files(root: Path) -> int:
    if not root.exists():
        return 0
    return sum(1 for child in root.rglob("*") if child.is_file())


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


def prepare_backup_layout(install_dir: Path) -> LaunchLayout:
    config = load_install_config(install_dir)
    layout = compute_layout(
        config.install_dir,
        config.storage_root,
        release_name=current_release_name(install_dir),
    )
    ensure_storage_dirs(layout)
    launcher_backups_root(layout).mkdir(parents=True, exist_ok=True)
    return layout


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


def snapshot_in_place_payload(install_dir: Path, snapshot_zip: Path) -> int:
    file_count = 0
    with zipfile.ZipFile(snapshot_zip, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for relative in payload_entries_for_backup(install_dir):
            source = install_dir / relative
            if not source.is_file():
                continue
            archive.write(source, relative)
            file_count += 1
    return file_count


def create_update_backup(install_dir: Path, target_version: str) -> dict[str, Any]:
    layout = prepare_backup_layout(install_dir)
    source_version = current_release_name(install_dir)
    backup_dir = next_backup_dir(launcher_backups_root(layout), source_version)
    backup_dir.mkdir(parents=True, exist_ok=False)
    metadata: dict[str, Any] = {
        "id": backup_dir.name,
        "name": backup_dir.name,
        "created_at": int(time.time()),
        "mode": layout.mode,
        "source_version": source_version,
        "target_version": str(target_version or "").strip(),
    }
    if layout.mode == MODE_RUNTIME:
        release_dir = layout.runtime_root / source_version
        if not release_dir.exists():
            release_dir = ensure_runtime_release(layout, install_dir, source_version)
        metadata["kind"] = "runtime_release"
        metadata["file_count"] = count_files(release_dir)
    else:
        snapshot_path = backup_dir / BACKUP_PAYLOAD_FILE
        metadata["kind"] = "in_place_snapshot"
        metadata["archive_name"] = BACKUP_PAYLOAD_FILE
        metadata["file_count"] = snapshot_in_place_payload(install_dir, snapshot_path)
    backup_metadata_path(backup_dir).write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return metadata


def list_launcher_backups(install_dir: Path) -> list[dict[str, Any]]:
    layout = prepare_backup_layout(install_dir)
    items: list[dict[str, Any]] = []
    for metadata_file in sorted(launcher_backups_root(layout).glob(f"*/{BACKUP_METADATA_FILE}")):
        try:
            items.append(read_backup_metadata(metadata_file.parent))
        except Exception:
            continue
    items.sort(key=lambda item: (int(item.get("created_at") or 0), str(item.get("id") or "")), reverse=True)
    return items


def resolve_backup_dir(layout: LaunchLayout, backup_id: str) -> Path:
    candidate = (launcher_backups_root(layout) / backup_id).resolve()
    root = launcher_backups_root(layout).resolve()
    if os.path.commonpath([str(root), str(candidate)]) != str(root):
        raise ValueError("backup path is unsafe")
    return candidate


def rollback_launcher_backup(install_dir: Path, backup_id: str) -> dict[str, Any]:
    layout = prepare_backup_layout(install_dir)
    backup_dir = resolve_backup_dir(layout, backup_id)
    if not backup_dir.exists():
        raise FileNotFoundError(f"backup not found: {backup_id}")
    metadata = read_backup_metadata(backup_dir)
    source_version = str(metadata.get("source_version") or "").strip()
    kind = str(metadata.get("kind") or "").strip()
    restored_count = 0
    if kind == "runtime_release":
        release_dir = layout.runtime_root / source_version
        if not release_dir.exists():
            raise FileNotFoundError(f"runtime release missing: {release_dir}")
        (layout.install_dir / CURRENT_RELEASE_FILE).write_text(f"{source_version}\n", encoding="utf-8")
        restored_count = count_files(release_dir)
    elif kind == "in_place_snapshot":
        snapshot_name = str(metadata.get("archive_name") or BACKUP_PAYLOAD_FILE).strip() or BACKUP_PAYLOAD_FILE
        snapshot_zip = backup_dir / snapshot_name
        if not snapshot_zip.exists():
            raise FileNotFoundError(f"backup snapshot missing: {snapshot_zip}")
        replace_in_place_payload(layout.install_dir, snapshot_zip)
        (layout.install_dir / ".payload-ready").write_text(
            f"{payload_ready_marker(layout.install_dir, fallback='restored')}\n",
            encoding="utf-8",
        )
        restored_count = int(metadata.get("file_count") or 0)
    else:
        raise ValueError(f"unsupported backup kind: {kind}")
    return {
        "ok": True,
        "backup_id": backup_id,
        "name": metadata.get("name") or backup_id,
        "mode": metadata.get("mode") or layout.mode,
        "restored_version": source_version,
        "count": restored_count,
    }
