from __future__ import annotations

import json
import os
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .paths import AppPaths


def atomic_write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_name, path)
    except Exception:
        try:
            os.remove(temp_name)
        except OSError:
            pass
        raise


@dataclass(frozen=True)
class DataLayout:
    root: Path
    manifest: Path
    config: Path
    app_config: Path
    secret_env: Path
    database: Path
    database_file: Path
    media: Path
    media_input: Path
    media_generated: Path
    media_library: Path
    media_uploads: Path
    exports: Path
    workflows: Path
    workflow_custom: Path
    workflow_overrides: Path
    cache: Path
    cache_previews: Path
    cache_downloads: Path
    logs: Path
    run: Path
    backups: Path
    temp: Path

    @classmethod
    def from_app_paths(cls, paths: AppPaths) -> "DataLayout":
        root = paths.data_root
        config = root / "config"
        database = root / "database"
        media = root / "media"
        workflows = root / "workflows"
        cache = root / "cache"
        return cls(
            root=root,
            manifest=root / "manifest.json",
            config=config,
            app_config=config / "app.json",
            secret_env=config / "secrets.env",
            database=database,
            database_file=database / "canvas.db",
            media=media,
            media_input=media / "input",
            media_generated=media / "generated",
            media_library=media / "library",
            media_uploads=media / "uploads",
            exports=root / "exports",
            workflows=workflows,
            workflow_custom=workflows / "custom",
            workflow_overrides=workflows / "overrides",
            cache=cache,
            cache_previews=cache / "previews",
            cache_downloads=cache / "downloads",
            logs=root / "logs",
            run=root / "run",
            backups=root / "backups",
            temp=root / "temp",
        )

    def ensure(self) -> None:
        directories = (
            self.root,
            self.config,
            self.database,
            self.media_input,
            self.media_generated,
            self.media_library,
            self.media_uploads,
            self.exports,
            self.workflow_custom,
            self.workflow_overrides,
            self.cache_previews,
            self.cache_downloads,
            self.logs,
            self.run,
            self.backups,
            self.temp,
        )
        for directory in directories:
            directory.mkdir(parents=True, exist_ok=True)
        if not self.app_config.exists():
            atomic_write_json(
                self.app_config,
                {
                    "host": "0.0.0.0",
                    "port": 3000,
                    "lan_enabled": True,
                    "cache_max_bytes": 10 * 1024 * 1024 * 1024,
                    "created_at": int(time.time() * 1000),
                },
            )

    def manifest_payload(self) -> dict[str, Any]:
        if not self.manifest.exists():
            return {}
        try:
            with self.manifest.open("r", encoding="utf-8") as handle:
                payload = json.load(handle)
            return payload if isinstance(payload, dict) else {}
        except (OSError, json.JSONDecodeError):
            return {}

