from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


MODE_RUNTIME = "runtime"
APP_SUPPORT_DIRNAME = "InfiniteCanvas"


@dataclass(frozen=True)
class MacLaunchLayout:
    app_bundle: Path
    contents_dir: Path
    resources_dir: Path
    bootstrap_dir: Path
    storage_root: Path
    data_root: Path
    logs_root: Path
    backups_root: Path
    runtime_root: Path
    mode: str
    work_dir: Path
    current_release_file: Path


def default_storage_root(home: str | Path | None = None) -> Path:
    base = Path(home).expanduser() if home else Path.home()
    return base / "Library" / "Application Support" / APP_SUPPORT_DIRNAME


def app_bundle_from_executable(executable: str | Path) -> Path:
    path = Path(executable)
    if path.parent.name == "MacOS" and path.parent.parent.name == "Contents":
        return path.parent.parent.parent
    return path.resolve()


def compute_layout(
    app_bundle: str | Path,
    storage_root: str | Path | None = None,
    release_name: str = "current",
) -> MacLaunchLayout:
    bundle_path = Path(app_bundle).resolve()
    contents_dir = bundle_path / "Contents"
    resources_dir = contents_dir / "Resources"
    bootstrap_dir = resources_dir / "bootstrap"
    storage_path = Path(storage_root).expanduser().resolve() if storage_root else default_storage_root()
    data_root = storage_path / "data"
    logs_root = storage_path / "logs"
    backups_root = storage_path / "backups"
    runtime_root = storage_path / "runtime"

    return MacLaunchLayout(
        app_bundle=bundle_path,
        contents_dir=contents_dir,
        resources_dir=resources_dir,
        bootstrap_dir=bootstrap_dir,
        storage_root=storage_path,
        data_root=data_root,
        logs_root=logs_root,
        backups_root=backups_root,
        runtime_root=runtime_root,
        mode=MODE_RUNTIME,
        work_dir=runtime_root / release_name,
        current_release_file=storage_path / "current.txt",
    )


def storage_root_from_env() -> str:
    return os.getenv("INFINITE_CANVAS_STORAGE_ROOT", "").strip()
