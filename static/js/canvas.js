function refreshIcons(){ if(window.lucide) lucide.createIcons(); }
refreshIcons();
function tr(key){ return window.StudioI18n ? StudioI18n.t(key) : key; }
function trf(key, values={}){
    return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), tr(key));
}
function langIsEn(){ return window.StudioI18n?.lang?.() === 'en'; }
function actionFailed(labelKey, detail=''){
    const label = tr(labelKey);
    return langIsEn() ? `${label} failed${detail ? `: ${detail}` : ''}` : `${label}失败${detail ? `：${detail}` : ''}`;
}
function noReturnedImage(labelKey){ return langIsEn() ? `${tr(labelKey)} failed: no image returned` : `${tr(labelKey)}失败：未返回图片`; }
function applyLanguage(lang){
    if(lang && window.StudioI18n) StudioI18n.set(lang);
    document.title = tr('canvas.title');
    refreshGateViewControls();
    if(canvas) {
        currentCanvasTitle.textContent = canvas?.title || tr('canvas.untitled');
    }
    renderCanvasList();
    render();
}
window.addEventListener('message', event => {
    if(event.data?.type === 'studio-lang') applyLanguage(event.data.lang);
    if(event.data?.type === 'canvas_updated') handleCanvasUpdatedMessage(event.data);
    if(event.data?.type === 'canvas-focus'){
        // 从其他标签页切换回画布时，重新拉取工作流列表并刷新节点
        loadConfig().then(() => {
            pruneMissingComfyWorkflows();
            if(typeof render === 'function') render();
        });
        if(canvas) syncRemoteCanvasNow();
    }
});
window.addEventListener('studio-lang-change', () => {
    document.title = tr('canvas.title');
    refreshGateViewControls();
    if(canvas) currentCanvasTitle.textContent = canvas?.title || tr('canvas.untitled');
    renderCanvasList();
    render();
});
const shell = document.getElementById('shell');
const canvasGate = document.getElementById('canvasGate');
const board = document.getElementById('board');
const world = document.getElementById('world');
const nodesEl = document.getElementById('nodes');
const minimap = document.getElementById('minimap');
const minimapContent = document.getElementById('minimapContent');
let minimapViewport = document.getElementById('minimapViewport');
const linksEl = document.getElementById('links');
const linkControlsEl = document.getElementById('linkControls');
const dropOverlay = document.getElementById('dropOverlay');
const createMenu = document.getElementById('createMenu');
const linkCreateMenu = document.getElementById('linkCreateMenu');
const nodeInputMenu = document.getElementById('nodeInputMenu');
const nodeOutputMenu = document.getElementById('nodeOutputMenu');
const imageNodeMenu = document.getElementById('imageNodeMenu');
const selectionBox = document.getElementById('selectionBox');
const selectionHub = document.getElementById('selectionHub');
const gateStatus = document.getElementById('gateStatus');
const gateCreateBtn = document.getElementById('gateCreateBtn');
const gateCreateSmartBtn = document.getElementById('gateCreateSmartBtn');
const gateRefreshBtn = document.getElementById('gateRefreshBtn');
const gateBackBtn = document.getElementById('gateBackBtn');
const gateTrashBtn = document.getElementById('gateTrashBtn');
const gateTrashCount = document.getElementById('gateTrashCount');
const gateTitleText = document.getElementById('gateTitleText');
const gateSubtitle = document.getElementById('gateSubtitle');
const gateCanvasList = document.getElementById('gateCanvasList');
const gateTitleInput = document.getElementById('gateTitleInput');
const gateConfirmBtn = document.getElementById('gateConfirmBtn');
const gateCancelBtn = document.getElementById('gateCancelBtn');
const backToManagerBtn = document.getElementById('backToManagerBtn');
const currentCanvasTitle = document.getElementById('currentCanvasTitle');
const currentCanvasTime = document.getElementById('currentCanvasTime');
const outputLightbox = document.getElementById('outputLightbox');
const outputPreview = document.getElementById('outputPreview');
const outputLightboxImg = document.getElementById('outputLightboxImg');
const outputCompareContainer = document.getElementById('outputCompareContainer');
const outputCompareResult = document.getElementById('outputCompareResult');
const outputCompareOriginal = document.getElementById('outputCompareOriginal');
const outputCompareOriginalWrap = document.getElementById('outputCompareOriginalWrap');
const outputCompareSlider = document.getElementById('outputCompareSlider');
const outputResolution = document.getElementById('outputResolution');
const outputDownloadBtn = document.getElementById('outputDownloadBtn');
const outputLightboxVideo = document.getElementById('outputLightboxVideo');
const outputPromptPanel = document.getElementById('outputPromptPanel');
const outputPromptText = document.getElementById('outputPromptText');
const outputCopyPromptBtn = document.getElementById('outputCopyPromptBtn');
const outputRerunBtn = document.getElementById('outputRerunBtn');
const logModal = document.getElementById('logModal');
const logList = document.getElementById('logList');
const errorModal = document.getElementById('errorModal');
const errorTitle = document.getElementById('errorTitle');
const errorMessage = document.getElementById('errorMessage');
let canvases = [];
let deletedCanvases = [];
let canvas = null;
let nodes = [];
let connections = [];
let viewport = {x: -1800, y: -1000, scale: 1};
let dragNode = null;
let dragBoard = null;
let minimapDrag = false;
let minimapState = null;
let minimapRenderQueued = false;
let resizeNode = null;
let llmPaneDrag = null;
let tempLink = null;
let knifeActive = false;
let knifePoint = null;
let knifeTrail = [];
let knifeChanged = false;
let knifeNeedsRender = false;
let selectDrag = null;
let menuPoint = null;
let linkCreateState = null;
let internalDrag = false;
let selected = new Set();
let saveTimer = null;
let creatingCanvas = false;
let createCanvasKind = 'classic';
let trashMode = false;
let pendingDeleteCanvasId = null;
let pendingPurgeCanvasId = null;
let emojiPickerCanvasId = null;
let localCanvasDirty = false;
let savingCanvasNow = false;
let saveCanvasAgain = false;
let applyingRemoteCanvas = false;
let remoteSyncTimer = null;
let remoteSyncInterval = null;
let remoteSyncBusy = false;
let lastCanvasUpdatedAt = 0;
let models = {gpt:'gpt-image-2', nano:'nano-banana-pro'};
let imageModels = ['gpt-image-2', 'nano-banana-pro'];
let chatModels = ['gpt-4o-mini'];
let videoModels = [];
let msChatModels = [];
let apiProviders = [];
let comfyBackendCount = 1;
let comfyWorkflows = [];
let comfyWorkflowCache = {};
let runningHubWorkflowCache = {};
let managedProviderId = 'comfly';
let localImageModels = [];
let localChatModels = [];
const MS_GEN_MODELS = {
    zimage:    { label: 'ZImage',     modelId: 'Tongyi-MAI/Z-Image-Turbo',            supportsImage: false, endpoint: '/generate'            },
    qwen_edit: { label: 'Qwen Edit',  modelId: 'Qwen/Qwen-Image-Edit-2511',            supportsImage: true,  endpoint: '/api/angle/generate'  },
    klein_edit:{ label: 'Klein',      modelId: 'black-forest-labs/FLUX.2-klein-9B',   supportsImage: true,  endpoint: '/api/ms/generate'     },
    custom:    { label: '自定义', labelKey: 'canvas.custom', modelId: '',                acceptsImage: true,   endpoint: '/api/ms/generate'     }
};
let hasManagedImageModels = false;
let hasManagedChatModels = false;
let outputCompareDrag = false;
let outputPreviewZoom = 1;
let outputPreviewPan = {x: 0, y: 0};
let outputPreviewPanDrag = null;
let currentOutputCompareUrl = '';
let currentOutputMeta = null;
let currentOutputLightboxOutId = '';
let currentOutputLightboxUrl = '';
const missingAssetUrls = new Set();
let outputTimer = null;
let loopContext = null;
let clipboard = null;
let lastImagePasteAt = 0;
const activeCanvasTaskPolls = new Set();
let hoveredConnectionId = '';
let lastMouseBoard = {x: 0, y: 0};
let undoStack = [];
const UNDO_MAX = 30;
const cascadeRunningIds = new Set();
const cascadeStopIds = new Set();
const cascadeSerialIds = new Set(); // 记录以串行循环模式启动的运行，用于停止按钮
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
let gridCustomLines = []; // [{type:'h'|'v', pos:0-1}] 相对图片尺寸的分数位置
let gridCustomOrientation = 'h'; // 当前点击放置方向
let gridCustomHistory = []; // 撤销栈：每次放线前快照
let gridCustomDrag = null; // {index, pointerId}
let imageEditZoom = 1.0;
let imageEditBaseW = 0; // zoom=1 时图片显示宽度
let imageEditBaseH = 0;
let textSelectionGuard = null;
const PROMPT_TEXT_MAX_LENGTH = 20000;
const CLIENT_ID = 'canvas_' + Math.random().toString(36).slice(2);
const CANVAS_EMOJIS = ['layers','sparkles','image','palette','wand-2','star','heart','rocket','flame','moon','cloud','leaf','gem','compass','pin','flag','bookmark','crown'];
function renderCanvasIcon(icon, size = 14) {
    // 旧的默认 emoji 或空值都映射为 layers
    if(!icon || icon === '🧩') return `<i data-lucide="layers" style="width:${size}px;height:${size}px"></i>`;
    // 含非 ASCII 字符（用户旧选过的 emoji）继续按文本渲染
    if(/[^\x00-\x7F]/.test(icon)) return escapeHtml(icon);
    return `<i data-lucide="${escapeHtml(icon)}" style="width:${size}px;height:${size}px"></i>`;
}

const SIZE_MAP = {
    square: { '1k':'1024x1024', '2k':'2048x2048', '4k':'2880x2880' },
    portrait: { '1k':'1024x1536', '2k':'1360x2048', '4k':'2352x3520' },
    portrait43: { '1k':'1008x1344', '2k':'1536x2048', '4k':'2448x3264' },
    landscape43: { '1k':'1344x1008', '2k':'2048x1536', '4k':'3264x2448' },
    landscape: { '1k':'1536x1024', '2k':'2048x1360', '4k':'3520x2352' },
    story: { '1k':'720x1280', '2k':'1152x2048', '4k':'2160x3840' },
    wide: { '1k':'1280x720', '2k':'2048x1152', '4k':'3840x2160' }
};
const RES_LONG_SIDE = { '1k':1536, '2k':2048, '4k':3840 };
const RES_PIXEL_LIMIT = { '1k':1572864, '2k':4194304, '4k':8294400 };
const CUSTOM_IMAGE_MODELS_KEY = 'canvas_custom_image_models';
const MANAGED_IMAGE_MODELS_KEY = 'canvas_image_models_ordered';
const MANAGED_CHAT_MODELS_KEY = 'canvas_chat_models_ordered';
const CANVAS_THEME_KEY = 'canvas_theme';
const QUICK_TOOLBAR_COLLAPSED_KEY = 'canvas_quick_toolbar_collapsed';
const DEFAULT_VIDEO_MODELS = [
    // Veo
    'veo2', 'veo2-fast', 'veo2-pro',
    'veo3', 'veo3-fast', 'veo3-pro',
    'veo3.1', 'veo3.1-fast', 'veo3.1-quality', 'veo3.1-lite',
    // Sora
    'sora-2', 'sora-2-pro',
    // 通义万相
    'wan2.6-t2v', 'wan2.6-i2v',
    'wan2.5-t2v-preview', 'wan2.5-i2v-preview',
    'wan2.2-t2v-plus', 'wan2.2-i2v-plus', 'wan2.2-i2v-flash',
    // Seedance
    'doubao-seedance-2-0-260128',
    'doubao-seedance-2-0-fast-260128',
    'doubao-seedance-1-5-pro-251215',
    'doubao-seedance-1-0-pro-250528',
    'doubao-seedance-1-0-lite-t2v-250428',
    'doubao-seedance-1-0-lite-i2v-250428'
];

function uid(prefix='n'){ return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`; }
function applyTheme(theme){
    const dark = theme === 'dark';
    document.documentElement.classList.toggle('studio-theme-dark', dark);
    document.documentElement.classList.toggle('theme-dark', dark);
    document.body.classList.toggle('studio-theme-dark', dark);
    document.body.classList.toggle('theme-dark', dark);
    shell.classList.toggle('theme-dark', dark);
}
function applyQuickToolbarState(){
    const toolbar = document.getElementById('quickToolbar');
    if(!toolbar) return;
    const collapsed = localStorage.getItem(QUICK_TOOLBAR_COLLAPSED_KEY) === '1';
    toolbar.classList.toggle('collapsed', collapsed);
    const btn = toolbar.querySelector('.toolbar-toggle');
    if(btn){
        btn.title = collapsed ? '展开快捷菜单' : '折叠快捷菜单';
        btn.setAttribute('aria-label', btn.title);
    }
    refreshIcons();
}
function toggleQuickToolbar(){
    const toolbar = document.getElementById('quickToolbar');
    const next = !toolbar?.classList.contains('collapsed');
    localStorage.setItem(QUICK_TOOLBAR_COLLAPSED_KEY, next ? '1' : '0');
    applyQuickToolbarState();
}
function loadLocalModelLists(){
    try {
        const managedRaw = localStorage.getItem(MANAGED_IMAGE_MODELS_KEY);
        const raw = JSON.parse(managedRaw || localStorage.getItem(CUSTOM_IMAGE_MODELS_KEY) || '[]');
        localImageModels = Array.isArray(raw) ? raw.filter(Boolean) : [];
        hasManagedImageModels = Boolean(managedRaw);
    } catch(e) {
        localImageModels = [];
        hasManagedImageModels = false;
    }
    try {
        const managedRaw = localStorage.getItem(MANAGED_CHAT_MODELS_KEY);
        const raw = JSON.parse(managedRaw || '[]');
        localChatModels = Array.isArray(raw) ? raw.filter(Boolean) : [];
        hasManagedChatModels = Boolean(managedRaw);
    } catch(e) {
        localChatModels = [];
        hasManagedChatModels = false;
    }
}
function uniqueModels(list){
    const seen = new Set();
    return list.map(item => String(item || '').trim()).filter(item => {
        if(!item || seen.has(item)) return false;
        seen.add(item);
        return true;
    });
}
function defaultApiProviders(){
    return [{id:'comfly', name:'Comfly', base_url:'', enabled:true, image_models:imageModels, chat_models:chatModels, video_models:videoModels.length ? videoModels : DEFAULT_VIDEO_MODELS, has_key:false, key_preview:''}];
}
function isRunningHubProvider(provider){
    const id = String(provider?.id || '').trim().toLowerCase();
    const protocol = String(provider?.protocol || '').trim().toLowerCase();
    const name = String(provider?.name || '').trim().toLowerCase();
    return id === 'runninghub' || protocol === 'runninghub' || name === 'runninghub' || id === 'rh';
}
function normalizeProviderId(value){
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 40);
}
function imageApiProviders(){
    const providers = (apiProviders.length ? apiProviders : defaultApiProviders())
        .filter(p => p.id !== 'modelscope' && !isRunningHubProvider(p) && p.enabled !== false && (p.image_models || []).length);
    return providers;
}
function providerById(id){
    return (apiProviders.length ? apiProviders : defaultApiProviders()).find(p => p.id === id) || imageApiProviders()[0] || defaultApiProviders()[0];
}
function resolveProviderId(id){
    return providerById(id)?.id || 'comfly';
}
function chatApiProviders(){
    const providers = (apiProviders.length ? apiProviders : defaultApiProviders())
        .filter(p => p.enabled !== false && (p.chat_models || []).length);
    return providers.length ? providers : defaultApiProviders();
}
function resolveChatProviderId(id){
    const providers = chatApiProviders();
    return providers.find(p => p.id === id)?.id || providers[0]?.id || 'comfly';
}
function chatProviderOptions(selectedId){
    const selected = resolveChatProviderId(selectedId);
    return chatApiProviders().map(provider => `<option value="${escapeHtml(provider.id)}" ${provider.id === selected ? 'selected' : ''}>${escapeHtml(provider.name || provider.id)}</option>`).join('');
}
function providerChatModels(providerId){
    const provider = apiProviders.find(p => p.id === providerId);
    return uniqueModels(provider?.chat_models || []);
}
function resolveImageProviderId(id){
    const providers = imageApiProviders();
    return providers.find(p => p.id === id)?.id || providers[0]?.id || '';
}
function providerOptions(selectedId){
    const selected = resolveImageProviderId(selectedId);
    const providers = imageApiProviders();
    if(!providers.length) return `<option value="" disabled selected>${tr('canvas.noApiProviders') || '暂无 API 平台'}</option>`;
    return providers.map(provider => `<option value="${escapeHtml(provider.id)}" ${provider.id === selected ? 'selected' : ''}>${escapeHtml(provider.name || provider.id)}</option>`).join('');
}
function providerImageModels(providerId){
    // 不走 providerById（会 fallback 到第一个 provider，造成串台），直接查精确匹配
    const provider = apiProviders.find(p => p.id === providerId);
    return uniqueModels(provider?.image_models || []);
}
function videoApiProviders(){
    const providers = (apiProviders.length ? apiProviders : defaultApiProviders())
        .filter(p => p.id !== 'modelscope' && !isRunningHubProvider(p) && p.enabled !== false);
    return providers.length ? providers : defaultApiProviders();
}
function resolveVideoProviderId(id){
    const providers = videoApiProviders();
    return providers.find(p => p.id === id)?.id || providers[0]?.id || 'comfly';
}
function videoProviderOptions(selectedId){
    const selected = resolveVideoProviderId(selectedId);
    return videoApiProviders().map(provider => `<option value="${escapeHtml(provider.id)}" ${provider.id === selected ? 'selected' : ''}>${escapeHtml(provider.name || provider.id)}</option>`).join('');
}
function providerVideoModels(providerId){
    // 不走 providerById（会 fallback 到第一个 provider，造成串台），直接查精确匹配
    const provider = apiProviders.find(p => p.id === providerId);
    return uniqueModels(provider?.video_models || []);
}
function videoModelOptions(selectedModel, providerId){
    const models = providerVideoModels(providerId);
    if(!models.length){
        return `<option value="" disabled selected>${tr('canvas.noModelsHint') || '暂无模型，请到 API 设置添加'}</option>`;
    }
    const selected = selectedModel || models[0];
    return uniqueModels([selected, ...models]).filter(Boolean).map(model => `<option value="${escapeHtml(model)}" ${model === selected ? 'selected' : ''}>${escapeHtml(model)}</option>`).join('');
}
function allImageModels(providerId){
    const providerModels = providerImageModels(providerId || managedProviderId);
    return uniqueModels(providerModels);
}
function modelscopeImageModels(selected = ''){
    const provider = (apiProviders.length ? apiProviders : []).find(p => p.id === 'modelscope');
    return uniqueModels([
        selected,
        ...((provider?.image_models || []).length ? provider.image_models : []),
        'Tongyi-MAI/Z-Image-Turbo',
        'black-forest-labs/FLUX.2-klein-9B'
    ]);
}
function modelscopeImageModelOptions(selectedModel){
    const selectedValue = selectedModel || modelscopeImageModels()[0] || 'Tongyi-MAI/Z-Image-Turbo';
    return modelscopeImageModels(selectedValue).map(model => `<option value="${escapeHtml(model)}" ${model === selectedValue ? 'selected' : ''}>${escapeHtml(model)}</option>`).join('');
}
function currentMsModelId(modelKey, node){
    if(modelKey === 'custom') return node.msCustomModel || modelscopeImageModels()[0] || 'Tongyi-MAI/Z-Image-Turbo';
    return (MS_GEN_MODELS[modelKey] || MS_GEN_MODELS.zimage).modelId;
}
function modelscopeLorasForModel(modelId){
    const provider = (apiProviders.length ? apiProviders : []).find(p => p.id === 'modelscope');
    const list = Array.isArray(provider?.ms_loras) ? provider.ms_loras : [];
    return list.filter(lora =>
        lora && lora.enabled !== false &&
        String(lora.id || '').trim() &&
        String(lora.target_model || lora.model || '').trim() === String(modelId || '').trim()
    );
}
function modelscopeLoraOptions(loras, selectedId){
    return loras.map(lora => {
        const id = String(lora.id || '').trim();
        const label = String(lora.name || id).trim();
        return `<option value="${escapeHtml(id)}" ${id === selectedId ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');
}
function allChatModels(){
    const providerModels = chatApiProviders().flatMap(p => p.chat_models || []);
    return uniqueModels(hasManagedChatModels ? localChatModels : [...providerModels, ...chatModels, ...localChatModels]);
}
function resolveImageModel(value){
    if(value === 'gpt') return models.gpt;
    if(value === 'nano') return models.nano;
    return value || allImageModels(managedProviderId)[0] || models.gpt;
}
function normalizedImageQuality(value){
    const quality = String(value || 'auto').trim().toLowerCase();
    return ['low','medium','high'].includes(quality) ? quality : '';
}
function resolveChatModel(value, providerId=''){
    const providerModels = providerId ? providerChatModels(providerId) : [];
    return value || providerModels[0] || allChatModels()[0] || chatModels[0] || 'gpt-4o-mini';
}
function showErrorModal(message, title=tr('canvas.generationFailed')){
    if(!errorModal || !errorMessage){
        alert(message || title);
        return;
    }
    errorTitle.textContent = title || tr('canvas.generationFailed');
    errorMessage.textContent = message || title;
    errorModal.classList.add('open');
    refreshIcons();
}
function apiErrorMessage(data, fallback='请求失败'){
    if(!data) return fallback;
    if(typeof data === 'string') return data || fallback;
    const detail = data.detail ?? data.error ?? data.message;
    if(typeof detail === 'string') return detail || fallback;
    if(Array.isArray(detail)){
        const messages = detail.map(item => {
            if(typeof item === 'string') return item;
            const loc = Array.isArray(item?.loc) ? item.loc.filter(x => x !== 'body').join('.') : '';
            const msg = item?.msg || item?.message || JSON.stringify(item);
            return loc ? `${loc}: ${msg}` : msg;
        }).filter(Boolean);
        return messages.join('\n') || fallback;
    }
    if(detail && typeof detail === 'object'){
        return detail.message || detail.msg || JSON.stringify(detail);
    }
    try {
        return JSON.stringify(data);
    } catch(e) {
        return fallback;
    }
}
async function responseErrorMessage(response, fallback='请求失败'){
    try {
        const data = await response.clone().json();
        return apiErrorMessage(data, fallback);
    } catch(e) {
        try {
            const text = await response.text();
            return text || fallback;
        } catch(_) {
            return fallback;
        }
    }
}
function closeErrorModal(){
    if(errorModal) errorModal.classList.remove('open');
}
async function copyErrorMessage(){
    const text = errorMessage?.textContent || '';
    if(!text) return;
    try {
        await navigator.clipboard.writeText(text);
    } catch(e) {
        const range = document.createRange();
        range.selectNodeContents(errorMessage);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }
}
async function copyTextToClipboard(text){
    const value = String(text || '');
    if(!value) return false;
    try {
        if(navigator.clipboard?.writeText){
            await navigator.clipboard.writeText(value);
            return true;
        }
    } catch(_) {}
    try {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
    } catch(_) {
        return false;
    }
}
function parseRatioValue(value){
    const raw = String(value || '').trim();
    if(!raw) return null;
    if(raw.includes(':')){
        const [w,h] = raw.split(':').map(Number);
        if(w > 0 && h > 0) return w / h;
    }
    const n = Number(raw);
    return n > 0 ? n : null;
}
function parseSizeValue(value){
    const match = String(value || '').trim().match(/^(\d+)\s*[xX*]\s*(\d+)$/);
    return match ? {width:match[1], height:match[2]} : null;
}
function gcdInt(a, b){
    a = Math.abs(Math.round(Number(a) || 0));
    b = Math.abs(Math.round(Number(b) || 0));
    while(b){ const t = b; b = a % b; a = t; }
    return a || 1;
}
function ratioPartsFromDimensions(width, height){
    const w = Math.max(1, Math.round(Number(width) || 1));
    const h = Math.max(1, Math.round(Number(height) || 1));
    const target = w / h;
    let best = {width:1, height:1, score:Infinity};
    const maxPart = 21;
    for(let rw = 1; rw <= maxPart; rw++){
        for(let rh = 1; rh <= maxPart; rh++){
            const ratio = rw / rh;
            const relativeError = Math.abs(ratio - target) / target;
            const complexityPenalty = Math.max(rw, rh) * 0.0008;
            const score = relativeError + complexityPenalty;
            if(score < best.score) best = {width:rw, height:rh, score};
        }
    }
    const g = gcdInt(best.width, best.height);
    return {width:best.width / g, height:best.height / g};
}
function apiImageSize(ratioValue, resolutionValue, customRatioValue = '', customSizeValue = ''){
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
function normalizeApiNodeSizeChoice(node){
    if(!node) return;
}
async function generatorSizeForRun(gen, refs){
    if((gen.ratio || 'square') === 'source'){
        const ref = refs?.[0];
        if(ref?.url){
            try {
                const dims = await getImageDimensions(ref.url);
                const parts = ratioPartsFromDimensions(dims.width, dims.height);
                gen.customRatioWidth = String(parts.width);
                gen.customRatioHeight = String(parts.height);
                gen.customRatio = `${parts.width}:${parts.height}`;
            } catch(_) {}
        }
    }
    const ratio = (gen.ratio === 'source' && !gen.customRatio)
        ? 'square'
        : (gen.ratio ?? 'square');
    return apiImageSize(ratio, gen.resolution || '1k', gen.customRatio || '', gen.customSize || '');
}
function normalizeApiNodeLayout(node){
    if(!node || node.type !== 'generator') return;
    if(Number(node.w || 0) === 418) node.w = 380;
}
function imageModelOptions(selectedModel, providerId){
    if(!imageApiProviders().length){
        return `<option value="" disabled selected>${tr('canvas.noApiProvidersHint') || '暂无 API 平台，请到 API 设置添加'}</option>`;
    }
    const models = allImageModels(providerId);
    if(!models.length){
        return `<option value="" disabled selected>${tr('canvas.noImageModelsHint') || '暂无生图模型，请到 API 设置添加'}</option>`;
    }
    const selectedValue = resolveImageModel(selectedModel);
    const options = models.map(model => `<option value="${escapeHtml(model)}" ${model === selectedValue ? 'selected' : ''}>${escapeHtml(model)}</option>`).join('');
    const hasSelected = models.includes(selectedValue);
    return `${hasSelected || !selectedValue ? '' : `<option value="${escapeHtml(selectedValue)}" selected>${escapeHtml(selectedValue)}</option>`}${options}`;
}
function chatModelOptions(selectedModel, providerId=''){
    const models = providerId ? providerChatModels(providerId) : allChatModels();
    if(!models.length){
        return `<option value="" disabled selected>${tr('canvas.noModelsHint') || '暂无模型，请到 API 设置添加'}</option>`;
    }
    const selectedValue = resolveChatModel(selectedModel, providerId);
    const options = models.map(model => `<option value="${escapeHtml(model)}" ${model === selectedValue ? 'selected' : ''}>${escapeHtml(model)}</option>`).join('');
    const hasSelected = models.includes(selectedValue);
    return `${hasSelected || !selectedValue ? '' : `<option value="${escapeHtml(selectedValue)}" selected>${escapeHtml(selectedValue)}</option>`}${options}`;
}
function formatCanvasTime(value){
    if(!value) return '--';
    const raw = Number(value);
    const time = raw < 10000000000 ? raw * 1000 : raw;
    const date = new Date(time);
    if(Number.isNaN(date.getTime())) return '--';
    return date.toLocaleString(window.StudioI18n?.lang() === 'en' ? 'en-US' : 'zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
}
function setStatus(text){
    document.getElementById('saveState').textContent = text;
    if(gateStatus) gateStatus.textContent = text;
}
function refreshGateViewControls(){
    canvasGate.classList.toggle('trash-mode', trashMode);
    if(gateTitleText) gateTitleText.textContent = trashMode ? tr('canvas.trash') : tr('canvas.selectCanvas');
    if(gateSubtitle) gateSubtitle.textContent = trashMode ? tr('canvas.trashSubtitle') : tr('canvas.subtitle');
    const trashCount = deletedCanvases.length;
    if(gateTrashCount){
        gateTrashCount.textContent = String(trashCount);
        gateTrashCount.classList.toggle('visible', trashCount > 0);
    }
    const countPill = document.getElementById('gateCountPill');
    if(countPill){
        const items = trashMode ? deletedCanvases : canvases;
        const suffix = tr('canvas.countSuffix');
        countPill.textContent = suffix ? `${items.length} ${suffix}` : String(items.length);
    }
}
function setCanvasMode(open){
    shell.classList.toggle('no-canvas', !open);
    if(!open){
        nodesEl.innerHTML = '';
        linksEl.innerHTML = '';
        linkControlsEl.innerHTML = '';
        selectionHub.classList.remove('open');
    } else if(currentCanvasTitle) {
        currentCanvasTitle.textContent = canvas?.title || tr('canvas.untitled');
        currentCanvasTime.textContent = formatCanvasTime(canvas?.updated_at || canvas?.created_at);
    }
    refreshIcons();
}
function ensureCanvas(){
    if(canvas) return true;
    setStatus(tr('canvas.needCanvas'));
    return false;
}
function setCreateMode(active, kind='classic'){
    creatingCanvas = active;
    createCanvasKind = active ? ((kind === 'smart') ? 'smart' : 'classic') : 'classic';
    if(active) trashMode = false;
    canvasGate.classList.toggle('creating', active);
    refreshGateViewControls();
    setStatus(active ? tr('canvas.enterCanvasName') : (canvases.length ? tr('canvas.chooseFirst') : tr('canvas.noCanvasCreateFirst')));
    if(active) {
        gateTitleInput.placeholder = createCanvasKind === 'smart'
            ? (tr('canvas.newSmartCanvasPlaceholder') || tr('canvas.newCanvasPlaceholder'))
            : tr('canvas.newCanvasPlaceholder');
        gateTitleInput.focus();
        gateTitleInput.select();
    } else {
        gateTitleInput.value = '';
        gateTitleInput.placeholder = tr('canvas.newCanvasPlaceholder');
    }
    refreshIcons();
}
function screenToWorld(clientX, clientY){
    const rect = board.getBoundingClientRect();
    return { x:(clientX - rect.left - viewport.x) / viewport.scale, y:(clientY - rect.top - viewport.y) / viewport.scale };
}
function applyViewport(){
    world.style.transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`;
    scheduleMinimapRender();
}
function estimatedNodeRect(n){
    const el = nodesEl?.querySelector?.(`.node[data-id="${CSS.escape(n.id)}"]`);
    const size = defaultNodeSize(n.type);
    const w = el?.offsetWidth || n.w || size.w || 260;
    const h = el?.offsetHeight || n.h || size.h || 160;
    return {x:n.x || 0, y:n.y || 0, w, h};
}
function currentWorldViewRect(){
    const rect = board.getBoundingClientRect();
    const scale = viewport.scale || 1;
    return {
        x:-viewport.x / scale,
        y:-viewport.y / scale,
        w:rect.width / scale,
        h:rect.height / scale
    };
}
function minimapBounds(){
    const rects = (nodes || []).map(estimatedNodeRect);
    rects.push(currentWorldViewRect());
    if(!rects.length) return {x:0, y:0, w:1000, h:700};
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    rects.forEach(r => {
        minX = Math.min(minX, r.x);
        minY = Math.min(minY, r.y);
        maxX = Math.max(maxX, r.x + r.w);
        maxY = Math.max(maxY, r.y + r.h);
    });
    const pad = Math.max(240, Math.max(maxX - minX, maxY - minY) * 0.08);
    return {x:minX - pad, y:minY - pad, w:Math.max(1, maxX - minX + pad * 2), h:Math.max(1, maxY - minY + pad * 2)};
}
function scheduleMinimapRender(){
    if(minimapRenderQueued) return;
    minimapRenderQueued = true;
    requestAnimationFrame(() => {
        minimapRenderQueued = false;
        renderMinimap();
    });
}
function renderMinimap(){
    if(!minimapContent || !minimapViewport) return;
    const bounds = minimapBounds();
    const cw = minimapContent.clientWidth || 172;
    const ch = minimapContent.clientHeight || 110;
    const scale = Math.min(cw / bounds.w, ch / bounds.h);
    const mapW = bounds.w * scale;
    const mapH = bounds.h * scale;
    const ox = (cw - mapW) / 2;
    const oy = (ch - mapH) / 2;
    minimapState = {bounds, scale, ox, oy, cw, ch};
    const nodeHtml = (nodes || []).map(n => {
        const r = estimatedNodeRect(n);
        return `<div class="minimap-node ${selected.has(n.id) ? 'selected' : ''}" style="left:${ox + (r.x - bounds.x) * scale}px;top:${oy + (r.y - bounds.y) * scale}px;width:${Math.max(3, r.w * scale)}px;height:${Math.max(3, r.h * scale)}px"></div>`;
    }).join('');
    minimapContent.innerHTML = `${nodeHtml}${nodes?.length ? '' : '<div class="minimap-empty">EMPTY</div>'}<div id="minimapViewport" class="minimap-viewport"></div>`;
    minimapViewport = document.getElementById('minimapViewport');
    updateMinimapViewport();
}
function updateMinimapViewport(){
    if(!minimapViewport || !minimapState) return;
    const r = currentWorldViewRect();
    const {bounds, scale, ox, oy} = minimapState;
    minimapViewport.style.left = `${ox + (r.x - bounds.x) * scale}px`;
    minimapViewport.style.top = `${oy + (r.y - bounds.y) * scale}px`;
    minimapViewport.style.width = `${Math.max(8, r.w * scale)}px`;
    minimapViewport.style.height = `${Math.max(8, r.h * scale)}px`;
}
function minimapEventToWorld(e){
    if(!minimapState) renderMinimap();
    const state = minimapState;
    const rect = minimapContent.getBoundingClientRect();
    const x = (e.clientX - rect.left - state.ox) / state.scale + state.bounds.x;
    const y = (e.clientY - rect.top - state.oy) / state.scale + state.bounds.y;
    return {x, y};
}
function centerViewportOnWorldPoint(point){
    const rect = board.getBoundingClientRect();
    viewport.x = rect.width / 2 - point.x * viewport.scale;
    viewport.y = rect.height / 2 - point.y * viewport.scale;
    applyViewport();
    renderLinks();
    renderSelectionHub();
}
function refreshGeometry(){
    renderLinks();
    renderSelectionHub();
}
function refreshGeometryAfterLayout(){
    requestAnimationFrame(() => {
        refreshGeometry();
        requestAnimationFrame(refreshGeometry);
    });
}
function scheduleSave(){
    if(!canvas || applyingRemoteCanvas) return;
    localCanvasDirty = true;
    setStatus('Saving...');
    clearTimeout(saveTimer);
    if(savingCanvasNow){
        saveCanvasAgain = true;
        return;
    }
    saveTimer = setTimeout(saveCanvas, 500);
}
function refreshOutputTimer(){
    const hasPending = nodes.some(n => n.type === 'output' && (n._pending || []).length);
    if(hasPending && !outputTimer){
        outputTimer = setInterval(() => {
            const pendingById = new Map();
            nodes.filter(n => n.type === 'output').forEach(node => {
                (node._pending || []).forEach(p => pendingById.set(p.id, p));
            });
            if(pendingById.size){
                document.querySelectorAll('.output-time-pill.running').forEach(pill => {
                    const pendingId = pill.closest('[data-pending-id]')?.dataset.pendingId;
                    const pending = pendingById.get(pendingId);
                    if(pending) pill.textContent = formatRunDuration(nowMs() - Number(pending.startedAt || nowMs()));
                });
            } else {
                clearInterval(outputTimer);
                outputTimer = null;
            }
        }, 1000);
    } else if(!hasPending && outputTimer){
        clearInterval(outputTimer);
        outputTimer = null;
    }
}
async function saveCanvas(){
    if(!canvas || applyingRemoteCanvas) return;
    if(savingCanvasNow){
        saveCanvasAgain = true;
        return;
    }
    sanitizeConnections();
    savingCanvasNow = true;
    saveCanvasAgain = false;
    try {
        const res = await fetch(`/api/canvases/${canvas.id}`, {
            method:'PUT',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({
                title:canvas.title,
                icon:canvas.icon || '🧩',
                nodes,
                connections,
                viewport,
                logs:canvas.logs || [],
                client_id:CLIENT_ID,
                base_updated_at:Number(lastCanvasUpdatedAt || canvas.updated_at || 0)
            })
        });
        if(res.status === 409){
            const data = await res.json().catch(() => ({}));
            const remote = data.detail?.canvas || data.canvas;
            if(localCanvasDirty || saveCanvasAgain){
                lastCanvasUpdatedAt = Number(data.detail?.updated_at || data.updated_at || remote?.updated_at || lastCanvasUpdatedAt || 0);
                saveCanvasAgain = true;
                setStatus('Saving...');
                return;
            }
            if(remote) applyRemoteCanvasData(remote);
            setStatus('Synced');
            return;
        }
        if(!res.ok) throw new Error('save failed');
        const data = await res.json().catch(() => ({}));
        if(data.canvas) canvas = {...canvas, ...data.canvas};
        canvas.updated_at = Number(canvas.updated_at || Date.now());
        lastCanvasUpdatedAt = canvas.updated_at;
        localCanvasDirty = Boolean(saveCanvasAgain);
        if(currentCanvasTime) currentCanvasTime.textContent = formatCanvasTime(canvas.updated_at);
        setStatus('Saved');
        loadCanvasList(false);
    } catch(e) {
        setStatus('Save failed');
        console.error(e);
    } finally {
        savingCanvasNow = false;
        if(saveCanvasAgain && canvas && !applyingRemoteCanvas){
            saveCanvasAgain = false;
            localCanvasDirty = true;
            setTimeout(saveCanvas, 0);
        }
    }
}

async function loadConfig(){
    loadLocalModelLists();
    try {
        const cfg = await fetch('/api/config').then(r=>r.json());
        imageModels = cfg.image_models?.length ? cfg.image_models : imageModels;
        chatModels = cfg.chat_models?.length ? cfg.chat_models : chatModels;
        videoModels = cfg.video_models?.length ? cfg.video_models : DEFAULT_VIDEO_MODELS;
        msChatModels = cfg.ms_chat_models?.length ? cfg.ms_chat_models : msChatModels;
        comfyBackendCount = Math.max(1, (cfg.comfy_instances || []).length || 1);
        apiProviders = Array.isArray(cfg.api_providers) && cfg.api_providers.length ? cfg.api_providers : defaultApiProviders();
        models.nano = imageModels.find(m => m.toLowerCase().includes('nano')) || 'nano-banana-pro';
        models.gpt = imageModels.find(m => !m.toLowerCase().includes('nano')) || cfg.image_model || 'gpt-image-2';
        try {
            const wf = await fetch('/api/workflows').then(r=>r.json());
            comfyWorkflows = wf.workflows || [];
        } catch(_) {
            comfyWorkflows = [];
        }
        runningHubWorkflowCache = {};
        const rhProvider = apiProviders.find(p => p.id === 'runninghub');
        const rhWorkflowIds = (rhProvider?.rh_workflows || []).map(item => String(item.workflowId || item.id || '').trim()).filter(Boolean);
        await Promise.all(rhWorkflowIds.map(async workflowId => {
            try { await ensureRunningHubWorkflow(workflowId); } catch(_) {}
        }));
    } catch(e) {
        apiProviders = defaultApiProviders();
    }
}

// 监听 API 设置页面的变更广播，实时刷新画布的模型/平台下拉
try {
    const apiChannel = new BroadcastChannel('studio-api');
    apiChannel.onmessage = async (e) => {
        if(e.data?.type === 'providers-changed' || e.data?.type === 'workflows-changed'){
            await loadConfig();
            pruneMissingComfyWorkflows();
            if(typeof render === 'function') render();
        }
    };
} catch(e) { /* 不支持 BroadcastChannel 的旧浏览器忽略 */ }
function msChatModelOptions(selected){
    // 单一数据源：从 API 设置里 modelscope 平台的 chat_models 取
    const msProvider = apiProviders.find(p => p.id === 'modelscope');
    const list = uniqueModels(msProvider?.chat_models || []);
    if(!list.length){
        return `<option value="" disabled selected>${tr('canvas.noModelsHint') || '暂无模型，请到 API 设置添加'}</option>`;
    }
    const sel = selected && list.includes(selected) ? selected : list[0];
    return list.map(m => `<option value="${escapeHtml(m)}" ${m === sel ? 'selected' : ''}>${escapeHtml(m.split('/').pop().split(':')[0])}</option>`).join('');
}
async function loadCanvasList(openFirst=true){
    try {
        const res = await fetch('/api/canvases');
        if(!res.ok) throw new Error(tr('canvas.canvasListFailed'));
        const data = await res.json();
        canvases = data.canvases || [];
        refreshGateViewControls();
        renderCanvasList();
        refreshTrashCount();
        if(openFirst && canvases[0]) await openCanvas(canvases[0].id);
        else if(!canvas) {
            setCanvasMode(false);
            setStatus(trashMode ? (deletedCanvases.length ? tr('canvas.trash') : tr('canvas.trashEmpty')) : (canvases.length ? tr('canvas.chooseFirst') : tr('canvas.noCanvasCreateFirst')));
        }
    } catch(e) {
        setStatus(tr('canvas.canvasListFailed'));
        console.error(e);
    }
}
async function loadTrashList(){
    try {
        const res = await fetch('/api/canvases/trash');
        if(!res.ok) throw new Error(tr('canvas.trashLoadFailed'));
        const data = await res.json();
        deletedCanvases = data.canvases || [];
        refreshGateViewControls();
        renderCanvasList();
        setStatus(deletedCanvases.length ? tr('canvas.trash') : tr('canvas.trashEmpty'));
    } catch(e) {
        setStatus(tr('canvas.trashLoadFailed'));
        console.error(e);
    }
}
async function refreshTrashCount(){
    if(trashMode) return;
    try {
        const res = await fetch('/api/canvases/trash');
        if(!res.ok) return;
        const data = await res.json();
        deletedCanvases = data.canvases || [];
        refreshGateViewControls();
    } catch(e) {}
}
async function setTrashMode(active){
    trashMode = active;
    creatingCanvas = false;
    pendingDeleteCanvasId = null;
    pendingPurgeCanvasId = null;
    emojiPickerCanvasId = null;
    canvasGate.classList.toggle('creating', false);
    refreshGateViewControls();
    if(trashMode) await loadTrashList();
    else await loadCanvasList(false);
    refreshIcons();
}
function renderCanvasList(){
    renderCanvasListInto(gateCanvasList);
}
function renderCanvasListInto(list){
    if(!list) return;
    refreshGateViewControls();
    const items = trashMode ? deletedCanvases : canvases;
    list.innerHTML = '';
    if(!items.length){
        const empty = document.createElement('div');
        empty.className = 'gate-list-empty';
        empty.innerHTML = trashMode
            ? `<div class="gate-list-empty-icon"><i data-lucide="trash-2" class="w-6 h-6"></i></div>${tr('canvas.trashEmpty')}`
            : `<div class="gate-list-empty-icon"><i data-lucide="layout-grid" class="w-6 h-6"></i></div>${tr('canvas.noCanvas')}<br>${tr('canvas.startWithNewCanvas')}`;
        list.appendChild(empty);
        refreshIcons();
        return;
    }
    items.forEach(item => {
        const row = document.createElement('div');
        const isSmartCanvas = (item.kind || 'classic') === 'smart';
        row.className = `canvas-item ${isSmartCanvas ? 'smart-canvas' : ''} ${canvas?.id === item.id ? 'active' : ''}`;
        row.innerHTML = `
            <div class="canvas-open" role="button" tabindex="${trashMode ? '-1' : '0'}">
                <div class="canvas-card-icon-row">
                    <span class="canvas-preview-mark" role="button" tabindex="0" title="${trashMode ? tr('canvas.deletedCanvas') : tr('canvas.changeIcon')}">${renderCanvasIcon(isSmartCanvas && /[^\x00-\x7F]/.test(item.icon || '') ? 'sparkles' : item.icon, 16)}</span>
                    ${isSmartCanvas ? `<span class="canvas-kind-chip">${tr('canvas.smartCanvasShort')}</span>` : ''}
                </div>
                <div class="canvas-card-title">${escapeHtml(item.title)}</div>
                <div class="canvas-card-meta">
                    <span class="canvas-card-meta-dot"></span>
                    <div class="canvas-card-time">${trashMode ? `${tr('canvas.deletedAt')} ${formatCanvasTime(item.deleted_at)}` : formatCanvasTime(item.updated_at || item.created_at)}</div>
                </div>
            </div>
            ${trashMode ? (pendingPurgeCanvasId === item.id ? `
                <div class="canvas-delete-confirm">
                    <div class="canvas-delete-box">
                        <div class="canvas-delete-title">${tr('canvas.purgeConfirm')}</div>
                        <div class="canvas-delete-actions">
                            <button class="canvas-confirm-btn" type="button">${tr('common.confirm')}</button>
                            <button class="canvas-cancel-btn" type="button">${tr('common.cancel')}</button>
                        </div>
                    </div>
                </div>
            ` : `
                <button class="canvas-delete canvas-restore" type="button" title="${tr('canvas.restoreCanvas')}" aria-label="${tr('canvas.restoreCanvas')} ${escapeHtml(item.title)}" style="right:42px">
                    <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i>
                </button>
                <button class="canvas-delete canvas-purge" type="button" title="${tr('canvas.purgeCanvas')}" aria-label="${tr('canvas.purgeCanvas')} ${escapeHtml(item.title)}">
                    <i data-lucide="x" class="w-3.5 h-3.5"></i>
                </button>
            `) : (pendingDeleteCanvasId === item.id ? `
                <div class="canvas-delete-confirm">
                    <div class="canvas-delete-box">
                        <div class="canvas-delete-title">${tr('canvas.moveToTrashConfirm')}</div>
                        <div class="canvas-delete-actions">
                            <button class="canvas-confirm-btn" type="button">${tr('common.confirm')}</button>
                            <button class="canvas-cancel-btn" type="button">${tr('common.cancel')}</button>
                        </div>
                    </div>
                </div>
            ` : `
                <button class="canvas-card-edit" type="button" title="${tr('canvas.rename')}" aria-label="${tr('canvas.rename')} ${escapeHtml(item.title)}">
                    <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                </button>
                <button class="canvas-delete" type="button" title="${tr('canvas.moveToTrash')}" aria-label="${tr('canvas.moveToTrash')} ${escapeHtml(item.title)}">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
            `)}
            ${!trashMode && emojiPickerCanvasId === item.id ? `
                <div class="emoji-picker">
                    ${CANVAS_EMOJIS.map(icon => `<button class="emoji-option" type="button" data-icon="${escapeHtml(icon)}">${renderCanvasIcon(icon, 14)}</button>`).join('')}
                </div>
            ` : ''}
        `;
        if(!trashMode) row.querySelector('.canvas-open').onclick = () => openCanvas(item.id);
        const titleEl = row.querySelector('.canvas-card-title');
        const editBtn = row.querySelector('.canvas-card-edit');
        if(editBtn && titleEl && !trashMode) {
            editBtn.onmousedown = e => e.stopPropagation();
            editBtn.onclick = e => { e.stopPropagation(); startTitleEdit(item.id, titleEl); };
        }
        const iconBtn = row.querySelector('.canvas-preview-mark');
        if(iconBtn && !trashMode) {
            iconBtn.onclick = e => toggleEmojiPicker(item.id, e);
            iconBtn.onkeydown = e => {
                if(e.key === 'Enter' || e.key === ' ') toggleEmojiPicker(item.id, e);
            };
        }
        row.querySelectorAll('.emoji-option').forEach(btn => {
            btn.onclick = e => setCanvasIcon(item.id, btn.dataset.icon, e);
        });
        const deleteBtn = row.querySelector('.canvas-delete');
        if(deleteBtn) deleteBtn.onclick = e => requestDeleteCanvas(item.id, e);
        const confirmBtn = row.querySelector('.canvas-confirm-btn');
        if(confirmBtn) confirmBtn.onclick = e => trashMode ? purgeCanvas(item.id, e) : deleteCanvas(item.id, e);
        const cancelBtn = row.querySelector('.canvas-cancel-btn');
        if(cancelBtn) cancelBtn.onclick = e => cancelDeleteCanvas(e);
        const restoreBtn = row.querySelector('.canvas-restore');
        if(restoreBtn) restoreBtn.onclick = e => restoreCanvas(item.id, e);
        const purgeBtn = row.querySelector('.canvas-purge');
        if(purgeBtn) purgeBtn.onclick = e => requestPurgeCanvas(item.id, e);
        list.appendChild(row);
    });
    refreshIcons();
}
async function createCanvas(){
    const customTitle = gateTitleInput?.value.trim();
    const isSmart = createCanvasKind === 'smart';
    const titleBase = isSmart ? tr('canvas.newSmartCanvas') : tr('canvas.newCanvas');
    const title = customTitle || `${titleBase} ${new Date().toLocaleTimeString(window.StudioI18n?.lang() === 'en' ? 'en-US' : 'zh-CN', {hour:'2-digit', minute:'2-digit'})}`;
    trashMode = false;
    refreshGateViewControls();
    setStatus('Creating...');
    try {
        const res = await fetch('/api/canvases', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({title, icon:isSmart ? 'sparkles' : '🧩', kind:isSmart ? 'smart' : 'classic'})
        });
        if(!res.ok) throw new Error(tr('canvas.createFailed'));
        const data = await res.json();
        if(isSmart){
            setCreateMode(false);
            await loadCanvasList(false);
            openSmartCanvasPage(data.canvas?.id);
            return;
        }
        canvas = data.canvas;
        canvas.logs = canvas.logs || [];
        nodes = canvas.nodes || [];
        connections = canvas.connections || [];
        viewport = canvas.viewport || {x:0, y:0, scale:1};
        sanitizeConnections();
        selected.clear();
        setCanvasMode(true);
        render();
        setStatus('Saved');
        setCreateMode(false);
        await loadCanvasList(false);
        renderCanvasList();
    } catch(e) {
        setStatus(tr('canvas.createFailed'));
        console.error(e);
    }
}
async function createSmartCanvas(){
    setCreateMode(true, 'smart');
}
function openSmartCanvasPage(id){
    if(!id) return;
    window.location.href = `/static/smart-canvas.html?id=${encodeURIComponent(id)}&v=2026.05.22.1`;
}
function toggleEmojiPicker(id, event){
    event?.preventDefault();
    event?.stopPropagation();
    pendingDeleteCanvasId = null;
    emojiPickerCanvasId = emojiPickerCanvasId === id ? null : id;
    renderCanvasList();
}
async function setCanvasIcon(id, icon, event){
    event?.preventDefault();
    event?.stopPropagation();
    const item = canvases.find(c => c.id === id);
    if(item) item.icon = icon || 'layers';
    emojiPickerCanvasId = null;
    renderCanvasList();
    try {
        let target = canvas?.id === id ? canvas : null;
        if(!target) {
            const data = await fetch(`/api/canvases/${id}`).then(r => r.json());
            target = data.canvas;
        }
        target.icon = icon || 'layers';
        const res = await fetch(`/api/canvases/${id}`, {
            method:'PUT',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({
                title:target.title,
                icon:target.icon,
                nodes:target.nodes || [],
                connections:target.connections || [],
                viewport:target.viewport || {x:0, y:0, scale:1}
            })
        });
        if(!res.ok) throw new Error('图标保存失败');
        if(canvas?.id === id) canvas.icon = target.icon;
        await loadCanvasList(false);
    } catch(e) {
        setStatus('图标保存失败');
        console.error(e);
    }
}
function startTitleEdit(id, titleEl){
    if(!titleEl || titleEl.querySelector('input')) return;
    const item = canvases.find(c => c.id === id);
    const current = item?.title || titleEl.textContent || '';
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 80;
    input.value = current;
    input.className = 'canvas-card-title-input';
    titleEl.innerHTML = '';
    titleEl.appendChild(input);
    input.onmousedown = e => e.stopPropagation();
    input.onclick = e => e.stopPropagation();
    input.focus();
    input.select();
    let done = false;
    const finish = async (commit) => {
        if(done) return;
        done = true;
        const newTitle = input.value.trim();
        if(commit && newTitle && newTitle !== current){
            await setCanvasTitle(id, newTitle);
        } else {
            renderCanvasList();
        }
    };
    input.onblur = () => finish(true);
    input.onkeydown = e => {
        e.stopPropagation();
        if(e.key === 'Enter'){ e.preventDefault(); finish(true); }
        if(e.key === 'Escape'){ e.preventDefault(); finish(false); }
    };
}
async function setCanvasTitle(id, title){
    const item = canvases.find(c => c.id === id);
    if(item) item.title = title;
    if(canvas?.id === id) canvas.title = title;
    renderCanvasList();
    try {
        let target = canvas?.id === id ? canvas : null;
        if(!target){
            const data = await fetch(`/api/canvases/${id}`).then(r => r.json());
            target = data.canvas;
        }
        target.title = title;
        const res = await fetch(`/api/canvases/${id}`, {
            method:'PUT',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({
                title:target.title,
                icon:target.icon,
                nodes:target.nodes || [],
                connections:target.connections || [],
                viewport:target.viewport || {x:0, y:0, scale:1}
            })
        });
        if(!res.ok) throw new Error('重命名失败');
        if(currentCanvasTitle && canvas?.id === id) currentCanvasTitle.textContent = title;
        await loadCanvasList(false);
    } catch(e){
        setStatus('重命名失败');
        console.error(e);
    }
}
async function openCanvas(id){
    setStatus('Opening...');
    try {
        const res = await fetch(`/api/canvases/${id}`);
        if(!res.ok) throw new Error(tr('canvas.openFailed'));
        const data = await res.json();
        canvas = data.canvas;
        if((canvas.kind || 'classic') === 'smart'){
            openSmartCanvasPage(canvas.id);
            return;
        }
        canvas.logs = canvas.logs || [];
        nodes = canvas.nodes || [];
        connections = canvas.connections || [];
        viewport = canvas.viewport || {x:0, y:0, scale:1};
        lastCanvasUpdatedAt = Number(canvas.updated_at || 0);
        localCanvasDirty = false;
        nodes.forEach(n => { if(n.running) n.running = false; });
        sanitizeConnections();
        pruneMissingComfyWorkflows();
        await refreshMissingCanvasAssets();
        selected.clear();
        setCanvasMode(true);
        renderCanvasList();
        render();
        resumeCanvasImageTasks();
        startCanvasRemotePolling();
        setStatus('Ready');
    } catch(e) {
        setStatus(tr('canvas.openFailed'));
        console.error(e);
    }
}
function applyRemoteCanvasData(remote){
    if(!remote || !canvas || remote.id !== canvas.id) return;
    applyingRemoteCanvas = true;
    try {
        canvas = remote;
        canvas.logs = canvas.logs || [];
        nodes = canvas.nodes || [];
        connections = canvas.connections || [];
        viewport = canvas.viewport || {x:0, y:0, scale:1};
        lastCanvasUpdatedAt = Number(canvas.updated_at || Date.now());
        localCanvasDirty = false;
        nodes.forEach(n => { if(n.running) n.running = false; });
        sanitizeConnections();
        pruneMissingComfyWorkflows();
        refreshMissingCanvasAssets().then(() => render());
        selected.clear();
        renderCanvasList();
        render();
        resumeCanvasImageTasks();
        if(currentCanvasTitle) currentCanvasTitle.textContent = canvas.title || tr('canvas.untitled');
        if(currentCanvasTime) currentCanvasTime.textContent = formatCanvasTime(canvas.updated_at || canvas.created_at);
        setStatus('Synced');
    } finally {
        applyingRemoteCanvas = false;
    }
}
function canvasLocalAssetUrls(){
    const urls = new Set();
    const add = value => {
        const url = outputUrlValue(value);
        if(url && (url.startsWith('/output/') || url.startsWith('/assets/'))) urls.add(url);
    };
    nodes.forEach(node => {
        if(node.url) add(node.url);
        (node.images || []).forEach(add);
        (node.generatedOutputs || []).forEach(add);
        Object.entries(node.imageComparisons || {}).forEach(([key, value]) => {
            add(key);
            add(value);
        });
    });
    (canvas?.logs || []).forEach(log => {
        (log.outputs || []).forEach(add);
        (log.refs || []).forEach(add);
        (log.run?.refs || []).forEach(add);
    });
    return [...urls];
}
async function refreshMissingCanvasAssets(){
    missingAssetUrls.clear();
    const urls = canvasLocalAssetUrls();
    if(!urls.length) return;
    try {
        const data = await fetch('/api/canvas-assets/check', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({urls})
        }).then(r => r.json());
        const exists = data.exists || {};
        Object.entries(exists).forEach(([url, ok]) => { if(!ok) missingAssetUrls.add(url); });
    } catch(e) {
        console.warn('canvas asset check failed', e);
    }
}
async function syncRemoteCanvasNow(){
    if(!canvas) return;
    try {
        const res = await fetch(`/api/canvases/${canvas.id}`);
        if(!res.ok) throw new Error(tr('canvas.openFailed'));
        const data = await res.json();
        const remote = data.canvas;
        if(Number(remote?.updated_at || 0) >= Number(lastCanvasUpdatedAt || 0)){
            applyRemoteCanvasData(remote);
        }
    } catch(e) {
        console.error(e);
        setStatus('Sync failed');
    }
}
async function checkRemoteCanvasVersion(){
    if(!canvas || applyingRemoteCanvas || remoteSyncBusy) return;
    if(document.hidden) return;
    remoteSyncBusy = true;
    try {
        const res = await fetch(`/api/canvases/${canvas.id}/meta`);
        if(!res.ok) throw new Error('meta failed');
        const meta = await res.json();
        const remoteUpdatedAt = Number(meta.updated_at || 0);
        if(remoteUpdatedAt > Number(lastCanvasUpdatedAt || 0)){
            await syncRemoteCanvasNow();
        }
    } catch(e) {
        // 轮询失败不打扰创作；下一轮会重试。
    } finally {
        remoteSyncBusy = false;
    }
}
function startCanvasRemotePolling(){
    stopCanvasRemotePolling();
    remoteSyncInterval = setInterval(checkRemoteCanvasVersion, 2500);
}
function stopCanvasRemotePolling(){
    if(remoteSyncInterval){
        clearInterval(remoteSyncInterval);
        remoteSyncInterval = null;
    }
}
function handleCanvasUpdatedMessage(data){
    if(!canvas || !data || data.type !== 'canvas_updated') return;
    if(data.client_id && data.client_id === CLIENT_ID) return;
    if(data.canvas_id !== canvas.id) return;
    const remoteUpdatedAt = Number(data.updated_at || 0);
    if(remoteUpdatedAt && remoteUpdatedAt <= Number(lastCanvasUpdatedAt || 0)) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    localCanvasDirty = false;
    clearTimeout(remoteSyncTimer);
    remoteSyncTimer = setTimeout(syncRemoteCanvasNow, savingCanvasNow ? 700 : 120);
    setStatus('Syncing...');
}
async function returnToCanvasManager(){
    clearTimeout(saveTimer);
    if(canvas && localCanvasDirty) await saveCanvas();
    stopCanvasRemotePolling();
    canvas = null;
    nodes = [];
    connections = [];
    selected.clear();
    viewport = {x: -1800, y: -1000, scale: 1};
    setCanvasMode(false);
    trashMode = false;
    pendingPurgeCanvasId = null;
    refreshGateViewControls();
    await loadCanvasList(false);
    setCreateMode(false);
}
function requestDeleteCanvas(id, event){
    event?.preventDefault();
    event?.stopPropagation();
    emojiPickerCanvasId = null;
    pendingPurgeCanvasId = null;
    pendingDeleteCanvasId = id;
    renderCanvasList();
}
function requestPurgeCanvas(id, event){
    event?.preventDefault();
    event?.stopPropagation();
    emojiPickerCanvasId = null;
    pendingDeleteCanvasId = null;
    pendingPurgeCanvasId = id;
    renderCanvasList();
}
function cancelDeleteCanvas(event){
    event?.preventDefault();
    event?.stopPropagation();
    pendingDeleteCanvasId = null;
    pendingPurgeCanvasId = null;
    renderCanvasList();
}
async function deleteCanvas(id, event){
    event?.preventDefault();
    event?.stopPropagation();
    setStatus('Moving to trash...');
    try {
        const res = await fetch(`/api/canvases/${id}`, {method:'DELETE'});
        if(!res.ok) throw new Error(tr('canvas.moveToTrashFailed'));
        const deletingCurrent = canvas?.id === id;
        pendingDeleteCanvasId = null;
        canvases = canvases.filter(item => item.id !== id);
        if(deletingCurrent){
            canvas = null;
            nodes = [];
            connections = [];
            selected.clear();
            viewport = {x: -1800, y: -1000, scale: 1};
            setCanvasMode(false);
        }
        renderCanvasList();
        setStatus(canvases.length ? tr('canvas.movedToTrash') : tr('canvas.noCanvasCreateFirst'));
        await loadCanvasList(false);
    } catch(e) {
        setStatus(tr('canvas.moveToTrashFailed'));
        console.error(e);
    }
}
async function restoreCanvas(id, event){
    event?.preventDefault();
    event?.stopPropagation();
    setStatus('Restoring...');
    try {
        const res = await fetch(`/api/canvases/${id}/restore`, {method:'POST'});
        if(!res.ok) throw new Error(tr('canvas.restoreFailed'));
        pendingPurgeCanvasId = null;
        deletedCanvases = deletedCanvases.filter(item => item.id !== id);
        await loadCanvasList(false);
        await loadTrashList();
        setStatus(tr('canvas.restored'));
    } catch(e) {
        setStatus(tr('canvas.restoreFailed'));
        console.error(e);
    }
}
async function purgeCanvas(id, event){
    event?.preventDefault();
    event?.stopPropagation();
    setStatus('Deleting...');
    try {
        const res = await fetch(`/api/canvases/${id}/purge`, {method:'DELETE'});
        if(!res.ok) throw new Error(tr('canvas.purgeFailed'));
        pendingPurgeCanvasId = null;
        deletedCanvases = deletedCanvases.filter(item => item.id !== id);
        renderCanvasList();
        setStatus(deletedCanvases.length ? tr('canvas.purged') : tr('canvas.trashEmpty'));
        await loadTrashList();
    } catch(e) {
        setStatus(tr('canvas.purgeFailed'));
        console.error(e);
    }
}
window.createCanvas = createCanvas;
window.createSmartCanvas = createSmartCanvas;
window.loadCanvasList = loadCanvasList;
window.openCanvas = openCanvas;
window.deleteCanvas = deleteCanvas;
window.returnToCanvasManager = returnToCanvasManager;
gateCreateBtn.addEventListener('click', () => setCreateMode(true));
gateCreateSmartBtn?.addEventListener('click', createSmartCanvas);
gateBackBtn.addEventListener('click', () => setTrashMode(false));
gateTrashBtn.addEventListener('click', () => setTrashMode(true));
gateRefreshBtn.addEventListener('click', () => trashMode ? loadTrashList() : loadCanvasList(false));
gateConfirmBtn.addEventListener('click', createCanvas);
gateCancelBtn.addEventListener('click', () => setCreateMode(false));
gateTitleInput.addEventListener('keydown', e => {
    if(e.key === 'Enter') createCanvas();
    if(e.key === 'Escape') setCreateMode(false);
});
document.addEventListener('mousedown', e => {
    if(emojiPickerCanvasId === null) return;
    if(e.target.closest('.emoji-picker') || e.target.closest('.canvas-preview-mark')) return;
    emojiPickerCanvasId = null;
    renderCanvasList();
});
window.addEventListener('studio-theme-change', event => applyTheme(event.detail?.theme || 'light'));
document.getElementById('cropBox').addEventListener('mousedown', event => beginCropDrag(event, 'move'));
document.getElementById('cropHandle').addEventListener('mousedown', event => beginCropDrag(event, 'resize'));
document.getElementById('outpaintFrame')?.addEventListener('mousedown', event => {
    if(event.target.closest('[data-outpaint-handle]')) return;
    document.getElementById('cropCanvas')?.classList.add('dragging-image');
    beginCropDrag(event, 'image');
});
document.querySelectorAll('[data-outpaint-handle]').forEach(handle => {
    handle.addEventListener('mousedown', event => beginCropDrag(event, `outpaint-${handle.dataset.outpaintHandle || 'corner'}`));
});
document.getElementById('cropImage')?.addEventListener('mousedown', event => {
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
// 图片编辑区滚轮缩放
document.getElementById('imageEditStage').addEventListener('wheel', event => {
    if(!cropState) return;
    event.preventDefault();
    event.stopPropagation();
    const stage = event.currentTarget;
    const oldZoom = imageEditZoom;
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    imageEditZoom = Math.max(0.15, Math.min(6.0, imageEditZoom * factor));
    // 焦点缩放：保持鼠标指向的图片位置不动
    const stageRect = stage.getBoundingClientRect();
    const mx = event.clientX - stageRect.left; // 鼠标在 stage 内偏移
    const my = event.clientY - stageRect.top;
    const contentX = stage.scrollLeft + mx;
    const contentY = stage.scrollTop + my;
    applyImageEditZoom();
    const scale = imageEditZoom / oldZoom;
    stage.scrollLeft = contentX * scale - mx;
    stage.scrollTop = contentY * scale - my;
}, {passive: false});
window.addEventListener('resize', () => {
    if(cropState) syncImageEditOverflow();
});
backToManagerBtn.addEventListener('click', returnToCanvasManager);

function addNode(node){
    if(!ensureCanvas()) return;
    nodes.push(node);
    render();
    scheduleSave();
    return node;
}
function defaultPoint(dx=0, dy=0){ return screenToWorld(window.innerWidth / 2 + dx, window.innerHeight / 2 + dy); }
function addImageNode(point){
    const p = point || defaultPoint(-120, 0);
    return addNode({id:uid('img'), type:'image', x:p.x, y:p.y, url:'', name:'空白图片'});
}
function addPromptNode(point){
    const p = point || defaultPoint(0, 0);
    return addNode({id:uid('prompt'), type:'prompt', x:p.x, y:p.y, text:''});
}
function addLoopNode(point){
    const p = point || defaultPoint(40, 0);
    return addNode({
        id:uid('loop'),
        type:'loop',
        x:p.x,
        y:p.y,
        count:3,
        mode:'serial',
        showPrompt:false,
        variablePrompt:'',
        fixedPrompt:''
    });
}
function addGroupNode(point){
    const p = point || defaultPoint(40, 0);
    return addNode({id:uid('grp'), type:'group', x:p.x, y:p.y, w:300, h:220, items:[]});
}
function pickMediaForNode(nodeId){
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*,audio/*';
    input.multiple = true;
    input.onchange = () => {
        if(input.files?.length) fillImageNode(nodeId, input.files, {group:input.files.length > 1});
    };
    input.click();
}
function addLLMNode(point){
    const p = point || defaultPoint(80, 0);
    const providerId = chatApiProviders()[0]?.id || 'comfly';
    return addNode({
        id:uid('llm'),
        type:'llm',
        x:p.x,
        y:p.y,
        llmProvider:providerId,
        model:resolveChatModel('', providerId),
        mode:'node',
        systemPrompt:'You are a helpful assistant. Rewrite the input into a concise image prompt.',
        chatInput:'',
        messages:[],
        outputText:'',
        llmInputHeight:110,
        llmOutputHeight:150,
        running:false
    });
}
function addGeneratorNode(point){
    const p = point || defaultPoint(120, 0);
    const providerId = imageApiProviders()[0]?.id || '';
    return addNode({id:uid('gen'), type:'generator', x:p.x, y:p.y, apiProvider:providerId, model:allImageModels(providerId)[0] || '', ratio:'square', resolution:'1k', customRatio:'', customSize:'', customRatioWidth:'', customRatioHeight:'', customWidth:'', customHeight:'', inputs:[]});
}
function addMsGenNode(point){
    const p = point || defaultPoint(140, 0);
    return addNode({
        id:uid('msgen'),
        type:'msgen',
        x:p.x,
        y:p.y,
        msgenModel:'zimage',
        msWidth:1024,
        msHeight:1024,
        msCustomModel:modelscopeImageModels()[0] || 'Tongyi-MAI/Z-Image-Turbo',
        msRatio:'square',
        msResolution:'1k',
        msCustomRatio:'',
        msCustomSize:'',
        msCustomRatioWidth:'',
        msCustomRatioHeight:'',
        msCustomWidth:'',
        msCustomHeight:'',
        count:1,
        fitImage:false,
        inputs:[],
        running:false
    });
}
function addVideoNode(point){
    const p = point || defaultPoint(160, 0);
    const providerId = videoApiProviders()[0]?.id || 'comfly';
    return addNode({
        id:uid('vid'),
        type:'video',
        x:p.x,
        y:p.y,
        apiProvider:providerId,
        model:videoModels[0] || DEFAULT_VIDEO_MODELS[0],
        duration:5,
        aspectRatio:'16:9',
        resolution:'',
        enhancePrompt:false,
        enableUpsample:false,
        watermark:false,
        cameraFixed:false,
        generateAudio:false,
        useFrameRoles:false,
        inputs:[],
        running:false
    });
}
function addRhNode(point){
    const p = point || defaultPoint(180, 0);
    return addNode({
        id:uid('rh'),
        type:'rh',
        x:p.x,
        y:p.y,
        w:430,
        h:0,
        rhMode:'app',
        rhPayment:'free',
        webappId:'',
        workflowId:'',
        instanceType:'',
        rhAppInfo:null,
        rhWorkflowInfo:null,
        rhParams:{},
        inputs:[],
        running:false
    });
}
async function getImageDimensions(url){
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({width: img.naturalWidth, height: img.naturalHeight});
        img.onerror = () => reject(new Error('图片加载失败'));
        img.src = url;
    });
}
async function urlToBase64(url){
    const res = await fetch(url);
    if(!res.ok) throw new Error('图片读取失败');
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}
function renderMsGenBody(node){
    const wrap = document.createElement('div');
    wrap.className = 'generator-body';
    const modelKey = node.msgenModel || 'zimage';
    const msModel = MS_GEN_MODELS[modelKey] || MS_GEN_MODELS.zimage;
    const inputSources = generatorSources(node);
    const ordered = orderedSources(node, inputSources);
    const imageInputs = ordered.filter(src => src.refs?.length);
    const promptInputs = ordered.filter(src => src.prompt && !src.refs?.length);
    const referenceImages = ordered.flatMap(src => src.refs || []);
    const isCustomMs = modelKey === 'custom';
    const msUsesImages = Boolean(msModel.supportsImage || msModel.acceptsImage);
    node.msCustomModel = node.msCustomModel || modelscopeImageModels()[0] || 'Tongyi-MAI/Z-Image-Turbo';
    const msModelId = currentMsModelId(modelKey, node);
    const msLoras = modelscopeLorasForModel(msModelId);
    const selectedMsLora = msLoras.find(lora => String(lora.id || '').trim() === String(node.msLoraId || '').trim()) || msLoras[0];
    const loraEnabled = Boolean(node.msLoraEnabled);
    const loraStrength = node.msLoraStrength ?? Number(selectedMsLora?.strength ?? 0.8);
    const msCount = Math.max(1, Math.min(8, Number(node.count || 1)));
    wrap.innerHTML = `
        <div class="ms-model-tabs">
            ${Object.entries(MS_GEN_MODELS).map(([k,m]) =>
                `<button type="button" data-model="${k}" class="${modelKey===k?'active':''}">${escapeHtml(m.labelKey ? tr(m.labelKey) : m.label)}</button>`
            ).join('')}
        </div>
        <div class="ms-content">
            <div class="prompt-list mt-2 mb-2"></div>
            ${msUsesImages ? `
            <div class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">${tr('canvas.images')}</div>
            <div class="input-list ms-img-list"></div>
            ` : ''}
        </div>
        <div class="ms-controls">
            <div class="gen-settings">
                ${isCustomMs ? `
                <div class="gen-settings-row">
                    <select class="select-lite ms-custom-model-select">${modelscopeImageModelOptions(node.msCustomModel)}</select>
                </div>
                ` : ''}
                <div class="gen-settings-row">
                    <select class="select-lite resolution compact-select" data-field="msResolution">
                        <option value="1k">1K</option>
                        <option value="2k">2K</option>
                        <option value="4k">4K</option>
                    <option value="custom">${tr('canvas.custom')}</option>
                </select>
                <select class="select-lite ratio compact-select" data-field="msRatio">
                    <option value="square">1:1</option>
                    <option value="portrait">2:3</option>
                    <option value="landscape">3:2</option>
                        <option value="portrait43">3:4</option>
                        <option value="landscape43">4:3</option>
                        <option value="story">9:16</option>
                        <option value="wide">16:9</option>
                        <option value="custom">${tr('canvas.custom')}</option>
                    </select>
                    <div class="gen-count-row">
                        <div class="gen-stepper">
                            <button class="gen-step-btn" data-ms-step="-1" type="button" title="${tr('canvas.decrease')}" aria-label="${tr('canvas.decreaseCount')}"><i data-lucide="chevron-left" class="w-3.5 h-3.5"></i></button>
                            <input class="gen-count-input ms-count-input" type="text" inputmode="numeric" pattern="[0-9]*" value="${msCount}">
                            <button class="gen-step-btn" data-ms-step="1" type="button" title="${tr('canvas.increase')}" aria-label="${tr('canvas.increaseCount')}"><i data-lucide="chevron-right" class="w-3.5 h-3.5"></i></button>
                        </div>
                    </div>
                </div>
                <div class="gen-settings-row ms-custom-ratio-row" style="display:none">
                    <label class="field">
                        <div class="setting-title">${tr('canvas.ratioWidth')}</div>
                        <input class="setting-input ms-custom-ratio-w-input" type="number" min="1" step="1" value="${escapeHtml(node.msCustomRatioWidth || '')}" placeholder="4">
                    </label>
                    <label class="field">
                        <div class="setting-title">${tr('canvas.ratioHeight')}</div>
                        <input class="setting-input ms-custom-ratio-h-input" type="number" min="1" step="1" value="${escapeHtml(node.msCustomRatioHeight || '')}" placeholder="3">
                    </label>
                </div>
                <div class="gen-settings-row ms-custom-size-row" style="display:none">
                    <label class="field">
                        <div class="setting-title">${tr('canvas.width')}</div>
                        <input class="setting-input ms-custom-w-input" type="number" min="64" step="64" value="${escapeHtml(node.msCustomWidth || '')}" placeholder="Auto">
                    </label>
                    <label class="field">
                        <div class="setting-title">${tr('canvas.height')}</div>
                        <input class="setting-input ms-custom-h-input" type="number" min="64" step="64" value="${escapeHtml(node.msCustomHeight || '')}" placeholder="Auto">
                    </label>
                    <button class="secondary-btn ms-fit-size-btn" type="button" style="height:32px;align-self:flex-end;padding:0 10px;font-size:11px">${tr('canvas.fitImageSize')}</button>
                </div>
                ${msLoras.length ? `
                <div class="gen-settings-row">
                    <label class="setting-check" style="cursor:pointer">
                        <input type="checkbox" class="ms-lora-check" ${node.msLoraEnabled ? 'checked' : ''}>
                        <span style="font-size:11px;font-weight:700">${tr('canvas.enableLora')}</span>
                    </label>
                </div>
                ${node.msLoraEnabled ? `
                <div class="gen-settings-row">
                    <label class="field" style="flex:1">
                        <div class="setting-title">LoRA</div>
                        <select class="select-lite ms-lora-select">${modelscopeLoraOptions(msLoras, String(selectedMsLora?.id || '').trim())}</select>
                    </label>
                </div>
                <div class="gen-settings-row">
                    <label class="field" style="flex:1">
                        <div class="setting-title" style="display:flex;justify-content:space-between">
                            <span>${tr('canvas.loraStrength')}</span><span class="ms-lora-strength-val">${loraStrength.toFixed(2)}</span>
                        </div>
                        <input type="range" class="canvas-range ms-lora-strength-slider" min="0.1" max="1.0" step="0.05" value="${loraStrength}">
                    </label>
                </div>` : ''}` : ''}
                ${!msLoras.length ? `<div class="gen-settings-row"><div style="color:var(--faint);font-size:11px;font-weight:700;line-height:1.45">${tr('canvas.noLoraForModel')}</div></div>` : ''}
            </div>
            <div class="gen-run-row">
                <button class="gen-btn ${node.running?'running':''}" ${node.running?'disabled':''}>
                    <i data-lucide="zap" class="w-4 h-4"></i>${node.running ? tr('canvas.generating') : tr('canvas.msGenerate')}
                </button>
                ${cascadeBtnHtml(node)}
            </div>
            ${retryBarHtml(node)}
        </div>
    `;
    wrap.querySelectorAll('.ms-model-tabs button').forEach(btn => {
        btn.onclick = e => {
            e.stopPropagation();
            if(node.msgenModel !== btn.dataset.model){
                node.msLoraId = '';
                delete node.msLoraStrength;
                node.msLoraEnabled = false;
            }
            node.msgenModel = btn.dataset.model;
            render();
            scheduleSave();
        };
    });
    const msCustomModelSelect = wrap.querySelector('.ms-custom-model-select');
    if(msCustomModelSelect){
        msCustomModelSelect.onmousedown = e => e.stopPropagation();
        msCustomModelSelect.onclick = e => e.stopPropagation();
        msCustomModelSelect.onchange = e => {
            e.stopPropagation();
            node.msCustomModel = e.target.value;
            node.msLoraId = '';
            delete node.msLoraStrength;
            node.msLoraEnabled = false;
            scheduleSave();
            render();
        };
    }
    const msRatioSelect = wrap.querySelector('[data-field="msRatio"]');
    const msResolutionSelect = wrap.querySelector('[data-field="msResolution"]');
    if(msRatioSelect && msResolutionSelect){
        const msCustomRatioRow = wrap.querySelector('.ms-custom-ratio-row');
        const msCustomSizeRow = wrap.querySelector('.ms-custom-size-row');
        const msCustomRatioWInput = wrap.querySelector('.ms-custom-ratio-w-input');
        const msCustomRatioHInput = wrap.querySelector('.ms-custom-ratio-h-input');
        const msCustomWInput = wrap.querySelector('.ms-custom-w-input');
        const msCustomHInput = wrap.querySelector('.ms-custom-h-input');
        const msFitSizeBtn = wrap.querySelector('.ms-fit-size-btn');
        if((!node.msCustomRatioWidth || !node.msCustomRatioHeight) && node.msCustomRatio) {
            const raw = String(node.msCustomRatio || '');
            if(raw.includes(':')){
                const [w,h] = raw.split(':');
                node.msCustomRatioWidth = node.msCustomRatioWidth || w;
                node.msCustomRatioHeight = node.msCustomRatioHeight || h;
            }
        }
        if((!node.msCustomWidth || !node.msCustomHeight) && node.msCustomSize) {
            const parsed = parseSizeValue(node.msCustomSize);
            node.msCustomWidth = node.msCustomWidth || parsed?.width || '';
            node.msCustomHeight = node.msCustomHeight || parsed?.height || '';
        }
        const syncMsCustomSizeControls = () => {
            const ratioValue = node.msRatio && [...msRatioSelect.options].some(opt => opt.value === node.msRatio) ? node.msRatio : 'square';
            msRatioSelect.value = ratioValue;
            msResolutionSelect.value = node.msResolution || '1k';
            msRatioSelect.disabled = node.msResolution === 'custom';
            msCustomRatioRow.style.display = node.msRatio === 'custom' ? 'flex' : 'none';
            msCustomSizeRow.style.display = node.msResolution === 'custom' ? 'flex' : 'none';
            msCustomRatioWInput.value = node.msCustomRatioWidth || '';
            msCustomRatioHInput.value = node.msCustomRatioHeight || '';
            msCustomWInput.value = node.msCustomWidth || '';
            msCustomHInput.value = node.msCustomHeight || '';
            if(msFitSizeBtn) msFitSizeBtn.disabled = !referenceImages.some(ref => ref.url);
        };
        msRatioSelect.onmousedown = e => e.stopPropagation();
        msRatioSelect.onclick = e => e.stopPropagation();
        msRatioSelect.onchange = e => {
            e.stopPropagation();
            node.msRatio = e.target.value;
            if(node.msRatio !== 'custom') {
                node.msCustomRatio = '';
                node.msCustomRatioWidth = '';
                node.msCustomRatioHeight = '';
            }
            syncMsCustomSizeControls();
            scheduleSave();
        };
        msResolutionSelect.onmousedown = e => e.stopPropagation();
        msResolutionSelect.onclick = e => e.stopPropagation();
        msResolutionSelect.onchange = e => {
            e.stopPropagation();
            node.msResolution = e.target.value;
            if(node.msResolution === 'custom') {
                node.msRatio = '';
            } else if(!node.msRatio) {
                node.msRatio = 'square';
                node.msCustomSize = '';
                node.msCustomWidth = '';
                node.msCustomHeight = '';
            } else {
                node.msCustomSize = '';
                node.msCustomWidth = '';
                node.msCustomHeight = '';
            }
            syncMsCustomSizeControls();
            scheduleSave();
        };
        [msCustomRatioWInput, msCustomRatioHInput].forEach(input => {
            input.onmousedown = e => e.stopPropagation();
            input.onclick = e => e.stopPropagation();
            input.oninput = () => {
                node.msCustomRatioWidth = msCustomRatioWInput.value;
                node.msCustomRatioHeight = msCustomRatioHInput.value;
                node.msCustomRatio = node.msCustomRatioWidth && node.msCustomRatioHeight ? `${node.msCustomRatioWidth}:${node.msCustomRatioHeight}` : '';
                node.msRatio = 'custom';
                syncMsCustomSizeControls();
                scheduleSave();
            };
        });
        [msCustomWInput, msCustomHInput].forEach(input => {
            input.onmousedown = e => e.stopPropagation();
            input.onclick = e => e.stopPropagation();
            input.oninput = () => {
                node.msCustomWidth = msCustomWInput.value;
                node.msCustomHeight = msCustomHInput.value;
                node.msCustomSize = node.msCustomWidth && node.msCustomHeight ? `${node.msCustomWidth}x${node.msCustomHeight}` : '';
                node.msResolution = 'custom';
                node.msRatio = '';
                syncMsCustomSizeControls();
                scheduleSave();
            };
        });
        if(msFitSizeBtn){
            msFitSizeBtn.onmousedown = e => e.stopPropagation();
            msFitSizeBtn.onclick = async e => {
                e.stopPropagation();
                const ref = referenceImages.find(item => item.url);
                if(!ref) return;
                try {
                    const dims = await getImageDimensions(ref.url);
                    node.msCustomWidth = dims.width;
                    node.msCustomHeight = dims.height;
                    node.msCustomSize = `${dims.width}x${dims.height}`;
                    node.msResolution = 'custom';
                    node.msRatio = '';
                    syncMsCustomSizeControls();
                    scheduleSave();
                } catch(err) {
                    showErrorModal(tr('canvas.imageReadFailed'));
                }
            };
        }
        syncMsCustomSizeControls();
    }
    const msCountInput = wrap.querySelector('.ms-count-input');
    if(msCountInput){
        msCountInput.onmousedown = e => e.stopPropagation();
        msCountInput.onclick = e => e.stopPropagation();
        msCountInput.oninput = e => {
            node.count = Math.max(1, Math.min(8, Number(e.target.value) || 1));
            scheduleSave();
        };
        msCountInput.onblur = e => { e.target.value = String(Math.max(1, Math.min(8, Number(node.count || 1)))); };
        wrap.querySelectorAll('[data-ms-step]').forEach(btn => {
            btn.onclick = e => {
                e.stopPropagation();
                const next = Math.max(1, Math.min(8, Number(node.count || 1) + Number(btn.dataset.msStep || 0)));
                node.count = next;
                msCountInput.value = String(next);
                scheduleSave();
            };
        });
    }
    const msLoraCheck = wrap.querySelector('.ms-lora-check');
    if(msLoraCheck){
        msLoraCheck.onchange = e => {
            node.msLoraEnabled = e.target.checked;
            if(node.msLoraEnabled && !node.msLoraId && msLoras[0]){
                node.msLoraId = String(msLoras[0].id || '').trim();
                node.msLoraStrength = Number(msLoras[0].strength ?? 0.8);
            }
            scheduleSave();
            render();
        };
    }
    const msLoraSelect = wrap.querySelector('.ms-lora-select');
    if(msLoraSelect){
        msLoraSelect.onmousedown = e => e.stopPropagation();
        msLoraSelect.onclick = e => e.stopPropagation();
        msLoraSelect.onchange = e => {
            node.msLoraId = e.target.value;
            const picked = msLoras.find(lora => String(lora.id || '').trim() === node.msLoraId);
            node.msLoraStrength = Number(picked?.strength ?? node.msLoraStrength ?? 0.8);
            scheduleSave();
            render();
        };
    }
    const msLoraSlider = wrap.querySelector('.ms-lora-strength-slider');
    if(msLoraSlider){
        msLoraSlider.onmousedown = e => e.stopPropagation();
        msLoraSlider.onclick = e => e.stopPropagation();
        msLoraSlider.oninput = e => {
            node.msLoraStrength = parseFloat(e.target.value);
            const val = wrap.querySelector('.ms-lora-strength-val');
            if(val) val.textContent = node.msLoraStrength.toFixed(2);
            scheduleSave();
        };
    }
    // Make entire setting-check pill clickable (not just the checkbox square)
    wrap.querySelectorAll('.setting-check').forEach(pill => {
        pill.onmousedown = e => e.stopPropagation();
        const cb = pill.querySelector('input[type="checkbox"]');
        if(!cb) return;
        pill.onclick = e => {
            e.stopPropagation();
            e.preventDefault(); // prevent native label activation; we handle it
            cb.checked = !cb.checked;
            cb.dispatchEvent(new Event('change'));
        };
        cb.onclick = e => e.stopPropagation(); // prevent bubble → pill.onclick
    });
    if(msUsesImages){
        const list = wrap.querySelector('.ms-img-list');
        renderImageInputList(list, node, imageInputs);
    }
    renderPromptPreview(wrap.querySelector('.prompt-list'), promptInputs);
    wrap.querySelector('.gen-btn').onclick = e => { e.stopPropagation(); runCanvasGenerate(node.id); };
    bindCascadeButtons(wrap, node.id);
    return wrap;
}
async function runMsGenNode(nodeId, opts={}){
    const node = nodes.find(n => n.id === nodeId);
    if(!node || (node.running && !opts.cascade)) return;
    const sources = orderedSources(node, generatorSources(node));
    const prompt = sources.map(s => s.prompt).filter(Boolean).join('\n\n');
    const refs = imageRefsOnly(sources.flatMap(s => s.refs || []));
    const modelKey = node.msgenModel || 'zimage';
    const msModel = MS_GEN_MODELS[modelKey] || MS_GEN_MODELS.zimage;
    const msModelId = currentMsModelId(modelKey, node);
    const msLoras = modelscopeLorasForModel(msModelId);
    if(!prompt){ alert(tr('canvas.needPrompt')); return; }
    if(msModel.supportsImage && !refs.length){ alert(tr('canvas.needImage')); return; }
    const count = Math.max(1, Math.min(8, Number(node.count || 1)));
    // 链路中间节点默认不创建 Output；链尾、手动开启或已有 Output 连接时才输出。
    let out = outputForNode(node, 460);
    const pendingIds = Array.from({length:count}, () => uid('p'));
    const run = runSnapshot(node, prompt, refs);
    if(out) out._pending = [...(out._pending || []), ...pendingIds.map(id => makePending(id, run))];
    if(!opts.cascade){
        node.running = true;
        refreshRunNodes(node, out);
        setTimeout(() => { node.running = false; refreshRunNodes(node, out); }, 2000);
    }
    else refreshRunNodes(node, out);
    try {
        const size = apiImageSize(node.msRatio ?? 'square', node.msResolution || '1k', node.msCustomRatio || '', node.msCustomSize || '');
        const parsed = parseSizeValue(size);
        let width = Number(parsed?.width) || 1024;
        let height = Number(parsed?.height) || 1024;
        if(!parsed && node.msWidth && node.msHeight){
            width = Number(node.msWidth) || width;
            height = Number(node.msHeight) || height;
        }
        const imageUrls = [];
        if(msModel.supportsImage || msModel.acceptsImage){
            for(const ref of refs.slice(0,3)){
                if(ref.url){
                    try { imageUrls.push(await urlToBase64(ref.url)); }
                    catch(e){ imageUrls.push(ref.url); }
                }
            }
        }
        const submitMs = async () => {
            let apiBody;
            if(modelKey === 'zimage'){
                apiBody = { prompt, resolution: `${width}x${height}`, client_id: CLIENT_ID };
            } else if(modelKey === 'qwen_edit'){
                apiBody = { prompt, image_urls: imageUrls, resolution: `${width}x${height}`, client_id: CLIENT_ID };
            } else if(modelKey === 'custom'){
                apiBody = {
                    prompt,
                    model: node.msCustomModel || modelscopeImageModels()[0] || 'Tongyi-MAI/Z-Image-Turbo',
                    image_urls: imageUrls,
                    width,
                    height,
                    size: `${width}x${height}`,
                    client_id: CLIENT_ID
                };
            } else {
                apiBody = { prompt, model: msModel.modelId, image_urls: imageUrls, width, height, size:`${width}x${height}`, client_id: CLIENT_ID };
            }
            if(node.msLoraEnabled){
                const selected = msLoras.find(lora => String(lora.id || '').trim() === String(node.msLoraId || '').trim()) || msLoras[0];
                const loraId = String(selected?.id || node.msLoraId || '').trim();
                if(!loraId) throw new Error(tr('canvas.noLoraBoundError'));
                apiBody.loras = { [loraId]: Number(node.msLoraStrength ?? selected?.strength ?? 0.8) };
            }
            const res = await fetch(msModel.endpoint, {
                method:'POST', headers:{'Content-Type':'application/json'},
                body:JSON.stringify(apiBody)
            });
            if(!res.ok) throw new Error(await responseErrorMessage(res, tr('canvas.msFailed')));
            return await res.json();
        };
        const results = await Promise.all(Array.from({length:count}, submitMs));
        const metas = collectRunMetas(out, pendingIds);
        const outputUrls = results.map(data => data.url).filter(Boolean);
        run.request = results[0] ? requestMetaFromResult(results[0]) : {};
        if(out) out._pending = (out._pending || []).filter(p => !pendingIds.includes(p.id));
        appendOutputImages(out, outputUrls, refs[0], metas);
        mergeGeneratedOutputs(node, outputUrls, Boolean(opts.cascade));
        addGenerationLog({run, outputs:outputUrls, runMs:Math.max(...metas.map(m => m.runMs || 0), 0)});
        node.runStatus = 'done'; node.runError = '';
        refreshRunNodes(node, out);
        scheduleSave();
    } catch(err){
        const metas = collectRunMetas(out, pendingIds);
        addGenerationLog({run, outputs:[], runMs:Math.max(...metas.map(m => m.runMs || 0), 0), error:err.message || String(err)});
        if(out) out._pending = (out._pending || []).filter(p => !pendingIds.includes(p.id));
        node.runStatus = 'failed'; node.runError = err.message || String(err);
        refreshRunNodes(node, out);
        if(opts.cascade) throw err;
        alert(err.message || tr('canvas.msFailed'));
    }
}
function addComfyNode(point){
    const p = point || defaultPoint(160, 0);
    return addNode({
        id:uid('comfy'),
        type:'comfy',
        x:p.x,
        y:p.y,
        w:420,
        h:460,
        mode:'text',
        width:1024,
        height:1024,
        enhanceStrength:0.5,
        enhanceUpscale:false,
        enhanceUpscaleRes:2048,
        editUpscale:false,
        editUpscaleRes:2048,
        editModel:allImageModels(imageApiProviders()[0]?.id || 'comfly')[0] || models.gpt,
        ratio:'square',
        resolution:'1k',
        customRatio:'',
        customSize:'',
        customRatioWidth:'',
        customRatioHeight:'',
        customWidth:'',
        customHeight:'',
        comfyWorkflow:'',
        comfyParams:{},
        count:1,
        inputs:[]
    });
}
function addOutputNode(point){
    const p = point || defaultPoint(260, 0);
    return addNode({id:uid('out'), type:'output', x:p.x, y:p.y, images:[]});
}
function openCreateMenu(clientX, clientY){
    menuPoint = screenToWorld(clientX, clientY);
    closeLinkCreateMenu();
    createMenu.style.left = `${clientX}px`;
    createMenu.style.top = `${clientY}px`;
    createMenu.classList.add('open');
    refreshIcons();
}
function closeCreateMenu(){
    createMenu.classList.remove('open');
    closeLinkCreateMenu();
    closeImageNodeMenu();
}
function linkCreateOptions(state){
    const node = nodes.find(n => n.id === state?.originId);
    if(!node) return [];
    if(state.originKind === 'out'){
        if(['image','prompt','loop','group','promptGroup','llm'].includes(node.type)){
            return [
                {type:'generator', label:tr('canvas.apiGenerate'), icon:'wand-sparkles'},
                {type:'msgen', label:tr('canvas.modelscopeGenerate'), icon:'cloud-lightning'},
                {type:'comfy', label:tr('canvas.comfyGenerate'), icon:'workflow'},
                {type:'rh', label:tr('canvas.rhGenerate'), icon:'workflow'},
                {type:'video', label:tr('canvas.videoGenerateNode'), icon:'clapperboard'},
                {type:'llm', label:'LLM', icon:'message-square-text'}
            ];
        }
        return [];
    }
    if(CANVAS_GENERATOR_TYPES.includes(node.type) || node.type === 'llm'){
        return [
            {type:'image', label:tr('canvas.imageCard'), icon:'image-plus'},
            {type:'prompt', label:tr('canvas.prompt'), icon:'text-cursor-input'},
            {type:'loop', label:tr('canvas.loopNode'), icon:'repeat-2'},
            {type:'group', label:tr('canvas.group'), icon:'group'},
            {type:'llm', label:'LLM', icon:'message-square-text'}
        ];
    }
    return [];
}
function openLinkCreateMenu(originId, originKind, clientX, clientY){
    const state = {originId, originKind, point:screenToWorld(clientX, clientY)};
    const options = linkCreateOptions(state);
    if(!options.length) return false;
    linkCreateState = state;
    createMenu.classList.remove('open');
    linkCreateMenu.innerHTML = options.map(opt => `<button class="menu-btn" data-link-create="${escapeAttr(opt.type)}"><i data-lucide="${escapeAttr(opt.icon)}" class="w-4 h-4"></i><span>${escapeHtml(opt.label)}</span></button>`).join('');
    linkCreateMenu.style.left = `${clientX}px`;
    linkCreateMenu.style.top = `${clientY}px`;
    linkCreateMenu.classList.add('open');
    linkCreateMenu.querySelectorAll('[data-link-create]').forEach(btn => {
        btn.onclick = e => {
            e.stopPropagation();
            createLinkedNode(btn.dataset.linkCreate);
        };
    });
    refreshIcons();
    return true;
}
function openGeneratorNodeMenu(nodeId, clientX, clientY){
    const node = nodes.find(n => n.id === nodeId);
    if(!node || !CANVAS_GENERATOR_TYPES.includes(node.type)) return false;
    const el = nodesEl.querySelector(`.node[data-id="${CSS.escape(nodeId)}"]`);
    const rect = el?.getBoundingClientRect();
    const point = screenToWorld(clientX, clientY);
    const inputOptions = linkCreateOptions({originId:nodeId, originKind:'in', point});
    const outputOptions = [
        {type:'output', label:'Output', icon:'circle-dot'},
        ...(CANVAS_IMAGE_OUTPUT_TYPES.includes(node.type) ? [
            {type:'generator', label:tr('canvas.apiGenerate'), icon:'wand-sparkles'},
            {type:'msgen', label:tr('canvas.modelscopeGenerate'), icon:'cloud-lightning'},
            {type:'comfy', label:tr('canvas.comfyGenerate'), icon:'workflow'},
            {type:'video', label:tr('canvas.videoGenerateNode'), icon:'clapperboard'}
        ] : [])
    ];
    const buttonsHtml = (options, kind) => `<div class="node-port-menu-grid">${options.map(opt => `<button class="menu-btn" data-link-create="${escapeAttr(opt.type)}" data-link-kind="${kind}" title="${escapeAttr(opt.label)}"><i data-lucide="${escapeAttr(opt.icon)}"></i><span>${escapeHtml(opt.label.replace('生成', ''))}</span></button>`).join('')}</div>`;
    linkCreateState = {originId:nodeId, originKind:'in', point};
    createMenu.classList.remove('open');
    linkCreateMenu.classList.remove('open');
    nodeInputMenu.classList.add('node-port-menu');
    nodeOutputMenu.classList.add('node-port-menu');
    nodeInputMenu.innerHTML = `<div class="menu-section-title">添加输入</div>${buttonsHtml(inputOptions, 'in')}`;
    nodeOutputMenu.innerHTML = `<div class="menu-section-title">添加输出</div>${buttonsHtml(outputOptions, 'out')}`;
    const inputLeft = Math.max(10, (rect?.left || clientX) - 158);
    const outputLeft = Math.min(window.innerWidth - 158, (rect?.right || clientX) + 10);
    const menuTop = Math.max(10, Math.min(window.innerHeight - 260, (rect?.top || clientY) + 36));
    nodeInputMenu.style.left = `${inputLeft}px`;
    nodeInputMenu.style.top = `${menuTop}px`;
    nodeOutputMenu.style.left = `${outputLeft}px`;
    nodeOutputMenu.style.top = `${menuTop}px`;
    nodeInputMenu.classList.add('open');
    nodeOutputMenu.classList.add('open');
    [nodeInputMenu, nodeOutputMenu].forEach(menu => menu.querySelectorAll('[data-link-create]').forEach(btn => {
        btn.onclick = e => {
            e.stopPropagation();
            linkCreateState = {originId:nodeId, originKind:btn.dataset.linkKind || 'in', point};
            createLinkedNode(btn.dataset.linkCreate);
        };
    }));
    refreshIcons();
    return true;
}
function closeLinkCreateMenu(){
    linkCreateMenu.classList.remove('open');
    linkCreateMenu.innerHTML = '';
    nodeInputMenu.classList.remove('open');
    nodeOutputMenu.classList.remove('open');
    nodeInputMenu.classList.remove('node-port-menu');
    nodeOutputMenu.classList.remove('node-port-menu');
    nodeInputMenu.innerHTML = '';
    nodeOutputMenu.innerHTML = '';
    linkCreateState = null;
}
function openImageNodeMenu(nodeId, clientX, clientY){
    const node = nodes.find(n => n.id === nodeId);
    if(!node || node.type !== 'image') return;
    closeCreateMenu();
    imageNodeMenu.innerHTML = `<button class="menu-btn" data-image-replace="${escapeAttr(nodeId)}"><i data-lucide="image-plus" class="w-4 h-4"></i><span>替换</span></button>`;
    imageNodeMenu.style.left = `${clientX}px`;
    imageNodeMenu.style.top = `${clientY}px`;
    imageNodeMenu.classList.add('open');
    imageNodeMenu.querySelector('[data-image-replace]').onclick = e => {
        e.stopPropagation();
        closeImageNodeMenu();
        pickImageForNode(nodeId);
    };
    refreshIcons();
}
function openOutputNodeMenu(nodeId, clientX, clientY){
    const node = nodes.find(n => n.id === nodeId);
    if(!node || node.type !== 'output') return;
    closeCreateMenu();
    const imageCount = (node.images || []).map(outputUrlValue).filter(url => url && !isVideoUrl(url)).length;
    const downloadableCount = outputDownloadableImageUrls(node).length;
    imageNodeMenu.classList.add('output-node-menu');
    imageNodeMenu.innerHTML = `
        <div class="menu-section-title">${tr('canvas.outputGroupActions')}</div>
        <button class="menu-btn" data-output-convert="${escapeAttr(nodeId)}" ${imageCount ? '' : 'disabled'}><i data-lucide="replace" class="w-4 h-4"></i><span>${tr('canvas.outputConvertToInputGroup')}</span></button>
        <button class="menu-btn" data-output-copy="${escapeAttr(nodeId)}" ${imageCount ? '' : 'disabled'}><i data-lucide="copy-plus" class="w-4 h-4"></i><span>${tr('canvas.outputCopyToInputGroup')}</span></button>
        <div class="menu-divider"></div>
        <div class="menu-section-title">${tr('canvas.outputFileActions')}</div>
        <button class="menu-btn" data-output-download="${escapeAttr(nodeId)}" ${downloadableCount ? '' : 'disabled'}><i data-lucide="download" class="w-4 h-4"></i><span>${tr('canvas.outputDownloadAllImages')}</span></button>
    `;
    const menuWidth = 260;
    imageNodeMenu.style.left = `${Math.max(10, Math.min(window.innerWidth - menuWidth - 10, clientX))}px`;
    imageNodeMenu.style.top = `${clientY}px`;
    imageNodeMenu.classList.add('open');
    const convertBtn = imageNodeMenu.querySelector('[data-output-convert]');
    if(convertBtn){
        convertBtn.onclick = e => {
            e.stopPropagation();
            convertOutputNodeToInputGroup(nodeId);
            closeImageNodeMenu();
        };
    }
    imageNodeMenu.querySelector('[data-output-copy]').onclick = e => {
        e.stopPropagation();
        copyOutputNodeToInputGroup(nodeId);
        closeImageNodeMenu();
    };
    const downloadBtn = imageNodeMenu.querySelector('[data-output-download]');
    if(downloadBtn){
        downloadBtn.onclick = e => {
            e.stopPropagation();
            downloadOutputNodeImages(nodeId);
            closeImageNodeMenu();
        };
    }
    refreshIcons();
}
function closeImageNodeMenu(){
    imageNodeMenu.classList.remove('open');
    imageNodeMenu.classList.remove('output-node-menu');
    imageNodeMenu.innerHTML = '';
}
function outputImageUrls(node){
    return (node?.images || []).map(outputUrlValue).filter(url => url && !isVideoUrl(url));
}
function outputDownloadableImageUrls(node){
    return outputImageUrls(node).filter(url => !isMissingAssetUrl(url) && (url.startsWith('/output/') || url.startsWith('/assets/')));
}
function createInputGroupFromOutput(node, point){
    const urls = outputImageUrls(node);
    if(!node || !urls.length) return null;
    const cols = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(urls.length))));
    const cardW = 260;
    const cardH = 336;
    const gap = 24;
    const base = point || {x:Number(node.x || 0), y:Number(node.y || 0)};
    const imageNodes = urls.map((url, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const img = {
            id:uid('img'),
            type:'image',
            x:base.x + 24 + col * (cardW + gap),
            y:base.y + 58 + row * (cardH + gap),
            w:cardW,
            h:cardH,
            url,
            name:outputImageName(url)
        };
        nodes.push(img);
        return img;
    });
    const rows = Math.ceil(urls.length / cols);
    const group = {
        id:uid('grp'),
        type:'group',
        x:base.x,
        y:base.y,
        w:cols * cardW + (cols - 1) * gap + 48,
        h:rows * cardH + (rows - 1) * gap + 90,
        items:imageNodes.map(img => img.id)
    };
    nodes.push(group);
    return group;
}
function convertOutputNodeToInputGroup(nodeId){
    const node = nodes.find(n => n.id === nodeId);
    if(!node || node.type !== 'output') return;
    if(!outputImageUrls(node).length) return;
    pushUndo();
    const downstream = connections.filter(c => c.from === nodeId).map(c => c.to);
    const group = createInputGroupFromOutput(node, {x:Number(node.x || 0), y:Number(node.y || 0)});
    if(!group) return;
    nodes = nodes.filter(n => n.id !== nodeId);
    connections = connections.filter(c => c.from !== nodeId && c.to !== nodeId);
    downstream.forEach(toId => {
        if(canConnect(group.id, toId) && !connections.some(c => c.from === group.id && c.to === toId)){
            connections.push({id:uid('c'), from:group.id, to:toId});
        }
    });
    selected.clear();
    selected.add(group.id);
    syncGeneratorInputs();
    refreshGeneratorInputViews();
    render();
    scheduleSave();
}
function copyOutputNodeToInputGroup(nodeId){
    const node = nodes.find(n => n.id === nodeId);
    if(!node || node.type !== 'output') return;
    if(!outputImageUrls(node).length) return;
    pushUndo();
    const group = createInputGroupFromOutput(node, {x:Number(node.x || 0) + 36, y:Number(node.y || 0) + 36});
    if(!group) return;
    selected.clear();
    selected.add(group.id);
    syncGeneratorInputs();
    refreshGeneratorInputViews();
    render();
    scheduleSave();
}
async function downloadOutputNodeImages(nodeId){
    const node = nodes.find(n => n.id === nodeId);
    const urls = outputDownloadableImageUrls(node);
    if(!node || !urls.length){
        alert(tr('canvas.outputDownloadEmpty'));
        return;
    }
    try {
        const res = await fetch('/api/canvas-assets/download', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({
                urls,
                filename:`${(canvas?.title || 'canvas-output').slice(0, 48)}-${node.id}.zip`
            })
        });
        if(!res.ok) throw new Error(await responseErrorMessage(res, tr('canvas.outputDownloadEmpty')));
        const blob = await res.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${(canvas?.title || 'canvas-output').slice(0, 48)}-${node.id}.zip`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch(err) {
        alert(err.message || tr('canvas.outputDownloadEmpty'));
    }
}
function createLinkedNode(type){
    const state = linkCreateState;
    closeLinkCreateMenu();
    if(!state) return;
    const origin = nodes.find(n => n.id === state.originId);
    if(!origin) return;
    pushUndo();
    const created = createNodeByType(type, state.point);
    if(!created) return;
    const fromId = state.originKind === 'out' ? origin.id : created.id;
    const toId = state.originKind === 'out' ? created.id : origin.id;
    if(canConnect(fromId, toId) && !connections.some(c => c.from === fromId && c.to === toId)){
        connections.push({id:uid('c'), from:fromId, to:toId});
        syncGeneratorInputs();
        scheduleSave();
        render();
    }
}
function createNodeByType(type, point){
    if(type === 'image') return addImageNode(point);
    if(type === 'prompt') return addPromptNode(point);
    if(type === 'loop') return addLoopNode(point);
    if(type === 'group') return addGroupNode(point);
    if(type === 'llm') return addLLMNode(point);
    if(type === 'generator') return addGeneratorNode(point);
    if(type === 'msgen') return addMsGenNode(point);
    if(type === 'video') return addVideoNode(point);
    if(type === 'rh') return addRhNode(point);
    if(type === 'comfy') return addComfyNode(point);
    if(type === 'output') return addOutputNode(point);
    return null;
}
function menuAdd(type){
    closeCreateMenu();
    if(type === 'image') addImageNode(menuPoint);
    if(type === 'prompt') addPromptNode(menuPoint);
    if(type === 'loop') addLoopNode(menuPoint);
    if(type === 'llm') addLLMNode(menuPoint);
    if(type === 'generator') addGeneratorNode(menuPoint);
    if(type === 'msgen') addMsGenNode(menuPoint);
    if(type === 'video') addVideoNode(menuPoint);
    if(type === 'rh') addRhNode(menuPoint);
    if(type === 'comfy') addComfyNode(menuPoint);
    if(type === 'output') addOutputNode(menuPoint);
}
function mediaKindForUpload(file){
    const type = String(file?.type || '').toLowerCase();
    const name = String(file?.name || '').toLowerCase();
    if(type.startsWith('video/') || /\.(mp4|webm|mov|m4v|avi|mkv)(\?|$)/.test(name)) return 'video';
    if(type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/.test(name)) return 'audio';
    return 'image';
}
function isSupportedUploadFile(file){
    const type = String(file?.type || '').toLowerCase();
    const name = String(file?.name || '').toLowerCase();
    return type.startsWith('image/') || type.startsWith('video/') || type.startsWith('audio/')
        || /\.(png|jpe?g|webp|gif|bmp|avif|mp4|webm|mov|m4v|avi|mkv|mp3|wav|m4a|aac|ogg|flac)(\?|$)/.test(name);
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
function isAudioUrl(url){
    return /\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/i.test(String(url || ''));
}
function mediaKindForRef(ref){
    const kind = String(ref?.kind || ref?.mediaKind || '').toLowerCase();
    if(kind === 'video' || kind === 'audio' || kind === 'image') return kind;
    const url = String(ref?.url || ref || '');
    if(isVideoUrl(url)) return 'video';
    if(isAudioUrl(url)) return 'audio';
    return 'image';
}
function imageRefsOnly(refs){
    return (refs || []).filter(ref => ref?.url && mediaKindForRef(ref) === 'image');
}
function videoRefsOnly(refs){
    return (refs || []).filter(ref => ref?.url && mediaKindForRef(ref) === 'video');
}
function audioRefsOnly(refs){
    return (refs || []).filter(ref => ref?.url && mediaKindForRef(ref) === 'audio');
}
function mediaKindForNode(node){
    if(node?.mediaKind) return node.mediaKind;
    if(isVideoUrl(node?.url)) return 'video';
    if(isAudioUrl(node?.url)) return 'audio';
    return 'image';
}
function nodeTitleForMedia(node){
    const kind = mediaKindForNode(node);
    if(kind === 'video') return 'Video';
    if(kind === 'audio') return 'Audio';
    return 'Image';
}
function layoutUploadedMediaNodes(created, base){
    const list = [...(created || [])];
    if(!list.length) return;
    const cols = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(list.length))));
    const gapX = 280;
    const gapY = 250;
    const startX = base.x - ((cols - 1) * gapX) / 2;
    list.forEach((node, i) => {
        node.x = startX + (i % cols) * gapX;
        node.y = base.y + Math.floor(i / cols) * gapY;
    });
}
function createGroupForUploadedNodes(created, point){
    const targets = [...(created || [])].filter(n => n?.type === 'image');
    if(targets.length < 2) return null;
    render();
    const box = nodeBounds(targets.map(n => n.id));
    const fallback = point || defaultPoint(0, 0);
    const group = {
        id:uid('grp'),
        type:'group',
        x:Number.isFinite(box.x) ? box.x - 24 : fallback.x - 24,
        y:Number.isFinite(box.y) ? box.y - 58 : fallback.y - 58,
        w:Number.isFinite(box.w) ? box.w + 48 : 600,
        h:Number.isFinite(box.h) ? box.h + 90 : 420,
        items:targets.map(n => n.id)
    };
    nodes.push(group);
    selected.clear();
    selected.add(group.id);
    return group;
}
async function uploadMediaFiles(files, point, onlyImages=false, opts={}){
    if(!ensureCanvas()) return;
    const supported = [...files].filter(file => {
        const kind = mediaKindForUpload(file);
        return onlyImages ? kind === 'image' : ['image','video','audio'].includes(kind);
    });
    if(!supported.length) return [];
    const form = new FormData();
    supported.forEach(file => form.append('files', file));
    const data = await fetch('/api/ai/upload', {method:'POST', body:form}).then(r=>r.json());
    const base = point || screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
    const created = [];
    (data.files || []).forEach((file, i) => {
        const kind = file.kind || mediaKindForUpload(supported[i]);
        const node = {
            id:uid('img'),
            type:'image',
            x:base.x + i * 36,
            y:base.y + i * 36,
            url:file.url,
            name:file.name,
            mediaKind:kind
        };
        nodes.push(node);
        created.push(node);
    });
    if(opts.group && created.length > 1){
        layoutUploadedMediaNodes(created, base);
        created.group = createGroupForUploadedNodes(created, base);
    }
    render();
    scheduleSave();
    return created;
}
async function uploadImages(files, point){
    return uploadMediaFiles(files, point, false);
}
async function uploadImageGroup(files, point){
    return uploadMediaFiles(files, point, false, {group:true});
}
function imageUrlFromDataTransfer(dataTransfer){
    if(!dataTransfer) return '';
    const values = [
        dataTransfer.getData?.('text/uri-list') || '',
        dataTransfer.getData?.('text/plain') || ''
    ].join('\n');
    const html = dataTransfer.getData?.('text/html') || '';
    const htmlMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    const candidates = [
        htmlMatch?.[1] || '',
        ...values.split(/\r?\n/)
    ].map(s => String(s || '').trim()).filter(Boolean);
    return candidates.find(s => /^https?:\/\/.+/i.test(s) || /^data:image\//i.test(s) || /^blob:/i.test(s)) || '';
}
function createImageCardFromUrl(url, point, name='image'){
    if(!ensureCanvas() || !url) return;
    const p = point || defaultPoint(0, 0);
    const mediaKind = isVideoUrl(url) ? 'video' : isAudioUrl(url) ? 'audio' : 'image';
    nodes.push({id:uid('img'), type:'image', x:p.x, y:p.y, url, name:name || outputImageName(url), mediaKind});
    render();
    scheduleSave();
}
async function fillImageNode(nodeId, files, opts={}){
    if(!ensureCanvas()) return;
    const imgs = [...files].filter(file => ['image','video','audio'].includes(mediaKindForUpload(file)));
    if(!imgs.length) return;
    if(opts.group && imgs.length > 1){
        const source = nodes.find(n => n.id === nodeId);
        pushUndo();
        const point = source ? {x:Number(source.x || 0), y:Number(source.y || 0)} : defaultPoint(0, 0);
        const outgoing = connections.filter(c => c.from === source?.id).map(c => c.to);
        const incoming = connections.filter(c => c.to === source?.id).map(c => c.from);
        const created = await uploadImageGroup(imgs, point);
        const group = created?.group;
        if(source && created?.length > 1){
            nodes = nodes.filter(n => n.id !== source.id);
            connections = connections.filter(c => c.from !== source.id && c.to !== source.id);
            if(group){
                outgoing.forEach(toId => {
                    if(canConnect(group.id, toId) && !connections.some(c => c.from === group.id && c.to === toId)){
                        connections.push({id:uid('c'), from:group.id, to:toId});
                    }
                });
                incoming.forEach(fromId => {
                    if(canConnect(fromId, group.id) && !connections.some(c => c.from === fromId && c.to === group.id)){
                        connections.push({id:uid('c'), from:fromId, to:group.id});
                    }
                });
            }
            selected.delete(source.id);
            render();
            scheduleSave();
        }
        return;
    }
    const form = new FormData();
    form.append('files', imgs[0]);
    const data = await fetch('/api/ai/upload', {method:'POST', body:form}).then(r=>r.json());
    const file = data.files?.[0];
    const node = nodes.find(n => n.id === nodeId);
    if(file && node){
        node.url = file.url;
        node.name = file.name;
        node.mediaKind = file.kind || mediaKindForUpload(imgs[0]);
        render();
        scheduleSave();
    }
}
function setImageNodeFromOutput(nodeId, url){
    const node = nodes.find(n => n.id === nodeId);
    if(!node || node.type !== 'image' || !url || isVideoUrl(url) || isAudioUrl(url)) return;
    pushUndo();
    node.url = url;
    node.name = outputImageName(url);
    node.mediaKind = 'image';
    render();
    scheduleSave();
}
function clearImageNode(nodeId, event=null){
    if(event){
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
    }
    const node = nodes.find(n => n.id === nodeId);
    if(!node || node.type !== 'image') return;
    pushUndo();
    node.url = '';
    node.mediaKind = 'image';
    node.name = '空白图片';
    render();
    scheduleSave();
}
function pickImageForNode(nodeId){
    pickMediaForNode(nodeId);
}
function cropBounds(){
    const img = document.getElementById('cropImage');
    return {w:img.clientWidth || 1, h:img.clientHeight || 1};
}
function editDrawCanvas(){
    return document.getElementById('editDrawCanvas');
}
function resizeEditDrawCanvas(){
    const img = document.getElementById('cropImage');
    const canvasEl = editDrawCanvas();
    const w = Math.max(1, img.naturalWidth || img.clientWidth || 1);
    const h = Math.max(1, img.naturalHeight || img.clientHeight || 1);
    if(canvasEl.width !== w || canvasEl.height !== h){
        canvasEl.width = w;
        canvasEl.height = h;
    }
    canvasEl.style.width = `${img.clientWidth || 1}px`;
    canvasEl.style.height = `${img.clientHeight || 1}px`;
    if(imageEditMode === 'grid') refreshGridSplitPreview();
}
function setImageEditMode(mode, userTouched=false){
    if(userTouched) imageEditModeTouched = true;
    const prevImageEditMode = imageEditMode;
    imageEditMode = ['crop','outpaint','mask','brush','grid'].includes(mode) ? mode : 'crop';
    const cropCanvasEl = document.getElementById('cropCanvas');
    cropCanvasEl.classList.toggle('mask-mode', imageEditMode === 'mask');
    cropCanvasEl.classList.toggle('brush-mode', imageEditMode === 'brush');
    cropCanvasEl.classList.toggle('grid-mode', imageEditMode === 'grid');
    cropCanvasEl.classList.toggle('outpaint-mode', imageEditMode === 'outpaint');
    _syncGridCustomCursor();
    document.querySelectorAll('[data-image-edit-mode]').forEach(btn => btn.classList.toggle('active', btn.dataset.imageEditMode === imageEditMode));
    document.getElementById('imageMaskTools').classList.toggle('active', imageEditMode === 'mask');
    document.getElementById('imageBrushTools').classList.toggle('active', imageEditMode === 'brush');
    document.getElementById('imageGridTools').classList.toggle('active', imageEditMode === 'grid');
    syncGridGapValue();
    const title = document.getElementById('imageEditTitle');
    const sub = document.getElementById('imageEditSub');
    const apply = document.getElementById('imageEditApplyBtn');
    const icon = imageEditMode === 'crop' ? 'crop' : imageEditMode === 'outpaint' ? 'expand' : imageEditMode === 'mask' ? 'brush' : imageEditMode === 'brush' ? 'paintbrush' : 'grid-3x3';
    const labelKey = imageEditMode === 'crop' ? 'canvas.applyCrop' : imageEditMode === 'outpaint' ? 'canvas.applyOutpaint' : imageEditMode === 'mask' ? 'canvas.applyMask' : imageEditMode === 'brush' ? 'canvas.applyBrush' : 'canvas.applyGrid';
    const titleKey = imageEditMode === 'crop' ? 'canvas.cropImage' : imageEditMode === 'outpaint' ? 'canvas.outpaintImage' : imageEditMode === 'mask' ? 'canvas.maskEdit' : imageEditMode === 'brush' ? 'canvas.brushEdit' : 'canvas.modeGrid';
    const subKey = imageEditMode === 'crop' ? 'canvas.cropHint' : imageEditMode === 'outpaint' ? 'canvas.outpaintHint' : imageEditMode === 'mask' ? 'canvas.maskHint2' : imageEditMode === 'brush' ? 'canvas.brushHint' : 'canvas.gridHint';
    title.textContent = tr(titleKey);
    sub.textContent = tr(subKey);
    apply.innerHTML = `<i data-lucide="${icon}" class="w-4 h-4"></i><span>${tr(labelKey)}</span>`;
    resizeEditDrawCanvas();
    if(imageEditMode === 'grid') refreshGridSplitPreview();
    else if(imageEditMode === 'outpaint') resetOutpaintBox();
    else if(imageEditMode === 'crop') clearEditDrawing(true);
    else if(prevImageEditMode === 'grid') clearEditDrawing(true); // 离开 grid 时主动清掉画布上残留的分割线预览
    syncEditDrawingHistoryButtons();
    syncBrushToolButtons();
    refreshIcons();
}
function editDrawSnapshot(){
    const canvasEl = editDrawCanvas();
    return {
        imageData: canvasEl.getContext('2d').getImageData(0, 0, canvasEl.width, canvasEl.height),
        labelCounter: brushLabelCounter,
    };
}
function restoreEditDrawSnapshot(snapshot){
    if(!snapshot) return;
    const canvasEl = editDrawCanvas();
    const imageData = snapshot.imageData || snapshot;
    canvasEl.getContext('2d').putImageData(imageData, 0, 0);
    if(snapshot.labelCounter) brushLabelCounter = snapshot.labelCounter;
}
function pushEditDrawHistory(){
    editDrawUndoStack.push(editDrawSnapshot());
    if(editDrawUndoStack.length > EDIT_DRAW_HISTORY_MAX) editDrawUndoStack.shift();
    editDrawRedoStack = [];
    syncEditDrawingHistoryButtons();
}
function syncEditDrawingHistoryButtons(){
    ['maskUndoBtn','brushUndoBtn'].forEach(id => {
        const btn = document.getElementById(id);
        if(btn){ btn.disabled = !editDrawUndoStack.length; btn.style.opacity = editDrawUndoStack.length ? '1' : '.42'; }
    });
    ['maskRedoBtn','brushRedoBtn'].forEach(id => {
        const btn = document.getElementById(id);
        if(btn){ btn.disabled = !editDrawRedoStack.length; btn.style.opacity = editDrawRedoStack.length ? '1' : '.42'; }
    });
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
    return {
        x:(event.clientX - rect.left) * canvasEl.width / Math.max(1, rect.width),
        y:(event.clientY - rect.top) * canvasEl.height / Math.max(1, rect.height),
    };
}
function gridCustomLineHit(point){
    if(!gridCustomLines.length) return -1;
    const canvasEl = editDrawCanvas();
    const threshold = Math.max(8, Math.min(canvasEl.width, canvasEl.height) / 80);
    let best = -1;
    let bestDist = Infinity;
    gridCustomLines.forEach((line, index) => {
        const dist = line.type === 'h'
            ? Math.abs(point.y - line.pos * canvasEl.height)
            : Math.abs(point.x - line.pos * canvasEl.width);
        if(dist < bestDist && dist <= threshold){
            best = index;
            bestDist = dist;
        }
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
function editBrushSize(){
    const id = imageEditMode === 'mask' ? 'maskBrushSize' : 'paintBrushSize';
    return Number(document.getElementById(id)?.value || 20);
}
function brushColor(){
    return document.getElementById('paintBrushColor')?.value || '#ff2d55';
}
const MASK_BRUSH_ALPHA = 115;
const MASK_BRUSH_COLOR = `rgba(255,255,255,${MASK_BRUSH_ALPHA / 255})`;
function setupDrawStyle(ctx){
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = editBrushSize();
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
function circledNumber(n){
    if(n >= 1 && n <= 20) return String.fromCharCode(0x2460 + n - 1);
    return String(n);
}
function drawBrushShape(ctx, start, end, preview=false){
    setupDrawStyle(ctx);
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const w = Math.abs(end.x - start.x);
    const h = Math.abs(end.y - start.y);
    if(brushTool === 'rect'){
        ctx.strokeRect(x, y, w, h);
    } else if(brushTool === 'ellipse'){
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, Math.max(1, w / 2), Math.max(1, h / 2), 0, 0, Math.PI * 2);
        ctx.stroke();
    }
}
function drawNumberLabel(point){
    const canvasEl = editDrawCanvas();
    const ctx = canvasEl.getContext('2d');
    const size = Math.max(18, editBrushSize() * 2.2);
    const text = circledNumber(brushLabelCounter++);
    setupDrawStyle(ctx);
    ctx.save();
    ctx.font = `900 ${size}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, size / 8);
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeText(text, point.x, point.y);
    ctx.fillStyle = brushColor();
    ctx.fillText(text, point.x, point.y);
    ctx.restore();
}
function beginEditDraw(event){
    if(imageEditMode === 'crop') return;
    if(imageEditMode === 'grid'){
        if(!gridCustomMode) return;
        // 自定义模式：拖动已有线，或点击空白处放置新线
        event.preventDefault();
        event.stopPropagation();
        const canvasEl = editDrawCanvas();
        canvasEl.setPointerCapture?.(event.pointerId);
        const point = editDrawPoint(event);
        const hitIndex = gridCustomLineHit(point);
        gridCustomHistory.push([...gridCustomLines.map(line => ({...line}))]);
        if(hitIndex >= 0){
            gridCustomDrag = {index: hitIndex, pointerId: event.pointerId};
            setGridCustomLinePos(hitIndex, point);
            refreshGridSplitPreview();
            _syncGridCustomUndoBtn();
            return;
        }
        const rect = canvasEl.getBoundingClientRect();
        const fracX = Math.max(0.001, Math.min(0.999, (event.clientX - rect.left) / rect.width));
        const fracY = Math.max(0.001, Math.min(0.999, (event.clientY - rect.top) / rect.height));
        gridCustomLines.push({type: gridCustomOrientation, pos: gridCustomOrientation === 'h' ? fracY : fracX});
        gridCustomDrag = {index: gridCustomLines.length - 1, pointerId: event.pointerId};
        _syncGridCustomUndoBtn();
        refreshGridSplitPreview();
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    const canvasEl = editDrawCanvas();
    canvasEl.setPointerCapture?.(event.pointerId);
    const ctx = canvasEl.getContext('2d');
    const p = editDrawPoint(event);
    pushEditDrawHistory();
    if(imageEditMode === 'brush' && brushTool === 'label'){
        drawNumberLabel(p);
        editDrawState = null;
        canvasEl.releasePointerCapture?.(event.pointerId);
        syncEditDrawingHistoryButtons();
        return;
    }
    editDrawState = {x:p.x, y:p.y, sx:p.x, sy:p.y, pointerId:event.pointerId, snapshot:(imageEditMode === 'brush' && brushTool !== 'free') ? editDrawSnapshot() : null};
    setupDrawStyle(ctx);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.01, p.y + 0.01);
    if(imageEditMode === 'mask' || brushTool === 'free') ctx.stroke();
    normalizeMaskPreviewCanvas(canvasEl);
}
function moveEditDraw(event){
    if(imageEditMode === 'grid' && gridCustomMode && gridCustomDrag){
        event.preventDefault();
        event.stopPropagation();
        setGridCustomLinePos(gridCustomDrag.index, editDrawPoint(event));
        refreshGridSplitPreview();
        return;
    }
    if(!editDrawState || imageEditMode === 'crop' || imageEditMode === 'grid') return;
    event.preventDefault();
    event.stopPropagation();
    const ctx = editDrawCanvas().getContext('2d');
    const p = editDrawPoint(event);
    if(imageEditMode === 'brush' && brushTool !== 'free'){
        restoreEditDrawSnapshot(editDrawState.snapshot);
        drawBrushShape(ctx, {x:editDrawState.sx, y:editDrawState.sy}, p, true);
        return;
    }
    setupDrawStyle(ctx);
    ctx.beginPath();
    ctx.moveTo(editDrawState.x, editDrawState.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    editDrawState.x = p.x;
    editDrawState.y = p.y;
    normalizeMaskPreviewCanvas();
}
function endEditDraw(event){
    if(editDrawState && event?.pointerId != null) editDrawCanvas().releasePointerCapture?.(event.pointerId);
    if(gridCustomDrag && event?.pointerId != null) editDrawCanvas().releasePointerCapture?.(event.pointerId);
    editDrawState = null;
    gridCustomDrag = null;
    syncEditDrawingHistoryButtons();
}
function editCanvasHasPixels(){
    const canvasEl = editDrawCanvas();
    const data = canvasEl.getContext('2d').getImageData(0, 0, canvasEl.width, canvasEl.height).data;
    for(let i = 3; i < data.length; i += 4) if(data[i] > 0) return true;
    return false;
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
    const gap = syncGridGapValue();
    return {rows:hLines + 1, cols:vLines + 1, gap};
}
function gridSplitRects(width, height){
    if(gridCustomMode) return gridSplitRectsCustom(width, height);
    const {rows, cols, gap} = gridSplitSettings();
    const halfGap = gap / 2;
    const rects = [];
    for(let row = 0; row < rows; row++){
        const topLine = row * height / rows;
        const bottomLine = (row + 1) * height / rows;
        const y1 = Math.round(row === 0 ? 0 : topLine + halfGap);
        const y2 = Math.round(row === rows - 1 ? height : bottomLine - halfGap);
        for(let col = 0; col < cols; col++){
            const leftLine = col * width / cols;
            const rightLine = (col + 1) * width / cols;
            const x1 = Math.round(col === 0 ? 0 : leftLine + halfGap);
            const x2 = Math.round(col === cols - 1 ? width : rightLine - halfGap);
            if(x2 > x1 && y2 > y1) rects.push({row, col, x:x1, y:y1, w:x2 - x1, h:y2 - y1});
        }
    }
    return rects;
}
function gridSplitRectsCustom(width, height){
    const gap = Math.max(0, Math.min(240, Number(document.getElementById('gridGapSize')?.value || 0)));
    const halfGap = gap / 2;
    // 按方向归类，转换为像素位置（去重并排序）
    const rawH = [...new Set(gridCustomLines.filter(l => l.type === 'h').map(l => l.pos * height))].sort((a, b) => a - b);
    const rawV = [...new Set(gridCustomLines.filter(l => l.type === 'v').map(l => l.pos * width))].sort((a, b) => a - b);
    const hCuts = [0, ...rawH, height]; // 切割边界（含图片两端）
    const vCuts = [0, ...rawV, width];
    const rects = [];
    for(let row = 0; row < hCuts.length - 1; row++){
        for(let col = 0; col < vCuts.length - 1; col++){
            const y1 = Math.round(row === 0 ? hCuts[row] : hCuts[row] + halfGap);
            const y2 = Math.round(row === hCuts.length - 2 ? hCuts[row + 1] : hCuts[row + 1] - halfGap);
            const x1 = Math.round(col === 0 ? vCuts[col] : vCuts[col] + halfGap);
            const x2 = Math.round(col === vCuts.length - 2 ? vCuts[col + 1] : vCuts[col + 1] - halfGap);
            if(x2 > x1 && y2 > y1) rects.push({row, col, x:x1, y:y1, w:x2 - x1, h:y2 - y1});
        }
    }
    return rects;
}
function gridLayoutFromRects(rects){
    const rows = Math.max(1, ...rects.map(r => Number(r.row || 0) + 1));
    const cols = Math.max(1, ...rects.map(r => Number(r.col || 0) + 1));
    return {type:'grid-split', groupId:uid('grid'), rows, cols};
}
function applyGridPreset(rows, cols){
    gridCustomMode = false;
    gridCustomLines = [];
    gridCustomHistory = [];
    gridCustomDrag = null;
    const h = document.getElementById('gridHorizontalLines');
    const v = document.getElementById('gridVerticalLines');
    if(h){ h.disabled = false; h.value = String(Math.max(0, Number(rows || 1) - 1)); }
    if(v){ v.disabled = false; v.value = String(Math.max(0, Number(cols || 1) - 1)); }
    const toggle = document.getElementById('gridCustomToggle');
    const custom = document.getElementById('gridCustomControls');
    const regular = document.getElementById('gridRegularControls');
    if(toggle){
        toggle.classList.remove('primary');
        toggle.classList.add('secondary');
    }
    if(custom) custom.style.display = 'none';
    if(regular) regular.style.display = 'contents';
    _syncGridCustomCursor();
    _syncGridCustomUndoBtn();
    refreshGridSplitPreview();
}
// ——— 自定义宫格辅助函数 ———
function toggleGridCustomMode(){
    gridCustomMode = !gridCustomMode;
    if(gridCustomMode){ gridCustomLines = []; gridCustomHistory = []; } // 进入自定义时清空旧线及历史
    gridCustomDrag = null;
    const toggle = document.getElementById('gridCustomToggle');
    const regular = document.getElementById('gridRegularControls');
    const custom = document.getElementById('gridCustomControls');
    toggle.classList.toggle('primary', gridCustomMode);
    toggle.classList.toggle('secondary', !gridCustomMode);
    // 禁用/启用常规输入
    ['gridHorizontalLines','gridVerticalLines'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.disabled = gridCustomMode;
    });
    if(custom) custom.style.display = gridCustomMode ? 'flex' : 'none';
    _syncGridCustomCursor();
    _syncGridCustomUndoBtn();
    refreshGridSplitPreview();
}
function setGridCustomOrientation(orient){
    gridCustomOrientation = orient;
    document.getElementById('gridOrientH').classList.toggle('primary', orient === 'h');
    document.getElementById('gridOrientH').classList.toggle('secondary', orient !== 'h');
    document.getElementById('gridOrientV').classList.toggle('primary', orient === 'v');
    document.getElementById('gridOrientV').classList.toggle('secondary', orient !== 'v');
    _syncGridCustomCursor();
}
function clearGridCustomLines(){
    gridCustomHistory = [];
    gridCustomLines = [];
    gridCustomDrag = null;
    _syncGridCustomUndoBtn();
    refreshGridSplitPreview();
}
function undoGridCustomLine(){
    if(!gridCustomHistory.length) return;
    gridCustomLines = gridCustomHistory.pop();
    gridCustomDrag = null;
    _syncGridCustomUndoBtn();
    refreshGridSplitPreview();
}
function _syncGridCustomUndoBtn(){
    const btn = document.getElementById('gridUndoBtn');
    if(!btn) return;
    btn.disabled = gridCustomHistory.length === 0;
    btn.style.opacity = gridCustomHistory.length === 0 ? '0.4' : '1';
}
// ——— 图片缩放 ———
function applyImageEditZoom(){
    if(!imageEditBaseW) return;
    const img = document.getElementById('cropImage');
    const oldW = img.clientWidth;
    img.style.maxWidth = 'none';
    img.style.maxHeight = 'none';
    img.style.width = Math.round(imageEditBaseW * imageEditZoom) + 'px';
    img.style.height = Math.round(imageEditBaseH * imageEditZoom) + 'px';
    resizeEditDrawCanvas();
    // 按比例同步裁剪框位置
    if(cropState && oldW > 0){
        const scale = img.clientWidth / oldW;
        cropState.x = Math.round(cropState.x * scale);
        cropState.y = Math.round(cropState.y * scale);
        cropState.w = Math.round(cropState.w * scale);
        cropState.h = Math.round(cropState.h * scale);
        clampCrop();
        renderCropBox();
    }
    if(imageEditMode === 'grid') refreshGridSplitPreview();
    syncImageEditOverflow();
    _updateZoomLabel();
}
function syncImageEditOverflow(){
    const stage = document.getElementById('imageEditStage');
    const crop = document.getElementById('cropCanvas');
    if(!stage || !crop) return;
    const rect = crop.getBoundingClientRect();
    const pad = 36;
    const overflowX = rect.width + pad > stage.clientWidth;
    const overflowY = rect.height + pad > stage.clientHeight;
    stage.classList.toggle('overflowing', overflowX || overflowY);
    stage.classList.toggle('overflow-x', overflowX);
    stage.classList.toggle('overflow-y', overflowY);
}
function resetImageEditZoom(){
    const stage = document.getElementById('imageEditStage');
    imageEditZoom = 1.0;
    applyImageEditZoom();
    if(stage){ stage.scrollLeft = 0; stage.scrollTop = 0; }
}
function _updateZoomLabel(){
    const el = document.getElementById('imageEditZoomLabel');
    if(el) el.textContent = Math.round(imageEditZoom * 100) + '%';
}
function _syncGridCustomCursor(){
    const cropCanvasEl = document.getElementById('cropCanvas');
    cropCanvasEl.classList.toggle('grid-custom-h', imageEditMode === 'grid' && gridCustomMode && gridCustomOrientation === 'h');
    cropCanvasEl.classList.toggle('grid-custom-v', imageEditMode === 'grid' && gridCustomMode && gridCustomOrientation === 'v');
}
function refreshGridSplitPreview(){
    const canvasEl = editDrawCanvas();
    const ctx = canvasEl.getContext('2d');
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    if(imageEditMode !== 'grid') return;
    const countEl = document.getElementById('gridSplitCount');
    const lineWidth = Math.max(2, Math.round(Math.min(canvasEl.width, canvasEl.height) / 320));
    const drawGuideLine = (x1, y1, x2, y2) => {
        ctx.save();
        ctx.lineWidth = lineWidth + 2;
        ctx.strokeStyle = 'rgba(2,6,23,0.72)';
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = 'rgba(255,255,255,0.92)';
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.restore();
    };
    if(gridCustomMode){
        // 自定义模式：按已放置线渲染（包含空心范围预览）
        const gap = Math.max(0, Math.min(240, Number(document.getElementById('gridGapSize')?.value || 0)));
        const hLines = gridCustomLines.filter(l => l.type === 'h');
        const vLines = gridCustomLines.filter(l => l.type === 'v');
        if(countEl) countEl.textContent = tr('canvas.gridWillOutput').replace('{n}', (hLines.length + 1) * (vLines.length + 1));
        ctx.save();
        hLines.forEach(l => {
            const y = l.pos * canvasEl.height;
            if(gap > 0){
                drawGuideLine(0, y - gap / 2, canvasEl.width, y - gap / 2);
                drawGuideLine(0, y + gap / 2, canvasEl.width, y + gap / 2);
            } else {
                drawGuideLine(0, y, canvasEl.width, y);
            }
        });
        vLines.forEach(l => {
            const x = l.pos * canvasEl.width;
            if(gap > 0){
                drawGuideLine(x - gap / 2, 0, x - gap / 2, canvasEl.height);
                drawGuideLine(x + gap / 2, 0, x + gap / 2, canvasEl.height);
            } else {
                drawGuideLine(x, 0, x, canvasEl.height);
            }
        });
        ctx.restore();
        return;
    }
    // 常规模式
    const {rows, cols, gap} = gridSplitSettings();
    if(countEl) countEl.textContent = tr('canvas.gridWillOutput').replace('{n}', rows * cols);
    ctx.save();
    const scaleX = canvasEl.width;
    const scaleY = canvasEl.height;
    for(let i = 1; i < cols; i++){
        const x = i * scaleX / cols;
        if(gap > 0){
            drawGuideLine(x - gap / 2, 0, x - gap / 2, scaleY);
            drawGuideLine(x + gap / 2, 0, x + gap / 2, scaleY);
        } else {
            drawGuideLine(x, 0, x, scaleY);
        }
    }
    for(let i = 1; i < rows; i++){
        const y = i * scaleY / rows;
        if(gap > 0){
            drawGuideLine(0, y - gap / 2, scaleX, y - gap / 2);
            drawGuideLine(0, y + gap / 2, scaleX, y + gap / 2);
        } else {
            drawGuideLine(0, y, scaleX, y);
        }
    }
    ctx.restore();
}
function imageEditorOutputPoint(node, offsetY=0){
    return {x:(node.x || 0) + Number(node.w || 260) + 36, y:(node.y || 0) + offsetY};
}
function imageEditorOutputNode(sourceNode){
    let out = connections.filter(c => c.from === sourceNode.id)
        .map(c => nodes.find(n => n.id === c.to))
        .find(n => n?.type === 'output');
    if(!out){
        const p = imageEditorOutputPoint(sourceNode, 0);
        out = {id:uid('out'), type:'output', x:p.x, y:p.y, images:[]};
        nodes.push(out);
    }
    return out;
}
function addGeneratedImageNode(file, sourceNode, suffix, offsetY=0, extra={}){
    const p = imageEditorOutputPoint(sourceNode, offsetY);
    const next = {id:uid('img'), type:'image', x:p.x, y:p.y, url:file.url, name:file.name || suffix, ...extra};
    nodes.push(next);
    selected.clear();
    selected.add(next.id);
    return next;
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
        img.style.left = '';
        img.style.top = '';
        if(draw){
            draw.style.left = '';
            draw.style.top = '';
        }
    }
    const box = document.getElementById('cropBox');
    box.style.left = `${boxX}px`;
    box.style.top = `${boxY}px`;
    box.style.width = `${cropState.w}px`;
    box.style.height = `${cropState.h}px`;
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
    const scaleX = Math.max(1, Number(img.naturalWidth || 1)) / Math.max(1, Number(img.clientWidth || 1));
    const scaleY = Math.max(1, Number(img.naturalHeight || 1)) / Math.max(1, Number(img.clientHeight || 1));
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
    cropCanvasEl?.classList.toggle('outpaint-warning', exceedsFourKStandard(size.w, size.h));
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
    const {w, h} = cropBounds();
    cropState.x = 0;
    cropState.y = 0;
    cropState.w = w;
    cropState.h = h;
    renderCropBox();
}
function resetCropBox(){
    if(!cropState) return;
    if(imageEditMode === 'outpaint') return resetOutpaintBox();
    const {w, h} = cropBounds();
    cropState.x = Math.round(w * 0.08);
    cropState.y = Math.round(h * 0.08);
    cropState.w = Math.round(w * 0.84);
    cropState.h = Math.round(h * 0.84);
    renderCropBox();
}
function openImageEditor(nodeId){
    const node = nodes.find(n => n.id === nodeId);
    if(!node?.url) return;
    if(mediaKindForNode(node) !== 'image') return;
    cropState = {nodeId, x:0, y:0, w:0, h:0};
    // 重置自定义宫格状态
    gridCustomMode = false;
    gridCustomLines = [];
    gridCustomHistory = [];
    gridCustomDrag = null;
    gridCustomOrientation = 'h';
    imageEditZoom = 1.0;
    imageEditBaseW = 0;
    imageEditBaseH = 0;
    imageEditModeTouched = false;
    const toggle = document.getElementById('gridCustomToggle');
    if(toggle){ toggle.classList.add('secondary'); toggle.classList.remove('primary'); }
    const custom = document.getElementById('gridCustomControls');
    if(custom) custom.style.display = 'none';
    ['gridHorizontalLines','gridVerticalLines'].forEach(id => { const el = document.getElementById(id); if(el) el.disabled = false; });
    const orientH = document.getElementById('gridOrientH');
    const orientV = document.getElementById('gridOrientV');
    if(orientH){ orientH.classList.add('primary'); orientH.classList.remove('secondary'); }
    if(orientV){ orientV.classList.add('secondary'); orientV.classList.remove('primary'); }
    _syncGridCustomUndoBtn();
    _updateZoomLabel();
    const modal = document.getElementById('imageEditModal');
    const img = document.getElementById('cropImage');
    img.style.width = '';
    img.style.height = '';
    img.style.maxWidth = '';
    img.style.maxHeight = '';
    modal.classList.add('open');
    img.onload = () => {
        // 记录 zoom=1 时的基础显示尺寸
        imageEditBaseW = img.clientWidth;
        imageEditBaseH = img.clientHeight;
        _updateZoomLabel();
        resizeEditDrawCanvas();
        resetEditDrawingHistory();
        clearEditDrawing(true);
        resetCropBox();
        if(!imageEditModeTouched) setImageEditMode('crop');
        syncImageEditOverflow();
        refreshIcons();
    };
    img.crossOrigin = 'anonymous';
    img.src = node.url;
    setImageEditMode('crop');
    refreshIcons();
}
function closeImageEditor(){
    document.getElementById('imageEditModal').classList.remove('open');
    const img = document.getElementById('cropImage');
    img.onload = null;
    img.removeAttribute('src');
    img.style.width = '';
    img.style.height = '';
    img.style.maxWidth = '';
    img.style.maxHeight = '';
    clearEditDrawing(true);
    cropState = null;
    cropDrag = null;
    editDrawState = null;
    resetEditDrawingHistory();
    gridCustomDrag = null;
    imageEditZoom = 1.0;
    imageEditBaseW = 0;
    imageEditBaseH = 0;
    imageEditModeTouched = false;
    document.getElementById('imageEditStage')?.classList.remove('overflowing', 'overflow-x', 'overflow-y');
    const cropCanvasEl = document.getElementById('cropCanvas');
    cropCanvasEl.classList.remove('grid-custom-h', 'grid-custom-v', 'outpaint-mode', 'outpaint-warning', 'dragging-image');
    cropCanvasEl.style.width = '';
    cropCanvasEl.style.height = '';
}
function clampCrop(){
    if(!cropState) return;
    if(imageEditMode === 'outpaint') return clampOutpaint();
    const {w, h} = cropBounds();
    cropState.w = Math.max(24, Math.min(cropState.w, w));
    cropState.h = Math.max(24, Math.min(cropState.h, h));
    cropState.x = Math.max(0, Math.min(cropState.x, w - cropState.w));
    cropState.y = Math.max(0, Math.min(cropState.y, h - cropState.h));
}
function beginCropDrag(event, mode){
    if(!cropState) return;
    event.preventDefault();
    event.stopPropagation();
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
window.addEventListener('mousemove', event => {
    if(!cropDrag || !cropState) return;
    const dx = event.clientX - cropDrag.sx;
    const dy = event.clientY - cropDrag.sy;
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
});
window.addEventListener('mouseup', () => { cropDrag = null; document.getElementById('cropCanvas')?.classList.remove('dragging-image'); });
async function uploadCroppedBlob(blob, name){
    const form = new FormData();
    form.append('files', blob, name);
    const data = await fetch('/api/ai/upload', {method:'POST', body:form}).then(r=>r.json());
    return data.files?.[0];
}
async function uploadImageBlobs(blobs){
    const form = new FormData();
    blobs.forEach(item => form.append('files', item.blob, item.name));
    const data = await fetch('/api/ai/upload', {method:'POST', body:form}).then(r=>r.json());
    return data.files || [];
}
async function applyImageCrop(){
    if(!cropState) return;
    const node = nodes.find(n => n.id === cropState.nodeId);
    const img = document.getElementById('cropImage');
    if(!node || !img.naturalWidth || !img.naturalHeight) return;
    const scaleX = img.naturalWidth / (img.clientWidth || 1);
    const scaleY = img.naturalHeight / (img.clientHeight || 1);
    const sx = Math.max(0, Math.round(cropState.x * scaleX));
    const sy = Math.max(0, Math.round(cropState.y * scaleY));
    const sw = Math.max(1, Math.round(cropState.w * scaleX));
    const sh = Math.max(1, Math.round(cropState.h * scaleY));
    const canvasEl = document.createElement('canvas');
    canvasEl.width = sw;
    canvasEl.height = sh;
    canvasEl.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    const blob = await new Promise(resolve => canvasEl.toBlob(resolve, 'image/png'));
    if(!blob) return;
    const base = (node.name || 'image').replace(/\.[^.]+$/, '');
    const file = await uploadCroppedBlob(blob, `${base}_crop.png`);
    if(file){
        node.url = file.url;
        node.name = file.name;
        closeImageEditor();
        render();
        scheduleSave();
    }
}
async function applyImageOutpaint(){
    if(!cropState) return;
    const node = nodes.find(n => n.id === cropState.nodeId);
    const img = document.getElementById('cropImage');
    if(!node || !img.naturalWidth || !img.naturalHeight) return;
    clampOutpaint();
    const scaleX = img.naturalWidth / (img.clientWidth || 1);
    const scaleY = img.naturalHeight / (img.clientHeight || 1);
    const outW = Math.max(img.naturalWidth, Math.round(cropState.w * scaleX));
    const outH = Math.max(img.naturalHeight, Math.round(cropState.h * scaleY));
    const dx = Math.round(cropState.x * scaleX);
    const dy = Math.round(cropState.y * scaleY);
    const canvasEl = document.createElement('canvas');
    canvasEl.width = outW;
    canvasEl.height = outH;
    const ctx = canvasEl.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(img, dx, dy, img.naturalWidth, img.naturalHeight);
    const blob = await new Promise(resolve => canvasEl.toBlob(resolve, 'image/png'));
    if(!blob) return;
    const base = (node.name || 'image').replace(/\.[^.]+$/, '');
    const file = await uploadCroppedBlob(blob, `${base}_outpaint.png`);
    if(file){
        node.url = file.url;
        node.name = file.name;
        node.mediaKind = 'image';
        node.natural_w = outW;
        node.natural_h = outH;
        closeImageEditor();
        render();
        scheduleSave();
    }
}
async function applyImageMask(){
    if(!cropState) return;
    const node = nodes.find(n => n.id === cropState.nodeId);
    if(!node || !editCanvasHasPixels()) return;
    const mask = maskCanvasFromDrawCanvas(editDrawCanvas());
    const blob = await new Promise(resolve => mask.toBlob(resolve, 'image/png'));
    if(!blob) return;
    const base = (node.name || 'image').replace(/\.[^.]+$/, '');
    const file = await uploadCroppedBlob(blob, `${base}_mask.png`);
    if(file){
        addGeneratedImageNode(file, node, 'mask', 28, {role:'mask'});
        closeImageEditor();
        render();
        scheduleSave();
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
    if(!cropState) return;
    const node = nodes.find(n => n.id === cropState.nodeId);
    const img = document.getElementById('cropImage');
    if(!node || !img.naturalWidth || !img.naturalHeight || !editCanvasHasPixels()) return;
    const canvasEl = document.createElement('canvas');
    canvasEl.width = img.naturalWidth;
    canvasEl.height = img.naturalHeight;
    const ctx = canvasEl.getContext('2d');
    ctx.drawImage(img, 0, 0, canvasEl.width, canvasEl.height);
    ctx.drawImage(editDrawCanvas(), 0, 0);
    const blob = await new Promise(resolve => canvasEl.toBlob(resolve, 'image/png'));
    if(!blob) return;
    const base = (node.name || 'image').replace(/\.[^.]+$/, '');
    const file = await uploadCroppedBlob(blob, `${base}_paint.png`);
    if(file){
        node.url = file.url;
        node.name = file.name;
        closeImageEditor();
        render();
        scheduleSave();
    }
}
async function applyImageGridSplit(){
    if(!cropState) return;
    const node = nodes.find(n => n.id === cropState.nodeId);
    const img = document.getElementById('cropImage');
    if(!node || !img.naturalWidth || !img.naturalHeight) return;
    const rects = gridSplitRects(img.naturalWidth, img.naturalHeight);
    if(!rects.length) return;
    const base = (node.name || 'image').replace(/\.[^.]+$/, '');
    const blobs = [];
    for(const rect of rects){
        const canvasEl = document.createElement('canvas');
        canvasEl.width = rect.w;
        canvasEl.height = rect.h;
        canvasEl.getContext('2d').drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
        const blob = await new Promise(resolve => canvasEl.toBlob(resolve, 'image/png'));
        if(blob) blobs.push({blob, name:`${base}_r${rect.row + 1}_c${rect.col + 1}.png`});
    }
    if(!blobs.length) return;
    const files = await uploadImageBlobs(blobs);
    if(files.length){
        const out = imageEditorOutputNode(node);
        const urls = files.map(file => file.url).filter(Boolean);
        const layout = gridLayoutFromRects(rects);
        appendOutputImages(out, urls, {url:node.url, name:node.name || 'source image'}, urls.map((url, i) => ({
            runMs:0,
            run:{prompt:'宫格切分', refs:[{url:node.url, name:node.name || 'source image'}]},
            grid:{...layout, row:rects[i]?.row || 0, col:rects[i]?.col || 0, w:rects[i]?.w || 1, h:rects[i]?.h || 1}
        })), layout);
        closeImageEditor();
        render();
        scheduleSave();
    }
}
function applyImageEdit(){
    if(imageEditMode === 'outpaint') return applyImageOutpaint();
    if(imageEditMode === 'mask') return applyImageMask();
    if(imageEditMode === 'brush') return applyImageBrush();
    if(imageEditMode === 'grid') return applyImageGridSplit();
    return applyImageCrop();
}

function nodeHasLiveMedia(node){
    return node?.type === 'image' && node.url && ['video','audio'].includes(mediaKindForNode(node));
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
            const promise = media.play();
            if(promise?.catch) promise.catch(() => {});
        }
    };
    if(media.readyState >= 1) applyTime();
    else media.addEventListener('loadedmetadata', applyTime, {once:true});
}
function mediaSignatureFromElement(el){
    const media = el?.querySelector?.('video,audio');
    if(!media) return '';
    const tag = media.tagName.toLowerCase();
    const url = media.dataset?.url || media.getAttribute('src') || '';
    return url ? `${tag}:${url}` : '';
}
function transplantNodeMediaElement(oldNodeEl, newNodeEl){
    const oldMedia = oldNodeEl?.querySelector?.('video,audio');
    const newMedia = newNodeEl?.querySelector?.('video,audio');
    if(!oldMedia || !newMedia) return;
    const oldSignature = mediaSignatureFromElement(oldNodeEl);
    const newSignature = mediaSignatureFromElement(newNodeEl);
    if(!oldSignature || oldSignature !== newSignature) return;
    const state = captureMediaPlaybackState(oldMedia);
    newMedia.replaceWith(oldMedia);
    restoreMediaPlaybackState(oldMedia, state);
    requestAnimationFrame(() => restoreMediaPlaybackState(oldMedia, state));
}
function captureMediaPlaybackStates(){
    const states = new Map();
    nodesEl.querySelectorAll('video[data-url], audio[data-url]').forEach(media => {
        const tag = media.tagName.toLowerCase();
        const url = media.dataset.url || media.getAttribute('src') || '';
        if(url) states.set(`${tag}:${url}`, captureMediaPlaybackState(media));
    });
    return states;
}
function restoreMediaPlaybackStates(states){
    if(!states?.size) return;
    nodesEl.querySelectorAll('video[data-url], audio[data-url]').forEach(media => {
        const tag = media.tagName.toLowerCase();
        const url = media.dataset.url || media.getAttribute('src') || '';
        restoreMediaPlaybackState(media, states.get(`${tag}:${url}`));
    });
}

function render(){
    const outputScrolls = captureOutputScrolls();
    const mediaStates = captureMediaPlaybackStates();
    const reusableMediaNodes = new Map();
    nodesEl.querySelectorAll('.node').forEach(el => {
        const node = nodes.find(n => n.id === el.dataset.id);
        if(nodeHasLiveMedia(node)) reusableMediaNodes.set(node.id, el);
    });
    applyViewport();
    [...nodesEl.children].forEach(child => {
        if(!reusableMediaNodes.has(child.dataset?.id)) child.remove();
    });
    nodes.forEach(node => {
        const fresh = renderNode(node);
        const old = reusableMediaNodes.get(node.id);
        nodesEl.appendChild(fresh);
        if(old){
            transplantNodeMediaElement(old, fresh);
            if(old !== fresh) old.remove();
        }
    });
    restoreMediaPlaybackStates(mediaStates);
    restoreOutputScrolls(outputScrolls);
    refreshGeometry();
    refreshGeometryAfterLayout();
    refreshIcons();
    refreshOutputTimer();
}
function refreshNodes(ids=[]){
    const uniqueIds = [...new Set((ids || []).filter(Boolean))];
    if(!uniqueIds.length) return;
    const outputScrolls = captureOutputScrolls();
    applyViewport();
    for(const id of uniqueIds){
        const node = nodes.find(n => n.id === id);
        if(!node) continue;
        if(node.type === 'output' && refreshOutputNodeContent(node)) continue;
        const current = nodesEl.querySelector(`.node[data-id="${CSS.escape(id)}"]`);
        if(!current){
            render();
            return;
        }
        const fresh = renderNode(node);
        if(nodeHasLiveMedia(node)) transplantNodeMediaElement(current, fresh);
        current.replaceWith(fresh);
    }
    restoreOutputScrolls(outputScrolls);
    refreshGeometry();
    refreshGeometryAfterLayout();
    refreshIcons();
    refreshOutputTimer();
}
function refreshRunNodes(node, out=null){
    refreshNodes([node?.id, out?.id]);
}
function captureOutputScrolls(){
    const state = new Map();
    // output 节点滚动位置
    nodesEl.querySelectorAll('.output-node').forEach(el => {
        const body = el.querySelector('.node-body');
        if(body) state.set('out:' + el.dataset.id, { top:body.scrollTop, left:body.scrollLeft });
    });
    // LLM 聊天日志滚动位置（记录是否在底部，以便恢复时保持底部）
    nodesEl.querySelectorAll('.llm-node').forEach(el => {
        const log = el.querySelector('.llm-chat-log');
        if(!log) return;
        const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 12;
        state.set('llm:' + el.dataset.id, { top:log.scrollTop, atBottom });
    });
    return state;
}
function restoreOutputScrolls(state){
    requestAnimationFrame(() => {
        state.forEach((pos, key) => {
            if(key.startsWith('out:')){
                const id = key.slice(4);
                const body = nodesEl.querySelector(`.output-node[data-id="${CSS.escape(id)}"] .node-body`);
                if(body){ body.scrollTop = pos.top || 0; body.scrollLeft = pos.left || 0; }
            } else if(key.startsWith('llm:')){
                const id = key.slice(4);
                const log = nodesEl.querySelector(`.llm-node[data-id="${CSS.escape(id)}"] .llm-chat-log`);
                if(log){
                    // 之前在底部 → 保持底部（显示最新消息）；否则恢复原位
                    log.scrollTop = pos.atBottom ? log.scrollHeight : (pos.top || 0);
                }
            }
        });
    });
}
function isNodeControl(target){
    return !!target.closest('textarea, input, select, option, button, audio, video, [contenteditable="true"], .seg, .gen-btn, .comfy-run, .input-item, .blank-image, .mode-tabs, .ms-model-tabs, .llm-provider, .llm-output, .llm-chat-log, .llm-bubble, .llm-pane-resizer, .loop-preview');
}
function isNodeDragSurface(target){
    return !isNodeControl(target) && !target.closest('.port, .resize-handle, .output-img-wrap');
}
function renderNode(node){
    normalizeApiNodeLayout(node);
    if(node.type === 'rh' && Number(node.h) === 560) delete node.h;
    const el = document.createElement('div');
    const size = defaultNodeSize(node.type);
    const hasFixedSize = Boolean(node.h || size.h);
    el.className = `node ${node.type}-node ${node.url ? 'has-image' : ''} ${hasFixedSize ? 'sized' : ''} ${selected.has(node.id) ? 'selected' : ''}`;
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;
    el.style.width = `${node.w || size.w}px`;
    if(node.h || size.h) el.style.height = `${node.h || size.h}px`;
    el.dataset.id = node.id;
    el.onclick = (e) => {
        e.stopPropagation();
        if(isNodeControl(e.target)) return;
        if(e.ctrlKey || e.metaKey) selected.has(node.id) ? selected.delete(node.id) : selected.add(node.id);
        else if(!selected.has(node.id)) { selected.clear(); selected.add(node.id); }
        refreshSelectionVisuals();
    };
    el.oncontextmenu = e => {
        if(!CANVAS_GENERATOR_TYPES.includes(node.type) && node.type !== 'output') return;
        e.preventDefault();
        e.stopPropagation();
        if(node.type === 'output') openOutputNodeMenu(node.id, e.clientX, e.clientY);
        else openGeneratorNodeMenu(node.id, e.clientX, e.clientY);
    };
    const title = node.type === 'image' ? 'Image' : node.type === 'prompt' ? 'Prompt' : node.type === 'loop' ? tr('canvas.loopNode') : node.type === 'promptGroup' ? 'Prompts' : node.type === 'group' ? 'Group' : node.type === 'output' ? 'Output' : node.type === 'llm' ? 'LLM' : node.type === 'comfy' ? 'ComfyUI' : node.type === 'rh' ? 'RunningHub' : node.type === 'msgen' ? tr('canvas.modelscopeGenerate') : node.type === 'video' ? tr('canvas.videoGenerateNode') : tr('canvas.apiGenerate');
    const displayTitle = node.type === 'image' && node.url ? nodeTitleForMedia(node) : title;
    // 失败徽章只在一键运行模式中显示，单节点失败已通过 alert 提示
    const showStatus = ['generator','msgen','comfy','llm','rh'].includes(node.type) && node.runStatus
        && (node.runStatus !== 'failed' || node._cascadeFailed);
    const statusHtml = showStatus ? (() => {
        const label = { queued:'排队中', running:'运行中', done:'完成', failed:'失败' }[node.runStatus] || '';
        return `<span class="node-run-status ${node.runStatus}"><span class="dot"></span>${escapeHtml(label)}${node._cascadeIdx?' '+node._cascadeIdx:''}</span>`;
    })() : '';
    el.innerHTML = `<div class="node-head"><span class="node-title">${displayTitle}</span><div style="display:flex;align-items:center;gap:8px">${statusHtml}<button onclick="deleteNodeFromButton('${node.id}', event)" class="text-gray-300 hover:text-red-500"><i data-lucide="x" class="w-4 h-4"></i></button></div></div>`;
    const body = document.createElement('div');
    body.className = 'node-body';
    if(node.type === 'image') {
        if(node.url) {
            const missing = isMissingAssetUrl(node.url);
            const mediaKind = mediaKindForNode(node);
            const isEditableImage = mediaKind === 'image' && !missing;
            body.innerHTML = `<div class="image-preview-wrap">${missing ? missingAssetHtml(node.url) : `<img src="${escapeAttr(node.url)}" draggable="false">`}</div><div class="image-caption text-[11px] text-gray-400 truncate">${escapeHtml(node.name || 'image')}${missing ? ` · ${langIsEn() ? 'missing' : '文件缺失'}` : ''}</div>`;
            if(!missing && mediaKind !== 'image'){
                const mediaHtml = mediaKind === 'video'
                    ? `<div class="media-card video-card"><video src="${escapeAttr(node.url)}" data-url="${escapeAttr(node.url)}" controls preload="metadata" playsinline disablepictureinpicture controlslist="nodownload noplaybackrate noremoteplayback"></video></div>`
                    : `<div class="media-card audio-card"><i data-lucide="file-audio" class="w-8 h-8"></i><div class="audio-title">${escapeHtml(node.name || 'Audio')}</div><div class="audio-sub">AUDIO</div><audio src="${escapeAttr(node.url)}" data-url="${escapeAttr(node.url)}" controls preload="metadata"></audio></div>`;
                body.innerHTML = `<div class="image-preview-wrap">${mediaHtml}</div><div class="image-caption text-[11px] text-gray-400 truncate">${escapeHtml(node.name || nodeTitleForMedia(node))}</div>`;
            }
            const previewWrap = body.querySelector('.image-preview-wrap');
            const loadedImg = body.querySelector('img');
            const openEditor = e => {
                if(!isEditableImage) return;
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                openImageEditor(node.id);
            };
            body.onmousedown = e => {
                if(e.detail >= 2){
                    openEditor(e);
                    return;
                }
                startNodeDrag(e, node);
            };
            body.ondragover = e => {
                if(hasImageDropData(e.dataTransfer) || hasOutputImageDrag(e.dataTransfer)){
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = hasOutputImageDrag(e.dataTransfer) ? 'copy' : 'move';
                    previewWrap.classList.add('drag-over');
                    /* 节点内拖拽时把画布全局的毛玻璃覆盖层关掉，避免 stopPropagation 后 board 没机会清它 */
                    dropOverlay.classList.remove('active');
                }
            };
            body.ondragleave = e => {
                e.stopPropagation();
                previewWrap.classList.remove('drag-over');
            };
            body.ondrop = e => {
                if(hasOutputImageDrag(e.dataTransfer)){
                    e.preventDefault();
                    e.stopPropagation();
                    previewWrap.classList.remove('drag-over');
                    dropOverlay.classList.remove('active');
                    setImageNodeFromOutput(node.id, e.dataTransfer.getData('application/x-canvas-output-image'));
                } else if(hasImageFiles(e.dataTransfer?.items)){
                    e.preventDefault();
                    e.stopPropagation();
                    previewWrap.classList.remove('drag-over');
                    dropOverlay.classList.remove('active');
                    uploadFilesFromDataTransfer(e.dataTransfer).then(files => fillImageNode(node.id, files, {group:files.length > 1}));
                } else {
                    const droppedUrl = imageUrlFromDataTransfer(e.dataTransfer);
                    if(droppedUrl){
                        e.preventDefault();
                        e.stopPropagation();
                        previewWrap.classList.remove('drag-over');
                        dropOverlay.classList.remove('active');
                        node.url = droppedUrl;
                        node.name = outputImageName(droppedUrl);
                        node.mediaKind = isVideoUrl(droppedUrl) ? 'video' : isAudioUrl(droppedUrl) ? 'audio' : 'image';
                        render();
                        scheduleSave();
                    }
                }
            };
            body.oncontextmenu = e => {
                e.preventDefault();
                e.stopPropagation();
                openImageNodeMenu(node.id, e.clientX, e.clientY);
            };
            if(loadedImg && isEditableImage){
                loadedImg.addEventListener('mousedown', e => {
                    if(e.detail >= 2) openEditor(e);
                }, true);
                loadedImg.addEventListener('dblclick', openEditor, true);
            }
            if(isEditableImage) body.addEventListener('dblclick', openEditor, true);
            if(loadedImg && loadedImg.complete && loadedImg.naturalHeight > 0){
                requestAnimationFrame(refreshGeometry);
            } else if(loadedImg) {
                loadedImg.onload = () => refreshGeometryAfterLayout();
            }
        } else {
        body.innerHTML = `<div class="blank-image"><i data-lucide="image-plus" class="w-7 h-7"></i><div class="text-[11px] font-bold">${tr('canvas.clickDragPasteImage')}</div></div>`;
            const blank = body.querySelector('.blank-image');
            blank.onclick = () => pickImageForNode(node.id);
            blank.ondragover = e => { if(hasImageDropData(e.dataTransfer) || hasOutputImageDrag(e.dataTransfer)){ e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = hasOutputImageDrag(e.dataTransfer) ? 'copy' : 'move'; blank.classList.add('drag-over'); dropOverlay.classList.remove('active'); } };
            blank.ondragleave = e => { e.stopPropagation(); blank.classList.remove('drag-over'); };
            blank.ondrop = e => {
                if(hasOutputImageDrag(e.dataTransfer)){
                    e.preventDefault();
                    e.stopPropagation();
                    blank.classList.remove('drag-over');
                    dropOverlay.classList.remove('active');
                    setImageNodeFromOutput(node.id, e.dataTransfer.getData('application/x-canvas-output-image'));
                } else if(hasImageFiles(e.dataTransfer?.items)){
                    e.preventDefault();
                    e.stopPropagation();
                    blank.classList.remove('drag-over');
                    dropOverlay.classList.remove('active');
                    uploadFilesFromDataTransfer(e.dataTransfer).then(files => fillImageNode(node.id, files, {group:files.length > 1}));
                } else {
                    const droppedUrl = imageUrlFromDataTransfer(e.dataTransfer);
                    if(droppedUrl){
                        e.preventDefault();
                        e.stopPropagation();
                        blank.classList.remove('drag-over');
                        dropOverlay.classList.remove('active');
                        node.url = droppedUrl;
                        node.name = outputImageName(droppedUrl);
                        node.mediaKind = isVideoUrl(droppedUrl) ? 'video' : isAudioUrl(droppedUrl) ? 'audio' : 'image';
                        render();
                        scheduleSave();
                    }
                }
            };
        }
    }
    if(node.type === 'prompt') {
        body.innerHTML = `<div class="prompt-editor"><textarea placeholder="${tr('canvas.promptPlaceholder')}">${escapeHtml(node.text || '')}</textarea>${promptCounterHtml(node.text || '')}</div>`;
        const textarea = body.querySelector('textarea');
        bindScrollableText(textarea);
        textarea.oninput = e => {
            node.text = e.target.value;
            refreshPromptCounter(body, node.text);
            scheduleSave();
            syncGeneratorInputs();
            refreshGeneratorInputViews();
        };
    }
    if(node.type === 'loop') body.appendChild(renderLoopBody(node));
    if(node.type === 'group') {
        const items = (node.items || []).map(id => nodes.find(n => n.id === id)).filter(Boolean);
        const imgCount = items.filter(n => n.type === 'image').length;
        const promptCount = items.filter(n => n.type === 'prompt').length;
        const parts = [];
        if(imgCount) parts.push(`${imgCount} ${tr('canvas.imageCount')}`);
        if(promptCount) parts.push(`${promptCount} ${tr('canvas.promptCount')}`);
        const text = parts.length ? `${parts.join(' · ')} ${tr('canvas.grouped')}` : tr('canvas.groupEmpty');
        body.innerHTML = `<div class="text-[11px] text-gray-400">${text}</div>`;
    }
    if(node.type === 'promptGroup') {
        const promptNodes = (node.items || []).map(id => nodes.find(n => n.id === id)).filter(Boolean);
        body.innerHTML = `<div class="text-[11px] text-gray-400">${promptNodes.length} ${tr('canvas.promptCount')} ${tr('canvas.grouped')}</div>`;
    }
    if(node.type === 'llm') body.appendChild(renderLLMBody(node));
    if(node.type === 'generator') body.appendChild(renderGeneratorBody(node));
    if(node.type === 'msgen') body.appendChild(renderMsGenBody(node));
    if(node.type === 'video') body.appendChild(renderVideoBody(node));
    if(node.type === 'rh') body.appendChild(renderRhBody(node));
    if(node.type === 'comfy') body.appendChild(renderComfyBody(node));
    if(node.type === 'output') {
        const pendingHtml = (node._pending || []).map(p =>
            `<div class="output-img-wrap loading-wrap" data-pending-id="${escapeAttr(p.id)}"><span class="output-time-pill running">${formatRunDuration(nowMs() - Number(p.startedAt || nowMs()))}</span><div class="output-spinner"></div><button class="output-del" title="${tr('common.delete')}">×</button></div>`
        ).join('');
        body.innerHTML = renderOutputGrid(node, pendingHtml);
        body.onwheel = e => {
            e.stopPropagation();
        };
        body.querySelectorAll('.output-img-wrap').forEach(wrap => bindOutputWrap(wrap, node));
    }
    el.appendChild(body);
    el.querySelectorAll('button, select, textarea, input').forEach(control => {
        control.addEventListener('mousedown', e => e.stopPropagation());
        control.addEventListener('click', e => e.stopPropagation());
    });
    el.onmousedown = e => {
        if(e.button !== 0 || !isNodeDragSurface(e.target)) return;
        startNodeDrag(e, node);
    };
    const canInput = ['generator','comfy','output','llm','msgen','video','rh'].includes(node.type) || (node.type === 'loop' && (node.imageInput || node.showPrompt));
    const canOutput = ['image','prompt','loop','group','promptGroup','generator','comfy','llm','msgen','video','rh'].includes(node.type);
    if(canInput) el.insertAdjacentHTML('beforeend', `<div class="port in" title="${tr('canvas.connectHere')}"></div>`);
    if(canOutput) el.insertAdjacentHTML('beforeend', `<div class="port out" title="${tr('canvas.dragConnect')}"></div>`);
    el.insertAdjacentHTML('beforeend', `<div class="resize-handle" title="${tr('canvas.resize')}"></div>`);
    el.querySelector('.node-head').onmousedown = e => { if(e.button === 0) startNodeDrag(e, node); };
    el.querySelector('.resize-handle').onmousedown = e => { if(e.button === 0 && !e.shiftKey) startNodeResize(e, node); };
    el.ondragstart = e => { e.preventDefault(); e.stopPropagation(); };
    const out = el.querySelector('.port.out');
    if(out) out.onmousedown = e => { if(e.button === 0 && !e.shiftKey) startLink(e, node.id, 'out'); };
    const inp = el.querySelector('.port.in');
    if(inp) inp.onmousedown = e => { if(e.button === 0 && !e.shiftKey) startLink(e, node.id, 'in'); };
    return el;
}
function bindOutputWrap(wrap, node){
    const img = wrap.querySelector('img');
    const video = wrap.querySelector('video');
    const audio = wrap.querySelector('audio');
    const del = wrap.querySelector('.output-del');
    if(img){
        img.draggable = true;
        img.ondragstart = e => {
            e.stopPropagation();
            img.dataset.dragging = '1';
            setOutputDragPreview(e, img);
            e.dataTransfer.effectAllowed = 'copy';
            e.dataTransfer.setData('application/x-canvas-output-image', img.dataset.url);
            e.dataTransfer.setData('text/uri-list', img.dataset.url);
        };
        img.ondragend = () => setTimeout(() => { delete img.dataset.dragging; }, 0);
        img.onclick = e => {
            e.stopPropagation();
            if(img.dataset.dragging) return;
            openOutputLightbox(img.dataset.url, node);
        };
    }
    if(video){
        video.onclick = e => {
            e.stopPropagation();
            openOutputLightbox(video.dataset.url, node);
        };
    }
    if(del){
        del.onmousedown = e => e.stopPropagation();
        del.onclick = e => {
            e.stopPropagation();
            const pid = wrap.dataset.pendingId;
            if(pid){
                node._pending = (node._pending || []).filter(p => p.id !== pid);
            } else {
                const url = img?.dataset.url || video?.dataset.url || audio?.dataset.url || wrap.dataset.outputUrl || wrap.dataset.missingUrl || '';
                node.images = (node.images || []).filter(item => outputUrlValue(item) !== url);
                if(node.imageComparisons) delete node.imageComparisons[url];
                scheduleSave();
            }
            refreshNodes([node.id]);
        };
    }
}
function outputDomKeyForItem(item){
    return `url:${outputUrlValue(item)}`;
}
function outputDomKeyForPending(pending){
    return `pending:${pending?.id || ''}`;
}
function refreshOutputNodeContent(node){
    const el = nodesEl.querySelector(`.output-node[data-id="${CSS.escape(node.id)}"]`);
    const body = el?.querySelector('.node-body');
    const grid = body?.querySelector('.output-grid');
    if(!body || !grid) return false;
    body.onwheel = e => { e.stopPropagation(); };
    const layout = outputGridLayout(node);
    grid.classList.toggle('grid-layout', !!layout);
    if(layout) grid.style.setProperty('--grid-cols', String(Math.max(1, Number(layout.cols || 1))));
    else grid.style.removeProperty('--grid-cols');
    const items = [
        ...(node.images || []).map(item => ({
            key:outputDomKeyForItem(item),
            html:renderOutputMedia(item, !!layout)
        })),
        ...(node._pending || []).map(p => ({
            key:outputDomKeyForPending(p),
            html:`<div class="output-img-wrap loading-wrap" data-pending-id="${escapeAttr(p.id)}"><span class="output-time-pill running">${formatRunDuration(nowMs() - Number(p.startedAt || nowMs()))}</span><div class="output-spinner"></div><button class="output-del" title="${tr('common.delete')}">×</button></div>`
        }))
    ];
    const wanted = new Set(items.map(item => item.key));
    [...grid.children].forEach(child => {
        const key = child.dataset.pendingId ? outputDomKeyForPending({id:child.dataset.pendingId}) : `url:${child.dataset.outputUrl || child.dataset.missingUrl || child.querySelector('img,video,audio')?.dataset.url || ''}`;
        if(!wanted.has(key)) child.remove();
        else child.dataset.outputKey = key;
    });
    items.forEach(item => {
        let child = [...grid.children].find(el => el.dataset.outputKey === item.key);
        if(!child){
            grid.insertAdjacentHTML('beforeend', item.html);
            child = grid.lastElementChild;
            child.dataset.outputKey = item.key;
            bindOutputWrap(child, node);
        }
        grid.appendChild(child);
    });
    refreshOutputTimer();
    return true;
}
function defaultNodeSize(type){
    if(type === 'image') return {w:260, h:336};
    if(type === 'prompt') return {w:310, h:0};
    if(type === 'loop') return {w:336, h:0};
    if(type === 'llm') return {w:420, h:590};
    if(type === 'generator') return {w:380, h:0};
    if(type === 'msgen') return {w:380, h:0};
    if(type === 'video') return {w:400, h:0};
    if(type === 'rh') return {w:430, h:0};
    if(type === 'comfy') return {w:420, h:460};
    if(type === 'output') return {w:460, h:0};
    return {w:260, h:0};
}
function loopCount(node){
    return Math.max(1, Math.min(100, Number(node?.count || 1) || 1));
}
function splitPromptIntoItems(text){
    const trimmed = String(text || '').trim();
    if(!trimmed) return [];
    const numbered = trimmed.split(/\s*(?:^|\s)\d+\s*[.、)）．]\s+/).map(s => s.trim()).filter(Boolean);
    if(numbered.length >= 2) return numbered;
    const lines = trimmed.split(/\r?\n+/).map(s => s.trim()).filter(Boolean);
    if(lines.length >= 2) return lines;
    return [trimmed];
}
const loopPromptVisiting = new Set();
function loopInputPromptItems(node){
    if(!node?.showPrompt) return [];
    if(loopPromptVisiting.has(node.id)) return [];
    loopPromptVisiting.add(node.id);
    try {
        const items = [];
        connections.filter(c => c.to === node.id)
            .map(c => nodes.find(n => n.id === c.from))
            .filter(Boolean)
            .forEach(n => {
                let text = '';
                if(n.type === 'prompt') {
                    if((n.text || '').trim()) items.push((n.text || '').trim());
                    return;
                }
                else if(n.type === 'promptGroup') {
                    const parts = (n.items || []).map(id => nodes.find(x => x.id === id)).filter(Boolean).map(p => p.text || '').filter(Boolean);
                    parts.forEach(part => {
                        const text = String(part || '').trim();
                        if(text) items.push(text);
                    });
                    return;
                }
                else if(n.type === 'loop') text = renderLoopPrompt(n);
                else if(n.type === 'llm') text = n.outputText || '';
                if(String(text || '').trim()) items.push(String(text || '').trim());
            });
        return items;
    } finally {
        loopPromptVisiting.delete(node.id);
    }
}
function loopInputPrompt(node, ctx=loopContext){
    const items = loopInputPromptItems(node);
    if(!items.length) return '';
    const startBase = Math.max(1, Number(node?.loopStart) || 1);
    const currentIndex = Math.max(1, Number(ctx?.index || startBase) || startBase);
    return items[(currentIndex - 1) % items.length];
}
function renderLoopPrompt(node, ctx=loopContext){
    if(!node?.showPrompt) return '';
    const variable = String(node?.variablePrompt || '').trim();
    const count = loopCount(node);
    const index = Math.max(1, Number(ctx?.index || 1) || 1);
    const total = Math.max(1, Number(ctx?.total || count) || count);
    const replaceVars = text => String(text || '')
        .replaceAll('《计数》', String(index))
        .replaceAll('《总数》', String(total))
        .replaceAll('《进度》', `${index}/${total}`)
        .replaceAll(`[${tr('canvas.counterToken')}]`, String(index))
        .replaceAll(`[${tr('canvas.totalToken')}]`, String(total))
        .replaceAll(`[${tr('canvas.progressToken')}]`, `${index}/${total}`);
    const selected = loopInputPrompt(node, ctx);
    if(selected) return replaceVars(selected);
    return replaceVars(variable);
}
function imageRefsFromNode(node){
    if(!node) return [];
    if(node.type === 'image' && node.url && mediaKindForNode(node) === 'image') return [{url:node.url, name:node.name || 'image', role:node.role || '', kind:'image'}];
    if(node.type === 'group'){
        return (node.items || [])
            .map(id => nodes.find(x => x.id === id))
            .filter(x => x?.type === 'image' && x?.url && mediaKindForNode(x) === 'image')
            .map(img => ({url:img.url, name:img.name || 'image', role:img.role || '', kind:'image'}));
    }
    if(node.type === 'output'){
        return (node.images || [])
            .map(outputUrlValue)
            .filter(url => url && !isVideoUrl(url) && !isAudioUrl(url))
            .map((url, i) => ({url, name:outputImageName(url) || `output-${i + 1}.png`, kind:'image'}));
    }
    if(CANVAS_IMAGE_OUTPUT_TYPES.includes(node.type)) return generatedImageRefs(node);
    return [];
}
function loopInputImageRefs(node, ctx=loopContext){
    if(!node?.imageInput) return [];
    const allRefs = connections
        .filter(c => c.to === node.id)
        .flatMap(c => imageRefsFromNode(nodes.find(n => n.id === c.from)))
        .filter(ref => ref?.url);
    if(!allRefs.length) return [];
    const startBase = Math.max(1, Number(node.loopStart) || 1);
    const batchSize = Math.max(1, Math.min(100, Number(node.imageBatchSize) || 1));
    const currentIndex = Math.max(1, Number(ctx?.index || startBase) || startBase);
    const start = Math.max(0, currentIndex - 1);
    return allRefs.slice(start, start + batchSize);
}
function loopTokenLabel(token){
    if(token === '《计数》') return tr('canvas.counterToken');
    if(token === '《总数》') return tr('canvas.totalToken');
    if(token === '《进度》') return tr('canvas.progressToken');
    return token;
}
function autoSizeLoopNode(node, opening){
    if(!node) return;
    if(opening){
        node.w = Math.max(Number(node.w || 0), 336);
        node.h = Math.max(Number(node.h || 0), 360);
    } else {
        node.w = Math.min(Number(node.w || 336), 336);
        delete node.h;
    }
}
function autoSizeLoopForPanels(node){
    if(!node) return;
    node.w = Math.max(Number(node.w || 0), 336);
    if(node.showPrompt && node.imageInput) node.h = 390;
    else if(node.showPrompt) node.h = 330;
    else if(node.imageInput) node.h = 320;
    else delete node.h;
}
function loopTokenChipHtml(token){
    return `<span class="loop-token-chip" contenteditable="false" data-token="${escapeAttr(token)}"><span>${escapeHtml(loopTokenLabel(token))}</span><button type="button" aria-label="${tr('common.delete')}" title="${tr('common.delete')}">×</button></span>`;
}
function loopVariableHtml(text){
    const token = '《计数》';
    return String(text || '').split(token).map((part, i) => `${i ? loopTokenChipHtml(token) : ''}${escapeHtml(part)}`).join('');
}
function loopEditorText(editor){
    const walk = node => {
        if(node.nodeType === Node.TEXT_NODE) return node.nodeValue || '';
        if(node.nodeType !== Node.ELEMENT_NODE) return '';
        if(node.classList?.contains('loop-token-chip')) return node.dataset.token || '';
        if(node.tagName === 'BR') return '\n';
        return [...node.childNodes].map(walk).join('');
    };
    return [...(editor?.childNodes || [])].map(walk).join('').replace(/\u00a0/g, ' ');
}
function insertLoopToken(editor, token){
    if(!editor) return;
    editor.focus();
    const chipWrap = document.createElement('span');
    chipWrap.innerHTML = loopTokenChipHtml(token);
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
function promptTextLength(text){
    return Array.from(String(text || '')).length;
}
function promptCounterHtml(text){
    const count = promptTextLength(text);
    const over = count > PROMPT_TEXT_MAX_LENGTH;
    return `<div class="prompt-counter ${over ? 'over' : ''}"><span>${count.toLocaleString()}</span><span>/ ${PROMPT_TEXT_MAX_LENGTH.toLocaleString()}</span></div>`;
}
function refreshPromptCounter(container, text){
    const counter = container?.querySelector('.prompt-counter');
    if(!counter) return;
    const count = promptTextLength(text);
    counter.classList.toggle('over', count > PROMPT_TEXT_MAX_LENGTH);
    counter.innerHTML = `<span>${count.toLocaleString()}</span><span>/ ${PROMPT_TEXT_MAX_LENGTH.toLocaleString()}</span>`;
}
function renderLoopBody(node){
    const wrap = document.createElement('div');
    wrap.className = 'loop-body';
    node.count = loopCount(node);
    node.loopStart = Math.max(1, Number(node.loopStart) || 1);
    node.imageBatchSize = Math.max(1, Math.min(100, Number(node.imageBatchSize) || 1));
    node.mode = node.mode === 'parallel' ? 'parallel' : 'serial';
    node.showPrompt = Boolean(node.showPrompt);
    node.imageInput = Boolean(node.imageInput);
    const imageInputCount = loopInputImageRefs(node, {index:node.loopStart}).length;
    const promptItemCount = node.showPrompt ? loopInputPromptItems(node).length : 0;
    const hasUpstreamPrompt = promptItemCount > 0;
    const loopTargetId = findLoopCascadeTarget(node.id);
    const loopTargetOrder = loopTargetId ? computeCascadeOrder(loopTargetId) : [];
    const loopRunHtml = loopTargetId ? (cascadeSerialIds.has(loopTargetId)
        ? `<div class="gen-run-row"><button class="gen-cascade-btn gen-cascade-stop" type="button" data-loop-cascade-stop="${loopTargetId}" ${cascadeStopIds.has(loopTargetId) ? 'disabled' : ''}><i data-lucide="square" class="w-4 h-4"></i><span>${cascadeStopIds.has(loopTargetId) ? '停止中…' : '停止循环'}</span></button></div>`
        : `<div class="gen-run-row"><button class="gen-cascade-btn" type="button" data-loop-cascade="${loopTargetId}" title="从当前循环节点启动整条工作流"><i data-lucide="play-circle" class="w-4 h-4"></i><span>开始 ${loopTargetOrder.length || 1} 个节点 × ${node.count} ${tr('canvas.loopRounds')}</span></button></div>`)
        : '';
    wrap.innerHTML = `
        <div class="loop-count-row">
            <div class="loop-run-row">
                <div class="loop-count-group">
                    <span class="loop-count-label">${tr('canvas.loopCount')}</span>
                    <input class="loop-count-input" type="number" min="1" max="100" step="1" value="${node.count}">
                </div>
                <div class="seg loop-mode">
                    <button type="button" data-loop-mode="serial" class="${node.mode !== 'parallel' ? 'active' : ''}">${tr('canvas.loopSerial')}</button>
                    <button type="button" data-loop-mode="parallel" class="${node.mode === 'parallel' ? 'active' : ''}">${tr('canvas.loopParallel')}</button>
                </div>
            </div>
            <div class="loop-toggle-row">
                <button class="loop-toggle loop-image-toggle ${node.imageInput ? 'active' : ''}" type="button"><i data-lucide="image" class="w-3.5 h-3.5"></i>${tr('canvas.loopImageToggle')}</button>
                <button class="loop-toggle loop-prompt-toggle ${node.showPrompt ? 'active' : ''}" type="button"><i data-lucide="text-cursor-input" class="w-3.5 h-3.5"></i>${tr('canvas.loopPromptToggle')}</button>
            </div>
        </div>
        ${node.imageInput ? `<div class="loop-image-panel">
            <div class="loop-image-row">
                <span class="loop-count-label">${tr('canvas.loopImageStart')}</span>
                <input class="loop-count-input loop-image-start-input" type="number" min="1" max="9999" step="1" value="${node.loopStart}">
                <span class="loop-count-label">${tr('canvas.loopBatchSize')}</span>
                <input class="loop-count-input loop-batch-input" type="number" min="1" max="100" step="1" value="${node.imageBatchSize}">
            </div>
            <div class="loop-image-hint">${imageInputCount ? trf('canvas.loopImageWillOutput', {n:imageInputCount}) : tr('canvas.loopImageEmpty')}</div>
        </div>` : ''}
        ${node.showPrompt ? `<div class="loop-prompt-panel ${hasUpstreamPrompt ? 'has-upstream' : ''}">
            <div class="loop-field">
                <div class="loop-variable-editor ${hasUpstreamPrompt ? 'is-disabled' : ''}" contenteditable="${hasUpstreamPrompt ? 'false' : 'true'}" data-placeholder="${escapeAttr(tr('canvas.loopVariablePlaceholder'))}">${loopVariableHtml(node.variablePrompt || '')}</div>
            </div>
            ${hasUpstreamPrompt ? `<div class="loop-prompt-hint">已识别 ${promptItemCount} 条提示词，按计数轮流输出</div>` : ''}
            <div class="loop-start-row">
                <button class="loop-token-btn loop-counter-token-btn" type="button" data-token="《计数》">${tr('canvas.counterToken')}</button>
                <span class="loop-count-label">${tr('canvas.loopStart')}</span>
                <input class="loop-count-input loop-start-input" type="number" min="1" max="9999" step="1" value="${node.loopStart}">
            </div>
        </div>` : ''}
        ${loopRunHtml}
    `;
    const countInput = wrap.querySelector('.loop-count-input');
    const variable = wrap.querySelector('.loop-variable-editor');
    const toggle = wrap.querySelector('.loop-prompt-toggle');
    const imageToggle = wrap.querySelector('.loop-image-toggle');
    if(variable) {
        variable.onmousedown = e => e.stopPropagation();
        variable.onclick = e => e.stopPropagation();
        variable.onwheel = e => e.stopPropagation();
    }
    const refreshPreview = () => {
        const preview = wrap.querySelector('.loop-preview:last-child');
        if(preview) preview.textContent = renderLoopPrompt(node, {index:1, total:loopCount(node)}) || tr('canvas.noPromptMeta');
    };
    const refreshImageHint = () => {
        const hint = wrap.querySelector('.loop-image-hint');
        if(!hint) return;
        const count = loopInputImageRefs(node, {index:node.loopStart}).length;
        hint.textContent = count ? trf('canvas.loopImageWillOutput', {n:count}) : tr('canvas.loopImageEmpty');
    };
    countInput.oninput = e => {
        node.count = loopCount({count:e.target.value});
        e.target.value = node.count;
        refreshPreview();
        /* 同步底部级联按钮上的轮数文字，避免输入循环次数后下游"× N 轮"残留旧值
           不直接 render() 是为了不破坏当前正在输入的 input 焦点 */
        const loopCascadeBtn = wrap.querySelector('[data-loop-cascade]');
        if(loopCascadeBtn){
            const span = loopCascadeBtn.querySelector('span');
            if(span) span.textContent = `开始 ${loopTargetOrder.length || 1} 个节点 × ${node.count} ${tr('canvas.loopRounds')}`;
        }
        if(loopTargetId){
            const targetEl = document.querySelector(`.node[data-id="${loopTargetId}"]`);
            const targetCascadeBtn = targetEl?.querySelector('[data-cascade]');
            if(targetCascadeBtn){
                const span = targetCascadeBtn.querySelector('span');
                if(span){
                    const targetOrder = computeCascadeOrder(loopTargetId);
                    span.textContent = `一键运行 ${targetOrder.length} 个节点 × ${node.count} ${tr('canvas.loopRounds')}`;
                }
            }
        }
        scheduleSave();
    };
    const startInput = wrap.querySelector('.loop-start-input');
    if(startInput){
        startInput.onmousedown = e => e.stopPropagation();
        startInput.onclick = e => e.stopPropagation();
        startInput.oninput = e => {
            node.loopStart = Math.max(1, Number(e.target.value) || 1);
            refreshImageHint();
            scheduleSave();
            syncGeneratorInputs();
            refreshGeneratorInputViews();
        };
    }
    const imageStartInput = wrap.querySelector('.loop-image-start-input');
    if(imageStartInput){
        imageStartInput.onmousedown = e => e.stopPropagation();
        imageStartInput.onclick = e => e.stopPropagation();
        imageStartInput.oninput = e => {
            node.loopStart = Math.max(1, Number(e.target.value) || 1);
            refreshImageHint();
            scheduleSave();
            syncGeneratorInputs();
            refreshGeneratorInputViews();
        };
    }
    const batchInput = wrap.querySelector('.loop-batch-input');
    if(batchInput){
        batchInput.onmousedown = e => e.stopPropagation();
        batchInput.onclick = e => e.stopPropagation();
        batchInput.oninput = e => {
            node.imageBatchSize = Math.max(1, Math.min(100, Number(e.target.value) || 1));
            e.target.value = node.imageBatchSize;
            refreshImageHint();
            scheduleSave();
            syncGeneratorInputs();
            refreshGeneratorInputViews();
        };
    }
    wrap.querySelectorAll('[data-loop-mode]').forEach(btn => {
        btn.onclick = e => {
            e.stopPropagation();
            node.mode = btn.dataset.loopMode === 'parallel' ? 'parallel' : 'serial';
            render();
            scheduleSave();
        };
    });
    toggle.onclick = e => {
        e.stopPropagation();
        const opening = !node.showPrompt;
        node.showPrompt = opening;
        autoSizeLoopNode(node, opening);
        autoSizeLoopForPanels(node);
        if(!opening){
            connections = connections.filter(c => c.to !== node.id || canConnect(c.from, node.id));
        }
        render();
        scheduleSave();
        syncGeneratorInputs();
        refreshGeneratorInputViews();
    };
    if(variable) {
        variable.oninput = e => {
            node.variablePrompt = loopEditorText(variable);
            refreshPreview();
            scheduleSave();
            syncGeneratorInputs();
            refreshGeneratorInputViews();
        };
        variable.addEventListener('click', e => {
            const btn = e.target.closest('.loop-token-chip button');
            if(!btn) return;
            e.preventDefault();
            e.stopPropagation();
            btn.closest('.loop-token-chip')?.remove();
            node.variablePrompt = loopEditorText(variable);
            refreshPreview();
            scheduleSave();
            syncGeneratorInputs();
            refreshGeneratorInputViews();
        });
    }
    wrap.querySelectorAll('[data-token]').forEach(btn => {
        btn.onclick = e => {
            e.stopPropagation();
            const token = btn.dataset.token || '';
            if(!variable) return;
            insertLoopToken(variable, token);
            node.variablePrompt = loopEditorText(variable);
            variable.focus();
            refreshPreview();
            scheduleSave();
            syncGeneratorInputs();
            refreshGeneratorInputViews();
        };
    });
    if(imageToggle){
        imageToggle.onclick = e => {
            e.stopPropagation();
            node.imageInput = !node.imageInput;
            if(node.imageInput){
                node.loopStart = Math.max(1, Number(node.loopStart) || 1);
                node.imageBatchSize = Math.max(1, Math.min(100, Number(node.imageBatchSize) || 1));
            } else {
                connections = connections.filter(c => c.to !== node.id || canConnect(c.from, node.id));
            }
            autoSizeLoopForPanels(node);
            render();
            scheduleSave();
            syncGeneratorInputs();
            refreshGeneratorInputViews();
        };
    }
    wrap.querySelectorAll('[data-loop-cascade]').forEach(btn => {
        btn.onmousedown = e => e.stopPropagation();
        btn.onclick = e => {
            e.stopPropagation();
            runNodeCascade(btn.dataset.loopCascade);
        };
    });
    wrap.querySelectorAll('[data-loop-cascade-stop]').forEach(btn => {
        btn.onmousedown = e => e.stopPropagation();
        btn.onclick = e => {
            e.stopPropagation();
            requestCascadeStop(btn.dataset.loopCascadeStop);
        };
    });
    return wrap;
}
function renderLLMBody(node){
    const wrap = document.createElement('div');
    wrap.className = 'llm-body';
    const mode = node.mode || 'node';
    node.llmProvider = resolveChatProviderId(node.llmProvider || 'comfly');
    const llmProv = node.llmProvider;
    if(llmProv === 'modelscope') node.model = node.llmMsModel || node.model;
    if(!providerChatModels(llmProv).includes(node.model)) node.model = providerChatModels(llmProv)[0] || node.model;
    const modelOpts = chatModelOptions(node.model, llmProv);
    const imgs = llmInputImages(node);
    const imgBadge = imgs.length ? `<div style="display:flex;align-items:center;gap:6px;padding:5px 10px;border-radius:8px;background:rgba(16,185,129,.12);color:#047857;font-size:10.5px;font-weight:700;width:fit-content;line-height:1.4"><i data-lucide="image" class="w-3 h-3"></i>已连接 ${imgs.length} 张图片 · 需选 VL 视觉模型（如 Qwen2.5-VL）</div>` : '';
    node.showSystem = Boolean(node.showSystem);
    wrap.innerHTML = `
        <div class="llm-row">
            <select class="select-lite llm-provider-select" style="flex:1">${chatProviderOptions(llmProv)}</select>
            <select class="select-lite llm-model">${modelOpts}</select>
            <div class="llm-mode"><button data-mode="node">${tr('canvas.nodeMode')}</button><button data-mode="chat">${tr('canvas.chatMode')}</button></div>
            <button class="llm-sys-toggle ${node.showSystem ? 'active' : ''}" type="button">System</button>
        </div>
        ${imgBadge}
        ${node.showSystem ? `<textarea class="llm-system" placeholder="${tr('canvas.systemPrompt')}">${escapeHtml(node.systemPrompt || '')}</textarea>` : ''}
        <div class="llm-node-pane"></div>
        <div class="llm-chat-pane"></div>
    `;
    const providerSelect = wrap.querySelector('.llm-provider-select');
    const modelSelect = wrap.querySelector('.llm-model');
    providerSelect.value = llmProv;
    modelSelect.value = resolveChatModel(node.model, llmProv);
    [providerSelect, modelSelect].forEach(input => {
        input.onmousedown = e => e.stopPropagation();
        input.onclick = e => e.stopPropagation();
    });
    providerSelect.onchange = e => {
        e.stopPropagation();
        node.llmProvider = e.target.value;
        const models = providerChatModels(node.llmProvider);
        node.model = models[0] || '';
        if(node.llmProvider === 'modelscope') node.llmMsModel = node.model;
        render();
        scheduleSave();
    };
    modelSelect.onchange = e => {
        e.stopPropagation();
        node.model = e.target.value;
        if((node.llmProvider||'comfly') === 'modelscope') node.llmMsModel = e.target.value;
        scheduleSave();
    };
    wrap.querySelector('.llm-sys-toggle').onclick = e => { e.stopPropagation(); node.showSystem = !node.showSystem; render(); scheduleSave(); };
    const sysEl = wrap.querySelector('.llm-system');
    if(sysEl){ sysEl.oninput = e => { node.systemPrompt = e.target.value; scheduleSave(); }; bindScrollableText(sysEl); }
    wrap.querySelectorAll('[data-mode]').forEach(btn => {
        btn.classList.toggle('active', mode === btn.dataset.mode);
        btn.onclick = e => { e.stopPropagation(); node.mode = btn.dataset.mode; render(); scheduleSave(); };
    });
    const nodePane = wrap.querySelector('.llm-node-pane');
    const chatPane = wrap.querySelector('.llm-chat-pane');
    if(mode === 'chat'){
        nodePane.style.display = 'none';
        renderLLMChatPane(chatPane, node);
    } else {
        chatPane.style.display = 'none';
        renderLLMNodePane(nodePane, node);
    }
    return wrap;
}
function renderLLMNodePane(container, node){
    const connectedInput = llmInputText(node);
    const isReadonly = connectedInput.length > 0;
    const inputValue = connectedInput || node.userInput || '';
    const inputHeight = Math.max(70, node.llmInputHeight || 110);
    const outputHeight = Math.max(70, node.llmOutputHeight || 150);
    const inputPlaceholder = langIsEn() ? 'Type input, or connect a Prompt node…' : '直接输入，或连接提示词节点…';
    container.innerHTML = `
        <div class="llm-pane-label">Input${isReadonly ? ' <span style="font-size:9px;opacity:.5;font-weight:600;text-transform:none;letter-spacing:0">(来自连接)</span>' : ''}</div>
        <textarea class="llm-input-area llm-input-output" style="height:${inputHeight}px; flex:0 0 ${inputHeight}px;" ${isReadonly ? 'readonly' : ''} placeholder="${inputPlaceholder}">${escapeHtml(inputValue)}</textarea>
        <div class="llm-pane-resizer" title="${tr('canvas.resizePanes')}"></div>
        <div class="llm-pane-label">Output</div>
        <div class="llm-output-wrap" style="height:${outputHeight}px; flex:0 0 ${outputHeight}px;">
            <button class="llm-copy-btn llm-output-copy" type="button" title="复制"><i data-lucide="copy" class="w-3.5 h-3.5"></i></button>
            <div class="llm-output llm-result-output">${escapeHtml(node.outputText || tr('canvas.llmOutputEmpty'))}</div>
        </div>
        <div class="gen-run-row mt-2">
            <button class="llm-run ${node.running ? 'running' : ''}" ${node.running ? 'disabled' : ''}><i data-lucide="play" class="w-4 h-4"></i>${node.running ? tr('canvas.running') : 'Run LLM'}</button>
            ${cascadeBtnHtml(node)}
        </div>
        ${retryBarHtml(node)}
    `;
    const inputEl = container.querySelector('.llm-input-output');
    bindScrollableText(inputEl);
    if(!isReadonly){
        inputEl.oninput = e => { node.userInput = e.target.value; };
    }
    bindScrollableText(container.querySelector('.llm-result-output'));
    container.querySelector('.llm-pane-resizer').onmousedown = e => startLLMPaneResize(e, node);
    container.querySelector('.llm-run').onclick = e => { e.stopPropagation(); runLLMNode(node.id); };
    bindCascadeButtons(container, node.id);
    const copyBtn = container.querySelector('.llm-output-copy');
    if(copyBtn){
        copyBtn.onmousedown = e => e.stopPropagation();
        copyBtn.onclick = async e => {
            e.stopPropagation();
            const text = node.outputText || '';
            if(!text) return;
            if(await copyTextToClipboard(text)){
                copyBtn.classList.add('copied');
                setTimeout(() => copyBtn.classList.remove('copied'), 1500);
            }
        };
    }
}
function renderLLMChatPane(container, node){
    const messages = node.messages || [];
    container.innerHTML = `
        <div class="llm-chat-log">${messages.length ? messages.map((msg, mi) => `<div class="llm-bubble ${msg.role === 'user' ? 'user' : 'assistant'}" data-msg-idx="${mi}">${escapeHtml(msg.content || '')}${msg.role === 'assistant' ? `<button class="llm-bubble-copy" type="button" title="复制"><i data-lucide="copy" style="width:11px;height:11px;display:inline-block;vertical-align:middle"></i></button>` : ''}</div>`).join('') : `<div class="text-[11px] text-gray-300">${tr('canvas.startChat')}</div>`}</div>
        <textarea class="llm-chat-input mt-2" rows="2" placeholder="${tr('canvas.chatInput')}">${escapeHtml(node.chatInput || '')}</textarea>
        <button class="llm-run mt-2" ${node.running ? 'disabled' : ''}><i data-lucide="send" class="w-4 h-4"></i>${node.running ? tr('canvas.sending') : 'Send'}</button>
    `;
    bindScrollableText(container.querySelector('.llm-chat-log'));
    bindScrollableText(container.querySelector('.llm-chat-input'));
    const chatInputEl = container.querySelector('.llm-chat-input');
    chatInputEl.oninput = e => { node.chatInput = e.target.value; scheduleSave(); };
    chatInputEl.onkeydown = e => {
        if(e.key === 'Enter' && !e.shiftKey && !e.isComposing){
            e.preventDefault();
            e.stopPropagation();
            runLLMChat(node.id);
        }
    };
    container.querySelector('.llm-run').onclick = e => { e.stopPropagation(); runLLMChat(node.id); };
    container.querySelectorAll('.llm-bubble-copy').forEach(btn => {
        btn.onmousedown = e => e.stopPropagation();
        btn.onclick = async e => {
            e.stopPropagation();
            const bubble = btn.closest('.llm-bubble');
            const idx = Number(bubble?.dataset.msgIdx);
            const msg = (node.messages || [])[idx];
            if(!msg) return;
            if(await copyTextToClipboard(msg.content || '')){
                btn.classList.add('copied');
                setTimeout(() => btn.classList.remove('copied'), 1500);
            }
        };
    });
}
function bindScrollableText(el){
    if(!el) return;
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
function startLLMPaneResize(e, node){
    e.preventDefault();
    e.stopPropagation();
    llmPaneDrag = {
        node,
        sy:e.clientY,
        inputStart:Math.max(70, node.llmInputHeight || 110),
        outputStart:Math.max(70, node.llmOutputHeight || 150)
    };
    window.onmousemove = onLLMPaneResize;
    window.onmouseup = endDrag;
}
function onLLMPaneResize(e){
    if(!llmPaneDrag) return;
    const total = llmPaneDrag.inputStart + llmPaneDrag.outputStart;
    const delta = (e.clientY - llmPaneDrag.sy) / viewport.scale;
    const minPane = 70;
    const nextInput = Math.max(minPane, Math.min(total - minPane, llmPaneDrag.inputStart + delta));
    const nextOutput = Math.max(minPane, total - nextInput);
    llmPaneDrag.node.llmInputHeight = Math.round(nextInput);
    llmPaneDrag.node.llmOutputHeight = Math.round(nextOutput);
    const el = nodesEl.querySelector(`.node[data-id="${llmPaneDrag.node.id}"]`);
    if(el){
        const inputEl = el.querySelector('.llm-input-output');
        const outputEl = el.querySelector('.llm-result-output');
        if(inputEl){
            inputEl.style.height = `${llmPaneDrag.node.llmInputHeight}px`;
            inputEl.style.flexBasis = `${llmPaneDrag.node.llmInputHeight}px`;
        }
        if(outputEl){
            outputEl.style.height = `${llmPaneDrag.node.llmOutputHeight}px`;
            outputEl.style.flexBasis = `${llmPaneDrag.node.llmOutputHeight}px`;
        }
    }
}
function llmInputText(node){
    return connections.filter(c => c.to === node.id).map(c => nodes.find(n => n.id === c.from)).filter(Boolean).map(n => {
        if(n.type === 'prompt') return n.text || '';
        if(n.type === 'loop') return renderLoopPrompt(n);
        if(n.type === 'promptGroup') return (n.items || []).map(id => nodes.find(x => x.id === id)).filter(Boolean).map(p => p.text || '').filter(Boolean).join('\n\n');
        if(n.type === 'llm') return n.outputText || '';
        return '';
    }).filter(Boolean).join('\n\n');
}
function llmInputImages(node){
    const urls = [];
    connections.filter(c => c.to === node.id).map(c => nodes.find(n => n.id === c.from)).filter(Boolean).forEach(n => {
        if(n.type === 'image' && n.url && mediaKindForNode(n) === 'image') urls.push(n.url);
        if(n.type === 'output' && (n.images||[]).length){
            const last = [...n.images].reverse().map(outputUrlValue).find(url => url && !isVideoUrl(url) && !isAudioUrl(url));
            if(last) urls.push(last);
        }
        if(n.type === 'group'){
            (n.items || []).map(id => nodes.find(x => x.id === id)).filter(x => x?.type === 'image' && x?.url && mediaKindForNode(x) === 'image').forEach(img => urls.push(img.url));
        }
    });
    return urls;
}
function renderGeneratorBody(node){
    const wrap = document.createElement('div');
    wrap.className = 'generator-body';
    const inputSources = generatorSources(node);
    const ordered = orderedSources(node, inputSources);
    const imageInputs = ordered.filter(src => src.refs?.length);
    const promptInputs = ordered.filter(src => src.prompt && !src.refs?.length);
    node.apiProvider = resolveImageProviderId(node.apiProvider || '');
    const imageProviderModels = providerImageModels(node.apiProvider);
    if(!imageProviderModels.length) node.model = '';
    else if(!imageProviderModels.includes(resolveImageModel(node.model))) node.model = imageProviderModels[0] || '';
    wrap.innerHTML = `
        <div class="prompt-list mb-3"></div>
        <div class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">${tr('canvas.images')}</div>
        <div class="input-list"></div>
        <div class="gen-settings">
            <div class="gen-settings-row">
                <select class="select-lite provider-select">${providerOptions(node.apiProvider)}</select>
                <select class="select-lite model-select">${imageModelOptions(node.model, node.apiProvider)}</select>
            </div>
            <div class="gen-settings-row api-size-row">
                <select class="select-lite resolution compact-select" data-field="resolution">
                    <option value="1k">1K</option>
                    <option value="2k">2K</option>
                    <option value="4k">4K</option>
                    <option value="custom">${tr('canvas.custom')}</option>
                </select>
                <select class="select-lite ratio compact-select" data-field="ratio">
                    <option value="square">1:1</option>
                    <option value="portrait">2:3</option>
                    <option value="landscape">3:2</option>
                    <option value="portrait43">3:4</option>
                    <option value="landscape43">4:3</option>
                    <option value="story">9:16</option>
                    <option value="wide">16:9</option>
                    <option value="source">${tr('canvas.adaptiveRatio')}</option>
                    <option value="custom">${tr('canvas.custom')}</option>
                </select>
                <select class="select-lite quality-select">
                    <option value="auto">Q auto</option>
                    <option value="low">Q low</option>
                    <option value="medium">Q med</option>
                    <option value="high">Q high</option>
                </select>
                <div class="gen-count-row">
                    <div class="gen-stepper">
                        <button class="gen-step-btn" data-step="-1" type="button" title="${tr('canvas.decrease')}" aria-label="${tr('canvas.decreaseCount')}"><i data-lucide="chevron-left" class="w-3.5 h-3.5"></i></button>
                        <input class="gen-count-input" type="text" inputmode="numeric" pattern="[0-9]*" value="${Math.max(1, Math.min(8, Number(node.count || 1)))}">
                        <button class="gen-step-btn" data-step="1" type="button" title="${tr('canvas.increase')}" aria-label="${tr('canvas.increaseCount')}"><i data-lucide="chevron-right" class="w-3.5 h-3.5"></i></button>
                    </div>
                </div>
            </div>
            <div class="gen-settings-row custom-ratio-row" style="display:none">
                <label class="field">
                    <div class="setting-title">${tr('canvas.ratioWidth')}</div>
                    <input class="setting-input custom-ratio-w-input" type="number" min="1" step="1" value="${escapeHtml(node.customRatioWidth || '')}" placeholder="4">
                </label>
                <label class="field">
                    <div class="setting-title">${tr('canvas.ratioHeight')}</div>
                    <input class="setting-input custom-ratio-h-input" type="number" min="1" step="1" value="${escapeHtml(node.customRatioHeight || '')}" placeholder="3">
                </label>
            </div>
            <div class="gen-settings-row custom-size-row" style="display:none">
                <label class="field">
                    <div class="setting-title">${tr('canvas.width')}</div>
                    <input class="setting-input custom-w-input" type="number" min="64" step="64" value="${escapeHtml(node.customWidth || '')}" placeholder="Auto">
                </label>
                <label class="field">
                    <div class="setting-title">${tr('canvas.height')}</div>
                    <input class="setting-input custom-h-input" type="number" min="64" step="64" value="${escapeHtml(node.customHeight || '')}" placeholder="Auto">
                </label>
                <button class="secondary-btn fit-size-btn" type="button" style="height:32px;align-self:flex-end;padding:0 10px;font-size:11px">${tr('canvas.fitImageSize')}</button>
            </div>
        </div>
        <div class="gen-run-row">
            <button class="gen-btn ${node.running ? 'running' : ''}" ${node.running ? 'disabled' : ''}><i data-lucide="zap" class="w-4 h-4"></i>${node.running ? tr('canvas.generating') : tr('canvas.apiGenerate')}</button>
            ${cascadeBtnHtml(node)}
        </div>
        ${retryBarHtml(node)}
    `;
    const providerSelect = wrap.querySelector('.provider-select');
    const modelSelect = wrap.querySelector('.model-select');
    providerSelect.onmousedown = e => e.stopPropagation();
    providerSelect.onclick = e => e.stopPropagation();
    providerSelect.onchange = e => {
        e.stopPropagation();
        node.apiProvider = e.target.value;
        const providerModels = providerImageModels(node.apiProvider);
        if(!providerModels.includes(resolveImageModel(node.model))) node.model = providerModels[0] || '';
        modelSelect.innerHTML = imageModelOptions(node.model, node.apiProvider);
        syncQualityControls();
        scheduleSave();
    };
    modelSelect.onmousedown = e => e.stopPropagation();
    modelSelect.onclick = e => e.stopPropagation();
    modelSelect.onchange = e => {
        e.stopPropagation();
        node.model = e.target.value;
        syncQualityControls();
        scheduleSave();
    };
    const ratioSelect = wrap.querySelector('.ratio');
    const resolutionSelect = wrap.querySelector('.resolution');
    const qualitySelect = wrap.querySelector('.quality-select');
    const customRatioRow = wrap.querySelector('.custom-ratio-row');
    const customSizeRow = wrap.querySelector('.custom-size-row');
    const customRatioWInput = wrap.querySelector('.custom-ratio-w-input');
    const customRatioHInput = wrap.querySelector('.custom-ratio-h-input');
    const customWInput = wrap.querySelector('.custom-w-input');
    const customHInput = wrap.querySelector('.custom-h-input');
    const fitSizeBtn = wrap.querySelector('.fit-size-btn');
    const referenceImages = ordered.flatMap(src => src.refs || []);
    const syncQualityControls = () => {
        qualitySelect.disabled = false;
        if(!['auto','low','medium','high'].includes(String(node.quality || 'auto'))) node.quality = 'auto';
        qualitySelect.value = node.quality || 'auto';
    };
    const hydrateCustomParts = () => {
        if((!node.customRatioWidth || !node.customRatioHeight) && node.customRatio) {
            const raw = String(node.customRatio || '');
            if(raw.includes(':')){
                const [w,h] = raw.split(':');
                node.customRatioWidth = node.customRatioWidth || w;
                node.customRatioHeight = node.customRatioHeight || h;
            }
        }
        if((!node.customWidth || !node.customHeight) && node.customSize) {
            const parsed = parseSizeValue(node.customSize);
            node.customWidth = node.customWidth || parsed?.width || '';
            node.customHeight = node.customHeight || parsed?.height || '';
        }
    };
    hydrateCustomParts();
    let sourceRatioRequest = 0;
    const updateSourceRatioFromFirstRef = async () => {
        if(node.ratio !== 'source') return;
        const ref = referenceImages.find(item => item.url);
        const requestId = ++sourceRatioRequest;
        if(!ref){
            node.customRatio = '';
            node.customRatioWidth = '';
            node.customRatioHeight = '';
            customRatioWInput.value = '';
            customRatioHInput.value = '';
            return;
        }
        try {
            const dims = await getImageDimensions(ref.url);
            if(requestId !== sourceRatioRequest || node.ratio !== 'source') return;
            const parts = ratioPartsFromDimensions(dims.width, dims.height);
            node.customRatioWidth = String(parts.width);
            node.customRatioHeight = String(parts.height);
            node.customRatio = `${parts.width}:${parts.height}`;
            customRatioWInput.value = node.customRatioWidth;
            customRatioHInput.value = node.customRatioHeight;
            scheduleSave();
        } catch(_) {}
    };
    const syncSizeControls = () => {
        normalizeApiNodeSizeChoice(node);
        const squareOption = ratioSelect.querySelector('option[value="square"]');
        if(squareOption){
            squareOption.disabled = false;
            squareOption.title = '';
        }
        const ratioValue = node.ratio && [...ratioSelect.options].some(opt => opt.value === node.ratio) ? node.ratio : 'square';
        ratioSelect.value = ratioValue;
        resolutionSelect.value = node.resolution || '1k';
        ratioSelect.disabled = node.resolution === 'custom';
        customRatioRow.style.display = (node.ratio === 'custom' || node.ratio === 'source') ? 'flex' : 'none';
        customSizeRow.style.display = node.resolution === 'custom' ? 'flex' : 'none';
        customRatioWInput.disabled = node.ratio === 'source';
        customRatioHInput.disabled = node.ratio === 'source';
        customRatioWInput.value = node.customRatioWidth || '';
        customRatioHInput.value = node.customRatioHeight || '';
        customWInput.value = node.customWidth || '';
        customHInput.value = node.customHeight || '';
        if(fitSizeBtn) fitSizeBtn.disabled = !referenceImages.some(ref => ref.url);
        syncQualityControls();
        if(node.ratio === 'source') updateSourceRatioFromFirstRef();
    };
    qualitySelect.onmousedown = e => e.stopPropagation();
    qualitySelect.onclick = e => e.stopPropagation();
    qualitySelect.onchange = e => {
        e.stopPropagation();
        node.quality = e.target.value;
        scheduleSave();
    };
    ratioSelect.onmousedown = e => e.stopPropagation();
    ratioSelect.onclick = e => e.stopPropagation();
    ratioSelect.onchange = e => {
        e.stopPropagation();
        node.ratio = e.target.value;
        normalizeApiNodeSizeChoice(node);
        if(node.ratio !== 'custom' && node.ratio !== 'source') {
            node.customRatio = '';
            node.customRatioWidth = '';
            node.customRatioHeight = '';
        } else if(node.ratio === 'source') {
            node.customRatio = '';
            node.customRatioWidth = '';
            node.customRatioHeight = '';
        }
        syncSizeControls();
        scheduleSave();
    };
    resolutionSelect.onmousedown = e => e.stopPropagation();
    resolutionSelect.onclick = e => e.stopPropagation();
    resolutionSelect.onchange = e => {
        e.stopPropagation();
        node.resolution = e.target.value;
        if(node.resolution === 'custom') {
            node.ratio = '';
        } else if(!node.ratio) {
            node.ratio = 'square';
            node.customSize = '';
            node.customWidth = '';
            node.customHeight = '';
        } else {
            node.customSize = '';
            node.customWidth = '';
            node.customHeight = '';
        }
        normalizeApiNodeSizeChoice(node);
        syncSizeControls();
        scheduleSave();
    };
    [customRatioWInput, customRatioHInput].forEach(input => {
        input.onmousedown = e => e.stopPropagation();
        input.onclick = e => e.stopPropagation();
        input.oninput = e => {
            node.customRatioWidth = customRatioWInput.value;
            node.customRatioHeight = customRatioHInput.value;
            node.customRatio = node.customRatioWidth && node.customRatioHeight ? `${node.customRatioWidth}:${node.customRatioHeight}` : '';
            node.ratio = 'custom';
            syncSizeControls();
            scheduleSave();
        };
    });
    [customWInput, customHInput].forEach(input => {
        input.onmousedown = e => e.stopPropagation();
        input.onclick = e => e.stopPropagation();
        input.oninput = e => {
            node.customWidth = customWInput.value;
            node.customHeight = customHInput.value;
            node.customSize = node.customWidth && node.customHeight ? `${node.customWidth}x${node.customHeight}` : '';
            node.resolution = 'custom';
            node.ratio = '';
            syncSizeControls();
            scheduleSave();
        };
    });
    if(fitSizeBtn){
        fitSizeBtn.onmousedown = e => e.stopPropagation();
        fitSizeBtn.onclick = async e => {
            e.stopPropagation();
            const ref = referenceImages.find(item => item.url);
            if(!ref) return;
            try {
                const dims = await getImageDimensions(ref.url);
                node.customWidth = dims.width;
                node.customHeight = dims.height;
                node.customSize = `${dims.width}x${dims.height}`;
                node.resolution = 'custom';
                node.ratio = '';
                syncSizeControls();
                scheduleSave();
            } catch(err) {
                    showErrorModal(tr('canvas.imageReadFailed'));
            }
        };
    }
    syncSizeControls();
    const countInput = wrap.querySelector('.gen-count-input');
    countInput.onmousedown = e => e.stopPropagation();
    countInput.onclick = e => e.stopPropagation();
    countInput.oninput = e => {
        const value = Math.max(1, Math.min(8, Number(e.target.value) || 1));
        node.count = value;
        scheduleSave();
    };
    countInput.onblur = e => { e.target.value = String(Math.max(1, Math.min(8, Number(node.count || 1)))); };
    wrap.querySelectorAll('[data-step]').forEach(btn => {
        btn.onclick = e => {
            e.stopPropagation();
            const next = Math.max(1, Math.min(8, Number(node.count || 1) + Number(btn.dataset.step || 0)));
            node.count = next;
            countInput.value = String(next);
            scheduleSave();
        };
    });
    const list = wrap.querySelector('.input-list');
    renderImageInputList(list, node, imageInputs);
    renderPromptPreview(wrap.querySelector('.prompt-list'), promptInputs);
    wrap.querySelector('.gen-btn').onclick = e => { e.stopPropagation(); runCanvasGenerate(node.id); };
    bindCascadeButtons(wrap, node.id);
    return wrap;
}
function renderVideoBody(node){
    const wrap = document.createElement('div');
    wrap.className = 'generator-body';
    const inputSources = generatorSources(node);
    const ordered = orderedSources(node, inputSources);
    const imageInputs = ordered.filter(src => src.refs?.length);
    const promptInputs = ordered.filter(src => src.prompt && !src.refs?.length);
    node.apiProvider = resolveVideoProviderId(node.apiProvider || 'comfly');
    node.model = node.model || 'veo3-fast';
    wrap.innerHTML = `
        <div class="prompt-list mb-3"></div>
        <div class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">${tr('canvas.images') || 'Images'}</div>
        <div class="input-list video-img-list"></div>
        <div class="gen-settings">
            <div class="gen-settings-row">
                <select class="select-lite video-provider" style="flex:1">${videoProviderOptions(node.apiProvider)}</select>
                <select class="select-lite video-model" style="flex:2">${videoModelOptions(node.model, node.apiProvider)}</select>
            </div>
            <div class="gen-settings-row">
                <label class="field" style="flex:1">
                    <div class="setting-title">${tr('canvas.videoDuration')}</div>
                    <input class="setting-input video-duration" type="number" min="1" max="60" step="1" value="${Number(node.duration || 5)}">
                </label>
                <label class="field" style="flex:1">
                    <div class="setting-title">${tr('canvas.videoAspect')}</div>
                    <select class="select-lite video-aspect compact-select">
                        <option value="16:9">16:9</option>
                        <option value="9:16">9:16</option>
                        <option value="1:1">1:1</option>
                        <option value="4:3">4:3</option>
                        <option value="3:4">3:4</option>
                        <option value="21:9">21:9</option>
                        <option value="9:21">9:21</option>
                        <option value="keep_ratio">keep</option>
                        <option value="adaptive">adapt</option>
                    </select>
                </label>
                <label class="field" style="flex:1">
                    <div class="setting-title">${tr('canvas.videoResolution')}</div>
                    <select class="select-lite video-resolution compact-select">
                        <option value="">Auto</option>
                        <option value="480p">480p</option>
                        <option value="720p">720p</option>
                        <option value="1080p">1080p</option>
                        <option value="780P">780P</option>
                    </select>
                </label>
            </div>
            <div class="gen-settings-row" style="flex-wrap:wrap">
                <button type="button" class="setting-check ${node.enhancePrompt ? 'active' : ''}" data-video-toggle="enhancePrompt"><span class="check-dot"></span>${tr('canvas.videoEnhancePrompt')}</button>
                <button type="button" class="setting-check ${node.enableUpsample ? 'active' : ''}" data-video-toggle="enableUpsample"><span class="check-dot"></span>${tr('canvas.videoUpsample')}</button>
                <button type="button" class="setting-check ${node.watermark ? 'active' : ''}" data-video-toggle="watermark"><span class="check-dot"></span>${tr('canvas.videoWatermark')}</button>
                <button type="button" class="setting-check ${node.cameraFixed ? 'active' : ''}" data-video-toggle="cameraFixed"><span class="check-dot"></span>${tr('canvas.videoCameraFixed')}</button>
                <button type="button" class="setting-check ${node.generateAudio ? 'active' : ''}" data-video-toggle="generateAudio"><span class="check-dot"></span>${tr('canvas.videoGenerateAudio')}</button>
                <button type="button" class="setting-check ${node.useFrameRoles ? 'active' : ''}" data-video-toggle="useFrameRoles"><span class="check-dot"></span>${tr('canvas.videoFirstLastFrames')}</button>
            </div>
        </div>
        <div class="gen-run-row">
            <button class="gen-btn ${node.running ? 'running' : ''}" ${node.running ? 'disabled' : ''}><i data-lucide="clapperboard" class="w-4 h-4"></i>${node.running ? tr('canvas.generating') : tr('canvas.videoGenerate')}</button>
            ${cascadeBtnHtml(node)}
        </div>
        ${retryBarHtml(node)}
    `;
    const providerSelect = wrap.querySelector('.video-provider');
    const modelSelect = wrap.querySelector('.video-model');
    const durationSelect = wrap.querySelector('.video-duration');
    const aspectSelect = wrap.querySelector('.video-aspect');
    const resolutionSelect = wrap.querySelector('.video-resolution');
    providerSelect.value = node.apiProvider;
    durationSelect.value = String(node.duration || 5);
    aspectSelect.value = node.aspectRatio || '16:9';
    resolutionSelect.value = node.resolution || '';
    [providerSelect, modelSelect, durationSelect, aspectSelect, resolutionSelect].forEach(input => {
        input.onmousedown = e => e.stopPropagation();
        input.onclick = e => e.stopPropagation();
    });
    providerSelect.onchange = e => {
        e.stopPropagation();
        node.apiProvider = e.target.value;
        const models = providerVideoModels(node.apiProvider);
        if(!models.includes(node.model)) node.model = models[0] || node.model;
        modelSelect.innerHTML = videoModelOptions(node.model, node.apiProvider);
        scheduleSave();
    };
    modelSelect.onchange = e => { e.stopPropagation(); node.model = e.target.value; scheduleSave(); };
    durationSelect.oninput = e => { e.stopPropagation(); node.duration = Math.max(1, Math.min(60, Number(e.target.value || 5))); scheduleSave(); };
    durationSelect.onblur = e => { e.target.value = String(Math.max(1, Math.min(60, Number(node.duration || 5)))); };
    aspectSelect.onchange = e => { e.stopPropagation(); node.aspectRatio = e.target.value; scheduleSave(); };
    resolutionSelect.onchange = e => { e.stopPropagation(); node.resolution = e.target.value; scheduleSave(); };
    wrap.querySelectorAll('[data-video-toggle]').forEach(btn => {
        btn.onmousedown = e => e.stopPropagation();
        btn.onclick = e => {
            e.stopPropagation();
            const field = btn.dataset.videoToggle;
            node[field] = !node[field];
            render();
            scheduleSave();
        };
    });
    const list = wrap.querySelector('.video-img-list');
    renderVideoImageInputs(list, node, imageInputs);
    renderPromptPreview(wrap.querySelector('.prompt-list'), promptInputs);
    wrap.querySelector('.gen-btn').onclick = e => { e.stopPropagation(); runCanvasGenerate(node.id); };
    bindCascadeButtons(wrap, node.id);
    return wrap;
}
function renderPromptPreview(container, promptInputs){
    if(!container) return;
    container.innerHTML = promptInputs.length ? `<div class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Prompts</div>${promptInputs.map(src => `<div class="text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 line-clamp-2">${escapeHtml(src.label)}</div>`).join('')}` : '';
}
function renderImageInputList(list, node, imageInputs, emptyText=null){
    if(!list) return;
    list.innerHTML = imageInputs.length ? '' : `<div class="text-[11px] text-gray-300 py-2">${escapeHtml(emptyText || tr('canvas.inputImagesEmpty'))}</div>`;
    imageInputs.forEach((src, i) => {
        const item = document.createElement('div');
        item.className = 'input-item';
        item.draggable = true;
        item.dataset.sourceId = src.id;
        const previewHtml = src.preview && !isMissingAssetUrl(src.preview) ? `<img src="${escapeAttr(src.preview)}">` : (src.preview ? missingAssetHtml(src.preview, true) : '<i data-lucide="image" class="w-6 h-6 text-slate-400"></i>');
        item.innerHTML = `<span class="input-index">${i + 1}</span>${previewHtml}<span class="input-label">${escapeHtml(src.label)}</span>`;
        item.ondragstart = e => {
            e.stopPropagation();
            internalDrag = true;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('application/x-canvas-input', src.id);
        };
        item.ondragend = () => { internalDrag = false; };
        item.ondragover = e => { e.preventDefault(); e.stopPropagation(); };
        item.ondrop = e => {
            e.preventDefault();
            e.stopPropagation();
            reorderInput(node, e.dataTransfer.getData('application/x-canvas-input'), src.id);
            internalDrag = false;
        };
        list.appendChild(item);
    });
    refreshIcons();
}
function renderVideoImageInputs(list, node, imageInputs){
    if(!list) return;
    list.innerHTML = imageInputs.length ? '' : `<div class="text-[11px] text-gray-300 py-2">${tr('canvas.groupEmpty')}</div>`;
    imageInputs.forEach((src, i) => {
        const item = document.createElement('div');
        item.className = 'input-item video-input-item';
        item.draggable = true;
        item.dataset.sourceId = src.id;
        const frameLabel = node.useFrameRoles && i === 0 ? tr('canvas.videoRoleFirstFrame') : node.useFrameRoles && i === 1 ? tr('canvas.videoRoleLastFrame') : '';
        const previewHtml = src.preview && !isMissingAssetUrl(src.preview) ? `<img src="${escapeAttr(src.preview)}">` : (src.preview ? missingAssetHtml(src.preview, true) : '<i data-lucide="image" class="w-6 h-6 text-slate-400"></i>');
        item.innerHTML = `
            <div class="video-input-thumb">
                <span class="input-index">${i + 1}</span>
                ${previewHtml}
                <span class="input-label">${escapeHtml(src.label)}</span>
            </div>
            ${frameLabel ? `<div class="video-frame-label">${frameLabel}</div>` : ''}
        `;
        item.ondragstart = e => { e.stopPropagation(); internalDrag = true; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('application/x-canvas-input', src.id); };
        item.ondragend = () => { internalDrag = false; };
        item.ondragover = e => { e.preventDefault(); e.stopPropagation(); };
        item.ondrop = e => { e.preventDefault(); e.stopPropagation(); reorderInput(node, e.dataTransfer.getData('application/x-canvas-input'), src.id); internalDrag = false; };
        list.appendChild(item);
    });
    refreshIcons();
}
function comfyWorkflowOptions(selected){
    const opts = comfyWorkflows.map(w => `<option value="${escapeHtml(w.name)}" ${w.name === selected ? 'selected' : ''}>${escapeHtml(w.title || w.name.replace('.json',''))}</option>`).join('');
    return opts || `<option value="">${tr('canvas.comfyNoWorkflow')}</option>`;
}
function hasComfyWorkflow(name){
    return !!name && comfyWorkflows.some(w => w.name === name);
}
function validComfyWorkflowName(name){
    return hasComfyWorkflow(name) ? name : (comfyWorkflows[0]?.name || '');
}
function pruneMissingComfyWorkflows(){
    let changed = false;
    nodes.filter(n => n.type === 'comfy').forEach(node => {
        if(node.comfyWorkflow && !hasComfyWorkflow(node.comfyWorkflow)){
            delete comfyWorkflowCache[node.comfyWorkflow];
            node.comfyWorkflow = '';
            changed = true;
        }
    });
    if(changed) scheduleSave();
}
function currentComfyWorkflow(node){
    const selected = validComfyWorkflowName(node.comfyWorkflow || comfyWorkflows[0]?.name || '');
    return comfyWorkflowCache[selected] || null;
}
async function ensureComfyWorkflow(name){
    if(!hasComfyWorkflow(name)) return null;
    if(comfyWorkflowCache[name]) return comfyWorkflowCache[name];
    const res = await fetch(`/api/workflows/${encodeURIComponent(name)}`);
    if(!res.ok){
        delete comfyWorkflowCache[name];
        return null;
    }
    const data = await res.json();
    comfyWorkflowCache[name] = data;
    return data;
}
function validRunningHubWorkflowId(workflowId){
    return String(workflowId || '').trim();
}
function currentRunningHubWorkflow(node){
    const workflowId = validRunningHubWorkflowId(node.workflowId || '');
    return runningHubWorkflowCache[workflowId] || null;
}
async function ensureRunningHubWorkflow(workflowId){
    workflowId = validRunningHubWorkflowId(workflowId);
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
function comfyFieldKind(f){
    if(['image','video','audio'].includes(f?.type)) return f.type;
    const key = `${f.input || ''} ${f.name || ''}`.toLowerCase();
    if(f.type === 'textarea' || /prompt|text|提示词|正向|负向/.test(key)) return 'prompt';
    return 'setting';
}
function comfyFields(node, kind='all'){
    const data = currentComfyWorkflow(node);
    const fields = data?.config?.fields || [];
    return kind === 'all' ? fields : fields.filter(f => comfyFieldKind(f) === kind);
}
function comfyParamValue(node, field){
    node.comfyParams = node.comfyParams || {};
    if(node.comfyParams[field.id] !== undefined) return node.comfyParams[field.id];
    return field.default ?? (field.type === 'boolean' ? false : (field.type === 'number' || field.type === 'slider' ? 0 : ''));
}
function comfyRandomEnabled(field){
    return field?.type === 'number' && field.random_enabled === true;
}
function comfyRandomActive(node, fieldId){
    node.comfyRandomActive = node.comfyRandomActive || {};
    return node.comfyRandomActive[fieldId] !== false;
}
function comfyRandomValue(field){
    const isFloat = Number(field.step) > 0 && Number(field.step) < 1;
    let min = Number.isFinite(Number(field.min)) ? Number(field.min) : null;
    let max = Number.isFinite(Number(field.max)) ? Number(field.max) : null;
    const name = `${field.input || ''} ${field.name || ''}`.toLowerCase();
    const looksSeed = name.includes('seed') || name.includes('noise') || name.includes('随机') || name.includes('噪');
    if(min === null) min = looksSeed ? 1 : 0;
    if(max === null || max <= min) max = looksSeed ? 1000000000000000 : 999999;
    let value = min + Math.random() * (max - min);
    if(isFloat){
        const precision = Math.min(8, Math.max(1, String(field.step).split('.')[1]?.length || 2));
        return Number(value.toFixed(precision));
    }
    return Math.floor(value);
}
function toggleComfyRandom(nodeId, fieldId){
    const node = nodes.find(n => n.id === nodeId);
    if(!node) return;
    const field = comfyFields(node).find(f => f.id === fieldId);
    if(!comfyRandomEnabled(field)) return;
    node.comfyRandomActive = node.comfyRandomActive || {};
    node.comfyRandomActive[fieldId] = !comfyRandomActive(node, fieldId);
    refreshNodes([node.id]);
    scheduleSave();
}
function renderComfyBody(node){
    const wrap = document.createElement('div');
    wrap.className = 'comfy-body';
    const inputSources = generatorSources(node);
    const ordered = orderedSources(node, inputSources);
    const mediaInputs = ordered.filter(src => src.refs?.length);
    const imageInputs = mediaInputs
        .map(src => ({...src, refs:imageRefsOnly(src.refs || [])}))
        .filter(src => src.refs?.length);
    const promptInputs = ordered.filter(src => src.prompt && !src.refs?.length);
    const mode = node.mode || 'text';
    const imageFieldCount = mode === 'custom' ? comfyFields(node, 'image').length : 0;
    const videoFieldCount = mode === 'custom' ? comfyFields(node, 'video').length : 0;
    const audioFieldCount = mode === 'custom' ? comfyFields(node, 'audio').length : 0;
    const mediaFieldCount = imageFieldCount + videoFieldCount + audioFieldCount;
    if(mode === 'custom'){
        const validWorkflow = validComfyWorkflowName(node.comfyWorkflow);
        if(node.comfyWorkflow && node.comfyWorkflow !== validWorkflow) node.comfyWorkflow = validWorkflow;
        if(!node.comfyWorkflow && validWorkflow) node.comfyWorkflow = validWorkflow;
    }
    wrap.innerHTML = `
        <div class="mode-tabs">
            <button type="button" data-mode="text" class="${mode === 'text' ? 'active' : ''}">${tr('canvas.comfyModeText')}</button>
            <button type="button" data-mode="enhance" class="${mode === 'enhance' ? 'active' : ''}">${tr('canvas.comfyModeEnhance')}</button>
            <button type="button" data-mode="edit" class="${mode === 'edit' ? 'active' : ''}">${tr('canvas.comfyModeEdit')}</button>
            <button type="button" data-mode="custom" class="${mode === 'custom' ? 'active' : ''}">${tr('canvas.comfyModeCustom')}</button>
        </div>
        <div class="comfy-content">
            <div class="prompt-list"></div>
            <div class="comfy-images ${(mode === 'text' || (mode === 'custom' && !mediaFieldCount)) ? 'hidden' : ''}">
                <div class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">${mode === 'custom' ? `Media · Images ${imageFieldCount} · Videos ${videoFieldCount} · Audio ${audioFieldCount}` : 'Images'}</div>
                <div class="input-list mt-2"></div>
            </div>
        </div>
        <div class="comfy-controls">
            <div class="gen-settings comfy-settings"></div>
            <div class="gen-run-row">
                <button class="comfy-run ${node.running ? 'running' : ''}" ${node.running ? 'disabled' : ''}><i data-lucide="zap" class="w-4 h-4"></i>${node.running ? tr('canvas.comfyRunning') : tr('canvas.comfyRun')}</button>
                ${cascadeBtnHtml(node)}
            </div>
            ${retryBarHtml(node)}
        </div>
    `;
    wrap.querySelectorAll('[data-mode]').forEach(btn => {
        btn.onclick = e => {
            e.stopPropagation();
            node.mode = btn.dataset.mode;
            if(node.mode === 'custom' && !hasComfyWorkflow(node.comfyWorkflow) && comfyWorkflows[0]?.name){
                node.comfyWorkflow = comfyWorkflows[0].name;
                ensureComfyWorkflow(node.comfyWorkflow).then(() => render());
            }
            render();
            scheduleSave();
        };
    });
    renderPromptPreview(wrap.querySelector('.prompt-list'), promptInputs);
    if(mode !== 'text' && !(mode === 'custom' && !mediaFieldCount)){
        renderComfyImages(wrap.querySelector('.input-list'), node, mode === 'custom' ? mediaInputs : imageInputs);
    }
    renderComfySettings(wrap.querySelector('.comfy-settings'), node);
    wrap.querySelector('.comfy-run').onclick = e => { e.stopPropagation(); runCanvasGenerate(node.id); };
    bindCascadeButtons(wrap, node.id);
    return wrap;
}
function renderComfyImages(list, node, imageInputs){
    list.innerHTML = imageInputs.length ? '' : `<div class="text-[11px] text-gray-300 py-2">${tr('canvas.groupEmpty')}</div>`;
    imageInputs.forEach((src, i) => {
        const item = document.createElement('div');
        item.className = 'input-item';
        item.draggable = true;
        item.dataset.sourceId = src.id;
        const firstRef = (src.refs || [])[0];
        const kind = mediaKindForRef(firstRef || src.preview);
        const icon = kind === 'video' ? 'file-video' : kind === 'audio' ? 'file-audio' : 'image';
        const label = kind === 'image' ? `${tr('canvas.image')} ${i + 1}` : `${nodeTitleForMedia({mediaKind:kind})} ${i + 1}`;
        const previewHtml = kind === 'video' && src.preview && !isMissingAssetUrl(src.preview)
            ? `<video src="${escapeAttr(src.preview)}" muted preload="metadata" playsinline disablepictureinpicture controlslist="nodownload noplaybackrate noremoteplayback"></video>`
            : kind === 'audio'
                ? `<i data-lucide="${icon}" class="w-6 h-6 text-slate-400"></i>`
                : (src.preview && !isMissingAssetUrl(src.preview) ? `<img src="${escapeAttr(src.preview)}">` : (src.preview ? missingAssetHtml(src.preview, true) : `<i data-lucide="${icon}" class="w-6 h-6 text-slate-400"></i>`));
        item.innerHTML = `<span class="input-index">${i + 1}</span>${previewHtml}<span class="input-label">${escapeHtml(label)}</span>`;
        item.ondragstart = e => {
            e.stopPropagation();
            internalDrag = true;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('application/x-canvas-input', src.id);
        };
        item.ondragend = () => { internalDrag = false; };
        item.ondragover = e => { e.preventDefault(); e.stopPropagation(); };
        item.ondrop = e => {
            e.preventDefault();
            e.stopPropagation();
            reorderInput(node, e.dataTransfer.getData('application/x-canvas-input'), src.id);
            internalDrag = false;
        };
        list.appendChild(item);
    });
}
const RH_KNOWN_FIELD_OPTIONS = {
    aspectRatio:['1:1','16:9','9:16','4:3','3:4','4:5','5:4','3:2','2:3','21:9','9:21'],
    aspect_ratio:['1:1','16:9','9:16','4:3','3:4','4:5','5:4','3:2','2:3','21:9','9:21'],
    ratio:['1:1','16:9','9:16','4:3','3:4','4:5','5:4','3:2','2:3'],
    resolution:['1k','2k','4k','8k'],
    size:['512','768','1024','1280','1536','2048'],
    mode:['text2img','img2img'],
    quality:['low','medium','high','best'],
    instanceType:['default','plus','pro'],
    instance_type:['default','plus','pro'],
    precision:['fp16','fp32','bf16'],
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
    const fieldType = String(field?.fieldType || '').toUpperCase();
    if(['LIST','SELECT','DROPDOWN','COMBO','ENUM'].includes(fieldType) && Array.isArray(field?.fieldValue)){
        return field.fieldValue.filter(x => ['string','number'].includes(typeof x)).map(String);
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
function rhRandomEnabled(field){
    return rhFieldKind(field) === 'number' && field?.random_enabled === true;
}
function rhRandomActive(node, key){
    node.rhRandomActive = node.rhRandomActive || {};
    return node.rhRandomActive[key] !== false;
}
function toggleRhRandom(nodeId, key){
    const node = nodes.find(n => n.id === nodeId);
    if(!node) return;
    const field = rhActiveFields(node).find(f => rhParamKey(f.nodeId, f.fieldName) === key);
    if(!rhRandomEnabled(field)) return;
    node.rhRandomActive = node.rhRandomActive || {};
    node.rhRandomActive[key] = !rhRandomActive(node, key);
    refreshNodes([node.id]);
    scheduleSave();
}
function rhWorkflowNodeInfoList(data){
    const list = [];
    if(!data || typeof data !== 'object' || Array.isArray(data)) return list;
    Object.entries(data).forEach(([nodeId, nodeContent]) => {
        const inputs = nodeContent?.inputs || {};
        if(!inputs || typeof inputs !== 'object') return;
        Object.entries(inputs).forEach(([fieldName, rawValue]) => {
            if(rhIsWorkflowLinkValue(rawValue)) return;
            let fieldValue = rawValue;
            if(fieldValue !== null && typeof fieldValue === 'object') fieldValue = JSON.stringify(fieldValue);
            else if(fieldValue === undefined || fieldValue === null) fieldValue = '';
            else fieldValue = String(fieldValue);
            list.push({
                nodeId:String(nodeId),
                fieldName:String(fieldName),
                fieldValue,
                fieldType:rhInferWorkflowFieldType(fieldName, fieldValue),
                source:'workflow'
            });
        });
    });
    return list;
}
function rhInferWorkflowFieldType(fieldName, fieldValue){
    const key = `${fieldName || ''} ${fieldValue || ''}`.toLowerCase();
    if(/\b(image|img|mask|photo|picture)\b/.test(key) || /\.(png|jpe?g|webp|gif|bmp)(\?|$)/i.test(key)) return 'IMAGE';
    if(/\b(video|movie|mp4)\b/.test(key) || /\.(mp4|webm|mov|m4v|mkv)(\?|$)/i.test(key)) return 'VIDEO';
    if(/\b(audio|sound|music|voice)\b/.test(key) || /\.(mp3|wav|ogg|m4a|flac|aac)(\?|$)/i.test(key)) return 'AUDIO';
    if(/^(true|false)$/i.test(String(fieldValue || ''))) return 'BOOLEAN';
    if(String(fieldValue || '').trim() !== '' && !Number.isNaN(Number(fieldValue))) return 'NUMBER';
    return 'TEXT';
}
function rhIsWorkflowLinkValue(value){
    return Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && Number.isInteger(value[1]);
}
function runningHubProvider(){
    const provider = (apiProviders || []).find(p => p.id === 'runninghub');
    return provider || null;
}
function runningHubEntries(kind){
    const provider = runningHubProvider();
    const key = kind === 'workflow' ? 'rh_workflows' : 'rh_apps';
    return Array.isArray(provider?.[key]) ? provider[key].filter(item => item?.enabled !== false) : [];
}
function runningHubEntryId(entry, kind){
    return String(kind === 'workflow' ? (entry?.workflowId || entry?.id || '') : (entry?.appId || entry?.id || '')).trim();
}
function runningHubEntryLabel(entry, kind){
    const id = runningHubEntryId(entry, kind);
    return entry?.title || entry?.name || (kind === 'workflow' ? `工作流 ${id.slice(-6)}` : `AI 应用 ${id.slice(-6)}`);
}
function runningHubEntryKey(kind, id){
    return `${kind}:${String(id || '').trim()}`;
}
function parseRunningHubEntryKey(value){
    const text = String(value || '').trim();
    const match = text.match(/^(app|workflow):(.+)$/);
    if(match) return {kind:match[1], id:match[2]};
    return null;
}
function runningHubAllEntries(){
    return [
        ...runningHubEntries('app').map(entry => ({kind:'app', id:runningHubEntryId(entry, 'app'), entry})),
        ...runningHubEntries('workflow').map(entry => ({kind:'workflow', id:runningHubEntryId(entry, 'workflow'), entry}))
    ].filter(item => item.id);
}
function rhSelectedEntryRef(node){
    const parsed = parseRunningHubEntryKey(node?.rhConfigKey || '');
    const all = runningHubAllEntries();
    if(parsed){
        const hit = all.find(item => item.kind === parsed.kind && item.id === parsed.id);
        if(hit) return hit;
    }
    const workflowId = validRunningHubWorkflowId(node?.workflowId || '');
    if(workflowId){
        const hit = all.find(item => item.kind === 'workflow' && item.id === workflowId);
        if(hit) return hit;
    }
    const webappId = String(node?.webappId || '').trim();
    if(webappId){
        const hit = all.find(item => item.kind === 'app' && item.id === webappId);
        if(hit) return hit;
    }
    return null;
}
function applyRhEntrySelection(node, ref){
    if(!node || !ref) return;
    node.rhConfigKey = runningHubEntryKey(ref.kind, ref.id);
    node.rhMode = ref.kind;
    if(ref.kind === 'workflow') node.workflowId = ref.id;
    else node.webappId = ref.id;
}
function currentRunningHubAppConfig(node){
    const webappId = String(node?.webappId || '').trim();
    if(!webappId) return null;
    return runningHubEntries('app').find(app => runningHubEntryId(app, 'app') === webappId) || null;
}
function currentRunningHubWorkflowEntry(node){
    const workflowId = validRunningHubWorkflowId(node?.workflowId || '');
    if(!workflowId) return null;
    return runningHubEntries('workflow').find(workflow => runningHubEntryId(workflow, 'workflow') === workflowId) || null;
}
function rhEntryFields(entry){
    return Array.isArray(entry?.fields) ? entry.fields : [];
}
function rhCurrentEntry(node){
    return rhSelectedEntryRef(node)?.entry || null;
}
function rhCurrentKind(node){
    return rhSelectedEntryRef(node)?.kind || (node?.rhMode === 'workflow' ? 'workflow' : 'app');
}
function ensureRhNodeSelection(node){
    if(!node || node.type !== 'rh') return null;
    node.rhPayment = node.rhPayment || 'free';
    const all = runningHubAllEntries();
    let ref = rhSelectedEntryRef(node);
    if(!ref && all.length) ref = all[0];
    if(ref){
        applyRhEntrySelection(node, ref);
        return ref.entry;
    }
    return null;
}
function rhEntryOptions(selected){
    const apps = runningHubEntries('app');
    const workflows = runningHubEntries('workflow');
    if(!apps.length && !workflows.length) return `<option value="">请先在 API 设置里添加 RH 配置</option>`;
    const group = (kind, entries, label) => entries.length ? `
        <optgroup label="${label}">
            ${entries.map(entry => {
                const id = runningHubEntryId(entry, kind);
                const key = runningHubEntryKey(kind, id);
                return `<option value="${escapeAttr(key)}" ${String(selected || '') === key ? 'selected' : ''}>${escapeHtml(runningHubEntryLabel(entry, kind))}</option>`;
            }).join('')}
        </optgroup>
    ` : '';
    return `${group('app', apps, 'AI 应用')}${group('workflow', workflows, '工作流')}`;
}
function rhPaymentOptions(node){
    const provider = runningHubProvider();
    const selected = node.rhPayment === 'wallet' ? 'wallet' : 'free';
    return `
        <option value="free" ${selected === 'free' ? 'selected' : ''}>免费积分 Key${provider?.has_key ? '' : '（未配置）'}</option>
        <option value="wallet" ${selected === 'wallet' ? 'selected' : ''}>账户余额 Key${provider?.has_wallet_key ? '' : '（未配置）'}</option>
    `;
}
function rhUseWallet(node){
    return node?.rhPayment === 'wallet';
}
function rhActiveFields(node){
    const sortFields = fields => [...(fields || [])].sort((a, b) => {
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
    if(rhCurrentKind(node) === 'workflow') {
        const workflowId = validRunningHubWorkflowId(node.workflowId || '');
        const savedEntry = currentRunningHubWorkflowEntry(node);
        if(Array.isArray(savedEntry?.fields) && savedEntry.fields.length) return sortFields(savedEntry.fields.filter(f => f.enabled === true));
        const saved = workflowId ? runningHubWorkflowCache[workflowId] : null;
        if(Array.isArray(saved?.fields)) return sortFields(saved.fields.filter(f => f.enabled === true));
        return sortFields(node.rhWorkflowInfo?.nodeInfoList || []);
    }
    const savedApp = currentRunningHubAppConfig(node);
    if(Array.isArray(savedApp?.fields) && savedApp.fields.length) return sortFields(savedApp.fields.filter(f => f.enabled === true));
    return sortFields(node.rhAppInfo?.nodeInfoList || []);
}
function currentRunningHubWorkflowConfig(node){
    if(rhCurrentKind(node) !== 'workflow') return null;
    const workflowId = validRunningHubWorkflowId(node.workflowId || '');
    const entry = currentRunningHubWorkflowEntry(node);
    if(entry){
        const cached = workflowId ? runningHubWorkflowCache[workflowId] : null;
        return {
            ...entry,
            ...(cached || {}),
            workflowId:runningHubEntryId(entry, 'workflow') || workflowId,
            title:entry.title || cached?.title || workflowId,
            fields:rhEntryFields(entry).length ? rhEntryFields(entry) : (cached?.fields || []),
            optionalImageMode:entry.optionalImageMode || cached?.optionalImageMode || 'prune-workflow',
            workflowJson:cached?.workflowJson || entry.raw?.workflowJson || entry.raw?.prompt || {}
        };
    }
    return workflowId ? runningHubWorkflowCache[workflowId] : null;
}
async function ensureRunningHubWorkflowConfigForNode(node){
    if(rhCurrentKind(node) !== 'workflow') return null;
    const workflowId = validRunningHubWorkflowId(node.workflowId || '');
    if(!workflowId) return null;
    if(!runningHubWorkflowCache[workflowId]){
        try { await ensureRunningHubWorkflow(workflowId); } catch(_) {}
    }
    return currentRunningHubWorkflowConfig(node);
}
function rhMediaSources(node){
    const sources = orderedSources(node, generatorSources(node));
    const refs = sources.flatMap(src => src.refs || []).filter(ref => ref?.url);
    return {
        sources,
        refs,
        image:imageRefsOnly(refs),
        video:videoRefsOnly(refs),
        audio:audioRefsOnly(refs),
        prompt:sources.map(src => src.prompt).filter(Boolean).join('\n\n')
    };
}
function rhFieldIndexes(fields){
    const counters = {image:0, video:0, audio:0};
    const map = {};
    const ordered = [...(fields || [])].sort((a, b) => {
        const ak = rhFieldKind(a), bk = rhFieldKind(b);
        if(ak === 'image' && bk === 'image'){
            return (Number(a.imageOrder) || 9999) - (Number(b.imageOrder) || 9999);
        }
        return 0;
    });
    ordered.forEach(field => {
        const kind = rhFieldKind(field);
        if(['image','video','audio'].includes(kind)){
            map[rhParamKey(field.nodeId, field.fieldName)] = counters[kind]++;
        }
    });
    return map;
}
function rhFieldValue(node, field, media=null){
    node.rhParams = node.rhParams || {};
    const key = rhParamKey(field.nodeId, field.fieldName);
    const kind = rhFieldKind(field);
    const param = node.rhParams[key];
    if(['image','video','audio'].includes(kind)){
        const idx = rhFieldIndexes(rhActiveFields(node))[key] || 0;
        const up = (media || rhMediaSources(node))[kind]?.[idx]?.url || '';
        if(rhCurrentKind(node) === 'workflow' && kind === 'image' && field.required !== true && !up && param?.sourceFromUpstream !== false) return '';
        if(param?.sourceFromUpstream === false) return param.value ?? rhDefaultValue(field);
        return up || param?.value || rhDefaultValue(field);
    }
    if(rhRandomEnabled(field) && rhRandomActive(node, key)){
        node.rhRandomValues = node.rhRandomValues || {};
        if(node.rhRandomValues[key] === undefined){
            node.rhRandomValues[key] = comfyRandomValue({
                input:field.fieldName,
                name:field.label || field.fieldName,
                min:field.min,
                max:field.max,
                step:field.step,
                type:'number'
            });
        }
        return node.rhRandomValues[key];
    }
    if(rhFieldRole(field) === 'prompt'){
        const upstreamPrompt = (media || rhMediaSources(node)).prompt || '';
        return param?.value ?? (upstreamPrompt || rhDefaultValue(field));
    }
    return param?.value ?? rhDefaultValue(field);
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
        if(node && rhWorkflowNodeInfoList({[field.nodeId]: node}).length <= 0){
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
async function rhBuildWorkflowRequestExtras(node, media, nodeInfoList){
    const config = await ensureRunningHubWorkflowConfigForNode(node);
    if(!config || (config.optionalImageMode || 'prune-workflow') !== 'prune-workflow') return {};
    const fields = rhActiveFields(node);
    const indexes = rhFieldIndexes(fields);
    const missingOptional = [];
    for(const field of fields){
        if(rhFieldKind(field) !== 'image') continue;
        const key = rhParamKey(field.nodeId, field.fieldName);
        const idx = indexes[key] || 0;
        const hasInput = Boolean(media.image?.[idx]?.url);
        if(field.required === true && !hasInput){
            throw new Error(`RunningHub 工作流缺少必选图片：${rhRequiredLabel(field)}`);
        }
        if(field.required !== true && !hasInput){
            missingOptional.push(field);
        }
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
function rhMediaPreviewHtml(ref, kind){
    const safe = escapeAttr(ref?.url || '');
    if(kind === 'video') return `<video src="${safe}" muted preload="metadata" playsinline disablepictureinpicture controlslist="nodownload noplaybackrate noremoteplayback"></video>`;
    if(kind === 'audio') return `<i data-lucide="file-audio" class="w-6 h-6 text-slate-400"></i>`;
    return safe && !isMissingAssetUrl(safe) ? `<img src="${safe}">` : `<i data-lucide="image" class="w-6 h-6 text-slate-400"></i>`;
}
function renderRhBody(node){
    const wrap = document.createElement('div');
    wrap.className = 'rh-body';
    node.rhParams = node.rhParams || {};
    const entry = ensureRhNodeSelection(node);
    const selectedRef = rhSelectedEntryRef(node);
    const media = rhMediaSources(node);
    const fields = rhActiveFields(node);
    const mode = selectedRef?.kind || rhCurrentKind(node);
    const selectedId = selectedRef?.id || (mode === 'workflow' ? (node.workflowId || '') : (node.webappId || ''));
    const selectedKey = selectedRef ? runningHubEntryKey(selectedRef.kind, selectedRef.id) : '';
    const entryNote = entry?.note || entry?.description || '';
    wrap.innerHTML = `
        <div class="rh-top">
            <label class="field rh-webapp-field">
                <div class="setting-title">RunningHub 配置</div>
                <select class="select-lite rh-entry-select">${rhEntryOptions(selectedKey)}</select>
            </label>
            <label class="field rh-payment-field">
                <div class="setting-title">Key</div>
                <select class="select-lite rh-payment-select">${rhPaymentOptions(node)}</select>
            </label>
            <label class="field rh-machine-field">
                <div class="setting-title">显存</div>
                <select class="select-lite rh-machine-select">
                    <option value="" ${!node.instanceType ? 'selected' : ''}>24G</option>
                    <option value="plus" ${node.instanceType === 'plus' ? 'selected' : ''}>48G</option>
                </select>
            </label>
        </div>
        <div class="rh-prompt-list"></div>
        <div class="rh-media-section">
            <div class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">${tr('canvas.rhInputs')}</div>
            <div class="input-list rh-input-list"></div>
        </div>
        <div class="rh-param-head">
            <span>${mode === 'workflow' ? tr('canvas.rhWorkflowParams') : tr('canvas.rhParams')}</span>
            <span>${fields.length}</span>
        </div>
        <div class="rh-param-list"></div>
        <div class="gen-run-row">
            <button class="gen-btn rh-run ${node.running ? 'running' : ''}" ${node.running ? 'disabled' : ''}><i data-lucide="workflow" class="w-4 h-4"></i>${node.running ? tr('canvas.rhRunning') : tr('canvas.rhRun')}</button>
            ${cascadeBtnHtml(node)}
        </div>
        ${retryBarHtml(node)}
    `;
    const entrySelect = wrap.querySelector('.rh-entry-select');
    if(entrySelect) entrySelect.onchange = e => {
        const parsed = parseRunningHubEntryKey(e.target.value);
        const ref = parsed ? runningHubAllEntries().find(item => item.kind === parsed.kind && item.id === parsed.id) : null;
        if(ref) applyRhEntrySelection(node, ref);
        node.rhParams = {};
        node.rhRandomValues = {};
        render();
        scheduleSave();
    };
    const paymentSelect = wrap.querySelector('.rh-payment-select');
    if(paymentSelect) paymentSelect.onchange = e => {
        node.rhPayment = e.target.value === 'wallet' ? 'wallet' : 'free';
        scheduleSave();
    };
    const machineSelect = wrap.querySelector('.rh-machine-select');
    if(machineSelect) machineSelect.onchange = e => {
        node.instanceType = e.target.value === 'plus' ? 'plus' : '';
        scheduleSave();
    };
    renderRhPromptFields(wrap.querySelector('.rh-prompt-list'), node, fields);
    renderRhInputs(wrap.querySelector('.rh-input-list'), node, media);
    renderRhParams(wrap.querySelector('.rh-param-list'), node, fields, media);
    wrap.querySelector('.rh-run').onclick = e => { e.stopPropagation(); runCanvasGenerate(node.id); };
    bindCascadeButtons(wrap, node.id);
    refreshIcons();
    return wrap;
}
function renderRhInputs(list, node, media){
    if(!list) return;
    const refs = media.refs || [];
    if(!refs.length){
        list.innerHTML = `<div class="text-[11px] text-gray-300 py-2">${tr('canvas.groupEmpty')}</div>`;
        return;
    }
    list.innerHTML = '';
    refs.forEach((ref, i) => {
        const kind = mediaKindForRef(ref);
        const item = document.createElement('div');
        item.className = 'input-item rh-input-item';
        item.innerHTML = `<span class="input-index">${i + 1}</span>${rhMediaPreviewHtml(ref, kind)}<span class="input-label">${escapeHtml(nodeTitleForMedia({mediaKind:kind}))}</span>`;
        list.appendChild(item);
    });
}
function renderRhPromptFields(container, node, fields){
    if(!container) return;
    const prompts = (fields || []).filter(field => rhFieldRole(field) === 'prompt');
    if(!prompts.length){
        container.innerHTML = '';
        return;
    }
    container.innerHTML = prompts.map(field => {
        const key = rhParamKey(field.nodeId, field.fieldName);
        const label = field.label || field.fieldName || 'Prompt';
        const value = rhFieldValue(node, field, rhMediaSources(node));
        return `<label class="field rh-prompt-field">
            <div class="setting-title">${escapeHtml(label)}</div>
            <textarea class="setting-input rh-param-input" data-rh-param="${escapeAttr(key)}" data-rh-role="prompt">${escapeHtml(value)}</textarea>
        </label>`;
    }).join('');
    bindRhParamControls(container, node);
}
function renderRhParams(container, node, fields, media){
    if(!container) return;
    const params = (fields || []).filter(field => {
        const role = rhFieldRole(field);
        return !['image','video','audio','prompt'].includes(role);
    });
    if(!params.length){
        container.innerHTML = `<div class="rh-empty">${tr('canvas.rhNoParams')}</div>`;
        return;
    }
    container.innerHTML = params.map((field, i) => {
        const key = rhParamKey(field.nodeId, field.fieldName);
        const kind = rhFieldRole(field);
        const options = rhExtractFieldOptions(field);
        const value = rhFieldValue(node, field, media);
        const label = field.label || field.fieldName || `Field ${i + 1}`;
        const valueText = String(value ?? '');
        const wide = kind === 'text' && (String(label).length > 18 || valueText.length > 28);
        return renderRhSettingField(node, field, key, kind, label, value, options, wide);
    }).join('');
    bindRhParamControls(container, node);
}
function renderRhSettingField(node, field, key, kind, label, value, options, wide=false){
    const safeLabel = escapeHtml(label);
    if(kind === 'boolean'){
        const active = String(value).toLowerCase() === 'true';
        return `<div class="gen-settings-row rh-param-row ${wide ? 'wide' : ''}">
            <button type="button" class="setting-check ${active ? 'active' : ''}" data-rh-param="${escapeAttr(key)}" data-rh-type="boolean"><span class="check-dot"></span>${safeLabel}</button>
        </div>`;
    }
    if(options?.length){
        return `<div class="gen-settings-row rh-param-row ${wide ? 'wide' : ''}">
            <label class="field"><div class="setting-title">${safeLabel}</div><select class="select-lite rh-param-input" data-rh-param="${escapeAttr(key)}" data-rh-type="select" style="width:100%">${options.map(opt => `<option value="${escapeAttr(opt)}" ${String(value) === String(opt) ? 'selected' : ''}>${escapeHtml(opt)}</option>`).join('')}</select></label>
        </div>`;
    }
    if(rhRandomEnabled(field)){
        const active = rhRandomActive(node, key);
        return `<div class="gen-settings-row rh-param-row ${wide ? 'wide' : ''}">
            <div class="comfy-random-field">
                <label class="field"><div class="setting-title">${safeLabel}</div><input class="setting-input rh-param-input" type="number" data-rh-param="${escapeAttr(key)}" data-rh-type="number" value="${escapeAttr(value)}" ${active ? 'disabled' : ''}></label>
                <button class="tool-btn comfy-random-btn ${active ? 'active' : ''}" type="button" data-rh-random="${escapeAttr(key)}" title="${active ? '随机已开启，点击关闭' : '随机已关闭，点击开启'}"><i data-lucide="dice-5" class="w-4 h-4"></i></button>
            </div>
        </div>`;
    }
    const inputType = kind === 'number' ? 'number' : 'text';
    return `<div class="gen-settings-row rh-param-row ${wide ? 'wide' : ''}">
        <label class="field"><div class="setting-title">${safeLabel}</div><input class="setting-input rh-param-input" type="${inputType}" data-rh-param="${escapeAttr(key)}" data-rh-type="${escapeAttr(kind)}" value="${escapeAttr(value)}"></label>
    </div>`;
}
function bindRhParamControls(container, node){
    container.querySelectorAll('button[data-rh-param]').forEach(btn => {
        btn.onmousedown = e => e.stopPropagation();
        btn.onclick = e => {
            e.stopPropagation();
            const key = btn.dataset.rhParam;
            node.rhParams = node.rhParams || {};
            const field = rhActiveFields(node).find(f => rhParamKey(f.nodeId, f.fieldName) === key);
            const cur = node.rhParams[key] || {};
            const on = String(rhFieldValue(node, field)).toLowerCase() === 'true';
            node.rhParams[key] = {...cur, value:String(!on)};
            render();
            scheduleSave();
        };
    });
    container.querySelectorAll('input[data-rh-param], select[data-rh-param], textarea[data-rh-param]').forEach(control => {
        control.onmousedown = e => e.stopPropagation();
        control.onclick = e => e.stopPropagation();
        control.oninput = control.onchange = e => {
            const key = control.dataset.rhParam;
            node.rhParams = node.rhParams || {};
            const cur = node.rhParams[key] || {};
            node.rhParams[key] = {...cur, value:e.target.value};
            scheduleSave();
        };
    });
    container.querySelectorAll('[data-rh-random]').forEach(btn => {
        btn.onmousedown = e => e.stopPropagation();
        btn.onclick = e => {
            e.stopPropagation();
            toggleRhRandom(node.id, btn.dataset.rhRandom);
        };
    });
}
async function rhFetchAppInfo(nodeId, showAlert=true){
    const node = nodes.find(n => n.id === nodeId);
    if(!node) return;
    if(!String(node.webappId || '').trim()){
        if(showAlert) alert(tr('canvas.rhNeedWebappId'));
        return false;
    }
    node.rhFetching = true;
    refreshNodes([node.id]);
    try {
        const res = await fetch(`/api/runninghub/app-info?webappId=${encodeURIComponent(node.webappId.trim())}`);
        const data = await res.json();
        if(!res.ok || data.success === false) throw new Error(data.detail || data.error || tr('canvas.rhFailed'));
        node.rhAppInfo = data.data || {};
        node.rhParams = node.rhParams || {};
        (node.rhAppInfo.nodeInfoList || []).forEach(field => {
            const key = rhParamKey(field.nodeId, field.fieldName);
            if(!node.rhParams[key]) node.rhParams[key] = {value:rhDefaultValue(field)};
        });
        node.runStatus = '';
        node.runError = '';
        scheduleSave();
        return true;
    } catch(err) {
        if(showAlert) alert(err.message || tr('canvas.rhFailed'));
        return false;
    } finally {
        node.rhFetching = false;
        refreshNodes([node.id]);
    }
}
async function rhFetchWorkflowInfo(nodeId, showAlert=true){
    const node = nodes.find(n => n.id === nodeId);
    if(!node) return false;
    if(!String(node.workflowId || '').trim()){
        if(showAlert) alert(tr('canvas.rhNeedWorkflowId'));
        return false;
    }
    node.rhFetching = true;
    refreshNodes([node.id]);
    try {
        const saved = await ensureRunningHubWorkflow(node.workflowId.trim());
        const res = await fetch(`/api/runninghub/workflow-info?workflowId=${encodeURIComponent(node.workflowId.trim())}`);
        const data = await res.json();
        if(!res.ok || data.success === false) throw new Error(data.detail || data.error || tr('canvas.rhFailed'));
        const info = data.data || {};
        const savedFields = Array.isArray(saved?.fields) ? saved.fields : [];
        const mergedFields = savedFields.length
            ? savedFields
            : Array.isArray(info.nodeInfoList) ? info.nodeInfoList : [];
        node.rhWorkflowInfo = {
            workflowId:node.workflowId.trim(),
            nodeInfoList:mergedFields,
            raw:info.raw || null
        };
        node.rhParams = node.rhParams || {};
        (node.rhWorkflowInfo.nodeInfoList || []).forEach(field => {
            const key = rhParamKey(field.nodeId, field.fieldName);
            if(!node.rhParams[key]) node.rhParams[key] = {value:rhDefaultValue(field)};
        });
        node.runStatus = '';
        node.runError = '';
        scheduleSave();
        return true;
    } catch(err) {
        if(showAlert) alert(err.message || tr('canvas.rhFailed'));
        return false;
    } finally {
        node.rhFetching = false;
        refreshNodes([node.id]);
    }
}
async function rhImportWorkflowJson(nodeId, file){
    const node = nodes.find(n => n.id === nodeId);
    if(!node || !file) return;
    try {
        const text = await file.text();
        const json = JSON.parse(text);
        const nodeInfoList = rhWorkflowNodeInfoList(json);
        if(!nodeInfoList.length) throw new Error(tr('canvas.rhWorkflowJsonInvalid'));
        node.rhMode = 'workflow';
        node.rhWorkflowInfo = {fileName:file.name || 'api.json', nodeInfoList};
        node.rhParams = node.rhParams || {};
        nodeInfoList.forEach(field => {
            const key = rhParamKey(field.nodeId, field.fieldName);
            if(!node.rhParams[key]) node.rhParams[key] = {value:rhDefaultValue(field)};
        });
        node.runStatus = '';
        node.runError = '';
        render();
        scheduleSave();
    } catch(err) {
        alert(err.message || tr('canvas.rhWorkflowJsonInvalid'));
    }
}
async function rhUploadValueIfNeeded(value, node=null){
    const text = String(value || '').trim();
    if(!text) return '';
    if(!/^https?:\/\//i.test(text) && !text.startsWith('/output/') && !text.startsWith('/assets/')) return text;
    const res = await fetch('/api/runninghub/upload-asset', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({url:text, useWallet:rhUseWallet(node)})
    });
    const data = await res.json();
    if(!res.ok || data.success === false) throw new Error(data.detail || data.error || tr('canvas.rhUploadFailed'));
    return data.data?.fileName || text;
}
async function rhBuildNodeInfoList(node, media){
    const fields = rhActiveFields(node);
    const result = [];
    const indexes = rhFieldIndexes(fields);
    for(const field of fields){
        const kind = rhFieldKind(field);
        const key = rhParamKey(field.nodeId, field.fieldName);
        if(rhCurrentKind(node) === 'workflow' && field.sourceFromUpstream === false && !['image','video','audio'].includes(kind)) continue;
        if(rhCurrentKind(node) === 'workflow' && kind === 'image'){
            const idx = indexes[key] || 0;
            const hasInput = Boolean(media.image?.[idx]?.url);
            if(field.required !== true && !hasInput) continue;
        }
        let value = rhFieldValue(node, field, media);
        if(['image','video','audio'].includes(kind)) value = await rhUploadValueIfNeeded(value, node);
        if(typeof value === 'string' && /[\r\n]/.test(value)) value = value.split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0] || '';
        result.push({nodeId:field.nodeId, fieldName:field.fieldName, fieldValue:value});
    }
    return result;
}
async function runRhNode(nodeId, opts={}){
    const node = nodes.find(n => n.id === nodeId);
    if(!node || (node.running && !opts.cascade)) return;
    ensureRhNodeSelection(node);
    const mode = rhCurrentKind(node);
    node.rhRandomValues = {};
    if(mode === 'workflow' && !String(node.workflowId || '').trim()){ alert(tr('canvas.rhNeedWorkflowId')); return; }
    if(mode === 'app' && !String(node.webappId || '').trim()){ alert(tr('canvas.rhNeedWebappId')); return; }
    const selectedEntry = rhCurrentEntry(node);
    if(!selectedEntry){
        alert(mode === 'workflow' ? '请先在 API 设置里添加 RH 工作流' : '请先在 API 设置里添加 RH 应用');
        return;
    }
    if(mode === 'workflow') await ensureRunningHubWorkflowConfigForNode(node);
    if(!rhActiveFields(node).length){
        alert(mode === 'workflow' ? '请先在 API 设置里编辑并保存这个 RH 工作流参数' : '请先在 API 设置里编辑并保存这个 RH 应用参数');
        return;
    }
    const media = rhMediaSources(node);
    let out = outputForNode(node, 500);
    const pendingId = uid('p');
    const run = runSnapshot(node, media.prompt || 'RunningHub', media.refs);
    run.taskLabel = 'RunningHub';
    if(out) out._pending = [...(out._pending || []), makePending(pendingId, run)];
    if(!opts.cascade) node.running = true;
    refreshRunNodes(node, out);
    try {
        const nodeInfoList = await rhBuildNodeInfoList(node, media);
        const workflowExtras = mode === 'workflow' ? await rhBuildWorkflowRequestExtras(node, media, nodeInfoList) : {};
        const endpoint = mode === 'workflow' ? '/api/runninghub/workflow-submit' : '/api/runninghub/submit';
        const body = mode === 'workflow'
            ? {workflowId:node.workflowId.trim(), nodeInfoList, useWallet:rhUseWallet(node), ...workflowExtras}
            : {webappId:node.webappId.trim(), nodeInfoList, instanceType:node.instanceType || '', useWallet:rhUseWallet(node)};
        const submit = await fetch(endpoint, {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify(body)
        }).then(async r => {
            const data = await r.json();
            if(!r.ok || data.success === false) throw new Error(data.detail || data.error || tr('canvas.rhFailed'));
            return data.data || data;
        });
        const taskId = submit.taskId;
        if(!taskId) throw new Error(tr('canvas.rhNoTaskId'));
        run.request = {task_id:taskId, webappId:node.webappId, workflowId:node.workflowId, backend:'runninghub', mode};
        let result = null;
        for(let i = 0; i < 720; i++){
            await sleep(2500);
            const data = await fetch(`/api/runninghub/query?taskId=${encodeURIComponent(taskId)}`).then(async r => {
                const json = await r.json();
                if(!r.ok || json.success === false) throw new Error(json.detail || json.error || tr('canvas.rhFailed'));
                return json.data || json;
            });
            if(data.status === 'SUCCESS'){
                result = data;
                break;
            }
            if(data.status === 'FAILED') throw new Error(data.failReason || tr('canvas.rhFailed'));
        }
        if(!result) throw new Error(tr('canvas.rhTimeout'));
        const outputs = result.urls || [];
        if(!outputs.length) throw new Error(tr('canvas.rhOutputsEmpty'));
        const meta = collectRunMeta(out, pendingId);
        if(out) out._pending = (out._pending || []).filter(p => p.id !== pendingId);
        appendOutputImages(out, outputs, media.refs[0], [meta]);
        mergeGeneratedOutputs(node, outputs, Boolean(opts.cascade));
        addGenerationLog({run, outputs, runMs:meta.runMs || 0});
        node.runStatus = 'done';
        node.runError = '';
        refreshRunNodes(node, out);
        scheduleSave();
    } catch(err) {
        const meta = collectRunMeta(out, pendingId);
        addGenerationLog({run, outputs:[], runMs:meta.runMs || 0, error:err.message || String(err)});
        if(out) out._pending = (out._pending || []).filter(p => p.id !== pendingId);
        node.runStatus = 'failed';
        node.runError = err.message || String(err);
        refreshRunNodes(node, out);
        if(opts.cascade) throw err;
        alert(err.message || tr('canvas.rhFailed'));
    } finally {
        node.running = false;
        refreshRunNodes(node, out);
    }
}
function renderComfySettings(container, node){
    const mode = node.mode || 'text';
    if(mode === 'text'){
        container.innerHTML = `
            <div class="gen-settings-row">
                <label class="field"><div class="setting-title">${tr('canvas.width')}</div><input class="setting-input" data-field="width" type="number" min="64" step="64" value="${Number(node.width || 1024)}"></label>
                <label class="field"><div class="setting-title">${tr('canvas.height')}</div><input class="setting-input" data-field="height" type="number" min="64" step="64" value="${Number(node.height || 1024)}"></label>
            </div>
        `;
    } else if(mode === 'enhance'){
        const strength = Number(node.enhanceStrength ?? 0.5);
        container.innerHTML = `
            <div class="gen-settings-row">
                <label class="field" style="flex:1">
                    <div class="setting-title" style="display:flex;justify-content:space-between">
                        <span>${tr('studio.enhancementStrength')}</span><span class="enhance-strength-val">${strength.toFixed(2)}</span>
                    </div>
                    <input type="range" class="canvas-range enhance-strength-slider" data-field="enhanceStrength" min="0.1" max="1.0" step="0.05" value="${strength}">
                </label>
            </div>
            <div class="gen-settings-row">
                <button type="button" class="setting-check ${node.enhanceUpscale ? 'active' : ''}" data-toggle-field="enhanceUpscale"><span class="check-dot"></span>${tr('studio.superResolution')}</button>
                <select class="select-lite ${node.enhanceUpscale ? '' : 'opacity-40 cursor-not-allowed'}" data-field="enhanceUpscaleRes" ${node.enhanceUpscale ? '' : 'disabled'}><option value="2048">2X (2048)</option><option value="4096">4X (4096)</option></select>
            </div>
        `;
        container.querySelector('[data-field="enhanceUpscaleRes"]').value = String(node.enhanceUpscaleRes || 2048);
    } else if(mode === 'edit'){
        container.innerHTML = `
            <div class="gen-settings-row">
                <button type="button" class="setting-check ${node.editUpscale ? 'active' : ''}" data-toggle-field="editUpscale"><span class="check-dot"></span>${tr('studio.superResolution')}</button>
                <select class="select-lite ${node.editUpscale ? '' : 'opacity-40 cursor-not-allowed'}" data-field="editUpscaleRes" ${node.editUpscale ? '' : 'disabled'}><option value="2048">2X (2048)</option><option value="4096">4X (4096)</option></select>
            </div>
        `;
        container.querySelector('[data-field="editUpscaleRes"]').value = String(node.editUpscaleRes || 2048);
    } else if(mode === 'custom'){
        const selected = validComfyWorkflowName(node.comfyWorkflow || comfyWorkflows[0]?.name || '');
        if(node.comfyWorkflow && node.comfyWorkflow !== selected) node.comfyWorkflow = selected;
        const data = currentComfyWorkflow(node);
        const fields = data?.config?.fields || [];
        const settingFields = fields.filter(f => comfyFieldKind(f) === 'setting');
        container.innerHTML = `
            <div class="gen-settings-row">
                <select class="select-lite comfy-workflow-select" data-field="comfyWorkflow" style="width:100%">${comfyWorkflowOptions(selected)}</select>
            </div>
            ${!selected ? `<div class="text-[11px] text-slate-400">${tr('canvas.comfyNoWorkflow')}</div>` : (!data ? `<div class="text-[11px] text-slate-400">${tr('canvas.comfyLoadingWorkflow')}</div>` : '')}
            ${data ? settingFields.map(f => renderComfyCustomField(node, f)).join('') || `<div class="text-[11px] text-slate-400">${tr('canvas.comfyNoExtraParams')}</div>` : ''}
        `;
        if(selected && !data) ensureComfyWorkflow(selected).then(() => render());
    } else {
        container.innerHTML = '';
    }
    container.querySelectorAll('[data-toggle-field]').forEach(btn => {
        btn.onmousedown = e => e.stopPropagation();
        btn.onclick = e => {
            e.stopPropagation();
            const field = btn.dataset.toggleField;
            node[field] = !node[field];
            render();
            scheduleSave();
        };
    });
    container.querySelectorAll('button[data-comfy-param]').forEach(btn => {
        btn.onmousedown = e => e.stopPropagation();
        btn.onclick = e => updateComfyField(node, btn, e);
    });
    container.querySelectorAll('button[data-comfy-random]').forEach(btn => {
        btn.onmousedown = e => e.stopPropagation();
        btn.onclick = e => {
            e.stopPropagation();
            toggleComfyRandom(node.id, btn.dataset.comfyRandom);
        };
    });
    container.querySelectorAll('input, select, textarea').forEach(input => {
        input.onmousedown = e => e.stopPropagation();
        input.onclick = e => e.stopPropagation();
        if(input.classList.contains('model-select')) return;
        input.onchange = e => updateComfyField(node, input, e);
        input.oninput = e => updateComfyField(node, input, e);
    });
}
function renderComfyCustomField(node, f){
    const value = comfyParamValue(node, f);
    const label = escapeHtml(f.name || f.input);
    if(f.type === 'boolean'){
        return `<div class="gen-settings-row">
            <button type="button" class="setting-check ${value ? 'active' : ''}" data-comfy-param="${escapeHtml(f.id)}" data-comfy-type="boolean"><span class="check-dot"></span>${label}</button>
        </div>`;
    }
    if(f.type === 'slider'){
        const min = f.min ?? 0, max = f.max ?? 10, step = f.step ?? 1;
        return `<div class="gen-settings-row">
            <label class="field" style="flex:1">
                <div class="setting-title" style="display:flex;justify-content:space-between"><span>${label}</span><span class="comfy-param-val">${escapeHtml(value)}</span></div>
                <input type="range" class="canvas-range" data-comfy-param="${escapeHtml(f.id)}" data-comfy-type="slider" min="${min}" max="${max}" step="${step}" value="${escapeHtml(value)}">
            </label>
        </div>`;
    }
    if(f.type === 'dropdown'){
        const opts = (f.options || []).map(o => `<option value="${escapeHtml(o)}" ${String(value) === String(o) ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('');
        return `<div class="gen-settings-row">
            <label class="field" style="flex:1"><div class="setting-title">${label}</div><select class="select-lite" data-comfy-param="${escapeHtml(f.id)}" data-comfy-type="dropdown" style="width:100%">${opts || '<option value="">(无选项)</option>'}</select></label>
        </div>`;
    }
    if(f.type === 'textarea'){
        return `<div class="gen-settings-row">
            <label class="field" style="flex:1"><div class="setting-title">${label}</div><textarea class="setting-input" data-comfy-param="${escapeHtml(f.id)}" data-comfy-type="textarea" style="height:66px;padding-top:8px;resize:vertical">${escapeHtml(value)}</textarea></label>
        </div>`;
    }
    const type = f.type === 'number' ? 'number' : 'text';
    if(comfyRandomEnabled(f)){
        const active = comfyRandomActive(node, f.id);
        return `<div class="gen-settings-row">
            <div class="comfy-random-field">
                <label class="field"><div class="setting-title">${label}</div><input class="setting-input" type="number" data-comfy-param="${escapeHtml(f.id)}" data-comfy-type="number" value="${escapeHtml(value)}"></label>
                <button class="tool-btn comfy-random-btn ${active ? 'active' : ''}" type="button" data-comfy-random="${escapeHtml(f.id)}" title="${active ? '随机已开启，点击关闭' : '随机已关闭，点击开启'}" aria-label="${active ? '随机已开启，点击关闭' : '随机已关闭，点击开启'}"><i data-lucide="dice-5" class="w-4 h-4"></i></button>
            </div>
        </div>`;
    }
    return `<div class="gen-settings-row">
        <label class="field" style="flex:1"><div class="setting-title">${label}</div><input class="setting-input" type="${type}" data-comfy-param="${escapeHtml(f.id)}" data-comfy-type="${escapeHtml(f.type || 'text')}" value="${escapeHtml(value)}"></label>
    </div>`;
}
function updateComfyField(node, input, event){
    event?.stopPropagation();
    const paramId = input.dataset.comfyParam;
    if(paramId){
        node.comfyParams = node.comfyParams || {};
        const field = comfyFields(node).find(f => f.id === paramId);
        const type = input.dataset.comfyType || field?.type || 'text';
        if(type === 'boolean') node.comfyParams[paramId] = !Boolean(node.comfyParams[paramId] ?? field?.default ?? false);
        else if(type === 'number' || type === 'slider') node.comfyParams[paramId] = Number(input.value) || 0;
        else node.comfyParams[paramId] = input.value;
        const val = input.closest('.field')?.querySelector('.comfy-param-val');
        if(val) val.textContent = node.comfyParams[paramId];
        if(type === 'boolean') render();
        scheduleSave();
        return;
    }
    const field = input.dataset.field;
    if(!field) return;
    if(field === 'comfyWorkflow'){
        node.comfyWorkflow = validComfyWorkflowName(input.value);
        node.comfyParams = {};
        ensureComfyWorkflow(node.comfyWorkflow).then(() => render());
        scheduleSave();
        return;
    }
    if(input.type === 'checkbox') {
        node[field] = input.checked;
        if(field === 'enhanceUpscale') render();
    }
    else if(field === 'enhanceStrength') {
        node[field] = Number(input.value) || 0.5;
        const val = input.closest('.field')?.querySelector('.enhance-strength-val');
        if(val) val.textContent = node[field].toFixed(2);
    }
    else if(['width','height','enhanceUpscaleRes','editUpscaleRes','count'].includes(field)) node[field] = Number(input.value) || 1;
    else node[field] = input.value;
    scheduleSave();
}

const CANVAS_GENERATOR_TYPES = ['generator','msgen','comfy','video','rh'];
const CANVAS_IMAGE_OUTPUT_TYPES = ['generator','msgen','comfy','rh'];
function hasExplicitOutputConnection(nodeId){
    return connections.some(c => {
        if(c.from !== nodeId) return false;
        const to = nodes.find(n => n.id === c.to);
        return to?.type === 'output';
    });
}
function hasDownstreamGenerator(nodeId){
    return connections.some(c => {
        if(c.from !== nodeId) return false;
        const to = nodes.find(n => n.id === c.to);
        if(!to) return false;
        if(CANVAS_GENERATOR_TYPES.includes(to.type)) return true;
        if(to.type !== 'output') return false;
        return connections.some(cc => {
            if(cc.from !== to.id) return false;
            const next = nodes.find(n => n.id === cc.to);
            return next && CANVAS_GENERATOR_TYPES.includes(next.type);
        });
    });
}
function shouldCreateOutputForNode(node){
    if(!node) return false;
    if(hasExplicitOutputConnection(node.id)) return true;
    return !hasDownstreamGenerator(node.id);
}
function outputForNode(node, dx=460){
    if(!node || !shouldCreateOutputForNode(node)) return null;
    let out = connections
        .filter(c => c.from === node.id)
        .map(c => nodes.find(n => n.id === c.to))
        .find(n => n?.type === 'output');
    if(!out){
        out = {id:uid('out'), type:'output', x:node.x + dx, y:node.y, images:[]};
        nodes.push(out);
        connections.push({id:uid('c'), from:node.id, to:out.id});
    }
    return out;
}
function generatedImageRefs(node){
    return (node?.generatedOutputs || [])
        .map(outputUrlValue)
        .filter(Boolean)
        .filter(url => node?.type === 'rh' || (!isVideoUrl(url) && !isAudioUrl(url)))
        .map((url, i) => {
            const kind = isVideoUrl(url) ? 'video' : isAudioUrl(url) ? 'audio' : 'image';
            return {url, name:outputImageName(url) || `${node.type || 'generated'}-${i + 1}`, kind};
        });
}
function mediaRefsFromNode(node){
    if(!node) return [];
    if(node.type === 'image' && node.url){
        const kind = mediaKindForNode(node);
        return [{url:node.url, name:node.name || kind, role:node.role || '', kind}];
    }
    if(node.type === 'group'){
        return (node.items || [])
            .map(id => nodes.find(x => x.id === id))
            .filter(x => x?.type === 'image' && x?.url)
            .map(item => ({url:item.url, name:item.name || mediaKindForNode(item), role:item.role || '', kind:mediaKindForNode(item)}));
    }
    if(node.type === 'output'){
        return (node.images || []).map((item, i) => {
            const url = outputUrlValue(item);
            if(!url) return null;
            const kind = isVideoUrl(url) ? 'video' : isAudioUrl(url) ? 'audio' : 'image';
            return {url, name:outputImageName(url) || `output-${i + 1}`, kind};
        }).filter(Boolean);
    }
    if(CANVAS_IMAGE_OUTPUT_TYPES.includes(node.type)) return generatedImageRefs(node);
    return [];
}
function generatorSources(gen){
    return connections.filter(c => c.to === gen.id).map(c => nodes.find(n => n.id === c.from)).filter(Boolean).map(n => {
        if(n.type === 'output' && (n.images||[]).length){
            // 从 output 节点取最新一张图当作 reference 给下游
            const last = [...n.images].reverse().map(outputUrlValue).find(Boolean);
            if(last) return {id:n.id, type:'outputImage', label:'上游输出', preview:last, refs:[{url:last, name:'output.png'}], prompt:''};
        }
        if(CANVAS_IMAGE_OUTPUT_TYPES.includes(n.type)){
            const refs = generatedImageRefs(n);
            if(refs.length){
                return refs.map((ref, i) => ({
                    id:`${n.id}:generated:${i}:${ref.url}`,
                    type:'generatedImage',
                    label:`上游生成 ${i + 1}`,
                    preview:ref.url,
                    refs:[ref],
                    prompt:''
                }));
            }
        }
        if(n.type === 'image' && n.url) {
            const kind = mediaKindForNode(n);
            return {id:n.id, type:kind, label:n.name || kind, preview:n.url, refs:[{url:n.url, name:n.name || kind, role:n.role || '', kind}], prompt:''};
        }
        if(n.type === 'group') {
            const items = (n.items || []).map(id => nodes.find(x => x.id === id)).filter(Boolean);
            const sources = items.filter(x => x.type === 'image' && x.url).map(img => ({
                id:`${n.id}:${img.id}`,
                type:`group-${mediaKindForNode(img)}`,
                groupId:n.id,
                imageId:img.id,
                label:img.name || mediaKindForNode(img),
                preview:img.url,
                refs:[{url:img.url, name:img.name || mediaKindForNode(img), role:img.role || '', kind:mediaKindForNode(img)}],
                prompt:''
            }));
            const prompts = items.filter(x => x.type === 'prompt').map(p => p.text || '').filter(Boolean);
            if(prompts.length){
                const combined = prompts.join('\n\n');
                sources.push({
                    id:`${n.id}:prompts`,
                    type:'groupPrompt',
                    groupId:n.id,
                    label:combined.slice(0, 32),
                    refs:[],
                    prompt:combined
                });
            }
            return sources;
        }
        if(n.type === 'prompt') return {id:n.id, type:'prompt', label:(n.text || '提示词').slice(0, 32), refs:[], prompt:n.text || ''};
        if(n.type === 'loop') {
            const prompt = renderLoopPrompt(n);
            const refs = loopInputImageRefs(n);
            if(refs.length){
                const currentIndex = Math.max(1, Number(loopContext?.index || n.loopStart || 1) || 1);
                return refs.map((ref, i) => ({
                    id:`${n.id}:image:${currentIndex + i}:${ref.url}`,
                    type:'loopImage',
                    label:trf('canvas.loopImageLabel', {n:currentIndex + i}),
                    preview:ref.url,
                    refs:[ref],
                    prompt:i === 0 ? prompt : ''
                }));
            }
            return {id:n.id, type:'loop', label:`${tr('canvas.loopNode')} ${loopCount(n)}x`, refs:[], prompt};
        }
        if(n.type === 'promptGroup') {
            const prompts = (n.items || []).map(id => nodes.find(x => x.id === id)).filter(Boolean).map(p => p.text || '').filter(Boolean);
            return {id:n.id, type:'promptGroup', label:`提示词 ${prompts.length} 个`, refs:[], prompt:prompts.join('\n\n')};
        }
        if(n.type === 'llm' && (n.mode || 'node') === 'node' && n.outputText) return {id:n.id, type:'llm', label:(n.outputText || 'LLM').slice(0, 32), refs:[], prompt:n.outputText || ''};
        return null;
    }).flat().filter(Boolean);
}
function orderedSources(gen, sources){
    gen.inputs = (gen.inputs || []).filter(id => sources.some(s => s.id === id));
    sources.forEach(s => { if(!gen.inputs.includes(s.id)) gen.inputs.push(s.id); });
    return gen.inputs.map(id => sources.find(s => s.id === id)).filter(Boolean);
}
function reorderInput(gen, movedId, targetId){
    if(!movedId || movedId === targetId) return;
    const sources = generatorSources(gen);
    const imageIds = sources.filter(s => s.refs?.length).map(s => s.id);
    if(!imageIds.includes(movedId) || !imageIds.includes(targetId)) return;
    const promptIds = (gen.inputs || []).filter(id => !imageIds.includes(id));
    const ids = (gen.inputs || []).filter(id => imageIds.includes(id));
    const from = ids.indexOf(movedId), to = ids.indexOf(targetId);
    if(from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    gen.inputs = [...ids, ...promptIds];
    render();
    scheduleSave();
}
function syncGeneratorInputs(){
    nodes.filter(n => CANVAS_GENERATOR_TYPES.includes(n.type)).forEach(gen => orderedSources(gen, generatorSources(gen)));
}
function refreshGeneratorInputViews(){
    nodes.filter(n => CANVAS_GENERATOR_TYPES.includes(n.type)).forEach(gen => {
        const el = nodesEl.querySelector(`.node[data-id="${gen.id}"]`);
        if(!el) return;
        const sources = orderedSources(gen, generatorSources(gen));
        const imageInputs = sources
            .map(src => ({...src, refs:imageRefsOnly(src.refs || [])}))
            .filter(src => src.refs?.length);
        renderPromptPreview(el.querySelector('.prompt-list'), sources.filter(src => src.prompt && !src.refs?.length));
        if(gen.type === 'generator') renderImageInputList(el.querySelector('.input-list'), gen, imageInputs);
        if(gen.type === 'msgen') renderImageInputList(el.querySelector('.ms-img-list'), gen, imageInputs);
        if(gen.type === 'comfy') renderComfyImages(el.querySelector('.input-list'), gen, imageInputs);
        if(gen.type === 'video') renderVideoImageInputs(el.querySelector('.video-img-list'), gen, imageInputs);
        if(gen.type === 'rh'){
            const media = rhMediaSources(gen);
            renderRhPromptFields(el.querySelector('.rh-prompt-list'), gen, rhActiveFields(gen));
            renderRhInputs(el.querySelector('.rh-input-list'), gen, media);
            renderRhParams(el.querySelector('.rh-param-list'), gen, rhActiveFields(gen), media);
        }
    });
}
async function runGenerator(genId, opts={}){
    const gen = nodes.find(n => n.id === genId);
    if(!gen || (gen.running && !opts.cascade)) return;
    const sources = orderedSources(gen, generatorSources(gen));
    const prompt = sources.map(s => s.prompt).filter(Boolean).join('\n\n');
    const refs = imageRefsOnly(sources.flatMap(s => s.refs || []));
    if(!prompt && !refs.length){ alert(tr('canvas.needPromptOrImage')); return; }
    const count = Math.max(1, Math.min(8, Number(gen.count || 1)));
    let out = outputForNode(gen, 460);
    const run = runSnapshot(gen, prompt || 'Edit the reference images.', refs);
    const payload = {
        prompt: prompt || 'Edit the reference images.',
        provider_id:resolveImageProviderId(gen.apiProvider || 'comfly'),
        model:resolveImageModel(gen.model),
        size:await generatorSizeForRun(gen, refs),
        reference_images:refs
    };
    const quality = normalizedImageQuality(gen.quality);
    if(quality) payload.quality = quality;
    let pendingIds = [];
    if(!opts.cascade){ gen.running = true; }
    try {
        const taskInfos = await Promise.all(Array.from({length:count}, () => createCanvasImageTask(payload)));
        pendingIds = taskInfos.map(() => uid('p'));
        if(out) out._pending = [
            ...(out._pending || []),
            ...taskInfos.map((task, index) => makePending(pendingIds[index], run, {
                canvasTaskId:task.task_id,
                canvasTaskType:'online-image',
                appendGenerated:Boolean(opts.cascade)
            }))
        ];
        refreshRunNodes(gen, out);
        scheduleSave();
        await saveCanvas();
        const statuses = await Promise.all(taskInfos.map(task => pollCanvasImageTask(task.task_id)));
        if(statuses.includes('failed')) throw new Error(gen.runError || tr('canvas.generationFailed'));
    } catch(err) {
        const remainingIds = pendingIds.filter(id => pendingById(out, id));
        if(remainingIds.length){
            const metas = collectRunMetas(out, remainingIds);
            addGenerationLog({run, outputs:[], runMs:Math.max(...metas.map(m => m.runMs || 0), 0), error:err.message || String(err)});
            if(out) out._pending = (out._pending||[]).filter(p => !remainingIds.includes(p.id));
        }
        gen.runStatus = 'failed'; gen.runError = err.message || String(err);
        gen.running = false;
        refreshRunNodes(gen, out);
        scheduleSave();
        if(opts.cascade) throw err;
        showErrorModal(err.message || tr('canvas.generationFailed'), tr('canvas.apiFailed'));
    }
}
async function runGeneratorLegacy(genId, opts={}){
    const gen = nodes.find(n => n.id === genId);
    if(!gen || (gen.running && !opts.cascade)) return;
    const sources = orderedSources(gen, generatorSources(gen));
    const prompt = sources.map(s => s.prompt).filter(Boolean).join('\n\n');
    const refs = imageRefsOnly(sources.flatMap(s => s.refs || []));
    if(!prompt && !refs.length){ alert(tr('canvas.needPromptOrImage')); return; }
    const count = Math.max(1, Math.min(8, Number(gen.count || 1)));
    let out = outputForNode(gen, 460);
    const pendingIds = Array.from({length:count}, () => uid('p'));
    const run = runSnapshot(gen, prompt || 'Edit the reference images.', refs);
    if(out) out._pending = [...(out._pending||[]), ...pendingIds.map(id => makePending(id, run))];
    if(!opts.cascade){
        gen.running = true;
        refreshRunNodes(gen, out);
        setTimeout(() => { gen.running = false; refreshRunNodes(gen, out); }, 2000);
    }
    else refreshRunNodes(gen, out);
    try {
        const payload = {
            prompt: prompt || 'Edit the reference images.',
            provider_id:resolveImageProviderId(gen.apiProvider || 'comfly'),
            model:resolveImageModel(gen.model),
            size:await generatorSizeForRun(gen, refs),
            reference_images:refs
        };
        const quality = normalizedImageQuality(gen.quality);
        if(quality) payload.quality = quality;
        const results = await Promise.all(Array.from({length:count}, () => fetch('/api/online-image', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify(payload)
        }).then(async r => { if(!r.ok) throw new Error(await responseErrorMessage(r, tr('canvas.generationFailed'))); return r.json(); })));
        const images = results.flatMap(result => result.images || []);
        const metas = collectRunMetas(out, pendingIds);
        run.request = results[0] ? requestMetaFromResult(results[0]) : {};
        if(out) out._pending = (out._pending||[]).filter(p => !pendingIds.includes(p.id));
        appendOutputImages(out, images, refs[0], metas);
        mergeGeneratedOutputs(gen, images, Boolean(opts.cascade));
        addGenerationLog({run, outputs:images, runMs:Math.max(...metas.map(m => m.runMs || 0), 0)});
        gen.runStatus = 'done'; gen.runError = '';
        refreshRunNodes(gen, out);
        scheduleSave();
    } catch(err) {
        const metas = collectRunMetas(out, pendingIds);
        addGenerationLog({run, outputs:[], runMs:Math.max(...metas.map(m => m.runMs || 0), 0), error:err.message || String(err)});
        if(out) out._pending = (out._pending||[]).filter(p => !pendingIds.includes(p.id));
        gen.runStatus = 'failed'; gen.runError = err.message || String(err);
        refreshRunNodes(gen, out);
        if(opts.cascade) throw err;
        showErrorModal(err.message || tr('canvas.generationFailed'), tr('canvas.apiFailed'));
    }
}
async function runVideoNode(nodeId, opts={}){
    const node = nodes.find(n => n.id === nodeId);
    if(!node || (node.running && !opts.cascade)) return;
    const sources = orderedSources(node, generatorSources(node));
    const prompt = sources.map(s => s.prompt).filter(Boolean).join('\n\n');
    const allRefs = sources.flatMap(s => s.refs || []);
    const refs = imageRefsOnly(allRefs);
    const videoRefs = videoRefsOnly(allRefs);
    if(node.useFrameRoles && refs[0]) refs[0] = {...refs[0], role:'first_frame'};
    if(node.useFrameRoles && refs[1]) refs[1] = {...refs[1], role:'last_frame'};
    if(!prompt){ alert(tr('canvas.videoNeedsPrompt')); return; }
    let out = outputForNode(node, 460);
    const pendingId = uid('p');
    const run = runSnapshot(node, prompt, refs);
    if(out) out._pending = [...(out._pending || []), makePending(pendingId, run)];
    if(!opts.cascade){ node.running = true; refreshRunNodes(node, out); }
    else refreshRunNodes(node, out);
    try {
        const result = await fetch('/api/canvas-video', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({
                prompt,
                provider_id:resolveVideoProviderId(node.apiProvider || 'comfly'),
                model:node.model || 'veo3-fast',
                duration:Number(node.duration || 5),
                aspect_ratio:node.aspectRatio || '16:9',
                resolution:node.resolution || '',
                images:refs,
                videos:videoRefs.map(ref => ref.url),
                enhance_prompt:Boolean(node.enhancePrompt),
                enable_upsample:Boolean(node.enableUpsample),
                watermark:Boolean(node.watermark),
                camerafixed:Boolean(node.cameraFixed),
                generate_audio:Boolean(node.generateAudio)
            })
        }).then(async r => { if(!r.ok) throw new Error(await responseErrorMessage(r, tr('canvas.videoFailed'))); return r.json(); });
        const meta = collectRunMeta(out, pendingId);
        if(out) out._pending = (out._pending || []).filter(p => p.id !== pendingId);
        const outputUrls = result.videos || [];
        run.request = requestMetaFromResult(result);
        appendOutputImages(out, outputUrls, refs[0], [meta]);
        mergeGeneratedOutputs(node, outputUrls, Boolean(opts.cascade));
        addGenerationLog({run, outputs:outputUrls, runMs:meta.runMs || 0});
        node.runStatus = 'done'; node.runError = '';
        refreshRunNodes(node, out);
        scheduleSave();
    } catch(err) {
        const meta = collectRunMeta(out, pendingId);
        addGenerationLog({run, outputs:[], runMs:meta.runMs || 0, error:err.message || String(err)});
        if(out) out._pending = (out._pending || []).filter(p => p.id !== pendingId);
        node.runStatus = 'failed'; node.runError = err.message || String(err);
        refreshRunNodes(node, out);
        if(opts.cascade) throw err;
        alert(err.message || tr('canvas.videoFailed'));
    } finally {
        node.running = false;
        refreshRunNodes(node, out);
    }
}
async function uploadCanvasUrlToComfy(url){
    const blob = await fetch(url).then(r => {
        if(!r.ok) throw new Error(langIsEn() ? 'Image read failed' : '图片读取失败');
        return r.blob();
    });
    const filename = (url || '').split('/').pop()?.split('?')[0] || `canvas_${Date.now()}.png`;
    const form = new FormData();
    form.append('files', blob, filename);
    const data = await fetch('/api/upload', {method:'POST', body:form}).then(async r => {
        if(!r.ok) throw new Error(await responseErrorMessage(r, langIsEn() ? 'Image upload to ComfyUI failed' : '图片上传到 ComfyUI 失败'));
        return r.json();
    });
    return data.files?.[0]?.comfy_name || filename;
}
async function comfyNameForRef(ref){
    if(ref.comfy_name) return ref.comfy_name;
    if(!ref.url) throw new Error(langIsEn() ? 'Missing input image' : '缺少输入图片');
    return uploadCanvasUrlToComfy(ref.url);
}
async function runComfyUpscale(imageUrl, resolution){
    if(!imageUrl) throw new Error(actionFailed('studio.superResolution', langIsEn() ? 'missing input image' : '缺少输入图片'));
    const nextInput = await uploadCanvasUrlToComfy(imageUrl);
    const upscale = await fetch('/api/generate', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
            workflow_json:'upscale.json',
            params:{
                "15": { image:nextInput },
                "172": { seed:Math.floor(Math.random() * 4294967295), resolution:Number(resolution || 2048) }
            },
            type:'enhance',
            client_id:CLIENT_ID
        })
    }).then(async r => { if(!r.ok) throw new Error(await responseErrorMessage(r, actionFailed('studio.superResolution'))); return r.json(); });
    if(upscale.error) throw new Error(actionFailed('studio.superResolution', upscale.error));
    if(!upscale.images?.length) throw new Error(noReturnedImage('studio.superResolution'));
    return upscale.images || [];
}
function comfyResultOutputs(result){
    return (result.outputs && result.outputs.length)
        ? result.outputs
        : [...(result.images || []), ...(result.videos || [])];
}
async function runComfyNode(nodeId, opts={}){
    const node = nodes.find(n => n.id === nodeId);
    if(!node || (node.running && !opts.cascade)) return;
    const sources = orderedSources(node, generatorSources(node));
    const prompt = sources.map(s => s.prompt).filter(Boolean).join('\n\n');
    const allRefs = sources.flatMap(s => s.refs || []);
    const refs = imageRefsOnly(allRefs);
    const mode = node.mode || 'text';
    const customImageFields = mode === 'custom' ? comfyFields(node, 'image') : [];
    const customVideoFields = mode === 'custom' ? comfyFields(node, 'video') : [];
    const customAudioFields = mode === 'custom' ? comfyFields(node, 'audio') : [];
    const customPromptFields = mode === 'custom' ? comfyFields(node, 'prompt') : [];
    if((mode === 'text' || (mode === 'custom' && customPromptFields.length)) && !prompt){ alert(tr('canvas.needPrompt')); return; }
    if((mode !== 'text' && mode !== 'custom' && !refs.length) || (mode === 'custom' && refs.length < customImageFields.length)){ alert(tr('canvas.needImage')); return; }
    if(mode === 'custom' && videoRefsOnly(allRefs).length < customVideoFields.length){ alert(langIsEn() ? 'Please connect enough video inputs for this ComfyUI workflow.' : '请为这个 ComfyUI 工作流连接足够的视频输入'); return; }
    if(mode === 'custom' && audioRefsOnly(allRefs).length < customAudioFields.length){ alert(langIsEn() ? 'Please connect enough audio inputs for this ComfyUI workflow.' : '请为这个 ComfyUI 工作流连接足够的音频输入'); return; }
    let out = outputForNode(node, 480);
    const pendingId = uid('p');
    const run = runSnapshot(node, prompt, refs);
    run.taskLabel = comfyRunLabel(node);
    if(out) out._pending = [...(out._pending||[]), makePending(pendingId, run)];
    if(!opts.cascade){
        node.running = true;
        refreshRunNodes(node, out);
        setTimeout(() => { node.running = false; refreshRunNodes(node, out); }, 2000);
    }
    else refreshRunNodes(node, out);
    try {
        let images = [];
        if(mode === 'text'){
            run.taskLabel = tr('canvas.comfyText');
            const result = await fetch('/api/generate', {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({
                    prompt,
                    width:Number(node.width || 1024),
                    height:Number(node.height || 1024),
                    workflow_json:'Z-Image.json',
                    type:'zimage',
                    client_id:CLIENT_ID
                })
            }).then(async r => { if(!r.ok) throw new Error(await responseErrorMessage(r, actionFailed('canvas.comfyText'))); return r.json(); });
            run.request = requestMetaFromResult(result);
            images = comfyResultOutputs(result);
        } else if(mode === 'enhance'){
            run.taskLabel = tr('canvas.comfyEnhance');
            const inputName = await comfyNameForRef(refs[0]);
            const enhance = await fetch('/api/generate', {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({
                    workflow_json:'Z-Image-Enhance.json',
                    params:{
                        "15": { image:inputName },
                        "204": { value:Number(node.enhanceStrength ?? 0.5) }
                    },
                    type:'enhance',
                    client_id:CLIENT_ID
                })
            }).then(async r => { if(!r.ok) throw new Error(await responseErrorMessage(r, actionFailed('canvas.comfyEnhance'))); return r.json(); });
            run.request = requestMetaFromResult(enhance);
            if(enhance.error) throw new Error(actionFailed('canvas.comfyEnhance', enhance.error));
            if(!enhance.images?.length) throw new Error(noReturnedImage('canvas.comfyEnhance'));
            if(node.enhanceUpscale){
                images = await runComfyUpscale(enhance.images?.[0], node.enhanceUpscaleRes || 2048);
            } else {
                images = enhance.images || [];
            }
        } else if(mode === 'custom'){
            const workflowName = validComfyWorkflowName(node.comfyWorkflow || comfyWorkflows[0]?.name || '');
            run.taskLabel = workflowName || tr('canvas.comfyCustom');
            if(node.comfyWorkflow && node.comfyWorkflow !== workflowName) node.comfyWorkflow = workflowName;
            const wf = await ensureComfyWorkflow(workflowName);
            if(!workflowName || !wf) throw new Error(tr('canvas.comfyNoWorkflow'));
            const fields = wf?.config?.fields || [];
            const params = {};
            const imageFields = fields.filter(f => comfyFieldKind(f) === 'image');
            const videoFields = fields.filter(f => comfyFieldKind(f) === 'video');
            const audioFields = fields.filter(f => comfyFieldKind(f) === 'audio');
            const promptFields = fields.filter(f => comfyFieldKind(f) === 'prompt');
            const settingFields = fields.filter(f => comfyFieldKind(f) === 'setting');
            const assignMediaFields = async (mediaFields, mediaRefs) => {
                const names = [];
                for(const ref of mediaRefs.slice(0, mediaFields.length)) names.push(await comfyNameForRef(ref));
                mediaFields.forEach((f, i) => {
                    if(!f.node || !f.input) return;
                    params[f.node] = params[f.node] || {};
                    params[f.node][f.input] = names[i] || '';
                });
            };
            await assignMediaFields(imageFields, refs);
            await assignMediaFields(videoFields, videoRefsOnly(allRefs));
            await assignMediaFields(audioFields, audioRefsOnly(allRefs));
            promptFields.forEach(f => {
                if(!f.node || !f.input) return;
                params[f.node] = params[f.node] || {};
                params[f.node][f.input] = prompt;
            });
            settingFields.forEach(f => {
                if(!f.node || !f.input) return;
                params[f.node] = params[f.node] || {};
                if(comfyRandomEnabled(f) && comfyRandomActive(node, f.id)){
                    node.comfyParams = node.comfyParams || {};
                    node.comfyParams[f.id] = comfyRandomValue(f);
                }
                params[f.node][f.input] = comfyParamValue(node, f);
            });
            const result = await fetch('/api/generate', {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({
                    prompt,
                    workflow_json:workflowName,
                    params,
                    type:'workflow-custom',
                    client_id:CLIENT_ID
                })
            }).then(async r => { if(!r.ok) throw new Error(await responseErrorMessage(r, actionFailed('canvas.comfyCustom'))); return r.json(); });
            run.request = requestMetaFromResult(result);
            if(result.error) throw new Error(actionFailed('canvas.comfyCustom', result.error));
            images = comfyResultOutputs(result);
            if(!images.length) throw new Error(noReturnedImage('canvas.comfyCustom'));
        } else {
            run.taskLabel = tr('canvas.comfyEdit');
            const names = [];
            for (const ref of refs.slice(0, 3)) names.push(await comfyNameForRef(ref));
            const result = await fetch('/api/generate', {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({
                    prompt,
                    workflow_json:'Flux2-Klein.json',
                    type:'klein',
                    params:{
                        "168": { text:prompt },
                        "158": { noise_seed:Math.floor(Math.random() * 1000000) },
                        "278": { image:names[0] || "" },
                        "270": { image:names[1] || "" },
                        "292": { image:names[2] || "" },
                        "313": { value:Boolean(names[1]) },
                        "314": { value:Boolean(names[2]) }
                    },
                    client_id:CLIENT_ID
                })
            }).then(async r => { if(!r.ok) throw new Error(await responseErrorMessage(r, actionFailed('canvas.comfyEdit'))); return r.json(); });
            run.request = requestMetaFromResult(result);
            if(result.error) throw new Error(actionFailed('canvas.comfyEdit', result.error));
            if(!result.images?.length) throw new Error(noReturnedImage('canvas.comfyEdit'));
            images = node.editUpscale ? await runComfyUpscale(result.images?.[0], node.editUpscaleRes || 2048) : result.images || [];
        }
        const meta = collectRunMeta(out, pendingId);
        if(out) out._pending = (out._pending||[]).filter(p => p.id !== pendingId);
        appendOutputImages(out, images, refs[0], [meta]);
        mergeGeneratedOutputs(node, images, Boolean(opts.cascade));
        addGenerationLog({run, outputs:images, runMs:meta.runMs || 0});
        node.runStatus = 'done'; node.runError = '';
        refreshRunNodes(node, out);
        scheduleSave();
    } catch(err) {
        const meta = collectRunMeta(out, pendingId);
        addGenerationLog({run, outputs:[], runMs:meta.runMs || 0, error:err.message || String(err)});
        if(out) out._pending = (out._pending||[]).filter(p => p.id !== pendingId);
        node.runStatus = 'failed'; node.runError = err.message || String(err);
        refreshRunNodes(node, out);
        if(opts.cascade) throw err;
        alert(err.message || actionFailed('canvas.comfyGenerate'));
    }
}
async function callCanvasLLM(node, message, messages=[]){
    const llmProv = resolveChatProviderId(node.llmProvider || 'comfly');
    const model = resolveChatModel(node.model || node.llmMsModel, llmProv);
    const images = llmInputImages(node);
    const result = await fetch('/api/canvas-llm', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
            message,
            model,
            ms_model: llmProv === 'modelscope' ? model : '',
            provider: llmProv,
            system_prompt:node.systemPrompt || 'You are a helpful assistant.',
            messages,
            images,
        })
    }).then(async r => {
        if(!r.ok){
            throw new Error(await responseErrorMessage(r, 'LLM 运行失败'));
        }
        return r.json();
    });
    return result.text || '';
}
async function runLLMNode(nodeId, opts={}){
    const node = nodes.find(n => n.id === nodeId);
    if(!node || (node.running && !opts.cascade)) return;
    const input = llmInputText(node) || node.userInput || '';
    if(!input){
        if(opts.cascade) throw new Error('LLM 缺少提示词输入');
        alert(tr('canvas.needPromptToLLM')); return;
    }
    if(!opts.cascade){ node.running = true; refreshNodes([node.id]); }
    try {
        node.outputText = await callCanvasLLM(node, input, []);
        if(!opts.cascade) node.running = false;
        node.runStatus = 'done'; node.runError = '';
        refreshNodes([node.id]);
        scheduleSave();
    } catch(err) {
        if(!opts.cascade) node.running = false;
        node.runStatus = 'failed'; node.runError = err.message || String(err);
        refreshNodes([node.id]);
        if(opts.cascade) throw err;
        alert(err.message || 'LLM 运行失败');
    }
}
// 判断是不是「链尾」节点：没有下游生成节点（直接相连或经 Output 中转都算）
function isTerminalGenerator(nodeId){
    const GEN_TYPES = ['generator','msgen','comfy','llm','video'];
    for(const c of connections.filter(c => c.from === nodeId)){
        const t = nodes.find(n => n.id === c.to);
        if(!t) continue;
        if(GEN_TYPES.includes(t.type)) return false;
        if(t.type === 'output'){
            for(const c2 of connections.filter(cc => cc.from === t.id)){
                const t2 = nodes.find(n => n.id === c2.to);
                if(t2 && GEN_TYPES.includes(t2.type)) return false;
            }
        }
    }
    return true;
}
function findLoopCascadeTarget(loopId){
    const runTypes = canvasRunTypes();
    const seen = new Set();
    const candidates = [];
    const walk = (id, depth=0) => {
        if(seen.has(id)) return;
        seen.add(id);
        connections.filter(c => c.from === id).forEach(c => {
            const next = nodes.find(n => n.id === c.to);
            if(!next) return;
            if(runTypes.includes(next.type)){
                candidates.push({id:next.id, depth:depth + 1, terminal:isTerminalGenerator(next.id)});
            }
            walk(next.id, depth + 1);
        });
    };
    walk(loopId);
    const terminal = candidates.filter(c => c.terminal).sort((a, b) => b.depth - a.depth)[0];
    return (terminal || candidates.sort((a, b) => b.depth - a.depth)[0])?.id || '';
}
function cascadeBtnHtml(node){
    // 仅链尾节点显示一键运行
    if(!isTerminalGenerator(node.id)) return '';
    // 也要求至少有上游生成节点，否则没意义
    const order = computeCascadeOrder(node.id);
    const loop = resolveCascadeLoop(node.id);
    if(order.length <= 1 && !loop) return '';
    const suffix = loop ? ` × ${loop.count} ${tr('canvas.loopRounds')}` : '';
    // 仅在以串行模式启动的运行中显示停止按钮
    if(cascadeSerialIds.has(node.id)){
        const stopping = cascadeStopIds.has(node.id);
        return `<button class="gen-cascade-btn gen-cascade-stop" type="button" data-cascade-stop="${node.id}" ${stopping ? 'disabled' : ''}><i data-lucide="square" class="w-4 h-4"></i><span>${stopping ? '停止中…' : '停止循环'}</span></button>`;
    }
    return `<button class="gen-cascade-btn" type="button" data-cascade="${node.id}" title="一键运行整条工作流（追溯所有上游生成节点）"><i data-lucide="play-circle" class="w-4 h-4"></i><span>一键运行 ${order.length} 个节点${suffix}</span></button>`;
}
function retryBarHtml(node){
    // 只在一键运行模式中失败才显示；普通单节点失败直接弹 alert，不显示这条
    if(node.runStatus !== 'failed' || !node._cascadeFailed) return '';
    return `<div class="node-retry-bar" data-retry-bar>
        <span class="node-retry-msg" title="${escapeAttr(node.runError||'')}">${escapeHtml((node.runError||tr('canvas.generationFailed')).slice(0,60))}</span>
        <button class="node-retry-btn" type="button" data-retry="${node.id}">重试</button>
        <button class="node-stop-btn" type="button" data-stop="${node.id}">停止</button>
    </div>`;
}
function bindCascadeButtons(wrap, nodeId){
    wrap.querySelectorAll(`[data-cascade="${nodeId}"]`).forEach(b => {
        b.onmousedown = e => e.stopPropagation();
        b.onclick = e => { e.stopPropagation(); runNodeCascade(nodeId); };
    });
    wrap.querySelectorAll(`[data-cascade-stop="${nodeId}"]`).forEach(b => {
        b.onmousedown = e => e.stopPropagation();
        b.onclick = e => { e.stopPropagation(); requestCascadeStop(nodeId); };
    });
    wrap.querySelectorAll(`[data-retry="${nodeId}"]`).forEach(b => {
        b.onmousedown = e => e.stopPropagation();
        b.onclick = e => { e.stopPropagation(); retryNodeAndDownstream(nodeId); };
    });
    wrap.querySelectorAll(`[data-stop="${nodeId}"]`).forEach(b => {
        b.onmousedown = e => e.stopPropagation();
        b.onclick = e => { e.stopPropagation(); cancelCascade(nodeId); };
    });
}
// —— 一键运行：从目标节点反向追溯到所有上游生成节点，按拓扑顺序串行执行 ——
function runCascadeNodeByType(node, opts={}){
    const runOpts = {cascade:true, ...opts};
    if(node.type === 'generator') return runGenerator(node.id, runOpts);
    if(node.type === 'msgen') return runMsGenNode(node.id, runOpts);
    if(node.type === 'comfy') return runComfyNode(node.id, runOpts);
    if(node.type === 'llm') return runLLMNode(node.id, runOpts);
    if(node.type === 'video') return runVideoNode(node.id, runOpts);
    if(node.type === 'rh') return runRhNode(node.id, runOpts);
    return Promise.resolve();
}
function runCascadeNodeWithLoopContext(node, ctx, opts={}){
    const previous = loopContext;
    loopContext = ctx || null;
    const promise = runCascadeNodeByType(node, opts);
    loopContext = previous;
    return promise;
}
function cascadeParallelLimit(order, totalRounds){
    const hasComfy = order.some(id => nodes.find(n => n.id === id)?.type === 'comfy');
    if(hasComfy) return Math.max(1, Math.min(totalRounds, comfyBackendCount || 1));
    return Math.max(1, Math.min(totalRounds, 6));
}
async function runLimitedCascadeRounds(rounds, limit, runner){
    let next = 0;
    const workers = Array.from({length:Math.max(1, Math.min(limit, rounds.length))}, async () => {
        while(next < rounds.length){
            const round = rounds[next++];
            await runner(round);
        }
    });
    return Promise.allSettled(workers);
}
function canvasRunTypes(){
    return ['generator','msgen','comfy','llm','video','rh'];
}
function canvasWorkflowEdges(){
    const runTypes = canvasRunTypes();
    const direct = [];
    connections.forEach(c => {
        const from = nodes.find(n => n.id === c.from);
        const to = nodes.find(n => n.id === c.to);
        if(!from || !to || !runTypes.includes(from.type)) return;
        if(runTypes.includes(to.type)){
            direct.push([from.id, to.id]);
            return;
        }
        if(to.type === 'output'){
            connections.filter(cc => cc.from === to.id).forEach(cc => {
                const next = nodes.find(n => n.id === cc.to);
                if(next && runTypes.includes(next.type)) direct.push([from.id, next.id]);
            });
        }
    });
    return direct;
}
function computeConnectedWorkflowOrder(anchorId){
    const anchor = nodes.find(n => n.id === anchorId);
    const runTypes = canvasRunTypes();
    if(!anchor || !runTypes.includes(anchor.type)) return [];
    const edges = canvasWorkflowEdges();
    const connected = new Set([anchorId]);
    let changed = true;
    while(changed){
        changed = false;
        edges.forEach(([from, to]) => {
            if(connected.has(from) && !connected.has(to)){ connected.add(to); changed = true; }
            if(connected.has(to) && !connected.has(from)){ connected.add(from); changed = true; }
        });
    }
    const order = [];
    const seen = new Set();
    const visit = id => {
        if(seen.has(id)) return;
        seen.add(id);
        edges.filter(([, to]) => to === id).forEach(([from]) => {
            if(connected.has(from)) visit(from);
        });
        if(connected.has(id)) order.push(id);
    };
    nodes.filter(n => connected.has(n.id) && runTypes.includes(n.type)).forEach(n => visit(n.id));
    return order;
}
async function runCanvasGenerate(nodeId){
    const node = nodes.find(n => n.id === nodeId);
    if(!node || node.running || cascadeRunningIds.has(nodeId)) return;
    const order = computeConnectedWorkflowOrder(nodeId);
    if(order.length > 1){
        cascadeRunningIds.add(nodeId);
        refreshNodes(order);
        try {
            await runOneCascadePass(order);
        } finally {
            cascadeRunningIds.delete(nodeId);
            refreshNodes(order);
        }
        return;
    }
    return runCascadeNodeByType(node, {cascade:false});
}
function computeCascadeOrder(targetId){
    const visited = new Set();
    const order = [];
    const GEN_TYPES = canvasRunTypes();
    function dfs(id){
        if(visited.has(id)) return;
        visited.add(id);
        const node = nodes.find(n => n.id === id);
        if(!node) return;
        // 找该节点的上游
        connections.filter(c => c.to === id).forEach(c => {
            const from = nodes.find(n => n.id === c.from);
            if(!from) return;
            if(GEN_TYPES.includes(from.type)){
                dfs(from.id);
            } else if(from.type === 'output'){
                // output 节点的上游是生成器
                connections.filter(cc => cc.to === from.id).forEach(cc => {
                    const ff = nodes.find(n => n.id === cc.from);
                    if(ff && GEN_TYPES.includes(ff.type)) dfs(ff.id);
                });
            }
        });
        if(GEN_TYPES.includes(node.type)) order.push(id);
    }
    dfs(targetId);
    return order;
}
function upstreamNodeIds(targetId){
    const found = new Set();
    const walk = id => {
        connections.filter(c => c.to === id).forEach(c => {
            if(found.has(c.from)) return;
            found.add(c.from);
            walk(c.from);
        });
    };
    walk(targetId);
    return found;
}
function resolveCascadeLoop(targetId){
    const upstream = upstreamNodeIds(targetId);
    const loops = nodes.filter(n => n.type === 'loop' && upstream.has(n.id));
    if(!loops.length) return null;
    const loop = loops[loops.length - 1];
    return {node:loop, count:loopCount(loop), mode:loop.mode === 'parallel' ? 'parallel' : 'serial'};
}
function cascadeUiNodeIds(targetId, order=null){
    const ids = new Set([targetId, ...(order || computeCascadeOrder(targetId))]);
    const loop = resolveCascadeLoop(targetId);
    if(loop?.node?.id) ids.add(loop.node.id);
    return [...ids].filter(Boolean);
}
function requestCascadeStop(targetId){
    if(!targetId) return;
    cascadeStopIds.add(targetId);
    refreshNodes(cascadeUiNodeIds(targetId));
}
async function runNodeCascade(nodeId){
    const target = nodes.find(n => n.id === nodeId);
    if(!target) return;
    if(target.running){ alert('当前节点正在运行'); return; }
    cascadeRunningIds.add(nodeId);
    const order = computeCascadeOrder(nodeId);
    refreshNodes(cascadeUiNodeIds(nodeId, order));
    if(!order.length){ alert('没有可运行的生成节点'); return; }
    const loop = resolveCascadeLoop(nodeId);
    const totalRounds = loop?.count || 1;
    const startIdx = Math.max(1, Number(loop?.node?.loopStart) || 1);
    const loopBatchSize = loop?.node?.imageInput ? Math.max(1, Math.min(100, Number(loop?.node?.imageBatchSize) || 1)) : 1;
    const endIdx = startIdx + (totalRounds - 1) * loopBatchSize;
    order.forEach(id => {
        const n = nodes.find(x => x.id === id);
        if(n) n.generatedOutputs = [];
    });
    if(loop?.mode === 'parallel' && totalRounds > 1){
        cascadeSerialIds.add(nodeId);
        order.forEach(id => {
            const n = nodes.find(x => x.id === id);
            if(n){ n.runStatus = 'queued'; n.runError = ''; n._cascadeFailed = false; n._cascadeIdx = `0/${totalRounds}`; }
        });
        refreshNodes(cascadeUiNodeIds(nodeId, order));
        let done = 0;
        const rounds = Array.from({length:totalRounds}, (_, idx) => ({idx, index:startIdx + idx * loopBatchSize}));
        const limit = cascadeParallelLimit(order, totalRounds);
        const results = await runLimitedCascadeRounds(rounds, limit, async ({index}) => {
            if(cascadeStopIds.has(nodeId)) return;
            const ctx = {index, total:endIdx, nodeId:loop.node.id};
            for(let i = 0; i < order.length; i++){
                if(cascadeStopIds.has(nodeId)) return;
                const id = order[i];
                const node = nodes.find(n => n.id === id);
                if(!node) continue;
                node.runStatus = 'running';
                node._cascadeIdx = `${order.indexOf(id)+1}/${order.length} · ${index}/${endIdx}`;
                refreshNodes([id]);
                await runCascadeNodeWithLoopContext(node, ctx);
                node.runStatus = 'done';
                refreshNodes([id]);
            }
            done += 1;
            order.forEach(id => {
                const n = nodes.find(x => x.id === id);
                if(n) n._cascadeIdx = `${done}/${totalRounds}`;
            });
            refreshNodes(order);
        });
        loopContext = null;
        cascadeRunningIds.delete(nodeId);
        cascadeStopIds.delete(nodeId);
        cascadeSerialIds.delete(nodeId);
        refreshNodes(cascadeUiNodeIds(nodeId, order));
        const failed = results.find(r => r.status === 'rejected');
        if(failed){
            const err = failed.reason || new Error('parallel loop failed');
            const node = nodes.find(n => n.id === nodeId) || target;
            node.runStatus = 'failed';
            node.runError = err.message || String(err);
            node._cascadeFailed = true;
            refreshNodes(cascadeUiNodeIds(nodeId, order));
            return;
        }
        setTimeout(() => {
            order.forEach(id => {
                const n = nodes.find(x => x.id === id);
                if(n && n.runStatus === 'done'){ n.runStatus = ''; n._cascadeIdx = ''; }
            });
            refreshNodes(cascadeUiNodeIds(nodeId, order));
        }, 3000);
        return;
    }
    cascadeSerialIds.add(nodeId);
    refreshNodes(cascadeUiNodeIds(nodeId, order));
    for(let round = 1; round <= totalRounds; round++){
        if(cascadeStopIds.has(nodeId)){
            cascadeStopIds.delete(nodeId);
            cascadeRunningIds.delete(nodeId);
            cascadeSerialIds.delete(nodeId);
            loopContext = null;
            order.forEach(id => { const n = nodes.find(x=>x.id===id); if(n){ n.runStatus=''; n._cascadeIdx=''; } });
            refreshNodes(cascadeUiNodeIds(nodeId, order));
            return;
        }
        const loopIndex = startIdx + (round - 1) * loopBatchSize;
        loopContext = loop ? {index:loopIndex, total:endIdx, nodeId:loop.node.id} : null;
        order.forEach(id => {
            const n = nodes.find(x => x.id === id);
            if(n){ n.runStatus = 'queued'; n.runError = ''; n._cascadeFailed = false; n._cascadeIdx = `${order.indexOf(id)+1}/${order.length}${totalRounds > 1 ? ` · ${loopIndex}/${endIdx}` : ''}`; }
        });
        refreshNodes(cascadeUiNodeIds(nodeId, order));
        for(let i = 0; i < order.length; i++){
            const id = order[i];
            const node = nodes.find(n => n.id === id);
            if(!node) continue;
            node.runStatus = 'running';
            refreshNodes([id]);
            try {
                await runCascadeNodeWithLoopContext(node, loopContext);
                node.runStatus = 'done';
                refreshNodes([id]);
            } catch(err){
                loopContext = null;
                cascadeRunningIds.delete(nodeId);
                cascadeStopIds.delete(nodeId);
                cascadeSerialIds.delete(nodeId);
                node.runStatus = 'failed';
                node.runError = `${totalRounds > 1 ? `${tr('canvas.loopRound')} ${round}/${totalRounds}: ` : ''}${err.message || String(err)}`;
                node._cascadeFailed = true;
                for(let j = i + 1; j < order.length; j++){
                    const n2 = nodes.find(x => x.id === order[j]);
                    if(n2){ n2.runStatus = ''; n2._cascadeIdx = ''; }
                }
                refreshNodes(cascadeUiNodeIds(nodeId, order.slice(i)));
                return;
            }
        }
    }
    loopContext = null;
    cascadeRunningIds.delete(nodeId);
    cascadeStopIds.delete(nodeId);
    cascadeSerialIds.delete(nodeId);
    refreshNodes(cascadeUiNodeIds(nodeId, order));
    // 全部完成：3 秒后清除状态徽章
    setTimeout(() => {
        order.forEach(id => {
            const n = nodes.find(x => x.id === id);
            if(n && n.runStatus === 'done'){ n.runStatus = ''; n._cascadeIdx = ''; }
        });
        refreshNodes(cascadeUiNodeIds(nodeId, order));
    }, 3000);
}
async function runOneCascadePass(order, options={}){
    order.forEach(id => {
        const n = nodes.find(x => x.id === id);
        if(n){ n.runStatus = 'queued'; n.runError = ''; n._cascadeFailed = false; n._cascadeIdx = ''; }
    });
    refreshNodes(order);
    for(let i = 0; i < order.length; i++){
        const id = order[i];
        const node = nodes.find(n => n.id === id);
        if(!node) continue;
        node.runStatus = 'running';
        refreshNodes([id]);
        try {
            if(node.type === 'generator') await runGenerator(id, {cascade:true});
            else if(node.type === 'msgen') await runMsGenNode(id, {cascade:true});
            else if(node.type === 'comfy') await runComfyNode(id, {cascade:true});
            else if(node.type === 'llm') await runLLMNode(id, {cascade:true});
            else if(node.type === 'video') await runVideoNode(id, {cascade:true});
            else if(node.type === 'rh') await runRhNode(id, {cascade:true});
            node.runStatus = 'done';
            refreshNodes([id]);
        } catch(err) {
            node.runStatus = 'failed';
            node.runError = err.message || String(err);
            node._cascadeFailed = true;
            throw err;
        }
    }
}
// 失败重试：从该节点继续往下游跑
async function retryNodeAndDownstream(nodeId){
    const target = nodes.find(n => n.id === nodeId);
    if(!target) return;
    const order = computeCascadeOrder(nodeId);
    // 只重跑从该节点开始的剩余链
    const idx = order.indexOf(nodeId);
    const remain = idx >= 0 ? order.slice(idx) : [nodeId];
    try { await runOneCascadePass(remain); }
    catch(err) { refreshNodes(remain); return; }
    setTimeout(() => {
        remain.forEach(id => {
            const n = nodes.find(x => x.id === id);
            if(n && n.runStatus === 'done'){ n.runStatus = ''; n._cascadeIdx = ''; }
        });
        refreshNodes(remain);
    }, 3000);
}
function cancelCascade(nodeId){
    // 简单实现：把当前节点和上游 queued/failed 状态清掉（不能 abort 已发出的请求）
    const order = computeCascadeOrder(nodeId);
    order.forEach(id => {
        const n = nodes.find(x => x.id === id);
        if(n && (n.runStatus === 'queued' || n.runStatus === 'failed')){
            n.runStatus = ''; n._cascadeIdx = ''; n.runError = ''; n._cascadeFailed = false;
        }
    });
    refreshNodes(order);
}

async function runLLMChat(nodeId){
    const node = nodes.find(n => n.id === nodeId);
    if(!node || node.running) return;
    const message = (node.chatInput || '').trim();
    if(!message) return;
    node.messages = node.messages || [];
    const history = node.messages.slice();
    node.messages.push({role:'user', content:message});
    node.chatInput = '';
    node.running = true;
    refreshNodes([node.id]);
    try {
        const text = await callCanvasLLM(node, message, history);
        node.messages.push({role:'assistant', content:text});
        node.outputText = text;
        node.running = false;
        refreshNodes([node.id]);
        scheduleSave();
    } catch(err) {
        node.running = false;
        refreshNodes([node.id]);
        alert(err.message || 'LLM 运行失败');
    }
}

function deleteNode(id, event){
    event?.stopPropagation();
    pushUndo();
    nodes = nodes.filter(n => n.id !== id);
    connections = connections.filter(c => c.from !== id && c.to !== id);
    selected.delete(id);
    render();
    scheduleSave();
}
function clearNodeContentBeforeDelete(id){
    const node = nodes.find(n => n.id === id);
    if(!node) return false;
    if(node.type === 'image' && node.url){
        pushUndo();
        node.url = '';
        node.mediaKind = 'image';
        node.name = '上传卡片';
        render();
        scheduleSave();
        return true;
    }
    if(node.type === 'output' && ((node.images || []).length || (node._pending || []).length)){
        pushUndo();
        node.images = [];
        node._pending = [];
        node.imageComparisons = {};
        refreshNodes([node.id]);
        scheduleSave();
        return true;
    }
    return false;
}
function deleteNodeFromButton(id, event){
    event?.preventDefault();
    event?.stopPropagation();
    if(clearNodeContentBeforeDelete(id)) return;
    deleteNode(id, event);
}
function deleteConnection(id, event){
    event?.preventDefault();
    event?.stopPropagation();
    pushUndo();
    connections = connections.filter(c => c.id !== id);
    if(hoveredConnectionId === id) hoveredConnectionId = '';
    syncGeneratorInputs();
    render();
    scheduleSave();
}
function outputDownloadName(url){
    const clean = (url || '').split('?')[0];
    const ext = clean.includes('.') ? clean.split('.').pop() : 'png';
    return `canvas-output-${Date.now()}.${ext || 'png'}`;
}
function isVideoUrl(url){
    const clean = (url || '').split('?')[0].toLowerCase();
    return /\.(mp4|webm|mov|m4v)$/.test(clean);
}
function formatRunDuration(ms){
    const total = Math.max(0, Math.round(Number(ms || 0) / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}
function nowMs(){ return Date.now(); }
function outputUrlValue(item){
    return typeof item === 'string' ? item : item?.url || '';
}
function isMissingAssetUrl(url){
    return Boolean(url && missingAssetUrls.has(url));
}
function missingAssetHtml(url, compact=false){
    return `<div class="missing-asset ${compact ? 'compact' : ''}" title="${escapeAttr(url || '')}"><i data-lucide="image-off" class="${compact ? 'w-4 h-4' : 'w-6 h-6'}"></i><span>${langIsEn() ? 'Missing file' : '文件缺失'}</span></div>`;
}
function outputMetaFor(url, out){
    const item = (out?.images || []).find(x => outputUrlValue(x) === url);
    return item && typeof item === 'object' ? item : {};
}
function runSnapshot(node, prompt, refs=[]){
    const clone = JSON.parse(JSON.stringify(node || {}));
    delete clone.running;
    delete clone.runStatus;
    delete clone.runError;
    delete clone.inputs;
    return {
        nodeType: node?.type || '',
        node: clone,
        prompt: prompt || '',
        refs: (refs || []).map(ref => ({url:ref.url, name:ref.name || 'image'})).filter(ref => ref.url),
    };
}
function comfyRunLabel(node){
    const mode = node?.mode || 'text';
    if(mode === 'text') return tr('canvas.comfyText');
    if(mode === 'enhance') return tr('canvas.comfyEnhance');
    if(mode === 'edit') return tr('canvas.comfyEdit');
    if(mode === 'custom') return node?.comfyWorkflow || tr('canvas.comfyCustom');
    return 'ComfyUI';
}
function runTaskLabel(run){
    const node = run?.node || {};
    if(run?.taskLabel) return run.taskLabel;
    if(run?.nodeType === 'comfy') return comfyRunLabel(node);
    if(run?.nodeType === 'generator') return node.model || 'API Image';
    if(run?.nodeType === 'video') return node.model || 'Video';
    if(run?.nodeType === 'msgen') return node.msCustomModel || node.msgenModel || 'ModelScope';
    return run?.nodeType || 'Generate';
}
function requestMetaFromResult(result={}){
    return {
        task_id: result.task_id || result.raw?.task_id || result.raw?.data?.task_id || (Array.isArray(result.raw?.data) ? result.raw.data[0]?.task_id : '') || '',
        request_id: result.request_id || result.id || result.raw?.id || '',
        provider_id: result.provider_id || result.params?.provider_id || '',
        backend: result.backend || '',
        prompt_id: result.prompt_id || '',
        workflow_json: result.workflow_json || '',
        seed: result.seed || '',
    };
}
function runPlatformLabel(run){
    const node = run?.node || {};
    if(run?.nodeType === 'generator') return providerById(node.apiProvider || 'comfly')?.name || node.apiProvider || 'API';
    if(run?.nodeType === 'msgen') return 'ModelScope';
    if(run?.nodeType === 'video') return providerById(node.apiProvider || 'comfly')?.name || node.apiProvider || 'Video';
    if(run?.nodeType === 'comfy') return 'ComfyUI';
    return run?.nodeType || 'Generate';
}
function comfyLabelFromWorkflow(workflow){
    const name = String(workflow || '').toLowerCase();
    if(!name) return '';
    if(name === 'z-image.json') return tr('canvas.comfyText');
    if(name === 'z-image-enhance.json' || name === 'upscale.json') return tr('canvas.comfyEnhance');
    if(name === 'flux2-klein.json') return tr('canvas.comfyEdit');
    return workflow;
}
function logTaskLabel(log){
    const req = log?.request || {};
    if(log?.platform === 'ComfyUI'){
        const byWorkflow = comfyLabelFromWorkflow(req.workflow_json || req.workflow);
        if(byWorkflow) return byWorkflow;
    }
    return log?.model || '-';
}
function addGenerationLog({run, outputs=[], runMs=0, error=''}) {
    if(!canvas) return;
    canvas.logs = canvas.logs || [];
    const entry = {
        id:uid('log'),
        createdAt:Date.now(),
        status:error ? 'failed' : 'success',
        platform:runPlatformLabel(run),
        nodeType:run?.nodeType || '',
        model:run?.taskLabel || runTaskLabel(run),
        request:run?.request || {},
        prompt:run?.prompt || '',
        outputs:(outputs || []).filter(Boolean),
        refs:run?.refs || [],
        runMs:Number(runMs || 0),
        error:error ? String(error) : '',
    };
    canvas.logs = [entry, ...canvas.logs].slice(0, 500);
}
function renderCanvasLog(){
    const logs = canvas?.logs || [];
    logList.innerHTML = logs.length ? logs.map(log => {
        const thumbs = (log.outputs || []).slice(0, 8).map(url => {
            const safe = escapeAttr(url);
            if(isMissingAssetUrl(url)) return `<div class="missing-asset compact" data-url="${safe}"><i data-lucide="image-off" class="w-4 h-4"></i></div>`;
            return isVideoUrl(url) ? `<video src="${safe}" data-url="${safe}" muted playsinline disablepictureinpicture controlslist="nodownload noplaybackrate noremoteplayback"></video>` : `<img src="${safe}" data-url="${safe}" alt="output">`;
        }).join('');
        const date = new Date(log.createdAt || Date.now()).toLocaleString(window.StudioI18n?.lang() === 'en' ? 'en-US' : 'zh-CN');
        const req = log.request || {};
        const taskId = req.task_id || req.taskId || req.prompt_id || req.promptId || '';
        const requestId = req.request_id || req.requestId || req.id || '';
        const backend = req.backend || req.provider_id || req.providerId || '';
        const workflow = req.workflow_json || req.workflow || '';
        const taskLabel = logTaskLabel(log);
        const idText = taskId || requestId || '';
        const backendText = workflow || backend || '';
        const subParts = [
            date,
            `${langIsEn() ? 'outputs' : '输出'} ${(log.outputs || []).length}`,
            idText ? `ID ${idText}` : '',
            backendText,
        ].filter(Boolean);
        return `<div class="log-item ${log.status === 'failed' ? 'failed' : ''}">
            <div class="log-main">
                <div class="log-meta">
                    <span class="log-chip ${log.status === 'failed' ? 'status-failed' : 'status-ok'}">${escapeHtml(log.status === 'failed' ? tr('canvas.failed') : tr('canvas.success'))}</span>
                    <span class="log-chip">${escapeHtml(log.platform || '-')}</span>
                    ${taskLabel ? `<span class="log-chip">${escapeHtml(taskLabel)}</span>` : ''}
                    <span class="log-chip">${escapeHtml(formatRunDuration(log.runMs || 0))}</span>
                </div>
                <div class="log-subline">${subParts.map(part => `<span title="${escapeAttr(part)}">${escapeHtml(part)}</span>`).join('')}</div>
                ${log.error ? `<div class="log-error" title="${escapeAttr(log.error)}">${escapeHtml(log.error)}</div>` : ''}
                <div class="log-prompt" title="${escapeAttr(log.prompt || tr('canvas.noPromptMeta'))}" data-prompt="${escapeAttr(log.prompt || '')}">${escapeHtml(log.prompt || tr('canvas.noPromptMeta'))}</div>
            </div>
            <div class="log-thumbs">${thumbs}</div>
        </div>`;
    }).join('') : `<div class="log-empty">${tr('canvas.noLogs')}</div>`;
    logList.querySelectorAll('[data-url]').forEach(el => {
        el.onclick = e => {
            e.stopPropagation();
            openOutputLightbox(el.dataset.url, null);
        };
    });
    logList.querySelectorAll('[data-prompt]').forEach(el => {
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
function openCanvasLog(){
    if(!ensureCanvas()) return;
    renderCanvasLog();
    logModal.classList.add('open');
}
function closeCanvasLog(){
    logModal.classList.remove('open');
}
function makePending(id, run, task={}){
    return {id, startedAt:nowMs(), run, ...task};
}
function mergeGeneratedOutputs(node, outputs, append=false){
    if(!node) return;
    const clean = (outputs || []).filter(url => url && (node.type === 'rh' || !isVideoUrl(url)));
    if(!append){
        node.generatedOutputs = clean;
        return;
    }
    const seen = new Set(node.generatedOutputs || []);
    node.generatedOutputs = [...(node.generatedOutputs || []), ...clean.filter(url => !seen.has(url) && seen.add(url))];
}
function pendingById(out, id){
    return (out?._pending || []).find(p => p.id === id) || null;
}
function collectRunMetas(out, ids){
    return (ids || []).map(id => pendingById(out, id)).filter(Boolean).map(p => ({
        runMs: nowMs() - Number(p.startedAt || nowMs()),
        run: p.run || {},
    }));
}
function collectRunMeta(out, id){
    return collectRunMetas(out, [id])[0] || {runMs:0, run:{}};
}
function findOutputByPendingId(pendingId){
    return nodes.find(n => n.type === 'output' && (n._pending || []).some(p => p.id === pendingId));
}
function findPendingTask(taskId){
    for(const out of nodes.filter(n => n.type === 'output')){
        const pending = (out._pending || []).find(p => p.canvasTaskId === taskId);
        if(pending) return {out, pending};
    }
    return null;
}
async function createCanvasImageTask(payload){
    const res = await fetch('/api/canvas-image-tasks', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payload)
    });
    if(!res.ok) throw new Error(await responseErrorMessage(res, tr('canvas.generationFailed')));
    return res.json();
}
function sleep(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }
async function pollCanvasImageTask(taskId){
    if(!taskId) return 'failed';
    if(activeCanvasTaskPolls.has(taskId)) return 'running';
    activeCanvasTaskPolls.add(taskId);
    try {
        while(true){
            const found = findPendingTask(taskId);
            if(!found) return 'missing';
            const res = await fetch(`/api/canvas-image-tasks/${encodeURIComponent(taskId)}`);
            if(!res.ok) throw new Error(await responseErrorMessage(res, tr('canvas.generationFailed')));
            const data = await res.json();
            if(data.status === 'succeeded'){
                completeCanvasImageTask(taskId, data.result || {});
                return 'succeeded';
            }
            if(data.status === 'failed'){
                failCanvasImageTask(taskId, data.error || tr('canvas.generationFailed'));
                return 'failed';
            }
            await sleep(1800);
        }
    } catch(err) {
        failCanvasImageTask(taskId, err.message || String(err));
        return 'failed';
    } finally {
        activeCanvasTaskPolls.delete(taskId);
    }
}
function completeCanvasImageTask(taskId, result){
    const found = findPendingTask(taskId);
    if(!found) return;
    const {out, pending} = found;
    const meta = {
        runMs: nowMs() - Number(pending.startedAt || nowMs()),
        run: pending.run || {},
    };
    meta.run.request = requestMetaFromResult(result);
    const images = result.images || [];
    out._pending = (out._pending || []).filter(p => p.id !== pending.id);
    appendOutputImages(out, images, meta.run?.refs?.[0], [meta]);
    const gen = nodes.find(n => n.id === meta.run?.node?.id);
    if(gen){
        mergeGeneratedOutputs(gen, images, Boolean(pending.appendGenerated));
        gen.runStatus = 'done';
        gen.runError = '';
        gen.running = false;
    }
    addGenerationLog({run:meta.run, outputs:images, runMs:meta.runMs || 0});
    refreshRunNodes(gen, out);
    scheduleSave();
}
function failCanvasImageTask(taskId, message){
    const found = findPendingTask(taskId);
    if(!found) return;
    const {out, pending} = found;
    const run = pending.run || {};
    const runMs = nowMs() - Number(pending.startedAt || nowMs());
    out._pending = (out._pending || []).filter(p => p.id !== pending.id);
    const gen = nodes.find(n => n.id === run?.node?.id);
    if(gen){
        gen.runStatus = 'failed';
        gen.runError = message || tr('canvas.generationFailed');
        gen.running = false;
    }
    addGenerationLog({run, outputs:[], runMs, error:message || tr('canvas.generationFailed')});
    refreshRunNodes(gen, out);
    scheduleSave();
}
function resumeCanvasImageTasks(){
    nodes.filter(n => n.type === 'output').forEach(out => {
        (out._pending || []).forEach(p => {
            if(p.canvasTaskType === 'online-image' && p.canvasTaskId) pollCanvasImageTask(p.canvasTaskId);
        });
    });
}
function renderOutputMedia(item, useGridLayout=false){
    const url = outputUrlValue(item);
    const safe = escapeAttr(url);
    const meta = item && typeof item === 'object' ? item : {};
    const grid = useGridLayout ? (meta.grid || null) : null;
    const gridStyle = grid ? ` style="grid-row:${Number(grid.row || 0) + 1};grid-column:${Number(grid.col || 0) + 1};aspect-ratio:${Math.max(1, Number(grid.w || 1))}/${Math.max(1, Number(grid.h || 1))}"` : '';
    const timePill = meta.runMs && !meta.viewed ? `<span class="output-time-pill">${formatRunDuration(meta.runMs)}</span>` : '';
    if(isMissingAssetUrl(url)){
        return `<div class="output-img-wrap" data-output-url="${safe}" data-missing-url="${safe}"${gridStyle}>${missingAssetHtml(url, true)}${timePill}<button class="output-del" title="${tr('common.delete')}">×</button></div>`;
    }
    if(isVideoUrl(url)){
        return `<div class="output-img-wrap" data-output-url="${safe}"${gridStyle}><video src="${safe}" data-url="${safe}" preload="metadata" muted playsinline disablepictureinpicture controlslist="nodownload noplaybackrate noremoteplayback"></video>${timePill}<div class="output-video-badge"><i data-lucide="play" class="w-3 h-3"></i>VIDEO</div><button class="output-del" title="${tr('common.delete')}">×</button></div>`;
    }
    if(isAudioUrl(url)){
        return `<div class="output-img-wrap output-audio-wrap" data-output-url="${safe}"${gridStyle}><div class="output-audio-card"><i data-lucide="file-audio" class="w-7 h-7"></i><span>${escapeHtml(outputImageName(url))}</span><audio src="${safe}" data-url="${safe}" controls preload="metadata"></audio></div>${timePill}<button class="output-del" title="${tr('common.delete')}">×</button></div>`;
    }
    return `<div class="output-img-wrap" data-output-url="${safe}"${gridStyle}><img src="${safe}" data-url="${safe}" alt="generated output">${timePill}<button class="output-del" title="${tr('common.delete')}">×</button></div>`;
}
function outputGridLayout(node){
    const images = node?.images || [];
    if(!images.length || node?._pending?.length) return null;
    const layout = node.outputLayout;
    if(!layout || layout.type !== 'grid-split' || !layout.groupId) return null;
    const allMatch = images.every(item => item && typeof item === 'object' && item.grid?.groupId === layout.groupId);
    return allMatch ? layout : null;
}
function renderOutputGrid(node, pendingHtml=''){
    const layout = outputGridLayout(node);
    const gridClass = layout ? 'output-grid grid-layout' : 'output-grid';
    const style = layout ? ` style="--grid-cols:${Math.max(1, Number(layout.cols || 1))}"` : '';
    return `<div class="${gridClass}"${style}>${(node.images || []).map(item => renderOutputMedia(item, !!layout)).join('')}${pendingHtml}</div>`;
}
function outputImageName(url){
    const clean = (url || '').split('?')[0];
    const name = clean.split('/').filter(Boolean).pop();
    return name ? decodeURIComponent(name) : 'output image';
}
function setOutputDragPreview(event, img){
    if(!event.dataTransfer || !img) return;
    const wrap = document.createElement('div');
    wrap.className = 'output-drag-preview';
    const clone = img.cloneNode();
    clone.removeAttribute('id');
    wrap.appendChild(clone);
    document.body.appendChild(wrap);
    const rect = img.getBoundingClientRect();
    event.dataTransfer.setDragImage(wrap, Math.min(rect.width / 2, 120), Math.min(rect.height / 2, 120));
    setTimeout(() => wrap.remove(), 0);
}
function appendOutputImages(out, images, compareRef, metas=[], layout=null){
    const list = (images || []).filter(Boolean);
    if(!out || !list.length) return;
    if(layout?.type === 'grid-split'){
        out.images = [];
        out.outputLayout = layout;
    } else if(out.outputLayout) {
        delete out.outputLayout;
    }
    out.images = [...(out.images || []), ...list.map((url, i) => {
        const meta = metas[i] || metas[0] || {};
        const item = {url, viewed:false, runMs:meta.runMs || 0, run:meta.run || null};
        if(meta.grid) item.grid = meta.grid;
        return item;
    })];
    if(compareRef?.url){
        out.imageComparisons = out.imageComparisons || {};
        list.forEach(url => {
            out.imageComparisons[url] = {url:compareRef.url, name:compareRef.name || 'input image'};
        });
    }
}
function outputCompareUrlFor(url, out){
    const source = out?.imageComparisons?.[url];
    if(typeof source === 'string' && source) return source;
    if(source?.url) return source.url;
    const meta = outputMetaFor(url, out);
    return meta?.run?.refs?.find(ref => ref?.url)?.url || '';
}
function markOutputViewed(out, url){
    if(!out || !url || !(out.images || []).length) return;
    let changed = false;
    out.images = out.images.map(item => {
        if(typeof item === 'string') return item;
        if(item?.url === url && !item.viewed){
            changed = true;
            return {...item, viewed:true};
        }
        return item;
    });
    if(changed){
        render();
        scheduleSave();
    }
}
function outputLightboxItems(out=null){
    const normalize = (item, sourceOut=null) => {
        const url = outputUrlValue(item);
        if(!url || isVideoUrl(url) || isAudioUrl(url)) return null;
        return {url, outId:sourceOut?.id || ''};
    };
    const sourceOut = out?.id ? nodes.find(n => n.id === out.id) || out : null;
    if(sourceOut){
        return (sourceOut.images || []).map(item => normalize(item, sourceOut)).filter(Boolean);
    }
    const outputNodeItems = nodes
        .filter(n => n.type === 'output')
        .flatMap(n => (n.images || []).map(item => normalize(item, n)).filter(Boolean));
    if(outputNodeItems.length) return outputNodeItems;
    return (canvas?.logs || [])
        .flatMap(log => (log.outputs || []).map(url => normalize(url, null)).filter(Boolean));
}
function navigateOutputLightbox(direction){
    if(!outputLightbox.classList.contains('open') || !currentOutputLightboxUrl) return false;
    const out = currentOutputLightboxOutId ? nodes.find(n => n.id === currentOutputLightboxOutId) : null;
    const items = outputLightboxItems(out);
    if(items.length < 2) return false;
    let idx = items.findIndex(item => item.url === currentOutputLightboxUrl);
    if(idx < 0) idx = 0;
    const next = items[(idx + direction + items.length) % items.length];
    const nextOut = next.outId ? nodes.find(n => n.id === next.outId) : null;
    openOutputLightbox(next.url, nextOut);
    return true;
}
function createImageCardFromOutput(url, point){
    if(!ensureCanvas() || !url) return;
    if(isVideoUrl(url) || isAudioUrl(url)) return;
    const p = point || defaultPoint(0, 0);
    nodes.push({id:uid('img'), type:'image', x:p.x, y:p.y, url, name:outputImageName(url)});
    render();
    scheduleSave();
}
async function downloadUrl(url, filename){
    const res = await fetch(url);
    if(!res.ok) throw new Error('下载失败');
    const blob = await res.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
function setOutputCompareMode(active){
    outputPreview.classList.toggle('compare-mode', active);
    if(active){
        outputCompareOriginalWrap.style.clipPath = 'inset(0 50% 0 0)';
        outputCompareSlider.style.left = '50%';
    }
}
function outputResolutionText(text, meta=null){
    const parts = [text || '--'];
    if(meta?.runMs) parts.push(`<span>${formatRunDuration(meta.runMs)}</span>`);
    outputResolution.innerHTML = parts.join('<span style="opacity:.38">|</span>');
}
function setupOutputPromptPanel(meta){
    currentOutputMeta = meta || null;
    const prompt = meta?.run?.prompt || '';
    outputPromptPanel.classList.toggle('open', !!prompt || !!meta?.run);
    outputPromptText.textContent = prompt || tr('canvas.noPromptMeta');
    outputCopyPromptBtn.onclick = e => {
        e.stopPropagation();
        if(!prompt) return;
        copyTextToClipboard(prompt);
        const span = outputCopyPromptBtn.querySelector('span');
        const oldText = span?.textContent || tr('canvas.copyPrompt');
        outputCopyPromptBtn.classList.add('copied');
        if(span) span.textContent = tr('canvas.copied');
        clearTimeout(outputCopyPromptBtn._copyTimer);
        outputCopyPromptBtn._copyTimer = setTimeout(() => {
            outputCopyPromptBtn.classList.remove('copied');
            if(span) span.textContent = oldText;
        }, 1200);
    };
    outputRerunBtn.onclick = e => {
        e.stopPropagation();
        rerunFromOutputMeta(currentOutputMeta);
    };
}
function rerunFromOutputMeta(meta){
    if(!ensureCanvas() || !meta?.run?.nodeType) return;
    const base = JSON.parse(JSON.stringify(meta.run.node || {}));
    const p = defaultPoint(180, 40);
    const node = {...base, id:uid(base.type || meta.run.nodeType), type:meta.run.nodeType, x:p.x, y:p.y, inputs:[], running:false};
    nodes.push(node);
    const prompt = meta.run.prompt || '';
    if(prompt){
        const promptNode = {id:uid('pr'), type:'prompt', x:p.x - 340, y:p.y, text:prompt};
        nodes.push(promptNode);
        connections.push({id:uid('c'), from:promptNode.id, to:node.id});
    }
    (meta.run.refs || []).slice(0, 8).forEach((ref, i) => {
        const imgNode = {id:uid('img'), type:'image', x:p.x - 340, y:p.y + 110 + i * 86, url:ref.url, name:ref.name || 'image'};
        nodes.push(imgNode);
        connections.push({id:uid('c'), from:imgNode.id, to:node.id});
    });
    closeOutputLightbox();
    render();
    scheduleSave();
}
function updateOutputCompareSlider(clientX){
    const rect = outputCompareContainer.getBoundingClientRect();
    if(!rect.width) return;
    const percent = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    outputCompareOriginalWrap.style.clipPath = `inset(0 ${100 - percent}% 0 0)`;
    outputCompareSlider.style.left = `${percent}%`;
}
function applyOutputPreviewZoom(){
    const transform = `translate(${outputPreviewPan.x}px, ${outputPreviewPan.y}px) scale(${outputPreviewZoom})`;
    [outputLightboxImg, outputCompareResult, outputCompareOriginal].forEach(img => {
        img.style.transform = transform;
        img.style.transformOrigin = '0 0';
    });
    outputPreview.classList.toggle('zoomed', outputPreviewZoom > 1.001);
}
function resetOutputPreviewZoom(){
    outputPreviewZoom = 1;
    outputPreviewPan = {x: 0, y: 0};
    outputPreviewPanDrag = null;
    outputPreview.classList.remove('panning');
    applyOutputPreviewZoom();
}
function initOutputPreviewZoomEvents(){
    outputPreview.addEventListener('wheel', e => {
        if(outputLightboxVideo.style.display === 'block') return;
        e.preventDefault();
        e.stopPropagation();
        const rect = outputPreview.getBoundingClientRect();
        const localX = e.clientX - rect.left;
        const localY = e.clientY - rect.top;
        const before = {
            x:(localX - outputPreviewPan.x) / outputPreviewZoom,
            y:(localY - outputPreviewPan.y) / outputPreviewZoom
        };
        const factor = e.deltaY > 0 ? .9 : 1.1;
        const nextZoom = Math.max(1, Math.min(6, outputPreviewZoom * factor));
        outputPreviewZoom = nextZoom;
        outputPreviewPan = nextZoom <= 1.001 ? {x: 0, y: 0} : {
            x:localX - before.x * nextZoom,
            y:localY - before.y * nextZoom
        };
        applyOutputPreviewZoom();
    }, {passive:false});
    outputPreview.addEventListener('mousedown', e => {
        if(outputLightboxVideo.style.display === 'block') return;
        if(e.button !== 0 || outputPreviewZoom <= 1.001) return;
        if(e.target.closest('.output-preview-actions, .output-resolution, .output-compare-slider')) return;
        outputPreviewPanDrag = {
            sx:e.clientX,
            sy:e.clientY,
            ox:outputPreviewPan.x,
            oy:outputPreviewPan.y
        };
        outputPreview.classList.add('panning');
        e.preventDefault();
        e.stopPropagation();
    });
    window.addEventListener('mousemove', e => {
        if(!outputPreviewPanDrag) return;
        outputPreviewPan = {
            x:outputPreviewPanDrag.ox + e.clientX - outputPreviewPanDrag.sx,
            y:outputPreviewPanDrag.oy + e.clientY - outputPreviewPanDrag.sy
        };
        applyOutputPreviewZoom();
    });
    window.addEventListener('mouseup', () => {
        outputPreviewPanDrag = null;
        outputPreview.classList.remove('panning');
    });
}
function initOutputCompareEvents(){
    outputCompareContainer.addEventListener('mousedown', e => {
        outputCompareDrag = true;
        updateOutputCompareSlider(e.clientX);
        e.preventDefault();
        e.stopPropagation();
    });
    outputCompareSlider.addEventListener('mousedown', e => {
        outputCompareDrag = true;
        e.preventDefault();
        e.stopPropagation();
    });
    window.addEventListener('mousemove', e => {
        if(outputCompareDrag) updateOutputCompareSlider(e.clientX);
    });
    window.addEventListener('mouseup', () => { outputCompareDrag = false; });
    outputCompareContainer.addEventListener('touchstart', e => {
        outputCompareDrag = true;
        updateOutputCompareSlider(e.touches[0].clientX);
        e.preventDefault();
        e.stopPropagation();
    }, {passive:false});
    window.addEventListener('touchmove', e => {
        if(outputCompareDrag) {
            updateOutputCompareSlider(e.touches[0].clientX);
            e.preventDefault();
        }
    }, {passive:false});
    window.addEventListener('touchend', () => { outputCompareDrag = false; });
}
function openOutputLightbox(url, out){
    if(!url) return;
    resetOutputPreviewZoom();
    currentOutputLightboxOutId = out?.id || '';
    currentOutputLightboxUrl = url;
    const meta = outputMetaFor(url, out);
    markOutputViewed(out, url);
    setupOutputPromptPanel(meta);
    outputResolutionText('--', meta);
    currentOutputCompareUrl = outputCompareUrlFor(url, out);
    setOutputCompareMode(false);
    const videoMode = isVideoUrl(url);
    outputLightboxImg.style.display = videoMode ? 'none' : 'block';
    outputLightboxVideo.style.display = videoMode ? 'block' : 'none';
    outputCompareResult.style.display = videoMode ? 'none' : 'block';
    outputCompareOriginal.style.display = videoMode ? 'none' : 'block';
    if(videoMode){
        outputLightboxImg.src = '';
        outputCompareResult.src = '';
        outputCompareOriginal.src = '';
        outputLightboxVideo.onloadedmetadata = () => {
            outputResolutionText(outputLightboxVideo.videoWidth && outputLightboxVideo.videoHeight
                ? `${outputLightboxVideo.videoWidth} x ${outputLightboxVideo.videoHeight}`
                : 'Video', meta);
        };
        outputLightboxVideo.src = url;
        outputPreview.ondblclick = null;
        outputDownloadBtn.onclick = e => {
            e.stopPropagation();
            downloadUrl(url, outputDownloadName(url)).catch(err => alert(err.message || '下载失败'));
        };
        outputLightbox.classList.add('open');
        refreshIcons();
        return;
    }
    outputLightboxVideo.pause();
    outputLightboxVideo.src = '';
    outputLightboxImg.draggable = false;
    outputCompareResult.draggable = false;
    outputCompareOriginal.draggable = false;
    outputLightboxImg.onload = () => {
        outputResolutionText(`${outputLightboxImg.naturalWidth} x ${outputLightboxImg.naturalHeight}`, meta);
    };
    outputLightboxImg.src = url;
    outputCompareResult.src = url;
    outputCompareOriginal.src = currentOutputCompareUrl || '';
    outputPreview.ondblclick = e => {
        e.stopPropagation();
        if(!currentOutputCompareUrl) return;
        setOutputCompareMode(!outputPreview.classList.contains('compare-mode'));
    };
    outputDownloadBtn.onclick = e => {
        e.stopPropagation();
        downloadUrl(url, outputDownloadName(url)).catch(err => alert(err.message || '下载失败'));
    };
    outputLightbox.classList.add('open');
    refreshIcons();
}
function closeOutputLightbox(){
    outputLightbox.classList.remove('open');
    setOutputCompareMode(false);
    outputLightboxImg.src = '';
    outputLightboxVideo.pause();
    outputLightboxVideo.src = '';
    outputLightboxVideo.style.display = 'none';
    outputLightboxImg.style.display = 'block';
    outputCompareResult.style.display = 'block';
    outputCompareOriginal.style.display = 'block';
    outputCompareResult.src = '';
    outputCompareOriginal.src = '';
    outputPreview.ondblclick = null;
    resetOutputPreviewZoom();
    currentOutputCompareUrl = '';
    currentOutputMeta = null;
    currentOutputLightboxOutId = '';
    currentOutputLightboxUrl = '';
    setupOutputPromptPanel(null);
}
function groupSelectedImages(){
    if(!ensureCanvas()) return;
    const targets = [...selected].map(id => nodes.find(n => n.id === id)).filter(n => n?.type === 'image' || n?.type === 'prompt');
    let group;
    pushUndo();
    if(targets.length){
        const box = nodeBounds(targets.map(n => n.id));
        group = {id:uid('grp'), type:'group', x:box.x - 24, y:box.y - 58, w:box.w + 48, h:box.h + 90, items:targets.map(n => n.id)};
    } else {
        const p = defaultPoint(0, 0);
        group = {id:uid('grp'), type:'group', x:p.x, y:p.y, w:300, h:220, items:[]};
    }
    nodes.push(group);
    if(targets.length) handoffExistingInputsToGroup(group, targets);
    selected.clear();
    selected.add(group.id);
    syncGeneratorInputs();
    refreshGeneratorInputViews();
    render();
    scheduleSave();
}
function nodeBounds(ids){
    const rects = ids.map(id => {
        const n = nodes.find(item => item.id === id);
        const el = nodesEl.querySelector(`.node[data-id="${id}"]`);
        if(!n) return null;
        return {x:n.x, y:n.y, w:el?.offsetWidth || n.w || 260, h:el?.offsetHeight || n.h || 220};
    }).filter(Boolean);
    const x1 = Math.min(...rects.map(r => r.x));
    const y1 = Math.min(...rects.map(r => r.y));
    const x2 = Math.max(...rects.map(r => r.x + r.w));
    const y2 = Math.max(...rects.map(r => r.y + r.h));
    return {x:x1, y:y1, w:x2 - x1, h:y2 - y1};
}

function startSelection(e){
    e.preventDefault();
    e.stopPropagation();
    if(document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    selectDrag = {sx:e.clientX, sy:e.clientY, x:e.clientX, y:e.clientY};
    document.body.classList.add('canvas-selecting');
    selectionBox.style.display = 'block';
    updateSelectionBox(e.clientX, e.clientY);
    window.onmousemove = e2 => updateSelectionBox(e2.clientX, e2.clientY);
    window.onmouseup = finishSelection;
}
function updateSelectionBox(x, y){
    if(!selectDrag) return;
    selectDrag.x = x; selectDrag.y = y;
    const left = Math.min(selectDrag.sx, x);
    const top = Math.min(selectDrag.sy, y);
    selectionBox.style.left = `${left}px`;
    selectionBox.style.top = `${top}px`;
    selectionBox.style.width = `${Math.abs(x - selectDrag.sx)}px`;
    selectionBox.style.height = `${Math.abs(y - selectDrag.sy)}px`;
}
function finishSelection(){
    if(!selectDrag) return;
    const rect = selectionBox.getBoundingClientRect();
    selectionBox.style.display = 'none';
    selected.clear();
    nodesEl.querySelectorAll('.node').forEach(el => {
        const r = el.getBoundingClientRect();
        const overlaps = r.left < rect.right && r.right > rect.left && r.top < rect.bottom && r.bottom > rect.top;
        if(overlaps) selected.add(el.dataset.id);
    });
    selectDrag = null;
    document.body.classList.remove('canvas-selecting');
    window.onmousemove = null;
    window.onmouseup = null;
    render();
}
function renderSelectionHub(){
    selectionHub.innerHTML = '';
    selectionHub.classList.remove('open');
}
function startSelectionLink(e, kind){
    e.preventDefault();
    e.stopPropagation();
    const p = screenToWorld(e.clientX, e.clientY);
    tempLink = {from:`selection:${kind}`, x1:p.x, y1:p.y, x2:p.x, y2:p.y};
    window.onmousemove = e2 => { const next = screenToWorld(e2.clientX, e2.clientY); tempLink.x2 = next.x; tempLink.y2 = next.y; renderLinks(); };
    window.onmouseup = e2 => {
        const targetPort = nearestPort(e2.clientX, e2.clientY, 'in');
        const target = targetPort?.closest('.generator-node');
        if(target) connectSelectionToGenerator(kind, target.dataset.id);
        tempLink = null;
        window.onmousemove = null;
        window.onmouseup = null;
        render();
        scheduleSave();
    };
}
function connectSelectionToGenerator(kind, genId){
    const ids = [...selected];
    let source = null;
    if(kind === 'images'){
        const imgs = ids.map(id => nodes.find(n => n.id === id)).filter(n => n?.type === 'image' && n.url);
        if(!imgs.length) return;
        const box = nodeBounds(imgs.map(n => n.id));
        source = {id:uid('grp'), type:'group', x:box.x - 24, y:box.y - 58, w:box.w + 48, h:box.h + 90, items:imgs.map(n => n.id)};
    } else {
        const prompts = ids.map(id => nodes.find(n => n.id === id)).filter(n => n?.type === 'prompt');
        if(!prompts.length) return;
        const box = nodeBounds(prompts.map(n => n.id));
        source = {id:uid('pg'), type:'promptGroup', x:box.x - 24, y:box.y - 58, w:box.w + 48, h:box.h + 90, items:prompts.map(n => n.id)};
    }
    nodes.push(source);
    connections.push({id:uid('c'), from:source.id, to:genId});
    selected.clear();
    selected.add(source.id);
    syncGeneratorInputs();
}

function pushUndo(){
    if(!canvas) return;
    undoStack.push({nodes:JSON.parse(JSON.stringify(nodes)), connections:JSON.parse(JSON.stringify(connections))});
    if(undoStack.length > UNDO_MAX) undoStack.shift();
}
function performUndo(){
    if(!canvas || !undoStack.length) return;
    const state = undoStack.pop();
    nodes = state.nodes;
    connections = state.connections;
    selected.clear();
    render();
    scheduleSave();
}
function cloneNode(n, dx, dy){
    const copy = JSON.parse(JSON.stringify(n));
    copy.id = uid(n.type);
    copy.x = n.x + dx;
    copy.y = n.y + dy;
    copy.running = false;
    return copy;
}
function copySelectedNodes(){
    if(!canvas || !selected.size) return;
    const el = document.activeElement;
    if(el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) return;
    const toCopy = [...selected].map(id => nodes.find(n => n.id === id)).filter(Boolean);
    if(!toCopy.length) return;
    clipboard = JSON.parse(JSON.stringify(toCopy));
}
function pasteNodes(){
    if(!canvas || !clipboard?.length) return;
    pushUndo();
    const xs = clipboard.map(n => n.x), ys = clipboard.map(n => n.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const dx = lastMouseBoard.x - cx;
    const dy = lastMouseBoard.y - cy;
    const idMap = new Map();
    const copies = clipboard.map(n => { const c = cloneNode(n, dx, dy); idMap.set(n.id, c.id); return c; });
    copies.forEach(c => {
        if((c.type === 'group' || c.type === 'promptGroup') && c.items)
            c.items = c.items.map(id => idMap.get(id) || id);
    });
    nodes.push(...copies);
    selected.clear();
    copies.forEach(c => selected.add(c.id));
    render();
    scheduleSave();
}
function startNodeDrag(e, node){
    if(e.button !== 0) return;
    if(startKnifeDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    let dragTarget = node;
    if(e.altKey){
        const copy = cloneNode(node, 0, 0);
        const isGroup = node.type === 'group' || node.type === 'promptGroup';
        if(isGroup && node.items?.length){
            const idMap = new Map();
            const childCopies = node.items
                .map(id => nodes.find(n => n.id === id)).filter(Boolean)
                .map(child => { const cc = cloneNode(child, 0, 0); idMap.set(child.id, cc.id); return cc; });
            copy.items = copy.items.map(id => idMap.get(id) || id);
            nodes.push(...childCopies, copy);
        } else {
            nodes.push(copy);
        }
        selected.clear();
        selected.add(copy.id);
        dragTarget = copy;
        render();
    }
    const isGroup = dragTarget.type === 'group' || dragTarget.type === 'promptGroup';
    const collected = new Map();
    const collect = n => {
        if(!n || collected.has(n.id) || n.id === dragTarget.id) return;
        collected.set(n.id, {node:n, ox:n.x, oy:n.y});
        if(n.type === 'group' || n.type === 'promptGroup'){
            (n.items || []).map(id => nodes.find(x => x.id === id)).forEach(collect);
        }
    };
    if(isGroup){
        (dragTarget.items || []).map(id => nodes.find(n => n.id === id)).forEach(collect);
    }
    // 如果被拖节点在多选里，所有其他选中节点（含其组成员）一起移动
    if(selected.has(dragTarget.id) && selected.size > 1){
        [...selected].forEach(id => collect(nodes.find(n => n.id === id)));
    }
    const children = [...collected.values()];
    dragNode = {node: dragTarget, children, sx:e.clientX, sy:e.clientY, ox:dragTarget.x, oy:dragTarget.y};
    document.body.classList.add('canvas-node-drag');
    window.onmousemove = onNodeDrag;
    window.onmouseup = endDrag;
}
function onNodeDrag(e){
    if(!dragNode) return;
    const dx = (e.clientX - dragNode.sx) / viewport.scale;
    const dy = (e.clientY - dragNode.sy) / viewport.scale;
    dragNode.node.x = dragNode.ox + dx;
    dragNode.node.y = dragNode.oy + dy;
    const el = nodesEl.querySelector(`.node[data-id="${dragNode.node.id}"]`);
    if(el){
        el.style.left = `${dragNode.node.x}px`;
        el.style.top = `${dragNode.node.y}px`;
    }
    (dragNode.children || []).forEach(childDrag => {
        childDrag.node.x = childDrag.ox + dx;
        childDrag.node.y = childDrag.oy + dy;
        const childEl = nodesEl.querySelector(`.node[data-id="${childDrag.node.id}"]`);
        if(childEl){
            childEl.style.left = `${childDrag.node.x}px`;
            childEl.style.top = `${childDrag.node.y}px`;
        }
    });
    renderLinks();
    renderSelectionHub();
    scheduleMinimapRender();
}
function startNodeResize(e, node){
    e.preventDefault();
    e.stopPropagation();
    const el = nodesEl.querySelector(`.node[data-id="${node.id}"]`);
    const rect = el?.getBoundingClientRect();
    resizeNode = {
        node,
        sx:e.clientX,
        sy:e.clientY,
        sw:(rect?.width ? rect.width / viewport.scale : node.w || defaultNodeSize(node.type).w),
        sh:(rect?.height ? rect.height / viewport.scale : node.h || defaultNodeSize(node.type).h || 160)
    };
    document.body.classList.add('canvas-node-resize');
    window.onmousemove = onNodeResize;
    window.onmouseup = endDrag;
}
function onNodeResize(e){
    if(!resizeNode) return;
    const min = defaultNodeSize(resizeNode.node.type);
    const nextW = Math.max(Math.min(min.w, 220), resizeNode.sw + (e.clientX - resizeNode.sx) / viewport.scale);
    const nextH = Math.max(96, resizeNode.sh + (e.clientY - resizeNode.sy) / viewport.scale);
    resizeNode.node.w = Math.round(nextW);
    resizeNode.node.h = Math.round(nextH);
    const el = nodesEl.querySelector(`.node[data-id="${resizeNode.node.id}"]`);
    if(el){
        el.classList.add('sized');
        el.style.width = `${resizeNode.node.w}px`;
        el.style.height = `${resizeNode.node.h}px`;
    }
    renderLinks();
    renderSelectionHub();
    scheduleMinimapRender();
}
function startLink(e, originId, originKind){
    e.stopPropagation();
    originKind = originKind || 'out';
    const src = portPoint(originId, originKind);
    const source = nodes.find(n => n.id === originId);
    tempLink = {from:originId, originKind, x1:src.x, y1:src.y, x2:src.x, y2:src.y};
    window.onmousemove = e2 => {
        const p = screenToWorld(e2.clientX, e2.clientY);
        tempLink.x2 = p.x;
        tempLink.y2 = p.y;
        renderLinks();
    };
    window.onmouseup = e2 => {
        const targetKind = originKind === 'out' ? 'in' : 'out';
        const targetPort = nearestPort(e2.clientX, e2.clientY, targetKind);
        const target = targetPort?.closest('.node');
        if(target){
            const targetId = target.dataset.id;
            const fromId = originKind === 'out' ? originId : targetId;
            const toId = originKind === 'out' ? targetId : originId;
            if(canConnect(fromId, toId)){
                if(!connections.some(c => c.from === fromId && c.to === toId)){ pushUndo(); connections.push({id:uid('c'), from:fromId, to:toId}); }
                syncGeneratorInputs();
                scheduleSave();
                render();
            }
        } else if(originKind === 'out'){
            if(source && CANVAS_GENERATOR_TYPES.includes(source.type)){
                const p = screenToWorld(e2.clientX, e2.clientY);
                pushUndo();
                const out = {id:uid('out'), type:'output', x:p.x, y:p.y - 63, images:[]};
                nodes.push(out);
                connections.push({id:uid('c'), from:source.id, to:out.id});
                syncGeneratorInputs();
                scheduleSave();
                render();
            } else {
                openLinkCreateMenu(originId, originKind, e2.clientX, e2.clientY);
            }
        } else if(originKind === 'in'){
            openLinkCreateMenu(originId, originKind, e2.clientX, e2.clientY);
        }
        tempLink = null;
        window.onmousemove = null;
        window.onmouseup = null;
        renderLinks();
    };
}
function nearestPort(clientX, clientY, kind){
    const selector = `.port.${kind}`;
    const direct = document.elementFromPoint(clientX, clientY)?.closest(selector);
    if(direct) return direct;
    let best = null;
    let bestDistance = Infinity;
    nodesEl.querySelectorAll(selector).forEach(port => {
        const r = port.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const d = Math.hypot(clientX - cx, clientY - cy);
        if(d < bestDistance){
            bestDistance = d;
            best = port;
        }
    });
    return bestDistance <= 48 ? best : null;
}
function wouldCreateGeneratorCycle(fromId, toId){
    const seen = new Set();
    const walk = id => {
        if(id === fromId) return true;
        if(seen.has(id)) return false;
        seen.add(id);
        for(const c of connections.filter(x => x.from === id)){
            if(walk(c.to)) return true;
            const next = nodes.find(n => n.id === c.to);
            if(next?.type === 'output'){
                for(const cc of connections.filter(x => x.from === next.id)){
                    if(walk(cc.to)) return true;
                }
            }
        }
        return false;
    };
    return walk(toId);
}
function canConnect(fromId, toId){
    if(!fromId || !toId || fromId === toId) return false;
    const from = nodes.find(n => n.id === fromId);
    const to = nodes.find(n => n.id === toId);
    if(!from || !to) return false;
    if(CANVAS_GENERATOR_TYPES.includes(from.type)){
        if(to.type === 'output') return true;
        if(CANVAS_IMAGE_OUTPUT_TYPES.includes(from.type) && CANVAS_GENERATOR_TYPES.includes(to.type)){
            return !wouldCreateGeneratorCycle(fromId, toId);
        }
        return false;
    }
    if(to.type === 'loop'){
        const allowImage = Boolean(to.imageInput) && ['image','group','output'].includes(from.type);
        const allowPrompt = Boolean(to.showPrompt) && ['prompt','promptGroup','loop','llm'].includes(from.type);
        return allowImage || allowPrompt;
    }
    if(to.type === 'llm') return ['prompt','loop','promptGroup','llm','image','group','output'].includes(from.type);
    if(from.type === 'llm') return CANVAS_GENERATOR_TYPES.includes(to.type);
    return CANVAS_GENERATOR_TYPES.includes(to.type) && ['image','prompt','loop','group','promptGroup','output','llm'].includes(from.type);
}
function sanitizeConnections(){
    connections = (connections || []).filter(c => canConnect(c.from, c.to));
}
function endDrag(event=null){
    if(dragNode){
        const moved = [dragNode.node, ...(dragNode.children || []).map(c => c.node)].filter(Boolean);
        // 拖动 group/promptGroup 自身时不重新评估（成员跟着一起走，包含关系不变）
        const draggedGroup = moved.some(n => n.type === 'group' || n.type === 'promptGroup');
        if(!draggedGroup) updateGroupMembership(moved);
    }
    dragNode = null;
    dragBoard = null;
    resizeNode = null;
    llmPaneDrag = null;
    knifeActive = false;
    knifePoint = null;
    knifeTrail = [];
    const shouldRenderKnife = knifeNeedsRender;
    knifeChanged = false;
    knifeNeedsRender = false;
    if(!event?.shiftKey) setKnifeMode(false);
    if(textSelectionGuard) textSelectionGuard.active = false;
    document.body.classList.remove('canvas-node-drag', 'canvas-node-resize', 'canvas-selecting', 'canvas-board-pan');
    window.onmousemove = null;
    window.onmouseup = null;
    if(shouldRenderKnife) render();
    scheduleMinimapRender();
    scheduleSave();
}
function nodeRect(n){
    const el = nodesEl.querySelector(`.node[data-id="${n.id}"]`);
    const w = el?.offsetWidth || n.w || 260;
    const h = el?.offsetHeight || n.h || 200;
    return {x:n.x, y:n.y, w, h, cx:n.x + w/2, cy:n.y + h/2};
}
function handoffExistingInputsToGroup(group, children){
    if(!group || group.type !== 'group') return false;
    const childIds = new Set((children || []).filter(n => ['image','prompt'].includes(n?.type)).map(n => n.id));
    if(!childIds.size) return false;
    const targetIds = new Set();
    connections.forEach(c => {
        if(!childIds.has(c.from)) return;
        const target = nodes.find(n => n.id === c.to);
        if(target && CANVAS_GENERATOR_TYPES.includes(target.type)) targetIds.add(target.id);
    });
    if(!targetIds.size) return false;
    connections = connections.filter(c => !(childIds.has(c.from) && targetIds.has(c.to)));
    targetIds.forEach(targetId => {
        if(!connections.some(c => c.from === group.id && c.to === targetId) && canConnect(group.id, targetId)){
            connections.push({id:uid('c'), from:group.id, to:targetId});
        }
    });
    return true;
}
function updateGroupMembership(movedNodes){
    const pairs = [
        {childType:'image', groupType:'group'},
        {childType:'prompt', groupType:'group'},
        {childType:'prompt', groupType:'promptGroup'}
    ];
    let changed = false;
    const handoffGroupConnections = (group, child) => {
        if(!group || group.type !== 'group' || !['image','prompt'].includes(child?.type)) return;
        const directTargets = connections
            .filter(c => c.from === child.id)
            .map(c => nodes.find(n => n.id === c.to))
            .filter(n => n && CANVAS_GENERATOR_TYPES.includes(n.type));
        const groupTargets = connections
            .filter(c => c.from === group.id)
            .map(c => nodes.find(n => n.id === c.to))
            .filter(n => n && CANVAS_GENERATOR_TYPES.includes(n.type));
        const targets = new Map([...directTargets, ...groupTargets].map(n => [n.id, n]));
        targets.forEach(target => {
            const before = connections.length;
            connections = connections.filter(c => !(c.from === child.id && c.to === target.id));
            if(connections.length !== before) changed = true;
            if(!connections.some(c => c.from === group.id && c.to === target.id) && canConnect(group.id, target.id)){
                connections.push({id:uid('c'), from:group.id, to:target.id});
                changed = true;
            }
        });
    };
    pairs.forEach(({childType, groupType}) => {
        const groups = nodes.filter(n => n.type === groupType);
        const children = movedNodes.filter(n => n?.type === childType);
        if(!children.length || !groups.length) return;
        children.forEach(child => {
            const cr = nodeRect(child);
            const containing = groups.find(g => {
                const gr = nodeRect(g);
                return cr.cx >= gr.x && cr.cx <= gr.x + gr.w && cr.cy >= gr.y && cr.cy <= gr.y + gr.h;
            });
            groups.forEach(g => {
                if(g === containing) return;
                const idx = (g.items || []).indexOf(child.id);
                if(idx >= 0){ g.items.splice(idx, 1); changed = true; }
            });
            if(containing){
                containing.items = containing.items || [];
                if(!containing.items.includes(child.id)){ containing.items.push(child.id); changed = true; }
                handoffGroupConnections(containing, child);
            }
        });
    });
    if(changed){
        syncGeneratorInputs();
        refreshGeneratorInputViews();
        render();
        scheduleSave();
    }
}

function portPoint(id, kind){
    const n = nodes.find(x => x.id === id);
    const el = nodesEl.querySelector(`.node[data-id="${id}"]`);
    if(!n || !el) return {x:0,y:0};
    const port = el.querySelector(`.port.${kind}`);
    if(port){
        const r = port.getBoundingClientRect();
        return screenToWorld(r.left + r.width / 2, r.top + r.height / 2);
    }
    const w = el.offsetWidth || n.w || 260, h = el.offsetHeight || n.h || 160;
    return kind === 'out' ? {x:n.x + w, y:n.y + h / 2} : {x:n.x, y:n.y + h / 2};
}
function renderLinks(){
    linksEl.innerHTML = '';
    linkControlsEl.innerHTML = '';
    connections.forEach(c => {
        const a = portPoint(c.from, 'out'), b = portPoint(c.to, 'in');
        linksEl.appendChild(pathEl(a.x, a.y, b.x, b.y, 'link'));
        const btn = linkDeleteButton(c, a, b);
        linkControlsEl.appendChild(btn);
        linksEl.appendChild(linkHitEl(a.x, a.y, b.x, b.y, c.id));
    });
    if(tempLink){
        linksEl.appendChild(pathEl(tempLink.x1, tempLink.y1, tempLink.x2, tempLink.y2, 'link temp'));
    }
    renderKnifeTrail();
}
function renderKnifeTrail(){
    if(!knifeActive || knifeTrail.length < 2) return;
    const poly = document.createElementNS('http://www.w3.org/2000/svg','polyline');
    poly.setAttribute('points', knifeTrail.map(p => `${p.x},${p.y}`).join(' '));
    poly.setAttribute('class', 'link knife-trail');
    linksEl.appendChild(poly);
}
function linkDeleteButton(connection, a, b){
    const btn = document.createElement('button');
    btn.className = `link-delete ${isConnectionSelected(connection) ? 'visible' : ''} ${hoveredConnectionId === connection.id ? 'hover' : ''}`;
    btn.type = 'button';
    btn.title = tr('canvas.deleteLink');
    btn.setAttribute('aria-label', tr('canvas.deleteLink'));
    btn.dataset.connectionId = connection.id;
    btn.style.left = `${(a.x + b.x) / 2}px`;
    btn.style.top = `${(a.y + b.y) / 2}px`;
    btn.textContent = '×';
    btn.onclick = e => deleteConnection(connection.id, e);
    return btn;
}
function linkHitEl(x1,y1,x2,y2,id){
    const p = pathEl(x1, y1, x2, y2, 'link-hit');
    p.dataset.connectionId = id;
    return p;
}
function setHoveredConnection(id){
    if(hoveredConnectionId === id) return;
    const oldId = hoveredConnectionId;
    hoveredConnectionId = id || '';
    if(oldId){
        const oldBtn = linkControlsEl.querySelector(`[data-connection-id="${CSS.escape(oldId)}"]`);
        if(oldBtn) oldBtn.classList.remove('hover');
    }
    if(hoveredConnectionId){
        const btn = linkControlsEl.querySelector(`[data-connection-id="${CSS.escape(hoveredConnectionId)}"]`);
        if(btn) btn.classList.add('hover');
    }
}
function connectionDistanceToPoint(connection, point){
    const from = portPoint(connection.from, 'out');
    const to = portPoint(connection.to, 'in');
    let min = Infinity;
    let prev = cubicPoint(from, to, 0);
    for(let i = 1; i <= 28; i++){
        const cur = cubicPoint(from, to, i / 28);
        min = Math.min(min, pointSegmentDistance(point, prev, cur));
        prev = cur;
    }
    return min;
}
function updateConnectionHoverFromMouse(e){
    if(!canvas || tempLink || dragNode || dragBoard || resizeNode || knifeActive){
        setHoveredConnection('');
        return;
    }
    const button = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.link-delete');
    if(button?.dataset.connectionId){
        setHoveredConnection(button.dataset.connectionId);
        return;
    }
    const point = screenToWorld(e.clientX, e.clientY);
    const threshold = Math.max(12, 16 / viewport.scale);
    let bestId = '';
    let best = Infinity;
    connections.forEach(c => {
        const d = connectionDistanceToPoint(c, point);
        if(d < best){ best = d; bestId = c.id; }
    });
    setHoveredConnection(best <= threshold ? bestId : '');
}
function isConnectionSelected(connection){
    return selected.has(connection.from) || selected.has(connection.to);
}
function refreshSelectionVisuals(){
    nodesEl.querySelectorAll('.node').forEach(el => {
        el.classList.toggle('selected', selected.has(el.dataset.id));
    });
    renderLinks();
    renderSelectionHub();
    scheduleMinimapRender();
}
function pathEl(x1,y1,x2,y2,cls){
    const p = document.createElementNS('http://www.w3.org/2000/svg','path');
    const dx = Math.max(80, Math.abs(x2 - x1) * .45);
    p.setAttribute('d', `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`);
    p.setAttribute('class', cls);
    return p;
}
function pointSegmentDistance(p, a, b){
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if(!len2) return Math.hypot(p.x - a.x, p.y - a.y);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}
function segmentsIntersect(a, b, c, d){
    const orient = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    const onSeg = (p, q, r) => Math.min(p.x, r.x) <= q.x && q.x <= Math.max(p.x, r.x) && Math.min(p.y, r.y) <= q.y && q.y <= Math.max(p.y, r.y);
    const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
    if(o1 === 0 && onSeg(a, c, b)) return true;
    if(o2 === 0 && onSeg(a, d, b)) return true;
    if(o3 === 0 && onSeg(c, a, d)) return true;
    if(o4 === 0 && onSeg(c, b, d)) return true;
    return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
}
function segmentIntersectsRect(a, b, r){
    if(a.x >= r.x && a.x <= r.x + r.w && a.y >= r.y && a.y <= r.y + r.h) return true;
    if(b.x >= r.x && b.x <= r.x + r.w && b.y >= r.y && b.y <= r.y + r.h) return true;
    const p1 = {x:r.x, y:r.y}, p2 = {x:r.x + r.w, y:r.y}, p3 = {x:r.x + r.w, y:r.y + r.h}, p4 = {x:r.x, y:r.y + r.h};
    return segmentsIntersect(a, b, p1, p2) || segmentsIntersect(a, b, p2, p3) || segmentsIntersect(a, b, p3, p4) || segmentsIntersect(a, b, p4, p1);
}
function cubicPoint(a, b, t){
    const dx = Math.max(80, Math.abs(b.x - a.x) * .45);
    const p1 = {x:a.x + dx, y:a.y};
    const p2 = {x:b.x - dx, y:b.y};
    const u = 1 - t;
    return {
        x:u*u*u*a.x + 3*u*u*t*p1.x + 3*u*t*t*p2.x + t*t*t*b.x,
        y:u*u*u*a.y + 3*u*u*t*p1.y + 3*u*t*t*p2.y + t*t*t*b.y
    };
}
function knifeHitsConnection(a, b, connection){
    const from = portPoint(connection.from, 'out');
    const to = portPoint(connection.to, 'in');
    const threshold = Math.max(8, 12 / viewport.scale);
    let prev = cubicPoint(from, to, 0);
    for(let i = 1; i <= 28; i++){
        const cur = cubicPoint(from, to, i / 28);
        if(segmentsIntersect(a, b, prev, cur) || pointSegmentDistance(prev, a, b) <= threshold || pointSegmentDistance(cur, a, b) <= threshold) return true;
        prev = cur;
    }
    return false;
}
function applyKnifeCut(from, to){
    if(!canvas || !connections.length || !from || !to) return;
    const nodeHits = new Set();
    nodes.forEach(n => {
        const el = nodesEl.querySelector(`.node[data-id="${n.id}"]`);
        if(!el) return;
        const r = nodeRect(n);
        if(segmentIntersectsRect(from, to, r)) nodeHits.add(n.id);
    });
    const next = connections.filter(c => !nodeHits.has(c.from) && !nodeHits.has(c.to) && !knifeHitsConnection(from, to, c));
    if(next.length === connections.length) return;
    if(!knifeChanged) pushUndo();
    knifeChanged = true;
    connections = next;
    syncGeneratorInputs();
    refreshGeneratorInputViews();
    knifeNeedsRender = true;
    renderLinks();
    renderSelectionHub();
    scheduleSave();
}
function setKnifeMode(active){
    document.body.classList.toggle('canvas-knife', Boolean(active && canvas));
    if(!active){
        knifeActive = false;
        knifePoint = null;
        knifeTrail = [];
        knifeChanged = false;
        knifeNeedsRender = false;
        renderLinks();
    }
}
function startKnifeDrag(e){
    if(!canvas || e.button !== 0 || !e.shiftKey || isEditableTarget(e.target)) return false;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation?.();
    closeCreateMenu();
    setKnifeMode(true);
    knifeActive = true;
    knifeChanged = false;
    knifeNeedsRender = false;
    knifePoint = screenToWorld(e.clientX, e.clientY);
    knifeTrail = [knifePoint];
    renderLinks();
    window.onmousemove = continueKnifeDrag;
    window.onmouseup = endDrag;
    return true;
}
function continueKnifeDrag(e){
    if(!canvas || !knifeActive) return;
    if(!e.shiftKey){
        setKnifeMode(false);
        return;
    }
    const point = screenToWorld(e.clientX, e.clientY);
    if(knifePoint) applyKnifeCut(knifePoint, point);
    knifePoint = point;
    knifeTrail.push(point);
    if(knifeTrail.length > 120) knifeTrail = knifeTrail.slice(-120);
    renderLinks();
}
function isEditableTarget(target){
    const tag = target?.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable || target?.closest?.('select, option');
}
minimap?.addEventListener('mousedown', e => {
    if(!canvas || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    minimapDrag = true;
    centerViewportOnWorldPoint(minimapEventToWorld(e));
    window.onmousemove = e2 => {
        if(minimapDrag) centerViewportOnWorldPoint(minimapEventToWorld(e2));
    };
    window.onmouseup = () => {
        minimapDrag = false;
        window.onmousemove = null;
        window.onmouseup = null;
        scheduleSave();
    };
});
function startBoardPan(e){
    if(!canvas) return false;
    if(isEditableTarget(e.target) || e.target.closest?.('#createMenu, #linkCreateMenu, #nodeInputMenu, #nodeOutputMenu, #imageNodeMenu, .minimap')) return false;
    e.preventDefault();
    e.stopPropagation();
    closeCreateMenu();
    if(document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    dragBoard = {sx:e.clientX, sy:e.clientY, ox:viewport.x, oy:viewport.y};
    document.body.classList.add('canvas-board-pan');
    window.onmousemove = e2 => {
        viewport.x = dragBoard.ox + e2.clientX - dragBoard.sx;
        viewport.y = dragBoard.oy + e2.clientY - dragBoard.sy;
        applyViewport();
    };
    window.onmouseup = endDrag;
    return true;
}

board.onmousedown = e => {
    if(!canvas) return;
    if(e.button === 1){
        startBoardPan(e);
        return;
    }
    if(e.button !== 0) return;
    if(startKnifeDrag(e)) return;
    // Dismiss any open native select dropdown
    if(document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    if(e.target !== board && e.target !== world && e.target !== nodesEl && e.target !== linksEl) return;
    closeCreateMenu();
    if(e.ctrlKey || e.metaKey){
        e.preventDefault();
        startSelection(e);
        return;
    }
    if(selected.size){
        selected.clear();
        refreshSelectionVisuals();
    }
    startBoardPan(e);
};
board.addEventListener('mousemove', e => {
    const point = screenToWorld(e.clientX, e.clientY);
    lastMouseBoard = point;
    updateConnectionHoverFromMouse(e);
    if(canvas && knifeActive && !isEditableTarget(e.target) && !dragNode && !dragBoard && !resizeNode && !tempLink){
        continueKnifeDrag(e);
    } else if(!e.shiftKey) {
        setKnifeMode(false);
    }
});
board.addEventListener('mouseleave', () => setHoveredConnection(''));
board.ondblclick = null;
board.oncontextmenu = e => {
    if(!canvas) return;
    if(e.target !== board && e.target !== world && e.target !== nodesEl && e.target !== linksEl) return;
    e.preventDefault();
    e.stopPropagation();
    openCreateMenu(e.clientX, e.clientY);
};
board.addEventListener('mousedown', e => {
    if(e.target.closest?.('#createMenu, #linkCreateMenu, #nodeInputMenu, #nodeOutputMenu, #imageNodeMenu')) return;
    closeCreateMenu();
});
board.onwheel = e => {
    if(!canvas) return;
    e.preventDefault();
    const before = screenToWorld(e.clientX, e.clientY);
    viewport.scale = viewport.scale * (e.deltaY > 0 ? .92 : 1.08);
    const rect = board.getBoundingClientRect();
    viewport.x = e.clientX - rect.left - before.x * viewport.scale;
    viewport.y = e.clientY - rect.top - before.y * viewport.scale;
    applyViewport();
    renderLinks();
    renderSelectionHub();
    scheduleSave();
};
board.addEventListener('dragover', e => {
    if(e.target.closest?.('.image-node')){
        dropOverlay.classList.remove('active');
        return;
    }
    if(hasImageDropData(e.dataTransfer) || hasOutputImageDrag(e.dataTransfer)){
        e.preventDefault();
        e.dataTransfer.dropEffect = hasOutputImageDrag(e.dataTransfer) ? 'copy' : 'move';
        dropOverlay.classList.add('active');
    }
});
board.addEventListener('dragleave', e => {
    if(e.target === board || !board.contains(e.relatedTarget)) dropOverlay.classList.remove('active');
});
board.addEventListener('drop', async e => {
    e.preventDefault();
    dropOverlay.classList.remove('active');
    if(e.target.closest?.('.image-node')) return;
    if(hasOutputImageDrag(e.dataTransfer)) {
        createImageCardFromOutput(e.dataTransfer.getData('application/x-canvas-output-image'), screenToWorld(e.clientX, e.clientY));
        return;
    }
    if(internalDrag || e.dataTransfer?.types?.includes('application/x-canvas-input')) {
        internalDrag = false;
        return;
    }
    if(hasImageFiles(e.dataTransfer?.items)){
        const files = await uploadFilesFromDataTransfer(e.dataTransfer);
        const point = screenToWorld(e.clientX, e.clientY);
        if(files.length > 1) uploadImageGroup(files, point);
        else uploadImages(files, point);
        return;
    }
    const droppedUrl = imageUrlFromDataTransfer(e.dataTransfer);
    if(droppedUrl) createImageCardFromUrl(droppedUrl, screenToWorld(e.clientX, e.clientY), outputImageName(droppedUrl));
});
window.addEventListener('dragend', () => dropOverlay.classList.remove('active'));
window.addEventListener('drop', () => dropOverlay.classList.remove('active'));
window.addEventListener('paste', e => {
    if(!canvas) return;
    const files = [...(e.clipboardData?.items || [])].filter(x => x.kind === 'file' && /^(image|video|audio)\//.test(String(x.type || ''))).map(x => x.getAsFile());
    if(!files.length) return;
    e.preventDefault();
    lastImagePasteAt = Date.now();
    const blank = [...selected].map(id => nodes.find(n => n.id === id)).find(n => n?.type === 'image' && !n.url);
    if(blank) fillImageNode(blank.id, files);
    else if(files.length > 1) uploadImageGroup(files);
    else uploadImages(files);
});
window.addEventListener('keydown', e => {
    if(!canvas) return;
    if(e.key === 'Shift' && !isEditableTarget(document.activeElement)) setKnifeMode(true);
    if(e.key === 'Escape' && document.getElementById('imageEditModal').classList.contains('open')) { closeImageEditor(); return; }
    if(outputLightbox.classList.contains('open') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')){
        if(navigateOutputLightbox(e.key === 'ArrowRight' ? 1 : -1)){
            e.preventDefault();
            e.stopPropagation();
        }
        return;
    }
    if(e.key === 'Escape' && outputLightbox.classList.contains('open')) { closeOutputLightbox(); return; }
    if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') { e.preventDefault(); groupSelectedImages(); }
    if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        // 在输入框/可编辑元素里时，让浏览器原生 Ctrl+C 工作
        const tag = document.activeElement?.tagName;
        if(tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
        // 用户在页面任意位置选中了文本时，也不要拦截
        const sel = window.getSelection && window.getSelection();
        if(sel && sel.toString().length > 0) return;
        e.preventDefault();
        copySelectedNodes();
    }
    if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        const tag = document.activeElement?.tagName;
        if(tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
        if(clipboard?.length) {
            const pasteRequestedAt = Date.now();
            setTimeout(() => {
                if(!canvas) return;
                if(lastImagePasteAt >= pasteRequestedAt) return;
                pasteNodes();
            }, 90);
        }
    }
    if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        const tag = document.activeElement?.tagName;
        if(tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
        e.preventDefault(); performUndo();
    }
    if(e.key === 'Delete' || e.key === 'Backspace') {
        const tag = document.activeElement?.tagName;
        if(tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
        if(selected.size === 0) return;
        e.preventDefault();
        deleteSelectedNodes();
    }
});
window.addEventListener('keyup', e => {
    if(e.key === 'Shift') setKnifeMode(false);
});
window.addEventListener('blur', () => setKnifeMode(false));
window.addEventListener('blur', () => {
    if(selectDrag){
        selectionBox.style.display = 'none';
        selectDrag = null;
        document.body.classList.remove('canvas-selecting');
        window.onmousemove = null;
        window.onmouseup = null;
    }
});
function deleteSelectedNodes(){
    if(!canvas || selected.size === 0) return;
    pushUndo();
    // 收集所有需要删除的 id（含 group 的 items 一并删除）
    const toDelete = new Set();
    const collect = id => {
        if(toDelete.has(id)) return;
        toDelete.add(id);
        const n = nodes.find(x => x.id === id);
        if(n && (n.type === 'group' || n.type === 'promptGroup')){
            (n.items || []).forEach(collect);
        }
    };
    selected.forEach(collect);
    nodes = nodes.filter(n => !toDelete.has(n.id));
    connections = connections.filter(c => !toDelete.has(c.from) && !toDelete.has(c.to));
    selected.clear();
    render();
    scheduleSave();
}
function hasImageFiles(items){
    return [...(items || [])].some(item => {
        const entry = dataTransferItemEntry(item);
        return entry?.isDirectory || (item.kind === 'file' && (/^(image|video|audio)\//.test(String(item.type || '')) || isSupportedUploadFile(item.getAsFile?.())));
    });
}
function hasImageDropData(dataTransfer){
    if(!dataTransfer) return false;
    if(hasImageFiles(dataTransfer.items)) return true;
    const types = [...(dataTransfer.types || [])];
    return types.includes('text/uri-list') || types.includes('text/html') || types.includes('text/plain');
}
function hasOutputImageDrag(dataTransfer){ return [...(dataTransfer?.types || [])].includes('application/x-canvas-output-image'); }
function escapeHtml(str){ return String(str == null ? '' : str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
function escapeAttr(str){ return escapeHtml(str); }

window.onload = async () => {
    applyTheme(localStorage.getItem('studio_theme') || localStorage.getItem(CANVAS_THEME_KEY) || 'light');
    applyQuickToolbarState();
    if(window.StudioI18n) StudioI18n.apply();
    document.title = tr('canvas.title');
    initOutputCompareEvents();
    initOutputPreviewZoomEvents();
    applyViewport();
    await loadConfig();
    pruneMissingComfyWorkflows();
    await loadCanvasList(false);
    setCanvasMode(false);
};
