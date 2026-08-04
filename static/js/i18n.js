(function(){
    function currentStaticVersion() {
        try {
            const currentScript = document.currentScript;
            if (currentScript?.src) {
                const version = new URL(currentScript.src, window.location.href).searchParams.get('v');
                if (version) return version;
            }
        } catch (e) {}
        return String(window.INFINITE_CANVAS_STATIC_VERSION || '');
    }
    const VERSION = currentStaticVersion();
    const scripts = [
        '/static/js/i18n-core.js',
        '/static/js/i18n/common.js',
        '/static/js/i18n/studio.js',
        '/static/js/i18n/api-settings.js',
        '/static/js/i18n/canvas.js',
        '/static/js/i18n/smart-canvas.js',
        '/static/js/i18n/comfyui-settings.js',
    ];
    const versionSuffix = VERSION ? '?v=' + encodeURIComponent(VERSION) : '';
    const tags = scripts.map(src => '<script src="' + src + versionSuffix + '"></script>').join('');
    if(document.readyState === 'loading' && document.currentScript){
        document.write(tags);
        return;
    }
    scripts.reduce((promise, src) => promise.then(() => new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src + versionSuffix;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    })), Promise.resolve()).then(() => window.StudioI18n?.apply?.()).catch(err => console.error('Failed to load i18n modules', err));
})();
