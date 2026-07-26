from __future__ import annotations

import json
import sqlite3
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterable, Iterator, Optional


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _payload(raw: Optional[str], default: Any = None) -> Any:
    if raw is None:
        return default
    try:
        return json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return default


class RevisionConflict(RuntimeError):
    def __init__(self, revision: int, value: Any):
        super().__init__("revision conflict")
        self.revision = int(revision)
        self.value = value


class ClosingSqliteConnection(sqlite3.Connection):
    """Make ``with connection`` close the file handle after commit/rollback."""

    def __exit__(self, exc_type, exc_value, traceback):
        try:
            return super().__exit__(exc_type, exc_value, traceback)
        finally:
            self.close()


class CanvasDatabase:
    SCHEMA_VERSION = 2

    def __init__(self, path: Path):
        self.path = Path(path)
        self._schema_lock = threading.Lock()

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(
            str(self.path),
            timeout=5.0,
            isolation_level=None,
            factory=ClosingSqliteConnection,
        )
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA busy_timeout=5000")
        connection.execute("PRAGMA synchronous=NORMAL")
        return connection

    @contextmanager
    def transaction(self, immediate: bool = False) -> Iterator[sqlite3.Connection]:
        connection = self.connect()
        try:
            connection.execute("BEGIN IMMEDIATE" if immediate else "BEGIN")
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def initialize(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._schema_lock, self.connect() as connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    applied_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS app_settings (
                    key TEXT PRIMARY KEY,
                    value_json TEXT NOT NULL,
                    revision INTEGER NOT NULL DEFAULT 1,
                    updated_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS providers (
                    id TEXT PRIMARY KEY,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    enabled INTEGER NOT NULL DEFAULT 1,
                    payload_json TEXT NOT NULL,
                    revision INTEGER NOT NULL DEFAULT 1,
                    updated_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    payload_json TEXT NOT NULL,
                    revision INTEGER NOT NULL DEFAULT 1,
                    updated_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS canvases (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL DEFAULT 'default',
                    kind TEXT NOT NULL DEFAULT 'classic',
                    title TEXT NOT NULL DEFAULT '',
                    updated_at INTEGER NOT NULL,
                    deleted_at INTEGER NOT NULL DEFAULT 0,
                    revision INTEGER NOT NULL DEFAULT 1,
                    payload_json TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_canvases_project ON canvases(project_id, deleted_at, updated_at DESC);
                CREATE INDEX IF NOT EXISTS idx_canvases_kind ON canvases(kind, deleted_at, updated_at DESC);
                CREATE TABLE IF NOT EXISTS conversations (
                    id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    title TEXT NOT NULL DEFAULT '',
                    updated_at INTEGER NOT NULL,
                    revision INTEGER NOT NULL DEFAULT 1,
                    payload_json TEXT NOT NULL,
                    PRIMARY KEY(user_id, id)
                );
                CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, updated_at DESC);
                CREATE TABLE IF NOT EXISTS generation_history (
                    id TEXT PRIMARY KEY,
                    kind TEXT NOT NULL DEFAULT 'zimage',
                    created_at REAL NOT NULL,
                    payload_json TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_generation_history_kind ON generation_history(kind, created_at DESC);
                CREATE TABLE IF NOT EXISTS tasks (
                    id TEXT PRIMARY KEY,
                    kind TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT '',
                    updated_at REAL NOT NULL,
                    payload_json TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_tasks_kind_status ON tasks(kind, status, updated_at DESC);
                CREATE TABLE IF NOT EXISTS library_documents (
                    kind TEXT PRIMARY KEY,
                    payload_json TEXT NOT NULL,
                    revision INTEGER NOT NULL DEFAULT 1,
                    updated_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS shared_folders (
                    id TEXT PRIMARY KEY,
                    payload_json TEXT NOT NULL,
                    updated_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS paired_devices (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    token_hash TEXT NOT NULL UNIQUE,
                    created_at INTEGER NOT NULL,
                    last_seen_at INTEGER NOT NULL,
                    revoked_at INTEGER NOT NULL DEFAULT 0,
                    payload_json TEXT NOT NULL DEFAULT '{}'
                );
                CREATE TABLE IF NOT EXISTS kv_documents (
                    namespace TEXT NOT NULL,
                    key TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    revision INTEGER NOT NULL DEFAULT 1,
                    updated_at INTEGER NOT NULL,
                    PRIMARY KEY(namespace, key)
                );
                CREATE TABLE IF NOT EXISTS secret_values (
                    key TEXT PRIMARY KEY,
                    encrypted_value BLOB NOT NULL,
                    updated_at INTEGER NOT NULL
                );
                """
            )
            connection.execute(
                "INSERT OR IGNORE INTO schema_migrations(version,name,applied_at) VALUES(?,?,?)",
                (1, "initial-desktop-schema", int(time.time() * 1000)),
            )
            connection.execute(
                "INSERT OR IGNORE INTO schema_migrations(version,name,applied_at) VALUES(?,?,?)",
                (2, "dpapi-secrets-and-device-auth", int(time.time() * 1000)),
            )

    def pragma_summary(self) -> dict[str, Any]:
        with self.connect() as connection:
            return {
                "journal_mode": connection.execute("PRAGMA journal_mode").fetchone()[0],
                "foreign_keys": connection.execute("PRAGMA foreign_keys").fetchone()[0],
                "busy_timeout": connection.execute("PRAGMA busy_timeout").fetchone()[0],
                "synchronous": connection.execute("PRAGMA synchronous").fetchone()[0],
                "schema_version": self.SCHEMA_VERSION,
            }

    def get_document(self, namespace: str, key: str, default: Any = None) -> Any:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT payload_json FROM kv_documents WHERE namespace=? AND key=?", (namespace, key)
            ).fetchone()
        return _payload(row["payload_json"], default) if row else default

    def put_document(self, namespace: str, key: str, value: Any) -> int:
        now = int(time.time() * 1000)
        with self.transaction(immediate=True) as connection:
            row = connection.execute(
                "SELECT revision FROM kv_documents WHERE namespace=? AND key=?", (namespace, key)
            ).fetchone()
            revision = int(row["revision"] if row else 0) + 1
            connection.execute(
                """INSERT INTO kv_documents(namespace,key,payload_json,revision,updated_at) VALUES(?,?,?,?,?)
                   ON CONFLICT(namespace,key) DO UPDATE SET payload_json=excluded.payload_json,
                   revision=excluded.revision,updated_at=excluded.updated_at""",
                (namespace, key, _json(value), revision, now),
            )
        return revision

    def get_setting(self, key: str, default: Any = None) -> dict[str, Any]:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT value_json,revision,updated_at FROM app_settings WHERE key=?", (key,)
            ).fetchone()
        if not row:
            return {"value": default, "revision": 0, "updated_at": 0}
        return {
            "value": _payload(row["value_json"], default),
            "revision": int(row["revision"]),
            "updated_at": int(row["updated_at"]),
        }

    def save_setting(self, key: str, value: Any, base_revision: int = 0, only_if_empty: bool = False) -> dict[str, Any]:
        now = int(time.time() * 1000)
        with self.transaction(immediate=True) as connection:
            row = connection.execute(
                "SELECT value_json,revision,updated_at FROM app_settings WHERE key=?", (key,)
            ).fetchone()
            current_revision = int(row["revision"] if row else 0)
            current_value = _payload(row["value_json"], None) if row else None
            if only_if_empty and row and current_value not in (None, {}, [], ""):
                return {"value": current_value, "revision": current_revision, "updated_at": int(row["updated_at"])}
            if base_revision and base_revision != current_revision:
                raise RevisionConflict(current_revision, current_value)
            revision = current_revision + 1
            connection.execute(
                """INSERT INTO app_settings(key,value_json,revision,updated_at) VALUES(?,?,?,?)
                   ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,
                   revision=excluded.revision,updated_at=excluded.updated_at""",
                (key, _json(value), revision, now),
            )
        return {"value": value, "revision": revision, "updated_at": now}

    def next_revision(self, topic: str, entity_id: str = "global") -> int:
        key = f"_revision:{topic}:{entity_id}"
        with self.transaction(immediate=True) as connection:
            row = connection.execute("SELECT revision FROM app_settings WHERE key=?", (key,)).fetchone()
            revision = int(row["revision"] if row else 0) + 1
            connection.execute(
                """INSERT INTO app_settings(key,value_json,revision,updated_at) VALUES(?,?,?,?)
                   ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,
                   revision=excluded.revision,updated_at=excluded.updated_at""",
                (key, _json({"topic": topic, "entity_id": entity_id}), revision, int(time.time() * 1000)),
            )
        return revision

    def save_secret_blob(self, key: str, encrypted_value: bytes) -> None:
        with self.transaction(immediate=True) as connection:
            connection.execute(
                """INSERT INTO secret_values(key,encrypted_value,updated_at) VALUES(?,?,?)
                   ON CONFLICT(key) DO UPDATE SET encrypted_value=excluded.encrypted_value,
                   updated_at=excluded.updated_at""",
                (key, sqlite3.Binary(encrypted_value), int(time.time() * 1000)),
            )

    def load_secret_blob(self, key: str) -> Optional[bytes]:
        with self.connect() as connection:
            row = connection.execute("SELECT encrypted_value FROM secret_values WHERE key=?", (key,)).fetchone()
        return bytes(row["encrypted_value"]) if row else None

    def list_secret_blobs(self) -> dict[str, bytes]:
        with self.connect() as connection:
            rows = connection.execute("SELECT key,encrypted_value FROM secret_values ORDER BY key").fetchall()
        return {str(row["key"]): bytes(row["encrypted_value"]) for row in rows}

    def delete_secret(self, key: str) -> None:
        with self.transaction(immediate=True) as connection:
            connection.execute("DELETE FROM secret_values WHERE key=?", (key,))

    def create_paired_device(self, device_id: str, name: str, token_hash: str, payload: dict[str, Any]) -> None:
        now = int(time.time() * 1000)
        with self.transaction(immediate=True) as connection:
            connection.execute(
                """INSERT INTO paired_devices(id,name,token_hash,created_at,last_seen_at,revoked_at,payload_json)
                   VALUES(?,?,?,?,?,0,?)""",
                (device_id, name, token_hash, now, now, _json(payload or {})),
            )

    def paired_device_by_hash(self, token_hash: str) -> Optional[dict[str, Any]]:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM paired_devices WHERE token_hash=? AND revoked_at=0", (token_hash,)
            ).fetchone()
        return self._paired_device_record(row) if row else None

    def paired_device(self, device_id: str) -> Optional[dict[str, Any]]:
        with self.connect() as connection:
            row = connection.execute("SELECT * FROM paired_devices WHERE id=?", (device_id,)).fetchone()
        return self._paired_device_record(row) if row else None

    def list_paired_devices(self, include_revoked: bool = False) -> list[dict[str, Any]]:
        query = "SELECT * FROM paired_devices" if include_revoked else "SELECT * FROM paired_devices WHERE revoked_at=0"
        with self.connect() as connection:
            rows = connection.execute(query + " ORDER BY created_at DESC").fetchall()
        return [self._paired_device_record(row) for row in rows]

    def touch_paired_device(self, device_id: str, timestamp: Optional[int] = None) -> None:
        with self.transaction(immediate=True) as connection:
            connection.execute(
                "UPDATE paired_devices SET last_seen_at=? WHERE id=? AND revoked_at=0",
                (int(timestamp or time.time() * 1000), device_id),
            )

    def revoke_paired_device(self, device_id: str) -> bool:
        with self.transaction(immediate=True) as connection:
            cursor = connection.execute(
                "UPDATE paired_devices SET revoked_at=? WHERE id=? AND revoked_at=0",
                (int(time.time() * 1000), device_id),
            )
        return cursor.rowcount > 0

    @staticmethod
    def _paired_device_record(row: sqlite3.Row) -> dict[str, Any]:
        payload = _payload(row["payload_json"], {})
        return {
            "id": str(row["id"]),
            "name": str(row["name"]),
            "created_at": int(row["created_at"]),
            "last_seen_at": int(row["last_seen_at"]),
            "revoked_at": int(row["revoked_at"]),
            "client_type": str((payload or {}).get("client_type") or "browser"),
        }

    def load_providers(self) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute("SELECT payload_json FROM providers ORDER BY sort_order,id").fetchall()
        return [_payload(row["payload_json"], {}) for row in rows]

    def save_providers(self, providers: Iterable[dict[str, Any]]) -> None:
        now = int(time.time() * 1000)
        values = list(providers)
        with self.transaction(immediate=True) as connection:
            connection.execute("DELETE FROM providers")
            for index, provider in enumerate(values):
                connection.execute(
                    "INSERT INTO providers(id,sort_order,enabled,payload_json,updated_at) VALUES(?,?,?,?,?)",
                    (str(provider.get("id") or f"provider-{index}"), index, int(provider.get("enabled", True)), _json(provider), now),
                )

    def load_projects(self) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute("SELECT payload_json FROM projects ORDER BY sort_order,updated_at").fetchall()
        return [_payload(row["payload_json"], {}) for row in rows]

    def save_projects(self, projects: Iterable[dict[str, Any]]) -> None:
        now = int(time.time() * 1000)
        values = list(projects)
        with self.transaction(immediate=True) as connection:
            connection.execute("DELETE FROM projects")
            for index, project in enumerate(values):
                connection.execute(
                    "INSERT INTO projects(id,sort_order,payload_json,updated_at) VALUES(?,?,?,?)",
                    (str(project.get("id") or f"project-{index}"), int(project.get("order") or index), _json(project), now),
                )

    def save_canvas(self, canvas: dict[str, Any], touch: bool = True) -> dict[str, Any]:
        value = dict(canvas)
        now = int(time.time() * 1000)
        if touch:
            value["updated_at"] = now
        else:
            value["updated_at"] = int(value.get("updated_at") or now)
        with self.transaction(immediate=True) as connection:
            row = connection.execute("SELECT revision FROM canvases WHERE id=?", (value["id"],)).fetchone()
            revision = int(row["revision"] if row else 0) + 1
            value["revision"] = revision
            connection.execute(
                """INSERT INTO canvases(id,project_id,kind,title,updated_at,deleted_at,revision,payload_json)
                   VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
                   project_id=excluded.project_id,kind=excluded.kind,title=excluded.title,
                   updated_at=excluded.updated_at,deleted_at=excluded.deleted_at,
                   revision=excluded.revision,payload_json=excluded.payload_json""",
                (
                    value["id"], str(value.get("project") or "default"), str(value.get("kind") or "classic"),
                    str(value.get("title") or ""), int(value["updated_at"]), int(value.get("deleted_at") or 0),
                    revision, _json(value),
                ),
            )
        canvas.clear()
        canvas.update(value)
        return canvas

    def get_canvas(self, canvas_id: str) -> Optional[dict[str, Any]]:
        with self.connect() as connection:
            row = connection.execute("SELECT payload_json FROM canvases WHERE id=?", (canvas_id,)).fetchone()
        return _payload(row["payload_json"], None) if row else None

    def list_canvases(self, include_deleted: Optional[bool] = None) -> list[dict[str, Any]]:
        query = "SELECT payload_json FROM canvases"
        params: tuple[Any, ...] = ()
        if include_deleted is True:
            query += " WHERE deleted_at>0"
        elif include_deleted is False:
            query += " WHERE deleted_at=0"
        query += " ORDER BY updated_at DESC"
        with self.connect() as connection:
            rows = connection.execute(query, params).fetchall()
        return [_payload(row["payload_json"], {}) for row in rows]

    def purge_canvas(self, canvas_id: str) -> None:
        with self.transaction(immediate=True) as connection:
            connection.execute("DELETE FROM canvases WHERE id=?", (canvas_id,))

    def reassign_project(self, project_id: str, target_project_id: str) -> int:
        moved = 0
        for canvas in self.list_canvases(include_deleted=None):
            if str(canvas.get("project") or "") == project_id:
                canvas["project"] = target_project_id
                self.save_canvas(canvas, touch=False)
                moved += 1
        return moved

    def save_conversation(self, user_id: str, conversation: dict[str, Any]) -> None:
        now = int(conversation.get("updated_at") or time.time() * 1000)
        with self.transaction(immediate=True) as connection:
            row = connection.execute(
                "SELECT revision FROM conversations WHERE user_id=? AND id=?", (user_id, conversation["id"])
            ).fetchone()
            revision = int(row["revision"] if row else 0) + 1
            connection.execute(
                """INSERT INTO conversations(id,user_id,title,updated_at,revision,payload_json) VALUES(?,?,?,?,?,?)
                   ON CONFLICT(user_id,id) DO UPDATE SET title=excluded.title,updated_at=excluded.updated_at,
                   revision=excluded.revision,payload_json=excluded.payload_json""",
                (conversation["id"], user_id, str(conversation.get("title") or ""), now, revision, _json(conversation)),
            )

    def get_conversation(self, user_id: str, conversation_id: str) -> Optional[dict[str, Any]]:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT payload_json FROM conversations WHERE user_id=? AND id=?", (user_id, conversation_id)
            ).fetchone()
        return _payload(row["payload_json"], None) if row else None

    def list_conversations(self, user_id: str) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT payload_json FROM conversations WHERE user_id=? ORDER BY updated_at DESC", (user_id,)
            ).fetchall()
        return [_payload(row["payload_json"], {}) for row in rows]

    def delete_conversation(self, user_id: str, conversation_id: str) -> None:
        with self.transaction(immediate=True) as connection:
            connection.execute("DELETE FROM conversations WHERE user_id=? AND id=?", (user_id, conversation_id))

    def prepend_history(self, record: dict[str, Any], limit: int = 5000) -> None:
        timestamp = float(record.get("timestamp") or time.time())
        record["timestamp"] = timestamp
        history_id = str(record.get("id") or f"{timestamp:.6f}-{abs(hash(_json(record))) & 0xFFFFFFFF:08x}")
        with self.transaction(immediate=True) as connection:
            connection.execute(
                "INSERT OR REPLACE INTO generation_history(id,kind,created_at,payload_json) VALUES(?,?,?,?)",
                (history_id, str(record.get("type") or "zimage"), timestamp, _json(record)),
            )
            connection.execute(
                "DELETE FROM generation_history WHERE id IN (SELECT id FROM generation_history ORDER BY created_at DESC LIMIT -1 OFFSET ?)",
                (limit,),
            )

    def list_history(self, kind: str = "") -> list[dict[str, Any]]:
        query = "SELECT id,payload_json FROM generation_history"
        params: tuple[Any, ...] = ()
        if kind:
            query += " WHERE kind=?"
            params = (kind,)
        query += " ORDER BY created_at DESC"
        with self.connect() as connection:
            rows = connection.execute(query, params).fetchall()
        records = []
        for row in rows:
            payload = _payload(row["payload_json"], {})
            if not isinstance(payload, dict):
                payload = {}
            payload.setdefault("_history_id", str(row["id"]))
            records.append(payload)
        return records

    def delete_history_timestamp(self, timestamp: float) -> Optional[dict[str, Any]]:
        with self.transaction(immediate=True) as connection:
            row = connection.execute(
                "SELECT id,payload_json FROM generation_history WHERE ABS(created_at-?)<0.001 ORDER BY created_at DESC LIMIT 1",
                (float(timestamp),),
            ).fetchone()
            if row:
                item = _payload(row["payload_json"], {})
                connection.execute("DELETE FROM generation_history WHERE id=?", (row["id"],))
                return item
        return None

    def get_library(self, kind: str, default: Any = None) -> Any:
        with self.connect() as connection:
            row = connection.execute("SELECT payload_json FROM library_documents WHERE kind=?", (kind,)).fetchone()
        return _payload(row["payload_json"], default) if row else default

    def save_library(self, kind: str, value: Any) -> int:
        now = int(time.time() * 1000)
        with self.transaction(immediate=True) as connection:
            row = connection.execute("SELECT revision FROM library_documents WHERE kind=?", (kind,)).fetchone()
            revision = int(row["revision"] if row else 0) + 1
            connection.execute(
                """INSERT INTO library_documents(kind,payload_json,revision,updated_at) VALUES(?,?,?,?)
                   ON CONFLICT(kind) DO UPDATE SET payload_json=excluded.payload_json,
                   revision=excluded.revision,updated_at=excluded.updated_at""",
                (kind, _json(value), revision, now),
            )
        return revision

    def save_tasks(self, kind: str, tasks: Iterable[dict[str, Any]]) -> None:
        values = list(tasks)
        with self.transaction(immediate=True) as connection:
            connection.execute("DELETE FROM tasks WHERE kind=?", (kind,))
            for task in values:
                task_id = str(task.get("id") or task.get("task_id") or "")
                if not task_id:
                    continue
                connection.execute(
                    "INSERT INTO tasks(id,kind,status,updated_at,payload_json) VALUES(?,?,?,?,?)",
                    (task_id, kind, str(task.get("status") or ""), float(task.get("updated_at") or time.time()), _json(task)),
                )

    def upsert_task(self, kind: str, task: dict[str, Any]) -> None:
        task_id = str(task.get("id") or task.get("task_id") or "")
        if not task_id:
            return
        updated_at = task.get("updated_at")
        if updated_at is None:
            updated_at = time.time()
        with self.transaction(immediate=True) as connection:
            connection.execute(
                """INSERT INTO tasks(id,kind,status,updated_at,payload_json) VALUES(?,?,?,?,?)
                   ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,status=excluded.status,
                   updated_at=excluded.updated_at,payload_json=excluded.payload_json""",
                (task_id, kind, str(task.get("status") or ""), float(updated_at), _json(task)),
            )

    def prune_tasks(self, kind: str, keep: int = 5000) -> int:
        safe_keep = max(1, int(keep or 1))
        with self.transaction(immediate=True) as connection:
            before = int(connection.execute("SELECT COUNT(*) FROM tasks WHERE kind=?", (kind,)).fetchone()[0])
            connection.execute(
                """DELETE FROM tasks WHERE kind=? AND id NOT IN (
                       SELECT id FROM tasks WHERE kind=? ORDER BY updated_at DESC LIMIT ?
                   )""",
                (kind, kind, safe_keep),
            )
        return max(0, before - safe_keep)

    def load_tasks(self, kind: str) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute("SELECT payload_json FROM tasks WHERE kind=? ORDER BY updated_at DESC", (kind,)).fetchall()
        return [_payload(row["payload_json"], {}) for row in rows]

    def counts(self) -> dict[str, int]:
        tables = ("providers", "projects", "canvases", "conversations", "generation_history", "tasks", "library_documents")
        with self.connect() as connection:
            return {table: int(connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]) for table in tables}

    def import_legacy(self, snapshot: dict[str, Any]) -> None:
        with self.transaction(immediate=True) as connection:
            now = int(time.time() * 1000)
            if not connection.execute("SELECT 1 FROM providers LIMIT 1").fetchone():
                for index, provider in enumerate(snapshot.get("providers") or []):
                    if isinstance(provider, dict) and provider.get("id"):
                        connection.execute(
                            "INSERT OR IGNORE INTO providers(id,sort_order,enabled,payload_json,updated_at) VALUES(?,?,?,?,?)",
                            (provider["id"], index, int(provider.get("enabled", True)), _json(provider), now),
                        )
            if not connection.execute("SELECT 1 FROM projects LIMIT 1").fetchone():
                for index, project in enumerate(snapshot.get("projects") or []):
                    if isinstance(project, dict) and project.get("id"):
                        connection.execute(
                            "INSERT OR IGNORE INTO projects(id,sort_order,payload_json,updated_at) VALUES(?,?,?,?)",
                            (project["id"], int(project.get("order") or index), _json(project), now),
                        )
            if not connection.execute("SELECT 1 FROM canvases LIMIT 1").fetchone():
                for canvas in snapshot.get("canvases") or []:
                    if not isinstance(canvas, dict) or not canvas.get("id"):
                        continue
                    canvas.setdefault("revision", 1)
                    connection.execute(
                        "INSERT OR IGNORE INTO canvases(id,project_id,kind,title,updated_at,deleted_at,revision,payload_json) VALUES(?,?,?,?,?,?,?,?)",
                        (canvas["id"], str(canvas.get("project") or "default"), str(canvas.get("kind") or "classic"),
                         str(canvas.get("title") or ""), int(canvas.get("updated_at") or now), int(canvas.get("deleted_at") or 0),
                         int(canvas.get("revision") or 1), _json(canvas)),
                    )
            if not connection.execute("SELECT 1 FROM conversations LIMIT 1").fetchone():
                for user_id, conversation in snapshot.get("conversations") or []:
                    if isinstance(conversation, dict) and conversation.get("id"):
                        connection.execute(
                            "INSERT OR IGNORE INTO conversations(id,user_id,title,updated_at,payload_json) VALUES(?,?,?,?,?)",
                            (conversation["id"], user_id, str(conversation.get("title") or ""), int(conversation.get("updated_at") or now), _json(conversation)),
                        )
            if not connection.execute("SELECT 1 FROM generation_history LIMIT 1").fetchone():
                for index, record in enumerate(snapshot.get("history") or []):
                    if not isinstance(record, dict):
                        continue
                    created = float(record.get("timestamp") or (time.time() - index / 1000))
                    history_id = f"legacy-{index}-{created:.6f}"
                    connection.execute(
                        "INSERT OR IGNORE INTO generation_history(id,kind,created_at,payload_json) VALUES(?,?,?,?)",
                        (history_id, str(record.get("type") or "zimage"), created, _json(record)),
                    )
            libraries = snapshot.get("libraries") or {}
            for kind, value in libraries.items():
                if value is not None:
                    connection.execute(
                        "INSERT OR IGNORE INTO library_documents(kind,payload_json,updated_at) VALUES(?,?,?)",
                        (kind, _json(value), now),
                    )
            if not connection.execute("SELECT 1 FROM tasks LIMIT 1").fetchone():
                for task in snapshot.get("online_image_tasks") or []:
                    if not isinstance(task, dict):
                        continue
                    task_id = str(task.get("id") or task.get("task_id") or "")
                    if task_id:
                        connection.execute(
                            "INSERT OR IGNORE INTO tasks(id,kind,status,updated_at,payload_json) VALUES(?,?,?,?,?)",
                            (task_id, "online_image", str(task.get("status") or ""), float(task.get("updated_at") or time.time()), _json(task)),
                        )
