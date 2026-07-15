from __future__ import annotations

from pathlib import Path


EXCLUDED_FILE_NAMES = {".DS_Store", "Thumbs.db"}
EXCLUDED_DIR_NAMES = {"__pycache__"}
EXCLUDED_SUFFIXES = {".pyc", ".pyo"}
EXCLUDED_NAME_MARKERS = (".codex-",)


def should_include_payload_file(path: Path, root: Path) -> bool:
    relative_parts = path.relative_to(root).parts
    if any(part in EXCLUDED_DIR_NAMES for part in relative_parts[:-1]):
        return False
    if path.name in EXCLUDED_FILE_NAMES:
        return False
    if path.suffix in EXCLUDED_SUFFIXES:
        return False
    if any(marker in path.name for marker in EXCLUDED_NAME_MARKERS):
        return False
    return True
