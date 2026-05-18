from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
CANVAS = (ROOT / "static" / "canvas.html").read_text(encoding="utf-8")


class CanvasErrorFeedbackStaticTest(unittest.TestCase):
    def test_single_node_failures_show_status_badge(self):
        self.assertIn("const showStatus = ['generator','msgen','comfy','llm'].includes(node.type) && node.runStatus;", CANVAS)
        self.assertNotIn("node.runStatus !== 'failed' || node._cascadeFailed", CANVAS)

    def test_single_node_failures_show_retry_bar_with_error(self):
        self.assertIn("if(node.runStatus !== 'failed') return '';", CANVAS)
        self.assertNotIn("node.runStatus !== 'failed' || !node._cascadeFailed", CANVAS)


if __name__ == "__main__":
    unittest.main()
