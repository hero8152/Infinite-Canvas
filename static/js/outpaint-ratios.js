(function(root, factory){
    const api = factory();
    if(typeof module !== 'undefined' && module.exports) module.exports = api;
    if(root) root.OutpaintRatios = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
    const PRESETS = ['free', 'source', '1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '21:9', '9:21'];

    function gcd(a, b){
        a = Math.abs(Math.round(Number(a) || 0));
        b = Math.abs(Math.round(Number(b) || 0));
        while(b){ const next = a % b; a = b; b = next; }
        return a || 1;
    }

    function parsePreset(preset){
        const value = String(preset || '').trim();
        if(value === 'free' || value === 'source') return null;
        const match = value.match(/^(\d+)\s*:\s*(\d+)$/);
        if(!match) return null;
        const width = Number(match[1]);
        const height = Number(match[2]);
        if(width <= 0 || height <= 0) return null;
        const divisor = gcd(width, height);
        return {width:width / divisor, height:height / divisor, ratio:width / height};
    }

    function fitContaining(sourceWidth, sourceHeight, preset){
        const width = Math.max(1, Math.round(Number(sourceWidth) || 1));
        const height = Math.max(1, Math.round(Number(sourceHeight) || 1));
        const parsed = parsePreset(preset);
        if(!parsed) return {width, height, offsetX:0, offsetY:0, preset:preset || 'free'};
        const rawUnits = Math.max(1, Math.ceil(Math.max(width / parsed.width, height / parsed.height)));
        const units = Math.ceil(rawUnits / 16) * 16;
        const targetWidth = units * parsed.width;
        const targetHeight = units * parsed.height;
        return {
            width:targetWidth,
            height:targetHeight,
            offsetX:Math.floor((targetWidth - width) / 2),
            offsetY:Math.floor((targetHeight - height) / 2),
            preset:String(preset),
        };
    }

    return {PRESETS, parsePreset, fitContaining};
});
