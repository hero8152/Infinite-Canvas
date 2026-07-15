import tempfile
import unittest
import urllib.error
import zipfile
from pathlib import Path
from unittest import mock

from packaging.windows.launcher.launcher_main import (
    apply_update_result,
    check_for_updates_and_remember,
    check_for_updates,
    print_launch_complete,
    print_launch_failed,
    print_startup_notice,
    try_auto_update_before_launch,
)
from packaging.windows.launcher.runtime_manager import load_launcher_state, resolve_runtime_context


def update_payload_bytes(version: str = "2026.05.25.3") -> bytes:
    payload = tempfile.TemporaryFile()
    with zipfile.ZipFile(payload, "w") as archive:
        archive.writestr("VERSION", f"{version}\n")
        archive.writestr("main.py", "print('updated')\n")
    payload.seek(0)
    return payload.read()


def create_install_dir(root: Path, version: str = "2026.05.24.1") -> Path:
    install_dir = root / "app"
    storage_root = root / "storage"
    install_dir.mkdir()
    (install_dir / "bootstrap").mkdir()
    (install_dir / "bootstrap" / "manifest.json").write_text(
        (
            '{"update_base_url":"https://example.com/releases",'
            '"version_endpoint":"windows-VERSION",'
            '"payload_endpoint":"windows-app-base.zip"}\n'
        ),
        encoding="utf-8",
    )
    (install_dir / "install-meta.ini").write_text(
        f"[paths]\nstorage_root={storage_root}\n",
        encoding="utf-8",
    )
    (install_dir / "current.txt").write_text(f"{version}\n", encoding="utf-8")
    runtime_release = storage_root / "runtime" / version
    runtime_release.mkdir(parents=True)
    (runtime_release / "VERSION").write_text(f"{version}\n", encoding="utf-8")
    (runtime_release / "main.py").write_text("print('old')\n", encoding="utf-8")
    with zipfile.ZipFile(install_dir / "bootstrap" / "app-base.zip", "w") as archive:
        archive.writestr("VERSION", f"{version}\n")
        archive.writestr("main.py", "print('bootstrap')\n")
    return install_dir


