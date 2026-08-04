import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from packaging.windows.build_launcher import APP_NAME, prepare_app_icon, prepare_build_venv, run_pyinstaller, venv_python


class WindowsBuildLauncherTests(unittest.TestCase):
    def test_run_pyinstaller_accepts_icon_path(self):
        python_exe = Path("C:/venv/Scripts/python.exe")
        entrypoint = Path("C:/project/launcher_main.py")
        dist_dir = Path("C:/project/dist")
        icon_path = Path("C:/project/build/icons/infinite-canvas.ico")

        with patch("packaging.windows.build_launcher.subprocess.run") as mocked_run:
            run_pyinstaller(python_exe, entrypoint, APP_NAME, dist_dir, icon_path=icon_path)

        args = mocked_run.call_args.args[0]
        self.assertIn("--icon", args)
        self.assertIn(str(icon_path), args)

    def test_prepare_app_icon_generates_ico_from_png(self):
        with tempfile.TemporaryDirectory() as tempdir:
            root = Path(tempdir)
            source = root / "logo.png"
            output = root / "infinite-canvas.ico"
            python_exe = root / "venv" / "Scripts" / "python.exe"
            source.write_bytes(b"png")

            with patch("packaging.windows.build_launcher.subprocess.run") as mocked_run:
                resolved = prepare_app_icon(python_exe, source, output)

            self.assertEqual(resolved, output)
            command = mocked_run.call_args.args[0]
            self.assertEqual(command[0], str(python_exe))
            self.assertIn(str(source), command)
            self.assertIn(str(output), command)
            self.assertTrue(output.parent.exists())

    def test_prepare_build_venv_recreates_unusable_existing_venv(self):
        venv_dir = Path("C:/project/build/windows-packaging-venv")
        python_exe = venv_python(venv_dir)
        failure = subprocess.CalledProcessError(103, [str(python_exe), "-c", "import sys; raise SystemExit(0)"])

        with (
            patch.object(Path, "exists", return_value=True),
            patch("packaging.build_venv.venv.EnvBuilder") as env_builder,
            patch("packaging.build_venv.subprocess.run", side_effect=[failure, None]) as mocked_run,
        ):
            resolved = prepare_build_venv(venv_dir)

        env_builder.assert_called_once_with(with_pip=True, clear=True)
        env_builder.return_value.create.assert_called_once_with(venv_dir)
        pip_command = mocked_run.call_args_list[1].args[0]
        self.assertEqual(pip_command[:4], [str(python_exe), "-m", "pip", "install"])
        self.assertEqual(resolved, python_exe)


if __name__ == "__main__":
    unittest.main()
