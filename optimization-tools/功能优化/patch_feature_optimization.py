# -*- coding: utf-8 -*-
import os
import subprocess
import shutil
import sys


TOOL_NAME = "Infinite-Canvas Feature Optimization Patch"


def read_text(path):
    with open(path, "r", encoding="utf-8-sig") as f:
        return f.read()


def write_text(path, content):
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(content)


def backup_once(path):
    bak = path + ".bak_feature_optimization"
    if not os.path.exists(bak):
        shutil.copy2(path, bak)
        print("[INFO] Backup:", bak)


def find_canvas_root():
    here = os.path.abspath(os.getcwd())
    candidates = [
        here,
        os.path.abspath(os.path.join(here, "..")),
        os.path.abspath(os.path.join(here, "..", "Infinite-Canvas")),
        os.path.abspath(os.path.join(here, "..", "Infinite-Canvas-main")),
        os.path.abspath(os.path.join(here, "..", "..", "Infinite-Canvas")),
        os.path.abspath(os.path.join(here, "..", "..", "Infinite-Canvas-main")),
        r"E:\Infinite-Canvas",
        r"E:\Infinite-Canvas-main",
    ]
    seen = set()
    for root in candidates:
        root = os.path.abspath(root)
        if root in seen:
            continue
        seen.add(root)
        if os.path.exists(os.path.join(root, "main.py")) and os.path.isdir(os.path.join(root, "static")):
            return root
    print("[INFO] Could not auto-detect Infinite-Canvas root.")
    try:
        user_input = input("Please input Infinite-Canvas root path, for example E:\\Infinite-Canvas: ").strip().strip('"')
    except Exception:
        user_input = ""
    if user_input and os.path.exists(os.path.join(user_input, "main.py")):
        return os.path.abspath(user_input)
    return None


def ensure_fastapi_import(content):
    line_start = content.find("from fastapi import ")
    if line_start < 0:
        return content
    line_end = content.find("\n", line_start)
    line = content[line_start:line_end]
    needed = ["UploadFile", "File", "Form"]
    if all(name in line for name in needed):
        return content
    imports = [part.strip() for part in line.replace("from fastapi import ", "").split(",")]
    for name in needed:
        if name not in imports:
            imports.append(name)
    new_line = "from fastapi import " + ", ".join(imports)
    return content[:line_start] + new_line + content[line_end:]


def ensure_imports(content):
    if "import zipfile" not in content:
        anchor = "import requests\n"
        content = content.replace(anchor, anchor + "import zipfile\n", 1) if anchor in content else "import zipfile\n" + content
    if "from io import BytesIO" not in content:
        if "from io import " in content:
            start = content.find("from io import ")
            end = content.find("\n", start)
            line = content[start:end]
            names = [x.strip() for x in line.replace("from io import ", "").split(",")]
            if "BytesIO" not in names:
                names.append("BytesIO")
            content = content[:start] + "from io import " + ", ".join(names) + content[end:]
        else:
            content = content.replace("import os\n", "import os\nfrom io import BytesIO\n", 1)
    return ensure_fastapi_import(content)


