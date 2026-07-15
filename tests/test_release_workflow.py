import unittest
from pathlib import Path


class ReleaseWorkflowTests(unittest.TestCase):
    def test_windows_installer_version_comes_from_version_file(self):
        workflow = Path(".github/workflows/release-installers.yml").read_text(encoding="utf-8")

        self.assertIn("Get-Content -LiteralPath VERSION", workflow)
        self.assertIn('"/DMyAppVersion=$version"', workflow)

    def test_release_workflow_uploads_only_prefixed_update_assets(self):
        workflow = Path(".github/workflows/release-installers.yml").read_text(encoding="utf-8")

        for asset in (
            "windows-VERSION",
            "windows-manifest.json",
            "windows-app-base.zip",
            "macos-VERSION",
            "macos-manifest.json",
            "macos-app-base.zip",
        ):
            self.assertIn(asset, workflow)

        for legacy_asset in ("VERSION", "manifest.json", "app-base.zip"):
            self.assertNotIn(f"dist\\release-assets\\{legacy_asset}", workflow)
            self.assertNotIn(f"dist/release-assets/{legacy_asset}", workflow)


if __name__ == "__main__":
    unittest.main()
