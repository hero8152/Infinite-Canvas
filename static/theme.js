(function () {
    const KEY = 'studio_theme';
    const LEGACY_KEY = 'canvas_theme';

    function currentTheme() {
        return localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY) || 'light';
    }

    function applyTheme(theme) {
        const next = theme === 'dark' ? 'dark' : 'light';
        const dark = next === 'dark';
        document.documentElement.classList.toggle('studio-theme-dark', dark);
        if (document.body) {
            document.body.classList.toggle('studio-theme-dark', dark);
            document.body.classList.toggle('theme-dark', dark);
        }
        window.dispatchEvent(new CustomEvent('studio-theme-change', { detail: { theme: next } }));
    }

    window.StudioTheme = {
        key: KEY,
        get: currentTheme,
        apply: applyTheme,
        set(theme) {
            const next = theme === 'dark' ? 'dark' : 'light';
            localStorage.setItem(KEY, next);
            localStorage.setItem(LEGACY_KEY, next);
            applyTheme(next);
        }
    };

    applyTheme(currentTheme());

    document.addEventListener('DOMContentLoaded', () => applyTheme(currentTheme()));
    window.addEventListener('message', event => {
        if (event.data?.type === 'studio-theme') applyTheme(event.data.theme);
    });
    window.addEventListener('storage', event => {
        if (event.key === KEY || event.key === LEGACY_KEY) applyTheme(currentTheme());
    });

    /* ----------------------------------------------------------------------
       Browser-local provider token
       ----------------------------------------------------------------------
       登录页保存的 comfly_token 不写入服务端文件；同源 AI 请求由前端以请求头
       传给后端，后端仅用于当前请求。
    */
    const COMFLY_TOKEN_ENDPOINTS = new Set([
        '/api/config',
        '/api/online-image',
        '/api/chat',
        '/api/chat/stream',
        '/api/canvas-llm'
    ]);
    const MODELSCOPE_BODY_ENDPOINTS = new Set([
        '/generate',
        '/api/angle/generate',
        '/api/angle/poll_status',
        '/api/ms/generate'
    ]);
    const nativeFetch = window.fetch.bind(window);

    function sameOriginPath(input) {
        const raw = input instanceof Request ? input.url : String(input || '');
        const url = new URL(raw, window.location.href);
        return url.origin === window.location.origin ? url.pathname : '';
    }

    function shouldAttachComflyToken(input) {
        const path = sameOriginPath(input);
        return COMFLY_TOKEN_ENDPOINTS.has(path) || path.startsWith('/api/batch-tryon/') || path.startsWith('/api/flatlay/');
    }

    function localValue(key) {
        return (localStorage.getItem(key) || '').trim();
    }

    function readModelKeys() {
        try {
            const parsed = JSON.parse(localStorage.getItem('provider_model_keys') || '{}');
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (e) {
            return {};
        }
    }

    function keyFor(provider, model, fallbackKey) {
        const modelKeys = readModelKeys();
        const cleanModel = (model || '').trim();
        const scoped = modelKeys[provider] || {};
        return (cleanModel && scoped[cleanModel] ? String(scoped[cleanModel]).trim() : '') || localValue(fallbackKey);
    }

    function parseJsonBody(body) {
        if (!body || typeof body !== 'string') return null;
        try {
            return JSON.parse(body);
        } catch (e) {
            return null;
        }
    }

    async function requestBody(input, init) {
        if (init && Object.prototype.hasOwnProperty.call(init, 'body')) return init.body;
        if (input instanceof Request) return input.bodyUsed ? null : input.clone().text();
        return null;
    }

    async function jsonPayload(input, init) {
        const body = await requestBody(input, init);
        if (!body) return null;
        if (typeof body === 'string') return parseJsonBody(body);
        if (body instanceof Blob) return parseJsonBody(await body.text());
        if (body instanceof URLSearchParams) return null;
        if (body && typeof body === 'object' && !(body instanceof FormData)) return body;
        return null;
    }

    function comflyModelFor(path, payload) {
        if (path === '/api/online-image' || path.startsWith('/api/batch-tryon/')) return payload?.model || localValue('comfly_image_model');
        if (path.startsWith('/api/flatlay/')) return payload?.generate_model || localValue('comfly_image_model');
        if (path === '/api/chat') {
            if (payload?.provider === 'modelscope') return '';
            return payload?.mode === 'image'
                ? (payload?.image_model || payload?.model || localValue('comfly_image_model'))
                : (payload?.model || localValue('comfly_chat_model'));
        }
        if (path === '/api/chat/stream' || path === '/api/canvas-llm') {
            if (payload?.provider === 'modelscope') return '';
            return payload?.model || localValue('comfly_chat_model');
        }
        return '';
    }

    function modelscopeModelFor(path, payload) {
        if (path === '/generate') return 'Tongyi-MAI/Z-Image-Turbo';
        if (path === '/api/angle/generate' || path === '/api/angle/poll_status') return 'Qwen/Qwen-Image-Edit-2511';
        if (path === '/api/ms/generate') return payload?.model || 'black-forest-labs/FLUX.2-klein-9B';
        return payload?.ms_model || payload?.model || localValue('modelscope_chat_model');
    }

    function withPreferred(list, value) {
        const clean = (value || '').trim();
        const values = Array.isArray(list) ? list.filter(Boolean) : [];
        if (!clean) return values;
        return [clean, ...values.filter(item => item !== clean)];
    }

    async function responseWithLocalConfig(response) {
        if (!response.ok) return response;
        const data = await response.clone().json();
        const imageModel = localValue('comfly_image_model');
        const chatModel = localValue('comfly_chat_model');
        const msChatModel = localValue('modelscope_chat_model');
        if (imageModel) {
            data.image_model = imageModel;
            data.image_models = withPreferred(data.image_models, imageModel);
        }
        if (chatModel) {
            data.chat_model = chatModel;
            data.chat_models = withPreferred(data.chat_models, chatModel);
        }
        if (msChatModel) {
            data.ms_chat_models = withPreferred(data.ms_chat_models, msChatModel);
        }
        const comflyBase = localValue('comfly_base_url');
        const msBase = localValue('modelscope_base_url');
        if (comflyBase) data.base_url = comflyBase.replace(/\/+$/, '');
        if (msBase) data.modelscope_base_url = msBase.replace(/\/+$/, '');
        const headers = new Headers(response.headers);
        headers.set('Content-Type', 'application/json');
        return new Response(JSON.stringify(data), {
            status: response.status,
            statusText: response.statusText,
            headers
        });
    }

    window.fetch = async function fetchWithProviderConfig(input, init) {
        const path = sameOriginPath(input);
        const shouldAttach = shouldAttachComflyToken(input);
        const raw = input instanceof Request ? input.url : String(input || '');
        const url = new URL(raw, window.location.href);
        const payload = await jsonPayload(input, init);
        let nextInit = init || {};

        if (shouldAttach) {
            const requestHeaders = input instanceof Request ? input.headers : undefined;
            const headers = new Headers((init && init.headers) || requestHeaders || {});
            const token = keyFor('comfly', comflyModelFor(path, payload), 'comfly_token');
            if (token && !headers.has('X-Comfly-API-Key')) {
                headers.set('X-Comfly-API-Key', token);
            }
            const baseUrl = localValue('comfly_base_url');
            if (baseUrl && !headers.has('X-Comfly-Base-URL')) {
                headers.set('X-Comfly-Base-URL', baseUrl);
            }
            nextInit = { ...nextInit, headers };
        }

        if ((path === '/api/chat' || path === '/api/chat/stream' || path === '/api/canvas-llm')
            && payload?.provider === 'modelscope') {
            const token = keyFor('modelscope', modelscopeModelFor(path, payload), 'modelscope_api_token');
            const baseUrl = localValue('modelscope_base_url');
            const nextBody = { ...payload };
            if (token && !nextBody.ms_api_key) nextBody.ms_api_key = token;
            if (baseUrl && !nextBody.ms_base_url) nextBody.ms_base_url = baseUrl;
            const headers = new Headers(nextInit.headers || {});
            if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
            nextInit = {
                ...nextInit,
                headers,
                body: JSON.stringify(nextBody)
            };
        }

        if (MODELSCOPE_BODY_ENDPOINTS.has(path) && payload && typeof payload === 'object') {
            const token = keyFor('modelscope', modelscopeModelFor(path, payload), 'modelscope_api_token');
            const baseUrl = localValue('modelscope_base_url');
            const nextBody = { ...payload };
            if (token && !nextBody.api_key) nextBody.api_key = token;
            if (baseUrl && !nextBody.base_url) nextBody.base_url = baseUrl;
            const headers = new Headers(nextInit.headers || {});
            if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
            nextInit = {
                ...nextInit,
                headers,
                body: JSON.stringify(nextBody)
            };
        }
        const request = nativeFetch(input, nextInit);
        if (url.origin === window.location.origin && url.pathname === '/api/config') {
            return request.then(responseWithLocalConfig);
        }
        return request;
    };

    /* ----------------------------------------------------------------------
       Pixel icon sprite injector
       ----------------------------------------------------------------------
       跨文档 <use href="external.svg#id"> 在多数浏览器里 currentColor 不会
       从外层 host 文档继承过来，效果就是图标渲染不出。我们把整个 sprite 同
       步抓回来，inline 注入到 body 起始位置，引用方就能用同文档 <use href="#id">。
    */
    const SPRITE_URL = '/static/icons/pixel.svg?v=31';
    let SPRITE_HTML = null;

    function injectSprite() {
        if (!document.body) return;
        if (document.getElementById('pixel-sprite-root')) return;
        if (!SPRITE_HTML) return;
        const wrap = document.createElement('div');
        wrap.id = 'pixel-sprite-root';
        wrap.setAttribute('aria-hidden', 'true');
        wrap.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
        wrap.innerHTML = SPRITE_HTML;
        document.body.insertBefore(wrap, document.body.firstChild);
    }

    function injectSpriteWhenReady() {
        if (document.body) {
            injectSprite();
        } else {
            document.addEventListener('DOMContentLoaded', injectSprite, { once: true });
        }
    }

    fetch(SPRITE_URL, { cache: 'force-cache' })
        .then(r => {
            if (!r.ok) throw new Error(`pixel sprite ${r.status}`);
            return r.text();
        })
        .then(t => {
            SPRITE_HTML = t;
            injectSpriteWhenReady();
            replaceLucideIcons(document);
        })
        .catch(e => console.warn('Failed to load pixel sprite', e));

    /* ----------------------------------------------------------------------
       Lucide → Pixel sprite 转换器
       ----------------------------------------------------------------------
       canvas.html / 老页面里残留的 <i data-lucide="X"> 全部映射到现有的像素 sprite。
       未在映射表中的（用户自选的图标）回退到 "diamond" 默认形状，保持 0 圆角和橙色。
    */
    const LUCIDE_TO_PIXEL = {
        'arrow-left':         { id: 'chevron-right', flip: true },
        'chevron-left':       { id: 'chevron-right', flip: true },
        'chevron-right':      { id: 'chevron-right' },
        'chevron-up':         { id: 'chevron-up' },
        'chevron-down':       { id: 'chevron-down' },
        'check':              { id: 'check' },
        'x':                  { id: 'cross' },
        'plus':               { id: 'plus' },
        'minus':              { id: 'minus' },
        'send':               { id: 'send' },
        'download':           { id: 'download' },
        'upload':             { id: 'upload' },
        'save':               { id: 'download' },
        'copy':               { id: 'copy' },
        'trash-2':            { id: 'trash' },
        'trash':              { id: 'trash' },
        'circle-dot':         { id: 'diamond' },
        'cloud-lightning':    { id: 'nav-online' },
        'cloud':              { id: 'nav-online' },
        'crop':               { id: 'diamond' },
        'grip-vertical':      { id: 'minus' },
        'image':              { id: 'nav-zimage' },
        'image-plus':         { id: 'plus' },
        'layers':             { id: 'nav-canvas' },
        'layout-grid':        { id: 'nav-canvas' },
        'message-square-text':{ id: 'nav-chat' },
        'move-horizontal':    { id: 'chevron-right' },
        'pencil':             { id: 'nav-klein' },
        'play':               { id: 'chevron-right' },
        'refresh-cw':         { id: 'refresh' },
        'rotate-ccw':         { id: 'refresh', flip: true },
        'info':               { id: 'info' },
        'text-cursor-input':  { id: 'nav-chat' },
        'text':               { id: 'nav-chat' },
        'wand-sparkles':      { id: 'flame' },
        'workflow':           { id: 'nav-canvas' },
        'zap':                { id: 'flame' },
        'search':             { id: 'search' }
    };

    function lucideToPixel(name) {
        if (!name) return { id: 'diamond' };
        return LUCIDE_TO_PIXEL[name] || { id: 'diamond' };
    }

    function replaceLucideIcons(scope) {
        scope = scope || document;
        const nodes = scope.querySelectorAll ? scope.querySelectorAll('[data-lucide]') : [];
        nodes.forEach(el => {
            if (el.dataset.pixelReplaced === '1') return;
            const name = el.getAttribute('data-lucide');
            const map = lucideToPixel(name);
            // 沿用原 class（剥掉 lucide-* 残留）+ 添加 pixel-icon 类
            const className = (el.className || '').toString().replace(/lucide[-\w]*/g, '').trim();
            const sizeMatch = (el.getAttribute('style') || '').match(/width:\s*(\d+)px/);
            const sizeAttr = sizeMatch ? ` width="${sizeMatch[1]}" height="${sizeMatch[1]}"` : '';
            const styleAttr = map.flip ? ' style="transform:scaleX(-1)"' : '';
            // 关键：用 innerHTML 让 HTML5 parser 把 <svg> 放到 SVG 命名空间下，
            // 否则 document.createElement('svg') 会产生 HTML 命名空间的伪 svg，<use> 不渲染。
            const holder = document.createElement('div');
            holder.innerHTML = `<svg class="pixel-icon ${className}" aria-hidden="true"${sizeAttr}${styleAttr} data-pixel-replaced="1"><use href="#${map.id}"></use></svg>`;
            const svg = holder.firstElementChild;
            if (svg) el.replaceWith(svg);
        });
    }

    // 暴露给 canvas.html / 其它历史调用方
    window.replaceLucideIcons = replaceLucideIcons;
    // 兜底：若代码里有 lucide.createIcons() 调用，无害地映射到我们的转换器
    if (!window.lucide) {
        window.lucide = { createIcons: () => replaceLucideIcons(document) };
    }

    // 启动后立即扫一遍（异步以等 DOM）
    if (document.body) {
        setTimeout(() => replaceLucideIcons(document), 0);
    } else {
        document.addEventListener('DOMContentLoaded', () => replaceLucideIcons(document));
    }

    // 用 MutationObserver 捕获后续动态插入的 lucide 节点（canvas 节点系统会频繁生成）
    if (typeof MutationObserver !== 'undefined') {
        const mo = new MutationObserver(mutations => {
            for (const m of mutations) {
                if (m.addedNodes.length) {
                    replaceLucideIcons(document);
                    break;
                }
            }
        });
        if (document.body) {
            mo.observe(document.body, { childList: true, subtree: true });
        } else {
            document.addEventListener('DOMContentLoaded', () => mo.observe(document.body, { childList: true, subtree: true }));
        }
    }
})();
