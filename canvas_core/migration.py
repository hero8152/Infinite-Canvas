from __future__ import annotations

import hashlib
import json
import os
import shutil
import time
from pathlib import Path
from typing import Any, Iterable

from .data_layout import DataLayout, atomic_write_json
from .database import CanvasDatabase
from .paths import AppPaths


def _read_json(path: Path, default: Any) -> Any:
    if not path.is_file():
        return default
    try:
        with path.open("r", encoding="utf-8-sig") as handle:
            return json.load(handle)
    except (OSError, json.JSONDecodeError):
        return default


def _file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


class LegacyMigrator:
    VERSION = 1

    def __init__(self, paths: AppPaths, layout: DataLayout, database: CanvasDatabase):
        self.paths = paths
        self.layout = layout
        self.database = database
        self.manifest: dict[str, Any] = {}

    def run(self) -> dict[str, Any]:
        self.layout.ensure()
        existing = self.layout.manifest_payload()
        migration = existing.get("migration") if isinstance(existing.get("migration"), dict) else {}
        if int(existing.get("schema_version") or 0) >= self.VERSION and migration.get("status") == "complete":
            return migration
        if migration.get("status") == "running":
            self._rollback(migration.get("moves") or [])

        stamp = time.strftime("%Y%m%d-%H%M%S")
        backup_dir = self.layout.backups / f"migration-v{self.VERSION}-{stamp}"
        backup_dir.mkdir(parents=True, exist_ok=False)
        self.manifest = {
            "schema_version": 0,
            "migration": {
                "version": self.VERSION,
                "status": "running",
                "started_at": int(time.time() * 1000),
                "backup_dir": str(backup_dir),
                "moves": [],
            },
        }
        self._save_manifest()

        try:
            snapshot, structured_sources = self._snapshot_legacy()
            self.database.import_legacy(snapshot)
            self._migrate_media()
            self._migrate_custom_workflows()
            self._migrate_secret_env(backup_dir)
            self._archive_structured(structured_sources, backup_dir)
            self._migrate_logs()
            counts = self.database.counts()
            self.manifest["schema_version"] = self.VERSION
            self.manifest["migration"].update(
                {
                    "status": "complete",
                    "completed_at": int(time.time() * 1000),
                    "database_counts": counts,
                    "media_files": self._count_files(self.layout.media),
                }
            )
            self._save_manifest()
            atomic_write_json(backup_dir / "migration-report.json", self.manifest["migration"])
            return self.manifest["migration"]
        except Exception as exc:
            self.manifest["migration"]["status"] = "failed"
            self.manifest["migration"]["error"] = str(exc)
            self._save_manifest()
            self._rollback(self.manifest["migration"].get("moves") or [])
            raise

    def _save_manifest(self) -> None:
        atomic_write_json(self.layout.manifest, self.manifest)

    def _record_move(self, source: Path, destination: Path) -> None:
        operation = {"source": str(source), "destination": str(destination)}
        self.manifest["migration"].setdefault("moves", []).append(operation)
        self._save_manifest()

    def _move_file(self, source: Path, destination: Path) -> Path:
        if not source.is_file():
            return destination
        destination.parent.mkdir(parents=True, exist_ok=True)
        selected = destination
        if selected.exists():
            if selected.is_file() and source.stat().st_size == selected.stat().st_size and _file_hash(source) == _file_hash(selected):
                selected = destination.with_name(f"{destination.stem}.legacy-duplicate{destination.suffix}")
            else:
                counter = 1
                while selected.exists():
                    selected = destination.with_name(f"{destination.stem}.legacy-{counter}{destination.suffix}")
                    counter += 1
        os.replace(source, selected)
        self._record_move(source, selected)
        return selected

    def _snapshot_legacy(self) -> tuple[dict[str, Any], list[Path]]:
        root = self.paths.portable_root
        data = self.layout.root
        structured: list[Path] = []

        def tracked_json(path: Path, default: Any) -> Any:
            if path.is_file():
                structured.append(path)
            return _read_json(path, default)

        providers = tracked_json(data / "api_providers.json", [])
        projects_raw = tracked_json(data / "projects.json", {})
        projects = projects_raw.get("projects") if isinstance(projects_raw, dict) else projects_raw
        history = tracked_json(root / "history.json", [])
        if not history:
            history = tracked_json(data / "history.json", [])

        canvases = []
        canvas_dir = data / "canvases"
        if canvas_dir.is_dir():
            for path in sorted(canvas_dir.glob("*.json")):
                value = _read_json(path, None)
                if isinstance(value, dict):
                    canvases.append(value)
                structured.append(path)

        conversations: list[tuple[str, dict[str, Any]]] = []
        conversation_dir = data / "conversations"
        if conversation_dir.is_dir():
            for path in sorted(conversation_dir.glob("*/*.json")):
                value = _read_json(path, None)
                if isinstance(value, dict):
                    conversations.append((path.parent.name, value))
                structured.append(path)

        tasks_raw = tracked_json(data / "online_image_tasks.json", {})
        tasks = tasks_raw.get("tasks") if isinstance(tasks_raw, dict) else tasks_raw
        libraries = {
            "asset_library": tracked_json(data / "asset_library.json", None),
            "prompt_libraries": tracked_json(data / "prompt_libraries.json", None),
            "shared_folders": tracked_json(data / "shared_folders.json", None),
            "runninghub_workflows": tracked_json(data / "runninghub_workflows.json", None),
            "legacy_global_config": tracked_json(root / "global_config.json", None),
        }
        return (
            {
                "providers": providers if isinstance(providers, list) else [],
                "projects": projects if isinstance(projects, list) else [],
                "canvases": canvases,
                "conversations": conversations,
                "history": history if isinstance(history, list) else [],
                "online_image_tasks": tasks if isinstance(tasks, list) else [],
                "libraries": libraries,
            },
            list(dict.fromkeys(structured)),
        )

    def _migrate_tree(self, source_root: Path, destination_root: Path) -> None:
        if not source_root.is_dir() or source_root.resolve() == destination_root.resolve():
            return
        for source in sorted(source_root.rglob("*")):
            if source.is_file():
                self._move_file(source, destination_root / source.relative_to(source_root))

    def _migrate_media(self) -> None:
        root = self.paths.portable_root
        legacy_assets = root / "assets"
        self._migrate_tree(legacy_assets / "input", self.layout.media_input)
        self._migrate_tree(legacy_assets / "output", self.layout.media_generated)
        self._migrate_tree(legacy_assets / "library", self.layout.media_library)
        self._migrate_tree(legacy_assets / "uploads", self.layout.media_uploads)
        self._migrate_tree(root / "output", self.layout.exports)

    def _migrate_custom_workflows(self) -> None:
        workflow_root = self.paths.app_root / "workflows"
        self._migrate_tree(workflow_root / "custom", self.layout.workflow_custom)
        self._migrate_tree(workflow_root / "自定义", self.layout.workflow_custom)

    def _migrate_secret_env(self, backup_dir: Path) -> None:
        legacy_env = self.paths.portable_root / "API" / ".env"
        if not legacy_env.is_file():
            return
        backup_env = backup_dir / "legacy-root" / "API" / ".env"
        backup_env.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(legacy_env, backup_env)
        self._move_file(legacy_env, self.layout.secret_env)

    def _archive_structured(self, paths: Iterable[Path], backup_dir: Path) -> None:
        root = self.paths.portable_root.resolve()
        data_root = self.layout.root.resolve()
        for source in paths:
            if not source.is_file():
                continue
            resolved = source.resolve()
            try:
                relative = resolved.relative_to(data_root)
                destination = backup_dir / "legacy-data" / relative
            except ValueError:
                try:
                    relative = resolved.relative_to(root)
                except ValueError:
                    relative = Path(source.name)
                destination = backup_dir / "legacy-root" / relative
            self._move_file(source, destination)

    def _migrate_logs(self) -> None:
        for source in sorted(self.layout.root.glob("*.log")):
            self._move_file(source, self.layout.logs / source.name)
        for source in sorted(self.layout.root.glob("*.pid")):
            self._move_file(source, self.layout.run / source.name)

    def _rollback(self, moves: Iterable[dict[str, str]]) -> None:
        for operation in reversed(list(moves)):
            source = Path(str(operation.get("source") or ""))
            destination = Path(str(operation.get("destination") or ""))
            if not destination.is_file() or source.exists():
                continue
            source.parent.mkdir(parents=True, exist_ok=True)
            try:
                os.replace(destination, source)
            except OSError:
                pass

    @staticmethod
    def _count_files(root: Path) -> int:
        return sum(1 for path in root.rglob("*") if path.is_file()) if root.is_dir() else 0

