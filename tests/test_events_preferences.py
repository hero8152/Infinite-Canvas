import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from canvas_core.database import CanvasDatabase, RevisionConflict
from canvas_core.events import entity_changed


class EventsAndPreferencesTests(unittest.TestCase):
    def test_event_contract(self):
        event = entity_changed("canvas", "canvas-1", 12, "client-1", 1780000000000).public()
        self.assertEqual(event, {
            "type": "entity.changed",
            "topic": "canvas",
            "entity_id": "canvas-1",
            "revision": 12,
            "actor_id": "client-1",
            "updated_at": 1780000000000,
        })
        with self.assertRaises(ValueError):
            entity_changed("unknown")

    def test_preferences_compare_and_swap_and_import_if_empty(self):
        with tempfile.TemporaryDirectory() as root:
            database = CanvasDatabase(Path(root) / "canvas.db")
            database.initialize()
            first = database.save_setting("global_preferences", {"theme": "dark"}, only_if_empty=True)
            self.assertEqual(first["revision"], 1)
            ignored = database.save_setting("global_preferences", {"theme": "light"}, only_if_empty=True)
            self.assertEqual(ignored["value"], {"theme": "dark"})
            second = database.save_setting("global_preferences", {"theme": "light"}, base_revision=1)
            self.assertEqual(second["revision"], 2)
            with self.assertRaises(RevisionConflict) as conflict:
                database.save_setting("global_preferences", {"theme": "dark"}, base_revision=1)
            self.assertEqual(conflict.exception.revision, 2)
            self.assertEqual(conflict.exception.value, {"theme": "light"})

    def test_topic_revisions_are_monotonic(self):
        with tempfile.TemporaryDirectory() as root:
            database = CanvasDatabase(Path(root) / "canvas.db")
            database.initialize()
            self.assertEqual(database.next_revision("asset"), 1)
            self.assertEqual(database.next_revision("asset"), 2)
            self.assertEqual(database.next_revision("canvas", "c1"), 1)


if __name__ == "__main__":
    unittest.main()
