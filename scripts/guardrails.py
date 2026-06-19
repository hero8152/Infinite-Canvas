#!/usr/bin/env python3
"""Repository guardrails for security, workflows, and design regressions."""

from __future__ import annotations

import compileall
import json
import re
import shutil
import subprocess
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


def frontend_files() -> list[Path]:
    src = ROOT / "frontend" / "src"
    if not src.exists():
        return []
    return sorted(path for path in src.rglob("*") if path.is_file() and path.suffix in {".css", ".ts", ".tsx", ".html"})


def check_quiet_creative_frontend() -> None:
    frontend = ROOT / "frontend"
    if not frontend.exists():
        fail("Missing frontend/ Vite shell")

    required = [
        frontend / "package.json",
        frontend / "package-lock.json",
        frontend / "vite.config.ts",
        frontend / "src" / "app" / "App.tsx",
        frontend / "src" / "styles" / "tokens.css",
        frontend / "src" / "features" / "embedded" / "EmbeddedWorkbench.tsx",
        frontend / "src" / "features" / "generate" / "GenerateWorkspace.tsx",
        frontend / "src" / "features" / "generate" / "generate.css",
        frontend / "src" / "features" / "enhance" / "EnhanceWorkspace.tsx",
        frontend / "src" / "features" / "enhance" / "enhance.css",
        frontend / "src" / "features" / "edit" / "EditWorkspace.tsx",
        frontend / "src" / "features" / "edit" / "edit.css",
        frontend / "src" / "features" / "online" / "OnlineWorkspace.tsx",
        frontend / "src" / "features" / "online" / "online.css",
        frontend / "src" / "features" / "angle" / "AngleWorkspace.tsx",
        frontend / "src" / "features" / "angle" / "angle.css",
        frontend / "src" / "features" / "chat" / "ChatWorkspace.tsx",
        frontend / "src" / "features" / "chat" / "chat.css",
        frontend / "src" / "features" / "gallery" / "GalleryWorkspace.tsx",
        frontend / "src" / "features" / "gallery" / "gallery.css",
        frontend / "src" / "features" / "canvas" / "CanvasWorkspace.tsx",
        frontend / "src" / "features" / "canvas" / "canvas.css",
        frontend / "src" / "features" / "api-models" / "ApiModelsWorkspace.tsx",
        frontend / "src" / "features" / "api-models" / "api-models.css",
        frontend / "src" / "features" / "comfyui" / "ComfyUIWorkspace.tsx",
        frontend / "src" / "features" / "comfyui" / "comfyui.css",
        frontend / "src" / "lib" / "canvas-intake.ts",
        frontend / "src" / "lib" / "creation-state.ts",
        frontend / "src" / "lib" / "result-dedupe.ts",
    ]
    for path in required:
        if not path.exists():
            fail(f"Missing Quiet Creative OS frontend file: {path.relative_to(ROOT)}")

    tokens = (frontend / "src" / "styles" / "tokens.css").read_text(encoding="utf-8")
    for token in ["#2f6fed", "#f7f7f4", "#101112", "--qc-accent", "--qc-surface", "--qc-radius-md"]:
        if token not in tokens:
            fail(f"Quiet Creative OS token missing: {token}")

    forbidden = [
        (re.compile(r"#(?:fa520f|fffaeb|fff4d6)\b", re.I), "legacy Mistral palette in new frontend"),
        (re.compile(r"\bpixel-icon\b"), "legacy pixel icon dependency in new frontend"),
        (re.compile(r"\bshell-grid\b"), "legacy grid-paper shell in new frontend"),
        (re.compile(r"\brounded-(?:full|2xl|3xl)\b"), "Tailwind large radius utility in new frontend"),
        (re.compile(r"\bReactBits\b|\breact-bits\b", re.I), "React Bits foundation in new frontend"),
    ]
    for path in frontend_files():
        scan_file(path, forbidden)


def route_body(routes: str, route_id: str) -> str:
    match = re.search(rf'id:\s*"{re.escape(route_id)}"(?P<body>.*?)(?:\n\s*\}},|\n\s*\}}\s*\n\];)', routes, re.S)
    if not match:
        fail(f"Missing route registration: {route_id}")
    return match.group("body")


def canvas_route_allows_phase9(routes: str) -> None:
    canvas_route = route_body(routes, "canvas")
    if 'kind: "native-canvas"' in canvas_route and "src:" not in canvas_route:
        return
    if 'kind: "embedded"' in canvas_route and 'src: "/static/canvas.html' in canvas_route:
        return
    fail("Canvas route must be either the pre-Phase 9 embedded route or the Phase 9 native route")


def comfyui_route_allows_phase14(routes: str, phase_label: str) -> None:
    comfy_route = route_body(routes, "comfyui-settings")
    if 'kind: "native-comfyui"' in comfy_route:
        if "src:" in comfy_route or "static/comfyui-settings.html" in comfy_route:
            fail(f"ComfyUI native route must not load static/comfyui-settings.html after {phase_label}")
        return
    if 'kind: "embedded"' in comfy_route and "static/comfyui-settings.html" in comfy_route:
        return
    fail(f"ComfyUI route must remain reachable after {phase_label} as embedded or Phase 14 native")


def check_quiet_creative_phase2_generate() -> None:
    routes = read("frontend/src/app/routes.tsx")
    app = read("frontend/src/app/App.tsx")
    embedded = read("frontend/src/features/embedded/EmbeddedWorkbench.tsx")
    generate = read("frontend/src/features/generate/GenerateWorkspace.tsx")
    api = read("frontend/src/lib/api.ts")
    rail = read("frontend/src/components/creation-rail/CreationRail.tsx")

    zimage_route = route_body(routes, "zimage")
    if 'kind: "native-generate"' not in zimage_route:
        fail("Generate route must be native in Phase 2")
    if 'src:' in zimage_route or "static/zimage.html" in zimage_route:
        fail("Generate route must not load static/zimage.html")
    if 'activeRoute.kind === "native-generate"' not in app or "<GenerateWorkspace" not in app:
        fail("App shell must render native Generate workspace for Generate route")
    if 'route.kind === "embedded"' not in embedded:
        fail("EmbeddedWorkbench must only render embedded iframe routes")
    for needle in [
        '"/api/history?type=zimage"',
        '"/api/generate"',
        '"/generate"',
        "convert_to_jpg",
    ]:
        if needle not in api:
            fail(f"Generate API helper missing existing endpoint contract: {needle}")
    for needle in ["getZImageHistory", "generateLocalImage", "generateCloudImage", "onTaskChange", "onOutputsChange"]:
        if needle not in generate:
            fail(f"Native Generate workspace missing Phase 2 behavior: {needle}")
    if "/static/zimage.html" in generate:
        fail("Native Generate workspace must not embed static/zimage.html")
    for needle in ["generateTask", "generateOutputs", "activeLabel"]:
        if needle not in rail:
            fail(f"Creation Rail missing Generate integration: {needle}")


def check_quiet_creative_phase3_enhance() -> None:
    routes = read("frontend/src/app/routes.tsx")
    app = read("frontend/src/app/App.tsx")
    enhance = read("frontend/src/features/enhance/EnhanceWorkspace.tsx")
    api = read("frontend/src/lib/api.ts")
    rail = read("frontend/src/components/creation-rail/CreationRail.tsx")

    enhance_route = route_body(routes, "enhance")
    if 'kind: "native-enhance"' not in enhance_route:
        fail("Enhance route must be native in Phase 3")
    if 'src:' in enhance_route or "static/enhance.html" in enhance_route:
        fail("Enhance route must not load static/enhance.html")

    canvas_route_allows_phase9(routes)

    if 'activeRoute.kind === "native-enhance"' not in app or "<EnhanceWorkspace" not in app:
        fail("App shell must render native Enhance workspace for Enhance route")

    for needle in [
        '"/api/history?type=enhance"',
        '"/api/history?type=klein"',
        '"/api/upload"',
        '"/api/generate"',
        '"/api/ms/generate"',
    ]:
        if needle not in api:
            fail(f"Enhance API helper missing existing endpoint contract: {needle}")

    for needle in [
        "Z-Image-Enhance.json",
        "upscale.json",
        "generateWorkflowImage",
        "generateMsImage",
        "uploadImageFile",
        "onTaskChange",
        "onOutputsChange",
    ]:
        if needle not in enhance:
            fail(f"Native Enhance workspace missing Phase 3 behavior: {needle}")
    if "/static/enhance.html" in enhance:
        fail("Native Enhance workspace must not embed static/enhance.html")
    for needle in ["enhanceTask", "enhanceOutputs", "activeRouteId"]:
        if needle not in rail:
            fail(f"Creation Rail missing Enhance integration: {needle}")


def check_quiet_creative_phase4_online() -> None:
    routes = read("frontend/src/app/routes.tsx")
    app = read("frontend/src/app/App.tsx")
    online = read("frontend/src/features/online/OnlineWorkspace.tsx")
    api = read("frontend/src/lib/api.ts")
    rail = read("frontend/src/components/creation-rail/CreationRail.tsx")
    dedupe = read("frontend/src/lib/result-dedupe.ts")
    generate = read("frontend/src/features/generate/GenerateWorkspace.tsx")
    enhance = read("frontend/src/features/enhance/EnhanceWorkspace.tsx")

    online_route = route_body(routes, "online")
    if 'kind: "native-online"' not in online_route:
        fail("Online route must be native in Phase 4")
    if 'src:' in online_route or "static/online.html" in online_route:
        fail("Online route must not load static/online.html")

    for route_id, kind in [("zimage", "native-generate"), ("enhance", "native-enhance")]:
        route = route_body(routes, route_id)
        if f'kind: "{kind}"' not in route:
            fail(f"{route_id} must remain {kind} after Phase 4")

    canvas_route_allows_phase9(routes)

    if 'activeRoute.kind === "native-online"' not in app or "<OnlineWorkspace" not in app:
        fail("App shell must render native Online workspace for Online route")

    for needle in [
        '"/api/history?type=online"',
        '"/api/ai/upload"',
        '"/api/online-image"',
        '"/api/history/delete"',
        "reference_images",
        "provider_id",
    ]:
        if needle not in api:
            fail(f"Online API helper missing existing endpoint contract: {needle}")

    for needle in [
        "generateOnlineImage",
        "getOnlineHistory",
        "uploadAiReferenceImage",
        "reference_images",
        "provider_id",
        "currentSize",
        "onTaskChange",
        "onOutputsChange",
    ]:
        if needle not in online:
            fail(f"Native Online workspace missing Phase 4 behavior: {needle}")
    if "/static/online.html" in online:
        fail("Native Online workspace must not embed static/online.html")

    for needle in ["onlineTask", "onlineOutputs", "activeRouteId", "Online"]:
        if needle not in rail:
            fail(f"Creation Rail missing Online integration: {needle}")

    for needle in ["primaryImageUrl", "taskIdFromRecord", "isSameGeneratedResult", "upsertGeneratedRecord"]:
        if needle not in dedupe:
            fail(f"Shared result dedupe helper missing: {needle}")
    if "timestamp" not in dedupe or "leftImage && rightImage" not in dedupe or "leftTaskId && rightTaskId" not in dedupe:
        fail("Shared result dedupe must compare image URL and task id, not only timestamps")

    for path, text in [
        ("Native Generate", generate),
        ("Native Enhance", enhance),
        ("Native Online", online),
    ]:
        for needle in ["upsertGeneratedRecord", "generatedResultKey"]:
            if needle not in text:
                fail(f"{path} must use shared stable result dedupe: {needle}")


def check_quiet_creative_phase5_chat() -> None:
    routes = read("frontend/src/app/routes.tsx")
    app = read("frontend/src/app/App.tsx")
    chat = read("frontend/src/features/chat/ChatWorkspace.tsx")
    api = read("frontend/src/lib/api.ts")
    rail = read("frontend/src/components/creation-rail/CreationRail.tsx")

    chat_route = route_body(routes, "gpt-chat")
    if 'kind: "native-chat"' not in chat_route:
        fail("Chat route must be native in Phase 5")
    if 'src:' in chat_route or "static/gpt-chat.html" in chat_route:
        fail("Chat route must not load static/gpt-chat.html")

    for route_id, kind in [
        ("zimage", "native-generate"),
        ("enhance", "native-enhance"),
        ("online", "native-online"),
    ]:
        route = route_body(routes, route_id)
        if f'kind: "{kind}"' not in route:
            fail(f"{route_id} must remain {kind} after Phase 5")

    canvas_route_allows_phase9(routes)

    if 'activeRoute.kind === "native-chat"' not in app or "<ChatWorkspace" not in app:
        fail("App shell must render native Chat workspace for Chat route")

    for needle in [
        '"/api/conversations"',
        '"/api/chat"',
        '"/api/chat/stream"',
        '"/api/ai/upload"',
        "ChatPayload",
        "ChatConversation",
    ]:
        if needle not in api:
            fail(f"Chat API helper missing existing endpoint contract: {needle}")

    for needle in [
        "getConversations",
        "getConversation",
        "createConversation",
        "deleteConversation",
        "streamChatMessage",
        "uploadAiReferenceImage",
        "reference_images",
        "onTaskChange",
        "onOutputsChange",
        "onContextChange",
    ]:
        if needle not in chat:
            fail(f"Native Chat workspace missing Phase 5 behavior: {needle}")
    if "/static/gpt-chat.html" in chat:
        fail("Native Chat workspace must not embed static/gpt-chat.html")

    for needle in ["chatTask", "chatOutputs", "chatContext", "Chat"]:
        if needle not in rail:
            fail(f"Creation Rail missing Chat integration: {needle}")