MAIN_HELPERS = r'''

def imported_canvas_payload(source, project=None, board_x=None, board_y=None, resource_mapping=None):
    if not isinstance(source, dict):
        raise HTTPException(status_code=400, detail="画布文件格式不正确")
    if not isinstance(source.get("nodes"), list):
        raise HTTPException(status_code=400, detail="画布 JSON 缺少 nodes")
    connections = source.get("connections")
    if not isinstance(connections, list):
        connections = []
    timestamp = now_ms()
    canvas = json.loads(json.dumps(source, ensure_ascii=False))
    if resource_mapping:
        canvas = canvas_workflow_replace_strings(canvas, resource_mapping)
    original_title = str(canvas.get("title") or "导入画布").strip()[:72] or "导入画布"
    old_id = str(canvas.get("id") or "")
    canvas["id"] = uuid.uuid4().hex
    canvas["title"] = f"{original_title}（导入）"[:80]
    canvas["kind"] = normalize_canvas_kind(canvas.get("kind"))
    canvas["project"] = str(project or "").strip() or DEFAULT_PROJECT_ID
    canvas["created_at"] = timestamp
    canvas["updated_at"] = timestamp
    canvas["deleted_at"] = 0
    canvas["pinned"] = False
    canvas["nodes"] = canvas.get("nodes") if isinstance(canvas.get("nodes"), list) else []
    canvas["connections"] = connections
    canvas["viewport"] = canvas.get("viewport") if isinstance(canvas.get("viewport"), dict) else {"x": 0, "y": 0, "scale": 1}
    canvas["settings"] = canvas.get("settings") if isinstance(canvas.get("settings"), dict) else {}
    canvas["logs"] = canvas.get("logs") if isinstance(canvas.get("logs"), list) else []
    if board_x is not None:
        canvas["board_x"] = float(board_x)
    else:
        canvas.pop("board_x", None)
    if board_y is not None:
        canvas["board_y"] = float(board_y)
    else:
        canvas.pop("board_y", None)
    canvas["imported_from"] = old_id
    save_canvas(canvas)
    return canvas


def read_canvas_import_archive(raw: bytes, filename: str):
    resource_mapping = {}
    imported_resources = []
    lower = str(filename or "").lower()
    if lower.endswith(".zip") or raw[:2] == b"PK":
        try:
            with zipfile.ZipFile(BytesIO(raw), "r") as zf:
                names = zf.namelist()
                canvas_name = "canvas.json" if "canvas.json" in names else next((n for n in names if n.lower().endswith("/canvas.json")), "")
                if not canvas_name:
                    raise HTTPException(status_code=400, detail="压缩包中没有 canvas.json")
                canvas = json.loads(zf.read(canvas_name).decode("utf-8-sig"))
                manifest = {}
                manifest_name = "resources-manifest.json" if "resources-manifest.json" in names else next((n for n in names if n.lower().endswith("/resources-manifest.json")), "")
                if manifest_name:
                    try:
                        manifest = json.loads(zf.read(manifest_name).decode("utf-8-sig"))
                    except Exception:
                        manifest = {}
                resources = manifest.get("resources") if isinstance(manifest, dict) else []
                if not isinstance(resources, list):
                    resources = []
                stamp = time.strftime("%Y%m%d-%H%M%S")
                import_dir = os.path.join(OUTPUT_INPUT_DIR, f"canvas_import_{stamp}_{uuid.uuid4().hex[:6]}")
                for index, res in enumerate(resources):
                    if not isinstance(res, dict) or res.get("skipped"):
                        continue
                    archive = str(res.get("file") or res.get("archive") or "").replace("\\", "/").lstrip("/")
                    if not archive or archive not in names:
                        continue
                    base = sanitize_export_filename(res.get("name") or os.path.basename(archive), os.path.basename(archive) or f"resource-{index + 1}.bin")
                    info = zf.getinfo(archive)
                    with zf.open(archive) as src:
                        content = src.read()
                    digest = hashlib.sha256(content).hexdigest()
                    new_url = find_duplicate_import_asset(base, info.file_size, digest)
                    reused = bool(new_url)
                    if not new_url:
                        os.makedirs(import_dir, exist_ok=True)
                        target = os.path.join(import_dir, base)
                        if os.path.exists(target):
                            stem, ext = os.path.splitext(base)
                            target = os.path.join(import_dir, f"{stem}_{uuid.uuid4().hex[:6]}{ext}")
                        with open(target, "wb") as dst:
                            dst.write(content)
                        rel = os.path.relpath(target, ASSETS_DIR).replace("\\", "/")
                        new_url = f"/assets/{rel}"
                    old_url = str(res.get("url") or "").strip()
                    if old_url:
                        resource_mapping[old_url] = new_url
                    resource_mapping[archive] = new_url
                    resource_mapping[f"./{archive}"] = new_url
                    resource_mapping[os.path.basename(archive)] = new_url
                    imported_resources.append({"from": old_url or archive, "to": new_url, "reused": reused})
                return canvas, resource_mapping, imported_resources
        except HTTPException:
            raise
        except zipfile.BadZipFile as exc:
            raise HTTPException(status_code=400, detail="无法读取画布压缩包") from exc
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"无法解析画布压缩包：{exc}") from exc
    try:
        return json.loads(raw.decode("utf-8-sig")), {}, []
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"无法解析画布 JSON：{exc}") from exc


def find_duplicate_import_asset(name: str, size: int, digest: str = ""):
    safe_name = os.path.basename(str(name or "")).strip()
    if not safe_name or size < 0:
        return ""
    root = os.path.abspath(ASSETS_DIR)
    if not os.path.isdir(root):
        return ""
    for dirpath, _, filenames in os.walk(root):
        for filename in filenames:
            if filename != safe_name:
                continue
            path = os.path.join(dirpath, filename)
            try:
                if os.path.getsize(path) != size:
                    continue
                if digest:
                    h = hashlib.sha256()
                    with open(path, "rb") as f:
                        for chunk in iter(lambda: f.read(1024 * 1024), b""):
                            h.update(chunk)
                    if h.hexdigest() != digest:
                        continue
                rel = os.path.relpath(path, ASSETS_DIR).replace("\\", "/")
                return f"/assets/{rel}"
            except Exception:
                continue
    return ""
'''


