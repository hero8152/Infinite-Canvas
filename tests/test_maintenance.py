import json
import os
import tempfile
import time
import unittest
from pathlib import Path

from canvas_core.data_layout import DataLayout
from canvas_core.maintenance import MaintenanceManager
from canvas_core.paths import AppPaths


class MaintenanceTests(unittest.TestCase):
    def test_cache_temp_and_logs_are_bounded(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            app_root = root / "app"
            paths = AppPaths(root, app_root, root / "data", app_root / "web", app_root / "workflows")
            layout = DataLayout.from_app_paths(paths)
            layout.ensure()
            layout.app_config.write_text(json.dumps({"cache_max_bytes": 8}), encoding="utf-8")

            old_cache = layout.cache_previews / "old.bin"
            new_cache = layout.cache_downloads / "new.bin"
            old_cache.write_bytes(b"a" * 8)
            new_cache.write_bytes(b"b" * 8)
            now = time.time()
            os.utime(old_cache, (now - 10, now - 10))
            os.utime(new_cache, (now, now))

            stale_temp = layout.temp / "stale.tmp"
            stale_temp.write_text("stale", encoding="utf-8")
            os.utime(stale_temp, (now - 90000, now - 90000))

            log = layout.logs / "canvas.log"
            log.write_bytes(b"x" * 32)
            manager = MaintenanceManager(layout)
            manager._rotate_logs(max_bytes=16, backups=2)
            report = manager.run_once()

            self.assertFalse(old_cache.exists())
            self.assertTrue(new_cache.exists())
            self.assertFalse(stale_temp.exists())
            self.assertTrue((layout.logs / "canvas.log.1").exists())
            self.assertLessEqual(report["cache"]["remaining_bytes"], 8)


if __name__ == "__main__":
    unittest.main()
