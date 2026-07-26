from __future__ import annotations

import hashlib
import hmac
import secrets
import threading
import time
import uuid
from dataclasses import dataclass
from typing import Optional

from .database import CanvasDatabase


SESSION_COOKIE = "canvas_session"


def token_hash(token: str) -> str:
    return hashlib.sha256(str(token or "").encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class AuthIdentity:
    device_id: str
    name: str
    client_type: str
    persistent: bool

    def public(self) -> dict[str, object]:
        return {
            "device_id": self.device_id,
            "name": self.name,
            "client_type": self.client_type,
            "persistent": self.persistent,
        }


class AuthManager:
    def __init__(self, database: CanvasDatabase, desktop_token: str = "", pair_ttl_seconds: int = 300) -> None:
        self.database = database
        self._desktop_token = str(desktop_token or "")
        self._pair_ttl_seconds = pair_ttl_seconds
        self._pair_code_hash = ""
        self._pair_expires_at = 0
        self._runtime_sessions: dict[str, AuthIdentity] = {}
        self._last_touches: dict[str, int] = {}
        self._lock = threading.RLock()

    @staticmethod
    def new_token() -> str:
        return secrets.token_urlsafe(32)

    def consume_desktop_token(self, supplied: str) -> tuple[str, AuthIdentity]:
        with self._lock:
            expected = self._desktop_token
            if not expected or not hmac.compare_digest(expected, str(supplied or "")):
                raise PermissionError("桌面启动令牌无效或已使用")
            self._desktop_token = ""
            token = self.new_token()
            identity = AuthIdentity("desktop-runtime", "Canvas 桌面端", "desktop", False)
            self._runtime_sessions[token_hash(token)] = identity
            return token, identity

    def create_pair_code(self) -> tuple[str, int]:
        code = f"{secrets.randbelow(1_000_000):06d}"
        expires_at = int(time.time() * 1000) + self._pair_ttl_seconds * 1000
        with self._lock:
            self._pair_code_hash = token_hash(code)
            self._pair_expires_at = expires_at
        return code, expires_at

    def pair(self, code: str, name: str, client_type: str = "browser") -> tuple[str, AuthIdentity]:
        now = int(time.time() * 1000)
        with self._lock:
            supplied_hash = token_hash(str(code or "").strip())
            valid = (
                self._pair_code_hash
                and now <= self._pair_expires_at
                and hmac.compare_digest(self._pair_code_hash, supplied_hash)
            )
            if not valid:
                raise PermissionError("配对码无效或已过期")
            self._pair_code_hash = ""
            self._pair_expires_at = 0
        safe_type = str(client_type or "browser").strip().lower()
        if safe_type not in {"browser", "chrome", "photoshop", "plugin"}:
            safe_type = "browser"
        safe_name = " ".join(str(name or "").split())[:80] or "已配对设备"
        device_id = uuid.uuid4().hex
        token = self.new_token()
        self.database.create_paired_device(device_id, safe_name, token_hash(token), {"client_type": safe_type})
        return token, AuthIdentity(device_id, safe_name, safe_type, True)

    def authenticate(self, token: str, touch: bool = True) -> Optional[AuthIdentity]:
        raw = str(token or "").strip()
        if not raw:
            return None
        digest = token_hash(raw)
        with self._lock:
            runtime = self._runtime_sessions.get(digest)
        if runtime:
            return runtime
        record = self.database.paired_device_by_hash(digest)
        if not record:
            return None
        identity = AuthIdentity(record["id"], record["name"], record["client_type"], True)
        if touch:
            self._touch(identity.device_id)
        return identity

    def _touch(self, device_id: str) -> None:
        now = int(time.time() * 1000)
        with self._lock:
            if now - self._last_touches.get(device_id, 0) < 60_000:
                return
            self._last_touches[device_id] = now
        self.database.touch_paired_device(device_id, now)

    def list_devices(self) -> list[dict[str, object]]:
        return self.database.list_paired_devices()

    def revoke(self, device_id: str) -> bool:
        return self.database.revoke_paired_device(str(device_id or ""))

    @staticmethod
    def bearer_token(authorization: str) -> str:
        scheme, _, value = str(authorization or "").partition(" ")
        return value.strip() if scheme.lower() == "bearer" else ""