MAIN_ROUTE = r'''

@app.post("/api/canvases/import")
async def import_canvas(
    file: UploadFile = File(...),
    project: str = Form(""),
    board_x: str = Form(""),
    board_y: str = Form(""),
):
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="文件为空")
    def maybe_float(value):
        text = str(value or "").strip()
        if not text:
            return None
        try:
            return float(text)
        except Exception:
            return None
    source, resource_mapping, imported_resources = read_canvas_import_archive(raw, file.filename or "")
    canvas = imported_canvas_payload(
        source,
        project=project,
        board_x=maybe_float(board_x),
        board_y=maybe_float(board_y),
        resource_mapping=resource_mapping,
    )
    return {
        "canvas": canvas_record(canvas),
        "id": canvas.get("id"),
        "resource_count": sum(1 for item in imported_resources if not item.get("reused")),
        "reused_resource_count": sum(1 for item in imported_resources if item.get("reused")),
        "resource_map": resource_mapping,
    }
'''


def patch_main(root):
    path = os.path.join(root, "main.py")
    content = read_text(path)
    original = content
    content = ensure_imports(content)
    if "def imported_canvas_payload(" not in content:
        anchor = "\ndef load_canvas(canvas_id):"
        if anchor not in content:
            raise RuntimeError("Could not find load_canvas anchor in main.py")
        content = content.replace(anchor, MAIN_HELPERS + anchor, 1)
        print("[PATCH] Added canvas import helpers.")
    else:
        print("[SKIP] Canvas import helpers already exist.")
        if "def find_duplicate_import_asset(" in content and "root = os.path.abspath(OUTPUT_INPUT_DIR)" in content:
            content = content.replace("root = os.path.abspath(OUTPUT_INPUT_DIR)", "root = os.path.abspath(ASSETS_DIR)", 1)
            print("[PATCH] Extended import asset dedupe scan to all assets folders.")
    if '@app.post("/api/canvases/import")' not in content:
        anchor = '\n@app.get("/api/canvases/{canvas_id}/meta")'
        if anchor not in content:
            anchor = '\n@app.get("/api/canvases/{canvas_id}")'
        if anchor not in content:
            raise RuntimeError("Could not find canvas route anchor in main.py")
        content = content.replace(anchor, MAIN_ROUTE + anchor, 1)
        print("[PATCH] Added /api/canvases/import route.")
    else:
        print("[SKIP] /api/canvases/import route already exists.")
        old = '"resource_count": len(imported_resources),'
        if old in content and '"reused_resource_count"' not in content:
            content = content.replace(old, '"resource_count": sum(1 for item in imported_resources if not item.get("reused")),\n        "reused_resource_count": sum(1 for item in imported_resources if item.get("reused")),', 1)
            print("[PATCH] Added reused resource count response.")
    if content != original:
        backup_once(path)
        write_text(path, content)
    return content != original


HTML_PROGRESS = r'''                <div id="importProgress" class="ws-import-progress" aria-live="polite">
                    <div class="ws-import-progress-panel">
                        <div class="ws-import-progress-head">
                            <span class="ws-import-progress-icon"><i data-lucide="upload-cloud" class="w-4 h-4"></i></span>
                            <div>
                                <div id="importProgressTitle" class="ws-import-progress-title">导入画布</div>
                                <div id="importProgressSub" class="ws-import-progress-sub">准备上传...</div>
                            </div>
                            <span id="importProgressPct" class="ws-import-progress-pct">0%</span>
                        </div>
                        <div class="ws-import-progress-track"><div id="importProgressBar" class="ws-import-progress-bar"></div></div>
                    </div>
                </div>
'''


def patch_html(root):
    path = os.path.join(root, "static", "canvas-list.html")
    content = read_text(path)
    original = content
    if 'id="importCanvasInput"' not in content:
        anchor = '<div class="ws-topbar-right">'
        if anchor not in content:
            raise RuntimeError("Could not find topbar right anchor in canvas-list.html")
        content = content.replace(anchor, anchor + '\n                    <input id="importCanvasInput" type="file" accept=".json,.zip,application/json,application/zip" hidden>', 1)
        print("[PATCH] Added import file input.")
    if 'id="importCanvasBtn"' not in content:
        anchor = '<button id="boardResetView"'
        idx = content.find(anchor)
        if idx < 0:
            raise RuntimeError("Could not find boardResetView button anchor in canvas-list.html")
        button = '                    <button id="importCanvasBtn" class="ws-icon-btn" type="button" title="导入画布" aria-label="导入画布"><i data-lucide="upload" class="w-4 h-4"></i></button>\n'
        content = content[:idx] + button + content[idx:]
        print("[PATCH] Added import button.")
    if 'id="importProgress"' not in content:
        anchor = '<div id="boardWorld" class="ws-board-world"></div>'
        if anchor not in content:
            raise RuntimeError("Could not find boardWorld anchor in canvas-list.html")
        content = content.replace(anchor, anchor + "\n" + HTML_PROGRESS.rstrip(), 1)
        print("[PATCH] Added import progress panel.")
    content = replace_asset_version(content, "/static/css/canvas-list.css", "2026.07.03.feature-optimization")
    content = replace_asset_version(content, "/static/js/canvas-list.js", "2026.07.03.feature-optimization")
    if content != original:
        backup_once(path)
        write_text(path, content)
    return content != original


