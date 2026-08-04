from __future__ import annotations

import argparse
import json
import os
import shlex
import signal
import subprocess
import ssl
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

try:
    import certifi
except Exception:  # pragma: no cover - source runs may omit optional packaging deps.
    certifi = None

from app_runtime import DEFAULT_APP_PORT, app_base_url
from packaging.macos.launcher.layout import app_bundle_from_executable, compute_layout
from packaging.macos.launcher.runtime_manager import (
    compare_versions,
    create_update_backup,
    current_payload_version,
    launch_server,
    list_launcher_backups,
    load_launcher_state,
    persist_selected_port,
    read_manifest,
    resolve_runtime_context,
    rollback_launcher_backup,
    save_launcher_state,
    select_launch_port,
    wait_for_server,
)


AUTO_UPDATE_ENV = "INFINITE_CANVAS_AUTO_UPDATE"
DEFAULT_VERSION_ENDPOINT = "macos-VERSION"
DEFAULT_PAYLOAD_ENDPOINT = "macos-app-base.zip"
PENDING_UPDATE_KEY = "pending_update"
TERMINAL_ATTACHED_ENV = "INFINITE_CANVAS_TERMINAL_ATTACHED"
TERMINAL_SCRIPT_NAME = "Infinite Canvas.command"
TERMINAL_TITLE = "Infinite Canvas"
LAUNCH_STARTING_NOTICE = (
    "Infinite Canvas 启动中。请不要关闭此终端窗口，关闭后程序会退出。"
)
LAUNCH_COMPLETE_NOTICE = "Infinite Canvas 启动完成。"
TERMINAL_STARTUP_NOTICE = (
    LAUNCH_STARTING_NOTICE
)
UPDATE_NETWORK_ERRORS = (urllib.error.URLError, TimeoutError, OSError, ssl.SSLError)


def default_app_bundle() -> Path:
    return app_bundle_from_executable(Path(sys.executable))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Infinite Canvas macOS launcher")
    parser.add_argument("--app-bundle", type=Path, default=default_app_bundle())
    parser.add_argument("--storage-root", type=Path, default=None)
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--check-update", action="store_true")
    parser.add_argument("--apply-update", action="store_true")
    parser.add_argument("--list-backups", action="store_true")
    parser.add_argument("--rollback-backup", default="")
    return parser.parse_args()


def has_management_action(args: argparse.Namespace) -> bool:
    return bool(args.check_update or args.apply_update or args.list_backups or args.rollback_backup)


def running_in_terminal() -> bool:
    try:
        return sys.stdout.isatty()
    except Exception:
        return False


def should_spawn_terminal(args: argparse.Namespace) -> bool:
    if has_management_action(args):
        return False
    if str(os.environ.get(TERMINAL_ATTACHED_ENV, "")).strip() == "1":
        return False
    return not running_in_terminal()


def terminal_script_path(app_bundle: Path, storage_root: Path | None = None) -> Path:
    layout = compute_layout(app_bundle, storage_root=storage_root)
    layout.data_root.mkdir(parents=True, exist_ok=True)
    return layout.data_root / TERMINAL_SCRIPT_NAME


def write_terminal_launcher_script(app_bundle: Path, storage_root: Path | None = None, no_browser: bool = False) -> Path:
    script_path = terminal_script_path(app_bundle, storage_root=storage_root)
    command_parts = [
        str(Path(sys.executable).resolve()),
        "--app-bundle",
        str(app_bundle),
    ]
    if storage_root is not None:
        command_parts.extend(["--storage-root", str(storage_root)])
    if no_browser:
        command_parts.append("--no-browser")
    command = " ".join(shlex.quote(part) for part in command_parts)
    script = (
        "#!/bin/sh\n"
        f"printf '\\033]0;{TERMINAL_TITLE}\\007'\n"
        f"printf '%s\\n' {shlex.quote(TERMINAL_STARTUP_NOTICE)}\n"
        "printf '%s\\n\\n' '----------------------------------------'\n"
        f"export {TERMINAL_ATTACHED_ENV}=1\n"
        f"exec {command}\n"
    )
    script_path.write_text(script, encoding="utf-8")
    script_path.chmod(0o755)
    return script_path


def launch_in_terminal(app_bundle: Path, storage_root: Path | None = None, no_browser: bool = False) -> bool:
    script_path = write_terminal_launcher_script(app_bundle, storage_root=storage_root, no_browser=no_browser)
    result = subprocess.run(
        ["open", "-a", "Terminal", str(script_path)],
        check=False,
    )
    return result.returncode == 0


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


def join_update_url(base_url: str, endpoint: str) -> str:
    return base_url.rstrip("/") + "/" + endpoint.lstrip("/")


def update_ssl_context() -> ssl.SSLContext | None:
    if certifi is None:
        return None
    try:
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return None


