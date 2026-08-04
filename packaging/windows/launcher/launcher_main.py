from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
import webbrowser
import zipfile
from pathlib import Path
from typing import Any

from app_runtime import DEFAULT_APP_PORT, app_base_url
from packaging.windows.launcher.runtime_manager import (
    compare_versions,
    create_update_backup,
    current_payload_version,
    launch_server,
    list_launcher_backups,
    load_launcher_state,
    read_manifest,
    rollback_launcher_backup,
    select_launch_port,
    save_launcher_state,
    persist_selected_port,
    resolve_runtime_context,
    wait_for_server,
)


AUTO_UPDATE_ENV = "INFINITE_CANVAS_AUTO_UPDATE"
DEFAULT_VERSION_ENDPOINT = "windows-VERSION"
DEFAULT_PAYLOAD_ENDPOINT = "windows-app-base.zip"
PENDING_UPDATE_KEY = "pending_update"
LAUNCH_STARTING_NOTICE = (
    "Infinite Canvas 启动中。请不要关闭此终端窗口，关闭后程序会退出。"
)
LAUNCH_COMPLETE_NOTICE = "Infinite Canvas 启动完成。"


def default_install_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[3]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Infinite Canvas Windows launcher")
    parser.add_argument("--install-dir", type=Path, default=default_install_dir())
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--check-update", action="store_true")
    parser.add_argument("--apply-update", action="store_true")
    parser.add_argument("--list-backups", action="store_true")
    parser.add_argument("--rollback-backup", default="")
    return parser.parse_args()


def join_update_url(base_url: str, endpoint: str) -> str:
    return base_url.rstrip("/") + "/" + endpoint.lstrip("/")


def fetch_text(url: str) -> str:
    with urllib.request.urlopen(url, timeout=15) as response:
        return response.read().decode("utf-8", errors="replace")


def fetch_remote_version(base_url: str, endpoint: str) -> str | None:
    try:
        text = fetch_text(join_update_url(base_url, endpoint))
    except urllib.error.HTTPError as exc:
        if exc.code != 404:
            raise
        return None
    lines = text.strip().splitlines()
    return lines[0].strip() if lines else ""


def download_update_payload(base_url: str, endpoint: str, output_path: Path) -> str | None:
    payload_url = join_update_url(base_url, endpoint)
    try:
        with urllib.request.urlopen(payload_url, timeout=60) as response:
            output_path.write_bytes(response.read())
    except urllib.error.HTTPError as exc:
        if exc.code != 404:
            raise
        return None
    return payload_url


def read_update_payload_version(payload_path: Path) -> str:
    try:
        with zipfile.ZipFile(payload_path) as archive:
            with archive.open("VERSION") as version_file:
                lines = version_file.read().decode("utf-8", errors="replace").strip().splitlines()
                return lines[0].strip() if lines else ""
    except Exception:
        return ""


def check_for_updates(install_dir: Path) -> dict[str, str | bool]:
    manifest = read_manifest(install_dir)
    base_url = str(manifest.get("update_base_url") or "").strip()
    if not base_url:
        return {"ok": False, "detail": "未配置 update_base_url。"}
    current = current_payload_version(install_dir)
    remote = fetch_remote_version(base_url, str(manifest.get("version_endpoint") or DEFAULT_VERSION_ENDPOINT))
    if remote is None:
        return {
            "ok": True,
            "current_version": current,
            "has_update": False,
            "skipped": True,
            "detail": "远端 VERSION 不存在，跳过自动更新。",
        }
    if not remote:
        return {"ok": False, "current_version": current, "detail": "远端 VERSION 为空。"}
    return {
        "ok": True,
        "current_version": current,
        "remote_version": remote,
        "has_update": compare_versions(remote, current) > 0,
    }


def pending_update_from_state(install_dir: Path) -> dict[str, object] | None:
    layout = resolve_runtime_context(install_dir)
    state = load_launcher_state(layout)
    pending = state.get(PENDING_UPDATE_KEY)
    if not isinstance(pending, dict):
        return None
    remote = str(pending.get("remote_version") or "").strip()
    current = current_payload_version(install_dir)
    if remote and compare_versions(remote, current) > 0:
        return {
            "ok": True,
            "current_version": current,
            "remote_version": remote,
            "has_update": True,
            "pending_update": True,
        }
    if pending:
        state.pop(PENDING_UPDATE_KEY, None)
        save_launcher_state(layout, state)
    return None


