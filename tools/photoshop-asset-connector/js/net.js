/* 网络层：地址解析、HTTP/WS base、REST 助手、字节上传。纯逻辑，不碰 DOM/PS。 */
(function () {
  const state = DX.state;

  function parseHost(raw) {
    let text = String(raw || '').trim();
    if (!text) return '';
    text = text.replace(/^[a-z]+:\/\//i, '').replace(/[\/\?#].*$/, '');
    return text.trim();
  }

  function httpBase() { return state.host ? `http://${state.host}` : ''; }
  function wsBase() { return state.host ? `ws://${state.host}` : ''; }
  function authHeaders(extra) {
    return state.token ? Object.assign({}, extra || {}, { Authorization: `Bearer ${state.token}` }) : Object.assign({}, extra || {});
  }
  function isBackendUrl(url) {
    const value = String(url || '');
    return value.startsWith('/') || (!!httpBase() && value.startsWith(httpBase()));
  }

  function absUrl(url) {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    const base = httpBase();
    if (!base) return url;
    return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  async function apiGet(path) {
    const res = await fetch(`${httpBase()}${path}`, { cache: 'no-store', headers: authHeaders() });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 160)}`.trim());
    try { return JSON.parse(text || '{}'); }
    catch (e) { throw new Error(`返回不是 JSON：${text.slice(0, 120)}`); }
  }

  async function apiSend(method, path, body) {
    const res = await fetch(`${httpBase()}${path}`, {
      method,
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body || {}),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 160)}`.trim());
    return JSON.parse(text || '{}');
  }

  // UXP 的 <img>/PS 打开 不支持 WebP 等格式：这些走后端转 JPEG，其余直接用原图。
  const UXP_UNSUPPORTED = /\.(webp|bmp|avif|tiff?|heic|heif)(\?|#|$)/i;
  function needsJpeg(url) { return UXP_UNSUPPORTED.test(String(url || '').split(/[?#]/)[0]); }
  function displayUrl(url, w) {
    if (needsJpeg(url)) {
      return `${httpBase()}/api/image-jpeg?url=${encodeURIComponent(url)}${w ? `&w=${w}` : ''}`;
    }
    return absUrl(url);
  }

  // 缩略图地址：本地 /assets|/output 走后端预览接口（小图、带缓存，避免一次性加载几十张超大原图导致空白/卡死）
  function thumbUrl(url, w) {
    if (/^\/(assets|output)\//.test(String(url || ''))) {
      return `${httpBase()}/api/media-preview?url=${encodeURIComponent(url)}&w=${w || 256}`;
    }
    return absUrl(url);
  }

  async function fetchBytes(url) {
    const res = await fetch(absUrl(url), { headers: isBackendUrl(url) ? authHeaders() : {} });
    if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`);
    return res.arrayBuffer();
  }

  async function pair(code, name, clientType) {
    const res = await fetch(`${httpBase()}/api/auth/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, name, client_type: clientType }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) throw new Error(data.detail || '配对失败');
    return data.access_token;
  }

  async function mediaObjectUrl(url) {
    if (!isBackendUrl(url)) return absUrl(url);
    const res = await fetch(absUrl(url), { headers: authHeaders() });
    if (!res.ok) throw new Error(`预览失败 HTTP ${res.status}`);
    return URL.createObjectURL(await res.blob());
  }

  function hydrateImages(root) {
    Array.from((root || document).querySelectorAll('img[data-auth-src]')).forEach(async (img) => {
      const src = img.getAttribute('data-auth-src');
      img.removeAttribute('data-auth-src');
      try { img.src = await mediaObjectUrl(src); } catch (e) { img.alt = '无预览'; }
    });
  }

  // ArrayBuffer → base64（手写，不依赖 btoa；分块避免大图爆栈）
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function toBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let out = '';
    let i = 0;
    const n = bytes.length;
    for (; i + 2 < n; i += 3) {
      const t = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      out += B64[(t >> 18) & 63] + B64[(t >> 12) & 63] + B64[(t >> 6) & 63] + B64[t & 63];
    }
    const rem = n - i;
    if (rem === 1) {
      const t = bytes[i] << 16;
      out += B64[(t >> 18) & 63] + B64[(t >> 12) & 63] + '==';
    } else if (rem === 2) {
      const t = (bytes[i] << 16) | (bytes[i + 1] << 8);
      out += B64[(t >> 18) & 63] + B64[(t >> 12) & 63] + B64[(t >> 6) & 63] + '=';
    }
    return out;
  }

  // 用 base64 JSON 上传 PNG 字节，返回 /assets 地址（避开 UXP 的 FormData 问题）。
  // 首选 /api/ai/upload-base64（落 assets/input，不污染本地素材）；
  // 若后端没有该接口或失败，回退到老接口 /api/local-assets/import-urls（已验证可用）。
  async function uploadInputBase64(buffer, name) {
    const b64 = toBase64(buffer);
    if (!b64) throw new Error('图层导出为空，无法上传');
    try {
      const data = await apiSend('POST', '/api/ai/upload-base64', { data: b64, name, content_type: 'image/png' });
      const f = (data.files || [])[0];
      if (f && f.url) return f.url;
    } catch (e) { /* 回退到 import-urls */ }
    const data = await apiSend('POST', '/api/local-assets/import-urls', {
      folder: '',
      items: [{ data: `data:image/png;base64,${b64}`, name, content_type: 'image/png' }],
    });
    const f = (data.files || [])[0];
    if (f && f.url) return f.url;
    const r = (data.items || [])[0];
    throw new Error((r && r.error) || '上传失败，后端未返回地址');
  }

  DX.net = { parseHost, httpBase, wsBase, absUrl, thumbUrl, displayUrl, needsJpeg, apiGet, apiSend, pair, fetchBytes, mediaObjectUrl, hydrateImages, toBase64, uploadInputBase64 };
})();
