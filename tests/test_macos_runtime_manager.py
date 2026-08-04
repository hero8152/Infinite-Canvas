import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest import mock

from packaging.macos.launcher.runtime_manager import (
    build_launch_env,
    create_update_backup,
    current_payload_version,
    current_release_name,
    ensure_runtime_release,
    is_port_available,
    list_launcher_backups,
    load_launcher_state,
    persist_selected_port,
    rollback_launcher_backup,
    select_launch_port,
)
from packaging.macos.launcher.layout import compute_layout


def create_bundle_with_payload(root: Path, version: str = "2026.05.24.1") -> Path:
    app_bundle = root / "Infinite Canvas.app"
    bootstrap = app_bundle / "Contents" / "Resources" / "bootstrap"
    bootstrap.mkdir(parents=True)
    (bootstrap / "manifest.json").write_text('{"payload_entries":["VERSION","main.py"]}\n', encoding="utf-8")
    with zipfile.ZipFile(bootstrap / "app-base.zip", "w") as archive:
        archive.writestr("VERSION", f"{version}\n")
        archive.writestr("main.py", "print('ok')\n")
    return app_bundle


class MacRuntimeManagerTests(unittest.TestCase):
    def test_current_release_name_falls_back_to_payload_version(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            app_bundle = create_bundle_with_payload(root)
            storage_root = root / "storage"

            self.assertEqual(current_release_name(app_bundle, storage_root=storage_root), "2026.05.24.1")

    def test_current_payload_version_uses_runtime_version_after_hot_update(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            app_bundle = create_bundle_with_payload(root, version="2026.05.24.1")
            storage_root = root / "storage"
            layout = compute_layout(app_bundle, storage_root=storage_root, release_name="2026.05.24.1")
            runtime_release = layout.runtime_root / "2026.05.24.1"
            runtime_release.mkdir(parents=True)
            (runtime_release / "VERSION").write_text("2026.05.25.3\n", encoding="utf-8")
            layout.current_release_file.parent.mkdir(parents=True, exist_ok=True)
            layout.current_release_file.write_text("2026.05.24.1\n", encoding="utf-8")

            self.assertEqual(current_payload_version(app_bundle, storage_root=storage_root), "2026.05.25.3")

    def test_ensure_runtime_release_extracts_payload(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            app_bundle = create_bundle_with_payload(root)
            storage_root = root / "storage"
            layout = compute_layout(app_bundle, storage_root=storage_root, release_name="2026.05.24.1")
            layout.storage_root.mkdir(parents=True)

            release = ensure_runtime_release(layout, "2026.05.24.1")

            self.assertTrue((release / "main.py").exists())
            self.assertEqual((layout.current_release_file).read_text(encoding="utf-8").strip(), "2026.05.24.1")

    def test_ensure_runtime_release_refreshes_when_same_version_payload_changes(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            app_bundle = create_bundle_with_payload(root, version="2026.05.30")
            storage_root = root / "storage"
            layout = compute_layout(app_bundle, storage_root=storage_root, release_name="2026.05.30")
            release = layout.runtime_root / "2026.05.30"
            release.mkdir(parents=True)
            (release / "VERSION").write_text("2026.05.30\n", encoding="utf-8")
            (release / "main.py").write_text("print('old runtime')\n", encoding="utf-8")
            with zipfile.ZipFile(layout.bootstrap_dir / "app-base.zip", "w") as archive:
                archive.writestr("VERSION", "2026.05.30\n")
                archive.writestr("main.py", "print('new bootstrap')\n")

            refreshed = ensure_runtime_release(layout, "2026.05.30")

            self.assertEqual(refreshed, release)
            self.assertEqual((release / "main.py").read_text(encoding="utf-8"), "print('new bootstrap')\n")

    def test_ensure_runtime_release_preserves_runtime_newer_than_bootstrap(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            app_bundle = create_bundle_with_payload(root, version="2026.05.30")
            storage_root = root / "storage"
            layout = compute_layout(app_bundle, storage_root=storage_root, release_name="2026.05.31")
            release = layout.runtime_root / "2026.05.31"
            release.mkdir(parents=True)
            (release / "VERSION").write_text("2026.05.31\n", encoding="utf-8")
            (release / "main.py").write_text("print('hot update')\n", encoding="utf-8")

            preserved = ensure_runtime_release(layout, "2026.05.31")

            self.assertEqual(preserved, release)
            self.assertEqual((release / "main.py").read_text(encoding="utf-8"), "print('hot update')\n")

    def test_runtime_backup_and_rollback_switch_current_pointer(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            app_bundle = create_bundle_with_payload(root)
            storage_root = root / "storage"
            layout = compute_layout(app_bundle, storage_root=storage_root, release_name="2026.05.24.1")
            old_release = layout.runtime_root / "2026.05.24.1"
            old_release.mkdir(parents=True)
            (old_release / "main.py").write_text("print('old')\n", encoding="utf-8")
            layout.current_release_file.parent.mkdir(parents=True, exist_ok=True)
            layout.current_release_file.write_text("2026.05.24.1\n", encoding="utf-8")

            backup = create_update_backup(app_bundle, "2026.05.25.1", storage_root=storage_root)
            layout.current_release_file.write_text("2026.05.25.1\n", encoding="utf-8")
            result = rollback_launcher_backup(app_bundle, backup["id"], storage_root=storage_root)

            self.assertEqual(result["restored_version"], "2026.05.24.1")
            self.assertEqual(layout.current_release_file.read_text(encoding="utf-8").strip(), "2026.05.24.1")
            self.assertEqual(len(list_launcher_backups(app_bundle, storage_root=storage_root)), 1)

    def test_select_launch_port_falls_back_and_persists_last_port(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            app_bundle = create_bundle_with_payload(root)
            layout = compute_layout(app_bundle, storage_root=root / "storage")
            layout.data_root.mkdir(parents=True)

            with mock.patch("packaging.macos.launcher.runtime_manager.is_port_available", side_effect=lambda port: port == 3002):
                port, changed = select_launch_port(layout, preferred_port=3000)

            self.assertEqual(port, 3002)
            self.assertTrue(changed)
            persist_selected_port(layout, port)
            self.assertEqual(load_launcher_state(layout)["last_port"], 3002)

    def test_is_port_available_detects_wildcard_listener_conflict(self):
        with mock.patch("packaging.macos.launcher.runtime_manager.socket.socket") as socket_factory:
            fake_sock = mock.MagicMock()
            socket_factory.return_value.__enter__.return_value = fake_sock
            fake_sock.bind.side_effect = OSError("in use")

            available = is_port_available(3000)

        self.assertFalse(available)
        fake_sock.bind.assert_called_once_with(("0.0.0.0", 3000))

    def test_build_launch_env_exposes_storage_root_for_launcher_commands(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            app_bundle = create_bundle_with_payload(root)
            layout = compute_layout(app_bundle, storage_root=root / "storage")

            env = build_launch_env(layout, launcher_exe="/Applications/Infinite Canvas.app/Contents/MacOS/Infinite Canvas")

        self.assertEqual(env["INFINITE_CANVAS_DATA_ROOT"], str(layout.storage_root))
        self.assertEqual(env["INFINITE_CANVAS_STORAGE_ROOT"], str(layout.storage_root))
        self.assertEqual(env["INFINITE_CANVAS_LAUNCHER_EXE"], "/Applications/Infinite Canvas.app/Contents/MacOS/Infinite Canvas")


if __name__ == "__main__":
    unittest.main()
