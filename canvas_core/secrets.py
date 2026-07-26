from __future__ import annotations

import ctypes
import os
import re
import time
from ctypes import wintypes
from pathlib import Path
from typing import Callable, Iterable, Optional

from .database import CanvasDatabase


class SecretProtectionError(RuntimeError):
    pass


class _DataBlob(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_ubyte))]


def _blob(value: bytes) -> tuple[_DataBlob, ctypes.Array]:
    buffer = ctypes.create_string_buffer(value)
    return _DataBlob(len(value), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_ubyte))), buffer


class DpapiProtector:
    PREFIX = b"CANVAS-DPAPI-1\0"
    ENTROPY = b"Canvas Windows portable secrets v1"

    def __init__(self) -> None:
        if os.name != "nt":
            raise SecretProtectionError("Windows DPAPI 仅能在 Windows 上使用")
        self.crypt32 = ctypes.WinDLL("crypt32", use_last_error=True)
        self.kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        self.crypt32.CryptProtectData.argtypes = [
            ctypes.POINTER(_DataBlob),
            wintypes.LPCWSTR,
            ctypes.POINTER(_DataBlob),
            ctypes.c_void_p,
            ctypes.c_void_p,
            wintypes.DWORD,
            ctypes.POINTER(_DataBlob),
        ]
        self.crypt32.CryptProtectData.restype = wintypes.BOOL
        self.crypt32.CryptUnprotectData.argtypes = [
            ctypes.POINTER(_DataBlob),
            ctypes.POINTER(wintypes.LPWSTR),
            ctypes.POINTER(_DataBlob),
            ctypes.c_void_p,
            ctypes.c_void_p,
            wintypes.DWORD,
            ctypes.POINTER(_DataBlob),
        ]
        self.crypt32.CryptUnprotectData.restype = wintypes.BOOL
        self.kernel32.LocalFree.argtypes = [ctypes.c_void_p]
        self.kernel32.LocalFree.restype = ctypes.c_void_p

    def protect(self, value: str) -> bytes:
        raw = str(value).encode("utf-8")
        source, source_buffer = _blob(raw)
        entropy, entropy_buffer = _blob(self.ENTROPY)
        output = _DataBlob()
        if not self.crypt32.CryptProtectData(
            ctypes.byref(source), "Canvas secret", ctypes.byref(entropy), None, None, 0x1, ctypes.byref(output)
        ):
            raise SecretProtectionError(f"DPAPI 加密失败，Windows 错误码 {ctypes.get_last_error()}")
        try:
            return self.PREFIX + ctypes.string_at(output.pbData, output.cbData)
        finally:
            self.kernel32.LocalFree(output.pbData)

    def unprotect(self, value: bytes) -> str:
        payload = bytes(value)
        if not payload.startswith(self.PREFIX):
            raise SecretProtectionError("密钥数据格式不受支持")
        source, source_buffer = _blob(payload[len(self.PREFIX) :])
        entropy, entropy_buffer = _blob(self.ENTROPY)
        output = _DataBlob()
        description = wintypes.LPWSTR()
        if not self.crypt32.CryptUnprotectData(
            ctypes.byref(source), ctypes.byref(description), ctypes.byref(entropy), None, None, 0x1, ctypes.byref(output)
        ):
            raise SecretProtectionError(f"DPAPI 解密失败，密钥可能来自其他 Windows 用户，错误码 {ctypes.get_last_error()}")
        try:
            return ctypes.string_at(output.pbData, output.cbData).decode("utf-8")
        finally:
            self.kernel32.LocalFree(output.pbData)
            if description:
                self.kernel32.LocalFree(description)


def parse_env_text(raw: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in str(raw or "").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key):
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        values[key] = value
    return values


class SecretStore:
    def __init__(
        self,
        database: CanvasDatabase,
        protect: Optional[Callable[[str], bytes]] = None,
        unprotect: Optional[Callable[[bytes], str]] = None,
    ) -> None:
        self.database = database
        if protect is None or unprotect is None:
            protector = DpapiProtector()
            protect = protector.protect
            unprotect = protector.unprotect
        self._protect = protect
        self._unprotect = unprotect

    def get(self, key: str, default: str = "") -> str:
        blob = self.database.load_secret_blob(str(key or "").strip())
        if blob is None:
            return default
        try:
            return self._unprotect(blob)
        except SecretProtectionError:
            return default

    def set(self, key: str, value: str) -> None:
        name = str(key or "").strip()
        if not name:
            raise ValueError("密钥名称不能为空")
        text = str(value or "")
        if not text:
            self.database.delete_secret(name)
            return
        self.database.save_secret_blob(name, self._protect(text))

    def update(self, values: dict[str, str]) -> None:
        for key, value in values.items():
            self.set(key, str(value or ""))

    def all(self) -> dict[str, str]:
        result: dict[str, str] = {}
        for key, blob in self.database.list_secret_blobs().items():
            try:
                result[key] = self._unprotect(blob)
            except SecretProtectionError:
                continue
        return result

    def load_into_environ(self, overwrite: bool = False) -> None:
        for key, value in self.all().items():
            if overwrite or key not in os.environ:
                os.environ[key] = value

    def import_env_files(self, paths: Iterable[Path]) -> dict[str, int]:
        candidates = [Path(path) for path in paths]
        imported: dict[str, str] = {}
        readable: list[Path] = []
        for path in candidates:
            if not path.is_file():
                continue
            values = parse_env_text(path.read_text(encoding="utf-8-sig"))
            imported.update(values)
            readable.append(path)
        if not readable:
            return {"files": 0, "values": 0, "removed": 0}
        self.update(imported)
        for key, expected in imported.items():
            if self.get(key) != expected:
                raise SecretProtectionError(f"DPAPI 导入校验失败：{key}")
        removed = 0
        for path in readable:
            path.unlink()
            removed += 1
        self.database.put_document(
            "security",
            "secret_migration",
            {
                "status": "complete",
                "files_removed": removed,
                "values_imported": len(imported),
                "completed_at": int(time.time() * 1000),
            },
        )
        return {"files": len(readable), "values": len(imported), "removed": removed}
