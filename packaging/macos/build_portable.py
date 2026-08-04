from __future__ import annotations

import argparse
import stat
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from packaging.macos.build_app import APP_NAME, DEFAULT_DIST_DIR, build_app


DEFAULT_OUTPUT = DEFAULT_DIST_DIR / "Infinite-Canvas-macOS-Portable.zip"


def bundle_zip_info(app_bundle: Path, child: Path) -> zipfile.ZipInfo:
    arcname = f"{app_bundle.name}/{child.relative_to(app_bundle).as_posix()}"
    info = zipfile.ZipInfo.from_file(child, arcname)
    mode = 0o755 if child.parent.name == "MacOS" else stat.S_IMODE(child.stat().st_mode)
    info.external_attr = (stat.S_IFREG | mode) << 16
    return info


def write_bundle(archive: zipfile.ZipFile, app_bundle: Path) -> None:
    for child in sorted(app_bundle.rglob("*")):
        if child.is_dir():
            continue
        with child.open("rb") as fh:
            archive.writestr(bundle_zip_info(app_bundle, child), fh.read())


def resolve_app_bundle(dist_dir: Path, app_bundle: Path | None = None) -> Path:
    bundle = app_bundle or dist_dir / f"{APP_NAME}.app"
    if bundle.exists():
        return bundle
    if app_bundle:
        raise FileNotFoundError(f"Missing portable package input: {app_bundle}")
    return build_app(dist_dir)


def build_portable(
    dist_dir: Path = DEFAULT_DIST_DIR,
    output_path: Path = DEFAULT_OUTPUT,
    app_bundle: Path | None = None,
) -> Path:
    bundle = resolve_app_bundle(dist_dir, app_bundle)
    if not bundle.is_dir():
        raise NotADirectoryError(f"Portable package input is not an app bundle: {bundle}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.exists():
        output_path.unlink()

    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        write_bundle(archive, bundle)

    return output_path


def main() -> int:
    parser = argparse.ArgumentParser(description="Build macOS portable app zip for Infinite Canvas.")
    parser.add_argument("--dist-dir", type=Path, default=DEFAULT_DIST_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--app-bundle", type=Path, default=None)
    args = parser.parse_args()

    print(build_portable(args.dist_dir, args.output, args.app_bundle))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