def open_update_url(url: str, timeout: int):
    context = update_ssl_context()
    if context is None:
        return urllib.request.urlopen(url, timeout=timeout)
    return urllib.request.urlopen(url, timeout=timeout, context=context)


def update_network_error_detail(action: str, exc: BaseException) -> str:
    return f"{action}失败：{exc}"


def fetch_text(url: str) -> str:
    with open_update_url(url, timeout=15) as response:
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
        with open_update_url(payload_url, timeout=60) as response:
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


def check_for_updates(app_bundle: Path, storage_root: Path | None = None) -> dict[str, str | bool]:
    layout = resolve_runtime_context(app_bundle, storage_root=storage_root)
    manifest = read_manifest(layout)
    base_url = str(manifest.get("update_base_url") or "").strip()
    if not base_url:
        return {"ok": False, "detail": "未配置 update_base_url。"}
    current = current_payload_version(app_bundle, storage_root=layout.storage_root)
    try:
        remote = fetch_remote_version(base_url, str(manifest.get("version_endpoint") or DEFAULT_VERSION_ENDPOINT))
    except UPDATE_NETWORK_ERRORS as exc:
        return {
            "ok": False,
            "current_version": current,
            "has_update": False,
            "detail": update_network_error_detail("更新检查", exc),
        }
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


def pending_update_from_state(app_bundle: Path, storage_root: Path | None = None) -> dict[str, object] | None:
    layout = resolve_runtime_context(app_bundle, storage_root=storage_root)
    state = load_launcher_state(layout)
    pending = state.get(PENDING_UPDATE_KEY)
    if not isinstance(pending, dict):
        return None
    remote = str(pending.get("remote_version") or "").strip()
    current = current_payload_version(app_bundle, storage_root=layout.storage_root)
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


def remember_update_check(app_bundle: Path, check: dict[str, Any], storage_root: Path | None = None) -> dict[str, Any]:
    if not check.get("ok"):
        return check
    layout = resolve_runtime_context(app_bundle, storage_root=storage_root)
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


def clear_pending_update(app_bundle: Path, storage_root: Path | None = None) -> None:
    layout = resolve_runtime_context(app_bundle, storage_root=storage_root)
    state = load_launcher_state(layout)
    if PENDING_UPDATE_KEY in state:
        state.pop(PENDING_UPDATE_KEY, None)
        save_launcher_state(layout, state)


def check_for_updates_and_remember(app_bundle: Path, storage_root: Path | None = None) -> dict[str, Any]:
    pending = pending_update_from_state(app_bundle, storage_root=storage_root)
    if pending:
        return pending
    return remember_update_check(app_bundle, dict(check_for_updates(app_bundle, storage_root=storage_root)), storage_root=storage_root)


def apply_update_result(app_bundle: Path, storage_root: Path | None = None) -> dict[str, object]:
    layout = resolve_runtime_context(app_bundle, storage_root=storage_root)
    manifest = read_manifest(layout)
    base_url = str(manifest.get("update_base_url") or "").strip()
    if not base_url:
        return {"ok": False, "detail": "未配置 update_base_url。"}
    check = check_for_updates(app_bundle, storage_root=layout.storage_root)
    if not check.get("ok"):
        return dict(check)
    if not check.get("has_update"):
        clear_pending_update(app_bundle, storage_root=layout.storage_root)
        return {"ok": True, "updated": False, **check}

    updater = layout.contents_dir / "MacOS" / "Infinite Canvas Updater"
    if not updater.exists():
        return {**check, "ok": False, "detail": "缺少更新器可执行文件。"}

    with tempfile.TemporaryDirectory() as tempdir:
        payload_file = Path(tempdir) / "app-base.zip"
        try:
            payload_url = download_update_payload(base_url, str(manifest.get("payload_endpoint") or DEFAULT_PAYLOAD_ENDPOINT), payload_file)
        except UPDATE_NETWORK_ERRORS as exc:
            return {**check, "ok": False, "detail": update_network_error_detail("更新包下载", exc)}
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
        backup = create_update_backup(app_bundle, str(check["remote_version"]), storage_root=layout.storage_root)
        result = subprocess.run(
            [
                str(updater),
                "--app-bundle",
                str(app_bundle),
                "--storage-root",
                str(layout.storage_root),
                "--payload",
                str(payload_file),
                "--release-name",
                str(check["remote_version"]),
            ],
            check=False,
        )
        if result.returncode != 0:
            return {**check, "ok": False, "detail": f"更新器退出码 {result.returncode}", "returncode": result.returncode}
        installed_version = current_payload_version(app_bundle, storage_root=layout.storage_root)
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
    clear_pending_update(app_bundle, storage_root=layout.storage_root)
    return {
        "ok": True,
        "updated": True,
        "backup": backup,
        **check,
        "current_version": installed_version,
        "has_update": False,
        "payload_version": payload_version,
    }


