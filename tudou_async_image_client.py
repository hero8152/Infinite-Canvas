"""Tudou GPT-Image-2 async image API client.

This module is intentionally standalone so the Tudou integration can be kept
as a small overlay when syncing Infinite-Canvas from upstream.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional

import httpx


DEFAULT_BASE_URL = "https://api.ai-tudou.net"
SUBMIT_PATH = "/v1/images/generations/async"
TASK_PATH_PREFIX = "/v1/tasks"

SUCCESS_STATUSES = {
    "COMPLETED",
    "COMPLETE",
    "DONE",
    "FINISHED",
    "OK",
    "READY",
    "SUCCESS",
    "SUCCEED",
    "SUCCEEDED",
    "SUCCESSFUL",
}

FAILED_STATUSES = {
    "CANCELED",
    "CANCELLED",
    "ERROR",
    "ERRORED",
    "EXPIRED",
    "FAIL",
    "FAILED",
    "FAILURE",
    "REJECTED",
    "TIMEOUT",
}


def _text(value: Any) -> str:
    return str(value or "").strip()


def _base_url(value: str) -> str:
    return (_text(value) or DEFAULT_BASE_URL).rstrip("/")


def _task_data(payload: Dict[str, Any]) -> Dict[str, Any]:
    if isinstance(payload, dict) and isinstance(payload.get("data"), dict):
        return payload["data"]
    return payload if isinstance(payload, dict) else {}


def _status(payload: Dict[str, Any]) -> str:
    data = _task_data(payload)
    return _text(data.get("status") or data.get("task_status")).upper()


def _fail_reason(payload: Dict[str, Any]) -> str:
    data = _task_data(payload)
    error = data.get("error") if isinstance(data.get("error"), dict) else {}
    return (
        data.get("fail_reason")
        or data.get("message")
        or error.get("message")
        or (payload.get("message") if isinstance(payload, dict) else "")
        or "Tudou image task failed"
    )


def _extract_task_id(payload: Dict[str, Any]) -> str:
    data = _task_data(payload)
    return _text(
        payload.get("task_id")
        or payload.get("taskId")
        or payload.get("id")
        or data.get("task_id")
        or data.get("taskId")
        or data.get("id")
    )


def extract_image_items(value: Any, depth: int = 0) -> List[Dict[str, Any]]:
    if depth > 8 or value is None:
        return []
    found: List[Dict[str, Any]] = []
    if isinstance(value, str):
        text = value.strip()
        if text.startswith(("http://", "https://", "data:image/")):
            found.append({"type": "url", "value": text})
        return found
    if isinstance(value, list):
        for item in value:
            found.extend(extract_image_items(item, depth + 1))
        return found
    if not isinstance(value, dict):
        return found

    url = value.get("url")
    if isinstance(url, list):
        found.extend(extract_image_items(url, depth + 1))
    elif isinstance(url, str):
        found.extend(extract_image_items(url, depth + 1))

    for key in ("images", "image", "image_urls", "output", "outputs", "result", "data"):
        item = value.get(key)
        if isinstance(item, (dict, list, str)):
            found.extend(extract_image_items(item, depth + 1))

    for key in ("b64_json", "base64", "b64", "image_base64", "imageBase64"):
        item = value.get(key)
        if isinstance(item, str) and item.strip():
            found.append({"type": "b64", "value": item.strip(), "mime_type": value.get("mime_type") or "image/png"})
    return found


@dataclass
class TudouAsyncImageClient:
    api_key: str
    base_url: str = DEFAULT_BASE_URL
    timeout: float = 60.0
    poll_interval: float = 5.0

    def headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {_text(self.api_key)}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    def submit_url(self) -> str:
        return f"{_base_url(self.base_url)}{SUBMIT_PATH}"

    def task_url(self, task_id: str) -> str:
        return f"{_base_url(self.base_url)}{TASK_PATH_PREFIX}/{task_id}"

    def build_payload(
        self,
        *,
        model: str,
        prompt: str,
        size: str,
        resolution: str,
        quality: str,
        images: Optional[Iterable[str]] = None,
    ) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "model": _text(model) or "gpt-image-2-all",
            "prompt": _text(prompt),
            "size": _text(size) or "1:1",
            "resolution": _text(resolution) or "1k",
            "quality": _text(quality) or "medium",
        }
        image_list = [_text(item) for item in (images or []) if _text(item)]
        if image_list:
            payload["images"] = image_list
        return payload

    async def submit(self, **kwargs: Any) -> Dict[str, Any]:
        payload = self.build_payload(**kwargs)
        async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
            response = await client.post(self.submit_url(), headers=self.headers(), json=payload)
            response.raise_for_status()
            raw = response.json()
        if not isinstance(raw, dict):
            raise RuntimeError("Tudou submit response is not JSON object")
        task_id = _extract_task_id(raw)
        if not task_id:
            raise RuntimeError(f"Tudou submit response missing task id: {raw}")
        raw["task_id"] = task_id
        raw["_submitted_payload"] = payload
        return raw

    async def fetch_task(self, task_id: str) -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
            response = await client.get(self.task_url(task_id), headers=self.headers())
            response.raise_for_status()
            raw = response.json()
        if not isinstance(raw, dict):
            raise RuntimeError("Tudou task response is not JSON object")
        return raw

    async def wait(self, task_id: str, *, timeout: Optional[float] = None, poll_interval: Optional[float] = None) -> Dict[str, Any]:
        timeout = float(timeout if timeout is not None else self.timeout)
        interval = float(poll_interval if poll_interval is not None else self.poll_interval)
        deadline = asyncio.get_running_loop().time() + timeout
        last_payload: Dict[str, Any] = {}
        while asyncio.get_running_loop().time() < deadline:
            last_payload = await self.fetch_task(task_id)
            status = _status(last_payload)
            if status in SUCCESS_STATUSES:
                return last_payload
            if status in FAILED_STATUSES:
                raise RuntimeError(_fail_reason(last_payload))
            if not status and extract_image_items(last_payload):
                return last_payload
            await asyncio.sleep(min(interval, max(0.0, deadline - asyncio.get_running_loop().time())))
        raise TimeoutError(f"Tudou image task timeout: {task_id}; last response: {str(last_payload)[:800]}")