def remember_update_check(install_dir: Path, check: dict[str, Any]) -> dict[str, Any]:
    if not check.get("ok"):
        return check
    layout = resolve_runtime_context(install_dir)
    state = load_launcher_state(layout)
    if check.get("has_update"):
        state[PENDING_UPDATE_KEY] = {
            "current_version": str(check.get("current_version") or "").strip(),
            "remote_version": str(check.get("remote_version") or "").strip(),
            "detected_at": int(time.time()),
        }
        save_launcher_state(layout, state)
        return {**check, "pending_update": True}
    state.pop(PENDING_UPDATE_KEY, None)
    save_launcher_state(layout, state)
    return {**check, "pending_update": False}


def clear_pending_update(install_dir: Path) -> None:
    layout = resolve_runtime_context(install_dir)
    state = load_launcher_state(layout)
    if PENDING_UPDATE_KEY in state:
        state.pop(PENDING_UPDATE_KEY, None)
        save_launcher_state(layout, state)


def check_for_updates_and_remember(install_dir: Path) -> dict[str, Any]:
    pending = pending_update_from_state(install_dir)
    if pending:
        return pending
    return remember_update_check(install_dir, dict(check_for_updates(install_dir)))


def launcher_runtime_status(install_dir: Path) -> dict[str, str | bool]:
    layout = resolve_runtime_context(install_dir)
    selected_port, port_changed = select_launch_port(layout)
    return {
        "ok": True,
        "port": selected_port,
        "port_changed": port_changed,
        "default_port": DEFAULT_APP_PORT,
        "local_url": app_base_url(selected_port) + "/",
        "mode": layout.mode,
    }


def print_startup_notice() -> None:
    print(LAUNCH_STARTING_NOTICE, flush=True)
    print("----------------------------------------", flush=True)


def print_launch_complete(port: int, browser_opened: bool) -> None:
    url = app_base_url(port) + "/"
    if browser_opened:
        print(f"{LAUNCH_COMPLETE_NOTICE}已打开网页：{url}", flush=True)
        return
    print(f"{LAUNCH_COMPLETE_NOTICE}访问地址：{url}", flush=True)


def print_launch_failed(port: int) -> None:
    print(f"Infinite Canvas 启动失败：服务未在端口 {port} 上按时就绪。", flush=True)


def apply_update_result(install_dir: Path) -> dict[str, object]:
    manifest = read_manifest(install_dir)
    base_url = str(manifest.get("update_base_url") or "").strip()
    if not base_url:
        return {"ok": False, "detail": "未配置 update_base_url。"}
    check = check_for_updates(install_dir)
    if not check.get("ok"):
        return dict(check)
    if not check.get("has_update"):
        clear_pending_update(install_dir)
        return {"ok": True, "updated": False, **check}

    updater = install_dir / "Infinite Canvas Updater.exe"
    if not updater.exists():
        return {**check, "ok": False, "detail": "缺少更新器可执行文件。"}

    with tempfile.TemporaryDirectory() as tempdir:
        payload_file = Path(tempdir) / "app-base.zip"
        payload_url = download_update_payload(base_url, str(manifest.get("payload_endpoint") or DEFAULT_PAYLOAD_ENDPOINT), payload_file)
        if not payload_url:
            return {**check, "ok": False, "detail": "远端 payload 不存在。"}
        payload_version = read_update_payload_version(payload_file)
        remote_version = str(check["remote_version"])
        if not payload_version:
            return {**check, "ok": False, "detail": "更新包 VERSION 为空或不可读取。"}
        if compare_versions(payload_version, remote_version) < 0:
            return {
                **check,
                "ok": False,
                "detail": f"更新包版本 {payload_version} 低于远端版本 {remote_version}，已取消更新。",
                "payload_version": payload_version,
            }
        backup = create_update_backup(install_dir, str(check["remote_version"]))
        result = subprocess.run(
            [
                str(updater),
                "--install-dir",
                str(install_dir),
                "--payload",
                str(payload_file),
                "--release-name",
                str(check["remote_version"]),
            ],
            check=False,
        )
        if result.returncode != 0:
            return {**check, "ok": False, "detail": f"更新器退出码 {result.returncode}", "returncode": result.returncode}
        installed_version = current_payload_version(install_dir)
        if compare_versions(installed_version, remote_version) < 0:
            return {
                **check,
                "ok": False,
                "updated": False,
                "detail": f"更新器返回成功，但安装版本仍为 {installed_version}，低于远端版本 {remote_version}。",
                "installed_version": installed_version,
                "payload_version": payload_version,
                "backup": backup,
            }
    clear_pending_update(install_dir)
    return {
        "ok": True,
        "updated": True,
        "backup": backup,
        **check,
        "current_version": installed_version,
        "has_update": False,
        "payload_version": payload_version,
    }


