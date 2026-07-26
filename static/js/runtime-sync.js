(function(){
    const TOPICS = ['canvas','project','asset','prompt','platform','workflow','preference','history','session','task'];
    const STORAGE = {
        theme: ['studio_theme','canvas_theme'],
        language: ['studio_lang'],
        ui_scale: ['studio_ui_scale_mode'],
        default_image_provider: ['studio_default_image_provider'],
        default_image_model: ['studio_default_image_model'],
        default_video_provider: ['studio_default_video_provider'],
        default_video_model: ['studio_default_video_model'],
        default_chat_provider: ['studio_default_chat_provider'],
        default_chat_model: ['studio_default_chat_model'],
        online_generation_settings: ['studio_online_generation_settings_v1'],
        ecommerce_settings: ['studio_ecommerce_settings_v2'],
    };
    const state = { values:{}, revision:0, actorId:'', socket:null, reconnectTimer:null, backoff:1000, applying:false };
    state.actorId = localStorage.getItem('client_id') || localStorage.getItem('canvas_sync_actor_id') || `web-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
    localStorage.setItem('client_id', state.actorId);
    localStorage.setItem('canvas_sync_actor_id', state.actorId);

    function isTop(){ try { return window.top === window; } catch(e) { return false; } }
    function localValues(){
        const values = {};
        Object.entries(STORAGE).forEach(([name, keys]) => {
            for(const key of keys){
                const value = localStorage.getItem(key);
                if(value){ values[name] = value; break; }
            }
        });
        return values;
    }
    function applyValues(values){
        state.applying = true;
        try {
            Object.entries(values || {}).forEach(([name, value]) => {
                const keys = STORAGE[name] || [];
                keys.forEach(key => localStorage.setItem(key, String(value)));
            });
            if(values?.theme) window.StudioTheme?.apply?.(values.theme);
            if(values?.language) window.StudioI18n?.set?.(values.language, {sync:false});
            if(values?.ui_scale) window.StudioScale?.apply?.(values.ui_scale);
            document.querySelectorAll('iframe').forEach(frame => {
                try { frame.contentWindow?.postMessage({type:'canvas.preferences', values}, '*'); } catch(e) {}
            });
        } finally { state.applying = false; }
    }
    async function readPreferences(){
        const response = await fetch('/api/preferences', {cache:'no-store'});
        if(!response.ok) throw new Error(`preferences HTTP ${response.status}`);
        const data = await response.json();
        state.values = data.values || {};
        state.revision = Number(data.revision || 0);
        if(state.revision === 0){
            const existing = localValues();
            if(Object.keys(existing).length){
                return writePreferences(existing, 0, true);
            }
        }
        applyValues(state.values);
        return data;
    }
    async function writePreferences(values, baseRevision, importIfEmpty){
        const response = await fetch('/api/preferences', {
            method:'PUT', headers:{'Content-Type':'application/json'},
            body:JSON.stringify({values, base_revision:Number(baseRevision || 0), actor_id:state.actorId, import_if_empty:!!importIfEmpty})
        });
        const data = await response.json().catch(() => ({}));
        if(response.status === 409){
            const latest = data.detail || {};
            state.values = latest.values || {};
            state.revision = Number(latest.revision || 0);
            // 冲突阶段不广播旧偏好，避免把正在输入的 iframe 重绘到上一版状态。
            const merged = {...state.values, ...values};
            return writePreferences(merged, state.revision, false);
        }
        if(!response.ok) throw new Error(data.detail || `preferences HTTP ${response.status}`);
        state.values = data.values || {};
        state.revision = Number(data.revision || 0);
        applyValues(state.values);
        return data;
    }
    function setPreference(name, value){
        if(!Object.prototype.hasOwnProperty.call(STORAGE, name)) return Promise.resolve();
        if(state.applying) return new Promise(resolve => setTimeout(() => resolve(setPreference(name, value)), 25));
        if(!isTop()){
            try { return window.top.RuntimeSync?.setPreference(name, value) || Promise.resolve(); } catch(e) { return Promise.resolve(); }
        }
        return writePreferences({...state.values, [name]:value}, state.revision, false).catch(() => {});
    }
    function dispatchMessage(message){
        window.dispatchEvent(new CustomEvent('canvas-realtime-message', {detail:message}));
        document.querySelectorAll('iframe').forEach(frame => {
            try { frame.contentWindow?.postMessage(message, '*'); } catch(e) {}
        });
    }
    function connectEvents(){
        if(!isTop() || !location.host) return;
        clearTimeout(state.reconnectTimer);
        const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
        const socket = new WebSocket(`${protocol}://${location.host}/ws/events`);
        state.socket = socket;
        socket.onopen = () => {
            socket.send(JSON.stringify({type:'auth', client_id:state.actorId}));
            state.backoff = 1000;
            readPreferences().catch(() => {});
            dispatchMessage({type:'sync.reconnected', topics:TOPICS});
        };
        socket.onmessage = event => {
            let message; try { message = JSON.parse(event.data); } catch(e) { return; }
            if(message.type === 'entity.changed' && message.actor_id === state.actorId) return;
            if(message.type === 'entity.changed' && message.topic === 'preference') readPreferences().catch(() => {});
            dispatchMessage(message);
        };
        socket.onclose = () => {
            if(state.socket !== socket) return;
            state.reconnectTimer = setTimeout(connectEvents, state.backoff);
            state.backoff = Math.min(state.backoff * 2, 8000);
        };
        socket.onerror = () => { try { socket.close(); } catch(e) {} };
    }
    window.RuntimeSync = {state, readPreferences, setPreference, connectEvents};
    window.addEventListener('message', event => {
        if(event.data?.type === 'canvas.preferences') applyValues(event.data.values || {});
    });
    if(isTop()){
        readPreferences().catch(() => {});
        connectEvents();
    }
})();
