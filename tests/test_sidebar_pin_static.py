from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
INDEX = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
I18N = (ROOT / "static" / "i18n.js").read_text(encoding="utf-8")


class SidebarPinStaticTest(unittest.TestCase):
    def test_sidebar_pin_contract_is_present(self):
        self.assertIn("/static/i18n.js?v=20260518-sidebar-pin", INDEX)
        self.assertIn("studio_sidebar_pinned", INDEX)
        self.assertIn('class="side-pill sidebar-pin-btn"', INDEX)
        self.assertIn('id="sidebar-pin-toggle"', INDEX)
        self.assertIn('id="sidebar-pin-text"', INDEX)
        self.assertIn("toggleSidebarPin()", INDEX)
        self.assertIn(".sidebar.is-pinned", INDEX)
        self.assertIn("aria-pressed", INDEX)
        self.assertIn("common.pinSidebar", INDEX)
        self.assertIn("common.unpinSidebar", INDEX)

    def test_sidebar_pin_state_flow_is_wired(self):
        self.assertIn("localStorage.getItem('studio_sidebar_pinned') === 'true'", INDEX)
        self.assertIn("localStorage.setItem(SIDEBAR_PIN_KEY, pinned ? 'true' : 'false')", INDEX)
        self.assertIn("sidebar?.classList.toggle('is-pinned', pinned)", INDEX)
        self.assertIn("document.documentElement.classList.toggle('studio-sidebar-pinned-boot', pinned)", INDEX)
        self.assertIn("button.classList.toggle('is-active', pinned)", INDEX)
        self.assertIn("button.setAttribute('aria-pressed', pinned ? 'true' : 'false')", INDEX)
        self.assertIn("button.setAttribute('aria-label', sidebarPinAriaLabel())", INDEX)
        self.assertIn("text.setAttribute('data-i18n', labelKey)", INDEX)
        self.assertIn("text.textContent = label", INDEX)

    def test_sidebar_pin_translations_exist(self):
        self.assertIn("'common.pinSidebar': '固定侧边栏'", I18N)
        self.assertIn("'common.unpinSidebar': '取消固定侧边栏'", I18N)
        self.assertIn("'common.pinSidebar': 'Pin sidebar'", I18N)
        self.assertIn("'common.unpinSidebar': 'Unpin sidebar'", I18N)


if __name__ == "__main__":
    unittest.main()
