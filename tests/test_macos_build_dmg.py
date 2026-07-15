import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import subprocess

from packaging.macos.build_app import APP_NAME
from packaging.macos.build_dmg import MAX_HDIUTIL_RETRIES, build_dmg


class MacBuildDmgTests(unittest.TestCase):
    def test_build_dmg_reuses_existing_app_bundle(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            dist_dir = root / "dist"
            app_bundle = dist_dir / f"{APP_NAME}.app"
            app_bundle.mkdir(parents=True)

            with (
                patch("packaging.macos.build_dmg.build_app") as build_app,
                patch("packaging.macos.build_dmg.shutil.copytree"),
                patch.object(Path, "symlink_to"),
                patch("packaging.macos.build_dmg.subprocess.run"),
                patch("packaging.macos.build_dmg.read_version", return_value="1.2.3"),
            ):
                dmg_path = build_dmg(dist_dir, app_bundle)

        build_app.assert_not_called()
        self.assertEqual(dmg_path, dist_dir / f"{APP_NAME}-1.2.3.dmg")

    def test_build_dmg_retries_resource_busy_failures(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            dist_dir = root / "dist"
            app_bundle = dist_dir / f"{APP_NAME}.app"
            app_bundle.mkdir(parents=True)
            failure = subprocess.CalledProcessError(1, ["hdiutil", "create"], stderr="hdiutil: create failed - Resource busy")

            with (
                patch("packaging.macos.build_dmg.build_app") as build_app,
                patch("packaging.macos.build_dmg.shutil.copytree"),
                patch.object(Path, "symlink_to"),
                patch("packaging.macos.build_dmg.time.sleep") as sleep,
                patch("packaging.macos.build_dmg.read_version", return_value="1.2.3"),
                patch("packaging.macos.build_dmg.subprocess.run", side_effect=[failure, None]) as run,
            ):
                dmg_path = build_dmg(dist_dir, app_bundle)

        build_app.assert_not_called()
        self.assertEqual(run.call_count, 2)
        self.assertEqual(sleep.call_count, 1)
        self.assertLessEqual(run.call_count, MAX_HDIUTIL_RETRIES)
        self.assertEqual(dmg_path, dist_dir / f"{APP_NAME}-1.2.3.dmg")


if __name__ == "__main__":
    unittest.main()
