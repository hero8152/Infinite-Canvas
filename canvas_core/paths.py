from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Optional


def _resolved(value: str | os.PathLike[str]) -> Path:
    return Path(value).expanduser().resolve()


@dataclass(frozen=True)
class AppPaths:
    """Resolved read-only application roots and the single writable data root."""

    portable_root: Path
    app_root: Path
    data_root: Path
    web_root: Path
    builtin_workflow_root: Path

    @classmethod
    def discover(
        cls,
        environ: Optional[Mapping[str, str]] = None,
        module_file: Optional[str | os.PathLike[str]] = None,
        executable: Optional[str | os.PathLike[str]] = None,
        frozen: Optional[bool] = None,
    ) -> "AppPaths":
        env = os.environ if environ is None else environ
        module_path = _resolved(module_file or __file__)
        source_root = module_path.parent.parent
        is_frozen = bool(getattr(sys, "frozen", False)) if frozen is None else frozen
        executable_path = _resolved(executable or sys.executable)

        configured_app_root = str(env.get("CANVAS_APP_ROOT") or "").strip()
        if configured_app_root:
            app_root = _resolved(configured_app_root)
        elif is_frozen:
            executable_dir = executable_path.parent
            app_root = executable_dir.parent if executable_dir.name.lower() == "backend" else executable_dir
        else:
            app_root = source_root

        configured_portable_root = str(env.get("CANVAS_PORTABLE_ROOT") or "").strip()
        if configured_portable_root:
            portable_root = _resolved(configured_portable_root)
        elif app_root.name.lower() == "app":
            portable_root = app_root.parent
        else:
            portable_root = app_root

        configured_data_root = str(env.get("CANVAS_DATA_DIR") or "").strip()
        data_root = _resolved(configured_data_root) if configured_data_root else portable_root / "data"

        packaged_web_root = app_root / "web"
        web_root = packaged_web_root if packaged_web_root.is_dir() else app_root / "static"
        builtin_workflow_root = app_root / "workflows"

        return cls(
            portable_root=portable_root,
            app_root=app_root,
            data_root=data_root,
            web_root=web_root,
            builtin_workflow_root=builtin_workflow_root,
        )

    @property
    def version_file(self) -> Path:
        portable_version = self.portable_root / "VERSION"
        return portable_version if portable_version.is_file() else self.app_root / "VERSION"

    def public_summary(self) -> dict[str, str]:
        return {
            "portable_root": str(self.portable_root),
            "app_root": str(self.app_root),
            "data_root": str(self.data_root),
            "web_root": str(self.web_root),
            "workflow_root": str(self.builtin_workflow_root),
        }


APP_PATHS = AppPaths.discover()

