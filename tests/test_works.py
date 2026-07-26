import asyncio
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from canvas_core.database import CanvasDatabase


class WorksFrontendContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        root = Path(__file__).resolve().parent.parent
        cls.index = (root / "static" / "index.html").read_text(encoding="utf-8")
        cls.ecommerce = (root / "static" / "ecommerce.html").read_text(encoding="utf-8")
        cls.works = (root / "static" / "works.html").read_text(encoding="utf-8")
        cls.works_js = (root / "static" / "js" / "works.js").read_text(encoding="utf-8")
        cls.compare_js = (root / "static" / "js" / "compare-viewer.js").read_text(encoding="utf-8")

    def test_works_navigation_is_directly_below_asset_library(self):
        asset = self.index.index("switchUI(this, 'asset-manager')")
        works = self.index.index("switchUI(this, 'works')")
        self.assertLess(asset, works)
        self.assertIn('id="frame-works"', self.index)
        self.assertIn("'works'", self.index)

    def test_works_has_all_and_favorite_tabs_with_persistent_api(self):
        self.assertIn('data-tab="all"', self.works)
        self.assertIn('data-tab="favorite"', self.works)
        self.assertIn('data-tab="trash"', self.works)
        self.assertIn("/api/works?limit=1000&include_trashed=true", self.works_js)
        self.assertIn("/favorite`,{method:'PUT'", self.works_js)
        self.assertIn("/metadata`,{method:'PUT'", self.works_js)
        self.assertIn('id="worksQuickCompare"', self.works)
        self.assertIn('id="compareTargetFile"', self.works)

    def test_compare_viewer_supports_fullscreen_wheel_zoom_and_middle_pan(self):
        self.assertIn("event.button === 1", self.compare_js)
        self.assertIn("addEventListener('wheel'", self.compare_js)
        self.assertIn("clamp(value,1,8)", self.compare_js)
        self.assertIn("requestFullscreen", self.compare_js)
        self.assertIn("data-compare-fullscreen", self.works)
        self.assertIn("compareBaseFile", self.works)

    def test_ecommerce_no_longer_exposes_preview_publish_switch(self):
        self.assertNotIn('id="modeToggle"', self.ecommerce)
        self.assertNotIn("快速预览", self.ecommerce)
        self.assertNotIn("上架品质", self.ecommerce)
        self.assertIn("compare-viewer.js", self.ecommerce)


class WorksBackendTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import main
        cls.main = main

    def test_work_metadata_overrides_name_and_keeps_soft_trash_recoverable(self):
        record = {
            "_history_id": "history-1",
            "type": "ecommerce",
            "timestamp": 10,
            "images": ["/output/result.png"],
            "image_items": [{"width": 1200, "height": 1600}],
            "inputs": [{"role": "source", "url": "/input/source.png"}],
        }
        work_id = self.main.work_item_id("history-1", 0, "/output/result.png")
        works = self.main.generated_work_items([record], {
            work_id: {"name": "主图 A", "favorite": True, "trashed": True, "trashed_at": 12},
        })
        self.assertEqual(works[0]["name"], "主图 A")
        self.assertEqual(works[0]["original_name"], "result.png")
        self.assertTrue(works[0]["favorite"])
        self.assertTrue(works[0]["trashed"])
        self.assertEqual(works[0]["url"], "/output/result.png")

    def test_works_api_hides_trash_by_default_and_can_include_it(self):
        items = [
            {"id": "active", "name": "A", "kind": "ecommerce", "favorite": False, "trashed": False},
            {"id": "trash", "name": "B", "kind": "ecommerce", "favorite": False, "trashed": True},
        ]
        with patch.object(self.main, "all_generated_works", return_value=items):
            visible = asyncio.run(self.main.list_generated_works(limit=100))
            complete = asyncio.run(self.main.list_generated_works(limit=100, include_trashed=True))
        self.assertEqual([item["id"] for item in visible["works"]], ["active"])
        self.assertEqual([item["id"] for item in complete["works"]], ["active", "trash"])

    def test_rename_trash_and_restore_are_persisted_in_sqlite_metadata(self):
        with tempfile.TemporaryDirectory() as root:
            database = CanvasDatabase(Path(root) / "canvas.db")
            database.initialize()
            database.prepend_history({
                "id": "history-2",
                "type": "ecommerce",
                "timestamp": 20,
                "images": ["/output/work.png"],
                "inputs": [{"role": "source", "url": "/input/source.png"}],
            })
            with patch.object(self.main, "DATABASE", database):
                work_id = self.main.all_generated_works()[0]["id"]
                renamed, revision = self.main.update_work_metadata(work_id, name="商品主图", favorite=True, trashed=True)
                self.assertGreater(revision, 0)
                self.assertEqual(renamed["name"], "商品主图")
                self.assertTrue(renamed["favorite"])
                self.assertTrue(renamed["trashed"])
                restored, _ = self.main.update_work_metadata(work_id, trashed=False)
                self.assertFalse(restored["trashed"])
                self.assertEqual(restored["name"], "商品主图")


if __name__ == "__main__":
    unittest.main()
