#!/usr/bin/env python3
"""Build a Windows portable bundle with an embedded Python runtime.

The repository ships Windows cp314 wheels in packages/. This script combines
those wheels with the official CPython embeddable runtime and the application
files, producing a zip that can be shared with Windows testers without requiring
Python or pip installation on their machines.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import shutil
import sys
import textwrap
import urllib.request
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CACHE_DIR = ROOT / ".package-cache"
DIST_DIR = ROOT / "dist"
PACKAGE_NAME = "Infinite-Canvas-Windows-Portable"

PYTHON_EMBED_URL = (
    "https://www.python.org/ftp/python/3.14.5/"
    "python-3.14.5-embeddable-amd64.zip"
)
PYTHON_EMBED_SHA256 = "613011911210b308ab308274f77b713d5994b081ca78f89afab8d1674388a51f"

APP_FILES = [
    "main.py",
    "app_config.py",
    "task_status.py",
    "requirements.txt",
    "README.md",
    "DESIGN.md",
    "CLAUDE.md",
    "运行说明.txt",
    "readme.txt",
    "说明.png",
]
APP_DIRS = [
    "static",
    "workflows",
    "packages",
]
REQUIRED_WHEEL_PREFIXES = [
    "annotated_doc-",
    "annotated_types-",
    "anyio-",
    "certifi-",
    "charset_normalizer-",
    "click-",
    "colorama-",
    "fastapi-",
    "h11-",
    "httpcore-",
    "httpx-",
    "idna-",
    "pillow-",
    "pydantic-",
    "pydantic_core-",
    "python_multipart-",
    "requests-",
    "starlette-",
    "typing_extensions-",
    "typing_inspection-",
    "urllib3-",
    "uvicorn-",
    "websockets-",
]


def log(message: str) -> None:
    print(f"[portable] {message}")


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def download_python_embed() -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    target = CACHE_DIR / Path(PYTHON_EMBED_URL).name
    if target.exists() and sha256(target) == PYTHON_EMBED_SHA256:
        log(f"using cached {target.name}")
        return target

    if target.exists():
        target.unlink()

    log(f"downloading {PYTHON_EMBED_URL}")
    with urllib.request.urlopen(PYTHON_EMBED_URL, timeout=120) as response:
        target.write_bytes(response.read())

    actual = sha256(target)
    if actual != PYTHON_EMBED_SHA256:
        target.unlink(missing_ok=True)
        raise SystemExit(
            f"Python embeddable zip sha256 mismatch: expected {PYTHON_EMBED_SHA256}, got {actual}"
        )
    return target


def clean_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True)


def ignore_junk(_: str, names: list[str]) -> set[str]:
    ignored = {
        "__pycache__",
        ".DS_Store",
        "Thumbs.db",
    }
    return {name for name in names if name in ignored or name.endswith(".pyc")}


def copy_app_files(package_dir: Path) -> None:
    for rel in APP_FILES:
        src = ROOT / rel
        if src.exists():
            dst = package_dir / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)

    for rel in APP_DIRS:
        src = ROOT / rel
        if not src.exists():
            continue
        shutil.copytree(src, package_dir / rel, ignore=ignore_junk)


def ensure_wheels(package_dir: Path) -> list[Path]:
    wheels_dir = package_dir / "packages"
    wheels = sorted(wheels_dir.glob("*.whl"))
    missing = [
        prefix
        for prefix in REQUIRED_WHEEL_PREFIXES
        if not any(wheel.name.startswith(prefix) for wheel in wheels)
    ]
    if missing:
        raise SystemExit(
            "Missing offline wheels in packages/: " + ", ".join(prefix.rstrip("-") for prefix in missing)
        )
    return wheels


def extract_python_runtime(package_dir: Path, python_zip: Path) -> Path:
    python_dir = package_dir / "python"
    clean_dir(python_dir)
    with zipfile.ZipFile(python_zip) as zf:
        zf.extractall(python_dir)

    pth_files = sorted(python_dir.glob("python*._pth"))
    if not pth_files:
        raise SystemExit("Could not find python*._pth in embedded Python runtime")
    pth = pth_files[0]
    pth.write_text(
        "python314.zip\r\n"
        ".\r\n"
        "Lib\\site-packages\r\n"
        "import site\r\n",
        encoding="utf-8",
        newline="",
    )
    (python_dir / "Lib" / "site-packages").mkdir(parents=True, exist_ok=True)
    return python_dir


def install_wheels_into_embedded_python(python_dir: Path, wheels: list[Path]) -> None:
    site_packages = python_dir / "Lib" / "site-packages"
    log(f"extracting {len(wheels)} wheels into embedded site-packages")
    for wheel in wheels:
        with zipfile.ZipFile(wheel) as zf:
            zf.extractall(site_packages)


def write_text(path: Path, content: str, newline: str = "\r\n") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(textwrap.dedent(content).lstrip(), encoding="utf-8", newline=newline)


def write_windows_files(package_dir: Path) -> None:
    env_template = """
    COMFLY_BASE_URL=https://ai.comfly.chat
    COMFLY_API_KEY=
    MODELSCOPE_API_KEY=
    COMFYUI_INSTANCES=127.0.0.1:8188,127.0.0.1:4090
    SYSTEM_PROMPT=You are a helpful assistant.
    MAX_HISTORY_MESSAGES=30
    REQUEST_TIMEOUT=120
    IMAGE_POLL_INTERVAL=2
    CHAT_MODELS=gpt-4o-mini,gemini-3.1-flash-image-preview-2k
    IMAGE_MODELS=gpt-image-2,nano-banana-pro
    MODELSCOPE_CHAT_MODELS=Qwen/Qwen3-235B-A22B,MiniMax/MiniMax-M2.7:MiniMax
    APP_HOST=127.0.0.1
    APP_PORT=3000
    CORS_ALLOW_ORIGINS=http://127.0.0.1:3000,http://localhost:3000
    """
    write_text(package_dir / "API" / ".env.example", env_template)
    write_text(package_dir / "API" / ".env", env_template)

    write_text(
        package_dir / "启动 Infinite Canvas.bat",
        r"""
        @echo off
        chcp 65001 >nul
        setlocal
        cd /d "%~dp0"

        set "PYTHON=%~dp0python\python.exe"
        if not exist "%PYTHON%" (
            echo [ERROR] 未找到内置 Python: %PYTHON%
            echo 请确认解压完整，不要只复制单个启动文件。
            pause
            exit /b 1
        )

        if not exist "API" mkdir "API"
        if not exist "API\.env" (
            copy /y "API\.env.example" "API\.env" >nul
        )

        set "APP_PORT=3000"
        for /f "tokens=2 delims==" %%A in ('findstr /b /c:"APP_PORT=" "API\.env" 2^>nul') do set "APP_PORT=%%A"
        set "APP_URL=http://127.0.0.1:%APP_PORT%/"

        echo ============================================
        echo   Infinite Canvas portable server
        echo ============================================
        echo.
        echo URL: %APP_URL%
        echo 配置文件: %~dp0API\.env
        echo 关闭窗口或按 Ctrl+C 可停止服务。
        echo.

        start "" /b powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds 3; Start-Process '%APP_URL%'" >nul 2>nul
        "%PYTHON%" "%~dp0main.py"

        echo.
        echo 服务已停止。
        pause
        """,
    )

    write_text(
        package_dir / "run.bat",
        r"""
        @echo off
        call "%~dp0启动 Infinite Canvas.bat"
        """,
    )

    write_text(
        package_dir / "检查运行环境.bat",
        r"""
        @echo off
        chcp 65001 >nul
        setlocal
        cd /d "%~dp0"
        set "PYTHON=%~dp0python\python.exe"
        if not exist "%PYTHON%" (
            echo [ERROR] 未找到内置 Python: %PYTHON%
            pause
            exit /b 1
        )
        "%PYTHON%" -c "import fastapi, uvicorn, requests, pydantic, httpx, PIL, websockets; print('OK'); print('fastapi', fastapi.__version__); print('uvicorn', uvicorn.__version__); print('pydantic', pydantic.__version__); print('Pillow', PIL.__version__); print('websockets', websockets.__version__)"
        echo.
        pause
        """,
    )

    write_text(
        package_dir / "生成EXE启动器.bat",
        r"""
        @echo off
        chcp 65001 >nul
        setlocal
        cd /d "%~dp0"

        set "CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
        if not exist "%CSC%" set "CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
        if not exist "%CSC%" (
            echo [ERROR] 未找到 .NET Framework C# 编译器 csc.exe。
            echo Windows 端不能生成 EXE 时，直接双击 "启动 Infinite Canvas.bat" 也可以运行。
            pause
            exit /b 1
        )

        "%CSC%" /nologo /target:winexe /reference:System.Windows.Forms.dll /out:"Infinite Canvas.exe" "launcher\InfiniteCanvasLauncher.cs"
        if errorlevel 1 (
            echo [ERROR] EXE 启动器生成失败。
            pause
            exit /b 1
        )

        echo 已生成: %~dp0Infinite Canvas.exe
        pause
        """,
    )

    write_text(
        package_dir / "launcher" / "InfiniteCanvasLauncher.cs",
        r"""
        using System;
        using System.Diagnostics;
        using System.IO;
        using System.Windows.Forms;

        internal static class InfiniteCanvasLauncher
        {
            [STAThread]
            private static int Main()
            {
                string appDir = AppDomain.CurrentDomain.BaseDirectory;
                string batPath = Path.Combine(appDir, "启动 Infinite Canvas.bat");
                if (!File.Exists(batPath))
                {
                    MessageBox.Show(
                        "未找到启动 Infinite Canvas.bat。请确认整个文件夹解压完整。",
                        "Infinite Canvas",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                    return 1;
                }

                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = "/c \"\"" + batPath + "\"\"",
                    WorkingDirectory = appDir,
                    UseShellExecute = false
                };

                Process.Start(psi);
                return 0;
            }
        }
        """,
    )

    write_text(
        package_dir / "使用说明-先看我.txt",
        """
        Infinite Canvas Windows 便携测试包
        =================================

        1. 解压整个文件夹，不要只复制其中某个文件。
        2. 双击“启动 Infinite Canvas.bat”。
        3. 浏览器会自动打开 http://127.0.0.1:3000/。
        4. 配置文件在 API\\.env。需要使用 Comfly 或 ModelScope 时，把自己的 key 填进去：
           COMFLY_API_KEY=sk-...
           MODELSCOPE_API_KEY=ms-...
        5. 如果使用本地 ComfyUI，请确认 COMFYUI_INSTANCES 端口和 workflows 里的工作流可用。

        这个包已经包含：
        - python\\python.exe：Windows 64 位内置 Python 3.14 运行环境
        - python\\Lib\\site-packages：已解压好的依赖
        - packages\\：离线 wheel 备份，便于排查或重建

        EXE 启动器：
        - 我在 macOS 上不能直接编译 Windows EXE。
        - 如果你想要 exe，拿到 Windows 电脑后双击“生成EXE启动器.bat”，成功后会生成“Infinite Canvas.exe”。
        - 如果 EXE 生成失败，不影响使用；继续双击“启动 Infinite Canvas.bat”即可。

        注意：
        - 分发包没有包含任何真实 API key。
        - output、data、history.json 会在本机运行时生成，不会预置历史数据。
        - 如果 3000 端口被占用，修改 API\\.env 里的 APP_PORT 后重新启动。
        """,
    )


def zip_dir(package_dir: Path, zip_path: Path) -> None:
    if zip_path.exists():
        zip_path.unlink()
    log(f"creating {zip_path}")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(package_dir.rglob("*")):
            if path.is_file():
                zf.write(path, path.relative_to(package_dir.parent))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--no-zip", action="store_true", help="Build folder only, do not create zip")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    python_zip = download_python_embed()

    DIST_DIR.mkdir(exist_ok=True)
    package_dir = DIST_DIR / PACKAGE_NAME
    clean_dir(package_dir)

    log("copying application files")
    copy_app_files(package_dir)
    wheels = ensure_wheels(package_dir)

    log("extracting embedded Python runtime")
    python_dir = extract_python_runtime(package_dir, python_zip)
    install_wheels_into_embedded_python(python_dir, wheels)
    write_windows_files(package_dir)

    zip_path = DIST_DIR / f"{PACKAGE_NAME}.zip"
    if not args.no_zip:
        zip_dir(package_dir, zip_path)

    log(f"done: {package_dir}")
    if not args.no_zip:
        log(f"zip: {zip_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