def check_quiet_creative_phase6_gallery() -> None:
    routes = read("frontend/src/app/routes.tsx")
    app = read("frontend/src/app/App.tsx")
    gallery = read("frontend/src/features/gallery/GalleryWorkspace.tsx")
    api = read("frontend/src/lib/api.ts")
    rail = read("frontend/src/components/creation-rail/CreationRail.tsx")
    globals_css = read("frontend/src/styles/globals.css")

    gallery_route = route_body(routes, "gallery")
    if 'kind: "native-gallery"' not in gallery_route:
        fail("Gallery route must be native in Phase 6")
    if 'src:' in gallery_route or "static/gallery.html" in gallery_route:
        fail("Gallery route must not load static/gallery.html")

    for route_id, kind in [
        ("zimage", "native-generate"),
        ("enhance", "native-enhance"),
        ("online", "native-online"),
        ("gpt-chat", "native-chat"),
    ]:
        route = route_body(routes, route_id)
        if f'kind: "{kind}"' not in route:
            fail(f"{route_id} must remain {kind} after Phase 6")

    canvas_route_allows_phase9(routes)

    if 'activeRoute.kind === "native-gallery"' not in app or "<GalleryWorkspace" not in app:
        fail("App shell must render native Gallery workspace for Gallery route")

    if "is-rail-collapsed" in app + globals_css + rail:
        fail("Creation Rail must not use a collapsed shell grid class")
    if "qcos_creation_rail_collapsed" in app + globals_css + rail:
        fail("Creation Rail collapsed localStorage preference must not drive shell layout")
    if "grid-template-columns: var(--qc-sidebar-width) minmax(0, 1fr) var(--qc-rail-width)" in globals_css:
        fail("Creation Rail must not be an inline third shell column")
    if "position: fixed" not in globals_css or ".qc-creation-rail.is-open" not in globals_css:
        fail("Creation Rail must remain an overlay drawer/sheet")

    for needle in [
        '"/api/gallery/assets?',
        "/api/gallery/assets/${encodeURIComponent(assetId)}/favorite",
        '"/api/gallery/download"',
        "/api/download-output",
        "GalleryQuery",
        "GalleryFacets",
    ]:
        if needle not in api:
            fail(f"Gallery API helper missing existing endpoint contract: {needle}")

    for needle in [
        "getGalleryAssets",
        "updateGalleryFavorite",
        "hideGalleryAsset",
        "downloadGalleryAssets",
        "galleryDownloadUrl",
        "onTaskChange",
        "onSelectedAssetsChange",
        "selectedIds",
    ]:
        if needle not in gallery:
            fail(f"Native Gallery workspace missing Phase 6 behavior: {needle}")
    if "/static/gallery.html" in gallery:
        fail("Native Gallery workspace must not embed static/gallery.html")

    for needle in ["galleryTask", "gallerySelectedAssets", "Selected Gallery", "Gallery"]:
        if needle not in rail:
            fail(f"Creation Rail missing Gallery integration: {needle}")


def check_quiet_creative_phase7_edit() -> None:
    routes = read("frontend/src/app/routes.tsx")
    app = read("frontend/src/app/App.tsx")
    edit = read("frontend/src/features/edit/EditWorkspace.tsx")
    api = read("frontend/src/lib/api.ts")
    rail = read("frontend/src/components/creation-rail/CreationRail.tsx")
    globals_css = read("frontend/src/styles/globals.css")

    if not (ROOT / "static" / "klein.html").exists():
        fail("static/klein.html must remain available on disk for dormant cleanup follow-up")

    edit_route = route_body(routes, "klein")
    if 'kind: "native-edit"' not in edit_route:
        fail("Edit route must be native in Phase 7")
    if 'src:' in edit_route or "static/klein.html" in edit_route:
        fail("Edit route must not load static/klein.html")

    for route_id, kind in [
        ("zimage", "native-generate"),
        ("enhance", "native-enhance"),
        ("online", "native-online"),
        ("gpt-chat", "native-chat"),
        ("gallery", "native-gallery"),
    ]:
        route = route_body(routes, route_id)
        if f'kind: "{kind}"' not in route:
            fail(f"{route_id} must remain {kind} after Phase 7")

    comfyui_route_allows_phase14(routes, "Phase 7")

    if 'activeRoute.kind === "native-edit"' not in app or "<EditWorkspace" not in app:
        fail("App shell must render native Edit workspace for Edit route")

    if "is-rail-collapsed" in app + globals_css + rail:
        fail("Creation Rail must not use a collapsed shell grid class")
    if "qcos_creation_rail_collapsed" in app + globals_css + rail:
        fail("Creation Rail collapsed localStorage preference must not return")
    if "grid-template-columns: var(--qc-sidebar-width) minmax(0, 1fr) var(--qc-rail-width)" in globals_css:
        fail("Creation Rail must not be an inline third shell column")

    for needle in [
        '"/api/history?type=klein"',
        '"/api/upload"',
        '"/api/generate"',
        '"/api/ms/generate"',
        '"/api/history/delete"',
        "WorkflowGeneratePayload",
        "MsGeneratePayload",
    ]:
        if needle not in api:
            fail(f"Edit API helper missing existing endpoint contract: {needle}")

    for needle in [
        "Flux2-Klein.json",
        "black-forest-labs/FLUX.2-klein-9B",
        "Daniel8152/Klein-enhance",
        "uploadImageFile",
        "generateWorkflowImage",
        "generateMsImage",
        "getKleinHistory",
        "deleteHistoryItem",
        '"278": { image: slots.main.comfyName',
        '"270": { image: slots.auxA.comfyName',
        '"292": { image: slots.auxB.comfyName',
        '"313": { value: Boolean(slots.auxA.comfyName)',
        '"314": { value: Boolean(slots.auxB.comfyName)',
        "onTaskChange",
        "onOutputsChange",
        "onInputChange",
        "upsertGeneratedRecord",
    ]:
        if needle not in edit:
            fail(f"Native Edit workspace missing Phase 7 behavior: {needle}")
    if "/static/klein.html" in edit:
        fail("Native Edit workspace must not embed static/klein.html")

    for needle in ["editTask", "editOutputs", "editContext", "editInput", "Edit assets"]:
        if needle not in rail:
            fail(f"Creation Rail missing Edit integration: {needle}")


