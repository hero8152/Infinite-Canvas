import tempfile
import unittest
import zipfile
from pathlib import Path

from packaging.windows.build_portable import APP_NAME, PORTABLE_ROOT_NAME, build_portable


class WindowsBuildPortableTests(unittest.TestCase):
    def test_build_portable_contains_launcher_service_updater_and_bootstrap(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            dist_dir = root / "dist"
            service_dir = dist_dir / f"{APP_NAME} Service"
            service_dir.mkdir(parents=True)
            (dist_dir / f"{APP_NAME}.exe").write_text("launcher", encoding="utf-8")
            (dist_dir / f"{APP_NAME} Updater.exe").write_text("updater", encoding="utf-8")
            (service_dir / f"{APP_NAME} Service.exe").write_text("service", encoding="utf-8")
            (service_dir / "runtime.dll").write_text("dll", encoding="utf-8")
            payload = root / "app-base.zip"
            manifest = root / "manifest.json"
            payload.write_text("payload", encoding="utf-8")
            manifest.write_text("{}", encoding="utf-8")

            output = build_portable(
                dist_dir=dist_dir,
                output_path=root / "portable.zip",
                payload_path=payload,
                manifest_path=manifest,
            )

            with zipfile.ZipFile(output) as archive:
                names = set(archive.namelist())

        self.assertIn(f"{PORTABLE_ROOT_NAME}/{APP_NAME}.exe", names)
        self.assertIn(f"{PORTABLE_ROOT_NAME}/{APP_NAME} Updater.exe", names)
        self.assertIn(f"{PORTABLE_ROOT_NAME}/{APP_NAME} Service/{APP_NAME} Service.exe", names)
        self.assertIn(f"{PORTABLE_ROOT_NAME}/{APP_NAME} Service/runtime.dll", names)
        self.assertIn(f"{PORTABLE_ROOT_NAME}/bootstrap/app-base.zip", names)
        self.assertIn(f"{PORTABLE_ROOT_NAME}/bootstrap/manifest.json", names)


if __name__ == "__main__":
    unittest.main()
