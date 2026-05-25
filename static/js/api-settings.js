let providers = [];
let selectedId = '';
const providerList = document.getElementById('providerList');
const editorTitle = document.getElementById('editorTitle');
const statusEl = document.getElementById('status');
const nameInput = document.getElementById('nameInput');
const idInput = document.getElementById('idInput');
const baseInput = document.getElementById('baseInput');
const protocolInput = document.getElementById('protocolInput');
const advancedEndpoints = document.getElementById('advancedEndpoints');
const imageGenerationEndpointInput = document.getElementById('imageGenerationEndpointInput');
const imageEditEndpointInput = document.getElementById('imageEditEndpointInput');
const keyInput = document.getElementById('keyInput');
const keyHint = document.getElementById('keyHint');
const rhFreeKeyInput = document.getElementById('rhFreeKeyInput');
const rhWalletKeyInput = document.getElementById('rhWalletKeyInput');
const rhFreeKeyHint = document.getElementById('rhFreeKeyHint');
const rhWalletKeyHint = document.getElementById('rhWalletKeyHint');
const runninghubConfigBlock = document.getElementById('runninghubConfigBlock');
const rhPasteInput = document.getElementById('rhPasteInput');
const rhAppsList = document.getElementById('rhAppsList');
const rhWorkflowsList = document.getElementById('rhWorkflowsList');
const rhAppsCount = document.getElementById('rhAppsCount');
const rhWorkflowsCount = document.getElementById('rhWorkflowsCount');
const rhWorkflowEditorOverlay = document.getElementById('rhWorkflowEditorOverlay');
const rhWorkflowEditorTitle = document.getElementById('rhWorkflowEditorTitle');
const rhWorkflowEditorSub = document.getElementById('rhWorkflowEditorSub');
const rhWorkflowEditName = document.getElementById('rhWorkflowEditName');
const rhWorkflowEditNote = document.getElementById('rhWorkflowEditNote');
const rhWorkflowEditorSummary = document.getElementById('rhWorkflowEditorSummary');
const rhWorkflowEditorNodeList = document.getElementById('rhWorkflowEditorNodeList');
const rhWorkflowEditorGraphWrap = document.getElementById('rhWorkflowEditorGraphWrap');
let rhWorkflowEditorGraphSvg = document.getElementById('rhWorkflowEditorGraphSvg');
let rhWorkflowEditorZoom = document.getElementById('rhWorkflowEditorZoom');
const imageModelList = document.getElementById('imageModelList');
const chatModelList = document.getElementById('chatModelList');
const videoModelList = document.getElementById('videoModelList');
const msLoraBlock = document.getElementById('msLoraBlock');
const msLoraList = document.getElementById('msLoraList');
const recommendApiOverlay = document.getElementById('recommendApiOverlay');
const recommendApiList = document.getElementById('recommendApiList');
const MS_BUILTIN_IMAGE_MODELS = [
    'Tongyi-MAI/Z-Image-Turbo',
    'Qwen/Qwen-Image-2512',
    'Qwen/Qwen-Image-Edit-2511',
    'black-forest-labs/FLUX.2-klein-9B'
];
let rhWorkflowEditorState = { open:false, index:-1, entry:null, config:null, expanded:{}, activeNodeId:'', graph:{ k:1, x:0, y:0, w:0, h:0 }, pan:null, bound:false, previewParams:{}, previewRunning:false, previewStatus:'', previewOutputs:[] };
let rhEditorMode = 'workflow';
const RECOMMENDED_APIS = [
    {
        name:'APIMART',
        base_url:'https://api.apimart.ai',
        protocol:'apimart',
        register_url:'https://apimart.ai/zh/register?aff=1uyAbb',
        tags:['图像模型','视频模型','LLM模型']
    },
    {
        name:'FHL',
        base_url:'https://www.fhl.mom',
        protocol:'openai',
        register_url:'https://www.fhl.mom/register?aff=86L574B4T2N9',
        tags:['Codex','GPT image 2模型']
    }
];