def check_quiet_creative_phase8_shell_cleanup() -> None:
    routes = read("frontend/src/app/routes.tsx")
    app = read("frontend/src/app/App.tsx")
    sidebar = read("frontend/src/components/shell/Sidebar.tsx")
    mobile_nav = read("frontend/src/components/shell/MobileNav.tsx")
    embedded = read("frontend/src/features/embedded/EmbeddedWorkbench.tsx")
    globals_css = read("frontend/src/styles/globals.css")
    main = read("main.py")
    docs = read("docs/quiet-creative-os-phase8.md") if (ROOT / "docs" / "quiet-creative-os-phase8.md").exists() else ""
    handoff = read("REVIEW_HANDOFF.md") if (ROOT / "REVIEW_HANDOFF.md").exists() else ""

    for needle in [
        'label: "Legacy',
        'shortLabel: "Legacy"',
        'kind: "legacy"',
        'id: "legacy-',
        'path: "legacy-',
        'src: "/static/zimage.html',
        'src: "/static/enhance.html',
        'src: "/static/klein.html',
        'src: "/static/online.html',
        'src: "/static/gpt-chat.html',
        'src: "/static/gallery.html',
    ]:
        if needle in routes:
            fail(f"Phase 8 route registry must not contain visible fallback route entry: {needle}")

    for needle in [
        'id: "flatlay"',
        'path: "flatlay"',
        'label: "Flatlay"',
        'src: "/static/flatlay.html',
        'id: "batch-tryon"',
        'path: "batch-tryon"',
        'label: "Batch try-on"',
        'src: "/static/batch-tryon.html',
    ]:
        if needle in routes:
            fail(f"Retired tool must not remain in the product route registry: {needle}")

    for route_id, kind in [
        ("zimage", "native-generate"),
        ("enhance", "native-enhance"),
        ("klein", "native-edit"),
        ("online", "native-online"),
        ("gpt-chat", "native-chat"),
        ("gallery", "native-gallery"),
    ]:
        route = route_body(routes, route_id)
        if f'kind: "{kind}"' not in route:
            fail(f"{route_id} must remain {kind} after Phase 8")
        if "src:" in route:
            fail(f"{route_id} must remain native and iframe-free after Phase 8")

    comfyui_route_allows_phase14(routes, "Phase 8")
    comfy_route = route_body(routes, "comfyui-settings")
    if "Legacy" in comfy_route:
        fail("Preserved ComfyUI route must not be labeled legacy")

    for needle in [
        '"legacy-generate": "zimage"',
        '"legacy-enhance": "enhance"',
        '"legacy-edit": "klein"',
        '"legacy-online": "online"',
        '"legacy-chat": "gpt-chat"',
        '"legacy-gallery": "gallery"',
        'flatlay: "gallery"',
        '"batch-tryon": "gallery"',
        "normalizedAppPathForLocation",
    ]:
        if needle not in routes:
            fail(f"Removed route redirect/normalization missing: {needle}")

    for needle in [
        "/app/legacy-generate",
        "/app/legacy-enhance",
        "/app/legacy-edit",
        "/app/legacy-online",
        "/app/legacy-chat",
        "/app/legacy-gallery",
        "Legacy Generate",
        "Legacy Enhance",
        "Legacy Edit",
        "Legacy Online",
        "Legacy Chat",
        "Legacy Gallery",
    ]:
        for path in frontend_files():
            if path.name == "routes.tsx":
                continue
            text = path.read_text(encoding="utf-8", errors="ignore")
            if needle in text:
                fail(f"Visible fallback UI/link must not remain in frontend: {path.relative_to(ROOT)} contains {needle}")

    if "Flatlay" in sidebar + mobile_nav or "Batch try-on" in sidebar + mobile_nav:
        fail("Flatlay and Batch try-on must not appear in primary navigation")
    for needle in ["Canvas", "Angle", "API / Models", "ComfyUI"]:
        if needle not in routes:
            fail(f"First-class preserved route missing from route registry: {needle}")

    if 'route.kind === "embedded"' not in embedded or "qc-embedded-frame" not in embedded:
        fail("EmbeddedWorkbench must render embedded iframe routes")
    if "Legacy tool frame" in embedded or "qc-legacy-frame" in embedded:
        fail("Embedded workbench must not expose legacy frame terminology")
    if "LegacyWorkbench" in app or "features/legacy" in app:
        fail("App shell must use EmbeddedWorkbench, not LegacyWorkbench")

    if "is-rail-collapsed" in app + globals_css:
        fail("Creation Rail must not use a collapsed shell grid class")
    if "qcos_creation_rail_collapsed" in app + globals_css:
        fail("Creation Rail collapsed localStorage preference must not return")
    if "grid-template-columns: var(--qc-sidebar-width) minmax(0, 1fr) var(--qc-rail-width)" in globals_css:
        fail("Creation Rail must not be an inline third shell column")

    if 'RedirectResponse(url="/app"' not in main:
        fail("/legacy must redirect or normalize to /app")
    canvas_status = subprocess.run(
        ["git", "status", "--porcelain", "--", "static/canvas.html"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if canvas_status.stdout.strip():
        fail("static/canvas.html is modified; Phase 8 must not migrate canvas internals")

    for needle in [
        "legacy fallback pages were removed from the product shell",
        "Flatlay and Batch try-on were retired",
        "Canvas",
        "Angle remains embedded",
        "API / Models and ComfyUI remain embedded",
        "/legacy no longer represents the product shell",
        "no backend API schema changes",
        "canvas.html internals were not migrated",
    ]:
        if needle not in docs + handoff:
            fail(f"Phase 8 documentation/handoff missing required note: {needle}")

    if not (ROOT / "docs" / "quiet-creative-os-remaining-migrations-plan.md").exists():
        fail("Missing remaining native migrations plan document")


def check_quiet_creative_phase9_canvas() -> None:
    routes = read("frontend/src/app/routes.tsx")
    app = read("frontend/src/app/App.tsx")
    api = read("frontend/src/lib/api.ts")
    rail = read("frontend/src/components/creation-rail/CreationRail.tsx")
    canvas = read("frontend/src/features/canvas/CanvasWorkspace.tsx")
    canvas_css = read("frontend/src/features/canvas/canvas.css")
    embedded = read("frontend/src/features/embedded/EmbeddedWorkbench.tsx")
    docs = read("docs/quiet-creative-os-phase9.md") if (ROOT / "docs" / "quiet-creative-os-phase9.md").exists() else ""
    handoff = read("REVIEW_HANDOFF.md") if (ROOT / "REVIEW_HANDOFF.md").exists() else ""

    canvas_route = route_body(routes, "canvas")
    if 'kind: "native-canvas"' not in canvas_route:
        fail("Canvas route must be native in Phase 9")
    if "src:" in canvas_route or "static/canvas.html" in canvas_route:
        fail("Canvas route must not load static/canvas.html in Phase 9")

    if 'activeRoute.kind === "native-canvas"' not in app or "<CanvasWorkspace" not in app:
        fail("App shell must render native Canvas workspace for Canvas route")
    if "canvasTask" not in app or "canvasContext" not in app:
        fail("App shell must wire Canvas task/context to Creation Rail")

    comfyui_route_allows_phase14(routes, "Phase 9")

    if "static/canvas.html" in canvas:
        fail("Native Canvas source must not reference static/canvas.html as its implementation")
    if "qc-embedded-frame" in canvas or "<iframe" in canvas:
        fail("Native Canvas workspace must not render an iframe")
    if "canvas" in embedded.lower() and "/static/canvas.html" in embedded:
        fail("EmbeddedWorkbench must not keep Canvas as an iframe implementation")

    for needle in [
        '"/api/canvases"',
        '"/api/canvases/trash"',
        "/api/canvases/${encodeURIComponent(canvasId)}",
        "/api/canvases/${encodeURIComponent(canvasId)}/restore",
        "/api/canvases/${encodeURIComponent(canvasId)}/purge",
        "CanvasDocument",
        "CanvasNode",
        "CanvasSavePayload",
    ]:
        if needle not in api:
            fail(f"Canvas API helper missing existing endpoint contract: {needle}")

    for needle in [
        "getCanvasList",
        "createCanvasDocument",
        "getCanvasDocument",
        "saveCanvasDocument",
        "deleteCanvasDocument",
        "restoreCanvasDocument",
        "purgeCanvasDocument",
        "base_updated_at",
        "nodes",
        "connections",
        "viewport",
        "logs",
        "settings",
        "onContextChange",
        "nodeUnknownFieldCount",
    ]:
        if needle not in canvas:
            fail(f"Native Canvas workspace missing Phase 9 behavior: {needle}")
    if "position: absolute" not in canvas_css or "qc-canvas-board" not in canvas_css:
        fail("Native Canvas CSS must provide a board layout")

    for needle in ["canvasTask", "canvasContext", "Canvas board", "Canvas"]:
        if needle not in rail:
            fail(f"Creation Rail missing Canvas integration: {needle}")

    for needle in ["Legacy Canvas", "/app/legacy-canvas"]:
        for path in frontend_files():
            text = path.read_text(encoding="utf-8", errors="ignore")
            if needle in text:
                fail(f"Visible Legacy Canvas navigation must not exist: {path.relative_to(ROOT)} contains {needle}")

    canvas_status = subprocess.run(
        ["git", "status", "--porcelain", "--", "static/canvas.html"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if canvas_status.stdout.strip():
        fail("static/canvas.html is modified; Phase 9 must preserve it unchanged")

    for needle in [
        "Native Canvas Foundation",
        "/app/canvas is native",
        "static/canvas.html remains unchanged",
        "no backend API schema changes",
        "unknown node fields survive",
        "full node execution is deferred",
    ]:
        if needle not in docs + handoff:
            fail(f"Phase 9 documentation/handoff missing required note: {needle}")


def check_quiet_creative_phase10_canvas_authoring() -> None:
    routes = read("frontend/src/app/routes.tsx")
    app = read("frontend/src/app/App.tsx")
    api = read("frontend/src/lib/api.ts")
    rail = read("frontend/src/components/creation-rail/CreationRail.tsx")
    gallery = read("frontend/src/features/gallery/GalleryWorkspace.tsx")
    canvas = read("frontend/src/features/canvas/CanvasWorkspace.tsx")
    canvas_css = read("frontend/src/features/canvas/canvas.css")
    intake = read("frontend/src/lib/canvas-intake.ts")
    docs = read("docs/quiet-creative-os-phase10.md") if (ROOT / "docs" / "quiet-creative-os-phase10.md").exists() else ""
    handoff = read("REVIEW_HANDOFF.md") if (ROOT / "REVIEW_HANDOFF.md").exists() else ""

    canvas_route = route_body(routes, "canvas")
    if 'kind: "native-canvas"' not in canvas_route:
        fail("Canvas route must remain native in Phase 10")
    if "src:" in canvas_route or "static/canvas.html" in canvas_route:
        fail("Canvas route must not load static/canvas.html in Phase 10")
    if "static/canvas.html" in canvas or "qc-embedded-frame" in canvas or "<iframe" in canvas:
        fail("Phase 10 Canvas workspace must not reference or render static/canvas.html")

    for needle in [
        "addPromptNode",
        "addGroupNode",
        "addImageNodeFromUrl",
        "handleImageUpload",
        "updateSelectedNode",
        "deleteSelectedNode",
        "createLink",
        "deleteLink",
        "startLinkFromSelection",
        "selectedConnections",
        "nodeAtViewportCenter",
        "uploadAiReferenceImage",
        "consumeCanvasIntakeItems",
        "CANVAS_INTAKE_EVENT",
        "intakeRequiresTargetRef",
        "Choose a Canvas target",
        "intakeRequiresTargetRef.current || pendingIntakeItems.length",
        "base_updated_at",
        "nodes",
        "connections",
        "viewport",
        "logs",
        "settings",
    ]:
        if needle not in canvas:
            fail(f"Native Canvas missing Phase 10 authoring behavior: {needle}")

    for needle in [
        "CanvasIntakeItem",
        "galleryAssetToCanvasIntakeItem",
        "generateRecordToCanvasIntakeItem",
        "writeCanvasIntakeItems",
        "consumeCanvasIntakeItems",
        "qcos_canvas_intake_items",
    ]:
        if needle not in intake:
            fail(f"Canvas intake helper missing Phase 10 behavior: {needle}")

    for needle in [
        "onSendAssetsToCanvas",
        "Send to Canvas",
        "Send asset to Canvas",
    ]:
        if needle not in gallery:
            fail(f"Gallery missing Phase 10 Canvas intake behavior: {needle}")

    for needle in [
        "sendCanvasIntake",
        "sendGalleryAssetsToCanvas",
        "sendRecentAssetToCanvas",
        "sendOutputToCanvas",
        "writeCanvasIntakeItems",
    ]:
        if needle not in app:
            fail(f"App shell missing Phase 10 Canvas intake bridge: {needle}")

    for needle in [
        "onSendGalleryAssetsToCanvas",
        "onSendRecentAssetToCanvas",
        "onSendOutputToCanvas",
        "Send output to Canvas",
        "linkState",
        "intakeState",
    ]:
        if needle not in rail:
            fail(f"Creation Rail missing Phase 10 Canvas context/intake: {needle}")

    for needle in [
        "qc-canvas-authoring",
        "qc-canvas-inspector",
        "qc-canvas-node-palette",
        "qc-canvas-link-list",
        "qc-canvas-upload",
    ]:
        if needle not in canvas_css:
            fail(f"Canvas CSS missing Phase 10 authoring layout: {needle}")

    if '"/api/ai/upload"' not in api:
        fail("Canvas image upload must reuse existing /api/ai/upload helper")

    for needle in ["Legacy Canvas", "/app/legacy-canvas"]:
        for path in frontend_files():
            text = path.read_text(encoding="utf-8", errors="ignore")
            if needle in text:
                fail(f"Visible Legacy Canvas navigation must not exist: {path.relative_to(ROOT)} contains {needle}")

    canvas_status = subprocess.run(
        ["git", "status", "--porcelain", "--", "static/canvas.html"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if canvas_status.stdout.strip():
        fail("static/canvas.html is modified; Phase 10 must preserve it unchanged")

    for needle in [
        "Native Canvas Authoring & Asset Intake",
        "/app/canvas remains native",
        "no backend API schema changes",
        "static/canvas.html remains unchanged",
        "unknown node fields survive",
        "Gallery selected asset -> Canvas",
        "full node execution is deferred",
    ]:
        if needle not in docs + handoff:
            fail(f"Phase 10 documentation/handoff missing required note: {needle}")


def check_quiet_creative_phase11_canvas_execution() -> None:
    routes = read("frontend/src/app/routes.tsx")
    app = read("frontend/src/app/App.tsx")
    api = read("frontend/src/lib/api.ts")
    rail = read("frontend/src/components/creation-rail/CreationRail.tsx")
    canvas = read("frontend/src/features/canvas/CanvasWorkspace.tsx")
    canvas_css = read("frontend/src/features/canvas/canvas.css")
    main_py = read("main.py")
    docs = read("docs/quiet-creative-os-phase11.md") if (ROOT / "docs" / "quiet-creative-os-phase11.md").exists() else ""
    handoff = read("REVIEW_HANDOFF.md") if (ROOT / "REVIEW_HANDOFF.md").exists() else ""

    canvas_route = route_body(routes, "canvas")
    if 'kind: "native-canvas"' not in canvas_route:
        fail("Canvas route must remain native in Phase 11")
    if "src:" in canvas_route or "static/canvas.html" in canvas_route:
        fail("Canvas route must not load static/canvas.html in Phase 11")
    if "static/canvas.html" in canvas or "qc-embedded-frame" in canvas or "<iframe" in canvas:
        fail("Phase 11 Canvas workspace must not reference or render static/canvas.html")

    for needle in [
        "apiConfig={apiConfig}",
        "providerStatus={providerStatus}",
    ]:
        if needle not in app:
            fail(f"App shell missing Phase 11 Canvas provider bridge: {needle}")

    for needle in [
        "CanvasImageTaskCreateResponse",
        "CanvasImageTaskStatus",
        "createCanvasImageTask",
        "getCanvasImageTask",
        '"/api/canvas-image-tasks"',
        "/api/canvas-image-tasks/${encodeURIComponent(taskId)}",
    ]:
        if needle not in api:
            fail(f"API helper missing Phase 11 Canvas image task behavior: {needle}")

    for needle in [
        "CanvasExecutionContext",
        "buildExecutionContext",
        "runSelectedCanvasNode",
        "waitForCanvasImageTask",
        "insertExecutionOutputNode",
        "createCanvasImageTask",
        "getCanvasImageTask",
        "reference_images",
        "Run selected",
        "Image execution",
        "executionStatus",
        "executionTaskId",
        "executionError",
        "source_node_id",
        "task_id",
        "Canvas image execution",
        "base_updated_at",
        "nodes",
        "connections",
        "viewport",
        "logs",
        "settings",
    ]:
        if needle not in canvas:
            fail(f"Native Canvas missing Phase 11 execution behavior: {needle}")

    for needle in [
        "qc-canvas-execution",
        "qc-canvas-execution-grid",
        "qc-canvas-execution-state",
        "qc-canvas-execution-output",
    ]:
        if needle not in canvas_css:
            fail(f"Canvas CSS missing Phase 11 execution layout: {needle}")

    for needle in [
        "executionStatus",
        "executionTaskId",
        "executionProvider",
        "executionModel",
        "executionLastUrl",
        "Execute",
    ]:
        if needle not in rail:
            fail(f"Creation Rail missing Phase 11 Canvas execution context: {needle}")

    for needle in [
        "@app.post(\"/api/canvas-image-tasks\")",
        "@app.get(\"/api/canvas-image-tasks/{task_id}\")",
        "OnlineImageRequest",
    ]:
        if needle not in main_py:
            fail(f"Backend missing existing Canvas image task endpoint used by Phase 11: {needle}")

    for needle in ["Legacy Canvas", "/app/legacy-canvas"]:
        for path in frontend_files():
            text = path.read_text(encoding="utf-8", errors="ignore")
            if needle in text:
                fail(f"Visible Legacy Canvas navigation must not exist: {path.relative_to(ROOT)} contains {needle}")

    canvas_status = subprocess.run(
        ["git", "status", "--porcelain", "--", "static/canvas.html"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if canvas_status.stdout.strip():
        fail("static/canvas.html is modified; Phase 11 must preserve it unchanged")

    for needle in [
        "Native Canvas Image Execution",
        "/app/canvas remains native",
        "/api/canvas-image-tasks",
        "no backend API schema changes",
        "static/canvas.html remains unchanged",
        "unknown node fields survive",
        "output nodes",
        "Video, LLM, ComfyUI workflow, and complex graph execution remain deferred",
    ]:
        if needle not in docs + handoff:
            fail(f"Phase 11 documentation/handoff missing required note: {needle}")


def check_quiet_creative_phase12_angle() -> None:
    routes = read("frontend/src/app/routes.tsx")
    app = read("frontend/src/app/App.tsx")
    api = read("frontend/src/lib/api.ts")
    rail = read("frontend/src/components/creation-rail/CreationRail.tsx")
    angle = read("frontend/src/features/angle/AngleWorkspace.tsx")
    angle_css = read("frontend/src/features/angle/angle.css")
    docs = read("docs/quiet-creative-os-phase12.md") if (ROOT / "docs" / "quiet-creative-os-phase12.md").exists() else ""
    remaining = read("docs/quiet-creative-os-remaining-migrations-plan.md") if (ROOT / "docs" / "quiet-creative-os-remaining-migrations-plan.md").exists() else ""
    handoff = read("REVIEW_HANDOFF.md") if (ROOT / "REVIEW_HANDOFF.md").exists() else ""

    angle_route = route_body(routes, "angle")
    if 'kind: "native-angle"' not in angle_route:
        fail("Angle route must be native in Phase 12")
    if "src:" in angle_route or "static/angle.html" in angle_route:
        fail("Angle route must not load static/angle.html in Phase 12")

    for route_id, kind in [
        ("zimage", "native-generate"),
        ("enhance", "native-enhance"),
        ("klein", "native-edit"),
        ("online", "native-online"),
        ("gpt-chat", "native-chat"),
        ("gallery", "native-gallery"),
        ("canvas", "native-canvas"),
    ]:
        route = route_body(routes, route_id)
        if f'kind: "{kind}"' not in route:
            fail(f"{route_id} must remain {kind} after Phase 12")
        if "src:" in route:
            fail(f"{route_id} must remain native and iframe-free after Phase 12")

    comfyui_route_allows_phase14(routes, "Phase 12")

    if 'activeRoute.kind === "native-angle"' not in app or "<AngleWorkspace" not in app:
        fail("App shell must render native Angle workspace for Angle route")
    for needle in ["angleTask", "angleOutputs", "angleContext"]:
        if needle not in app:
            fail(f"App shell missing Angle Creation Rail bridge: {needle}")

    if "static/angle.html" in angle or "qc-embedded-frame" in angle or "<iframe" in angle:
        fail("Native Angle workspace must not reference or render static/angle.html")

    for needle in [
        '"/api/upload"',
        '"/api/generate"',
        '"/api/history?type=angle"',
        '"/api/angle/generate"',
        '"/api/angle/poll_status"',
        "getAngleHistory",
        "generateAngleCloud",
        "pollAngleCloud",
        "WorkflowGeneratePayload",
        "AngleCloudGeneratePayload",
        "AngleCloudPollPayload",
    ]:
        if needle not in api:
            fail(f"Angle API helper missing existing endpoint contract: {needle}")

    for needle in [
        'workflow_json: "2511.json"',
        '"31": { image: uploadedComfyName',
        '"11": { prompt: cleanPrompt',
        '"14": { seed',
        'type: "angle"',
        "angle_engine_mode",
        "MODEL_SCOPE_ANGLE_MODEL",
        "Qwen/Qwen-Image-Edit-2511",
        "Local ComfyUI",
        "Cloud ModelScope",
        "Continue polling",
        "ModelScope key missing",
        "AngleRailContext",
        "onContextChange",
        "upsertGeneratedRecord",
    ]:
        if needle not in angle:
            fail(f"Native Angle workspace missing Phase 12 behavior: {needle}")

    for needle in [
        "qc-angle-workspace",
        "qc-angle-upload",
        "qc-angle-controls",
        "qc-angle-preview",
        "qc-angle-history",
    ]:
        if needle not in angle_css:
            fail(f"Angle CSS missing native workbench layout: {needle}")

    for needle in [
        "angleTask",
        "angleOutputs",
        "angleContext",
        "Angle source",
        "Rotation",
        "Pitch",
        "Distance",
    ]:
        if needle not in rail:
            fail(f"Creation Rail missing Phase 12 Angle context: {needle}")

    for needle in ["Legacy Angle", "/app/legacy-angle"]:
        for path in frontend_files():
            text = path.read_text(encoding="utf-8", errors="ignore")
            if needle in text:
                fail(f"Visible Legacy Angle navigation must not exist: {path.relative_to(ROOT)} contains {needle}")

    angle_status = subprocess.run(
        ["git", "status", "--porcelain", "--", "static/angle.html"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if angle_status.stdout.strip():
        fail("static/angle.html is modified; Phase 12 must preserve it unchanged")

    for needle in [
        "Native Angle Migration",
        "/app/angle is native",
        "direct /static/angle.html",
        "/api/angle/generate",
        "/api/angle/poll_status",
        "2511.json",
        "no backend API schema changes",
        "static/angle.html remains unchanged",
        "API / Models and ComfyUI remain embedded",
    ]:
        if needle not in docs + remaining + handoff:
            fail(f"Phase 12 documentation/handoff missing required note: {needle}")


def check_quiet_creative_phase13_api_models() -> None:
    routes = read("frontend/src/app/routes.tsx")
    app = read("frontend/src/app/App.tsx")
    api = read("frontend/src/lib/api.ts")
    rail = read("frontend/src/components/creation-rail/CreationRail.tsx")
    api_models = read("frontend/src/features/api-models/ApiModelsWorkspace.tsx")
    api_models_css = read("frontend/src/features/api-models/api-models.css")
    docs = read("docs/quiet-creative-os-phase13.md") if (ROOT / "docs" / "quiet-creative-os-phase13.md").exists() else ""
    remaining = read("docs/quiet-creative-os-remaining-migrations-plan.md") if (ROOT / "docs" / "quiet-creative-os-remaining-migrations-plan.md").exists() else ""
    handoff = read("REVIEW_HANDOFF.md") if (ROOT / "REVIEW_HANDOFF.md").exists() else ""

    api_route = route_body(routes, "api-config")
    if 'kind: "native-api-models"' not in api_route:
        fail("API / Models route must be native in Phase 13")
    if "src:" in api_route or "static/api-providers.html" in api_route:
        fail("API / Models route must not load static/api-providers.html in Phase 13")

    for route_id, kind in [
        ("zimage", "native-generate"),
        ("enhance", "native-enhance"),
        ("klein", "native-edit"),
        ("online", "native-online"),
        ("angle", "native-angle"),
        ("gpt-chat", "native-chat"),
        ("gallery", "native-gallery"),
        ("canvas", "native-canvas"),
    ]:
        route = route_body(routes, route_id)
        if f'kind: "{kind}"' not in route:
            fail(f"{route_id} must remain {kind} after Phase 13")
        if "src:" in route:
            fail(f"{route_id} must remain native and iframe-free after Phase 13")

    comfy_route = route_body(routes, "comfyui-settings")
    if 'kind: "native-comfyui"' not in comfy_route and ('kind: "embedded"' not in comfy_route or "/static/comfyui-settings.html" not in comfy_route):
        fail("ComfyUI must remain reachable after Phase 13")

    if 'activeRoute.kind === "native-api-models"' not in app or "<ApiModelsWorkspace" not in app:
        fail("App shell must render native API / Models workspace")
    for needle in ["apiModelsTask", "apiModelsContext", "onSaved={() => refreshApiConfig()}"]:
        if needle not in app:
            fail(f"App shell missing API / Models provider-status bridge: {needle}")

    if "static/api-providers.html" in api_models or "qc-embedded-frame" in api_models or "<iframe" in api_models:
        fail("Native API / Models workspace must not reference or render static/api-providers.html")
    if "console.log" in api_models or "console.error" in api_models:
        fail("Native API / Models workspace must not log provider secrets or payloads")

    for needle in [
        '"/api/providers"',
        '"/api/providers/test-connection"',
        '"/api/providers/fetch-models"',
        '"/api/providers/probe-async"',
        '"/api/config"',
        "getProviders",
        "saveProviders",
        "testProviderConnection",
        "fetchProviderModels",
        "probeProviderAsync",
        "ApiProviderSavePayload",
        "ProviderConnectionPayload",
    ]:
        if needle not in api:
            fail(f"API / Models helper missing existing provider endpoint contract: {needle}")

    for needle in [
        "getProviders",
        "saveProviders",
        "testProviderConnection",
        "fetchProviderModels",
        "probeProviderAsync",
        "clear_key",
        "key_preview",
        "has_key",
        "Leave blank to keep the saved key",
        "Saved keys stay hidden",
        "setNewKey(\"\")",
        "window.postMessage({ type: \"providers-changed\" }",
        "ModelScope LoRA JSON",
        "ms_loras",
        "ms_defaults_version",
        "onContextChange",
        "ApiModelsRailContext",
    ]:
        if needle not in api_models:
            fail(f"Native API / Models workspace missing Phase 13 behavior: {needle}")

    action_start = api_models.find("const runProviderAction")
    action_end = api_models.find("const addProvider", action_start)
    action_block = api_models[action_start:action_end] if action_start >= 0 and action_end > action_start else ""
    if not action_block:
        fail("Native API / Models workspace missing provider action flow")
    if 'setNewKey("")' in action_block:
        fail("Provider test/fetch/probe actions must preserve unsaved API key until save, clear, or provider switch")

    for needle in [
        "qc-api-models-workspace",
        "qc-api-provider-list",
        "qc-api-editor",
        "qc-api-diagnostics",
        "qc-api-action-stack",
    ]:
        if needle not in api_models_css:
            fail(f"API / Models CSS missing native workbench layout: {needle}")

    for needle in [
        "apiModelsTask",
        "apiModelsContext",
        "Provider setup",
        "Protocol",
        "Base URL",
        "LoRA",
        "API / Models",
    ]:
        if needle not in rail:
            fail(f"Creation Rail missing Phase 13 API / Models context: {needle}")

    for needle in ["Legacy API", "Legacy API / Models", "/app/legacy-api-models", "/app/legacy-api"]:
        for path in frontend_files():
            text = path.read_text(encoding="utf-8", errors="ignore")
            if needle in text:
                fail(f"Visible Legacy API / Models navigation must not exist: {path.relative_to(ROOT)} contains {needle}")

    static_status = subprocess.run(
        ["git", "status", "--porcelain", "--", "static/api-providers.html"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if static_status.stdout.strip():
        fail("static/api-providers.html is modified; Phase 13 must preserve it unchanged")

    for needle in [
        "Native API / Models Migration",
        "/app/api-models is native",
        "direct /static/api-providers.html",
        "/api/providers",
        "/api/providers/test-connection",
        "/api/providers/fetch-models",
        "/api/providers/probe-async",
        "hidden key behavior",
        "clear-key semantics",
        "no backend API schema changes",
        "static/api-providers.html remains unchanged",
        "ComfyUI",
    ]:
        if needle not in docs + remaining + handoff:
            fail(f"Phase 13 documentation/handoff missing required note: {needle}")


def check_quiet_creative_phase14_comfyui() -> None:
    routes = read("frontend/src/app/routes.tsx")
    app = read("frontend/src/app/App.tsx")
    api = read("frontend/src/lib/api.ts")
    rail = read("frontend/src/components/creation-rail/CreationRail.tsx")
    comfy = read("frontend/src/features/comfyui/ComfyUIWorkspace.tsx")
    comfy_css = read("frontend/src/features/comfyui/comfyui.css")
    docs = read("docs/quiet-creative-os-phase14.md") if (ROOT / "docs" / "quiet-creative-os-phase14.md").exists() else ""
    remaining = read("docs/quiet-creative-os-remaining-migrations-plan.md") if (ROOT / "docs" / "quiet-creative-os-remaining-migrations-plan.md").exists() else ""
    handoff = read("REVIEW_HANDOFF.md") if (ROOT / "REVIEW_HANDOFF.md").exists() else ""

    comfy_route = route_body(routes, "comfyui-settings")
    if 'kind: "native-comfyui"' not in comfy_route:
        fail("ComfyUI route must be native in Phase 14")
    if "src:" in comfy_route or "static/comfyui-settings.html" in comfy_route:
        fail("ComfyUI route must not load static/comfyui-settings.html in Phase 14")

    for route_id, kind in [
        ("zimage", "native-generate"),
        ("enhance", "native-enhance"),
        ("klein", "native-edit"),
        ("online", "native-online"),
        ("angle", "native-angle"),
        ("gpt-chat", "native-chat"),
        ("gallery", "native-gallery"),
        ("canvas", "native-canvas"),
        ("api-config", "native-api-models"),
    ]:
        route = route_body(routes, route_id)
        if f'kind: "{kind}"' not in route or "src:" in route:
            fail(f"{route_id} must remain {kind} and iframe-free after Phase 14")

    if 'activeRoute.kind === "native-comfyui"' not in app or "<ComfyUIWorkspace" not in app:
        fail("App shell must render native ComfyUI workspace")
    for needle in ["comfyUITask", "comfyUIContext", "setComfyUITask", "setComfyUIContext"]:
        if needle not in app:
            fail(f"App shell missing ComfyUI Creation Rail bridge: {needle}")

    for forbidden in ["static/comfyui-settings.html", "qc-embedded-frame", "<iframe", "EmbeddedWorkbench"]:
        if forbidden in comfy:
            fail(f"Native ComfyUI workspace must not reference embedded/static implementation: {forbidden}")

    for needle in [
        '"/api/comfyui/instances"',
        '"/api/workflows"',
        "/api/workflows/${encodeWorkflowName(name)}",
        "/api/workflows/${encodeWorkflowName(name)}/config",
        "/api/workflows/${encodeWorkflowName(name)}/run",
        "getComfyInstances",
        "saveComfyInstances",
        "getComfyWorkflows",
        "getComfyWorkflow",
        "uploadComfyWorkflow",
        "saveComfyWorkflowConfig",
        "deleteComfyWorkflow",
        "runComfyWorkflow",
        "encodeWorkflowName",
        '.split("/")',
        "encodeURIComponent",
    ]:
        if needle not in api:
            fail(f"ComfyUI helper missing existing endpoint/name-encoding contract: {needle}")

    for needle in [
        "ComfyUIRailContext",
        "ComfyUIWorkspace",
        "parseJsonObject",
        "class_type",
        "Upload workflow",
        "Confirm delete",
        "readOnly={builtin}",
        "custom-workflow-test",
        "test run from settings",
        "width: 1024",
        "height: 1024",
        "onContextChange",
    ]:
        if needle not in comfy:
            fail(f"Native ComfyUI workspace missing Phase 14 behavior: {needle}")

    for needle in [
        "qc-comfy-workspace",
        "qc-comfy-sidebar",
        "qc-comfy-editor",
        "qc-comfy-diagnostics",
        "qc-comfy-node-grid",
    ]:
        if needle not in comfy_css:
            fail(f"ComfyUI CSS missing native workbench layout: {needle}")

    for needle in ["comfyUITask", "comfyUIContext", "ComfyUI setup", "Instances", "Workflow", "Fields", "Nodes", "Test", "Outputs"]:
        if needle not in rail:
            fail(f"Creation Rail missing Phase 14 ComfyUI context: {needle}")

    for needle in ["Legacy ComfyUI", "/app/legacy-comfyui", "legacy-comfyui"]:
        for path in frontend_files():
            text = path.read_text(encoding="utf-8", errors="ignore")
            if needle in text:
                fail(f"Visible Legacy ComfyUI navigation must not exist: {path.relative_to(ROOT)} contains {needle}")

    static_status = subprocess.run(
        ["git", "status", "--porcelain", "--", "static/comfyui-settings.html"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if static_status.stdout.strip():
        fail("static/comfyui-settings.html is modified; Phase 14 must preserve it unchanged")

    for needle in [
        "Native ComfyUI Settings Migration",
        "/app/comfyui is native",
        "direct /static/comfyui-settings.html",
        "/api/comfyui/instances",
        "/api/workflows",
        "workflow name encoding",
        "custom-workflow-test",
        "no backend API schema changes",
        "static/comfyui-settings.html remains unchanged",
    ]:
        if needle not in docs + remaining + handoff:
            fail(f"Phase 14 documentation/handoff missing required note: {needle}")


def check_quiet_creative_phase15_canvas_asset_actions() -> None:
    routes = read("frontend/src/app/routes.tsx")
    app = read("frontend/src/app/App.tsx")
    api = read("frontend/src/lib/api.ts")
    rail = read("frontend/src/components/creation-rail/CreationRail.tsx")
    canvas = read("frontend/src/features/canvas/CanvasWorkspace.tsx")
    canvas_css = read("frontend/src/features/canvas/canvas.css")
    comfy = read("frontend/src/features/comfyui/ComfyUIWorkspace.tsx")
    main_py = read("main.py")
    docs = read("docs/quiet-creative-os-phase15.md") if (ROOT / "docs" / "quiet-creative-os-phase15.md").exists() else ""
    remaining = read("docs/quiet-creative-os-remaining-migrations-plan.md") if (ROOT / "docs" / "quiet-creative-os-remaining-migrations-plan.md").exists() else ""
    handoff = read("REVIEW_HANDOFF.md") if (ROOT / "REVIEW_HANDOFF.md").exists() else ""

    for route_id, kind in [
        ("zimage", "native-generate"),
        ("enhance", "native-enhance"),
        ("klein", "native-edit"),
        ("online", "native-online"),
        ("angle", "native-angle"),
        ("gpt-chat", "native-chat"),
        ("gallery", "native-gallery"),
        ("canvas", "native-canvas"),
        ("api-config", "native-api-models"),
        ("comfyui-settings", "native-comfyui"),
    ]:
        route = route_body(routes, route_id)
        if f'kind: "{kind}"' not in route or "src:" in route:
            fail(f"{route_id} must remain {kind} and iframe-free after Phase 15")

    canvas_route = route_body(routes, "canvas")
    if "static/canvas.html" in canvas_route:
        fail("Canvas route must not load static/canvas.html in Phase 15")
    if 'activeRoute.kind === "native-canvas"' not in app or "<CanvasWorkspace" not in app:
        fail("App shell must render native Canvas workspace after Phase 15")
    if "static/canvas.html" in canvas or "qc-embedded-frame" in canvas or "<iframe" in canvas:
        fail("Native Canvas workspace must remain iframe-free after Phase 15")

    for needle in [
        "CanvasAssetCheckResponse",
        "CanvasAssetDownloadPayload",
        "checkCanvasAssets",
        "downloadCanvasAssets",
        "canvasOutputDownloadUrl",
        '"/api/canvas-assets/check"',
        '"/api/canvas-assets/download"',
        "/api/download-output?url=${encodeURIComponent(url)}",
    ]:
        if needle not in api:
            fail(f"API helper missing Phase 15 Canvas asset endpoint reuse: {needle}")

    for needle in [
        "collectCanvasAssetItems",
        "collectCanvasNodeAssetItems",
        "outputUrlValue",
        "generatedOutputs",
        "videos",
        "isLocalCanvasAssetUrl",
        "checkCanvasAssetAvailability",
        "downloadAllCanvasAssets",
        "downloadSelectedCanvasAsset",
        "downloadCanvasAssetZip",
        "URL.createObjectURL",
        "URL.revokeObjectURL",
        "assetActionStatus",
        "downloadableAssetItems",
        "selectedAsset",
        "remote/data",
        "Check local assets",
        "Download all local",
        "Download selected asset",
        "canvasOutputDownloadUrl",
    ]:
        if needle not in canvas:
            fail(f"Native Canvas missing Phase 15 asset behavior: {needle}")

    for needle in [
        "qc-canvas-assets",
        "qc-canvas-asset-stats",
        "qc-canvas-asset-actions",
        "qc-canvas-asset-state",
        "qc-canvas-asset-selected",
    ]:
        if needle not in canvas_css:
            fail(f"Canvas CSS missing Phase 15 asset layout: {needle}")

    for needle in [
        "assetCount",
        "downloadableAssetCount",
        "selectedAssetName",
        "selectedAssetUrl",
        "assetActionStatus",
        "lastAssetActionStatus",
        "Asset action",
        "Asset state",
    ]:
        if needle not in rail + canvas + app:
            fail(f"Creation Rail missing Phase 15 Canvas asset context: {needle}")

    for needle in [
        "selectedNameRef",
        "detailRef",
        "selectedNameRef.current",
        "detailRef.current",
        "loadWorkflows(response.name)",
        'setStatusText("Workflow uploaded.")',
        "Workflow deleted.",
    ]:
        if needle not in comfy:
            fail(f"ComfyUI P3 cleanup missing reload/status guard: {needle}")
    if "}, [selectWorkflow, selectedName]);" in comfy:
        fail("ComfyUI loadWorkflows must not depend on selectedName after Phase 15")

    for needle in [
        "class CanvasAssetCheckRequest(BaseModel):\n    urls: List[str] = []",
        "class CanvasAssetDownloadRequest(BaseModel):\n    urls: List[str] = []\n    filename: str = \"canvas-assets.zip\"",
        "@app.post(\"/api/canvas-assets/check\")",
        "@app.post(\"/api/canvas-assets/download\")",
        "@app.get(\"/api/download-output\")",
    ]:
        if needle not in main_py:
            fail(f"Existing Canvas asset backend contract missing or schema changed: {needle}")

    for needle in ["Legacy Canvas", "/app/legacy-canvas", "Legacy ComfyUI", "/app/legacy-comfyui", "legacy-comfyui"]:
        for path in frontend_files():
            text = path.read_text(encoding="utf-8", errors="ignore")
            if needle in text:
                fail(f"Visible legacy navigation must not exist after Phase 15: {path.relative_to(ROOT)} contains {needle}")

    for static_path in ["static/canvas.html", "static/comfyui-settings.html"]:
        static_status = subprocess.run(
            ["git", "status", "--porcelain", "--", static_path],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        if static_status.stdout.strip():
            fail(f"{static_path} is modified; Phase 15 must preserve it unchanged")

    for screenshot in [
        "docs/quiet-creative-os/screenshots/phase15-canvas-assets-desktop-light.png",
        "docs/quiet-creative-os/screenshots/phase15-canvas-assets-desktop-dark.png",
        "docs/quiet-creative-os/screenshots/phase15-canvas-assets-mobile-light.png",
        "docs/quiet-creative-os/screenshots/phase15-canvas-assets-mobile-dark.png",
    ]:
        path = ROOT / screenshot
        if not path.exists() or path.stat().st_size < 1024:
            fail(f"Phase 15 screenshot missing or empty: {screenshot}")

    for needle in [
        "Quiet Creative OS Phase 15",
        "Canvas Asset Actions",
        "ComfyUI P3 cleanup",
        "phase15-canvas-assets-desktop-light.png",
        "phase15-canvas-assets-desktop-dark.png",
        "phase15-canvas-assets-mobile-light.png",
        "phase15-canvas-assets-mobile-dark.png",
        "/api/canvas-assets/check",
        "/api/canvas-assets/download",
        "/api/download-output",
        "no backend API schema changes",
        "static/canvas.html remains unchanged",
        "static/comfyui-settings.html remains unchanged",
        "LLM, video, and custom workflow Canvas execution remain deferred",
    ]:
        if needle not in docs + remaining + handoff:
            fail(f"Phase 15 documentation/handoff missing required note: {needle}")


def check_quiet_creative_phase16_canvas_connection_ux() -> None:
    routes = read("frontend/src/app/routes.tsx")
    app = read("frontend/src/app/App.tsx")
    canvas = read("frontend/src/features/canvas/CanvasWorkspace.tsx")
    canvas_css = read("frontend/src/features/canvas/canvas.css")
    rail = read("frontend/src/components/creation-rail/CreationRail.tsx")
    api = read("frontend/src/lib/api.ts")
    docs = read("docs/quiet-creative-os-phase16.md") if (ROOT / "docs" / "quiet-creative-os-phase16.md").exists() else ""
    completion_plan = read("docs/quiet-creative-os-canvas-completion-plan.md") if (ROOT / "docs" / "quiet-creative-os-canvas-completion-plan.md").exists() else ""
    remaining = read("docs/quiet-creative-os-remaining-migrations-plan.md") if (ROOT / "docs" / "quiet-creative-os-remaining-migrations-plan.md").exists() else ""
    handoff = read("REVIEW_HANDOFF.md") if (ROOT / "REVIEW_HANDOFF.md").exists() else ""

    canvas_route = route_body(routes, "canvas")
    if 'kind: "native-canvas"' not in canvas_route or "src:" in canvas_route or "static/canvas.html" in canvas_route:
        fail("/app/canvas must remain native and iframe-free after Phase 16")
    if 'activeRoute.kind === "native-canvas"' not in app or "<CanvasWorkspace" not in app:
        fail("App shell must render native Canvas workspace after Phase 16")
    if "static/canvas.html" in canvas or "qc-embedded-frame" in canvas or "<iframe" in canvas:
        fail("Native Canvas workspace must stay iframe-free after Phase 16")

    for needle in [
        "type CanvasNodeSemanticKind",
        "interface CanvasLinkPreview",
        "connectionSelectionKey",
        "connectionSemanticWarning",
        "Group-to-group links are allowed now",
        "boardPointFromClient",
        "inputHandleTargetFromPoint",
        "startConnectionDrag",
        "drag.kind === \"link\"",
        "createLink(drag.fromId, target.targetId, \"drag\")",
        "Duplicate connection ignored.",
        "A node cannot connect to itself.",
        "selectedConnectionKey",
        "selectConnection",
        "deleteSelectedConnection",
        "Delete selected link",
        "event.key === \"Delete\"",
        "event.key === \"Backspace\"",
        "data-canvas-handle=\"input\"",
        "data-canvas-handle=\"output\"",
        "qc-canvas-link-preview",
        "qc-canvas-link-hit",
        "pendingConnectionState",
        "lastConnectionAction",
        "selectedConnectionLabel",
        "connections,",
    ]:
        if needle not in canvas:
            fail(f"Native Canvas missing Phase 16 connection UX path: {needle}")

    for needle in [
        "qc-canvas-connection-handle",
        "qc-canvas-connection-handle--input",
        "qc-canvas-connection-handle--output",
        "qc-canvas-link-preview",
        "qc-canvas-link-hit",
        "qc-canvas-link-path",
        "qc-canvas-link.is-selected",
        "qc-canvas-link-selection",
        "qc-canvas-link-warning",
    ]:
        if needle not in canvas_css:
            fail(f"Canvas CSS missing Phase 16 connection styling: {needle}")

    for needle in [
        "selectedConnectionId",
        "selectedConnectionLabel",
        "pendingConnectionState",
        "lastConnectionAction",
        "connectionWarning",
        "Selected link",
        "Link action",
    ]:
        if needle not in rail + canvas + app:
            fail(f"Creation Rail missing Phase 16 Canvas connection context: {needle}")

    for needle in [
        "export type CanvasConnection = Record<string, unknown> & {",
        "connections: CanvasConnection[]",
    ]:
        if needle not in api:
            fail(f"Canvas connection API typing must remain save-compatible after Phase 16: {needle}")

    static_status = subprocess.run(
        ["git", "status", "--porcelain", "--", "static/canvas.html"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if static_status.stdout.strip():
        fail("static/canvas.html is modified; Phase 16 must preserve it unchanged")

    for screenshot in [
        "docs/quiet-creative-os/screenshots/phase16-canvas-links-desktop-light.png",
        "docs/quiet-creative-os/screenshots/phase16-canvas-links-desktop-dark.png",
        "docs/quiet-creative-os/screenshots/phase16-canvas-links-mobile-light.png",
        "docs/quiet-creative-os/screenshots/phase16-canvas-links-mobile-dark.png",
        "docs/quiet-creative-os/screenshots/phase16-canvas-link-selected-desktop.png",
    ]:
        path = ROOT / screenshot
        if not path.exists() or path.stat().st_size < 1024:
            fail(f"Phase 16 screenshot missing or empty: {screenshot}")

    for needle in [
        "Quiet Creative OS Phase 16",
        "Canvas Connection UX Foundation",
        "visible node connection handles",
        "drag-to-connect",
        "selected link can be deleted",
        "existing saved {from,to} connections render",
        "Phase 16 stores only compatible minimum data",
        "typed ports remain future direction",
        "Phase 15 asset actions remain preserved",
        "Canvas Completion Plan",
        "docs/quiet-creative-os-canvas-completion-plan.md",
        "static/canvas.html remains unchanged",
        "no backend API schema changes",
        "phase16-canvas-links-desktop-light.png",
        "phase16-canvas-links-desktop-dark.png",
        "phase16-canvas-links-mobile-light.png",
        "phase16-canvas-links-mobile-dark.png",
        "phase16-canvas-link-selected-desktop.png",
    ]:
        if needle not in docs + remaining + handoff:
            fail(f"Phase 16 documentation/handoff missing required note: {needle}")

    for needle in [
        "Quiet Creative OS Canvas Completion Plan",
        "static/canvas.html",
        "frontend/src/features/canvas/CanvasWorkspace.tsx",
        "main.py",
        "Already Native",
        "Native Complete Surface",
        "Day-1 Native Requirements",
        "Later Hardening",
        "Endpoint And Payload Mapping",
        "LLM",
        "Video",
        "ComfyUI Text / Enhance / Edit / Workflow",
        "Image Generation",
        "Upscale",
        "Completed Phase 17-20 Order",
        "Compatibility Risks",
        "unknown node fields",
        "connections",
        "/api/canvas-llm",
        "/api/canvas-video",
        "/api/generate",
        "/api/canvas-image-tasks",
        "/api/ms/generate",
        "/api/angle/generate",
    ]:
        if needle not in completion_plan:
            fail(f"Canvas Completion Plan missing required source-inspection note: {needle}")


def check_quiet_creative_phase17_canvas_execution_data_layer() -> None:
    routes = read("frontend/src/app/routes.tsx")
    app = read("frontend/src/app/App.tsx")
    canvas = read("frontend/src/features/canvas/CanvasWorkspace.tsx")
    canvas_css = read("frontend/src/features/canvas/canvas.css")
    rail = read("frontend/src/components/creation-rail/CreationRail.tsx")
    api = read("frontend/src/lib/api.ts")
    docs = read("docs/quiet-creative-os-phase17.md") if (ROOT / "docs" / "quiet-creative-os-phase17.md").exists() else ""
    completion_plan = read("docs/quiet-creative-os-canvas-completion-plan.md") if (ROOT / "docs" / "quiet-creative-os-canvas-completion-plan.md").exists() else ""
    remaining = read("docs/quiet-creative-os-remaining-migrations-plan.md") if (ROOT / "docs" / "quiet-creative-os-remaining-migrations-plan.md").exists() else ""
    handoff = read("REVIEW_HANDOFF.md") if (ROOT / "REVIEW_HANDOFF.md").exists() else ""

    canvas_route = route_body(routes, "canvas")
    if 'kind: "native-canvas"' not in canvas_route or "src:" in canvas_route or "static/canvas.html" in canvas_route:
        fail("/app/canvas must remain native and iframe-free after Phase 17")
    if 'activeRoute.kind === "native-canvas"' not in app or "<CanvasWorkspace" not in app:
        fail("App shell must render native Canvas workspace after Phase 17")
    if "static/canvas.html" in canvas or "qc-embedded-frame" in canvas or "<iframe" in canvas:
        fail("Native Canvas workspace must stay iframe-free after Phase 17")

    for needle in [
        "type CanvasExecutionNodeKind",
        "interface CanvasExecutionGraphContext",
        "interface CanvasExecutionRef",
        "collectCanvasExecutionContext",
        "connectionNodePairs",
        "collectNodeTextRefs",
        "collectNodeMediaRefs",
        "promptRefs",
        "imageRefs",
        "videoRefs",
        "textRefs",
        "upstreamCount",
        "downstreamCount",
        "graphInputWarnings",
        "executionDataReady",
        "selectedGraphContext",
        "CanvasExecutionDataPanel",
        "Execution data",
        "Linked image refs",
        "Linked video refs",
        "Linked text / LLM outputs",
        "supportsNativeImageExecution",
        "Use LLM execution for LLM nodes.",
        "Use video execution for video nodes.",
    ]:
        if needle not in canvas:
            fail(f"Native Canvas missing Phase 17 execution data layer: {needle}")

    for needle in [
        "addLLMNode",
        "addVideoNode",
        "addWorkflowNode",
        "llmProvider",
        "systemPrompt",
        "outputText",
        "providerId",
        "aspectRatio",
        "comfyWorkflow",
        "comfyParams",
        "LLM node",
        "Video node",
        "Workflow node",
    ]:
        if needle not in canvas:
            fail(f"Native Canvas missing Phase 17 execution node surface: {needle}")

    for needle in [
        "qc-canvas-execution-data",
        "qc-canvas-execution-stats",
        "qc-canvas-execution-ref-list",
        "qc-canvas-execution-warnings",
        "qc-canvas-node-settings",
        "qc-canvas-node-exec-card",
        "qc-canvas-video-grid",
    ]:
        if needle not in canvas_css:
            fail(f"Canvas CSS missing Phase 17 execution data styling: {needle}")

    for needle in [
        "selectedExecutionNodeKind",
        "graphPromptCount",
        "graphImageRefCount",
        "graphVideoRefCount",
        "graphTextRefCount",
        "graphInputWarnings",
        "executionDataReady",
        "Exec data",
        "Exec kind",
        "Input warning",
    ]:
        if needle not in rail + canvas + app:
            fail(f"Creation Rail missing Phase 17 Canvas execution data context: {needle}")

    for forbidden in [
        '"/api/canvas-video"',
        '"/api/workflows/',
        "runComfyWorkflow",
        "canvasVideo",
    ]:
        if forbidden in canvas:
            fail(f"Phase 17 native Canvas must not call real video/custom workflow execution endpoint yet: {forbidden}")

    for needle in [
        "export type CanvasNode = Record<string, unknown> & {",
        "export type CanvasConnection = Record<string, unknown> & {",
        "nodes: CanvasNode[]",
        "connections: CanvasConnection[]",
    ]:
        if needle not in api:
            fail(f"Canvas API typing must remain save-compatible after Phase 17: {needle}")

    static_status = subprocess.run(
        ["git", "status", "--porcelain", "--", "static/canvas.html"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if static_status.stdout.strip():
        fail("static/canvas.html is modified; Phase 17 must preserve it unchanged")

    for screenshot in [
        "docs/quiet-creative-os/screenshots/phase17-canvas-execution-data-desktop-light.png",
        "docs/quiet-creative-os/screenshots/phase17-canvas-execution-data-desktop-dark.png",
        "docs/quiet-creative-os/screenshots/phase17-canvas-execution-data-mobile-light.png",
        "docs/quiet-creative-os/screenshots/phase17-canvas-execution-data-mobile-dark.png",
        "docs/quiet-creative-os/screenshots/phase17-canvas-node-types-desktop.png",
    ]:
        path = ROOT / screenshot
        if not path.exists() or path.stat().st_size < 1024:
            fail(f"Phase 17 screenshot missing or empty: {screenshot}")

    for needle in [
        "Quiet Creative OS Phase 17",
        "Native Canvas Execution Node Data Layer",
        "execution context collector",
        "LLM node",
        "Video node",
        "Workflow node",
        "execution preview/debug panel",
        "selected execution node kind",
        "graph input warnings",
        "no real LLM/video/workflow execution",
        "Phase 15 asset actions remain preserved",
        "Phase 16 connection UX remains preserved",
        "static/canvas.html remains unchanged",
        "no backend API schema changes",
        "phase17-canvas-execution-data-desktop-light.png",
        "phase17-canvas-execution-data-desktop-dark.png",
        "phase17-canvas-execution-data-mobile-light.png",
        "phase17-canvas-execution-data-mobile-dark.png",
        "phase17-canvas-node-types-desktop.png",
    ]:
        if needle not in docs + remaining + handoff:
            fail(f"Phase 17 documentation/handoff missing required note: {needle}")

    for needle in [
        "Phase 17 completed the native execution-node data layer",
        "Phase 18: Native image generator and ComfyUI text/enhance/edit/upscale",
        "Phase 20 completed Native Canvas Video Nodes",
        "unknown node fields",
        "save/load compatibility",
    ]:
        if needle not in completion_plan:
            fail(f"Canvas Completion Plan missing Phase 17 update: {needle}")


def check_quiet_creative_phase18_canvas_generator_comfy_execution() -> None:
    routes = read("frontend/src/app/routes.tsx")
    app = read("frontend/src/app/App.tsx")
    canvas = read("frontend/src/features/canvas/CanvasWorkspace.tsx")
    canvas_css = read("frontend/src/features/canvas/canvas.css")
    rail = read("frontend/src/components/creation-rail/CreationRail.tsx")
    api = read("frontend/src/lib/api.ts")
    main_py = read("main.py")
    docs = read("docs/quiet-creative-os-phase18.md") if (ROOT / "docs" / "quiet-creative-os-phase18.md").exists() else ""
    completion_plan = read("docs/quiet-creative-os-canvas-completion-plan.md") if (ROOT / "docs" / "quiet-creative-os-canvas-completion-plan.md").exists() else ""
    remaining = read("docs/quiet-creative-os-remaining-migrations-plan.md") if (ROOT / "docs" / "quiet-creative-os-remaining-migrations-plan.md").exists() else ""
    handoff = read("REVIEW_HANDOFF.md") if (ROOT / "REVIEW_HANDOFF.md").exists() else ""

    for route_id, kind in [
        ("zimage", "native-generate"),
        ("enhance", "native-enhance"),
        ("klein", "native-edit"),
        ("online", "native-online"),
        ("angle", "native-angle"),
        ("gpt-chat", "native-chat"),
        ("gallery", "native-gallery"),
        ("canvas", "native-canvas"),
        ("api-config", "native-api-models"),
        ("comfyui-settings", "native-comfyui"),
    ]:
        route = route_body(routes, route_id)
        if f'kind: "{kind}"' not in route or "src:" in route:
            fail(f"{route_id} must remain {kind} and iframe-free after Phase 18")

    canvas_route = route_body(routes, "canvas")
    if "static/canvas.html" in canvas_route:
        fail("Canvas route must not load static/canvas.html in Phase 18")
    if 'activeRoute.kind === "native-canvas"' not in app or "<CanvasWorkspace" not in app:
        fail("App shell must render native Canvas workspace after Phase 18")
    if "static/canvas.html" in canvas or "qc-embedded-frame" in canvas or "<iframe" in canvas:
        fail("Native Canvas workspace must stay iframe-free after Phase 18")

    for needle in [
        "CanvasWorkflowGeneratePayload",
        "generateCanvasWorkflow",
        "uploadCanvasUrlToComfy",
        "createCanvasImageTask",
        "getCanvasImageTask",
        '"/api/generate"',
        '"/api/upload"',
        '"/api/canvas-image-tasks"',
    ]:
        if needle not in api:
            fail(f"API helper missing Phase 18 endpoint reuse: {needle}")

    for needle in [
        "addGeneratorNode",
        "runSelectedWorkflowNode",
        "runCanvasGeneratorNode",
        "runCanvasComfyNode",
        "insertOrUpdateWorkflowOutputNode",
        "workflowGraphRunContext",
        "canvasGeneratorSize",
        "canvasWorkflowMode",
        "generateCanvasWorkflow",
        "uploadCanvasUrlToComfy",
        "createCanvasImageTask",
        "reference_images",
        "generatedOutputs",
        "runStatus",
        "runError",
        "task_id",
        "Workflow execution",
        "Run workflow node",
        "Z-Image.json",
        "Z-Image-Enhance.json",
        "Flux2-Klein.json",
        "custom-workflow",
        "Use Workflow execution for generator and ComfyUI nodes.",
    ]:
        if needle not in canvas:
            fail(f"Native Canvas missing Phase 18 generator/Comfy execution behavior: {needle}")

    for needle in [
        "qc-canvas-workflow-run-stats",
        "qc-canvas-workflow-execution",
        "qc-canvas-execution-state",
        "qc-canvas-execution-output",
    ]:
        if needle not in canvas + canvas_css:
            fail(f"Canvas UI missing Phase 18 workflow execution styling/surface: {needle}")

    for needle in [
        "selectedCanvasExecutionMode",
        "selectedCanvasWorkflow",
        "selectedCanvasRunStatus",
        "selectedCanvasRunError",
        "selectedCanvasOutputCount",
        "selectedCanvasLastOutput",
        "Run mode",
        "Run state",
        "Workflow",
    ]:
        if needle not in rail + canvas + app:
            fail(f"Creation Rail missing Phase 18 Canvas execution context: {needle}")

    for forbidden in [
        '"/api/canvas-video"',
        "canvasVideo",
    ]:
        if forbidden in canvas:
            fail(f"Phase 18/19 must not migrate video Canvas execution yet: {forbidden}")

    for needle in [
        "class GenerateRequest(BaseModel):",
        "@app.post(\"/api/upload\")",
        "@app.post(\"/api/canvas-image-tasks\")",
        "@app.get(\"/api/canvas-image-tasks/{task_id}\")",
        "@app.post(\"/api/generate\")",
    ]:
        if needle not in main_py:
            fail(f"Existing backend execution contract missing or schema changed: {needle}")

    for static_path in ["static/canvas.html", "static/comfyui-settings.html"]:
        static_status = subprocess.run(
            ["git", "status", "--porcelain", "--", static_path],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        if static_status.stdout.strip():
            fail(f"{static_path} is modified; Phase 18 must preserve it unchanged")

    for screenshot in [
        "docs/quiet-creative-os/screenshots/phase18-canvas-generator-desktop-light.png",
        "docs/quiet-creative-os/screenshots/phase18-canvas-generator-desktop-dark.png",
        "docs/quiet-creative-os/screenshots/phase18-canvas-generator-mobile-light.png",
        "docs/quiet-creative-os/screenshots/phase18-canvas-generator-mobile-dark.png",
        "docs/quiet-creative-os/screenshots/phase18-canvas-workflow-result-desktop.png",
        "docs/quiet-creative-os/screenshots/phase18-canvas-workflow-error-desktop.png",
    ]:
        path = ROOT / screenshot
        if not path.exists() or path.stat().st_size < 1024:
            fail(f"Phase 18 screenshot missing or empty: {screenshot}")

    for needle in [
        "Quiet Creative OS Phase 18",
        "Native Canvas Generator/ComfyUI Execution MVP",
        "generator nodes",
        "ComfyUI text/enhance/edit/custom workflow",
        "/api/canvas-image-tasks",
        "/api/generate",
        "/api/upload",
        "generatedOutputs",
        "runStatus",
        "runError",
        "save remains explicit",
        "LLM/video execution remains deferred",
        "Phase 15 asset actions remain preserved",
        "Phase 16 connection UX remains preserved",
        "Phase 17 execution preview remains preserved",
        "static/canvas.html remains unchanged",
        "no backend API schema changes",
        "phase18-canvas-generator-desktop-light.png",
        "phase18-canvas-generator-desktop-dark.png",
        "phase18-canvas-generator-mobile-light.png",
        "phase18-canvas-generator-mobile-dark.png",
        "phase18-canvas-workflow-result-desktop.png",
        "phase18-canvas-workflow-error-desktop.png",
    ]:
        if needle not in docs + remaining + handoff:
            fail(f"Phase 18 documentation/handoff missing required note: {needle}")

    for needle in [
        "Phase 18 completed the native Generator/ComfyUI execution slice",
        "Phase 19: Native LLM nodes",
        "image, workflow, LLM, video, and ModelScope execution now all run",
        "Custom workflow fields render from `/api/workflows`",
        "unknown node fields",
        "save/load compatibility",
    ]:
        if needle not in completion_plan:
            fail(f"Canvas Completion Plan missing Phase 18 update: {needle}")


def check_quiet_creative_phase19_canvas_llm_execution() -> None:
    routes = read("frontend/src/app/routes.tsx")
    app = read("frontend/src/app/App.tsx")
    canvas = read("frontend/src/features/canvas/CanvasWorkspace.tsx")
    canvas_css = read("frontend/src/features/canvas/canvas.css")
    rail = read("frontend/src/components/creation-rail/CreationRail.tsx")
    api = read("frontend/src/lib/api.ts")
    main_py = read("main.py")
    docs = read("docs/quiet-creative-os-phase19.md") if (ROOT / "docs" / "quiet-creative-os-phase19.md").exists() else ""
    phase20_exists = (ROOT / "docs" / "quiet-creative-os-phase20.md").exists()
    completion_plan = read("docs/quiet-creative-os-canvas-completion-plan.md") if (ROOT / "docs" / "quiet-creative-os-canvas-completion-plan.md").exists() else ""
    remaining = read("docs/quiet-creative-os-remaining-migrations-plan.md") if (ROOT / "docs" / "quiet-creative-os-remaining-migrations-plan.md").exists() else ""
    handoff = read("REVIEW_HANDOFF.md") if (ROOT / "REVIEW_HANDOFF.md").exists() else ""

    canvas_route = route_body(routes, "canvas")
    if 'kind: "native-canvas"' not in canvas_route or "src:" in canvas_route or "static/canvas.html" in canvas_route:
        fail("/app/canvas must remain native and iframe-free after Phase 19")
    if 'activeRoute.kind === "native-canvas"' not in app or "<CanvasWorkspace" not in app:
        fail("App shell must render native Canvas workspace after Phase 19")
    if "static/canvas.html" in canvas or "qc-embedded-frame" in canvas or "<iframe" in canvas:
        fail("Native Canvas workspace must stay iframe-free after Phase 19")

    for needle in [
        "CanvasLLMMessage",
        "CanvasLLMPayload",
        "CanvasLLMResponse",
        "runCanvasLLM",
        '"/api/canvas-llm"',
    ]:
        if needle not in api:
            fail(f"API helper missing Phase 19 Canvas LLM endpoint reuse: {needle}")

    for needle in [
        "runSelectedLLMNode",
        "llmGraphRunContext",
        "canvasLLMMode",
        "normalizeCanvasLLMMessages",
        "runCanvasLLM",
        "Canvas LLM execution",
        "LLM execution",
        "Run LLM node",
        "Selected LLM mode",
        "Selected LLM chat input",
        "system_prompt",
        "messages: history",
        "images: context.images",
        "outputText",
        "messages",
        "runStatus",
        "runError",
        "raw_usage",
        "Canvas LLM output updated",
    ]:
        if needle not in canvas:
            fail(f"Native Canvas missing Phase 19 LLM execution behavior: {needle}")

    for needle in [
        'const llmOutputText = kind === "llm" ? stringField(node.outputText) : "";',
        'const fields: Array<[string, unknown]> = kind === "llm" && llmOutputText',
        '[["outputText", node.outputText]]',
    ]:
        if needle not in canvas:
            fail(f"Phase 19 LLM outputText downstream precedence guard missing: {needle}")

    if not phase20_exists:
        for forbidden in [
            '"/api/canvas-video"',
            "runCanvasVideo",
            "canvasVideo",
        ]:
            if forbidden in canvas + api:
                fail(f"Phase 19 must not migrate Canvas video execution yet: {forbidden}")

    for needle in [
        "findNonOverlappingOutputPosition",
        "rectForNode",
        "rectsOverlap",
        "insertExecutionOutputNode",
        "insertOrUpdateWorkflowOutputNode",
    ]:
        if needle not in canvas:
            fail(f"Phase 19 output-node overlap guard missing Canvas implementation: {needle}")
    if canvas.count("findNonOverlappingOutputPosition(") < 3:
        fail("Phase 19 output-node overlap fix must be used by both image and workflow output insertion paths")

    for needle in [
        "qc-canvas-llm-execution",
        "qc-canvas-llm-run-stats",
        "qc-canvas-llm-output",
        "qc-canvas-execution-state",
    ]:
        if needle not in canvas + canvas_css:
            fail(f"Canvas UI missing Phase 19 LLM execution styling/surface: {needle}")

    for needle in [
        "selectedLLMMode",
        "selectedLLMRunStatus",
        "selectedLLMRunError",
        "selectedLLMModel",
        "selectedLLMInputCount",
        "selectedLLMOutputPreview",
        "LLM mode",
        "LLM state",
        "LLM model",
        "LLM inputs",
        "LLM output",
    ]:
        if needle not in rail + canvas + app:
            fail(f"Creation Rail missing Phase 19 Canvas LLM context: {needle}")

    for needle in [
        "class CanvasLLMRequest(BaseModel):",
        "message: str = Field(min_length=1, max_length=20000)",
        "system_prompt: str",
        "messages: List[Dict[str, str]]",
        "images: List[str]",
        "provider: str",
        "@app.post(\"/api/canvas-llm\")",
    ]:
        if needle not in main_py:
            fail(f"Existing Canvas LLM backend contract missing or schema changed: {needle}")

    for static_path in ["static/canvas.html", "static/comfyui-settings.html"]:
        static_status = subprocess.run(
            ["git", "status", "--porcelain", "--", static_path],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        if static_status.stdout.strip():
            fail(f"{static_path} is modified; Phase 19 must preserve it unchanged")

    for screenshot in [
        "docs/quiet-creative-os/screenshots/phase19-canvas-llm-desktop-light.png",
        "docs/quiet-creative-os/screenshots/phase19-canvas-llm-desktop-dark.png",
        "docs/quiet-creative-os/screenshots/phase19-canvas-llm-mobile-light.png",
        "docs/quiet-creative-os/screenshots/phase19-canvas-llm-mobile-dark.png",
        "docs/quiet-creative-os/screenshots/phase19-canvas-llm-output-desktop.png",
        "docs/quiet-creative-os/screenshots/phase19-canvas-output-placement-regression.png",
    ]:
        path = ROOT / screenshot
        if not path.exists() or path.stat().st_size < 1024:
            fail(f"Phase 19 screenshot missing or empty: {screenshot}")

    for needle in [
        "Quiet Creative OS Phase 19",
        "Native Canvas LLM Nodes",
        "Phase 18 P2 output-node overlap",
        "deterministic non-overlapping position",
        "LLM outputText-only downstream",
        "/api/canvas-llm",
        "direct text",
        "upstream prompt/text context",
        "outputText",
        "messages",
        "runStatus",
        "runError",
        "LLM output remains available as an outputText-only text ref",
        "Phase 15 asset actions remain preserved",
        "Phase 16 connection UX remains preserved",
        "Phase 17 execution preview remains preserved",
        "Phase 18 generator/comfy execution remains preserved",
        "static/canvas.html remains unchanged",
        "no backend API schema changes",
        "no video execution migration",
        "phase19-canvas-llm-desktop-light.png",
        "phase19-canvas-llm-desktop-dark.png",
        "phase19-canvas-llm-mobile-light.png",
        "phase19-canvas-llm-mobile-dark.png",
        "phase19-canvas-llm-output-desktop.png",
        "phase19-canvas-output-placement-regression.png",
    ]:
        if needle not in docs + remaining + handoff:
            fail(f"Phase 19 documentation/handoff missing required note: {needle}")

    for needle in [
        "Phase 19 completed Native Canvas LLM Nodes",
        "LLM execution is now native",
        "Phase 20: Native video nodes",
        "output-node overlap regression",
        "using only `outputText` once an upstream LLM node has produced output",
        "unknown node fields",
        "save/load compatibility",
        "/api/canvas-llm",
        "/api/canvas-video",
    ]:
        if needle not in completion_plan:
            fail(f"Canvas Completion Plan missing Phase 19 update: {needle}")


def check_quiet_creative_phase20_canvas_video_and_custom_workflow() -> None:
    routes = read("frontend/src/app/routes.tsx")
    app = read("frontend/src/app/App.tsx")
    canvas = read("frontend/src/features/canvas/CanvasWorkspace.tsx")
    canvas_css = read("frontend/src/features/canvas/canvas.css")
    rail = read("frontend/src/components/creation-rail/CreationRail.tsx")
    api = read("frontend/src/lib/api.ts")
    main_py = read("main.py")
    docs = read("docs/quiet-creative-os-phase20.md") if (ROOT / "docs" / "quiet-creative-os-phase20.md").exists() else ""
    completion_plan = read("docs/quiet-creative-os-canvas-completion-plan.md") if (ROOT / "docs" / "quiet-creative-os-canvas-completion-plan.md").exists() else ""
    remaining = read("docs/quiet-creative-os-remaining-migrations-plan.md") if (ROOT / "docs" / "quiet-creative-os-remaining-migrations-plan.md").exists() else ""
    handoff = read("REVIEW_HANDOFF.md") if (ROOT / "REVIEW_HANDOFF.md").exists() else ""

    canvas_route = route_body(routes, "canvas")
    if 'kind: "native-canvas"' not in canvas_route or "src:" in canvas_route or "static/canvas.html" in canvas_route:
        fail("/app/canvas must remain native and iframe-free after Phase 20")
    if 'activeRoute.kind === "native-canvas"' not in app or "<CanvasWorkspace" not in app:
        fail("App shell must render native Canvas workspace after Phase 20")
    if "static/canvas.html" in canvas or "qc-embedded-frame" in canvas or "<iframe" in canvas:
        fail("Native Canvas workspace must stay iframe-free after Phase 20")

    for needle in [
        "CanvasVideoPayload",
        "CanvasVideoResponse",
        "runCanvasVideo",
        "generateCloudImage",
        "generateAngleCloud",
        "generateMsImage",
        '"/api/canvas-video"',
        '"/api/ms/generate"',
    ]:
        if needle not in api:
            fail(f"API helper missing Phase 20 Canvas video endpoint reuse: {needle}")

    for needle in [
        "videoGraphRunContext",
        "runSelectedVideoNode",
        "insertOrUpdateVideoOutputNode",
        "runCanvasVideo",
        "Canvas video execution",
        "Run video node",
        "useFrameRoles",
        "first_frame",
        "last_frame",
        "reference_image",
        "videos",
        "selectedVideoMode",
        "selectedVideoRunStatus",
        "selectedVideoRunError",
        "selectedVideoModel",
        "selectedVideoInputCount",
        "selectedVideoOutputPreview",
        "CANVAS_MS_GEN_MODELS",
        "addMsGenNode",
        "addLoopNode",
        "addPromptGroupNode",
        "renderLoopPrompt",
        "loopCount",
        "runCanvasMsGenNode",
        "ModelScope node",
        "Loop node",
        "Prompt group",
        "Run ModelScope node",
        "msgenModel",
        "msWidth",
        "msHeight",
        "kleinLora",
    ]:
        if needle not in canvas + app + rail:
            fail(f"Native Canvas missing Phase 20 video behavior: {needle}")

    for needle in [
        "getComfyWorkflows",
        "getComfyWorkflow",
        "workflowSummaries",
        "workflowDetails",
        "comfyFieldKind",
        "comfyParamValue",
        "comfyRandomValue",
        "selectedCustomWorkflowFields",
        "selectedCustomWorkflowSettingFields",
        "selectedCustomWorkflowPromptFields",
        "selectedCustomWorkflowImageFields",
        "updateSelectedComfyParam",
        "Custom workflow params",
        "Workflow parameter updated",
        "reference_images: context.images",
    ]:
        if needle not in canvas:
            fail(f"Native Canvas missing custom workflow field parity: {needle}")

    for needle in [
        "qc-canvas-video-execution",
        "qc-canvas-video-output",
        "qc-canvas-custom-workflow-fields",
        "qc-canvas-custom-field-list",
        "qc-canvas-custom-field-row",
        "qc-canvas-random-button",
    ]:
        if needle not in canvas + canvas_css:
            fail(f"Canvas CSS/UI missing Phase 20 video/custom workflow surface: {needle}")

    for needle in [
        "class CanvasVideoRequest(BaseModel):",
        "@app.post(\"/api/canvas-video\")",
        "images: List[AIReference]",
        "videos: List[str]",
        "return {\"videos\": local_urls",
        "@app.get(\"/api/workflows/{name:path}\")",
        "@app.get(\"/api/workflows\")",
    ]:
        if needle not in main_py:
            fail(f"Existing backend contract missing for Phase 20: {needle}")

    for static_path in ["static/canvas.html", "static/comfyui-settings.html"]:
        static_status = subprocess.run(
            ["git", "status", "--porcelain", "--", static_path],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        if static_status.stdout.strip():
            fail(f"{static_path} is modified; Phase 20 must preserve it unchanged")

    for needle in [
        "Quiet Creative OS Phase 20",
        "Native Canvas Video Nodes",
        "/api/canvas-video",
        "ModelScope",
        "/api/ms/generate",
        "loop and prompt group",
        "videos",
        "runStatus",
        "runError",
        "custom workflow",
        "custom workflow field rendering",
        "image, workflow, LLM, video, and ModelScope execution now all run",
        "no backend API schema changes",
        "static/canvas.html remains unchanged",
    ]:
        if needle not in docs + completion_plan + remaining + handoff:
            fail(f"Phase 20 documentation/handoff missing required note: {needle}")


def check_quiet_creative_native_canvas_complete_migration() -> None:
    routes = read("frontend/src/app/routes.tsx")
    app = read("frontend/src/app/App.tsx")
    canvas = read("frontend/src/features/canvas/CanvasWorkspace.tsx")
    api = read("frontend/src/lib/api.ts")
    qa = read("frontend/tests/native_canvas_complete_qa.spec.mjs") if (ROOT / "frontend" / "tests" / "native_canvas_complete_qa.spec.mjs").exists() else ""
    final_doc = read("docs/quiet-creative-os-native-canvas-complete-migration.md") if (ROOT / "docs" / "quiet-creative-os-native-canvas-complete-migration.md").exists() else ""
    handoff = read("REVIEW_HANDOFF.md") if (ROOT / "REVIEW_HANDOFF.md").exists() else ""

    canvas_route = route_body(routes, "canvas")
    if 'kind: "native-canvas"' not in canvas_route or "src:" in canvas_route or "static/canvas.html" in canvas_route:
        fail("/app/canvas must be native and must not route through static/canvas.html")
    if 'activeRoute.kind === "native-canvas"' not in app or "<CanvasWorkspace" not in app:
        fail("App shell must render the native Canvas workspace")
    if "static/canvas.html" in canvas or "qc-embedded-frame" in canvas or "<iframe" in canvas:
        fail("Native Canvas workspace must remain iframe-free and must not reference static/canvas.html")

    for static_path in ["static/canvas.html", "static/comfyui-settings.html"]:
        static_status = subprocess.run(
            ["git", "status", "--porcelain", "--", static_path],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        if static_status.stdout.strip():
            fail(f"{static_path} is modified; native Canvas complete migration must preserve archived static files")

    for needle in [
        "findNonOverlappingOutputPosition",
        "runSelectedWorkflowNode",
        "runSelectedLLMNode",
        "runSelectedVideoNode",
        "runCanvasMsGenNode",
        "addLoopNode",
        "addPromptGroupNode",
        "selectedCustomWorkflowFields",
        "CanvasImageEditorState",
        "applyImageEditor",
        "parseSplitCutFraction",
        "splitFractions",
        "Canvas image editor",
        "Mask drawing surface",
        "imageComparisons",
        "Canvas output preview",
        "Output compare slider",
        "Compare output",
        "data-compare-layer=\"generated\"",
        "data-compare-layer=\"source\"",
        "clipPath: `inset(0 ${100 - outputLightbox.comparePercent}% 0 0)`",
        'const llmOutputText = kind === "llm" ? stringField(node.outputText) : "";',
        '[["outputText", node.outputText]]',
    ]:
        if needle not in canvas:
            fail(f"Native Canvas complete migration code path missing: {needle}")

    for needle in [
        "createCanvasImageTask",
        "runCanvasLLM",
        "runCanvasVideo",
        "generateCloudImage",
        "generateAngleCloud",
        "generateMsImage",
        '"/api/canvas-assets/check"',
        '"/api/canvas-assets/download"',
    ]:
        if needle not in api + canvas:
            fail(f"Native Canvas complete migration endpoint reuse missing: {needle}")

    for needle in [
        "native Canvas complete migration QA",
        "native Canvas lifecycle QA",
        "native Canvas execution failure QA",
        "failNextLlm",
        "failNextWorkflow",
        "failNextVideo",
        "Image task mock failure",
        "state.staticCanvasRequests",
        "native-canvas-complete-desktop-light.png",
        "native-canvas-save-reload.png",
        "aiUploadPayloads",
        "Canvas image editor",
        "Apply image edit",
        "Mask drawing surface",
        "Grid rows",
        "Grid X cuts",
        "0.25",
        "50%",
        "compareAlignment",
        "Output compare slider",
        "Compare output",
    ]:
        if needle not in qa:
            fail(f"Native Canvas complete Playwright QA coverage missing: {needle}")

    for screenshot in [
        "docs/quiet-creative-os/screenshots/native-canvas-complete-desktop-light.png",
        "docs/quiet-creative-os/screenshots/native-canvas-complete-desktop-dark.png",
        "docs/quiet-creative-os/screenshots/native-canvas-complete-mobile-light.png",
        "docs/quiet-creative-os/screenshots/native-canvas-complete-mobile-dark.png",
        "docs/quiet-creative-os/screenshots/native-canvas-node-types.png",
        "docs/quiet-creative-os/screenshots/native-canvas-links.png",
        "docs/quiet-creative-os/screenshots/native-canvas-llm-to-generator.png",
        "docs/quiet-creative-os/screenshots/native-canvas-image-result.png",
        "docs/quiet-creative-os/screenshots/native-canvas-workflow-result.png",
        "docs/quiet-creative-os/screenshots/native-canvas-custom-workflow.png",
        "docs/quiet-creative-os/screenshots/native-canvas-video-result.png",
        "docs/quiet-creative-os/screenshots/native-canvas-save-reload.png",
    ]:
        path = ROOT / screenshot
        if not path.exists() or path.stat().st_size < 1024:
            fail(f"Native Canvas complete screenshot missing or empty: {screenshot}")

    for needle in [
        "Quiet Creative OS Native Canvas Complete Migration",
        "Legacy Canvas Audit Checklist",
        "implemented natively and verified",
        "static/canvas.html remains archived",
        "Playwright QA",
        "no backend API schema changes",
        "no new worktree",
    ]:
        if needle not in final_doc + handoff:
            fail(f"Native Canvas complete migration documentation missing: {needle}")


def check_frontend_build() -> None:
    frontend = ROOT / "frontend"
    if not frontend.exists():
        return
    if not shutil.which("npm"):
        print("SKIP: frontend build check skipped because npm is not installed")
        return
    if not (frontend / "node_modules").exists():
        print("SKIP: frontend build check skipped because frontend/node_modules is missing; run npm install")
        return
    result = subprocess.run(["npm", "run", "build"], cwd=frontend)
    if result.returncode != 0:
        fail("Frontend build failed")


def main() -> None:
    check_python_compile()
    check_workflows()
    check_backend_security()
    check_frontend_security()
    check_quiet_creative_frontend()
    check_quiet_creative_phase2_generate()
    check_quiet_creative_phase3_enhance()
    check_quiet_creative_phase4_online()
    check_quiet_creative_phase5_chat()
    check_quiet_creative_phase6_gallery()
    check_quiet_creative_phase7_edit()
    check_quiet_creative_phase8_shell_cleanup()
    check_quiet_creative_phase9_canvas()
    check_quiet_creative_phase10_canvas_authoring()
    check_quiet_creative_phase11_canvas_execution()
    check_quiet_creative_phase12_angle()
    check_quiet_creative_phase13_api_models()
    check_quiet_creative_phase14_comfyui()
    check_quiet_creative_phase15_canvas_asset_actions()
    check_quiet_creative_phase16_canvas_connection_ux()
    check_quiet_creative_phase17_canvas_execution_data_layer()
    check_quiet_creative_phase18_canvas_generator_comfy_execution()
    check_quiet_creative_phase19_canvas_llm_execution()
    check_quiet_creative_phase20_canvas_video_and_custom_workflow()
    check_quiet_creative_native_canvas_complete_migration()
    check_frontend_build()
    print("Guardrails passed")


if __name__ == "__main__":
    main()
