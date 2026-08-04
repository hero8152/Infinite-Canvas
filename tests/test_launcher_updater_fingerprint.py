import contextlib
import io
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest import mock

from packaging.macos.updater import updater_main as macos_updater
from packaging.windows.updater import updater_main as windows_updater
from packaging.windows.launcher.runtime_manager import (
    PAYLOAD_FINGERPRINT_FILE,
    payload_fingerprint,
    payload_ready_marker,
)


class LauncherUpdaterFingerprintTests(unittest.TestCase):
    def test_windows_runtime_update_writes_payload_fingerprint(self):
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
            payload = root / "payload.zip"
            with zipfile.ZipFile(payload, "w") as archive:
                archive.writestr("VERSION", "2026.05.30\n")
                archive.writestr("main.py", "print('updated')\n")

            with mock.patch("sys.argv", [
                "updater",
                "--install-dir",
                str(install_dir),
                "--payload",
                str(payload),
                "--release-name",
                "2026.05.30",
            ]), mock.patch("packaging.windows.launcher.layout.is_directory_writable", return_value=False):
                self.assertEqual(windows_updater.main(), 0)

            release = storage_root / "runtime" / "2026.05.30"
            self.assertEqual(
                (release / PAYLOAD_FINGERPRINT_FILE).read_text(encoding="utf-8").strip(),
                payload_fingerprint(payload),
            )

    def test_windows_in_place_update_refreshes_bootstrap_payload_and_ready_marker(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            install_dir = root / "app"
            storage_root = root / "storage"
            bootstrap_dir = install_dir / "bootstrap"
            bootstrap_dir.mkdir(parents=True)
            (bootstrap_dir / "manifest.json").write_text(
                '{"payload_entries":["VERSION","main.py"]}\n',
                encoding="utf-8",
            )
            (install_dir / "install-meta.ini").write_text(
                f"[paths]\nstorage_root={storage_root}\n",
                encoding="utf-8",
            )
            (install_dir / "VERSION").write_text("2026.05.29\n", encoding="utf-8")
            (install_dir / "main.py").write_text("print('old')\n", encoding="utf-8")
            old_payload = bootstrap_dir / "app-base.zip"
            with zipfile.ZipFile(old_payload, "w") as archive:
                archive.writestr("VERSION", "2026.05.29\n")
                archive.writestr("main.py", "print('old')\n")

            payload = root / "payload.zip"
            with zipfile.ZipFile(payload, "w") as archive:
                archive.writestr("VERSION", "2026.05.30\n")
                archive.writestr("main.py", "print('updated')\n")

            with mock.patch("sys.argv", [
                "updater",
                "--install-dir",
                str(install_dir),
                "--payload",
                str(payload),
                "--release-name",
                "2026.05.30",
            ]), mock.patch("packaging.windows.launcher.layout.is_directory_writable", return_value=True):
                self.assertEqual(windows_updater.main(), 0)

            self.assertEqual((install_dir / "VERSION").read_text(encoding="utf-8"), "2026.05.30\n")
            self.assertEqual((install_dir / "main.py").read_text(encoding="utf-8"), "print('updated')\n")
            with zipfile.ZipFile(old_payload) as archive:
                self.assertEqual(archive.read("VERSION").decode("utf-8"), "2026.05.30\n")
            self.assertEqual(
                (install_dir / ".payload-ready").read_text(encoding="utf-8").strip(),
                payload_ready_marker(install_dir),
            )

    def test_windows_in_place_update_continues_when_bootstrap_payload_refresh_fails(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            install_dir = root / "app"
            storage_root = root / "storage"
            bootstrap_dir = install_dir / "bootstrap"
            bootstrap_dir.mkdir(parents=True)
            (bootstrap_dir / "manifest.json").write_text(
                '{"payload_entries":["VERSION","main.py"]}\n',
                encoding="utf-8",
            )
            (install_dir / "install-meta.ini").write_text(
                f"[paths]\nstorage_root={storage_root}\n",
                encoding="utf-8",
            )
            old_payload = bootstrap_dir / "app-base.zip"
            with zipfile.ZipFile(old_payload, "w") as archive:
                archive.writestr("VERSION", "2026.05.29\n")
                archive.writestr("main.py", "print('old')\n")

            payload = root / "payload.zip"
            with zipfile.ZipFile(payload, "w") as archive:
                archive.writestr("VERSION", "2026.05.30\n")
                archive.writestr("main.py", "print('updated')\n")

            original_copy2 = windows_updater.shutil.copy2

            def copy2_maybe_fail(source, destination, *args, **kwargs):
                if Path(destination).name == "app-base.zip":
                    raise OSError("simulated bootstrap copy failure")
                return original_copy2(source, destination, *args, **kwargs)

            stderr = io.StringIO()
            with mock.patch("sys.argv", [
                "updater",
                "--install-dir",
                str(install_dir),
                "--payload",
                str(payload),
                "--release-name",
                "2026.05.30",
            ]), mock.patch("packaging.windows.launcher.layout.is_directory_writable", return_value=True), \
                mock.patch("packaging.windows.updater.updater_main.shutil.copy2", side_effect=copy2_maybe_fail), \
                contextlib.redirect_stderr(stderr):
                self.assertEqual(windows_updater.main(), 0)

            self.assertEqual((install_dir / "VERSION").read_text(encoding="utf-8"), "2026.05.30\n")
            self.assertEqual((install_dir / "main.py").read_text(encoding="utf-8"), "print('updated')\n")
            with zipfile.ZipFile(old_payload) as archive:
                self.assertEqual(archive.read("VERSION").decode("utf-8"), "2026.05.29\n")
            self.assertIn("failed to refresh bootstrap payload", stderr.getvalue())

    def test_macos_runtime_update_writes_payload_fingerprint(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            app_bundle = root / "Infinite Canvas.app"
            storage_root = root / "storage"
            payload = root / "payload.zip"
            with zipfile.ZipFile(payload, "w") as archive:
                archive.writestr("VERSION", "2026.05.30\n")
                archive.writestr("main.py", "print('updated')\n")

            with mock.patch("sys.argv", [
                "updater",
                "--app-bundle",
                str(app_bundle),
                "--storage-root",
                str(storage_root),
                "--payload",
                str(payload),
                "--release-name",
                "2026.05.30",
            ]):
                self.assertEqual(macos_updater.main(), 0)

            release = storage_root / "runtime" / "2026.05.30"
            self.assertEqual(
                (release / PAYLOAD_FINGERPRINT_FILE).read_text(encoding="utf-8").strip(),
                payload_fingerprint(payload),
            )
