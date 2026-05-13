#!/usr/bin/env python3
"""Repository guardrails for security, workflows, and design regressions."""

from __future__ import annotations

import compileall
import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def fail(message: str) -> None:
    print(f"FAIL: {message}")
    raise SystemExit(1)


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8", errors="ignore")


def check_python_compile() -> None:
    targets = [ROOT / "main.py", ROOT / "app_config.py", ROOT / "task_status.py", ROOT / "scripts"]
    ok = True
    for target in targets:
        if target.exists():
            target_ok = compileall.compile_file(str(target), quiet=1) if target.is_file() else compileall.compile_dir(str(target), quiet=1)
            ok = ok and target_ok
    if not ok:
        fail("Python compilation failed")


def check_workflows() -> None:
    workflow_dir = ROOT / "workflows"
    files = sorted(workflow_dir.glob("*.json"))
    if not files:
        fail("No workflow JSON files found")
    for path in files:
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:  # noqa: BLE001 - report the exact malformed file
            fail(f"Invalid workflow JSON: {path.relative_to(ROOT)}: {exc}")


def check_backend_security() -> None:
    main = read("main.py")
    config = read("app_config.py")
    task_status = read("task_status.py")
    combined = main + "\n" + config + "\n" + task_status
    forbidden = [
        ('allow_origins=["*"]', "wildcard CORS must not return"),
        ('allow_origins = ["*"]', "wildcard CORS must not return"),
        ('host="0.0.0.0"', "default server host must not expose LAN"),
        ('return {"token": MODELSCOPE_API_KEY}', "server token must not be returned to browser"),
        ('return {"token": config.get("modelscope_token", "")}', "legacy token must not be returned to browser"),
        ("workflow_path = os.path.join(WORKFLOW_DIR, req.workflow_json)", "workflow path must use resolver"),
    ]
    for needle, message in forbidden:
        if needle in combined:
            fail(message)
    required = [
        "APP_HOST = os.getenv(\"APP_HOST\", \"127.0.0.1\")",
        "CORS_ALLOW_ORIGINS = env_list(",
        "def resolve_workflow_path(",
        "workflow_path = resolve_workflow_path(req.workflow_json)",
        "def modelscope_api_key(",
        "\"has_token\": bool(modelscope_api_key())",
        "raise HTTPException(status_code=502, detail=f\"ModelScope task failed",
    ]
    for needle in required:
        if needle not in combined:
            fail(f"Missing backend guard: {needle}")
    if "TASK_QUEUED" not in task_status or "normalize_modelscope_status" not in task_status:
        fail("Missing unified task status contract")


def check_frontend_security() -> None:
    for path in ["static/zimage.html", "static/angle.html"]:
        text = read(path)
        if "data.token" in text:
            fail(f"{path} reads secret token value from /api/config/token")
        if "data.has_token" not in text:
            fail(f"{path} does not use token status flow")
    login = read("static/login.html")
    if "/api/config/token" in login and "method: 'POST'" in login:
        fail("login page must not POST browser token to server")
    if "同步到服务端全局 token" in login or "Sync failed" in login:
        fail("login page still describes server-side token sync")
    theme = read("static/theme.js")
    if "XMLHttpRequest" in theme:
        fail("theme.js must not use sync XMLHttpRequest for pixel sprite")


def scan_file(path: Path, patterns: list[tuple[re.Pattern[str], str]]) -> None:
    text = path.read_text(encoding="utf-8", errors="ignore")
    for pattern, label in patterns:
        match = pattern.search(text)
        if match:
            line = text.count("\n", 0, match.start()) + 1
            fail(f"{path.relative_to(ROOT)}:{line} violates {label}: {match.group(0)[:80]}")


def check_design_regressions() -> None:
    html_files = sorted((ROOT / "static").glob("*.html"))
    for path in html_files:
        scan_file(path, [(re.compile(r"data-lucide="), "visible generic icon marker")])

    canvas = ROOT / "static" / "canvas.html"
    scan_file(
        canvas,
        [
            (re.compile(r"border-radius\s*:\s*(?:999|1[3-9]|[2-9][0-9])px"), "large border radius"),
            (re.compile(r"box-shadow\s*:\s*(?!none|inset 0 1px 0)"), "soft shadow"),
            (re.compile(r"box-shadow\s*:\s*inset 0 1px 0 [^;]+,\s*0\s+\d+px"), "compound soft shadow"),
            (re.compile(r"backdrop-filter\s*:\s*blur\((?:1[0-9]|[2-9][0-9])px"), "heavy blur"),
            (
                re.compile(r"#(?:0f172a|111827|64748b|94a3b8|f8fafc|e2e8f0|cbd5e1)|text-slate|text-gray|bg-slate"),
                "slate/blue palette drift",
            ),
            (re.compile(r"output-spinner|spinner"), "spinner loading pattern"),
            (
                re.compile(r"\.(?:board|canvas-gate)\s*\{[^}]*rgba\(230,213,168,0\.55\)", re.S),
                "overstrong canvas grid",
            ),
            (
                re.compile(
                    r"\.(?:setting-input|mode-tabs button|ms-model-tabs button|input-item img|input-label|output-del)"
                    r"\s*\{[^}]*border-radius\s*:\s*(?!0\b)[^;]+",
                    re.S,
                ),
                "rounded core canvas control",
            ),
        ],
    )


def main() -> None:
    check_python_compile()
    check_workflows()
    check_backend_security()
    check_frontend_security()
    check_design_regressions()
    print("Guardrails passed")


if __name__ == "__main__":
    main()
