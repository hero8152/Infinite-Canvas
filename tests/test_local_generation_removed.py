import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


class LocalGenerationRemovalTests(unittest.TestCase):
    def test_local_pages_and_workflows_are_removed(self):
        for relative in (
            "static/zimage.html",
            "static/enhance.html",
            "static/klein.html",
            "static/angle.html",
            "static/comfyui-settings.html",
            "static/js/comfyui-settings.js",
            "static/js/ltx-director-timeline.js",
        ):
            self.assertFalse((ROOT / relative).exists(), relative)
        workflow_dir = ROOT / "workflows"
        self.assertFalse(workflow_dir.exists() and any(workflow_dir.iterdir()))

    def test_shell_and_canvas_have_no_local_generation_entry(self):
        index = (ROOT / "static/index.html").read_text(encoding="utf-8")
        canvas = (ROOT / "static/canvas.html").read_text(encoding="utf-8")
        smart = (ROOT / "static/smart-canvas.html").read_text(encoding="utf-8")
        for marker in ("本地功能", "工作流设置", "frame-zimage", "frame-comfyui-settings"):
            self.assertNotIn(marker, index)
        for marker in ("addComfyNode", "addLTXDirectorNode", "addMsGenNode", "menuAdd('comfy')", "menuAdd('msgen')"):
            self.assertNotIn(marker, canvas)
        self.assertNotIn('value="comfy"', smart)
        self.assertNotIn('value="modelscope"', smart)

    def test_backend_local_routes_and_config_are_removed(self):
        source = (ROOT / "main.py").read_text(encoding="utf-8")
        removed_routes = (
            '/api/queue_status',
            '/api/upload',
            '/api/comfyui/',
            '/api/workflows',
            '/api/canvas-comfy-tasks',
            '/api/forge-neo/',
            '/api/angle/',
            '/api/ms/generate',
        )
        for route in removed_routes:
            self.assertNotIn(route, source)
        self.assertNotIn('"comfy_instances"', source)
        self.assertNotIn("COMFYUI_INSTANCES", source)
        self.assertNotIn("FORGE_NEO_BASE_URL", source)
        self.assertIn('/api/canvas-workflows/export', source)
        self.assertIn('/api/runninghub/workflows', source)

    def test_build_does_not_package_local_workflows(self):
        for relative in ("tools/build-portable.ps1", "tools/browser-smoke-server.ps1"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            self.assertNotIn('Join-Path $projectRoot "workflows"', source)


if __name__ == "__main__":
    unittest.main()
