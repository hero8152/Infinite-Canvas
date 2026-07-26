/* Agent（对话生图）：选 LLM(对话) + 生图模型 → 走后端 /api/chat/agent（自带意图路由：聊天/生成/改图）
 * → 返回图片自动置入图层。多轮对话用 conversation_id 维持。 */
(function () {
  const net = DX.net;
  const ps = DX.ps;
  const state = DX.state;

  const $ = (id) => document.getElementById(id);
  const els = {
    newBtn: $('agNew'),
    history: $('agHistory'),
    toggleModels: $('agToggleModels'),
    models: $('agModels'),
    llmProvider: $('agLlmProvider'),
    llmModel: $('agLlmModel'),
    imgProvider: $('agImgProvider'),
    imgModel: $('agImgModel'),
    messages: $('agMessages'),
    attach: $('agAttach'),
    attachBtn: $('agAttachBtn'),
    input: $('agInput'),
    send: $('agSend'),
    status: $('agStatus'),
  };

  const a = {
    loaded: false,
    chatProviders: [],
    imgProviders: [],
    conversationId: '',
    busy: false,
    msgs: [],           // {role, text, images:[]}
    attachments: [],    // 待发送的参考图 {url,name}
  };

  function escapeHtml(v) {
    return String(v ?? '').replace(/[&<>"']/g, (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  function setStatus(t, k = '') { els.status.textContent = t || ''; els.status.className = `push-msg ${k}`; }

  // 稳定的用户 id（让对话历史按本插件持久化）
  function userId() {
    let id = localStorage.getItem('daxiong.agent.uid');
    if (!id) { id = `ps_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`; localStorage.setItem('daxiong.agent.uid', id); }
    return id;
  }

  // 带 X-User-Id 的 GET（对话历史按本插件用户隔离）
  async function apiGetU(path) {
    const res = await fetch(`${net.httpBase()}${path}`, { cache: 'no-store', headers: { 'X-User-Id': userId() } });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 160)}`.trim());
    return JSON.parse(text || '{}');
  }

  function applyCollapse() {
    const collapsed = localStorage.getItem('daxiong.agent.collapsed') === '1';
    els.models.classList.toggle('hidden', collapsed);
  }

  /* ---------- 模型 + 历史加载 ---------- */
  async function ensureLoaded() {
    applyCollapse();
    if (a.loaded || !state.connected) return;
    setStatus('正在加载模型 …');
    try {
      const data = await net.apiGet('/api/providers');
      const all = data.providers || data.api_providers || [];
      a.chatProviders = all.filter((p) => Array.isArray(p.chat_models) && p.chat_models.length);
      a.imgProviders = all.filter((p) => Array.isArray(p.image_models) && p.image_models.length);
      DX.ui.fillPicker(els.llmProvider, a.chatProviders.map((p) => ({ value: p.id, label: p.name || p.id })), localStorage.getItem('daxiong.agent.llmp'));
      DX.ui.fillPicker(els.imgProvider, a.imgProviders.map((p) => ({ value: p.id, label: p.name || p.id })), localStorage.getItem('daxiong.agent.imgp'));
      renderLlmModels(localStorage.getItem('daxiong.agent.llmm'));
      renderImgModels(localStorage.getItem('daxiong.agent.imgm'));
      a.loaded = true;
      setStatus(a.chatProviders.length ? '' : '没有可用的对话模型，请先在网页端配置 chat 模型。', a.chatProviders.length ? '' : 'err');
      await loadHistory();
    } catch (err) { setStatus(`加载模型失败：${err.message || err}`, 'err'); }
    updateSend();
  }

  async function loadHistory() {
    try {
      const data = await apiGetU('/api/conversations');
      const list = data.conversations || [];
      DX.ui.fillPicker(els.history, [{ value: '', label: `历史对话（${list.length}）` }]
        .concat(list.map((c) => ({ value: c.id, label: c.title || '未命名对话' }))), a.conversationId || '');
    } catch (e) { /* 历史拉取失败不致命 */ }
  }

  async function openConversation(id) {
    if (!id) return;
    setStatus('正在载入对话 …');
    try {
      const data = await apiGetU(`/api/conversations/${encodeURIComponent(id)}`);
      const conv = data.conversation || {};
      a.conversationId = conv.id || id;
      a.msgs = (conv.messages || []).filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({
        role: m.role,
        text: m.content || m.agent_reply || '',
        images: m.image_urls || (m.image_url ? [m.image_url] : []),
      }));
      renderMsgs();
      setStatus('');
    } catch (err) { setStatus(`载入对话失败：${err.message || err}`, 'err'); }
  }

  function newConversation() {
    a.conversationId = '';
    a.msgs = [];
    renderMsgs();
    DX.ui.fillPicker(els.history, els.history._options || [{ value: '', label: '历史对话' }], '');
    setStatus('已开始新对话。', 'ok');
  }
  function llmProvider() { const v = DX.ui.pickerValue(els.llmProvider); return a.chatProviders.find((p) => p.id === v) || a.chatProviders[0] || null; }
  function imgProvider() { const v = DX.ui.pickerValue(els.imgProvider); return a.imgProviders.find((p) => p.id === v) || a.imgProviders[0] || null; }
  function renderLlmModels(sel) { const p = llmProvider(); DX.ui.fillPicker(els.llmModel, ((p && p.chat_models) || []).map((m) => ({ value: m, label: m })), sel); }
  function renderImgModels(sel) { const p = imgProvider(); DX.ui.fillPicker(els.imgModel, ((p && p.image_models) || []).map((m) => ({ value: m, label: m })), sel); }

  /* ---------- 对话渲染 ---------- */
  function renderMsgs() {
    if (!a.msgs.length) {
      els.messages.innerHTML = '<div class="empty-state">选好模型，直接说想画/想改的内容，生成的图会自动加到图层。</div>';
      return;
    }
    els.messages.innerHTML = a.msgs.map((m) => {
      const imgs = (m.images || []).map((u) =>
        `<div class="agent-imgtile">
          <img data-auth-src="${escapeHtml(net.displayUrl(u, 320))}" alt="">
          <button class="agent-dl" type="button" data-addurl="${escapeHtml(u)}" title="下载到图层">下载</button>
        </div>`).join('');
      const text = m.text ? `<div class="agent-text">${escapeHtml(m.text)}</div>` : '';
      return `<div class="agent-msg ${m.role}">${text}${imgs}</div>`;
    }).join('');
    net.hydrateImages(els.messages);
    els.messages.querySelectorAll('[data-addurl]').forEach((b) => b.addEventListener('click', async () => {
      const u = b.getAttribute('data-addurl');
      b.disabled = true;
      setStatus('正在加到图层 …');
      try { await ps.placeImage({ url: u, name: `agent_${Date.now()}` }); setStatus('已加到图层。', 'ok'); }
      catch (err) { setStatus(`加图层失败：${err.message || err}`, 'err'); }
      finally { b.disabled = false; }
    }));
    els.messages.scrollTop = els.messages.scrollHeight;
  }

  // 待发送参考图（缩略图 chip）
  function renderAttach() {
    els.attach.innerHTML = a.attachments.map((r, i) =>
      `<div class="attach-chip"><img data-auth-src="${escapeHtml(net.displayUrl(r.url, 120))}" alt=""><div class="ref-x" data-ax="${i}">×</div></div>`).join('');
    net.hydrateImages(els.attach);
    els.attach.querySelectorAll('[data-ax]').forEach((x) => x.addEventListener('click', () => { a.attachments.splice(Number(x.getAttribute('data-ax')), 1); renderAttach(); }));
  }
  async function attachCurrent() {
    if (!ps.hasDocument()) { setStatus('没有打开的文档。', 'err'); return; }
    els.attachBtn.disabled = true;
    try {
      setStatus('正在上传当前画面 …');
      const { buffer, name } = await ps.exportCurrentPng();
      const url = await net.uploadInputBase64(buffer, name);
      a.attachments.push({ url, name });
      renderAttach();
      setStatus('已添加参考图，发送时会带上。', 'ok');
    } catch (err) { setStatus(`上传失败：${err.message || err}`, 'err'); }
    finally { els.attachBtn.disabled = false; }
  }

  /* ---------- 发送 ---------- */
  function updateSend() {
    els.send.disabled = !(state.connected && !a.busy && llmProvider() && DX.ui.pickerValue(els.llmModel) && imgProvider() && DX.ui.pickerValue(els.imgModel) && els.input.value.trim());
  }

  async function chatAgent(body) {
    const res = await fetch(`${net.httpBase()}/api/chat/agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': userId() },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`.trim());
    return JSON.parse(text || '{}');
  }

  async function send() {
    const msg = els.input.value.trim();
    if (!msg) return;
    const lp = llmProvider(); const ip = imgProvider();
    if (!lp || !ip) { setStatus('请选择对话模型和生图模型。', 'err'); return; }
    a.busy = true; updateSend();
    a.msgs.push({ role: 'user', text: msg, images: [] });
    renderMsgs();
    els.input.value = '';
    els.input.style.height = '';   // 复位高度

    // 记忆所选模型
    localStorage.setItem('daxiong.agent.llmp', lp.id);
    localStorage.setItem('daxiong.agent.llmm', DX.ui.pickerValue(els.llmModel));
    localStorage.setItem('daxiong.agent.imgp', ip.id);
    localStorage.setItem('daxiong.agent.imgm', DX.ui.pickerValue(els.imgModel));

    try {
      const refs = a.attachments.map((r) => ({ url: r.url, name: r.name, kind: 'image' }));
      setStatus('Agent 处理中 …');
      const res = await chatAgent({
        conversation_id: a.conversationId,
        message: msg,
        provider: lp.id,
        model: DX.ui.pickerValue(els.llmModel),
        image_provider: ip.id,
        image_model: DX.ui.pickerValue(els.imgModel),
        size: '1024x1024',
        quality: 'auto',
        reference_images: refs,
      });
      const firstTurn = !a.conversationId;
      if (res.conversation && res.conversation.id) a.conversationId = res.conversation.id;
      if (firstTurn) loadHistory();   // 新对话产生了标题，刷新历史下拉
      const m = res.message || {};
      const images = m.image_urls || (m.image_url ? [m.image_url] : []);
      a.msgs.push({ role: 'assistant', text: m.content || m.agent_reply || '', images });
      renderMsgs();
      a.attachments = []; renderAttach();   // 发送后清空待发参考图

      if (images.length) {
        setStatus(`生成 ${images.length} 张，正在加到图层 …`);
        let placed = 0;
        for (const u of images) { try { await ps.placeImage({ url: u, name: `agent_${Date.now()}` }); placed += 1; } catch (e) {} }
        setStatus(`已加 ${placed}/${images.length} 张到图层。`, 'ok');
      } else {
        setStatus('');
      }
    } catch (err) {
      a.msgs.push({ role: 'assistant', text: `出错了：${err.message || err}` });
      renderMsgs();
      setStatus(`失败：${err.message || err}`, 'err');
    } finally {
      a.busy = false; updateSend();
    }
  }

  /* ---------- 事件 ---------- */
  DX.ui.onPick(els.llmProvider, () => renderLlmModels());
  DX.ui.onPick(els.imgProvider, () => renderImgModels());
  DX.ui.onPick(els.llmModel, updateSend);
  DX.ui.onPick(els.imgModel, updateSend);
  DX.ui.onPick(els.history, () => { const id = DX.ui.pickerValue(els.history); if (id) openConversation(id); });
  els.newBtn.addEventListener('click', newConversation);
  els.toggleModels.addEventListener('click', () => {
    const c = localStorage.getItem('daxiong.agent.collapsed') === '1';
    localStorage.setItem('daxiong.agent.collapsed', c ? '0' : '1');
    applyCollapse();
  });
  function autoGrow() { els.input.style.height = 'auto'; els.input.style.height = `${Math.min(els.input.scrollHeight, 160)}px`; }
  els.input.addEventListener('input', () => { autoGrow(); updateSend(); });
  els.input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); });
  els.send.addEventListener('click', send);
  els.attachBtn.addEventListener('click', attachCurrent);

  DX.agent = {
    ensureLoaded,
    reset() {
      a.loaded = false; a.chatProviders = []; a.imgProviders = []; a.conversationId = ''; a.msgs = []; a.attachments = [];
      DX.ui.fillPicker(els.llmProvider, []); DX.ui.fillPicker(els.llmModel, []);
      DX.ui.fillPicker(els.imgProvider, []); DX.ui.fillPicker(els.imgModel, []);
      DX.ui.fillPicker(els.history, []);
      renderMsgs(); renderAttach();
      updateSend();
    },
  };
})();
