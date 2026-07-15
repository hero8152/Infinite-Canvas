from __future__ import annotations

import argparse
import json
import platform
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_UPDATE_BASE_URL = "https://github.com/hero8152/Infinite-Canvas/releases/latest/download"

WINDOWS_DIST_DIR = ROOT / "dist" / "windows"
WINDOWS_RELEASE_DIR = ROOT / "dist" / "windows-release"
WINDOWS_VENV_DIR = ROOT / "build" / "windows-packaging-venv"
MACOS_DIST_DIR = ROOT / "dist" / "macos"
MACOS_RELEASE_DIR = ROOT / "dist" / "macos-release"
MACOS_VENV_DIR = ROOT / "build" / "macos-packaging-venv"

APP_NAME = "Infinite Canvas"


@dataclass(frozen=True)
class BuildOptions:
    update_base_url: str = DEFAULT_UPDATE_BASE_URL
    dist_dir: Path | None = None
    release_dir: Path | None = None
    venv_dir: Path | None = None
    inno_compiler: Path | None = None
    skip_release: bool = False
    skip_portable: bool = False
    skip_installer: bool = False
    skip_dmg: bool = False
    strict_tools: bool = False


def select_target_platform(requested: str, system_name: str | None = None) -> str:
    if requested != "auto":
        return requested
    system = (system_name or platform.system()).lower()
    if system == "windows":
        return "windows"
    if system == "darwin":
        return "macos"
    raise RuntimeError(f"Unsupported packaging host: {platform.system()}. Run this on Windows or macOS.")


def current_host_platform() -> str:
    return select_target_platform("auto")


def ensure_native_build(target_platform: str) -> None:
    host = current_host_platform()
    if target_platform != host:
        raise RuntimeError(
            f"Cannot build {target_platform} package on {host}. "
            "PyInstaller app packages must be built on their target OS."
        )


def run_command(label: str, command: Sequence[str | Path]) -> None:
    printable = " ".join(str(part) for part in command)
    print(f"[packaging] {label}: {printable}")
    subprocess.run([str(part) for part in command], cwd=str(ROOT), check=True)


def has_tool(name: str) -> bool:
    return shutil.which(name) is not None


def read_version() -> str:
    lines = (ROOT / "VERSION").read_text(encoding="utf-8").strip().splitlines()
    version = lines[0].strip() if lines else ""
    return version or "0.0.0"


