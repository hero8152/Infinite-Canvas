(function(){
    function open(src){
        if(!src) return;
        let scale = 1;
        let x = 0;
        let y = 0;
        let dragging = null;
        const overlay = document.createElement('div');
        overlay.className = 'studio-image-preview';
        overlay.innerHTML = '<div class="studio-image-preview__stage"><img alt=""></div>';
        const img = overlay.querySelector('img');
        img.src = src;
        const apply = () => img.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
        overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.82);display:grid;place-items:center;cursor:grab;';
        overlay.querySelector('.studio-image-preview__stage').style.cssText = 'width:min(92vw,1200px);height:min(88vh,900px);border:1px solid #fff;background:#111;overflow:hidden;display:grid;place-items:center;';
        img.style.cssText = 'max-width:100%;max-height:100%;transform-origin:center center;image-rendering:auto;';
        overlay.onclick = e => { if(e.target === overlay) overlay.remove(); };
        overlay.ondblclick = () => { scale = 1; x = 0; y = 0; apply(); };
        overlay.onwheel = e => {
            e.preventDefault();
            const next = Math.max(.2, Math.min(8, scale + (e.deltaY > 0 ? -.15 : .15)));
            scale = next;
            apply();
        };
        overlay.onmousedown = e => { dragging = {sx:e.clientX, sy:e.clientY, x, y}; overlay.style.cursor = 'grabbing'; };
        window.addEventListener('mousemove', e => {
            if(!dragging) return;
            x = dragging.x + e.clientX - dragging.sx;
            y = dragging.y + e.clientY - dragging.sy;
            apply();
        });
        window.addEventListener('mouseup', () => { dragging = null; overlay.style.cursor = 'grab'; });
        window.addEventListener('keydown', function onKey(e){
            if(e.key === 'Escape'){ overlay.remove(); window.removeEventListener('keydown', onKey); }
        });
        document.body.appendChild(overlay);
    }
    function attach(root=document){
        root.addEventListener('click', e => {
            const img = e.target.closest('img[data-preview], .image-card img, .history-card img, .gallery-card img');
            if(!img) return;
            open(img.dataset.preview || img.currentSrc || img.src);
        });
    }
    window.StudioImagePreview = {open, attach};
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => attach(document));
    else attach(document);
})();
