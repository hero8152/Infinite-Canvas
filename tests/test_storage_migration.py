import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from canvas_core.data_layout import DataLayout
from canvas_core.database import CanvasDatabase
from canvas_core.migration import LegacyMigrator
from canvas_core.paths import AppPaths


def write_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")


class StorageMigrationTests(unittest.TestCase):
    def test_legacy_data_is_migrated_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "static").mkdir()
            (root / "workflows" / "custom").mkdir(parents=True)
            write_json(root / "data" / "api_providers.json", [{"id": "demo", "name": "Demo", "enabled": True}])
            write_json(root / "data" / "projects.json", {"projects": [{"id": "default", "name": "默认项目"}]})
            write_json(root / "data" / "canvases" / "canvas-1.json", {
                "id": "canvas-1", "title": "测试", "kind": "smart", "project": "default", "updated_at": 10,
            })
            write_json(root / "history.json", [{"timestamp": 1.5, "type": "online", "images": ["/assets/output/a.png"]}])
            write_json(root / "data" / "asset_library.json", {"libraries": [], "updated_at": 1})
            write_json(root / "data" / "online_image_tasks.json", {"tasks": [{"id": "task-1", "status": "done"}]})
            (root / "assets" / "input").mkdir(parents=True)
            (root / "assets" / "input" / "sample.png").write_bytes(b"sample-media")
            (root / "API").mkdir()
            (root / "API" / ".env").write_text("DEMO_KEY=secret\n", encoding="utf-8")
            (root / "workflows" / "custom" / "demo.json").write_text("{}", encoding="utf-8")

            paths = AppPaths.discover(environ={}, module_file=root / "canvas_core" / "paths.py", executable=root / "python.exe", frozen=False)
            layout = DataLayout.from_app_paths(paths)
            layout.ensure()
            database = CanvasDatabase(layout.database_file)
            database.initialize()
            report = LegacyMigrator(paths, layout, database).run()

            self.assertEqual(report["status"], "complete")
            self.assertEqual(database.get_canvas("canvas-1")["title"], "测试")
            self.assertEqual(len(database.load_providers()), 1)
            self.assertEqual(len(database.list_history("online")), 1)
            self.assertEqual(len(database.load_tasks("online_image")), 1)
            self.assertTrue((layout.media_input / "sample.png").is_file())
            self.assertTrue((layout.workflow_custom / "demo.json").is_file())
            self.assertTrue(layout.secret_env.is_file())
            self.assertFalse((root / "history.json").exists())
            self.assertEqual(database.pragma_summary()["journal_mode"].lower(), "wal")

            second_report = LegacyMigrator(paths, layout, database).run()
            self.assertEqual(second_report["completed_at"], report["completed_at"])
            self.assertEqual(database.counts()["canvases"], 1)

    def test_canvas_and_history_crud(self):
        with tempfile.TemporaryDirectory() as tmp:
            database = CanvasDatabase(Path(tmp) / "canvas.db")
            database.initialize()
            canvas = {"id": "c1", "title": "A", "project": "default", "kind": "classic", "updated_at": 1}
            database.save_canvas(canvas, touch=False)
            self.assertEqual(database.get_canvas("c1")["revision"], 1)
            canvas["title"] = "B"
            database.save_canvas(canvas, touch=False)
            self.assertEqual(database.get_canvas("c1")["revision"], 2)
            database.prepend_history({"timestamp": 2.5, "type": "online", "images": ["x"]})
            removed = database.delete_history_timestamp(2.5)
            self.assertEqual(removed["images"], ["x"])
            self.assertEqual(database.list_history(), [])

    def test_tasks_support_incremental_upsert_and_pruning(self):
        with tempfile.TemporaryDirectory() as tmp:
            database = CanvasDatabase(Path(tmp) / "canvas.db")
            database.initialize()
            for index in range(6):
                database.upsert_task("ecommerce", {"id": f"task-{index}", "status": "queued", "updated_at": index})
            database.upsert_task("ecommerce", {"id": "task-5", "status": "succeeded", "updated_at": 10})
            tasks = database.load_tasks("ecommerce")
            self.assertEqual(len(tasks), 6)
            self.assertEqual(tasks[0]["id"], "task-5")
            self.assertEqual(tasks[0]["status"], "succeeded")
            database.prune_tasks("ecommerce", 3)
            self.assertEqual(len(database.load_tasks("ecommerce")), 3)


if __name__ == "__main__":
    unittest.main()
