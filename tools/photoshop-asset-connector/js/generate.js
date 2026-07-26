/* 生成 Tab：顶部模式切换。
 *  - API平台：选平台 + 模型 → 参数按后端 /api/image-params 动态渲染 → /api/canvas-image-tasks 轮询。
 *  - RunningHub：选工作流 → 工作流暴露字段(cfg.fields enabled) → /api/runninghub/workflow-submit 轮询 /query。
 * 结果自动置入图层。参数全部从后端拉，不写死。 */
(function () {
  const net = DX.net;
  const ps = DX.ps;
  const state = DX.state;

  const $ = (id) => document.getElementById(id);
  const els = {
    modes: $('genModes'),
    apiBar: $('genApiBar'),
    provider: $('genProvider'),
    model: $('genModel'),
    rhBar: $('genRhBar'),
    rhWorkflow: $('genRhWorkflow'),
    rhWallet: $('genRhWallet'),
    prompt: $('genPrompt'),
    params: $('genParams'),
    refsSection: $('genRefsSection'),
    refs: $('genRefs'),
    results: $('genResults'),
    run: $('genRun'),
    msg: $('genMsg'),
  };

  const g = {
    mode: 'api',           // api | ms | rh
    providersLoaded: false,
    apiProviders: [],
    msProvider: null,
    addingRef: false,
    fields: [],
    values: {},
    imgPreview: {},        // 图片字段 key -> 预览 url
    randomActive: {},      // seed/noise 字段 key -> 是否每次运行随机
    refs: [],
    results: [],
    rhWorkflows: [],
    rhWorkflowId: '',
    jobs: 0,               // 进行中的生成任务数（支持队列/并行）
  };

  function escapeHtml(v) {
    return String(v ?? '').replace(/[&<>"']/g, (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  function setMsg(t, k = '') { els.msg.textContent = t || ''; els.msg.className = `push-msg ${k}`; }

  const SEED_MAX = 4294967295;
  function isSeedField(f) {
    const text = `${(f && f.key) || ''} ${(f && f.label) || ''} ${(f && f.input) || ''} ${(f && f.name) || ''}`.toLowerCase();
    return /seed|noise|随机|种子|噪/.test(text);
  }
  function randomEnabledField(f) {
    return f && f.type === 'int' && (f.random_enabled === true || isSeedField(f));
  }
  function randomActive(f) {
    return g.randomActive[f.key] !== false;
  }
  function randomValue(f) {
    const min = Number.isFinite(Number(f.min)) ? Number(f.min) : (isSeedField(f) ? 1 : 0);
    let max = Number.isFinite(Number(f.max)) ? Number(f.max) : (isSeedField(f) ? SEED_MAX : 999999);
    if (isSeedField(f)) max = Math.min(max, SEED_MAX);
    const lo = Math.max(0, Math.floor(min));
    const hi = Math.max(lo + 1, Math.floor(max));
    return Math.floor(lo + Math.random() * (hi - lo + 1));
  }
  function applyRandomSeeds() {
    let changed = false;
    for (const f of g.fields) {
      if (!randomEnabledField(f) || !randomActive(f)) continue;
      g.values[f.key] = randomValue(f);
      changed = true;
    }
    if (changed) renderParams();
  }

  /* ---------- 模式切换（带记忆：切走再切回，恢复选择与已填参数） ---------- */
  const modeMem = {};
  function saveCurrentMode() {
    modeMem[g.mode] = {
      fields: g.fields, values: g.values, imgPreview: g.imgPreview, randomActive: g.randomActive,
      refs: g.refs.slice(), results: g.results.slice(),
      rhWorkflowId: g.rhWorkflowId,
      providerVal: DX.ui.pickerValue(els.provider), modelVal: DX.ui.pickerValue(els.model),
    };
  }
  function setMode(mode) {
    saveCurrentMode();                 // 先存当前模式
    g.mode = mode;
    const apiLike = (mode === 'api' || mode === 'ms');
    els.modes.querySelectorAll('.seg').forEach((b) => b.classList.toggle('active', b.getAttribute('data-mode') === mode));
    els.apiBar.classList.toggle('hidden', !apiLike);
    els.provider.classList.toggle('hidden', mode !== 'api');
    els.rhBar.classList.toggle('hidden', mode !== 'rh');
    els.prompt.classList.toggle('hidden', !apiLike);
    els.refsSection.classList.toggle('hidden', !apiLike);
    const mem = modeMem[mode];
    els.params.innerHTML = '';
    g.fields = []; g.values = {}; g.imgPreview = {}; g.randomActive = (mem && mem.randomActive) ? mem.randomActive : {};
    g.refs = (apiLike && mem && mem.refs) ? mem.refs.slice() : [];
    g.results = (mem && mem.results) ? mem.results.slice() : [];
    g.rhWorkflowId = mem ? mem.rhWorkflowId : '';
    renderResults();
    if (apiLike) renderRefs();
    if (mode === 'api') loadApi(mem);
    else if (mode === 'ms') loadMs(mem);
    else if (mode === 'rh') loadRhWorkflows(mem);
    updateRun();
  }

  /* ---------- API 平台 / ModelScope ---------- */
  async function ensureProviders() {
    if (g.providersLoaded || !state.connected) return;
    const data = await net.apiGet('/api/providers');
    const all = (data.providers || data.api_providers || []).filter((p) => Array.isArray(p.image_models) && p.image_models.length);
    // API 模式排除 RunningHub 与 ModelScope（它们是独立模式）
    g.apiProviders = all.filter((p) => p.protocol !== 'runninghub' && p.id !== 'runninghub' && p.id !== 'modelscope');
    g.msProvider = all.find((p) => p.id === 'modelscope') || null;
    g.providersLoaded = true;
  }
  async function loadApi(mem) {
    setMsg('正在加载平台 …');
    try {
      await ensureProviders();
      if (!g.apiProviders.length) { setMsg('没有可用的 API 平台，请先在网页端配置。', 'err'); return; }
      DX.ui.fillPicker(els.provider, g.apiProviders.map((p) => ({ value: p.id, label: p.name || p.id })), mem && mem.providerVal);
      const p = currentProvider();
      DX.ui.fillPicker(els.model, ((p && p.image_models) || []).map((m) => ({ value: m, label: m })), mem && mem.modelVal);
      if (mem && mem.fields && mem.fields.length) {
        g.fields = mem.fields; g.values = mem.values; g.imgPreview = mem.imgPreview || {};
        renderParams();
      } else { await loadSchema(); }
      setMsg('');
    } catch (err) { setMsg(`加载平台失败：${err.message || err}`, 'err'); }
    updateRun();
  }
  async function loadMs(mem) {
    setMsg('正在加载 ModelScope …');
    try {
      await ensureProviders();
      if (!g.msProvider) { setMsg('未配置 ModelScope 平台，请先在网页端配置。', 'err'); els.params.innerHTML = ''; return; }
      DX.ui.fillPicker(els.model, (g.msProvider.image_models || []).map((m) => ({ value: m, label: m })), mem && mem.modelVal);
      if (mem && mem.fields && mem.fields.length) {
        g.fields = mem.fields; g.values = mem.values; g.imgPreview = mem.imgPreview || {};
        renderParams();
      } else { await loadSchema(); }
      setMsg('');
    } catch (err) { setMsg(`加载 ModelScope 失败：${err.message || err}`, 'err'); }
    updateRun();
  }
  function currentProvider() {
    if (g.mode === 'ms') return g.msProvider;
    const v = DX.ui.pickerValue(els.provider);
    return g.apiProviders.find((p) => p.id === v) || g.apiProviders[0] || null;
  }
  function renderModels() {
    const p = currentProvider();
    DX.ui.fillPicker(els.model, ((p && p.image_models) || []).map((m) => ({ value: m, label: m })));
  }
  async function loadSchema() {
    const p = currentProvider();
    if (!p) return;
    try {
      const schema = await net.apiGet(`/api/image-params?provider_id=${encodeURIComponent(p.id)}&model=${encodeURIComponent(DX.ui.pickerValue(els.model) || '')}`);
      g.fields = (Array.isArray(schema.fields) ? schema.fields : []).filter((f) => !isHiddenField(f));
      if (!g.fields.length) throw new Error('empty');
    } catch (err) {
      g.fields = defaultFields(String(DX.ui.pickerValue(els.model) || '').toLowerCase().includes('gpt-image-2'));
    }
    initValues();
    renderParams();
    updateRun();
  }
  function defaultFields(useAuto = false) {
    return [
      { key: 'size', type: 'size', label: '尺寸',
        ratios: ['1:1', '3:4', '4:3', '16:9', '9:16'].map((v) => ({ value: v, label: v })),
        resolutions: (useAuto ? [{ value: 'auto', label: '自动' }] : []).concat([{ value: '1k', label: '1K' }, { value: '2k', label: '2K' }]),
        default: { ratio: '1:1', resolution: useAuto ? 'auto' : '1k' } },
      { key: 'n', type: 'int', label: '数量', control: 'picker', options: [1, 2, 4], default: 1 },
      { key: 'reference_images', type: 'refs', label: '参考图', max: 3 },
    ];
  }

  function isHiddenField(f) {
    const key = String((f && f.key) || '').toLowerCase();
    const label = String((f && f.label) || '').toLowerCase();
    return (f && f.type === 'notice') || key === 'quality' || label === '质量' || label === 'quality';
  }

  function isCountField(f) {
    const key = String((f && f.key) || '').toLowerCase();
    const label = String((f && f.label) || '').toLowerCase();
    return key === 'n' || key === 'count' || key === 'number' || key === 'num_images' || key === 'batch_size' || label === '数量' || label === '张数';
  }

  function choiceOptions(f) {
    const opts = Array.isArray(f.options) ? f.options : [];
    if (opts.length) return opts;
    return isCountField(f) ? [1, 2, 4] : [];
  }

  function countFieldIndex() {
    return g.fields.findIndex((f) => isCountField(f));
  }

  function sizeResolutionOptions(f) {
    const seen = new Set();
    return (f.resolutions || []).concat([{ value: 'doc', label: '画布尺寸' }, { value: 'custom', label: '自定义' }]).filter((item) => {
      const key = String((item && item.value) || '');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /* ---------- RunningHub ---------- */
  async function loadRhWorkflows(mem) {
    setMsg('正在加载 RunningHub 工作流 …');
    try {
      const data = await net.apiGet('/api/runninghub/workflows');
      g.rhWorkflows = data.workflows || [];
      DX.ui.fillPicker(els.rhWorkflow, [{ value: '', label: '请选择工作流' }].concat(g.rhWorkflows.map((w) => ({ value: w.workflowId, label: w.title || w.workflowId }))), mem && mem.rhWorkflowId);
      if (mem && mem.rhWorkflowId && mem.fields) {
        g.rhWorkflowId = mem.rhWorkflowId; g.fields = mem.fields; g.values = mem.values; g.imgPreview = mem.imgPreview || {};
        renderParams(); setMsg('');
      } else {
        g.rhWorkflowId = '';
        setMsg(g.rhWorkflows.length ? '请选择一个工作流。' : '没有已保存的工作流，请先在网页端添加。', g.rhWorkflows.length ? '' : 'err');
      }
    } catch (err) { setMsg(`加载工作流失败：${err.message || err}`, 'err'); }
    updateRun();
  }
  async function loadRhFields() {
    const wid = DX.ui.pickerValue(els.rhWorkflow);
    g.rhWorkflowId = wid;
    g.fields = []; g.values = {}; g.imgPreview = {}; g.randomActive = {};
    if (!wid) { els.params.innerHTML = ''; updateRun(); return; }
    els.params.innerHTML = '<div class="gen-label">正在加载工作流参数 …</div>';
    try {
      const data = await net.apiGet(`/api/runninghub/workflows/${encodeURIComponent(wid)}`);
      const exposed = ((data.workflow || {}).fields || []).filter((f) => f.enabled);
      g.fields = exposed.map((f) => {
        const t = String(f.fieldType || 'TEXT').toUpperCase();
        const opts = (f.options || []).map((o) => (o && typeof o === 'object' ? o.value : o)).filter((o) => o != null && String(o) !== '');
        const base = { key: `${f.nodeId}.${f.fieldName}`, label: f.label || f.fieldName, name: f.fieldName, rh: { nodeId: f.nodeId, fieldName: f.fieldName }, default: f.fieldValue, min: f.min, max: f.max, step: f.step, random_enabled: f.random_enabled === true };
        if (t === 'IMAGE') return Object.assign(base, { type: 'image' });
        if (opts.length) return Object.assign(base, { type: 'dropdown', options: opts.map((o) => ({ value: String(o), label: String(o) })), default: opts.map(String).indexOf(String(f.fieldValue)) >= 0 ? String(f.fieldValue) : String(opts[0]) });
        if (t === 'BOOLEAN') return Object.assign(base, { type: 'bool', default: String(f.fieldValue).toLowerCase() === 'true' });
        if (t === 'NUMBER') return Object.assign(base, { type: 'int' });
        return Object.assign(base, { type: 'textarea' });
      }).filter((f) => !isHiddenField(f));
      initValues();
      renderParams();
      setMsg(g.fields.length ? '' : '该工作流未暴露可填参数，可直接生成。');
    } catch (err) { g.fields = []; els.params.innerHTML = ''; setMsg(`加载工作流参数失败：${err.message || err}`, 'err'); }
    updateRun();
  }

  /* ---------- 参数渲染（通用） ---------- */
  function initValues() {
    g.values = {};
    for (const f of g.fields) {
      if (f.type === 'refs' || f.type === 'notice') continue;
      if (f.type === 'size') g.values[f.key] = { ratio: (f.default || {}).ratio || '1:1', res: (f.default || {}).resolution || '1k', w: 1024, h: 1024 };
      else if (randomEnabledField(f) && (f.default === undefined || f.default === null || f.default === '')) g.values[f.key] = randomValue(f);
      else g.values[f.key] = f.default;
    }
  }
  function chips(fi, group, options, current) {
    return `<div class="chip-row">` + options.map((o) => {
      const obj = (typeof o === 'object') ? o : { value: o, label: String(o) };
      const active = String(obj.value) === String(current) ? ' active' : '';
      return `<button class="chip${active}" type="button" data-chip data-fi="${fi}" data-group="${group}" data-val="${escapeHtml(obj.value)}">${escapeHtml(obj.label)}</button>`;
    }).join('') + `</div>`;
  }
  function renderField(f, fi) {
    if (f.type === 'refs' || f.type === 'notice') return '';
    const lbl = `<div class="gen-label">${escapeHtml(f.label || f.key)}</div>`;
    if (f.type === 'size') {
      const v = g.values[f.key] || {};
      const cfi = countFieldIndex();
      const countCol = cfi >= 0 ? `<div class="size-col"><div class="mini-label">数量</div><sp-picker class="gen-dd compact-picker" size="s" data-fi="${cfi}" data-role="choice"><sp-menu slot="options"></sp-menu></sp-picker></div>` : '';
      const resOpts = sizeResolutionOptions(f);
      let extra = '';
      if (v.res === 'doc') { const d = ps.docSize(); extra = `<div class="size-foot"><div class="size-hint">${d ? `画布尺寸 ${d.w} × ${d.h}` : '没有打开的文档'}</div></div>`; }
      else if (v.res === 'auto') { extra = `<div class="size-foot"><div class="size-hint">由 GPT 自动决定输出尺寸</div></div>`; }
      else if (v.res === 'custom') {
        extra = `<div class="size-foot"><div class="size-inline">
          <input class="gen-input mini-input" type="number" data-sizewh="w" data-fi="${fi}" placeholder="宽" value="${escapeHtml(v.w || '')}">
          <input class="gen-input mini-input" type="number" data-sizewh="h" data-fi="${fi}" placeholder="高" value="${escapeHtml(v.h || '')}"></div></div>`;
      }
      const showRatio = !(v.res === 'doc' || v.res === 'custom' || v.res === 'auto');
      const sizeClass = v.res === 'custom' ? ' custom' : (v.res === 'doc' ? ' doc' : (v.res === 'auto' ? ' auto' : ''));
      return `<div class="size-box${sizeClass}">${lbl}${showRatio ? `<div class="size-grid ${countCol ? 'triple' : ''}">
        <div class="size-col"><div class="mini-label">比例</div><sp-picker class="gen-dd compact-picker" size="s" data-fi="${fi}" data-role="size-ratio"><sp-menu slot="options"></sp-menu></sp-picker></div>
        <div class="size-col"><div class="mini-label">分辨率</div><sp-picker class="gen-dd compact-picker" size="s" data-fi="${fi}" data-role="size-res"><sp-menu slot="options"></sp-menu></sp-picker></div>
        ${countCol}
      </div>` : `<div class="size-grid ${countCol ? 'triple' : 'single'}"><div class="size-col"><div class="mini-label">分辨率</div><sp-picker class="gen-dd compact-picker" size="s" data-fi="${fi}" data-role="size-res"><sp-menu slot="options"></sp-menu></sp-picker></div>${countCol}</div>`}${extra}</div>`;
    }
    if ((f.type === 'select' || f.type === 'int') && (isCountField(f) || f.control === 'picker' || f.control === 'dropdown')) {
      return `<div class="field-stack">${lbl}<sp-picker class="gen-dd compact-picker" size="s" data-fi="${fi}" data-role="choice"><sp-menu slot="options"></sp-menu></sp-picker></div>`;
    }
    if ((f.type === 'select' || f.type === 'int') && (f.control === 'chips' || Array.isArray(f.options))) {
      return `<div class="field-stack">${lbl}${chips(fi, '', f.options || [], g.values[f.key])}</div>`;
    }
    if (f.type === 'dropdown') return `<div class="field-stack">${lbl}<sp-picker class="gen-dd compact-picker" data-fi="${fi}" data-role="choice" size="s"><sp-menu slot="options"></sp-menu></sp-picker></div>`;
    if (f.type === 'textarea') return `<div class="field-stack">${lbl}<textarea class="gen-input gen-ta" data-input data-fi="${fi}" rows="2">${escapeHtml(g.values[f.key] ?? '')}</textarea></div>`;
    if (f.type === 'bool') return `<div class="field-stack"><label class="gen-check"><input type="checkbox" data-input data-fi="${fi}" ${g.values[f.key] ? 'checked' : ''}> ${escapeHtml(f.label || f.key)}</label></div>`;
    if (f.type === 'image') {
      const prev = g.imgPreview[f.key];
      const thumb = prev ? `<div class="ref-tile"><img src="${escapeHtml(net.absUrl(prev))}" alt=""><div class="ref-num">1</div><div class="ref-x" data-imgclr="${fi}">×</div></div>` : '';
      const add = `<div class="ref-add img-add" data-rhimg="${fi}" title="加当前画面"><div class="ref-add-plus">＋</div><div class="ref-add-cap">${prev ? '替换' : '加画面'}</div></div>`;
      return `<div class="field-stack">${lbl}<div class="gen-thumbs">${thumb}${add}</div></div>`;
    }
    const inputType = f.type === 'int' ? 'number' : 'text';
    if (randomEnabledField(f)) {
      const active = randomActive(f);
      return `<div class="field-stack">${lbl}<div class="seed-row"><input class="gen-input" type="number" data-input data-fi="${fi}" value="${escapeHtml(g.values[f.key] ?? '')}" ${active ? 'readonly' : ''}><button class="dice-btn ${active ? 'active' : ''}" type="button" data-random-fi="${fi}" title="${active ? '随机已开启，点击关闭' : '随机已关闭，点击开启'}">随机</button></div></div>`;
    }
    return `<div class="field-stack">${lbl}<input class="gen-input" type="${inputType}" data-input data-fi="${fi}" value="${escapeHtml(g.values[f.key] ?? '')}"></div>`;
  }
  function renderParams() {
    const sizeIndex = g.fields.findIndex((f) => f.type === 'size');
    const cfi = countFieldIndex();
    els.params.innerHTML = g.fields.map((f, fi) => (sizeIndex >= 0 && fi === cfi ? '' : renderField(f, fi))).filter(Boolean).join('');
    els.params.querySelectorAll('[data-chip]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const fi = chip.getAttribute('data-fi');
        const group = chip.getAttribute('data-group');
        const raw = chip.getAttribute('data-val');
        const f = g.fields[Number(fi)];
        els.params.querySelectorAll(`[data-fi="${fi}"][data-group="${group || ''}"]`).forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        if (f.type === 'size') { if (group === 'ratio') g.values[f.key].ratio = raw; else { g.values[f.key].res = raw; renderParams(); } }
        else if (f.type === 'int') g.values[f.key] = Number(raw);
        else g.values[f.key] = raw;
      });
    });
    els.params.querySelectorAll('[data-input]').forEach((inp) => {
      inp.addEventListener('input', () => {
        if (inp.hasAttribute('readonly')) return;
        const f = g.fields[Number(inp.getAttribute('data-fi'))];
        g.values[f.key] = f.type === 'bool' ? inp.checked : inp.value;
      });
    });
    els.params.querySelectorAll('[data-sizewh]').forEach((inp) => {
      inp.addEventListener('input', () => { g.values[g.fields[Number(inp.getAttribute('data-fi'))].key][inp.getAttribute('data-sizewh')] = inp.value; });
    });
    els.params.querySelectorAll('[data-random-fi]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const f = g.fields[Number(btn.getAttribute('data-random-fi'))];
        g.randomActive[f.key] = !randomActive(f);
        if (g.randomActive[f.key]) g.values[f.key] = randomValue(f);
        renderParams();
      });
    });
    els.params.querySelectorAll('[data-rhimg]').forEach((btn) => {
      btn.addEventListener('click', () => setImageField(Number(btn.getAttribute('data-rhimg')), btn));
    });
    els.params.querySelectorAll('[data-imgclr]').forEach((x) => x.addEventListener('click', (e) => {
      e.stopPropagation();
      const f = g.fields[Number(x.getAttribute('data-imgclr'))];
      delete g.imgPreview[f.key]; g.values[f.key] = '';
      renderParams();
    }));
    els.params.querySelectorAll('sp-picker[data-fi]').forEach((picker) => {
      const fi = Number(picker.getAttribute('data-fi'));
      const f = g.fields[fi];
      if (!f) return;
      const role = picker.getAttribute('data-role') || '';
      if (f.type === 'size') {
        const v = g.values[f.key] || {};
        if (role === 'size-ratio') {
          DX.ui.fillPicker(picker, f.ratios || [], v.ratio);
          DX.ui.onPick(picker, () => { g.values[f.key].ratio = DX.ui.pickerValue(picker); });
          return;
        }
        if (role === 'size-res') {
          DX.ui.fillPicker(picker, sizeResolutionOptions(f), v.res);
          DX.ui.onPick(picker, () => {
            g.values[f.key].res = DX.ui.pickerValue(picker);
            renderParams();
          });
          return;
        }
      }
      DX.ui.fillPicker(picker, choiceOptions(f), g.values[f.key]);
      DX.ui.onPick(picker, () => {
        const raw = DX.ui.pickerValue(picker);
        g.values[f.key] = f.type === 'int' ? Number(raw) : raw;
      });
    });
  }

  // RH 图片字段：导出当前图层 → 上传 → 设为该字段输入
  async function setImageField(fi, btn) {
    if (!ps.hasDocument()) { setMsg('没有打开的文档。', 'err'); return; }
    const f = g.fields[fi];
    btn.disabled = true;
    try {
      setMsg('正在导出并上传图层 …');
      const { buffer, name } = await ps.exportCurrentPng();
      const url = await net.uploadInputBase64(buffer, name);   // 预览用
      g.imgPreview[f.key] = url;
      if (g.mode === 'rh') {
        const res = await net.apiSend('POST', '/api/runninghub/upload-asset', { url, useWallet: els.rhWallet.checked });
        const fileName = res.data && res.data.fileName;
        if (!fileName) throw new Error('RunningHub 未返回 fileName');
        g.values[f.key] = fileName;
      } else {
        g.values[f.key] = url;
      }
      renderParams();
      setMsg('已设置该字段的输入图。', 'ok');
    } catch (err) { setMsg(`设置图片失败：${err.message || err}`, 'err'); }
    finally { btn.disabled = false; }
  }

  const BASE = { '1k': 1024, '2k': 2048, '4k': 4096 };
  function collectApiParams() {
    const out = {};
    for (const f of g.fields) {
      if (f.type === 'refs' || f.type === 'notice') continue;
      if (f.type === 'size') {
        const v = g.values[f.key] || {};
        const r8 = (x) => Math.max(64, Math.round((Number(x) || 0) / 8) * 8);
        let W, H;
        if (v.res === 'auto') { out[f.key] = 'auto'; continue; }
        if (v.res === 'custom') { W = Number(v.w) || 1024; H = Number(v.h) || 1024; }
        else if (v.res === 'doc') { const d = ps.docSize() || { w: 1024, h: 1024 }; W = d.w; H = d.h; }
        else { const [rw, rh] = String(v.ratio || '1:1').split(':').map(Number); const base = BASE[v.res] || 1024; if (rw >= rh) { W = base; H = Math.round(base * rh / rw); } else { H = base; W = Math.round(base * rw / rh); } }
        out[f.key] = `${r8(W)}x${r8(H)}`;
      } else if (g.values[f.key] !== undefined) out[f.key] = g.values[f.key];
    }
    return out;
  }

  /* ---------- 参考图（仅 API/MS 模式）：编号缩略图 + 加号瓦片 + 调序 ---------- */
  function renderRefs() {
    const tiles = g.refs.map((r, i) => `
      <div class="ref-tile" title="${escapeHtml(r.name || '')}">
        <img src="${escapeHtml(net.absUrl(r.url))}" alt="">
        <div class="ref-num">${i + 1}</div>
        <div class="ref-x" data-x="${i}">×</div>
        <div class="ref-move">
          <button class="ref-arrow" type="button" data-mv="${i}:-1"${i === 0 ? ' disabled' : ''}>‹</button>
          <button class="ref-arrow" type="button" data-mv="${i}:1"${i === g.refs.length - 1 ? ' disabled' : ''}>›</button>
        </div>
      </div>`).join('');
    els.refs.innerHTML = tiles + `<div class="ref-add" id="refAddTile" title="加当前画面"><div class="ref-add-plus">＋</div><div class="ref-add-cap">加画面</div></div>`;
    els.refs.querySelector('#refAddTile').addEventListener('click', addCurrentLayer);
    els.refs.querySelectorAll('[data-x]').forEach((x) => x.addEventListener('click', (e) => {
      e.stopPropagation(); g.refs.splice(Number(x.getAttribute('data-x')), 1); renderRefs();
    }));
    els.refs.querySelectorAll('[data-mv]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const [i, d] = b.getAttribute('data-mv').split(':').map(Number);
      const j = i + d;
      if (j < 0 || j >= g.refs.length) return;
      const t = g.refs[i]; g.refs[i] = g.refs[j]; g.refs[j] = t;
      renderRefs();
    }));
  }
  async function addCurrentLayer() {
    if (g.addingRef) return;
    if (!ps.hasDocument()) { setMsg('没有打开的文档。', 'err'); return; }
    g.addingRef = true;
    try {
      setMsg('正在导出当前图层 …');
      const { buffer, name } = await ps.exportCurrentPng();
      const url = await net.uploadInputBase64(buffer, name);
      g.refs.push({ url, name });
      renderRefs();
      setMsg(`已添加参考图 ${g.refs.length}：${name}`, 'ok');
    } catch (err) { setMsg(`添加参考图失败：${err.message || err}`, 'err'); }
    finally { g.addingRef = false; }
  }

  /* ---------- 结果 ---------- */
  function renderResults() {
    els.results.innerHTML = g.results.map((r, i) =>
      `<div class="gen-thumb result" data-r="${i}" title="${escapeHtml(r.name || '')}"><img src="${escapeHtml(net.absUrl(r.url))}" alt=""><div class="dl">下载到图层</div></div>`).join('');
    els.results.querySelectorAll('[data-r]').forEach((node) => node.addEventListener('click', async () => {
      const r = g.results[Number(node.getAttribute('data-r'))];
      if (!r) return;
      setMsg('正在下载到图层 …');
      try { await ps.placeImage({ url: r.url, name: r.name, kind: 'image' }); setMsg(`已下载到图层：${r.name || ''}`, 'ok'); }
      catch (err) { setMsg(`下载失败：${err.message || err}`, 'err'); }
    }));
  }
  function appendResults(imgs, prefix) {
    const items = (imgs || []).map((u, i) => ({ url: u, name: `${prefix}_${Date.now()}_${i + 1}` }));
    g.results = g.results.concat(items);
    renderResults();
    return items;
  }
  async function placeResults(list) {
    let placed = 0;
    for (const r of list) { try { await ps.placeImage({ url: r.url, name: r.name, kind: 'image' }); placed += 1; } catch (e) {} }
    return placed;
  }
  function jobStart() { g.jobs += 1; setMsg(`生成中 …（${g.jobs} 个任务）`); }
  function jobEnd(msg, kind) { g.jobs = Math.max(0, g.jobs - 1); if (msg) setMsg(msg, kind); else if (g.jobs > 0) setMsg(`生成中 …（${g.jobs} 个任务）`); }

  /* ---------- 生成（非阻塞 + 队列：提交后台轮询，UI 仍可操作/再次生成） ---------- */
  function updateRun() {
    let ok = state.connected;
    if (g.mode === 'api' || g.mode === 'ms') ok = ok && currentProvider() && DX.ui.pickerValue(els.model) && els.prompt.value.trim();
    else if (g.mode === 'rh') ok = ok && g.rhWorkflowId;
    els.run.disabled = !ok;
  }
  function run() {
    let p;
    if (g.mode === 'api' || g.mode === 'ms') p = runApi();
    else if (g.mode === 'rh') p = runRh();
    if (p && p.catch) p.catch((err) => setMsg(`生成失败：${err.message || err}`, 'err'));
  }
  async function runApi() {
    const p = currentProvider();
    const prompt = els.prompt.value.trim();
    if (!prompt) { setMsg('请输入提示词。', 'err'); return; }
    const payload = Object.assign({ prompt, provider_id: p.id, model: DX.ui.pickerValue(els.model) }, collectApiParams(),
      { reference_images: g.refs.map((r) => ({ url: r.url, name: r.name, kind: 'image' })) });
    setMsg('正在提交生成任务 …');
    const res = await net.apiSend('POST', '/api/canvas-image-tasks', payload);
    if (!res.task_id) throw new Error('未返回任务 ID');
    pollCanvas(res.task_id);   // 不 await：后台轮询，UI 不锁
  }
  async function runRh() {
    applyRandomSeeds();
    const nodeInfoList = g.fields.filter((f) => f.rh).map((f) => ({ nodeId: f.rh.nodeId, fieldName: f.rh.fieldName, fieldValue: String(g.values[f.key] ?? '') }));
    setMsg('正在提交 RunningHub 任务 …');
    const res = await net.apiSend('POST', '/api/runninghub/workflow-submit', { workflowId: g.rhWorkflowId, nodeInfoList, useWallet: els.rhWallet.checked });
    const taskId = res.data && res.data.taskId;
    if (!taskId) throw new Error('未返回 taskId');
    pollRh(taskId);
  }
  function pollCanvas(taskId) {
    jobStart();
    let n = 0;
    const tick = async () => {
      n += 1;
      if (n > 200) { jobEnd('生成超时，请重试。', 'err'); return; }
      let task;
      try { task = await net.apiGet(`/api/canvas-image-tasks/${encodeURIComponent(taskId)}`); }
      catch (err) { jobEnd(`查询任务失败：${err.message || err}`, 'err'); return; }
      const s = task.status || '';
      if (s === 'succeeded') {
        const items = appendResults((task.result && task.result.images) || [], 'gen');
        const placed = await placeResults(items);
        jobEnd(`已生成并添加 ${placed} 张到图层。`, 'ok'); return;
      }
      if (s === 'failed') { jobEnd(`生成失败：${task.error || '未知错误'}`, 'err'); return; }
      setTimeout(tick, 2000);
    };
    tick();
  }
  function pollRh(taskId) {
    jobStart();
    let n = 0;
    const tick = async () => {
      n += 1;
      if (n > 240) { jobEnd('生成超时，请重试。', 'err'); return; }
      let res;
      try { res = await net.apiGet(`/api/runninghub/query?taskId=${encodeURIComponent(taskId)}`); }
      catch (err) { jobEnd(`查询任务失败：${err.message || err}`, 'err'); return; }
      const d = res.data || {};
      const s = String(d.status || '').toUpperCase();
      if (s === 'SUCCESS') { const items = appendResults(d.urls || [], 'rh'); const placed = await placeResults(items); jobEnd(`已生成并添加 ${placed} 张到图层。`, 'ok'); return; }
      if (s === 'FAILED') { jobEnd(`生成失败：${d.failReason || '未知错误'}`, 'err'); return; }
      setTimeout(tick, 2500);
    };
    tick();
  }

  /* ---------- 事件 ---------- */
  els.modes.querySelectorAll('.seg').forEach((b) => b.addEventListener('click', () => { if (state.connected) setMode(b.getAttribute('data-mode')); }));
  DX.ui.onPick(els.provider, () => { renderModels(); loadSchema(); });
  DX.ui.onPick(els.model, () => loadSchema());
  DX.ui.onPick(els.rhWorkflow, loadRhFields);
  els.prompt.addEventListener('input', updateRun);
  els.run.addEventListener('click', run);

  DX.generate = {
    ensureLoaded() { if (state.connected) setMode(g.mode); },
    reset() {
      g.providersLoaded = false; g.apiProviders = []; g.msProvider = null;
      g.fields = []; g.values = {}; g.imgPreview = {}; g.randomActive = {};
      g.rhWorkflows = []; g.rhWorkflowId = '';
      g.refs = []; g.results = []; g.jobs = 0;
      for (const k in modeMem) delete modeMem[k];   // 换后端清空模式记忆，避免串台
      DX.ui.fillPicker(els.provider, []); DX.ui.fillPicker(els.model, []);
      DX.ui.fillPicker(els.rhWorkflow, []);
      els.params.innerHTML = '';
      updateRun();
    },
  };
})();
