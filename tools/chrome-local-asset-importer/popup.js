const els = {
  server: document.getElementById('serverInput'),
  token: document.getElementById('tokenInput'),
  folder: document.getElementById('folderInput'),
  classify: document.getElementById('classifyInput'),
  autoScroll: document.getElementById('autoScrollInput'),
  filterLowRes: document.getElementById('filterLowResInput'),
  capture: document.getElementById('captureBtn'),
  provider: document.getElementById('providerSelect'),
  model: document.getElementById('modelSelect'),
  prompt: document.getElementById('promptInput'),
  scan: document.getElementById('scanBtn'),
  pin: document.getElementById('pinBtn'),
  github: document.getElementById('githubBtn'),
  settingsToggle: document.getElementById('settingsToggleBtn'),
  settingsPanel: document.getElementById('settingsPanel'),
  settingsSummary: document.getElementById('settingsSummary'),
  test: document.getElementById('testBtn'),
  grid: document.getElementById('grid'),
  status: document.getElementById('statusText'),
  count: document.getElementById('countText'),
  selectAll: document.getElementById('selectAllBtn'),
  clear: document.getElementById('clearBtn'),
  import: document.getElementById('importBtn'),
  download: document.getElementById('downloadBtn'),
};

let images = [];
let selected = new Set();
let providers = [];
let settingsCollapsed = false;
let savedSettings = {
  provider: '',
  model: '',
};
let previewItem = null;
const POPUP_PREVIEW_POPUP_WIDTH = 390;
const POPUP_PREVIEW_GAP = 16;
const PREVIEW_POSITION_STORAGE_KEY = 'webPreviewPosition';
const SIDEPANEL_PREVIEW_POSITION_STORAGE_KEY = 'webPreviewPositionSidePanel';
const isSidePanelView = location.pathname.endsWith('/sidepanel.html');
function apiBase(){
  let value = String(els.server.value || '').trim();
  if(!value) value = '127.0.0.1:3000';
  if(!/^https?:\/\//i.test(value)) value = `http://${value}`;
  try {
    const parsed = new URL(value);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return 'http://127.0.0.1:3000';
  }
}

function authHeaders(extra={}){
  const token = String(els.token?.value || '').trim();
  return token ? {...extra, Authorization: `Bearer ${token}`} : {...extra};
}

function setStatus(text){
  els.status.textContent = text || '';
}

function updateSettingsUi(){
  els.settingsPanel.classList.toggle('collapsed', settingsCollapsed);
  els.settingsToggle.classList.toggle('active', !settingsCollapsed);
  els.settingsToggle.title = settingsCollapsed ? '展开设置' : '收起设置';
  const provider = providers.find(p => p.id === els.provider.value);
  const model = els.model.value || '';
  els.settingsSummary.textContent = `${apiBase().replace(/^https?:\/\//, '')}${provider ? ` · ${provider.name || provider.id}` : ''}${model ? ` · ${model}` : ''}`;
}

function imageName(url){
  if(/^data:/i.test(String(url || ''))) return 'web-image';
  try {
    const parsed = new URL(url);
    const name = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || '');
    return name || parsed.hostname || 'web-image';
  } catch {
    return 'web-image';
  }
}

