TASK_QUEUED = "queued"
TASK_RUNNING = "running"
TASK_SUCCEEDED = "succeeded"
TASK_FAILED = "failed"
TASK_TIMEOUT = "timeout"

TERMINAL_STATUSES = {TASK_SUCCEEDED, TASK_FAILED, TASK_TIMEOUT}

MODELSCOPE_STATUS_MAP = {
    "PENDING": TASK_QUEUED,
    "QUEUED": TASK_QUEUED,
    "RUNNING": TASK_RUNNING,
    "PROCESSING": TASK_RUNNING,
    "SUCCEED": TASK_SUCCEEDED,
    "SUCCESS": TASK_SUCCEEDED,
    "FAILED": TASK_FAILED,
    "FAIL": TASK_FAILED,
    "ERROR": TASK_FAILED,
    "CANCELED": TASK_FAILED,
    "CANCELLED": TASK_FAILED,
    "REVOKED": TASK_FAILED,
    "TIMEOUT": TASK_TIMEOUT,
}


def normalize_modelscope_status(raw_status):
    raw = str(raw_status or "").upper()
    return MODELSCOPE_STATUS_MAP.get(raw, TASK_RUNNING if raw else TASK_QUEUED)


def task_status_payload(provider, status, task_id=None, raw_status=None, progress=None, total=None, message="", event_type="task_status", **extra):
    payload = {
        "type": event_type,
        "provider": provider,
        "status": status,
        "raw_status": raw_status or status,
        "message": message or status,
    }
    if task_id:
        payload["task_id"] = task_id
    if progress is not None:
        payload["progress"] = progress
    if total is not None:
        payload["total"] = total
    payload.update({key: value for key, value in extra.items() if value is not None})
    return payload


def cloud_status_payload(provider, raw_status, task_id=None, progress=None, total=None, message="", **extra):
    status = normalize_modelscope_status(raw_status)
    return task_status_payload(
        provider,
        status,
        task_id=task_id,
        raw_status=raw_status,
        progress=progress,
        total=total,
        message=message or status,
        event_type="cloud_status",
        **extra,
    )
