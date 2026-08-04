from __future__ import annotations

import argparse
import shutil
import sys
import zipfile
from pathlib import Path

from packaging.windows.launcher.config import load_install_config
from packaging.windows.launcher.layout import MODE_RUNTIME, compute_layout
from packaging.windows.launcher.runtime_manager import (
    CURRENT_RELEASE_FILE,
    PAYLOAD_FINGERPRINT_FILE,
    payload_fingerprint,
    payload_ready_marker,
    replace_in_place_payload,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Infinite Canvas Windows updater")
    parser.add_argument("--install-dir", type=Path, required=True)
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
    config = load_install_config(args.install_dir.resolve())
    layout = compute_layout(config.install_dir, config.storage_root, release_name=args.release_name)
    if layout.mode == MODE_RUNTIME:
        target_dir = layout.runtime_root / args.release_name
        extract_payload(target_dir, args.payload.resolve())
        (target_dir / PAYLOAD_FINGERPRINT_FILE).write_text(
            f"{payload_fingerprint(args.payload.resolve())}\n",
            encoding="utf-8",
        )
        (layout.install_dir / CURRENT_RELEASE_FILE).write_text(f"{args.release_name}\n", encoding="utf-8")
    else:
        target_dir = layout.install_dir
        payload = args.payload.resolve()
        replace_in_place_payload(target_dir, payload)
        bootstrap_payload = layout.install_dir / "bootstrap" / "app-base.zip"
        try:
            bootstrap_payload.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(payload, bootstrap_payload)
        except Exception as exc:
            print(f"warning: failed to refresh bootstrap payload: {exc}", file=sys.stderr, flush=True)
        (layout.install_dir / ".payload-ready").write_text(
            f"{payload_ready_marker(layout.install_dir)}\n",
            encoding="utf-8",
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
