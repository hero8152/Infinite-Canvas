from __future__ import annotations

import subprocess
import venv
from pathlib import Path


def venv_python_is_usable(python_exe: Path) -> bool:
    if not python_exe.exists():
        return False
    try:
        subprocess.run(
            [str(python_exe), "-c", "import sys; raise SystemExit(0)"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return False
    return True


def prepare_packaging_venv(venv_dir: Path, python_exe: Path, requirements_path: Path) -> Path:
    if not venv_python_is_usable(python_exe):
        venv.EnvBuilder(with_pip=True, clear=True).create(venv_dir)
    subprocess.run(
        [str(python_exe), "-m", "pip", "install", "-r", str(requirements_path), "PyInstaller"],
        cwd=str(requirements_path.parent),
        check=True,
    )
    return python_exe
