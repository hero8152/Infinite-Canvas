import tempfile
import unittest
from pathlib import Path
from unittest import mock

from packaging.windows.launcher.layout import (
    MODE_IN_PLACE,
    MODE_RUNTIME,
    compute_layout,
    windows_data_targets,
)


class ComputeLayoutTests(unittest.TestCase):
    def test_uses_install_dir_when_writable(self):
        with tempfile.TemporaryDirectory() as install_dir, tempfile.TemporaryDirectory() as storage_root:
            layout = compute_layout(install_dir=install_dir, storage_root=storage_root)

        self.assertEqual(layout.mode, MODE_IN_PLACE)
        self.assertEqual(layout.work_dir, Path(install_dir).resolve())
        self.assertEqual(layout.storage_root, Path(storage_root).resolve())

    def test_uses_runtime_when_install_dir_not_writable(self):
        with tempfile.TemporaryDirectory() as install_dir, tempfile.TemporaryDirectory() as storage_root:
            with mock.patch("packaging.windows.launcher.layout.is_directory_writable", return_value=False):
                layout = compute_layout(
                    install_dir=install_dir,
                    storage_root=storage_root,
                    release_name="2026.05.24",
                )

        self.assertEqual(layout.mode, MODE_RUNTIME)
        self.assertEqual(
            layout.work_dir,
            Path(storage_root).resolve() / "runtime" / "2026.05.24",
        )

    def test_windows_data_targets_match_expected_names(self):
        targets = windows_data_targets(Path("C:/app"))

        self.assertEqual(set(targets.keys()), {"API", "assets", "output", "data", "history.json", "global_config.json"})
        self.assertEqual(targets["history.json"], Path("C:/app/history.json"))


if __name__ == "__main__":
    unittest.main()
