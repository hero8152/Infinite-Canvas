const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '../../..');
const files = [
    'static/js/i18n-core.js',
    'static/js/i18n/common.js',
    'static/js/i18n/studio.js',
    'static/js/i18n/api-settings.js',
    'static/js/i18n/canvas.js',
    'static/js/i18n/smart-canvas.js',
    'static/js/i18n/comfyui-settings.js',
    'static/js/i18n.js',
];

const sandbox = {
    window: {},
    document: {
        readyState: 'complete',
        currentScript: null,
        addEventListener(){},
        createElement(){ return {}; },
        head: { appendChild(){} },
        write(){},
        querySelectorAll(){ return []; },
        documentElement: { setAttribute(){} },
    },
    localStorage: { getItem(){ return null; }, setItem(){} },
    CustomEvent: function(type, init){ return { type, ...init }; },
    console,
};
sandbox.window.dispatchEvent = function(){};

for(const file of files){
    const abs = path.join(root, file);
    new vm.Script(fs.readFileSync(abs, 'utf8'), { filename:file }).runInNewContext(sandbox);
}

const entries = sandbox.window.StudioI18n?.entries?.() || { zh:{}, en:{} };
const dict = {};
for(const key of new Set([...Object.keys(entries.zh || {}), ...Object.keys(entries.en || {})])){
    dict[key] = { zh: entries.zh?.[key], en: entries.en?.[key] };
}

const missing = [];
const bad = [];
for(const [key, entry] of Object.entries(dict)){
    if(!entry || typeof entry !== 'object' || !('zh' in entry) || !('en' in entry)) missing.push(key);
    const zh = String(entry?.zh ?? '');
    const en = String(entry?.en ?? '');
    if(/[�]|璁|娴|澶|鎻|鐢|鍙|杈|绋|鏂|涓/.test(zh) || /[�]/.test(en)) bad.push(key);
}

const used = new Set();
const scanFiles = fs.readdirSync(path.join(root, 'static'))
    .filter(name => name.endsWith('.html'))
    .map(name => path.join(root, 'static', name))
    .concat(fs.readdirSync(path.join(root, 'static/js'))
        .filter(name => name.endsWith('.js') && !name.startsWith('i18n.monolith-') && !name.startsWith('i18n.js.broken-'))
        .map(name => path.join(root, 'static/js', name)));

for(const file of scanFiles){
    const text = fs.readFileSync(file, 'utf8');
    for(const re of [
        /data-i18n(?:-[a-z]+)?=["']([^"']+)["']/g,
        /\btr\(\s*["']([^"']+)["']\s*\)/g,
        /\btrf\(\s*["']([^"']+)["']/g,
        /\btf\(\s*["']([^"']+)["']/g,
    ]){
        let match;
        while((match = re.exec(text))) used.add(match[1]);
    }
}

const unresolved = [...used].filter(key => !(key in dict)).sort();

if(missing.length || bad.length || unresolved.length){
    if(missing.length) console.error('Missing zh/en:', missing.join(', '));
    if(bad.length) console.error('Possible mojibake:', bad.join(', '));
    if(unresolved.length) console.error('Unresolved keys:', unresolved.join(', '));
    process.exit(1);
}

console.log(`i18n ok: ${Object.keys(dict).length} keys`);
