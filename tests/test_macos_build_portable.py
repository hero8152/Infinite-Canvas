import stat
import tempfile
import unittest
import zipfile
from pathlib import Path

from packaging.macos.build_app import APP_NAME
from packaging.macos.build_portable import build_portable


class MacBuildPortableTests(unittest.TestCase):
    def test_build_portable_contains_app_bundle_and_preserves_executable_mode(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            app_bundle = root / f"{APP_NAME}.app"
            macos_dir = app_bundle / "Contents" / "MacOS"
            resources_dir = app_bundle / "Contents" / "Resources" / "bootstrap"
            macos_dir.mkdir(parents=True)
            resources_dir.mkdir(parents=True)
            launcher = macos_dir / APP_NAME
            launcher.write_text("launcher", encoding="utf-8")
            launcher.chmod(0o755)
            (resources_dir / "app-base.zip").write_text("payload", encoding="utf-8")
            (resources_dir / "manifest.json").write_text("{}", encoding="utf-8")

            output = build_portable(root, root / "portable.zip", app_bundle=app_bundle)

            with zipfile.ZipFile(output) as archive:
                names = set(archive.namelist())
                mode = (archive.getinfo(f"{APP_NAME}.app/Contents/MacOS/{APP_NAME}").external_attr >> 16) & 0o777

        self.assertIn(f"{APP_NAME}.app/Contents/MacOS/{APP_NAME}", names)
        self.assertIn(f"{APP_NAME}.app/Contents/Resources/bootstrap/app-base.zip", names)
        self.assertTrue(mode & stat.S_IXUSR)


if __name__ == "__main__":
    unittest.main()