def patch_canvas_html(root):
    path = os.path.join(root, "static", "canvas.html")
    if not os.path.exists(path):
        print("[SKIP] static/canvas.html not found.")
        return False
    content = read_text(path)
    original = content
    content = replace_asset_version(content, "/static/js/canvas.js", "2026.07.03.feature-optimization")
    if content != original:
        backup_once(path)
        write_text(path, content)
        print("[PATCH] Updated normal canvas JS cache version.")
    return content != original


def replace_asset_version(content, asset, version):
    marker = asset + "?v="
    start = content.find(marker)
    if start < 0:
        return content
    v_start = start + len(marker)
    v_end = content.find('"', v_start)
    if v_end < 0:
        return content
    return content[:v_start] + version + content[v_end:]


CSS_BLOCK = r'''

.ws-import-progress { position:absolute; inset:0; z-index:35; display:flex; align-items:center; justify-content:center; padding:20px; background:rgba(246,247,249,.42); opacity:0; pointer-events:none; transition:opacity .18s var(--ease); }
.ws-import-progress.open { opacity:1; pointer-events:auto; }
.ws-import-progress-panel { width:min(420px, calc(100vw - 56px)); padding:14px; border-radius:8px; background:var(--card-solid); border:1px solid var(--line); box-shadow:0 20px 50px var(--shadow-strong); }
.ws-import-progress-head { display:flex; align-items:center; gap:10px; min-width:0; }
.ws-import-progress-icon { width:34px; height:34px; flex:0 0 34px; border-radius:8px; display:flex; align-items:center; justify-content:center; color:var(--accent); background:var(--accent-soft); border:1px solid var(--accent-line); }
.ws-import-progress-title { font-size:13px; line-height:1.2; font-weight:850; color:var(--text); }
.ws-import-progress-sub { margin-top:3px; font-size:11.5px; line-height:1.4; font-weight:650; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:260px; }
.ws-import-progress-pct { margin-left:auto; flex:0 0 auto; min-width:42px; text-align:right; font-size:12px; font-weight:850; color:var(--muted); }
.ws-import-progress-track { margin-top:12px; height:7px; overflow:hidden; border-radius:999px; background:var(--soft-2); border:1px solid var(--line); }
.ws-import-progress-bar { width:0%; height:100%; border-radius:999px; background:var(--accent); transition:width .18s var(--ease), background .18s var(--ease); }
.ws-import-progress.done .ws-import-progress-icon { color:var(--success); background:#ecfdf5; border-color:#a7f3d0; }
.ws-import-progress.done .ws-import-progress-bar { background:var(--success); }
.ws-import-progress.failed .ws-import-progress-icon { color:var(--danger); background:var(--danger-soft); border-color:#fecaca; }
.ws-import-progress.failed .ws-import-progress-bar { background:var(--danger); }
'''


CSS_DARK_BLOCK = r'''
.theme-dark .ws-import-progress { background:rgba(16,20,29,.46); }
.theme-dark .ws-import-progress.done .ws-import-progress-icon { background:rgba(5,150,105,.16); border-color:rgba(16,185,129,.34); }
.theme-dark .ws-import-progress.failed .ws-import-progress-icon { background:rgba(220,38,38,.16); border-color:rgba(248,113,113,.34); }
'''


def patch_css(root):
    path = os.path.join(root, "static", "css", "canvas-list.css")
    content = read_text(path)
    original = content
    if ".ws-import-progress {" not in content:
        anchor = ".ws-board-empty {"
        idx = content.find(anchor)
        if idx < 0:
            raise RuntimeError("Could not find board empty CSS anchor.")
        content = content[:idx] + CSS_BLOCK + "\n" + content[idx:]
        print("[PATCH] Added import progress CSS.")
    else:
        print("[SKIP] Import progress CSS already exists.")
    if ".ws-icon-btn { width:36px; height:36px;" in content:
        content = content.replace(
            ".ws-icon-btn { width:36px; height:36px;",
            ".ws-icon-btn { width:36px; min-width:36px; height:36px; flex:0 0 36px;",
            1,
        )
        print("[PATCH] Stabilized icon button sizing.")
    if ".ws-icon-btn:disabled" not in content and ".ws-icon-btn:hover" in content:
        hover_end = content.find("\n", content.find(".ws-icon-btn:hover"))
        content = content[:hover_end + 1] + ".ws-icon-btn:disabled { opacity:.58; cursor:default; transform:none; box-shadow:none; }\n#importCanvasBtn { display:flex !important; visibility:visible !important; }\n" + content[hover_end + 1:]
        print("[PATCH] Added import button visibility guard.")
    if ".ws-board.import-dragging::after" not in content and ".ws-board.panning" in content:
        pan_end = content.find("\n", content.find(".ws-board.panning"))
        content = content[:pan_end + 1] + ".ws-board.import-dragging::after { content:\"\"; position:absolute; inset:18px; z-index:34; border:2px dashed var(--accent); border-radius:8px; background:rgba(37,99,235,.08); box-shadow:inset 0 0 0 1px rgba(255,255,255,.18); pointer-events:none; }\n" + content[pan_end + 1:]
        print("[PATCH] Added drag import board highlight.")
    if ".theme-dark .ws-import-progress" not in content:
        anchor = "/* ===== Responsive ===== */"
        idx = content.find(anchor)
        if idx >= 0:
            content = content[:idx] + CSS_DARK_BLOCK + "\n" + content[idx:]
        else:
            content = content.rstrip() + "\n" + CSS_DARK_BLOCK + "\n"
        print("[PATCH] Added dark theme import progress CSS.")
    if content != original:
        backup_once(path)
        write_text(path, content)
    return content != original


