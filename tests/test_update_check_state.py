from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_update_check_state_is_defined_before_check_for_updates():
    html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
    state_index = html.index("let updateCheckInFlight = false;")
    check_index = html.index("async function checkForUpdates(manual = false)")

    assert state_index < check_index
    assert "let launcherUpdateRecheckTimer = 0;" in html
    assert "let launcherUpdateRecheckCount = 0;" in html
    assert "const LAUNCHER_UPDATE_RECHECK_LIMIT = 3;" in html
    assert "const LAUNCHER_UPDATE_RECHECK_INTERVAL_MS = 1200;" in html


def test_update_check_manual_flag_is_defined_by_function_signature():
    html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
    signature_index = html.index("async function checkForUpdates(manual = false)")
    manual_branch_index = html.index("if(manual)", signature_index)

    assert signature_index < manual_branch_index
    assert "checkForUpdates(true)" in html
    assert "async function checkForUpdates()" not in html


def test_i18n_loader_inherits_static_version_from_current_script():
    loader = (ROOT / "static" / "js" / "i18n.js").read_text(encoding="utf-8")

    assert "document.currentScript" in loader
    assert "searchParams.get('v')" in loader
    assert "const VERSION = '2026.05.29.7';" not in loader
    assert "src + '?v=' + VERSION" not in loader
