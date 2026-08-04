import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest import mock

from packaging.windows.launcher.runtime_manager import (
    copy_payload_for_in_place,
    create_update_backup,
    current_payload_version,
    current_release_name,
    ensure_runtime_release,
    list_launcher_backups,
    load_launcher_state,
    launch_server,
    persist_selected_port,
    replace_in_place_payload,
    rollback_launcher_backup,
    select_launch_port,
)
from packaging.windows.launcher.layout import LaunchLayout, MODE_RUNTIME


class RuntimeManagerTests(unittest.TestCase):
    def test_ensure_runtime_release_extracts_payload(self):
        with tempfile.TemporaryDirectory() as tempdir:
            base = Path(tempdir)
            install_dir = base / "install"
            install_dir.mkdir()
            bootstrap = install_dir / "bootstrap"
            bootstrap.mkdir()
            payload = bootstrap / "app-base.zip"
            with zipfile.ZipFile(payload, "w") as archive:
                archive.writestr("main.py", "print('ok')\n")

            layout = LaunchLayout(
                install_dir=install_dir,
                storage_root=base / "storage",
                data_root=base / "storage" / "data",
                logs_root=base / "storage" / "logs",
                backups_root=base / "storage" / "backups",
                runtime_root=base / "storage" / "runtime",
                mode=MODE_RUNTIME,
                work_dir=base / "storage" / "runtime" / "v1",
            )

            release = ensure_runtime_release(layout, install_dir, "v1")

            self.assertTrue((release / "main.py").exists())

    def test_ensure_runtime_release_refreshes_when_same_version_payload_changes(self):
        with tempfile.TemporaryDirectory() as tempdir:
            base = Path(tempdir)
            install_dir = base / "install"
            install_dir.mkdir()
            bootstrap = install_dir / "bootstrap"
            bootstrap.mkdir()
            payload = bootstrap / "app-base.zip"
            with zipfile.ZipFile(payload, "w") as archive:
                archive.writestr("VERSION", "2026.05.30\n")
                archive.writestr("main.py", "print('new bootstrap')\n")
            release_dir = base / "storage" / "runtime" / "2026.05.30"
            release_dir.mkdir(parents=True)
            (release_dir / "VERSION").write_text("2026.05.30\n", encoding="utf-8")
            (release_dir / "main.py").write_text("print('old runtime')\n", encoding="utf-8")
            layout = LaunchLayout(
                install_dir=install_dir,
                storage_root=base / "storage",
                data_root=base / "storage" / "data",
                logs_root=base / "storage" / "logs",
                backups_root=base / "storage" / "backups",
                runtime_root=base / "storage" / "runtime",
                mode=MODE_RUNTIME,
                work_dir=release_dir,
            )

            release = ensure_runtime_release(layout, install_dir, "2026.05.30")

            self.assertEqual(release, release_dir)
            self.assertEqual((release / "main.py").read_text(encoding="utf-8"), "print('new bootstrap')\n")

    def test_current_release_name_falls_back_to_payload_version(self):
        with tempfile.TemporaryDirectory() as tempdir:
            install_dir = Path(tempdir)
            bootstrap = install_dir / "bootstrap"
            bootstrap.mkdir()
            payload = bootstrap / "app-base.zip"
            with zipfile.ZipFile(payload, "w") as archive:
                archive.writestr("VERSION", "2026.05.24.1\n")

            self.assertEqual(current_release_name(install_dir), "2026.05.24.1")

    def test_current_payload_version_uses_runtime_version_after_hot_update(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            install_dir = root / "app"
            storage_root = root / "storage"
            install_dir.mkdir()
            (install_dir / "bootstrap").mkdir()
            (install_dir / "bootstrap" / "manifest.json").write_text("{}", encoding="utf-8")
            (install_dir / "install-meta.ini").write_text(
                f"[paths]\nstorage_root={storage_root}\n",
                encoding="utf-8",
            )
            (install_dir / "current.txt").write_text("2026.05.24.1\n", encoding="utf-8")
            runtime_release = storage_root / "runtime" / "2026.05.24.1"
            runtime_release.mkdir(parents=True)
            (runtime_release / "VERSION").write_text("2026.05.25.3\n", encoding="utf-8")

            self.assertEqual(current_payload_version(install_dir), "2026.05.25.3")

    def test_launch_server_prefers_packaged_service_executable(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            install_dir = root / "install"
            service_dir = install_dir / "Infinite Canvas Service"
            service_dir.mkdir(parents=True)
            service = service_dir / "Infinite Canvas Service.exe"
            service.write_text("service", encoding="utf-8")
            bootstrap = install_dir / "bootstrap"
            bootstrap.mkdir()
            (bootstrap / "manifest.json").write_text("{}", encoding="utf-8")
            layout = LaunchLayout(
                install_dir=install_dir,
                storage_root=root / "storage",
                data_root=root / "storage" / "data",
                logs_root=root / "storage" / "logs",
                backups_root=root / "storage" / "backups",
                runtime_root=root / "storage" / "runtime",
                mode=MODE_RUNTIME,
                work_dir=root / "runtime" / "v1",
            )

            with mock.patch("packaging.windows.launcher.runtime_manager.subprocess.Popen") as popen:
                launch_server(layout, launcher_exe="launcher.exe", port=3007)

            args, kwargs = popen.call_args
            self.assertEqual(args[0], [str(service)])
            self.assertEqual(kwargs["cwd"], str(layout.work_dir))
            self.assertEqual(kwargs["env"]["INFINITE_CANVAS_PORT"], "3007")

    def test_replace_in_place_payload_preserves_bootstrap_files(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            target = root / "app"
            target.mkdir()
            (target / "launcher.exe").write_text("launcher", encoding="utf-8")
            bootstrap = target / "bootstrap"
            bootstrap.mkdir()
            (bootstrap / "manifest.json").write_text("{}", encoding="utf-8")

            payload = root / "payload.zip"
            with zipfile.ZipFile(payload, "w") as archive:
                archive.writestr("main.py", "print('new')\n")
                archive.writestr("static/index.html", "<html></html>\n")

            replace_in_place_payload(target, payload)

            self.assertTrue((target / "launcher.exe").exists())
            self.assertTrue((target / "bootstrap" / "manifest.json").exists())
            self.assertTrue((target / "main.py").exists())
            self.assertTrue((target / "static" / "index.html").exists())

    def test_copy_payload_for_in_place_refreshes_after_overwrite_install(self):
        with tempfile.TemporaryDirectory() as tempdir:
            install_dir = Path(tempdir)
            bootstrap = install_dir / "bootstrap"
            bootstrap.mkdir()
            (bootstrap / "manifest.json").write_text('{"payload_entries":["VERSION","static/index.html"]}\n', encoding="utf-8")
            (install_dir / ".payload-ready").write_text("ok\n", encoding="utf-8")
            (install_dir / "VERSION").write_text("2026.05.30\n", encoding="utf-8")
            static_dir = install_dir / "static"
            static_dir.mkdir()
            (static_dir / "index.html").write_text("old html\n", encoding="utf-8")
            with zipfile.ZipFile(bootstrap / "app-base.zip", "w") as archive:
                archive.writestr("VERSION", "2026.05.30\n")
                archive.writestr("static/index.html", "new html with updateCheckInFlight\n")

            copy_payload_for_in_place(install_dir)

            self.assertEqual((install_dir / "static" / "index.html").read_text(encoding="utf-8"), "new html with updateCheckInFlight\n")
            self.assertNotEqual((install_dir / ".payload-ready").read_text(encoding="utf-8").strip(), "ok")

    def test_copy_payload_for_in_place_repairs_stale_files_when_marker_matches_payload(self):
        with tempfile.TemporaryDirectory() as tempdir:
            install_dir = Path(tempdir)
            bootstrap = install_dir / "bootstrap"
            bootstrap.mkdir()
            (bootstrap / "manifest.json").write_text('{"payload_entries":["VERSION","static/js/i18n.js"]}\n', encoding="utf-8")
            (install_dir / "VERSION").write_text("2026.05.30\n", encoding="utf-8")
            i18n_dir = install_dir / "static" / "js"
            i18n_dir.mkdir(parents=True)
            (i18n_dir / "i18n.js").write_text("const VERSION = '2026.05.29.7';\n", encoding="utf-8")
            with zipfile.ZipFile(bootstrap / "app-base.zip", "w") as archive:
                archive.writestr("VERSION", "2026.05.30\n")
                archive.writestr("static/js/i18n.js", "const VERSION = currentStaticVersion();\n")
            from packaging.windows.launcher.runtime_manager import payload_fingerprint
            (install_dir / ".payload-ready").write_text(
                f"{payload_fingerprint(bootstrap / 'app-base.zip')}\n",
                encoding="utf-8",
            )

            copy_payload_for_in_place(install_dir)

            self.assertEqual(
                (i18n_dir / "i18n.js").read_text(encoding="utf-8"),
                "const VERSION = currentStaticVersion();\n",
            )

    def test_copy_payload_for_in_place_skips_bootstrap_payload_older_than_install(self):
        with tempfile.TemporaryDirectory() as tempdir:
            install_dir = Path(tempdir)
            bootstrap = install_dir / "bootstrap"
            bootstrap.mkdir()
            (bootstrap / "manifest.json").write_text('{"payload_entries":["VERSION","static/index.html"]}\n', encoding="utf-8")
            (install_dir / ".payload-ready").write_text("ok\n", encoding="utf-8")
            (install_dir / "VERSION").write_text("2026.05.31\n", encoding="utf-8")
            static_dir = install_dir / "static"
            static_dir.mkdir()
            (static_dir / "index.html").write_text("hot update html\n", encoding="utf-8")
            with zipfile.ZipFile(bootstrap / "app-base.zip", "w") as archive:
                archive.writestr("VERSION", "2026.05.30\n")
                archive.writestr("static/index.html", "old bootstrap html\n")

            copy_payload_for_in_place(install_dir)

            self.assertEqual((install_dir / "VERSION").read_text(encoding="utf-8"), "2026.05.31\n")
            self.assertEqual((install_dir / "static" / "index.html").read_text(encoding="utf-8"), "hot update html\n")

    def test_in_place_backup_can_be_rolled_back(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            install_dir = root / "app"
            storage_root = root / "storage"
            install_dir.mkdir()
            (install_dir / "bootstrap").mkdir()
            (install_dir / "bootstrap" / "manifest.json").write_text(
                '{"payload_entries":["main.py","VERSION"]}\n',
                encoding="utf-8",
            )
            (install_dir / "install-meta.ini").write_text(
                f"[paths]\nstorage_root={storage_root}\n",
                encoding="utf-8",
            )
            (install_dir / "VERSION").write_text("2026.05.24.1\n", encoding="utf-8")
            (install_dir / "main.py").write_text("print('before')\n", encoding="utf-8")

            backup = create_update_backup(install_dir, "2026.05.25.1")
            (install_dir / "VERSION").write_text("2026.05.25.1\n", encoding="utf-8")
            (install_dir / "main.py").write_text("print('after')\n", encoding="utf-8")

            result = rollback_launcher_backup(install_dir, backup["id"])

            self.assertEqual(result["restored_version"], "2026.05.24.1")
            self.assertEqual((install_dir / "main.py").read_text(encoding="utf-8"), "print('before')\n")
            self.assertEqual((install_dir / "VERSION").read_text(encoding="utf-8"), "2026.05.24.1\n")
            backups = list_launcher_backups(install_dir)
            self.assertEqual(len(backups), 1)
            self.assertEqual(backups[0]["source_version"], "2026.05.24.1")

    def test_runtime_backup_rolls_pointer_back(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            install_dir = root / "app"
            storage_root = root / "storage"
            install_dir.mkdir()
            (install_dir / "bootstrap").mkdir()
            (install_dir / "bootstrap" / "manifest.json").write_text("{}", encoding="utf-8")
            (install_dir / "install-meta.ini").write_text(
                f"[paths]\nstorage_root={storage_root}\n",
                encoding="utf-8",
            )
            (install_dir / "current.txt").write_text("2026.05.24.1\n", encoding="utf-8")
            runtime_release = storage_root / "runtime" / "2026.05.24.1"
            runtime_release.mkdir(parents=True)
            (runtime_release / "main.py").write_text("print('runtime')\n", encoding="utf-8")

            with mock.patch("packaging.windows.launcher.layout.is_directory_writable", return_value=False):
                backup = create_update_backup(install_dir, "2026.05.25.1")
                (install_dir / "current.txt").write_text("2026.05.25.1\n", encoding="utf-8")
                result = rollback_launcher_backup(install_dir, backup["id"])

            self.assertEqual(result["restored_version"], "2026.05.24.1")
            self.assertEqual((install_dir / "current.txt").read_text(encoding="utf-8").strip(), "2026.05.24.1")
            self.assertEqual(result["count"], 1)

    def test_select_launch_port_prefers_requested_port(self):
        with tempfile.TemporaryDirectory() as tempdir:
            base = Path(tempdir)
            layout = LaunchLayout(
                install_dir=base / "install",
                storage_root=base / "storage",
                data_root=base / "storage" / "data",
                logs_root=base / "storage" / "logs",
                backups_root=base / "storage" / "backups",
                runtime_root=base / "storage" / "runtime",
                mode=MODE_RUNTIME,
                work_dir=base / "storage" / "runtime" / "v1",
            )
            layout.data_root.mkdir(parents=True, exist_ok=True)

            with mock.patch("packaging.windows.launcher.runtime_manager.is_port_available", side_effect=lambda port: port == 3005):
                port, changed = select_launch_port(layout, preferred_port=3005)

            self.assertEqual(port, 3005)
            self.assertFalse(changed)

    def test_select_launch_port_falls_back_and_persists_last_port(self):
        with tempfile.TemporaryDirectory() as tempdir:
            base = Path(tempdir)
            layout = LaunchLayout(
                install_dir=base / "install",
                storage_root=base / "storage",
                data_root=base / "storage" / "data",
                logs_root=base / "storage" / "logs",
                backups_root=base / "storage" / "backups",
                runtime_root=base / "storage" / "runtime",
                mode=MODE_RUNTIME,
                work_dir=base / "storage" / "runtime" / "v1",
            )
            layout.data_root.mkdir(parents=True, exist_ok=True)

            with mock.patch("packaging.windows.launcher.runtime_manager.is_port_available", side_effect=lambda port: port == 3001):
                port, changed = select_launch_port(layout, preferred_port=3000)
            self.assertEqual(port, 3001)
            self.assertTrue(changed)

            persist_selected_port(layout, port)
            state = load_launcher_state(layout)
            self.assertEqual(state["last_port"], 3001)


if __name__ == "__main__":
    unittest.main()
