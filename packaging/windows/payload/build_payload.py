from __future__ import annotations

import argparse
import json
import sys
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from packaging.payload_filters import should_include_payload_file

PAYLOAD_DIR = Path(__file__).resolve().parent
DEFAULT_OUTPUT = PAYLOAD_DIR / "app-base.zip"
DEFAULT_MANIFEST = PAYLOAD_DIR / "manifest.json"

INCLUDE_PATHS = [
    "app_runtime.py",
    "main.py",
    "VERSION",
    "requirements.txt",
    "static",
    "workflows",
]


def build_payload(output_path: Path) -> list[str]:
    written: list[str] = []
    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for relative in INCLUDE_PATHS:
            source = ROOT / relative
            if not source.exists():
                raise FileNotFoundError(f"Missing payload entry: {source}")
            if source.is_dir():
                for child in sorted(source.rglob("*")):
                    if child.is_dir() or not should_include_payload_file(child, ROOT):
                        continue
                    arcname = child.relative_to(ROOT).as_posix()
                    archive.write(child, arcname)
                    written.append(arcname)
            else:
                arcname = source.relative_to(ROOT).as_posix()
                archive.write(source, arcname)
                written.append(arcname)
    return written


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Windows payload zip for Infinite Canvas.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    args = parser.parse_args()

    written = build_payload(args.output)
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    manifest["payload_entries"] = written
    args.manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
