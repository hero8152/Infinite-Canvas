from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass
from pathlib import Path


MODE_IN_PLACE = "in_place"
MODE_RUNTIME = "runtime"


@dataclass(frozen=True)
class LaunchLayout:
    install_dir: Path
    storage_root: Path
    data_root: Path
    logs_root: Path
    backups_root: Path
    runtime_root: Path
    mode: str
    work_dir: Path


def default_storage_root(local_appdata: str | None = None) -> Path:
    base = local_appdata or os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    return Path(base) / "InfiniteCanvas"


def is_directory_writable(path: Path) -> bool:
    path.mkdir(parents=True, exist_ok=True)
    try:
        with tempfile.NamedTemporaryFile(dir=path, prefix=".write-test-", suffix=".tmp", delete=True):
            return True
    except OSError:
        return False


def compute_layout(
    install_dir: str | Path,
    storage_root: str | Path | None = None,
    release_name: str = "current",
) -> LaunchLayout:
    install_path = Path(install_dir).resolve()
    storage_path = Path(storage_root).resolve() if storage_root else default_storage_root()
    data_root = storage_path / "data"
    logs_root = storage_path / "logs"
    backups_root = storage_path / "backups"
    runtime_root = storage_path / "runtime"

    if is_directory_writable(install_path):
        mode = MODE_IN_PLACE
        work_dir = install_path
    else:
        mode = MODE_RUNTIME
        work_dir = runtime_root / release_name

    return LaunchLayout(
        install_dir=install_path,
        storage_root=storage_path,
        data_root=data_root,
        logs_root=logs_root,
        backups_root=backups_root,
        runtime_root=runtime_root,
        mode=mode,
        work_dir=work_dir,
    )


def windows_data_targets(base_dir: Path) -> dict[str, Path]:
    return {
        "API": base_dir / "API",
        "assets": base_dir / "assets",
        "output": base_dir / "output",
        "data": base_dir / "data",
        "history.json": base_dir / "history.json",
        "global_config.json": base_dir / "global_config.json",
    }
