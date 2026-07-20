// canvas-list.js — Project Workspace.
// Two-pane: LEFT project list, RIGHT pannable/zoomable board of canvas cards.
// Self-contained; relies only on global fetch / StudioI18n / lucide.

/* ===== Small helpers (copied from the previous gate file) ===== */
function refreshIcons(){ if(window.lucide) lucide.createIcons(); }
function tr(key){ return window.StudioI18n ? StudioI18n.t(key) : key; }
function langIsEn(){ return window.StudioI18n?.lang?.() === 'en'; }
function escapeHtml(str){ return String(str == null ? '' : str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
function escapeAttr(str){ return escapeHtml(str); }
function L(zh, en){ return langIsEn() ? en : zh; }
function compactLabel(fullZh, compactZh, en){ return window.innerWidth <= 760 ? L(compactZh, en) : L(fullZh, en); }
const CANVAS_LIST_PROJECT_KEY = 'canvasListCurrentProjectId';

function rememberedProjectId(){
    try {
        return new URLSearchParams(window.location.search).get('project') || localStorage.getItem(CANVAS_LIST_PROJECT_KEY) || 'default';
    } catch(e){
        return 'default';
    }
}

function rememberProjectId(pid){
    if(!pid) return;
    try { localStorage.setItem(CANVAS_LIST_PROJECT_KEY, pid); } catch(e){}
}

function formatCanvasTime(value){
    if(!value) return '--';
    const raw = Number(value);
    const time = raw < 10000000000 ? raw * 1000 : raw;
    const date = new Date(time);
    if(Number.isNaN(date.getTime())) return '--';
    return date.toLocaleString(langIsEn() ? 'en-US' : 'zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
}

function renderCanvasIcon(icon, size = 16){
    if(!icon || icon === '🧩') return `<i data-lucide="layers" style="width:${size}px;height:${size}px"></i>`;
    if(/[^\x00-\x7F]/.test(icon)) return escapeHtml(icon);
    return `<i data-lucide="${escapeHtml(icon)}" style="width:${size}px;height:${size}px"></i>`;
}

/* ===== DOM refs ===== */
const board = document.getElementById('board');
const boardWorld = document.getElementById('boardWorld');
const boardEmptyHint = document.getElementById('boardEmptyHint');
const boardProjectName = document.getElementById('boardProjectName');
const boardCanvasCount = document.getElementById('boardCanvasCount');
const projectListEl = document.getElementById('projectList');
const trashEntryBtn = document.getElementById('trashEntry');
const trashBadge = document.getElementById('trashBadge');
const trashPanel = document.getElementById('trashPanel');
const trashListEl = document.getElementById('trashList');
const trashCloseBtn = document.getElementById('trashClose');
const newProjectBtn = document.getElementById('newProjectBtn');
const newProjectRow = document.getElementById('newProjectRow');
const newProjectInput = document.getElementById('newProjectInput');
const newProjectConfirm = document.getElementById('newProjectConfirm');
const newProjectCancel = document.getElementById('newProjectCancel');
const newCanvasBtn = document.getElementById('newCanvasBtn');
const boardRefreshBtn = document.getElementById('boardRefresh');
const boardResetViewBtn = document.getElementById('boardResetView');
const pasteCanvasBtn = document.getElementById('pasteCanvasBtn');
const emptyCreateCanvasBtn = document.getElementById('emptyCreateCanvasBtn');
const statusEl = document.getElementById('boardStatus');

/* ===== State ===== */
let projects = [];
let canvases = [];          // all canvases across projects
let deletedCanvases = [];
let currentProjectId = rememberedProjectId();
let pendingDeleteProjectId = null;
let statusTimer = null;
let clipboardCanvasId = null;   // 剪切的画布（切到别的项目后粘贴）

// board viewport (mirrors smart-canvas math)
const viewport = { x: 0, y: 0, scale: 1 };
const MIN_SCALE = 0.3, MAX_SCALE = 2;

/* ===== Status toast ===== */
function setStatus(text){
    if(!statusEl) return;
    if(!text){ statusEl.classList.remove('show'); return; }
    statusEl.textContent = text;
    statusEl.classList.add('show');
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => statusEl.classList.remove('show'), 2200);
}

/* ===== Viewport math (mirrors smart-canvas.js) ===== */
function applyViewport(){
    boardWorld.style.transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`;
    board.style.backgroundSize = `${120 * viewport.scale}px ${120 * viewport.scale}px, ${120 * viewport.scale}px ${120 * viewport.scale}px, ${24 * viewport.scale}px ${24 * viewport.scale}px`;
    board.style.backgroundPosition = `${viewport.x}px ${viewport.y}px, ${viewport.x}px ${viewport.y}px, ${viewport.x}px ${viewport.y}px`;
}
function screenToWorld(clientX, clientY){
    const rect = board.getBoundingClientRect();
    return {
        x: (clientX - rect.left - viewport.x) / viewport.scale,
        y: (clientY - rect.top - viewport.y) / viewport.scale
    };
}
function boardCenterWorld(){
    return {
        x: (board.clientWidth / 2 - viewport.x) / viewport.scale,
        y: (board.clientHeight / 2 - viewport.y) / viewport.scale
    };
}
function resetView(){
    const cards = Array.from(boardWorld.querySelectorAll('.ws-card'));
    if(!cards.length){
        viewport.x = 0; viewport.y = 0; viewport.scale = 1; applyViewport();
        return;
    }
    const bounds = cards.reduce((acc, el) => {
        const x = parseFloat(el.style.left) || 0;
        const y = parseFloat(el.style.top) || 0;
        const w = el.offsetWidth || 248;
        const h = el.offsetHeight || 150;
        acc.minX = Math.min(acc.minX, x);
        acc.minY = Math.min(acc.minY, y);
        acc.maxX = Math.max(acc.maxX, x + w);
        acc.maxY = Math.max(acc.maxY, y + h);
        return acc;
    }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
    const padding = board.clientWidth < 640 ? 20 : 40;
    const width = Math.max(1, bounds.maxX - bounds.minX);
    const height = Math.max(1, bounds.maxY - bounds.minY);
    const fitScale = Math.min(1, (board.clientWidth - padding * 2) / width, (board.clientHeight - padding * 2) / height);
    viewport.scale = board.clientWidth < 640 ? 1 : Math.min(MAX_SCALE, Math.max(0.9, fitScale));
    const fitsX = width * viewport.scale <= board.clientWidth - padding * 2;
    const fitsY = height * viewport.scale <= board.clientHeight - padding * 2;
    viewport.x = Math.round((fitsX ? (board.clientWidth - width * viewport.scale) / 2 : padding) - bounds.minX * viewport.scale);
    viewport.y = Math.round((fitsY ? Math.max(padding, (board.clientHeight - height * viewport.scale) / 2) : padding) - bounds.minY * viewport.scale);
    applyViewport();
}

/* ===== Board pan & zoom ===== */
let panState = null;
function onBoardPanStart(e){
    if(e.button !== 0) return;
    if(e.target.closest('.ws-card') || e.target.closest('.ws-create-card') || e.target.closest('.ws-card-pop') || e.target.closest('button,input,textarea,select')) return;
    closeCardMenu();
    panState = { startX: e.clientX, startY: e.clientY, ox: viewport.x, oy: viewport.y, moved: false };
    board.classList.add('panning');
}
function onBoardPanMove(e){
    if(!panState) return;
    viewport.x = panState.ox + (e.clientX - panState.startX);
    viewport.y = panState.oy + (e.clientY - panState.startY);
    if(Math.abs(e.clientX - panState.startX) > 3 || Math.abs(e.clientY - panState.startY) > 3) panState.moved = true;
    applyViewport();
}
function onBoardPanEnd(){
    if(!panState) return;
    panState = null;
    board.classList.remove('panning');
}
function onBoardWheel(e){
    e.preventDefault();
    const rect = board.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    // world point under cursor before zoom
    const wx = (px - viewport.x) / viewport.scale;
    const wy = (py - viewport.y) / viewport.scale;
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, viewport.scale * factor));
    viewport.scale = next;
    // keep the same world point under the cursor
    viewport.x = px - wx * next;
    viewport.y = py - wy * next;
    applyViewport();
}

/* ===== Data loading ===== */
function currentProject(){ return projects.find(p => p.id === currentProjectId) || projects[0] || null; }
function canvasesInProject(pid){ return canvases.filter(c => (c.project || 'default') === pid); }

async function loadAll(){
    try {
        const [pRes, cRes] = await Promise.all([
            fetch('/api/projects'),
            fetch('/api/canvases')
        ]);
        const pData = pRes.ok ? await pRes.json() : { projects: [] };
        const cData = cRes.ok ? await cRes.json() : { canvases: [] };
        projects = (pData.projects || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
        if(!projects.length) projects = [{ id: 'default', name: L('默认项目','Default'), order: 0, canvas_count: 0 }];
        canvases = cData.canvases || [];
        // pick first project (prefer default / order 0)
        if(!projects.find(p => p.id === currentProjectId)){
            const def = projects.find(p => p.id === 'default') || projects.slice().sort((a, b) => (a.order || 0) - (b.order || 0))[0];
            currentProjectId = def ? def.id : 'default';
        }
        rememberProjectId(currentProjectId);
        renderProjects();
        renderBoard();
        resetView();
        refreshTrashCount();
    } catch(e){
        console.error(e);
        setStatus(L('加载失败','Load failed'));
    }
}

function projectCanvasCount(pid){
    const p = projects.find(x => x.id === pid);
    // prefer live count from canvases array; fall back to server count
    const live = canvasesInProject(pid).length;
    return canvases.length ? live : (p?.canvas_count || 0);
}

/* ===== Project sidebar rendering ===== */
function renderProjects(){
    projectListEl.innerHTML = '';
    projects.forEach(p => {
        if(pendingDeleteProjectId === p.id){
            const box = document.createElement('div');
            box.className = 'ws-project-confirm';
            box.innerHTML = `
                <div class="ws-project-confirm-title">${L('删除项目','Delete project')}「${escapeHtml(p.name)}」？${L('其画布将移回默认项目。','Canvases move back to Default.')}</div>
                <div class="ws-project-confirm-actions">
                    <button class="ws-confirm-btn" type="button">${L('删除','Delete')}</button>
                    <button class="ws-cancel-btn" type="button">${L('取消','Cancel')}</button>
                </div>`;
            box.querySelector('.ws-confirm-btn').onclick = () => deleteProject(p.id);
            box.querySelector('.ws-cancel-btn').onclick = () => { pendingDeleteProjectId = null; renderProjects(); };
            projectListEl.appendChild(box);
            return;
        }
        const row = document.createElement('div');
        row.className = 'ws-project-row' + (p.id === currentProjectId ? ' active' : '');
        row.dataset.projectId = p.id;
        const count = projectCanvasCount(p.id);
        const isDefault = p.id === 'default';
        row.innerHTML = `
            <span class="ws-project-icon"><i data-lucide="${isDefault ? 'folder' : 'folder-open'}" class="w-4 h-4"></i></span>
            <span class="ws-project-name">${escapeHtml(p.name)}</span>
            <span class="ws-project-count">${count}</span>
            <span class="ws-project-actions">
                <button class="ws-proj-act rename" type="button" title="${L('重命名','Rename')}" aria-label="${L('重命名','Rename')}"><i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>
                ${isDefault ? '' : `<button class="ws-proj-act del" type="button" title="${L('删除','Delete')}" aria-label="${L('删除','Delete')}"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>`}
            </span>`;
        row.onclick = e => {
            if(e.target.closest('.ws-proj-act')) return;
            selectProject(p.id);
        };
        const renameBtn = row.querySelector('.ws-proj-act.rename');
        if(renameBtn) renameBtn.onclick = e => { e.stopPropagation(); startProjectRename(p.id, row); };
        const delBtn = row.querySelector('.ws-proj-act.del');
        if(delBtn) delBtn.onclick = e => { e.stopPropagation(); pendingDeleteProjectId = p.id; renderProjects(); };
        projectListEl.appendChild(row);
    });
    refreshIcons();
}

function selectProject(pid){
    if(pid === currentProjectId && !trashPanel.classList.contains('active')) return;
    currentProjectId = pid;
    rememberProjectId(pid);
    closeTrashView();
    renderProjects();
    renderBoard();
    resetView();
}

function startProjectRename(pid, row){
    const p = projects.find(x => x.id === pid);
    if(!p) return;
    const nameEl = row.querySelector('.ws-project-name');
    if(!nameEl || nameEl.querySelector('input')) return;
    const input = document.createElement('input');
    input.type = 'text'; input.maxLength = 60; input.value = p.name;
    input.className = 'ws-project-name-input';
    nameEl.replaceWith(input);
    input.focus(); input.select();
    input.onclick = e => e.stopPropagation();
    let done = false;
    const finish = commit => {
        if(done) return; done = true;
        const v = input.value.trim();
        if(commit && v && v !== p.name) renameProject(pid, v);
        else renderProjects();
    };
    input.onblur = () => finish(true);
    input.onkeydown = e => {
        e.stopPropagation();
        if(e.key === 'Enter'){ e.preventDefault(); finish(true); }
        if(e.key === 'Escape'){ e.preventDefault(); finish(false); }
    };
}

/* ===== Project CRUD ===== */
function openNewProject(){
    newProjectRow.classList.add('active');
    newProjectInput.value = '';
    newProjectInput.focus();
}
function closeNewProject(){
    newProjectRow.classList.remove('active');
    newProjectInput.value = '';
}
async function createProject(){
    const name = newProjectInput.value.trim() || L('新项目','New project');
    closeNewProject();
    try {
        const res = await fetch('/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        if(!res.ok) throw new Error('create project failed');
        const data = await res.json();
        const proj = data.project;
        if(proj){
            projects.push(proj);
            projects.sort((a, b) => (a.order || 0) - (b.order || 0));
            selectProject(proj.id);
            renderProjects();
        }
    } catch(e){
        console.error(e); setStatus(L('创建项目失败','Create project failed'));
    }
}
async function renameProject(pid, name){
    const p = projects.find(x => x.id === pid);
    if(p) p.name = name;
    renderProjects();
    if(pid === currentProjectId) updateBoardHeader();
    try {
        const res = await fetch(`/api/projects/${encodeURIComponent(pid)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        if(!res.ok) throw new Error('rename project failed');
    } catch(e){ console.error(e); setStatus(L('重命名失败','Rename failed')); loadAll(); }
}
async function deleteProject(pid){
    pendingDeleteProjectId = null;
    try {
        const res = await fetch(`/api/projects/${encodeURIComponent(pid)}`, { method: 'DELETE' });
        if(!res.ok) throw new Error('delete project failed');
        // canvases of deleted project move back to default
        canvases.forEach(c => { if((c.project || 'default') === pid) c.project = 'default'; });
        projects = projects.filter(p => p.id !== pid);
        if(currentProjectId === pid) currentProjectId = 'default';
        rememberProjectId(currentProjectId);
        renderProjects();
        renderBoard();
    } catch(e){ console.error(e); setStatus(L('删除项目失败','Delete project failed')); loadAll(); }
}

/* ===== Board rendering ===== */
function updateBoardHeader(){
    const p = currentProject();
    boardProjectName.textContent = p ? p.name : L('默认项目','Default');
    boardCanvasCount.textContent = String(canvasesInProject(currentProjectId).length);
}

function autoLayoutNulls(items){
    // grid layout for cards with null board position; persist each once.
    const X0 = 40, Y0 = 40, XSTRIDE = 276, YSTRIDE = 176, COLS = 4;
    const positioned = items.filter(c => c.board_x != null && c.board_y != null);
    const nulls = items.filter(c => c.board_x == null || c.board_y == null);
    // start index after existing positioned grid slots to reduce overlap
    let i = positioned.length;
    nulls.forEach(c => {
        const col = i % COLS, rowIdx = Math.floor(i / COLS);
        c.board_x = X0 + col * XSTRIDE;
        c.board_y = Y0 + rowIdx * YSTRIDE;
        i++;
        persistMeta(c.id, { board_x: c.board_x, board_y: c.board_y });
    });
}

function renderBoard(){
    updateBoardHeader();
    const items = canvasesInProject(currentProjectId);
    autoLayoutNulls(items);
    boardWorld.innerHTML = '';
    items.forEach(c => boardWorld.appendChild(buildCard(c)));
    boardEmptyHint.classList.toggle('hidden', items.length > 0);
    updatePasteBtn();
    refreshIcons();
}

function buildCard(c){
    const isSmart = (c.kind || 'classic') === 'smart';
    const card = document.createElement('div');
    card.className = 'ws-card'
        + (String(c.color || '').trim() ? ' cc-marked' : '')
        + (clipboardCanvasId === c.id ? ' cut' : '');
    card.dataset.canvasId = c.id;
    card.style.left = (c.board_x || 0) + 'px';
    card.style.top = (c.board_y || 0) + 'px';
    // 卡片布局：顶部=类型标签+更多按钮；中部=标题；底部=节点数·时间。已移除图标。
    card.innerHTML = `
        <div class="ws-card-top">
            <span class="ws-card-kind ${isSmart ? 'smart' : 'classic'}">${isSmart ? compactLabel('智能画布','智能','Smart') : compactLabel('普通画布','普通','Classic')}</span>
            <button class="ws-card-menu" type="button" title="${L('更多','More')}" aria-label="${L('更多','More')}"><i data-lucide="more-horizontal" class="w-4 h-4"></i></button>
        </div>
        <div class="ws-card-title">${escapeHtml(c.title)}</div>
        <div class="ws-card-meta">
            <span class="ws-card-nodes">${(c.node_count != null ? c.node_count : 0)} ${L('节点','nodes')}</span>
            <span class="ws-card-meta-dot"></span>
            <span class="ws-card-time">${formatCanvasTime(c.updated_at || c.created_at)}</span>
        </div>
        <div class="ws-card-delete-confirm">
            <div class="ws-card-delete-title">${L('移入回收站？','Move to trash?')}</div>
            <div class="ws-card-delete-actions">
                <button class="ws-card-delete-yes" type="button">${L('删除','Delete')}</button>
                <button class="ws-card-delete-no" type="button">${L('取消','Cancel')}</button>
            </div>
        </div>`;
    attachCardDrag(card, c);
    const menuBtn = card.querySelector('.ws-card-menu');
    menuBtn.onmousedown = e => e.stopPropagation();
    menuBtn.onclick = e => { e.stopPropagation(); openCardMenu(c.id, menuBtn); };
    card.querySelector('.ws-card-delete-confirm').onmousedown = e => e.stopPropagation();
    card.querySelector('.ws-card-delete-yes').onclick = e => { e.stopPropagation(); deleteCanvas(c.id); };
    card.querySelector('.ws-card-delete-no').onclick = e => { e.stopPropagation(); card.classList.remove('confirming-delete'); };
    return card;
}

/* ===== Card drag vs click ===== */
function attachCardDrag(card, c){
    card.addEventListener('mousedown', e => {
        if(e.button !== 0) return;
        if(e.target.closest('.ws-card-menu')) return;
        if(e.target.closest('.ws-card-delete-confirm')) return;
        if(card.querySelector('.ws-card-title-input')) return; // editing title
        e.stopPropagation();
        closeCardMenu();
        const startWorld = screenToWorld(e.clientX, e.clientY);
        const origX = c.board_x || 0, origY = c.board_y || 0;
        let moved = false;
        const onMove = ev => {
            const w = screenToWorld(ev.clientX, ev.clientY);
            const dx = w.x - startWorld.x, dy = w.y - startWorld.y;
            if(!moved && (Math.abs(dx * viewport.scale) > 5 || Math.abs(dy * viewport.scale) > 5)){
                moved = true; card.classList.add('dragging');
            }
            if(moved){
                c.board_x = origX + dx; c.board_y = origY + dy;
                card.style.left = c.board_x + 'px';
                card.style.top = c.board_y + 'px';
            }
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            card.classList.remove('dragging');
            if(moved){
                persistMeta(c.id, { board_x: Math.round(c.board_x), board_y: Math.round(c.board_y) });
            } else {
                openCanvas(c);
            }
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
}

function openCanvas(c){
    const enc = encodeURIComponent(c.id);
    const project = encodeURIComponent(c.project || currentProjectId || 'default');
    const version = Date.now();
    rememberProjectId(c.project || currentProjectId || 'default');
    window.location.href = (c.kind === 'smart')
        ? `/static/smart-canvas.html?id=${enc}&project=${project}&v=${version}`
        : `/static/canvas.html?id=${enc}&project=${project}&v=${version}`;
}

/* ===== Card create flow ===== */
let createCardEl = null;
let createKind = 'classic';
function closeCreateCard(){ createCardEl?.remove(); createCardEl = null; }
function openCreateCard(worldPt){
    closeCreateCard();
    closeCardMenu();
    createKind = 'classic';
    const el = document.createElement('div');
    el.className = 'ws-create-card';
    el.style.left = worldPt.x + 'px';
    el.style.top = worldPt.y + 'px';
    el.innerHTML = `
        <div class="ws-create-title">${L('新建画布','New canvas')}</div>
        <input class="ws-create-input" type="text" maxlength="80" placeholder="${L('画布名称（可留空）','Canvas name (optional)')}">
        <div class="ws-create-toggle">
            <button class="ws-create-toggle-btn active" type="button" data-kind="classic">${L('普通画布','Classic')}</button>
            <button class="ws-create-toggle-btn" type="button" data-kind="smart">${L('智能画布','Smart')}</button>
        </div>
        <div class="ws-create-actions">
            <button class="ws-create-confirm" type="button">${L('创建','Create')}</button>
            <button class="ws-create-cancel" type="button">${L('取消','Cancel')}</button>
        </div>`;
    boardWorld.appendChild(el);
    createCardEl = el;
    el.addEventListener('mousedown', e => e.stopPropagation());
    const input = el.querySelector('.ws-create-input');
    input.focus();
    el.querySelectorAll('.ws-create-toggle-btn').forEach(btn => {
        btn.onclick = () => {
            createKind = btn.dataset.kind;
            el.querySelectorAll('.ws-create-toggle-btn').forEach(b => b.classList.toggle('active', b === btn));
        };
    });
    const confirm = () => createCanvasOnBoard(input.value.trim(), createKind, worldPt);
    el.querySelector('.ws-create-confirm').onclick = confirm;
    el.querySelector('.ws-create-cancel').onclick = closeCreateCard;
    input.onkeydown = e => {
        e.stopPropagation();
        if(e.key === 'Enter'){ e.preventDefault(); confirm(); }
        if(e.key === 'Escape'){ e.preventDefault(); closeCreateCard(); }
    };
}

async function createCanvasOnBoard(title, kind, worldPt){
    const isSmart = kind === 'smart';
    const base = isSmart ? L('智能画布','Smart canvas') : L('画布','Canvas');
    const name = title || `${base} ${new Date().toLocaleTimeString(langIsEn() ? 'en-US' : 'zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    closeCreateCard();
    try {
        const res = await fetch('/api/canvases', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: name,
                icon: isSmart ? 'sparkles' : '🧩',
                kind: isSmart ? 'smart' : 'classic',
                project: currentProjectId,
                board_x: Math.round(worldPt.x),
                board_y: Math.round(worldPt.y)
            })
        });
        if(!res.ok) throw new Error('create canvas failed');
        const data = await res.json();
        const nc = data.canvas;
        if(nc){
            if(nc.project == null) nc.project = currentProjectId;
            if(nc.board_x == null) nc.board_x = Math.round(worldPt.x);
            if(nc.board_y == null) nc.board_y = Math.round(worldPt.y);
            canvases.push(nc);
            renderBoard();
            renderProjects();
        }
    } catch(e){ console.error(e); setStatus(L('创建失败','Create failed')); }
}

/* ===== Card context menu (rename / delete / move) ===== */
function closeCardMenu(){ document.querySelector('.ws-card-pop')?.remove(); }
function openCardMenu(canvasId, anchorBtn){
    closeCardMenu();
    const c = canvases.find(x => x.id === canvasId);
    if(!c) return;
    const pop = document.createElement('div');
    pop.className = 'ws-card-pop';
    pop.innerHTML = `
        <button class="ws-pop-item" data-act="rename"><i data-lucide="pencil" class="w-4 h-4"></i><span>${L('重命名','Rename')}</span></button>
        <button class="ws-pop-item" data-act="export"><i data-lucide="download" class="w-4 h-4"></i><span>${L('导出画布','Export canvas')}</span></button>
        <button class="ws-pop-item" data-act="export-assets"><i data-lucide="archive" class="w-4 h-4"></i><span>${L('导出画布 + 资源','Export with assets')}</span></button>
        <button class="ws-pop-item" data-act="cut"><i data-lucide="scissors" class="w-4 h-4"></i><span>${L('剪切到其他项目','Cut to project')}</span></button>
        <div class="ws-pop-sep"></div>
        <button class="ws-pop-item danger" data-act="delete"><i data-lucide="trash-2" class="w-4 h-4"></i><span>${L('删除','Delete')}</span></button>`;
    document.body.appendChild(pop);
    const r = anchorBtn.getBoundingClientRect();
    const w = pop.offsetWidth || 188, h = pop.offsetHeight || 120;
    let left = Math.min(r.left, window.innerWidth - w - 12);
    let top = r.bottom + 6;
    if(top + h > window.innerHeight - 12) top = r.top - h - 6;
    pop.style.left = Math.round(Math.max(12, left)) + 'px';
    pop.style.top = Math.round(Math.max(12, top)) + 'px';
    pop.querySelector('[data-act="rename"]').onclick = () => { closeCardMenu(); startCardRename(canvasId); };
    pop.querySelector('[data-act="export"]').onclick = () => { closeCardMenu(); exportCanvas(canvasId); };
    pop.querySelector('[data-act="export-assets"]').onclick = () => { closeCardMenu(); exportCanvasWithResources(canvasId); };
    pop.querySelector('[data-act="cut"]').onclick = () => { closeCardMenu(); cutCanvas(canvasId); };
    pop.querySelector('[data-act="delete"]').onclick = () => { closeCardMenu(); showCardDeleteConfirm(canvasId); };
    refreshIcons();
}

function showCardDeleteConfirm(canvasId){
    const card = boardWorld.querySelector(`.ws-card[data-canvas-id="${CSS.escape(canvasId)}"]`);
    if(!card) return;
    boardWorld.querySelectorAll('.ws-card.confirming-delete').forEach(el => {
        if(el !== card) el.classList.remove('confirming-delete');
    });
    card.classList.add('confirming-delete');
}

/* ===== Export canvas (download the full canvas JSON) ===== */
async function exportCanvas(id){
    const c = canvases.find(x => x.id === id);
    setStatus(L('正在导出...','Exporting...'));
    try {
        const res = await fetch(`/api/canvases/${encodeURIComponent(id)}`);
        if(!res.ok) throw new Error('export failed');
        const data = await res.json();
        const cv = data.canvas || data;
        const base = String((c?.title) || cv.title || 'canvas').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 60) || 'canvas';
        const blob = new Blob([JSON.stringify(cv, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = base + '.json';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        setStatus(L('已导出','Exported'));
    } catch(e){ console.error(e); setStatus(L('导出失败','Export failed')); }
}

/* ===== Export canvas with referenced resources ===== */
const ZIP_ENCODER = new TextEncoder();
let ZIP_CRC_TABLE = null;

function safeExportBase(name, fallback = 'canvas'){
    return String(name || fallback).replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 60) || fallback;
}

function collectCanvasResourceUrls(value, out = [], seen = new Set()){
    if(value == null) return out;
    if(typeof value === 'string'){
        const text = value.trim();
        if(isCanvasResourceUrl(text) && !seen.has(text)){
            seen.add(text);
            out.push(text);
        }
        return out;
    }
    if(Array.isArray(value)){
        value.forEach(item => collectCanvasResourceUrls(item, out, seen));
        return out;
    }
    if(typeof value === 'object'){
        Object.values(value).forEach(item => collectCanvasResourceUrls(item, out, seen));
    }
    return out;
}

function isCanvasResourceUrl(url){
    return url.startsWith('/assets/') || url.startsWith('/output/') || /^https?:\/\//i.test(url);
}

function exportResourceName(url, index, used){
    let name = '';
    try {
        const parsed = new URL(url, location.origin);
        name = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || '');
    } catch(e) {
        name = String(url || '').split(/[?#]/)[0].split('/').pop() || '';
    }
    name = safeExportBase(name || `resource-${String(index + 1).padStart(3, '0')}`, `resource-${index + 1}`);
    if(!/\.[a-z0-9]{1,8}$/i.test(name)) name += '.bin';
    let finalName = `resources/${name}`;
    const dot = finalName.lastIndexOf('.');
    const stem = dot > 0 ? finalName.slice(0, dot) : finalName;
    const ext = dot > 0 ? finalName.slice(dot) : '';
    let suffix = 2;
    while(used.has(finalName)){
        finalName = `${stem}-${suffix}${ext}`;
        suffix++;
    }
    used.add(finalName);
    return finalName;
}

async function fetchResourceBytes(url){
    const res = await fetch(url);
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
}

function zipCrc32(bytes){
    if(!ZIP_CRC_TABLE){
        ZIP_CRC_TABLE = new Uint32Array(256);
        for(let i = 0; i < 256; i++){
            let c = i;
            for(let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
            ZIP_CRC_TABLE[i] = c >>> 0;
        }
    }
    let crc = 0xffffffff;
    for(let i = 0; i < bytes.length; i++) crc = ZIP_CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

function zipDosTime(date = new Date()){
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const year = Math.max(1980, date.getFullYear());
    const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { time, day };
}

function zipHeader(signature, size){
    const bytes = new Uint8Array(size);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, signature, true);
    return { bytes, view };
}

function createZipBlob(entries){
    const now = zipDosTime();
    const files = [];
    const central = [];
    let offset = 0;
    entries.forEach(entry => {
        const nameBytes = ZIP_ENCODER.encode(entry.name);
        const data = entry.bytes instanceof Uint8Array ? entry.bytes : ZIP_ENCODER.encode(String(entry.bytes || ''));
        const crc = zipCrc32(data);
        const local = zipHeader(0x04034b50, 30 + nameBytes.length);
        local.view.setUint16(4, 20, true);
        local.view.setUint16(6, 0x0800, true);
        local.view.setUint16(8, 0, true);
        local.view.setUint16(10, now.time, true);
        local.view.setUint16(12, now.day, true);
        local.view.setUint32(14, crc, true);
        local.view.setUint32(18, data.length, true);
        local.view.setUint32(22, data.length, true);
        local.view.setUint16(26, nameBytes.length, true);
        local.bytes.set(nameBytes, 30);
        files.push(local.bytes, data);

        const cd = zipHeader(0x02014b50, 46 + nameBytes.length);
        cd.view.setUint16(4, 20, true);
        cd.view.setUint16(6, 20, true);
        cd.view.setUint16(8, 0x0800, true);
        cd.view.setUint16(10, 0, true);
        cd.view.setUint16(12, now.time, true);
        cd.view.setUint16(14, now.day, true);
        cd.view.setUint32(16, crc, true);
        cd.view.setUint32(20, data.length, true);
        cd.view.setUint32(24, data.length, true);
        cd.view.setUint16(28, nameBytes.length, true);
        cd.view.setUint32(42, offset, true);
        cd.bytes.set(nameBytes, 46);
        central.push(cd.bytes);
        offset += local.bytes.length + data.length;
    });
    const centralSize = central.reduce((sum, bytes) => sum + bytes.length, 0);
    const end = zipHeader(0x06054b50, 22);
    end.view.setUint16(8, entries.length, true);
    end.view.setUint16(10, entries.length, true);
    end.view.setUint32(12, centralSize, true);
    end.view.setUint32(16, offset, true);
    return new Blob([...files, ...central, end.bytes], { type:'application/zip' });
}

async function exportCanvasWithResources(id){
    const c = canvases.find(x => x.id === id);
    setStatus(L('正在收集资源...','Collecting assets...'));
    try {
        const res = await fetch(`/api/canvases/${encodeURIComponent(id)}`);
        if(!res.ok) throw new Error('export failed');
        const data = await res.json();
        const cv = data.canvas || data;
        const base = safeExportBase((c?.title) || cv.title || 'canvas');
        const urls = collectCanvasResourceUrls(cv).slice(0, 1000);
        const usedNames = new Set(['canvas.json', 'resources-manifest.json']);
        const entries = [{ name:'canvas.json', bytes:ZIP_ENCODER.encode(JSON.stringify(cv, null, 2)) }];
        const manifest = [];
        let skipped = 0;
        for(let i = 0; i < urls.length; i++){
            const url = urls[i];
            try {
                const bytes = await fetchResourceBytes(url);
                const name = exportResourceName(url, i, usedNames);
                entries.push({ name, bytes });
                manifest.push({ url, file:name, size:bytes.length });
            } catch(e) {
                skipped++;
                manifest.push({ url, skipped:true, reason:String(e?.message || e || 'fetch failed').slice(0, 120) });
            }
        }
        entries.push({ name:'resources-manifest.json', bytes:ZIP_ENCODER.encode(JSON.stringify({ canvas_id:id, resources:manifest }, null, 2)) });
        const blob = createZipBlob(entries);
        const href = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = href;
        a.download = `${base}.zip`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(href), 1500);
        const included = Math.max(0, entries.length - 2);
        setStatus(skipped
            ? L(`已导出，跳过 ${skipped} 个资源`, `Exported, skipped ${skipped} assets`)
            : L(`已导出 ${included} 个资源`, `Exported ${included} assets`));
    } catch(e){ console.error(e); setStatus(L('导出失败','Export failed')); }
}

/* ===== Cut / paste a canvas across projects ===== */
function cutCanvas(id){
    clipboardCanvasId = id;
    setStatus(L('已剪切，切换到目标项目后点“粘贴到此项目”','Cut — open another project, then Paste'));
    renderBoard();
}
function updatePasteBtn(){
    if(!pasteCanvasBtn) return;
    const show = !!clipboardCanvasId && canvases.some(x => x.id === clipboardCanvasId);
    pasteCanvasBtn.style.display = show ? 'inline-flex' : 'none';
}
async function pasteCanvas(){
    if(!clipboardCanvasId) return;
    const c = canvases.find(x => x.id === clipboardCanvasId);
    const targetPid = currentProjectId;
    clipboardCanvasId = null;
    if(!c){ updatePasteBtn(); renderBoard(); return; }
    if((c.project || 'default') === targetPid){ renderBoard(); setStatus(L('已在当前项目','Already in this project')); return; }
    await moveCanvasToProject(c.id, targetPid);
}

function startCardRename(canvasId){
    const card = boardWorld.querySelector(`.ws-card[data-canvas-id="${CSS.escape(canvasId)}"]`);
    const c = canvases.find(x => x.id === canvasId);
    if(!card || !c) return;
    const titleEl = card.querySelector('.ws-card-title');
    if(!titleEl || titleEl.querySelector('input')) return;
    const input = document.createElement('input');
    input.type = 'text'; input.maxLength = 80; input.value = c.title || '';
    input.className = 'ws-card-title-input';
    titleEl.innerHTML = ''; titleEl.appendChild(input);
    input.onmousedown = e => e.stopPropagation();
    input.onclick = e => e.stopPropagation();
    input.focus(); input.select();
    let done = false;
    const finish = commit => {
        if(done) return; done = true;
        const v = input.value.trim();
        if(commit && v && v !== c.title) setCanvasTitle(canvasId, v);
        else renderBoard();
    };
    input.onblur = () => finish(true);
    input.onkeydown = e => {
        e.stopPropagation();
        if(e.key === 'Enter'){ e.preventDefault(); finish(true); }
        if(e.key === 'Escape'){ e.preventDefault(); finish(false); }
    };
}

async function setCanvasTitle(id, title){
    const c = canvases.find(x => x.id === id);
    if(c) c.title = title;
    renderBoard();
    await persistMeta(id, { title });
}

async function moveCanvasToProject(id, projectId){
    const c = canvases.find(x => x.id === id);
    if(c) c.project = projectId;
    renderBoard();
    renderProjects();
    setStatus(L('已移动','Moved'));
    await persistMeta(id, { project: projectId });
}

/* ===== Card meta persist (POST /meta) ===== */
async function persistMeta(id, patch){
    try {
        const res = await fetch(`/api/canvases/${encodeURIComponent(id)}/meta`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch)
        });
        if(!res.ok) throw new Error('meta save failed');
        const data = await res.json();
        if(data.canvas){
            const idx = canvases.findIndex(x => x.id === id);
            if(idx >= 0) canvases[idx] = { ...canvases[idx], ...data.canvas };
        }
    } catch(e){ console.error(e); setStatus(L('保存失败','Save failed')); }
}

/* ===== Delete canvas (soft -> trash, with confirm) ===== */
async function deleteCanvas(id){
    const c = canvases.find(x => x.id === id);
    if(!c) return;
    try {
        const res = await fetch(`/api/canvases/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if(!res.ok) throw new Error('delete failed');
        canvases = canvases.filter(x => x.id !== id);
        renderBoard();
        renderProjects();
        refreshTrashCount();
        setStatus(L('已移入回收站','Moved to trash'));
    } catch(e){ console.error(e); setStatus(L('删除失败','Delete failed')); }
}

/* ===== Trash / recycle bin ===== */
async function refreshTrashCount(){
    try {
        const res = await fetch('/api/canvases/trash');
        if(!res.ok) return;
        const data = await res.json();
        deletedCanvases = data.canvases || [];
        const n = deletedCanvases.length;
        trashBadge.textContent = String(n);
        trashBadge.classList.toggle('visible', n > 0);
    } catch(e){}
}
async function openTrashView(){
    trashEntryBtn.classList.add('active');
    trashPanel.classList.add('active');
    closeCardMenu(); closeCreateCard();
    await loadTrash();
}
function closeTrashView(){
    trashEntryBtn.classList.remove('active');
    trashPanel.classList.remove('active');
}
async function loadTrash(){
    try {
        const res = await fetch('/api/canvases/trash');
        if(!res.ok) throw new Error('trash load failed');
        const data = await res.json();
        deletedCanvases = data.canvases || [];
        renderTrash();
        const n = deletedCanvases.length;
        trashBadge.textContent = String(n);
        trashBadge.classList.toggle('visible', n > 0);
    } catch(e){ console.error(e); setStatus(L('加载回收站失败','Load trash failed')); }
}
function renderTrash(){
    trashListEl.innerHTML = '';
    if(!deletedCanvases.length){
        const empty = document.createElement('div');
        empty.className = 'ws-trash-empty';
        empty.textContent = L('回收站为空','Trash is empty');
        trashListEl.appendChild(empty);
        return;
    }
    deletedCanvases.forEach(c => {
        const isSmart = (c.kind || 'classic') === 'smart';
        const projName = (projects.find(p => p.id === (c.project || 'default')) || {}).name || L('默认项目','Default');
        const card = document.createElement('div');
        card.className = 'ws-trash-card';
        card.dataset.canvasId = c.id;
        card.innerHTML = `
            <div class="ws-card-top">
                <span class="ws-card-icon">${renderCanvasIcon(isSmart && /[^\x00-\x7F]/.test(c.icon || '') ? 'sparkles' : c.icon, 17)}</span>
                <span class="ws-card-kind ${isSmart ? 'smart' : 'classic'}">${isSmart ? L('智能','Smart') : L('普通','Classic')}</span>
            </div>
            <div class="ws-card-title">${escapeHtml(c.title)}</div>
            <div class="ws-card-meta"><span class="ws-card-nodes">${escapeHtml(projName)}</span><span class="ws-card-meta-dot"></span><span class="ws-card-time">${formatCanvasTime(c.deleted_at)}</span></div>
            <div class="ws-card-actions">
                <button class="ws-trash-act restore" type="button"><i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i><span>${L('恢复','Restore')}</span></button>
                <button class="ws-trash-act purge" type="button"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i><span>${L('彻底删除','Delete')}</span></button>
            </div>
            <div class="ws-trash-confirm">
                <div class="ws-trash-confirm-title">${L('彻底删除？不可恢复','Delete permanently?')}</div>
                <div class="ws-trash-confirm-actions">
                    <button class="ws-trash-confirm-yes" type="button">${L('删除','Delete')}</button>
                    <button class="ws-trash-confirm-no" type="button">${L('取消','Cancel')}</button>
                </div>
            </div>`;
        card.querySelector('.ws-trash-act.restore').onclick = () => restoreCanvas(c.id);
        card.querySelector('.ws-trash-act.purge').onclick = () => card.classList.add('confirming');
        card.querySelector('.ws-trash-confirm-yes').onclick = () => purgeCanvas(c.id);
        card.querySelector('.ws-trash-confirm-no').onclick = () => card.classList.remove('confirming');
        trashListEl.appendChild(card);
    });
    refreshIcons();
}
async function restoreCanvas(id){
    try {
        const res = await fetch(`/api/canvases/${encodeURIComponent(id)}/restore`, { method: 'POST' });
        if(!res.ok) throw new Error('restore failed');
        deletedCanvases = deletedCanvases.filter(c => c.id !== id);
        await loadAll();           // restored canvas returns to its stored project
        renderTrash();
        setStatus(L('已恢复','Restored'));
    } catch(e){ console.error(e); setStatus(L('恢复失败','Restore failed')); }
}
async function purgeCanvas(id){
    try {
        const res = await fetch(`/api/canvases/${encodeURIComponent(id)}/purge`, { method: 'DELETE' });
        if(!res.ok) throw new Error('purge failed');
        deletedCanvases = deletedCanvases.filter(c => c.id !== id);
        renderTrash();
        const n = deletedCanvases.length;
        trashBadge.textContent = String(n);
        trashBadge.classList.toggle('visible', n > 0);
        setStatus(L('已彻底删除','Deleted'));
    } catch(e){ console.error(e); setStatus(L('删除失败','Delete failed')); }
}

/* ===== Event bindings ===== */
board.addEventListener('mousedown', onBoardPanStart);
document.addEventListener('mousemove', onBoardPanMove);
document.addEventListener('mouseup', onBoardPanEnd);
board.addEventListener('wheel', onBoardWheel, { passive: false });
board.addEventListener('dblclick', e => {
    if(e.target.closest('.ws-card') || e.target.closest('.ws-create-card')) return;
    openCreateCard(screenToWorld(e.clientX, e.clientY));
});

newCanvasBtn.addEventListener('click', () => openCreateCard(boardCenterWorld()));
emptyCreateCanvasBtn?.addEventListener('mousedown', e => e.stopPropagation());
emptyCreateCanvasBtn?.addEventListener('click', e => {
    e.stopPropagation();
    openCreateCard(boardCenterWorld());
});
boardRefreshBtn.addEventListener('click', loadAll);
boardResetViewBtn.addEventListener('click', resetView);
pasteCanvasBtn?.addEventListener('click', pasteCanvas);

newProjectBtn.addEventListener('click', openNewProject);
newProjectConfirm.addEventListener('click', createProject);
newProjectCancel.addEventListener('click', closeNewProject);
newProjectInput.addEventListener('keydown', e => {
    if(e.key === 'Enter'){ e.preventDefault(); createProject(); }
    if(e.key === 'Escape'){ e.preventDefault(); closeNewProject(); }
});

trashEntryBtn.addEventListener('click', () => {
    if(trashPanel.classList.contains('active')) closeTrashView();
    else openTrashView();
});
trashCloseBtn.addEventListener('click', closeTrashView);

// close card menu when clicking outside
document.addEventListener('mousedown', e => {
    if(document.querySelector('.ws-card-pop') && !e.target.closest('.ws-card-pop') && !e.target.closest('.ws-card-menu')){
        closeCardMenu();
    }
    if(document.querySelector('.ws-card.confirming-delete') && !e.target.closest('.ws-card.confirming-delete')){
        boardWorld.querySelectorAll('.ws-card.confirming-delete').forEach(el => el.classList.remove('confirming-delete'));
    }
});

document.addEventListener('keydown', e => {
    if(e.key !== 'Escape') return;
    closeCardMenu();
    closeCreateCard();
    boardWorld.querySelectorAll('.ws-card.confirming-delete').forEach(el => el.classList.remove('confirming-delete'));
    if(trashPanel.classList.contains('active')) closeTrashView();
});

// language switch from parent (index.html) via postMessage
window.addEventListener('message', event => {
    if(event.origin && event.origin !== location.origin) return;
    if(event.data?.type === 'studio-lang'){
        if(event.data.lang && window.StudioI18n) StudioI18n.set(event.data.lang);
        window.StudioI18n?.apply?.();
        renderProjects();
        renderBoard();
        if(trashPanel.classList.contains('active')) renderTrash();
        refreshIcons();
    }
});

/* ===== Boot ===== */
window.StudioI18n?.apply?.();
applyViewport();
loadAll();
refreshIcons();
