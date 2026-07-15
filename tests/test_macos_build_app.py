import unittest
import tempfile
import os
from pathlib import Path
from unittest.mock import patch

from packaging.macos.build_app import (
    APP_NAME,
    APP_ICON_NAME,
    appdir_name,
    build_app,
    install_pyinstaller_output,
    prepare_app_icon,
    prepare_build_venv,
    run_pyinstaller,
    venv_python,
    write_info_plist,
)


def assert_posix_executable(testcase: unittest.TestCase, path: Path) -> None:
    if os.name == "nt":
        return
    testcase.assertEqual(path.stat().st_mode & 0o777, 0o755)


class MacBuildAppTests(unittest.TestCase):
    def test_run_pyinstaller_accepts_hidden_imports(self):
        dist_dir = Path("/tmp/dist")
        entrypoint = Path("/tmp/service_main.py")
        hidden = ["fastapi.staticfiles", "PIL.Image"]
        python_exe = Path("/tmp/venv/bin/python")

        with patch("packaging.macos.build_app.subprocess.run") as mocked_run:
            run_pyinstaller(python_exe, entrypoint, f"{APP_NAME} Service", dist_dir, hidden_imports=hidden)

        self.assertEqual(mocked_run.call_count, 1)
        args = mocked_run.call_args.args[0]
        self.assertEqual(args[0], str(python_exe))
        self.assertIn("--onedir", args)
        self.assertIn("--hidden-import", args)
        self.assertIn("fastapi.staticfiles", args)
        self.assertIn("PIL.Image", args)

    def test_run_pyinstaller_accepts_collect_data(self):
        dist_dir = Path("/tmp/dist")
        entrypoint = Path("/tmp/launcher_main.py")
        python_exe = Path("/tmp/venv/bin/python")

        with patch("packaging.macos.build_app.subprocess.run") as mocked_run:
            run_pyinstaller(python_exe, entrypoint, APP_NAME, dist_dir, collect_data=["certifi"])

        args = mocked_run.call_args.args[0]
        self.assertIn("--collect-data", args)
        self.assertIn("certifi", args)

    def test_run_pyinstaller_accepts_onefile_mode(self):
        dist_dir = Path("/tmp/dist")
        entrypoint = Path("/tmp/launcher_main.py")
        python_exe = Path("/tmp/venv/bin/python")

        with patch("packaging.macos.build_app.subprocess.run") as mocked_run:
            run_pyinstaller(python_exe, entrypoint, APP_NAME, dist_dir, onefile=True)

        args = mocked_run.call_args.args[0]
        self.assertIn("--onefile", args)
        self.assertNotIn("--onedir", args)

    def test_run_pyinstaller_accepts_windowed_mode(self):
        dist_dir = Path("/tmp/dist")
        entrypoint = Path("/tmp/launcher_main.py")
        python_exe = Path("/tmp/venv/bin/python")

        with patch("packaging.macos.build_app.subprocess.run") as mocked_run:
            run_pyinstaller(python_exe, entrypoint, APP_NAME, dist_dir, windowed=True)

        args = mocked_run.call_args.args[0]
        self.assertIn("--windowed", args)

    def test_run_pyinstaller_accepts_icon_path(self):
        dist_dir = Path("/tmp/dist")
        entrypoint = Path("/tmp/launcher_main.py")
        python_exe = Path("/tmp/venv/bin/python")
        icon_path = Path("/tmp/icon.icns")

        with patch("packaging.macos.build_app.subprocess.run") as mocked_run:
            run_pyinstaller(python_exe, entrypoint, APP_NAME, dist_dir, icon_path=icon_path)

        args = mocked_run.call_args.args[0]
        self.assertIn("--icon", args)
        self.assertIn(str(icon_path), args)

    def test_run_pyinstaller_skips_windowed_flag_by_default(self):
        dist_dir = Path("/tmp/dist")
        entrypoint = Path("/tmp/launcher_main.py")
        python_exe = Path("/tmp/venv/bin/python")

        with patch("packaging.macos.build_app.subprocess.run") as mocked_run:
            run_pyinstaller(python_exe, entrypoint, APP_NAME, dist_dir)

        args = mocked_run.call_args.args[0]
        self.assertNotIn("--windowed", args)

    def test_install_pyinstaller_output_installs_appdir_with_wrapper(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            build_bin_dir = root / "bin"
            macos_dir = root / "Infinite Canvas.app" / "Contents" / "MacOS"
            source_dir = build_bin_dir / APP_NAME
            source_dir.mkdir(parents=True)
            source_executable = source_dir / APP_NAME
            source_executable.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
            (source_dir / "_internal").mkdir()
            (source_dir / "_internal" / "lib.txt").write_text("runtime\n", encoding="utf-8")
            macos_dir.mkdir(parents=True)

            install_pyinstaller_output(build_bin_dir, macos_dir, APP_NAME, pass_app_bundle=True)

            wrapper = macos_dir / APP_NAME
            installed_executable = macos_dir / appdir_name(APP_NAME) / APP_NAME
            self.assertTrue(wrapper.exists())
            self.assertTrue(installed_executable.exists())
            self.assertTrue((macos_dir / appdir_name(APP_NAME) / "_internal" / "lib.txt").exists())
            wrapper_text = wrapper.read_text(encoding="utf-8")
            self.assertIn(f'exec "$SCRIPT_DIR/{appdir_name(APP_NAME)}/{APP_NAME}"', wrapper_text)
            self.assertIn('--app-bundle "$SCRIPT_DIR/../.."', wrapper_text)
            assert_posix_executable(self, wrapper)
            assert_posix_executable(self, installed_executable)

    def test_install_pyinstaller_output_installs_onefile_binary(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            build_bin_dir = root / "bin"
            macos_dir = root / "MacOS"
            build_bin_dir.mkdir(parents=True)
            macos_dir.mkdir()
            source = build_bin_dir / f"{APP_NAME} Updater"
            source.write_text("binary\n", encoding="utf-8")

            install_pyinstaller_output(build_bin_dir, macos_dir, f"{APP_NAME} Updater", onefile=True)

            target = macos_dir / f"{APP_NAME} Updater"
            self.assertEqual(target.read_text(encoding="utf-8"), "binary\n")
            assert_posix_executable(self, target)

    def test_venv_python_uses_bin_python(self):
        self.assertEqual(venv_python(Path("/tmp/build-venv")), Path("/tmp/build-venv/bin/python"))

    def test_prepare_app_icon_generates_icns_from_png(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            source = root / "logo.png"
            output = root / "InfiniteCanvas.icns"
            python_exe = root / "venv" / "bin" / "python"
            source.write_bytes(b"png")

            with patch("packaging.macos.build_app.subprocess.run") as mocked_run:
                resolved = prepare_app_icon(python_exe, source, output)

            self.assertEqual(resolved, output)
            command = mocked_run.call_args.args[0]
            self.assertEqual(command[0], str(python_exe))
            self.assertIn(str(source), command)
            self.assertIn(str(output), command)
            self.assertTrue(output.parent.exists())

    def test_write_info_plist_declares_app_icon(self):
        with tempfile.TemporaryDirectory() as tempdir:
            app_bundle = Path(tempdir) / f"{APP_NAME}.app"

            write_info_plist(app_bundle, "2026.05.30")

            plist_path = app_bundle / "Contents" / "Info.plist"
            self.assertIn(APP_ICON_NAME, plist_path.read_text(encoding="utf-8", errors="ignore"))

    def test_prepare_build_venv_creates_missing_venv_and_installs_dependencies(self):
        venv_dir = Path("/tmp/build-venv")
        python_exe = venv_python(venv_dir)

        with (
            patch.object(Path, "exists", return_value=False),
            patch("packaging.build_venv.venv.EnvBuilder") as env_builder,
            patch("packaging.build_venv.subprocess.run") as mocked_run,
        ):
            resolved = prepare_build_venv(venv_dir)

        env_builder.assert_called_once_with(with_pip=True, clear=True)
        env_builder.return_value.create.assert_called_once_with(venv_dir)
        mocked_run.assert_called_once()
        pip_command = mocked_run.call_args.args[0]
        self.assertEqual(pip_command[:4], [str(python_exe), "-m", "pip", "install"])
        self.assertEqual(resolved, python_exe)

    def test_build_app_collects_certifi_for_launcher(self):
        with tempfile.TemporaryDirectory() as tempdir:
            dist_dir = Path(tempdir) / "dist"
            venv_dir = Path(tempdir) / "venv"

            with (
                patch("packaging.macos.build_app.prepare_build_venv", return_value=Path("/tmp/venv/bin/python")),
                patch("packaging.macos.build_app.prepare_app_icon", return_value=Path("/tmp/InfiniteCanvas.icns")),
                patch("packaging.macos.build_app.build_pyinstaller_target") as build_target,
                patch("packaging.macos.build_app.install_pyinstaller_output"),
                patch("packaging.macos.build_app.build_payload"),
                patch("packaging.macos.build_app.shutil.copy2"),
                patch("packaging.macos.build_app.write_info_plist"),
                patch("packaging.macos.build_app.sign_app_bundle"),
            ):
                build_app(dist_dir, venv_dir)

        launcher_call = build_target.call_args_list[0]
        self.assertEqual(launcher_call.args[2], APP_NAME)
        self.assertIn("certifi", launcher_call.kwargs["hidden_imports"])
        self.assertIn("certifi", launcher_call.kwargs["collect_data"])


if __name__ == "__main__":
    unittest.main()
