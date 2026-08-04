from __future__ import annotations

import sysconfig
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path


def _append_external_packaging_paths() -> None:
    local_package_dir = Path(__file__).resolve().parent
    for key in ("purelib", "platlib"):
        site_packages = sysconfig.get_path(key)
        if not site_packages:
            continue
        candidate = Path(site_packages) / __name__
        if not candidate.is_dir() or candidate == local_package_dir:
            continue
        candidate_path = str(candidate)
        if candidate_path not in __path__:
            __path__.append(candidate_path)


_append_external_packaging_paths()

try:
    __version__ = version("packaging")
except PackageNotFoundError:
    __version__ = "0"
