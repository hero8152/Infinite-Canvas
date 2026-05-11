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
       Pixel icon sprite injector
       ----------------------------------------------------------------------
       跨文档 <use href="external.svg#id"> 在多数浏览器里 currentColor 不会
       从外层 host 文档继承过来，效果就是图标渲染不出。我们把整个 sprite 同
       步抓回来，inline 注入到 body 起始位置，引用方就能用同文档 <use href="#id">。
    */
    const SPRITE_URL = '/static/icons/pixel.svg?v=21';
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

    // 同步抓 sprite，确保 DOM 渲染之前已经 inline 好
    try {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', SPRITE_URL, false); // sync
        xhr.send(null);
        if (xhr.status === 200) SPRITE_HTML = xhr.responseText;
    } catch (e) {
        // Sync XHR 在 chrome 高版本 deprecation warning 但仍可用；失败时回退到异步 fetch
        fetch(SPRITE_URL).then(r => r.text()).then(t => { SPRITE_HTML = t; injectSprite(); });
    }

    if (document.body) {
        injectSprite();
    } else {
        document.addEventListener('DOMContentLoaded', injectSprite);
    }

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
        'info':               { id: 'person' },
        'layers':             { id: 'nav-canvas' },
        'layout-grid':        { id: 'nav-canvas' },
        'message-square-text':{ id: 'nav-chat' },
        'move-horizontal':    { id: 'chevron-right' },
        'pencil':             { id: 'nav-klein' },
        'play':               { id: 'chevron-right' },
        'refresh-cw':         { id: 'chevron-down' },
        'rotate-ccw':         { id: 'chevron-down', flip: true },
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
            const flip = map.flip ? ' style="transform:scaleX(-1)"' : '';
            // 沿用原 class + 添加 pixel-icon 类
            const className = (el.className || '').toString().replace(/lucide[-\w]*/g, '').trim();
            const sizeMatch = (el.getAttribute('style') || '').match(/width:\s*(\d+)px/);
            const widthAttr = sizeMatch ? ` style="width:${sizeMatch[1]}px;height:${sizeMatch[1]}px"` : '';
            const wrap = document.createElement('svg');
            wrap.setAttribute('class', `pixel-icon ${className}`.trim());
            wrap.setAttribute('aria-hidden', 'true');
            if (flip) wrap.setAttribute('style', 'transform:scaleX(-1)');
            if (sizeMatch) wrap.style.width = wrap.style.height = `${sizeMatch[1]}px`;
            wrap.innerHTML = `<use href="#${map.id}"/>`;
            wrap.dataset.pixelReplaced = '1';
            el.replaceWith(wrap);
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