def apply_update(app_bundle: Path, storage_root: Path | None = None) -> int:
    result = apply_update_result(app_bundle, storage_root=storage_root)
    print(json.dumps(result, ensure_ascii=False))
    if result.get("ok"):
        return 0
    return int(result.get("returncode") or 1)


def auto_update_enabled() -> bool:
    value = str(os.environ.get(AUTO_UPDATE_ENV, "1")).strip().lower()
    return value not in {"0", "false", "no", "off"}


def try_auto_update_before_launch(app_bundle: Path, storage_root: Path | None = None) -> dict[str, object]:
    if not auto_update_enabled():
        return {"ok": True, "updated": False, "skipped": True, "detail": "auto update disabled"}
    pending = pending_update_from_state(app_bundle, storage_root=storage_root)
    if not pending:
        return {"ok": True, "updated": False, "skipped": True, "detail": "no pending update"}
    try:
        return apply_update_result(app_bundle, storage_root=storage_root)
    except Exception as exc:
        return {"ok": False, "updated": False, "detail": f"自动更新检查失败：{exc}"}


def check_for_updates_in_background(app_bundle: Path, storage_root: Path | None = None) -> None:
    if not auto_update_enabled():
        return

    def worker() -> None:
        try:
            result = check_for_updates_and_remember(app_bundle, storage_root=storage_root)
        except Exception as exc:
            print(json.dumps({"auto_update": {"ok": False, "updated": False, "detail": f"异步更新检查失败：{exc}"}}, ensure_ascii=False), flush=True)
            return
        if result.get("has_update"):
            print(json.dumps({"auto_update": result}, ensure_ascii=False), flush=True)

    threading.Thread(target=worker, name="infinite-canvas-update-check", daemon=True).start()


def list_backups(app_bundle: Path, storage_root: Path | None = None) -> int:
    backups = list_launcher_backups(app_bundle, storage_root=storage_root)
    print(json.dumps({"ok": True, "backups": backups}, ensure_ascii=False))
    return 0


def rollback_backup(app_bundle: Path, backup_id: str, storage_root: Path | None = None) -> int:
    if not backup_id:
        print(json.dumps({"ok": False, "detail": "缺少 backup_id。"}, ensure_ascii=False))
        return 1
    try:
        result = rollback_launcher_backup(app_bundle, backup_id, storage_root=storage_root)
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
    app_bundle = args.app_bundle.resolve()
    storage_root = args.storage_root.resolve() if args.storage_root else None
    if args.check_update:
        print(json.dumps(check_for_updates_and_remember(app_bundle, storage_root=storage_root), ensure_ascii=False))
        return 0
    if args.apply_update:
        return apply_update(app_bundle, storage_root=storage_root)
    if args.list_backups:
        return list_backups(app_bundle, storage_root=storage_root)
    if args.rollback_backup:
        return rollback_backup(app_bundle, str(args.rollback_backup).strip(), storage_root=storage_root)
    if should_spawn_terminal(args):
        return 0 if launch_in_terminal(app_bundle, storage_root=storage_root, no_browser=args.no_browser) else 1

    if str(os.environ.get(TERMINAL_ATTACHED_ENV, "")).strip() != "1":
        print_startup_notice()
    update_result = try_auto_update_before_launch(app_bundle, storage_root=storage_root)
    if update_result.get("updated") or not update_result.get("ok", True):
        print(json.dumps({"auto_update": update_result}, ensure_ascii=False))
    layout = resolve_runtime_context(app_bundle, storage_root=storage_root)
    launcher_exe = str(layout.contents_dir / "MacOS" / "Infinite Canvas")
    selected_port, port_changed = select_launch_port(layout)
    persist_selected_port(layout, selected_port)
    process = launch_server(layout, launcher_exe=launcher_exe, port=selected_port)
    check_for_updates_in_background(app_bundle, storage_root=storage_root)
    ok = wait_for_server(selected_port)
    browser_opened = False
    if ok and not args.no_browser:
        browser_opened = webbrowser.open(app_base_url(selected_port) + "/")
    if not ok:
        print_launch_failed(selected_port)
        process.terminate()
        return 1

    shutdown_requested = {"value": False}

    def handle_shutdown(_signum: int, _frame: object) -> None:
        shutdown_requested["value"] = True
        if process.poll() is None:
            process.terminate()

    signal.signal(signal.SIGTERM, handle_shutdown)
    signal.signal(signal.SIGINT, handle_shutdown)
    if hasattr(signal, "SIGHUP"):
        signal.signal(signal.SIGHUP, handle_shutdown)
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
    exit_code = process.wait()
    if shutdown_requested["value"]:
        return 0
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
