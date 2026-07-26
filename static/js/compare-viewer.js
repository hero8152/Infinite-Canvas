(function(){
    'use strict';

    const clamp = (value,min,max) => Math.max(min,Math.min(max,Number(value) || 0));

    class CompareViewer {
        constructor(options={}){
            this.root = options.root;
            if(!this.root) throw new Error('CompareViewer requires a root element');
            this.before = options.before || this.root.querySelector('[data-compare-before]');
            this.after = options.after || this.root.querySelector('[data-compare-after]');
            this.afterClip = options.afterClip || this.root.querySelector('[data-compare-after-clip]');
            this.handle = options.handle || this.root.querySelector('[data-compare-handle]');
            this.zoomLabel = options.zoomLabel || this.root.querySelector('[data-compare-zoom-label]');
            this.zoomInButton = options.zoomInButton || this.root.querySelector('[data-compare-zoom-in]');
            this.zoomOutButton = options.zoomOutButton || this.root.querySelector('[data-compare-zoom-out]');
            this.fullscreenButton = options.fullscreenButton || this.root.querySelector('[data-compare-fullscreen]');
            this.onChange = typeof options.onChange === 'function' ? options.onChange : null;
            this.divider = clamp(options.divider ?? 50,0,100);
            this.scale = clamp(options.scale ?? 1,1,8);
            this.panX = Number(options.panX || 0);
            this.panY = Number(options.panY || 0);
            this.dragMode = '';
            this.pointerId = null;
            this.lastPoint = null;
            this.fallbackFullscreen = false;
            this.abort = new AbortController();
            this.root.classList.add('compare-viewer-stage');
            this.before?.classList.add('compare-viewer-media');
            this.after?.classList.add('compare-viewer-media');
            this.afterClip?.classList.add('compare-viewer-after-clip');
            this.handle?.classList.add('compare-viewer-handle');
            this.bind();
            this.render(false);
            requestAnimationFrame(() => this.refresh());
        }

        bind(){
            const signal = this.abort.signal;
            this.root.addEventListener('pointerdown', event => this.pointerDown(event), {signal});
            this.root.addEventListener('pointermove', event => this.pointerMove(event), {signal});
            this.root.addEventListener('pointerup', event => this.pointerUp(event), {signal});
            this.root.addEventListener('pointercancel', event => this.pointerUp(event), {signal});
            this.root.addEventListener('auxclick', event => { if(event.button === 1) event.preventDefault(); }, {signal});
            this.root.addEventListener('wheel', event => {
                event.preventDefault();
                this.setZoom(this.scale + (event.deltaY < 0 ? .25 : -.25));
            }, {passive:false,signal});
            this.handle?.addEventListener('keydown', event => {
                const steps = {ArrowLeft:-2,ArrowDown:-2,ArrowRight:2,ArrowUp:2};
                if(event.key in steps){ event.preventDefault(); this.setDivider(this.divider + steps[event.key]); }
                if(event.key === 'Home'){ event.preventDefault(); this.setDivider(0); }
                if(event.key === 'End'){ event.preventDefault(); this.setDivider(100); }
            }, {signal});
            this.zoomInButton?.addEventListener('click', () => this.setZoom(this.scale + .25), {signal});
            this.zoomOutButton?.addEventListener('click', () => this.setZoom(this.scale - .25), {signal});
            this.zoomLabel?.addEventListener('click', () => this.resetView(), {signal});
            this.fullscreenButton?.addEventListener('click', () => this.toggleFullscreen(), {signal});
            document.addEventListener('fullscreenchange', () => {
                if(document.fullscreenElement !== this.root && !this.fallbackFullscreen) this.root.classList.remove('is-fullscreen');
                else this.root.classList.add('is-fullscreen');
                this.refresh();
            }, {signal});
            document.addEventListener('keydown', event => {
                if(event.key === 'Escape' && this.fallbackFullscreen) this.exitFullscreen();
            }, {signal});
            window.addEventListener('resize', () => this.refresh(), {signal});
        }

        pointerDown(event){
            if(event.target.closest('.compare-viewer-tools')) return;
            if(event.button === 1){
                event.preventDefault();
                this.dragMode = 'pan';
                this.lastPoint = {x:event.clientX,y:event.clientY};
                this.root.classList.add('is-panning');
            } else if(event.button === 0){
                this.dragMode = 'divider';
                this.updateDividerFromPointer(event);
            } else return;
            this.pointerId = event.pointerId;
            try { this.root.setPointerCapture(event.pointerId); } catch(error) {}
        }

        pointerMove(event){
            if(event.pointerId !== this.pointerId) return;
            if(this.dragMode === 'divider') this.updateDividerFromPointer(event);
            if(this.dragMode === 'pan' && this.lastPoint){
                this.panX += event.clientX - this.lastPoint.x;
                this.panY += event.clientY - this.lastPoint.y;
                this.lastPoint = {x:event.clientX,y:event.clientY};
                this.render();
            }
        }

        pointerUp(event){
            if(event.pointerId !== this.pointerId) return;
            try { this.root.releasePointerCapture(event.pointerId); } catch(error) {}
            this.pointerId = null;
            this.dragMode = '';
            this.lastPoint = null;
            this.root.classList.remove('is-panning');
        }

        updateDividerFromPointer(event){
            const rect = this.root.getBoundingClientRect();
            if(rect.width) this.setDivider(((event.clientX - rect.left) / rect.width) * 100);
        }

        setImages(beforeUrl,afterUrl){
            if(this.before){ if(beforeUrl) this.before.src = beforeUrl; else this.before.removeAttribute('src'); }
            if(this.after){ if(afterUrl) this.after.src = afterUrl; else this.after.removeAttribute('src'); }
            this.root.classList.toggle('compare-viewer-missing-before',!beforeUrl);
            this.root.classList.toggle('compare-viewer-missing-after',!afterUrl);
            this.refresh();
        }

        setDivider(value,silent=false){
            this.divider = clamp(value,0,100);
            this.render(!silent);
        }

        setZoom(value,silent=false){
            const next = Math.round(clamp(value,1,8) * 100) / 100;
            this.scale = next;
            if(next === 1){ this.panX = 0; this.panY = 0; }
            this.render(!silent);
        }

        resetView(){
            this.scale = 1;
            this.panX = 0;
            this.panY = 0;
            this.render();
        }

        reset(){
            this.divider = 50;
            this.resetView();
        }

        refresh(){
            if(this.after) this.after.style.width = `${this.root.clientWidth}px`;
        }

        state(){
            return {divider:this.divider,scale:this.scale,panX:this.panX,panY:this.panY,fullscreen:document.fullscreenElement === this.root || this.fallbackFullscreen};
        }

        render(notify=true){
            this.root.style.setProperty('--compare-divider',`${this.divider}%`);
            this.root.style.setProperty('--compare-scale',String(this.scale));
            this.root.style.setProperty('--compare-pan-x',`${this.panX}px`);
            this.root.style.setProperty('--compare-pan-y',`${this.panY}px`);
            this.root.classList.toggle('is-zoomed',this.scale > 1);
            if(this.handle) this.handle.setAttribute('aria-valuenow',String(Math.round(this.divider)));
            if(this.zoomLabel) this.zoomLabel.textContent = `${this.scale.toFixed(this.scale % 1 ? 2 : 0).replace(/0$/,'')}×`;
            if(notify) this.onChange?.(this.state());
        }

        async toggleFullscreen(){
            if(document.fullscreenElement === this.root || this.fallbackFullscreen){
                await this.exitFullscreen();
                return;
            }
            try {
                if(this.root.requestFullscreen){
                    await this.root.requestFullscreen({navigationUI:'hide'});
                    return;
                }
            } catch(error) {}
            this.fallbackFullscreen = true;
            this.root.classList.add('compare-viewer-fallback-fullscreen','is-fullscreen');
            this.refresh();
        }

        async exitFullscreen(){
            if(document.fullscreenElement === this.root){
                try { await document.exitFullscreen(); } catch(error) {}
            }
            this.fallbackFullscreen = false;
            this.root.classList.remove('compare-viewer-fallback-fullscreen','is-fullscreen');
            this.refresh();
        }

        destroy(){
            this.abort.abort();
            this.exitFullscreen();
        }
    }

    window.CompareViewer = CompareViewer;
})();
