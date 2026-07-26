from __future__ import annotations

import time
from dataclasses import asdict, dataclass


EVENT_TOPICS = {
    "canvas",
    "project",
    "asset",
    "prompt",
    "platform",
    "workflow",
    "preference",
    "history",
    "session",
    "task",
}


@dataclass(frozen=True)
class ChangeEvent:
    type: str
    topic: str
    entity_id: str
    revision: int
    actor_id: str
    updated_at: int

    def public(self) -> dict[str, object]:
        return asdict(self)


def entity_changed(
    topic: str,
    entity_id: str = "global",
    revision: int = 0,
    actor_id: str = "",
    updated_at: int = 0,
) -> ChangeEvent:
    normalized = str(topic or "").strip().lower()
    if normalized not in EVENT_TOPICS:
        raise ValueError(f"不支持的事件主题：{normalized or '(empty)'}")
    return ChangeEvent(
        type="entity.changed",
        topic=normalized,
        entity_id=str(entity_id or "global"),
        revision=max(0, int(revision or 0)),
        actor_id=str(actor_id or ""),
        updated_at=int(updated_at or time.time() * 1000),
    )
