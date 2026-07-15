import tempfile
import unittest
from pathlib import Path
from unittest import mock

from packaging.macos.launcher.layout import MODE_RUNTIME, app_bundle_from_executable, compute_layout, default_storage_root
from packaging.macos.launcher.launcher_main import default_app_bundle


class MacLayoutTests(unittest.TestCase):
    def test_default_storage_root_uses_application_support(self):
        root = default_storage_root("/Users/example")

        self.assertEqual(root, Path("/Users/example/Library/Application Support/InfiniteCanvas"))

    def test_compute_layout_always_uses_runtime(self):
        with tempfile.TemporaryDirectory() as tempdir:
            app_bundle = Path(tempdir) / "Infinite Canvas.app"
            layout = compute_layout(app_bundle, release_name="2026.05.24.1")

        self.assertEqual(layout.mode, MODE_RUNTIME)
        self.assertEqual(layout.work_dir, layout.runtime_root / "2026.05.24.1")
        self.assertEqual(layout.bootstrap_dir, app_bundle.resolve() / "Contents" / "Resources" / "bootstrap")

    def test_app_bundle_from_executable_resolves_bundle_root(self):
        path = Path("/Applications/Infinite Canvas.app/Contents/MacOS/Infinite Canvas")

        self.assertEqual(app_bundle_from_executable(path), Path("/Applications/Infinite Canvas.app"))

    def test_default_app_bundle_uses_sys_executable(self):
        with mock.patch(
            "packaging.macos.launcher.launcher_main.sys.executable",
            "/Applications/Infinite Canvas.app/Contents/MacOS/Infinite Canvas",
        ):
            bundle = default_app_bundle()

        self.assertEqual(bundle, Path("/Applications/Infinite Canvas.app"))


if __name__ == "__main__":
    unittest.main()
