from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from packaging.macos.build_app import APP_NAME, DEFAULT_DIST_DIR, build_app, read_version


MAX_HDIUTIL_RETRIES = 3
RETRYABLE_HDIUTIL_ERRORS = ("resource busy",)


def run_hdiutil_create(staging_dir: Path, dmg_path: Path) -> None:
    command = [
        "hdiutil",
        "create",
        "-volname",
        APP_NAME,
        "-srcfolder",
        str(staging_dir),
        "-ov",
        "-format",
        "UDZO",
        str(dmg_path),
    ]
    for attempt in range(1, MAX_HDIUTIL_RETRIES + 1):
        try:
            subprocess.run(
                command,
                cwd=str(ROOT),
                check=True,
                capture_output=True,
                text=True,
            )
            return
        except subprocess.CalledProcessError as exc:
            stderr = (exc.stderr or "").lower()
            if attempt >= MAX_HDIUTIL_RETRIES or not any(marker in stderr for marker in RETRYABLE_HDIUTIL_ERRORS):
                raise
            if dmg_path.exists():
                dmg_path.unlink()
            time.sleep(2 * attempt)


def build_dmg(dist_dir: Path, app_bundle: Path | None = None) -> Path:
    app_bundle = app_bundle or build_app(dist_dir)
    if not app_bundle.is_dir():
        raise NotADirectoryError(f"DMG input is not an app bundle: {app_bundle}")
    version = read_version()
    dmg_path = dist_dir / f"{APP_NAME}-{version}.dmg"
    if dmg_path.exists():
        dmg_path.unlink()
    with tempfile.TemporaryDirectory(dir=dist_dir, prefix="dmg-root-") as staging_root:
        staging_dir = Path(staging_root)
        shutil.copytree(app_bundle, staging_dir / app_bundle.name)
        applications_link = staging_dir / "Applications"
        if not applications_link.exists():
            applications_link.symlink_to("/Applications")
        run_hdiutil_create(staging_dir, dmg_path)
    return dmg_path


def main() -> int:
    parser = argparse.ArgumentParser(description="Build macOS DMG for Infinite Canvas.")
    parser.add_argument("--dist-dir", type=Path, default=DEFAULT_DIST_DIR)
    parser.add_argument("--app-bundle", type=Path, default=None)
    args = parser.parse_args()

    dmg_path = build_dmg(args.dist_dir, args.app_bundle)
    print(dmg_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
