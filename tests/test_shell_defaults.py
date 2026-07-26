import re
import unittest
from pathlib import Path


INDEX = Path(__file__).resolve().parent.parent / "static" / "index.html"
ONLINE = Path(__file__).resolve().parent.parent / "static" / "online.html"
RUNTIME_SYNC = Path(__file__).resolve().parent.parent / "static" / "js" / "runtime-sync.js"


class ShellDefaultsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = INDEX.read_text(encoding="utf-8")

    def test_author_and_social_block_is_removed(self):
        for marker in ("wuli大雄", "author-box", "author-content-wrap", "social-icon-lite"):
            self.assertNotIn(marker, self.source)

    def test_online_generation_is_the_default_page(self):
        self.assertIn("const DEFAULT_PAGE_ID = 'online';", self.source)
        self.assertRegex(self.source, r'id="frame-online"[^>]*class="active"')
        self.assertNotIn('id="frame-zimage"', self.source)

    def test_sidebar_uses_persisted_manual_state_only(self):
        self.assertIn("studio_sidebar_manual_mode_v1", self.source)
        self.assertIn(".sidebar:not(.is-pinned):hover", self.source)
        self.assertNotIn("is-collapsing", self.source)
        self.assertRegex(
            self.source,
            re.compile(r"function restoreSidebarPinned\(\).*?SIDEBAR_PINNED_KEY\) !== '0'", re.S),
        )

    def test_online_history_observer_is_null_safe(self):
        online_source = ONLINE.read_text(encoding="utf-8")
        self.assertIn("const loadMoreTrigger = document.getElementById('loadMoreTrigger');", online_source)
        self.assertRegex(
            online_source,
            re.compile(r"if\(loadMoreTrigger\).*?observer\.observe\(loadMoreTrigger\)", re.S),
        )

    def test_online_generation_settings_are_persisted_and_synced(self):
        online_source = ONLINE.read_text(encoding="utf-8")
        runtime_source = RUNTIME_SYNC.read_text(encoding="utf-8")
        self.assertIn("studio_online_generation_settings_v1", online_source)
        self.assertIn("function persistOnlineSettings()", online_source)
        self.assertIn("setPreference?.('online_generation_settings', serialized)", online_source)
        self.assertIn("online_generation_settings: ['studio_online_generation_settings_v1']", runtime_source)
        for setter in ("setProvider", "setModel", "setQuality", "setCount", "setRatio", "setResolution"):
            self.assertRegex(
                online_source,
                re.compile(rf"function {setter}\(.*?persistOnlineSettings\(\)", re.S),
            )

    def test_runtime_sync_conflict_retry_does_not_replay_stale_preferences(self):
        runtime_source = RUNTIME_SYNC.read_text(encoding="utf-8")
        self.assertIn("冲突阶段不广播旧偏好", runtime_source)
        self.assertRegex(
            runtime_source,
            re.compile(r"if\(response\.status === 409\).*?const merged = \{\.\.\.state\.values, \.\.\.values\};\s+return writePreferences\(merged, state\.revision, false\);", re.S),
        )
        self.assertNotRegex(
            runtime_source,
            re.compile(r"if\(response\.status === 409\).*?applyValues\(state\.values\).*?const merged", re.S),
        )


if __name__ == "__main__":
    unittest.main()
