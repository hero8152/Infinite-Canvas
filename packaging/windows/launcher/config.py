from __future__ import annotations

import configparser
from dataclasses import dataclass
from pathlib import Path


INSTALL_META_NAME = "install-meta.ini"


@dataclass(frozen=True)
class InstallConfig:
    install_dir: Path
    storage_root: Path


def load_install_config(install_dir: Path) -> InstallConfig:
    parser = configparser.ConfigParser()
    parser.read(install_dir / INSTALL_META_NAME, encoding="utf-8")
    storage_root = parser.get("paths", "storage_root", fallback="").strip()
    if not storage_root:
        storage_root = str(install_dir)
    return InstallConfig(install_dir=install_dir.resolve(), storage_root=Path(storage_root).resolve())