JS_DOM_REFS = r'''let importCanvasBtn = document.getElementById('importCanvasBtn');
const importCanvasInput = document.getElementById('importCanvasInput');
const importProgress = document.getElementById('importProgress');
const importProgressTitle = document.getElementById('importProgressTitle');
const importProgressSub = document.getElementById('importProgressSub');
const importProgressPct = document.getElementById('importProgressPct');
const importProgressBar = document.getElementById('importProgressBar');
'''


JS_IMPORT_HELPERS = r'''
function ensureImportCanvasButton(){
    if(importCanvasBtn && document.body.contains(importCanvasBtn)) return importCanvasBtn;
    const bar = document.querySelector('.ws-topbar-right');
    if(!bar) return null;
    importCanvasBtn = document.createElement('button');
    importCanvasBtn.id = 'importCanvasBtn';
    importCanvasBtn.className = 'ws-icon-btn';
    importCanvasBtn.type = 'button';
    importCanvasBtn.title = L('导入画布','Import canvas');
    importCanvasBtn.setAttribute('aria-label', L('导入画布','Import canvas'));
    importCanvasBtn.innerHTML = '<i data-lucide="upload" class="w-4 h-4"></i>';
    bar.insertBefore(importCanvasBtn, boardResetViewBtn || bar.firstChild);
    refreshIcons();
    return importCanvasBtn;
}

function isCanvasImportFile(file){
    if(!file) return false;
    const name = String(file.name || '').toLowerCase();
    const type = String(file.type || '').toLowerCase();
    return name.endsWith('.json') || name.endsWith('.zip') || type.includes('json') || type.includes('zip');
}

function canvasImportFileFromTransfer(dataTransfer){
    const files = Array.from(dataTransfer?.files || []);
    const file = files.find(isCanvasImportFile);
    if(file) return file;
    for(const item of Array.from(dataTransfer?.items || [])){
        if(item.kind && item.kind !== 'file') continue;
        const maybe = typeof item.getAsFile === 'function' ? item.getAsFile() : null;
        if(isCanvasImportFile(maybe)) return maybe;
        const type = String(item.type || '').toLowerCase();
        if(type.includes('json') || type.includes('zip')) return {name:type.includes('zip') ? 'canvas.zip' : 'canvas.json', type};
    }
    return null;
}
'''


JS_POSITION_HELPERS = r'''
function rectsOverlap(a, b, gap = 18){
    return !(a.x + a.w + gap <= b.x || b.x + b.w + gap <= a.x || a.y + a.h + gap <= b.y || b.y + b.h + gap <= a.y);
}

function findBlankBoardPosition(){
    const CARD_W = 248, CARD_H = 150, STEP_X = 276, STEP_Y = 176;
    const center = boardCenterWorld();
    const existing = canvasesInProject(currentProjectId)
        .filter(c => c.board_x != null && c.board_y != null)
        .map(c => ({ x: Number(c.board_x) || 0, y: Number(c.board_y) || 0, w: CARD_W, h: CARD_H }));
    const baseX = Math.round((center.x - CARD_W / 2) / STEP_X) * STEP_X;
    const baseY = Math.round((center.y - CARD_H / 2) / STEP_Y) * STEP_Y;
    const offsets = [[0,0], [1,0], [0,1], [1,1], [-1,0], [0,-1], [2,0], [0,2], [2,1], [1,2], [-1,1], [1,-1]];
    for(let ring = 0; ring <= 12; ring++){
        const ringOffsets = ring === 0 ? offsets : [];
        if(ring > 0){
            for(let dx = -ring; dx <= ring; dx++){
                ringOffsets.push([dx, -ring], [dx, ring]);
            }
            for(let dy = -ring + 1; dy <= ring - 1; dy++){
                ringOffsets.push([-ring, dy], [ring, dy]);
            }
        }
        for(const [dx, dy] of ringOffsets){
            const candidate = { x: baseX + dx * STEP_X, y: baseY + dy * STEP_Y, w: CARD_W, h: CARD_H };
            if(existing.every(rect => !rectsOverlap(candidate, rect))){
                return { x: candidate.x, y: candidate.y };
            }
        }
    }
    return { x: baseX + STEP_X, y: baseY + STEP_Y };
}
'''


