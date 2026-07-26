(function(){
    'use strict';
    const state = {works:[],tab:'all',search:'',kind:'',compareWork:null,compareViewer:null,localBaseUrl:'',localTargetUrl:'',renameWork:null};
    const el = {};
    const byId = id => document.getElementById(id);
    const t = key => window.StudioI18n?.t?.(key) || key;
    const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g,ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));

    function cache(){
        ['worksCount','worksTabs','worksSearch','worksKind','worksRefresh','worksQuickCompare','worksGrid','worksEmpty','worksCompareDialog','compareWorkName','compareFavorite','closeWorksCompare','compareTargetSelect','compareTargetFileButton','compareTargetFile','compareBaseSelect','compareBaseFileButton','compareBaseFile','compareHint','worksCompareStage','worksBeforeImage','worksAfterImage','worksAfterClip','worksCompareHandle','worksZoomOut','worksZoomReset','worksZoomIn','worksFullscreen','compareMeta','compareDownload','worksRenameDialog','worksRenameForm','worksRenameInput','closeWorksRename','cancelWorksRename','worksToast'].forEach(id => el[id]=byId(id));
    }
    async function fetchJson(url,options={}){
        const response = await fetch(url,options);
        const data = await response.json().catch(() => ({}));
        if(!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
        return data;
    }
    function toast(message){
        el.worksToast.textContent = message;
        el.worksToast.classList.add('show');
        clearTimeout(toast.timer);
        toast.timer=setTimeout(()=>el.worksToast.classList.remove('show'),2200);
    }
    function visibleWorks(){
        const search=state.search.trim().toLowerCase();
        return state.works.filter(item => {
            if(state.tab==='trash') return item.trashed && (!search || `${item.name} ${item.prompt} ${item.model} ${item.operation}`.toLowerCase().includes(search)) && (!state.kind || item.kind===state.kind);
            if(item.trashed) return false;
            if(state.tab==='favorite' && !item.favorite) return false;
            if(state.kind && item.kind!==state.kind) return false;
            if(search && !`${item.name} ${item.prompt} ${item.model} ${item.operation}`.toLowerCase().includes(search)) return false;
            return true;
        });
    }
    function kindLabel(item){
        const operations={try_on:'works.tryOn',pose_transfer:'works.poseTransfer',prop_replace:'works.propReplace',angle_change:'works.angleChange',background_change:'works.backgroundChange',universal:'works.universal'};
        if(item.kind==='ecommerce') return operations[item.operation] ? t(operations[item.operation]) : t('works.ecommerce');
        if(item.kind==='online') return t('works.online');
        return item.kind || t('works.image');
    }
    function dateText(timestamp){
        const value=Number(timestamp || 0);
        return value ? new Date(value*1000).toLocaleString() : '—';
    }
    function renderKinds(){
        const current=state.kind;
        const kinds=[...new Set(state.works.filter(item=>state.tab==='trash'?item.trashed:!item.trashed).map(item=>item.kind).filter(Boolean))].sort();
        el.worksKind.innerHTML=`<option value="">${escapeHtml(t('works.allTypes'))}</option>`+kinds.map(kind=>`<option value="${escapeHtml(kind)}">${escapeHtml(kind==='ecommerce'?t('works.ecommerce'):kind==='online'?t('works.online'):kind)}</option>`).join('');
        state.kind=kinds.includes(current)?current:'';
        el.worksKind.value=state.kind;
    }
    function render(){
        const works=visibleWorks();
        el.worksCount.textContent=String(works.length);
        el.worksGrid.classList.toggle('hidden',works.length===0);
        el.worksEmpty.classList.toggle('hidden',works.length!==0);
        el.worksTabs.querySelectorAll('[data-tab]').forEach(button=>button.classList.toggle('active',button.dataset.tab===state.tab));
        el.worksGrid.innerHTML=works.map(item=>`<article class="works-card ${item.trashed?'trashed':''}" data-work-id="${escapeHtml(item.id)}">
            <button class="works-card-media" type="button" data-compare-work="${escapeHtml(item.id)}"><img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.name)}" loading="lazy"><span class="works-kind">${escapeHtml(kindLabel(item))}</span></button>
            ${item.trashed?'':`<button class="works-favorite ${item.favorite?'active':''}" type="button" data-favorite-work="${escapeHtml(item.id)}" aria-label="${escapeHtml(t('works.favorite'))}">${item.favorite?'★':'☆'}</button>`}
            <div class="works-card-body"><h2 title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</h2><p>${escapeHtml(item.prompt || t('works.noPrompt'))}</p>
                <div class="works-card-meta"><span>${escapeHtml(item.model || '—')}</span><span>${escapeHtml(dateText(item.created_at))}</span></div>
                <div class="works-card-actions"><button class="primary" type="button" data-compare-work="${escapeHtml(item.id)}">${escapeHtml(t('works.compare'))}</button><a href="${escapeHtml(item.url)}" download="${escapeHtml(item.name)}">${escapeHtml(t('works.download'))}</a><button type="button" data-rename-work="${escapeHtml(item.id)}">${escapeHtml(t('works.rename'))}</button><button type="button" data-trash-work="${escapeHtml(item.id)}" data-trash-value="${item.trashed?'false':'true'}">${escapeHtml(t(item.trashed?'works.restore':'works.moveToTrash'))}</button></div>
            </div></article>`).join('');
        el.worksGrid.querySelectorAll('[data-compare-work]').forEach(button=>button.addEventListener('click',()=>openCompare(button.dataset.compareWork)));
        el.worksGrid.querySelectorAll('[data-favorite-work]').forEach(button=>button.addEventListener('click',()=>toggleFavorite(button.dataset.favoriteWork)));
        el.worksGrid.querySelectorAll('[data-rename-work]').forEach(button=>button.addEventListener('click',()=>openRename(button.dataset.renameWork)));
        el.worksGrid.querySelectorAll('[data-trash-work]').forEach(button=>button.addEventListener('click',()=>setTrashed(button.dataset.trashWork,button.dataset.trashValue==='true')));
    }
    async function loadWorks(){
        el.worksRefresh.disabled=true;
        try {
            const data=await fetchJson('/api/works?limit=1000&include_trashed=true',{cache:'no-store'});
            state.works=data.works || [];
            renderKinds();
            render();
        } catch(error){ toast(error.message); }
        finally { el.worksRefresh.disabled=false; }
    }
    async function toggleFavorite(workId){
        const work=state.works.find(item=>item.id===workId);
        if(!work) return;
        try {
            const data=await fetchJson(`/api/works/${encodeURIComponent(work.id)}/favorite`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({favorite:!work.favorite})});
            Object.assign(work,data.work || {favorite:!work.favorite});
            if(state.compareWork?.id===work.id) state.compareWork=work;
            render();
            syncCompareFavorite();
        } catch(error){ toast(error.message); }
    }

    async function updateMetadata(workId,changes){
        const data=await fetchJson(`/api/works/${encodeURIComponent(workId)}/metadata`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(changes)});
        const index=state.works.findIndex(item=>item.id===workId);
        if(index>=0) state.works[index]=data.work;
        if(state.compareWork?.id===workId) state.compareWork=data.work;
        renderKinds();render();syncCompareFavorite();
        return data.work;
    }

    async function setTrashed(workId,trashed){
        if(trashed && !window.confirm(t('works.trashConfirm'))) return;
        try {
            await updateMetadata(workId,{trashed});
            if(state.compareWork?.id===workId && trashed) closeCompare();
            toast(t(trashed?'works.trashedDone':'works.restoredDone'));
        } catch(error){ toast(error.message); }
    }

    function openRename(workId){
        const work=state.works.find(item=>item.id===workId);if(!work)return;
        state.renameWork=work;el.worksRenameInput.value=work.name || '';el.worksRenameDialog.showModal();
        requestAnimationFrame(()=>{el.worksRenameInput.focus();el.worksRenameInput.select();});
    }

    function closeRename(){state.renameWork=null;el.worksRenameDialog.close();}

    async function saveRename(event){
        event.preventDefault();
        const work=state.renameWork;if(!work)return;
        const name=el.worksRenameInput.value.trim();
        if(!name){toast(t('works.nameRequired'));return;}
        try{await updateMetadata(work.id,{name});closeRename();toast(t('works.renamedDone'));}catch(error){toast(error.message);}
    }
    function availableWorks(){return state.works.filter(item=>!item.trashed);}
    function comparisonOptions(work){
        const options=[];
        if(work?.source_url) options.push({value:'source',label:t('works.originalReference'),url:work.source_url});
        availableWorks().filter(item=>item.id!==work?.id).slice(0,200).forEach(item=>options.push({value:item.id,label:item.name,url:item.url}));
        return options;
    }
    function renderCompareMeta(work){
        const values=work?[work.model,work.width&&work.height?`${work.width}×${work.height}`:'',dateText(work.created_at)].filter(Boolean):[];
        el.compareMeta.innerHTML=values.map(value=>`<span>${escapeHtml(value)}</span>`).join('');
    }
    function syncCompareFavorite(){
        el.compareFavorite.disabled=!state.compareWork;
        el.compareFavorite.textContent=state.compareWork?.favorite?'★':'☆';
        el.compareFavorite.title=state.compareWork?t(state.compareWork.favorite?'works.unfavorite':'works.favorite'):t('works.localWork');
    }

    function renderTargetOptions(preferred=''){
        const targets=availableWorks().slice(0,500);
        const selectedTrash=state.works.find(item=>item.id===preferred && item.trashed);
        if(selectedTrash) targets.unshift(selectedTrash);
        const options=targets.map(item=>`<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`);
        if(state.localTargetUrl) options.unshift(`<option value="local">${escapeHtml(t('works.localWork'))}</option>`);
        if(!options.length) options.push(`<option value="">${escapeHtml(t('works.chooseTargetPrompt'))}</option>`);
        el.compareTargetSelect.innerHTML=options.join('');
        if(preferred && [...el.compareTargetSelect.options].some(item=>item.value===preferred)) el.compareTargetSelect.value=preferred;
    }

    function selectedTarget(){
        if(el.compareTargetSelect.value==='local' && state.localTargetUrl) return {id:'',name:t('works.localWork'),url:state.localTargetUrl,local:true};
        return state.works.find(item=>item.id===el.compareTargetSelect.value) || null;
    }

    function renderBaseOptions(work){
        const previous=el.compareBaseSelect.value;
        const options=comparisonOptions(work);
        if(state.localBaseUrl) options.unshift({value:'local',label:t('works.localBase'),url:state.localBaseUrl});
        el.compareBaseSelect.innerHTML=options.length?options.map(item=>`<option value="${escapeHtml(item.value)}" data-url="${escapeHtml(item.url)}">${escapeHtml(item.label)}</option>`).join(''):`<option value="">${escapeHtml(t('works.chooseBasePrompt'))}</option>`;
        if(previous && [...el.compareBaseSelect.options].some(item=>item.value===previous)) el.compareBaseSelect.value=previous;
    }

    function applyComparison(reset=true){
        const target=selectedTarget();
        state.compareWork=target && !target.local ? target : null;
        const baseUrl=el.compareBaseSelect.selectedOptions[0]?.dataset?.url || '';
        const targetUrl=target?.url || '';
        state.compareViewer.setImages(baseUrl,targetUrl);
        if(reset) state.compareViewer.reset();
        el.compareWorkName.textContent=target?.name || t('works.freeCompare');
        el.compareHint.textContent=baseUrl&&targetUrl?t('works.compareHint'):t('works.chooseTwoImages');
        renderCompareMeta(state.compareWork);
        syncCompareFavorite();
        el.compareDownload.disabled=!targetUrl;
        el.compareDownload.onclick=()=>target&&downloadWork(target);
    }

    function syncCompareTarget(){
        const target=selectedTarget();
        renderBaseOptions(target);
        applyComparison();
    }

    function openCompare(workId=''){
        const preferred=state.works.some(item=>item.id===workId)?workId:(availableWorks()[0]?.id || (state.localTargetUrl?'local':''));
        renderTargetOptions(preferred);
        if(preferred) el.compareTargetSelect.value=preferred;
        syncCompareTarget();
        el.worksCompareDialog.showModal();
        requestAnimationFrame(()=>state.compareViewer.refresh());
    }
    function downloadWork(work){
        const link=document.createElement('a');link.href=work.url;link.download=work.name || 'work';document.body.appendChild(link);link.click();link.remove();
    }
    function closeCompare(){
        if(state.localBaseUrl){ URL.revokeObjectURL(state.localBaseUrl); state.localBaseUrl=''; }
        if(state.localTargetUrl){ URL.revokeObjectURL(state.localTargetUrl); state.localTargetUrl=''; }
        state.compareWork=null;
        state.compareViewer.exitFullscreen();
        el.worksCompareDialog.close();
    }
    function validImageFile(file){return !!file && (String(file.type||'').startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(file.name||''));}
    function bind(){
        el.worksTabs.addEventListener('click',event=>{const button=event.target.closest('[data-tab]');if(button){state.tab=button.dataset.tab;renderKinds();render();}});
        el.worksSearch.addEventListener('input',()=>{state.search=el.worksSearch.value;render();});
        el.worksKind.addEventListener('change',()=>{state.kind=el.worksKind.value;render();});
        el.worksRefresh.addEventListener('click',loadWorks);
        el.worksQuickCompare.addEventListener('click',()=>openCompare());
        el.closeWorksCompare.addEventListener('click',closeCompare);
        el.worksCompareDialog.addEventListener('cancel',event=>{event.preventDefault();closeCompare();});
        el.compareTargetSelect.addEventListener('change',syncCompareTarget);
        el.compareBaseSelect.addEventListener('change',()=>applyComparison());
        el.compareFavorite.addEventListener('click',()=>state.compareWork&&toggleFavorite(state.compareWork.id));
        el.compareTargetFileButton.addEventListener('click',()=>el.compareTargetFile.click());
        el.compareTargetFile.addEventListener('change',event=>{
            const file=event.target.files?.[0];if(!validImageFile(file))return;
            if(state.localTargetUrl)URL.revokeObjectURL(state.localTargetUrl);
            state.localTargetUrl=URL.createObjectURL(file);renderTargetOptions('local');el.compareTargetSelect.value='local';syncCompareTarget();event.target.value='';
        });
        el.compareBaseFileButton.addEventListener('click',()=>el.compareBaseFile.click());
        el.compareBaseFile.addEventListener('change',event=>{
            const file=event.target.files?.[0]; if(!validImageFile(file)) return;
            if(state.localBaseUrl) URL.revokeObjectURL(state.localBaseUrl);
            state.localBaseUrl=URL.createObjectURL(file);
            renderBaseOptions(selectedTarget());el.compareBaseSelect.value='local';applyComparison();event.target.value='';
        });
        el.worksRenameForm.addEventListener('submit',saveRename);
        el.closeWorksRename.addEventListener('click',closeRename);
        el.cancelWorksRename.addEventListener('click',closeRename);
        el.worksRenameDialog.addEventListener('cancel',event=>{event.preventDefault();closeRename();});
        window.addEventListener('message',event=>{if(event.data?.type==='entity.changed'&&event.data.topic==='history')loadWorks();});
        window.addEventListener('studio-lang-change',()=>{renderKinds();render();if(el.worksCompareDialog.open){renderTargetOptions(state.compareWork?.id || (state.localTargetUrl?'local':''));syncCompareTarget();}});
    }
    async function init(){
        cache();
        state.compareViewer=new window.CompareViewer({root:el.worksCompareStage,before:el.worksBeforeImage,after:el.worksAfterImage,afterClip:el.worksAfterClip,handle:el.worksCompareHandle,zoomLabel:el.worksZoomReset,zoomInButton:el.worksZoomIn,zoomOutButton:el.worksZoomOut,fullscreenButton:el.worksFullscreen});
        bind();
        await loadWorks();
    }
    window.WorksManager={state,loadWorks,openCompare};
    document.addEventListener('DOMContentLoaded',init,{once:true});
})();