class WindowsLauncherUpdateTests(unittest.TestCase):
    def test_launch_status_messages_are_user_visible(self):
        with mock.patch("builtins.print") as mocked_print:
            print_startup_notice()
            print_launch_complete(3003, browser_opened=True)
            print_launch_failed(3004)

        messages = [call.args[0] for call in mocked_print.call_args_list]
        self.assertIn("Infinite Canvas 启动中。请不要关闭此终端窗口，关闭后程序会退出。", messages)
        self.assertIn("Infinite Canvas 启动完成。已打开网页：http://127.0.0.1:3003/", messages)
        self.assertIn("Infinite Canvas 启动失败：服务未在端口 3004 上按时就绪。", messages)

    def test_check_for_updates_detects_remote_newer_version(self):
        with tempfile.TemporaryDirectory() as tempdir:
            install_dir = create_install_dir(Path(tempdir), "2026.05.24.1")

            with mock.patch("packaging.windows.launcher.launcher_main.fetch_text", return_value="2026.05.25.3\n"):
                result = check_for_updates(install_dir)

        self.assertTrue(result["ok"])
        self.assertEqual(result["current_version"], "2026.05.24.1")
        self.assertEqual(result["remote_version"], "2026.05.25.3")
        self.assertTrue(result["has_update"])

    def test_check_for_updates_treats_runtime_hot_update_as_current(self):
        with tempfile.TemporaryDirectory() as tempdir:
            install_dir = create_install_dir(Path(tempdir), "2026.05.24.1")
            runtime_version = Path(tempdir) / "storage" / "runtime" / "2026.05.24.1" / "VERSION"
            runtime_version.write_text("2026.05.25.3\n", encoding="utf-8")

            with mock.patch("packaging.windows.launcher.launcher_main.fetch_text", return_value="2026.05.25.3\n"):
                result = check_for_updates(install_dir)

        self.assertEqual(result["current_version"], "2026.05.25.3")
        self.assertFalse(result["has_update"])

    def test_check_for_updates_skips_missing_remote_version(self):
        with tempfile.TemporaryDirectory() as tempdir:
            install_dir = create_install_dir(Path(tempdir), "2026.05.24.1")
            error = urllib.error.HTTPError("https://example.com/releases/windows-VERSION", 404, "Not Found", {}, None)

            with mock.patch("packaging.windows.launcher.launcher_main.fetch_text", side_effect=error):
                result = check_for_updates(install_dir)

        self.assertTrue(result["ok"])
        self.assertTrue(result["skipped"])
        self.assertFalse(result["has_update"])

    def test_check_for_updates_uses_prefixed_version_asset(self):
        with tempfile.TemporaryDirectory() as tempdir:
            install_dir = create_install_dir(Path(tempdir), "2026.05.24.1")
            requested_urls: list[str] = []

            def fake_fetch_text(url: str) -> str:
                requested_urls.append(url)
                return "2026.05.25.3\n"

            with mock.patch("packaging.windows.launcher.launcher_main.fetch_text", side_effect=fake_fetch_text):
                result = check_for_updates(install_dir)

        self.assertTrue(result["has_update"])
        self.assertEqual(requested_urls, ["https://example.com/releases/windows-VERSION"])

    def test_apply_update_downloads_payload_and_invokes_updater(self):
        with tempfile.TemporaryDirectory() as tempdir:
            install_dir = create_install_dir(Path(tempdir), "2026.05.24.1")
            updater = install_dir / "Infinite Canvas Updater.exe"
            updater.write_text("updater", encoding="utf-8")
            payload_bytes = update_payload_bytes()
            fake_response = mock.Mock()
            fake_response.__enter__ = mock.Mock(return_value=fake_response)
            fake_response.__exit__ = mock.Mock(return_value=None)
            fake_response.read.return_value = payload_bytes

            with mock.patch("packaging.windows.launcher.launcher_main.fetch_text", return_value="2026.05.25.3\n"), \
                mock.patch("packaging.windows.launcher.launcher_main.urllib.request.urlopen", return_value=fake_response) as urlopen, \
                mock.patch("packaging.windows.launcher.launcher_main.current_payload_version", side_effect=["2026.05.24.1", "2026.05.25.3"]), \
                mock.patch("packaging.windows.launcher.launcher_main.subprocess.run") as run:
                run.return_value.returncode = 0
                result = apply_update_result(install_dir)

            self.assertTrue(result["ok"])
            self.assertTrue(result["updated"])
            self.assertFalse(result["has_update"])
            self.assertEqual(result["current_version"], "2026.05.25.3")
            self.assertEqual(result["payload_version"], "2026.05.25.3")
            self.assertTrue(result["backup"]["id"])
            self.assertEqual(urlopen.call_args.args[0], "https://example.com/releases/windows-app-base.zip")
            command = run.call_args.args[0]
            self.assertEqual(command[0], str(updater))
            self.assertIn("--release-name", command)
            self.assertIn("2026.05.25.3", command)

    def test_apply_update_rejects_payload_older_than_remote_version(self):
        with tempfile.TemporaryDirectory() as tempdir:
            install_dir = create_install_dir(Path(tempdir), "2026.05.24.1")
            updater = install_dir / "Infinite Canvas Updater.exe"
            updater.write_text("updater", encoding="utf-8")
            fake_response = mock.Mock()
            fake_response.__enter__ = mock.Mock(return_value=fake_response)
            fake_response.__exit__ = mock.Mock(return_value=None)
            fake_response.read.return_value = update_payload_bytes("2026.05.24.1")

            with mock.patch("packaging.windows.launcher.launcher_main.fetch_text", return_value="2026.05.25.3\n"), \
                mock.patch("packaging.windows.launcher.launcher_main.urllib.request.urlopen", return_value=fake_response), \
                mock.patch("packaging.windows.launcher.launcher_main.subprocess.run") as run:
                result = apply_update_result(install_dir)

        self.assertFalse(result["ok"])
        self.assertEqual(result["payload_version"], "2026.05.24.1")
        self.assertIn("低于远端版本", result["detail"])
        run.assert_not_called()

    def test_apply_update_fails_when_installed_version_does_not_advance(self):
        with tempfile.TemporaryDirectory() as tempdir:
            install_dir = create_install_dir(Path(tempdir), "2026.05.24.1")
            updater = install_dir / "Infinite Canvas Updater.exe"
            updater.write_text("updater", encoding="utf-8")
            fake_response = mock.Mock()
            fake_response.__enter__ = mock.Mock(return_value=fake_response)
            fake_response.__exit__ = mock.Mock(return_value=None)
            fake_response.read.return_value = update_payload_bytes()

            with mock.patch("packaging.windows.launcher.launcher_main.fetch_text", return_value="2026.05.25.3\n"), \
                mock.patch("packaging.windows.launcher.launcher_main.urllib.request.urlopen", return_value=fake_response), \
                mock.patch("packaging.windows.launcher.launcher_main.current_payload_version", side_effect=["2026.05.24.1", "2026.05.24.1"]), \
                mock.patch("packaging.windows.launcher.launcher_main.subprocess.run") as run:
                run.return_value.returncode = 0
                result = apply_update_result(install_dir)

        self.assertFalse(result["ok"])
        self.assertFalse(result["updated"])
        self.assertEqual(result["installed_version"], "2026.05.24.1")
        self.assertIn("安装版本仍为", result["detail"])

    def test_apply_update_uses_prefixed_payload_asset(self):
        with tempfile.TemporaryDirectory() as tempdir:
            install_dir = create_install_dir(Path(tempdir), "2026.05.24.1")
            updater = install_dir / "Infinite Canvas Updater.exe"
            updater.write_text("updater", encoding="utf-8")
            fake_response = mock.Mock()
            fake_response.__enter__ = mock.Mock(return_value=fake_response)
            fake_response.__exit__ = mock.Mock(return_value=None)
            fake_response.read.return_value = update_payload_bytes()
            requested_urls: list[str] = []

            def fake_urlopen(url: str, timeout: int = 0):
                requested_urls.append(url)
                return fake_response

            with mock.patch("packaging.windows.launcher.launcher_main.fetch_text", return_value="2026.05.25.3\n"), \
                mock.patch("packaging.windows.launcher.launcher_main.urllib.request.urlopen", side_effect=fake_urlopen), \
                mock.patch("packaging.windows.launcher.launcher_main.current_payload_version", side_effect=["2026.05.24.1", "2026.05.25.3"]), \
                mock.patch("packaging.windows.launcher.launcher_main.subprocess.run") as run:
                run.return_value.returncode = 0
                result = apply_update_result(install_dir)

        self.assertTrue(result["updated"])
        self.assertEqual(requested_urls, ["https://example.com/releases/windows-app-base.zip"])

    def test_auto_update_can_be_disabled(self):
        with tempfile.TemporaryDirectory() as tempdir:
            install_dir = create_install_dir(Path(tempdir), "2026.05.24.1")

            with mock.patch.dict("os.environ", {"INFINITE_CANVAS_AUTO_UPDATE": "0"}), \
                mock.patch("packaging.windows.launcher.launcher_main.apply_update_result") as apply_update:
                result = try_auto_update_before_launch(install_dir)

        self.assertTrue(result["ok"])
        self.assertTrue(result["skipped"])
        apply_update.assert_not_called()

    def test_auto_update_does_not_check_network_without_pending_update(self):
        with tempfile.TemporaryDirectory() as tempdir:
            install_dir = create_install_dir(Path(tempdir), "2026.05.24.1")

            with mock.patch("packaging.windows.launcher.launcher_main.apply_update_result") as apply_update:
                result = try_auto_update_before_launch(install_dir)

        self.assertTrue(result["ok"])
        self.assertTrue(result["skipped"])
        self.assertEqual(result["detail"], "no pending update")
        apply_update.assert_not_called()

    def test_check_for_updates_records_pending_update_for_next_launch(self):
        with tempfile.TemporaryDirectory() as tempdir:
            install_dir = create_install_dir(Path(tempdir), "2026.05.24.1")

            with mock.patch("packaging.windows.launcher.launcher_main.fetch_text", return_value="2026.05.25.3\n"):
                result = check_for_updates_and_remember(install_dir)
            state = load_launcher_state(resolve_runtime_context(install_dir))

        self.assertTrue(result["has_update"])
        self.assertTrue(result["pending_update"])
        self.assertEqual(state["pending_update"]["remote_version"], "2026.05.25.3")

    def test_auto_update_applies_pending_update_on_next_launch(self):
        with tempfile.TemporaryDirectory() as tempdir:
            install_dir = create_install_dir(Path(tempdir), "2026.05.24.1")
            with mock.patch("packaging.windows.launcher.launcher_main.fetch_text", return_value="2026.05.25.3\n"):
                check_for_updates_and_remember(install_dir)

            with mock.patch("packaging.windows.launcher.launcher_main.apply_update_result", return_value={"ok": True, "updated": True}) as apply_update:
                result = try_auto_update_before_launch(install_dir)

        self.assertTrue(result["updated"])
        apply_update.assert_called_once_with(install_dir)


if __name__ == "__main__":
    unittest.main()