function mediaKindFromUrl(url){
  const clean = decodeURIComponent(String(url || '').split(/[?#]/, 1)[0]).toLowerCase();
  if(/\.(mp4|webm|mov|m4v|flv)$/.test(clean)) return 'video';
  return 'image';
}

function inferImageSizeFromUrl(url){
  let text = String(url || '');
  try { text = decodeURIComponent(text); } catch {}
  const dimensionMatch = text.match(/[?&#](?:s|size|dimensions|resolution)=([0-9]{2,5})x([0-9]{2,5})(?:[&#]|$)/i)
    || text.match(/(?:^|[^\d])([0-9]{2,5})x([0-9]{2,5})(?:[^\d]|$)/i);
  if(dimensionMatch){
    return {width: Number(dimensionMatch[1]) || 0, height: Number(dimensionMatch[2]) || 0};
  }
  const behanceThumbMatch = text.match(/(?:mir-[^/]+\.behance\.net|behance\.net)\/(?:[^?#]*\/)?(?:projects|project_modules)\/(?:max_)?([0-9]{2,5})_(?:webp|jpe?g|png|opt)(?:[/?#_.-]|$)/i);
  if(behanceThumbMatch){
    const size = Number(behanceThumbMatch[1]) || 0;
    return {width: size, height: size};
  }
  const widthMatch = text.match(/[?&#](?:w|width)=([0-9]{2,5})(?:[&#]|$)/i)
    || text.match(/(?:^|[^a-z0-9])(?:w|width)[_-]?([0-9]{2,5})(?:[^\d]|$)/i)
    || text.match(/(?:^|[^a-z0-9])([0-9]{2,5})_(?:webp|jpe?g|png)(?:[^a-z0-9]|$)/i);
  if(widthMatch){
    return {width: Number(widthMatch[1]) || 0, height: 0};
  }
  return {};
}

function isLowResolutionItem(item){
  if(!item || (item.kind || mediaKindFromUrl(item.url)) !== 'image') return false;
  if(/^data:/i.test(String(item.url || ''))) return false;
  const inferred = inferImageSizeFromUrl(item.url);
  const width = Number(item.width || 0) || Number(inferred.width || 0);
  const height = Number(item.height || 0) || Number(inferred.height || 0);
  return (width > 0 && width < 500) || (height > 0 && height < 500);
}

function visibleImages(){
  return els.filterLowRes?.checked ? images.filter(item => !isLowResolutionItem(item)) : images;
}

function pruneHiddenSelection(){
  const visible = new Set(visibleImages().map(item => item.url));
  selected = new Set([...selected].filter(url => visible.has(url)));
}

function loadMediaSize(item){
  return new Promise(resolve => {
    const kind = item.kind || mediaKindFromUrl(item.url);
    const done = (width, height) => resolve({
      ...item,
      width: Number(width || 0) || Number(item.width || 0) || 0,
      height: Number(height || 0) || Number(item.height || 0) || 0,
      dimSource: width && height ? 'loaded' : item.dimSource,
    });
    const timer = setTimeout(() => done(0, 0), 4500);
    if(kind === 'video'){
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.onloadedmetadata = () => {
        clearTimeout(timer);
        done(video.videoWidth, video.videoHeight);
      };
      video.onerror = () => {
        clearTimeout(timer);
        done(0, 0);
      };
      video.src = item.url;
      return;
    }
    const image = new Image();
    image.referrerPolicy = 'no-referrer';
    image.onload = () => {
      clearTimeout(timer);
      done(image.naturalWidth, image.naturalHeight);
    };
    image.onerror = () => {
      clearTimeout(timer);
      done(0, 0);
    };
    image.src = item.url;
  });
}

async function enrichMediaSizes(items){
  const copy = [...items];
  const targets = copy
    .map((item, index) => ({item, index}))
    .filter(({item}) => item && item.url && item.dimSource !== 'url' && item.streamType !== 'stream' && !/^(?:blob|data):/i.test(item.url))
    .slice(0, 120);
  const concurrency = 8;
  let cursor = 0;
  async function worker(){
    while(cursor < targets.length){
      const current = targets[cursor++];
      copy[current.index] = await loadMediaSize(current.item);
    }
  }
  await Promise.all(Array.from({length: Math.min(concurrency, targets.length)}, worker));
  return copy;
}

function renderProviders(){
  const chatProviders = providers
    .filter(p => p && p.enabled !== false && Array.isArray(p.chat_models) && p.chat_models.length);
  if(!chatProviders.length){
    els.provider.innerHTML = '<option value="">暂无聊天平台</option>';
    els.model.innerHTML = '<option value="">暂无模型</option>';
    return;
  }
  const wantedProvider = savedSettings.provider || els.provider.value;
  const current = chatProviders.find(p => p.id === wantedProvider) || chatProviders[0];
  els.provider.innerHTML = chatProviders.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name || p.id)}</option>`).join('');
  els.provider.value = current.id;
  const models = current.chat_models || [];
  const wantedModel = savedSettings.provider === current.id ? savedSettings.model : els.model.value;
  els.model.innerHTML = models.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');
  els.model.value = models.includes(wantedModel) ? wantedModel : (models[0] || '');
  savedSettings.provider = els.provider.value || '';
  savedSettings.model = els.model.value || '';
  updateSettingsUi();
}

function escapeHtml(value){
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

function syncPreviewSelection(){
  return previewItem;
}

function updateSelectionUi(){
  const visible = visibleImages();
  if(els.filterLowRes?.checked) pruneHiddenSelection();
  const hiddenCount = images.length - visible.length;
  els.count.textContent = images.length
    ? `${visible.length} 张图片${hiddenCount ? `（已过滤 ${hiddenCount} 张）` : ''} / 已选 ${selected.size}`
    : '未扫描';
  els.import.disabled = selected.size === 0;
  els.download.disabled = selected.size === 0;
}

function updateCardSelection(card, item){
  if(!card || !item) return;
  const checked = selected.has(item.url);
  card.classList.toggle('selected', checked);
  const checkbox = card.querySelector('input[type="checkbox"]');
  if(checkbox) checkbox.checked = checked;
}

function updateVisibleCardSelections(){
  const visible = visibleImages();
  els.grid.querySelectorAll('.card').forEach(card => {
    updateCardSelection(card, visible[Number(card.dataset.index)]);
  });
  updateSelectionUi();
}

async function getActiveTabId(){
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  return tab?.id || 0;
}

function renderPagePreview(payload){
  const id = '__ic_local_asset_preview__';
  const old = document.getElementById(id);
  if(old) old.remove();

  if(!payload || !payload.url) return;
  const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const theme = dark ? {
    panel: 'rgba(24,27,34,.96)',
    panelSoft: '#20242d',
    text: '#e5e7eb',
    muted: '#98a2b3',
    line: 'rgba(148,163,184,.28)',
    button: '#252a34',
    shadow: '0 22px 70px rgba(0,0,0,.42)'
  } : {
    panel: 'rgba(255,255,255,.96)',
    panelSoft: '#f8fafc',
    text: '#111827',
    muted: '#64748b',
    line: 'rgba(148,163,184,.35)',
    button: '#f8fafc',
    shadow: '0 22px 70px rgba(15,23,42,.28)'
  };

  const root = document.createElement('div');
  root.id = id;
  root.style.cssText = [
    'position:fixed',
    'top:18px',
    'width:min(380px,calc(100vw - 36px))',
    'min-height:240px',
    'max-height:min(82vh,720px)',
    'z-index:2147483647',
    'display:flex',
    'flex-direction:column',
    'overflow:hidden',
    `border:1px solid ${theme.line}`,
    'border-radius:14px',
    `background:${theme.panel}`,
    `box-shadow:${theme.shadow}`,
    'backdrop-filter:blur(14px)',
    'font:12px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    `color:${theme.text}`
  ].join(';');

  const placePreview = () => {
    const margin = 18;
    const top = margin;
    if(payload.position && Number.isFinite(payload.position.left) && Number.isFinite(payload.position.top)){
      const rect = root.getBoundingClientRect();
      const left = Math.max(margin, Math.min(payload.position.left, window.innerWidth - rect.width - margin));
      const savedTop = Math.max(margin, Math.min(payload.position.top, window.innerHeight - rect.height - margin));
      root.style.left = `${Math.round(left)}px`;
      root.style.right = '';
      root.style.top = `${Math.round(savedTop)}px`;
      return;
    }
    if(payload.placement === 'center'){
      const rect = root.getBoundingClientRect();
      const left = Math.max(margin, (window.innerWidth - rect.width) / 2);
      const centerTop = Math.max(margin, (window.innerHeight - rect.height) / 2);
      root.style.left = `${Math.round(left)}px`;
      root.style.right = '';
      root.style.top = `${Math.round(centerTop)}px`;
      return;
    }
    const right = payload.placement === 'popup-adjacent'
      ? POPUP_PREVIEW_POPUP_WIDTH + POPUP_PREVIEW_GAP
      : margin;
    const availableWidth = window.innerWidth - right - margin;
    const width = Math.max(220, Math.min(380, availableWidth));
    root.style.left = '';
    root.style.right = `${Math.round(right)}px`;
    root.style.width = `${Math.round(width)}px`;
    root.style.top = `${Math.round(top)}px`;
  };

  const savePreviewPosition = () => {
    const left = Math.round(root.getBoundingClientRect().left);
    const top = Math.round(root.getBoundingClientRect().top);
    const position = {left, top};
    if(globalThis.chrome?.storage?.local && payload.storageKey){
      chrome.storage.local.set({[payload.storageKey]: position});
      return;
    }
    try {
      localStorage.setItem(payload.storageKey || 'webPreviewPosition', JSON.stringify(position));
    } catch {}
  };

  const head = document.createElement('div');
  head.style.cssText = `display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px;border-bottom:1px solid ${theme.line}`;

  const title = document.createElement('div');
  title.textContent = payload.name || '图片预览';
  title.style.cssText = 'min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:800';

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  close.title = '关闭预览';
  close.style.cssText = `flex:0 0 auto;width:28px;height:28px;border:1px solid ${theme.line};border-radius:8px;background:${theme.button};color:${theme.text};cursor:pointer;font-size:18px;line-height:1`;
  close.onclick = () => root.remove();

  let dragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  head.style.cursor = 'move';
  head.addEventListener('mousedown', event => {
    if(event.target === close) return;
    const rect = root.getBoundingClientRect();
    dragging = true;
    dragOffsetX = event.clientX - rect.left;
    dragOffsetY = event.clientY - rect.top;
    root.style.left = `${Math.round(rect.left)}px`;
    root.style.top = `${Math.round(rect.top)}px`;
    root.style.right = '';
    event.preventDefault();
  });
  window.addEventListener('mousemove', event => {
    if(!dragging) return;
    const margin = 8;
    const rect = root.getBoundingClientRect();
    const left = Math.max(margin, Math.min(event.clientX - dragOffsetX, window.innerWidth - rect.width - margin));
    const top = Math.max(margin, Math.min(event.clientY - dragOffsetY, window.innerHeight - rect.height - margin));
    root.style.left = `${Math.round(left)}px`;
    root.style.top = `${Math.round(top)}px`;
    event.preventDefault();
  });
  window.addEventListener('mouseup', () => {
    if(!dragging) return;
    dragging = false;
    savePreviewPosition();
  });

  const body = document.createElement('div');
  body.style.cssText = `flex:0 1 auto;min-height:170px;max-height:min(64vh,580px);display:grid;place-items:center;padding:10px;background:${theme.panelSoft};overflow:hidden`;

  const media = document.createElement(payload.kind === 'video' ? 'video' : 'img');
  media.src = payload.url;
  media.style.cssText = 'display:block;max-width:100%;max-height:min(64vh,560px);object-fit:contain';
  if(payload.kind === 'video'){
    media.controls = true;
    media.muted = true;
    media.playsInline = true;
    media.preload = 'metadata';
  } else {
    media.alt = '';
    media.referrerPolicy = 'no-referrer';
  }
  const resizeMedia = () => {
    const naturalWidth = payload.kind === 'video' ? media.videoWidth : media.naturalWidth;
    const naturalHeight = payload.kind === 'video' ? media.videoHeight : media.naturalHeight;
    const ratio = naturalWidth && naturalHeight ? naturalHeight / naturalWidth : 1;
    const target = Math.round(Math.min(560, Math.max(170, 356 * ratio)));
    body.style.height = `${target}px`;
    placePreview();
  };
  media.onload = resizeMedia;
  media.onloadedmetadata = resizeMedia;
  body.appendChild(media);

  const foot = document.createElement('div');
  foot.textContent = `${payload.width || '?'} x ${payload.height || '?'}`;
  foot.style.cssText = `flex:0 0 auto;padding:8px 10px;color:${theme.muted};border-top:1px solid ${theme.line};overflow:hidden;text-overflow:ellipsis;white-space:nowrap`;

  head.append(title, close);
  root.append(head, body, foot);
  document.documentElement.appendChild(root);
  placePreview();
  window.addEventListener('resize', placePreview, {passive: true});
}

async function openImagePreview(item){
  if(!item?.url) return;
  previewItem = item;
  const tabId = await getActiveTabId();
  if(!tabId) throw new Error('没有可预览的当前标签页');
  const storageKey = isSidePanelView ? SIDEPANEL_PREVIEW_POSITION_STORAGE_KEY : PREVIEW_POSITION_STORAGE_KEY;
  const stored = await chrome.storage.local.get([storageKey]);
  await chrome.scripting.executeScript({
    target: {tabId},
    func: renderPagePreview,
    args: [{
      url: item.url,
      name: imageName(item.url),
      width: item.width || '',
      height: item.height || '',
      kind: item.kind || mediaKindFromUrl(item.url),
      placement: isSidePanelView ? 'right' : 'center',
      position: stored[storageKey] || null,
      storageKey,
    }],
  });
}

async function closeImagePreview(){
  previewItem = null;
  const tabId = await getActiveTabId().catch(() => 0);
  if(!tabId) return;
  await chrome.scripting.executeScript({
    target: {tabId},
    func: () => document.getElementById('__ic_local_asset_preview__')?.remove(),
  }).catch(() => {});
}

function renderGrid(){
  const previousScrollTop = els.grid.scrollTop || 0;
  const visible = visibleImages();
  if(els.filterLowRes?.checked) pruneHiddenSelection();
  updateSelectionUi();
  if(!visible.length){
    closeImagePreview();
    els.grid.className = 'grid empty';
    els.grid.innerHTML = images.length && hiddenCount
      ? '<div class="empty-state">已过滤全部低分辨率图片。</div>'
      : '<div class="empty-state">没有扫描到可用图片。</div>';
    return;
  }
  els.grid.className = 'grid';
  els.grid.innerHTML = visible.map((img, index) => {
    const checked = selected.has(img.url);
    const title = `${img.width || '?'} x ${img.height || '?'} · ${img.url}`;
    const kind = img.kind || mediaKindFromUrl(img.url);
    const media = kind === 'video'
      ? `<video src="${escapeHtml(img.url)}" muted playsinline preload="metadata"></video>`
      : `<img src="${escapeHtml(img.url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`;
    const badge = img.streamType === 'stream' ? 'M3U8 / 流'
      : (img.fromNetwork && kind === 'video' ? '网络视频'
        : (kind === 'video' ? 'VIDEO' : ''));
    return `<article class="card ${checked ? 'selected' : ''}" data-index="${index}" title="${escapeHtml(title)}">
      <div class="thumb-wrap">
        ${media}
        ${badge ? `<span class="media-kind">${escapeHtml(badge)}</span>` : ''}
        <span class="broken-tip">预览不可用<br>仍可尝试导入</span>
      </div>
      <div class="meta">
        <input type="checkbox" ${checked ? 'checked' : ''}>
        <span class="meta-name">${escapeHtml(imageName(img.url))}</span>
      </div>
    </article>`;
  }).join('');
  els.grid.querySelectorAll('img, video').forEach(media => {
    media.addEventListener('error', () => {
      if(media.tagName === 'IMG' && !media.dataset.fallbackTried){
        const clean = String(media.getAttribute('src') || '').split(/[?#]/, 1)[0];
        if(clean && clean !== media.getAttribute('src')){
          media.dataset.fallbackTried = '1';
          media.src = clean;
          return;
        }
      }
      media.classList.add('is-broken');
      media.closest('.card')?.classList.add('broken');
    });
  });
  els.grid.querySelectorAll('.card').forEach(card => {
    const item = visible[Number(card.dataset.index)];
    // 整个下方文字区域点击即可勾选/取消（比小复选框更好点）
    card.querySelector('.meta')?.addEventListener('click', event => {
      event.stopPropagation();
      if(!item) return;
      if(selected.has(item.url)) selected.delete(item.url);
      else selected.add(item.url);
      updateCardSelection(card, item);
      updateSelectionUi();
      syncPreviewSelection();
    });
    // 缩略图区域点击打开预览
    card.querySelector('.thumb-wrap')?.addEventListener('click', event => {
      event.preventDefault();
      if(!item) return;
      openImagePreview(item)
        .then(() => {
          setStatus(isSidePanelView ? '已在网页右侧打开预览。' : '已在插件旁边打开预览。');
        })
        .catch(err => setStatus(err.message || '预览失败'));
    });
  });
  els.grid.scrollTop = previousScrollTop;
  syncPreviewSelection();
}

async function saveSettings(){
  savedSettings.provider = els.provider.value || savedSettings.provider || '';
  savedSettings.model = els.model.value || savedSettings.model || '';
  await chrome.storage.local.set(getSettingsPayload());
}

function getSettingsPayload(){
  return {
    server: els.server.value || '127.0.0.1:3000',
    accessToken: els.token?.value || '',
    folder: els.folder.value || '网页采集',
    classify: Boolean(els.classify.checked),
    autoScroll: Boolean(els.autoScroll.checked),
    filterLowRes: Boolean(els.filterLowRes?.checked),
    provider: savedSettings.provider,
    model: savedSettings.model,
    prompt: els.prompt.value || '',
    settingsCollapsed,
  };
}

async function loadSettings(){
  const data = await chrome.storage.local.get(['server', 'port', 'accessToken', 'folder', 'classify', 'autoScroll', 'filterLowRes', 'provider', 'model', 'prompt', 'settingsCollapsed']);
  els.server.value = data.server || (data.port ? `127.0.0.1:${data.port}` : '127.0.0.1:3000');
  if(els.token) els.token.value = data.accessToken || '';
  els.folder.value = data.folder || '网页采集';
  els.classify.checked = data.classify !== false;
  els.autoScroll.checked = Boolean(data.autoScroll);
  if(els.filterLowRes) els.filterLowRes.checked = Boolean(data.filterLowRes);
  savedSettings.provider = data.provider || '';
  savedSettings.model = data.model || '';
  els.prompt.value = data.prompt || '';
  settingsCollapsed = data.settingsCollapsed === undefined ? true : Boolean(data.settingsCollapsed);
  updateSettingsUi();
}

async function loadProviders(){
  const res = await fetch(`${apiBase()}/api/providers`, {headers: authHeaders()});
  if(!res.ok) throw new Error(await res.text());
  const data = await res.json();
  providers = Array.isArray(data.providers) ? data.providers : [];
  renderProviders();
}

async function pairIfNeeded(){
  const value = String(els.token?.value || '').trim();
  if(!/^\d{6}$/.test(value)) return;
  const res = await fetch(`${apiBase()}/api/auth/pair`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({code: value, name: 'Chrome 素材导入插件', client_type: 'chrome'}),
  });
  const data = await res.json().catch(() => ({}));
  if(!res.ok || !data.access_token) throw new Error(data.detail || '配对失败');
  els.token.value = data.access_token;
  await saveSettings();
}

async function testConnection(){
  await saveSettings();
  setStatus('正在连接本地服务...');
  await pairIfNeeded();
  await loadProviders();
  setStatus('连接成功，可以扫描当前页面图片。');
}

async function openSidePanel(){
  if(isSidePanelView){
    setStatus('当前已经固定在浏览器侧边栏。');
    return;
  }
  await saveSettings();
  if(!chrome.sidePanel?.open){
    setStatus('当前浏览器不支持侧边栏固定，请升级 Chrome 后重试。');
    return;
  }
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  if(!tab?.id) throw new Error('没有可固定的当前标签页');
  await chrome.sidePanel.setOptions({tabId: tab.id, path: 'sidepanel.html', enabled: true});
  try {
    await chrome.sidePanel.open({tabId: tab.id});
  } catch (error) {
    if(!tab.windowId) throw error;
    await chrome.sidePanel.open({windowId: tab.windowId});
  }
  window.close();
}

function collectPageImages(){
  const urls = new Map();
  let dataCount = 0;
  const imageUrlPattern = /\.(avif|gif|jpe?g|png|webp)(\?|#|$)/i;
  const videoUrlPattern = /\.(mp4|webm|mov|m4v|flv)(\?|#|$)/i;
  const mediaUrlPattern = /\.(avif|gif|jpe?g|png|webp|mp4|webm|mov|m4v|flv)(\?|#|$)/i;
  const inferSizeFromUrl = url => {
    let text = String(url || '');
    try { text = decodeURIComponent(text); } catch {}
    const dimensionMatch = text.match(/[?&#](?:s|size|dimensions|resolution)=([0-9]{2,5})x([0-9]{2,5})(?:[&#]|$)/i)
      || text.match(/(?:^|[^\d])([0-9]{2,5})x([0-9]{2,5})(?:[^\d]|$)/i);
    if(dimensionMatch){
      return {width: Number(dimensionMatch[1]) || 0, height: Number(dimensionMatch[2]) || 0};
    }
    const behanceThumbMatch = text.match(/(?:mir-[^/]+\.behance\.net|behance\.net)\/(?:[^?#]*\/)?(?:projects|project_modules)\/(?:max_)?([0-9]{2,5})_(?:webp|jpe?g|png|opt)(?:[/?#_.-]|$)/i);
    if(behanceThumbMatch){
      const size = Number(behanceThumbMatch[1]) || 0;
      return {width: size, height: size};
    }
    const widthMatch = text.match(/[?&#](?:w|width)=([0-9]{2,5})(?:[&#]|$)/i)
      || text.match(/(?:^|[^a-z0-9])(?:w|width)[_-]?([0-9]{2,5})(?:[^\d]|$)/i)
      || text.match(/(?:^|[^a-z0-9])([0-9]{2,5})_(?:webp|jpe?g|png)(?:[^a-z0-9]|$)/i);
    if(widthMatch){
      return {width: Number(widthMatch[1]) || 0, height: 0};
    }
    return {};
  };
  const add = (url, meta = {}) => {
    if(!url || typeof url !== 'string') return;
    url = url.trim().replace(/&amp;/g, '&');
    const isData = url.startsWith('data:');
    let abs = '';
    if(isData){
      // 文档查看器（夸克/语雀等）常把整页渲染成 SVG <image xlink:href="data:image...">，
      // 只收较大的图片/视频 data URL，过滤掉小图标和 1px 占位图，并限制数量防止内存爆掉。
      if(!/^data:(?:image|video)\//i.test(url) || url.length < 2048) return;
      if(!urls.has(url) && dataCount >= 80) return;
      abs = url;
    } else {
      try { abs = new URL(url, location.href).href; } catch { return; }
      if(!/^(?:https?|blob):/i.test(abs)) return;
    }
    const inferred = isData ? {} : inferSizeFromUrl(abs);
    const hasInferredSize = Number(inferred.width || 0) > 0 && Number(inferred.height || 0) > 0;
    const kind = meta.kind || (isData ? (/^data:video\//i.test(url) ? 'video' : 'image') : (videoUrlPattern.test(abs) ? 'video' : 'image'));
    if(isData && !urls.has(abs)) dataCount += 1;
    const old = urls.get(abs) || {};
    urls.set(abs, {
      ...old,
      ...inferred,
      ...meta,
      kind,
      width: hasInferredSize ? Number(inferred.width || 0) : (Number(meta.width || 0) || Number(old.width || 0) || 0),
      height: hasInferredSize ? Number(inferred.height || 0) : (Number(meta.height || 0) || Number(old.height || 0) || 0),
      dimSource: hasInferredSize ? 'url' : (meta.dimSource || old.dimSource || ''),
      priority: Math.max(Number(old.priority || 0), Number(meta.priority || 0)),
      url: abs,
    });
  };
  const addSrcset = (srcset, meta = {}) => {
    String(srcset || '').split(',').forEach(part => {
      const url = part.trim().split(/\s+/)[0];
      add(url, meta);
    });
  };
  const collectRoots = root => {
    const roots = [root];
    root.querySelectorAll?.('*').forEach(el => {
      if(el.shadowRoot) roots.push(...collectRoots(el.shadowRoot));
    });
    return roots;
  };
  const roots = collectRoots(document);
  const allElements = roots.flatMap(root => [...root.querySelectorAll('*')]);
  const isVisible = el => {
    if(!el?.getBoundingClientRect) return false;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 2 && rect.height > 2 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity || 1) > 0;
  };
  const elementPriority = el => {
    if(!el?.closest) return 0;
    if(el.closest('[role="dialog"], [aria-modal="true"], dialog[open]')) return 300;
    const modal = el.closest('[class*="modal" i], [class*="dialog" i], [class*="lightbox" i], [class*="overlay" i], [class*="popover" i]');
    if(modal && isVisible(modal)) return 240;
    let current = el;
    let depth = 0;
    while(current && current !== document.documentElement && depth < 6){
      const style = getComputedStyle(current);
      const zIndex = Number.parseInt(style.zIndex, 10);
      if((style.position === 'fixed' || style.position === 'sticky') && Number.isFinite(zIndex) && zIndex >= 10 && isVisible(current)){
        return 180;
      }
      current = current.parentElement;
      depth += 1;
    }
    return 0;
  };
  roots.flatMap(root => [...root.querySelectorAll('img')]).forEach(img => {
    const rect = img.getBoundingClientRect();
    const width = img.naturalWidth || Math.round(rect.width) || 0;
    const height = img.naturalHeight || Math.round(rect.height) || 0;
    const dimSource = img.naturalWidth && img.naturalHeight ? 'natural' : (width && height ? 'rect' : '');
    const priority = elementPriority(img);
    add(img.currentSrc || img.src, {width, height, priority, dimSource});
    [
      'data-src',
      'data-original',
      'data-original-src',
      'data-lazy-src',
      'data-full',
      'data-full-src',
      'data-hires',
      'data-zoom-src',
      'data-url',
      'data-image',
      'data-image-src',
      'data-thumbnail',
      'data-thumbnail-url',
      'poster',
    ].forEach(name => {
      const value = img.getAttribute(name);
      if(value) add(value, {width, height, priority, dimSource});
    });
    addSrcset(img.getAttribute('srcset'), {width, height, priority, dimSource});
    addSrcset(img.getAttribute('data-srcset'), {width, height, priority, dimSource});
  });
  roots.flatMap(root => [...root.querySelectorAll('image')]).forEach(node => {
    // SVG <image>：地址在 xlink:href / href 上，文档查看器常用它内联整页图片
    const href = node.getAttribute('xlink:href')
      || node.getAttributeNS?.('http://www.w3.org/1999/xlink', 'href')
      || node.getAttribute('href')
      || '';
    if(!href) return;
    const rect = node.getBoundingClientRect?.() || {};
    const attrW = Number(node.getAttribute('width')) || 0;
    const attrH = Number(node.getAttribute('height')) || 0;
    const width = attrW || Math.round(rect.width || 0) || 0;
    const height = attrH || Math.round(rect.height || 0) || 0;
    const dimSource = attrW && attrH ? 'attr' : (width && height ? 'rect' : '');
    add(href, {width, height, dimSource, priority: elementPriority(node)});
  });
  // <canvas> 捕获：腾讯文档、网页版 PDF、图表、地图等把内容画在画布上，DOM 里没有图片元素。
  // 用 toDataURL 导出；若画布被跨域图片污染(tainted)，会抛 SecurityError，跳过即可。
  let canvasCount = 0;
  roots.flatMap(root => [...root.querySelectorAll('canvas')]).forEach(canvas => {
    if(canvasCount >= 30) return;
    const rect = canvas.getBoundingClientRect?.() || {};
    const width = canvas.width || Math.round(rect.width) || 0;
    const height = canvas.height || Math.round(rect.height) || 0;
    if(width < 80 || height < 80 || !isVisible(canvas)) return;
    let dataUrl = '';
    try { dataUrl = canvas.toDataURL('image/png'); }
    catch { return; }
    if(!dataUrl || dataUrl.length < 2048) return; // 空白/纯透明画布压缩后很小，过滤掉
    canvasCount += 1;
    add(dataUrl, {width, height, dimSource: 'attr', priority: elementPriority(canvas) + 5});
  });
  roots.flatMap(root => [...root.querySelectorAll('video')]).forEach(video => {
    const rect = video.getBoundingClientRect();
    const width = video.videoWidth || Math.round(rect.width) || 0;
    const height = video.videoHeight || Math.round(rect.height) || 0;
    const dimSource = video.videoWidth && video.videoHeight ? 'natural' : (width && height ? 'rect' : '');
    const priority = elementPriority(video);
    add(video.currentSrc || video.src, {width, height, priority, kind: 'video', dimSource});
    add(video.getAttribute('data-src'), {width, height, priority, kind: 'video', dimSource});
    video.querySelectorAll('source[src]').forEach(source => {
      add(source.getAttribute('src'), {width, height, priority, kind: 'video', dimSource});
    });
    const poster = video.getAttribute('poster');
    if(poster) add(poster, {width, height, priority: priority + 1, kind: 'image', dimSource});
  });
  roots.flatMap(root => [...root.querySelectorAll('a[href]')]).forEach(link => {
    const href = link.getAttribute('href') || '';
    if(mediaUrlPattern.test(href)) add(href, {kind: videoUrlPattern.test(href) ? 'video' : 'image'});
  });
  roots.flatMap(root => [...root.querySelectorAll('source')]).forEach(source => {
    const priority = elementPriority(source);
    addSrcset(source.getAttribute('srcset'), {priority});
    addSrcset(source.getAttribute('data-srcset'), {priority});
    const src = source.getAttribute('src') || '';
    if(src) add(src, {priority, kind: videoUrlPattern.test(src) ? 'video' : 'image'});
  });
  roots.flatMap(root => [...root.querySelectorAll('meta[property], meta[name], link[href]')]).forEach(el => {
    const key = `${el.getAttribute('property') || ''} ${el.getAttribute('name') || ''} ${el.getAttribute('rel') || ''}`.toLowerCase();
    if(!/(image|thumbnail|preload|icon)/.test(key)) return;
    add(el.getAttribute('content') || el.getAttribute('href'));
  });
  allElements.forEach(el => {
    const rect = el.getBoundingClientRect();
    const meta = {width: Math.round(rect.width) || 0, height: Math.round(rect.height) || 0, dimSource: rect.width && rect.height ? 'rect' : '', priority: elementPriority(el)};
    [
      'data-bg',
      'data-background',
      'data-src',
      'data-original',
      'data-image',
      'data-image-src',
      'data-full',
      'data-hires',
      'data-url',
      'data-video',
      'data-video-src',
      'data-video-url',
      'data-preview',
      'data-preview-src',
      'data-preview-url',
      'data-hover',
      'data-hover-src',
      'data-hover-url',
      'poster',
    ].forEach(name => {
      const value = el.getAttribute?.(name);
      add(value, {...meta, kind: videoUrlPattern.test(value || '') ? 'video' : undefined});
    });
    [...(el.attributes || [])].forEach(attr => {
      const value = attr.value || '';
      if(!value || value.length > 2000) return;
      if(mediaUrlPattern.test(value)){
        const matches = value.match(/https?:\/\/[^"'\s<>]+?\.(?:avif|gif|jpe?g|png|webp|mp4|webm|mov|m4v|flv)(?:\?[^"'\s<>]*)?/gi) || [value];
        matches.slice(0, 20).forEach(match => add(match, {...meta, kind: videoUrlPattern.test(match) ? 'video' : undefined}));
      }
    });
    ['srcset', 'data-srcset'].forEach(name => addSrcset(el.getAttribute?.(name), meta));
    if(allElements.length <= 7000 || rect.width || rect.height){
      const bg = getComputedStyle(el).backgroundImage || '';
      [...bg.matchAll(/url\(["']?([^"')]+)["']?\)/g)].forEach(match => add(match[1], meta));
    }
  });
  roots.flatMap(root => [...root.querySelectorAll('script[type*="json"], script:not([src])')]).forEach(script => {
    const text = script.textContent || '';
    if(!text || text.length > 2_000_000) return;
    const normalizedText = text.replace(/\\u002F/gi, '/');
    const matches = normalizedText.match(/https?:\\?\/\\?\/[^"'\\\s<>]+?\.(?:avif|gif|jpe?g|png|webp|mp4|webm|mov|m4v|flv)(?:\?[^"'\\\s<>]*)?/gi) || [];
    matches.slice(0, 500).forEach(raw => {
      const normalized = raw.replace(/\\\//g, '/');
      add(normalized, {kind: videoUrlPattern.test(normalized) ? 'video' : 'image'});
    });
  });
  return [...urls.values()]
    .filter(item => (Number(item.width || 0) >= 80 && Number(item.height || 0) >= 80) || (!item.width && !item.height))
    .sort((a, b) => {
      const priorityDelta = Number(b.priority || 0) - Number(a.priority || 0);
      if(priorityDelta) return priorityDelta;
      return (Number(b.width || 0) * Number(b.height || 0)) - (Number(a.width || 0) * Number(a.height || 0));
    })
    .slice(0, 300);
}

// 合并所有 frame（含跨域 iframe，如夸克/语雀文档正文）扫描到的素材，按 url 去重。
function mergeFrameImages(results){
  const byUrl = new Map();
  (results || []).forEach(frame => {
    (frame?.result || []).forEach(item => {
      if(!item?.url) return;
      const old = byUrl.get(item.url);
      if(!old){ byUrl.set(item.url, item); return; }
      byUrl.set(item.url, {
        ...old,
        ...item,
        width: Number(item.width || 0) || Number(old.width || 0) || 0,
        height: Number(item.height || 0) || Number(old.height || 0) || 0,
        priority: Math.max(Number(old.priority || 0), Number(item.priority || 0)),
      });
    });
  });
  return [...byUrl.values()]
    .sort((a, b) => {
      const priorityDelta = Number(b.priority || 0) - Number(a.priority || 0);
      if(priorityDelta) return priorityDelta;
      return (Number(b.width || 0) * Number(b.height || 0)) - (Number(a.width || 0) * Number(a.height || 0));
    })
    .slice(0, 300);
}

// 扫描前自动滚动，触发懒加载/虚拟滚动把图片渲染出来；有限步数+超时，结束后还原位置。
async function autoScrollPage(){
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const scrollers = [{
    get max(){ return Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0) - window.innerHeight; },
    get pos(){ return window.scrollY; },
    to(y){ window.scrollTo(0, y); },
  }];
  let best = null;
  let bestArea = 0;
  document.querySelectorAll('*').forEach(el => {
    if(el.scrollHeight - el.clientHeight > 200 && el.clientHeight > 200){
      const area = el.clientWidth * el.clientHeight;
      if(area > bestArea){ bestArea = area; best = el; }
    }
  });
  if(best){
    scrollers.push({
      get max(){ return best.scrollHeight - best.clientHeight; },
      get pos(){ return best.scrollTop; },
      to(y){ best.scrollTop = y; },
    });
  }
  const startPositions = scrollers.map(s => s.pos);
  for(const s of scrollers){
    let steps = 0;
    while(s.pos < s.max - 4 && steps < 40){
      s.to(s.pos + Math.max(400, window.innerHeight * 0.9));
      steps += 1;
      await sleep(150);
    }
  }
  await sleep(300);
  scrollers.forEach((s, i) => s.to(startPositions[i]));
  return true;
}

// 截取浏览器实际合成到屏幕的画面：地图/WebGL/被污染的画布事后 toDataURL 读到的是黑屏，
// 但屏幕上看到的是对的。captureVisibleTab 抓的就是这份合成结果，能绕过这些限制。
async function captureVisibleArea(){
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  if(!tab?.id) throw new Error('没有可截取的当前标签页');
  setStatus('正在截取当前可见画面...');
  let dataUrl = '';
  try {
    dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {format: 'png'});
  } catch (err) {
    throw new Error(`截取失败：${err?.message || '可能是受保护的页面'}`);
  }
  if(!dataUrl) throw new Error('截取结果为空');
  const size = await new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve({w: img.naturalWidth, h: img.naturalHeight});
    img.onerror = () => resolve({w: 0, h: 0});
    img.src = dataUrl;
  });
  const item = {url: dataUrl, kind: 'image', width: size.w, height: size.h, dimSource: 'loaded', priority: 999};
  images = [item, ...images.filter(existing => existing.url !== dataUrl)];
  selected.add(dataUrl);
  renderGrid();
  setStatus('已截取当前可见画面，已自动勾选，可直接导入。');
}

async function scanImages(){
  setStatus('正在扫描当前页面...');
  await closeImagePreview();
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  const tabId = tab?.id || 0;
  if(!tabId) throw new Error('没有可扫描的当前标签页');
  if(els.autoScroll.checked){
    setStatus('正在自动滚动加载页面...');
    await chrome.scripting.executeScript({
      target: {tabId, allFrames: true},
      func: autoScrollPage,
    }).catch(() => {});
    setStatus('正在扫描当前页面...');
  }
  const results = await chrome.scripting.executeScript({
    target: {tabId, allFrames: true},
    func: collectPageImages,
  });
  images = mergeFrameImages(results);
  images = mergeSniffedMedia(images, await getSniffedMedia(tabId));
  selected = new Set();
  renderGrid();
  images = await enrichMediaSizes(images);
  renderGrid();
  const streamCount = images.filter(item => item.streamType === 'stream').length;
  const tip = streamCount ? `（含 ${streamCount} 个流媒体清单，需用下载器处理）` : '';
  const visibleCount = visibleImages().length;
  const hiddenCount = images.length - visibleCount;
  setStatus(images.length
    ? `已扫描到 ${visibleCount} 个素材${hiddenCount ? `，已过滤 ${hiddenCount} 个低分辨率素材` : ''}${tip}，请勾选需要导入的素材。`
    : '当前页面没有扫描到可用素材。');
}

// 向后台 service worker 取本标签页嗅探到的媒体请求（XHR/fetch 加载、DOM 里看不到的）。
function getSniffedMedia(tabId){
  return new Promise(resolve => {
    try {
      chrome.runtime.sendMessage({type: 'ic-get-media', tabId}, resp => {
        if(chrome.runtime.lastError){ resolve([]); return; }
        resolve(Array.isArray(resp?.items) ? resp.items : []);
      });
    } catch {
      resolve([]);
    }
  });
}

// 把嗅探到的媒体并入扫描结果（去重）。kind=stream 的是 m3u8/dash 清单，标记出来。
function mergeSniffedMedia(items, sniffed){
  const seen = new Set(items.map(item => item.url));
  const extra = [];
  (sniffed || []).forEach(entry => {
    if(!entry?.url || seen.has(entry.url)) return;
    seen.add(entry.url);
    extra.push({
      url: entry.url,
      kind: 'video',
      streamType: entry.kind === 'stream' ? 'stream' : (entry.kind === 'audio' ? 'audio' : 'video'),
      width: 0,
      height: 0,
      dimSource: '',
      priority: 70,
      fromNetwork: true,
    });
  });
  return [...extra, ...items];
}

// 在网页上下文里把素材读成 base64。blob:/同源带登录态的资源只能在页面里 fetch，
// 因为这里才同时拥有 blob 访问权和飞书等站点的登录会话。
function fetchMediaAsBase64(urls){
  const readOne = url => new Promise(resolve => {
    const entry = {url, ok: false, data: '', contentType: '', error: ''};
    fetch(url, {credentials: 'include'})
      .then(res => {
        if(!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then(blob => {
        if(!blob || !blob.size) throw new Error('内容为空');
        entry.contentType = blob.type || '';
        return new Promise((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res(String(reader.result || ''));
          reader.onerror = () => rej(new Error('读取失败'));
          reader.readAsDataURL(blob);
        });
      })
      .then(dataUrl => {
        entry.data = dataUrl;
        entry.ok = Boolean(dataUrl);
        if(!entry.ok) entry.error = '读取失败';
        resolve(entry);
      })
      .catch(err => {
        entry.error = (err && err.message) || '抓取失败';
        resolve(entry);
      });
  });
  const list = [...urls];
  const results = new Array(list.length);
  let cursor = 0;
  const worker = async () => {
    while(cursor < list.length){
      const index = cursor++;
      results[index] = await readOne(list[index]);
    }
  };
  return Promise.all(Array.from({length: Math.min(4, list.length)}, worker)).then(() => results);
}

async function importSelected(){
  const picked = visibleImages().filter(item => selected.has(item.url));
  if(!picked.length) return;
  await saveSettings();
  els.import.disabled = true;

  // blob: 后端无法下载，需在页面里读成 base64；data: 本身就是 base64，直接发送。
  const needsFetch = picked.filter(item => /^blob:/i.test(item.url));
  const fetchedByUrl = new Map();
  if(needsFetch.length){
    setStatus(`正在从页面读取 ${needsFetch.length} 个素材...`);
    const tabId = await getActiveTabId();
    if(!tabId) throw new Error('没有可读取的当前标签页');
    const results = await chrome.scripting.executeScript({
      target: {tabId, allFrames: true},
      func: fetchMediaAsBase64,
      args: [needsFetch.map(item => item.url)],
    });
    // 同一个 blob 只有创建它的 frame 能读成功，其余 frame 失败，取第一个成功的。
    (results || []).forEach(frame => {
      (frame?.result || []).forEach(entry => {
        if(!entry?.url) return;
        const existing = fetchedByUrl.get(entry.url);
        if(!existing || (!existing.ok && entry.ok)) fetchedByUrl.set(entry.url, entry);
      });
    });
  }
  const localFailed = needsFetch.filter(item => !fetchedByUrl.get(item.url)?.ok).length;

  setStatus(`正在导入 ${picked.length} 个素材...`);
  const body = {
    folder: els.folder.value || '网页采集',
    classify: Boolean(els.classify.checked),
    provider: els.provider.value || 'comfly',
    model: els.model.value || '',
    prompt: els.prompt.value || '',
    items: picked.map(item => {
      // data: 本身就是 base64，直接当 data 发送（url 留空，避免 5MB 内容重复传输）
      if(/^data:/i.test(item.url)) return {url: '', name: 'web-image', data: item.url};
      const fetched = fetchedByUrl.get(item.url);
      const base = {url: item.url, name: imageName(item.url)};
      if(fetched?.ok) return {...base, data: fetched.data, content_type: fetched.contentType};
      return base;
    }),
  };
  const res = await fetch(`${apiBase()}/api/local-assets/import-urls`, {
    method: 'POST',
    headers: authHeaders({'Content-Type': 'application/json'}),
    body: JSON.stringify(body),
  });
  if(!res.ok) throw new Error(await res.text());
  const data = await res.json();
  const failed = (data.items || []).filter(item => !item.ok).length;
  setStatus(`导入完成：成功 ${data.count || 0} 个${failed ? `，失败 ${failed} 个` : ''}${localFailed ? `，页面读取失败 ${localFailed} 个` : ''}。`);
  els.import.disabled = selected.size === 0;
}

function safeFolderName(value){
  return String(value || '网页采集')
    .split(/[\\/]+/)
    .map(part => part.replace(/[<>:"|?* -]/g, '_').replace(/^\.+$/, '_').trim())
    .filter(Boolean)
    .join('/') || '网页采集';
}

function extFromContentType(ct){
  const value = String(ct || '').toLowerCase();
  if(value.includes('png')) return '.png';
  if(value.includes('jpeg') || value.includes('jpg')) return '.jpg';
  if(value.includes('webp')) return '.webp';
  if(value.includes('gif')) return '.gif';
  if(value.includes('avif')) return '.avif';
  if(value.includes('svg')) return '.svg';
  if(value.includes('mp4')) return '.mp4';
  if(value.includes('webm')) return '.webm';
  if(value.includes('quicktime')) return '.mov';
  if(value.includes('mpeg') || value.includes('mp3')) return '.mp3';
  return '';
}

function downloadFileName(item, contentType){
  let base = imageName(item.url);
  const hasExt = /\.[a-z0-9]{2,5}$/i.test(base);
  base = base.replace(/[<>:"|?*\\/ -]/g, '_').slice(0, 80) || 'web-media';
  if(hasExt) return base;
  const ext = extFromContentType(contentType) || ((item.kind || mediaKindFromUrl(item.url)) === 'video' ? '.mp4' : '.jpg');
  return base + ext;
}

// 把 dataURL 转成扩展上下文里的 blob URL，供 chrome.downloads 使用（大体积 data URL 直接下会失败）。
async function dataUrlToObjectUrl(dataUrl){
  const blob = await (await fetch(dataUrl)).blob();
  return URL.createObjectURL(blob);
}

function triggerDownload(options){
  return new Promise((resolve, reject) => {
    chrome.downloads.download(options, id => {
      if(chrome.runtime.lastError || id === undefined){
        reject(new Error(chrome.runtime.lastError?.message || '下载失败'));
      } else {
        resolve(id);
      }
    });
  });
}

function base64ToBytes(b64){
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function dataUrlToBytes(dataUrl){
  const comma = String(dataUrl || '').indexOf(',');
  return base64ToBytes(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
}

function crc32(bytes){
  let table = crc32.table;
  if(!table){
    table = crc32.table = new Uint32Array(256);
    for(let n = 0; n < 256; n++){
      let c = n;
      for(let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
  }
  let crc = 0xFFFFFFFF;
  for(let i = 0; i < bytes.length; i++) crc = (crc >>> 8) ^ table[(crc ^ bytes[i]) & 0xFF];
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// 在浏览器里直接生成 ZIP（store 无压缩；图片/视频本已压缩，store 足够且快），不依赖第三方库。
function buildZipBlob(files){
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  const dosTime = 0;
  const dosDate = 0x21; // 1980-01-01，固定值
  files.forEach(file => {
    const nameBytes = enc.encode(file.name);
    const data = file.bytes;
    const crc = crc32(data);
    const size = data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0x0800, true); // UTF-8 文件名
    lh.setUint16(8, 0, true);      // store
    lh.setUint16(10, dosTime, true);
    lh.setUint16(12, dosDate, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, size, true);
    lh.setUint32(22, size, true);
    lh.setUint16(26, nameBytes.length, true);
    lh.setUint16(28, 0, true);
    const localHeader = new Uint8Array(lh.buffer);
    parts.push(localHeader, nameBytes, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true);
    ch.setUint16(12, dosTime, true);
    ch.setUint16(14, dosDate, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, size, true);
    ch.setUint32(24, size, true);
    ch.setUint16(28, nameBytes.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), nameBytes);
    offset += localHeader.length + nameBytes.length + size;
  });
  const centralStart = offset;
  const centralSize = central.reduce((sum, c) => sum + c.length, 0);
  const eo = new DataView(new ArrayBuffer(22));
  eo.setUint32(0, 0x06054b50, true);
  eo.setUint16(8, files.length, true);
  eo.setUint16(10, files.length, true);
  eo.setUint32(12, centralSize, true);
  eo.setUint32(16, centralStart, true);
  return new Blob([...parts, ...central, new Uint8Array(eo.buffer)], {type: 'application/zip'});
}

// 下载到浏览器下载目录，不经过后端——可当独立采集工具使用。单张下原文件，多张打包成一个 zip。
async function downloadSelected(){
  const picked = visibleImages().filter(item => selected.has(item.url));
  if(!picked.length) return;
  await saveSettings();
  els.download.disabled = true;
  const folder = safeFolderName(els.folder.value);

  // blob: 必须在网页上下文里读成字节
  const needsFetch = picked.filter(item => /^blob:/i.test(item.url));
  const fetchedByUrl = new Map();
  if(needsFetch.length){
    setStatus(`正在从页面读取 ${needsFetch.length} 个素材...`);
    const tabId = await getActiveTabId().catch(() => 0);
    if(tabId){
      const results = await chrome.scripting.executeScript({
        target: {tabId, allFrames: true},
        func: fetchMediaAsBase64,
        args: [needsFetch.map(item => item.url)],
      }).catch(() => []);
      (results || []).forEach(frame => {
        (frame?.result || []).forEach(entry => {
          if(!entry?.url) return;
          const existing = fetchedByUrl.get(entry.url);
          if(!existing || (!existing.ok && entry.ok)) fetchedByUrl.set(entry.url, entry);
        });
      });
    }
  }

  // 单张：直接下原文件，不打包
  if(picked.length === 1){
    const objectUrls = [];
    try {
      const item = picked[0];
      let url = '';
      let contentType = '';
      if(/^data:/i.test(item.url)){
        url = await dataUrlToObjectUrl(item.url);
        objectUrls.push(url);
        contentType = item.url.match(/^data:([^;,]+)/i)?.[1] || '';
      } else if(/^blob:/i.test(item.url)){
        const fetched = fetchedByUrl.get(item.url);
        if(!fetched?.ok) throw new Error('页面读取失败');
        url = await dataUrlToObjectUrl(fetched.data);
        objectUrls.push(url);
        contentType = fetched.contentType;
      } else {
        url = item.url;
      }
      await triggerDownload({url, filename: `${folder}/${downloadFileName(item, contentType)}`, conflictAction: 'uniquify', saveAs: false});
      setStatus(`下载完成：1 个（保存在下载目录的 ${folder} 文件夹）。`);
    } catch (err) {
      setStatus(`下载失败：${err?.message || '未知错误'}`);
    } finally {
      if(objectUrls.length) setTimeout(() => objectUrls.forEach(u => URL.revokeObjectURL(u)), 60000);
      els.download.disabled = selected.size === 0;
    }
    return;
  }

  // 多张：取字节后打包成一个 zip
  const usedNames = new Set();
  const uniqueName = name => {
    if(!usedNames.has(name)){ usedNames.add(name); return name; }
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    let i = 2;
    let candidate;
    do { candidate = `${stem}_${i++}${ext}`; } while(usedNames.has(candidate));
    usedNames.add(candidate);
    return candidate;
  };
  const files = [];
  let failed = 0;
  for(let i = 0; i < picked.length; i++){
    const item = picked[i];
    setStatus(`正在打包 ${i + 1}/${picked.length}...`);
    try {
      let bytes;
      let contentType = '';
      if(/^data:/i.test(item.url)){
        contentType = item.url.match(/^data:([^;,]+)/i)?.[1] || '';
        bytes = dataUrlToBytes(item.url);
      } else if(/^blob:/i.test(item.url)){
        const fetched = fetchedByUrl.get(item.url);
        if(!fetched?.ok) throw new Error('页面读取失败');
        contentType = fetched.contentType;
        bytes = dataUrlToBytes(fetched.data);
      } else {
        const res = await fetch(item.url);
        if(!res.ok) throw new Error(`HTTP ${res.status}`);
        contentType = (res.headers.get('content-type') || '').split(';', 1)[0].trim();
        bytes = new Uint8Array(await res.arrayBuffer());
      }
      if(!bytes.length) throw new Error('空内容');
      files.push({name: uniqueName(downloadFileName(item, contentType)), bytes});
    } catch {
      failed += 1;
    }
  }
  if(!files.length){
    setStatus(`打包失败：没有可下载的素材${failed ? `（失败 ${failed} 个）` : ''}。`);
    els.download.disabled = selected.size === 0;
    return;
  }
  setStatus('正在生成压缩包...');
  const zipUrl = URL.createObjectURL(buildZipBlob(files));
  try {
    await triggerDownload({url: zipUrl, filename: `${folder}.zip`, conflictAction: 'uniquify', saveAs: false});
    setStatus(`已打包下载：${files.length} 个素材${failed ? `，失败 ${failed} 个` : ''}（${folder}.zip）。`);
  } catch (err) {
    setStatus(`压缩包下载失败：${err?.message || '未知错误'}`);
  } finally {
    setTimeout(() => URL.revokeObjectURL(zipUrl), 60000);
    els.download.disabled = selected.size === 0;
  }
}

els.test.addEventListener('click', () => testConnection().catch(err => setStatus(err.message || '连接失败')));
els.github?.addEventListener('click', () => {
  chrome.tabs.create({url: 'https://github.com/hero8152/Infinite-Canvas'});
});
els.pin.addEventListener('click', () => openSidePanel().catch(err => setStatus(err.message || '固定侧边栏失败')));
els.settingsToggle.addEventListener('click', () => {
  settingsCollapsed = !settingsCollapsed;
  updateSettingsUi();
  saveSettings();
});
els.scan.addEventListener('click', () => scanImages().catch(err => setStatus(err.message || '扫描失败')));
els.capture?.addEventListener('click', () => captureVisibleArea().catch(err => setStatus(err.message || '截取失败')));
els.download.addEventListener('click', () => downloadSelected().catch(err => {
  setStatus(err.message || '下载失败');
  els.download.disabled = selected.size === 0;
}));
els.import.addEventListener('click', () => importSelected().catch(err => {
  setStatus(err.message || '导入失败');
  els.import.disabled = selected.size === 0;
}));
els.selectAll.addEventListener('click', () => {
  selected = new Set(visibleImages().map(item => item.url));
  updateVisibleCardSelections();
  syncPreviewSelection();
});
els.clear.addEventListener('click', () => {
  selected.clear();
  updateVisibleCardSelections();
  syncPreviewSelection();
});
els.provider.addEventListener('change', () => {
  savedSettings.provider = els.provider.value || '';
  savedSettings.model = '';
  renderProviders();
  saveSettings();
});
els.autoScroll.addEventListener('change', () => saveSettings());
els.filterLowRes?.addEventListener('change', () => {
  pruneHiddenSelection();
  renderGrid();
  saveSettings();
});
[els.server, els.token, els.folder, els.classify, els.model, els.prompt].filter(Boolean).forEach(el => {
  el.addEventListener('change', () => {
    if(el === els.model) savedSettings.model = els.model.value || '';
    updateSettingsUi();
    saveSettings();
  });
  el.addEventListener('input', () => {
    if(el === els.model) savedSettings.model = els.model.value || '';
    updateSettingsUi();
    saveSettings();
  });
});

els.prompt.addEventListener('blur', () => saveSettings());
window.addEventListener('beforeunload', () => {
  savedSettings.provider = els.provider.value || savedSettings.provider || '';
  savedSettings.model = els.model.value || savedSettings.model || '';
  chrome.storage.local.set(getSettingsPayload());
});
window.addEventListener('keydown', event => {
  if(event.key === 'Escape') closeImagePreview();
});

(async function init(){
  await loadSettings();
  try { await loadProviders(); setStatus('连接成功，可以扫描当前页面图片。'); }
  catch { setStatus('请输入服务地址后点击连接，例如 192.168.1.10:3000。'); }
})();
