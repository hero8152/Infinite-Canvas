from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_launcher_update_uses_project_update_modal_instead_of_native_dialogs():
    html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
    run_project_start = html.index("async function runProjectUpdate()")
    run_project_end = html.index("async function runUpdateConnectivityTest()", run_project_start)
    run_project_update = html[run_project_start:run_project_end]

    launcher_start = html.index("async function confirmLauncherUpdate()")
    launcher_end = html.index("async function waitForBackendAndReload()", launcher_start)
    launcher_update = html[launcher_start:launcher_end]

    assert "openProjectUpdateModal();" in run_project_update
    assert "runLauncherUpdate" not in run_project_update
    assert "confirm(" not in launcher_update
    assert "alert(" not in launcher_update
    assert "/api/launcher/apply-update" in launcher_update


def test_launcher_connectivity_targets_are_rendered_in_update_modal():
    html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
    targets_start = html.index("function updateConnectivityTargets()")
    targets_end = html.index("function renderConnectivityList", targets_start)
    targets = html[targets_start:targets_end]

    assert "appInfo.managed_by_launcher" in targets
    assert "打包版本文件" in targets
    assert "打包清单文件" in targets
    assert "打包更新包" in targets
    assert "appInfo.manifest_endpoint" in targets
    assert "{ name:'发布下载入口'" not in targets


def test_backend_connectivity_switches_targets_for_launcher_mode():
    source = (ROOT / "main.py").read_text(encoding="utf-8")
    update_start = source.index('def update_connectivity():')
    update_end = source.index('@app.get("/api/launcher/status")', update_start)
    update_connectivity = source[update_start:update_end]

    assert "LAUNCHER_MANAGED" in update_connectivity
    assert "launcher_update_connectivity_targets()" in update_connectivity
    assert '"mode": mode' in update_connectivity
    assert "打包版本文件" in source
    assert "打包清单文件" in source
    assert "打包更新包" in source
    assert '"发布下载入口"' not in update_connectivity


def test_update_buttons_stay_disabled_while_backend_restarts():
    html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
    project_start = html.index("async function confirmProjectUpdate()")
    project_end = html.index("async function runLauncherUpdate()", project_start)
    project_update = html[project_start:project_end]
    launcher_start = html.index("async function confirmLauncherUpdate()")
    launcher_end = html.index("async function waitForBackendAndReload()", launcher_start)
    launcher_update = html[launcher_start:launcher_end]

    assert "let keepDisabledAfterSuccess = false;" in project_update
    assert "keepDisabledAfterSuccess = true;" in project_update
    assert "if(keepDisabledAfterSuccess) return;" in project_update
    assert "let keepDisabledAfterSuccess = false;" in launcher_update
    assert "keepDisabledAfterSuccess = true;" in launcher_update
    assert "if(keepDisabledAfterSuccess) return;" in launcher_update
