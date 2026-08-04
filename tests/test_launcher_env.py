import tempfile
import unittest
from pathlib import Path

from packaging.windows.launcher.layout import LaunchLayout, MODE_IN_PLACE
from packaging.windows.launcher.runtime_manager import build_launch_env


class LauncherEnvTests(unittest.TestCase):
    def test_build_launch_env_exposes_launcher_context(self):
        with tempfile.TemporaryDirectory() as tempdir:
            install_dir = Path(tempdir)
            bootstrap = install_dir / "bootstrap"
            bootstrap.mkdir()
            (bootstrap / "manifest.json").write_text(
                (
                    '{"update_base_url":"https://example.com/releases",'
                    '"version_endpoint":"custom-VERSION",'
                    '"manifest_endpoint":"custom-manifest.json",'
                    '"payload_endpoint":"custom-app-base.zip"}\n'
                ),
                encoding="utf-8",
            )
            layout = LaunchLayout(
                install_dir=install_dir,
                storage_root=install_dir / "storage",
                data_root=install_dir / "storage" / "data",
                logs_root=install_dir / "storage" / "logs",
                backups_root=install_dir / "storage" / "backups",
                runtime_root=install_dir / "storage" / "runtime",
                mode=MODE_IN_PLACE,
                work_dir=install_dir,
            )
            env = build_launch_env(layout, launcher_exe="C:/Infinite Canvas.exe", port=3012)

        self.assertEqual(env["INFINITE_CANVAS_MANAGED_BY_LAUNCHER"], "1")
        self.assertEqual(env["INFINITE_CANVAS_LAUNCHER_MODE"], MODE_IN_PLACE)
        self.assertEqual(env["INFINITE_CANVAS_UPDATE_BASE_URL"], "https://example.com/releases")
        self.assertEqual(env["INFINITE_CANVAS_UPDATE_VERSION_ENDPOINT"], "custom-VERSION")
        self.assertEqual(env["INFINITE_CANVAS_UPDATE_MANIFEST_ENDPOINT"], "custom-manifest.json")
        self.assertEqual(env["INFINITE_CANVAS_UPDATE_PAYLOAD_ENDPOINT"], "custom-app-base.zip")
        self.assertEqual(env["INFINITE_CANVAS_LAUNCHER_EXE"], "C:/Infinite Canvas.exe")
        self.assertEqual(env["INFINITE_CANVAS_PORT"], "3012")
        self.assertEqual(env["INFINITE_CANVAS_HOST"], "0.0.0.0")


if __name__ == "__main__":
    unittest.main()
