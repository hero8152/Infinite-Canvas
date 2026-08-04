from __future__ import annotations

import argparse
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
APP_NAME = "Infinite Canvas"
PORTABLE_ROOT_NAME = f"{APP_NAME} Portable"
DEFAULT_DIST_DIR = ROOT / "dist" / "windows"
DEFAULT_OUTPUT = DEFAULT_DIST_DIR / "Infinite-Canvas-Windows-Portable.zip"
DEFAULT_PAYLOAD = ROOT / "packaging" / "windows" / "payload" / "app-base.zip"
DEFAULT_MANIFEST = ROOT / "packaging" / "windows" / "payload" / "manifest.json"


def require_path(path: Path) -> Path:
    if not path.exists():
        raise FileNotFoundError(f"Missing portable package input: {path}")
    return path


def write_tree(archive: zipfile.ZipFile, source: Path, arc_root: str) -> None:
    if source.is_dir():
        for child in sorted(source.rglob("*")):
            if child.is_dir():
                continue
            archive.write(child, f"{arc_root}/{child.relative_to(source).as_posix()}")
        return
    archive.write(source, arc_root)


def build_portable(
    dist_dir: Path = DEFAULT_DIST_DIR,
    output_path: Path = DEFAULT_OUTPUT,
    payload_path: Path = DEFAULT_PAYLOAD,
    manifest_path: Path = DEFAULT_MANIFEST,
) -> Path:
    launcher = require_path(dist_dir / f"{APP_NAME}.exe")
    updater = require_path(dist_dir / f"{APP_NAME} Updater.exe")
    service_dir = require_path(dist_dir / f"{APP_NAME} Service")
    payload = require_path(payload_path)
    manifest = require_path(manifest_path)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.exists():
        output_path.unlink()

    root = PORTABLE_ROOT_NAME
    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.write(launcher, f"{root}/{launcher.name}")
        archive.write(updater, f"{root}/{updater.name}")
        write_tree(archive, service_dir, f"{root}/{service_dir.name}")
        archive.write(payload, f"{root}/bootstrap/app-base.zip")
        archive.write(manifest, f"{root}/bootstrap/manifest.json")

    return output_path


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Windows portable zip for Infinite Canvas.")
    parser.add_argument("--dist-dir", type=Path, default=DEFAULT_DIST_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--payload", type=Path, default=DEFAULT_PAYLOAD)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    args = parser.parse_args()

    print(build_portable(args.dist_dir, args.output, args.payload, args.manifest))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