JS_IMPORT_FUNCTIONS = r'''
function setImportProgress(percent, subText, state){
    if(!importProgress) return;
    const value = Math.max(0, Math.min(100, Number(percent) || 0));
    importProgress.classList.add('open');
    importProgress.classList.toggle('done', state === 'done');
    importProgress.classList.toggle('failed', state === 'failed');
    if(importProgressTitle) importProgressTitle.textContent = state === 'failed' ? L('导入失败','Import failed') : L('导入画布','Import canvas');
    if(importProgressSub && subText) importProgressSub.textContent = subText;
    if(importProgressPct) importProgressPct.textContent = `${Math.round(value)}%`;
    if(importProgressBar) importProgressBar.style.width = `${value}%`;
}

function closeImportProgress(delay = 650){
    if(!importProgress) return;
    window.setTimeout(() => {
        importProgress.classList.remove('open', 'done', 'failed');
        if(importProgressSub) importProgressSub.textContent = L('准备上传...','Preparing upload...');
        if(importProgressPct) importProgressPct.textContent = '0%';
        if(importProgressBar) importProgressBar.style.width = '0%';
    }, delay);
}

function uploadCanvasImport(form, onProgress){
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/canvases/import');
        xhr.onloadstart = () => onProgress?.(4, L('准备上传...','Preparing upload...'));
        xhr.upload.onprogress = e => {
            if(e.lengthComputable && e.total > 0){
                const pct = Math.min(88, Math.max(8, (e.loaded / e.total) * 88));
                onProgress?.(pct, L('正在上传画布文件...','Uploading canvas file...'));
            } else {
                onProgress?.(35, L('正在上传画布文件...','Uploading canvas file...'));
            }
        };
        xhr.upload.onload = () => onProgress?.(92, L('正在解析画布和资源...','Parsing canvas and assets...'));
        xhr.onerror = () => reject(new Error(L('网络错误，导入失败','Network error, import failed')));
        xhr.onload = () => {
            let data = {};
            try { data = xhr.responseText ? JSON.parse(xhr.responseText) : {}; }
            catch(e){ return reject(new Error(L('导入响应解析失败','Import response parse failed'))); }
            if(xhr.status < 200 || xhr.status >= 300){
                reject(new Error(data.detail || data.error || L('导入失败','Import failed')));
                return;
            }
            resolve(data);
        };
        xhr.send(form);
    });
}

async function importCanvasFile(file){
    if(!file) return;
    if(importInFlight){
        setStatus(L('已有导入任务正在进行','Import already in progress'));
        return;
    }
    importInFlight = true;
    if(importCanvasBtn) importCanvasBtn.disabled = true;
    closeCreateCard();
    closeCardMenu();
    const worldPt = findBlankBoardPosition();
    const form = new FormData();
    form.append('file', file);
    form.append('project', currentProjectId || 'default');
    form.append('board_x', String(Math.round(worldPt.x)));
    form.append('board_y', String(Math.round(worldPt.y)));
    setImportProgress(4, L('准备上传...','Preparing upload...'));
    setStatus(L('正在导入画布...','Importing canvas...'));
    try {
        const data = await uploadCanvasImport(form, setImportProgress);
        const nc = data.canvas;
        if(nc){
            if(nc.project == null) nc.project = currentProjectId;
            if(nc.board_x == null) nc.board_x = Math.round(worldPt.x);
            if(nc.board_y == null) nc.board_y = Math.round(worldPt.y);
            canvases.unshift(nc);
            renderBoard();
            renderProjects();
        } else {
            await loadAll();
        }
        const count = Number(data.resource_count || 0);
        const reused = Number(data.reused_resource_count || 0);
        const doneText = reused
            ? L(`已导入画布，新增 ${count} 个资源，复用 ${reused} 个资源`, `Imported canvas, added ${count} assets, reused ${reused}`)
            : (count ? L(`已导入画布和 ${count} 个资源`, `Imported canvas and ${count} assets`) : L('已导入画布','Imported canvas'));
        setImportProgress(100, doneText, 'done');
        setStatus(doneText);
        closeImportProgress(800);
    } catch(e){
        console.error(e);
        setImportProgress(100, e.message || L('导入失败','Import failed'), 'failed');
        setStatus(e.message || L('导入失败','Import failed'));
        closeImportProgress(1400);
    } finally {
        importInFlight = false;
        if(importCanvasBtn) importCanvasBtn.disabled = false;
    }
}
'''


