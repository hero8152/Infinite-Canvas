from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from packaging.windows.payload.build_payload import DEFAULT_MANIFEST, build_payload


DEFAULT_RELEASE_DIR = ROOT / "dist" / "windows-release"
VERSION_ASSET = "windows-VERSION"
MANIFEST_ASSET = "windows-manifest.json"
PAYLOAD_ASSET = "windows-app-base.zip"


def read_version() -> str:
    lines = (ROOT / "VERSION").read_text(encoding="utf-8").strip().splitlines()
    version = lines[0].strip() if lines else ""
    if not version:
        raise ValueError("VERSION 文件为空。")
    return version


def join_endpoint(base_url: str, endpoint: str) -> str:
    return base_url.rstrip("/") + "/" + endpoint.lstrip("/")


def publish_release(output_dir: Path, update_base_url: str = "") -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    version = read_version()

    payload_path = output_dir / PAYLOAD_ASSET
    written = build_payload(payload_path)

    manifest = json.loads(DEFAULT_MANIFEST.read_text(encoding="utf-8"))
    manifest["payload_entries"] = written
    if update_base_url:
        manifest["update_base_url"] = update_base_url.rstrip("/")

    manifest_path = output_dir / MANIFEST_ASSET
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    version_path = output_dir / VERSION_ASSET
    version_path.write_text(version + "\n", encoding="utf-8")

    versioned_dir = output_dir / version
    versioned_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(payload_path, versioned_dir / PAYLOAD_ASSET)
    shutil.copy2(manifest_path, versioned_dir / MANIFEST_ASSET)
    shutil.copy2(version_path, versioned_dir / VERSION_ASSET)

    version_manifest = dict(manifest)
    if update_base_url:
        version_manifest["update_base_url"] = join_endpoint(update_base_url, version)
    (versioned_dir / MANIFEST_ASSET).write_text(
        json.dumps(version_manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return {
        "version": version,
        "release_dir": str(output_dir),
        "payload": str(payload_path),
        "manifest": str(manifest_path),
        "version_dir": str(versioned_dir),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build static release directory for Windows launcher updates.")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_RELEASE_DIR)
    parser.add_argument("--update-base-url", default="")
    args = parser.parse_args()

    result = publish_release(args.output_dir, update_base_url=str(args.update_base_url or "").strip())
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