def apply_update(install_dir: Path) -> int:
    result = apply_update_result(install_dir)
    print(json.dumps(result, ensure_ascii=False))
    if result.get("ok"):
        return 0
    return int(result.get("returncode") or 1)


def auto_update_enabled() -> bool:
    value = str(os.environ.get(AUTO_UPDATE_ENV, "1")).strip().lower()
    return value not in {"0", "false", "no", "off"}


def try_auto_update_before_launch(install_dir: Path) -> dict[str, object]:
    if not auto_update_enabled():
        return {"ok": True, "updated": False, "skipped": True, "detail": "auto update disabled"}
    pending = pending_update_from_state(install_dir)
    if not pending:
        return {"ok": True, "updated": False, "skipped": True, "detail": "no pending update"}
    try:
        return apply_update_result(install_dir)
    except Exception as exc:
        return {"ok": False, "updated": False, "detail": f"自动更新检查失败：{exc}"}


def check_for_updates_in_background(install_dir: Path) -> None:
    if not auto_update_enabled():
        return

    def worker() -> None:
        try:
            result = check_for_updates_and_remember(install_dir)
        except Exception as exc:
            print(json.dumps({"auto_update": {"ok": False, "updated": False, "detail": f"异步更新检查失败：{exc}"}}, ensure_ascii=False), flush=True)
            return
        if result.get("has_update"):
            print(json.dumps({"auto_update": result}, ensure_ascii=False), flush=True)

    threading.Thread(target=worker, name="infinite-canvas-update-check", daemon=True).start()


def list_backups(install_dir: Path) -> int:
    print(json.dumps({"ok": True, "backups": list_launcher_backups(install_dir)}, ensure_ascii=False))
    return 0


def rollback_backup(install_dir: Path, backup_id: str) -> int:
    if not backup_id:
        print(json.dumps({"ok": False, "detail": "缺少 backup_id。"}, ensure_ascii=False))
        return 1
    try:
        result = rollback_launcher_backup(install_dir, backup_id)
    except FileNotFoundError:
        print(json.dumps({"ok": False, "detail": "备份不存在。"}, ensure_ascii=False))
        return 1
    except ValueError as exc:
        print(json.dumps({"ok": False, "detail": str(exc)}, ensure_ascii=False))
        return 1
    print(json.dumps(result, ensure_ascii=False))
    return 0


def main() -> int:
    args = parse_args()
    if args.check_update:
        print(json.dumps(check_for_updates_and_remember(args.install_dir.resolve()), ensure_ascii=False))
        return 0
    if args.apply_update:
        return apply_update(args.install_dir.resolve())
    if args.list_backups:
        return list_backups(args.install_dir.resolve())
    if args.rollback_backup:
        return rollback_backup(args.install_dir.resolve(), str(args.rollback_backup).strip())
    install_dir = args.install_dir.resolve()
    print_startup_notice()
    update_result = try_auto_update_before_launch(install_dir)
    if update_result.get("updated") or not update_result.get("ok", True):
        print(json.dumps({"auto_update": update_result}, ensure_ascii=False))
    layout = resolve_runtime_context(install_dir)
    launcher_exe = str(install_dir / "Infinite Canvas.exe")
    selected_port, port_changed = select_launch_port(layout)
    persist_selected_port(layout, selected_port)
    process = launch_server(layout, launcher_exe=launcher_exe, port=selected_port)
    check_for_updates_in_background(install_dir)
    ok = wait_for_server(selected_port)
    browser_opened = False
    if ok and not args.no_browser:
        browser_opened = webbrowser.open(app_base_url(selected_port) + "/")
    if not ok:
        print_launch_failed(selected_port)
        process.terminate()
        return 1
    if port_changed:
        print(
            json.dumps(
                {
                    "ok": True,
                    "detail": f"端口 {DEFAULT_APP_PORT} 不可用，已自动切换到 {selected_port}。",
                    "port": selected_port,
                },
                ensure_ascii=False,
            )
        )
    print_launch_complete(selected_port, browser_opened=browser_opened)
    return process.wait()


if __name__ == "__main__":
    raise SystemExit(main())
