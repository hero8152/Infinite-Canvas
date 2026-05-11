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
})();
