import importlib
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch


class PayloadBuildTests(unittest.TestCase):
    def assert_payload_builder_filters_transient_files(self, module_name: str) -> None:
        module = importlib.import_module(module_name)

        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            static_js = root / "static" / "js"
            static_js.mkdir(parents=True)
            (static_js / "app.js").write_text("ok\n", encoding="utf-8")
            (static_js / "app.js.codex-backup").write_text("backup\n", encoding="utf-8")
            (root / "static" / ".DS_Store").write_text("finder\n", encoding="utf-8")
            pycache = root / "static" / "__pycache__"
            pycache.mkdir()
            (pycache / "cache.pyc").write_bytes(b"cache")

            output = root / "payload.zip"
            with (
                patch.object(module, "ROOT", root),
                patch.object(module, "INCLUDE_PATHS", ["static"]),
            ):
                written = module.build_payload(output)

            self.assertIn("static/js/app.js", written)
            self.assertNotIn("static/js/app.js.codex-backup", written)
            self.assertNotIn("static/.DS_Store", written)
            self.assertNotIn("static/__pycache__/cache.pyc", written)

            with zipfile.ZipFile(output) as archive:
                names = set(archive.namelist())
            self.assertEqual(names, set(written))

    def test_macos_payload_filters_transient_files(self):
        self.assert_payload_builder_filters_transient_files("packaging.macos.payload.build_payload")

    def test_windows_payload_filters_transient_files(self):
        self.assert_payload_builder_filters_transient_files("packaging.windows.payload.build_payload")


if __name__ == "__main__":
    unittest.main()
