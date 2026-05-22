(function(){
    const KEY = 'studio_lang';
    const dict = {
        zh: {
            'nav.apiModels':'API / Models',
            'nav.comfyui':'ComfyUI',
            'nav.appearance':'Appearance',
            'online.title':'Online generate',
            'online.prompt':'Prompt',
            'online.provider':'Provider',
            'online.model':'Model',
            'chat.mode':'Mode',
            'chat.provider':'Provider',
            'api.title':'API Providers',
            'comfy.title':'ComfyUI Settings'
        },
        en: {
            'nav.apiModels':'API / Models',
            'nav.comfyui':'ComfyUI',
            'nav.appearance':'Appearance',
            'online.title':'Online generate',
            'online.prompt':'Prompt',
            'online.provider':'Provider',
            'online.model':'Model',
            'chat.mode':'Mode',
            'chat.provider':'Provider',
            'api.title':'API Providers',
            'comfy.title':'ComfyUI Settings'
        }
    };
    function lang(){ return localStorage.getItem(KEY) || 'zh'; }
    function t(key, fallback=''){
        const current = lang();
        return (dict[current] && dict[current][key]) || (dict.zh && dict.zh[key]) || fallback || key;
    }
    function apply(root=document){
        root.querySelectorAll('[data-i18n]').forEach(el => {
            el.textContent = t(el.dataset.i18n, el.textContent);
        });
        root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder, el.getAttribute('placeholder') || ''));
        });
        root.querySelectorAll('[data-i18n-title]').forEach(el => {
            el.setAttribute('title', t(el.dataset.i18nTitle, el.getAttribute('title') || ''));
        });
    }
    function setLang(next){
        localStorage.setItem(KEY, next === 'en' ? 'en' : 'zh');
        apply();
        window.dispatchEvent(new CustomEvent('studio-i18n-change', {detail:{lang:lang()}}));
    }
    function ensureSwitch(){
        if(document.getElementById('studioLangSwitch')) return;
        const btn = document.createElement('button');
        btn.id = 'studioLangSwitch';
        btn.type = 'button';
        btn.textContent = lang() === 'en' ? '中' : 'EN';
        btn.setAttribute('aria-label', 'Language');
        btn.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:9999;height:30px;min-width:34px;border:1px solid var(--border,#111);border-radius:0;background:var(--ink,#111);color:#fff;font:700 11px var(--font-mono,monospace);cursor:pointer;';
        btn.onclick = () => { setLang(lang() === 'en' ? 'zh' : 'en'); btn.textContent = lang() === 'en' ? '中' : 'EN'; };
        document.body.appendChild(btn);
    }
    window.StudioI18n = {t, apply, setLang, lang};
    if(document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { apply(); ensureSwitch(); });
    } else {
        apply(); ensureSwitch();
    }
})();
