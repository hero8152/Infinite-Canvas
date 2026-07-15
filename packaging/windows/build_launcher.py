from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from packaging.build_venv import prepare_packaging_venv

APP_NAME = "Infinite Canvas"
APP_ICON_SOURCE = ROOT / "static" / "images" / "logo.png"
APP_ICON_PATH = ROOT / "build" / "icons" / "infinite-canvas.ico"
WINDOWS_SERVICE_HIDDEN_IMPORTS = [
    "fastapi.staticfiles",
    "fastapi.responses",
    "fastapi.middleware.cors",
    "fastapi.exceptions",
    "pydantic",
    "pydantic_core",
    "PIL.Image",
    "requests",
    "httpx",
    "uvicorn",
]


def run_pyinstaller(
    python_exe: Path,
    entrypoint: Path,
    name: str,
    dist_dir: Path,
    *,
    onefile: bool = True,
    hidden_imports: list[str] | None = None,
    icon_path: Path | None = None,
) -> None:
    command = [
        str(python_exe),
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--name",
        name,
        "--distpath",
        str(dist_dir),
    ]
    command.append("--onefile" if onefile else "--onedir")
    if icon_path:
        command.extend(["--icon", str(icon_path)])
    for item in hidden_imports or []:
        if item:
            command.extend(["--hidden-import", item])
    command.append(str(entrypoint))
    subprocess.run(command, cwd=str(ROOT), check=True)


def prepare_app_icon(python_exe: Path, source: Path = APP_ICON_SOURCE, output: Path = APP_ICON_PATH) -> Path:
    if not source.is_file():
        raise FileNotFoundError(f"Missing app icon source: {source}")
    output.parent.mkdir(parents=True, exist_ok=True)
    script = (
        "import sys\n"
        "from pathlib import Path\n"
        "from PIL import Image\n"
        "source = Path(sys.argv[1])\n"
        "output = Path(sys.argv[2])\n"
        "with Image.open(source) as image:\n"
        "    image.convert('RGBA').save(output, format='ICO', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])\n"
    )
    subprocess.run([str(python_exe), "-c", script, str(source), str(output)], cwd=str(ROOT), check=True)
    return output


def venv_python(venv_dir: Path) -> Path:
    return venv_dir / "Scripts" / "python.exe"


def prepare_build_venv(venv_dir: Path) -> Path:
    python_exe = venv_python(venv_dir)
    return prepare_packaging_venv(venv_dir, python_exe, ROOT / "requirements.txt")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Windows launcher and updater executables.")
    parser.add_argument("--dist-dir", type=Path, default=ROOT / "dist" / "windows")
    parser.add_argument("--venv-dir", type=Path, default=ROOT / "build" / "windows-packaging-venv")
    args = parser.parse_args()

    args.dist_dir.mkdir(parents=True, exist_ok=True)
    service_dir = args.dist_dir / f"{APP_NAME} Service"
    if service_dir.exists():
        shutil.rmtree(service_dir)

    python_exe = prepare_build_venv(args.venv_dir)
    icon_path = prepare_app_icon(python_exe)
    run_pyinstaller(
        python_exe,
        ROOT / "packaging" / "windows" / "launcher" / "launcher_main.py",
        APP_NAME,
        args.dist_dir,
        icon_path=icon_path,
    )
    run_pyinstaller(
        python_exe,
        ROOT / "packaging" / "windows" / "service" / "service_main.py",
        f"{APP_NAME} Service",
        args.dist_dir,
        onefile=False,
        hidden_imports=WINDOWS_SERVICE_HIDDEN_IMPORTS,
        icon_path=icon_path,
    )
    run_pyinstaller(
        python_exe,
        ROOT / "packaging" / "windows" / "updater" / "updater_main.py",
        f"{APP_NAME} Updater",
        args.dist_dir,
        icon_path=icon_path,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
