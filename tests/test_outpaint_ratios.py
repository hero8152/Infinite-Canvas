import json
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RATIOS = ("1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9", "9:21")


class OutpaintRatioTests(unittest.TestCase):
    def run_ratio_module(self, width, height, preset):
        module = (ROOT / "static" / "js" / "outpaint-ratios.js").as_posix()
        script = (
            f"const r=require({json.dumps(module)});"
            f"process.stdout.write(JSON.stringify(r.fitContaining({width},{height},{json.dumps(preset)})));"
        )
        result = subprocess.run(["node", "-e", script], check=True, capture_output=True, text=True)
        return json.loads(result.stdout)

    def test_common_ratios_contain_source_and_are_exact(self):
        for preset in RATIOS:
            with self.subTest(preset=preset):
                result = self.run_ratio_module(1024, 768, preset)
                left, right = map(int, preset.split(":"))
                self.assertGreaterEqual(result["width"], 1024)
                self.assertGreaterEqual(result["height"], 768)
                self.assertEqual(result["width"] * right, result["height"] * left)
                self.assertEqual(result["width"] % 16, 0)
                self.assertEqual(result["height"] % 16, 0)

    def test_source_ratio_keeps_original_size(self):
        self.assertEqual(
            self.run_ratio_module(1234, 987, "source"),
            {"width": 1234, "height": 987, "offsetX": 0, "offsetY": 0, "preset": "source"},
        )

    def test_both_canvas_editors_expose_same_presets(self):
        for filename in ("canvas.html", "smart-canvas.html"):
            html = (ROOT / "static" / filename).read_text(encoding="utf-8")
            self.assertIn('/static/js/outpaint-ratios.js', html)
            for preset in ("free", "source", *RATIOS):
                self.assertIn(f'data-outpaint-ratio="{preset}"', html)


if __name__ == "__main__":
    unittest.main()
