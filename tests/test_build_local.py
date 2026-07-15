import unittest
from pathlib import Path
from unittest.mock import patch

from packaging import build_local


class BuildLocalTests(unittest.TestCase):
    def test_default_update_source_targets_upstream(self):
        self.assertEqual(
            build_local.DEFAULT_UPDATE_BASE_URL,
            "https://github.com/hero8152/Infinite-Canvas/releases/latest/download",
        )

    def test_select_target_platform_uses_current_os(self):
        self.assertEqual(build_local.select_target_platform("auto", "Windows"), "windows")
        self.assertEqual(build_local.select_target_platform("auto", "Darwin"), "macos")

        with self.assertRaisesRegex(RuntimeError, "Unsupported packaging host"):
            build_local.select_target_platform("auto", "Linux")

    def test_build_windows_runs_full_local_package_chain(self):
        options = build_local.BuildOptions(
            dist_dir=Path("dist/win-test"),
            release_dir=Path("dist/win-release-test"),
            venv_dir=Path("build/win-venv-test"),
        )

        with (
            patch("packaging.build_local.run_command") as run_command,
            patch("packaging.build_local.find_inno_compiler", return_value=Path("C:/Inno/ISCC.exe")),
            patch("packaging.build_local.read_version", return_value="2026.07.13"),
        ):
            outputs = build_local.build_windows(options)

        labels = [call.args[0] for call in run_command.call_args_list]
        self.assertEqual(
            labels,
            [
                "Build Windows payload",
                "Build Windows update release",
                "Build Windows launcher/service/updater",
                "Build Windows portable zip",
                "Build Windows installer",
            ],
        )
        release_command = run_command.call_args_list[1].args[1]
        installer_command = run_command.call_args_list[4].args[1]
        self.assertIn("--update-base-url", release_command)
        self.assertIn(build_local.DEFAULT_UPDATE_BASE_URL, release_command)
        self.assertIn("/DMyAppVersion=2026.07.13", installer_command)
        self.assertEqual(Path(outputs["release_dir"]), Path("dist/win-release-test"))
        self.assertEqual(Path(outputs["portable_zip"]), Path("dist/win-test/Infinite-Canvas-Windows-Portable.zip"))

    def test_build_windows_skips_missing_installer_tool_by_default(self):
        options = build_local.BuildOptions(skip_release=True, skip_portable=True)

        with (
            patch("packaging.build_local.run_command") as run_command,
            patch("packaging.build_local.find_inno_compiler", return_value=None),
        ):
            outputs = build_local.build_windows(options)

        labels = [call.args[0] for call in run_command.call_args_list]
        self.assertEqual(labels, ["Build Windows payload", "Build Windows launcher/service/updater"])
        self.assertEqual(outputs["installer"], "skipped")

    def test_build_macos_runs_full_local_package_chain(self):
        options = build_local.BuildOptions(
            dist_dir=Path("dist/mac-test"),
            release_dir=Path("dist/mac-release-test"),
            venv_dir=Path("build/mac-venv-test"),
        )

        with (
            patch("packaging.build_local.run_command") as run_command,
            patch("packaging.build_local.has_tool", return_value=True),
        ):
            outputs = build_local.build_macos(options)

        labels = [call.args[0] for call in run_command.call_args_list]
        self.assertEqual(
            labels,
            [
                "Build macOS payload",
                "Build macOS update release",
                "Build macOS app bundle",
                "Build macOS portable zip",
                "Build macOS DMG",
            ],
        )
        portable_command = run_command.call_args_list[3].args[1]
        dmg_command = run_command.call_args_list[4].args[1]
        self.assertIn(Path("dist/mac-test/Infinite Canvas.app"), portable_command)
        self.assertIn(Path("dist/mac-test/Infinite Canvas.app"), dmg_command)
        self.assertEqual(Path(outputs["release_dir"]), Path("dist/mac-release-test"))
        self.assertEqual(Path(outputs["portable_zip"]), Path("dist/mac-test/Infinite-Canvas-macOS-Portable.zip"))

        build_app_command = run_command.call_args_list[2].args[1]
        self.assertIn("--venv-dir", build_app_command)
        self.assertIn(Path("build/mac-venv-test"), build_app_command)

    def test_build_macos_skips_missing_dmg_tool_by_default(self):
        options = build_local.BuildOptions(skip_release=True, skip_portable=True)

        with (
            patch("packaging.build_local.run_command") as run_command,
            patch("packaging.build_local.has_tool", return_value=False),
        ):
            outputs = build_local.build_macos(options)

        labels = [call.args[0] for call in run_command.call_args_list]
        self.assertEqual(labels, ["Build macOS payload", "Build macOS app bundle"])
        self.assertEqual(outputs["dmg"], "skipped")


if __name__ == "__main__":
    unittest.main()
