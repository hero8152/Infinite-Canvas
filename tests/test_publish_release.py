import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from packaging.windows.publish_release import publish_release


class PublishReleaseTests(unittest.TestCase):
    def test_publish_release_builds_static_update_tree(self):
        with tempfile.TemporaryDirectory() as tempdir:
            output_dir = Path(tempdir) / "release"

            result = publish_release(output_dir, update_base_url="https://example.com/downloads")

            version = Path("VERSION").read_text(encoding="utf-8").strip().splitlines()[0].strip()
            self.assertEqual(result["version"], version)
            self.assertTrue((output_dir / "windows-VERSION").exists())
            self.assertTrue((output_dir / "windows-manifest.json").exists())
            self.assertTrue((output_dir / "windows-app-base.zip").exists())
            self.assertFalse((output_dir / "VERSION").exists())
            self.assertFalse((output_dir / "manifest.json").exists())
            self.assertFalse((output_dir / "app-base.zip").exists())
            self.assertTrue((output_dir / version / "windows-VERSION").exists())
            self.assertTrue((output_dir / version / "windows-manifest.json").exists())
            self.assertTrue((output_dir / version / "windows-app-base.zip").exists())

            root_manifest = json.loads((output_dir / "windows-manifest.json").read_text(encoding="utf-8"))
            version_manifest = json.loads((output_dir / version / "windows-manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(root_manifest["update_base_url"], "https://example.com/downloads")
            self.assertEqual(version_manifest["update_base_url"], f"https://example.com/downloads/{version}")
            self.assertEqual(root_manifest["version_endpoint"], "windows-VERSION")
            self.assertEqual(root_manifest["manifest_endpoint"], "windows-manifest.json")
            self.assertEqual(root_manifest["payload_endpoint"], "windows-app-base.zip")
            self.assertIn("app_runtime.py", root_manifest["payload_entries"])

            with zipfile.ZipFile(output_dir / "windows-app-base.zip") as archive:
                names = set(archive.namelist())
            self.assertIn("main.py", names)
            self.assertIn("app_runtime.py", names)


if __name__ == "__main__":
    unittest.main()
