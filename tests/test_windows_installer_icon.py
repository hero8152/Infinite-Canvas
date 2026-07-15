from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_inno_installer_uses_generated_logo_icon():
    script = (ROOT / "packaging" / "windows" / "installer" / "infinite-canvas.iss").read_text(encoding="utf-8")

    assert '#define MyAppIcon "..\\..\\..\\build\\icons\\infinite-canvas.ico"' in script
    assert "SetupIconFile={#MyAppIcon}" in script


def test_inno_installer_uses_injected_version_metadata():
    script = (ROOT / "packaging" / "windows" / "installer" / "infinite-canvas.iss").read_text(encoding="utf-8")

    assert "AppVersion=0.1.0" not in script
    assert 'MyAppVersion "0.0.0"' in script
    assert "AppVersion={#MyAppVersion}" in script
    assert "AppVerName={#MyAppName} {#MyAppVersion}" in script
    assert "VersionInfoVersion={#MyAppVersion}" in script
    assert "UninstallDisplayName={#MyAppName} {#MyAppVersion}" in script
