/* 启动 + Tab 路由 + 资产视图渲染 + 事件绑定。依赖 DX.state/net/sources/ps/socket。 */
(function () {
  const state = DX.state;
  const net = DX.net;
  const ps = DX.ps;
  const sources = DX.sources;
  const socket = DX.socket;

  const $ = (id) => document.getElementById(id);
  const els = {
    dot: $('dot'),
    tabs: document.querySelectorAll('.tab'),
    views: document.querySelectorAll('.view'),
    segs: document.querySelectorAll('.seg'),
    selA: $('selectA'),
    selB: $('selectB'),
    search: $('search'),
    refresh: $('refreshBtn'),
    count: $('count'),
    grid: $('grid'),
    place: $('placeBtn'),
    export: $('exportBtn'),
    pushMsg: $('pushMsg'),
    server: $('server'),
    token: $('accessToken'),
    connect: $('connectBtn'),
    connMsg: $('connMsg'),
    live: $('liveToggle'),
    exportLayer: $('exportLayerToggle'),
    github: $('githubBtn'),
  };

  /* ---------- 小工具 ---------- */
  function escapeHtml(v) {
    return String(v ?? '').replace(/[&<>"']/g, (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  function setDot(kind) { els.dot.className = `dot ${kind}`; }
  function setConnMsg(t, k = '') { els.connMsg.textContent = t || ''; els.connMsg.className = `conn-msg ${k}`; }
  function setPushMsg(t, k = '') { els.pushMsg.textContent = t || ''; els.pushMsg.className = `push-msg ${k}`; }

  /* ---------- 加载互斥 + 分页（防止快速切换造成请求洪水） ---------- */
  let loading = false;      // 有加载在进行时，忽略新的切换/刷新，避免叠加请求
  let loadSeq = 0;          // 序号：晚发起的加载胜出，丢弃过期结果
  let page = 1;             // 当前已展示页数
  let gridToken = 0;        // 每次渲染递增；切换后停止加载过期缩略图
  const PAGE = 60;          // 每页缩略图上限

  function setLoadingUI(on) {
    els.segs.forEach((b) => { b.disabled = on; });
    els.refresh.disabled = on;
    if (on) els.count.textContent = '加载中 …';
  }

  /* ---------- Tab 路由 ---------- */
  function switchTab(tab) {
    state.tab = tab;
    els.tabs.forEach((b) => b.classList.toggle('active', b.getAttribute('data-tab') === tab));
    els.views.forEach((v) => v.classList.toggle('active', v.getAttribute('data-view') === tab));
    if (tab === 'settings') setTimeout(() => { try { els.server.focus(); } catch (e) {} }, 30);
    if (tab === 'generate' && DX.generate) DX.generate.ensureLoaded();   // 首次进入生成页时拉平台列表
    if (tab === 'agent' && DX.agent) DX.agent.ensureLoaded();
  }

  /* ---------- 当前视图数据 ---------- */
  function currentItems() {
    try { return sources.adapter().items(state.aId, state.bId) || []; }
    catch (e) { return []; }
  }
  function filteredItems() {
    const q = String(els.search.value || '').trim().toLowerCase();
    // 排除视频/音频：这是图像工具，且视频项没有图片预览，避免出现大量"未加载"的占位
    let list = currentItems().filter((it) => it.kind !== 'video' && it.kind !== 'audio');
    if (q) list = list.filter((it) => (it.search || '').includes(q));
    return list;
  }
  function selectedItem() { return currentItems().find((it) => it.id === state.selectedId) || null; }

  /* ---------- 渲染 ---------- */
  function renderSources() {
    els.segs.forEach((b) => b.classList.toggle('active', b.getAttribute('data-source') === state.source));
  }

  function renderSelectors() {
    const ad = sources.adapter();
    const optsA = ad.optionsA();
    if (optsA) {
      els.selA.classList.remove('hidden');
      DX.ui.fillPicker(els.selA, optsA.map((o) => ({ value: o.id, label: o.name })), state.aId);
    } else {
      els.selA.classList.add('hidden');
      DX.ui.fillPicker(els.selA, [], '');
    }
    const optsB = ad.optionsB(state.aId) || [];
    DX.ui.fillPicker(els.selB, optsB.map((o) => ({ value: o.id, label: o.name })), state.bId);
  }

  // 已加载网格 DOM 缓存：key=源|分库|分组。切回时直接复原这批已解码的 <img>，不再重新请求。
  const gridViews = {};
  function gridKey() { return `${state.source}|${state.aId}|${state.bId}`; }
  function invalidateGridCacheFor(src) { for (const k in gridViews) { if (k.indexOf(`${src}|`) === 0) delete gridViews[k]; } }

  function renderGrid() {
    gridToken += 1;
    const myToken = gridToken;
    const q = String(els.search.value || '').trim();
    const all = filteredItems();
    if (!all.length) {
      els.count.textContent = '没有素材';
      els.grid.className = 'grid empty';
      els.grid.innerHTML = '<div class="empty-state">这里没有匹配的素材。</div>';
      renderActions();
      return;
    }
    const key = gridKey();
    // 无搜索且有缓存 → 直接复原（已加载的图片不重新请求；若上次没加载完，补全剩余）
    if (!q && gridViews[key]) {
      els.grid.className = 'grid';
      els.grid.innerHTML = '';
      els.grid.appendChild(gridViews[key]);
      els.count.textContent = `${all.length} 个素材`;
      if (gridViews[key].querySelector('img[data-src]')) loadThumbs(myToken);   // 补全未加载完的
      renderActions();
      return;
    }

    const limit = page * PAGE;
    const shown = all.slice(0, limit);
    const rest = all.length - shown.length;
    els.count.textContent = rest > 0 ? `${all.length} 个素材（已显示 ${shown.length}）` : `${all.length} 个素材`;

    const inner = document.createElement('div');
    inner.className = 'grid-inner';
    inner.innerHTML = shown.map((item) => {
      const isImg = sources.itemIsImage(item);
      // WebP 等 UXP 不支持的格式转成小 JPEG；PNG/JPEG 直接用原图（快）
      const url = net.displayUrl(item.url, net.needsJpeg(item.url) ? 256 : 0);
      const badge = isImg ? '' : `<span class="badge">${escapeHtml(item.kind || '文件')}</span>`;
      const thumb = isImg ? `<img data-src="${escapeHtml(url)}" alt="">` : '';
      const thumbAttr = isImg ? ` data-url="${escapeHtml(url)}"` : '';
      return `<article class="card ${state.selectedId === item.id ? 'selected' : ''}" data-id="${escapeHtml(item.id)}" title="${escapeHtml(item.name || '')}">
        <div class="thumb"${thumbAttr}>${thumb}${badge}</div>
        <div class="meta">${escapeHtml(item.name || '未命名')}</div>
      </article>`;
    }).join('') + (rest > 0 ? `<button class="more" type="button" data-more>加载更多（还有 ${rest}）</button>` : '');

    els.grid.className = 'grid';
    els.grid.innerHTML = '';
    els.grid.appendChild(inner);

    inner.querySelectorAll('.card').forEach((card) => {
      const id = card.getAttribute('data-id');
      card.addEventListener('click', () => {
        if (state.selectedId === id) return;
        const prev = inner.querySelector('.card.selected');
        if (prev) prev.classList.remove('selected');
        card.classList.add('selected');
        state.selectedId = id;
        renderActions();
      });
      card.addEventListener('dblclick', () => { state.selectedId = id; doPlace(); });
    });
    const moreBtn = inner.querySelector('[data-more]');
    if (moreBtn) moreBtn.addEventListener('click', () => { delete gridViews[key]; page += 1; renderGrid(); });

    if (!q) gridViews[key] = inner;     // 缓存（搜索结果不缓存）
    loadThumbs(myToken);
    renderActions();
  }

  // 索引队列：捕获一次待加载列表，逐个推进直到全部（不依赖可视/滚动/反复 querySelector，确保不卡在某一批）。
  // 并发 6；单图 6s 超时也放行（个别图 load/error 不触发或挂起时，释放槽位继续后面的）。
  const THUMB_CONCURRENCY = 6;
  function loadThumbs(token) {
    const imgs = Array.prototype.slice.call(els.grid.querySelectorAll('img[data-src]'));
    let i = 0;
    let active = 0;
    function startOne(img) {
      const src = img.getAttribute('data-src');
      img.removeAttribute('data-src');
      active += 1;
      let settled = false; let to = null;
      const done = () => { if (settled) return; settled = true; if (to) clearTimeout(to); active -= 1; pump(); };
      img.addEventListener('load', done);
      img.addEventListener('error', () => {
        const thumb = img.parentElement;
        if (thumb) thumb.innerHTML = '<div class="thumb-ph">无预览</div>';
        done();
      });
      to = setTimeout(done, 6000);
      net.mediaObjectUrl(src).then((url) => { img.src = url; }).catch(() => {
        const thumb = img.parentElement;
        if (thumb) thumb.innerHTML = '<div class="thumb-ph">无预览</div>';
        done();
      });
    }
    function pump() {
      if (token !== gridToken) return;
      while (active < THUMB_CONCURRENCY && i < imgs.length) startOne(imgs[i++]);
    }
    pump();
  }

  // 刷新按钮：扫描空白/失败的缩略图，只重试这些（保留已加载的，不动缓存里成功的图）
  function retryBlanks() {
    const root = els.grid.querySelector('.grid-inner') || els.grid;
    let count = 0;
    root.querySelectorAll('.thumb[data-url]').forEach((th) => {
      const img = th.querySelector('img');
      const loaded = img && img.naturalWidth > 0;   // 已成功加载的跳过
      if (loaded) return;
      th.innerHTML = `<img data-src="${escapeHtml(th.getAttribute('data-url'))}" alt="">`;
      count += 1;
    });
    if (count) { setPushMsg(`正在重试 ${count} 张未加载的图 …`); loadThumbs(gridToken); }
    else setPushMsg('当前没有空白卡片。', 'ok');
  }

  // 下载按钮（置入图层）：选中图片即可用；上传按钮（上传当前图层）：连接 + 有文档 + 目标可写
  function renderActions() {
    const item = selectedItem();
    els.place.disabled = !(item && sources.itemIsImage(item));

    const ad = sources.adapter();
    const tgt = ad.exportTarget ? ad.exportTarget(state.aId, state.bId) : null;
    const hasDoc = ps.hasDocument();
    els.export.disabled = !(state.connected && hasDoc && tgt);

    if (!tgt) setPushMsg(state.source === 'canvas' ? '画布资产只读，不能作为上传目标。' : '当前位置不可上传。');
    else if (!hasDoc) setPushMsg('打开文档后可上传当前画面。');
    else setPushMsg(`上传将存入：${tgt.label}`);
  }

  function renderAssets() { renderSources(); renderSelectors(); renderGrid(); }

  /* ---------- 加载数据源 ---------- */
  async function loadSource(source, opts) {
    const keep = !opts || opts.keepSelection !== false;
    const force = !!(opts && opts.force);
    if (source) state.source = source;
    const myseq = ++loadSeq;
    loading = true;
    setLoadingUI(true);
    try {
      const ad = sources.adapter();
      // 数据缓存：切走再切回不重新拉（除非强制刷新/连接/实时更新）。state.raw[源] 由 adapter.load 填充。
      if (force || !state.raw[state.source]) {
        await ad.load();
        invalidateGridCacheFor(state.source);   // 数据已更新，该源的网格缓存作废，重建
      }
      if (myseq !== loadSeq) return;          // 已有更晚的加载发起，丢弃本次结果
      const optsA = ad.optionsA();
      if (optsA) {
        if (!keep || !optsA.some((o) => o.id === state.aId)) state.aId = optsA[0] ? optsA[0].id : '';
      } else { state.aId = ''; }
      const optsB = ad.optionsB(state.aId) || [];
      if (!keep || !optsB.some((o) => o.id === state.bId)) state.bId = optsB[0] ? optsB[0].id : '';
      if (!currentItems().some((it) => it.id === state.selectedId)) state.selectedId = '';
      page = 1;
      renderAssets();
    } finally {
      if (myseq === loadSeq) { loading = false; setLoadingUI(false); }
    }
  }

  function scheduleReload(forSource) {
    if (!state.connected || !els.live.checked) return;
    if (forSource && state.raw[forSource] !== undefined) state.raw[forSource] = null;  // 让该源缓存失效
    if (forSource && forSource !== state.source) return;   // 非当前源：仅失效缓存，切到时再拉
    clearTimeout(state.reloadTimer);
    state.reloadTimer = setTimeout(() => {
      if (loading) return;
      loadSource(null, { keepSelection: true, force: true }).catch(() => {});
    }, 500);
  }

  /* ---------- 连接 ---------- */
  const socketHandlers = { isLive: () => els.live.checked, onUpdate: (src) => scheduleReload(src) };

  async function connect() {
    const host = net.parseHost(els.server.value);
    if (!host) { setConnMsg('请输入地址，例如 192.168.1.10:3000', 'err'); return; }
    state.host = host;
    state.token = String(els.token.value || '').trim();
    state.connected = false;
    state.raw = { assets: null, canvas: null, local: null };   // 换后端：清空数据与网格缓存
    for (const k in gridViews) delete gridViews[k];
    setDot('busy');
    setConnMsg(`正在连接 ${host} …`);
    els.connect.disabled = true;
    try {
      if (/^\d{6}$/.test(state.token)) {
        state.token = await net.pair(state.token, 'Photoshop 资产连接器', 'photoshop');
        els.token.value = state.token;
      }
      await loadSource(state.source, { keepSelection: false, force: true });
      state.connected = true;
      localStorage.setItem(DX.LS.host, host);
      localStorage.setItem(DX.LS.token, state.token);
      setDot('on');
      setConnMsg(`已连接 ${host}`, 'ok');
      state.wsWasOpen = false;
      state.wsBackoff = 1000;
      socket.openSocket(socketHandlers);
      if (DX.generate) DX.generate.reset();    // 换了后端，生成页平台列表需重新加载
      if (DX.agent) DX.agent.reset();
      switchTab('assets');
    } catch (err) {
      state.connected = false;
      setDot('err');
      setConnMsg(`连接失败：${err.message || err}`, 'err');
    } finally {
      els.connect.disabled = false;
    }
  }

  /* ---------- 下载（置入图层）/ 上传（当前图层） ---------- */
  async function doPlace() {
    const item = selectedItem();
    if (!item) return;
    if (!sources.itemIsImage(item)) { setPushMsg('该素材不是图片，无法下载到图层。', 'err'); return; }
    setPushMsg('正在下载到图层 …');
    try { await ps.placeImage(item); setPushMsg(`已下载到图层：${item.name || ''}`, 'ok'); }
    catch (err) { setPushMsg(`下载失败：${err.message || err}`, 'err'); }
    renderActions();
  }

  async function doExport() {
    const ad = sources.adapter();
    const tgt = ad.exportTarget ? ad.exportTarget(state.aId, state.bId) : null;
    if (!tgt || !ad.doExport) { setPushMsg('当前位置不能作为上传目标。', 'err'); return; }
    if (!ps.hasDocument()) { setPushMsg('没有打开的文档。', 'err'); return; }
    els.export.disabled = true;
    try {
      setPushMsg('正在导出当前图层 …');
      const { buffer, name } = await ps.exportCurrentPng();
      setPushMsg('正在上传到后端 …');
      await ad.doExport(state.aId, state.bId, name, buffer);
      setPushMsg(`已上传到「${tgt.label}」：${name}`, 'ok');
      await loadSource(null, { keepSelection: true, force: true });
    } catch (err) {
      setPushMsg(`上传失败：${err.message || err}`, 'err');
    } finally {
      renderActions();
    }
  }

  /* ---------- 事件绑定 ---------- */
  els.tabs.forEach((b) => b.addEventListener('click', () => switchTab(b.getAttribute('data-tab'))));

  els.segs.forEach((b) => b.addEventListener('click', () => {
    const src = b.getAttribute('data-source');
    if (!src) return;
    if (!state.connected) { state.source = src; renderSources(); return; }
    if (src === state.source || loading) return;     // 加载中忽略，防止快速点击叠加请求
    localStorage.setItem(DX.LS.source, src);
    setPushMsg(`正在加载${b.textContent} …`);
    loadSource(src, { keepSelection: false }).then(() => setPushMsg('')).catch((err) => setPushMsg(`加载失败：${err.message || err}`, 'err'));
  }));

  DX.ui.onPick(els.selA, () => {
    state.aId = DX.ui.pickerValue(els.selA);
    const optsB = sources.adapter().optionsB(state.aId) || [];
    state.bId = optsB[0] ? optsB[0].id : '';
    state.selectedId = '';
    page = 1;                                         // 本地重新筛选，无网络请求
    renderSelectors(); renderGrid();
  });
  DX.ui.onPick(els.selB, () => {
    state.bId = DX.ui.pickerValue(els.selB);
    state.selectedId = '';
    page = 1;
    renderGrid();
  });

  let searchTimer = null;
  els.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { page = 1; renderGrid(); }, 200);   // 防抖，少重绘
  });
  els.refresh.addEventListener('click', () => {
    if (loading) return;
    retryBlanks();   // 只重试空白卡片，保留已加载缓存（不重拉整页）
  });

  els.connect.addEventListener('click', connect);
  els.server.addEventListener('keydown', (e) => { if (e.key === 'Enter') connect(); });
  els.token.addEventListener('keydown', (e) => { if (e.key === 'Enter') connect(); });
  els.live.addEventListener('change', () => {
    if (els.live.checked && state.connected) { socket.openSocket(socketHandlers); scheduleReload(); }
    else socket.closeSocket();
  });
  els.exportLayer.addEventListener('change', () => {
    state.exportLayer = !!els.exportLayer.checked;
    localStorage.setItem(DX.LS.exportLayer, state.exportLayer ? '1' : '0');
  });
  els.github.addEventListener('click', () => {
    ps.openUrl('https://github.com/hero8152/Infinite-Canvas').catch((err) => setConnMsg(`打开 GitHub 失败：${err.message || err}`, 'err'));
  });

  els.place.addEventListener('click', doPlace);
  els.export.addEventListener('click', doExport);

  ps.onDocChange(() => { if (state.connected && state.tab === 'assets') renderActions(); });

  /* ---------- 初始化 ---------- */
  (function init() {
    els.server.value = localStorage.getItem(DX.LS.host) || '127.0.0.1:3000';
    els.token.value = localStorage.getItem(DX.LS.token) || '';
    state.token = els.token.value;
    state.exportLayer = localStorage.getItem(DX.LS.exportLayer) === '1';
    els.exportLayer.checked = state.exportLayer;
    const savedSource = localStorage.getItem(DX.LS.source);
    if (savedSource && sources.adapters[savedSource]) state.source = savedSource;
    setDot('off');
    renderSources();
    renderActions();
    if (localStorage.getItem(DX.LS.host)) {
      setConnMsg('点「连接」恢复上次的连接。');
      switchTab('settings');
    } else {
      switchTab('settings');
    }
  })();
})();
