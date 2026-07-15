from __future__ import annotations

import argparse
import shutil
import zipfile
from pathlib import Path

from packaging.macos.launcher.runtime_manager import CURRENT_RELEASE_FILE, PAYLOAD_FINGERPRINT_FILE, payload_fingerprint
from packaging.macos.launcher.layout import compute_layout


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Infinite Canvas macOS updater")
    parser.add_argument("--app-bundle", type=Path, required=True)
    parser.add_argument("--storage-root", type=Path, required=True)
    parser.add_argument("--payload", type=Path, required=True)
    parser.add_argument("--release-name", required=True)
    return parser.parse_args()


def extract_payload(target_dir: Path, payload_zip: Path) -> None:
    if target_dir.exists():
        shutil.rmtree(target_dir)
    target_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(payload_zip) as archive:
        archive.extractall(target_dir)


def main() -> int:
    args = parse_args()
    layout = compute_layout(args.app_bundle.resolve(), storage_root=args.storage_root.resolve(), release_name=args.release_name)
    target_dir = layout.runtime_root / args.release_name
    extract_payload(target_dir, args.payload.resolve())
    (target_dir / PAYLOAD_FINGERPRINT_FILE).write_text(
        f"{payload_fingerprint(args.payload.resolve())}\n",
        encoding="utf-8",
    )
    (layout.storage_root / CURRENT_RELEASE_FILE).write_text(f"{args.release_name}\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