function refreshIcons(){ if(window.lucide) lucide.createIcons(); }
function tr(key){ return window.StudioI18n ? window.StudioI18n.t(key) : key; }
function setStatus(text){ statusEl.textContent = text || ''; }
function rhEditorSideScrollEl(){
    return rhWorkflowEditorNodeList?.closest?.('.rh-workflow-editor-side') || rhWorkflowEditorNodeList;
}
function captureRhEditorScrollState(){
    const pop = document.getElementById('rhNodePopover');
    const popBody = pop?.querySelector?.('.rh-popover-body');
    const side = rhEditorSideScrollEl();
    return {
        sideTop:side?.scrollTop || 0,
        nodeListTop:rhWorkflowEditorNodeList?.scrollTop || 0,
        graphTop:rhWorkflowEditorGraphWrap?.scrollTop || 0,
        popNodeId:pop?.dataset?.nodeId || '',
        popFieldKey:pop?.dataset?.fieldKey || '',
        popBodyTop:popBody?.scrollTop || 0
    };
}
function restoreRhEditorScrollState(state){
    if(!state) return;
    const restore = () => {
        const side = rhEditorSideScrollEl();
        if(side) side.scrollTop = state.sideTop || 0;
        if(rhWorkflowEditorNodeList) rhWorkflowEditorNodeList.scrollTop = state.nodeListTop || 0;
        if(rhWorkflowEditorGraphWrap) rhWorkflowEditorGraphWrap.scrollTop = state.graphTop || 0;
        const pop = document.getElementById('rhNodePopover');
        const samePopover = pop && (
            (state.popNodeId && pop.dataset.nodeId === state.popNodeId) ||
            (state.popFieldKey && pop.dataset.fieldKey === state.popFieldKey)
        );
        if(samePopover){
            const popBody = pop.querySelector('.rh-popover-body');
            if(popBody) popBody.scrollTop = state.popBodyTop || 0;
        }
    };
    requestAnimationFrame(() => {
        restore();
        requestAnimationFrame(restore);
    });
}
function withRhEditorScrollPreserved(callback){
    const scrollState = captureRhEditorScrollState();
    const result = callback();
    restoreRhEditorScrollState(scrollState);
    return result;
}
function findRhAppFieldCard(key){
    return Array.from(document.querySelectorAll('.rh-app-field-card')).find(el => el.dataset.fieldKey === String(key || ''));
}
function normalizeId(value){
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/^-+|-+$/g, '').replace(/-+/g, '-').slice(0, 40);
}
// 平台 Key 按 ID 写入 API/.env；ID 一旦创建就保持稳定，避免改名或中文名称导致 Key 看起来丢失。
function deriveIdFromName(name, existingId){
    if(existingId) return existingId;
    let id = normalizeId(name);
    if(!id){
        id = 'api-' + Math.random().toString(36).slice(2, 8);
    }
    let candidate = id, i = 2;
    while(providers.some(p => p.id === candidate)){
        candidate = `${id}-${i++}`;
    }
    return candidate;
}
function updateIdPreview(){
    const item = provider();
    if(!item) return;
    const isBuiltin = item.id === 'comfly' || item.id === 'modelscope' || item.id === 'runninghub';
    const idPreview = document.getElementById('idPreview');
    if(!idPreview) return;
    if(isBuiltin){
        idPreview.textContent = item.id;
        return;
    }
    idPreview.textContent = deriveIdFromName(nameInput.value, item.id);
}
function provider(){
    return visibleProviders().find(item => item.id === selectedId) || visibleProviders()[0] || providers[0];
}
function isProviderTemporarilyHidden(item){
    return false;
}
function visibleProviders(){
    return (providers || []).filter(item => !isProviderTemporarilyHidden(item));
}
function unique(values){
    const seen = new Set();
    return values.map(v => String(v || '').trim()).filter(v => v && !seen.has(v) && seen.add(v));
}
function normalizeRhEntries(values, kind){
    const seen = new Set();
    return (Array.isArray(values) ? values : []).map(raw => {
        const parsed = parseRunningHubRunRef(raw?.appId || raw?.workflowId || raw?.id || '');
        const id = String(parsed?.id || raw?.id || raw?.appId || raw?.workflowId || '').trim();
        if(!id || seen.has(id)) return null;
        seen.add(id);
        const fallback = kind === 'app' ? `AI 应用 ${id.slice(-6)}` : `工作流 ${id.slice(-6)}`;
        const entry = {
            id,
            title:String(raw?.title || raw?.name || fallback).trim(),
            note:String(raw?.note || raw?.description || '').trim(),
            thumbnail:String(raw?.thumbnail || '').trim(),
            enabled:raw?.enabled !== false
        };
        if(Array.isArray(raw?.fields)) entry.fields = raw.fields.map(normalizeRhWorkflowField);
        if(raw?.raw && typeof raw.raw === 'object') entry.raw = raw.raw;
        if(kind === 'app') entry.appId = id;
        else {
            entry.workflowId = id;
            entry.optionalImageMode = String(raw?.optionalImageMode || 'prune-workflow');
        }
        return entry;
    }).filter(Boolean);
}
function parseRunningHubRunRef(value){
    const text = String(value || '').trim();
    const match = text.match(/\/run\/(ai-app|workflow)\/([0-9A-Za-z_-]+)/i);
    if(match) return { type:match[1].toLowerCase() === 'ai-app' ? 'app' : 'workflow', id:match[2] };
    const numeric = text.match(/^[0-9]{8,}$/);
    if(numeric) return { type:'workflow', id:text };
    return null;
}
function workflowNodeTitle(node){
    return (node?._meta?.title || node?.class_type || node?._class || node?.type || 'Node').toString();
}
function workflowNodeClass(node){
    return (node?.class_type || node?._class || node?.type || '').toString();
}
function workflowNodeCategory(node){
    const text = `${workflowNodeTitle(node)} ${workflowNodeClass(node)}`.toLowerCase();
    if(/text|prompt|clip/.test(text)) return 'prompt';
    if(/lora/.test(text)) return 'lora';
    if(/ksampler|k sampler|sampler|scheduler|guid|cfg/.test(text)) return 'sampler';
    if(/video|movie|mp4|webm|frame/.test(text)) return 'video';
    if(/audio|sound|voice|music|wav|mp3/.test(text)) return 'audio';
    if(/image|mask|resize|scale|crop|photo|picture|preview|save/.test(text)) return 'image';
    return 'misc';
}
function rhWorkflowFieldKey(field){
    return `${field?.nodeId || ''}::${field?.fieldName || ''}`;
}
function rhWorkflowFieldKind(field){
    const type = String(field?.fieldType || '').toUpperCase();
    if(['IMAGE','VIDEO','AUDIO','BOOLEAN','NUMBER','FLOAT','INT','INTEGER','TEXT'].includes(type)){
        if(type === 'FLOAT' || type === 'INT' || type === 'INTEGER') return 'NUMBER';
        return type;
    }
    const key = `${field?.fieldName || ''} ${field?.fieldValue || ''}`.toLowerCase();
    if(/image|img|mask|png|jpg|jpeg|webp/.test(key)) return 'IMAGE';
    if(/video|mp4|webm|mov/.test(key)) return 'VIDEO';
    if(/audio|wav|mp3|voice|sound/.test(key)) return 'AUDIO';
    if(/true|false/.test(key)) return 'BOOLEAN';
    if(/^-?\d+(\.\d+)?$/.test(String(field?.fieldValue || '').trim())) return 'NUMBER';
    return 'TEXT';
}
function rhWorkflowFieldTypeLabel(type){
    return ({
        TEXT:'文本',
        NUMBER:'数字',
        BOOLEAN:'开关',
        SELECT:'下拉',
        IMAGE:'图片',
        VIDEO:'视频',
        AUDIO:'音频'
    })[String(type || '').toUpperCase()] || type;
}
const RH_EDITOR_KNOWN_FIELD_OPTIONS = {
    sampler_name:['euler','euler_ancestral','heun','dpm_2','dpm_2_ancestral','lms','dpmpp_2m','dpmpp_sde','ddim','uni_pc'],
    sampler:['euler','euler_ancestral','heun','dpm_2','dpm_2_ancestral','lms','dpmpp_2m','dpmpp_sde','ddim','uni_pc'],
    scheduler:['normal','karras','exponential','sgm_uniform','simple','ddim_uniform','beta'],
    ratio:['1:1','16:9','9:16','4:3','3:4','4:5','5:4','3:2','2:3'],
    aspectRatio:['1:1','16:9','9:16','4:3','3:4','4:5','5:4','3:2','2:3'],
    resolution:['512','768','1024','1280','1536','2048','1k','2k','4k'],
    size:['512','768','1024','1280','1536','2048'],
    ckpt_name:[],
    unet_name:[],
    lora_name:[]
};
function rhKnownOptionsForField(field){
    const name = String(field?.fieldName || '').trim();
    if(!name) return [];
    if(RH_EDITOR_KNOWN_FIELD_OPTIONS[name]) return RH_EDITOR_KNOWN_FIELD_OPTIONS[name].map(String);
    const hit = Object.keys(RH_EDITOR_KNOWN_FIELD_OPTIONS).find(key => key.toLowerCase() === name.toLowerCase());
    return hit ? RH_EDITOR_KNOWN_FIELD_OPTIONS[hit].map(String) : [];
}
function normalizeRhWorkflowField(field){
    const options = Array.isArray(field?.options)
        ? field.options.map(option => String(option ?? '').trim()).filter(Boolean)
        : String(field?.options || '').split(/\r?\n|,/).map(option => option.trim()).filter(Boolean);
    const knownOptions = options.length ? options : rhKnownOptionsForField(field);
    const fieldType = String(field?.fieldType || rhWorkflowFieldKind(field));
    const savedSource = field?.sourceFromUpstream;
    return {
        id:String(field?.id || rhWorkflowFieldKey(field)),
        nodeId:String(field?.nodeId || ''),
        fieldName:String(field?.fieldName || ''),
        fieldValue:field?.fieldValue == null ? '' : String(field.fieldValue),
        fieldType:knownOptions.length && !['IMAGE','VIDEO','AUDIO'].includes(fieldType.toUpperCase()) ? 'SELECT' : fieldType,
        label:String(field?.label || field?.fieldName || ''),
        enabled:field?.enabled === true,
        sourceFromUpstream:savedSource === undefined ? false : savedSource !== false,
        group:String(field?.group || ''),
        note:String(field?.note || ''),
        options:knownOptions,
        random_enabled:field?.random_enabled === true,
        min:field?.min ?? '',
        max:field?.max ?? '',
        step:field?.step ?? '',
        imageOrder:Number(field?.imageOrder || field?.image_order || 0) || 0,
        required:field?.required === true
    };
}
function normalizeFetchedRhWorkflowField(field){
    return {...normalizeRhWorkflowField(field), enabled:false};
}
function rhWorkflowGroupKey(field){
    return `${field?.nodeId || ''}::${field?.group || ''}`;
}
function rhEditorSortedFields(fields){
    return [...(fields || [])].sort((a, b) => {
        const ak = rhWorkflowFieldKind(a);
        const bk = rhWorkflowFieldKind(b);
        if(ak === 'IMAGE' && bk === 'IMAGE'){
            const ao = Number(a.imageOrder) || 9999;
            const bo = Number(b.imageOrder) || 9999;
            if(ao !== bo) return ao - bo;
        }
        if(ak === 'IMAGE' && bk !== 'IMAGE') return -1;
        if(ak !== 'IMAGE' && bk === 'IMAGE') return 1;
        return String(a.nodeId || '').localeCompare(String(b.nodeId || ''), undefined, {numeric:true}) || String(a.fieldName || '').localeCompare(String(b.fieldName || ''));
    });
}
function rhFreeKeyHintText(item){
    return item?.has_key ? `当前免费积分 Key 已保存：${item.key_env || 'API/.env'} ${item.key_preview || ''}` : '还没有保存免费积分 Key。';
}
function rhWalletKeyHintText(item){
    return item?.has_wallet_key ? `当前账户余额 Key 已保存：${item.wallet_key_env || 'API/.env'} ${item.wallet_key_preview || ''}` : '还没有保存账户余额 Key。验证地址和拉取模型会优先使用它。';
}
function endpointValue(input){
    return String(input?.value || '').trim();
}
function toggleAdvancedEndpoints(force){
    if(!advancedEndpoints) return;
    const open = typeof force === 'boolean' ? force : !advancedEndpoints.classList.contains('open');
    advancedEndpoints.classList.toggle('open', open);
    refreshIcons();
}
function normalizeEndpointSetting(value){
    const endpoint = String(value || '').trim();
    if(!endpoint) return '';
    if(/^https?:\/\//i.test(endpoint)) return endpoint.replace(/\/+$/, '');
    return endpoint;
}
function validateEndpointSetting(endpoint, label){
    if(!endpoint) return true;
    if(/\s/.test(endpoint)) throw new Error(`${label} 不能包含空格`);
    if(/^https?:\/\//i.test(endpoint)) return true;
    if(!endpoint.startsWith('/')) throw new Error(`${label} 请填写 /v1/... 格式，例如 /v1/images/edits`);
    return true;
}
function syncEditor(){
    const item = provider();
    if(!item) return;
    const oldId = item.id;
    const isBuiltin = item.id === 'comfly' || item.id === 'modelscope';
    // 内置和自定义平台的 ID 都保持稳定；新建时若没有 ID 才生成一次。
    const nextId = isBuiltin ? item.id : deriveIdFromName(nameInput.value, item.id);
    item.id = nextId;
    if(oldId !== item.id) selectedId = item.id;
    item.name = nameInput.value.trim() || item.id;
    item.base_url = baseInput.value.trim();
    // MS 固定使用 OpenAI 协议，不从下拉读取
    item.protocol = (item.id === 'modelscope') ? 'openai' : item.id === 'runninghub' ? 'runninghub' : (protocolInput?.value || 'openai');
    item.image_generation_endpoint = normalizeEndpointSetting(endpointValue(imageGenerationEndpointInput));
    item.image_edit_endpoint = normalizeEndpointSetting(endpointValue(imageEditEndpointInput));
    item.rh_apps = normalizeRhEntries(item.rh_apps || [], 'app');
    item.rh_workflows = normalizeRhEntries(item.rh_workflows || [], 'workflow');
    const key = keyInput.value.trim();
    if(key) item.api_key = key;
    if(item.id === 'runninghub'){
        const freeKey = rhFreeKeyInput?.value.trim() || '';
        const walletKey = rhWalletKeyInput?.value.trim() || '';
        if(freeKey) item.api_key = freeKey;
        if(walletKey) item.wallet_api_key = walletKey;
    }
}
function ensureRunningHubLists(item){
    if(!item) return;
    item.rh_apps = normalizeRhEntries(item.rh_apps || [], 'app');
    item.rh_workflows = normalizeRhEntries(item.rh_workflows || [], 'workflow');
}
function updateProtocolFromInput(){
    const item = provider();
    if(!item || !protocolInput || item.id === 'modelscope' || item.id === 'runninghub') return;
    const value = String(protocolInput.value || 'openai').toLowerCase();
    item.protocol = ['openai', 'apimart', 'gemini', 'volcengine'].includes(value) ? value : 'openai';
    clearVerifyResult();
}
function handleRhPasteInput(value){
    const parsed = parseRunningHubRunRef(value);
    if(parsed) createRhEntryFromPaste();
}
function createRhEntryFromPaste(){
    const item = provider();
    if(!item || item.id !== 'runninghub') return;
    const parsed = parseRunningHubRunRef(rhPasteInput?.value || '');
    if(!parsed){ setStatus('请粘贴 /run/ai-app/... 或 /run/workflow/...'); return; }
    ensureRunningHubLists(item);
    const listKey = parsed.type === 'app' ? 'rh_apps' : 'rh_workflows';
    const exists = item[listKey].some(entry => entry.id === parsed.id);
    if(!exists){
        item[listKey].unshift({
            id:parsed.id,
            appId:parsed.type === 'app' ? parsed.id : undefined,
            workflowId:parsed.type === 'workflow' ? parsed.id : undefined,
            title:parsed.type === 'app' ? `AI 应用 ${parsed.id.slice(-6)}` : `工作流 ${parsed.id.slice(-6)}`,
            note:'',
            thumbnail:'',
            enabled:true
        });
    }
    if(rhPasteInput) rhPasteInput.value = '';
    renderRunningHubCards();
    setStatus(exists ? '这个 RunningHub 项目已经存在' : '已创建 RunningHub 卡片');
}
function updateRhEntry(kind, index, prop, value){
    const item = provider();
    if(!item || item.id !== 'runninghub') return;
    const listKey = kind === 'app' ? 'rh_apps' : 'rh_workflows';
    ensureRunningHubLists(item);
    if(!item[listKey][index]) return;
    item[listKey][index][prop] = value;
}
function removeRhEntry(kind, index){
    const item = provider();
    if(!item || item.id !== 'runninghub') return;
    const listKey = kind === 'app' ? 'rh_apps' : 'rh_workflows';
    ensureRunningHubLists(item);
    item[listKey].splice(index, 1);
    renderRunningHubCards();
}
function readFileAsDataUrl(file){
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('读取图片失败'));
        reader.readAsDataURL(file);
    });
}
function loadImageForThumbnail(src){
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('图片解析失败'));
        img.src = src;
    });
}
async function createRhThumbnailDataUrl(file){
    const original = await readFileAsDataUrl(file);
    try {
        const img = await loadImageForThumbnail(original);
        const maxSide = 360;
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || img.width || 1, img.naturalHeight || img.height || 1));
        const width = Math.max(1, Math.round((img.naturalWidth || img.width || 1) * scale));
        const height = Math.max(1, Math.round((img.naturalHeight || img.height || 1) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        return canvas.toDataURL('image/jpeg', 0.78);
    } catch(e) {
        return original;
    }
}
function pickRhThumbnail(kind, index){
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
        const file = input.files?.[0];
        if(!file) return;
        try {
            const thumbnail = await createRhThumbnailDataUrl(file);
            updateRhEntry(kind, index, 'thumbnail', thumbnail);
            renderRunningHubCards();
            setStatus('缩略图已更新，点保存生效');
        } catch(e) {
            alert(e.message || '上传缩略图失败');
        }
    };
    input.click();
}
async function openRhWorkflowEditor(index){
    const item = provider();
    if(!item || item.id !== 'runninghub') return;
    ensureRunningHubLists(item);
    const entry = item.rh_workflows[index];
    if(!entry) return;
    rhEditorMode = 'workflow';
    rhWorkflowEditorState = { open:true, index, entry, config:null, expanded:{}, activeNodeId:'', graph:{ k:1, x:0, y:0, w:0, h:0 }, pan:null, bound:false, previewParams:{}, previewRunning:false, previewStatus:'', previewOutputs:[] };
    if(rhWorkflowEditorOverlay) rhWorkflowEditorOverlay.classList.add('open');
    renderRhWorkflowEditorLoading('正在加载工作流...');
    refreshIcons();
    try {
        await loadRhWorkflowEditorConfig(entry);
    } catch(e) {
        renderRhWorkflowEditorLoading(e.message || '工作流加载失败');
    }
}
async function openRhAppEditor(index){
    const item = provider();
    if(!item || item.id !== 'runninghub') return;
    ensureRunningHubLists(item);
    const entry = item.rh_apps[index];
    if(!entry) return;
    rhEditorMode = 'app';
    rhWorkflowEditorState = { open:true, index, entry, config:null, expanded:{}, activeNodeId:'app', graph:{ k:1, x:0, y:0, w:0, h:0 }, pan:null, bound:false, previewParams:{}, previewRunning:false, previewStatus:'', previewOutputs:[] };
    if(rhWorkflowEditorOverlay) rhWorkflowEditorOverlay.classList.add('open');
    renderRhWorkflowEditorLoading('正在加载应用参数...');
    refreshIcons();
    try {
        await loadRhAppEditorConfig(entry);
    } catch(e) {
        renderRhWorkflowEditorLoading(e.message || '应用参数加载失败');
    }
}
function closeRhWorkflowEditor(){
    if(rhWorkflowEditorOverlay) rhWorkflowEditorOverlay.classList.remove('open');
    rhWorkflowEditorState.open = false;
}
function renderRhWorkflowEditorLoading(text){
    if(rhWorkflowEditorTitle) rhWorkflowEditorTitle.textContent = rhWorkflowEditorState.entry?.title || (rhEditorMode === 'app' ? 'RunningHub AI 应用' : 'RunningHub 工作流');
    if(rhWorkflowEditorSub) rhWorkflowEditorSub.textContent = rhEditorMode === 'app'
        ? `/run/ai-app/${rhWorkflowEditorState.entry?.appId || rhWorkflowEditorState.entry?.id || ''}`
        : `/run/workflow/${rhWorkflowEditorState.entry?.workflowId || rhWorkflowEditorState.entry?.id || ''}`;
    if(rhWorkflowEditorSummary) rhWorkflowEditorSummary.innerHTML = `<div class="rh-editor-empty">${escapeHtml(text)}</div>`;
    if(rhWorkflowEditorNodeList) rhWorkflowEditorNodeList.innerHTML = '';
    if(rhEditorMode === 'workflow') {
        restoreRhGraphWrap();
        if(rhWorkflowEditorGraphSvg) rhWorkflowEditorGraphSvg.innerHTML = '';
    } else if(rhWorkflowEditorGraphWrap) {
        rhWorkflowEditorGraphWrap.classList.add('rh-app-field-wrap');
        rhWorkflowEditorGraphWrap.innerHTML = `<div class="rh-editor-empty">${escapeHtml(text)}</div>`;
    }
}
async function loadRhWorkflowEditorConfig(entry){
    let config = null;
    const workflowId = String(entry.workflowId || entry.id || '').trim();
    if(!workflowId) throw new Error('workflowId 为空');
    const existing = await fetch(`/api/runninghub/workflows/${encodeURIComponent(workflowId)}`).then(async r => {
        if(r.status === 404) return null;
        const data = await r.json();
        if(!r.ok) throw new Error(data.detail || '读取工作流配置失败');
        return data.workflow || null;
    });
    if(existing) {
        config = existing;
    } else {
        config = await fetchRhWorkflowEditor(false);
        return config;
    }
    rhWorkflowEditorState.config = normalizeRhWorkflowConfig(config, entry);
    renderRhWorkflowEditor();
    setTimeout(() => rhEditorGraphFit(), 50);
    return rhWorkflowEditorState.config;
}
function normalizeRhWorkflowConfig(config, entry){
    const workflowId = String(config?.workflowId || entry?.workflowId || entry?.id || '').trim();
    const normalized = {
        workflowId,
        title:String(config?.title || entry?.title || workflowId),
        description:String(config?.description || entry?.note || ''),
        fields:(Array.isArray(config?.fields) ? config.fields : []).map(normalizeRhWorkflowField),
        workflowJson:config?.workflowJson || {},
        optionalImageMode:String(config?.optionalImageMode || entry?.optionalImageMode || 'prune-workflow'),
        raw:config?.raw || {}
    };
    return applyRhImageSlotDefaults(normalized);
}
function normalizeRhAppConfig(entry){
    const appId = String(entry?.appId || entry?.id || '').trim();
    return {
        appId,
        title:String(entry?.title || `AI 应用 ${appId.slice(-6)}` || appId),
        description:String(entry?.note || ''),
        fields:(Array.isArray(entry?.fields) ? entry.fields : []).map(normalizeRhWorkflowField),
        raw:entry?.raw || {}
    };
}
function applyRhImageSlotDefaults(config){
    const imageFields = (config.fields || []).filter(field => rhWorkflowFieldKind(field) === 'IMAGE');
    imageFields.forEach((field, index) => {
        if(!Number(field.imageOrder)) field.imageOrder = index + 1;
        if(field.required !== true && field.required !== false) field.required = index === 0;
        if(index === 0 && field.required !== false) field.required = true;
    });
    config.optionalImageMode = config.optionalImageMode || 'prune-workflow';
    return config;
}
function setRhWorkflowOptionalImageMode(value){
    const config = rhWorkflowEditorState.config;
    if(!config || rhEditorMode !== 'workflow') return;
    config.optionalImageMode = value || 'prune-workflow';
    withRhEditorScrollPreserved(() => renderRhMappedPreview());
}
function rhAppFieldSourceList(raw){
    const data = raw?.data && typeof raw.data === 'object' ? raw.data : raw;
    const candidates = [
        data?.nodeInfoList,
        data?.fields,
        data?.inputs,
        data?.inputList,
        data?.formItems,
        data?.forms,
        data?.params,
        data?.parameters,
        data?.apiParams,
        data?.config?.fields,
        data?.webapp?.fields,
        data?.webapp?.inputs
    ];
    for(const candidate of candidates){
        if(Array.isArray(candidate) && candidate.length) return candidate;
        if(candidate && typeof candidate === 'object' && Object.keys(candidate).length){
            return Object.entries(candidate).map(([key, value]) => ({fieldName:key, fieldValue:value}));
        }
    }
    return [];
}
function normalizeFetchedRhAppField(field, index=0){
    const name = field?.fieldName || field?.inputName || field?.name || field?.key || field?.paramName || field?.id || `field_${index + 1}`;
    const nodeId = field?.nodeId || field?.node_id || field?.groupId || 'app';
    let value = field?.fieldValue;
    if(value === undefined) value = field?.defaultValue;
    if(value === undefined) value = field?.value;
    if(value === undefined) value = field?.default;
    if(value === undefined || value === null) value = '';
    if(typeof value === 'object') value = JSON.stringify(value);
    const options = extractRhEditorFieldOptions(field);
    return normalizeRhWorkflowField({
        id:field?.id || `${nodeId}::${name}`,
        nodeId,
        fieldName:name,
        fieldValue:value,
        fieldType:field?.fieldType || field?.type || field?.valueType || (options.length ? 'SELECT' : ''),
        label:field?.label || field?.title || field?.name || name,
        enabled:true,
        group:field?.group || field?.category || field?.title || 'AI 应用参数',
        note:field?.note || field?.description || '',
        options,
        min:field?.min ?? '',
        max:field?.max ?? '',
        step:field?.step ?? ''
    });
}
function extractRhEditorFieldOptions(field){
    const candidates = [field?.options, field?.optionList, field?.values, field?.enum, field?.choices, field?.items, field?.list, field?.selectOptions, field?.fieldData];
    for(const candidate of candidates){
        if(!Array.isArray(candidate) || !candidate.length) continue;
        return candidate.map(item => {
            if(item && typeof item === 'object') return item.value ?? item.label ?? item.name ?? item.title;
            return item;
        }).filter(item => item !== undefined && item !== null).map(String);
    }
    const known = rhKnownOptionsForField(field);
    if(known.length) return known;
    return [];
}
async function loadRhAppEditorConfig(entry){
    const config = normalizeRhAppConfig(entry);
    rhWorkflowEditorState.config = config;
    if(!config.fields.length) await fetchRhAppEditor(false);
    else {
        renderRhWorkflowEditor();
        setTimeout(() => rhEditorGraphFit(), 50);
    }
    return rhWorkflowEditorState.config;
}
async function fetchRhAppEditor(force=false){
    const state = rhWorkflowEditorState;
    const entry = state.entry;
    const appId = String(entry?.appId || entry?.id || '').trim();
    if(!appId) throw new Error('appId 为空');
    if(force) renderRhWorkflowEditorLoading('正在重新拉取...');
    const res = await fetch(`/api/runninghub/app-info?webappId=${encodeURIComponent(appId)}`);
    const data = await res.json();
    if(!res.ok || data.success === false) throw new Error(data.detail || '拉取应用参数失败');
    const fields = rhAppFieldSourceList(data).map(normalizeFetchedRhAppField);
    state.config = {
        appId,
        title:rhWorkflowEditName?.value.trim() || entry.title || `AI 应用 ${appId.slice(-6)}`,
        description:rhWorkflowEditNote?.value.trim() || entry.note || '',
        fields,
        raw:data.data || data
    };
    state.graph = { k:1, x:0, y:0, w:0, h:0 };
    renderRhWorkflowEditor();
    setTimeout(() => rhEditorGraphFit(), 50);
    return state.config;
}
async function fetchRhWorkflowEditor(force=false){
    const state = rhWorkflowEditorState;
    const entry = state.entry;
    if(rhEditorMode === 'app') return fetchRhAppEditor(force);
    if(!entry) return null;
    const workflowId = String(entry.workflowId || entry.id || '').trim();
    if(!workflowId) throw new Error('workflowId 为空');
    if(force) renderRhWorkflowEditorLoading('正在重新拉取...');
    const res = await fetch('/api/runninghub/workflows/fetch', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
            workflowId,
            title:rhWorkflowEditName?.value.trim() || entry.title || workflowId,
            description:rhWorkflowEditNote?.value.trim() || entry.note || ''
        })
    });
    const data = await res.json();
    if(!res.ok || data.success === false) throw new Error(data.detail || '拉取工作流失败');
    state.config = normalizeRhWorkflowConfig({
        workflowId:data.data.workflowId,
        title:data.data.title,
        description:data.data.description,
        fields:(data.data.fields || []).map(normalizeFetchedRhWorkflowField),
        workflowJson:data.data.workflowJson || {},
        optionalImageMode:entry.optionalImageMode || 'prune-workflow',
        raw:data.data.raw || {}
    }, entry);
    state.graph = { k:1, x:0, y:0, w:0, h:0 };
    renderRhWorkflowEditor();
    setTimeout(() => rhEditorGraphFit(), 50);
    return state.config;
}
function updateRhWorkflowEditorMeta(prop, value){
    const config = rhWorkflowEditorState.config;
    if(!config) return;
    if(prop === 'title') config.title = value;
    if(prop === 'description') config.description = value;
    withRhEditorScrollPreserved(() => renderRhMappedPreview());
}
function toggleRhWorkflowEditorGroup(groupId){
    const expanded = rhWorkflowEditorState.expanded;
    expanded[groupId] = expanded[groupId] === false;
    withRhEditorScrollPreserved(() => renderRhWorkflowEditor());
}
function focusRhWorkflowEditorNode(nodeId){
    const state = rhWorkflowEditorState;
    const config = state.config;
    if(!config) return;
    state.activeNodeId = String(nodeId || '');
    (config.fields || []).forEach(field => {
        if(String(field.nodeId) === state.activeNodeId){
            const groupId = rhWorkflowGroupKey(field).replace(/[^a-zA-Z0-9_-]/g, '_');
            state.expanded[groupId] = true;
        }
    });
    withRhEditorScrollPreserved(() => renderRhWorkflowEditor());
}
function openRhWorkflowNodePopover(nodeId, anchorEl){
    const state = rhWorkflowEditorState;
    state.activeNodeId = String(nodeId || '');
    renderRhWorkflowEditorGraph();
    const freshAnchor = Array.from(document.querySelectorAll('.rh-editor-gnode')).find(el => el.dataset.nodeId === state.activeNodeId) || anchorEl;
    renderRhNodePopover(state.activeNodeId, freshAnchor);
}
function closeRhNodePopover(){
    document.getElementById('rhNodePopover')?.remove();
}
function renderRhNodePopover(nodeId, anchorEl){
    closeRhNodePopover();
    const config = rhWorkflowEditorState.config;
    if(!config) return;
    const fields = (config.fields || []).filter(field => String(field.nodeId) === String(nodeId));
    if(!fields.length) return;
    const pop = document.createElement('div');
    pop.id = 'rhNodePopover';
    pop.className = 'rh-node-popover';
    pop.dataset.nodeId = String(nodeId || '');
    const workflowNode = config.workflowJson?.[nodeId] || {};
    const title = (workflowNode?._meta?.title || workflowNode?.class_type || fields[0]?.group || `Node #${nodeId}`).toString();
    pop.innerHTML = `
        <div class="rh-popover-head">
            <div>
                <strong>${escapeHtml(title)}</strong>
                <span>#${escapeHtml(nodeId)} · ${fields.length}</span>
            </div>
            <button type="button" onclick="closeRhNodePopover()"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
        </div>
        <div class="rh-popover-body">${fields.map(field => renderRhWorkflowEditorField(field)).join('')}</div>
    `;
    document.body.appendChild(pop);
    const rect = anchorEl?.getBoundingClientRect?.();
    const modalRect = rhWorkflowEditorOverlay?.getBoundingClientRect?.() || {left:0, top:0, right:window.innerWidth, bottom:window.innerHeight};
    let left = rect ? rect.right + 12 : window.innerWidth / 2 - 190;
    let top = rect ? rect.top : window.innerHeight / 2 - 180;
    const width = 390;
    if(left + width > modalRect.right - 16) left = Math.max(modalRect.left + 16, (rect?.left || left) - width - 12);
    top = Math.max(modalRect.top + 74, Math.min(top, modalRect.bottom - 420));
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    refreshIcons();
}
function toggleRhWorkflowEditorField(key){
    const config = rhWorkflowEditorState.config;
    if(!config) return;
    withRhEditorScrollPreserved(() => {
        config.fields = (config.fields || []).map(field => {
            if(rhWorkflowFieldKey(field) !== key) return field;
            return {...field, enabled: field.enabled !== true};
        });
        renderRhWorkflowEditor();
        if(rhEditorMode === 'workflow' && rhWorkflowEditorState.activeNodeId) {
            const active = document.querySelector(`.rh-editor-gnode[data-node-id="${rhWorkflowEditorState.activeNodeId}"]`);
            if(active) renderRhNodePopover(rhWorkflowEditorState.activeNodeId, active);
        } else if(rhEditorMode === 'app') {
            const active = findRhAppFieldCard(key);
            if(active) openRhAppFieldPopover(key, active);
        }
    });
}
function updateRhWorkflowEditorField(key, prop, value){
    const config = rhWorkflowEditorState.config;
    if(!config) return;
    withRhEditorScrollPreserved(() => {
        config.fields = (config.fields || []).map(field => {
            if(rhWorkflowFieldKey(field) !== key) return field;
            const nextValue = prop === 'imageOrder' ? Math.max(1, Number(value) || 1) : prop === 'required' ? Boolean(value) : value;
            return {...field, [prop]: nextValue};
        });
        if(prop === 'random_enabled' || prop === 'fieldType' || prop === 'required' || prop === 'sourceFromUpstream'){
            renderRhWorkflowEditor();
            if(rhEditorMode === 'workflow' && rhWorkflowEditorState.activeNodeId) {
                const active = document.querySelector(`.rh-editor-gnode[data-node-id="${rhWorkflowEditorState.activeNodeId}"]`);
                if(active) renderRhNodePopover(rhWorkflowEditorState.activeNodeId, active);
            } else if(rhEditorMode === 'app') {
                const active = findRhAppFieldCard(key);
                if(active) openRhAppFieldPopover(key, active);
            }
            return;
        }
        withRhEditorScrollPreserved(() => renderRhMappedPreview());
        renderRhWorkflowEditorSummary();
        renderRhWorkflowEditorGraph();
        if(rhEditorMode === 'workflow' && rhWorkflowEditorState.activeNodeId) {
            const active = document.querySelector(`.rh-editor-gnode[data-node-id="${rhWorkflowEditorState.activeNodeId}"]`);
            if(active) renderRhNodePopover(rhWorkflowEditorState.activeNodeId, active);
        } else if(rhEditorMode === 'app') {
            renderRhAppFieldCards();
            const active = findRhAppFieldCard(key);
            if(active) openRhAppFieldPopover(key, active);
        }
    });
}
async function saveRhWorkflowEditor(){
    const state = rhWorkflowEditorState;
    const config = state.config;
    if(!config){ alert(rhEditorMode === 'app' ? '请先加载应用参数' : '请先加载工作流'); return; }
    config.title = rhWorkflowEditName?.value.trim() || config.title || config.workflowId;
    config.description = rhWorkflowEditNote?.value.trim() || config.description || '';
    if(rhEditorMode === 'app'){
        const item = provider();
        if(item?.id === 'runninghub' && item.rh_apps?.[state.index]){
            const entry = item.rh_apps[state.index];
            entry.title = config.title || entry.title;
            entry.note = config.description || '';
            entry.fields = (config.fields || []).map(normalizeRhWorkflowField);
            entry.raw = config.raw || {};
            renderRunningHubCards();
            await saveProviders();
        }
        setStatus('应用参数配置已保存');
        try { new BroadcastChannel('studio-api').postMessage({ type:'providers-changed' }); } catch(e) {}
        renderRhWorkflowEditor();
        return;
    }
    const res = await fetch(`/api/runninghub/workflows/${encodeURIComponent(config.workflowId)}`, {
        method:'PUT',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
            workflowId:config.workflowId,
            title:config.title,
            description:config.description,
            fields:(config.fields || []).map(normalizeRhWorkflowField),
            workflowJson:config.workflowJson || {},
            optionalImageMode:config.optionalImageMode || 'prune-workflow',
            raw:config.raw || {}
        })
    });
    const data = await res.json();
    if(!res.ok || data.success === false){ alert(data.detail || '保存失败'); return; }
    state.config = normalizeRhWorkflowConfig(data.workflow || config, state.entry);
    const item = provider();
    if(item?.id === 'runninghub' && item.rh_workflows?.[state.index]){
        item.rh_workflows[state.index].title = state.config.title;
        item.rh_workflows[state.index].note = state.config.description;
        item.rh_workflows[state.index].optionalImageMode = state.config.optionalImageMode || 'prune-workflow';
        renderRunningHubCards();
        await saveProviders();
    }
    setStatus('工作流配置已保存');
    try { new BroadcastChannel('studio-api').postMessage({ type:'workflows-changed' }); } catch(e) {}
    renderRhWorkflowEditor();
}
function renderRhWorkflowEditor(){
    const config = rhWorkflowEditorState.config;
    if(!config){ renderRhWorkflowEditorLoading(rhEditorMode === 'app' ? '应用参数未加载' : '工作流未加载'); return; }
    if(rhWorkflowEditorTitle) rhWorkflowEditorTitle.textContent = config.title || (rhEditorMode === 'app' ? 'RunningHub AI 应用' : 'RunningHub 工作流');
    if(rhWorkflowEditorSub) rhWorkflowEditorSub.textContent = rhEditorMode === 'app' ? `/run/ai-app/${config.appId}` : `/run/workflow/${config.workflowId}`;
    if(rhWorkflowEditName) rhWorkflowEditName.value = config.title || '';
    if(rhWorkflowEditNote) rhWorkflowEditNote.value = config.description || '';
    applyRhImageSlotDefaults(config);
    renderRhMappedPreview();
    renderRhEditorSourcePane();
    refreshIcons();
}
function renderRhMappedPreview(){
    const config = rhWorkflowEditorState.config;
    if(!config || !rhWorkflowEditorSummary || !rhWorkflowEditorNodeList) return;
    renderRhWorkflowEditorSummary();
    rhWorkflowEditorNodeList.innerHTML = renderRhMappedPreviewHtml(config);
    refreshIcons();
}
function renderRhMappedPreviewHtml(config){
    const enabledFields = rhEditorSortedFields((config.fields || []).filter(field => field.enabled === true));
    const title = config.title || (rhEditorMode === 'app' ? 'RunningHub AI 应用' : 'RunningHub 工作流');
    const mediaCounts = enabledFields.reduce((acc, field) => {
        const kind = rhWorkflowFieldKind(field);
        if(kind === 'IMAGE') acc.image += 1;
        else if(kind === 'VIDEO') acc.video += 1;
        else if(kind === 'AUDIO') acc.audio += 1;
        else acc.setting += 1;
        return acc;
    }, {image:0, video:0, audio:0, setting:0});
    const fieldsHtml = enabledFields.length
        ? enabledFields.map(field => renderRhPreviewControl(field)).join('')
        : `<div class="rh-preview-empty">勾选右侧参数后，这里会显示画布节点上的效果</div>`;
    const statusHtml = rhWorkflowEditorState.previewStatus
        ? `<div class="rh-preview-status">${escapeHtml(rhWorkflowEditorState.previewStatus)}</div>`
        : '';
    const outputsHtml = (rhWorkflowEditorState.previewOutputs || []).length
        ? `<div class="rh-preview-output-list">${rhWorkflowEditorState.previewOutputs.map(url => renderRhPreviewOutput(url)).join('')}</div>`
        : '';
    const workflowOptionsHtml = rhEditorMode === 'workflow' ? `
        <div class="rh-workflow-run-mode">
            <label>
                <span>空可选图</span>
                <select onchange="setRhWorkflowOptionalImageMode(this.value)">
                    <option value="prune-workflow" ${String(config.optionalImageMode || 'prune-workflow') === 'prune-workflow' ? 'selected' : ''}>裁剪 workflow JSON</option>
                    <option value="skip" ${String(config.optionalImageMode || '') === 'skip' ? 'selected' : ''}>不提交字段</option>
                </select>
            </label>
            <small>仅工作流生效。可选图片为空时，裁剪模式会移除该图片输入及相关连接。</small>
        </div>
    ` : '';
    return `
        <div class="rh-mapped-card">
            <div class="rh-mapped-head">
                <div class="rh-mapped-icon"><i data-lucide="${rhEditorMode === 'app' ? 'sparkles' : 'workflow'}" class="w-4 h-4"></i></div>
                <div>
                    <div class="rh-mapped-title">${escapeHtml(title)}</div>
                    <div class="rh-mapped-sub">${rhEditorMode === 'app' ? `/run/ai-app/${escapeHtml(config.appId || '')}` : `/run/workflow/${escapeHtml(config.workflowId || '')}`}</div>
                </div>
            </div>
            <div class="rh-mapped-stats">
                <span>图片 ${mediaCounts.image}</span>
                <span>视频 ${mediaCounts.video}</span>
                <span>音频 ${mediaCounts.audio}</span>
                <span>参数 ${mediaCounts.setting}</span>
            </div>
            <div class="rh-preview-fields">${fieldsHtml}</div>
            ${workflowOptionsHtml}
            <button class="rh-preview-run ${rhWorkflowEditorState.previewRunning ? 'running' : ''}" type="button" onclick="testRhMappedPreview()" ${rhWorkflowEditorState.previewRunning ? 'disabled' : ''}><i data-lucide="${rhWorkflowEditorState.previewRunning ? 'loader-2' : 'play'}" class="w-3.5 h-3.5 ${rhWorkflowEditorState.previewRunning ? 'spin-icon' : ''}"></i><span>${rhWorkflowEditorState.previewRunning ? '测试中...' : '测试'}</span></button>
            ${statusHtml}
            ${outputsHtml}
        </div>
    `;
}
function renderRhPreviewOutput(url){
    const safe = escapeAttr(url || '');
    if(/\.(mp4|webm|mov|m4v)(\?|$)/i.test(safe)) return `<video src="${safe}" controls muted playsinline preload="metadata"></video>`;
    if(/\.(mp3|wav|ogg|m4a|flac|aac)(\?|$)/i.test(safe)) return `<audio src="${safe}" controls preload="metadata"></audio>`;
    return `<img src="${safe}" alt="">`;
}
function renderRhPreviewControl(field){
    const key = rhWorkflowFieldKey(field);
    const label = escapeHtml(field.label || field.fieldName);
    const kind = rhWorkflowFieldKind(field);
    const previewState = rhWorkflowEditorState.previewParams[key] || {};
    if(field.sourceFromUpstream === false && !['IMAGE','VIDEO','AUDIO'].includes(kind)){
        return `<div class="rh-preview-field keep-original"><div class="rh-preview-label">${label}</div><div class="rh-preview-keep"><i data-lucide="lock" class="w-3.5 h-3.5"></i><span>保留工作流原设置</span></div></div>`;
    }
    const randomActive = field.random_enabled === true && previewState.randomActive !== false;
    const value = previewState.value ?? field.fieldValue ?? '';
    const options = Array.isArray(field.options) ? field.options : [];
    if(['IMAGE','VIDEO','AUDIO'].includes(kind)){
        const slot = rhEditorMode === 'workflow' && kind === 'IMAGE'
            ? `<span class="rh-preview-slot">图 ${Number(field.imageOrder) || 1} · ${field.required === true ? '必选' : '可选'}</span>`
            : '';
        const icon = kind === 'VIDEO' ? 'file-video' : kind === 'AUDIO' ? 'file-audio' : 'image';
        const media = previewState.url
            ? renderRhPreviewMedia(previewState.url, kind, previewState.name || value)
            : `<i data-lucide="${icon}" class="w-5 h-5"></i><span>点击上传</span>`;
        return `<div class="rh-preview-field"><div class="rh-preview-label">${label}${slot}</div><button class="rh-preview-media ${previewState.url ? 'has-media' : ''}" type="button" onclick="pickRhPreviewMedia('${escapeAttr(key)}','${kind}')">${media}</button></div>`;
    }
    if(kind === 'BOOLEAN'){
        const on = String(value).toLowerCase() === 'true';
        return `<div class="rh-preview-field"><div class="rh-preview-label">${label}</div><div class="rh-preview-switch ${on ? 'on' : ''}"><span></span></div></div>`;
    }
    if(options.length || kind === 'SELECT'){
        return `<div class="rh-preview-field"><div class="rh-preview-label">${label}</div><select disabled>${(options.length ? options : [value || '选项']).map(option => `<option>${escapeHtml(option)}</option>`).join('')}</select></div>`;
    }
    const randomButton = kind === 'NUMBER' && field.random_enabled
        ? `<button class="random-btn rh-preview-random-btn ${randomActive ? 'active' : ''}" type="button" onclick="toggleRhPreviewRandom('${escapeAttr(key)}')" title="${randomActive ? '使用随机数' : '使用固定数'}"><i data-lucide="dice-5" class="w-4 h-4"></i></button>`
        : '';
    const readonly = randomActive ? 'disabled' : '';
    return `<div class="rh-preview-field"><div class="rh-preview-label">${label}</div><div class="rh-preview-random-row" style="${randomButton ? '' : 'grid-template-columns:1fr'}"><input ${readonly} type="${kind === 'NUMBER' ? 'number' : 'text'}" value="${escapeAttr(value)}" placeholder="${kind === 'NUMBER' && randomActive ? '随机数' : ''}" oninput="updateRhPreviewValue('${escapeAttr(key)}', this.value)">${randomButton}</div></div>`;
}
function renderRhPreviewMedia(url, kind, name=''){
    const safe = escapeAttr(url || '');
    if(kind === 'VIDEO') return `<video src="${safe}" muted preload="metadata" playsinline controls></video>`;
    if(kind === 'AUDIO') return `<span class="rh-preview-audio"><i data-lucide="file-audio" class="w-5 h-5"></i>${escapeHtml(name || '音频')}</span><audio src="${safe}" controls preload="metadata"></audio>`;
    return `<img src="${safe}" alt="">`;
}
function mediaAcceptForRhKind(kind){
    if(kind === 'VIDEO') return 'video/*';
    if(kind === 'AUDIO') return 'audio/*';
    return 'image/*';
}
async function pickRhPreviewMedia(key, kind){
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = mediaAcceptForRhKind(kind);
    input.onchange = async () => {
        const file = input.files?.[0];
        if(!file) return;
        const localUrl = URL.createObjectURL(file);
        rhWorkflowEditorState.previewParams[key] = {...(rhWorkflowEditorState.previewParams[key] || {}), url:localUrl, name:file.name, uploading:true};
        renderRhMappedPreview();
        const form = new FormData();
        form.append('files', file);
        try {
            const data = await fetch('/api/ai/upload', {method:'POST', body:form}).then(async r => {
                const json = await r.json();
                if(!r.ok) throw new Error(json.detail || '上传失败');
                return json;
            });
            const uploaded = data.files?.[0];
            rhWorkflowEditorState.previewParams[key] = {
                ...(rhWorkflowEditorState.previewParams[key] || {}),
                url:uploaded?.url || localUrl,
                name:uploaded?.name || file.name,
                kind:uploaded?.kind || kind.toLowerCase(),
                uploading:false
            };
            withRhEditorScrollPreserved(() => renderRhMappedPreview());
        } catch(err) {
            rhWorkflowEditorState.previewParams[key] = {...(rhWorkflowEditorState.previewParams[key] || {}), uploading:false};
            withRhEditorScrollPreserved(() => renderRhMappedPreview());
            alert(err.message || '上传失败');
        }
    };
    input.click();
}
function toggleRhPreviewRandom(key){
    const state = rhWorkflowEditorState.previewParams[key] || {};
    const field = (rhWorkflowEditorState.config?.fields || []).find(item => rhWorkflowFieldKey(item) === key);
    rhWorkflowEditorState.previewParams[key] = {
        ...state,
        value:state.value ?? field?.fieldValue ?? '',
        randomActive:state.randomActive === false
    };
    withRhEditorScrollPreserved(() => renderRhMappedPreview());
}
function updateRhPreviewValue(key, value){
    const state = rhWorkflowEditorState.previewParams[key] || {};
    rhWorkflowEditorState.previewParams[key] = {...state, value, randomActive:false};
}
function rhPreviewRandomValue(field){
    const isFloat = Number(field.step) > 0 && Number(field.step) < 1;
    let min = Number.isFinite(Number(field.min)) ? Number(field.min) : null;
    let max = Number.isFinite(Number(field.max)) ? Number(field.max) : null;
    const name = `${field.fieldName || ''} ${field.label || ''}`.toLowerCase();
    const looksSeed = name.includes('seed') || name.includes('noise') || name.includes('随机') || name.includes('种子');
    if(min === null) min = looksSeed ? 1 : 0;
    if(max === null || max <= min) max = looksSeed ? 1000000000000000 : 999999;
    const value = min + Math.random() * (max - min);
    if(isFloat){
        const precision = Math.min(8, Math.max(1, String(field.step).split('.')[1]?.length || 2));
        return Number(value.toFixed(precision));
    }
    return Math.floor(value);
}
async function rhPreviewUploadValueIfNeeded(value){
    const text = String(value || '').trim();
    if(!text) return '';
    if(!/^https?:\/\//i.test(text) && !text.startsWith('/output/') && !text.startsWith('/assets/')) return text;
    const res = await fetch('/api/runninghub/upload-asset', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({url:text})
    });
    const data = await res.json();
    if(!res.ok || data.success === false) throw new Error(data.detail || data.error || 'RunningHub 素材上传失败');
    return data.data?.fileName || text;
}
async function buildRhPreviewNodeInfoList(){
    const config = rhWorkflowEditorState.config;
    const fields = rhEditorSortedFields((config?.fields || []).filter(field => field.enabled === true));
    const result = [];
    for(const field of fields){
        const key = rhWorkflowFieldKey(field);
        const kind = rhWorkflowFieldKind(field);
        if(field.sourceFromUpstream === false && !['IMAGE','VIDEO','AUDIO'].includes(kind)) continue;
        const preview = rhWorkflowEditorState.previewParams[key] || {};
        let value = preview.value ?? field.fieldValue ?? '';
        if(['IMAGE','VIDEO','AUDIO'].includes(kind)){
            if(rhEditorMode === 'workflow' && kind === 'IMAGE' && field.required !== true && !preview.url) continue;
            if(rhEditorMode === 'workflow' && kind === 'IMAGE' && field.required === true && !preview.url && !value) throw new Error(`缺少必选图片：${field.label || field.fieldName}`);
            value = await rhPreviewUploadValueIfNeeded(preview.url || value);
        } else if(kind === 'NUMBER' && field.random_enabled === true && preview.randomActive !== false) {
            value = rhPreviewRandomValue(field);
        }
        if(typeof value === 'string' && /[\r\n]/.test(value)) value = value.split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0] || '';
        result.push({nodeId:field.nodeId, fieldName:field.fieldName, fieldValue:value});
    }
    return result;
}
function rhPreviewPruneWorkflow(nodeInfoList){
    const config = rhWorkflowEditorState.config;
    if(rhEditorMode !== 'workflow' || (config?.optionalImageMode || 'prune-workflow') !== 'prune-workflow') return null;
    const submitted = new Set((nodeInfoList || []).map(item => rhWorkflowFieldKey(item)));
    const missing = rhEditorSortedFields(config.fields || []).filter(field => field.enabled === true && rhWorkflowFieldKind(field) === 'IMAGE' && field.required !== true && !submitted.has(rhWorkflowFieldKey(field)));
    if(!missing.length || !config.workflowJson) return null;
    const workflow = JSON.parse(JSON.stringify(config.workflowJson));
    const removeIds = new Set();
    missing.forEach(field => {
        const node = workflow[String(field.nodeId)];
        if(node?.inputs && Object.prototype.hasOwnProperty.call(node.inputs, field.fieldName)) delete node.inputs[field.fieldName];
        if(node?.inputs && !Object.keys(node.inputs).length) removeIds.add(String(field.nodeId));
    });
    removeIds.forEach(id => delete workflow[id]);
    Object.values(workflow).forEach(node => {
        Object.entries(node?.inputs || {}).forEach(([name, value]) => {
            if(Array.isArray(value) && removeIds.has(String(value[0]))) delete node.inputs[name];
        });
    });
    return workflow;
}
async function testRhMappedPreview(){
    const config = rhWorkflowEditorState.config;
    if(!config || rhWorkflowEditorState.previewRunning) return;
    rhWorkflowEditorState.previewRunning = true;
    rhWorkflowEditorState.previewStatus = '正在提交 RunningHub 任务...';
    rhWorkflowEditorState.previewOutputs = [];
    renderRhMappedPreview();
    try {
        const nodeInfoList = await buildRhPreviewNodeInfoList();
        const endpoint = rhEditorMode === 'workflow' ? '/api/runninghub/workflow-submit' : '/api/runninghub/submit';
        const workflow = rhPreviewPruneWorkflow(nodeInfoList);
        const body = rhEditorMode === 'workflow'
            ? {workflowId:String(config.workflowId || '').trim(), nodeInfoList, ...(workflow ? {workflow} : {})}
            : {webappId:String(config.appId || '').trim(), nodeInfoList};
        if(rhEditorMode === 'workflow' && !body.workflowId) throw new Error('workflowId 为空');
        if(rhEditorMode === 'app' && !body.webappId) throw new Error('webappId 为空');
        const submit = await fetch(endpoint, {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify(body)
        }).then(async r => {
            const data = await r.json();
            if(!r.ok || data.success === false) throw new Error(data.detail || data.error || 'RunningHub 提交失败');
            return data.data || data;
        });
        const taskId = submit.taskId;
        if(!taskId) throw new Error('RunningHub 没有返回 taskId');
        rhWorkflowEditorState.previewStatus = `任务已提交：${taskId}`;
        renderRhMappedPreview();
        let result = null;
        for(let i = 0; i < 720; i++){
            await new Promise(resolve => setTimeout(resolve, 2500));
            const data = await fetch(`/api/runninghub/query?taskId=${encodeURIComponent(taskId)}`).then(async r => {
                const json = await r.json();
                if(!r.ok || json.success === false) throw new Error(json.detail || json.error || 'RunningHub 查询失败');
                return json.data || json;
            });
            if(data.status === 'SUCCESS'){
                result = data;
                break;
            }
            if(data.status === 'FAILED') throw new Error(data.failReason || 'RunningHub 任务失败');
            rhWorkflowEditorState.previewStatus = data.status === 'QUEUED' ? '排队中...' : '运行中...';
            renderRhMappedPreview();
        }
        if(!result) throw new Error('RunningHub 任务超时');
        const outputs = result.urls || [];
        if(!outputs.length) throw new Error('RunningHub 没有返回产物');
        rhWorkflowEditorState.previewOutputs = outputs;
        rhWorkflowEditorState.previewStatus = '测试完成';
        setStatus('RunningHub 测试完成');
    } catch(err) {
        rhWorkflowEditorState.previewStatus = err.message || String(err);
        setStatus(rhWorkflowEditorState.previewStatus);
        alert(rhWorkflowEditorState.previewStatus);
    } finally {
        rhWorkflowEditorState.previewRunning = false;
        renderRhMappedPreview();
    }
}
function renderRhEditorSourcePane(){
    if(rhEditorMode === 'app') renderRhAppFieldCards();
    else renderRhWorkflowEditorGraph();
}
function renderRhWorkflowEditorSummary(){
    const config = rhWorkflowEditorState.config;
    if(!config || !rhWorkflowEditorSummary) return;
    const fields = config.fields || [];
    const enabled = fields.filter(field => field.enabled === true).length;
    const nodes = rhEditorMode === 'app' ? 1 : Object.keys(config.workflowJson || {}).length;
    const imageFields = fields.filter(field => field.enabled === true && rhWorkflowFieldKind(field) === 'IMAGE');
    const optionalImages = imageFields.filter(field => field.required !== true).length;
    rhWorkflowEditorSummary.innerHTML = `
        <div><span>${rhEditorMode === 'app' ? '应用' : '节点'}</span><strong>${nodes}</strong></div>
        <div><span>字段</span><strong>${enabled} / ${fields.length}</strong></div>
        ${rhEditorMode === 'workflow' ? `<div><span>可选图</span><strong>${optionalImages} / ${imageFields.length}</strong></div>` : ''}
    `;
}
function renderRhWorkflowEditorNodeList(){
    const config = rhWorkflowEditorState.config;
    if(!config || !rhWorkflowEditorNodeList) return;
    const groups = {};
    (config.fields || []).forEach(field => {
        const key = rhWorkflowGroupKey(field);
        (groups[key] = groups[key] || { field, items:[] }).items.push(field);
    });
    const values = Object.entries(groups);
    if(!values.length){
        rhWorkflowEditorNodeList.innerHTML = `<div class="rh-editor-empty">没有可配置字段</div>`;
        return;
    }
    rhWorkflowEditorNodeList.innerHTML = values.map(([groupKey, group]) => {
        const safeGroup = groupKey.replace(/[^a-zA-Z0-9_-]/g, '_');
        const expanded = rhWorkflowEditorState.expanded[safeGroup] !== false;
        const enabledCount = group.items.filter(field => field.enabled === true).length;
        return `
            <div class="rh-editor-node ${expanded ? 'expanded' : ''} ${String(group.field.nodeId) === rhWorkflowEditorState.activeNodeId ? 'is-focused' : ''}" data-node-id="${escapeAttr(group.field.nodeId)}">
                <button class="rh-editor-node-head" type="button" onclick="toggleRhWorkflowEditorGroup('${escapeAttr(safeGroup)}')">
                    <span>
                        <strong>${escapeHtml(group.field.group || `Node #${group.field.nodeId}`)}</strong>
                        <small>#${escapeHtml(group.field.nodeId)} · ${enabledCount}/${group.items.length}</small>
                    </span>
                    <i data-lucide="chevron-down" class="w-4 h-4"></i>
                </button>
                <div class="rh-editor-node-body">
                    ${group.items.map(field => renderRhWorkflowEditorField(field)).join('')}
                </div>
            </div>
        `;
    }).join('');
}
function renderRhWorkflowEditorField(field){
    const key = rhWorkflowFieldKey(field);
    const checked = field.enabled === true;
    const type = rhWorkflowFieldKind(field);
    const optionsText = Array.isArray(field.options) ? field.options.join('\n') : '';
    const randomOn = field.random_enabled === true;
    const keepOriginal = field.sourceFromUpstream === false;
    const imageSlotControls = rhEditorMode === 'workflow' && type === 'IMAGE' ? `
        <div class="rh-image-slot-row">
            <label><span>排序</span><input type="number" min="1" step="1" value="${escapeAttr(field.imageOrder || '')}" oninput="updateRhWorkflowEditorField('${escapeAttr(key)}','imageOrder',this.value)"></label>
            <button class="rh-editor-required ${field.required === true ? 'active' : ''}" type="button" onclick="updateRhWorkflowEditorField('${escapeAttr(key)}','required',${field.required === true ? 'false' : 'true'})">
                <span class="check-dot"></span>${field.required === true ? '必选' : '可选'}
            </button>
        </div>
    ` : '';
    return `
        <div class="rh-editor-field-row ${checked ? 'active' : ''}">
            <button class="rh-editor-check ${checked ? 'checked' : ''}" type="button" onclick="toggleRhWorkflowEditorField('${escapeAttr(key)}')">${checked ? '<i data-lucide="check" class="w-3 h-3"></i>' : ''}</button>
            <div class="rh-editor-field-main">
                <div class="rh-editor-field-name">${escapeHtml(field.label || field.fieldName)}</div>
                <div class="rh-editor-field-meta">${escapeHtml(field.fieldName)} · ${escapeHtml(type)}</div>
                <button class="rh-editor-keep ${keepOriginal ? 'active' : ''}" type="button" onclick="updateRhWorkflowEditorField('${escapeAttr(key)}','sourceFromUpstream',${keepOriginal ? 'true' : 'false'})">
                    <span class="check-dot"></span>${keepOriginal ? '保留工作流原设置' : '暴露并覆盖参数'}
                </button>
                <div class="rh-editor-field-controls">
                    <input type="text" value="${escapeAttr(field.label || '')}" placeholder="显示名称" oninput="updateRhWorkflowEditorField('${escapeAttr(key)}','label',this.value)">
                    <select onchange="updateRhWorkflowEditorField('${escapeAttr(key)}','fieldType',this.value)">
                        ${['TEXT','NUMBER','BOOLEAN','SELECT','IMAGE','VIDEO','AUDIO'].map(option => `<option value="${option}" ${String(field.fieldType || type).toUpperCase() === option ? 'selected' : ''}>${rhWorkflowFieldTypeLabel(option)}</option>`).join('')}
                    </select>
                </div>
                ${imageSlotControls}
                <div class="rh-editor-field-controls rh-editor-wide-controls">
                    <textarea placeholder="下拉选项：每行一个，例如 1024x1024" oninput="updateRhWorkflowEditorField('${escapeAttr(key)}','options',this.value)">${escapeHtml(optionsText)}</textarea>
                </div>
                <div class="rh-editor-random-row">
                    <button class="rh-editor-random ${randomOn ? 'active' : ''}" type="button" onclick="updateRhWorkflowEditorField('${escapeAttr(key)}','random_enabled',${randomOn ? 'false' : 'true'})"><i data-lucide="dice-5" class="w-3.5 h-3.5"></i><span>随机数</span></button>
                    <input type="number" value="${escapeAttr(field.min ?? '')}" placeholder="最小" oninput="updateRhWorkflowEditorField('${escapeAttr(key)}','min',this.value)">
                    <input type="number" value="${escapeAttr(field.max ?? '')}" placeholder="最大" oninput="updateRhWorkflowEditorField('${escapeAttr(key)}','max',this.value)">
                    <input type="number" value="${escapeAttr(field.step ?? '')}" placeholder="步长" oninput="updateRhWorkflowEditorField('${escapeAttr(key)}','step',this.value)">
                </div>
            </div>
        </div>
    `;
}
function renderRhAppFieldCards(){
    const config = rhWorkflowEditorState.config;
    if(!rhWorkflowEditorGraphWrap || !config) return;
    closeRhNodePopover();
    rhWorkflowEditorGraphWrap.classList.add('rh-app-field-wrap');
    rhWorkflowEditorGraphWrap.innerHTML = `
        <div class="rh-app-field-list">
            ${(config.fields || []).length
                ? (config.fields || []).map(field => renderRhAppFieldCard(field)).join('')
                : `<div class="rh-editor-empty">没有拉取到应用参数</div>`}
        </div>
    `;
    refreshIcons();
}
function restoreRhGraphWrap(){
    if(!rhWorkflowEditorGraphWrap || rhWorkflowEditorGraphSvg?.parentElement === rhWorkflowEditorGraphWrap) return;
    rhWorkflowEditorGraphWrap.classList.remove('rh-app-field-wrap');
    rhWorkflowEditorGraphWrap.innerHTML = `
        <svg id="rhWorkflowEditorGraphSvg" class="rh-editor-graph-svg"></svg>
        <div class="rh-editor-graph-controls">
            <button type="button" onclick="rhEditorGraphZoom(-1)" title="缩小"><i data-lucide="zoom-out" class="w-4 h-4"></i></button>
            <span id="rhWorkflowEditorZoom">100%</span>
            <button type="button" onclick="rhEditorGraphZoom(1)" title="放大"><i data-lucide="zoom-in" class="w-4 h-4"></i></button>
            <button type="button" onclick="rhEditorGraphFit()" title="适应窗口"><i data-lucide="maximize" class="w-4 h-4"></i></button>
        </div>
    `;
    rhWorkflowEditorGraphSvg = document.getElementById('rhWorkflowEditorGraphSvg');
    rhWorkflowEditorZoom = document.getElementById('rhWorkflowEditorZoom');
}
function renderRhAppFieldCard(field){
    const key = rhWorkflowFieldKey(field);
    const checked = field.enabled === true;
    return `
        <div class="rh-app-field-card ${checked ? 'active' : ''}" data-field-key="${escapeAttr(key)}" onclick="openRhAppFieldPopover('${escapeAttr(key)}', this)">
            <button class="rh-editor-check ${checked ? 'checked' : ''}" type="button" onclick="event.stopPropagation();toggleRhWorkflowEditorField('${escapeAttr(key)}')">${checked ? '<i data-lucide="check" class="w-3 h-3"></i>' : ''}</button>
            <div>
                <strong>${escapeHtml(field.label || field.fieldName)}</strong>
                <span>${escapeHtml(field.fieldName)} · ${escapeHtml(rhWorkflowFieldKind(field))}</span>
            </div>
            <i data-lucide="settings-2" class="w-4 h-4"></i>
        </div>
    `;
}
function openRhAppFieldPopover(key, anchorEl){
    const config = rhWorkflowEditorState.config;
    const field = (config?.fields || []).find(item => rhWorkflowFieldKey(item) === key);
    if(!field) return;
    closeRhNodePopover();
    const pop = document.createElement('div');
    pop.id = 'rhNodePopover';
    pop.className = 'rh-node-popover rh-app-popover';
    pop.dataset.fieldKey = String(key || '');
    pop.innerHTML = `
        <div class="rh-popover-head">
            <div>
                <strong>${escapeHtml(field.label || field.fieldName)}</strong>
                <span>${escapeHtml(field.fieldName)}</span>
            </div>
            <button type="button" onclick="closeRhNodePopover()"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>
        </div>
        <div class="rh-popover-body">${renderRhWorkflowEditorField(field)}</div>
    `;
    document.body.appendChild(pop);
    const rect = anchorEl?.getBoundingClientRect?.();
    const modalRect = rhWorkflowEditorOverlay?.getBoundingClientRect?.() || {left:0, top:0, right:window.innerWidth, bottom:window.innerHeight};
    const width = 390;
    let left = rect ? rect.left : window.innerWidth / 2 - 190;
    let top = rect ? rect.bottom + 10 : window.innerHeight / 2 - 180;
    if(left + width > modalRect.right - 16) left = modalRect.right - width - 16;
    if(top + 420 > modalRect.bottom - 16) top = Math.max(modalRect.top + 74, (rect?.top || top) - 420);
    pop.style.left = `${Math.max(modalRect.left + 16, left)}px`;
    pop.style.top = `${top}px`;
    refreshIcons();
}
function computeRhWorkflowEditorLayers(workflow){
    const ids = Object.keys(workflow || {});
    const incoming = {}, outgoing = {};
    ids.forEach(id => { incoming[id] = new Set(); outgoing[id] = new Set(); });
    ids.forEach(id => {
        Object.values(workflow[id]?.inputs || {}).forEach(value => {
            if(Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && workflow[value[0]]){
                incoming[id].add(value[0]);
                outgoing[value[0]].add(id);
            }
        });
    });
    const layer = {};
    const visiting = new Set();
    function dfs(id, lv){
        if(visiting.has(id)) return;
        layer[id] = Math.max(layer[id] || 0, lv);
        visiting.add(id);
        outgoing[id].forEach(child => dfs(child, lv + 1));
        visiting.delete(id);
    }
    ids.forEach(id => { if(incoming[id].size === 0) dfs(id, 0); });
    ids.forEach(id => { if(!(id in layer)) layer[id] = 0; });
    const buckets = {};
    ids.forEach(id => { (buckets[layer[id]] = buckets[layer[id]] || []).push(id); });
    return { buckets };
}
function renderRhWorkflowEditorGraph(){
    const config = rhWorkflowEditorState.config;
    restoreRhGraphWrap();
    closeRhNodePopover();
    const workflow = config?.workflowJson || {};
    const svg = rhWorkflowEditorGraphSvg;
    const wrap = rhWorkflowEditorGraphWrap;
    if(!svg || !wrap) return;
    if(!workflow || !Object.keys(workflow).length){
        svg.innerHTML = `<text x="24" y="42" fill="currentColor">暂无工作流预览</text>`;
        return;
    }
    const { buckets } = computeRhWorkflowEditorLayers(workflow);
    const NODE_W = 136, NODE_H = 52, X_GAP = 42, Y_GAP = 16;
    const positions = {};
    const levels = Object.keys(buckets).map(Number).sort((a,b)=>a-b);
    let maxRows = 0;
    levels.forEach(lv => {
        const ids = buckets[lv].sort((a,b)=>parseInt(a,10)-parseInt(b,10));
        ids.forEach((id, idx) => positions[id] = { x:lv * (NODE_W + X_GAP) + 18, y:idx * (NODE_H + Y_GAP) + 18 });
        maxRows = Math.max(maxRows, ids.length);
    });
    const edges = [];
    Object.keys(workflow).forEach(toId => {
        const seen = new Set();
        Object.values(workflow[toId]?.inputs || {}).forEach(value => {
            if(Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && positions[value[0]] && positions[toId]){
                if(seen.has(value[0])) return;
                seen.add(value[0]);
                const from = positions[value[0]], to = positions[toId];
                const x1 = from.x + NODE_W, y1 = from.y + NODE_H / 2;
                const x2 = to.x, y2 = to.y + NODE_H / 2;
                const cx = (x1 + x2) / 2;
                edges.push(`<path class="rh-editor-edge" d="M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}"></path>`);
            }
        });
    });
    const activeNodes = new Set((config.fields || []).filter(field => field.enabled === true).map(field => String(field.nodeId)));
    const nodes = Object.entries(workflow).map(([id, node]) => {
        const pos = positions[id];
        const title = workflowNodeTitle(node);
        const klass = workflowNodeClass(node);
        const cat = workflowNodeCategory(node);
        const count = (config.fields || []).filter(field => field.enabled === true && String(field.nodeId) === String(id)).length;
        return `
            <g class="rh-editor-gnode cat-${cat} ${activeNodes.has(String(id)) ? 'has-exposed' : ''} ${String(id) === rhWorkflowEditorState.activeNodeId ? 'is-active' : ''}" data-node-id="${escapeAttr(id)}" transform="translate(${pos.x},${pos.y})" onclick="openRhWorkflowNodePopover('${escapeAttr(id)}', this)">
                <rect width="${NODE_W}" height="${NODE_H}" rx="8"></rect>
                <text class="rh-editor-gtitle" x="10" y="20">${escapeHtml(title.length > 15 ? title.slice(0, 15) + '...' : title)}</text>
                <text class="rh-editor-gsub" x="10" y="36">${escapeHtml(klass.length > 18 ? klass.slice(0, 18) + '...' : klass)}</text>
                <text class="rh-editor-gsub" x="${NODE_W - 8}" y="20" text-anchor="end">#${escapeHtml(id)}</text>
                ${count ? `<text class="rh-editor-gbadge" x="${NODE_W - 8}" y="43" text-anchor="end">${count}</text>` : ''}
            </g>
        `;
    }).join('');
    rhWorkflowEditorState.graph.w = levels.length * (NODE_W + X_GAP) + 18;
    rhWorkflowEditorState.graph.h = maxRows * (NODE_H + Y_GAP) + 18;
    svg.setAttribute('viewBox', `0 0 ${wrap.clientWidth || 800} ${wrap.clientHeight || 520}`);
    svg.innerHTML = `<g id="rhWorkflowEditorViewport" transform="translate(${rhWorkflowEditorState.graph.x},${rhWorkflowEditorState.graph.y}) scale(${rhWorkflowEditorState.graph.k})">${edges.join('')}${nodes}</g>`;
    bindRhWorkflowEditorPanZoom();
    updateRhEditorZoom();
}
function updateRhEditorZoom(){
    if(rhWorkflowEditorZoom) rhWorkflowEditorZoom.textContent = Math.round((rhWorkflowEditorState.graph.k || 1) * 100) + '%';
}
function applyRhEditorGraphTransform(){
    const vp = document.getElementById('rhWorkflowEditorViewport');
    const g = rhWorkflowEditorState.graph;
    if(vp) vp.setAttribute('transform', `translate(${g.x},${g.y}) scale(${g.k})`);
    updateRhEditorZoom();
}
function rhEditorGraphZoom(dir){
    const wrap = rhWorkflowEditorGraphWrap;
    if(!wrap) return;
    const g = rhWorkflowEditorState.graph;
    const factor = dir > 0 ? 1.2 : 1 / 1.2;
    const newK = Math.max(0.2, Math.min(3, g.k * factor));
    const cx = wrap.clientWidth / 2;
    const cy = wrap.clientHeight / 2;
    g.x = cx - (cx - g.x) * (newK / g.k);
    g.y = cy - (cy - g.y) * (newK / g.k);
    g.k = newK;
    applyRhEditorGraphTransform();
}
function rhEditorGraphFit(){
    const wrap = rhWorkflowEditorGraphWrap;
    const g = rhWorkflowEditorState.graph;
    if(!wrap || !g.w || !g.h) return;
    const pad = 24;
    const k = Math.max(0.2, Math.min(2, Math.min((wrap.clientWidth - pad * 2) / g.w, (wrap.clientHeight - pad * 2) / g.h)));
    g.k = k;
    g.x = (wrap.clientWidth - g.w * k) / 2;
    g.y = (wrap.clientHeight - g.h * k) / 2;
    applyRhEditorGraphTransform();
}
function bindRhWorkflowEditorPanZoom(){
    const svg = rhWorkflowEditorGraphSvg;
    const wrap = rhWorkflowEditorGraphWrap;
    if(!svg || !wrap || svg.dataset.editorPanZoomBound) return;
    svg.dataset.editorPanZoomBound = '1';
    rhWorkflowEditorState.bound = true;
    wrap.addEventListener('wheel', event => {
        if(!rhWorkflowEditorState.open) return;
        event.preventDefault();
        const g = rhWorkflowEditorState.graph;
        const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
        const newK = Math.max(0.2, Math.min(3, g.k * factor));
        const rect = wrap.getBoundingClientRect();
        const mx = event.clientX - rect.left;
        const my = event.clientY - rect.top;
        g.x = mx - (mx - g.x) * (newK / g.k);
        g.y = my - (my - g.y) * (newK / g.k);
        g.k = newK;
        applyRhEditorGraphTransform();
    }, { passive:false });
    svg.addEventListener('mousedown', event => {
        if(!rhWorkflowEditorState.open) return;
        event.preventDefault();
        rhWorkflowEditorState.pan = { sx:event.clientX, sy:event.clientY, ox:rhWorkflowEditorState.graph.x, oy:rhWorkflowEditorState.graph.y };
        wrap.classList.add('is-panning');
    });
    window.addEventListener('mousemove', event => {
        const pan = rhWorkflowEditorState.pan;
        if(!pan) return;
        rhWorkflowEditorState.graph.x = pan.ox + event.clientX - pan.sx;
        rhWorkflowEditorState.graph.y = pan.oy + event.clientY - pan.sy;
        applyRhEditorGraphTransform();
    });
    window.addEventListener('mouseup', () => {
        if(rhWorkflowEditorState.pan){
            rhWorkflowEditorState.pan = null;
            wrap.classList.remove('is-panning');
        }
    });
}
function renderRunningHubCards(){
    const item = provider();
    if(!item || item.id !== 'runninghub'){
        if(rhAppsList) rhAppsList.innerHTML = '';
        if(rhWorkflowsList) rhWorkflowsList.innerHTML = '';
        return;
    }
    ensureRunningHubLists(item);
    if(rhAppsCount) rhAppsCount.textContent = item.rh_apps.length;
    if(rhWorkflowsCount) rhWorkflowsCount.textContent = item.rh_workflows.length;
    renderRhEntryList(rhAppsList, item.rh_apps, 'app');
    renderRhEntryList(rhWorkflowsList, item.rh_workflows, 'workflow');
    refreshIcons();
}
function renderRhEntryList(target, list, kind){
    if(!target) return;
    if(!list.length){
        target.innerHTML = `<div class="rh-empty">${kind === 'app' ? '粘贴 /run/ai-app/... 自动创建 AI 应用卡片' : '粘贴 /run/workflow/... 自动创建工作流卡片'}</div>`;
        return;
    }
    target.innerHTML = list.map((entry, index) => `
        <div class="rh-config-card">
            <button class="rh-thumb" type="button" onclick="pickRhThumbnail('${kind}', ${index})" title="上传缩略图">
                ${entry.thumbnail ? `<img src="${escapeAttr(entry.thumbnail)}" alt="">` : `<i data-lucide="${kind === 'app' ? 'sparkles' : 'workflow'}" class="w-5 h-5"></i>`}
            </button>
            <div class="rh-card-main">
                <input type="text" value="${escapeAttr(entry.title || '')}" oninput="updateRhEntry('${kind}', ${index}, 'title', this.value)" placeholder="${kind === 'app' ? 'AI 应用名称' : '工作流名称'}">
                <div class="rh-id-line"><i data-lucide="hash" class="w-3 h-3"></i><span>${escapeHtml(kind === 'app' ? `/run/ai-app/${entry.id}` : `/run/workflow/${entry.id}`)}</span></div>
                <textarea oninput="updateRhEntry('${kind}', ${index}, 'note', this.value)" placeholder="备注、用途、参数说明">${escapeHtml(entry.note || '')}</textarea>
            </div>
            <div class="rh-card-actions">
                ${kind === 'workflow'
                    ? `<button class="rh-card-action" type="button" onclick="openRhWorkflowEditor(${index})" title="编辑工作流"><i data-lucide="settings-2" class="w-3.5 h-3.5"></i></button>`
                    : `<button class="rh-card-action" type="button" onclick="openRhAppEditor(${index})" title="编辑应用参数"><i data-lucide="settings-2" class="w-3.5 h-3.5"></i></button>`}
                <button class="rh-card-action danger" type="button" onclick="removeRhEntry('${kind}', ${index})" title="删除"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
            </div>
        </div>
    `).join('');
}
function openRecommendApi(){
    renderRecommendApi();
    if(recommendApiOverlay) recommendApiOverlay.style.display = 'flex';
    refreshIcons();
}
function closeRecommendApi(){
    if(recommendApiOverlay) recommendApiOverlay.style.display = 'none';
}
function renderRecommendApi(){
    if(!recommendApiList) return;
    recommendApiList.innerHTML = RECOMMENDED_APIS.map((api, index) => `
        <section class="recommend-card">
            <div class="recommend-name">
                <span>${escapeHtml(api.name)}</span>
                <span class="recommend-badge">${escapeHtml(api.protocol === 'apimart' ? 'APIMart' : 'OpenAI')}</span>
            </div>
            <div class="recommend-tags">
                ${api.tags.map(tag => `<span class="recommend-tag"><i data-lucide="${tag.toLowerCase().includes('视频') ? 'clapperboard' : tag.toLowerCase().includes('llm') || tag.toLowerCase().includes('codex') ? 'bot' : 'image'}" class="w-3 h-3"></i>${escapeHtml(tag)}</span>`).join('')}
            </div>
            <div class="recommend-actions">
                <a class="recommend-register" href="${escapeAttr(api.register_url)}" target="_blank" rel="noopener noreferrer"><i data-lucide="external-link" class="w-3.5 h-3.5"></i><span data-i18n="api.register">注册</span></a>
                <button class="recommend-fill" type="button" onclick="applyRecommendedApi(${index})"><i data-lucide="wand-sparkles" class="w-3.5 h-3.5"></i><span data-i18n="api.autoFill">自动填写</span></button>
            </div>
        </section>
    `).join('');
    if(window.StudioI18n) window.StudioI18n.apply(recommendApiList);
}
function applyRecommendedApi(index){
    const api = RECOMMENDED_APIS[index];
    if(!api) return;
    syncEditor();
    let item = providers.find(provider => String(provider.name || '').toLowerCase() === api.name.toLowerCase());
    if(!item){
        const baseId = normalizeId(api.name) || 'custom-api';
        let id = baseId;
        let suffix = 2;
        while(providers.some(provider => provider.id === id)) id = `${baseId}-${suffix++}`;
        item = {
            id,
            name:api.name,
            base_url:api.base_url,
            protocol:api.protocol,
            image_generation_endpoint:'',
            image_edit_endpoint:'',
            enabled:true,
            primary:false,
            image_models:[],
            chat_models:[],
            video_models:[],
            has_key:false,
            key_preview:''
        };
        providers.push(item);
    }
    selectedId = item.id;
    renderEditor();
    nameInput.value = api.name;
    baseInput.value = api.base_url;
    if(protocolInput){
        protocolInput.value = api.protocol;
        protocolInput.dispatchEvent(new Event('change'));
    }
    if(imageGenerationEndpointInput) imageGenerationEndpointInput.value = '';
    if(imageEditEndpointInput) imageEditEndpointInput.value = '';
    syncEditor();
    updateIdPreview();
    renderProviderList();
    editorTitle.textContent = item.name || item.id;
    closeRecommendApi();
    setStatus(`已填写 ${api.name}，请填入 API Key 后保存或验证。`);
}
function sortedProviders(){
    const order = ['modelscope', 'runninghub', 'comfly'];
    return visibleProviders().sort((a, b) => {
        const ai = order.indexOf(a.id);
        const bi = order.indexOf(b.id);
        if(ai === -1 && bi === -1) return 0;
        if(ai === -1) return 1;
        if(bi === -1) return -1;
        return ai - bi;
    });
}
function renderProviderList(){
    providerList.innerHTML = sortedProviders().map(item => {
        const active = item.id === selectedId ? 'active' : '';
        if(item.id === 'modelscope'){
            return `
                <button class="provider-card provider-card-banner ${active}" type="button" onclick="selectProvider('${escapeHtml(item.id)}')">
                    <img src="/static/images/modelscope.gif" alt="ModelScope" class="ms-icon-light">
                    <img src="/static/images/modelscope-1.gif" alt="ModelScope" class="ms-icon-dark">
                </button>
            `;
        }
        if(item.id === 'runninghub'){
            return `
                <button class="provider-card provider-card-banner ${active}" type="button" onclick="selectProvider('${escapeHtml(item.id)}')">
                    <img src="/static/images/RunningHub-B.png" alt="RunningHub" class="runninghub-icon ms-icon-light">
                    <img src="/static/images/RunningHub-W.png" alt="RunningHub" class="runninghub-icon ms-icon-dark">
                </button>
            `;
        }
        return `
            <button class="provider-card ${active}" type="button" onclick="selectProvider('${escapeHtml(item.id)}')">
                <span class="provider-mark"><i data-lucide="${item.has_key ? 'key-round' : 'key'}" class="w-4 h-4"></i></span>
                <span class="min-w-0">
                    <div class="provider-name">${escapeHtml(item.name || item.id)}</div>
                    <div class="provider-meta">${escapeHtml(item.base_url || '未配置地址')}</div>
                </span>
            </button>
        `;
    }).join('');
    refreshIcons();
}
function renderEditor(){
    const item = provider();
    if(!item) return;
    editorTitle.textContent = item.name || item.id;
    nameInput.value = item.name || '';
    idInput.value = item.id || '';
    updateIdPreview();
    clearVerifyResult();
    baseInput.value = item.base_url || '';
    if(protocolInput) protocolInput.value = item.id === 'runninghub' ? 'openai' : (item.protocol || 'openai');
    if(imageGenerationEndpointInput) imageGenerationEndpointInput.value = item.image_generation_endpoint || '';
    if(imageEditEndpointInput) imageEditEndpointInput.value = item.image_edit_endpoint || '';
    toggleAdvancedEndpoints(false);
    keyInput.value = '';
    keyInput.placeholder = item.has_key ? `${tr('api.keepCurrentKey')} ${item.key_preview || ''}` : tr('api.enterKey');
    keyHint.textContent = item.has_key ? `${tr('api.keySaved')}${item.key_env || 'API/.env'}` : tr('api.noKey');
    const isModelScope = item.id === 'modelscope';
    const isRunningHub = item.id === 'runninghub';
    if(isRunningHub){
        ensureRunningHubLists(item);
        if(rhFreeKeyInput){
            rhFreeKeyInput.value = '';
            rhFreeKeyInput.placeholder = item.has_key ? `保持当前免费积分 Key ${item.key_preview || ''}` : '输入免费积分 API Key';
        }
        if(rhWalletKeyInput){
            rhWalletKeyInput.value = '';
            rhWalletKeyInput.placeholder = item.has_wallet_key ? `保持当前账户余额 Key ${item.wallet_key_preview || ''}` : '输入账户余额 API Key';
        }
        if(rhFreeKeyHint) rhFreeKeyHint.textContent = rhFreeKeyHintText(item);
        if(rhWalletKeyHint) rhWalletKeyHint.textContent = rhWalletKeyHintText(item);
        renderRunningHubCards();
    }
    document.body.classList.toggle('show-ms', isModelScope);
    document.body.classList.toggle('show-runninghub', isRunningHub);
    if(runninghubConfigBlock){
        runninghubConfigBlock.hidden = !isRunningHub;
        runninghubConfigBlock.style.display = isRunningHub ? 'flex' : 'none';
    }
    if(!isRunningHub){
        if(rhPasteInput) rhPasteInput.value = '';
        if(rhAppsList) rhAppsList.innerHTML = '';
        if(rhWorkflowsList) rhWorkflowsList.innerHTML = '';
        if(rhAppsCount) rhAppsCount.textContent = '0';
        if(rhWorkflowsCount) rhWorkflowsCount.textContent = '0';
    }
    if(msLoraBlock) msLoraBlock.style.display = isModelScope ? 'flex' : 'none';
    const deleteBtn = document.getElementById('deleteBtn');
    if(deleteBtn) deleteBtn.style.display = (item.id === 'modelscope' || item.id === 'runninghub') ? 'none' : 'inline-flex';
    renderModels('image');
    renderModels('chat');
    renderModels('video');
    if(isModelScope) renderMsLoras();
    else if(msLoraList) msLoraList.innerHTML = '';
    renderProviderList();
}
function showVerifyResult(html){ const el = document.getElementById('verifyResult'); if(el){ el.style.display = 'block'; el.innerHTML = html; } }
function clearVerifyResult(){ const el = document.getElementById('verifyResult'); if(el){ el.style.display = 'none'; el.innerHTML = ''; } }
function currentProviderApiKey(item){
    if(item?.id === 'runninghub'){
        return rhWalletKeyInput?.value.trim() || rhFreeKeyInput?.value.trim() || '';
    }
    return keyInput.value.trim();
}

async function probeAsync(){
    const item = provider();
    if(!item) return;
    const btn = document.getElementById('probeAsyncBtn');
    const baseUrl = baseInput.value.trim();
    if(!baseUrl){ alert('请先填写请求地址'); return; }
    if(btn){ btn.disabled = true; btn.querySelector('span').textContent = '检测中...'; }
    showVerifyResult(`<span style="color:var(--muted);font-size:11px;font-weight:700">正在检测协议类型...</span>`);
    try {
        const apiKey = currentProviderApiKey(item);
        const data = await fetch('/api/providers/probe-async', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ base_url: baseUrl, api_key: apiKey, provider_id: item.id })
        }).then(async r => {
            if(!r.ok) throw new Error((await r.json()).detail || '请求失败');
            return r.json();
        });
        const isAsync = data.ok === true;
        // 自动设置协议下拉
        if(protocolInput && !['gemini', 'volcengine'].includes(protocolInput.value)){
            protocolInput.value = isAsync ? 'apimart' : 'openai';
            // 触发 change 以便其他地方同步
            protocolInput.dispatchEvent(new Event('change'));
        }
        const rawJson = JSON.stringify(data.raw, null, 2);
        const color = isAsync ? '#15803d' : data.ok === null ? '#b45309' : '#64748b';
        const icon = isAsync ? '✓' : '⚠';
        const proto = isAsync ? 'APIMart 异步' : 'OpenAI 兼容';
        showVerifyResult(`
            <div style="font-size:11px;font-weight:800;color:${color}">${icon} ${escapeHtml(data.message)}</div>
            <div style="font-size:11px;color:var(--muted);font-weight:700;margin-top:2px">协议已自动设置为：<strong style="color:var(--text)">${proto}</strong></div>
            <details style="margin-top:6px">
                <summary style="font-size:10.5px;color:var(--muted);cursor:pointer;font-weight:700;user-select:none">▸ 查看原始响应 (HTTP ${data.status_code})</summary>
                <pre style="margin-top:6px;padding:10px 12px;border-radius:10px;background:var(--soft);border:1px solid var(--line-2);font-size:10.5px;font-family:ui-monospace,Menlo,monospace;white-space:pre-wrap;word-break:break-all;color:var(--text);max-height:200px;overflow:auto">${escapeHtml(rawJson)}</pre>
            </details>`);
    } catch(e){
        const keepManualProtocol = ['gemini', 'volcengine'].includes(protocolInput?.value || '');
        if(protocolInput && !keepManualProtocol){ protocolInput.value = 'openai'; protocolInput.dispatchEvent(new Event('change')); }
        const suffix = keepManualProtocol ? '，已保留当前手动选择的协议' : '，协议已设为 OpenAI 兼容';
        showVerifyResult(`<div style="font-size:11px;font-weight:800;color:#b45309">⚠ ${escapeHtml(e.message || String(e))}${suffix}</div>`);
    } finally {
        if(btn){ btn.disabled = false; btn.querySelector('span').textContent = '验证协议'; refreshIcons(); }
    }
}

async function testConnection(){
    const item = provider();
    if(!item) return;
    const btn = document.getElementById('testUrlBtn');
    const baseUrl = baseInput.value.trim();
    if(!baseUrl){ alert('请先填写请求地址'); return; }
    if(btn){ btn.disabled = true; btn.querySelector('span').textContent = tr('api.testingUrl') || '验证中...'; }
    showVerifyResult(`<span style="color:var(--muted);font-size:11px;font-weight:700">验证中...</span>`);
    try {
        const apiKey = currentProviderApiKey(item);
        const data = await fetch('/api/providers/test-connection', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ base_url: baseUrl, api_key: apiKey, provider_id: item.id, protocol: protocolInput?.value || 'openai' })
        }).then(async r => {
            if(!r.ok) throw new Error((await r.json()).detail || (tr('api.urlInvalid') || '验证失败'));
            return r.json();
        });
        if(data.ok){
            // 存入 picker 状态并启用「选择模型」按钮，但不自动弹出
            lastFetchedAll = data.all || [];
            lastFetchedSuggestion = {
                image: new Set(data.image_models || []),
                chat: new Set(data.chat_models || []),
                video: new Set(data.video_models || []),
            };
            const openBtn = document.getElementById('openPickerBtn');
            if(openBtn){ openBtn.disabled = false; openBtn.style.opacity = '1'; }
            showVerifyResult(`<span style="color:#15803d;font-size:11px;font-weight:800">✓ 地址验证通过 · 找到 ${data.model_count} 个模型</span>`);
        } else {
            showVerifyResult(`
                <div style="font-size:11px;font-weight:800;color:#b45309">⚠ 地址验证未通过 (HTTP ${data.status})</div>
                <div style="font-size:11px;color:var(--muted);font-weight:600;margin-top:3px">${escapeHtml((data.message || '').slice(0,200))}</div>`);
        }
    } catch(e){
        showVerifyResult(`<div style="font-size:11px;font-weight:800;color:#b45309">⚠ ${escapeHtml(e.message || String(e))}</div>`);
    } finally {
        if(btn){ btn.disabled = false; btn.querySelector('span').textContent = tr('api.testUrl') || '验证地址'; }
    }
}
let lastFetchedAll = [];          // 全部模型 id 列表
let lastFetchedSuggestion = null; // 后端自动分类建议

async function fetchModels(){
    const item = provider();
    if(!item) return;
    syncEditor();
    const btn = document.getElementById('fetchModelsBtn');
    const baseUrl = baseInput.value.trim();
    const apiKey = currentProviderApiKey(item);
    if(!baseUrl){ alert('请先填写请求地址'); return; }
    if(btn){ btn.disabled = true; btn.querySelector('span').textContent = tr('api.fetchingModels') || '拉取中...'; }
    setStatus(tr('api.fetchingModels') || '正在从上游拉取模型列表...');
    try {
        const data = await fetch('/api/providers/fetch-models', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({base_url:baseUrl, api_key:apiKey, provider_id:item.id, protocol:protocolInput?.value || 'openai'})
        }).then(async r => {
            if(!r.ok) throw new Error((await r.json()).detail || (tr('api.urlInvalid') || '拉取失败'));
            return r.json();
        });
        lastFetchedAll = data.all || [];
        lastFetchedSuggestion = {
            image: new Set(data.image_models || []),
            chat: new Set(data.chat_models || []),
            video: new Set(data.video_models || []),
        };
        // 启用「选择模型」按钮，并 statusbar 显示已拉取数量
        const openBtn = document.getElementById('openPickerBtn');
        if(openBtn){ openBtn.disabled = false; openBtn.style.opacity = '1'; }
        setStatus(`已拉取 ${data.total} 个模型 · 点「选择模型」勾选要导入的`);
        openModelPicker();
    } catch(e){
        alert('拉取失败：' + (e.message || e));
        setStatus('拉取失败');
    } finally {
        if(btn){ btn.disabled = false; btn.querySelector('span').textContent = tr('api.fetchModels') || '拉取模型'; }
    }
}

// —— 模型选择器浮层 ——
// 每个模型只归一类（根据用户已配置 或 关键字猜测）；勾选 = 纳入该分类
let pickerState = { category: {}, selected: {} };
let pickerVisibleIds = [];
function openModelPicker(){
    const item = provider();
    if(!item || !lastFetchedAll.length){ alert('没有拉取到模型'); return; }
    const existing = { image: new Set(item.image_models||[]), chat: new Set(item.chat_models||[]), video: new Set(item.video_models||[]) };
    const allIds = new Set([...lastFetchedAll, ...(item.image_models||[]), ...(item.chat_models||[]), ...(item.video_models||[])]);
    pickerState = { category: {}, selected: {} };
    allIds.forEach(id => {
        // 类别归属：用户已配置 > 关键字建议 > 默认 chat
        let cat;
        if(existing.image.has(id)) cat = 'image';
        else if(existing.video.has(id)) cat = 'video';
        else if(existing.chat.has(id)) cat = 'chat';
        else if(lastFetchedSuggestion?.image?.has(id)) cat = 'image';
        else if(lastFetchedSuggestion?.video?.has(id)) cat = 'video';
        else cat = 'chat';
        pickerState.category[id] = cat;
        // 默认勾选状态：已在用户配置里的 = 勾选；新拉的 = 不勾选（让用户主动选）
        pickerState.selected[id] = existing.image.has(id) || existing.chat.has(id) || existing.video.has(id);
    });
    // 默认 tab 切回「全部」
    document.querySelectorAll('.picker-cat-tab').forEach(t => t.classList.toggle('active', t.dataset.cat === 'all'));
    document.getElementById('modelPickerOverlay').style.display = 'flex';
    renderModelPicker();
}
function closeModelPicker(){ document.getElementById('modelPickerOverlay').style.display = 'none'; }
function renderModelPicker(){
    const filter = (document.getElementById('pickerFilter')?.value || '').toLowerCase();
    const currentTab = document.querySelector('.picker-cat-tab.active')?.dataset.cat || 'all';
    const ids = Object.keys(pickerState.category).sort();
    // 各分类总数 / 已选数
    const totals = { all: ids.length, image:0, chat:0, video:0 };
    const selecteds = { all:0, image:0, chat:0, video:0 };
    ids.forEach(id => {
        const cat = pickerState.category[id];
        totals[cat]++;
        if(pickerState.selected[id]){ selecteds[cat]++; selecteds.all++; }
    });
    // 过滤显示
    const list = ids.filter(id => {
        if(filter && !id.toLowerCase().includes(filter)) return false;
        if(currentTab === 'all') return true;
        return pickerState.category[id] === currentTab;
    });
    pickerVisibleIds = list;
    document.getElementById('pickerCount').textContent = `共 ${totals.all} 个模型 · 当前显示 ${list.length} 个`;
    document.querySelectorAll('.picker-cat-tab').forEach(tab => {
        const cat = tab.dataset.cat;
        tab.querySelector('.cat-count').textContent = `${selecteds[cat]}/${totals[cat]}`;
    });
    // 列表
    const html = list.map((id, index) => {
        const checked = pickerState.selected[id];
        return `
            <div class="picker-row ${checked?'has-sel':''}" onclick="togglePickerRowByIndex(${index})">
                <div class="picker-checkbox ${checked?'checked':''}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
                <div class="picker-model-name" title="${escapeAttr(id)}">${escapeHtml(id)}</div>
            </div>
        `;
    }).join('');
    document.getElementById('pickerList').innerHTML = html || `<div style="padding:32px;text-align:center;color:var(--faint);font-size:12px">无匹配</div>`;
    // 底部汇总
    const sumImage = document.getElementById('sumImage');
    const sumChat = document.getElementById('sumChat');
    const sumVideo = document.getElementById('sumVideo');
    const sumUnsel = document.getElementById('sumUnsel');
    if(sumImage){ sumImage.textContent = `生图 ${selecteds.image}`; sumImage.classList.toggle('picker-sum-chip-empty', selecteds.image === 0); }
    if(sumChat){ sumChat.textContent = `LLM ${selecteds.chat}`; sumChat.classList.toggle('picker-sum-chip-empty', selecteds.chat === 0); }
    if(sumVideo){ sumVideo.textContent = `视频 ${selecteds.video}`; sumVideo.classList.toggle('picker-sum-chip-empty', selecteds.video === 0); }
    if(sumUnsel){ sumUnsel.textContent = `未选 ${totals.all - selecteds.all}`; }
}
function togglePickerRow(id){
    pickerState.selected[id] = !pickerState.selected[id];
    renderModelPicker();
}
function togglePickerRowByIndex(index){
    const id = pickerVisibleIds[index];
    if(typeof id !== 'string') return;
    togglePickerRow(id);
}
function selectPickerCat(cat){
    document.querySelectorAll('.picker-cat-tab').forEach(t => t.classList.toggle('active', t.dataset.cat === cat));
    renderModelPicker();
}
function applyModelPicker(){
    const item = provider(); if(!item) return;
    const image = [], chat = [], video = [];
    Object.entries(pickerState.selected).forEach(([id, sel]) => {
        if(!sel) return;
        const cat = pickerState.category[id];
        if(cat === 'image') image.push(id);
        else if(cat === 'video') video.push(id);
        else chat.push(id);
    });
    item.image_models = image;
    item.chat_models = chat;
    item.video_models = video;
    renderModels('image'); renderModels('chat'); renderModels('video');
    renderMsLoras();
    setStatus(`已应用 · 生图 ${image.length} / LLM ${chat.length} / 视频 ${video.length}，点保存生效`);
    closeModelPicker();
}
async function saveKeyOnly(){
    const item = provider();
    if(!item) return;
    const key = keyInput.value.trim();
    if(!key){ alert(tr('api.enterKeyAlert') || '请输入 Key'); return; }
    item.api_key = key;
    const ok = await saveProviders();
    if(ok) keyInput.value = '';
}
async function clearKeyOnly(){
    const item = provider();
    if(!item) return;
    if(!item.has_key && !keyInput.value){ return; }
    if(!confirm(tr('api.confirmClearKey') || '确认清除当前 Key？')) return;
    item._clearKey = true;
    const ok = await saveProviders();
    if(ok) keyInput.value = '';
}
function renderModels(kind){
    const item = provider();
    const key = kind === 'image' ? 'image_models' : kind === 'video' ? 'video_models' : 'chat_models';
    const list = kind === 'image' ? imageModelList : kind === 'video' ? videoModelList : chatModelList;
    const models = item?.[key] || [];
    if(!models.length){
        list.innerHTML = `<div class="empty">${tr('api.noModels')}</div>`;
        return;
    }
    list.innerHTML = models.map((model, index) => `
        <div class="model-row">
            <input value="${escapeAttr(model)}" oninput="updateModel('${kind}', ${index}, this.value)">
            <button class="icon-btn" type="button" onclick="removeModel('${kind}', ${index})" title="删除"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        </div>
    `).join('');
    refreshIcons();
}
function msLoraTargetOptions(selected){
    const item = provider();
    const models = unique([selected, ...MS_BUILTIN_IMAGE_MODELS, ...((item?.image_models) || [])]);
    return models.filter(Boolean).map(model => `<option value="${escapeAttr(model)}" ${model === selected ? 'selected' : ''}>${escapeHtml(model)}</option>`).join('');
}
function normalizeLoraStrength(value){
    const n = Number(value);
    if(!Number.isFinite(n)) return 0.8;
    return Math.max(0, Math.min(2, n));
}
function renderMsLoras(){
    const item = provider();
    if(!msLoraList || !item || item.id !== 'modelscope') return;
    item.ms_loras = Array.isArray(item.ms_loras) ? item.ms_loras : [];
    if(!item.ms_loras.length){
        msLoraList.innerHTML = `<div class="lora-empty">${tr('api.loraEmpty')}</div>`;
        return;
    }
    msLoraList.innerHTML = item.ms_loras.map((lora, index) => {
        const target = lora.target_model || lora.model || MS_BUILTIN_IMAGE_MODELS[0];
        const strength = normalizeLoraStrength(lora.strength ?? lora.default_strength ?? 0.8);
        return `
            <div class="lora-row">
                <label class="lora-field">
                    <span>${tr('api.loraId')}</span>
                    <input value="${escapeAttr(lora.id || '')}" placeholder="${escapeAttr(tr('api.loraIdPlaceholder'))}" oninput="updateMsLora(${index}, 'id', this.value)">
                </label>
                <label class="lora-field">
                    <span>${tr('api.loraTargetModel')}</span>
                    <select onchange="updateMsLora(${index}, 'target_model', this.value)">${msLoraTargetOptions(target)}</select>
                </label>
                <label class="lora-field">
                    <span>${tr('api.loraDefaultStrength')}</span>
                    <input type="number" min="0" max="2" step="0.05" value="${strength}" oninput="updateMsLora(${index}, 'strength', this.value)">
                </label>
                <button class="icon-btn" type="button" onclick="removeMsLora(${index})" title="${escapeAttr(tr('common.delete'))}"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </div>
        `;
    }).join('');
    refreshIcons();
}
function addMsLora(){
    const item = provider();
    if(!item || item.id !== 'modelscope') return;
    item.ms_loras = Array.isArray(item.ms_loras) ? item.ms_loras : [];
    item.ms_loras.push({
        id:'',
        name:'',
        target_model: (item.image_models || [])[0] || MS_BUILTIN_IMAGE_MODELS[0],
        strength:0.8,
        enabled:true,
        note:''
    });
    renderMsLoras();
}
function updateMsLora(index, field, value){
    const item = provider();
    if(!item || item.id !== 'modelscope') return;
    item.ms_loras = Array.isArray(item.ms_loras) ? item.ms_loras : [];
    const lora = item.ms_loras[index];
    if(!lora) return;
    if(field === 'strength') lora.strength = normalizeLoraStrength(value);
    else lora[field] = value;
}
function removeMsLora(index){
    const item = provider();
    if(!item || item.id !== 'modelscope') return;
    item.ms_loras = Array.isArray(item.ms_loras) ? item.ms_loras : [];
    item.ms_loras.splice(index, 1);
    renderMsLoras();
}
function selectProvider(id){
    if(isProviderTemporarilyHidden(providers.find(item => item.id === id))) return;
    syncEditor();
    selectedId = id;
    renderEditor();
}
function addProvider(){
    syncEditor();
    let id = 'custom-api';
    let index = 2;
    while(providers.some(item => item.id === id)) id = `custom-api-${index++}`;
    providers.push({id, name:'API', base_url:'https://', protocol:'openai', image_generation_endpoint:'', image_edit_endpoint:'', enabled:true, primary:false, image_models:[], chat_models:[], video_models:[], has_key:false, key_preview:''});
    selectedId = id;
    renderEditor();
}
function deleteProvider(){
    const item = provider();
    if(!item) return;
    if(item.id === 'modelscope'){ alert(tr('api.modelscopeOnlyDelete') || 'ModelScope 是默认平台，不可删除'); return; }
    if(providers.length <= 1){ alert(tr('api.keepOne')); return; }
    providers = providers.filter(p => p.id !== item.id);
    selectedId = providers[0]?.id || '';
    renderEditor();
    saveProviders();
}
async function saveRhKeyOnly(kind){
    const item = provider();
    if(!item || item.id !== 'runninghub') return;
    const input = kind === 'wallet' ? rhWalletKeyInput : rhFreeKeyInput;
    const key = input?.value.trim() || '';
    if(!key){ alert('请输入 Key'); return; }
    syncEditor();
    const ok = await saveProviders();
    if(ok && input) input.value = '';
}
async function clearRhKeyOnly(kind){
    const item = provider();
    if(!item || item.id !== 'runninghub') return;
    if(!confirm(tr('api.confirmClearKey') || '确认清除当前 Key？')) return;
    if(kind === 'wallet') item._clearWalletKey = true;
    else item._clearKey = true;
    const ok = await saveProviders();
    if(ok){
        if(kind === 'wallet' && rhWalletKeyInput) rhWalletKeyInput.value = '';
        if(kind !== 'wallet' && rhFreeKeyInput) rhFreeKeyInput.value = '';
    }
}
function addModel(kind){
    const item = provider();
    const key = kind === 'image' ? 'image_models' : kind === 'video' ? 'video_models' : 'chat_models';
    item[key] = [...(item[key] || []), ''];
    renderModels(kind);
    if(kind === 'image') renderMsLoras();
}
function updateModel(kind, index, value){
    const item = provider();
    const key = kind === 'image' ? 'image_models' : kind === 'video' ? 'video_models' : 'chat_models';
    item[key][index] = value;
    if(kind === 'image') renderMsLoras();
}
function removeModel(kind, index){
    const item = provider();
    const key = kind === 'image' ? 'image_models' : kind === 'video' ? 'video_models' : 'chat_models';
    item[key].splice(index, 1);
    renderModels(kind);
    if(kind === 'image') renderMsLoras();
}
async function loadProviders(){
    setStatus(tr('api.loading'));
    try {
        const data = await fetch('/api/providers').then(r => r.json());
        providers = data.providers || [];
        selectedId = sortedProviders()[0]?.id || '';
        renderEditor();
        setStatus('');
    } catch(err) {
        setStatus(tr('api.loadFailed'));
    }
}
async function saveProviders(){
    syncEditor();
    try {
        providers.forEach(item => {
            item.id = normalizeId(item.id);
            item.protocol = item.id === 'runninghub'
                ? 'runninghub'
                : ['openai', 'apimart', 'gemini', 'volcengine'].includes(String(item.protocol || '').toLowerCase()) ? String(item.protocol).toLowerCase() : 'openai';
            item.image_generation_endpoint = normalizeEndpointSetting(item.image_generation_endpoint);
            item.image_edit_endpoint = normalizeEndpointSetting(item.image_edit_endpoint);
            validateEndpointSetting(item.image_generation_endpoint, '文生图端口');
            validateEndpointSetting(item.image_edit_endpoint, '图生图/编辑端口');
            item.image_models = unique(item.image_models || []);
            item.chat_models = unique(item.chat_models || []);
            item.video_models = unique(item.video_models || []);
            item.rh_apps = normalizeRhEntries(item.rh_apps || [], 'app');
            item.rh_workflows = normalizeRhEntries(item.rh_workflows || [], 'workflow');
            item.ms_loras = (Array.isArray(item.ms_loras) ? item.ms_loras : []).map(lora => ({
                id:String(lora.id || '').trim(),
                name:String(lora.name || lora.id || '').trim(),
                target_model:String(lora.target_model || '').trim(),
                strength:normalizeLoraStrength(lora.strength ?? 0.8),
                enabled:lora.enabled !== false,
                note:String(lora.note || '').trim()
            })).filter(lora => lora.id && lora.target_model);
        });
    } catch(err) {
        setStatus(err.message || '高级端口设置不合法');
        toggleAdvancedEndpoints(true);
        return false;
    }
    if(new Set(providers.map(item => item.id)).size !== providers.length){
        alert(tr('api.duplicateId'));
        return false;
    }
    setStatus(tr('api.saving'));
    try {
        const res = await fetch('/api/providers', {
            method:'PUT',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify(providers.map(item => ({
                id:item.id,
                name:item.name,
                base_url:item.base_url,
                protocol:(item.id === 'modelscope') ? 'openai' : item.id === 'runninghub' ? 'runninghub' : (item.protocol || 'openai'),
                image_generation_endpoint:item.image_generation_endpoint || '',
                image_edit_endpoint:item.image_edit_endpoint || '',
                enabled:item.enabled !== false,
                primary:false,
                image_models:item.image_models || [],
                chat_models:item.chat_models || [],
                video_models:item.video_models || [],
                ms_loras:item.id === 'modelscope' ? (item.ms_loras || []) : [],
                ms_defaults_version:item.id === 'modelscope' ? (item.ms_defaults_version || 1) : 0,
                rh_apps:item.id === 'runninghub' ? (item.rh_apps || []) : [],
                rh_workflows:item.id === 'runninghub' ? (item.rh_workflows || []) : [],
                api_key:item.api_key || undefined,
                wallet_api_key:item.wallet_api_key || undefined,
                clear_key:item._clearKey === true,
                clear_wallet_key:item._clearWalletKey === true
            })))
        });
        if(!res.ok) throw new Error((await res.json()).detail || tr('api.saveFailed'));
        const data = await res.json();
        providers = data.providers || providers;
        providers.forEach(item => {
            delete item.api_key;
            delete item.wallet_api_key;
            delete item._clearKey;
            delete item._clearWalletKey;
        });
        selectedId = provider()?.id || providers[0]?.id || '';
        renderEditor();
        setStatus(tr('api.saved'));
        // 广播变更，画布等其他 iframe 立即重新拉取最新平台/模型列表
        try { new BroadcastChannel('studio-api').postMessage({ type:'providers-changed' }); } catch(e) {}
        return true;
    } catch(err) {
        setStatus(err.message || tr('api.saveFailed'));
        return false;
    }
}
function escapeHtml(str){
    return String(str || '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}
function escapeAttr(str){ return escapeHtml(str).replace(/`/g, '&#96;'); }
window.addEventListener('message', event => {
    if(event.data?.type === 'studio-theme' && window.StudioTheme) window.StudioTheme.set(event.data.theme);
    if(event.data?.type === 'studio-lang' && window.StudioI18n) {
        window.StudioI18n.set(event.data.lang);
        renderEditor();
    }
});
rhWorkflowEditorOverlay?.addEventListener('mousedown', event => {
    if(event.target === rhWorkflowEditorOverlay) closeRhWorkflowEditor();
});
document.addEventListener('keydown', event => {
    if(event.key === 'Escape' && rhWorkflowEditorState.open) closeRhWorkflowEditor();
});
document.addEventListener('mousedown', event => {
    if(!rhWorkflowEditorState.open) return;
    const pop = document.getElementById('rhNodePopover');
    if(!pop) return;
    if(pop.contains(event.target)) return;
    if(event.target.closest('.rh-editor-gnode,.rh-app-field-card')) return;
    closeRhNodePopover();
});
recommendApiOverlay?.addEventListener('mousedown', event => {
    if(event.target === recommendApiOverlay) closeRecommendApi();
});
window.addEventListener('studio-lang-change', () => {
    renderEditor();
    if(recommendApiOverlay?.style.display === 'flex') renderRecommendApi();
});
window.onload = () => {
    if(window.StudioTheme) window.StudioTheme.apply();
    if(window.StudioI18n) window.StudioI18n.apply();
    loadProviders();
    // 平台名输入时实时预览生成的 ID
    if(nameInput) nameInput.addEventListener('input', updateIdPreview);
    if(protocolInput) protocolInput.addEventListener('change', updateProtocolFromInput);
};
