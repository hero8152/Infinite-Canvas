import tempfile
import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from canvas_core.paths import AppPaths
from canvas_core.runtime import bootstrap_runtime


class AppPathsTests(unittest.TestCase):
    def test_source_layout_defaults_to_project_data(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            module_file = root / "canvas_core" / "paths.py"
            module_file.parent.mkdir()
            (root / "static").mkdir()
            paths = AppPaths.discover(environ={}, module_file=module_file, executable=root / "python.exe", frozen=False)
            self.assertEqual(paths.app_root, root.resolve())
            self.assertEqual(paths.data_root, (root / "data").resolve())
            self.assertEqual(paths.web_root, (root / "static").resolve())

    def test_packaged_layout_keeps_data_next_to_canvas_exe(self):
        with tempfile.TemporaryDirectory() as tmp:
            portable = Path(tmp)
            app_root = portable / "app"
            backend_exe = app_root / "backend" / "canvas-backend.exe"
            (app_root / "web").mkdir(parents=True)
            paths = AppPaths.discover(
                environ={"CANVAS_APP_ROOT": str(app_root), "CANVAS_PORTABLE_ROOT": str(portable)},
                module_file=app_root / "backend" / "canvas_core" / "paths.py",
                executable=backend_exe,
                frozen=True,
            )
            self.assertEqual(paths.portable_root, portable.resolve())
            self.assertEqual(paths.data_root, (portable / "data").resolve())
            self.assertEqual(paths.web_root, (app_root / "web").resolve())


class RuntimeOptionsTests(unittest.TestCase):
    def test_cli_flags_are_parsed(self):
        options = bootstrap_runtime([
            "--host", "127.0.0.1",
            "--port", "3456",
            "--data-dir", "example-data",
            "--parent-pid", "42",
            "--runtime-mode", "desktop",
        ])
        self.assertEqual(options.host, "127.0.0.1")
        self.assertEqual(options.port, 3456)
        self.assertEqual(options.parent_pid, 42)
        self.assertEqual(options.mode, "desktop")

    def test_invalid_port_is_rejected(self):
        with self.assertRaises(ValueError):
            bootstrap_runtime(["--port", "70000"])


if __name__ == "__main__":
    unittest.main()