def find_inno_compiler(explicit_path: Path | None = None) -> Path | None:
    if explicit_path is not None:
        candidate = explicit_path.expanduser()
        if candidate.exists():
            return candidate
        raise FileNotFoundError(f"Inno Setup compiler not found: {candidate}")

    path_candidate = shutil.which("ISCC.exe") or shutil.which("iscc")
    if path_candidate:
        return Path(path_candidate)

    candidates = [
        Path("C:/my_program/Inno Setup 6/ISCC.exe"),
        Path("C:/Program Files (x86)/Inno Setup 6/ISCC.exe"),
        Path("C:/Program Files/Inno Setup 6/ISCC.exe"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def build_windows(options: BuildOptions) -> dict[str, str]:
    dist_dir = options.dist_dir or WINDOWS_DIST_DIR
    release_dir = options.release_dir or WINDOWS_RELEASE_DIR
    venv_dir = options.venv_dir or WINDOWS_VENV_DIR
    outputs: dict[str, str] = {
        "dist_dir": str(dist_dir),
        "payload": str(ROOT / "packaging" / "windows" / "payload" / "app-base.zip"),
    }

    run_command(
        "Build Windows payload",
        [sys.executable, ROOT / "packaging" / "windows" / "payload" / "build_payload.py"],
    )

    if not options.skip_release:
        run_command(
            "Build Windows update release",
            [
                sys.executable,
                ROOT / "packaging" / "windows" / "publish_release.py",
                "--output-dir",
                release_dir,
                "--update-base-url",
                options.update_base_url,
            ],
        )
        outputs["release_dir"] = str(release_dir)

    run_command(
        "Build Windows launcher/service/updater",
        [
            sys.executable,
            ROOT / "packaging" / "windows" / "build_launcher.py",
            "--dist-dir",
            dist_dir,
            "--venv-dir",
            venv_dir,
        ],
    )

    if not options.skip_portable:
        run_command(
            "Build Windows portable zip",
            [sys.executable, ROOT / "packaging" / "windows" / "build_portable.py", "--dist-dir", dist_dir],
        )
        outputs["portable_zip"] = str(dist_dir / "Infinite-Canvas-Windows-Portable.zip")

    if not options.skip_installer:
        compiler = find_inno_compiler(options.inno_compiler)
        if compiler is None:
            message = "Inno Setup ISCC not found; skipped Windows installer."
            if options.strict_tools:
                raise RuntimeError(message)
            print(f"[packaging] {message}")
            outputs["installer"] = "skipped"
        else:
            run_command(
                "Build Windows installer",
                [
                    compiler,
                    f"/DMyAppVersion={read_version()}",
                    ROOT / "packaging" / "windows" / "installer" / "infinite-canvas.iss",
                ],
            )
            outputs["installer"] = str(dist_dir / "Infinite Canvas 安装程序.exe")

    return outputs


def build_macos(options: BuildOptions) -> dict[str, str]:
    dist_dir = options.dist_dir or MACOS_DIST_DIR
    release_dir = options.release_dir or MACOS_RELEASE_DIR
    venv_dir = options.venv_dir or MACOS_VENV_DIR
    app_bundle = dist_dir / f"{APP_NAME}.app"
    outputs: dict[str, str] = {
        "dist_dir": str(dist_dir),
        "app_bundle": str(app_bundle),
        "payload": str(ROOT / "packaging" / "macos" / "payload" / "app-base.zip"),
    }

    run_command(
        "Build macOS payload",
        [sys.executable, ROOT / "packaging" / "macos" / "payload" / "build_payload.py"],
    )

    if not options.skip_release:
        run_command(
            "Build macOS update release",
            [
                sys.executable,
                ROOT / "packaging" / "macos" / "publish_release.py",
                "--output-dir",
                release_dir,
                "--update-base-url",
                options.update_base_url,
            ],
        )
        outputs["release_dir"] = str(release_dir)

    run_command(
        "Build macOS app bundle",
        [
            sys.executable,
            ROOT / "packaging" / "macos" / "build_app.py",
            "--dist-dir",
            dist_dir,
            "--venv-dir",
            venv_dir,
        ],
    )

    if not options.skip_portable:
        run_command(
            "Build macOS portable zip",
            [
                sys.executable,
                ROOT / "packaging" / "macos" / "build_portable.py",
                "--dist-dir",
                dist_dir,
                "--app-bundle",
                app_bundle,
            ],
        )
        outputs["portable_zip"] = str(dist_dir / "Infinite-Canvas-macOS-Portable.zip")

    if not options.skip_dmg:
        if not has_tool("hdiutil"):
            message = "hdiutil not found; skipped macOS DMG."
            if options.strict_tools:
                raise RuntimeError(message)
            print(f"[packaging] {message}")
            outputs["dmg"] = "skipped"
        else:
            run_command(
                "Build macOS DMG",
                [
                    sys.executable,
                    ROOT / "packaging" / "macos" / "build_dmg.py",
                    "--dist-dir",
                    dist_dir,
                    "--app-bundle",
                    app_bundle,
                ],
            )
            outputs["dmg"] = str(dist_dir / f"Infinite Canvas-{read_version()}.dmg")

    return outputs


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build local Infinite Canvas package for the current OS.")
    parser.add_argument("--platform", choices=("auto", "windows", "macos"), default="auto")
    parser.add_argument("--dist-dir", type=Path, default=None)
    parser.add_argument("--release-dir", type=Path, default=None)
    parser.add_argument("--update-base-url", default=DEFAULT_UPDATE_BASE_URL)
    parser.add_argument("--venv-dir", type=Path, default=None)
    parser.add_argument("--inno-compiler", type=Path, default=None)
    parser.add_argument("--skip-release", action="store_true")
    parser.add_argument("--skip-portable", action="store_true")
    parser.add_argument("--skip-installer", action="store_true")
    parser.add_argument("--skip-dmg", action="store_true")
    parser.add_argument("--strict-tools", action="store_true", help="Fail when optional native tools are missing.")
    return parser.parse_args(argv)


def options_from_args(args: argparse.Namespace) -> BuildOptions:
    return BuildOptions(
        update_base_url=str(args.update_base_url or "").strip(),
        dist_dir=args.dist_dir,
        release_dir=args.release_dir,
        venv_dir=args.venv_dir,
        inno_compiler=args.inno_compiler,
        skip_release=args.skip_release,
        skip_portable=args.skip_portable,
        skip_installer=args.skip_installer,
        skip_dmg=args.skip_dmg,
        strict_tools=args.strict_tools,
    )


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    target_platform = select_target_platform(args.platform)
    ensure_native_build(target_platform)
    options = options_from_args(args)
    outputs = build_windows(options) if target_platform == "windows" else build_macos(options)
    print(json.dumps({"platform": target_platform, "outputs": outputs}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