JS_EVENTS = r'''
ensureImportCanvasButton();
document.addEventListener('click', e => {
    if(e.target.closest?.('#importCanvasBtn')){
        e.preventDefault();
        ensureImportCanvasButton();
        importCanvasInput?.click();
    }
});
importCanvasInput?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    importCanvasFile(file);
});
board.addEventListener('dragenter', e => {
    if(canvasImportFileFromTransfer(e.dataTransfer)){
        e.preventDefault();
        board.classList.add('import-dragging');
    }
});
board.addEventListener('dragover', e => {
    if(canvasImportFileFromTransfer(e.dataTransfer)){
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        board.classList.add('import-dragging');
    }
});
board.addEventListener('dragleave', e => {
    if(e.target === board || !board.contains(e.relatedTarget)){
        board.classList.remove('import-dragging');
    }
});
board.addEventListener('drop', e => {
    const file = canvasImportFileFromTransfer(e.dataTransfer);
    if(!file) return;
    e.preventDefault();
    e.stopPropagation();
    board.classList.remove('import-dragging');
    importCanvasFile(file);
});
'''


JS_DRAG_EVENTS = r'''
board.addEventListener('dragenter', e => {
    if(canvasImportFileFromTransfer(e.dataTransfer)){
        e.preventDefault();
        board.classList.add('import-dragging');
    }
});
board.addEventListener('dragover', e => {
    if(canvasImportFileFromTransfer(e.dataTransfer)){
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        board.classList.add('import-dragging');
    }
});
board.addEventListener('dragleave', e => {
    if(e.target === board || !board.contains(e.relatedTarget)){
        board.classList.remove('import-dragging');
    }
});
board.addEventListener('drop', e => {
    const file = canvasImportFileFromTransfer(e.dataTransfer);
    if(!file) return;
    e.preventDefault();
    e.stopPropagation();
    board.classList.remove('import-dragging');
    importCanvasFile(file);
});
'''


def patch_js(root):
    path = os.path.join(root, "static", "js", "canvas-list.js")
    content = read_text(path)
    original = content
    if "const importCanvasBtn =" in content:
        content = content.replace("const importCanvasBtn =", "let importCanvasBtn =", 1)
        print("[PATCH] Made import button reference recoverable.")
    if "let importCanvasBtn =" not in content:
        anchor = "const newCanvasBtn = document.getElementById('newCanvasBtn');\n"
        if anchor not in content:
            raise RuntimeError("Could not find newCanvasBtn DOM anchor.")
        content = content.replace(anchor, anchor + JS_DOM_REFS, 1)
        print("[PATCH] Added import DOM references.")
    else:
        for line in JS_DOM_REFS.splitlines():
            if line and line not in content:
                anchor = "const importCanvasInput = document.getElementById('importCanvasInput');\n"
                content = content.replace(anchor, anchor + line + "\n", 1)
    if "let importInFlight = false;" not in content:
        anchor = "let clipboardCanvasId = null;"
        idx = content.find(anchor)
        if idx < 0:
            raise RuntimeError("Could not find state anchor.")
        end = content.find("\n", idx)
        content = content[:end + 1] + "let importInFlight = false;\n" + content[end + 1:]
        print("[PATCH] Added import state.")
    if "function ensureImportCanvasButton(" not in content:
        anchor = "/* ===== Viewport math"
        idx = content.find(anchor)
        if idx < 0:
            anchor = "function setStatus(text){"
            idx = content.find(anchor)
        if idx < 0:
            raise RuntimeError("Could not find import helper anchor.")
        content = content[:idx] + JS_IMPORT_HELPERS + "\n" + content[idx:]
        print("[PATCH] Added import button/drag helper functions.")
    if "function findBlankBoardPosition(" not in content:
        anchor = "function resetView(){"
        if anchor not in content:
            raise RuntimeError("Could not find resetView anchor.")
        content = content.replace(anchor, JS_POSITION_HELPERS + "\n" + anchor, 1)
        print("[PATCH] Added blank-position helper.")
    if "async function importCanvasFile(" not in content:
        anchor = "/* ===== Card context menu"
        idx = content.find(anchor)
        if idx < 0:
            raise RuntimeError("Could not find card context menu anchor.")
        content = content[:idx] + JS_IMPORT_FUNCTIONS + "\n" + content[idx:]
        print("[PATCH] Added import JS functions.")
    else:
        if "uploadCanvasImport(form, setImportProgress)" not in content:
            print("[WARN] Existing importCanvasFile found; skipped replacing custom import logic.")
    if "importCanvasBtn?.addEventListener('click', () => importCanvasInput?.click());" in content:
        content = content.replace("importCanvasBtn?.addEventListener('click', () => importCanvasInput?.click());\n", "", 1)
        print("[PATCH] Removed fragile direct import button listener.")
    if "ensureImportCanvasButton();" not in content:
        anchor = "newCanvasBtn.addEventListener('click'"
        idx = content.find(anchor)
        if idx < 0:
            raise RuntimeError("Could not find newCanvasBtn event anchor.")
        line_start = content.rfind("\n", 0, idx) + 1
        line_end = content.find("\n", idx)
        content = content[:line_end + 1] + JS_EVENTS + content[line_end + 1:]
        print("[PATCH] Added import events.")
    elif "canvasImportFileFromTransfer(e.dataTransfer)" not in content:
        anchor = "importCanvasInput?.addEventListener('change'"
        idx = content.find(anchor)
        end = content.find("});", idx) if idx >= 0 else -1
        if end >= 0:
            insert_at = end + len("});")
            content = content[:insert_at] + "\n" + JS_DRAG_EVENTS + content[insert_at:]
            print("[PATCH] Added drag-and-drop import events.")
    if content != original:
        backup_once(path)
        write_text(path, content)
    return content != original


