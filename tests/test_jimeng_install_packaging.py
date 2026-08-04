import json
import unittest
from pathlib import Path


class JimengInstallPackagingTests(unittest.TestCase):
    def test_backend_exposes_native_install_session_api(self):
        source = Path("main.py").read_text(encoding="utf-8")

        self.assertIn("def install_jimeng_native_cli", source)
        self.assertIn('@app.post("/api/jimeng/install/start")', source)
        self.assertIn('@app.get("/api/jimeng/install/{session_id}/status")', source)

    def test_api_settings_exposes_install_dialog(self):
        html = Path("static/api-settings.html").read_text(encoding="utf-8")
        script = Path("static/js/api-settings.js").read_text(encoding="utf-8")

        self.assertIn('id="jimengInstallOverlay"', html)
        self.assertIn("fetch('/api/jimeng/install/start'", script)
        self.assertIn("/api/jimeng/install/${encodeURIComponent(sessionId)}/status", script)

    def test_payload_manifests_include_install_sources(self):
        required = {
            "main.py",
            "static/api-settings.html",
            "static/css/api-settings.css",
            "static/js/api-settings.js",
        }

        for manifest_path in (
            Path("packaging/windows/payload/manifest.json"),
            Path("packaging/macos/payload/manifest.json"),
        ):
            with self.subTest(manifest=str(manifest_path)):
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                self.assertTrue(required.issubset(set(manifest["payload_entries"])))


if __name__ == "__main__":
    unittest.main()
