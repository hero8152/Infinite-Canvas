const params = new URLSearchParams(location.search);
const canvasId = params.get('id') || '';
const shell = document.getElementById('shell');
const world = document.getElementById('world');
const composer = document.getElementById('composer');
const createMenu = document.getElementById('createMenu');
const promptInput = document.getElementById('promptInput');
const mentionPicker = document.getElementById('mentionPicker');
const mentionPreview = document.getElementById('mentionPreview');
const engineSelect = document.getElementById('engineSelect');
const dynamicParams = document.getElementById('dynamicParams');
const runBtn = document.getElementById('runBtn');
const cascadeRunBtn = document.getElementById('cascadeRunBtn');
const fileInput = document.getElementById('fileInput');
const apiKindToggle = document.getElementById('apiKindToggle');
const inputThumbsRow = document.getElementById('inputThumbsRow');
const minimap = document.getElementById('minimap');
const minimapContent = document.getElementById('minimapContent');
const imageEditModal = document.getElementById('imageEditModal');
const smartLogModal = document.getElementById('smartLogModal');
const smartLogList = document.getElementById('smartLogList');
const selectionBox = document.getElementById('selectionBox');
const assetToggle = document.getElementById('assetToggle');
const assetPanel = document.getElementById('assetPanel');
const assetCloseBtn = document.getElementById('assetCloseBtn');
const assetCategorySelect = document.getElementById('assetCategorySelect');
const assetGrid = document.getElementById('assetGrid');
const assetDropZone = document.getElementById('assetDropZone');
const workflowEmpty = document.getElementById('workflowEmpty');
const assetImageControls = document.getElementById('assetImageControls');
const assetDialogBackdrop = document.getElementById('assetDialogBackdrop');
const assetDialogTitle = document.getElementById('assetDialogTitle');
const assetDialogInput = document.getElementById('assetDialogInput');
const assetDialogCancel = document.getElementById('assetDialogCancel');
const assetDialogOk = document.getElementById('assetDialogOk');
const assetHoverPreview = document.getElementById('assetHoverPreview');
const promptPresetPanel = document.getElementById('promptPresetPanel');
const promptPresetClose = document.getElementById('promptPresetClose');
const promptPresetStatus = document.getElementById('promptPresetStatus');
const promptPresetSelect = document.getElementById('promptPresetSelect');
const promptPresetName = document.getElementById('promptPresetName');
const promptPresetText = document.getElementById('promptPresetText');
const promptPresetApply = document.getElementById('promptPresetApply');
const promptPresetDelete = document.getElementById('promptPresetDelete');
const promptPresetNew = document.getElementById('promptPresetNew');
const promptPresetSave = document.getElementById('promptPresetSave');
let minimapViewport = document.getElementById('minimapViewport');
let canvas = null;
let nodes = [];
let selectedId = '';
let selectedIds = [];
let selectedImage = {nodeId:'', index:-1};
let dragState = null;
let selectionState = null;
let selectionJustFinished = false;
let resizeState = null;
let thumbDragState = null;
let uploadTargetId = '';
let pendingGroupUploadPoint = null;
let mentionRange = null;
let panState = null;
let didPan = false;
let portDragState = null;
let saveTimer = null;
let apiProviders = [];
let comfyWorkflows = [];
let assetLibrary = {categories:[]};
let assetLibraryOpen = false;
let assetTab = 'image';
let activeAssetCategoryId = '';
let mentionSource = 'input';
let mentionAssetCategoryId = '';
const PROMPT_PRESETS_KEY = 'smart_canvas_prompt_presets_v1';
let promptPresets = [];
let promptPresetDeleteArmed = false;
let createMenuPoint = {x:0, y:0};
let nodeClipboard = null;
let imageClickTimer = null;
let suppressImageClickUntil = 0;
let lastMouseWorld = null;
let lastConfigRefreshAt = 0;
let smartMinimapState = null;
let smartMinimapDrag = false;
let zoomPreviewState = null;
let runTimerInterval = null;
let smartCascadeRunning = false;
let smartLoopContext = null;
let runBtnCooldownToken = 0;
let smartRunStateToken = 0;
const smartNodeRunTokens = new Map();
let smartRhRandomValues = {};
let lastImagePasteAt = 0;
let lastNodePasteAt = 0;
let suppressNodeClickUntil = 0;
let textSelectionGuard = null;
const UNDO_LIMIT = 40;
const undoStack = [];
let undoSuppressed = false;
let pendingUndoSnapshot = null;
let runningHubWorkflowCache = {};
function capturePendingUndo(){ pendingUndoSnapshot = snapshotForUndo(); }
function commitPendingUndo(){
    if(pendingUndoSnapshot){
        undoStack.push(pendingUndoSnapshot);
        if(undoStack.length > UNDO_LIMIT) undoStack.shift();
        pendingUndoSnapshot = null;
    }
}
function discardPendingUndo(){ pendingUndoSnapshot = null; }
function snapshotForUndo(){
    return {
        nodes: JSON.parse(JSON.stringify(nodes)),
        connections: JSON.parse(JSON.stringify(canvas?.connections || [])),
        selectedId,
        selectedIds: selectedIds.slice(),
        selectedImage: {...selectedImage}
    };
}
function pushUndo(){
    if(undoSuppressed) return;
    if(!canvas) return;
    undoStack.push(snapshotForUndo());
    if(undoStack.length > UNDO_LIMIT) undoStack.shift();
}
function performUndo(){
    if(!undoStack.length){ toast(tr('smart.toastNoUndo')); return; }
    const snap = undoStack.pop();
    undoSuppressed = true;
    nodes = snap.nodes;
    if(canvas) canvas.connections = snap.connections;
    selectedId = snap.selectedId;
    selectedIds = snap.selectedIds;
    selectedImage = snap.selectedImage;
    activeComposerSubject = null;
    lastComposerNodeId = '';
    render();
    scheduleSave();
    undoSuppressed = false;
    toast(tr('smart.toastUndone'));
}
let comfyWorkflowCache = {};
let cropState = null;
let cropDrag = null;
let imageEditMode = 'crop';
let imageEditModeTouched = false;
let editDrawState = null;
let editDrawUndoStack = [];
let editDrawRedoStack = [];
const EDIT_DRAW_HISTORY_MAX = 40;
let brushTool = 'free';
let brushLabelCounter = 1;
let gridCustomMode = false;
let gridCustomLines = [];
let gridCustomOrientation = 'h';
let gridCustomHistory = [];
let gridCustomDrag = null;
let imageEditZoom = 1.0;
let imageEditBaseW = 0;
let imageEditBaseH = 0;
let previewZoom = 1.0;
let previewPan = {x:0, y:0};
let previewPanDrag = null;
let previewCompareDrag = false;
let previewComparePos = 50;
let imageEditPanDrag = null;
let previewNavState = {nodeId:'', index:0, count:0};
let viewport = {x:0, y:0, scale:1};
let settings = {
    engine:'api',
    apiKind:'image',
    provider_id:'',
    model:'',
    ratio:'square',
    resolution:'1k',
    customRatio:'',
    customRatioWidth:'',
    customRatioHeight:'',
    customSize:'',
    customWidth:'',
    customHeight:'',
    quality:'auto',
    count:1,
    videoProvider:'',
    videoModel:'',
    videoDuration:5,
    videoAspect:'16:9',
    videoResolution:'',
    videoEnhancePrompt:false,
    videoEnableUpsample:false,
    videoWatermark:false,
    videoCameraFixed:false,
    videoGenerateAudio:false,
    videoUseFrameRoles:false,
    msgenModel:'zimage',
    msCustomModel:'',
    msRatio:'square',
    msResolution:'1k',
    msCustomRatio:'',
    msCustomRatioWidth:'',
    msCustomRatioHeight:'',
    msCustomSize:'',
    msCustomWidth:'',
    msCustomHeight:'',
    comfyMode:'text',
    comfyWorkflow:'',
    comfyParams:{},
    rhConfigKey:'',
    rhPayment:'free',
    rhInstanceType:'',
    rhParams:{},
    rhRandomActive:{},
    width:1024,
    height:1024,
    enhanceStrength:0.5,
    enhanceUpscale:false,
    enhanceUpscaleRes:2048,
    editUpscale:false,
    editUpscaleRes:2048,
    promptH:124
};
const MS_GEN_MODELS = {
    zimage: { label:'ZImage', modelId:'Tongyi-MAI/Z-Image-Turbo', supportsImage:false, endpoint:'/generate' },
    qwen_edit: { label:'Qwen Edit', modelId:'Qwen/Qwen-Image-Edit-2511', supportsImage:true, endpoint:'/api/angle/generate' },
    klein_edit: { label:'Klein', modelId:'black-forest-labs/FLUX.2-klein-9B', supportsImage:true, endpoint:'/api/ms/generate' },
    custom: { label:tr('smart.custom') || '自定义', modelId:'', acceptsImage:true, endpoint:'/api/ms/generate' }
};
const SIZE_MAP = {
    square: {'1k':'1024x1024','2k':'2048x2048','4k':'2880x2880'},
    landscape: {'1k':'1536x1024','2k':'2048x1360','4k':'3520x2336'},
    portrait: {'1k':'1024x1536','2k':'1360x2048','4k':'2336x3520'},
    landscape43: {'1k':'1024x768','2k':'2048x1536','4k':'3312x2480'},
    portrait43: {'1k':'768x1024','2k':'1536x2048','4k':'2480x3312'},
    wide: {'1k':'1536x864','2k':'2048x1152','4k':'3840x2160'},
    story: {'1k':'864x1536','2k':'1152x2048','4k':'2160x3840'}
};
const RES_LONG_SIDE = { '1k':1024, '2k':2048, '4k':3840 };
const RES_PIXEL_LIMIT = { '1k':2359296, '2k':4194304, '4k':8294400 };
function tr(key){ return window.StudioI18n?.t ? window.StudioI18n.t(key) : key; }
function trf(key, values={}){
    return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), tr(key));
}
function refreshIcons(){ if(window.lucide) lucide.createIcons(); }
function uid(prefix){ return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`; }
function escapeHtml(str){ return String(str == null ? '' : str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
const escapeAttr = escapeHtml;
function cloneSmartSettings(source=settings){
    try {
        return JSON.parse(JSON.stringify(source || {}));
    } catch(e) {
        return {...(source || {})};
    }
}
const RECENT_SMART_SETTINGS_KEY = 'smart_canvas_recent_run_settings_v1';
const initialSmartSettings = cloneSmartSettings(settings);
let canvasDefaultSmartSettings = cloneSmartSettings(settings);
let recentSmartSettingsByMode = {};
function smartSettingsModeKey(source=settings){
    const engine = ['api','modelscope','comfy','runninghub'].includes(source?.engine) ? source.engine : 'api';
    if(engine === 'api') return `api:${source?.apiKind === 'video' ? 'video' : 'image'}`;
    if(engine === 'comfy') return `comfy:${['text','enhance','edit','custom'].includes(source?.comfyMode) ? source.comfyMode : 'text'}`;
    if(engine === 'runninghub') return 'runninghub';
    return 'modelscope';
}
function loadRecentSmartSettings(){
    try {
        const data = JSON.parse(localStorage.getItem(RECENT_SMART_SETTINGS_KEY) || '{}');
        recentSmartSettingsByMode = data && typeof data === 'object' ? data : {};
    } catch(e) {
        recentSmartSettingsByMode = {};
    }
}
function saveRecentSmartSettings(){
    localStorage.setItem(RECENT_SMART_SETTINGS_KEY, JSON.stringify(recentSmartSettingsByMode));
}
function recentSmartSettingsForMode(modeKey=''){
    const key = modeKey || recentSmartSettingsByMode.__lastKey || smartSettingsModeKey(settings);
    const saved = recentSmartSettingsByMode[key];
    return saved && typeof saved === 'object' ? cloneSmartSettings(saved) : {};
}
function rememberRecentSmartSettings(source=settings, node=null){
    const clean = stripOutpaintDisplaySettings(source, node);
    if(clean.outpaintResolutionLocked === true && clean.resolution === 'custom'){
        clean.resolution = '1k';
        clean.ratio = clean.ratio || 'square';
        clean.customWidth = '';
        clean.customHeight = '';
        clean.customSize = '';
    }
    delete clean.outpaintResolutionLocked;
    const key = smartSettingsModeKey(clean);
    recentSmartSettingsByMode[key] = cloneSmartSettings(clean);
    recentSmartSettingsByMode.__lastKey = key;
    saveRecentSmartSettings();
}
function applyRecentSmartSettingsForCurrentMode(){
    const key = smartSettingsModeKey(settings);
    const saved = recentSmartSettingsForMode(key);
    if(!Object.keys(saved).length) return;
    settings = {...settings, ...saved};
}
function isSmartImageNode(node){
    return Boolean(node && (node.type === 'smart-image' || !node.type));
}
function validOutpaintSize(node){
    const w = Math.round(Number(node?.outpaintSize?.width || 0));
    const h = Math.round(Number(node?.outpaintSize?.height || 0));
    return w > 0 && h > 0 ? {width:w, height:h} : null;
}
function parseSizePair(value){
    const match = String(value || '').match(/(\d+)\s*x\s*(\d+)/i);
    return match ? {width:Number(match[1]), height:Number(match[2])} : null;
}
function nearestFourKSizeFor(width, height){
    const w = Math.max(1, Number(width) || 1);
    const h = Math.max(1, Number(height) || 1);
    const ratio = w / h;
    let best = null;
    Object.entries(SIZE_MAP).forEach(([key, values]) => {
        const size = parseSizePair(values?.['4k']);
        if(!size) return;
        const score = Math.abs(Math.log(ratio / (size.width / size.height)));
        if(!best || score < best.score) best = {...size, key, score};
    });
    return best;
}
function exceedsFourKStandard(width, height){
    const standard = nearestFourKSizeFor(width, height);
    if(!standard) return false;
    return Number(width) > standard.width || Number(height) > standard.height;
}
function withOutpaintDisplaySettings(node, baseSettings){
    const size = validOutpaintSize(node);
    if(!size) return baseSettings;
    return {
        ...baseSettings,
        engine:'api',
        apiKind:'image',
        resolution:'custom',
        ratio:'',
        customWidth:size.width,
        customHeight:size.height,
        customSize:`${size.width}x${size.height}`,
        outpaintResolutionLocked:true
    };
}
function stripOutpaintDisplaySettings(settingsObj, node=null){
    const clean = cloneSmartSettings(settingsObj);
    const size = validOutpaintSize(node);
    const matchesOutpaintSize = size && clean.resolution === 'custom' && String(clean.customSize || '') === `${size.width}x${size.height}`;
    if(matchesOutpaintSize){
        clean.resolution = '1k';
        clean.ratio = clean.ratio || 'square';
        clean.customWidth = '';
        clean.customHeight = '';
        clean.customSize = '';
    }
    delete clean.outpaintResolutionLocked;
    return clean;
}
function smartSettingsForNode(node){
    const nodeSettings = stripOutpaintDisplaySettings(node?.runSettings || {}, node);
    const recentSettings = Object.keys(nodeSettings).length ? {} : recentSmartSettingsForMode();
    const base = {
        ...cloneSmartSettings(canvasDefaultSmartSettings || initialSmartSettings),
        ...recentSettings,
        ...nodeSettings
    };
    return withOutpaintDisplaySettings(node, base);
}
function activeSettingsSubject(){
    const active = activeComposerSubject?.id
        ? (nodes.find(n => n.id === activeComposerSubject.id) || activeComposerSubject)
        : selectedNode();
    return isSmartImageNode(active) ? active : null;
}
function activeComposerNode(){
    if(!lastComposerNodeId) return null;
    const id = String(lastComposerNodeId).split(':')[0] || '';
    const node = nodes.find(n => n.id === id);
    return isSmartImageNode(node) ? node : null;
}
function persistActiveSmartSettings(){
    if(!composer?.classList?.contains('open')) return;
    const subject = activeComposerNode();
    if(!subject) return;
    subject.runSettings = cloneSmartSettings(settings);
    rememberRecentSmartSettings(settings, subject);
}
function backToCanvasList(){ savePromptDraftForCurrent(); window.location.href = '/static/canvas.html?v=2026.05.22.1'; }
function promptPlainText(){
    return promptInput.innerText.replace(/\u00a0/g, ' ').trim();
}
function setPromptInputLocked(locked){
    promptInput.dataset.promptLocked = locked ? '1' : '0';
    promptInput.setAttribute('contenteditable', locked ? 'false' : 'true');
    promptInput.classList.toggle('prompt-input-locked', Boolean(locked));
    if(locked) closeMentionPicker();
}
function setPromptText(text){
    promptInput.textContent = text || '';
}
function clearPromptInput(options={}){
    if(options.preserveDraft){
        promptInput.dataset.preserveDraftOnce = '1';
        closeMentionPicker();
        return;
    }
    promptInput.textContent = '';
    closeMentionPicker();
    if(activeComposerSubject){
        activeComposerSubject.promptDraftHtml = '';
        activeComposerSubject.promptDraftText = '';
    }
}
function applyTheme(theme){
    const dark = theme === 'dark';
    document.documentElement.classList.toggle('theme-dark', dark);
    document.documentElement.classList.toggle('studio-theme-dark', dark);
    document.body?.classList.toggle('theme-dark', dark);
    document.body?.classList.toggle('studio-theme-dark', dark);
}
function toast(text){
    const el = document.getElementById('toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => el.classList.remove('show'), 1800);
}
function selectedNode(){ return nodes.find(n => n.id === selectedId) || null; }
function clearSelection(){
    savePromptDraftForCurrent();
    selectedId = '';
    selectedIds = [];
    selectedImage = {nodeId:'', index:-1};
}
function clearImageClickTimer(){
    if(imageClickTimer){
        clearTimeout(imageClickTimer);
        imageClickTimer = null;
    }
}
function syncSelectionUi(){
    world.querySelectorAll('.image-node').forEach(el => {
        const id = el.dataset.id || '';
        el.classList.toggle('selected', isNodeSelected(id));
        el.querySelectorAll('.thumb-item,.image-wrap').forEach(item => {
            const index = Number(item.dataset.imageIndex || 0);
            item.classList.toggle('image-selected', selectedImage.nodeId === id && selectedImage.index === index);
        });
    });
}
function isNodeSelected(id){
    return selectedId === id || selectedIds.includes(id);
}
function selectedNodeIds(){
    return selectedIds.length ? selectedIds.slice() : (selectedId ? [selectedId] : []);
}
function isEditableTarget(target){
    const el = target || document.activeElement;
    return !!el?.closest?.('input, textarea, select, option, [contenteditable="true"], .prompt-node-control, .prompt-input');
}
function safeScale(value){
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 1;
}
function nodeScale(node){
    const v = Number(node?.scale);
    if((node?.images || []).length > 1 && v === MEDIA_GROUP_PREVIOUS_DEFAULT_SCALE) return MEDIA_GROUP_DEFAULT_SCALE;
    return Number.isFinite(v) && v > 0 ? v : 1;
}
const MEDIA_NODE_DEFAULT_SCALE = 2;
const MEDIA_GROUP_PREVIOUS_DEFAULT_SCALE = 1.6;
const MEDIA_GROUP_DEFAULT_SCALE = 0.8;
function mediaNodeDefaultScale(node){
    if((node?.images || []).length > 1 && !Number.isFinite(Number(node?.scale))) return MEDIA_GROUP_DEFAULT_SCALE;
    return Number.isFinite(Number(node?.scale)) && Number(node.scale) > 0 ? Number(node.scale) : MEDIA_NODE_DEFAULT_SCALE;
}
function createImageNodeAt(point, images=[], options={}){
    const layout = imageLayout(images || [], mediaNodeDefaultScale({type:'smart-image', images:images || []}), {type:'smart-image', images:images || []});
    return createNode((point?.x || 0) - Math.round(layout.width / 2), (point?.y || 0) - Math.round(layout.height / 2), images, options);
}
function singleImageLayout(image, node, scale){
    const explicitW = Number(node?.w);
    const explicitH = Number(node?.h);
    if(Number.isFinite(explicitW) && explicitW > 24 && Number.isFinite(explicitH) && explicitH > 24){
        return {cols:1, rows:1, width:Math.round(explicitW), height:Math.round(explicitH), thumb:Math.round(96 * scale), single:true};
    }
    const naturalW = Number(image?.natural_w || image?.width || 0);
    const naturalH = Number(image?.natural_h || image?.height || 0);
    if(naturalW > 0 && naturalH > 0){
        const maxW = 260 * scale;
        const maxH = 220 * scale;
        const fit = Math.min(maxW / naturalW, maxH / naturalH);
        return {
            cols:1,
            rows:1,
            width:Math.max(72, Math.round(naturalW * fit)),
            height:Math.max(72, Math.round(naturalH * fit)),
            thumb:Math.round(96 * scale),
            single:true
        };
    }
    return {cols:1, rows:1, width:Math.round(260*scale), height:Math.round(180*scale), thumb:Math.round(96*scale), single:true};
}
function smartNodeInputThumbRows(count){
    return count ? Math.ceil(Math.min(10, count) / 5) : 0;
}
function smartNodeInputThumbsHeight(images){
    const rows = smartNodeInputThumbRows((images || []).length);
    return rows ? rows * 44 + (rows - 1) * 6 + 8 : 0;
}
function promptNodeInputImages(node){
    if(!node?.llmEnabled) return [];
    return inputImagesFor(node).filter(img => img?.url);
}
function smartNodeInputThumbsHtml(images, opts={}){
    const refs = (images || []).filter(img => img?.url);
    if(!refs.length) return '';
    const limit = Math.min(10, refs.length);
    const items = refs.slice(0, limit).map((img, index) => {
        const label = opts.labelPrefix ? `${opts.labelPrefix}${index + 1}` : (window.StudioI18n?.lang?.() === 'en' ? `Image ${index + 1}` : `图${index + 1}`);
        const media = isAudioMediaItem(img)
            ? `<div class="media-thumb audio-thumb"><i data-lucide="file-audio"></i><span>${escapeHtml(img.name || 'Audio')}</span></div>`
            : isVideoMediaItem(img)
            ? `<video src="${escapeHtml(img.url)}" muted preload="metadata" playsinline disablepictureinpicture controlslist="nodownload noplaybackrate noremoteplayback"></video>`
            : `<img src="${escapeHtml(img.url)}" alt="">`;
        return `<div class="smart-node-input-thumb" title="${escapeHtml(label)}">${media}<span class="smart-node-input-badge">${escapeHtml(label)}</span></div>`;
    }).join('');
    const more = refs.length > limit ? `<div class="smart-node-input-thumb smart-node-input-more">+${refs.length - limit}</div>` : '';
    return `<div class="smart-node-input-thumbs">${items}${more}</div>`;
}
function promptNodeExpandedHeight(node){
    return (node?.llmSystemEnabled ? 344 : 292) + smartNodeInputThumbsHeight(promptNodeInputImages(node));
}
function promptNodeLayoutSize(node){
    const oldCollapsedH = 230;
    const oldExpandedH = node?.llmSystemEnabled ? 400 : 340;
    const explicitW = Number(node?.w);
    const explicitH = Number(node?.h);
    const width = !Number.isFinite(explicitW) || explicitW === 360 ? 316 : explicitW;
    const fallbackH = node?.llmEnabled ? promptNodeExpandedHeight(node) : 194;
    const legacyExpandedH = node?.llmSystemEnabled ? 344 : 292;
    const height = !Number.isFinite(explicitH) || explicitH === oldCollapsedH || explicitH === oldExpandedH || explicitH === legacyExpandedH
        ? fallbackH
        : Math.max(explicitH, fallbackH);
    return {width:Math.round(width), height:Math.round(height)};
}
function imageLayout(images, scale=1, node=null){
    if(node?.type === 'smart-prompt') return {cols:1, rows:1, ...promptNodeLayoutSize(node), thumb:96, single:true};
    if(node?.type === 'smart-loop') return {cols:1, rows:1, width:Math.round(Number(node.w) || smartLoopWidth(node)), height:Math.round(Math.max(Number(node.h) || 0, smartLoopHeight(node))), thumb:96, single:true};
    const count = (images || []).length;
    const s = node?.type === 'smart-image' || !node?.type ? mediaNodeDefaultScale(node) : (Number.isFinite(scale) && scale > 0 ? scale : 1);
    if(count === 0) return {cols:1, rows:1, width:Math.round(Number(node?.w) || 260*s), height:Math.round(Number(node?.h) || 180*s), thumb:Math.round(96*s), single:true};
    if(count === 1) return singleImageLayout(images[0], node, s);
    const thumb = Math.round(192 * s);
    const cell = thumb + 8;
    const PAD = 32; // group-node has 16px padding on each side
    const grid = images.find(img => img?.grid?.type === 'grid-split')?.grid;
    const explicitW = Number(node?.w);
    const explicitH = Number(node?.h);
    if(grid){
        const cols = Math.max(1, Number(grid.cols || 1));
        const rows = Math.max(1, Number(grid.rows || 1));
        if(Number.isFinite(explicitW) && explicitW > 40 && Number.isFinite(explicitH) && explicitH > 40){
            const fittedThumb = Math.max(28, Math.floor(Math.min((explicitW - PAD - (cols - 1) * 8) / cols, (explicitH - PAD - (rows - 1) * 8) / rows)));
            return {cols, rows, width:Math.round(explicitW), height:Math.round(explicitH), thumb:fittedThumb};
        }
        return {cols, rows, width:Math.max(Math.round(226*s), cols * cell + PAD), height:rows * cell + PAD, thumb};
    }
    const cols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(count))));
    const rows = Math.ceil(count / cols);
    if(Number.isFinite(explicitW) && explicitW > 40 && Number.isFinite(explicitH) && explicitH > 40){
        const fittedThumb = Math.max(28, Math.floor(Math.min((explicitW - PAD - (cols - 1) * 8) / cols, (explicitH - PAD - (rows - 1) * 8) / rows)));
        return {cols, rows, width:Math.round(explicitW), height:Math.round(explicitH), thumb:fittedThumb};
    }
    const width = Math.max(Math.round(226*s), cols * cell + PAD);
    const height = rows * cell + PAD;
    return {cols, rows, width, height, thumb};
}
function smartLoopCount(node){
    return Math.max(1, Math.min(100, Number(node?.count || 1) || 1));
}
function smartLoopWidth(node){
    return 340;
}
function smartLoopHeight(node){
    let h = 168;
    if(node?.imageInput) h += 72;
    if(node?.showPrompt) h += 126;
    h += smartNodeInputThumbsHeight(smartLoopPreviewImages(node));
    return h;
}
function fitSmartLoopNode(node){
    if(!node || node.type !== 'smart-loop') return;
    node.w = smartLoopWidth(node);
    node.h = smartLoopHeight(node);
}
function nodeRect(node){
    const layout = imageLayout(node.images || [], nodeScale(node), node);
    return {x:node.x || 0, y:node.y || 0, width:layout.width, height:layout.height};
}
function applyViewport(){
    world.style.transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`;
    shell.style.backgroundSize = '24px 24px';
    shell.style.backgroundPosition = '0 0';
    renderMinimap();
}
function screenToWorld(event){
    const rect = shell.getBoundingClientRect();
    return {
        x:(event.clientX - rect.left - viewport.x) / viewport.scale,
        y:(event.clientY - rect.top - viewport.y) / viewport.scale
    };
}
function viewportCenter(){
    return {
        x:(shell.clientWidth / 2 - viewport.x) / viewport.scale,
        y:(shell.clientHeight / 2 - viewport.y) / viewport.scale
    };
}
function renderMinimap(){
    if(!minimapContent || !minimapViewport) return;
    const width = minimapContent.clientWidth || 170;
    const height = minimapContent.clientHeight || 108;
    const viewW = shell.clientWidth / viewport.scale;
    const viewH = shell.clientHeight / viewport.scale;
    const viewX = -viewport.x / viewport.scale;
    const viewY = -viewport.y / viewport.scale;
    const rects = nodes.map(nodeRect);
    rects.push({x:viewX, y:viewY, width:viewW, height:viewH});
    const minX = Math.min(...rects.map(r => r.x), -200);
    const minY = Math.min(...rects.map(r => r.y), -200);
    const maxX = Math.max(...rects.map(r => r.x + r.width), viewX + viewW + 200);
    const maxY = Math.max(...rects.map(r => r.y + r.height), viewY + viewH + 200);
    const scale = Math.min(width / Math.max(1, maxX - minX), height / Math.max(1, maxY - minY));
    const offsetX = (width - (maxX - minX) * scale) / 2;
    const offsetY = (height - (maxY - minY) * scale) / 2;
    smartMinimapState = {minX, minY, scale, offsetX, offsetY, width, height};
    const project = r => ({
        left:offsetX + (r.x - minX) * scale,
        top:offsetY + (r.y - minY) * scale,
        width:Math.max(4, r.width * scale),
        height:Math.max(4, r.height * scale)
    });
    const nodeHtml = rects.slice(0, -1).map(r => {
        const p = project(r);
        return `<div class="minimap-node" style="left:${p.left}px;top:${p.top}px;width:${p.width}px;height:${p.height}px"></div>`;
    }).join('');
    const view = project({x:viewX, y:viewY, width:viewW, height:viewH});
    minimapContent.innerHTML = `${nodeHtml}<div id="minimapViewport" class="smart-minimap-viewport" style="left:${view.left}px;top:${view.top}px;width:${view.width}px;height:${view.height}px"></div>`;
    minimapViewport = document.getElementById('minimapViewport');
}
function minimapEventToWorld(event){
    if(!smartMinimapState) renderMinimap();
    const state = smartMinimapState;
    if(!state) return viewportCenter();
    const rect = minimapContent.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;
    return {
        x:state.minX + (mx - state.offsetX) / Math.max(0.0001, state.scale),
        y:state.minY + (my - state.offsetY) / Math.max(0.0001, state.scale)
    };
}
function centerViewportOnWorldPoint(point){
    viewport.x = shell.clientWidth / 2 - point.x * viewport.scale;
    viewport.y = shell.clientHeight / 2 - point.y * viewport.scale;
    applyViewport();
    scheduleSave();
}
function fitAllNodesViewport(){
    if(!nodes.length){
        viewport.scale = 0.45;
        viewport.x = shell.clientWidth / 2;
        viewport.y = shell.clientHeight / 2;
        applyViewport();
        scheduleSave();
        return;
    }
    const rects = nodes.map(nodeRect);
    const minX = Math.min(...rects.map(r => r.x));
    const minY = Math.min(...rects.map(r => r.y));
    const maxX = Math.max(...rects.map(r => r.x + r.width));
    const maxY = Math.max(...rects.map(r => r.y + r.height));
    const pad = 160;
    const width = Math.max(1, maxX - minX + pad * 2);
    const height = Math.max(1, maxY - minY + pad * 2);
    const nextScale = Math.max(0.06, Math.min(0.82, (shell.clientWidth - 80) / width, (shell.clientHeight - 80) / height));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    viewport.scale = nextScale;
    viewport.x = shell.clientWidth / 2 - cx * viewport.scale;
    viewport.y = shell.clientHeight / 2 - cy * viewport.scale;
    applyViewport();
    scheduleSave();
}
function enterZoomPreview(){
    if(zoomPreviewState) return;
    zoomPreviewState = {...viewport};
    shell.classList.add('zoom-preview');
    closeCreateMenu();
    fitAllNodesViewport();
}
function exitZoomPreview(point=null){
    if(!zoomPreviewState) return false;
    const prev = zoomPreviewState;
    zoomPreviewState = null;
    shell.classList.remove('zoom-preview');
    viewport.scale = prev.scale;
    if(point){
        viewport.x = shell.clientWidth / 2 - point.x * viewport.scale;
        viewport.y = shell.clientHeight / 2 - point.y * viewport.scale;
    } else {
        viewport.x = prev.x;
        viewport.y = prev.y;
    }
    applyViewport();
    scheduleSave();
    return true;
}
function toggleZoomPreview(){
    if(zoomPreviewState) exitZoomPreview();
    else enterZoomPreview();
}
function imageProviders(){
    return (apiProviders || []).filter(p => p.enabled !== false && p.id !== 'modelscope' && p.id !== 'runninghub' && (p.image_models || []).length);
}
function runningHubProvider(){
    return (apiProviders || []).find(p => p.id === 'runninghub' && p.enabled !== false) || null;
}
function runningHubEntries(kind){
    const provider = runningHubProvider();
    const key = kind === 'workflow' ? 'rh_workflows' : 'rh_apps';
    return Array.isArray(provider?.[key]) ? provider[key] : [];
}
function runningHubEntryId(entry, kind){
    return String(kind === 'workflow' ? (entry?.workflowId || entry?.id || '') : (entry?.appId || entry?.webappId || entry?.id || '')).trim();
}
function runningHubEntryLabel(entry, kind){
    const id = runningHubEntryId(entry, kind);
    return entry?.title || entry?.name || (kind === 'workflow' ? `Workflow ${id}` : `AI App ${id}`);
}
function runningHubEntryKey(kind, id){
    return `${kind}:${String(id || '').trim()}`;
}
function parseRunningHubEntryKey(value){
    const text = String(value || '').trim();
    const match = text.match(/^(app|workflow):(.+)$/);
    return match ? {kind:match[1], id:match[2].trim()} : null;
}
function runningHubAllEntries(){
    return [
        ...runningHubEntries('app').map(entry => ({kind:'app', id:runningHubEntryId(entry, 'app'), entry})).filter(x => x.id),
        ...runningHubEntries('workflow').map(entry => ({kind:'workflow', id:runningHubEntryId(entry, 'workflow'), entry})).filter(x => x.id)
    ];
}
function selectedRunningHubRef(){
    const all = runningHubAllEntries();
    const parsed = parseRunningHubEntryKey(settings.rhConfigKey || '');
    let ref = parsed ? all.find(item => item.kind === parsed.kind && item.id === parsed.id) : null;
    if(!ref && all.length) ref = all[0];
    if(ref) settings.rhConfigKey = runningHubEntryKey(ref.kind, ref.id);
    return ref || null;
}
function rhEntryFields(entry){
    return Array.isArray(entry?.fields) ? entry.fields : [];
}
function rhCurrentKind(){
    return selectedRunningHubRef()?.kind || 'app';
}
function rhActiveFields(){
    const ref = selectedRunningHubRef();
    let fields = rhEntryFields(ref?.entry);
    if(ref?.kind === 'workflow'){
        const cached = runningHubWorkflowCache[ref.id];
        if(Array.isArray(cached?.fields) && cached.fields.length) fields = cached.fields;
    }
    fields = fields.filter(f => f.enabled === true);
    return sortRunningHubFields(fields);
}
function sortRunningHubFields(fields){
    return [...(fields || [])].sort((a, b) => {
        const ak = rhFieldKind(a), bk = rhFieldKind(b);
        if(ak === 'image' && bk === 'image'){
            const ao = Number(a.imageOrder) || 9999;
            const bo = Number(b.imageOrder) || 9999;
            if(ao !== bo) return ao - bo;
        }
        if(ak === 'image' && bk !== 'image') return -1;
        if(ak !== 'image' && bk === 'image') return 1;
        return String(a.nodeId || '').localeCompare(String(b.nodeId || ''), undefined, {numeric:true}) || String(a.fieldName || '').localeCompare(String(b.fieldName || ''));
    });
}
function chatApiProviders(){
    return (apiProviders || []).filter(p => p.enabled !== false && (p.chat_models || []).length);
}
function resolveChatProviderId(providerId=''){
    const providers = chatApiProviders();
    if(providers.some(p => p.id === providerId)) return providerId;
    return providers[0]?.id || 'comfly';
}
function providerChatModels(providerId){
    const provider = chatApiProviders().find(p => p.id === providerId);
    return [...new Set(provider?.chat_models || [])];
}
function resolveChatModel(model='', providerId=''){
    const models = providerChatModels(resolveChatProviderId(providerId));
    return models.includes(model) ? model : (models[0] || model || 'gpt-4o-mini');
}
function chatProviderOptions(selectedId=''){
    const selected = resolveChatProviderId(selectedId);
    return chatApiProviders().map(provider => `<option value="${escapeHtml(provider.id)}" ${provider.id === selected ? 'selected' : ''}>${escapeHtml(provider.name || provider.id)}</option>`).join('');
}
function chatModelOptions(selectedModel='', providerId=''){
    const selectedProvider = resolveChatProviderId(providerId);
    const models = providerChatModels(selectedProvider);
    const selected = resolveChatModel(selectedModel, selectedProvider);
    return [...new Set([selected, ...models].filter(Boolean))].map(model => `<option value="${escapeHtml(model)}" ${model === selected ? 'selected' : ''}>${escapeHtml(model)}</option>`).join('');
}
function apiProviderById(providerId){
    return (apiProviders || []).find(p => p.id === providerId) || imageProviders()[0] || null;
}
function providerImageModels(providerId){
    return (apiProviders || []).find(p => p.id === providerId)?.image_models || [];
}
function modelscopeProvider(){
    return (apiProviders || []).find(p => p.id === 'modelscope' && p.enabled !== false) || null;
}
function modelscopeImageModels(){
    return modelscopeProvider()?.image_models || ['Tongyi-MAI/Z-Image-Turbo'];
}
const DEFAULT_VIDEO_MODELS = ['veo3-fast','veo3','sora','runway','kling','pika','minimax-video','wan-v2','seedance-1.0-pro','jimeng-vide-3.0','jimeng-video-3.0-pro'];
function videoApiProviders(){
    const fromConfig = (apiProviders || []).filter(p => p.enabled !== false && p.id !== 'runninghub' && (p.video_models || []).length);
    if(fromConfig.length) return fromConfig;
    return [{id:'comfly', name:'Comfly', video_models:DEFAULT_VIDEO_MODELS, enabled:true}];
}
function videoProviderById(providerId){
    return videoApiProviders().find(p => p.id === providerId) || videoApiProviders()[0] || null;
}
function providerVideoModels(providerId){
    const provider = videoApiProviders().find(p => p.id === providerId);
    const models = provider?.video_models || DEFAULT_VIDEO_MODELS;
    return [...new Set(models)];
}
function renderVideoProviderControl(providers){
    const current = videoProviderById(settings.videoProvider);
    return `<div class="smart-control provider-control">
        <button class="smart-pill" type="button"><i data-lucide="plug-zap"></i><span class="sub">${escapeHtml(current?.name || settings.videoProvider || tr('smart.platform'))}</span></button>
        <div class="smart-popover compact-popover">
            <div class="smart-popover-title">${escapeHtml(tr('smart.videoPlatform'))}</div>
            <div class="model-list">
                ${providers.map(p => `<button type="button" class="direct-option ${p.id === settings.videoProvider ? 'active' : ''}" data-smart-param="videoProvider" data-smart-value="${escapeHtml(p.id)}"><span>${escapeHtml(p.name || p.id)}</span></button>`).join('') || `<div class="muted-note">${escapeHtml(tr('smart.noVideoPlatform'))}</div>`}
            </div>
        </div>
    </div>`;
}
function renderVideoModelControl(models){
    return `<div class="smart-control model-control">
        <button class="smart-pill" type="button"><i data-lucide="film"></i><span class="sub">${escapeHtml(settings.videoModel || tr('smart.model'))}</span></button>
        <div class="smart-popover compact-popover">
            <div class="smart-popover-title">${escapeHtml(tr('smart.videoModel'))}</div>
            <div class="model-list">
                ${models.map(m => `<button type="button" class="direct-option ${m === settings.videoModel ? 'active' : ''}" data-smart-param="videoModel" data-smart-value="${escapeHtml(m)}"><span>${escapeHtml(m)}</span></button>`).join('') || `<div class="muted-note">${escapeHtml(tr('smart.noVideoModel'))}</div>`}
            </div>
        </div>
    </div>`;
}
function renderVideoDurationControl(){
    const v = Math.max(1, Math.min(60, Number(settings.videoDuration) || 5));
    const quick = [3, 4, 5, 6, 8, 10, 12, 15];
    return `<div class="smart-control duration-control" title="${escapeHtml(tr('smart.videoDurationTip'))}">
        <button class="smart-pill" type="button"><i data-lucide="timer"></i><span>${v}s</span></button>
        <div class="smart-popover compact-popover">
            <div class="smart-popover-title">${escapeHtml(tr('smart.videoDuration'))}</div>
            <div class="duration-grid">
                ${quick.map(n => `<button type="button" class="duration-option ${n === v ? 'active' : ''}" data-smart-param="videoDuration" data-smart-value="${n}">${n}s</button>`).join('')}
            </div>
            <label class="duration-custom">
                <span>${escapeHtml(tr('smart.custom'))}</span>
                <input type="number" min="1" max="60" step="1" data-param="videoDuration" value="${v}">
            </label>
        </div>
    </div>`;
}
function renderVideoAspectControl(){
    const options = [
        ['16:9','16:9'], ['9:16','9:16'], ['1:1','1:1'], ['4:3','4:3'], ['3:4','3:4'],
        ['21:9','21:9'], ['9:21','9:21'], ['keep_ratio', tr('smart.videoAspectKeep')], ['adaptive', tr('smart.videoAspectAdaptive')]
    ];
    const value = settings.videoAspect || '16:9';
    const labelMap = Object.fromEntries(options);
    return `<div class="smart-control aspect-control">
        <button class="smart-pill" type="button"><i data-lucide="scan"></i><span>${escapeHtml(labelMap[value] || value)}</span></button>
        <div class="smart-popover">
            <div class="smart-popover-title">${escapeHtml(tr('smart.videoAspect'))}</div>
            <div class="ratio-grid">
                ${options.map(([v,l]) => `<button type="button" class="ratio-option ${v === value ? 'active' : ''}" data-smart-param="videoAspect" data-smart-value="${escapeHtml(v)}"><span class="ratio-icon ${videoAspectIconClass(v)}"></span><span>${escapeHtml(l)}</span></button>`).join('')}
            </div>
        </div>
    </div>`;
}
function renderVideoResolutionControl(){
    const options = [['', tr('smart.videoResAuto')], ['480p','480P'], ['720p','720P'], ['1080p','1080P'], ['780P','780P']];
    const value = settings.videoResolution || '';
    const labelMap = Object.fromEntries(options);
    return `<div class="smart-control resolution-control">
        <button class="smart-pill" type="button"><i data-lucide="monitor"></i><span>${escapeHtml(labelMap[value] || value || tr('smart.videoResAuto'))}</span></button>
        <div class="smart-popover compact-popover">
            <div class="smart-popover-title">${escapeHtml(tr('smart.videoResolution'))}</div>
            <div class="model-list">
                ${options.map(([v,l]) => `<button type="button" class="direct-option ${v === value ? 'active' : ''}" data-smart-param="videoResolution" data-smart-value="${escapeHtml(v)}"><span>${escapeHtml(l)}</span></button>`).join('')}
            </div>
        </div>
    </div>`;
}
function renderVideoToggleControl(key, label){
    const on = !!settings[key];
    return `<button type="button" class="setting-check ${on ? 'active' : ''}" data-toggle-param="${escapeHtml(key)}"><span class="check-box"></span><span>${escapeHtml(label)}</span></button>`;
}
function optionHtml(value, label, selected){
    return `<option value="${escapeHtml(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${escapeHtml(label ?? value)}</option>`;
}
function parseSizeValue(value){
    const match = String(value || '').trim().match(/^(\d+)\s*[xX*]\s*(\d+)$/);
    return match ? {width:match[1], height:match[2]} : null;
}
function parseRatioValue(value){
    const raw = String(value || '').trim();
    const parts = raw.includes(':') ? raw.split(':') : raw.split(/[xX*]/);
    if(parts.length !== 2) return 0;
    const w = Number(parts[0]);
    const h = Number(parts[1]);
    return w > 0 && h > 0 ? w / h : 0;
}
function apiImageSize(ratioValue, resolutionValue, customRatioValue='', customSizeValue=''){
    if(resolutionValue === 'custom') return String(customSizeValue || '').trim();
    const resolutionKey = resolutionValue || '1k';
    if(ratioValue === 'custom' || ratioValue === 'source'){
        const parsed = parseRatioValue(customRatioValue);
        const longSide = RES_LONG_SIDE[resolutionKey] || 1024;
        if(parsed){
            const pixelLimit = RES_PIXEL_LIMIT[resolutionKey] || (longSide * longSide);
            const rawWidth = parsed >= 1 ? longSide : Math.min(longSide * parsed, Math.sqrt(pixelLimit * parsed));
            const rawHeight = parsed >= 1 ? Math.min(longSide / parsed, Math.sqrt(pixelLimit / parsed)) : longSide;
            const width = Math.floor(rawWidth / 16) * 16;
            const height = Math.floor(rawHeight / 16) * 16;
            return `${Math.max(64, width)}x${Math.max(64, height)}`;
        }
    }
    const ratioKey = ratioValue && SIZE_MAP[ratioValue] ? ratioValue : 'square';
    return SIZE_MAP[ratioKey]?.[resolutionKey] || SIZE_MAP.square[resolutionKey] || SIZE_MAP.square['1k'];
}
function normalizeApiSizeSettings(prefix=''){
    const ratioKey = prefix ? `${prefix}Ratio` : 'ratio';
    const resKey = prefix ? `${prefix}Resolution` : 'resolution';
}
async function ensureComfyWorkflow(name){
    if(!name) return null;
    if(comfyWorkflowCache[name]) return comfyWorkflowCache[name];
    const data = await fetch(`/api/workflows/${encodeURIComponent(name)}`).then(r => r.ok ? r.json() : null).catch(() => null);
    if(data) comfyWorkflowCache[name] = data;
    return data;
}
function currentComfyFields(){
    return comfyWorkflowCache[settings.comfyWorkflow]?.config?.fields || [];
}
function comfyParamValue(field){
    settings.comfyParams = settings.comfyParams || {};
    if(settings.comfyParams[field.id] !== undefined) return settings.comfyParams[field.id];
    return field.default ?? (field.type === 'boolean' ? false : (field.type === 'number' || field.type === 'slider' ? 0 : ''));
}
function updateProviderModels(){ renderDynamicParams(); }
function renderDynamicParams(){
    if(!dynamicParams) return;
    settings.engine = ['api','modelscope','comfy','runninghub'].includes(settings.engine) ? settings.engine : 'api';
    settings.apiKind = settings.apiKind === 'video' ? 'video' : 'image';
    engineSelect.value = settings.engine;
    syncApiKindToggleVisibility();
    if(settings.engine === 'api'){
        if(settings.apiKind === 'video') renderApiVideoParams();
        else renderApiParams();
    }
    else if(settings.engine === 'modelscope') renderMsParams();
    else if(settings.engine === 'runninghub') renderRunningHubParams();
    else renderComfyParams();
    bindDynamicParams();
    persistActiveSmartSettings();
    if(window.lucide) lucide.createIcons();
}
function renderApiParams(){
    const providers = imageProviders();
    if(!settings.provider_id || !providers.some(p => p.id === settings.provider_id)) settings.provider_id = providers[0]?.id || '';
    const models = providerImageModels(settings.provider_id);
    if(!settings.model || !models.includes(settings.model)) settings.model = models[0] || '';
    normalizeApiSizeSettings('');
    const outpaintLocked = settings.outpaintResolutionLocked === true;
    dynamicParams.innerHTML = `
        ${renderProviderControl(providers)}
        ${renderModelControl(models)}
        ${renderResolutionControl('')}
        ${outpaintLocked ? '' : renderRatioControl('', true)}
        ${outpaintLocked ? '' : renderInlineCustomSizeFields('')}
        ${outpaintLocked ? '' : renderInlineCustomRatioFields('')}
        ${renderQualityControl()}
        ${renderCountVisualControl()}
    `;
}
function renderApiVideoParams(){
    const providers = videoApiProviders();
    if(!settings.videoProvider || !providers.some(p => p.id === settings.videoProvider)) settings.videoProvider = providers[0]?.id || 'comfly';
    const models = providerVideoModels(settings.videoProvider);
    if(!settings.videoModel || !models.includes(settings.videoModel)) settings.videoModel = models[0] || 'veo3-fast';
    dynamicParams.innerHTML = `
        ${renderVideoProviderControl(providers)}
        ${renderVideoModelControl(models)}
        ${renderVideoResolutionControl()}
        ${renderVideoAspectControl()}
        ${renderVideoDurationControl()}
        ${renderVideoToggleControl('videoEnhancePrompt', tr('smart.videoEnhancePrompt'))}
        ${renderVideoToggleControl('videoEnableUpsample', tr('smart.videoUpsample'))}
        ${renderVideoToggleControl('videoGenerateAudio', tr('smart.videoGenerateAudio'))}
        ${renderVideoToggleControl('videoCameraFixed', tr('smart.videoCameraFixed'))}
        ${renderVideoToggleControl('videoWatermark', tr('smart.videoWatermark'))}
        ${renderVideoToggleControl('videoUseFrameRoles', tr('smart.videoUseFrameRoles'))}
    `;
}
function renderRunningHubParams(){
    const ref = selectedRunningHubRef();
    const fields = rhActiveFields();
    settings.rhPayment = settings.rhPayment === 'wallet' ? 'wallet' : 'free';
    settings.rhParams = settings.rhParams || {};
    settings.rhRandomActive = settings.rhRandomActive || {};
    if(!ref){
        dynamicParams.innerHTML = `<div class="muted-note">${escapeHtml(tr('smart.rhNeedConfig'))}</div>`;
        return;
    }
    const mediaFields = fields.filter(f => ['image','video','audio'].includes(rhFieldRole(f))).length;
    const promptFields = fields.filter(f => rhFieldRole(f) === 'prompt').length;
    dynamicParams.innerHTML = `
        ${renderRhConfigControl(ref)}
        ${renderRhPaymentControl()}
        ${renderRhMachineControl()}
        <div class="rh-mini-summary">${escapeHtml(mediaFields)} 素材 · ${escapeHtml(promptFields)} 提示词</div>
        ${fields.length ? fields.filter(f => !['image','video','audio','prompt'].includes(rhFieldRole(f))).map(renderRhSettingField).join('') : `<div class="muted-note">${escapeHtml(tr('smart.rhNeedFields'))}</div>`}
    `;
}
function renderRhConfigControl(ref){
    const apps = runningHubEntries('app');
    const workflows = runningHubEntries('workflow');
    const selected = ref ? runningHubEntryKey(ref.kind, ref.id) : '';
    const groupHtml = (kind, entries, label) => entries.length ? `
        <div class="model-list-label">${escapeHtml(label)}<span class="count">${entries.length}</span></div>
        ${entries.map(entry => {
            const id = runningHubEntryId(entry, kind);
            const key = runningHubEntryKey(kind, id);
            return `<button type="button" class="direct-option ${key === selected ? 'active' : ''}" data-smart-param="rhConfigKey" data-smart-value="${escapeHtml(key)}"><span>${escapeHtml(runningHubEntryLabel(entry, kind))}</span></button>`;
        }).join('')}
    ` : '';
    return `<div class="smart-control rh-config-control">
        <button class="smart-pill" type="button"><i data-lucide="workflow"></i><span class="sub">${escapeHtml(ref ? runningHubEntryLabel(ref.entry, ref.kind) : tr('smart.rhConfig'))}</span></button>
        <div class="smart-popover compact-popover">
            <div class="smart-popover-title">${escapeHtml(tr('smart.rhConfig'))}</div>
            <div class="model-list">
                ${groupHtml('app', apps, 'AI 应用')}${groupHtml('workflow', workflows, '工作流') || ''}
            </div>
        </div>
    </div>`;
}
function renderRhPaymentControl(){
    const value = settings.rhPayment === 'wallet' ? 'wallet' : 'free';
    const labels = {free:tr('smart.rhFreeKey'), wallet:tr('smart.rhWalletKey')};
    return `<div class="smart-control rh-payment-control">
        <button class="smart-pill" type="button"><i data-lucide="key-round"></i><span>${escapeHtml(labels[value])}</span></button>
        <div class="smart-popover compact-popover">
            <div class="smart-popover-title">${escapeHtml(tr('smart.rhKey'))}</div>
            <div class="model-list">
                ${Object.entries(labels).map(([key, label]) => `<button type="button" class="direct-option ${key === value ? 'active' : ''}" data-smart-param="rhPayment" data-smart-value="${escapeHtml(key)}"><span>${escapeHtml(label)}</span></button>`).join('')}
            </div>
        </div>
    </div>`;
}
function renderRhMachineControl(){
    const value = settings.rhInstanceType === 'plus' ? 'plus' : '';
    const labels = {'':'24G', plus:'48G'};
    return `<div class="smart-control rh-machine-control">
        <button class="smart-pill" type="button"><i data-lucide="cpu"></i><span>${escapeHtml(labels[value])}</span></button>
        <div class="smart-popover compact-popover">
            <div class="smart-popover-title">${escapeHtml(tr('smart.rhMachine'))}</div>
            <div class="model-list">
                ${Object.entries(labels).map(([key, label]) => `<button type="button" class="direct-option ${key === value ? 'active' : ''}" data-smart-param="rhInstanceType" data-smart-value="${escapeHtml(key)}"><span>${escapeHtml(label)}</span></button>`).join('')}
            </div>
        </div>
    </div>`;
}
function renderMsParams(){
    settings.msgenModel = MS_GEN_MODELS[settings.msgenModel] ? settings.msgenModel : 'zimage';
    if(!settings.msCustomModel) settings.msCustomModel = modelscopeImageModels()[0] || 'Tongyi-MAI/Z-Image-Turbo';
    normalizeApiSizeSettings('ms');
    dynamicParams.innerHTML = `
        ${renderMsFunctionControl()}
        ${renderMsCustomModelPill()}
        ${renderResolutionControl('ms')}
        ${renderRatioControl('ms', false)}
        ${renderInlineCustomSizeFields('ms')}
        ${renderInlineCustomRatioFields('ms')}
        ${renderCountVisualControl()}
    `;
}
function renderComfyParams(){
    settings.comfyMode = ['text','enhance','edit','custom'].includes(settings.comfyMode) ? settings.comfyMode : 'text';
    const modeOptions = [
        ['text', tr('canvas.comfyModeText') || '文生图'],
        ['enhance', tr('canvas.comfyModeEnhance') || '图片增强'],
        ['edit', tr('canvas.comfyModeEdit') || '图片编辑'],
        ['custom', tr('canvas.comfyModeCustom') || '自定义']
    ];
    if(settings.comfyMode === 'custom'){
        if(!settings.comfyWorkflow || !comfyWorkflows.some(w => w.name === settings.comfyWorkflow)) settings.comfyWorkflow = comfyWorkflows[0]?.name || '';
        if(settings.comfyWorkflow && !comfyWorkflowCache[settings.comfyWorkflow]) ensureComfyWorkflow(settings.comfyWorkflow).then(renderDynamicParams);
    }
    let html = '';
    if(settings.comfyMode === 'text'){
        html += `<div class="num-compact"><span class="num-label">${escapeHtml(tr('smart.width'))}</span><input type="number" data-param="width" value="${Number(settings.width || 1024)}"></div>
            <div class="num-compact"><span class="num-label">${escapeHtml(tr('smart.height'))}</span><input type="number" data-param="height" value="${Number(settings.height || 1024)}"></div>`;
    } else if(settings.comfyMode === 'enhance'){
        html += `<div class="num-compact"><span class="num-label">${escapeHtml(tr('smart.strength'))}</span><input type="number" min="0.1" max="1" step="0.05" data-param="enhanceStrength" value="${Number(settings.enhanceStrength ?? 0.5)}"></div>
            <button type="button" class="setting-check ${settings.enhanceUpscale ? 'active' : ''}" data-toggle-param="enhanceUpscale"><span class="check-box"></span><span>${escapeHtml(tr('smart.superResolution'))}</span></button>
            ${settings.enhanceUpscale ? renderUpscalePill('enhanceUpscaleRes', Number(settings.enhanceUpscaleRes || 2048)) : ''}`;
    } else if(settings.comfyMode === 'edit'){
        html += `<button type="button" class="setting-check ${settings.editUpscale ? 'active' : ''}" data-toggle-param="editUpscale"><span class="check-box"></span><span>${escapeHtml(tr('smart.superResolution'))}</span></button>
            ${settings.editUpscale ? renderUpscalePill('editUpscaleRes', Number(settings.editUpscaleRes || 2048)) : ''}`;
    } else {
        const wf = comfyWorkflowCache[settings.comfyWorkflow];
        const fields = (wf?.config?.fields || []).filter(f => comfyFieldKind(f) === 'setting');
        html += renderComfyWorkflowControl();
        html += fields.length ? fields.map(renderComfySettingField).join('') : (settings.comfyWorkflow ? '' : `<div class="muted-note">${escapeHtml(tr('smart.noWorkflow'))}</div>`);
    }
    dynamicParams.innerHTML = `
        <div class="smart-control comfy-mode-control">
            <button class="smart-pill" type="button"><i data-lucide="workflow"></i><span>${escapeHtml(modeOptions.find(([v]) => v === settings.comfyMode)?.[1] || 'ComfyUI')}</span></button>
            <div class="smart-popover compact-popover">
                <div class="smart-popover-title">${escapeHtml(tr('smart.comfyMode'))}</div>
                <div class="model-list">
                    ${modeOptions.map(([value, label]) => `<button type="button" class="direct-option ${value === settings.comfyMode ? 'active' : ''}" data-smart-param="comfyMode" data-smart-value="${escapeHtml(value)}"><span>${escapeHtml(label)}</span></button>`).join('')}
                </div>
            </div>
        </div>
        ${html}
    `;
}
function renderUpscalePill(paramKey, current){
    const opts = [2048, 4096];
    const labels = {2048:'2X / 2048', 4096:'4X / 4096'};
    return `<div class="smart-control upscale-control">
        <button class="smart-pill" type="button"><i data-lucide="maximize-2"></i><span>${escapeHtml(labels[current] || `${current}px`)}</span></button>
        <div class="smart-popover compact-popover">
            <div class="smart-popover-title">${escapeHtml(tr('smart.upscaleTarget'))}</div>
            <div class="model-list">
                ${opts.map(v => `<button type="button" class="direct-option ${v === current ? 'active' : ''}" data-smart-param="${escapeHtml(paramKey)}" data-smart-value="${v}"><span>${escapeHtml(labels[v])}</span></button>`).join('')}
            </div>
        </div>
    </div>`;
}
function renderComfyWorkflowControl(){
    if(!comfyWorkflows.length) return `<div class="muted-note">${escapeHtml(tr('smart.noWorkflow'))}</div>`;
    const current = comfyWorkflows.find(w => w.name === settings.comfyWorkflow) || comfyWorkflows[0];
    const label = current?.title || (current?.name || '').replace('.json','') || tr('smart.workflow');
    return `<div class="smart-control workflow-control">
        <button class="smart-pill" type="button"><i data-lucide="layers"></i><span class="sub">${escapeHtml(label)}</span></button>
        <div class="smart-popover compact-popover">
            <div class="smart-popover-title">${escapeHtml(tr('smart.workflow'))}</div>
            <div class="model-list">
                ${comfyWorkflows.map(w => `<button type="button" class="direct-option ${w.name === settings.comfyWorkflow ? 'active' : ''}" data-smart-param="comfyWorkflow" data-smart-value="${escapeHtml(w.name)}"><span>${escapeHtml(w.title || w.name.replace('.json',''))}</span></button>`).join('')}
            </div>
        </div>
    </div>`;
}
function renderSizeControls(prefix='', includeSource=false){
    const ratioKey = prefix ? `${prefix}Ratio` : 'ratio';
    const resKey = prefix ? `${prefix}Resolution` : 'resolution';
    const ratios = [
        ['square','1:1'], ['portrait','2:3'], ['landscape','3:2'], ['portrait43','3:4'], ['landscape43','4:3'], ['story','9:16'], ['wide','16:9'],
        ...(includeSource ? [['source', tr('canvas.adaptiveRatio') || '适配比例']] : []),
        ['custom', tr('canvas.custom') || '自定义']
    ];
    return `<select data-param="${resKey}">
            ${['1k','2k','4k','custom'].map(v => optionHtml(v, v === 'custom' ? (tr('canvas.custom') || '自定义') : v.toUpperCase(), settings[resKey] || '1k')).join('')}
        </select>
        <select data-param="${ratioKey}" ${settings[resKey] === 'custom' ? 'disabled' : ''}>
            ${ratios.map(([v,l]) => `<option value="${escapeHtml(v)}" ${v === (settings[ratioKey] || 'square') ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}
        </select>`;
}
function ratioLabel(prefix=''){
    const ratioKey = prefix ? `${prefix}Ratio` : 'ratio';
    const customKey = prefix ? `${prefix}CustomRatio` : 'customRatio';
    const sourceLabel = sourceImageRatioLabel(prefix) || tr('smart.imageRatio');
    const map = {square:'1:1', portrait:'2:3', landscape:'3:2', portrait43:'3:4', landscape43:'4:3', story:'9:16', wide:'16:9', source:sourceLabel, custom:settings[customKey] || tr('smart.custom')};
    return map[settings[ratioKey] || 'square'] || '1:1';
}
function gcdInt(a, b){
    a = Math.abs(Math.round(Number(a) || 0));
    b = Math.abs(Math.round(Number(b) || 0));
    while(b){ const t = b; b = a % b; a = t; }
    return a || 1;
}
function imageSizeForRatio(img){
    const w = Math.round(Number(img?.natural_w || img?.width || img?.w || 0));
    const h = Math.round(Number(img?.natural_h || img?.height || img?.h || 0));
    return w > 0 && h > 0 ? {w, h} : null;
}
function sourceRatioImageForNode(node){
    const images = (node?.images || []).filter(img => img?.url && !isAudioMediaItem(img));
    if(!images.length) return null;
    if(selectedImage.nodeId === node?.id && selectedImage.index >= 0 && imagesForNode(node)[selectedImage.index]){
        const selected = imagesForNode(node)[selectedImage.index];
        if(imageSizeForRatio(selected)) return selected;
    }
    return images.find(img => imageSizeForRatio(img)) || images[0];
}
function reducedRatioForImage(img){
    const size = imageSizeForRatio(img);
    if(!size) return null;
    const d = gcdInt(size.w, size.h);
    return {w:Math.max(1, Math.round(size.w / d)), h:Math.max(1, Math.round(size.h / d))};
}
function sourceImageRatioLabel(prefix=''){
    const node = activeComposerNode() || selectedNode();
    const ratio = reducedRatioForImage(sourceRatioImageForNode(node));
    if(!ratio) return '';
    return `${ratio.w}:${ratio.h}`;
}
function applySourceRatioToSettings(prefix=''){
    const ratioKey = prefix ? `${prefix}Ratio` : 'ratio';
    if(settings[ratioKey] !== 'source') return;
    const ratio = reducedRatioForImage(sourceRatioImageForNode(activeComposerNode() || selectedNode()));
    if(!ratio) return;
    const customKey = prefix ? `${prefix}CustomRatio` : 'customRatio';
    const wKey = prefix ? `${prefix}CustomRatioWidth` : 'customRatioWidth';
    const hKey = prefix ? `${prefix}CustomRatioHeight` : 'customRatioHeight';
    settings[wKey] = ratio.w;
    settings[hKey] = ratio.h;
    settings[customKey] = `${ratio.w}:${ratio.h}`;
}
function resolutionLabel(prefix=''){
    const resKey = prefix ? `${prefix}Resolution` : 'resolution';
    const sizeKey = prefix ? `${prefix}CustomSize` : 'customSize';
    const value = settings[resKey] || '1k';
    return value === 'custom' ? (settings[sizeKey] || tr('smart.custom')) : value.toUpperCase();
}
function ratioIconClass(value){
    if(value === 'portrait') return 'r-portrait';
    if(value === 'portrait43') return 'r-portrait43';
    if(value === 'landscape') return 'r-landscape';
    if(value === 'landscape43') return 'r-landscape43';
    if(value === 'wide') return 'r-wide';
    if(value === 'story') return 'r-story';
    if(value === 'source') return 'r-source';
    if(value === 'custom') return 'r-custom';
    return '';
}
function videoAspectIconClass(value){
    if(value === '16:9' || value === '21:9') return 'r-wide';
    if(value === '9:16' || value === '9:21') return 'r-story';
    if(value === '4:3') return 'r-landscape43';
    if(value === '3:4') return 'r-portrait43';
    if(value === 'keep_ratio' || value === 'adaptive') return 'r-source';
    return '';
}
function renderProviderControl(providers){
    const current = apiProviderById(settings.provider_id);
    return `<div class="smart-control provider-control">
        <button class="smart-pill" type="button"><i data-lucide="plug-zap"></i><span class="sub">${escapeHtml(current?.name || settings.provider_id || tr('smart.platform'))}</span></button>
        <div class="smart-popover compact-popover">
            <div class="smart-popover-title">${escapeHtml(tr('smart.apiPlatform'))}</div>
            <div class="model-list">
                ${providers.map(p => `<button type="button" class="direct-option ${p.id === settings.provider_id ? 'active' : ''}" data-smart-param="provider_id" data-smart-value="${escapeHtml(p.id)}"><span>${escapeHtml(p.name || p.id)}</span></button>`).join('') || `<div class="muted-note">${escapeHtml(tr('smart.noApiPlatform'))}</div>`}
            </div>
        </div>
    </div>`;
}
function renderModelControl(models){
    return `<div class="smart-control model-control">
        <button class="smart-pill" type="button"><i data-lucide="sparkles"></i><span class="sub">${escapeHtml(settings.model || tr('smart.model'))}</span></button>
        <div class="smart-popover compact-popover">
            <div class="smart-popover-title">${escapeHtml(tr('smart.imageModel'))}</div>
            <div class="model-list">
                ${models.map(m => `<button type="button" class="direct-option ${m === settings.model ? 'active' : ''}" data-smart-param="model" data-smart-value="${escapeHtml(m)}"><span>${escapeHtml(m)}</span></button>`).join('') || `<div class="muted-note">${escapeHtml(tr('smart.noImageModel'))}</div>`}
            </div>
        </div>
    </div>`;
}
function msModelLabel(key){
    if(key === 'custom') return tr('smart.custom');
    return MS_GEN_MODELS[key]?.label || key;
}
function renderMsFunctionControl(){
    return `<div class="smart-control provider-control">
        <button class="smart-pill" type="button"><i data-lucide="sparkles"></i><span class="sub">${escapeHtml(msModelLabel(settings.msgenModel) || 'ModelScope')}</span></button>
        <div class="smart-popover compact-popover">
            <div class="smart-popover-title">${escapeHtml(tr('smart.msFunction'))}</div>
            <div class="model-list">
                ${Object.entries(MS_GEN_MODELS).map(([key]) => `<button type="button" class="direct-option ${key === settings.msgenModel ? 'active' : ''}" data-smart-param="msgenModel" data-smart-value="${escapeHtml(key)}"><span>${escapeHtml(msModelLabel(key))}</span></button>`).join('')}
            </div>
        </div>
    </div>`;
}
function renderMsCustomModelPill(){
    if(settings.msgenModel !== 'custom') return '';
    const models = modelscopeImageModels();
    const label = settings.msCustomModel || tr('smart.customModel');
    return `<div class="smart-control model-control">
        <button class="smart-pill" type="button"><i data-lucide="boxes"></i><span class="sub">${escapeHtml(label)}</span></button>
        <div class="smart-popover compact-popover">
            <div class="smart-popover-title">${escapeHtml(tr('smart.msCustomModel'))}</div>
            <div class="model-list">
                ${models.map(m => `<button type="button" class="direct-option ${m === settings.msCustomModel ? 'active' : ''}" data-smart-param="msCustomModel" data-smart-value="${escapeHtml(m)}"><span>${escapeHtml(m)}</span></button>`).join('') || `<div class="muted-note">${escapeHtml(tr('smart.noMsModel'))}</div>`}
            </div>
        </div>
    </div>`;
}
function renderRatioControl(prefix='', includeSource=false){
    const ratioKey = prefix ? `${prefix}Ratio` : 'ratio';
    const resKey = prefix ? `${prefix}Resolution` : 'resolution';
    const ratios = [
        ['square','1:1'], ['portrait','2:3'], ['landscape','3:2'], ['portrait43','3:4'], ['landscape43','4:3'],
        ['story','9:16'], ['wide','16:9'],
        ...(includeSource ? [['source', tr('smart.imageRatio')]] : []),
        ['custom', tr('smart.custom')]
    ];
    return `<div class="smart-control ratio-control">
        <button class="smart-pill" type="button"><i data-lucide="scan"></i><span>${escapeHtml(ratioLabel(prefix))}</span></button>
        <div class="smart-popover">
            <div class="smart-popover-title">${escapeHtml(tr('smart.ratio'))}</div>
            <div class="ratio-grid">
                ${ratios.map(([value, label]) => `<button type="button" class="ratio-option ${value === (settings[ratioKey] || 'square') ? 'active' : ''}" data-smart-param="${ratioKey}" data-smart-value="${escapeHtml(value)}"><span class="ratio-icon ${ratioIconClass(value)}"></span><span>${escapeHtml(label)}</span></button>`).join('')}
            </div>
        </div>
    </div>`;
}
function renderResolutionControl(prefix=''){
    const resKey = prefix ? `${prefix}Resolution` : 'resolution';
    return `<div class="smart-control resolution-control">
        <button class="smart-pill" type="button"><i data-lucide="monitor"></i><span>${escapeHtml(resolutionLabel(prefix))}</span></button>
        <div class="smart-popover compact-popover">
            <div class="smart-popover-title">${escapeHtml(tr('smart.resolution'))}</div>
            <div class="seg-row">
                ${['1k','2k','4k','custom'].map(value => `<button type="button" class="${value === (settings[resKey] || '1k') ? 'active' : ''}" data-smart-param="${resKey}" data-smart-value="${value}">${value === 'custom' ? escapeHtml(tr('smart.custom')) : value.toUpperCase()}</button>`).join('')}
            </div>
        </div>
    </div>`;
}
function renderInlineCustomRatioFields(prefix=''){
    const ratioKey = prefix ? `${prefix}Ratio` : 'ratio';
    if(settings[ratioKey] === 'source') return '';
    if(settings[ratioKey] !== 'custom') return '';
    const wKey = prefix ? `${prefix}CustomRatioWidth` : 'customRatioWidth';
    const hKey = prefix ? `${prefix}CustomRatioHeight` : 'customRatioHeight';
    return `<div class="inline-fields">
        <span class="inline-label">${escapeHtml(tr('smart.ratio'))}</span>
        <input type="number" data-param="${wKey}" value="${escapeHtml(settings[wKey] || '')}" placeholder="W">
        <span class="inline-divider">:</span>
        <input type="number" data-param="${hKey}" value="${escapeHtml(settings[hKey] || '')}" placeholder="H">
    </div>`;
}
function renderInlineCustomSizeFields(prefix=''){
    const resKey = prefix ? `${prefix}Resolution` : 'resolution';
    if(settings[resKey] !== 'custom') return '';
    const wKey = prefix ? `${prefix}CustomWidth` : 'customWidth';
    const hKey = prefix ? `${prefix}CustomHeight` : 'customHeight';
    return `<div class="inline-fields">
        <span class="inline-label">${escapeHtml(tr('smart.size'))}</span>
        <input type="number" data-param="${wKey}" value="${escapeHtml(settings[wKey] || '')}" placeholder="${escapeHtml(tr('smart.width'))}">
        <span class="inline-divider">×</span>
        <input type="number" data-param="${hKey}" value="${escapeHtml(settings[hKey] || '')}" placeholder="${escapeHtml(tr('smart.height'))}">
    </div>`;
}
function renderQualityControl(){
    const value = settings.quality || 'auto';
    const labels = {auto:tr('smart.qualityAuto'), low:tr('smart.qualityLow'), medium:tr('smart.qualityMid'), high:tr('smart.qualityHigh')};
    return `<div class="smart-control quality-control">
        <button class="smart-pill" type="button"><i data-lucide="sliders-horizontal"></i><span>${escapeHtml(labels[value] || value)}</span></button>
        <div class="smart-popover compact-popover">
            <div class="smart-popover-title">${escapeHtml(tr('smart.quality'))}</div>
            <div class="seg-row">
                ${Object.entries(labels).map(([k, l]) => `<button type="button" class="${k === value ? 'active' : ''}" data-smart-param="quality" data-smart-value="${escapeHtml(k)}">${escapeHtml(l)}</button>`).join('')}
            </div>
        </div>
    </div>`;
}
function renderCountVisualControl(){
    const value = Number(settings.count || 1);
    return `<div class="smart-control count-control">
        <button class="smart-pill" type="button"><i data-lucide="copy"></i><span>${value}${tr('smart.countUnit') ? ' ' + escapeHtml(tr('smart.countUnit')) : ''}</span></button>
        <div class="smart-popover compact-popover" style="min-width:170px">
            <div class="smart-popover-title">${escapeHtml(tr('smart.count'))}</div>
            <div class="count-grid">
                ${[1,2,3,4,5,6,7,8].map(n => `<button type="button" class="count-cell ${n === value ? 'active' : ''}" data-smart-param="count" data-smart-value="${n}">${n}</button>`).join('')}
            </div>
        </div>
    </div>`;
}
function renderCountControl(){
    return `<select data-param="count">${[1,2,3,4,5,6,7,8].map(n => optionHtml(n, `${n} 张`, Number(settings.count || 1))).join('')}</select>`;
}
function renderCustomRatioControls(prefix=''){
    const ratioKey = prefix ? `${prefix}Ratio` : 'ratio';
    if(settings[ratioKey] !== 'custom' && settings[ratioKey] !== 'source') return '';
    const wKey = prefix ? `${prefix}CustomRatioWidth` : 'customRatioWidth';
    const hKey = prefix ? `${prefix}CustomRatioHeight` : 'customRatioHeight';
    const disabled = settings[ratioKey] === 'source' ? 'disabled' : '';
    return `<input type="number" data-param="${wKey}" value="${escapeHtml(settings[wKey] || '')}" placeholder="比例宽" ${disabled}>
            <input type="number" data-param="${hKey}" value="${escapeHtml(settings[hKey] || '')}" placeholder="比例高" ${disabled}>`;
}
function renderCustomSizeControls(prefix=''){
    const resKey = prefix ? `${prefix}Resolution` : 'resolution';
    if(settings[resKey] !== 'custom') return '';
    const wKey = prefix ? `${prefix}CustomWidth` : 'customWidth';
    const hKey = prefix ? `${prefix}CustomHeight` : 'customHeight';
    return `<input type="number" data-param="${wKey}" value="${escapeHtml(settings[wKey] || '')}" placeholder="宽度">
            <input type="number" data-param="${hKey}" value="${escapeHtml(settings[hKey] || '')}" placeholder="高度">`;
}
function renderComfySettingField(field){
    const value = comfyParamValue(field);
    const label = field.name || field.input || field.id;
    if(field.type === 'boolean') return `<button type="button" class="setting-check ${value ? 'active' : ''}" data-comfy-bool="${escapeHtml(field.id)}"><span class="check-box"></span><span>${escapeHtml(label)}</span></button>`;
    if(field.type === 'dropdown'){
        const opts = field.options || [];
        const curLabel = String(value || opts[0] || label);
        return `<div class="smart-control comfy-dropdown-control" title="${escapeHtml(label)}">
            <button class="smart-pill" type="button"><span class="sub">${escapeHtml(curLabel)}</span></button>
            <div class="smart-popover compact-popover">
                <div class="smart-popover-title">${escapeHtml(label)}</div>
                <div class="model-list">
                    ${opts.map(o => `<button type="button" class="direct-option ${String(o) === String(value) ? 'active' : ''}" data-comfy-pick="${escapeHtml(field.id)}" data-comfy-value="${escapeHtml(o)}"><span>${escapeHtml(o)}</span></button>`).join('') || `<div class="muted-note">${escapeHtml(tr('smart.noOption'))}</div>`}
                </div>
            </div>
        </div>`;
    }
    if(field.type === 'textarea') return `<textarea class="wide" data-comfy-param="${escapeHtml(field.id)}" placeholder="${escapeHtml(label)}" style="width:160px">${escapeHtml(value)}</textarea>`;
    const type = (field.type === 'number' || field.type === 'slider') ? 'number' : 'text';
    const min = field.min !== undefined ? ` min="${escapeHtml(field.min)}"` : '';
    const max = field.max !== undefined ? ` max="${escapeHtml(field.max)}"` : '';
    const step = field.step !== undefined ? ` step="${escapeHtml(field.step)}"` : '';
    const isNumeric = type === 'number';
    const inputHtml = `<input type="${type}" data-comfy-param="${escapeHtml(field.id)}" value="${escapeHtml(value)}"${min}${max}${step}>`;
    if(isNumeric && comfyRandomEnabledField(field)){
        const active = smartComfyRandomActive(field.id);
        return `<div class="num-with-dice" title="${escapeHtml(label)}">
            <span class="num-label">${escapeHtml(label)}</span>
            ${inputHtml}
            <button type="button" class="dice-btn ${active ? 'active' : ''}" data-comfy-random="${escapeHtml(field.id)}" title="${escapeHtml(active ? tr('smart.diceOn') : tr('smart.diceOff'))}"><i data-lucide="dice-5"></i></button>
        </div>`;
    }
    if(isNumeric){
        return `<div class="num-compact" title="${escapeHtml(label)}"><span class="num-label">${escapeHtml(label)}</span>${inputHtml}</div>`;
    }
    return `<div class="num-compact" title="${escapeHtml(label)}"><span class="num-label">${escapeHtml(label)}</span>${inputHtml}</div>`;
}
const RH_KNOWN_FIELD_OPTIONS = {
    aspectRatio:['1:1','16:9','9:16','4:3','3:4','4:5','5:4','3:2','2:3','21:9','9:21'],
    aspect_ratio:['1:1','16:9','9:16','4:3','3:4','4:5','5:4','3:2','2:3','21:9','9:21'],
    ratio:['1:1','16:9','9:16','4:3','3:4','4:5','5:4','3:2','2:3'],
    resolution:['1k','2k','4k','8k'],
    size:['512','768','1024','1280','1536','2048'],
    quality:['low','medium','high','best'],
    scheduler:['normal','karras','exponential','sgm_uniform','simple','ddim_uniform'],
    sampler:['euler','euler_ancestral','heun','dpm_2','dpm_2_ancestral','lms','dpmpp_2m','dpmpp_sde','ddim','uni_pc']
};
function rhParamKey(nodeId, fieldName){
    return `${nodeId ?? ''}::${fieldName ?? ''}`;
}
function rhFieldKind(field){
    const type = String(field?.fieldType || '').trim().toUpperCase();
    if(type === 'IMAGE') return 'image';
    if(type === 'VIDEO') return 'video';
    if(type === 'AUDIO') return 'audio';
    if(['NUMBER','FLOAT','INTEGER','INT'].includes(type)) return 'number';
    if(['BOOLEAN','BOOL'].includes(type)) return 'boolean';
    const key = `${field?.fieldName || ''} ${field?.fieldValue || ''}`.toLowerCase();
    if(/\b(image|img|mask|photo|picture)\b/.test(key) || /\.(png|jpe?g|webp|gif|bmp)(\?|$)/i.test(key)) return 'image';
    if(/\b(video|movie|mp4)\b/.test(key) || /\.(mp4|webm|mov|m4v|mkv)(\?|$)/i.test(key)) return 'video';
    if(/\b(audio|sound|music|voice)\b/.test(key) || /\.(mp3|wav|ogg|m4a|flac|aac)(\?|$)/i.test(key)) return 'audio';
    return 'text';
}
function rhFieldRole(field){
    const kind = rhFieldKind(field);
    if(['image','video','audio','number','boolean'].includes(kind)) return kind;
    const text = `${field?.fieldName || ''} ${field?.label || ''} ${field?.group || ''}`.toLowerCase();
    if(/prompt|positive|negative|text|caption|description|关键词|提示词|正向|负向/.test(text)) return 'prompt';
    return 'text';
}
function rhExtractFieldOptions(field){
    const candidates = [field?.fieldData, field?.options, field?.list, field?.values, field?.enum, field?.choices, field?.items, field?.selectOptions, field?.dropdown];
    for(const candidate of candidates){
        if(!Array.isArray(candidate) || !candidate.length) continue;
        if(candidate.every(x => ['string','number'].includes(typeof x))) return candidate.map(String);
        if(candidate.every(x => x && typeof x === 'object' && ('value' in x || 'label' in x || 'name' in x))){
            return candidate.map(x => x.value ?? x.label ?? x.name).filter(v => v !== undefined && v !== null).map(String);
        }
    }
    const name = String(field?.fieldName || '').trim();
    if(name){
        if(RH_KNOWN_FIELD_OPTIONS[name]) return RH_KNOWN_FIELD_OPTIONS[name].map(String);
        const hit = Object.keys(RH_KNOWN_FIELD_OPTIONS).find(k => k.toLowerCase() === name.toLowerCase());
        if(hit) return RH_KNOWN_FIELD_OPTIONS[hit].map(String);
    }
    return null;
}
function rhDefaultValue(field){
    let value = field?.fieldValue;
    if(Array.isArray(value)) value = value[0];
    if(value === undefined || value === null || typeof value === 'object') return '';
    return String(value);
}
function rhIsWorkflowLinkValue(value){
    return Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && Number.isInteger(value[1]);
}
function rhRandomEnabled(field){
    return rhFieldKind(field) === 'number' && field?.random_enabled === true;
}
function smartRhRandomActive(key){
    settings.rhRandomActive = settings.rhRandomActive || {};
    return settings.rhRandomActive[key] !== false;
}
function toggleSmartRhRandom(key){
    const field = rhActiveFields().find(f => rhParamKey(f.nodeId, f.fieldName) === key);
    if(!rhRandomEnabled(field)) return;
    settings.rhRandomActive = settings.rhRandomActive || {};
    settings.rhRandomActive[key] = !smartRhRandomActive(key);
    persistActiveSmartSettings();
    renderDynamicParams();
    scheduleSave();
}
function smartRhRandomValue(field){
    return smartComfyRandomValue({
        input:field.fieldName,
        name:field.label || field.fieldName,
        min:field.min,
        max:field.max,
        step:field.step,
        type:'number'
    });
}
function rhParamValue(field, media=null){
    settings.rhParams = settings.rhParams || {};
    const key = rhParamKey(field.nodeId, field.fieldName);
    const param = settings.rhParams[key];
    const kind = rhFieldKind(field);
    if(['image','video','audio'].includes(kind)){
        const idx = rhFieldIndexes(rhActiveFields())[key] || 0;
        const up = media?.[kind]?.[idx]?.url || '';
        if(rhCurrentKind() === 'workflow' && kind === 'image' && field.required !== true && !up) return '';
        return up || param?.value || rhDefaultValue(field);
    }
    if(rhRandomEnabled(field) && smartRhRandomActive(key)){
        if(smartRhRandomValues[key] === undefined) smartRhRandomValues[key] = smartRhRandomValue(field);
        return smartRhRandomValues[key];
    }
    if(rhFieldRole(field) === 'prompt') return param?.value ?? (media?.prompt || rhDefaultValue(field));
    return param?.value ?? rhDefaultValue(field);
}
function rhFieldIndexes(fields){
    const counters = {image:0, video:0, audio:0};
    const map = {};
    sortRunningHubFields(fields).forEach(field => {
        const kind = rhFieldKind(field);
        if(['image','video','audio'].includes(kind)){
            map[rhParamKey(field.nodeId, field.fieldName)] = counters[kind]++;
        }
    });
    return map;
}
async function ensureRunningHubWorkflow(workflowId){
    workflowId = String(workflowId || '').trim();
    if(!workflowId) return null;
    if(runningHubWorkflowCache[workflowId]) return runningHubWorkflowCache[workflowId];
    const res = await fetch(`/api/runninghub/workflows/${encodeURIComponent(workflowId)}`);
    if(!res.ok){
        delete runningHubWorkflowCache[workflowId];
        return null;
    }
    const data = await res.json();
    runningHubWorkflowCache[workflowId] = data.workflow || null;
    return runningHubWorkflowCache[workflowId];
}
async function currentRunningHubWorkflowConfig(){
    const ref = selectedRunningHubRef();
    if(ref?.kind !== 'workflow') return null;
    const cached = await ensureRunningHubWorkflow(ref.id).catch(() => null);
    return {
        ...(ref.entry || {}),
        ...(cached || {}),
        workflowId:ref.id,
        fields:Array.isArray(cached?.fields) && cached.fields.length ? cached.fields : rhEntryFields(ref.entry),
        optionalImageMode:ref.entry?.optionalImageMode || cached?.optionalImageMode || 'prune-workflow',
        workflowJson:cached?.workflowJson || ref.entry?.raw?.workflowJson || ref.entry?.raw?.prompt || {}
    };
}
function rhMediaForRun(prompt, refs){
    const cleanRefs = (refs || []).filter(ref => ref?.url);
    return {
        refs:cleanRefs,
        image:imageRefsOnly(cleanRefs),
        video:videoRefsOnly(cleanRefs),
        audio:audioRefsOnly(cleanRefs),
        prompt:String(prompt || '').trim()
    };
}
function rhRequiredLabel(field){
    return field?.label || field?.fieldName || `#${field?.nodeId || ''}`;
}
function rhPruneWorkflowForMissingFields(workflowJson, missingFields){
    if(!workflowJson || typeof workflowJson !== 'object' || !missingFields?.length) return null;
    const workflow = JSON.parse(JSON.stringify(workflowJson));
    const removeIds = new Set();
    missingFields.forEach(field => {
        const node = workflow[String(field.nodeId)];
        if(node?.inputs && Object.prototype.hasOwnProperty.call(node.inputs, field.fieldName)){
            delete node.inputs[field.fieldName];
        }
        if(node && (!node.inputs || !Object.keys(node.inputs).length)){
            removeIds.add(String(field.nodeId));
        }
    });
    removeIds.forEach(id => delete workflow[id]);
    Object.values(workflow).forEach(node => {
        if(!node?.inputs || typeof node.inputs !== 'object') return;
        Object.entries(node.inputs).forEach(([name, value]) => {
            if(rhIsWorkflowLinkValue(value) && removeIds.has(String(value[0]))) delete node.inputs[name];
        });
    });
    return workflow;
}
async function rhBuildWorkflowRequestExtras(media, nodeInfoList){
    const config = await currentRunningHubWorkflowConfig();
    if(!config || (config.optionalImageMode || 'prune-workflow') !== 'prune-workflow') return {};
    const fields = rhActiveFields();
    const indexes = rhFieldIndexes(fields);
    const missingOptional = [];
    for(const field of fields){
        if(rhFieldKind(field) !== 'image') continue;
        const key = rhParamKey(field.nodeId, field.fieldName);
        const idx = indexes[key] || 0;
        const hasInput = Boolean(media.image?.[idx]?.url);
        if(field.required === true && !hasInput) throw new Error(`RunningHub 工作流缺少必选图片：${rhRequiredLabel(field)}`);
        if(field.required !== true && !hasInput) missingOptional.push(field);
    }
    if(!missingOptional.length) return {};
    missingOptional.forEach(field => {
        const key = rhParamKey(field.nodeId, field.fieldName);
        const idx = nodeInfoList.findIndex(item => rhParamKey(item.nodeId, item.fieldName) === key);
        if(idx >= 0) nodeInfoList.splice(idx, 1);
    });
    const workflow = rhPruneWorkflowForMissingFields(config.workflowJson || {}, missingOptional);
    return workflow ? {workflow} : {};
}
async function rhUploadValueIfNeeded(value){
    const text = String(value || '').trim();
    if(!text) return '';
    if(!/^https?:\/\//i.test(text) && !text.startsWith('/output/') && !text.startsWith('/assets/')) return text;
    const res = await fetch('/api/runninghub/upload-asset', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({url:text, useWallet:settings.rhPayment === 'wallet'})
    });
    const data = await res.json();
    if(!res.ok || data.success === false) throw new Error(data.detail || data.error || tr('smart.rhUploadFailed'));
    return data.data?.fileName || text;
}
async function rhBuildNodeInfoList(media){
    const fields = rhActiveFields();
    const result = [];
    const indexes = rhFieldIndexes(fields);
    const mode = rhCurrentKind();
    for(const field of fields){
        const kind = rhFieldKind(field);
        const key = rhParamKey(field.nodeId, field.fieldName);
        if(mode === 'workflow' && field.sourceFromUpstream === false && !['image','video','audio'].includes(kind)) continue;
        if(mode === 'workflow' && kind === 'image'){
            const idx = indexes[key] || 0;
            if(field.required !== true && !media.image?.[idx]?.url) continue;
        }
        let value = rhParamValue(field, media);
        if(['image','video','audio'].includes(kind)) value = await rhUploadValueIfNeeded(value);
        if(typeof value === 'string' && /[\r\n]/.test(value)) value = value.split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0] || '';
        result.push({nodeId:field.nodeId, fieldName:field.fieldName, fieldValue:value});
    }
    return result;
}
function renderRhSettingField(field){
    const key = rhParamKey(field.nodeId, field.fieldName);
    const kind = rhFieldRole(field);
    const label = field.label || field.fieldName || 'Field';
    const value = rhParamValue(field, null);
    const options = rhExtractFieldOptions(field);
    if(kind === 'boolean'){
        const active = String(value).toLowerCase() === 'true';
        return `<button type="button" class="setting-check ${active ? 'active' : ''}" data-rh-bool="${escapeHtml(key)}"><span class="check-box"></span><span>${escapeHtml(label)}</span></button>`;
    }
    if(options?.length){
        const curLabel = String(value || options[0] || label);
        return `<div class="smart-control rh-dropdown-control" title="${escapeHtml(label)}">
            <button class="smart-pill" type="button"><span class="sub">${escapeHtml(curLabel)}</span></button>
            <div class="smart-popover compact-popover">
                <div class="smart-popover-title">${escapeHtml(label)}</div>
                <div class="model-list">
                    ${options.map(o => `<button type="button" class="direct-option ${String(o) === String(value) ? 'active' : ''}" data-rh-pick="${escapeHtml(key)}" data-rh-value="${escapeHtml(o)}"><span>${escapeHtml(o)}</span></button>`).join('') || `<div class="muted-note">${escapeHtml(tr('smart.noOption'))}</div>`}
                </div>
            </div>
        </div>`;
    }
    const type = kind === 'number' ? 'number' : 'text';
    const inputHtml = `<input type="${type}" data-rh-param="${escapeHtml(key)}" value="${escapeHtml(value)}">`;
    if(kind === 'number' && rhRandomEnabled(field)){
        const active = smartRhRandomActive(key);
        return `<div class="num-with-dice" title="${escapeHtml(label)}">
            <span class="num-label">${escapeHtml(label)}</span>
            ${inputHtml}
            <button type="button" class="dice-btn ${active ? 'active' : ''}" data-rh-random="${escapeHtml(key)}" title="${escapeHtml(active ? tr('smart.diceOn') : tr('smart.diceOff'))}"><i data-lucide="dice-5"></i></button>
        </div>`;
    }
    return `<div class="num-compact ${type === 'text' ? 'rh-text-param' : ''}" title="${escapeHtml(label)}"><span class="num-label">${escapeHtml(label)}</span>${inputHtml}</div>`;
}
function comfyRandomEnabledField(field){ return field?.type === 'number' && field.random_enabled === true; }
function smartComfyRandomActive(fieldId){
    settings.comfyRandomActive = settings.comfyRandomActive || {};
    return settings.comfyRandomActive[fieldId] !== false;
}
function toggleSmartComfyRandom(fieldId){
    settings.comfyRandomActive = settings.comfyRandomActive || {};
    settings.comfyRandomActive[fieldId] = !smartComfyRandomActive(fieldId);
    persistActiveSmartSettings();
    renderDynamicParams();
    scheduleSave();
}
function smartComfyRandomValue(field){
    const isFloat = Number(field.step) > 0 && Number(field.step) < 1;
    let min = Number.isFinite(Number(field.min)) ? Number(field.min) : null;
    let max = Number.isFinite(Number(field.max)) ? Number(field.max) : null;
    const name = `${field.input || ''} ${field.name || ''}`.toLowerCase();
    const looksSeed = name.includes('seed') || name.includes('noise') || name.includes('随机') || name.includes('噪');
    if(min === null) min = looksSeed ? 1 : 0;
    if(max === null || max <= min) max = looksSeed ? 1000000000000000 : 999999;
    const value = min + Math.random() * (max - min);
    if(isFloat){
        const precision = Math.min(8, Math.max(1, String(field.step).split('.')[1]?.length || 2));
        return Number(value.toFixed(precision));
    }
    return Math.floor(value);
}
function setDynamicSetting(key, value){
    const numericKeys = new Set(['count','width','height','videoDuration','enhanceStrength','enhanceUpscaleRes','editUpscaleRes','customRatioWidth','customRatioHeight','customWidth','customHeight','msCustomRatioWidth','msCustomRatioHeight','msCustomWidth','msCustomHeight']);
    const layoutKeys = new Set(['provider_id','model','resolution','ratio','msgenModel','msCustomModel','msResolution','msRatio','videoProvider','videoModel','videoAspect','videoResolution','comfyMode','comfyWorkflow','quality','count','enhanceUpscaleRes','editUpscaleRes','rhConfigKey','rhPayment','rhInstanceType']);
    settings[key] = numericKeys.has(key) && value !== '' ? Number(value) : value;
    if(key === 'provider_id') settings.model = '';
    if(key === 'videoProvider') settings.videoModel = '';
    if(key === 'comfyMode') applyRecentSmartSettingsForCurrentMode();
    if(key === 'resolution'){
        if(settings.resolution === 'custom') settings.ratio = '';
        else if(!settings.ratio) settings.ratio = 'square';
    }
    if(key === 'ratio') applySourceRatioToSettings('');
    if(key === 'msResolution'){
        if(settings.msResolution === 'custom') settings.msRatio = '';
        else if(!settings.msRatio) settings.msRatio = 'square';
    }
    if(key === 'msRatio') applySourceRatioToSettings('ms');
    if(key === 'customRatioWidth' || key === 'customRatioHeight') settings.customRatio = settings.customRatioWidth && settings.customRatioHeight ? `${settings.customRatioWidth}:${settings.customRatioHeight}` : '';
    if(key === 'msCustomRatioWidth' || key === 'msCustomRatioHeight') settings.msCustomRatio = settings.msCustomRatioWidth && settings.msCustomRatioHeight ? `${settings.msCustomRatioWidth}:${settings.msCustomRatioHeight}` : '';
    if(key === 'customWidth' || key === 'customHeight') settings.customSize = settings.customWidth && settings.customHeight ? `${settings.customWidth}x${settings.customHeight}` : '';
    if(key === 'msCustomWidth' || key === 'msCustomHeight') settings.msCustomSize = settings.msCustomWidth && settings.msCustomHeight ? `${settings.msCustomWidth}x${settings.msCustomHeight}` : '';
    const sizeKeys = new Set(['resolution','ratio','customRatio','customRatioWidth','customRatioHeight','customWidth','customHeight','customSize']);
    const unlockOutpaintSize = settings.outpaintResolutionLocked && sizeKeys.has(key);
    if(unlockOutpaintSize){
        delete settings.outpaintResolutionLocked;
        const subject = activeSettingsSubject();
        if(subject) delete subject.outpaintSize;
    }
    if(key === 'comfyWorkflow') {
        settings.comfyParams = {};
        ensureComfyWorkflow(settings.comfyWorkflow).then(renderDynamicParams);
    }
    if(key === 'rhConfigKey'){
        settings.rhParams = {};
        settings.rhRandomActive = {};
    }
    persistActiveSmartSettings();
    rememberRecentSmartSettings(settings, activeSettingsSubject());
    if(layoutKeys.has(key)) renderDynamicParams();
    scheduleSave();
}
function closeAllSmartPopovers(){
    document.querySelectorAll('.smart-control.pinned').forEach(c => c.classList.remove('pinned'));
}
function bindDynamicParams(){
    dynamicParams.querySelectorAll('.smart-control > .smart-pill').forEach(pill => {
        pill.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            const ctrl = pill.parentElement;
            const wasPinned = ctrl.classList.contains('pinned');
            closeAllSmartPopovers();
            if(!wasPinned) ctrl.classList.add('pinned');
        };
    });
    dynamicParams.querySelectorAll('[data-smart-param]').forEach(btn => {
        btn.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            setDynamicSetting(btn.dataset.smartParam, btn.dataset.smartValue);
            if(btn.dataset.smartParam === 'videoDuration') renderDynamicParams();
        };
    });
    dynamicParams.querySelectorAll('[data-param]').forEach(input => {
        input.onclick = event => event.stopPropagation();
        input.oninput = input.onchange = event => {
            event?.stopPropagation?.();
            setDynamicSetting(input.dataset.param, input.value);
            if(input.dataset.param === 'videoDuration' && event?.type === 'change') renderDynamicParams();
        };
    });
    dynamicParams.querySelectorAll('[data-toggle-param]').forEach(btn => {
        btn.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            settings[btn.dataset.toggleParam] = !settings[btn.dataset.toggleParam];
            persistActiveSmartSettings();
            renderDynamicParams();
            scheduleSave();
        };
    });
    dynamicParams.querySelectorAll('[data-comfy-bool]').forEach(btn => {
        btn.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            settings.comfyParams = settings.comfyParams || {};
            const id = btn.dataset.comfyBool;
            const field = currentComfyFields().find(f => f.id === id);
            settings.comfyParams[id] = !Boolean(settings.comfyParams[id] ?? field?.default ?? false);
            persistActiveSmartSettings();
            renderDynamicParams();
            scheduleSave();
        };
    });
    dynamicParams.querySelectorAll('[data-comfy-param]').forEach(input => {
        input.onclick = event => event.stopPropagation();
        input.oninput = input.onchange = event => {
            event?.stopPropagation?.();
            settings.comfyParams = settings.comfyParams || {};
            const field = currentComfyFields().find(f => f.id === input.dataset.comfyParam);
            if(field?.type === 'number' || field?.type === 'slider') settings.comfyParams[input.dataset.comfyParam] = Number(input.value) || 0;
            else settings.comfyParams[input.dataset.comfyParam] = input.value;
            persistActiveSmartSettings();
            scheduleSave();
        };
    });
    dynamicParams.querySelectorAll('[data-comfy-pick]').forEach(btn => {
        btn.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            settings.comfyParams = settings.comfyParams || {};
            const fieldId = btn.dataset.comfyPick;
            const value = btn.dataset.comfyValue;
            settings.comfyParams[fieldId] = value;
            const popover = btn.closest('.smart-popover');
            const control = btn.closest('.smart-control');
            const pillSub = control?.querySelector('.smart-pill .sub');
            if(pillSub) pillSub.textContent = value;
            if(popover){
                popover.querySelectorAll(`[data-comfy-pick="${fieldId}"]`).forEach(b => b.classList.toggle('active', b.dataset.comfyValue === value));
            }
            closeAllSmartPopovers();
            persistActiveSmartSettings();
            scheduleSave();
        };
    });
    dynamicParams.querySelectorAll('[data-comfy-random]').forEach(btn => {
        btn.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            toggleSmartComfyRandom(btn.dataset.comfyRandom);
        };
    });
    dynamicParams.querySelectorAll('[data-rh-bool]').forEach(btn => {
        btn.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            settings.rhParams = settings.rhParams || {};
            const key = btn.dataset.rhBool;
            const field = rhActiveFields().find(f => rhParamKey(f.nodeId, f.fieldName) === key);
            const cur = settings.rhParams[key] || {};
            const on = String(rhParamValue(field, null)).toLowerCase() === 'true';
            settings.rhParams[key] = {...cur, value:String(!on)};
            persistActiveSmartSettings();
            renderDynamicParams();
            scheduleSave();
        };
    });
    dynamicParams.querySelectorAll('[data-rh-param]').forEach(input => {
        input.onclick = event => event.stopPropagation();
        input.oninput = input.onchange = event => {
            event?.stopPropagation?.();
            const key = input.dataset.rhParam;
            settings.rhParams = settings.rhParams || {};
            const cur = settings.rhParams[key] || {};
            settings.rhParams[key] = {...cur, value:input.value};
            persistActiveSmartSettings();
            scheduleSave();
        };
    });
    dynamicParams.querySelectorAll('[data-rh-pick]').forEach(btn => {
        btn.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            const key = btn.dataset.rhPick;
            const value = btn.dataset.rhValue;
            settings.rhParams = settings.rhParams || {};
            const cur = settings.rhParams[key] || {};
            settings.rhParams[key] = {...cur, value};
            const popover = btn.closest('.smart-popover');
            const control = btn.closest('.smart-control');
            const pillSub = control?.querySelector('.smart-pill .sub');
            if(pillSub) pillSub.textContent = value;
            if(popover){
                popover.querySelectorAll('[data-rh-pick]').forEach(b => {
                    if(b.dataset.rhPick === key) b.classList.toggle('active', b.dataset.rhValue === value);
                });
            }
            closeAllSmartPopovers();
            persistActiveSmartSettings();
            scheduleSave();
        };
    });
    dynamicParams.querySelectorAll('[data-rh-random]').forEach(btn => {
        btn.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            toggleSmartRhRandom(btn.dataset.rhRandom);
        };
    });
}
async function loadConfig(){
    try {
        const cfg = await fetch('/api/config').then(r => r.json());
        apiProviders = Array.isArray(cfg.api_providers) ? cfg.api_providers : [];
        const wf = await fetch('/api/workflows').then(r => r.json()).catch(() => ({workflows:[]}));
        comfyWorkflows = Array.isArray(wf.workflows) ? wf.workflows : [];
        runningHubWorkflowCache = {};
        const rhProvider = apiProviders.find(p => p.id === 'runninghub');
        const rhWorkflowIds = (rhProvider?.rh_workflows || []).map(item => String(item.workflowId || item.id || '').trim()).filter(Boolean);
        await Promise.all(rhWorkflowIds.map(async workflowId => {
            try { await ensureRunningHubWorkflow(workflowId); } catch(_) {}
        }));
        lastConfigRefreshAt = Date.now();
        updateProviderModels();
    } catch(e) {
        toast(tr('smart.toastApiSettingsFail'));
    }
}
async function refreshSmartConfigFromSettings(){
    await loadConfig();
    renderDynamicParams();
    const node = selectedNode();
    if(node?.type === 'smart-prompt') render();
}
function loadPromptPresets(){
    try {
        const list = JSON.parse(localStorage.getItem(PROMPT_PRESETS_KEY) || '[]');
        promptPresets = Array.isArray(list) ? list.filter(p => p?.id && typeof p.text === 'string') : [];
    } catch(e) {
        promptPresets = [];
    }
}
function savePromptPresets(){
    localStorage.setItem(PROMPT_PRESETS_KEY, JSON.stringify(promptPresets));
}
function currentPromptPreset(id){
    return promptPresets.find(p => p.id === id) || null;
}
function defaultPromptPresetName(text){
    return (String(text || '').trim().split(/\r?\n/)[0] || tr('smart.promptPresetDefault')).slice(0, 28);
}
function promptPresetPanelNode(){
    return nodes.find(n => n.id === promptPresetPanel?.dataset.nodeId) || null;
}
function setPromptPresetStatus(text='', tone=''){
    if(!promptPresetStatus) return;
    promptPresetStatus.textContent = text;
    promptPresetStatus.classList.toggle('warn', tone === 'warn');
    promptPresetStatus.classList.toggle('ok', tone === 'ok');
}
function resetPromptPresetDeleteState(){
    promptPresetDeleteArmed = false;
    if(promptPresetDelete){
        promptPresetDelete.textContent = tr('common.delete');
        promptPresetDelete.classList.remove('confirm-danger');
    }
}
function createPromptPresetFromNode(node, {openPanel=true}={}){
    const text = String(node?.text || '').trim();
    if(!text){ toast(tr('smart.promptPresetEmpty')); return null; }
    const preset = {id:uid('preset'), name:defaultPromptPresetName(text), text, createdAt:Date.now(), updatedAt:Date.now()};
    promptPresets.unshift(preset);
    savePromptPresets();
    if(node) node.promptPresetId = preset.id;
    render();
    scheduleSave();
    if(openPanel) openPromptPresetPanel(node?.id || '', preset.id, {status:tr('smart.promptPresetSavedNew'), tone:'ok'});
    return preset;
}
function savePromptNodeAsPreset(node){
    createPromptPresetFromNode(node);
}
function renderPromptPresetPanel(selectedId='', message=''){
    if(!promptPresetSelect) return;
    resetPromptPresetDeleteState();
    promptPresetSelect.innerHTML = promptPresets.length
        ? promptPresets.map(p => `<option value="${escapeHtml(p.id)}" ${p.id === selectedId ? 'selected' : ''}>${escapeHtml(p.name || tr('smart.promptPresetUnnamed'))}</option>`).join('')
        : `<option value="">${escapeHtml(tr('smart.promptPresetNone'))}</option>`;
    const preset = currentPromptPreset(selectedId) || promptPresets[0] || null;
    if(preset && promptPresetSelect.value !== preset.id) promptPresetSelect.value = preset.id;
    promptPresetName.value = preset?.name || '';
    promptPresetText.value = preset?.text || '';
    const hasPreset = Boolean(preset);
    const nodeHasText = Boolean(String(promptPresetPanelNode()?.text || '').trim());
    promptPresetApply.disabled = !hasPreset;
    promptPresetDelete.disabled = !hasPreset;
    promptPresetSave.disabled = !hasPreset;
    if(promptPresetNew) promptPresetNew.disabled = !nodeHasText;
    setPromptPresetStatus(message || (hasPreset ? tr('smart.promptPresetPanelHint') : tr('smart.promptPresetPanelEmpty')));
}
function openPromptPresetPanel(nodeId='', presetId='', options={}){
    if(!promptPresetPanel) return;
    promptPresetPanel.dataset.nodeId = nodeId || '';
    const node = nodes.find(n => n.id === nodeId);
    const preferred = presetId || node?.promptPresetId || promptPresets[0]?.id || '';
    renderPromptPresetPanel(preferred, options.status || '');
    if(options.tone) setPromptPresetStatus(options.status || '', options.tone);
    const nodeEl = nodeId ? world.querySelector(`.image-node[data-id="${CSS.escape(nodeId)}"]`) : null;
    const rect = nodeEl?.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    const maxLeft = Math.max(18, shellRect.width - 410);
    const maxTop = Math.max(18, shellRect.height - 330);
    const left = rect ? Math.min(maxLeft, Math.max(18, rect.right - shellRect.left + 12)) : 80;
    const top = rect ? Math.min(maxTop, Math.max(18, rect.top - shellRect.top)) : 80;
    promptPresetPanel.style.left = `${left}px`;
    promptPresetPanel.style.top = `${top}px`;
    promptPresetPanel.classList.add('open');
    refreshIcons();
}
function closePromptPresetPanel(){
    promptPresetPanel?.classList.remove('open');
    resetPromptPresetDeleteState();
}
function editPromptPresetForNode(node){
    if(!promptPresets.length) savePromptNodeAsPreset(node);
    else openPromptPresetPanel(node?.id || '', node?.promptPresetId || '');
}
function assetCategories(type='image'){
    return (assetLibrary.categories || []).filter(cat => (cat.type || 'image') === type);
}
function activeAssetCategory(){
    const cats = assetCategories('image');
    if(!cats.length) return null;
    return cats.find(cat => cat.id === activeAssetCategoryId) || cats[0];
}
async function loadAssetLibrary(){
    try {
        const data = await fetch('/api/asset-library').then(r => r.json());
        assetLibrary = data.library || {categories:[]};
        if(!activeAssetCategoryId) activeAssetCategoryId = activeAssetCategory()?.id || '';
        renderAssetLibrary();
    } catch(e) {
        toast(tr('smart.assetLoadFail'));
    }
}
function setAssetLibraryFromResponse(data){
    assetLibrary = data.library || assetLibrary;
    if(!activeAssetCategoryId) activeAssetCategoryId = activeAssetCategory()?.id || '';
    renderAssetLibrary();
}
function toggleAssetLibrary(open=!assetLibraryOpen){
    assetLibraryOpen = !!open;
    assetPanel.classList.toggle('open', assetLibraryOpen);
    if(assetLibraryOpen) loadAssetLibrary();
    render();
}
function assetCategoryForMention(){
    const cats = assetCategories('image');
    if(!cats.length) return null;
    return cats.find(cat => cat.id === mentionAssetCategoryId)
        || cats.find(cat => cat.id === activeAssetCategoryId)
        || cats.find(cat => (cat.items || []).length)
        || cats[0];
}
function assetMediaKind(item){
    if(!item) return 'image';
    if(item.kind === 'video' || item.type === 'video') return 'video';
    if(item.kind === 'audio' || item.type === 'audio') return 'audio';
    const url = String(item.url || item.thumbnail || '').toLowerCase().split('?')[0];
    const name = String(item.name || '').toLowerCase();
    if(/\.(mp4|webm|mov|m4v|avi|mkv)$/.test(url) || /\.(mp4|webm|mov|m4v|avi|mkv)$/.test(name)) return 'video';
    if(/\.(mp3|wav|m4a|aac|ogg|flac)$/.test(url) || /\.(mp3|wav|m4a|aac|ogg|flac)$/.test(name)) return 'audio';
    return 'image';
}
function assetThumbHtml(item){
    const url = escapeAttr(item.url || '');
    const thumb = escapeAttr(item.thumbnail || item.thumb || item.preview || item.url || '');
    const kind = assetMediaKind(item);
    if(kind === 'video'){
        return `<div class="asset-thumb-wrap"><video class="asset-thumb" src="${url}" data-url="${url}" muted preload="metadata" playsinline disablepictureinpicture controlslist="nodownload noplaybackrate noremoteplayback"></video><span class="asset-video-badge"><i data-lucide="film"></i>VIDEO</span></div>`;
    }
    if(kind === 'audio'){
        return `<div class="asset-thumb-wrap media-thumb audio-thumb asset-thumb"><i data-lucide="file-audio"></i><span>${escapeHtml(item.name || 'Audio')}</span></div>`;
    }
    return `<img class="asset-thumb" src="${thumb}" alt="">`;
}
function renderAssetLibrary(){
    document.querySelectorAll('[data-asset-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.assetTab === assetTab));
    const imageMode = assetTab === 'image';
    assetImageControls.style.display = imageMode ? 'block' : 'none';
    assetDropZone.style.display = imageMode ? 'flex' : 'none';
    assetGrid.style.display = imageMode ? 'grid' : 'none';
    workflowEmpty.style.display = imageMode ? 'none' : 'flex';
    if(!imageMode){ refreshIcons(); return; }
    const cats = assetCategories('image');
    if(!cats.some(cat => cat.id === activeAssetCategoryId)) activeAssetCategoryId = cats[0]?.id || '';
    assetCategorySelect.innerHTML = cats.map(cat => `<option value="${escapeHtml(cat.id)}" ${cat.id === activeAssetCategoryId ? 'selected' : ''}>${escapeHtml(cat.name || tr('smart.assetFolder'))}</option>`).join('');
    const cat = activeAssetCategory();
    const items = cat?.items || [];
    assetGrid.innerHTML = items.length ? items.map(item => `
        <div class="asset-item" draggable="true" data-asset-id="${escapeHtml(item.id)}" data-url="${escapeHtml(item.url)}" data-name="${escapeHtml(item.name || 'asset')}" data-kind="${escapeHtml(assetMediaKind(item))}">
            ${assetThumbHtml(item)}
            <div class="asset-meta">
                <span class="asset-name" title="${escapeHtml(item.name || '')}">${escapeHtml(item.name || 'asset')}</span>
                <button class="asset-mini-btn" type="button" data-rename-asset="${escapeHtml(item.id)}" title="${escapeHtml(tr('smart.assetRename'))}"><i data-lucide="pencil"></i></button>
                <button class="asset-mini-btn" type="button" data-delete-asset="${escapeHtml(item.id)}" title="${escapeHtml(tr('common.delete'))}"><i data-lucide="trash-2"></i></button>
            </div>
        </div>
    `).join('') : `<div class="asset-empty">${escapeHtml(tr('smart.assetEmpty'))}</div>`;
    bindAssetItemEvents();
    refreshIcons();
}
function openAssetNameDialog({title='', value='', placeholder='' }={}){
    return new Promise(resolve => {
        assetDialogTitle.textContent = title || tr('smart.assetRename');
        assetDialogInput.value = value || '';
        assetDialogInput.placeholder = placeholder || '';
        assetDialogBackdrop.classList.add('open');
        assetDialogInput.focus();
        assetDialogInput.select();
        const cleanup = result => {
            assetDialogBackdrop.classList.remove('open');
            assetDialogOk.onclick = null;
            assetDialogCancel.onclick = null;
            assetDialogInput.onkeydown = null;
            assetDialogBackdrop.onmousedown = null;
            resolve(result);
        };
        assetDialogOk.onclick = () => cleanup(assetDialogInput.value.trim());
        assetDialogCancel.onclick = () => cleanup('');
        assetDialogInput.onkeydown = event => {
            if(event.key === 'Enter') cleanup(assetDialogInput.value.trim());
            if(event.key === 'Escape') cleanup('');
        };
        assetDialogBackdrop.onmousedown = event => {
            if(event.target === assetDialogBackdrop) cleanup('');
        };
    });
}
function positionAssetHoverPreview(event){
    if(!assetHoverPreview || assetHoverPreview.style.display === 'none') return;
    const pad = 14;
    const w = assetHoverPreview.offsetWidth || 260;
    const h = assetHoverPreview.offsetHeight || 300;
    let left = event.clientX - w - 16;
    if(left < pad) left = event.clientX + 16;
    left = Math.max(pad, Math.min(window.innerWidth - w - pad, left));
    const top = Math.max(pad, Math.min(window.innerHeight - h - pad, event.clientY + 12));
    assetHoverPreview.style.left = `${left}px`;
    assetHoverPreview.style.top = `${top}px`;
}
function showAssetHoverPreview(event, item){
    if(!assetHoverPreview || !item?.url) return;
    let media = assetHoverPreview.querySelector('img,video');
    const name = assetHoverPreview.querySelector('.asset-hover-name');
    const kind = assetMediaKind(item);
    if(kind === 'video' && media?.tagName?.toLowerCase() !== 'video'){
        media?.replaceWith(document.createElement('video'));
        media = assetHoverPreview.querySelector('video');
    } else if(kind !== 'video' && media?.tagName?.toLowerCase() !== 'img'){
        media?.replaceWith(document.createElement('img'));
        media = assetHoverPreview.querySelector('img');
    }
    if(kind === 'video'){
        media.muted = true;
        media.loop = true;
        media.playsInline = true;
        media.preload = 'metadata';
        media.controls = false;
        media.disablePictureInPicture = true;
        media.setAttribute('disablepictureinpicture', '');
        media.setAttribute('controlslist', 'nodownload noplaybackrate noremoteplayback');
        media.src = item.url;
        media.play?.().catch(() => {});
    } else {
        media.src = item.url;
        media.alt = 'asset preview';
    }
    name.textContent = item.name || 'asset';
    assetHoverPreview.style.display = 'block';
    positionAssetHoverPreview(event);
}
function hideAssetHoverPreview(){
    if(!assetHoverPreview) return;
    assetHoverPreview.style.display = 'none';
    const media = assetHoverPreview.querySelector('img,video');
    media?.pause?.();
    media?.removeAttribute('src');
    media?.load?.();
}
function bindAssetItemEvents(){
    assetGrid.querySelectorAll('.asset-item').forEach(el => {
        const thumb = el.querySelector('.asset-thumb');
        thumb?.addEventListener('mouseenter', e => showAssetHoverPreview(e, {url:el.dataset.url, name:el.dataset.name, kind:el.dataset.kind}));
        thumb?.addEventListener('mousemove', e => positionAssetHoverPreview(e));
        thumb?.addEventListener('mouseleave', hideAssetHoverPreview);
        el.addEventListener('dragstart', e => {
            hideAssetHoverPreview();
            e.dataTransfer.effectAllowed = 'copy';
            e.dataTransfer.setData('application/x-smart-asset', JSON.stringify({url:el.dataset.url, name:el.dataset.name, kind:el.dataset.kind}));
            e.dataTransfer.setData('text/plain', el.dataset.url || '');
        });
    });
    assetGrid.querySelectorAll('[data-rename-asset]').forEach(btn => {
        btn.onclick = async e => {
            e.preventDefault(); e.stopPropagation();
            const item = (activeAssetCategory()?.items || []).find(x => x.id === btn.dataset.renameAsset);
            const name = await openAssetNameDialog({title:tr('smart.assetRename'), value:item?.name || '', placeholder:tr('smart.assetRename')});
            if(!name) return;
            const data = await fetch(`/api/asset-library/items/${encodeURIComponent(btn.dataset.renameAsset)}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name})}).then(r => r.json());
            setAssetLibraryFromResponse(data);
        };
    });
    assetGrid.querySelectorAll('[data-delete-asset]').forEach(btn => {
        btn.onclick = async e => {
            e.preventDefault(); e.stopPropagation();
            if(!confirm(tr('smart.assetDeleteConfirm'))) return;
            const data = await fetch(`/api/asset-library/items/${encodeURIComponent(btn.dataset.deleteAsset)}`, {method:'DELETE'}).then(r => r.json());
            setAssetLibraryFromResponse(data);
        };
    });
}
async function addUrlToAssetLibrary(url, name=''){
    const cat = activeAssetCategory();
    if(!cat){ toast(tr('smart.assetNoFolder')); return; }
    const data = await fetch('/api/asset-library/items', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({category_id:cat.id, url, name})}).then(async r => {
        if(!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || tr('smart.assetAddFail'));
        return r.json();
    });
    setAssetLibraryFromResponse(data);
    toast(tr('smart.assetSaved'));
}
function canvasImageDragPayload(node, index=0){
    const img = node?.images?.[index];
    if(!img?.url) return null;
    return {url:img.url, name:img.name || node.title || 'image'};
}
async function loadCanvas(){
    if(!canvasId) return;
    try {
        const res = await fetch(`/api/canvases/${encodeURIComponent(canvasId)}`);
        if(!res.ok) return;
        const data = await res.json();
        canvas = data.canvas;
        document.title = canvas.title || tr('canvas.smartCanvas');
        document.getElementById('smartTitle').textContent = canvas.title || tr('canvas.smartCanvas');
        nodes = Array.isArray(canvas.nodes) ? canvas.nodes : [];
        nodes.forEach(n => { if(n.pending) n.pending = 0; });
        canvas.connections = Array.isArray(canvas.connections) ? canvas.connections : [];
        viewport = {...viewport, ...(canvas.viewport || {})};
        viewport.scale = safeScale(viewport.scale);
        if(canvas.settings) settings = {...settings, ...canvas.settings};
        canvasDefaultSmartSettings = cloneSmartSettings(settings);
        loadRecentSmartSettings();
        if(settings.comfy_workflow && !settings.comfyWorkflow) settings.comfyWorkflow = settings.comfy_workflow;
        if(settings.comfy_params && !settings.comfyParams) settings.comfyParams = settings.comfy_params;
        updateProviderModels();
        applyViewport();
        render();
    } catch(e) { toast(tr('smart.toastCanvasFail')); }
}
function scheduleSave(){
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveCanvas, 450);
}
async function saveCanvas(){
    if(!canvasId || !canvas) return;
    savePromptDraftForCurrent();
    nodes.forEach(node => {
        node.images = (node.images || []).map(img => stripImageGenerationMeta(img));
    });
    canvas.nodes = nodes;
    canvas.settings = cloneSmartSettings(canvasDefaultSmartSettings || initialSmartSettings);
    canvas.viewport = {...viewport};
    try {
        const res = await fetch(`/api/canvases/${encodeURIComponent(canvasId)}`, {
            method:'PUT',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({
                title:canvas.title || tr('smart.title'),
                icon:canvas.icon || 'sparkles',
                nodes,
                connections:canvas.connections || [],
                viewport:canvas.viewport || {x:0,y:0,scale:1},
                logs:canvas.logs || [],
                settings:canvas.settings,
                base_updated_at:canvas.updated_at || 0
            })
        });
        if(res.ok){
            const data = await res.json();
            if(data.canvas) canvas = {...canvas, ...data.canvas};
        } else if(res.status === 409) {
            const data = await res.json().catch(() => ({}));
            if(data.detail?.updated_at) canvas.updated_at = data.detail.updated_at;
            saveTimer = setTimeout(saveCanvas, 300);
        }
    } catch(e) {}
}
function imageMetaFromNode(node){
    return {};
}
function applyNodeMetaToImage(image, node){
    return stripImageGenerationMeta(image);
}
function inheritNodeMetaFromImage(node){
    if(!node) return;
    node.images = (node.images || []).map(img => stripImageGenerationMeta(img));
}
function createNode(x, y, images=[], options={}){
    if(!options.skipUndo) pushUndo();
    const nodeImages = (images || []).map(img => ({...img}));
    const node = {id:uid('smart'), type:'smart-image', x, y, title:nodeImages.length > 1 ? 'Group' : nodeImages.length ? 'Image' : '上传卡片', images:nodeImages, created_at:Date.now()};
    node.scale = nodeImages.length > 1 ? MEDIA_GROUP_DEFAULT_SCALE : mediaNodeDefaultScale(node);
    inheritNodeMetaFromImage(node);
    nodes.push(node);
    if(options.select !== false) selectedId = node.id;
    render();
    scheduleSave();
    return node;
}
function createPromptNode(x, y, options={}){
    if(!options.skipUndo) pushUndo();
    const providerId = resolveChatProviderId();
    const node = {
        id:uid('prompt'),
        type:'smart-prompt',
        x,
        y,
        w:316,
        h:194,
        title:'Prompt',
        text:'',
        llmEnabled:false,
        llmProvider:providerId,
        llmModel:resolveChatModel('', providerId),
        llmSystemEnabled:false,
        llmSystemPrompt:'You are a helpful prompt assistant.',
        llmInstruction:'',
        created_at:Date.now()
    };
    nodes.push(node);
    if(options.select !== false) selectedId = node.id;
    render();
    scheduleSave();
    return node;
}
function createLoopNode(x, y, options={}){
    if(!options.skipUndo) pushUndo();
    const node = {id:uid('loop'), type:'smart-loop', x, y, w:340, h:168, title:'Loop', count:1, mode:'serial', showPrompt:false, imageInput:false, loopStart:1, imageBatchSize:1, variablePrompt:'', created_at:Date.now()};
    nodes.push(node);
    if(options.select !== false) selectedId = node.id;
    render();
    scheduleSave();
    return node;
}
function cloneSmartNode(node, dx=0, dy=0){
    const copy = JSON.parse(JSON.stringify(node));
    copy.id = uid(node.type === 'smart-prompt' ? 'prompt' : node.type === 'smart-loop' ? 'loop' : 'smart');
    copy.x = (Number(node.x) || 0) + dx;
    copy.y = (Number(node.y) || 0) + dy;
    copy.running = false;
    copy.pending = 0;
    delete copy.runStartedAt;
    delete copy.runFinishedAt;
    delete copy.runElapsedMs;
    delete copy.runTimerHidden;
    return copy;
}
function copySelectedNodes(){
    if(!canvas || isEditableTarget(document.activeElement)) return;
    const ids = selectedNodeIds();
    const copiedNodes = ids.map(id => nodes.find(n => n.id === id)).filter(Boolean);
    if(!copiedNodes.length) return;
    const idSet = new Set(copiedNodes.map(n => n.id));
    const copiedConnections = (canvas.connections || []).filter(c => idSet.has(c.from) && idSet.has(c.to));
    nodeClipboard = {
        nodes:JSON.parse(JSON.stringify(copiedNodes)),
        connections:JSON.parse(JSON.stringify(copiedConnections))
    };
    toast(`已复制 ${copiedNodes.length} 个节点`);
}
function pasteNodes(){
    if(!canvas || !nodeClipboard?.nodes?.length || isEditableTarget(document.activeElement)) return;
    lastNodePasteAt = Date.now();
    pushUndo();
    const sourceNodes = nodeClipboard.nodes;
    const xs = sourceNodes.map(n => Number(n.x) || 0);
    const ys = sourceNodes.map(n => Number(n.y) || 0);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const p = lastMouseWorld || viewportCenter();
    const dx = p.x - cx;
    const dy = p.y - cy;
    const idMap = new Map();
    const copies = sourceNodes.map(n => {
        const copy = cloneSmartNode(n, dx, dy);
        idMap.set(n.id, copy.id);
        return copy;
    });
    copies.forEach(copy => {
        if(Array.isArray(copy.inputNodeIds)){
            copy.inputNodeIds = copy.inputNodeIds.map(id => idMap.get(id)).filter(Boolean);
        }
        if(copy.sourceNodeId) copy.sourceNodeId = idMap.get(copy.sourceNodeId) || '';
    });
    const newConnections = (nodeClipboard.connections || []).map(conn => ({
        ...conn,
        from:idMap.get(conn.from),
        to:idMap.get(conn.to)
    })).filter(conn => conn.from && conn.to && conn.from !== conn.to);
    canvas.connections = [...(canvas.connections || []), ...newConnections];
    nodes.push(...copies);
    selectedId = copies.length === 1 ? copies[0].id : '';
    selectedIds = copies.length > 1 ? copies.map(n => n.id) : [];
    selectedImage = {nodeId:'', index:-1};
    render();
    scheduleSave();
}
function duplicateForAltDrag(node){
    const ids = (isNodeSelected(node.id) ? selectedNodeIds() : [node.id]);
    const sourceNodes = ids.map(id => nodes.find(n => n.id === id)).filter(Boolean);
    if(!sourceNodes.length) return node;
    pushUndo();
    const idMap = new Map();
    const copies = sourceNodes.map(n => {
        const copy = cloneSmartNode(n, 0, 0);
        idMap.set(n.id, copy.id);
        return copy;
    });
    copies.forEach(copy => {
        if(Array.isArray(copy.inputNodeIds)) copy.inputNodeIds = copy.inputNodeIds.map(id => idMap.get(id)).filter(Boolean);
        if(copy.sourceNodeId) copy.sourceNodeId = idMap.get(copy.sourceNodeId) || '';
    });
    const idSet = new Set(sourceNodes.map(n => n.id));
    const copiedConnections = (canvas.connections || []).filter(c => idSet.has(c.from) && idSet.has(c.to));
    const newConnections = copiedConnections.map(conn => ({...conn, from:idMap.get(conn.from), to:idMap.get(conn.to)})).filter(conn => conn.from && conn.to && conn.from !== conn.to);
    canvas.connections = [...(canvas.connections || []), ...newConnections];
    nodes.push(...copies);
    selectedId = '';
    selectedIds = [];
    selectedImage = {nodeId:'', index:-1};
    const dragCopy = copies.find(c => c.id === idMap.get(node.id)) || copies[0];
    render();
    scheduleSave();
    return dragCopy;
}
function shellPoint(event){
    const rect = shell.getBoundingClientRect();
    return {x:event.clientX - rect.left, y:event.clientY - rect.top};
}
function renderConnections(){
    const conns = (canvas?.connections || []).map((conn, index) => ({...conn, index})).filter(c => nodes.some(n => n.id === c.from) && nodes.some(n => n.id === c.to));
    const paths = conns.map(conn => {
        const fromNode = nodes.find(n => n.id === conn.from);
        const toNode = nodes.find(n => n.id === conn.to);
        const fr = nodeRect(fromNode), tr = nodeRect(toNode);
        const kind = conn.kind || 'flow';
        const fx = fr.x + fr.width;
        const fy = fr.y + fr.height / 2;
        const tx = tr.x;
        const ty = tr.y + tr.height / 2;
        const dx = Math.max(50, Math.abs(tx - fx) * 0.45);
        const curve = `M${fx} ${fy} C ${fx+dx} ${fy}, ${tx-dx} ${ty}, ${tx} ${ty}`;
        const mx = (fx + tx) / 2, my = (fy + ty) / 2;
        const cls = toNode.pending ? 'conn-pending' : '';
        const color = kind === 'input' ? 'rgba(100,116,139,0.62)' : 'rgba(148,163,184,0.62)';
        const opacity = toNode.pending ? '.82' : '1';
        return `<path class="${cls}" d="${curve}" stroke="${color}" stroke-width="${kind === 'input' ? '1.9' : '1.6'}" fill="none" opacity="${opacity}"></path><path class="conn-hit" data-conn-index="${conn.index}" d="${curve}" stroke="transparent" stroke-width="14" fill="none"></path><circle cx="${tx}" cy="${ty}" r="3.5" fill="${color}" opacity=".66"></circle><g class="conn-cut" data-conn-index="${conn.index}" transform="translate(${mx} ${my})"><circle r="8" fill="var(--card)" stroke="${color}" stroke-width="1.4"></circle><path d="M-3 -3 L3 3 M3 -3 L-3 3" stroke="${color}" stroke-width="1.5" stroke-linecap="round"></path></g>`;
    }).join('');
    return `<svg class="connection-layer" width="6000" height="4000" viewBox="0 0 6000 4000" xmlns="http://www.w3.org/2000/svg">${paths}</svg>`;
}
function refreshConnectionLayer(){
    const oldSvg = world.querySelector('svg.connection-layer');
    if(!oldSvg) return;
    const tpl = document.createElement('template');
    tpl.innerHTML = renderConnections().trim();
    const nextSvg = tpl.content.firstElementChild;
    if(nextSvg) oldSvg.replaceWith(nextSvg);
    bindConnectionEvents();
}
function moveNodeElementsDuringDrag(){
    if(!dragState) return;
    (dragState.group || [{id:dragState.id}]).forEach(item => {
        const n = nodes.find(x => x.id === item.id);
        const el = world.querySelector(`.image-node[data-id="${CSS.escape(item.id)}"]`);
        if(n && el){
            el.style.left = `${n.x || 0}px`;
            el.style.top = `${n.y || 0}px`;
        }
    });
    const active = selectedNode();
    if(active && (dragState.group || [{id:dragState.id}]).some(item => item.id === active.id)){
        positionComposerForNode(active);
    }
    refreshConnectionLayer();
    renderMinimap();
}
function isVideoMediaItem(img){
    if(!img) return false;
    if(img.kind === 'video') return true;
    const url = String(img.url || '').toLowerCase();
    return /\.(mp4|webm|mov|m4v)(\?|$)/.test(url);
}
function isAudioMediaItem(img){
    if(!img) return false;
    if(img.kind === 'audio') return true;
    const url = String(img.url || '').toLowerCase();
    return /\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/.test(url);
}
function mediaKindForFile(file){
    const type = String(file?.type || '').toLowerCase();
    const name = String(file?.name || '').toLowerCase();
    if(type.startsWith('video/') || /\.(mp4|webm|mov|m4v|avi|mkv)(\?|$)/.test(name)) return 'video';
    if(type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/.test(name)) return 'audio';
    return 'image';
}
function mediaKindForItem(img){
    if(isAudioMediaItem(img)) return 'audio';
    if(isVideoMediaItem(img)) return 'video';
    return 'image';
}
function imageRefsOnly(refs){
    return (refs || []).filter(ref => ref?.url && mediaKindForItem(ref) === 'image');
}
function videoRefsOnly(refs){
    return (refs || []).filter(ref => ref?.url && mediaKindForItem(ref) === 'video');
}
function audioRefsOnly(refs){
    return (refs || []).filter(ref => ref?.url && mediaKindForItem(ref) === 'audio');
}
function thumbMediaHtml(img){
    if(isAudioMediaItem(img)) return `<div class="media-thumb audio-thumb" data-media-url="${escapeAttr(img.url || '')}" data-media-kind="audio"><i data-lucide="file-audio"></i><span>${escapeHtml(img.name || 'Audio')}</span></div>`;
    if(isVideoMediaItem(img)) return `<div class="media-thumb video-thumb"><video src="${escapeHtml(img.url)}" data-url="${escapeHtml(img.url)}" muted preload="metadata" playsinline disablepictureinpicture controlslist="nodownload noplaybackrate noremoteplayback"></video></div>`;
    return `<img src="${escapeHtml(img.url)}" draggable="false">`;
}
function imageResolutionLabel(img){
    const w = Number(img?.natural_w || img?.width || img?.w || 0);
    const h = Number(img?.natural_h || img?.height || img?.h || 0);
    return w > 0 && h > 0 ? `${Math.round(w)} x ${Math.round(h)}` : '';
}
function imageResolutionBadgeHtml(img){
    const label = imageResolutionLabel(img);
    return label ? `<span class="image-resolution-badge">${escapeHtml(label)}</span>` : '';
}
function singleMediaHtml(img, w, h){
    if(isAudioMediaItem(img)) return `<div class="node-img media-card media-audio-card" style="width:${w}px;height:${h}px"><div class="media-card-icon"><i data-lucide="file-audio"></i></div><div class="media-card-title">${escapeHtml(img.name || 'Audio')}</div><div class="media-card-sub">AUDIO</div><audio src="${escapeAttr(img.url || '')}" data-url="${escapeAttr(img.url || '')}" controls preload="metadata"></audio></div>`;
    if(isVideoMediaItem(img)) return `<div class="node-img media-card media-video-card" style="width:${w}px;height:${h}px"><video src="${escapeHtml(img.url)}" data-url="${escapeHtml(img.url)}" controls muted preload="metadata" playsinline disablepictureinpicture controlslist="nodownload noplaybackrate noremoteplayback"></video></div>`;
    return `<img class="node-img" src="${escapeHtml(img.url)}" draggable="false" style="width:${w}px;height:${h}px">`;
}
function smartNodeHasLiveMedia(node){
    return Boolean(!node?.pending && (node?.images || []).some(img => isVideoMediaItem(img) || isAudioMediaItem(img)));
}
function mediaSignaturePartFromElement(itemEl){
    if(itemEl?.dataset?.mediaSignature) return itemEl.dataset.mediaSignature;
    const media = itemEl?.querySelector?.('video,audio,img');
    if(media){
        const tag = media.tagName.toLowerCase();
        const kind = tag === 'video' ? 'video' : tag === 'audio' ? 'audio' : 'image';
        const url = media.dataset?.url || media.getAttribute('src') || '';
        return `${kind}:${url}`;
    }
    const audioThumb = itemEl?.querySelector?.('.audio-thumb[data-media-url]');
    if(audioThumb) return `audio:${audioThumb.dataset.mediaUrl || ''}`;
    return '';
}
function captureMediaPlaybackState(media){
    if(!media) return null;
    return {
        currentTime:Number.isFinite(media.currentTime) ? media.currentTime : 0,
        paused:Boolean(media.paused),
        playbackRate:Number.isFinite(media.playbackRate) ? media.playbackRate : 1,
        muted:Boolean(media.muted),
        volume:Number.isFinite(media.volume) ? media.volume : 1
    };
}
function restoreMediaPlaybackState(media, state){
    if(!media || !state) return;
    try { media.playbackRate = state.playbackRate || 1; } catch(e) {}
    try { media.muted = state.muted; } catch(e) {}
    try { media.volume = state.volume; } catch(e) {}
    const applyTime = () => {
        if(Number.isFinite(state.currentTime) && state.currentTime > 0 && Math.abs((media.currentTime || 0) - state.currentTime) > 0.2){
            try { media.currentTime = state.currentTime; } catch(e) {}
        }
        if(!state.paused && typeof media.play === 'function'){
            const playPromise = media.play();
            if(playPromise?.catch) playPromise.catch(() => {});
        }
    };
    if(media.readyState >= 1) applyTime();
    else media.addEventListener('loadedmetadata', applyTime, {once:true});
}
function transplantSmartMediaElements(oldNodeEl, newNodeEl){
    const oldItems = [...(oldNodeEl?.querySelectorAll?.('.thumb-item,.image-wrap') || [])];
    const newItems = [...(newNodeEl?.querySelectorAll?.('.thumb-item,.image-wrap') || [])];
    oldItems.forEach((oldItem, index) => {
        const oldMedia = oldItem.querySelector('video,audio');
        if(!oldMedia) return;
        const selector = oldMedia.tagName.toLowerCase();
        const oldUrl = oldMedia.dataset?.url || oldMedia.getAttribute('src') || '';
        const oldSignature = oldItem.dataset?.mediaSignature || `${selector}:${oldUrl}`;
        const newItem = newItems.find(item => item.dataset?.mediaSignature === oldSignature)
            || newItems.find(item => item.querySelector?.(selector)?.dataset?.url === oldUrl)
            || newItems[index];
        const newMedia = newItem?.querySelector?.(selector);
        const newUrl = newMedia?.dataset?.url || newMedia?.getAttribute?.('src') || '';
        if(!newMedia || oldUrl !== newUrl) return;
        const state = captureMediaPlaybackState(oldMedia);
        newMedia.replaceWith(oldMedia);
        restoreMediaPlaybackState(oldMedia, state);
        requestAnimationFrame(() => restoreMediaPlaybackState(oldMedia, state));
    });
}
function captureMediaPlaybackStates(){
    const states = new Map();
    world.querySelectorAll('video[data-url], audio[data-url]').forEach(media => {
        const tag = media.tagName.toLowerCase();
        const url = media.dataset.url || media.getAttribute('src') || '';
        if(url) states.set(`${tag}:${url}`, captureMediaPlaybackState(media));
    });
    return states;
}
function restoreMediaPlaybackStates(states){
    if(!states?.size) return;
    world.querySelectorAll('video[data-url], audio[data-url]').forEach(media => {
        const tag = media.tagName.toLowerCase();
        const url = media.dataset.url || media.getAttribute('src') || '';
        restoreMediaPlaybackState(media, states.get(`${tag}:${url}`));
    });
}
function smartRunTaskLabel(run){
    const s = run?.settings || {};
    if(run?.kind === 'video') return s.videoModel || 'Video';
    if(s.engine === 'comfy'){
        if(s.comfyMode === 'custom') return s.comfyWorkflow || 'ComfyUI';
        const labels = {text:tr('canvas.comfyModeText') || '文生图', enhance:tr('canvas.comfyModeEnhance') || '图片增强', edit:tr('canvas.comfyModeEdit') || '图片编辑'};
        return labels[s.comfyMode || 'text'] || 'ComfyUI';
    }
    if(s.engine === 'modelscope'){
        return s.msgenModel === 'custom' ? (s.msCustomModel || 'ModelScope') : (MS_GEN_MODELS[s.msgenModel]?.label || s.msgenModel || 'ModelScope');
    }
    return s.model || 'API Image';
}
function outputUrlLooksVideo(url){
    return /\.(mp4|webm|mov|m4v)(\?|$)/.test(String(url || '').toLowerCase());
}
function safeExportFileName(name, fallback='download.zip'){
    const cleaned = String(name || fallback).replace(/[\\/:*?"<>|]+/g, '_').trim();
    return cleaned || fallback;
}
function downloadPreviewImage(){
    const node = nodes.find(n => n.id === previewNavState.nodeId);
    const image = node?.images?.[previewNavState.index];
    if(!image?.url) return;
    const name = image.name || image.url.split('/').pop() || 'image.png';
    const link = document.createElement('a');
    link.href = `/api/download-output?url=${encodeURIComponent(image.url)}&name=${encodeURIComponent(name)}`;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
}
function previewDownloadGroupItems(){
    const node = nodes.find(n => n.id === previewNavState.nodeId);
    return (node?.images || []).filter(item => item?.url);
}
async function downloadPreviewGroup(){
    const node = nodes.find(n => n.id === previewNavState.nodeId);
    const items = previewDownloadGroupItems();
    if(!items.length) return;
    try {
        const filename = safeExportFileName(`${node?.title || 'image-group'}.zip`, 'image-group.zip');
        const response = await fetch('/api/canvas-assets/download', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({filename, urls:items.map(item => item.url).filter(Boolean)})
        });
        if(!response.ok) throw new Error((await response.text()) || '批量下载失败');
        const blob = await response.blob();
        const href = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = href;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(href), 1200);
    } catch(e) {
        toast((e.message || '批量下载失败').slice(0, 160));
    }
}
function smartRunPlatformLabel(run){
    const s = run?.settings || {};
    if(s.engine === 'comfy') return 'ComfyUI';
    if(s.engine === 'modelscope') return 'ModelScope';
    if(run?.kind === 'video') return videoProviderById(s.videoProvider || '')?.name || s.videoProvider || 'Video';
    return apiProviderById(s.provider_id || '')?.name || s.provider_id || 'API';
}
function smartRunRequestMeta(run){
    const s = run?.settings || {};
    if(s.engine === 'comfy') return {workflow_json:s.comfyWorkflow || '', mode:s.comfyMode || 'text'};
    if(s.engine === 'modelscope') return {backend:'ModelScope', model:s.msgenModel || '', custom_model:s.msCustomModel || ''};
    if(run?.kind === 'video') return {provider_id:s.videoProvider || '', model:s.videoModel || '', duration:s.videoDuration || '', aspect_ratio:s.videoAspect || '', resolution:s.videoResolution || ''};
    return {provider_id:s.provider_id || '', model:s.model || '', size:run?.size || '', quality:s.quality || '', n:s.count || 1};
}
function smartRunSnapshot(node, prompt, refs=[], kind='image'){
    const settingsSnapshot = cloneSmartSettings(settings);
    return {
        nodeId:node?.id || '',
        nodeType:node?.type || 'smart-image',
        kind,
        settings:settingsSnapshot,
        prompt:prompt || '',
        refs:(refs || []).map(ref => ({url:ref.url || '', name:ref.name || 'image', kind:ref.kind || ''})).filter(ref => ref.url),
        size: kind === 'image' && settingsSnapshot.engine === 'api' ? sizeForRun() : ''
    };
}
function addSmartGenerationLog({run, outputs=[], runMs=0, error=''}) {
    if(!canvas) return;
    canvas.logs = canvas.logs || [];
    const entry = {
        id:uid('log'),
        createdAt:Date.now(),
        status:error ? 'failed' : 'success',
        platform:smartRunPlatformLabel(run),
        nodeType:run?.nodeType || 'smart-image',
        model:smartRunTaskLabel(run),
        request:smartRunRequestMeta(run),
        prompt:run?.prompt || '',
        outputs:(outputs || []).filter(Boolean),
        refs:run?.refs || [],
        runMs:Number(runMs || 0),
        error:error ? String(error) : ''
    };
    canvas.logs = [entry, ...canvas.logs].slice(0, 500);
    scheduleSave();
}
function smartLogPreviewNode(url, kind='image'){
    if(kind === 'video' || outputUrlLooksVideo(url)){
        window.open(url, '_blank');
        return;
    }
    const node = {id:'__smart_log_preview__', type:'smart-image', images:[{url, name:'log-preview', kind}], title:kind === 'video' ? 'Video' : 'Image'};
    const prevSelectedId = selectedId;
    const prevSelectedImage = {...selectedImage};
    nodes.push(node);
    try { openImageEditor(node.id, 0); }
    finally {
        nodes = nodes.filter(n => n.id !== node.id);
        selectedId = prevSelectedId;
        selectedImage = prevSelectedImage;
    }
}
function renderSmartCanvasLog(){
    const logs = canvas?.logs || [];
    smartLogList.innerHTML = logs.length ? logs.map(log => {
        const thumbs = (log.outputs || []).slice(0, 8).map(url => {
            const safe = escapeAttr(url);
            const kind = outputUrlLooksVideo(url) ? 'video' : 'image';
            return kind === 'video' ? `<video src="${safe}" data-url="${safe}" data-kind="video" muted playsinline disablepictureinpicture controlslist="nodownload noplaybackrate noremoteplayback"></video>` : `<img src="${safe}" data-url="${safe}" data-kind="image" alt="output">`;
        }).join('');
        const date = new Date(log.createdAt || Date.now()).toLocaleString(window.StudioI18n?.lang() === 'en' ? 'en-US' : 'zh-CN');
        const req = log.request || {};
        const taskId = req.task_id || req.taskId || req.prompt_id || req.promptId || '';
        const backend = req.workflow_json || req.workflow || req.provider_id || req.providerId || req.backend || '';
        const subParts = [
            date,
            `${window.StudioI18n?.lang() === 'en' ? 'outputs' : '输出'} ${(log.outputs || []).length}`,
            taskId ? `ID ${taskId}` : '',
            backend
        ].filter(Boolean);
        return `<div class="log-item ${log.status === 'failed' ? 'failed' : ''}">
            <div class="log-main">
                <div class="log-meta">
                    <span class="log-chip ${log.status === 'failed' ? 'status-failed' : 'status-ok'}">${escapeHtml(log.status === 'failed' ? tr('canvas.failed') : tr('canvas.success'))}</span>
                    <span class="log-chip">${escapeHtml(log.platform || '-')}</span>
                    ${log.model ? `<span class="log-chip">${escapeHtml(log.model)}</span>` : ''}
                    <span class="log-chip">${escapeHtml(formatRunDuration(log.runMs || 0))}</span>
                </div>
                <div class="log-subline">${subParts.map(part => `<span title="${escapeAttr(part)}">${escapeHtml(part)}</span>`).join('')}</div>
                ${log.error ? `<div class="log-error" title="${escapeAttr(log.error)}">${escapeHtml(log.error)}</div>` : ''}
                <div class="log-prompt" title="${escapeAttr(log.prompt || tr('canvas.noPromptMeta'))}" data-prompt="${escapeAttr(log.prompt || '')}">${escapeHtml(log.prompt || tr('canvas.noPromptMeta'))}</div>
            </div>
            <div class="log-thumbs">${thumbs}</div>
        </div>`;
    }).join('') : `<div class="log-empty">${escapeHtml(tr('canvas.noLogs'))}</div>`;
    smartLogList.querySelectorAll('[data-url]').forEach(el => {
        el.onclick = e => {
            e.stopPropagation();
            smartLogPreviewNode(el.dataset.url, el.dataset.kind || 'image');
        };
    });
    smartLogList.querySelectorAll('[data-prompt]').forEach(el => {
        el.onclick = e => {
            e.stopPropagation();
            const text = el.dataset.prompt || '';
            if(text) navigator.clipboard?.writeText(text).catch(() => {});
            const oldText = el.textContent;
            el.textContent = tr('canvas.copied');
            el.classList.add('copied');
            setTimeout(() => {
                el.textContent = oldText;
                el.classList.remove('copied');
            }, 900);
        };
    });
    refreshIcons();
}
function openSmartCanvasLog(){
    if(!canvas) return;
    renderSmartCanvasLog();
    smartLogModal.classList.add('open');
}
function closeSmartCanvasLog(){
    smartLogModal.classList.remove('open');
}
function promptNodeBodyHtml(node){
    node.llmProvider = resolveChatProviderId(node.llmProvider || '');
    node.llmModel = resolveChatModel(node.llmModel || '', node.llmProvider);
    node.llmSystemEnabled = node.llmSystemEnabled === true;
    if(node.promptPresetId && !promptPresets.some(p => p.id === node.promptPresetId)) node.promptPresetId = '';
    const presetOptions = `<option value="">${escapeHtml(tr('smart.promptPreset'))}</option>${promptPresets.map(p => `<option value="${escapeHtml(p.id)}" ${p.id === node.promptPresetId ? 'selected' : ''}>${escapeHtml(p.name || tr('smart.promptPresetUnnamed'))}</option>`).join('')}`;
    const readonly = node.llmEnabled ? 'readonly' : '';
    const systemPrompt = (node.llmSystemPrompt || '').trim();
    const inputThumbs = smartNodeInputThumbsHtml(promptNodeInputImages(node));
    const llmParams = node.llmEnabled ? `
        <div class="prompt-node-llm">
            <select class="prompt-node-control prompt-llm-provider">${chatProviderOptions(node.llmProvider)}</select>
            <select class="prompt-node-control prompt-llm-model">${chatModelOptions(node.llmModel, node.llmProvider)}</select>
            <textarea class="prompt-node-control prompt-llm-instruction" placeholder="${escapeHtml(tr('smart.promptLlmInstructionPlaceholder'))}">${escapeHtml(node.llmInstruction || '')}</textarea>
            <div class="prompt-node-llm-actions">
                <button class="prompt-node-run prompt-node-control" type="button" ${node.running ? 'disabled' : ''}><i data-lucide="${node.running ? 'loader-2' : 'play'}"></i><span>${node.running ? escapeHtml(tr('common.running')) : escapeHtml(tr('common.run'))}</span></button>
                <button class="prompt-node-pill prompt-node-control prompt-system-toggle ${node.llmSystemEnabled ? 'active' : ''}" type="button"><i data-lucide="${node.llmSystemEnabled ? 'toggle-right' : 'toggle-left'}"></i><span>${escapeHtml(node.llmSystemEnabled ? tr('smart.promptLlmDisableSystem') : tr('smart.promptLlmEnableSystem'))}</span></button>
            </div>
            ${node.llmSystemEnabled ? `<textarea class="prompt-node-control prompt-llm-system" placeholder="${escapeHtml(tr('smart.promptLlmSystemPlaceholder'))}">${escapeHtml(systemPrompt || 'You are a helpful prompt assistant.')}</textarea>` : ''}
        </div>` : '';
    return `<div class="prompt-node-card">
        <textarea class="prompt-node-text prompt-node-control" ${readonly} placeholder="${escapeHtml(tr('smart.promptPlaceholderNode'))}">${escapeHtml(node.text || '')}</textarea>
        <div class="prompt-node-tools">
            <select class="prompt-node-control prompt-node-preset-select">${presetOptions}</select>
            <button class="prompt-node-pill prompt-node-control prompt-preset-save" type="button"><i data-lucide="save"></i><span>${escapeHtml(tr('common.save'))}</span></button>
            <button class="prompt-node-pill prompt-node-control prompt-preset-edit" type="button"><i data-lucide="pencil"></i><span>${escapeHtml(tr('common.edit'))}</span></button>
            <button class="prompt-node-pill prompt-llm-toggle ${node.llmEnabled ? 'active' : ''}" type="button"><i data-lucide="sparkles"></i><span>LLM</span></button>
        </div>
        ${node.llmEnabled ? inputThumbs : ''}
        ${llmParams}
    </div>`;
}
function loopNumberControlHtml({label, value, key, min=1, max=100, quick=[1,2,3,4,5,6,8,10]}){
    const v = Math.max(min, Math.min(max, Number(value) || min));
    return `<div class="loop-number-control">
        <button class="loop-smart-control loop-number-trigger" type="button"><span>${escapeHtml(label)}</span><strong>${v}</strong></button>
        <div class="loop-number-popover">
            <div class="loop-number-grid">
                ${quick.map(n => `<button type="button" class="loop-smart-control loop-number-cell ${n === v ? 'active' : ''}" data-loop-number="${escapeHtml(key)}" data-loop-value="${n}">${n}</button>`).join('')}
            </div>
            <label class="loop-number-custom">
                <span>${escapeHtml(tr('common.custom'))}</span>
                <input class="loop-smart-control loop-number-input" type="number" min="${min}" max="${max}" step="1" data-loop-number-input="${escapeHtml(key)}" value="${v}">
            </label>
        </div>
    </div>`;
}
function smartLoopTokenLabel(token){
    if(token === '《计数》' || token === '[计数]') return tr('canvas.counterToken');
    return token;
}
function smartLoopTokenChipHtml(token){
    return `<span class="loop-smart-token-chip" contenteditable="false" data-token="${escapeHtml(token)}"><span>${escapeHtml(smartLoopTokenLabel(token))}</span><button type="button" aria-label="${escapeHtml(tr('common.delete'))}" title="${escapeHtml(tr('common.delete'))}">×</button></span>`;
}
function smartLoopVariableHtml(text){
    return String(text || '').split(/(《计数》|\[计数\])/g).map(part => {
        if(part === '《计数》' || part === '[计数]') return smartLoopTokenChipHtml('《计数》');
        return escapeHtml(part);
    }).join('');
}
function smartLoopEditorText(editor){
    const walk = node => {
        if(node.nodeType === Node.TEXT_NODE) return node.nodeValue || '';
        if(node.nodeType !== Node.ELEMENT_NODE) return '';
        if(node.classList?.contains('loop-smart-token-chip')) return node.dataset.token || '';
        if(node.tagName === 'BR') return '\n';
        return [...node.childNodes].map(walk).join('');
    };
    return [...(editor?.childNodes || [])].map(walk).join('').replace(/\u00a0/g, ' ');
}
function insertSmartLoopToken(editor, token){
    if(!editor) return;
    editor.focus();
    const chipWrap = document.createElement('span');
    chipWrap.innerHTML = smartLoopTokenChipHtml(token);
    const chip = chipWrap.firstElementChild;
    const spacer = document.createTextNode(' ');
    const sel = window.getSelection();
    if(sel && sel.rangeCount && editor.contains(sel.anchorNode)){
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(spacer);
        range.insertNode(chip);
        range.setStartAfter(spacer);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
    } else {
        editor.appendChild(chip);
        editor.appendChild(spacer);
    }
}
function smartLoopBodyHtml(node){
    node.count = smartLoopCount(node);
    node.mode = node.mode === 'parallel' ? 'parallel' : 'serial';
    node.loopStart = Math.max(1, Number(node.loopStart) || 1);
    node.imageBatchSize = Math.max(1, Math.min(100, Number(node.imageBatchSize) || 1));
    node.showPrompt = Boolean(node.showPrompt);
    node.imageInput = Boolean(node.imageInput);
    const imageCount = smartLoopInputImages(node, {index:node.loopStart}).length;
    const loopThumbs = smartNodeInputThumbsHtml(smartLoopPreviewImages(node));
    const promptItems = smartLoopInputPromptItems(node);
    const promptHint = promptItems.length
        ? trf('smart.loopPromptHintFound', {n:promptItems.length})
        : tr('smart.loopPromptHintVariable');
    const defaultPrompt = tr('smart.loopDefaultPrompt') || '现在生成第《计数》张图片';
    return `<div class="loop-smart-card ${node.imageInput ? 'has-image' : ''} ${node.showPrompt ? 'has-prompt' : ''}">
        <div class="loop-smart-row loop-smart-top">
            <div class="loop-smart-seg">
                <button type="button" class="loop-smart-control ${node.mode !== 'parallel' ? 'active' : ''}" data-loop-mode="serial">${escapeHtml(tr('canvas.loopSerial'))}</button>
                <button type="button" class="loop-smart-control ${node.mode === 'parallel' ? 'active' : ''}" data-loop-mode="parallel" title="${escapeHtml(tr('smart.loopParallelTip'))}">${escapeHtml(tr('canvas.loopParallel'))}</button>
            </div>
        </div>
        <div class="loop-smart-row">
            <button class="loop-smart-control loop-smart-toggle ${node.imageInput ? 'active' : ''}" type="button" data-loop-toggle="image"><i data-lucide="image"></i><span>${escapeHtml(tr('canvas.loopImageToggle'))}</span></button>
            <button class="loop-smart-control loop-smart-toggle ${node.showPrompt ? 'active' : ''}" type="button" data-loop-toggle="prompt"><i data-lucide="text-cursor-input"></i><span>${escapeHtml(tr('canvas.loopPromptToggle'))}</span></button>
        </div>
        ${node.imageInput ? `<div class="loop-smart-panel">
            ${loopThumbs}
            <div class="loop-smart-mini">
                ${loopNumberControlHtml({label:tr('canvas.loopImageStart'), value:node.loopStart, key:'loopStart', max:9999, quick:[1,2,3,4,5,6,8,10]})}
                ${loopNumberControlHtml({label:tr('canvas.loopBatchSize'), value:node.imageBatchSize, key:'imageBatchSize', max:100, quick:[1,2,3,4,5,6,8,10]})}
            </div>
            <div class="loop-smart-note">${imageCount ? escapeHtml(trf('canvas.loopImageWillOutput', {n:imageCount})) : escapeHtml(tr('canvas.loopImageEmpty'))}</div>
        </div>` : ''}
        ${node.showPrompt ? `<div class="loop-smart-panel prompt-panel">
            <div class="loop-smart-control loop-smart-text" contenteditable="true" data-placeholder="${escapeHtml(tr('canvas.loopVariablePlaceholder'))}">${smartLoopVariableHtml(node.variablePrompt || defaultPrompt)}</div>
            <div class="loop-smart-row">
                <button class="loop-smart-control loop-smart-token loop-smart-counter-token" type="button" data-loop-token="《计数》">${escapeHtml(tr('canvas.counterToken'))}</button>
                <span class="loop-smart-note">${escapeHtml(promptHint)}</span>
            </div>
        </div>` : ''}
        <div class="loop-smart-footer">
            ${loopNumberControlHtml({label:tr('canvas.loopCount'), value:node.count, key:'count', max:100, quick:[1,2,3,4,5,6,8,10]})}
            <button class="loop-smart-control loop-smart-run" type="button" data-loop-run="${escapeHtml(node.id)}" ${smartCascadeRunning ? 'disabled' : ''}><i data-lucide="workflow"></i><span>${escapeHtml(smartCascadeRunning ? tr('common.running') : tr('smart.loopRunAll'))}</span></button>
        </div>
    </div>`;
}
function nodeBodyHtml(node, layout){
    if(node.type === 'smart-prompt') return promptNodeBodyHtml(node);
    if(node.type === 'smart-loop') return smartLoopBodyHtml(node);
    const imgs = node.images || [];
    if(node.pending && imgs.length === 0){
        const count = Math.max(1, Number(node.pending) || 1);
        if(count <= 1) return `<div class="loading-cell single" style="width:${layout.width}px;height:${layout.height}px"></div>`;
        const cols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(count))));
        const rows = Math.ceil(count / cols);
        return `<div class="loading-skeleton" style="grid-template-columns:repeat(${cols}, 1fr);grid-template-rows:repeat(${rows}, 1fr);width:${layout.width}px;height:${layout.height}px;padding:8px;box-sizing:border-box">${Array.from({length:count}).map(() => `<div class="loading-cell"></div>`).join('')}</div>`;
    }
    if(imgs.length > 1) return `<div class="thumb-grid" style="--thumb-cols:${layout.cols}; --thumb-size:${layout.thumb}px">${imgs.map((img, i) => `<div class="thumb-item ${selectedImage.nodeId === node.id && selectedImage.index === i ? 'image-selected' : ''}" data-image-index="${i}" data-media-signature="${escapeAttr(`${mediaKindForItem(img)}:${img?.url || ''}`)}">${thumbMediaHtml(img)}${imageResolutionBadgeHtml(img)}<button class="mini-x image-delete" type="button" data-image-index="${i}" title="${escapeHtml(tr('smart.deleteImage'))}"><i data-lucide="trash-2"></i></button></div>`).join('')}</div>`;
    if(imgs[0]) return `<div class="image-wrap ${selectedImage.nodeId === node.id && selectedImage.index === 0 ? 'image-selected' : ''}" data-image-index="0" data-media-signature="${escapeAttr(`${mediaKindForItem(imgs[0])}:${imgs[0]?.url || ''}`)}" style="--node-img-w:${layout.width}px;--node-img-h:${layout.height}px">${singleMediaHtml(imgs[0], layout.width, layout.height)}${imageResolutionBadgeHtml(imgs[0])}<button class="mini-x image-delete" type="button" data-image-index="0" title="${escapeHtml(tr('smart.deleteImage'))}"><i data-lucide="trash-2"></i></button></div>`;
    return `<div class="node-drop" data-upload-action="files">
        <span class="upload-node-main"><i data-lucide="upload-cloud"></i></span>
        <span class="upload-node-title">上传卡片</span>
        <span class="upload-node-sub">拖拽 / 粘贴 / 点击上传</span>
    </div>`;
}
function nowMs(){ return Date.now(); }
function formatRunDuration(ms){
    const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    const min = Math.floor(total / 60);
    const sec = total % 60;
    return min ? `${min}:${String(sec).padStart(2, '0')}` : `${sec}s`;
}
function nodeRunElapsedMs(node){
    if(!node) return 0;
    if(node.runFinishedAt && node.runStartedAt) return Number(node.runElapsedMs) || (Number(node.runFinishedAt) - Number(node.runStartedAt));
    if(node.runStartedAt) return nowMs() - Number(node.runStartedAt);
    return 0;
}
function runTimePillHtml(node){
    if(!node || node.runTimerHidden) return '';
    const running = Boolean(node.pending || node.running);
    if(!running && !node.runFinishedAt) return '';
    const cls = running ? '' : ' done';
    return `<span class="run-time-pill${cls}" data-run-timer="${escapeHtml(node.id)}">${formatRunDuration(nodeRunElapsedMs(node))}</span>`;
}
function hideRunTimerForNode(node){
    if(!node || node.runTimerHidden || node.pending || node.running || !node.runFinishedAt) return false;
    node.runTimerHidden = true;
    scheduleSave();
    return true;
}
function refreshRunTimerPills(){
    const active = nodes.some(n => !n.runTimerHidden && (n.pending || n.running || n.runFinishedAt));
    document.querySelectorAll('[data-run-timer]').forEach(el => {
        const node = nodes.find(n => n.id === el.dataset.runTimer);
        if(!node || node.runTimerHidden) return;
        el.textContent = formatRunDuration(nodeRunElapsedMs(node));
        el.classList.toggle('done', Boolean(!node.pending && !node.running && node.runFinishedAt));
    });
    if(active && !runTimerInterval) runTimerInterval = setInterval(refreshRunTimerPills, 1000);
    if(!active && runTimerInterval){ clearInterval(runTimerInterval); runTimerInterval = null; }
}
function render(){
    const composerEl = composer;
    const mediaStates = captureMediaPlaybackStates();
    const reusableNodes = new Map();
    world.querySelectorAll('.image-node').forEach(el => {
        const node = nodes.find(n => n.id === el.dataset.id);
        if(smartNodeHasLiveMedia(node)) reusableNodes.set(node.id, el);
    });
    const nodeHtmlEntries = nodes.map(node => {
        const imgs = node.images || [];
        const title = node.type === 'smart-prompt' ? 'Prompt' : node.type === 'smart-loop' ? 'Loop' : (imgs.length > 1 ? 'Group' : imgs.length ? 'Image' : '上传卡片');
        const scale = nodeScale(node);
        const layout = imageLayout(imgs, scale, node);
        const isPrompt = node.type === 'smart-prompt';
        const isLoop = node.type === 'smart-loop';
        const isImageNode = node.type === 'smart-image' || !node.type;
        const isEmpty = isImageNode && imgs.length === 0 && !node.pending;
        const isGroup = isImageNode && imgs.length > 1;
        const isPending = node.pending && imgs.length === 0;
        const body = nodeBodyHtml(node, layout);
        const deleteBtn = `<button class="mini-x node-delete" type="button" title="${escapeHtml(tr('smart.deleteNode'))}"><i data-lucide="trash-2"></i></button>`;
        const hint = isPending ? escapeHtml(tr('smart.hintPending')) : (imgs.length > 1 ? escapeHtml(tr('smart.hintMulti')) : imgs.length ? escapeHtml(tr('smart.hintSingle')) : escapeHtml(tr('smart.hintEmpty')));
        const html = `<div class="image-node ${isEmpty ? 'empty-node' : ''} ${isGroup ? 'group-node' : ''} ${isPrompt ? 'prompt-smart-node' : ''} ${isLoop ? 'loop-smart-node' : ''} ${isNodeSelected(node.id) ? 'selected' : ''} ${(dragState?.groupIds?.includes(node.id) || dragState?.id === node.id) ? 'dragging' : ''} ${node.running ? 'node-running' : ''} ${isPending ? 'node-pending' : ''}" data-id="${escapeHtml(node.id)}" style="left:${node.x || 0}px;top:${node.y || 0}px;width:${layout.width}px;height:${layout.height}px">
            <div class="node-head"><div class="node-title">${title}</div><div class="node-actions">${deleteBtn}</div></div>
            ${!isEmpty ? `<div class="floating-node-actions"><button class="mini-x node-delete" type="button" title="${escapeHtml(tr('smart.deleteNode'))}"><i data-lucide="trash-2"></i></button></div>` : ''}
            ${runTimePillHtml(node)}
            <div class="node-body">${body}</div>
            <div class="node-hint">${hint}</div>
            ${imgs.length || node.pending || isPrompt || isLoop ? '<div class="node-resize-handle" data-resize="1"></div>' : ''}
            <div class="node-port port-in" data-port="in" title="input"></div>
            <div class="node-port port-out" data-port="out" title="output"></div>
        </div>`;
        return {node, html};
    });
    const tpl = document.createElement('template');
    tpl.innerHTML = nodeHtmlEntries.map(entry => entry.html).join('');
    const renderedNodeEls = new Map();
    nodeHtmlEntries.forEach(entry => {
        const fresh = tpl.content.querySelector(`.image-node[data-id="${CSS.escape(entry.node.id)}"]`);
        if(fresh) renderedNodeEls.set(entry.node.id, fresh);
    });
    const keepEls = new Set();
    reusableNodes.forEach(el => keepEls.add(el));
    if(composerEl) keepEls.add(composerEl);
    [...world.childNodes].forEach(child => {
        if(!keepEls.has(child)) child.remove();
    });
    if(composerEl) world.appendChild(composerEl);
    world.insertAdjacentHTML('beforeend', renderConnections());
    nodeHtmlEntries.forEach(entry => {
        const fresh = renderedNodeEls.get(entry.node.id);
        if(!fresh) return;
        world.appendChild(fresh);
        const reusable = reusableNodes.get(entry.node.id);
        if(reusable){
            transplantSmartMediaElements(reusable, fresh);
            if(reusable !== fresh) reusable.remove();
        }
    });
    restoreMediaPlaybackStates(mediaStates);
    bindNodeEvents();
    bindConnectionEvents();
    updateComposer();
    renderMinimap();
    if(window.lucide) lucide.createIcons();
    measureSmartNodeImages();
    refreshRunTimerPills();
    return;
    world.innerHTML = '';
    if(composerEl) world.appendChild(composerEl);
    world.insertAdjacentHTML('beforeend', renderConnections());
    const nodesHtml = nodes.map(node => {
        const imgs = node.images || [];
        const title = node.type === 'smart-prompt' ? 'Prompt' : node.type === 'smart-loop' ? 'Loop' : (imgs.length > 1 ? 'Group' : 'Image');
        const scale = nodeScale(node);
        const layout = imageLayout(imgs, scale, node);
        const isPrompt = node.type === 'smart-prompt';
        const isLoop = node.type === 'smart-loop';
        const isImageNode = node.type === 'smart-image' || !node.type;
        const isEmpty = isImageNode && imgs.length === 0 && !node.pending;
        const isGroup = isImageNode && imgs.length > 1;
        const isPending = node.pending && imgs.length === 0;
        const body = nodeBodyHtml(node, layout);
        const deleteBtn = `<button class="mini-x node-delete" type="button" title="${escapeHtml(tr('smart.deleteNode'))}"><i data-lucide="trash-2"></i></button>`;
        return `<div class="image-node ${isEmpty ? 'empty-node' : ''} ${isGroup ? 'group-node' : ''} ${isPrompt ? 'prompt-smart-node' : ''} ${isLoop ? 'loop-smart-node' : ''} ${isNodeSelected(node.id) ? 'selected' : ''} ${(dragState?.groupIds?.includes(node.id) || dragState?.id === node.id) ? 'dragging' : ''} ${node.running ? 'node-running' : ''} ${isPending ? 'node-pending' : ''}" data-id="${escapeHtml(node.id)}" style="left:${node.x || 0}px;top:${node.y || 0}px;width:${layout.width}px;height:${layout.height}px">
            <div class="node-head"><div class="node-title">${title}</div><div class="node-actions">${deleteBtn}</div></div>
            ${!isEmpty ? `<div class="floating-node-actions"><button class="mini-x node-delete" type="button" title="${escapeHtml(tr('smart.deleteNode'))}"><i data-lucide="trash-2"></i></button></div>` : ''}
            ${runTimePillHtml(node)}
            <div class="node-body">${body}</div>
            <div class="node-hint">${isPending ? escapeHtml(tr('smart.hintPending')) : (imgs.length > 1 ? escapeHtml(tr('smart.hintMulti')) : imgs.length ? escapeHtml(tr('smart.hintSingle')) : escapeHtml(tr('smart.hintEmpty')))}</div>
            ${imgs.length || node.pending || isPrompt || isLoop ? '<div class="node-resize-handle" data-resize="1"></div>' : ''}
            <div class="node-port port-in" data-port="in" title="输入"></div>
            <div class="node-port port-out" data-port="out" title="输出"></div>
        </div>`;
    }).join('');
    world.insertAdjacentHTML('beforeend', nodesHtml);
    bindNodeEvents();
    bindConnectionEvents();
    updateComposer();
    renderMinimap();
    if(window.lucide) lucide.createIcons();
    measureSmartNodeImages();
    refreshRunTimerPills();
}
function measureSmartNodeImages(){
    world.querySelectorAll('.image-node img,.image-node video').forEach(imgEl => {
        const nodeEl = imgEl.closest('.image-node');
        const itemEl = imgEl.closest('[data-image-index]');
        const node = nodes.find(n => n.id === nodeEl?.dataset.id);
        const index = Number(itemEl?.dataset.imageIndex ?? 0);
        const image = node?.images?.[index];
        if(!node || !image || image.natural_w || image.natural_h) return;
        const apply = () => {
            const w = imgEl.naturalWidth || imgEl.videoWidth || 0;
            const h = imgEl.naturalHeight || imgEl.videoHeight || 0;
            if(w <= 0 || h <= 0 || image.natural_w || image.natural_h) return;
            image.natural_w = w;
            image.natural_h = h;
            if((node.images || []).length === 1 && !node.w && !node.h){
                const layout = singleImageLayout(image, node, mediaNodeDefaultScale(node));
                node.w = layout.width;
                node.h = layout.height;
            }
            render();
            scheduleSave();
        };
        const isVideo = imgEl.tagName?.toLowerCase() === 'video';
        if(!isVideo && imgEl.complete) apply();
        else imgEl.addEventListener('load', apply, {once:true});
        imgEl.addEventListener('loadedmetadata', apply, {once:true});
    });
}
function bindConnectionEvents(){
    world.querySelectorAll('[data-conn-index]').forEach(el => {
        if(el.classList.contains('conn-hit')){
            el.addEventListener('dblclick', e => {
                e.preventDefault(); e.stopPropagation();
                disconnectConnection(Number(el.dataset.connIndex));
            });
            return;
        }
        el.addEventListener('click', e => {
            e.preventDefault(); e.stopPropagation();
            const index = Number(el.dataset.connIndex);
            disconnectConnection(index);
        });
    });
}
function ensurePortDragPathElement(){
    const svg = world.querySelector('svg.connection-layer');
    if(!svg) return null;
    let path = svg.querySelector('path.port-drag-temp');
    if(!path){
        path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'port-drag-temp conn-pending');
        path.setAttribute('stroke', 'rgba(100,116,139,0.92)');
        path.setAttribute('stroke-width', '1.9');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-linecap', 'round');
        svg.appendChild(path);
    }
    return path;
}
function clearPortDragVisual(){
    world.querySelector('path.port-drag-temp')?.remove();
    world.querySelectorAll('.node-port.is-active').forEach(el => el.classList.remove('is-active'));
    world.querySelectorAll('.image-node.port-hover').forEach(el => el.classList.remove('port-hover'));
}
function bindPromptNodeControls(el, node){
    el.querySelectorAll('.prompt-node-control, .prompt-node-pill').forEach(control => {
        control.addEventListener('mousedown', e => e.stopPropagation());
        control.addEventListener('click', e => e.stopPropagation());
        control.addEventListener('dblclick', e => e.stopPropagation());
    });
    const textEl = el.querySelector('.prompt-node-text');
    if(textEl) {
        bindScrollableText(textEl);
        textEl.oninput = e => { node.text = e.target.value; scheduleSave(); };
    }
    const presetSelect = el.querySelector('.prompt-node-preset-select');
    if(presetSelect) presetSelect.onchange = e => {
        e.stopPropagation();
        const preset = currentPromptPreset(e.target.value);
        node.promptPresetId = preset?.id || '';
        if(preset) node.text = preset.text || '';
        render();
        scheduleSave();
    };
    const presetSave = el.querySelector('.prompt-preset-save');
    if(presetSave) presetSave.onclick = e => {
        e.preventDefault();
        e.stopPropagation();
        savePromptNodeAsPreset(node);
    };
    const presetEdit = el.querySelector('.prompt-preset-edit');
    if(presetEdit) presetEdit.onclick = e => {
        e.preventDefault();
        e.stopPropagation();
        editPromptPresetForNode(node);
    };
    const toggle = el.querySelector('.prompt-llm-toggle');
    if(toggle) toggle.onclick = e => {
        e.preventDefault(); e.stopPropagation();
        node.llmEnabled = !node.llmEnabled;
        if(node.llmEnabled){
            node.llmProvider = resolveChatProviderId(node.llmProvider || '');
            node.llmModel = resolveChatModel(node.llmModel || '', node.llmProvider);
            node.h = Math.max(Number(node.h) || 0, promptNodeExpandedHeight(node));
            node.w = Math.max(Number(node.w) || 0, 316);
        } else {
            node.h = 194;
            node.w = Math.max(Number(node.w) || 0, 316);
        }
        render();
        scheduleSave();
    };
    const providerEl = el.querySelector('.prompt-llm-provider');
    if(providerEl) providerEl.onchange = e => {
        e.stopPropagation();
        node.llmProvider = resolveChatProviderId(e.target.value);
        node.llmModel = resolveChatModel('', node.llmProvider);
        render();
        scheduleSave();
    };
    const modelEl = el.querySelector('.prompt-llm-model');
    if(modelEl) modelEl.onchange = e => { e.stopPropagation(); node.llmModel = e.target.value; scheduleSave(); };
    const systemToggleEl = el.querySelector('.prompt-system-toggle');
    if(systemToggleEl) systemToggleEl.onclick = e => {
        e.preventDefault();
        e.stopPropagation();
        const prevHeight = Number(node.h) || 0;
        node.llmSystemEnabled = !node.llmSystemEnabled;
        if(node.llmSystemEnabled) node.h = Math.max(prevHeight, promptNodeExpandedHeight(node));
        else if(prevHeight <= 364) node.h = promptNodeExpandedHeight(node);
        render();
        scheduleSave();
    };
    const systemEl = el.querySelector('.prompt-llm-system');
    if(systemEl) { bindScrollableText(systemEl); systemEl.oninput = e => { node.llmSystemPrompt = e.target.value; scheduleSave(); }; }
    const instructionEl = el.querySelector('.prompt-llm-instruction');
    if(instructionEl) { bindScrollableText(instructionEl); instructionEl.oninput = e => { node.llmInstruction = e.target.value; scheduleSave(); }; }
    const runEl = el.querySelector('.prompt-node-run');
    if(runEl) runEl.onclick = e => { e.preventDefault(); e.stopPropagation(); runPromptLLMNode(node.id); };
}
function bindLoopNodeControls(el, node){
    el.querySelectorAll('.loop-smart-control').forEach(control => {
        control.addEventListener('mousedown', e => e.stopPropagation());
        control.addEventListener('click', e => e.stopPropagation());
        control.addEventListener('dblclick', e => e.stopPropagation());
    });
    const loopNumberBounds = key => {
        if(key === 'loopStart') return {min:1, max:9999};
        if(key === 'imageBatchSize') return {min:1, max:100};
        return {min:1, max:100};
    };
    const normalizeLoopNumber = (key, rawValue) => {
        const bounds = loopNumberBounds(key);
        return Math.max(bounds.min, Math.min(bounds.max, Number(rawValue) || bounds.min));
    };
    const syncLoopNumberUi = (source, key, value) => {
        const control = source?.closest?.('.loop-number-control');
        if(!control) return;
        const display = control.querySelector('.loop-number-trigger strong');
        if(display) display.textContent = value;
        control.querySelectorAll('[data-loop-value]').forEach(cell => {
            cell.classList.toggle('active', Number(cell.dataset.loopValue) === value);
        });
    };
    const setLoopNumber = (key, rawValue, rerender=true, source=null) => {
        const value = normalizeLoopNumber(key, rawValue);
        if(key === 'count') node.count = smartLoopCount({count:value});
        if(key === 'loopStart') node.loopStart = value;
        if(key === 'imageBatchSize') node.imageBatchSize = value;
        scheduleSave();
        if(rerender) render();
        else syncLoopNumberUi(source, key, value);
    };
    el.querySelectorAll('[data-loop-number]').forEach(btn => {
        btn.onclick = e => {
            e.preventDefault();
            e.stopPropagation();
            setLoopNumber(btn.dataset.loopNumber, btn.dataset.loopValue, true);
        };
    });
    el.querySelectorAll('[data-loop-number-input]').forEach(input => {
        input.oninput = e => {
            e.stopPropagation();
            setLoopNumber(input.dataset.loopNumberInput, input.value, false, input);
        };
        input.onchange = e => {
            e.stopPropagation();
            setLoopNumber(input.dataset.loopNumberInput, input.value, true);
        };
    });
    el.querySelectorAll('[data-loop-mode]').forEach(btn => {
        btn.onclick = e => {
            e.preventDefault();
            e.stopPropagation();
            node.mode = btn.dataset.loopMode === 'parallel' ? 'parallel' : 'serial';
            render();
            scheduleSave();
        };
    });
    el.querySelectorAll('[data-loop-toggle]').forEach(btn => {
        btn.onclick = e => {
            e.preventDefault();
            e.stopPropagation();
            if(btn.dataset.loopToggle === 'image') node.imageInput = !node.imageInput;
            if(btn.dataset.loopToggle === 'prompt') {
                node.showPrompt = !node.showPrompt;
                if(node.showPrompt && !String(node.variablePrompt || '').trim()) node.variablePrompt = tr('smart.loopDefaultPrompt') || '现在生成第《计数》张图片';
            }
            fitSmartLoopNode(node);
            render();
            scheduleSave();
        };
    });
    const text = el.querySelector('.loop-smart-text');
    if(text) {
        bindScrollableText(text);
        text.oninput = e => { node.variablePrompt = smartLoopEditorText(e.currentTarget); scheduleSave(); };
        text.addEventListener('click', e => {
            const remove = e.target.closest?.('.loop-smart-token-chip button');
            if(!remove) return;
            e.preventDefault();
            e.stopPropagation();
            remove.closest('.loop-smart-token-chip')?.remove();
            node.variablePrompt = smartLoopEditorText(text);
            scheduleSave();
        });
    }
    el.querySelectorAll('[data-loop-token]').forEach(btn => {
        btn.onclick = e => {
            e.preventDefault();
            e.stopPropagation();
            if(!text) return;
            const token = btn.dataset.loopToken || '《计数》';
            insertSmartLoopToken(text, token);
            node.variablePrompt = smartLoopEditorText(text);
            scheduleSave();
        };
    });
    el.querySelectorAll('[data-loop-run]').forEach(btn => {
        btn.onclick = e => {
            e.preventDefault();
            e.stopPropagation();
            runSmartCascadeFromLoop(btn.dataset.loopRun || node.id);
        };
    });
}
function bindScrollableText(el){
    if(!el || el.dataset.scrollBound === '1') return;
    el.dataset.scrollBound = '1';
    const stop = e => e.stopPropagation();
    const beginSelection = e => {
        e.stopPropagation();
        textSelectionGuard = {
            el,
            scrollTop:el.scrollTop || 0,
            scrollLeft:el.scrollLeft || 0,
            clientY:e.clientY,
            wheelUntil:0,
            active:true
        };
    };
    el.addEventListener('mousedown', beginSelection);
    el.addEventListener('mousemove', e => {
        e.stopPropagation();
        if(textSelectionGuard?.el === el) textSelectionGuard.clientY = e.clientY;
    });
    el.addEventListener('mouseup', e => {
        e.stopPropagation();
        if(textSelectionGuard?.el === el) textSelectionGuard.active = false;
    });
    el.addEventListener('mouseleave', e => {
        e.stopPropagation();
        if(textSelectionGuard?.el === el) {
            el.scrollTop = textSelectionGuard.scrollTop;
            el.scrollLeft = textSelectionGuard.scrollLeft;
        }
    });
    el.addEventListener('scroll', () => {
        const guard = textSelectionGuard;
        if(!guard || guard.el !== el || !guard.active || Date.now() < guard.wheelUntil) {
            if(guard?.el === el) {
                guard.scrollTop = el.scrollTop || 0;
                guard.scrollLeft = el.scrollLeft || 0;
            }
            return;
        }
        const nextTop = el.scrollTop || 0;
        const prevTop = guard.scrollTop || 0;
        const rect = el.getBoundingClientRect();
        const pointerBelow = Number.isFinite(guard.clientY) && guard.clientY > rect.bottom - 10;
        const pointerAbove = Number.isFinite(guard.clientY) && guard.clientY < rect.top + 10;
        const jumpedToTop = prevTop > Math.max(80, el.clientHeight * 0.45) && nextTop < 4 && !pointerAbove;
        const wrongDirectionJump = pointerBelow && nextTop < prevTop - Math.max(40, el.clientHeight * 0.25);
        if(jumpedToTop || wrongDirectionJump) {
            requestAnimationFrame(() => {
                if(textSelectionGuard?.el === el && textSelectionGuard.active) {
                    el.scrollTop = prevTop;
                    el.scrollLeft = guard.scrollLeft || 0;
                }
            });
            return;
        }
        guard.scrollTop = nextTop;
        guard.scrollLeft = el.scrollLeft || 0;
    }, {passive:true});
    el.addEventListener('click', stop);
    el.addEventListener('dblclick', stop);
    el.addEventListener('wheel', e => {
        e.stopPropagation();
        if(textSelectionGuard?.el === el) textSelectionGuard.wheelUntil = Date.now() + 180;
    }, {passive:true});
}
function updatePortDragVisual(){
    if(!portDragState) return;
    const fromNode = nodes.find(n => n.id === portDragState.fromId);
    if(!fromNode) return;
    const fr = nodeRect(fromNode);
    const isOut = portDragState.fromPort === 'out';
    const fx = isOut ? fr.x + fr.width : fr.x;
    const fy = fr.y + fr.height / 2;
    const tx = portDragState.currentWorld.x;
    const ty = portDragState.currentWorld.y;
    const dx = Math.max(50, Math.abs(tx - fx) * 0.45);
    const sign = isOut ? 1 : -1;
    const path = ensurePortDragPathElement();
    if(path) path.setAttribute('d', `M${fx} ${fy} C ${fx + dx * sign} ${fy}, ${tx - dx * sign} ${ty}, ${tx} ${ty}`);
    world.querySelectorAll('.node-port.is-active').forEach(el => el.classList.remove('is-active'));
    world.querySelectorAll('.image-node.port-hover').forEach(el => el.classList.remove('port-hover'));
    if(portDragState.hoverTargetId){
        const targetNodeEl = world.querySelector(`.image-node[data-id="${portDragState.hoverTargetId}"]`);
        targetNodeEl?.classList.add('port-hover');
        targetNodeEl?.querySelector(`.node-port[data-port="${portDragState.hoverPort}"]`)?.classList.add('is-active');
    }
}
function handlePortDrop(drag, e){
    const {targetId, targetPort, hit} = (() => {
        const hitEl = document.elementFromPoint(e.clientX, e.clientY);
        const portEl = hitEl?.closest?.('.node-port');
        const nodeEl = portEl?.closest?.('.image-node') || hitEl?.closest?.('.image-node');
        let id = '', port = '';
        if(nodeEl && nodeEl.dataset.id && nodeEl.dataset.id !== drag.fromId){
            id = nodeEl.dataset.id;
            if(portEl){
                port = portEl.dataset.port;
            } else {
                const rect = nodeEl.getBoundingClientRect();
                port = (e.clientX - rect.left) < rect.width / 2 ? 'in' : 'out';
            }
        }
        return {targetId:id, targetPort:port, hit:hitEl};
    })();
    if(targetId){
        const compatible = (drag.fromPort === 'out' && targetPort === 'in') || (drag.fromPort === 'in' && targetPort === 'out');
        if(!compatible){ discardPendingUndo(); render(); return; }
        const fromId = drag.fromPort === 'out' ? drag.fromId : targetId;
        const toId = drag.fromPort === 'out' ? targetId : drag.fromId;
        if(connectInputNode(fromId, toId)){
            commitPendingUndo();
            render();
            scheduleSave();
        } else {
            discardPendingUndo();
            render();
        }
        return;
    }
    if(!drag.moved){ discardPendingUndo(); render(); return; }
    if(hit?.closest?.('.composer,.smart-back,.asset-panel,.asset-toggle,.smart-log-toggle,.log-modal,.image-edit-modal,.smart-minimap')){
        discardPendingUndo(); render(); return;
    }
    const p = screenToWorld(e);
    undoSuppressed = true;
    const newNode = createImageNodeAt(p, [], {select:true, skipUndo:true});
    undoSuppressed = false;
    const fromId = drag.fromPort === 'out' ? drag.fromId : newNode.id;
    const toId = drag.fromPort === 'out' ? newNode.id : drag.fromId;
    connectInputNode(fromId, toId);
    commitPendingUndo();
    render();
    scheduleSave();
}
function pickMediaForSmartNode(nodeId){
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*,audio/*';
    input.multiple = true;
    input.onchange = () => {
        if(input.files?.length) handleFiles(input.files, nodeId);
        input.remove();
    };
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.top = '-9999px';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.click();
}
function bindNodeEvents(){
    world.querySelectorAll('.image-node').forEach(el => {
        const id = el.dataset.id;
        const nodeForControls = nodes.find(n => n.id === id);
        if(nodeForControls?.type === 'smart-prompt') bindPromptNodeControls(el, nodeForControls);
        if(nodeForControls?.type === 'smart-loop') bindLoopNodeControls(el, nodeForControls);
        el.onclick = e => {
            e.stopPropagation();
            if(Date.now() < suppressNodeClickUntil) return;
            const node = nodes.find(n => n.id === id);
            hideRunTimerForNode(node);
            selectedId = id;
            selectedIds = [];
            selectedImage = {nodeId:'', index:-1};
            render();
        };
        el.ondblclick = e => e.stopPropagation();
        const nodeDrop = el.querySelector('.node-drop');
        nodeDrop?.addEventListener('mousedown', e => {
            if(e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
        }, true);
        nodeDrop?.addEventListener('click', e => {
            e.preventDefault(); e.stopPropagation();
            hideRunTimerForNode(nodes.find(n => n.id === id));
            selectedId = id;
            selectedIds = [];
            selectedImage = {nodeId:'', index:-1};
            pendingGroupUploadPoint = null;
            uploadTargetId = id;
            syncSelectionUi();
            updateComposer();
            pickMediaForSmartNode(id);
        });
        el.querySelectorAll('.node-delete').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault(); e.stopPropagation();
                deleteNodeFromButton(id);
            });
        });
        el.querySelectorAll('.image-delete').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault(); e.stopPropagation();
                deleteImage(id, Number(btn.dataset.imageIndex));
            });
        });
        el.querySelectorAll('.thumb-item,.image-wrap').forEach(item => {
            item.setAttribute('draggable', 'false');
            item.addEventListener('dragstart', e => {
                e.preventDefault();
            });
            item.addEventListener('mousedown', e => {
                if(e.button !== 0 || e.target.closest('.image-delete')) return;
                if(e.detail < 2) return;
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                clearImageClickTimer();
                suppressImageClickUntil = Date.now() + 260;
                selectedId = id;
                selectedIds = [];
                selectedImage = {nodeId:id, index:Number(item.dataset.imageIndex || 0)};
                openImageEditor(id, Number(item.dataset.imageIndex || 0));
            }, true);
            item.addEventListener('click', e => {
                if(e.target.closest('.image-delete')) return;
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                if(Date.now() < suppressImageClickUntil) return;
                const imageIndex = Number(item.dataset.imageIndex || 0);
                if(e.detail >= 2){
                    clearImageClickTimer();
                    suppressImageClickUntil = Date.now() + 260;
                    selectedId = id;
                    selectedIds = [];
                    selectedImage = {nodeId:id, index:imageIndex};
                    openImageEditor(id, imageIndex);
                    return;
                }
                clearImageClickTimer();
                imageClickTimer = setTimeout(() => {
                    imageClickTimer = null;
                const owner = nodes.find(n => n.id === id);
                hideRunTimerForNode(owner);
                const isGroupOwner = (owner?.images || []).length > 1;
                selectedId = id;
                selectedIds = [];
                // 分组内的图片单击不再"穿透"到具体图片：保持节点级 composer
                selectedImage = isGroupOwner
                    ? {nodeId:'', index:-1}
                        : {nodeId:id, index:imageIndex};
                    syncSelectionUi();
                    updateComposer();
                }, 220);
            });
        item.addEventListener('dblclick', e => {
            if(e.target.closest('.image-delete')) return;
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            clearImageClickTimer();
            suppressImageClickUntil = Date.now() + 260;
            selectedId = id;
            selectedIds = [];
            selectedImage = {nodeId:id, index:Number(item.dataset.imageIndex || 0)};
            openImageEditor(id, Number(item.dataset.imageIndex || 0));
        }, true);
        });
        el.querySelectorAll('.thumb-item').forEach(item => {
            item.addEventListener('mousedown', e => {
                if(e.button !== 0 || e.target.closest('.mini-x')) return;
                if(e.detail >= 2) return;
                const node = nodes.find(n => n.id === id);
                if(!node || (node.images || []).length <= 1) return;
                e.preventDefault(); e.stopPropagation();
                thumbDragState = {nodeId:id, imgIndex:Number(item.dataset.imageIndex || 0), startX:e.clientX, startY:e.clientY, detached:false};
                capturePendingUndo();
            });
        });
        el.querySelector('.node-resize-handle')?.addEventListener('mousedown', e => {
            if(e.button !== 0) return;
            e.preventDefault(); e.stopPropagation();
            const node = nodes.find(n => n.id === id);
            if(!node) return;
            const rect = nodeRect(node);
            resizeState = {id, startX:e.clientX, startY:e.clientY, startW:rect.width, startH:rect.height};
            capturePendingUndo();
        });
        const beginNodeDrag = e => {
            if(e.button !== 0 || e.target.closest('.mini-x, .node-resize-handle, .thumb-item, .node-port, select, input, button')) return;
            if(e.target.closest('.prompt-node-pill, .prompt-node-llm, textarea:not(.prompt-node-text)')) return;
            e.preventDefault(); e.stopPropagation();
            window.getSelection?.()?.removeAllRanges?.();
            if(document.activeElement?.blur) document.activeElement.blur();
            let node = nodes.find(n => n.id === id);
            if(!node) return;
            if(e.altKey) node = duplicateForAltDrag(node);
            const dragIds = selectedIds.includes(node.id) ? selectedIds.slice() : [node.id];
            const group = dragIds.map(dragId => {
                const n = nodes.find(x => x.id === dragId);
                return n ? {id:n.id, ox:Number(n.x) || 0, oy:Number(n.y) || 0} : null;
            }).filter(Boolean);
            dragState = {id:node.id, startX:e.clientX, startY:e.clientY, ox:node.x || 0, oy:node.y || 0, group, groupIds:group.map(item => item.id), ctrlGroup:Boolean(e.ctrlKey)};
            document.body.classList.add('smart-node-drag');
            capturePendingUndo();
        };
        el.querySelectorAll('.node-port').forEach(port => {
            port.addEventListener('mousedown', e => {
                if(e.button !== 0) return;
                e.preventDefault(); e.stopPropagation();
                const portType = port.dataset.port;
                const p = screenToWorld(e);
                portDragState = {
                    fromId:id,
                    fromPort:portType,
                    currentWorld:p,
                    hoverTargetId:'',
                    hoverPort:'',
                    moved:false
                };
                shell.classList.add('port-dragging');
                capturePendingUndo();
                ensurePortDragPathElement();
                updatePortDragVisual();
            });
            port.addEventListener('click', e => { e.stopPropagation(); });
            port.addEventListener('dblclick', e => { e.stopPropagation(); });
        });
        el.onmousedown = beginNodeDrag;
        el.ondragover = e => { e.preventDefault(); };
        el.ondrop = e => {
            e.preventDefault();
            e.stopPropagation();
            uploadFilesFromDataTransfer(e.dataTransfer).then(files => handleFiles(files, id));
        };
    });
}
function rectOverlapNode(draggedId, x, y, w, h, excludeIds=[]){
    const cx = x + w/2, cy = y + h/2;
    const excluded = new Set([draggedId, ...(excludeIds || [])]);
    for(const n of nodes){
        if(excluded.has(n.id)) continue;
        const r = nodeRect(n);
        if(cx >= r.x && cx <= r.x + r.width && cy >= r.y && cy <= r.y + r.height) return n;
    }
    return null;
}
function dragConnectTargetFor(sourceNode){
    if(!sourceNode || (dragState?.group || []).length > 1) return null;
    const r = nodeRect(sourceNode);
    return rectOverlapNode(sourceNode.id, r.x, r.y, r.width, r.height, dragState?.groupIds || []);
}
function canAutoConnectDraggedNode(sourceNode, targetNode){
    if(!sourceNode || !targetNode || sourceNode.id === targetNode.id) return false;
    if(sourceNode.type === 'smart-image') return targetNode.type === 'smart-image' || targetNode.type === 'smart-loop' || targetNode.type === 'smart-prompt';
    if(sourceNode.type === 'smart-prompt') return targetNode.type === 'smart-image' || targetNode.type === 'smart-loop';
    if(sourceNode.type === 'smart-loop') return targetNode.type === 'smart-image';
    return false;
}
function restoreDraggedNodePosition(){
    if(!dragState) return;
    (dragState.group || [{id:dragState.id, ox:dragState.ox, oy:dragState.oy}]).forEach(item => {
        const n = nodes.find(x => x.id === item.id);
        if(n){
            n.x = item.ox;
            n.y = item.oy;
        }
    });
}
function clearDropHighlight(){
    world.querySelectorAll('.image-node.drop-target').forEach(el => el.classList.remove('drop-target'));
}
function setDropHighlight(targetId){
    clearDropHighlight();
    if(!targetId) return;
    const el = world.querySelector(`.image-node[data-id="${targetId}"]`);
    if(el) el.classList.add('drop-target');
}
function deleteNode(id){
    pushUndo();
    nodes = nodes.filter(node => node.id !== id);
    if(canvas) canvas.connections = (canvas.connections || []).filter(c => c.from !== id && c.to !== id);
    nodes.forEach(node => {
        if(Array.isArray(node.inputNodeIds)) node.inputNodeIds = node.inputNodeIds.filter(inputId => inputId !== id);
    });
    if(selectedId === id) selectedId = '';
    selectedIds = selectedIds.filter(selected => selected !== id);
    if(selectedImage.nodeId === id) selectedImage = {nodeId:'', index:-1};
    render();
    scheduleSave();
}
function clearNodeMediaBeforeDelete(id){
    const node = nodes.find(n => n.id === id);
    if(!node || (node.type && node.type !== 'smart-image')) return false;
    const hadMedia = Boolean((node.images || []).length || node.pending);
    if(!hadMedia) return false;
    pushUndo();
    node.images = [];
    node.pending = 0;
    node.running = false;
    node.title = '上传卡片';
    delete node.w;
    delete node.h;
    if(selectedImage.nodeId === id) selectedImage = {nodeId:'', index:-1};
    selectedId = id;
    selectedIds = [];
    render();
    scheduleSave();
    return true;
}
function deleteNodeFromButton(id){
    if(clearNodeMediaBeforeDelete(id)) return;
    deleteNode(id);
}
function disconnectConnection(index){
    if(!canvas || !Array.isArray(canvas.connections)) return;
    const conn = canvas.connections[index];
    if(!conn) return;
    pushUndo();
    canvas.connections.splice(index, 1);
    const toNode = nodes.find(n => n.id === conn.to);
    if(toNode && Array.isArray(toNode.inputNodeIds)){
        toNode.inputNodeIds = toNode.inputNodeIds.filter(id => id !== conn.from);
    }
    render();
    scheduleSave();
}
function deleteImage(id, imageIndex){
    const node = nodes.find(n => n.id === id);
    if(!node || imageIndex < 0) return;
    pushUndo();
    node.images = (node.images || []).filter((_, index) => index !== imageIndex);
    if(node.images.length <= 1) node.title = 'Image';
    if(selectedImage.nodeId === id) selectedImage = {nodeId:id, index:Math.min(selectedImage.index, node.images.length - 1)};
    if(selectedImage.index < 0) selectedImage = {nodeId:'', index:-1};
    render();
    scheduleSave();
}
function currentEditImage(){
    const node = nodes.find(n => n.id === cropState?.nodeId);
    const index = Number(cropState?.imageIndex || 0);
    return {node, index, image:node?.images?.[index]};
}
function cropImageDisplaySize(){
    const img = document.getElementById('cropImage');
    const clientW = Number(img?.clientWidth || 0);
    const clientH = Number(img?.clientHeight || 0);
    if(clientW > 2 && clientH > 2) return {w:clientW, h:clientH};
    ensureImageEditBaseSize();
    const fallbackW = Math.round((imageEditBaseW || Number(img?.naturalWidth || 0) || 1) * imageEditZoom);
    const fallbackH = Math.round((imageEditBaseH || Number(img?.naturalHeight || 0) || 1) * imageEditZoom);
    return {w:Math.max(1, fallbackW), h:Math.max(1, fallbackH)};
}
function cropBounds(){
    return cropImageDisplaySize();
}
function editDrawCanvas(){ return document.getElementById('editDrawCanvas'); }
function resizeEditDrawCanvas(){
    const img = document.getElementById('cropImage');
    const canvasEl = editDrawCanvas();
    const display = cropImageDisplaySize();
    const w = Math.max(1, img.naturalWidth || img.clientWidth || 1);
    const h = Math.max(1, img.naturalHeight || img.clientHeight || 1);
    if(canvasEl.width !== w || canvasEl.height !== h){ canvasEl.width = w; canvasEl.height = h; }
    canvasEl.style.width = `${display.w}px`;
    canvasEl.style.height = `${display.h}px`;
    if(imageEditMode === 'grid') refreshGridSplitPreview();
}
function setImageEditMode(mode, userTouched=false){
    if(userTouched) imageEditModeTouched = true;
    const prev = imageEditMode;
    imageEditMode = ['preview','crop','outpaint','mask','brush','grid'].includes(mode) ? mode : 'preview';
    const cropCanvasEl = document.getElementById('cropCanvas');
    const previewStageEl = document.getElementById('previewStage');
    const editStageEl = document.getElementById('imageEditStage');
    const previewDownloadBtn = document.getElementById('previewDownloadBtn');
    const previewDownloadAllBtn = document.getElementById('previewDownloadAllBtn');
    const isPreview = imageEditMode === 'preview';
    cropCanvasEl.style.display = isPreview ? 'none' : '';
    previewStageEl.style.display = isPreview ? 'inline-flex' : 'none';
    editStageEl?.classList.toggle('preview-mode', isPreview);
    if(previewDownloadBtn) previewDownloadBtn.style.display = isPreview ? 'inline-flex' : 'none';
    if(previewDownloadAllBtn) previewDownloadAllBtn.style.display = isPreview && previewDownloadGroupItems().length > 1 ? 'inline-flex' : 'none';
    cropCanvasEl.classList.toggle('mask-mode', imageEditMode === 'mask');
    cropCanvasEl.classList.toggle('brush-mode', imageEditMode === 'brush');
    cropCanvasEl.classList.toggle('grid-mode', imageEditMode === 'grid');
    cropCanvasEl.classList.toggle('outpaint-mode', imageEditMode === 'outpaint');
    syncGridCustomCursor();
    document.querySelectorAll('[data-image-edit-mode]').forEach(btn => btn.classList.toggle('active', btn.dataset.imageEditMode === imageEditMode));
    document.getElementById('imagePreviewTools').classList.toggle('active', isPreview);
    document.getElementById('imageMaskTools').classList.toggle('active', imageEditMode === 'mask');
    document.getElementById('imageBrushTools').classList.toggle('active', imageEditMode === 'brush');
    document.getElementById('imageGridTools').classList.toggle('active', imageEditMode === 'grid');
    syncGridGapValue();
    const applyBtn = document.getElementById('imageEditApplyBtn');
    document.getElementById('compareToggleBtn').style.display = isPreview ? 'inline-flex' : 'none';
    document.getElementById('compareThumbs').style.display = 'none';
    if(isPreview){
        document.getElementById('imageEditTitle').textContent = tr('smart.previewImage');
        document.getElementById('imageEditSub').textContent = tr('smart.previewHint');
        applyBtn.style.display = 'none';
        refreshComparePanel();
    } else {
        ensureImageEditBaseSize(true);
        applyImageEditZoom();
        applyBtn.style.display = '';
        const icon = imageEditMode === 'crop' ? 'crop' : imageEditMode === 'outpaint' ? 'expand' : imageEditMode === 'mask' ? 'brush' : imageEditMode === 'brush' ? 'paintbrush' : 'grid-3x3';
        const labelKey = imageEditMode === 'crop' ? 'canvas.applyCrop' : imageEditMode === 'outpaint' ? 'canvas.applyOutpaint' : imageEditMode === 'mask' ? 'canvas.applyMask' : imageEditMode === 'brush' ? 'canvas.applyBrush' : 'canvas.applyGrid';
        const titleKey = imageEditMode === 'crop' ? 'canvas.cropImage' : imageEditMode === 'outpaint' ? 'canvas.outpaintImage' : imageEditMode === 'mask' ? 'canvas.maskEdit' : imageEditMode === 'brush' ? 'canvas.brushEdit' : 'canvas.modeGrid';
        const subKey = imageEditMode === 'crop' ? 'canvas.cropHint' : imageEditMode === 'outpaint' ? 'canvas.outpaintHint' : imageEditMode === 'mask' ? 'canvas.maskHint2' : imageEditMode === 'brush' ? 'canvas.brushHint' : 'canvas.gridHint';
        document.getElementById('imageEditTitle').textContent = tr(titleKey);
        document.getElementById('imageEditSub').textContent = tr(subKey);
        applyBtn.innerHTML = `<i data-lucide="${icon}" class="w-4 h-4"></i><span>${tr(labelKey)}</span>`;
        if(imageEditMode === 'crop'){
            requestAnimationFrame(() => {
                resetCropBox();
                syncImageEditOverflow();
            });
        } else if(imageEditMode === 'outpaint'){
            requestAnimationFrame(() => {
                resetOutpaintBox();
                syncImageEditOverflow();
            });
        }
    }
    resizeEditDrawCanvas();
    if(imageEditMode === 'grid') refreshGridSplitPreview();
    else if(imageEditMode === 'crop' || imageEditMode === 'outpaint' || prev === 'grid') clearEditDrawing(true);
    syncEditDrawingHistoryButtons();
    syncBrushToolButtons();
    refreshIcons();
}
let previewCompareOn = false;
let previewCompareIndex = -1;
let previewMetaExtraText = '';
function applyPreviewTransform(){
    const frame = document.getElementById('previewFrame');
    if(frame){
        frame.style.transform = `translate(${previewPan.x}px, ${previewPan.y}px) scale(${previewZoom})`;
    }
    updateZoomLabel();
}
function resetPreviewTransform(){
    previewZoom = 1.0;
    previewPan = {x:0, y:0};
    previewComparePos = 50;
    document.getElementById('previewStage')?.style.setProperty('--compare-pos', `${previewComparePos}%`);
    applyPreviewTransform();
}
function setPreviewComparePos(clientX){
    const frame = document.getElementById('previewFrame');
    const stage = document.getElementById('previewStage');
    if(!frame || !stage) return;
    const rect = frame.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / Math.max(1, rect.width)) * 100));
    previewComparePos = pct;
    stage.style.setProperty('--compare-pos', `${pct}%`);
}
function syncPreviewFrameSize(){
    const frame = document.getElementById('previewFrame');
    const currentImg = document.getElementById('previewCurrentImage');
    const compareImg = document.getElementById('previewCompareImage');
    if(!frame || !currentImg) return;
    const w = currentImg.clientWidth || currentImg.naturalWidth || 1;
    const h = currentImg.clientHeight || currentImg.naturalHeight || 1;
    frame.style.width = `${w}px`;
    frame.style.height = `${h}px`;
    if(compareImg){
        compareImg.style.width = `${w}px`;
        compareImg.style.height = `${h}px`;
    }
}
function previewResolutionText(){
    const editing = currentEditImage();
    const image = editing.image || {};
    const currentImg = document.getElementById('previewCurrentImage');
    const cropImg = document.getElementById('cropImage');
    const w = Number(image.natural_w || image.width || image.w || 0) || Number(currentImg?.naturalWidth || 0) || Number(cropImg?.naturalWidth || 0);
    const h = Number(image.natural_h || image.height || image.h || 0) || Number(currentImg?.naturalHeight || 0) || Number(cropImg?.naturalHeight || 0);
    if(!w || !h) return '';
    return `${tr('smart.resolution')}: ${Math.round(w)} x ${Math.round(h)}`;
}
function updatePreviewMetaHint(extraText=previewMetaExtraText){
    previewMetaExtraText = extraText || '';
    const hint = document.getElementById('previewMetaHint');
    if(!hint) return;
    hint.textContent = [previewResolutionText(), previewMetaExtraText].filter(Boolean).join(' · ');
}
function rememberPreviewImageResolution(){
    const editing = currentEditImage();
    const image = editing.image;
    if(!image) return;
    const currentImg = document.getElementById('previewCurrentImage');
    const cropImg = document.getElementById('cropImage');
    const w = Number(currentImg?.naturalWidth || 0) || Number(cropImg?.naturalWidth || 0);
    const h = Number(currentImg?.naturalHeight || 0) || Number(cropImg?.naturalHeight || 0);
    if(w > 0 && h > 0 && (!image.natural_w || !image.natural_h)){
        image.natural_w = w;
        image.natural_h = h;
        scheduleSave();
    }
}
function previewCompareSources(){
    const editing = currentEditImage();
    const node = editing.node;
    if(!node) return [];
    const upstream = inputImagesFor(node);
    const dedup = [];
    const seen = new Set();
    for(const img of upstream){
        if(!img?.url || seen.has(img.url)) continue;
        seen.add(img.url);
        dedup.push(img);
    }
    if(dedup.length) return dedup;
    const sourceId = node.sourceNodeId;
    if(sourceId){
        const src = nodes.find(n => n.id === sourceId);
        if(src && (src.images || []).length){
            for(const img of src.images){
                if(!img?.url || seen.has(img.url)) continue;
                seen.add(img.url);
                dedup.push(img);
            }
        }
    }
    return dedup;
}
function refreshComparePanel(){
    const stage = document.getElementById('previewStage');
    const compareImg = document.getElementById('previewCompareImage');
    const currentImg = document.getElementById('previewCurrentImage');
    const compareLayer = document.getElementById('previewCompareLayer');
    const compareHandle = document.getElementById('previewCompareHandle');
    const thumbsEl = document.getElementById('compareThumbs');
    const toggle = document.getElementById('compareToggleBtn');
    const editing = currentEditImage();
    const curUrl = editing.image?.url || '';
    const onCurrentLoaded = () => {
        rememberPreviewImageResolution();
        syncPreviewFrameSize();
        updatePreviewMetaHint();
    };
    currentImg.onload = onCurrentLoaded;
    if(currentImg.getAttribute('src') !== curUrl) currentImg.src = curUrl;
    if(currentImg.complete && currentImg.naturalWidth) requestAnimationFrame(onCurrentLoaded);
    const sources = previewCompareSources();
    const hasSource = sources.length > 0;
    if(toggle){
        toggle.disabled = !hasSource;
        toggle.style.opacity = hasSource ? '1' : '.45';
        toggle.title = hasSource ? tr('smart.compareHover') : tr('smart.compareEmpty');
        toggle.classList.toggle('active', hasSource && previewCompareOn);
    }
    if(!hasSource){
        previewCompareOn = false;
        previewCompareIndex = -1;
        stage.classList.remove('compare-on');
        if(compareLayer) compareLayer.style.display = 'none';
        if(compareHandle) compareHandle.style.display = 'none';
        thumbsEl.style.display = 'none';
        updatePreviewMetaHint(editing.node?.runPrompt ? `${tr('smart.runPromptPrefix')}${editing.node.runPrompt.slice(0, 60)}` : '');
        return;
    }
    const sliderActive = previewCompareOn && previewCompareIndex >= 0 && previewCompareIndex < sources.length;
    if(sliderActive){
        const src = sources[previewCompareIndex];
        compareImg.src = src?.url || '';
        compareImg.onload = syncPreviewFrameSize;
        syncPreviewFrameSize();
        stage.classList.add('compare-on');
        if(compareLayer) compareLayer.style.display = '';
        if(compareHandle) compareHandle.style.display = '';
    } else {
        stage.classList.remove('compare-on');
        if(compareLayer) compareLayer.style.display = 'none';
        if(compareHandle) compareHandle.style.display = 'none';
    }
    if(previewCompareOn){
        thumbsEl.style.display = 'inline-flex';
        thumbsEl.innerHTML = sources.map((s, i) => `<button type="button" class="compare-thumb ${i === previewCompareIndex ? 'active' : ''}" data-compare-idx="${i}" title="${escapeHtml(i === previewCompareIndex ? tr('smart.compareCancelTip') : tr('smart.compareUseTip'))}"><img src="${escapeHtml(s.url)}"></button>`).join('');
        thumbsEl.querySelectorAll('[data-compare-idx]').forEach(btn => {
            btn.onclick = e => {
                e.preventDefault(); e.stopPropagation();
                const idx = Number(btn.dataset.compareIdx);
                previewCompareIndex = (previewCompareIndex === idx) ? -1 : idx;
                refreshComparePanel();
            };
        });
    } else {
        thumbsEl.style.display = 'none';
        thumbsEl.innerHTML = '';
    }
    let txt = editing.node?.runPrompt ? `${tr('smart.runPromptPrefix')}${editing.node.runPrompt.slice(0, 60)}` : '';
    if(previewCompareOn && !sliderActive) txt = (txt ? `${txt} · ` : '') + tr('smart.compareHintPick');
    updatePreviewMetaHint(txt);
}
function togglePreviewCompare(){
    const sources = previewCompareSources();
    if(!sources.length){ toast(tr('smart.compareNoSource')); return; }
    previewCompareOn = !previewCompareOn;
    if(previewCompareOn && (previewCompareIndex < 0 || previewCompareIndex >= sources.length)) previewCompareIndex = 0;
    if(!previewCompareOn) previewCompareIndex = -1;
    refreshComparePanel();
}
function editDrawSnapshot(){
    const canvasEl = editDrawCanvas();
    return {imageData:canvasEl.getContext('2d').getImageData(0, 0, canvasEl.width, canvasEl.height), labelCounter:brushLabelCounter};
}
function restoreEditDrawSnapshot(snapshot){
    if(!snapshot) return;
    editDrawCanvas().getContext('2d').putImageData(snapshot.imageData || snapshot, 0, 0);
    if(snapshot.labelCounter) brushLabelCounter = snapshot.labelCounter;
}
function pushEditDrawHistory(){
    editDrawUndoStack.push(editDrawSnapshot());
    if(editDrawUndoStack.length > EDIT_DRAW_HISTORY_MAX) editDrawUndoStack.shift();
    editDrawRedoStack = [];
    syncEditDrawingHistoryButtons();
}
function syncEditDrawingHistoryButtons(){
    ['maskUndoBtn','brushUndoBtn'].forEach(id => { const btn = document.getElementById(id); if(btn){ btn.disabled = !editDrawUndoStack.length; btn.style.opacity = editDrawUndoStack.length ? '1' : '.42'; } });
    ['maskRedoBtn','brushRedoBtn'].forEach(id => { const btn = document.getElementById(id); if(btn){ btn.disabled = !editDrawRedoStack.length; btn.style.opacity = editDrawRedoStack.length ? '1' : '.42'; } });
}
function undoEditDrawing(){
    if(!editDrawUndoStack.length) return;
    editDrawRedoStack.push(editDrawSnapshot());
    restoreEditDrawSnapshot(editDrawUndoStack.pop());
    syncEditDrawingHistoryButtons();
}
function redoEditDrawing(){
    if(!editDrawRedoStack.length) return;
    editDrawUndoStack.push(editDrawSnapshot());
    restoreEditDrawSnapshot(editDrawRedoStack.pop());
    syncEditDrawingHistoryButtons();
}
function editCanvasHasPixels(){
    const canvasEl = editDrawCanvas();
    const data = canvasEl.getContext('2d').getImageData(0, 0, canvasEl.width, canvasEl.height).data;
    for(let i = 3; i < data.length; i += 4) if(data[i] > 0) return true;
    return false;
}
function clearEditDrawing(silent=false){
    const canvasEl = editDrawCanvas();
    if(!silent && editCanvasHasPixels()) pushEditDrawHistory();
    canvasEl.getContext('2d').clearRect(0, 0, canvasEl.width, canvasEl.height);
    brushLabelCounter = 1;
    syncEditDrawingHistoryButtons();
}
function resetEditDrawingHistory(){
    editDrawUndoStack = [];
    editDrawRedoStack = [];
    brushLabelCounter = 1;
    syncEditDrawingHistoryButtons();
}
function setBrushTool(tool){
    brushTool = ['free','rect','ellipse','label'].includes(tool) ? tool : 'free';
    syncBrushToolButtons();
}
function syncBrushToolButtons(){
    document.querySelectorAll('[data-brush-tool]').forEach(btn => {
        const active = btn.dataset.brushTool === brushTool;
        btn.classList.toggle('primary', active);
        btn.classList.toggle('secondary', !active);
    });
}
function editDrawPoint(event){
    const canvasEl = editDrawCanvas();
    const rect = canvasEl.getBoundingClientRect();
    return {x:(event.clientX - rect.left) * canvasEl.width / Math.max(1, rect.width), y:(event.clientY - rect.top) * canvasEl.height / Math.max(1, rect.height)};
}
function gridCustomLineHit(point){
    const canvasEl = editDrawCanvas();
    const threshold = Math.max(8, Math.min(canvasEl.width, canvasEl.height) / 80);
    let best = -1, bestDist = Infinity;
    gridCustomLines.forEach((line, index) => {
        const dist = line.type === 'h' ? Math.abs(point.y - line.pos * canvasEl.height) : Math.abs(point.x - line.pos * canvasEl.width);
        if(dist < bestDist && dist <= threshold){ best = index; bestDist = dist; }
    });
    return best;
}
function setGridCustomLinePos(index, point){
    const canvasEl = editDrawCanvas();
    const line = gridCustomLines[index];
    if(!line) return;
    line.pos = line.type === 'h'
        ? Math.max(0.001, Math.min(0.999, point.y / Math.max(1, canvasEl.height)))
        : Math.max(0.001, Math.min(0.999, point.x / Math.max(1, canvasEl.width)));
}
const MASK_BRUSH_ALPHA = 115;
const MASK_BRUSH_COLOR = `rgba(255,255,255,${MASK_BRUSH_ALPHA / 255})`;
function editBrushSize(){ return Number(document.getElementById(imageEditMode === 'mask' ? 'maskBrushSize' : 'paintBrushSize')?.value || 20); }
function brushColor(){ return document.getElementById('paintBrushColor')?.value || '#ff2d55'; }
function setupDrawStyle(ctx){
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = editBrushSize();
    ctx.strokeStyle = imageEditMode === 'mask' ? MASK_BRUSH_COLOR : brushColor();
    ctx.fillStyle = imageEditMode === 'mask' ? MASK_BRUSH_COLOR : brushColor();
    ctx.globalCompositeOperation = 'source-over';
}
function normalizeMaskPreviewCanvas(canvasEl=editDrawCanvas()){
    if(imageEditMode !== 'mask' || !canvasEl?.width || !canvasEl?.height) return;
    const ctx = canvasEl.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
    const data = imageData.data;
    let changed = false;
    for(let i = 0; i < data.length; i += 4){
        if(data[i + 3] <= 0) continue;
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        if(data[i + 3] > MASK_BRUSH_ALPHA) data[i + 3] = MASK_BRUSH_ALPHA;
        changed = true;
    }
    if(changed) ctx.putImageData(imageData, 0, 0);
}
function strokeFreeDrawPoint(point){
    if(!editDrawState) return;
    const ctx = editDrawCanvas().getContext('2d');
    setupDrawStyle(ctx);
    const dx = point.x - editDrawState.x;
    const dy = point.y - editDrawState.y;
    const dist = Math.hypot(dx, dy);
    const radius = Math.max(1, editBrushSize() / 2);
    if(dist > radius){
        const steps = Math.ceil(dist / Math.max(1, radius * 0.35));
        for(let i = 1; i <= steps; i++){
            const t = i / steps;
            const x = editDrawState.x + dx * t;
            const y = editDrawState.y + dy * t;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.beginPath();
    ctx.moveTo(editDrawState.x, editDrawState.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    editDrawState.x = point.x;
    editDrawState.y = point.y;
}
function circledNumber(n){ return n >= 1 && n <= 20 ? String.fromCharCode(0x2460 + n - 1) : String(n); }
function drawBrushShape(ctx, start, end){
    setupDrawStyle(ctx);
    const x = Math.min(start.x, end.x), y = Math.min(start.y, end.y), w = Math.abs(end.x - start.x), h = Math.abs(end.y - start.y);
    if(brushTool === 'rect') ctx.strokeRect(x, y, w, h);
    else if(brushTool === 'ellipse'){ ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, Math.max(1, w / 2), Math.max(1, h / 2), 0, 0, Math.PI * 2); ctx.stroke(); }
}
function drawNumberLabel(point){
    const ctx = editDrawCanvas().getContext('2d');
    const size = Math.max(18, editBrushSize() * 2.2);
    const text = circledNumber(brushLabelCounter++);
    setupDrawStyle(ctx);
    ctx.save(); ctx.font = `900 ${size}px Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = Math.max(3, size / 8);
    ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.strokeText(text, point.x, point.y); ctx.fillStyle = brushColor(); ctx.fillText(text, point.x, point.y); ctx.restore();
}
function beginEditDraw(event){
    if(imageEditMode === 'crop') return;
    event.preventDefault(); event.stopPropagation();
    const canvasEl = editDrawCanvas();
    canvasEl.setPointerCapture?.(event.pointerId);
    const p = editDrawPoint(event);
    if(imageEditMode === 'grid'){
        if(!gridCustomMode) return;
        const hit = gridCustomLineHit(p);
        gridCustomHistory.push([...gridCustomLines.map(line => ({...line}))]);
        if(hit >= 0){ gridCustomDrag = {index:hit, pointerId:event.pointerId}; setGridCustomLinePos(hit, p); }
        else { gridCustomLines.push({type:gridCustomOrientation, pos:gridCustomOrientation === 'h' ? p.y / canvasEl.height : p.x / canvasEl.width}); gridCustomDrag = {index:gridCustomLines.length - 1, pointerId:event.pointerId}; }
        syncGridCustomUndoBtn(); refreshGridSplitPreview(); return;
    }
    const ctx = canvasEl.getContext('2d');
    pushEditDrawHistory();
    if(imageEditMode === 'brush' && brushTool === 'label'){ drawNumberLabel(p); editDrawState = null; canvasEl.releasePointerCapture?.(event.pointerId); return; }
    editDrawState = {x:p.x, y:p.y, sx:p.x, sy:p.y, pointerId:event.pointerId, snapshot:(imageEditMode === 'brush' && brushTool !== 'free') ? editDrawSnapshot() : null};
    setupDrawStyle(ctx);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + .01, p.y + .01);
    if(imageEditMode === 'mask' || brushTool === 'free') ctx.stroke();
    normalizeMaskPreviewCanvas(canvasEl);
}
function moveEditDraw(event){
    if(imageEditMode === 'grid' && gridCustomMode && gridCustomDrag){ event.preventDefault(); event.stopPropagation(); setGridCustomLinePos(gridCustomDrag.index, editDrawPoint(event)); refreshGridSplitPreview(); return; }
    if(!editDrawState || imageEditMode === 'crop' || imageEditMode === 'grid') return;
    event.preventDefault(); event.stopPropagation();
    const ctx = editDrawCanvas().getContext('2d');
    const p = editDrawPoint(event);
    if(imageEditMode === 'brush' && brushTool !== 'free'){ restoreEditDrawSnapshot(editDrawState.snapshot); drawBrushShape(ctx, {x:editDrawState.sx, y:editDrawState.sy}, p); return; }
    const events = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
    if(events.length){
        events.forEach(ev => strokeFreeDrawPoint(editDrawPoint(ev)));
    } else {
        strokeFreeDrawPoint(p);
    }
    normalizeMaskPreviewCanvas();
}
function endEditDraw(event){
    if(editDrawState && event?.pointerId != null) editDrawCanvas().releasePointerCapture?.(event.pointerId);
    if(gridCustomDrag && event?.pointerId != null) editDrawCanvas().releasePointerCapture?.(event.pointerId);
    editDrawState = null; gridCustomDrag = null; syncEditDrawingHistoryButtons();
}
function syncGridGapValue(){
    const input = document.getElementById('gridGapSize');
    const value = Math.max(0, Math.min(240, Number(input?.value || 0)));
    if(input) input.value = value;
    const label = document.getElementById('gridGapValue');
    if(label) label.textContent = String(value);
    return value;
}
function gridSplitSettings(){
    const hLines = Math.max(0, Math.min(20, Number(document.getElementById('gridHorizontalLines')?.value || 0)));
    const vLines = Math.max(0, Math.min(20, Number(document.getElementById('gridVerticalLines')?.value || 0)));
    return {rows:hLines + 1, cols:vLines + 1, gap:syncGridGapValue()};
}
function gridSplitRects(width, height){
    if(gridCustomMode) return gridSplitRectsCustom(width, height);
    const {rows, cols, gap} = gridSplitSettings();
    const halfGap = gap / 2, rects = [];
    for(let row = 0; row < rows; row++){
        const topLine = row * height / rows, bottomLine = (row + 1) * height / rows;
        const y1 = Math.round(row === 0 ? 0 : topLine + halfGap), y2 = Math.round(row === rows - 1 ? height : bottomLine - halfGap);
        for(let col = 0; col < cols; col++){
            const leftLine = col * width / cols, rightLine = (col + 1) * width / cols;
            const x1 = Math.round(col === 0 ? 0 : leftLine + halfGap), x2 = Math.round(col === cols - 1 ? width : rightLine - halfGap);
            if(x2 > x1 && y2 > y1) rects.push({row, col, x:x1, y:y1, w:x2 - x1, h:y2 - y1});
        }
    }
    return rects;
}
function gridSplitRectsCustom(width, height){
    const gap = Math.max(0, Math.min(240, Number(document.getElementById('gridGapSize')?.value || 0)));
    const halfGap = gap / 2;
    const rawH = [...new Set(gridCustomLines.filter(l => l.type === 'h').map(l => l.pos * height))].sort((a, b) => a - b);
    const rawV = [...new Set(gridCustomLines.filter(l => l.type === 'v').map(l => l.pos * width))].sort((a, b) => a - b);
    const hCuts = [0, ...rawH, height], vCuts = [0, ...rawV, width], rects = [];
    for(let row = 0; row < hCuts.length - 1; row++) for(let col = 0; col < vCuts.length - 1; col++){
        const y1 = Math.round(row === 0 ? hCuts[row] : hCuts[row] + halfGap), y2 = Math.round(row === hCuts.length - 2 ? hCuts[row + 1] : hCuts[row + 1] - halfGap);
        const x1 = Math.round(col === 0 ? vCuts[col] : vCuts[col] + halfGap), x2 = Math.round(col === vCuts.length - 2 ? vCuts[col + 1] : vCuts[col + 1] - halfGap);
        if(x2 > x1 && y2 > y1) rects.push({row, col, x:x1, y:y1, w:x2 - x1, h:y2 - y1});
    }
    return rects;
}
function gridLayoutFromRects(rects){
    return {type:'grid-split', groupId:uid('grid'), rows:Math.max(1, ...rects.map(r => Number(r.row || 0) + 1)), cols:Math.max(1, ...rects.map(r => Number(r.col || 0) + 1))};
}
function applyGridPreset(rows, cols){
    gridCustomMode = false; gridCustomLines = []; gridCustomHistory = []; gridCustomDrag = null;
    const h = document.getElementById('gridHorizontalLines'), v = document.getElementById('gridVerticalLines');
    if(h){ h.disabled = false; h.value = String(Math.max(0, Number(rows || 1) - 1)); }
    if(v){ v.disabled = false; v.value = String(Math.max(0, Number(cols || 1) - 1)); }
    document.getElementById('gridCustomToggle')?.classList.remove('primary');
    document.getElementById('gridCustomToggle')?.classList.add('secondary');
    syncGridCustomControls();
    syncGridCustomCursor(); syncGridCustomUndoBtn(); refreshGridSplitPreview();
}
function syncGridCustomControls(){
    const custom = document.getElementById('gridCustomControls');
    if(custom) custom.style.display = gridCustomMode ? 'flex' : 'none';
    document.querySelectorAll('.grid-preset-row').forEach(row => {
        row.style.display = gridCustomMode ? 'none' : 'flex';
    });
}
function toggleGridCustomMode(){
    gridCustomMode = !gridCustomMode;
    if(gridCustomMode){ gridCustomLines = []; gridCustomHistory = []; }
    gridCustomDrag = null;
    const toggle = document.getElementById('gridCustomToggle');
    toggle.classList.toggle('primary', gridCustomMode); toggle.classList.toggle('secondary', !gridCustomMode);
    ['gridHorizontalLines','gridVerticalLines'].forEach(id => { const el = document.getElementById(id); if(el) el.disabled = gridCustomMode; });
    syncGridCustomControls();
    syncGridCustomCursor(); syncGridCustomUndoBtn(); refreshGridSplitPreview();
}
function setGridCustomOrientation(orient){
    gridCustomOrientation = orient;
    document.getElementById('gridOrientH').classList.toggle('primary', orient === 'h');
    document.getElementById('gridOrientH').classList.toggle('secondary', orient !== 'h');
    document.getElementById('gridOrientV').classList.toggle('primary', orient === 'v');
    document.getElementById('gridOrientV').classList.toggle('secondary', orient !== 'v');
    syncGridCustomCursor();
}
function clearGridCustomLines(){ gridCustomHistory = []; gridCustomLines = []; gridCustomDrag = null; syncGridCustomUndoBtn(); refreshGridSplitPreview(); }
function undoGridCustomLine(){ if(!gridCustomHistory.length) return; gridCustomLines = gridCustomHistory.pop(); gridCustomDrag = null; syncGridCustomUndoBtn(); refreshGridSplitPreview(); }
function syncGridCustomUndoBtn(){
    const btn = document.getElementById('gridUndoBtn');
    if(!btn) return;
    btn.disabled = gridCustomHistory.length === 0;
    btn.style.opacity = gridCustomHistory.length === 0 ? '0.4' : '1';
}
function applyImageEditZoom(scaleOverride=null){
    ensureImageEditBaseSize();
    if(!imageEditBaseW) return;
    const img = document.getElementById('cropImage');
    const oldW = cropImageDisplaySize().w;
    img.style.maxWidth = 'none'; img.style.maxHeight = 'none';
    img.style.width = Math.round(imageEditBaseW * imageEditZoom) + 'px';
    img.style.height = Math.round(imageEditBaseH * imageEditZoom) + 'px';
    resizeEditDrawCanvas();
    if(cropState){
        const scale = Number(scaleOverride) || (oldW > 0 ? cropImageDisplaySize().w / oldW : 1);
        cropState.x = Math.round(cropState.x * scale); cropState.y = Math.round(cropState.y * scale);
        cropState.w = Math.round(cropState.w * scale); cropState.h = Math.round(cropState.h * scale);
        clampCrop(); renderCropBox();
    }
    if(imageEditMode === 'grid') refreshGridSplitPreview();
    syncImageEditOverflow(); updateZoomLabel();
}
function ensureImageEditBaseSize(force=false){
    if(imageEditBaseW && imageEditBaseH && !force) return;
    const img = document.getElementById('cropImage');
    const naturalW = img.naturalWidth || img.clientWidth || 0;
    const naturalH = img.naturalHeight || img.clientHeight || 0;
    if(!naturalW || !naturalH) return;
    const maxW = Math.max(1, Math.min(1300, window.innerWidth - 100));
    const maxH = Math.max(1, Math.min(840, window.innerHeight - 200));
    const fit = Math.min(1, maxW / naturalW, maxH / naturalH);
    imageEditBaseW = Math.max(1, Math.round(naturalW * fit));
    imageEditBaseH = Math.max(1, Math.round(naturalH * fit));
}
function syncImageEditOverflow(){
    const stage = document.getElementById('imageEditStage');
    const crop = document.getElementById('cropCanvas');
    if(!stage || !crop) return;
    const rect = crop.getBoundingClientRect(), pad = 36;
    stage.classList.toggle('overflow-x', rect.width + pad > stage.clientWidth);
    stage.classList.toggle('overflow-y', rect.height + pad > stage.clientHeight);
}
function resetImageEditZoom(){
    if(imageEditMode === 'preview'){
        resetPreviewTransform();
        return;
    }
    const stage = document.getElementById('imageEditStage');
    imageEditZoom = 1.0; applyImageEditZoom();
    if(stage){ stage.scrollLeft = 0; stage.scrollTop = 0; }
}
function updateZoomLabel(){
    const el = document.getElementById('imageEditZoomLabel');
    if(el) el.textContent = Math.round((imageEditMode === 'preview' ? previewZoom : imageEditZoom) * 100) + '%';
}
function syncGridCustomCursor(){
    const el = document.getElementById('cropCanvas');
    el.classList.toggle('grid-custom-h', imageEditMode === 'grid' && gridCustomMode && gridCustomOrientation === 'h');
    el.classList.toggle('grid-custom-v', imageEditMode === 'grid' && gridCustomMode && gridCustomOrientation === 'v');
}
function refreshGridSplitPreview(){
    const canvasEl = editDrawCanvas();
    const ctx = canvasEl.getContext('2d');
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    if(imageEditMode !== 'grid') return;
    const countEl = document.getElementById('gridSplitCount');
    const lineWidth = Math.max(2, Math.round(Math.min(canvasEl.width, canvasEl.height) / 320));
    const drawLine = (x1, y1, x2, y2) => {
        ctx.save(); ctx.lineWidth = lineWidth + 2; ctx.strokeStyle = 'rgba(2,6,23,0.72)'; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.lineWidth = lineWidth; ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
    };
    if(gridCustomMode){
        const gap = Math.max(0, Math.min(240, Number(document.getElementById('gridGapSize')?.value || 0)));
        const hLines = gridCustomLines.filter(l => l.type === 'h'), vLines = gridCustomLines.filter(l => l.type === 'v');
        if(countEl) countEl.textContent = tr('canvas.gridWillOutput').replace('{n}', (hLines.length + 1) * (vLines.length + 1));
        hLines.forEach(l => { const y = l.pos * canvasEl.height; gap > 0 ? (drawLine(0, y - gap / 2, canvasEl.width, y - gap / 2), drawLine(0, y + gap / 2, canvasEl.width, y + gap / 2)) : drawLine(0, y, canvasEl.width, y); });
        vLines.forEach(l => { const x = l.pos * canvasEl.width; gap > 0 ? (drawLine(x - gap / 2, 0, x - gap / 2, canvasEl.height), drawLine(x + gap / 2, 0, x + gap / 2, canvasEl.height)) : drawLine(x, 0, x, canvasEl.height); });
        return;
    }
    const {rows, cols, gap} = gridSplitSettings();
    if(countEl) countEl.textContent = tr('canvas.gridWillOutput').replace('{n}', rows * cols);
    for(let i = 1; i < cols; i++){ const x = i * canvasEl.width / cols; gap > 0 ? (drawLine(x - gap / 2, 0, x - gap / 2, canvasEl.height), drawLine(x + gap / 2, 0, x + gap / 2, canvasEl.height)) : drawLine(x, 0, x, canvasEl.height); }
    for(let i = 1; i < rows; i++){ const y = i * canvasEl.height / rows; gap > 0 ? (drawLine(0, y - gap / 2, canvasEl.width, y - gap / 2), drawLine(0, y + gap / 2, canvasEl.width, y + gap / 2)) : drawLine(0, y, canvasEl.width, y); }
}
function renderCropBox(){
    if(!cropState) return;
    const cropCanvasEl = document.getElementById('cropCanvas');
    const img = document.getElementById('cropImage');
    const draw = editDrawCanvas();
    let boxX = cropState.x;
    let boxY = cropState.y;
    if(imageEditMode === 'outpaint' && cropCanvasEl && img){
        cropCanvasEl.style.width = `${Math.round(cropState.w)}px`;
        cropCanvasEl.style.height = `${Math.round(cropState.h)}px`;
        img.style.position = 'absolute';
        img.style.left = `${Math.round(cropState.x)}px`;
        img.style.top = `${Math.round(cropState.y)}px`;
        boxX = 0;
        boxY = 0;
        if(draw){
            draw.style.left = img.style.left;
            draw.style.top = img.style.top;
        }
        updateOutpaintResolutionLabel();
    } else if(cropCanvasEl && img){
        cropCanvasEl.style.width = '';
        cropCanvasEl.style.height = '';
        img.style.position = '';
        img.style.left = '';
        img.style.top = '';
        if(draw){
            draw.style.left = '';
            draw.style.top = '';
        }
    }
    const box = document.getElementById('cropBox');
    if(box){
        box.style.left = `${boxX}px`; box.style.top = `${boxY}px`; box.style.width = `${cropState.w}px`; box.style.height = `${cropState.h}px`;
    }
    const outpaintFrame = document.getElementById('outpaintFrame');
    if(outpaintFrame){
        outpaintFrame.style.left = imageEditMode === 'outpaint' ? '0px' : `${boxX}px`;
        outpaintFrame.style.top = imageEditMode === 'outpaint' ? '0px' : `${boxY}px`;
        outpaintFrame.style.width = `${cropState.w}px`;
        outpaintFrame.style.height = `${cropState.h}px`;
    }
}
function outpaintNaturalSize(){
    const img = document.getElementById('cropImage');
    if(!img || !cropState) return {w:1, h:1};
    const display = cropImageDisplaySize();
    const scaleX = Math.max(1, Number(img.naturalWidth || 1)) / Math.max(1, Number(display.w || img.clientWidth || 1));
    const scaleY = Math.max(1, Number(img.naturalHeight || 1)) / Math.max(1, Number(display.h || img.clientHeight || 1));
    return {
        w:Math.max(1, Math.round((cropState.w || 1) * scaleX)),
        h:Math.max(1, Math.round((cropState.h || 1) * scaleY))
    };
}
function updateOutpaintResolutionLabel(){
    const label = document.getElementById('outpaintResolution');
    const cropCanvasEl = document.getElementById('cropCanvas');
    if(!label || !cropState) return;
    const size = outpaintNaturalSize();
    const warning = exceedsFourKStandard(size.w, size.h);
    cropCanvasEl?.classList.toggle('outpaint-warning', warning);
    label.textContent = `${Math.round(size.w)} x ${Math.round(size.h)}`;
}
function clampOutpaint(){
    if(!cropState) return;
    const {w, h} = cropBounds();
    cropState.w = Math.max(w, cropState.w);
    cropState.h = Math.max(h, cropState.h);
    cropState.x = Math.min(cropState.w - w, Math.max(0, cropState.x));
    cropState.y = Math.min(cropState.h - h, Math.max(0, cropState.y));
}
function resetOutpaintBox(){
    if(!cropState) return;
    ensureImageEditBaseSize(true);
    applyImageEditZoom();
    const {w, h} = cropBounds();
    cropState.w = w;
    cropState.h = h;
    cropState.x = 0;
    cropState.y = 0;
    clampOutpaint();
    renderCropBox();
}
function resetCropBox(){
    if(!cropState) return;
    if(imageEditMode === 'outpaint') return resetOutpaintBox();
    const {w, h} = cropBounds();
    cropState.x = Math.round(w * 0.08); cropState.y = Math.round(h * 0.08); cropState.w = Math.round(w * 0.84); cropState.h = Math.round(h * 0.84);
    renderCropBox();
}
function updatePreviewNavButtons(){
    const node = nodes.find(n => n.id === previewNavState.nodeId);
    const count = Math.max(0, (node?.images || []).filter(img => img?.url).length);
    previewNavState.count = count;
    const show = imageEditModal.classList.contains('open') && count > 1;
    document.getElementById('previewPrevBtn')?.classList.toggle('visible', show);
    document.getElementById('previewNextBtn')?.classList.toggle('visible', show);
}
function navigatePreviewImage(delta){
    if(!imageEditModal.classList.contains('open')) return;
    const node = nodes.find(n => n.id === previewNavState.nodeId);
    const images = (node?.images || []).filter(img => img?.url);
    if(!node || images.length <= 1) return;
    const count = images.length;
    const next = (Number(previewNavState.index || 0) + Number(delta || 0) + count) % count;
    openImageEditor(node.id, next);
}
function openImageEditor(nodeId, imageIndex=0){
    const node = nodes.find(n => n.id === nodeId);
    const image = node?.images?.[imageIndex];
    if(!image?.url) return;
    selectedId = nodeId;
    selectedImage = {nodeId, index:imageIndex};
    previewNavState = {nodeId, index:imageIndex, count:(node.images || []).filter(img => img?.url).length};
    cropState = {nodeId, imageIndex, x:0, y:0, w:0, h:0};
    gridCustomMode = false; gridCustomLines = []; gridCustomHistory = []; gridCustomDrag = null; gridCustomOrientation = 'h';
    imageEditZoom = 1.0; imageEditBaseW = 0; imageEditBaseH = 0; imageEditModeTouched = false;
    const toggle = document.getElementById('gridCustomToggle');
    if(toggle){ toggle.classList.add('secondary'); toggle.classList.remove('primary'); }
    syncGridCustomControls();
    ['gridHorizontalLines','gridVerticalLines'].forEach(id => { const el = document.getElementById(id); if(el) el.disabled = false; });
    const orientH = document.getElementById('gridOrientH'), orientV = document.getElementById('gridOrientV');
    if(orientH){ orientH.classList.add('primary'); orientH.classList.remove('secondary'); }
    if(orientV){ orientV.classList.add('secondary'); orientV.classList.remove('primary'); }
    syncGridCustomUndoBtn(); updateZoomLabel();
    const img = document.getElementById('cropImage');
    img.style.width = ''; img.style.height = ''; img.style.maxWidth = ''; img.style.maxHeight = '';
    imageEditModal.classList.add('open');
    previewCompareOn = false;
    previewCompareIndex = -1;
    resetPreviewTransform();
    img.onload = () => {
        const targetImage = node.images?.[imageIndex];
        if(targetImage && img.naturalWidth && img.naturalHeight && (!targetImage.natural_w || !targetImage.natural_h)){
            targetImage.natural_w = img.naturalWidth;
            targetImage.natural_h = img.naturalHeight;
            scheduleSave();
        }
        imageEditBaseW = img.clientWidth; imageEditBaseH = img.clientHeight;
        updateZoomLabel(); resizeEditDrawCanvas(); resetEditDrawingHistory(); clearEditDrawing(true); resetCropBox();
        if(!imageEditModeTouched) setImageEditMode('preview');
        else refreshComparePanel();
        updatePreviewMetaHint();
        syncImageEditOverflow(); refreshIcons();
    };
    img.crossOrigin = 'anonymous';
    img.src = image.url;
    setImageEditMode('preview');
    updatePreviewNavButtons();
    refreshIcons();
}
function closeImageEditor(){
    imageEditModal.classList.remove('open');
    const img = document.getElementById('cropImage');
    img.onload = null; img.removeAttribute('src'); img.style.width = ''; img.style.height = ''; img.style.maxWidth = ''; img.style.maxHeight = '';
    img.style.position = ''; img.style.left = ''; img.style.top = '';
    clearEditDrawing(true);
    cropState = null; cropDrag = null; editDrawState = null; resetEditDrawingHistory(); gridCustomDrag = null;
    previewNavState = {nodeId:'', index:0, count:0};
    imageEditZoom = 1.0; imageEditBaseW = 0; imageEditBaseH = 0; imageEditModeTouched = false;
    previewPanDrag = null; previewCompareDrag = false; imageEditPanDrag = null; resetPreviewTransform();
    document.getElementById('imageEditStage')?.classList.remove('overflow-x', 'overflow-y', 'preview-mode');
    const cropCanvasEl = document.getElementById('cropCanvas');
    cropCanvasEl?.classList.remove('grid-custom-h', 'grid-custom-v', 'outpaint-mode', 'outpaint-warning', 'dragging-image');
    if(cropCanvasEl){ cropCanvasEl.style.width = ''; cropCanvasEl.style.height = ''; }
    updatePreviewNavButtons();
}
function clampCrop(){
    if(!cropState) return;
    if(imageEditMode === 'outpaint') return clampOutpaint();
    const {w, h} = cropBounds();
    cropState.w = Math.max(24, Math.min(cropState.w, w)); cropState.h = Math.max(24, Math.min(cropState.h, h));
    cropState.x = Math.max(0, Math.min(cropState.x, w - cropState.w)); cropState.y = Math.max(0, Math.min(cropState.y, h - cropState.h));
}
function beginCropDrag(event, mode){
    if(!cropState) return;
    event.preventDefault(); event.stopPropagation();
    if(imageEditMode === 'outpaint' && mode === 'move') return;
    cropDrag = {mode, sx:event.clientX, sy:event.clientY, start:{...cropState}};
}
function resizeOutpaintFromDrag(dx, dy){
    const start = cropDrag?.start;
    if(!start) return;
    let growX = 0, growY = 0;
    if(cropDrag.mode === 'outpaint-left') growX = -dx;
    else if(cropDrag.mode === 'outpaint-right') growX = dx;
    else if(cropDrag.mode === 'outpaint-top') growY = -dy;
    else if(cropDrag.mode === 'outpaint-bottom') growY = dy;
    else if(cropDrag.mode === 'outpaint-corner'){ growX = dx; growY = dy; }
    const {w, h} = cropBounds();
    const nextW = Math.max(w, start.w + growX * 2);
    const nextH = Math.max(h, start.h + growY * 2);
    cropState.w = nextW;
    cropState.h = nextH;
    cropState.x = start.x + Math.round((nextW - start.w) / 2);
    cropState.y = start.y + Math.round((nextH - start.h) / 2);
    clampOutpaint();
}
async function uploadCroppedBlob(blob, name){
    const form = new FormData();
    form.append('files', blob, name);
    const data = await fetch('/api/ai/upload', {method:'POST', body:form}).then(r => r.json());
    return data.files?.[0];
}
async function uploadImageBlobs(blobs){
    const form = new FormData();
    blobs.forEach(item => form.append('files', item.blob, item.name));
    const data = await fetch('/api/ai/upload', {method:'POST', body:form}).then(r => r.json());
    return data.files || [];
}
function replaceEditedImage(file){
    const {node, index} = currentEditImage();
    if(!node || !file) return false;
    node.images[index] = {...(node.images[index] || {}), url:file.url, name:file.name, kind:file.kind || mediaKindForItem(file), natural_w:0, natural_h:0};
    if((node.images || []).length === 1){ delete node.w; delete node.h; }
    selectedId = node.id; selectedImage = {nodeId:node.id, index};
    return true;
}
function applyOutpaintSizeToSmartParams(width, height){
    const w = Math.max(1, Math.round(Number(width) || 0));
    const h = Math.max(1, Math.round(Number(height) || 0));
    if(!w || !h) return;
    const subject = currentEditImage().node;
    if(!subject || !isSmartImageNode(subject)) return;
    subject.outpaintSize = {width:w, height:h};
    subject.runSettings = withOutpaintDisplaySettings(subject, {
        ...cloneSmartSettings(subject.runSettings || settings),
        engine:'api',
        apiKind:'image'
    });
    if(activeSettingsSubject()?.id === subject.id){
        settings = smartSettingsForNode(subject);
        renderDynamicParams();
    }
}
async function applyImageCrop(){
    if(!cropState) return;
    const {node, image} = currentEditImage();
    const img = document.getElementById('cropImage');
    if(!node || !image || !img.naturalWidth || !img.naturalHeight) return;
    const scaleX = img.naturalWidth / (img.clientWidth || 1), scaleY = img.naturalHeight / (img.clientHeight || 1);
    const sx = Math.max(0, Math.round(cropState.x * scaleX)), sy = Math.max(0, Math.round(cropState.y * scaleY));
    const sw = Math.max(1, Math.round(cropState.w * scaleX)), sh = Math.max(1, Math.round(cropState.h * scaleY));
    const canvasEl = document.createElement('canvas');
    canvasEl.width = sw; canvasEl.height = sh;
    canvasEl.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    const blob = await new Promise(resolve => canvasEl.toBlob(resolve, 'image/png'));
    const base = (image.name || 'image').replace(/\.[^.]+$/, '');
    const file = blob ? await uploadCroppedBlob(blob, `${base}_crop.png`) : null;
    if(file && replaceEditedImage(file)){ closeImageEditor(); render(); scheduleSave(); }
}
async function applyImageOutpaint(){
    if(!cropState) return;
    const {node, image} = currentEditImage();
    const img = document.getElementById('cropImage');
    if(!node || !image || !img.naturalWidth || !img.naturalHeight) return;
    clampOutpaint();
    const scaleX = img.naturalWidth / (img.clientWidth || 1), scaleY = img.naturalHeight / (img.clientHeight || 1);
    const outW = Math.max(img.naturalWidth, Math.round(cropState.w * scaleX));
    const outH = Math.max(img.naturalHeight, Math.round(cropState.h * scaleY));
    const dx = Math.round(cropState.x * scaleX);
    const dy = Math.round(cropState.y * scaleY);
    const canvasEl = document.createElement('canvas');
    canvasEl.width = outW; canvasEl.height = outH;
    const ctx = canvasEl.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(img, dx, dy, img.naturalWidth, img.naturalHeight);
    const blob = await new Promise(resolve => canvasEl.toBlob(resolve, 'image/png'));
    const base = (image.name || 'image').replace(/\.[^.]+$/, '');
    const file = blob ? await uploadCroppedBlob(blob, `${base}_outpaint.png`) : null;
    if(file && replaceEditedImage(file)){
        applyOutpaintSizeToSmartParams(outW, outH);
        setPromptDraftForNode(node, 'Remove white area and fill the scene');
        promptInput.dataset.preserveDraftOnce = '1';
        closeImageEditor();
        render();
        scheduleSave();
    }
}
async function applyImageMask(){
    if(!cropState || !editCanvasHasPixels()) return;
    const {node, image} = currentEditImage();
    if(!node || !image) return;
    const mask = maskCanvasFromDrawCanvas(editDrawCanvas());
    const blob = await new Promise(resolve => mask.toBlob(resolve, 'image/png'));
    const base = (image.name || 'image').replace(/\.[^.]+$/, '');
    const file = blob ? await uploadCroppedBlob(blob, `${base}_mask.png`) : null;
    if(file){
        node.images.push({url:file.url, name:file.name, role:'mask'});
        selectedId = node.id; selectedImage = {nodeId:node.id, index:node.images.length - 1};
        closeImageEditor(); render(); scheduleSave();
    }
}
function maskCanvasFromDrawCanvas(src){
    const mask = document.createElement('canvas');
    mask.width = src.width;
    mask.height = src.height;
    const srcCtx = src.getContext('2d');
    const srcData = srcCtx.getImageData(0, 0, src.width, src.height);
    const ctx = mask.getContext('2d');
    const out = ctx.createImageData(mask.width, mask.height);
    for(let i = 0; i < srcData.data.length; i += 4){
        const painted = srcData.data[i + 3] > 8;
        const v = painted ? 255 : 0;
        out.data[i] = v;
        out.data[i + 1] = v;
        out.data[i + 2] = v;
        out.data[i + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
    return mask;
}
async function applyImageBrush(){
    if(!cropState || !editCanvasHasPixels()) return;
    const {node, image} = currentEditImage();
    const img = document.getElementById('cropImage');
    if(!node || !image || !img.naturalWidth || !img.naturalHeight) return;
    const canvasEl = document.createElement('canvas');
    canvasEl.width = img.naturalWidth; canvasEl.height = img.naturalHeight;
    const ctx = canvasEl.getContext('2d');
    ctx.drawImage(img, 0, 0, canvasEl.width, canvasEl.height); ctx.drawImage(editDrawCanvas(), 0, 0);
    const blob = await new Promise(resolve => canvasEl.toBlob(resolve, 'image/png'));
    const base = (image.name || 'image').replace(/\.[^.]+$/, '');
    const file = blob ? await uploadCroppedBlob(blob, `${base}_paint.png`) : null;
    if(file && replaceEditedImage(file)){ closeImageEditor(); render(); scheduleSave(); }
}
async function applyImageGridSplit(){
    if(!cropState) return;
    const {node, image} = currentEditImage();
    const img = document.getElementById('cropImage');
    if(!node || !image || !img.naturalWidth || !img.naturalHeight) return;
    const rects = gridSplitRects(img.naturalWidth, img.naturalHeight);
    if(!rects.length) return;
    const base = (image.name || 'image').replace(/\.[^.]+$/, '');
    const blobs = [];
    for(const rect of rects){
        const canvasEl = document.createElement('canvas');
        canvasEl.width = rect.w; canvasEl.height = rect.h;
        canvasEl.getContext('2d').drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
        const blob = await new Promise(resolve => canvasEl.toBlob(resolve, 'image/png'));
        if(blob) blobs.push({blob, name:`${base}_r${rect.row + 1}_c${rect.col + 1}.png`});
    }
    const files = await uploadImageBlobs(blobs);
    if(files.length){
        const layout = gridLayoutFromRects(rects);
        const outputNode = createNode((node.x || 0) + imageLayout(node.images || [], nodeScale(node), node).width + 40, node.y || 0, files.map((file, i) => ({
            url:file.url,
            name:file.name,
            grid:{...layout, row:rects[i]?.row || 0, col:rects[i]?.col || 0, w:rects[i]?.w || 1, h:rects[i]?.h || 1}
        })));
        outputNode.title = 'Grid';
        closeImageEditor(); render(); scheduleSave();
    }
}
function applyImageEdit(){
    if(imageEditMode === 'preview') return;
    if(imageEditMode === 'outpaint') return applyImageOutpaint();
    if(imageEditMode === 'mask') return applyImageMask();
    if(imageEditMode === 'brush') return applyImageBrush();
    if(imageEditMode === 'grid') return applyImageGridSplit();
    return applyImageCrop();
}
let lastComposerNodeId = '';
let activeComposerSubject = null;
function currentComposerSubject(){
    return selectedNode();
}
function savePromptDraftForCurrent(){
    if(promptInput?.dataset?.promptLocked === '1') return;
    const subject = activeComposerNode();
    if(!subject) return;
    if(promptInput?.dataset?.preserveDraftOnce === '1' && subject.promptDraftHtml){
        delete promptInput.dataset.preserveDraftOnce;
        return;
    }
    subject.promptDraftHtml = promptInput.innerHTML;
    subject.promptDraftText = promptPlainText();
    subject.runSettings = cloneSmartSettings(settings);
}
function setPromptDraftForNode(node, text){
    if(!isSmartImageNode(node)) return;
    const value = String(text || '');
    node.promptDraftHtml = escapeHtml(value);
    node.promptDraftText = value;
    node.promptDraftTouched = true;
    if(activeSettingsSubject()?.id === node.id && promptInput){
        promptInput.textContent = value;
        delete promptInput.dataset.preserveDraftOnce;
    }
}
function loadPromptDraft(subject){
    if(subject?.promptDraftHtml){
        const hasToken = String(subject.promptDraftHtml || '').includes('mention-image-token');
        promptInput.innerHTML = hasToken
            ? subject.promptDraftHtml
            : (promptHtmlWithMentionTokens(subject.runPrompt || subject.promptDraftText || '', subject.runPromptRefs || []) || subject.promptDraftHtml);
    } else if(typeof subject?.runPrompt === 'string'){
        const rebuilt = promptHtmlWithMentionTokens(subject.runPrompt, subject.runPromptRefs || []);
        if(rebuilt) promptInput.innerHTML = rebuilt;
        else setPromptText(subject.runPrompt);
    } else {
        setPromptText('');
    }
}
function positionComposerForNode(node){
    if(!node) return;
    const rect = nodeRect(node);
    const gap = 14;
    const cardW = 540;
    composer.style.width = `${cardW}px`;
    composer.style.left = `${rect.x + rect.width / 2 - cardW / 2}px`;
    composer.style.top = `${rect.y + rect.height + gap}px`;
}
function updateComposer(){
    const node = selectedNode();
    composer.classList.toggle('open', !!node);
    if(!isSmartImageNode(node)){
        if(cascadeRunBtn) cascadeRunBtn.style.display = 'none';
        savePromptDraftForCurrent();
        composer.classList.remove('open');
        activeComposerSubject = null;
        lastComposerNodeId = '';
        setPromptInputLocked(false);
        if(!node) setPromptText('');
        return;
    }
    // composer 只绑定节点本身：图片只是素材/结果，不携带提示词或参数状态。
    const subject = node;
    const composerKey = `${node.id}:node`;
    const switchedNode = lastComposerNodeId !== composerKey;
    if(switchedNode) savePromptDraftForCurrent();
    lastComposerNodeId = composerKey;
    activeComposerSubject = subject;
    const hasPromptInput = promptInputNodesFor(node).length > 0;
    const lockedPromptText = inputPromptTextFor(node).trim();
    if(switchedNode){
        settings = smartSettingsForNode(subject);
        if(hasPromptInput) setPromptText(lockedPromptText);
        else loadPromptDraft(subject);
    }
    if(hasPromptInput) setPromptText(lockedPromptText);
    setPromptInputLocked(hasPromptInput);
    syncCascadeRunButton(node);
    positionComposerForNode(node);
    const ph = Math.max(60, Math.min(380, Number(settings.promptH) || 124));
    promptInput.style.setProperty('--prompt-h', `${ph}px`);
    renderInputThumbsRow(node);
    syncCascadeRunButton(node);
    updateProviderModels();
}
function renderInputThumbsRow(node){
    if(!inputThumbsRow) return;
    const dedup = node ? visibleReferenceImagesFor(node) : [];
    inputThumbsRow.classList.toggle('has-items', dedup.length > 0);
    if(!dedup.length){ inputThumbsRow.innerHTML = ''; return; }
    inputThumbsRow.innerHTML = dedup.map((img, i) => {
        const isVid = isVideoMediaItem(img);
        const blocked = node ? isInputRefBlocked(node, img) : false;
        const title = blocked ? tr('smart.inputClickEnable') : tr('smart.inputClickBlock');
        const inner = isVid ? `<video src="${escapeHtml(img.url)}" muted preload="metadata" playsinline disablepictureinpicture controlslist="nodownload noplaybackrate noremoteplayback"></video>` : `<img src="${escapeHtml(img.url)}" draggable="false">`;
        return `<div class="input-thumb ${blocked ? 'input-blocked' : ''}" draggable="true" data-thumb-index="${i}" data-node-id="${escapeHtml(img.nodeId || '')}" data-image-index="${img.imageIndex ?? ''}" data-url="${escapeHtml(img.url || '')}" data-blocked-label="${escapeHtml(tr('smart.inputBlocked'))}" title="${escapeHtml(`${img.name || tr('smart.inputNum').replace('{n}', String(i + 1))} · ${title}`)}">${inner}</div>`;
    }).join('') + (dedup.length > 1 ? `<span class="input-thumb-count">${escapeHtml(tr('smart.inputCount').replace('{n}', String(dedup.length)))}</span>` : '');
    bindInputThumbsDrag(node, dedup);
}
function bindInputThumbsDrag(node, items){
    if(!inputThumbsRow) return;
    let dragIndex = -1;
    let suppressClickUntil = 0;
    inputThumbsRow.querySelectorAll('.input-thumb').forEach(el => {
        el.addEventListener('dragstart', e => {
            dragIndex = Number(el.dataset.thumbIndex);
            el.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            try { e.dataTransfer.setData('text/plain', String(dragIndex)); } catch {}
        });
        el.addEventListener('dragend', () => {
            suppressClickUntil = Date.now() + 160;
            el.classList.remove('dragging');
            inputThumbsRow.querySelectorAll('.input-thumb').forEach(x => x.classList.remove('drop-before','drop-after'));
        });
        el.addEventListener('dragover', e => {
            e.preventDefault();
            if(dragIndex < 0) return;
            const rect = el.getBoundingClientRect();
            const before = e.clientX < rect.left + rect.width / 2;
            inputThumbsRow.querySelectorAll('.input-thumb').forEach(x => x.classList.remove('drop-before','drop-after'));
            el.classList.add(before ? 'drop-before' : 'drop-after');
        });
        el.addEventListener('drop', e => {
            e.preventDefault();
            if(dragIndex < 0) return;
            const toRaw = Number(el.dataset.thumbIndex);
            const rect = el.getBoundingClientRect();
            const before = e.clientX < rect.left + rect.width / 2;
            let to = before ? toRaw : toRaw + 1;
            if(to > dragIndex) to--;
            if(to === dragIndex || dragIndex < 0) return;
            reorderInputThumb(node, items, dragIndex, to);
            dragIndex = -1;
        });
        el.addEventListener('click', e => {
            if(Date.now() < suppressClickUntil) return;
            const index = Number(el.dataset.thumbIndex);
            const img = items[index];
            if(!node || !img?.url) return;
            e.preventDefault();
            e.stopPropagation();
            toggleInputRefBlocked(node, img);
        });
    });
}
function reorderInputThumb(currentNode, items, from, to){
    // items are already sourced from inputImagesFor → multiple source nodes possible.
    // We reorder by repositioning the X coordinates of source nodes if they're separate,
    // OR by swapping within a single source node's images.
    if(from < 0 || to < 0 || from >= items.length || to >= items.length) return;
    const fromImg = items[from];
    const toImg = items[to];
    if(!fromImg || !toImg) return;
    if(fromImg.nodeId === toImg.nodeId){
        const src = nodes.find(n => n.id === fromImg.nodeId);
        if(!src) return;
        pushUndo();
        const fi = Number(fromImg.imageIndex);
        const ti = Number(toImg.imageIndex);
        if(Number.isFinite(fi) && Number.isFinite(ti) && (src.images || [])[fi]){
            const arr = src.images;
            const item = arr.splice(fi, 1)[0];
            arr.splice(ti, 0, item);
        }
        render();
        scheduleSave();
        return;
    }
    // Cross-node reorder: swap X positions of source nodes
    const a = nodes.find(n => n.id === fromImg.nodeId);
    const b = nodes.find(n => n.id === toImg.nodeId);
    if(!a || !b) return;
    pushUndo();
    const ax = a.x, ay = a.y;
    a.x = b.x; a.y = b.y;
    b.x = ax; b.y = ay;
    render();
    scheduleSave();
}
function isSupportedUploadFile(file){
    const type = String(file?.type || '').toLowerCase();
    const name = String(file?.name || '').toLowerCase();
    return type.startsWith('image/') || type.startsWith('video/') || type.startsWith('audio/')
        || /\.(png|jpe?g|webp|gif|mp4|webm|mov|m4v|mp3|wav|m4a|aac|ogg|flac)(\?|$)/.test(name);
}
function dataTransferItemEntry(item){
    try { return item?.webkitGetAsEntry?.() || null; } catch { return null; }
}
async function filesFromEntry(entry){
    if(!entry) return [];
    if(entry.isFile){
        return new Promise(resolve => entry.file(file => resolve(file ? [file] : []), () => resolve([])));
    }
    if(!entry.isDirectory) return [];
    const reader = entry.createReader();
    const children = [];
    while(true){
        const batch = await new Promise(resolve => reader.readEntries(resolve, () => resolve([])));
        if(!batch.length) break;
        children.push(...batch);
    }
    const nested = await Promise.all(children.map(filesFromEntry));
    return nested.flat();
}
async function uploadFilesFromDataTransfer(dataTransfer){
    const items = [...(dataTransfer?.items || [])];
    const entries = items.map(dataTransferItemEntry).filter(Boolean);
    const raw = entries.length
        ? (await Promise.all(entries.map(filesFromEntry))).flat()
        : [...(dataTransfer?.files || [])];
    return raw.filter(isSupportedUploadFile);
}
function uploadTitleForItems(items, fallback='Upload'){
    const list = [...(items || [])];
    if(!list.length) return fallback;
    const kinds = new Set(list.map(item => item instanceof File ? mediaKindForFile(item) : mediaKindForItem(item)));
    if(kinds.size > 1) return list.length > 1 ? 'Media' : fallback;
    if(kinds.has('video')) return list.length > 1 ? 'Videos' : 'Video';
    if(kinds.has('audio')) return 'Audio';
    return list.length > 1 ? 'Group' : 'Image';
}
async function uploadFiles(files){
    const supported = [...(files || [])].filter(isSupportedUploadFile);
    if(!supported.length) return [];
    const form = new FormData();
    supported.forEach(file => form.append('files', file, file.name || 'media'));
    const data = await fetch('/api/ai/upload', {method:'POST', body:form}).then(async r => {
        if(!r.ok) throw new Error((await r.text()) || tr('smart.toastUploadFail'));
        return r.json();
    });
    return (data.files || []).map((file, index) => ({
        ...file,
        kind:file.kind || mediaKindForFile(supported[index])
    }));
}
async function handleFiles(files, targetId='', opts={}){
    try {
        const fileList = [...(files || [])].filter(isSupportedUploadFile);
        if(!fileList.length) return;
        const uploaded = await uploadFiles(fileList);
        if(!uploaded.length) return;
        if(!opts.skipUndo) pushUndo();
        let node = nodes.find(n => n.id === targetId) || selectedNode();
        if(node && node.type !== 'smart-image') node = null;
        if(!node){
            const center = opts.point || viewportCenter();
            undoSuppressed = true;
            node = createImageNodeAt(center, []);
            undoSuppressed = false;
        }
        const previousCount = (node.images || []).length;
        node.images = [...(node.images || []), ...uploaded.map((file, index) => ({...file, kind:file.kind || mediaKindForFile(fileList[index])}))];
        if(node.images.length > 1){
            node.title = uploadTitleForItems(node.images, 'Group');
            if(previousCount <= 1 && (!Number.isFinite(Number(node.scale)) || Number(node.scale) === MEDIA_NODE_DEFAULT_SCALE || Number(node.scale) === MEDIA_GROUP_PREVIOUS_DEFAULT_SCALE)){
                node.scale = MEDIA_GROUP_DEFAULT_SCALE;
            }
            delete node.w;
            delete node.h;
        }
        if(node.images.length === 1){ node.title = uploadTitleForItems(node.images, node.title || 'Image'); delete node.w; delete node.h; }
        selectedId = node.id;
        render();
        scheduleSave();
    } catch(e) { toast(e.message || tr('smart.toastUploadFail')); }
}
function sizeForRun(){
    return apiImageSize(settings.ratio || 'square', settings.resolution || '1k', settings.customRatio || '', settings.customSize || '') || '1024x1024';
}
function expectedOutputSize(){
    if(settings.engine === 'comfy'){
        if(settings.comfyMode === 'text'){
            const w = Number(settings.width) || 1024;
            const h = Number(settings.height) || 1024;
            return {w, h};
        }
        return {w:1024, h:1024};
    }
    if(settings.engine === 'runninghub') return {w:1024, h:1024};
    const sizeStr = settings.engine === 'modelscope'
        ? apiImageSize(settings.msRatio || 'square', settings.msResolution || '1k', settings.msCustomRatio || '', settings.msCustomSize || '')
        : sizeForRun();
    const parsed = parseSizeValue(sizeStr);
    if(parsed){
        return {w: Number(parsed.width) || 1024, h: Number(parsed.height) || 1024};
    }
    return {w:1024, h:1024};
}
function pendingBoxSize(count){
    const expected = expectedOutputSize();
    const aspect = expected.w / Math.max(1, expected.h);
    const c = Math.max(1, Number(count) || 1);
    if(c <= 1){
        const maxSide = 260 * MEDIA_NODE_DEFAULT_SCALE;
        if(expected.w >= expected.h){
            const w = maxSide;
            const h = Math.max(60 * MEDIA_NODE_DEFAULT_SCALE, Math.round(maxSide / aspect));
            return {w, h};
        }
        const h = maxSide;
        const w = Math.max(60 * MEDIA_NODE_DEFAULT_SCALE, Math.round(maxSide * aspect));
        return {w, h};
    }
    const cols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(c))));
    const rows = Math.ceil(c / cols);
    const cellMax = 110 * MEDIA_NODE_DEFAULT_SCALE;
    let cellW, cellH;
    if(expected.w >= expected.h){
        cellW = cellMax;
        cellH = Math.max(40 * MEDIA_NODE_DEFAULT_SCALE, Math.round(cellMax / aspect));
    } else {
        cellH = cellMax;
        cellW = Math.max(40 * MEDIA_NODE_DEFAULT_SCALE, Math.round(cellMax * aspect));
    }
    const w = cols * (cellW + 8) + 16;
    const h = rows * (cellH + 8) + 16;
    return {w, h};
}
function mentionTokenHtml(img){
    if(!img?.url) return '';
    const name = img.alias || img.name || '图片';
    const kind = mediaKindForItem(img);
    const media = kind === 'video'
        ? `<video src="${escapeHtml(img.url)}" muted preload="metadata" playsinline disablepictureinpicture controlslist="nodownload noplaybackrate noremoteplayback"></video>`
        : `<img src="${escapeHtml(img.url)}" alt="">`;
    return `<span class="mention-image-token" contenteditable="false" data-url="${escapeHtml(img.url)}" data-kind="${escapeHtml(kind)}" data-name="${escapeHtml(name)}" data-node-id="${escapeHtml(img.nodeId || '')}" data-image-index="${escapeHtml(img.imageIndex ?? '')}">${media}<span>${escapeHtml(name)}</span></span>`;
}
function promptHtmlWithMentionTokens(text, refs=[]){
    const value = String(text || '');
    const items = (refs || []).filter(ref => ref?.url && ref?.name).sort((a, b) => String(b.name || '').length - String(a.name || '').length);
    if(!value || !items.length || !value.includes('@')) return '';
    let html = '';
    let index = 0;
    while(index < value.length){
        if(value[index] === '@'){
            const hit = items.find(ref => value.slice(index + 1, index + 1 + String(ref.name || '').length) === String(ref.name || ''));
            if(hit){
                html += mentionTokenHtml(hit);
                index += 1 + String(hit.name || '').length;
                continue;
            }
        }
        html += escapeHtml(value[index]);
        index += 1;
    }
    return html;
}
function snapshotRunMeta(prompt, sourceId, displayPrompt='', refs=[]){
    return {
        prompt,
        displayPrompt:displayPrompt || promptPlainText() || prompt,
        promptHtml: promptInput ? promptInput.innerHTML : '',
        promptText: promptPlainText(),
        promptRefs:(refs || []).map(ref => ({url:ref.url || '', name:ref.name || '', nodeId:ref.nodeId || '', imageIndex:ref.imageIndex ?? ''})).filter(ref => ref.url),
        sourceNodeId:sourceId,
        settings:JSON.parse(JSON.stringify(settings)),
        createdAt:Date.now()
    };
}
function attachRunMeta(targetNode, meta){
    if(!targetNode || !meta) return;
    targetNode.runPrompt = meta.displayPrompt || meta.promptText || meta.prompt;
    targetNode.runModelPrompt = meta.prompt;
    targetNode.runPromptRefs = meta.promptRefs || [];
    targetNode.runSettings = meta.settings;
    targetNode.sourceNodeId = meta.sourceNodeId;
    targetNode.runAt = meta.createdAt;
    // 保存可编辑的 @-提及表单到草稿字段，方便点输出节点时还原原始可编辑形式
    if(meta.promptHtml != null){
        const htmlHasToken = String(meta.promptHtml || '').includes('mention-image-token');
        const rebuiltHtml = htmlHasToken ? '' : promptHtmlWithMentionTokens(meta.displayPrompt || meta.promptText || '', meta.promptRefs || []);
        targetNode.promptDraftHtml = htmlHasToken ? meta.promptHtml : (rebuiltHtml || meta.promptHtml);
        targetNode.promptDraftText = meta.promptText || '';
    }
    targetNode.images = (targetNode.images || []).map(img => stripImageGenerationMeta(img));
}
function stripImageGenerationMeta(img){
    if(!img) return img;
    delete img.runPrompt;
    delete img.runModelPrompt;
    delete img.runSettings;
    delete img.sourceNodeId;
    delete img.runAt;
    delete img.promptDraftHtml;
    delete img.promptDraftText;
    return img;
}
function addConnection(fromId, toId, kind='flow'){
    if(!fromId || !toId || fromId === toId) return;
    canvas.connections = canvas.connections || [];
    if(canvas.connections.some(c => c.from === fromId && c.to === toId && (c.kind || 'flow') === kind)) return;
    canvas.connections.push({from:fromId, to:toId, kind});
}
function connectInputNode(fromId, toId){
    const from = nodes.find(n => n.id === fromId);
    const to = nodes.find(n => n.id === toId);
    if(!from || !to || from.id === to.id) return false;
    if(to.type === 'smart-loop'){
        const looksImage = from.type === 'smart-image' || (from.type === 'smart-loop' && from.imageInput);
        const looksPrompt = from.type === 'smart-prompt' || (from.type === 'smart-loop' && from.showPrompt);
        if(looksImage && !to.imageInput) to.imageInput = true;
        if(looksPrompt && !to.showPrompt) to.showPrompt = true;
        if(looksImage || looksPrompt) fitSmartLoopNode(to);
        const canImage = Boolean(to.imageInput) && looksImage;
        const canPrompt = Boolean(to.showPrompt) && looksPrompt;
        if(!canImage && !canPrompt) return false;
    }
    to.inputNodeIds = Array.from(new Set([...(to.inputNodeIds || []), from.id]));
    addConnection(from.id, to.id, 'input');
    return true;
}
function inputNodesFor(node){
    if(!node) return [];
    const ids = new Set(node.inputNodeIds || []);
    (canvas?.connections || []).forEach(conn => {
        if(conn.to === node.id && conn.kind === 'input') ids.add(conn.from);
    });
    return [...ids].map(id => nodes.find(n => n.id === id)).filter(Boolean);
}
function imagesForNode(node){
    return (node?.images || []).map((img, index) => ({...img, nodeId:node.id, imageIndex:index}));
}
function splitSmartPromptItems(text){
    const trimmed = String(text || '').trim();
    if(!trimmed) return [];
    const numbered = trimmed.split(/\s*(?:^|\s)\d+\s*[.、)）．]\s+/).map(s => s.trim()).filter(Boolean);
    if(numbered.length >= 2) return numbered;
    const lines = trimmed.split(/\r?\n+/).map(s => s.trim()).filter(Boolean);
    return lines.length >= 2 ? lines : [trimmed];
}
const smartLoopPromptVisiting = new Set();
function smartLoopInputPromptItems(node){
    if(!node?.showPrompt || smartLoopPromptVisiting.has(node.id)) return [];
    smartLoopPromptVisiting.add(node.id);
    try {
        return inputNodesFor(node).flatMap(input => {
            if(input.type === 'smart-prompt') return String(input.text || '').trim() ? [String(input.text || '').trim()] : [];
            if(input.type === 'smart-loop') {
                const text = smartLoopPrompt(input);
                return text ? [text] : [];
            }
            return [];
        }).filter(Boolean);
    } finally {
        smartLoopPromptVisiting.delete(node.id);
    }
}
function smartLoopPrompt(node, ctx=smartLoopContext){
    if(!node?.showPrompt) return '';
    const count = smartLoopCount(node);
    const startBase = Math.max(1, Number(node.loopStart) || 1);
    const index = Math.max(1, Number(ctx?.index || startBase) || startBase);
    const total = Math.max(1, Number(ctx?.total || count) || count);
    const items = smartLoopInputPromptItems(node);
    const selected = items.length ? items[(index - 1) % items.length] : (node.variablePrompt || '');
    return String(selected || '')
        .replaceAll('《计数》', String(index))
        .replaceAll('[计数]', String(index))
        .replaceAll(`[${tr('canvas.counterToken')}]`, String(index))
        .replaceAll('《总数》', String(total))
        .replaceAll('[总数]', String(total))
        .replaceAll('《进度》', `${index}/${total}`)
        .replaceAll('[进度]', `${index}/${total}`)
        .trim();
}
function smartLoopInputImages(node, ctx=smartLoopContext){
    if(!node?.imageInput) return [];
    const refs = inputNodesFor(node).flatMap(input => {
        if(input?.type === 'smart-loop') return smartLoopInputImages(input, ctx);
        return imagesForNode(input);
    }).filter(img => img?.url);
    if(!refs.length) return [];
    const startBase = Math.max(1, Number(node.loopStart) || 1);
    const batchSize = Math.max(1, Math.min(100, Number(node.imageBatchSize) || 1));
    const currentIndex = Math.max(1, Number(ctx?.index || startBase) || startBase);
    return refs.slice(Math.max(0, currentIndex - 1), Math.max(0, currentIndex - 1) + batchSize)
        .map((img, i) => ({...img, name:img.name || trf('canvas.loopImageLabel', {n:currentIndex + i})}));
}
function smartLoopPreviewImages(node){
    if(!node?.imageInput) return [];
    return inputNodesFor(node).flatMap(input => {
        if(input?.type === 'smart-loop') return smartLoopInputImages(input, {index:Number(node.loopStart) || 1});
        return imagesForNode(input);
    }).filter(img => img?.url);
}
function outputImagesForNode(node, consume=false, ctx=smartLoopContext){
    if(node?.type === 'smart-loop') return smartLoopInputImages(node, ctx);
    return imagesForNode(node).filter(img => img?.url);
}
function selfReferenceImagesForNode(node, consume=false, ctx=smartLoopContext){
    return outputImagesForNode(node, consume, ctx).filter(img => img?.url);
}
function textForNode(node, ctx=smartLoopContext){
    if(!node) return '';
    if(node.type === 'smart-prompt') return node.text || '';
    if(node.type === 'smart-loop') return smartLoopPrompt(node, ctx);
    return '';
}
function promptInputNodesFor(node){
    return inputNodesFor(node).filter(input => input?.type === 'smart-prompt' || input?.type === 'smart-loop');
}
function inputPromptTextFor(node, ctx=smartLoopContext){
    return promptInputNodesFor(node).map(input => textForNode(input, ctx)).filter(Boolean).join('\n\n');
}
function inputImagesFor(node, consume=false, ctx=smartLoopContext){
    return inputNodesFor(node).flatMap(input => outputImagesForNode(input, consume, ctx));
}
function inputRefKey(img){
    if(!img?.url) return '';
    const nodeId = img.nodeId || '';
    const imageIndex = Number.isFinite(Number(img.imageIndex)) ? String(Number(img.imageIndex)) : '';
    if(nodeId && imageIndex !== '') return `${nodeId}|${imageIndex}`;
    return `url|${img.url}`;
}
function blockedInputRefKeys(node){
    return new Set(Array.isArray(node?.blockedInputRefs) ? node.blockedInputRefs.filter(Boolean) : []);
}
function isInputRefBlocked(node, img){
    if(!node || !img?.url) return false;
    return blockedInputRefKeys(node).has(inputRefKey(img));
}
function activeInputImagesFor(node, consume=false, ctx=smartLoopContext){
    return inputImagesFor(node, consume, ctx).filter(img => img?.url && !isInputRefBlocked(node, img));
}
function toggleInputRefBlocked(node, img){
    if(!node || !img?.url) return;
    const key = inputRefKey(img);
    if(!key) return;
    pushUndo();
    const blocked = blockedInputRefKeys(node);
    if(blocked.has(key)) blocked.delete(key);
    else blocked.add(key);
    node.blockedInputRefs = [...blocked];
    if(!node.blockedInputRefs.length) delete node.blockedInputRefs;
    renderInputThumbsRow(node);
    scheduleSave();
}
function defaultReferenceImagesFor(node, consume=false, ctx=smartLoopContext){
    if(!node) return [];
    const upstream = activeInputImagesFor(node, consume, ctx).filter(img => img?.url);
    if(upstream.length) return upstream;
    return selfReferenceImagesForNode(node, consume, ctx).filter(img => img?.url);
}
function lineConnectionsFor(node){
    if(!node) return [];
    return (canvas?.connections || []).filter(conn => {
        if(!conn?.from || !conn?.to || conn.from === conn.to) return false;
        return ['input', 'flow'].includes(conn.kind || 'flow');
    });
}
function connectedLineNodeIds(node){
    if(!node) return [];
    const conns = lineConnectionsFor(node);
    const upstream = [];
    const downstream = [];
    const seenUp = new Set([node.id]);
    const seenDown = new Set([node.id]);
    const walkUp = id => {
        conns.filter(conn => conn.to === id).forEach(conn => {
            if(seenUp.has(conn.from)) return;
            seenUp.add(conn.from);
            walkUp(conn.from);
            upstream.push(conn.from);
        });
    };
    const walkDown = id => {
        conns.filter(conn => conn.from === id).forEach(conn => {
            if(seenDown.has(conn.to)) return;
            seenDown.add(conn.to);
            downstream.push(conn.to);
            walkDown(conn.to);
        });
    };
    walkUp(node.id);
    walkDown(node.id);
    return [...upstream, node.id, ...downstream];
}
function upstreamLineNodeIds(node){
    if(!node) return [];
    const conns = lineConnectionsFor(node);
    const upstream = [];
    const seen = new Set([node.id]);
    const walk = id => {
        conns.filter(conn => conn.to === id).forEach(conn => {
            if(seen.has(conn.from)) return;
            seen.add(conn.from);
            walk(conn.from);
            upstream.push(conn.from);
        });
    };
    walk(node.id);
    return [...upstream, node.id];
}
function lineImagesFor(node){
    const ids = upstreamLineNodeIds(node);
    return ids.flatMap(id => {
        const source = nodes.find(n => n.id === id);
        return imagesForNode(source);
    }).filter(img => img?.url);
}
function collectMentionedImagesFromPrompt(){
    const images = [];
    collectPromptParts().forEach(part => {
        if(part.type === 'image' && part.url) images.push(part);
    });
    return images;
}
function uniqueReferenceImages(images){
    const refs = [];
    const seen = new Set();
    (images || []).forEach((img, index) => {
        if(!img?.url || seen.has(img.url)) return;
        seen.add(img.url);
        refs.push({
            ...img,
            name:img.name || `图${refs.length + 1}`,
            role:img.role || `image_${refs.length + 1}`,
            imageIndex:Number.isFinite(Number(img.imageIndex)) ? Number(img.imageIndex) : index
        });
    });
    return refs;
}
function visibleReferenceImagesFor(node){
    const upstream = inputImagesFor(node);
    const base = upstream.length ? upstream : defaultReferenceImagesFor(node);
    return uniqueReferenceImages([...base, ...collectMentionedImagesFromPrompt()]);
}
function inputMentionCandidateImages(node){
    const current = node ? lineImagesFor(node) : [];
    const seen = new Set();
    return current.filter(img => {
        if(!img?.url || seen.has(img.url)) return false;
        seen.add(img.url);
        return true;
    }).map((img, index) => ({
        ...img,
        mentionId:`mention_${index}_${Math.random().toString(36).slice(2, 7)}`,
        alias:img.name || `图片${index + 1}`
    }));
}
function assetMentionCandidateImages(categoryId=''){
    const cats = assetCategories('image');
    const cat = cats.find(c => c.id === categoryId) || assetCategoryForMention();
    if(!cat) return [];
    mentionAssetCategoryId = cat.id;
    const items = (cat.items || []).map(item => ({...item, categoryName:cat.name || '', categoryId:cat.id}));
    const seen = new Set();
    return items.filter(item => {
        if(!item?.url || seen.has(item.url)) return false;
        seen.add(item.url);
        return true;
    }).map((item, index) => ({
        url:item.url,
        kind:assetMediaKind(item),
        name:item.name || `资产${index + 1}`,
        alias:item.name || `资产${index + 1}`,
        role:'asset',
        categoryName:item.categoryName || '',
        mentionId:`asset_${index}_${Math.random().toString(36).slice(2, 7)}`
    }));
}
function mentionCandidateImages(node, source=mentionSource){
    return source === 'asset' ? assetMentionCandidateImages(mentionAssetCategoryId) : inputMentionCandidateImages(node);
}
function referenceImagesFor(node){
    return defaultReferenceImagesFor(node);
}
function closeMentionPicker(){
    mentionPicker.classList.remove('open');
    mentionPicker.innerHTML = '';
}
function saveMentionRange(){
    const sel = window.getSelection();
    if(sel && sel.rangeCount && promptInput.contains(sel.anchorNode)){
        mentionRange = sel.getRangeAt(0).cloneRange();
    }
}
function textBeforeCaret(){
    const sel = window.getSelection();
    if(!sel || !sel.rangeCount || !promptInput.contains(sel.anchorNode)) return '';
    const range = sel.getRangeAt(0).cloneRange();
    range.selectNodeContents(promptInput);
    range.setEnd(sel.anchorNode, sel.anchorOffset);
    return range.toString();
}
function renderMentionPicker(source){
    const node = selectedNode();
    const inputItems = inputMentionCandidateImages(node);
    const assetCats = assetCategories('image');
    const currentAssetCat = assetCategoryForMention();
    const assetItems = assetMentionCandidateImages(currentAssetCat?.id || '');
    const hasInput = inputItems.length > 0;
    const hasAssets = assetCats.some(cat => (cat.items || []).some(item => item?.url));
    mentionSource = source || (hasInput ? 'input' : 'asset');
    if(mentionSource === 'input' && !hasInput && hasAssets) mentionSource = 'asset';
    if(mentionSource === 'asset' && !hasAssets && hasInput) mentionSource = 'input';
    if(!hasInput && !hasAssets){ closeMentionPicker(); return; }
    const candidates = (mentionSource === 'asset' ? assetItems : inputItems).slice(0, 36);
    const body = candidates.length ? `<div class="mention-option-grid">${candidates.map((img, i) => `
            <button class="mention-option" type="button" data-mention-index="${i}">
                ${mediaKindForItem(img) === 'video' ? `<video src="${escapeHtml(img.url)}" muted preload="metadata" playsinline disablepictureinpicture controlslist="nodownload noplaybackrate noremoteplayback"></video>` : `<img src="${escapeHtml(img.url)}" alt="">`}
                <span>${escapeHtml(img.alias)}</span>
            </button>
        `).join('')}</div>` : `<div class="mention-empty">${escapeHtml(tr('smart.mentionEmpty'))}</div>`;
    const folderChips = (mentionSource === 'asset' && assetCats.length)
        ? assetCats.map(cat => {
            const label = cat.name || tr('smart.assetFolder');
            return `<button class="mention-folder-chip ${cat.id === mentionAssetCategoryId ? 'active' : ''}" type="button" data-mention-folder="${escapeHtml(cat.id)}" title="${escapeHtml(label)}">${escapeHtml(label)}</button>`;
          }).join('')
        : '';
    mentionPicker.innerHTML = `
        <div class="mention-picker-shell">
            <div class="mention-source-tabs">
                <button class="mention-source-tab ${mentionSource === 'input' ? 'active' : ''}" type="button" data-mention-source="input" title="${escapeHtml(tr('smart.mentionInput'))}" ${hasInput ? '' : 'disabled'}>
                    <i data-lucide="image"></i><span>${escapeHtml(tr('smart.mentionInput'))}</span>
                </button>
                <button class="mention-source-tab ${mentionSource === 'asset' ? 'active' : ''}" type="button" data-mention-source="asset" title="${escapeHtml(tr('smart.mentionAssets'))}" ${hasAssets ? '' : 'disabled'}>
                    <i data-lucide="library"></i><span>${escapeHtml(tr('smart.mentionAssets'))}</span>
                </button>
            </div>
            <div class="mention-folder-chips ${folderChips ? '' : 'hidden'}">
                ${folderChips}
            </div>
            <div class="mention-content">
                ${body}
            </div>
        </div>
    `;
    mentionPicker._items = candidates;
    positionMentionPickerAtCaret();
    mentionPicker.classList.add('open');
    mentionPicker.querySelectorAll('[data-mention-source]').forEach(btn => {
        btn.addEventListener('mousedown', e => {
            e.preventDefault(); e.stopPropagation();
            if(btn.disabled) return;
            renderMentionPicker(btn.dataset.mentionSource);
        });
    });
    mentionPicker.querySelectorAll('[data-mention-folder]').forEach(btn => {
        btn.addEventListener('mousedown', e => {
            e.preventDefault(); e.stopPropagation();
            mentionAssetCategoryId = btn.dataset.mentionFolder || '';
            renderMentionPicker('asset');
        });
    });
    mentionPicker.querySelectorAll('[data-mention-index]').forEach(btn => {
        btn.addEventListener('mousedown', e => {
            e.preventDefault(); e.stopPropagation();
            insertMentionToken(mentionPicker._items[Number(btn.dataset.mentionIndex)]);
        });
    });
    refreshIcons();
}
function showMentionPicker(){
    const node = selectedNode();
    const hasInput = inputMentionCandidateImages(node).length > 0;
    mentionSource = hasInput ? 'input' : 'asset';
    renderMentionPicker(mentionSource);
}
function positionMentionPickerAtCaret(){
    const row = promptInput.closest('.prompt-row');
    const rowRect = row.getBoundingClientRect();
    let caretRect = null;
    const sel = window.getSelection();
    if(sel && sel.rangeCount){
        const range = sel.getRangeAt(0).cloneRange();
        caretRect = range.getClientRects()[0] || range.getBoundingClientRect();
    }
    const inputRect = promptInput.getBoundingClientRect();
    // composer 在 world 里被 viewport.scale 缩放过，getBoundingClientRect 返回的是缩放后的屏幕像素，
    // 而 style.left/top 是逻辑像素 → 需要除以 scale 才能正确还原 caret 的逻辑坐标
    const scale = (typeof viewport !== 'undefined' && Number(viewport?.scale)) || 1;
    const safeScale = scale > 0 ? scale : 1;
    const rowLogicalWidth = rowRect.width / safeScale;
    const pickerWidth = mentionPicker.offsetWidth || 340;
    const maxLeft = Math.max(4, rowLogicalWidth - pickerWidth - 4);
    const rawLeft = ((caretRect?.left || inputRect.left) - rowRect.left) / safeScale - 6;
    const rawTop = ((caretRect?.bottom || inputRect.top + 24) - rowRect.top) / safeScale + 2;
    const left = Math.max(4, Math.min(rawLeft, maxLeft));
    const top = Math.max(2, rawTop);
    mentionPicker.style.left = `${left}px`;
    mentionPicker.style.top = `${top}px`;
}
function maybeOpenMentionPicker(){
    saveMentionRange();
    const before = textBeforeCaret();
    if(/@$/.test(before)) showMentionPicker();
    else closeMentionPicker();
}
function insertMentionToken(img){
    if(!img?.url) return;
    promptInput.focus();
    const sel = window.getSelection();
    if(mentionRange){
        sel.removeAllRanges();
        sel.addRange(mentionRange);
    }
    const range = sel.rangeCount ? sel.getRangeAt(0) : document.createRange();
    let removedAt = false;
    if(range.startContainer?.nodeType === Node.TEXT_NODE && range.startOffset > 0){
        const text = range.startContainer.textContent || '';
        if(text[range.startOffset - 1] === '@'){
            range.setStart(range.startContainer, range.startOffset - 1);
            range.deleteContents();
            removedAt = true;
        }
    }
    if(!removedAt) {
        const walker = document.createTreeWalker(promptInput, NodeFilter.SHOW_TEXT);
        let lastText = null;
        while(walker.nextNode()) lastText = walker.currentNode;
        if(lastText && /@$/.test(lastText.textContent || '')) {
            lastText.textContent = lastText.textContent.slice(0, -1);
            range.selectNodeContents(promptInput);
            range.collapse(false);
        }
    }
    const token = document.createElement('span');
    token.className = 'mention-image-token';
    token.contentEditable = 'false';
    token.dataset.url = img.url;
    token.dataset.name = img.alias || img.name || '图片';
    token.dataset.kind = mediaKindForItem(img);
    token.dataset.nodeId = img.nodeId || '';
    token.dataset.imageIndex = String(img.imageIndex ?? '');
    token.innerHTML = token.dataset.kind === 'video'
        ? `<video src="${escapeHtml(img.url)}" muted preload="metadata" playsinline disablepictureinpicture controlslist="nodownload noplaybackrate noremoteplayback"></video><span>${escapeHtml(token.dataset.name)}</span>`
        : `<img src="${escapeHtml(img.url)}" alt=""><span>${escapeHtml(token.dataset.name)}</span>`;
    range.insertNode(token);
    const spacer = document.createTextNode(' ');
    token.after(spacer);
    range.setStartAfter(spacer);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    closeMentionPicker();
    promptInput.focus();
    renderInputThumbsRow(selectedNode());
}
function collectPromptParts(){
    const parts = [];
    const walk = node => {
        if(node.nodeType === Node.TEXT_NODE){
            if(node.textContent) parts.push({type:'text', text:node.textContent});
            return;
        }
        if(node.nodeType !== Node.ELEMENT_NODE) return;
        if(node.classList?.contains('mention-image-token')){
            parts.push({type:'image', url:node.dataset.url || '', name:node.dataset.name || '图片', nodeId:node.dataset.nodeId || '', imageIndex:Number(node.dataset.imageIndex || 0)});
            return;
        }
        if(node.tagName === 'BR') parts.push({type:'text', text:'\n'});
        node.childNodes.forEach(walk);
        if(node !== promptInput && ['DIV','P'].includes(node.tagName)) parts.push({type:'text', text:'\n'});
    };
    promptInput.childNodes.forEach(walk);
    return parts;
}
function originalPromptTextFromParts(parts){
    let text = '';
    (parts || []).forEach(part => {
        if(part.type === 'text'){
            text += part.text || '';
            return;
        }
        if(part.type === 'image') text += `@${part.name || '图片'}`;
    });
    return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function buildPromptRequest(node, overrideDefaultImages=null, consumeDefault=false, ctx=smartLoopContext){
    const parts = collectPromptParts();
    const originalPrompt = originalPromptTextFromParts(parts);
    const blockedRefs = blockedInputRefKeys(node);
    const hasOverrideImages = Array.isArray(overrideDefaultImages);
    const filteredDefaultImages = (hasOverrideImages ? overrideDefaultImages : defaultReferenceImagesFor(node, consumeDefault, ctx))
        .filter(img => !blockedRefs.has(inputRefKey(img)));
    const defaultRefs = uniqueReferenceImages(
        hasOverrideImages && overrideDefaultImages.length && !filteredDefaultImages.length
            ? selfReferenceImagesForNode(node, consumeDefault, ctx)
            : filteredDefaultImages
    );
    const refs = defaultRefs.map((img, index) => ({...img, role:`image_${index + 1}`}));
    let hasMentionToken = false;
    const refMap = new Map();
    refs.forEach((img, index) => refMap.set(img.url, index + 1));
    let body = '';
    parts.forEach(part => {
        if(part.type === 'text'){
            body += part.text;
            return;
        }
        if(!part.url) return;
        hasMentionToken = true;
        const mentionedKey = inputRefKey(part);
        if(blockedRefs.has(mentionedKey)){
            body += `@${part.name || '图片'}`;
            return;
        }
        if(!refMap.has(part.url)){
            refMap.set(part.url, refs.length + 1);
            refs.push({url:part.url, name:part.name || `图${refs.length + 1}`, nodeId:part.nodeId, imageIndex:part.imageIndex, role:`image_${refs.length + 1}`});
        }
        body += `图${refMap.get(part.url)}`;
    });
    body = body.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    const inputPrompt = inputPromptTextFor(node, ctx).trim();
    if(promptInputNodesFor(node).length) body = inputPrompt;
    const displayPrompt = originalPrompt || body;
    if(hasMentionToken && refs.length){
        const mapText = refs.map((img, i) => `图${i + 1}：${img.name || `图片${i + 1}`}`).join('\n');
        return {
            prompt:`${tr('smart.refMapHeader')}\n${mapText}\n\n${tr('smart.refUserNeed')}\n${body}`,
            displayPrompt,
            refs:refs.map((img, index) => ({url:img.url, name:img.name || `图${index + 1}`, role:`image_${index + 1}`})),
            mentioned:true
        };
    }
    return {
        prompt:body,
        displayPrompt,
        refs:refs.map((img, index) => ({url:img.url, name:img.name || `图${index + 1}`, role:`image_${index + 1}`})),
        mentioned:false
    };
}
function outgoingInputConnectionsFor(node){
    if(!node) return [];
    return (canvas?.connections || []).filter(conn => conn.from === node.id && (conn.kind || 'flow') === 'input');
}
function nextOutputPositionForSource(sourceNode, pendingBox){
    const sourceRect = nodeRect(sourceNode);
    const x = (sourceRect.x || 0) + sourceRect.width + 80;
    const gap = 28;
    const outputs = outgoingInputConnectionsFor(sourceNode)
        .map(conn => nodes.find(n => n.id === conn.to))
        .filter(n => n?.type === 'smart-image')
        .map(n => nodeRect(n))
        .filter(rect => Math.abs((rect.x || 0) - x) < Math.max(320, (pendingBox?.w || 260) + 120))
        .sort((a, b) => (a.y || 0) - (b.y || 0));
    if(!outputs.length) return {x, y:sourceRect.y || 0};
    let y = sourceRect.y || 0;
    for(const rect of outputs){
        const bottom = (rect.y || 0) + (rect.height || 0) + gap;
        if(y < bottom) y = bottom;
    }
    return {x, y};
}
function createPendingOutputFromSource(sourceNode, expectedCount, meta){
    const pendingBox = pendingBoxSize(expectedCount);
    const pos = nextOutputPositionForSource(sourceNode, pendingBox);
    const output = {
        id:uid('smart'),
        type:'smart-image',
        x:pos.x,
        y:pos.y,
        title:'Image',
        images:[],
        pending:Math.max(1, Number(expectedCount) || 1),
        runStartedAt:nowMs(),
        runTimerHidden:false,
        w:pendingBox.w,
        h:pendingBox.h,
        scale:MEDIA_NODE_DEFAULT_SCALE,
        created_at:Date.now()
    };
    output._selectAfterRunId = sourceNode.id;
    nodes.push(output);
    connectInputNode(sourceNode.id, output.id);
    attachRunMeta(output, meta);
    selectedId = sourceNode.id;
    selectedImage = {nodeId:'', index:-1};
    return output;
}
function extractCurrentImagesToSource(node, meta=null){
    const imgs = (node.images || []).slice();
    if(!imgs.length) return null;
    const r = nodeRect(node);
    const newX = (node.x || 0) - Math.max(280, r.width + 60);
    const source = {
        id: uid('smart'),
        type: 'smart-image',
        x: newX,
        y: node.y || 0,
        title: imgs.length > 1 ? 'Group' : 'Image',
        // 抽出到上游源节点的图片只保留"原始素材"语义：清空 runPrompt / runSettings /
        // sourceNodeId / runAt / promptDraftHtml / promptDraftText 等"生成"相关字段，
        // 避免上游图片继承下游输出的提示词信息
        images: imgs.map(img => stripImageGenerationMeta({...img})),
        created_at: Date.now()
    };
    if(Number.isFinite(Number(node.w))) source.w = node.w;
    if(Number.isFinite(Number(node.h))) source.h = node.h;
    if(Number.isFinite(Number(node.scale))) source.scale = node.scale;
    nodes.push(source);
    connectInputNode(source.id, node.id);
    node.images = [];
    delete node.w;
    delete node.h;
    return source;
}
function finalizePendingNode(pendingNode, urls, meta, kind='image'){
    if(!pendingNode) return;
    const ext = kind === 'video' ? 'mp4' : 'png';
    const imgs = urls.map((url, i) => ({url, name:`output-${i + 1}.${ext}`, kind, generatedResult:true}));
    pendingNode.images = imgs;
    pendingNode.pending = 0;
    pendingNode.runFinishedAt = nowMs();
    if(!pendingNode.runStartedAt) pendingNode.runStartedAt = meta?.createdAt || pendingNode.runFinishedAt;
    pendingNode.runElapsedMs = Math.max(0, pendingNode.runFinishedAt - Number(pendingNode.runStartedAt || pendingNode.runFinishedAt));
    pendingNode.runTimerHidden = false;
    pendingNode.outputKind = kind;
    if(imgs.length > 1) pendingNode.title = kind === 'video' ? 'Videos' : 'Group';
    else pendingNode.title = kind === 'video' ? 'Video' : 'Image';
    pendingNode.scale = mediaNodeDefaultScale(pendingNode);
    delete pendingNode.w;
    delete pendingNode.h;
    const metaTarget = pendingNode._runMetaTargetId ? nodes.find(n => n.id === pendingNode._runMetaTargetId) : pendingNode;
    if(metaTarget) attachRunMeta(metaTarget, meta);
    pendingNode.images = (pendingNode.images || []).map(img => stripImageGenerationMeta(img));
    selectedId = pendingNode._selectAfterRunId || pendingNode.id;
    delete pendingNode._runMetaTargetId;
    delete pendingNode._selectAfterRunId;
    if(activeComposerSubject?.id && selectedId === activeComposerSubject.id) lastComposerNodeId = `${selectedId}:node`;
    selectedImage = {nodeId:'', index:-1};
}
function restoreFromExtraction(node, extracted){
    if(!node || !extracted) return;
    node.images = extracted.images.slice();
    if(Number.isFinite(Number(extracted.w))) node.w = extracted.w;
    if(Number.isFinite(Number(extracted.h))) node.h = extracted.h;
    nodes = nodes.filter(n => n.id !== extracted.id);
    canvas.connections = (canvas.connections || []).filter(c => !(c.from === extracted.id && c.to === node.id));
    if(Array.isArray(node.inputNodeIds)){
        node.inputNodeIds = node.inputNodeIds.filter(id => id !== extracted.id);
    }
}
function restoreSourceVisualState(node, state){
    if(!node || !state) return;
    node.images = (state.images || []).map(img => ({...img}));
    node.title = state.title || (node.images.length > 1 ? 'Group' : 'Image');
    ['w','h','scale','outputKind'].forEach(key => {
        if(state[key] === undefined) delete node[key];
        else node[key] = state[key];
    });
}
function directImageInputsFor(node){
    return inputNodesFor(node)
        .filter(n => n?.type === 'smart-image' && (n.images || []).some(img => img?.url))
        .sort((a, b) => {
            const ax = Number(a.x) || 0, bx = Number(b.x) || 0;
            if(ax !== bx) return bx - ax;
            return (Number(a.y) || 0) - (Number(b.y) || 0);
        });
}
function primaryImageInputFor(node){
    const direct = directImageInputsFor(node)[0];
    if(direct) return direct;
    const loop = inputNodesFor(node).find(n => n?.type === 'smart-loop');
    if(loop?.imageInput){
        const upstream = inputNodesFor(loop).find(n => n?.type === 'smart-image' && (n.images || []).some(img => img?.url));
        if(upstream) return upstream;
    }
    return null;
}
function hasDownstreamImageNode(node){
    return outgoingInputConnectionsFor(node).some(conn => {
        const to = nodes.find(n => n.id === conn.to);
        return to?.type === 'smart-image';
    });
}
function smartImageChainTo(nodeId){
    const tail = nodes.find(n => n.id === nodeId);
    if(!tail || tail.type !== 'smart-image') return [];
    const chain = [];
    const seen = new Set();
    let cur = tail;
    while(cur && !seen.has(cur.id)){
        seen.add(cur.id);
        chain.unshift(cur);
        cur = primaryImageInputFor(cur);
    }
    return chain;
}
function upstreamNodesForId(nodeId){
    const result = [];
    const seen = new Set([nodeId]);
    const walk = id => {
        inputNodesFor(nodes.find(n => n.id === id)).forEach(input => {
            if(seen.has(input.id)) return;
            seen.add(input.id);
            walk(input.id);
            result.push(input);
        });
    };
    walk(nodeId);
    return result;
}
function resolveSmartCascadeLoop(nodeId){
    const loops = upstreamNodesForId(nodeId).filter(n => n.type === 'smart-loop');
    if(!loops.length) return null;
    const loop = loops[loops.length - 1];
    return {node:loop, count:smartLoopCount(loop), mode:loop.mode === 'parallel' ? 'parallel' : 'serial'};
}
function downstreamNodesForId(nodeId){
    const result = [];
    const seen = new Set([nodeId]);
    const walk = id => {
        (canvas?.connections || [])
            .filter(conn => conn.from === id && ['input','flow'].includes(conn.kind || 'flow'))
            .map(conn => nodes.find(n => n.id === conn.to))
            .filter(Boolean)
            .forEach(next => {
                if(seen.has(next.id)) return;
                seen.add(next.id);
                result.push(next);
                walk(next.id);
            });
    };
    walk(nodeId);
    return result;
}
function cascadeTailForLoop(loopId){
    const candidates = downstreamNodesForId(loopId)
        .filter(n => n.type === 'smart-image')
        .filter(n => canRunSmartCascade(n));
    if(!candidates.length) return null;
    return candidates.sort((a, b) => {
        const ax = Number(a.x) || 0, bx = Number(b.x) || 0;
        if(ax !== bx) return bx - ax;
        return (Number(b.y) || 0) - (Number(a.y) || 0);
    })[0];
}
function canRunSmartCascade(node){
    return node?.type === 'smart-image' && !hasDownstreamImageNode(node) && smartImageChainTo(node.id).length > 1;
}
function coolRunButton(ms=2000){
    if(!runBtn) return 0;
    const token = ++runBtnCooldownToken;
    runBtn.disabled = true;
    setTimeout(() => {
        if(token === runBtnCooldownToken && !smartCascadeRunning) runBtn.disabled = false;
    }, ms);
    return token;
}
function coolNodeRunningState(node, ms=2000){
    if(!node) return 0;
    const token = ++smartRunStateToken;
    smartNodeRunTokens.set(node.id, token);
    node.running = true;
    setTimeout(() => {
        if(smartNodeRunTokens.get(node.id) !== token) return;
        smartNodeRunTokens.delete(node.id);
        const current = nodes.find(n => n.id === node.id);
        if(current){
            current.running = false;
            render();
        }
    }, ms);
    return token;
}
function clearNodeRunningState(node){
    if(!node) return;
    smartNodeRunTokens.delete(node.id);
    node.running = false;
}
function pushRightSideNodes(sourceNode, delta){
    const shift = Math.ceil(Number(delta) || 0);
    if(!sourceNode || shift <= 0) return;
    const sourceRight = (Number(sourceNode.x) || 0) + nodeRect(sourceNode).width - shift;
    const downstreamIds = new Set(downstreamNodesForId(sourceNode.id).map(n => n.id));
    nodes.forEach(n => {
        if(!n || n.id === sourceNode.id) return;
        const r = nodeRect(n);
        const shouldShift = downstreamIds.has(n.id) || (Number(r.x) > sourceRight && Math.abs((Number(r.y) || 0) - (Number(sourceNode.y) || 0)) < 520);
        if(shouldShift) n.x = (Number(n.x) || 0) + shift;
    });
}
function appendOutputsToNode(node, additions, kind='image'){
    if(!node || !additions?.length) return [];
    const beforeRight = (Number(node.x) || 0) + nodeRect(node).width;
    const existing = (node.images || []).filter(img => img?.url).map(img => stripImageGenerationMeta(img));
    const next = additions.map(img => stripImageGenerationMeta({...img}));
    node.images = [...existing, ...next];
    node.pending = 0;
    node.running = false;
    node.runFinishedAt = nowMs();
    if(!node.runStartedAt) node.runStartedAt = node.runFinishedAt;
    node.runElapsedMs = Math.max(0, node.runFinishedAt - Number(node.runStartedAt || node.runFinishedAt));
    node.runTimerHidden = false;
    node.outputKind = kind;
    node.title = node.images.length > 1 ? (kind === 'video' ? 'Videos' : 'Group') : (kind === 'video' ? 'Video' : 'Image');
    delete node.w;
    delete node.h;
    const afterRight = (Number(node.x) || 0) + nodeRect(node).width;
    pushRightSideNodes(node, afterRight - beforeRight + 36);
    return next;
}
function syncCascadeRunButton(node=selectedNode()){
    if(!cascadeRunBtn) return;
    cascadeRunBtn.style.display = 'none';
    cascadeRunBtn.disabled = smartCascadeRunning || Boolean(node?.running);
}
function loadNodePromptDraftToInput(node){
    if(node?.promptDraftHtml) {
        const hasToken = String(node.promptDraftHtml || '').includes('mention-image-token');
        promptInput.innerHTML = hasToken
            ? node.promptDraftHtml
            : (promptHtmlWithMentionTokens(node.runPrompt || node.promptDraftText || '', node.runPromptRefs || []) || node.promptDraftHtml);
    } else {
        const rebuilt = promptHtmlWithMentionTokens(node?.runPrompt || '', node?.runPromptRefs || []);
        if(rebuilt) promptInput.innerHTML = rebuilt;
        else setPromptText(node?.runPrompt || '');
    }
}
function buildPromptRequestForNode(node, defaultImages, ctx=smartLoopContext){
    const oldHtml = promptInput.innerHTML;
    loadNodePromptDraftToInput(node);
    try {
        return buildPromptRequest(node, defaultImages, false, ctx);
    } finally {
        promptInput.innerHTML = oldHtml;
    }
}
async function generateUrlsForCurrentSettings(node, prompt, refs){
    if(settings.engine === 'comfy'){
        const allRefs = refs || [];
        const imageRefs = imageRefsOnly(allRefs);
        const mode = settings.comfyMode || 'text';
        if(mode === 'text'){
            const data = await fetch('/api/generate', {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({prompt, width:Number(settings.width || 1024), height:Number(settings.height || 1024), workflow_json:'Z-Image.json', type:'zimage'})
            }).then(async r => { if(!r.ok) throw new Error(await r.text()); return r.json(); });
            return {urls:data.outputs || data.images || [], kind:'image'};
        }
        if(mode === 'enhance'){
            if(!imageRefs.length) throw new Error(tr('smart.errEnhanceNeedRefs'));
            const inputName = await comfyNameForRef(imageRefs[0]);
            const data = await fetch('/api/generate', {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({workflow_json:'Z-Image-Enhance.json', type:'enhance', params:{"15":{image:inputName},"204":{value:Number(settings.enhanceStrength ?? 0.5)}}})
            }).then(async r => { if(!r.ok) throw new Error(await r.text()); return r.json(); });
            return {urls:data.outputs || data.images || [], kind:'image'};
        }
        if(mode === 'edit'){
            if(!imageRefs.length) throw new Error(tr('smart.errEditNeedRefs'));
            const names = [];
            for(const ref of imageRefs.slice(0, 3)) names.push(await comfyNameForRef(ref));
            const data = await fetch('/api/generate', {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({prompt, workflow_json:'Flux2-Klein.json', type:'klein', params:{"168":{text:prompt},"158":{noise_seed:Math.floor(Math.random()*1000000)},"278":{image:names[0] || ""},"270":{image:names[1] || ""},"292":{image:names[2] || ""},"313":{value:Boolean(names[1])},"314":{value:Boolean(names[2])}}})
            }).then(async r => { if(!r.ok) throw new Error(await r.text()); return r.json(); });
            return {urls:data.outputs || data.images || [], kind:'image'};
        }
        const workflowName = settings.comfyWorkflow || comfyWorkflows[0]?.name || '';
        if(!workflowName) throw new Error(tr('smart.errNeedWorkflow'));
        const wf = await fetch(`/api/workflows/${encodeURIComponent(workflowName)}`).then(async r => {
            if(!r.ok) throw new Error(await r.text());
            return r.json();
        });
        const fields = wf.config?.fields || [];
        const values = {};
        fields.filter(f => comfyFieldKind(f) === 'prompt').forEach((field, index) => {
            values[field.id] = index === 0 ? prompt : (field.default ?? '');
        });
        const assignMediaFields = async (mediaFields, mediaRefs) => {
            for(let i = 0; i < mediaFields.length && i < mediaRefs.length; i++){
                values[mediaFields[i].id] = await comfyNameForRef(mediaRefs[i]);
            }
        };
        await assignMediaFields(fields.filter(f => comfyFieldKind(f) === 'image'), imageRefs);
        await assignMediaFields(fields.filter(f => comfyFieldKind(f) === 'video'), videoRefsOnly(allRefs));
        await assignMediaFields(fields.filter(f => comfyFieldKind(f) === 'audio'), audioRefsOnly(allRefs));
        fields.filter(f => comfyFieldKind(f) === 'setting').forEach(field => {
            if(comfyRandomEnabledField(field) && smartComfyRandomActive(field.id)){
                values[field.id] = smartComfyRandomValue(field);
            } else {
                values[field.id] = settings.comfyParams?.[field.id] ?? field.default;
            }
        });
        const result = await fetch(`/api/workflows/${encodeURIComponent(workflowName)}/run`, {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({config:wf.config || {fields:[]}, fields:values})
        }).then(async r => { if(!r.ok) throw new Error(await r.text()); return r.json(); });
        const urls = (result.images || []).map(img => typeof img === 'string' ? img : (img.url || img.path || '')).filter(Boolean);
        return {urls, kind:'image'};
    }
    if(settings.engine === 'api' && settings.apiKind === 'video'){
        return {urls:await runApiVideoGeneration(prompt, refs), kind:'video'};
    }
    const urls = settings.engine === 'runninghub'
        ? await runRunningHubGeneration(prompt, refs)
        : settings.engine === 'modelscope'
            ? await runModelscopeGeneration(prompt, refs)
            : await runApiGeneration(prompt, refs);
    return {urls, kind:'image'};
}
async function runCascadeStepIntoNode(sourceNode, targetNode, inputRefs, ctx=smartLoopContext){
    const outputNode = targetNode || sourceNode;
    if(!sourceNode || !targetNode || !outputNode) return [];
    const previousSettings = cloneSmartSettings(settings);
    settings = {...settings, ...cloneSmartSettings(smartSettingsForNode(targetNode) || {})};
    const outpaintSize = validOutpaintSize(targetNode);
    const request = buildPromptRequestForNode(targetNode, inputRefs, ctx);
    const prompt = (request.prompt || '').trim();
    const displayPrompt = (request.displayPrompt || '').trim();
    if(!prompt || (!displayPrompt && !(settings.engine === 'comfy' && settings.comfyMode === 'enhance'))){
        settings = previousSettings;
        throw new Error('链路节点缺少提示词');
    }
    const meta = {
        prompt,
        displayPrompt:request.displayPrompt || '',
        promptRefs:(request.refs || []).map(ref => ({url:ref.url || '', name:ref.name || '', nodeId:ref.nodeId || '', imageIndex:ref.imageIndex ?? ''})).filter(ref => ref.url),
        sourceNodeId:sourceNode.id,
        settings:JSON.parse(JSON.stringify(settings)),
        createdAt:Date.now()
    };
    if(targetNode.promptDraftHtml != null){
        meta.promptHtml = targetNode.promptDraftHtml;
        meta.promptText = targetNode.promptDraftText || request.displayPrompt || '';
    }
    const logKind = settings.engine === 'api' && settings.apiKind === 'video' ? 'video' : 'image';
    const runLog = smartRunSnapshot(targetNode, prompt, request.refs || [], logKind);
    const runLogStart = nowMs();
    outputNode.running = true;
    outputNode.runStartedAt = nowMs();
    delete outputNode.runFinishedAt;
    delete outputNode.runElapsedMs;
    outputNode.runTimerHidden = false;
    attachRunMeta(targetNode, meta);
    rememberRecentSmartSettings(settings, targetNode);
    render();
    try {
        const result = await generateUrlsForCurrentSettings(outputNode, prompt, request.refs || []);
        if(!result.urls?.length) throw new Error(result.kind === 'video' ? tr('smart.errNoOutVideos') : tr('smart.errNoOutImages'));
        if(outpaintSize) delete targetNode.outpaintSize;
        addSmartGenerationLog({run:{...runLog, kind:result.kind || logKind}, outputs:result.urls, runMs:nowMs() - runLogStart});
        const ext = result.kind === 'video' ? 'mp4' : 'png';
        const additions = result.urls.map((url, i) => stripImageGenerationMeta({url, name:`output-${i + 1}.${ext}`, kind:result.kind, generatedResult:true}));
        appendOutputsToNode(outputNode, additions, result.kind);
        settings = previousSettings;
        render();
        return additions;
    } catch(e) {
        outputNode.running = false;
        addSmartGenerationLog({run:runLog, outputs:[], runMs:nowMs() - runLogStart, error:e.message || String(e)});
        settings = previousSettings;
        render();
        throw e;
    }
}
function appendCascadeRefsToReceiver(node, refs){
    if(!node || !refs?.length) return [];
    const additions = refs
        .filter(ref => ref?.url)
        .map((ref, i) => stripImageGenerationMeta({
            url:ref.url,
            name:ref.name || `output-${i + 1}.png`,
            kind:ref.kind || (isVideoMediaItem(ref) ? 'video' : 'image')
        }));
    if(!additions.length) return [];
    node.images = [...(node.images || []).filter(img => img?.url).map(img => stripImageGenerationMeta(img)), ...additions];
    delete node.w;
    delete node.h;
    node.title = node.images.length > 1 ? 'Group' : 'Image';
    render();
    return additions;
}
async function runSmartCascade(targetNode=null){
    const tail = targetNode || selectedNode();
    if(!canRunSmartCascade(tail)){ toast('请选择链路结尾图片节点'); return; }
    if(smartCascadeRunning) return;
    savePromptDraftForCurrent();
    const chain = smartImageChainTo(tail.id);
    if(chain.length < 2){ toast(tr('smart.loopNoChain')); return; }
    const originalSelected = selectedId;
    const originalSettings = cloneSmartSettings(settings);
    const originalPromptHtml = promptInput.innerHTML;
    smartCascadeRunning = true;
    runBtn.disabled = true;
    cascadeRunBtn.disabled = true;
    pushUndo();
    const loop = resolveSmartCascadeLoop(tail.id);
    const totalRounds = loop?.count || 1;
    const startIndex = Math.max(1, Number(loop?.node?.loopStart) || 1);
    const batchSize = loop?.node?.imageInput ? Math.max(1, Math.min(100, Number(loop.node.imageBatchSize) || 1)) : 1;
    const endIndex = startIndex + (totalRounds - 1) * batchSize;
    try {
        const runRound = async (loopIndex=startIndex) => {
            const ctx = loop ? {index:loopIndex, total:endIndex, nodeId:loop.node.id} : null;
            smartLoopContext = ctx;
            let refs = outputImagesForNode(chain[0], true, ctx).filter(img => img?.url);
            for(let i = 1; i < chain.length; i++){
                const source = chain[i - 1];
                const target = chain[i];
                let outputs = [];
                try {
                    outputs = await runCascadeStepIntoNode(source, target, refs, ctx);
                } catch(err) {
                    if(/缺少提示词|需要输入文本|need prompt/i.test(err.message || '') && refs.length){
                        outputs = appendCascadeRefsToReceiver(target, refs);
                    } else {
                        throw err;
                    }
                }
                refs = outputs.map((img, index) => ({
                    url:img.url,
                    name:img.name || `图${index + 1}`,
                    kind:img.kind || 'image',
                    role:`image_${index + 1}`,
                    nodeId:target.id,
                    imageIndex:(target.images || []).length - outputs.length + index
                }));
            }
        };
        for(let round = 0; round < totalRounds; round++) await runRound(startIndex + round * batchSize);
        smartLoopContext = null;
        selectedId = '';
        selectedIds = [];
        selectedImage = {nodeId:'', index:-1};
        activeComposerSubject = null;
        lastComposerNodeId = '';
        composer.classList.remove('open');
        settings = originalSettings;
        promptInput.innerHTML = originalPromptHtml;
        scheduleSave();
        toast(totalRounds > 1 ? trf('smart.loopRunRoundsDone', {n:totalRounds}) : tr('smart.loopRunDone'));
    } catch(e) {
        smartLoopContext = null;
        selectedId = originalSelected;
        settings = originalSettings;
        promptInput.innerHTML = originalPromptHtml;
        toast((e.message || tr('smart.errRunFailed')).slice(0, 160));
    } finally {
        smartCascadeRunning = false;
        runBtn.disabled = false;
        cascadeRunBtn.disabled = false;
        scheduleSave();
        render();
    }
}
function runSmartCascadeFromLoop(loopId){
    const loop = nodes.find(n => n.id === loopId && n.type === 'smart-loop');
    if(!loop){ toast('没有找到循环节点'); return; }
    const tail = cascadeTailForLoop(loop.id);
    if(!tail){ toast('请把循环节点连接到下游图片链路'); return; }
    selectedId = tail.id;
    selectedImage = {nodeId:'', index:-1};
    runSmartCascade(tail);
}
async function runGeneration(){
    const node = selectedNode();
    const request = buildPromptRequest(node, null, true, smartLoopContext);
    const prompt = request.prompt.trim();
    if(!node) return;
    if(!prompt){ toast(tr('smart.toastNeedPrompt')); return; }
    const refs = request.refs;
    const previousSettings = cloneSmartSettings(settings);
    const runSettings = smartSettingsForNode(node);
    settings = {...settings, ...cloneSmartSettings(runSettings || {})};
    const outpaintSize = node?.outpaintSize && Number(node.outpaintSize.width) > 0 && Number(node.outpaintSize.height) > 0
        ? {width:Math.round(Number(node.outpaintSize.width)), height:Math.round(Number(node.outpaintSize.height))}
        : null;
    if(outpaintSize && settings.engine === 'api' && settings.apiKind !== 'video'){
        settings = {
            ...settings,
            resolution:'custom',
            ratio:'',
            customWidth:outpaintSize.width,
            customHeight:outpaintSize.height,
            customSize:`${outpaintSize.width}x${outpaintSize.height}`
        };
    }
    const meta = snapshotRunMeta(prompt, node.id, request.displayPrompt, refs);
    const logKind = settings.engine === 'api' && settings.apiKind === 'video' ? 'video' : 'image';
    const runLog = smartRunSnapshot(node, prompt, refs, logKind);
    rememberRecentSmartSettings(settings, node);
    const runLogStart = nowMs();
    const expectedCount = settings.engine === 'runninghub'
        ? 1
        : settings.engine === 'comfy'
        ? (settings.comfyMode === 'text' || settings.comfyMode === 'enhance' || settings.comfyMode === 'edit' || settings.comfyMode === 'custom' ? 1 : 1)
        : Math.max(1, Math.min(8, Number(settings.count || 1)));
    const apiConcurrentRun = settings.engine === 'api' || settings.engine === 'runninghub';
    const nodeHasImages = (node.images || []).some(img => img?.url);
    const sourceVisualState = nodeHasImages ? {
        images:(node.images || []).map(img => ({...img})),
        title:node.title,
        w:node.w,
        h:node.h,
        scale:node.scale,
        outputKind:node.outputKind
    } : null;
    pushUndo();
    let extracted = null;
    let branchNode = null;
    undoSuppressed = true;
    if(nodeHasImages) branchNode = createPendingOutputFromSource(node, expectedCount, meta);
    undoSuppressed = false;
    const pendingNode = branchNode || node;
    if(extracted) pendingNode._runMetaTargetId = extracted.id;
    if(!branchNode){
        pendingNode.pending = Math.max(1, Number(expectedCount) || 1);
        pendingNode.runStartedAt = nowMs();
        delete pendingNode.runFinishedAt;
        delete pendingNode.runElapsedMs;
        pendingNode.runTimerHidden = false;
        const pendingBox = pendingBoxSize(pendingNode.pending);
        pendingNode.w = pendingBox.w;
        pendingNode.h = pendingBox.h;
        attachRunMeta(pendingNode, meta);
    }
    if(apiConcurrentRun){
        coolNodeRunningState(pendingNode, 2000);
        coolRunButton(2000);
    } else {
        pendingNode.running = true;
        runBtn.disabled = true;
    }
    render();
    try {
        if(settings.engine === 'comfy'){
            await runComfyGeneration(pendingNode, prompt, refs, pendingNode, meta);
            if(sourceVisualState) restoreSourceVisualState(node, sourceVisualState);
            addSmartGenerationLog({run:runLog, outputs:(pendingNode.images || []).map(img => img.url).filter(Boolean), runMs:nowMs() - runLogStart});
            settings = previousSettings;
            return;
        }
        if(settings.engine === 'api' && settings.apiKind === 'video'){
            const outVideos = await runApiVideoGeneration(prompt, refs);
            if(!outVideos.length) throw new Error(tr('smart.errNoOutVideos'));
            finalizePendingNode(pendingNode, outVideos, meta, 'video');
            if(sourceVisualState) restoreSourceVisualState(node, sourceVisualState);
            addSmartGenerationLog({run:runLog, outputs:outVideos, runMs:nowMs() - runLogStart});
            clearPromptInput({preserveDraft:true});
            settings = previousSettings;
            scheduleSave();
            return;
        }
        const outImages = settings.engine === 'runninghub'
            ? await runRunningHubGeneration(prompt, refs)
            : settings.engine === 'modelscope'
                ? await runModelscopeGeneration(prompt, refs)
                : await runApiGeneration(prompt, refs);
        if(!outImages.length) throw new Error(tr('smart.errNoOutImages'));
        if(outpaintSize) delete node.outpaintSize;
        finalizePendingNode(pendingNode, outImages, meta);
        if(sourceVisualState) restoreSourceVisualState(node, sourceVisualState);
        addSmartGenerationLog({run:runLog, outputs:outImages, runMs:nowMs() - runLogStart});
        clearPromptInput({preserveDraft:true});
        settings = previousSettings;
        scheduleSave();
    } catch(e) {
        settings = previousSettings;
        pendingNode.pending = 0;
        if(branchNode){
            nodes = nodes.filter(n => n.id !== branchNode.id);
            canvas.connections = (canvas.connections || []).filter(c => c.from !== branchNode.id && c.to !== branchNode.id);
            selectedId = node.id;
        } else {
            pendingNode.pending = 0;
            pendingNode.running = false;
            if(!(pendingNode.images || []).length){
                delete pendingNode.w;
                delete pendingNode.h;
            }
        }
        if(extracted) restoreFromExtraction(node, extracted);
        delete pendingNode._runMetaTargetId;
        addSmartGenerationLog({run:runLog, outputs:[], runMs:nowMs() - runLogStart, error:e.message || String(e)});
        toast((e.message || tr('smart.errRunFailed')).slice(0, 160));
    } finally {
        if(!apiConcurrentRun){
            clearNodeRunningState(pendingNode);
            runBtn.disabled = false;
        }
        render();
    }
}
async function runPromptLLMNode(nodeId){
    const node = nodes.find(n => n.id === nodeId);
    if(!node || node.type !== 'smart-prompt') return;
    const message = (node.llmInstruction || node.text || '').trim();
    if(!message){ toast(tr('smart.promptLlmNeedText')); return; }
    const systemPrompt = (node.llmSystemPrompt || '').trim();
    node.llmEnabled = true;
    node.running = true;
    render();
    try {
        const provider = resolveChatProviderId(node.llmProvider || '');
        const model = resolveChatModel(node.llmModel || '', provider);
        const images = imageRefsOnly(inputImagesFor(node)).map(img => img.url).filter(Boolean);
        const result = await fetch('/api/canvas-llm', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({
                message,
                messages:[],
                images,
                model,
                provider,
                ms_model: provider === 'modelscope' ? model : '',
                system_prompt:node.llmSystemEnabled ? (systemPrompt || 'You are a helpful prompt assistant.') : ''
            })
        }).then(async r => {
            if(!r.ok) throw new Error(await r.text());
            return r.json();
        });
        node.text = (result.text || '').trim();
        node.llmProvider = provider;
        node.llmModel = model;
        scheduleSave();
    } catch(e) {
        toast((e.message || tr('smart.promptLlmFailed')).slice(0, 160));
    } finally {
        node.running = false;
        render();
    }
}
function comfyFieldKind(field){
    if(['image','video','audio'].includes(field?.type)) return field.type;
    const key = `${field?.input || ''} ${field?.name || ''}`.toLowerCase();
    if(field?.type === 'textarea' || /prompt|text|提示词|正向|负向/.test(key)) return 'prompt';
    return 'setting';
}
async function runApiGeneration(prompt, refs){
    if(!settings.provider_id || !settings.model) throw new Error(tr('smart.errNoApiModel'));
    const count = Math.max(1, Math.min(8, Number(settings.count || 1)));
    const payload = {prompt, provider_id:settings.provider_id, model:settings.model, size:sizeForRun(), quality:settings.quality || 'auto', n:count, reference_images:imageRefsOnly(refs)};
    const task = await fetch('/api/canvas-image-tasks', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)}).then(async r => {
        if(!r.ok) throw new Error(await r.text());
        return r.json();
    });
    const result = await pollTask(task.task_id);
    return (result?.images || []).filter(Boolean);
}
async function runRunningHubGeneration(prompt, refs){
    const ref = selectedRunningHubRef();
    if(!ref) throw new Error(tr('smart.rhNeedConfig'));
    const fields = rhActiveFields();
    if(!fields.length) throw new Error(tr('smart.rhNeedFields'));
    smartRhRandomValues = {};
    const mode = ref.kind;
    const media = rhMediaForRun(prompt, refs);
    const nodeInfoList = await rhBuildNodeInfoList(media);
    const workflowExtras = mode === 'workflow' ? await rhBuildWorkflowRequestExtras(media, nodeInfoList) : {};
    const endpoint = mode === 'workflow' ? '/api/runninghub/workflow-submit' : '/api/runninghub/submit';
    const body = mode === 'workflow'
        ? {workflowId:ref.id, nodeInfoList, useWallet:settings.rhPayment === 'wallet', ...workflowExtras}
        : {webappId:ref.id, nodeInfoList, instanceType:settings.rhInstanceType || '', useWallet:settings.rhPayment === 'wallet'};
    const submit = await fetch(endpoint, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(body)
    }).then(async r => {
        const data = await r.json();
        if(!r.ok || data.success === false) throw new Error(data.detail || data.error || tr('smart.rhFailed'));
        return data.data || data;
    });
    const taskId = submit.taskId;
    if(!taskId) throw new Error(tr('smart.rhNoTaskId'));
    for(let i = 0; i < 720; i++){
        await sleep(2500);
        const data = await fetch(`/api/runninghub/query?taskId=${encodeURIComponent(taskId)}`).then(async r => {
            const json = await r.json();
            if(!r.ok || json.success === false) throw new Error(json.detail || json.error || tr('smart.rhFailed'));
            return json.data || json;
        });
        if(data.status === 'SUCCESS'){
            const urls = data.urls || [];
            if(!urls.length) throw new Error(tr('smart.rhOutputsEmpty'));
            return urls;
        }
        if(data.status === 'FAILED') throw new Error(data.failReason || tr('smart.rhFailed'));
    }
    throw new Error(tr('smart.rhTimeout'));
}
async function runApiVideoGeneration(prompt, refs){
    if(!settings.videoModel) throw new Error(tr('smart.errNoVideoModel'));
    const refImages = imageRefsOnly(refs).map((ref, i) => {
        const item = {url:ref.url, name:ref.name || `图${i + 1}`};
        if(settings.videoUseFrameRoles){
            if(i === 0) item.role = 'first_frame';
            else if(i === 1) item.role = 'last_frame';
        }
        return item;
    });
    const refVideos = videoRefsOnly(refs).map(ref => ref.url);
    const payload = {
        prompt,
        provider_id: settings.videoProvider || 'comfly',
        model: settings.videoModel || 'veo3-fast',
        duration: Math.max(1, Math.min(60, Number(settings.videoDuration) || 5)),
        aspect_ratio: settings.videoAspect || '16:9',
        resolution: settings.videoResolution || '',
        images: refImages,
        videos: refVideos,
        enhance_prompt: Boolean(settings.videoEnhancePrompt),
        enable_upsample: Boolean(settings.videoEnableUpsample),
        watermark: Boolean(settings.videoWatermark),
        camerafixed: Boolean(settings.videoCameraFixed),
        generate_audio: Boolean(settings.videoGenerateAudio)
    };
    const result = await fetch('/api/canvas-video', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payload)
    }).then(async r => { if(!r.ok) throw new Error(await r.text()); return r.json(); });
    return (result?.videos || []).filter(Boolean);
}
async function runModelscopeGeneration(prompt, refs){
    refs = imageRefsOnly(refs);
    const modelKey = settings.msgenModel || 'zimage';
    const msModel = MS_GEN_MODELS[modelKey] || MS_GEN_MODELS.zimage;
    if(msModel.supportsImage && !refs.length) throw new Error(tr('smart.errMsNeedRefs'));
    const size = apiImageSize(settings.msRatio || 'square', settings.msResolution || '1k', settings.msCustomRatio || '', settings.msCustomSize || '');
    const parsed = parseSizeValue(size);
    const width = Number(parsed?.width) || 1024;
    const height = Number(parsed?.height) || 1024;
    const imageUrls = [];
    if(msModel.supportsImage || msModel.acceptsImage){
        for(const ref of refs.slice(0, 3)){
            if(ref.url) imageUrls.push(await urlToBase64(ref.url).catch(() => ref.url));
        }
    }
    const count = Math.max(1, Math.min(8, Number(settings.count || 1)));
    const submit = async () => {
        let body;
        if(modelKey === 'zimage') body = {prompt, resolution:`${width}x${height}`};
        else if(modelKey === 'qwen_edit') body = {prompt, image_urls:imageUrls, resolution:`${width}x${height}`};
        else body = {prompt, model:modelKey === 'custom' ? (settings.msCustomModel || modelscopeImageModels()[0]) : msModel.modelId, image_urls:imageUrls, width, height, size:`${width}x${height}`};
        const data = await fetch(msModel.endpoint, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)}).then(async r => {
            if(!r.ok) throw new Error(await r.text());
            return r.json();
        });
        return data.url || data.images?.[0] || '';
    };
    const results = await Promise.all(Array.from({length:count}, submit));
    return results.filter(Boolean);
}
async function urlToBase64(url){
    const res = await fetch(url);
    if(!res.ok) throw new Error(tr('smart.errImageRead'));
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}
function sleep(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }
async function runComfyGeneration(node, prompt, refs, pendingNode, meta){
    const allRefs = refs || [];
    refs = imageRefsOnly(allRefs);
    const mode = settings.comfyMode || 'text';
    if(mode === 'text') return runComfyText(node, prompt, pendingNode, meta);
    if(mode === 'enhance') return runComfyEnhance(node, refs, pendingNode, meta);
    if(mode === 'edit') return runComfyEdit(node, prompt, refs, pendingNode, meta);
    const workflowName = settings.comfyWorkflow || comfyWorkflows[0]?.name || '';
    if(!workflowName) throw new Error(tr('smart.errNeedWorkflow'));
    const wf = await fetch(`/api/workflows/${encodeURIComponent(workflowName)}`).then(async r => {
        if(!r.ok) throw new Error(await r.text());
        return r.json();
    });
    const fields = wf.config?.fields || [];
    const values = {};
    fields.filter(f => comfyFieldKind(f) === 'prompt').forEach((field, index) => {
        values[field.id] = index === 0 ? prompt : (field.default ?? '');
    });
    const assignMediaFields = async (mediaFields, mediaRefs) => {
        for(let i = 0; i < mediaFields.length && i < mediaRefs.length; i++){
            values[mediaFields[i].id] = await comfyNameForRef(mediaRefs[i]);
        }
    };
    await assignMediaFields(fields.filter(f => comfyFieldKind(f) === 'image'), refs);
    await assignMediaFields(fields.filter(f => comfyFieldKind(f) === 'video'), videoRefsOnly(allRefs));
    await assignMediaFields(fields.filter(f => comfyFieldKind(f) === 'audio'), audioRefsOnly(allRefs));
    fields.filter(f => comfyFieldKind(f) === 'setting').forEach(field => {
        if(comfyRandomEnabledField(field) && smartComfyRandomActive(field.id)){
            values[field.id] = smartComfyRandomValue(field);
        } else {
            values[field.id] = settings.comfyParams?.[field.id] ?? field.default;
        }
    });
    const result = await fetch(`/api/workflows/${encodeURIComponent(workflowName)}/run`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({config:wf.config || {fields:[]}, fields:values})
    }).then(async r => {
        if(!r.ok) throw new Error(await r.text());
        return r.json();
    });
    const images = result.images || [];
    if(!images.length) throw new Error(tr('smart.errComfyNoImages'));
    const out = images.map((img, i) => ({url:typeof img === 'string' ? img : (img.url || img.path || ''), name:`comfy-${i + 1}.png`})).filter(x => x.url);
    if(!out.length) throw new Error(tr('smart.errComfyEmpty'));
    const urls = out.map(o => o.url);
    if(pendingNode){
        finalizePendingNode(pendingNode, urls, meta);
    } else {
        const created = createNode((node.x || 0) + nodeRect(node).width + 40, node.y || 0, out);
        attachRunMeta(created, meta);
        addConnection(node.id, created.id);
    }
    clearPromptInput({preserveDraft:true});
    scheduleSave();
}
async function runComfyText(node, prompt, pendingNode, meta){
    const data = await fetch('/api/generate', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({prompt, width:Number(settings.width || 1024), height:Number(settings.height || 1024), workflow_json:'Z-Image.json', type:'zimage'})
    }).then(async r => { if(!r.ok) throw new Error(await r.text()); return r.json(); });
    const out = data.outputs || data.images || [];
    if(!out.length) throw new Error(tr('smart.errComfyNoImages'));
    if(pendingNode){
        finalizePendingNode(pendingNode, out, meta);
    } else {
        const created = createNode((node.x || 0) + nodeRect(node).width + 40, node.y || 0, out.map((url, i) => ({url, name:`comfy-${i + 1}.png`})));
        attachRunMeta(created, meta);
        addConnection(node.id, created.id);
    }
    clearPromptInput({preserveDraft:true});
    scheduleSave();
}
async function runComfyEnhance(node, refs, pendingNode, meta){
    if(!refs.length) throw new Error(tr('smart.errEnhanceNeedRefs'));
    const inputName = await comfyNameForRef(refs[0]);
    const data = await fetch('/api/generate', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({workflow_json:'Z-Image-Enhance.json', type:'enhance', params:{"15":{image:inputName},"204":{value:Number(settings.enhanceStrength ?? 0.5)}}})
    }).then(async r => { if(!r.ok) throw new Error(await r.text()); return r.json(); });
    const out = data.outputs || data.images || [];
    if(!out.length) throw new Error(tr('smart.errComfyNoImages'));
    if(pendingNode){
        finalizePendingNode(pendingNode, out, meta);
    } else {
        const created = createNode((node.x || 0) + nodeRect(node).width + 40, node.y || 0, out.map((url, i) => ({url, name:`enhance-${i + 1}.png`})));
        attachRunMeta(created, meta);
        addConnection(node.id, created.id);
    }
    scheduleSave();
}
async function runComfyEdit(node, prompt, refs, pendingNode, meta){
    if(!refs.length) throw new Error(tr('smart.errEditNeedRefs'));
    const names = [];
    for(const ref of refs.slice(0, 3)) names.push(await comfyNameForRef(ref));
    const data = await fetch('/api/generate', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({prompt, workflow_json:'Flux2-Klein.json', type:'klein', params:{"168":{text:prompt},"158":{noise_seed:Math.floor(Math.random()*1000000)},"278":{image:names[0] || ""},"270":{image:names[1] || ""},"292":{image:names[2] || ""},"313":{value:Boolean(names[1])},"314":{value:Boolean(names[2])}}})
    }).then(async r => { if(!r.ok) throw new Error(await r.text()); return r.json(); });
    const out = data.outputs || data.images || [];
    if(!out.length) throw new Error(tr('smart.errComfyNoImages'));
    if(pendingNode){
        finalizePendingNode(pendingNode, out, meta);
    } else {
        const created = createNode((node.x || 0) + nodeRect(node).width + 40, node.y || 0, out.map((url, i) => ({url, name:`edit-${i + 1}.png`})));
        attachRunMeta(created, meta);
        addConnection(node.id, created.id);
    }
    clearPromptInput({preserveDraft:true});
    scheduleSave();
}
async function comfyNameForRef(ref){
    if(ref.comfy_name) return ref.comfy_name;
    const response = await fetch(ref.url);
    if(!response.ok) return ref.name || ref.url;
    const blob = await response.blob();
    const form = new FormData();
    form.append('files', blob, ref.name || 'smart-ref.png');
    const data = await fetch('/api/upload', {method:'POST', body:form}).then(async r => {
        if(!r.ok) throw new Error(await r.text());
        return r.json();
    });
    const name = data.files?.[0]?.comfy_name || ref.name || ref.url;
    const node = selectedNode();
    const image = node?.images?.find(img => img.url === ref.url);
    if(image) image.comfy_name = name;
    ref.comfy_name = name;
    return name;
}
async function pollTask(taskId){
    for(let i = 0; i < 900; i++){
        await new Promise(resolve => setTimeout(resolve, 2000));
        const task = await fetch(`/api/canvas-image-tasks/${encodeURIComponent(taskId)}`).then(r => r.json());
        if(task.status === 'succeeded') return task.result;
        if(task.status === 'failed') throw new Error(task.error || tr('smart.errRunFailed'));
    }
    throw new Error(tr('smart.errRunTimeout'));
}
function updateSelectionBox(event){
    if(!selectionState) return;
    const sx = selectionState.startScreen.x, sy = selectionState.startScreen.y;
    const x = Math.min(sx, event.clientX), y = Math.min(sy, event.clientY);
    selectionBox.style.display = 'block';
    selectionBox.style.left = `${x}px`;
    selectionBox.style.top = `${y}px`;
    selectionBox.style.width = `${Math.abs(event.clientX - sx)}px`;
    selectionBox.style.height = `${Math.abs(event.clientY - sy)}px`;
}
function finishSelection(event){
    if(!selectionState) return;
    const a = selectionState.startWorld;
    const b = screenToWorld(event);
    const minX = Math.min(a.x, b.x), minY = Math.min(a.y, b.y);
    const maxX = Math.max(a.x, b.x), maxY = Math.max(a.y, b.y);
    selectedIds = nodes.filter(node => {
        const r = nodeRect(node);
        return r.x < maxX && r.x + r.width > minX && r.y < maxY && r.y + r.height > minY;
    }).map(n => n.id);
    selectedId = selectedIds.length === 1 ? selectedIds[0] : '';
    selectedImage = {nodeId:'', index:-1};
    selectionState = null;
    selectionJustFinished = true;
    selectionBox.style.display = 'none';
    render();
    setTimeout(() => { selectionJustFinished = false; }, 0);
}
function groupSelectedNodes(){
    const ids = selectedIds.length ? selectedIds.slice() : (selectedId ? [selectedId] : []);
    const selected = ids.map(id => nodes.find(n => n.id === id)).filter(n => n && (n.images || []).length);
    if(selected.length < 2){ toast(tr('smart.toastNeedGroup')); return; }
    pushUndo();
    const rects = selected.map(nodeRect);
    const x = Math.min(...rects.map(r => r.x));
    const y = Math.min(...rects.map(r => r.y));
    const images = selected.flatMap(node => (node.images || []).map(img => applyNodeMetaToImage({...img}, node)));
    const group = {id:uid('smart'), type:'smart-image', x, y, title:'Group', images, scale:MEDIA_GROUP_DEFAULT_SCALE, created_at:Date.now()};
    nodes = nodes.filter(n => !ids.includes(n.id));
    nodes.push(group);
    canvas.connections = (canvas.connections || []).map(conn => ({
        ...conn,
        from:ids.includes(conn.from) ? group.id : conn.from,
        to:ids.includes(conn.to) ? group.id : conn.to
    })).filter((conn, index, arr) => conn.from !== conn.to && arr.findIndex(c => c.from === conn.from && c.to === conn.to && (c.kind || 'flow') === (conn.kind || 'flow')) === index);
    selectedIds = [];
    selectedId = group.id;
    selectedImage = {nodeId:'', index:-1};
    render();
    scheduleSave();
}
function mergeImageNodesIntoGroup(sourceId, targetId){
    const source = nodes.find(n => n.id === sourceId);
    const target = nodes.find(n => n.id === targetId);
    if(!source || !target || source.id === target.id) return false;
    if(!(source.images || []).length || !(target.images || []).length) return false;
    const sourceImages = (source.images || []).map(img => stripImageGenerationMeta({...img}));
    target.images = [...(target.images || []).map(img => stripImageGenerationMeta(img)), ...sourceImages];
    target.title = 'Group';
    if(!Number.isFinite(Number(target.scale)) || Number(target.scale) === MEDIA_NODE_DEFAULT_SCALE) target.scale = MEDIA_GROUP_DEFAULT_SCALE;
    delete target.w;
    delete target.h;
    canvas.connections = (canvas.connections || []).map(c => {
        if(c.from === source.id) return {...c, from:target.id};
        if(c.to === source.id) return {...c, to:target.id};
        return c;
    }).filter((c, index, arr) => c.from !== c.to && arr.findIndex(x => x.from === c.from && x.to === c.to && (x.kind || 'flow') === (c.kind || 'flow')) === index);
    nodes.forEach(node => {
        if(Array.isArray(node.inputNodeIds)){
            node.inputNodeIds = Array.from(new Set(node.inputNodeIds.map(id => id === source.id ? target.id : id).filter(id => id !== node.id)));
        }
    });
    nodes = nodes.filter(n => n.id !== source.id);
    selectedIds = [];
    selectedId = target.id;
    selectedImage = {nodeId:'', index:-1};
    return true;
}
function closeCreateMenu(){
    createMenu?.classList.remove('open');
}
function openCreateMenu(event){
    if(!createMenu) return;
    createMenuPoint = screenToWorld(event);
    const w = 420;
    const h = 286;
    const left = Math.max(14, Math.min(window.innerWidth - w - 14, event.clientX + 8));
    const top = Math.max(14, Math.min(window.innerHeight - h - 14, event.clientY + 8));
    createMenu.style.left = `${left}px`;
    createMenu.style.top = `${top}px`;
    createMenu.classList.add('open');
    refreshIcons();
}
function createNodeFromMenu(type){
    const p = createMenuPoint || viewportCenter();
    closeCreateMenu();
    if(type === 'prompt') return createPromptNode(p.x - 158, p.y - 97);
    if(type === 'loop') return createLoopNode(p.x - 135, p.y - 95);
    return createImageNodeAt(p);
}
shell.addEventListener('mousedown', e => {
    if(!zoomPreviewState) return;
    if(e.button !== 0) return;
    if(e.target.closest('.composer,.smart-back,.asset-panel,.asset-toggle,.smart-log-toggle,.log-modal,.image-edit-modal,.create-menu,.smart-minimap')) return;
    e.preventDefault();
    e.stopPropagation();
}, true);
shell.addEventListener('click', e => {
    if(!zoomPreviewState) return;
    if(e.button !== 0) return;
    if(e.target.closest('.composer,.smart-back,.asset-panel,.asset-toggle,.smart-log-toggle,.log-modal,.image-edit-modal,.create-menu,.smart-minimap')) return;
    e.preventDefault();
    e.stopPropagation();
    exitZoomPreview(screenToWorld(e));
}, true);
shell.onmousedown = e => {
    if(zoomPreviewState && e.button === 0 && !e.target.closest('.composer,.smart-back,.asset-panel,.asset-toggle,.smart-log-toggle,.log-modal,.image-edit-modal,.create-menu,.smart-minimap')) return;
    if(e.target.closest('.image-node,.composer,.smart-back,.smart-log-toggle,.log-modal,.create-menu,.smart-minimap')) return;
    closeCreateMenu();
    if(e.button === 0 && e.ctrlKey){
        e.preventDefault();
        didPan = false;
        selectionState = {startScreen:{x:e.clientX, y:e.clientY}, startWorld:screenToWorld(e)};
        updateSelectionBox(e);
        return;
    }
    if(e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    didPan = false;
    panState = {button:e.button, startX:e.clientX, startY:e.clientY, ox:viewport.x, oy:viewport.y};
    shell.classList.add('panning');
};
shell.ondblclick = e => {
    if(didPan || e.target.closest('.image-node,.composer,.smart-back,.smart-log-toggle,.log-modal,.image-edit-modal,.create-menu')) return;
    if(document.getElementById('imageEditModal')?.classList.contains('open')) return;
    e.preventDefault();
    openCreateMenu(e);
};
shell.onclick = e => {
    if(selectionJustFinished) return;
    if(didPan || e.target.closest('.image-node,.composer,.smart-back,.smart-log-toggle,.log-modal,.image-edit-modal,.create-menu')) return;
    if(document.getElementById('imageEditModal')?.classList.contains('open')) return;
    closeCreateMenu();
    clearSelection();
    render();
};
minimap?.addEventListener('mousedown', e => {
    if(e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    smartMinimapDrag = true;
    centerViewportOnWorldPoint(minimapEventToWorld(e));
});
window.onmousemove = e => {
    lastMouseWorld = screenToWorld(e);
    if(smartMinimapDrag){
        e.preventDefault();
        centerViewportOnWorldPoint(minimapEventToWorld(e));
        return;
    }
    if(portDragState){
        e.preventDefault();
        const p = screenToWorld(e);
        portDragState.currentWorld = p;
        portDragState.moved = true;
        const hitEl = document.elementFromPoint(e.clientX, e.clientY);
        const portEl = hitEl?.closest?.('.node-port');
        const nodeEl = portEl?.closest?.('.image-node') || hitEl?.closest?.('.image-node');
        let targetId = '', targetPort = '';
        if(nodeEl && nodeEl.dataset.id && nodeEl.dataset.id !== portDragState.fromId){
            targetId = nodeEl.dataset.id;
            if(portEl){
                targetPort = portEl.dataset.port;
            } else {
                const rect = nodeEl.getBoundingClientRect();
                targetPort = (e.clientX - rect.left) < rect.width / 2 ? 'in' : 'out';
            }
            const compatible = (portDragState.fromPort === 'out' && targetPort === 'in') || (portDragState.fromPort === 'in' && targetPort === 'out');
            if(!compatible){ targetId = ''; targetPort = ''; }
        }
        portDragState.hoverTargetId = targetId;
        portDragState.hoverPort = targetPort;
        updatePortDragVisual();
        return;
    }
    if(promptResizeState){
        e.preventDefault();
        const dy = e.clientY - promptResizeState.startY;
        settings.promptH = Math.max(60, Math.min(380, promptResizeState.startH + dy));
        promptInput.style.setProperty('--prompt-h', `${settings.promptH}px`);
        persistActiveSmartSettings();
        return;
    }
    if(selectionState){
        e.preventDefault();
        updateSelectionBox(e);
        return;
    }
    if(previewCompareDrag){
        e.preventDefault();
        setPreviewComparePos(e.clientX);
        return;
    }
    if(previewPanDrag){
        const stage = document.getElementById('previewStage');
        previewPan = {
            x:previewPanDrag.startX + (e.clientX - previewPanDrag.clientX),
            y:previewPanDrag.startY + (e.clientY - previewPanDrag.clientY)
        };
        stage?.classList.add('panning');
        applyPreviewTransform();
        return;
    }
    if(imageEditPanDrag){
        const stage = document.getElementById('imageEditStage');
        if(stage){
            stage.scrollLeft = imageEditPanDrag.scrollLeft - (e.clientX - imageEditPanDrag.clientX);
            stage.scrollTop = imageEditPanDrag.scrollTop - (e.clientY - imageEditPanDrag.clientY);
        }
        return;
    }
    if(cropDrag && cropState){
        const dx = e.clientX - cropDrag.sx;
        const dy = e.clientY - cropDrag.sy;
        if(cropDrag.mode === 'move'){
            cropState.x = cropDrag.start.x + dx;
            cropState.y = cropDrag.start.y + dy;
        } else if(cropDrag.mode === 'image'){
            cropState.x = cropDrag.start.x + dx;
            cropState.y = cropDrag.start.y + dy;
        } else if(String(cropDrag.mode || '').startsWith('outpaint-')){
            resizeOutpaintFromDrag(dx, dy);
        } else {
            cropState.w = cropDrag.start.w + dx;
            cropState.h = cropDrag.start.h + dy;
        }
        clampCrop();
        renderCropBox();
        return;
    }
    if(resizeState){
        const node = nodes.find(n => n.id === resizeState.id);
        if(!node) return;
        const dx = (e.clientX - resizeState.startX) / viewport.scale;
        const dy = (e.clientY - resizeState.startY) / viewport.scale;
        const minW = node.type === 'smart-prompt' ? 260 : node.type === 'smart-loop' ? 252 : 48;
        const minH = node.type === 'smart-prompt' ? 170 : node.type === 'smart-loop' ? 132 : 48;
        node.w = Math.max(minW, Math.round(resizeState.startW + dx));
        node.h = Math.max(minH, Math.round(resizeState.startH + dy));
        node.scale = 1;
        render();
        return;
    }
    if(thumbDragState){
        const dx = e.clientX - thumbDragState.startX;
        const dy = e.clientY - thumbDragState.startY;
        if(!thumbDragState.detached && Math.abs(dx) + Math.abs(dy) > 6){
            const source = nodes.find(n => n.id === thumbDragState.nodeId);
            if(source && (source.images || []).length > 1){
                const img = source.images[thumbDragState.imgIndex];
                if(img){
                    commitPendingUndo();
                    undoSuppressed = true;
                    applyNodeMetaToImage(img, source);
                    source.images.splice(thumbDragState.imgIndex, 1);
                    if(source.images.length <= 1){
                        source.title = 'Image';
                        delete source.w; delete source.h;
                        inheritNodeMetaFromImage(source);
                    }
                    const point = screenToWorld(e);
                    selectedId = '';
                    selectedImage = {nodeId:'', index:-1};
                    const newNode = createImageNodeAt(point, [img], {select:false, skipUndo:true});
                    undoSuppressed = false;
                    dragState = {id:newNode.id, startX:e.clientX, startY:e.clientY, ox:newNode.x, oy:newNode.y, thumbDetached:true};
                    thumbDragState.detached = true;
                    render();
                }
            }
        }
        if(thumbDragState.detached) thumbDragState = null;
        else return;
    }
    if(panState){
        const dx = e.clientX - panState.startX;
        const dy = e.clientY - panState.startY;
        if(Math.abs(dx) + Math.abs(dy) > 3) didPan = true;
        viewport.x = panState.ox + dx;
        viewport.y = panState.oy + dy;
        applyViewport();
        return;
    }
    if(!dragState) return;
    const node = nodes.find(n => n.id === dragState.id);
    if(!node) return;
    const moveDx = (e.clientX - dragState.startX) / viewport.scale;
    const moveDy = (e.clientY - dragState.startY) / viewport.scale;
    (dragState.group || [{id:dragState.id, ox:dragState.ox, oy:dragState.oy}]).forEach(item => {
        const n = nodes.find(x => x.id === item.id);
        if(!n) return;
        n.x = item.ox + moveDx;
        n.y = item.oy + moveDy;
    });
    if(assetLibraryOpen){
        const hit = document.elementFromPoint(e.clientX, e.clientY);
        if(hit && assetPanel.contains(hit)){
            setAssetDragOver(true);
            clearDropHighlight();
            render();
            setAssetDragOver(true);
            return;
        }
        setAssetDragOver(false);
    }
    const draggedRect = nodeRect(node);
    const target = (dragState.ctrlGroup || ['smart-image','smart-prompt','smart-loop'].includes(node.type))
        ? rectOverlapNode(node.id, draggedRect.x, draggedRect.y, draggedRect.width, draggedRect.height, dragState.groupIds)
        : null;
    setDropHighlight(target?.id || '');
    moveNodeElementsDuringDrag();
    if(target) setDropHighlight(target.id);
};
window.onmouseup = e => {
    document.body.classList.remove('smart-node-drag');
    if(portDragState){
        const drag = portDragState;
        portDragState = null;
        shell.classList.remove('port-dragging');
        clearPortDragVisual();
        handlePortDrop(drag, e);
        return;
    }
    if(promptResizeState){ promptResizeState = null; scheduleSave(); }
    if(selectionState) finishSelection(e);
    if(previewCompareDrag) previewCompareDrag = false;
    if(previewPanDrag){
        previewPanDrag = null;
        document.getElementById('previewStage')?.classList.remove('panning');
    }
    if(imageEditPanDrag) imageEditPanDrag = null;
    if(cropDrag){
        document.getElementById('cropCanvas')?.classList.remove('dragging-image');
        cropDrag = null;
    }
    if(resizeState){
        const node = nodes.find(n => n.id === resizeState.id);
        const rect = node ? nodeRect(node) : null;
        if(rect && (Math.abs(rect.width - resizeState.startW) > 1 || Math.abs(rect.height - resizeState.startH) > 1)){
            commitPendingUndo();
        } else { discardPendingUndo(); }
        resizeState = null;
        scheduleSave();
    }
    if(thumbDragState){
        if(!thumbDragState.detached) discardPendingUndo();
        thumbDragState = null;
    }
    if(panState) {
        panState = null;
        shell.classList.remove('panning');
        scheduleSave();
        setTimeout(() => { didPan = false; }, 0);
    }
    if(smartMinimapDrag){
        smartMinimapDrag = false;
    }
    if(dragState){
        const draggedNode = nodes.find(n => n.id === dragState.id);
        let stateChanged = false;
        const hit = document.elementFromPoint(e.clientX, e.clientY);
        const droppedOnAssetPanel = assetLibraryOpen && hit && assetPanel.contains(hit);
        if(droppedOnAssetPanel && draggedNode && (draggedNode.images || []).length){
            const imagesToSave = (draggedNode.images || []).filter(img => img?.url);
            imagesToSave.forEach(img => addUrlToAssetLibrary(img.url, img.name || draggedNode.title || 'image'));
            (dragState.group || [{id:dragState.id, ox:dragState.ox, oy:dragState.oy}]).forEach(item => {
                const n = nodes.find(x => x.id === item.id);
                if(n){ n.x = item.ox; n.y = item.oy; }
            });
            setAssetDragOver(false);
            discardPendingUndo();
            clearDropHighlight();
            dragState = null;
            document.body.classList.remove('smart-node-drag');
            render();
            scheduleSave();
            return;
        }
        const autoTarget = draggedNode ? dragConnectTargetFor(draggedNode) : null;
        if(
            draggedNode &&
            autoTarget &&
            !dragState.ctrlGroup &&
            (dragState.group || []).length <= 1 &&
            canAutoConnectDraggedNode(draggedNode, autoTarget) &&
            connectInputNode(draggedNode.id, autoTarget.id)
        ){
            stateChanged = true;
            restoreDraggedNodePosition();
            if(selectedId === draggedNode.id) selectedId = '';
            render();
        } else if(draggedNode && (draggedNode.images || []).length && (dragState.ctrlGroup || (dragState.group || []).length <= 1)){
            const r = nodeRect(draggedNode);
            const target = rectOverlapNode(draggedNode.id, r.x, r.y, r.width, r.height, dragState.groupIds);
            if(target && (target.images || []).length && (dragState.ctrlGroup || (target.images || []).length > 1)){
                stateChanged = true;
                mergeImageNodesIntoGroup(draggedNode.id, target.id);
                render();
            } else if(target && !dragState.ctrlGroup && (dragState.group || []).length <= 1){
                stateChanged = true;
                connectInputNode(draggedNode.id, target.id);
                if(!dragState.thumbDetached) restoreDraggedNodePosition();
                if(selectedId === draggedNode.id) selectedId = '';
                render();
            } else if((dragState.group || []).some(item => {
                const n = nodes.find(x => x.id === item.id);
                return n && (Math.abs((Number(n.x) || 0) - item.ox) > 1 || Math.abs((Number(n.y) || 0) - item.oy) > 1);
            })){
                stateChanged = true;
            }
        } else if((dragState.group || []).some(item => {
            const n = nodes.find(x => x.id === item.id);
            return n && (Math.abs((Number(n.x) || 0) - item.ox) > 1 || Math.abs((Number(n.y) || 0) - item.oy) > 1);
        }) || (draggedNode && (Math.abs((draggedNode.x || 0) - dragState.ox) > 1 || Math.abs((draggedNode.y || 0) - dragState.oy) > 1))){
            stateChanged = true;
        }
        if(dragState.thumbDetached) stateChanged = true;
        if(stateChanged) commitPendingUndo();
        else discardPendingUndo();
        if(stateChanged || dragState.thumbDetached) suppressNodeClickUntil = Date.now() + 180;
        clearDropHighlight();
        dragState = null;
        scheduleSave();
    }
};
shell.addEventListener('wheel', e => {
    if(e.target.closest('.composer,.smart-back,.image-edit-modal,.asset-panel,.asset-toggle,.smart-log-toggle,.log-modal')) return;
    e.preventDefault();
    const rect = shell.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const before = {x:(sx - viewport.x) / viewport.scale, y:(sy - viewport.y) / viewport.scale};
    const factor = Math.exp(-e.deltaY * 0.001);
    viewport.scale = safeScale(viewport.scale * factor);
    viewport.x = sx - before.x * viewport.scale;
    viewport.y = sy - before.y * viewport.scale;
    applyViewport();
    scheduleSave();
}, {passive:false});
shell.ondragover = e => e.preventDefault();
shell.ondrop = async e => {
    e.preventDefault();
    if(e.target.closest('.image-node')) return;
    const p = screenToWorld(e);
    const assetRaw = e.dataTransfer.getData('application/x-smart-asset');
    if(assetRaw){
        try {
            const asset = JSON.parse(assetRaw);
            if(asset?.url) createImageNodeAt(p, [{url:asset.url, name:asset.name || 'asset', kind:asset.kind || assetMediaKind(asset)}]);
            return;
        } catch {}
    }
    const files = await uploadFilesFromDataTransfer(e.dataTransfer);
    handleFiles(files, '', {point:p});
};
window.addEventListener('paste', e => {
    const files = [...(e.clipboardData?.files || [])].filter(isSupportedUploadFile);
    if(files.length){
        lastImagePasteAt = Date.now();
        handleFiles(files, selectedId);
        return;
    }
    if(nodeClipboard?.nodes?.length && !isEditableTarget(e.target)){
        e.preventDefault();
        pasteNodes();
    }
});
window.addEventListener('keydown', e => {
    const key = String(e.key || '').toLowerCase();
    if(imageEditModal.classList.contains('open') && !isEditableTarget(e.target)){
        if(e.key === 'ArrowLeft' || e.key === 'ArrowRight'){
            e.preventDefault();
            navigatePreviewImage(e.key === 'ArrowLeft' ? -1 : 1);
            return;
        }
    }
    if(!e.ctrlKey && !e.metaKey && !e.altKey && !isEditableTarget(e.target)){
        if(key === 'z'){
            if(e.repeat) return;
            e.preventDefault();
            toggleZoomPreview();
            return;
        }
        if(key === 'a'){
            if(e.repeat) return;
            e.preventDefault();
            toggleAssetLibrary();
            return;
        }
    }
    if((e.ctrlKey || e.metaKey) && key === 'c' && !isEditableTarget(e.target)){
        const selectionText = window.getSelection?.().toString() || '';
        if(selectionText) return;
        e.preventDefault();
        copySelectedNodes();
        return;
    }
    if((e.ctrlKey || e.metaKey) && key === 'v' && !isEditableTarget(e.target) && nodeClipboard?.nodes?.length){
        const requestedAt = Date.now();
        setTimeout(() => {
            if(lastImagePasteAt >= requestedAt) return;
            if(lastNodePasteAt >= requestedAt) return;
            pasteNodes();
        }, 90);
    }
    if(e.key === 'Escape' && imageEditModal.classList.contains('open')){
        closeImageEditor();
        return;
    }
    if((e.ctrlKey || e.metaKey) && key === 'z' && !isEditableTarget(e.target)){
        e.preventDefault();
        performUndo();
        return;
    }
    if((e.key === 'Delete' || e.key === 'Backspace') && (selectedId || selectedIds.length) && !isEditableTarget(e.target)){
        e.preventDefault();
        const ids = selectedIds.length ? selectedIds.slice() : [selectedId];
        pushUndo();
        ids.forEach(id => { undoSuppressed = true; deleteNode(id); undoSuppressed = false; });
        render();
        scheduleSave();
    }
    if(e.ctrlKey && String(e.key).toLowerCase() === 'g' && !isEditableTarget(e.target)){
        e.preventDefault();
        groupSelectedNodes();
    }
});
engineSelect.onchange = () => {
    settings.engine = engineSelect.value;
    applyRecentSmartSettingsForCurrentMode();
    syncApiKindToggleVisibility();
    renderDynamicParams();
    persistActiveSmartSettings();
    scheduleSave();
};
function syncApiKindToggleVisibility(){
    if(!apiKindToggle) return;
    apiKindToggle.style.display = settings.engine === 'api' ? 'inline-flex' : 'none';
    apiKindToggle.querySelectorAll('[data-kind]').forEach(btn => btn.classList.toggle('active', btn.dataset.kind === (settings.apiKind || 'image')));
}
if(apiKindToggle){
    apiKindToggle.querySelectorAll('[data-kind]').forEach(btn => {
        btn.onclick = e => {
            e.preventDefault();
            e.stopPropagation();
            const kind = btn.dataset.kind;
            if(kind === settings.apiKind) return;
            settings.apiKind = kind;
            applyRecentSmartSettingsForCurrentMode();
            syncApiKindToggleVisibility();
            renderDynamicParams();
            persistActiveSmartSettings();
            scheduleSave();
        };
    });
}
let promptResizeState = null;
const promptResize = document.getElementById('promptResize');
if(promptResize){
    promptResize.addEventListener('mousedown', e => {
        if(e.button !== 0) return;
        e.preventDefault(); e.stopPropagation();
        promptResizeState = {
            startY: e.clientY,
            startH: Number(settings.promptH) || promptInput.offsetHeight || 124
        };
    });
}
runBtn.onclick = runGeneration;
cascadeRunBtn.onclick = runSmartCascade;
fileInput.onchange = () => {
    const groupPoint = pendingGroupUploadPoint;
    if(!fileInput.files?.length){
        pendingGroupUploadPoint = null;
        uploadTargetId = '';
        return;
    }
    const targetId = groupPoint ? '' : (uploadTargetId || selectedId);
    handleFiles(fileInput.files, targetId, groupPoint ? {point:groupPoint} : {});
    pendingGroupUploadPoint = null;
    uploadTargetId = '';
    fileInput.value = '';
};
assetToggle.onclick = () => toggleAssetLibrary();
assetCloseBtn.onclick = () => toggleAssetLibrary(false);
assetPanel.addEventListener('pointerdown', e => e.stopPropagation());
assetPanel.addEventListener('mousedown', e => e.stopPropagation());
assetPanel.addEventListener('click', e => e.stopPropagation());
assetPanel.addEventListener('wheel', e => e.stopPropagation(), {passive:false});
assetDialogBackdrop.addEventListener('pointerdown', e => e.stopPropagation());
assetDialogBackdrop.addEventListener('mousedown', e => e.stopPropagation());
assetDialogBackdrop.addEventListener('click', e => e.stopPropagation());
promptPresetPanel?.addEventListener('pointerdown', e => e.stopPropagation());
promptPresetPanel?.addEventListener('mousedown', e => e.stopPropagation());
promptPresetPanel?.addEventListener('click', e => e.stopPropagation());
if(promptPresetClose) promptPresetClose.onclick = closePromptPresetPanel;
if(promptPresetSelect) promptPresetSelect.onchange = () => renderPromptPresetPanel(promptPresetSelect.value);
[promptPresetName, promptPresetText].forEach(input => {
    input?.addEventListener('input', () => {
        resetPromptPresetDeleteState();
        setPromptPresetStatus(tr('smart.promptPresetEditing'));
    });
});
if(promptPresetApply) promptPresetApply.onclick = () => {
    const preset = currentPromptPreset(promptPresetSelect.value);
    const node = promptPresetPanelNode();
    if(!preset || !node) return;
    node.promptPresetId = preset.id;
    node.text = preset.text || '';
    closePromptPresetPanel();
    render();
    scheduleSave();
};
if(promptPresetSave) promptPresetSave.onclick = () => {
    const preset = currentPromptPreset(promptPresetSelect.value);
    if(!preset) return;
    const name = promptPresetName.value.trim();
    const text = promptPresetText.value.trim();
    if(!name || !text){ setPromptPresetStatus(tr('smart.promptPresetRequired'), 'warn'); return; }
    const idx = promptPresets.findIndex(p => p.id === preset.id);
    if(idx >= 0) promptPresets[idx] = {...promptPresets[idx], name, text, updatedAt:Date.now()};
    savePromptPresets();
    const node = promptPresetPanelNode();
    if(node?.promptPresetId === preset.id) node.text = text;
    renderPromptPresetPanel(preset.id, tr('smart.promptPresetSaved'));
    setPromptPresetStatus(tr('smart.promptPresetSaved'), 'ok');
    render();
    scheduleSave();
};
if(promptPresetNew) promptPresetNew.onclick = () => {
    const node = promptPresetPanelNode();
    const preset = createPromptPresetFromNode(node, {openPanel:false});
    if(!preset) return;
    renderPromptPresetPanel(preset.id, tr('smart.promptPresetSavedNew'));
    setPromptPresetStatus(tr('smart.promptPresetSavedNew'), 'ok');
    promptPresetName?.focus();
    promptPresetName?.select();
};
if(promptPresetDelete) promptPresetDelete.onclick = () => {
    const preset = currentPromptPreset(promptPresetSelect.value);
    if(!preset) return;
    if(!promptPresetDeleteArmed){
        promptPresetDeleteArmed = true;
        promptPresetDelete.textContent = tr('smart.promptPresetDeleteAgain');
        promptPresetDelete.classList.add('confirm-danger');
        setPromptPresetStatus(tr('smart.promptPresetDeleteConfirm').replace('{name}', preset.name || tr('smart.promptPresetUnnamed')), 'warn');
        return;
    }
    promptPresets = promptPresets.filter(p => p.id !== preset.id);
    nodes.forEach(node => { if(node.promptPresetId === preset.id) node.promptPresetId = ''; });
    savePromptPresets();
    renderPromptPresetPanel(promptPresets[0]?.id || '', tr('smart.promptPresetDeleted'));
    setPromptPresetStatus(tr('smart.promptPresetDeleted'), 'ok');
    render();
    scheduleSave();
};
document.querySelectorAll('[data-asset-tab]').forEach(btn => {
    btn.onclick = () => { assetTab = btn.dataset.assetTab; renderAssetLibrary(); };
});
assetCategorySelect.onchange = () => { activeAssetCategoryId = assetCategorySelect.value; renderAssetLibrary(); };
document.getElementById('assetAddCategoryBtn').onclick = async () => {
    const name = await openAssetNameDialog({title:tr('smart.assetNewFolder'), value:tr('smart.assetFolder'), placeholder:tr('smart.assetFolder')});
    if(!name) return;
    const data = await fetch('/api/asset-library/categories', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name, type:'image'})}).then(r => r.json());
    activeAssetCategoryId = data.category?.id || activeAssetCategoryId;
    setAssetLibraryFromResponse(data);
};
document.getElementById('assetRenameCategoryBtn').onclick = async () => {
    const cat = activeAssetCategory();
    if(!cat) return;
    const name = await openAssetNameDialog({title:tr('smart.assetRenameFolder'), value:cat.name || '', placeholder:tr('smart.assetFolder')});
    if(!name) return;
    const data = await fetch(`/api/asset-library/categories/${encodeURIComponent(cat.id)}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name})}).then(r => r.json());
    setAssetLibraryFromResponse(data);
};
function hasCanvasImageDrag(event){
    return Array.from(event.dataTransfer?.types || []).includes('application/x-smart-canvas-image');
}
function setAssetDragOver(active){
    assetDropZone.classList.toggle('drag-over', !!active);
    assetPanel.classList.toggle('drag-over', !!active);
}
function handleAssetPanelDragOver(e){
    if(hasCanvasImageDrag(e)){
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
        setAssetDragOver(true);
    }
}
async function handleAssetPanelDrop(e){
    if(!hasCanvasImageDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setAssetDragOver(false);
    const raw = e.dataTransfer.getData('application/x-smart-canvas-image');
    if(!raw) return;
    try {
        const payload = JSON.parse(raw);
        if(payload?.url) await addUrlToAssetLibrary(payload.url, payload.name || '');
    } catch(e) {
        toast(tr('smart.assetAddFail'));
    }
}
assetDropZone.addEventListener('dragover', e => {
    if(hasCanvasImageDrag(e)){
        e.preventDefault();
        e.stopPropagation();
        assetDropZone.classList.add('drag-over');
    }
});
assetDropZone.addEventListener('dragleave', () => assetDropZone.classList.remove('drag-over'));
assetDropZone.addEventListener('drop', handleAssetPanelDrop);
assetPanel.addEventListener('dragover', handleAssetPanelDragOver);
assetPanel.addEventListener('dragleave', e => { if(!assetPanel.contains(e.relatedTarget)) setAssetDragOver(false); });
assetPanel.addEventListener('drop', handleAssetPanelDrop);
createMenu?.addEventListener('mousedown', event => event.stopPropagation());
createMenu?.addEventListener('click', event => {
    event.stopPropagation();
    const card = event.target.closest('[data-create-type]');
    if(card) createNodeFromMenu(card.dataset.createType || 'image');
});
composer.addEventListener('pointerdown', event => event.stopPropagation());
composer.addEventListener('mousedown', event => event.stopPropagation());
composer.addEventListener('click', event => {
    if(!event.target.closest('.smart-control')) closeAllSmartPopovers();
    event.stopPropagation();
});
promptInput.addEventListener('input', maybeOpenMentionPicker);
promptInput.addEventListener('input', () => {
    delete promptInput.dataset.preserveDraftOnce;
    savePromptDraftForCurrent();
    renderInputThumbsRow(selectedNode());
    scheduleSave();
});
promptInput.addEventListener('keyup', maybeOpenMentionPicker);
promptInput.addEventListener('mouseup', saveMentionRange);
promptInput.addEventListener('focus', saveMentionRange);
promptInput.addEventListener('keydown', event => {
    if(event.key === 'Escape') closeMentionPicker();
});
promptInput.addEventListener('mouseover', event => {
    const token = event.target.closest?.('.mention-image-token');
    if(!token) return;
    let media = mentionPreview.querySelector('img,video');
    const isVideo = token.dataset.kind === 'video' || isVideoMediaItem({url:token.dataset.url, kind:token.dataset.kind});
    if(isVideo && media?.tagName?.toLowerCase() !== 'video'){
        media?.replaceWith(document.createElement('video'));
        media = mentionPreview.querySelector('video');
    } else if(!isVideo && media?.tagName?.toLowerCase() !== 'img'){
        media?.replaceWith(document.createElement('img'));
        media = mentionPreview.querySelector('img');
    }
    if(isVideo){
        media.muted = true;
        media.loop = true;
        media.playsInline = true;
        media.preload = 'metadata';
        media.disablePictureInPicture = true;
        media.setAttribute('disablepictureinpicture', '');
        media.setAttribute('controlslist', 'nodownload noplaybackrate noremoteplayback');
        media.src = token.dataset.url || '';
        media.play?.().catch(() => {});
    } else {
        media.src = token.dataset.url || '';
        media.alt = 'preview';
    }
    const rect = token.getBoundingClientRect();
    mentionPreview.style.left = `${Math.min(window.innerWidth - 236, rect.left)}px`;
    mentionPreview.style.top = `${Math.min(window.innerHeight - 236, rect.bottom + 8)}px`;
    mentionPreview.style.display = 'block';
});
promptInput.addEventListener('mouseout', event => {
    if(event.target.closest?.('.mention-image-token')){
        mentionPreview.style.display = 'none';
        const media = mentionPreview.querySelector('img,video');
        media?.pause?.();
        media?.removeAttribute('src');
        media?.load?.();
    }
});
mentionPicker.addEventListener('mousedown', event => event.stopPropagation());
document.addEventListener('click', event => {
    if(!event.target.closest('.smart-control')) closeAllSmartPopovers();
    if(!event.target.closest('.mention-picker') && !event.target.closest('#promptInput')) closeMentionPicker();
    if(!event.target.closest('.prompt-preset-panel') && !event.target.closest('.prompt-preset-edit') && !event.target.closest('.prompt-preset-save')) closePromptPresetPanel();
});
document.addEventListener('keydown', event => {
    if(event.key === 'Escape') { closeAllSmartPopovers(); closeCreateMenu(); closeSmartCanvasLog(); closePromptPresetPanel(); }
});
document.getElementById('cropBox').addEventListener('mousedown', event => beginCropDrag(event, 'move'));
document.getElementById('cropHandle').addEventListener('mousedown', event => beginCropDrag(event, 'resize'));
document.getElementById('outpaintFrame').addEventListener('mousedown', event => {
    if(event.target.closest('[data-outpaint-handle]')) return;
    beginCropDrag(event, 'image');
});
document.querySelectorAll('[data-outpaint-handle]').forEach(handle => {
    handle.addEventListener('mousedown', event => beginCropDrag(event, `outpaint-${handle.dataset.outpaintHandle || 'corner'}`));
});
document.getElementById('cropImage').addEventListener('mousedown', event => {
    if(imageEditMode !== 'outpaint' || !cropState) return;
    document.getElementById('cropCanvas')?.classList.add('dragging-image');
    beginCropDrag(event, 'image');
});
document.querySelectorAll('[data-image-edit-mode]').forEach(btn => {
    btn.addEventListener('click', event => {
        event.stopPropagation();
        setImageEditMode(btn.dataset.imageEditMode || 'crop', true);
    });
});
imageEditModal.addEventListener('pointerdown', event => {
    event.stopPropagation();
});
imageEditModal.addEventListener('mousedown', event => {
    event.stopPropagation();
});
imageEditModal.addEventListener('mousemove', event => {
    if(previewPanDrag || previewCompareDrag || imageEditPanDrag || cropDrag) return;
    event.stopPropagation();
});
imageEditModal.addEventListener('click', event => {
    event.stopPropagation();
    if(event.target === imageEditModal) closeImageEditor();
});
imageEditModal.addEventListener('wheel', event => {
    event.stopPropagation();
}, {passive:false});
document.getElementById('previewStage').addEventListener('mousedown', event => {
    if(imageEditMode !== 'preview' || event.button !== 0) return;
    if(event.target.closest('.preview-tools-overlay, .preview-download-overlay')) return;
    if(event.target.closest('.preview-compare-handle')) return;
    event.preventDefault();
    event.stopPropagation();
    previewPanDrag = {clientX:event.clientX, clientY:event.clientY, startX:previewPan.x, startY:previewPan.y};
});
document.getElementById('imageEditStage').addEventListener('mousedown', event => {
    if(imageEditMode === 'preview' || event.button !== 0) return;
    if(event.target.closest('.image-edit-actions, .preview-tools-overlay, .preview-download-overlay, .crop-box, .crop-handle')) return;
    if(event.target.closest('#editDrawCanvas') && imageEditMode !== 'crop') return;
    const stage = event.currentTarget;
    if(stage.scrollWidth <= stage.clientWidth && stage.scrollHeight <= stage.clientHeight) return;
    event.preventDefault();
    event.stopPropagation();
    imageEditPanDrag = {
        clientX:event.clientX,
        clientY:event.clientY,
        scrollLeft:stage.scrollLeft,
        scrollTop:stage.scrollTop
    };
});
document.getElementById('previewCompareHandle').addEventListener('mousedown', event => {
    if(imageEditMode !== 'preview' || !previewCompareOn || previewCompareIndex < 0) return;
    event.preventDefault();
    event.stopPropagation();
    previewPanDrag = null;
    previewCompareDrag = true;
    setPreviewComparePos(event.clientX);
});
document.getElementById('previewCompareHandle').addEventListener('pointerdown', event => {
    if(imageEditMode !== 'preview' || !previewCompareOn || previewCompareIndex < 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    previewPanDrag = null;
    previewCompareDrag = true;
    setPreviewComparePos(event.clientX);
});
document.getElementById('previewCompareHandle').addEventListener('pointermove', event => {
    if(!previewCompareDrag) return;
    event.preventDefault();
    event.stopPropagation();
    setPreviewComparePos(event.clientX);
});
document.getElementById('previewCompareHandle').addEventListener('pointerup', event => {
    if(previewCompareDrag){
        event.preventDefault();
        event.stopPropagation();
    }
    previewCompareDrag = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
});
document.getElementById('previewCompareHandle').addEventListener('pointercancel', event => {
    previewCompareDrag = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
});
document.getElementById('editDrawCanvas').addEventListener('pointerdown', beginEditDraw);
document.getElementById('editDrawCanvas').addEventListener('pointermove', moveEditDraw);
document.getElementById('editDrawCanvas').addEventListener('pointerup', endEditDraw);
document.getElementById('editDrawCanvas').addEventListener('pointercancel', endEditDraw);
document.getElementById('editDrawCanvas').addEventListener('pointerleave', endEditDraw);
['gridHorizontalLines','gridVerticalLines','gridGapSize'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
        syncGridGapValue();
        refreshGridSplitPreview();
    });
});
document.getElementById('imageEditStage').addEventListener('wheel', event => {
    if(!cropState) return;
    event.preventDefault();
    event.stopPropagation();
    if(imageEditMode === 'preview'){
        const oldZoom = previewZoom;
        const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
        previewZoom = Math.max(0.05, previewZoom * factor);
        const frame = document.getElementById('previewFrame');
        const rect = frame?.getBoundingClientRect();
        if(rect){
            const originX = event.clientX - rect.left - rect.width / 2;
            const originY = event.clientY - rect.top - rect.height / 2;
            const ratio = previewZoom / oldZoom;
            previewPan.x -= originX * (ratio - 1);
            previewPan.y -= originY * (ratio - 1);
        }
        applyPreviewTransform();
        return;
    }
    const stage = event.currentTarget;
    const oldZoom = imageEditZoom;
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    imageEditZoom = Math.max(0.15, Math.min(6.0, imageEditZoom * factor));
    const stageRect = stage.getBoundingClientRect();
    const mx = event.clientX - stageRect.left;
    const my = event.clientY - stageRect.top;
    const contentX = stage.scrollLeft + mx;
    const scale = imageEditZoom / oldZoom;
    const contentY = stage.scrollTop + my;
    applyImageEditZoom(scale);
    stage.scrollLeft = contentX * scale - mx;
    stage.scrollTop = contentY * scale - my;
}, {passive:false});
window.addEventListener('resize', () => { if(cropState) syncImageEditOverflow(); });
window.addEventListener('studio-theme-change', event => applyTheme(event.detail?.theme || 'light'));
try {
    const apiChannel = new BroadcastChannel('studio-api');
    apiChannel.onmessage = async event => {
        if(event.data?.type === 'providers-changed' || event.data?.type === 'workflows-changed'){
            await refreshSmartConfigFromSettings();
        }
    };
} catch(e) {}
window.addEventListener('focus', () => {
    if(Date.now() - lastConfigRefreshAt > 1200) refreshSmartConfigFromSettings();
});
window.addEventListener('message', event => {
    if(event.data?.type === 'studio-theme') applyTheme(event.data.theme || 'light');
    if(event.data?.type === 'providers-changed' || event.data?.type === 'workflows-changed') refreshSmartConfigFromSettings();
    if(event.data?.type === 'studio-lang' && window.StudioI18n) {
        window.StudioI18n.set(event.data.lang || 'zh');
    }
});
window.addEventListener('studio-lang-change', () => {
    renderDynamicParams();
    renderInputThumbsRow(selectedNode());
    renderAssetLibrary();
    if(document.getElementById('imageEditModal')?.classList.contains('open')){
        setImageEditMode(imageEditMode);
    }
    render();
});
window.onload = async () => {
    applyTheme(localStorage.getItem('studio_theme') || localStorage.getItem('canvas_theme') || 'light');
    loadPromptPresets();
    if(window.StudioI18n) window.StudioI18n.apply();
    if(window.lucide) lucide.createIcons();
    await loadConfig();
    await loadAssetLibrary();
    await loadCanvas();
    syncApiKindToggleVisibility();
    render();
};