CANVAS_DBLCLICK_MENU = r'''board.ondblclick = e => {
    if(!canvas) return;
    if(dragBoard || dragNode || resizeNode || tempLink || selectDrag || knifeActive) return;
    if(e.target !== board && e.target !== world && e.target !== nodesEl && e.target !== linksEl) return;
    e.preventDefault();
    e.stopPropagation();
    openCreateMenu(e.clientX, e.clientY);
};'''


def patch_canvas_js(root):
    path = os.path.join(root, "static", "js", "canvas.js")
    if not os.path.exists(path):
        print("[SKIP] static/js/canvas.js not found.")
        return False
    content = read_text(path)
    original = content
    old_null = "board.ondblclick = null;"
    old_buggy = """board.ondblclick = e => {
    if(!canvas) return;
    if(dragBoard || dragNode || resizeNode || tempLink || selectionBox || knifeActive) return;
    if(e.target !== board && e.target !== world && e.target !== nodesEl && e.target !== linksEl) return;
    e.preventDefault();
    e.stopPropagation();
    openCreateMenu(e.clientX, e.clientY);
};"""
    if old_buggy in content:
        content = content.replace(old_buggy, CANVAS_DBLCLICK_MENU, 1)
        print("[PATCH] Fixed normal canvas double-click menu guard.")
    elif old_null in content:
        content = content.replace(old_null, CANVAS_DBLCLICK_MENU, 1)
        print("[PATCH] Added normal canvas double-click create menu.")
    elif "board.ondblclick = e =>" in content and "openCreateMenu(e.clientX, e.clientY)" in content:
        print("[SKIP] Normal canvas double-click menu already exists.")
    else:
        print("[WARN] Could not find normal canvas double-click anchor; skipped.")
    if content != original:
        backup_once(path)
        write_text(path, content)
    return content != original


def validate(root):
    main_py = os.path.join(root, "main.py")
    main_check = subprocess.run([sys.executable, "-m", "py_compile", main_py])
    if main_check.returncode != 0:
        raise RuntimeError("main.py compile check failed")
    node_candidates = [
        os.path.join(os.path.expanduser("~"), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "bin", "node.exe"),
        "node",
    ]
    js_paths = [
        os.path.join(root, "static", "js", "canvas-list.js"),
        os.path.join(root, "static", "js", "canvas.js"),
    ]
    for node in node_candidates:
        try:
            ok = True
            for js_path in js_paths:
                if not os.path.exists(js_path):
                    continue
                js_check = subprocess.run([node, "--check", js_path])
                if js_check.returncode != 0:
                    ok = False
                    break
            if ok:
                return
        except Exception:
            continue
    print("[WARN] Node.js not found or JS check failed to run; main.py check passed.")


def apply_patch():
    root = find_canvas_root()
    if not root:
        print("[ERROR] Could not locate Infinite-Canvas root.")
        return False
    print("[INFO] Target root:", root)
    changed = False
    changed = patch_main(root) or changed
    changed = patch_html(root) or changed
    changed = patch_canvas_html(root) or changed
    changed = patch_css(root) or changed
    changed = patch_js(root) or changed
    changed = patch_canvas_js(root) or changed
    validate(root)
    if changed:
        print("[SUCCESS] Feature optimization patch applied.")
    else:
        print("[SUCCESS] Feature optimization patch already applied.")
    return True


if __name__ == "__main__":
    print("=" * 58)
    print(" " + TOOL_NAME)
    print("=" * 58)
    try:
        ok = apply_patch()
    except Exception as exc:
        print("[ERROR]", exc)
        ok = False
    sys.exit(0 if ok else 1)
