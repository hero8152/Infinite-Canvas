(function(){
    'use strict';

    const SETTINGS_KEY = 'studio_ecommerce_settings_v2';
    const LEGACY_SETTINGS_KEY = 'studio_ecommerce_settings_v1';
    const SETTINGS_SCHEMA_VERSION = 3;
    const DEFAULT_OPERATION = 'universal';
    const ASPECT_RATIOS = ['source','1:1','2:3','3:2','3:4','4:3','4:5','9:16','16:9'];
    const RESOLUTIONS = ['auto','1k','2k','4k'];
    const QUALITIES = ['auto','low','medium','high'];
    const OPERATION_CONFIG = {
        universal: {
            titleKey:'ecommerce.universal',
            inputs:[],
            universal:true,
        },
        try_on: {
            titleKey:'ecommerce.tryOn',
            inputs:[
                {role:'source', labelKey:'ecommerce.modelImage', required:true},
                {role:'garment', labelKey:'ecommerce.garmentImage', required:true},
            ],
        },
        pose_transfer: {
            titleKey:'ecommerce.poseTransfer',
            inputs:[
                {role:'source', labelKey:'ecommerce.personImage', required:true},
                {role:'pose', labelKey:'ecommerce.poseImage', required:false},
            ],
        },
        prop_replace: {
            titleKey:'ecommerce.propReplace',
            inputs:[
                {role:'source', labelKey:'ecommerce.sourceImage', required:true},
                {role:'prop', labelKey:'ecommerce.propImage', required:true},
            ],
            mask:true,
        },
        angle_change: {
            titleKey:'ecommerce.angleChange',
            inputs:[
                {role:'source', labelKey:'ecommerce.subjectImage', required:true},
            ],
        },
        background_change: {
            titleKey:'ecommerce.backgroundChange',
            inputs:[
                {role:'source', labelKey:'ecommerce.sourceImage', required:true},
                {role:'background', labelKey:'ecommerce.backgroundImage', required:false},
            ],
            mask:true,
        },
    };

    const UNIVERSAL_PRESET_ROLES = ['subject','full_garment','shoes','accessory','pose','scene'];

    const DEFAULT_OPTIONS = {
        universal:{instruction:''},
        try_on:{garment_category:'auto', instruction:''},
        pose_transfer:{pose_source:'preset', pose_preset:'standing_front', instruction:''},
        prop_replace:{target_description:'', instruction:''},
        angle_change:{azimuth:45, elevation:0, distance:'medium', instruction:''},
        background_change:{background_mode:'preset', background_preset:'studio_white', background_prompt:'', instruction:''},
    };

    const createWorkspace = () => ({
        inputs:{},
        taskId:'',
        currentTask:null,
        selectedOutput:0,
        compareValue:50,
        zoom:1,
    });

    const state = {
        operation:DEFAULT_OPERATION,
        mode:'standard',
        inputs:{},
        options:JSON.parse(JSON.stringify(DEFAULT_OPTIONS)),
        capabilities:null,
        providerId:'',
        model:'',
        aspectRatio:'source',
        resolution:'auto',
        quality:'auto',
        count:0,
        modelPanelCollapsed:false,
        currentTask:null,
        tasks:[],
        selectedOutput:0,
        activeUploadRole:'',
        compareValue:50,
        zoom:1,
        tasksById:new Map(),
        activeTaskIds:new Set(),
        taskPollTimer:null,
        taskPollInflight:false,
        maskUploadPromise:null,
        submissionsInFlight:0,
        generationTimer:null,
        assetLibrary:null,
        assetDialogMode:'select',
        mask:{dirty:false, tool:'replace', drawing:false},
        compareViewer:null,
        viewportWidth:window.innerWidth,
        settingsNeedsMigration:false,
        workspaces:Object.fromEntries(Object.keys(OPERATION_CONFIG).map(operation => [operation, createWorkspace()])),
        settingsSerialized:'',
        preferenceEchoGuardUntil:0,
    };

    const el = {};
    const byId = id => document.getElementById(id);
    const t = (key, vars={}) => {
        let value = window.StudioI18n?.t?.(key) || key;
        Object.entries(vars).forEach(([name,replacement]) => { value = value.replaceAll(`{${name}}`, String(replacement)); });
        return value;
    };
    const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
    const formatName = value => {
        const clean = String(value || '').trim();
        return clean.length > 36 ? `${clean.slice(0,33)}…` : clean;
    };

    function cacheElements(){
        [
            'ecommercePage','ecommerceWorkspace','controlPanel','controlInputMount','controlActionMount',
            'inputModule','universalDock','universalDockInputs','universalDockActions','generateActions',
            'operationTabs','modeToggle','capabilityStatus','routeSummary','inputSlots','inputProgress',
            'operationControls','maskToggle','maskEditor','advancedSettings','modelPanelToggle','modelPanelBody',
            'modelPanelSelection','providerSelect','modelSelect','ratioSelect','resolutionSelect','qualitySelect','countSelect',
            'addUniversalReference','formError','generateButton','emptyResult','resultWorkspace','compareReset','historyToggle',
            'compareStage','afterClip','compareHandle','beforeImage','afterImage','candidateList','resultMeta',
            'generationOverlay','generationTimer','generationMessage','downloadPreview','qualityReview','exportFinal',
            'saveAsset','taskDrawer','taskList','drawerBackdrop','closeHistory','assetDialog','assetLibrarySelect',
            'assetCategorySelect','assetGrid','assetDialogTitle','assetSaveConfirm','qualityDialog','qualityForm',
            'qualityChecks','qualityNote','cancelQuality','zoomIn','zoomOut','zoomReset','compareFullscreen','toast',
        ].forEach(id => { el[id] = byId(id); });
    }

    function cleanSavedInput(value, role){
        if(!value || typeof value !== 'object') return null;
        return {
            url:String(value.url || ''), name:String(value.name || ''), role:String(value.role || role || ''),
            kind:'image', mime:String(value.mime || ''), width:Number(value.width || 0), height:Number(value.height || 0),
            reference_id:String(value.reference_id || role || ''), reference_type:String(value.reference_type || ''),
            label:String(value.label || ''), instruction:String(value.instruction || ''), order:Number(value.order || 0),
        };
    }

    function loadSettings(serialized=''){
        try {
            const raw = serialized || localStorage.getItem(SETTINGS_KEY) || localStorage.getItem(LEGACY_SETTINGS_KEY) || '{}';
            const saved = JSON.parse(raw);
            const schemaVersion = Number(saved.schema_version || 0);
            state.settingsNeedsMigration = schemaVersion !== SETTINGS_SCHEMA_VERSION;
            if(schemaVersion === SETTINGS_SCHEMA_VERSION && OPERATION_CONFIG[saved.operation]) state.operation = saved.operation;
            else state.operation = DEFAULT_OPERATION;
            state.mode = 'standard';
            if(saved.options && typeof saved.options === 'object') {
                Object.keys(DEFAULT_OPTIONS).forEach(key => {
                    if(saved.options[key] && typeof saved.options[key] === 'object') {
                        state.options[key] = {...state.options[key], ...saved.options[key]};
                    }
                });
            }
            state.providerId = String(saved.provider_id || '');
            state.model = String(saved.model || '');
            state.aspectRatio = ASPECT_RATIOS.includes(saved.aspect_ratio) ? saved.aspect_ratio : 'source';
            state.resolution = RESOLUTIONS.includes(saved.resolution) ? saved.resolution : 'auto';
            state.quality = QUALITIES.includes(saved.quality) ? saved.quality : 'auto';
            state.count = [0,1,2,3,4].includes(Number(saved.count)) ? Number(saved.count) : 0;
            state.modelPanelCollapsed = saved.model_panel_collapsed === true;
            if(saved.workspaces && typeof saved.workspaces === 'object') {
                Object.keys(OPERATION_CONFIG).forEach(operation => {
                    const value = saved.workspaces[operation];
                    if(!value || typeof value !== 'object') return;
                    const workspace = state.workspaces[operation] || createWorkspace();
                    workspace.inputs = Object.fromEntries(Object.entries(value.inputs || {}).map(([role,input]) => [role,cleanSavedInput(input,role)]).filter(([,input]) => input));
                    workspace.taskId = String(value.current_task_id || value.task_id || '');
                    workspace.selectedOutput = Math.max(0, Number(value.selected_output || 0));
                    workspace.compareValue = Math.max(0, Math.min(100, Number(value.compare_value ?? 50)));
                    workspace.zoom = Math.max(1, Math.min(3, Number(value.zoom || 1)));
                    state.workspaces[operation] = workspace;
                });
            }
            state.settingsSerialized = raw;
        } catch(e) {}
    }

    function activeWorkspace(){
        if(!state.workspaces[state.operation]) state.workspaces[state.operation] = createWorkspace();
        return state.workspaces[state.operation];
    }

    function captureWorkspace(){
        const workspace = activeWorkspace();
        workspace.inputs = state.inputs;
        workspace.currentTask = state.currentTask;
        workspace.taskId = String(state.currentTask?.id || state.currentTask?.task_id || workspace.taskId || '');
        workspace.selectedOutput = state.selectedOutput;
        workspace.compareValue = state.compareValue;
        workspace.zoom = state.zoom;
        return workspace;
    }

    function restoreWorkspace(operation=state.operation){
        const workspace = state.workspaces[operation] || createWorkspace();
        state.workspaces[operation] = workspace;
        state.inputs = workspace.inputs || {};
        state.currentTask = workspace.currentTask || null;
        state.selectedOutput = Number(workspace.selectedOutput || 0);
        state.compareValue = Number(workspace.compareValue ?? 50);
        state.zoom = Number(workspace.zoom || 1);
        return workspace;
    }

    function serializableWorkspaces(){
        captureWorkspace();
        return Object.fromEntries(Object.entries(state.workspaces).map(([operation,workspace]) => [operation,{
            inputs:workspace.inputs || {},
            current_task_id:String(workspace.currentTask?.id || workspace.currentTask?.task_id || workspace.taskId || ''),
            selected_output:Number(workspace.selectedOutput || 0),
            compare_value:Number(workspace.compareValue ?? 50),
            zoom:Number(workspace.zoom || 1),
        }]));
    }

    function persistSettings(){
        const snapshot = {
            schema_version:SETTINGS_SCHEMA_VERSION,
            operation:state.operation,
            mode:state.mode,
            options:state.options,
            provider_id:state.providerId,
            model:state.model,
            aspect_ratio:state.aspectRatio,
            resolution:state.resolution,
            quality:state.quality,
            count:state.count,
            model_panel_collapsed:state.modelPanelCollapsed,
            workspaces:serializableWorkspaces(),
        };
        const serialized = JSON.stringify(snapshot);
        state.settingsSerialized = serialized;
        state.preferenceEchoGuardUntil = Math.max(state.preferenceEchoGuardUntil, Date.now() + 1500);
        try { localStorage.setItem(SETTINGS_KEY, serialized); } catch(e) {}
        syncPreferenceSnapshot(serialized);
    }

    function syncPreferenceSnapshot(serialized, attempt=0){
        let runtime = window.RuntimeSync || null;
        if(!runtime) {
            try { runtime = window.top?.RuntimeSync || null; } catch(e) { runtime = null; }
        }
        if(runtime?.setPreference) {
            Promise.resolve(runtime.setPreference('ecommerce_settings', serialized)).catch(() => {
                if(attempt < 5) setTimeout(() => syncPreferenceSnapshot(serialized, attempt + 1), 120);
            });
            return;
        }
        if(attempt < 20) setTimeout(() => syncPreferenceSnapshot(serialized, attempt + 1), 120);
    }

    function isTextEditingElement(node=document.activeElement){
        if(!node) return false;
        const tag = String(node.tagName || '').toUpperCase();
        if(tag === 'TEXTAREA') return true;
        if(tag !== 'INPUT') return false;
        const type = String(node.type || 'text').toLowerCase();
        return ['text','search','url','tel','email','password','number'].includes(type);
    }

    function shouldIgnoreIncomingSettings(){
        return Date.now() < state.preferenceEchoGuardUntil || isTextEditingElement();
    }

    function applyIncomingSettings(serialized){
        if(!serialized || serialized === state.settingsSerialized) return;
        loadSettings(String(serialized));
        restoreWorkspace(state.operation);
        state.settingsNeedsMigration = false;
        updateTabs();
        renderInputs();
        renderOperationControls();
        if(state.currentTask) renderTaskResult(state.currentTask); else hideResult();
    }

    function currentConfig(){ return OPERATION_CONFIG[state.operation]; }
    function currentOptions(){ return state.options[state.operation]; }

    function updateTabs(){
        el.operationTabs?.querySelectorAll('[data-operation]').forEach(button => {
            const active = button.dataset.operation === state.operation;
            button.classList.toggle('active', active);
            button.setAttribute('aria-current', active ? 'page' : 'false');
        });
        el.modeToggle?.querySelectorAll('[data-mode]').forEach(button => {
            button.classList.toggle('active', button.dataset.mode === state.mode);
        });
        const generateLabel = el.generateButton?.querySelector('span');
        if(generateLabel) generateLabel.textContent = t('ecommerce.generate');
        syncUniversalLayout();
        const inputHeading = el.inputModule?.querySelector('.ec-section-head h2');
        if(inputHeading) inputHeading.textContent = t(currentConfig()?.universal ? 'ecommerce.referenceAssets' : 'ecommerce.inputs');
    }

    function syncUniversalLayout(){
        const universal = Boolean(currentConfig()?.universal);
        el.ecommercePage?.classList.toggle('is-universal', universal);
        if(!universal) el.ecommercePage?.classList.remove('has-many-universal-references');
        el.universalDock?.classList.toggle('hidden', !universal);
        if(!universal) el.universalDock?.classList.remove('has-many-references');
        el.universalDock?.setAttribute('aria-hidden', universal ? 'false' : 'true');
        el.addUniversalReference?.classList.toggle('hidden', !universal);
        const inputTarget = universal ? el.universalDockInputs : el.controlInputMount;
        const actionTarget = universal ? el.universalDockActions : el.controlActionMount;
        if(inputTarget && el.inputModule?.parentElement !== inputTarget) inputTarget.appendChild(el.inputModule);
        if(actionTarget && el.generateActions?.parentElement !== actionTarget) actionTarget.appendChild(el.generateActions);
    }

    function renderInputs(){
        const config = currentConfig();
        if(config.universal) {
            renderUniversalInputs();
            return;
        }
        el.inputSlots.innerHTML = config.inputs.map(input => inputSlotHtml(input)).join('');
        const required = config.inputs.filter(item => item.required);
        const completed = required.filter(item => state.inputs[item.role]?.url).length;
        el.inputProgress.textContent = `${completed}/${required.length}`;
        bindInputSlots();
        syncMaskAvailability();
    }

    const UNIVERSAL_FALLBACK_ROLES = [
        ['subject','ecommerce.refSubject'],['upper_garment','ecommerce.refUpper'],['lower_garment','ecommerce.refLower'],
        ['full_garment','ecommerce.refFullGarment'],['shoes','ecommerce.refShoes'],['accessory','ecommerce.refAccessory'],
        ['prop','ecommerce.refProp'],['pose','ecommerce.refPose'],['scene','ecommerce.refScene'],['style','ecommerce.refStyle'],
    ];

    function newUniversalKey(){
        return `ref_${crypto.randomUUID?.().replaceAll('-','').slice(0,12) || Math.random().toString(36).slice(2,14)}`;
    }

    function universalEntries(){
        return Object.entries(state.inputs).filter(([key,item]) => key.startsWith('ref_') && item && typeof item === 'object').sort((a,b) => Number(a[1].order || 0) - Number(b[1].order || 0));
    }

    function createUniversalReference(role, order){
        const key = newUniversalKey();
        state.inputs[key] = {url:'',name:'',role,reference_type:role,reference_id:key,label:'',instruction:'',order};
        return key;
    }

    function ensureUniversalPresets(){
        const entries = universalEntries();
        const existingRoles = new Set(entries.map(([,item]) => item.reference_type || item.role));
        let nextOrder = entries.reduce((max, [,item]) => Math.max(max, Number(item.order || 0)), -1) + 1;
        UNIVERSAL_PRESET_ROLES.forEach(role => {
            if(existingRoles.has(role)) return;
            createUniversalReference(role, nextOrder++);
            existingRoles.add(role);
        });
    }

    function universalReferenceRoles(){
        const configured = state.capabilities?.universal_reference_roles;
        if(Array.isArray(configured) && configured.length) return configured.map(item => ({id:item.id,label:localizedLabel(item)}));
        return UNIVERSAL_FALLBACK_ROLES.map(([id,labelKey]) => ({id,label:t(labelKey)}));
    }

    function universalUploadHtml(key,item,label){
        if(item.url) return `<div class="ec-upload-preview"><img src="${escapeHtml(item.url)}" alt="${escapeHtml(label)}"><div class="ec-upload-info"><b>${escapeHtml(label)}</b><span title="${escapeHtml(item.name || item.url)}">${escapeHtml(formatName(item.name || item.url))}</span><div class="ec-upload-actions"><button type="button" data-action="upload">${escapeHtml(t('ecommerce.replace'))}</button><button type="button" data-action="assets">${escapeHtml(t('ecommerce.fromAssets'))}</button><button type="button" data-action="remove">${escapeHtml(t('ecommerce.remove'))}</button></div></div></div>`;
        return `<div class="ec-upload-empty" data-action="upload" role="button" tabindex="0"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M5 20h14"></path></svg><b>${escapeHtml(label)}</b><small>${escapeHtml(t('ecommerce.dropOrChoose'))}</small><span class="ec-upload-actions"><button type="button" data-action="assets">${escapeHtml(t('ecommerce.fromAssets'))}</button></span></div>`;
    }

    function universalUploadLabel(role, fallback){
        const key = {
            subject:'ecommerce.presetModel',
            full_garment:'ecommerce.presetGarment',
            shoes:'ecommerce.presetShoes',
            accessory:'ecommerce.presetAccessory',
            prop:'ecommerce.presetProp',
            pose:'ecommerce.presetPose',
            scene:'ecommerce.presetScene',
            style:'ecommerce.presetStyle',
        }[role];
        return key ? t(key) : fallback;
    }

    function updateUniversalAddButton(count, limit){
        if(!el.addUniversalReference) return;
        const universal = Boolean(currentConfig()?.universal);
        el.addUniversalReference.classList.toggle('hidden', !universal);
        el.addUniversalReference.disabled = !universal || count >= limit;
        el.addUniversalReference.innerHTML = `<span>＋ ${escapeHtml(t('ecommerce.addReference'))}</span><small>${count}/${limit}</small>`;
    }

    function selectorValue(value){
        return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }

    function matchingEditingControl(control){
        if(control?.isConnected) return control;
        const option = control?.dataset?.option;
        if(option) return el.operationControls?.querySelector(`[data-option="${selectorValue(option)}"]`);
        const referenceField = control?.dataset?.referenceField;
        const referenceKey = control?.dataset?.referenceKey;
        if(referenceField && referenceKey) {
            return el.inputSlots?.querySelector(`[data-reference-field="${selectorValue(referenceField)}"][data-reference-key="${selectorValue(referenceKey)}"]`);
        }
        return null;
    }

    function restoreEditingFocus(control){
        [80, 260].forEach(delay => setTimeout(() => {
            const target = matchingEditingControl(control);
            if(!target || document.activeElement === target) return;
            const active = document.activeElement;
            if(active && active !== document.body && active !== document.documentElement) return;
            try { target.focus({preventScroll:true}); } catch(e) { target.focus(); }
            if(typeof target.setSelectionRange === 'function') {
                const caret = Number(target.value?.length || 0);
                try { target.setSelectionRange(caret, caret); } catch(e) {}
            }
        }, delay));
    }

    function bindComposingInput(control, update){
        let composing = false;
        control.addEventListener('compositionstart', () => { composing = true; });
        control.addEventListener('compositionend', () => { composing = false; update(); restoreEditingFocus(control); });
        control.addEventListener('input', () => { if(!composing) { update(); restoreEditingFocus(control); } });
    }

    function renderUniversalInputs(){
        ensureUniversalPresets();
        const entries = universalEntries();
        const limit = Number(state.capabilities?.universal_reference_limit || 14);
        const roles = universalReferenceRoles();
        const manyReferences = entries.length > 6;
        el.ecommercePage?.classList.toggle('has-many-universal-references', manyReferences);
        el.universalDock?.classList.toggle('has-many-references', manyReferences);
        el.inputSlots.innerHTML = `<div class="ec-universal-guide"><strong>${escapeHtml(t('ecommerce.universalGuideTitle'))}</strong><p>${escapeHtml(t('ecommerce.universalGuideHint'))}</p></div>` + entries.map(([key,item],index) => {
            const selected = item.reference_type || item.role || (index === 0 ? 'subject':'prop');
            const roleLabel = roles.find(role => role.id === selected)?.label || selected;
            const uploadLabel = universalUploadLabel(selected, roleLabel);
            return `<article class="ec-universal-reference" data-reference-key="${escapeHtml(key)}" data-reference-role="${escapeHtml(selected)}">
                <header><span class="ec-drag-handle" draggable="true" data-reference-drag-handle="${escapeHtml(key)}" title="${escapeHtml(t('ecommerce.dragReorder'))}">⋮⋮</span><b>${escapeHtml(t('ecommerce.imageNumber',{count:index + 1}))}</b><select data-reference-type="${escapeHtml(key)}">${roles.map(role => `<option value="${escapeHtml(role.id)}" ${role.id===selected?'selected':''}>${escapeHtml(role.label)}</option>`).join('')}</select><button type="button" data-remove-reference="${escapeHtml(key)}" aria-label="${escapeHtml(t('ecommerce.remove'))}">×</button></header>
                <div class="ec-upload-slot ${selected==='subject'?'required':''}" data-role="${escapeHtml(key)}">${universalUploadHtml(key,item,uploadLabel)}</div>
                <div class="ec-reference-fields"><label><span>${escapeHtml(t('ecommerce.referenceLabel'))}</span><input data-reference-field="label" data-reference-key="${escapeHtml(key)}" maxlength="160" value="${escapeHtml(item.label || '')}" placeholder="${escapeHtml(t('ecommerce.referenceLabelHint'))}"></label><label><span>${escapeHtml(t('ecommerce.referenceInstruction'))}</span><input data-reference-field="instruction" data-reference-key="${escapeHtml(key)}" maxlength="300" value="${escapeHtml(item.instruction || '')}" placeholder="${escapeHtml(t('ecommerce.referenceInstructionHint'))}"></label></div>
            </article>`;
        }).join('');
        el.inputProgress.textContent = `${entries.filter(([,item]) => item.url).length}/${limit}`;
        updateUniversalAddButton(entries.length, limit);
        bindInputSlots();
        bindUniversalControls(limit);
        syncMaskAvailability();
        if(state.capabilities) {
            populateModelSelectors();
            updateRouteSummary();
        }
    }

    function bindUniversalControls(limit){
        el.inputSlots.querySelectorAll('[data-reference-type]').forEach(select => select.addEventListener('change', () => {
            const item = state.inputs[select.dataset.referenceType];
            if(item){ item.reference_type=select.value; item.role=select.value; renderUniversalInputs(); persistSettings(); validateForm(false); }
        }));
        el.inputSlots.querySelectorAll('[data-reference-field]').forEach(input => bindComposingInput(input, () => {
            const item=state.inputs[input.dataset.referenceKey]; if(item){ item[input.dataset.referenceField]=input.value; persistSettings(); validateForm(false); }
        }));
        el.inputSlots.querySelectorAll('[data-remove-reference]').forEach(button => button.addEventListener('click', () => {
            delete state.inputs[button.dataset.removeReference]; ensureUniversalPresets(); renderUniversalInputs(); persistSettings(); validateForm(false);
        }));
        if(el.addUniversalReference) el.addUniversalReference.onclick = () => {
            const entries=universalEntries(); if(entries.length>=limit) return;
            createUniversalReference('prop', entries.length); renderUniversalInputs(); persistSettings();
        };
        let dragged='';
        el.inputSlots.querySelectorAll('[data-reference-key]').forEach(card => {
            const handle = card.querySelector('[data-reference-drag-handle]');
            handle?.addEventListener('dragstart',event=>{dragged=card.dataset.referenceKey;card.classList.add('dragging');event.dataTransfer.effectAllowed='move';});
            handle?.addEventListener('dragend',()=>{dragged='';card.classList.remove('dragging');});
            card.addEventListener('dragover',event=>{event.preventDefault();card.classList.add('drag-target');});
            card.addEventListener('dragleave',()=>card.classList.remove('drag-target'));
            card.addEventListener('drop',event=>{event.preventDefault();card.classList.remove('drag-target');const target=card.dataset.referenceKey;if(!dragged||dragged===target)return;const keys=universalEntries().map(([key])=>key);const from=keys.indexOf(dragged),to=keys.indexOf(target);keys.splice(to,0,keys.splice(from,1)[0]);keys.forEach((key,index)=>state.inputs[key].order=index);renderUniversalInputs();persistSettings();});
        });
    }

    function inputSlotHtml(input){
        const asset = state.inputs[input.role];
        const requiredClass = input.required ? 'required' : '';
        if(asset?.url) {
            return `<article class="ec-upload-slot ${requiredClass}" data-role="${escapeHtml(input.role)}">
                <div class="ec-upload-preview">
                    <img src="${escapeHtml(asset.url)}" alt="${escapeHtml(t(input.labelKey))}">
                    <div class="ec-upload-info">
                        <b>${escapeHtml(t(input.labelKey))}</b>
                        <span title="${escapeHtml(asset.name || asset.url)}">${escapeHtml(formatName(asset.name || asset.url))}</span>
                        <div class="ec-upload-actions">
                            <button type="button" data-action="upload">${escapeHtml(t('ecommerce.replace'))}</button>
                            <button type="button" data-action="assets">${escapeHtml(t('ecommerce.fromAssets'))}</button>
                            <button type="button" data-action="remove">${escapeHtml(t('ecommerce.remove'))}</button>
                        </div>
                    </div>
                </div>
            </article>`;
        }
        return `<article class="ec-upload-slot ${requiredClass}" data-role="${escapeHtml(input.role)}">
            <div class="ec-upload-empty" data-action="upload" role="button" tabindex="0">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M5 20h14"></path></svg>
                <b>${escapeHtml(t(input.labelKey))}</b>
                <small>${escapeHtml(t('ecommerce.dropOrChoose'))}</small>
                <span class="ec-upload-actions"><button type="button" data-action="assets">${escapeHtml(t('ecommerce.fromAssets'))}</button></span>
            </div>
        </article>`;
    }

    function bindInputSlots(){
        el.inputSlots.querySelectorAll('.ec-upload-slot').forEach(slot => {
            const role = slot.dataset.role;
            slot.querySelectorAll('[data-action]').forEach(button => {
                button.addEventListener('click', event => {
                    event.preventDefault();
                    event.stopPropagation();
                    const action = button.dataset.action;
                    if(action === 'remove') removeInput(role);
                    if(action === 'upload') openFilePicker(role);
                    if(action === 'assets') openAssetPicker(role);
                });
            });
            const empty = slot.querySelector('.ec-upload-empty');
            empty?.addEventListener('keydown', event => {
                if(event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openFilePicker(role);
                }
            });
            slot.addEventListener('dragover', event => { event.preventDefault(); slot.classList.add('dragover'); });
            slot.addEventListener('dragleave', () => slot.classList.remove('dragover'));
            slot.addEventListener('drop', event => {
                event.preventDefault();
                slot.classList.remove('dragover');
                const file = Array.from(event.dataTransfer?.files || []).find(item => item.type.startsWith('image/'));
                if(file) handleSelectedFile(file, role);
            });
        });
    }

    function renderOperationControls(){
        const options = currentOptions();
        let html = '';
        if(state.operation === 'try_on') {
            html = `<label class="ec-field"><span>${escapeHtml(t('ecommerce.garmentCategory'))}</span>
                <select data-option="garment_category">
                    ${optionHtml('auto','ecommerce.categoryAuto',options.garment_category)}
                    ${optionHtml('upper','ecommerce.upperBody',options.garment_category)}
                    ${optionHtml('lower','ecommerce.lowerBody',options.garment_category)}
                    ${optionHtml('dress','ecommerce.dress',options.garment_category)}
                </select></label>${instructionHtml(options.instruction)}`;
        } else if(state.operation === 'pose_transfer') {
            html = `<div class="ec-field"><span>${escapeHtml(t('ecommerce.poseSource'))}</span><div class="ec-chip-grid">
                <button type="button" data-option-button="pose_source" data-value="reference" class="${options.pose_source === 'reference' ? 'active':''}">${escapeHtml(t('ecommerce.uploadPose'))}</button>
                <button type="button" data-option-button="pose_source" data-value="preset" class="${options.pose_source === 'preset' ? 'active':''}">${escapeHtml(t('ecommerce.posePreset'))}</button>
            </div></div><div class="ec-field"><span>${escapeHtml(t('ecommerce.posePreset'))}</span><div id="posePresetGrid" class="ec-chip-grid">${presetButtons('pose_presets', options.pose_preset)}</div></div>${instructionHtml(options.instruction)}`;
        } else if(state.operation === 'prop_replace') {
            html = `<label class="ec-field"><span>${escapeHtml(t('ecommerce.targetDescription'))}</span><input data-option="target_description" maxlength="240" value="${escapeHtml(options.target_description)}" placeholder="${escapeHtml(t('ecommerce.targetDescriptionHint'))}"></label>${instructionHtml(options.instruction)}`;
        } else if(state.operation === 'angle_change') {
            html = `<div class="ec-field"><span>${escapeHtml(t('ecommerce.viewPreset'))}</span><div class="ec-chip-grid">
                <button type="button" data-angle-preset="0,0">${escapeHtml(t('ecommerce.frontView'))}</button>
                <button type="button" data-angle-preset="-45,0">${escapeHtml(t('ecommerce.leftThreeQuarter'))}</button>
                <button type="button" data-angle-preset="45,0">${escapeHtml(t('ecommerce.rightThreeQuarter'))}</button>
                <button type="button" data-angle-preset="90,0">${escapeHtml(t('ecommerce.sideView'))}</button>
                <button type="button" data-angle-preset="0,20">${escapeHtml(t('ecommerce.topView'))}</button>
            </div></div><div class="ec-field"><span>${escapeHtml(t('ecommerce.azimuth'))}</span><div class="ec-range-row"><input data-option="azimuth" type="range" min="-180" max="180" step="15" value="${Number(options.azimuth)}"><span class="ec-range-value" data-value-for="azimuth">${Number(options.azimuth)}°</span></div></div>
                <div class="ec-field"><span>${escapeHtml(t('ecommerce.elevation'))}</span><div class="ec-range-row"><input data-option="elevation" type="range" min="-30" max="30" step="10" value="${Number(options.elevation)}"><span class="ec-range-value" data-value-for="elevation">${Number(options.elevation)}°</span></div></div>
                <label class="ec-field"><span>${escapeHtml(t('ecommerce.distance'))}</span><select data-option="distance">${optionHtml('close','ecommerce.close',options.distance)}${optionHtml('medium','ecommerce.medium',options.distance)}${optionHtml('wide','ecommerce.wide',options.distance)}</select></label>${instructionHtml(options.instruction)}`;
        } else if(state.operation === 'background_change') {
            html = `<div class="ec-field"><span>${escapeHtml(t('ecommerce.backgroundMode'))}</span><div class="ec-chip-grid">
                <button type="button" data-option-button="background_mode" data-value="preset" class="${options.background_mode === 'preset' ? 'active':''}">${escapeHtml(t('ecommerce.backgroundPreset'))}</button>
                <button type="button" data-option-button="background_mode" data-value="prompt" class="${options.background_mode === 'prompt' ? 'active':''}">${escapeHtml(t('ecommerce.backgroundPrompt'))}</button>
                <button type="button" data-option-button="background_mode" data-value="reference" class="${options.background_mode === 'reference' ? 'active':''}">${escapeHtml(t('ecommerce.backgroundReference'))}</button>
            </div></div><div class="ec-field"><span>${escapeHtml(t('ecommerce.backgroundPreset'))}</span><div id="backgroundPresetGrid" class="ec-chip-grid">${presetButtons('background_presets', options.background_preset)}</div></div>
            <label class="ec-field"><span>${escapeHtml(t('ecommerce.backgroundPrompt'))}</span><textarea data-option="background_prompt" maxlength="1000" placeholder="${escapeHtml(t('ecommerce.backgroundPromptHint'))}">${escapeHtml(options.background_prompt)}</textarea></label>${instructionHtml(options.instruction)}`;
        } else if(state.operation === 'universal') {
            html = `<div class="ec-universal-prompt-help"><b>${escapeHtml(t('ecommerce.compositionTitle'))}</b><p>${escapeHtml(t('ecommerce.compositionHint'))}</p><code>${escapeHtml(t('ecommerce.compositionExample'))}</code></div><label class="ec-field"><span>${escapeHtml(t('ecommerce.finalInstruction'))}</span><textarea class="ec-universal-instruction" data-option="instruction" maxlength="2000" placeholder="${escapeHtml(t('ecommerce.finalInstructionHint'))}">${escapeHtml(options.instruction || '')}</textarea></label>`;
        }
        el.operationControls.innerHTML = html;
        bindOperationControls();
    }

    function optionHtml(value, labelKey, selected){
        return `<option value="${escapeHtml(value)}" ${value === selected ? 'selected':''}>${escapeHtml(t(labelKey))}</option>`;
    }
    function instructionHtml(value){
        return `<label class="ec-field"><span>${escapeHtml(t('ecommerce.extraInstruction'))}</span><textarea data-option="instruction" maxlength="1000" placeholder="${escapeHtml(t('ecommerce.extraInstructionHint'))}">${escapeHtml(value || '')}</textarea></label>`;
    }
    function presetButtons(kind, selected){
        const items = state.capabilities?.[kind] || [];
        if(!items.length) return '<span class="ec-task-empty">—</span>';
        return items.map(item => `<button type="button" data-preset-kind="${escapeHtml(kind)}" data-value="${escapeHtml(item.id)}" class="${item.id === selected ? 'active':''}">${escapeHtml(localizedLabel(item))}</button>`).join('');
    }
    function localizedLabel(item){
        const lang = window.StudioI18n?.lang?.() || 'zh';
        return item?.label?.[lang] || item?.label_zh || item?.label_en || item?.name || item?.id || '';
    }

    function bindOperationControls(){
        el.operationControls.querySelectorAll('[data-option]').forEach(input => {
            const update = () => {
                const key = input.dataset.option;
                currentOptions()[key] = input.type === 'range' ? Number(input.value) : input.value;
                const target = el.operationControls.querySelector(`[data-value-for="${key}"]`);
                if(target) target.textContent = `${input.value}°`;
                persistSettings();
                validateForm(false);
            };
            if(input.tagName === 'SELECT') input.addEventListener('change', update);
            else if(input.type === 'range') input.addEventListener('input', update);
            else bindComposingInput(input, update);
        });
        el.operationControls.querySelectorAll('[data-option-button]').forEach(button => {
            button.addEventListener('click', () => {
                currentOptions()[button.dataset.optionButton] = button.dataset.value;
                persistSettings();
                renderOperationControls();
                renderInputs();
                validateForm(false);
            });
        });
        el.operationControls.querySelectorAll('[data-preset-kind]').forEach(button => {
            button.addEventListener('click', () => {
                if(button.dataset.presetKind === 'pose_presets') currentOptions().pose_preset = button.dataset.value;
                if(button.dataset.presetKind === 'background_presets') currentOptions().background_preset = button.dataset.value;
                persistSettings();
                renderOperationControls();
            });
        });
        el.operationControls.querySelectorAll('[data-angle-preset]').forEach(button => {
            button.addEventListener('click', () => {
                const [azimuth,elevation] = button.dataset.anglePreset.split(',').map(Number);
                currentOptions().azimuth = azimuth;
                currentOptions().elevation = elevation;
                persistSettings();
                renderOperationControls();
            });
        });
    }

    function switchOperation(operation){
        if(!OPERATION_CONFIG[operation] || operation === state.operation) return;
        captureWorkspace();
        state.operation = operation;
        const workspace = restoreWorkspace(operation);
        resetMask();
        updateTabs();
        renderInputs();
        renderOperationControls();
        if(state.currentTask) renderTaskResult(state.currentTask);
        else {
            hideResult();
            if(workspace.taskId) loadTask(workspace.taskId, false);
        }
        updateRouteSummary();
        persistSettings();
        clearFormError();
    }

    function switchMode(mode){
        state.mode = 'standard';
        updateTabs();
        populateModelSelectors();
        updateRouteSummary();
        persistSettings();
    }

    function removeInput(role){
        delete state.inputs[role];
        if(role === 'source') resetMask();
        renderInputs();
        validateForm(false);
        persistSettings();
    }

    function openFilePicker(role){
        state.activeUploadRole = role;
        byId('fileInput')?.click();
    }

    function openAssetPicker(role){
        state.activeUploadRole = role;
        window.EcommerceStudio?.openAssetPicker?.(role);
    }

    async function handleSelectedFile(file, role){
        if(!file || !role) return;
        window.EcommerceStudio?.uploadInput?.(file, role);
    }

    async function fetchJson(url, options={}){
        const response = await fetch(url, options);
        let body = null;
        try { body = await response.json(); } catch(error) {}
        if(!response.ok) {
            const message = body?.detail || body?.message || `HTTP ${response.status}`;
            throw new Error(Array.isArray(message) ? message.map(item => item.msg || item).join('; ') : String(message));
        }
        return body || {};
    }

    function showToast(message, isError=false){
        if(!el.toast) return;
        el.toast.textContent = String(message || '');
        el.toast.classList.toggle('error', !!isError);
        el.toast.classList.add('show');
        clearTimeout(showToast.timer);
        showToast.timer = setTimeout(() => el.toast.classList.remove('show'), 2600);
    }

    function imageDimensions(url){
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve({width:image.naturalWidth, height:image.naturalHeight});
            image.onerror = () => reject(new Error(t('ecommerce.invalidImage')));
            image.src = url;
        });
    }

    async function uploadInput(file, role){
        const allowedTypes = new Set(['image/png','image/jpeg','image/webp']);
        const allowedExt = /\.(png|jpe?g|webp)$/i;
        if(!allowedTypes.has(String(file.type || '').toLowerCase()) || !allowedExt.test(file.name || '')) {
            showFormError(t('ecommerce.invalidImage'));
            return;
        }
        if(file.size > 50 * 1024 * 1024) {
            showFormError(t('ecommerce.fileTooLarge'));
            return;
        }
        clearFormError();
        el.generateButton.disabled = true;
        const originalLabel = el.generateButton.querySelector('span')?.textContent || '';
        const label = el.generateButton.querySelector('span');
        if(label) label.textContent = t('ecommerce.uploading');
        try {
            const previewUrl = URL.createObjectURL(file);
            try { await imageDimensions(previewUrl); } finally { URL.revokeObjectURL(previewUrl); }
            const formData = new FormData();
            formData.append('files', file, file.name);
            const result = await fetchJson('/api/ai/upload', {method:'POST', body:formData});
            const uploaded = (result.files || [])[0];
            if(!uploaded?.url || uploaded.kind !== 'image') throw new Error(t('ecommerce.uploadFailed'));
            const dimensions = await imageDimensions(uploaded.url);
            const existing = state.inputs[role] || {};
            state.inputs[role] = {...existing, ...uploaded, role:existing.reference_type || role, reference_id:existing.reference_id || role, ...dimensions};
            if(role === 'source') resetMask();
            renderInputs();
            validateForm(false);
            persistSettings();
        } catch(error) {
            showFormError(`${t('ecommerce.uploadFailed')}：${error.message}`);
        } finally {
            el.generateButton.disabled = false;
            if(label) label.textContent = originalLabel;
            updateTabs();
        }
    }

    function assetLibraries(){
        const data = state.assetLibrary || {};
        return Array.isArray(data.libraries) && data.libraries.length ? data.libraries : [data].filter(item => item.id);
    }

    function selectedAssetLibrary(){
        const libraries = assetLibraries();
        return libraries.find(item => item.id === el.assetLibrarySelect.value) || libraries[0] || null;
    }

    function selectedAssetCategory(){
        const library = selectedAssetLibrary();
        return (library?.categories || []).find(item => item.id === el.assetCategorySelect.value) || null;
    }

    function renderAssetLibrarySelectors(){
        const libraries = assetLibraries();
        const currentLibraryId = el.assetLibrarySelect.value || state.assetLibrary?.active_library_id || libraries[0]?.id || '';
        el.assetLibrarySelect.innerHTML = libraries.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name || item.id)}</option>`).join('');
        el.assetLibrarySelect.value = libraries.some(item => item.id === currentLibraryId) ? currentLibraryId : (libraries[0]?.id || '');
        const categories = (selectedAssetLibrary()?.categories || []).filter(item => item.type === 'image');
        const currentCategoryId = el.assetCategorySelect.value;
        el.assetCategorySelect.innerHTML = categories.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name || item.id)}</option>`).join('');
        el.assetCategorySelect.value = categories.some(item => item.id === currentCategoryId) ? currentCategoryId : (categories[0]?.id || '');
        renderAssetGrid();
    }

    function renderAssetGrid(){
        const category = selectedAssetCategory();
        if(state.assetDialogMode === 'save') {
            el.assetGrid.innerHTML = `<div class="ec-task-empty">${escapeHtml(t('ecommerce.destinationHint',{name:category?.name || '—'}))}</div>`;
            return;
        }
        const items = (category?.items || []).filter(item => item.kind === 'image' && item.url);
        if(!items.length) {
            el.assetGrid.innerHTML = `<div class="ec-task-empty">${escapeHtml(t('ecommerce.noAssets'))}</div>`;
            return;
        }
        el.assetGrid.innerHTML = items.map((item,index) => `<button type="button" class="ec-asset-item" data-asset-index="${index}">
            <img src="${escapeHtml(item.thumbnail_url || item.preview_url || item.url)}" alt="${escapeHtml(item.name || '')}" loading="lazy">
            <span>${escapeHtml(item.name || item.url)}</span>
        </button>`).join('');
        el.assetGrid.querySelectorAll('[data-asset-index]').forEach(button => {
            button.addEventListener('click', async () => {
                const item = items[Number(button.dataset.assetIndex)];
                if(!item) return;
                try {
                    const dimensions = await imageDimensions(item.url);
                    const existing = state.inputs[state.activeUploadRole] || {};
                    state.inputs[state.activeUploadRole] = {
                        ...existing,
                        url:item.url,
                        name:item.name || item.url.split('/').pop(),
                        kind:'image',
                        mime:item.mime || '',
                        role:existing.reference_type || state.activeUploadRole,
                        reference_id:existing.reference_id || state.activeUploadRole,
                        ...dimensions,
                    };
                    if(state.activeUploadRole === 'source') resetMask();
                    el.assetDialog.close();
                    renderInputs();
                    validateForm(false);
                    persistSettings();
                } catch(error) {
                    showToast(error.message, true);
                }
            });
        });
    }

    async function openAssetPickerForRole(role){
        state.activeUploadRole = role;
        state.assetDialogMode = 'select';
        el.assetDialogTitle.textContent = t('ecommerce.chooseAsset');
        el.assetSaveConfirm.classList.add('hidden');
        try {
            const response = await fetchJson('/api/asset-library');
            state.assetLibrary = response.library || {};
            renderAssetLibrarySelectors();
            el.assetDialog.showModal();
        } catch(error) {
            showToast(`${t('ecommerce.taskLoadFailed')}：${error.message}`, true);
        }
    }

    async function openAssetSaveDialog(){
        if(el.saveAsset.disabled) return;
        state.assetDialogMode = 'save';
        el.assetDialogTitle.textContent = t('ecommerce.chooseDestination');
        el.assetSaveConfirm.classList.remove('hidden');
        try {
            const response = await fetchJson('/api/asset-library');
            state.assetLibrary = response.library || {};
            renderAssetLibrarySelectors();
            el.assetDialog.showModal();
        } catch(error) {
            showToast(error.message, true);
        }
    }

    function syncMaskAvailability(){
        const enabled = !!currentConfig().mask && !!state.inputs.source?.url;
        el.maskToggle.classList.toggle('hidden', !enabled);
        if(!enabled) el.maskEditor.classList.add('hidden');
    }

    function resetMask(){
        state.mask.dirty = false;
        delete state.inputs.mask;
        const canvas = byId('maskCanvas');
        canvas?.getContext('2d')?.clearRect(0,0,canvas.width,canvas.height);
        el.maskEditor?.classList.add('hidden');
    }

    async function initializeMaskCanvas(){
        const source = state.inputs.source;
        if(!source?.url) return;
        const dimensions = source.width && source.height ? source : await imageDimensions(source.url);
        source.width = dimensions.width;
        source.height = dimensions.height;
        const canvas = byId('maskCanvas');
        const baseImage = byId('maskBaseImage');
        const wrap = byId('maskCanvasWrap');
        if(canvas.dataset.source !== source.url || canvas.width !== source.width || canvas.height !== source.height) {
            canvas.width = source.width;
            canvas.height = source.height;
            canvas.dataset.source = source.url;
            canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
            state.mask.dirty = false;
        }
        baseImage.src = source.url;
        wrap.style.aspectRatio = `${source.width} / ${source.height}`;
        wrap.style.minHeight = '0';
    }

    function bindMaskEditor(){
        const canvas = byId('maskCanvas');
        const brush = byId('maskBrushSize');
        let lastPoint = null;
        const pointFromEvent = event => {
            const rect = canvas.getBoundingClientRect();
            return {
                x:(event.clientX - rect.left) * canvas.width / Math.max(1, rect.width),
                y:(event.clientY - rect.top) * canvas.height / Math.max(1, rect.height),
            };
        };
        const draw = (from, to) => {
            const ctx = canvas.getContext('2d');
            const rect = canvas.getBoundingClientRect();
            const displayScale = canvas.width / Math.max(1, rect.width);
            ctx.save();
            ctx.strokeStyle = state.mask.tool === 'keep' ? '#00c853' : '#ff1744';
            ctx.fillStyle = ctx.strokeStyle;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = Number(brush.value || 36) * displayScale;
            if(from) {
                ctx.beginPath();
                ctx.moveTo(from.x, from.y);
                ctx.lineTo(to.x, to.y);
                ctx.stroke();
            } else {
                ctx.beginPath();
                ctx.arc(to.x, to.y, ctx.lineWidth / 2, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
            state.mask.dirty = true;
            delete state.inputs.mask;
        };
        canvas.addEventListener('pointerdown', event => {
            if(!canvas.width) return;
            event.preventDefault();
            canvas.setPointerCapture(event.pointerId);
            state.mask.drawing = true;
            lastPoint = pointFromEvent(event);
            draw(null, lastPoint);
        });
        canvas.addEventListener('pointermove', event => {
            if(!state.mask.drawing) return;
            const point = pointFromEvent(event);
            draw(lastPoint, point);
            lastPoint = point;
        });
        const end = () => { state.mask.drawing = false; lastPoint = null; };
        canvas.addEventListener('pointerup', end);
        canvas.addEventListener('pointercancel', end);
        el.maskToggle.addEventListener('click', async () => {
            const opening = el.maskEditor.classList.contains('hidden');
            el.maskEditor.classList.toggle('hidden', !opening);
            if(opening) {
                try { await initializeMaskCanvas(); } catch(error) { showToast(error.message, true); }
            }
        });
        el.maskEditor.querySelectorAll('[data-mask-tool]').forEach(button => {
            button.addEventListener('click', () => {
                state.mask.tool = button.dataset.maskTool;
                el.maskEditor.querySelectorAll('[data-mask-tool]').forEach(item => item.classList.toggle('active', item === button));
            });
        });
        byId('maskReset').addEventListener('click', () => {
            canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
            state.mask.dirty = false;
            delete state.inputs.mask;
        });
    }

    async function uploadMaskIfNeeded(){
        if(!currentConfig().mask || !state.mask.dirty) return;
        if(state.maskUploadPromise) return state.maskUploadPromise;
        state.maskUploadPromise = (async () => {
            const canvas = byId('maskCanvas');
            if(!canvas.width || !canvas.height) return;
            const output = document.createElement('canvas');
            output.width = canvas.width;
            output.height = canvas.height;
            const ctx = output.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0,0,output.width,output.height);
            ctx.drawImage(canvas,0,0);
            const blob = await new Promise((resolve,reject) => output.toBlob(value => value ? resolve(value) : reject(new Error(t('ecommerce.uploadFailed'))), 'image/png'));
            if(blob.size > 50 * 1024 * 1024) throw new Error(t('ecommerce.fileTooLarge'));
            const formData = new FormData();
            formData.append('files', blob, 'ecommerce_region_mask.png');
            const response = await fetchJson('/api/ai/upload', {method:'POST', body:formData});
            const uploaded = (response.files || [])[0];
            if(!uploaded?.url) throw new Error(t('ecommerce.uploadFailed'));
            state.inputs.mask = {...uploaded, role:'mask', width:canvas.width, height:canvas.height};
            state.mask.dirty = false;
        })();
        try {
            return await state.maskUploadPromise;
        } finally {
            state.maskUploadPromise = null;
        }
    }

    function validateForm(show=true){
        const config = currentConfig();
        if(config.universal) {
            const references = universalEntries().map(([,item]) => item).filter(item => item.url);
            if(!references.some(item => item.reference_type === 'subject')) {
                if(show) showFormError(t('ecommerce.universalSubjectRequired'));
                return false;
            }
            if(!compatibleModels().length) {
                if(show) showFormError(t('ecommerce.noCompatibleModel'));
                return false;
            }
            clearFormError();
            return true;
        }
        const missing = config.inputs.filter(item => {
            if(!item.required) return false;
            if(state.operation === 'pose_transfer' && item.role === 'pose' && currentOptions().pose_source === 'preset') return false;
            return !state.inputs[item.role]?.url;
        });
        if(state.operation === 'pose_transfer' && currentOptions().pose_source === 'reference' && !state.inputs.pose?.url) missing.push({role:'pose'});
        if(state.operation === 'background_change' && currentOptions().background_mode === 'reference' && !state.inputs.background?.url) missing.push({role:'background'});
        if(missing.length) {
            if(show) showFormError(t('ecommerce.inputRequired'));
            return false;
        }
        if(!state.capabilities?.models?.length) {
            if(show) showFormError(t('ecommerce.noCompatibleModel'));
            return false;
        }
        clearFormError();
        return true;
    }

    function showFormError(message){ el.formError.textContent = message; el.formError.classList.remove('hidden'); }
    function clearFormError(){ el.formError.textContent = ''; el.formError.classList.add('hidden'); }
    function hideResult(){ el.emptyResult.classList.remove('hidden'); el.resultWorkspace.classList.add('hidden'); }

    function taskInputsForRequest(){
        if(currentConfig().universal) {
            return universalEntries().map(([,item]) => item).filter(item => item.url).map(item => ({
                url:item.url,name:item.name || '',role:item.reference_type,reference_id:item.reference_id,
                reference_type:item.reference_type,label:item.label || '',instruction:item.instruction || '',kind:'image',mime:item.mime || '',
            }));
        }
        return Object.values(state.inputs).filter(item => {
            if(!item?.url) return false;
            if(item.role === 'pose' && currentOptions().pose_source !== 'reference') return false;
            if(item.role === 'background' && currentOptions().background_mode !== 'reference') return false;
            return true;
        }).map(item => ({url:item.url, name:item.name || '', role:item.role, kind:'image', mime:item.mime || ''}));
    }

    function ecommerceTaskPayload(parentTaskId=''){
        return {
            operation:state.operation,
            mode:'standard',
            inputs:taskInputsForRequest(),
            options:{...currentOptions()},
            provider_id:state.providerId,
            model:state.model,
            aspect_ratio:state.aspectRatio,
            resolution:state.resolution,
            quality:state.quality,
            count:state.count,
            parent_task_id:parentTaskId || '',
        };
    }

    function sourceUrlForTask(task){
        const inputs = task?.inputs || task?.request?.inputs || [];
        return inputs.find(item => item.role === 'source' || item.reference_type === 'subject' || item.role === 'subject')?.url || state.inputs.source?.url || universalEntries().find(([,item]) => item.reference_type === 'subject')?.[1]?.url || '';
    }

    function setCompareValue(value){
        state.compareValue = Math.max(0, Math.min(100, Number(value) || 0));
        activeWorkspace().compareValue = state.compareValue;
        if(state.compareViewer) state.compareViewer.setDivider(state.compareValue, true);
        else {
            el.afterClip.style.width = `${state.compareValue}%`;
            el.compareHandle.style.left = `${state.compareValue}%`;
            el.compareHandle.setAttribute('aria-valuenow', String(Math.round(state.compareValue)));
        }
    }

    function setZoom(value){
        state.zoom = Math.max(1, Math.min(8, Math.round(Number(value) * 100) / 100));
        activeWorkspace().zoom = state.zoom;
        if(state.compareViewer) state.compareViewer.setZoom(state.zoom, true);
        else {
            el.compareStage.style.setProperty('--ec-zoom', String(state.zoom));
            el.zoomReset.textContent = `${state.zoom.toFixed(state.zoom % 1 ? 1 : 0)}×`;
        }
    }

    function syncCompareGeometry(){
        if(!el.compareStage) return;
        el.compareStage.style.setProperty('--compare-stage-width', `${el.compareStage.clientWidth}px`);
        state.compareViewer?.refresh();
    }

    function setGenerationVisible(visible, message=''){
        el.generationOverlay.classList.toggle('hidden', !visible);
        el.generationMessage.textContent = message || '';
        clearInterval(state.generationTimer);
        state.generationTimer = null;
        if(!visible) return;
        const started = Number(state.currentTask?.created_at || Date.now() / 1000);
        const update = () => {
            const elapsed = Math.max(0, Math.floor(Date.now() / 1000 - started));
            const minutes = String(Math.floor(elapsed / 60)).padStart(2,'0');
            const seconds = String(elapsed % 60).padStart(2,'0');
            el.generationTimer.textContent = `${minutes}:${seconds}`;
        };
        update();
        state.generationTimer = setInterval(update, 1000);
    }

    function taskIdOf(task){
        return String(task?.id || task?.task_id || '');
    }

    function isTaskActive(task){
        return ['queued','running'].includes(String(task?.status || ''));
    }

    function storeTask(task){
        const id = taskIdOf(task);
        if(!id) return null;
        const previous = state.tasksById.get(id) || {};
        const normalized = {...previous, ...task, id, task_id:id};
        state.tasksById.set(id, normalized);
        if(isTaskActive(normalized)) state.activeTaskIds.add(id);
        else state.activeTaskIds.delete(id);
        const existingIndex = state.tasks.findIndex(item => taskIdOf(item) === id);
        if(existingIndex >= 0) state.tasks[existingIndex] = normalized;
        else state.tasks.push(normalized);
        state.tasks.sort((a,b) => Number(b.created_at || 0) - Number(a.created_at || 0));
        Object.values(state.workspaces).forEach(workspace => {
            if(taskIdOf(workspace.currentTask) === id || workspace.taskId === id) {
                workspace.currentTask = normalized;
            }
        });
        return normalized;
    }

    function renderTaskResult(task){
        task = storeTask(task) || task;
        state.currentTask = task;
        const workspace = activeWorkspace();
        workspace.currentTask = task;
        workspace.taskId = taskIdOf(task);
        const sourceUrl = sourceUrlForTask(task);
        const images = task?.result?.images || [];
        el.emptyResult.classList.add('hidden');
        el.resultWorkspace.classList.remove('hidden');
        if(sourceUrl) el.beforeImage.src = sourceUrl;
        const active = ['queued','running'].includes(task?.status);
        if(active) {
            el.afterImage.src = images[0] || sourceUrl;
            renderResultMeta(task);
            setGenerationVisible(true, t(task.status === 'queued' ? 'ecommerce.queued' : 'ecommerce.running'));
        } else {
            setGenerationVisible(false);
            if(images.length) {
                if(state.selectedOutput >= images.length) state.selectedOutput = 0;
                el.afterImage.src = images[state.selectedOutput];
                renderResultMeta(task);
            } else {
                el.afterImage.src = sourceUrl;
                renderResultMeta(task);
            }
            if(['failed','interrupted'].includes(task?.status)) {
                showFormError(`${t(`ecommerce.${task.status}`)}：${task.error || t('ecommerce.taskFailed')}`);
            }
        }
        setCompareValue(state.compareValue);
        setZoom(state.zoom);
        requestAnimationFrame(syncCompareGeometry);
        renderCandidateRail();
        renderApprovalState();
        sessionStorage.setItem('ecommerce_current_task', taskIdOf(task));
    }

    function candidateRailItems(){
        const tasks = state.tasks.filter(task => task.operation === state.operation).slice(0,100);
        return tasks.flatMap(task => {
            const id = taskIdOf(task);
            const images = task?.result?.images || [];
            if(images.length) return images.map((url,index) => ({id,index,url,status:task.status,task}));
            return [{id,index:-1,url:'',status:task.status || 'queued',task}];
        }).slice(0,160);
    }

    function renderCandidateRail(){
        const items = candidateRailItems();
        el.candidateList.innerHTML = items.map(item => {
            const selected = item.id === taskIdOf(state.currentTask) && (item.index < 0 || item.index === state.selectedOutput);
            const status = String(item.status || 'queued');
            const content = item.url
                ? `<img src="${escapeHtml(item.url)}" alt=""><span>${item.index + 1}</span>`
                : `<span class="ec-candidate-state"><i></i><b>${escapeHtml(t(`ecommerce.${status}`))}</b></span>`;
            return `<button type="button" class="ec-candidate ${selected ? 'active':''} ${item.url ? '' : `status-${escapeHtml(status)}`}" data-task-candidate="${escapeHtml(item.id)}" data-candidate-index="${item.index}" aria-label="${escapeHtml(item.url ? t('ecommerce.imagesCount',{count:item.index + 1}) : t(`ecommerce.${status}`))}">${content}</button>`;
        }).join('');
        el.candidateList.querySelectorAll('[data-task-candidate]').forEach(button => {
            button.addEventListener('click', () => {
                const task = state.tasksById.get(String(button.dataset.taskCandidate || ''));
                if(!task) return;
                state.selectedOutput = Math.max(0, Number(button.dataset.candidateIndex || 0));
                activeWorkspace().selectedOutput = state.selectedOutput;
                renderTaskResult(task);
                persistSettings();
            });
        });
    }

    function metaItem(label, value){
        return `<span>${escapeHtml(label)} <strong>${escapeHtml(value || '—')}</strong></span>`;
    }

    function renderResultMeta(task){
        const result = task.result || {};
        const requestedRoute = (task.route_candidates || task.request?.route_candidates || [])[0] || {};
        const elapsed = Number(result.generation_elapsed_seconds || 0);
        const imageItem = (result.image_items || [])[state.selectedOutput] || (result.image_items || [])[0] || {};
        const actualSize = Number(imageItem.width) > 0 && Number(imageItem.height) > 0
            ? `${Number(imageItem.width)}x${Number(imageItem.height)}`
            : (result.size || task.size);
        const garmentAnalysis = result.garment_analysis || task.garment_analysis;
        const items = [
            metaItem(t('ecommerce.platformMeta'), result.provider_name || result.provider_id || task.provider_name || task.provider_id || requestedRoute.provider_name || requestedRoute.provider_id),
            metaItem(t('ecommerce.modelMeta'), result.model || task.model || requestedRoute.model),
            metaItem(t('ecommerce.sizeMeta'), actualSize),
            metaItem(t('ecommerce.candidatesMeta'), t('ecommerce.imagesCount',{count:(result.images || []).length || Number(task.count || 0)})),
            metaItem(t('ecommerce.durationMeta'), elapsed > 0 ? t('ecommerce.seconds',{count:elapsed.toFixed(1)}) : t(`ecommerce.${task.status || 'queued'}`)),
        ];
        if(garmentAnalysis?.status === 'succeeded') {
            items.push(metaItem(t('ecommerce.detectedGarmentMeta'), garmentAnalysis.garment_type || garmentAnalysis.category));
        }
        el.resultMeta.innerHTML = items.join('');
    }

    function renderApprovalState(){
        const task = state.currentTask || {};
        const approved = task.approval?.status === 'approved' && Number(task.approval.output_index) === state.selectedOutput;
        el.exportFinal.disabled = !approved;
        el.saveAsset.disabled = !approved;
        el.qualityReview.disabled = task.status !== 'succeeded';
        el.downloadPreview.disabled = !(task.result?.images || [])[state.selectedOutput];
    }

    async function createTask(parentTaskId=''){
        if(!validateForm(true)) return;
        clearFormError();
        state.submissionsInFlight += 1;
        el.generateButton.classList.add('submitting');
        try {
            await uploadMaskIfNeeded();
            const payload = JSON.parse(JSON.stringify(ecommerceTaskPayload(parentTaskId)));
            const task = await fetchJson('/api/ecommerce/tasks', {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify(payload),
            });
            const stored = storeTask(task);
            const keepVisibleResult = state.currentTask?.status === 'succeeded' && (state.currentTask?.result?.images || []).length;
            if(!keepVisibleResult) {
                state.selectedOutput = 0;
                renderTaskResult(stored);
            } else {
                renderCandidateRail();
                renderTaskList();
            }
            persistSettings();
            showToast(t('ecommerce.taskSubmitted'));
            scheduleTaskPolling(100);
        } catch(error) {
            showFormError(error.message);
        } finally {
            state.submissionsInFlight = Math.max(0, state.submissionsInFlight - 1);
            el.generateButton.classList.toggle('submitting', state.submissionsInFlight > 0);
        }
    }

    function scheduleTaskPolling(delay=1500){
        clearTimeout(state.taskPollTimer);
        state.taskPollTimer = null;
        if(!state.activeTaskIds.size) return;
        state.taskPollTimer = setTimeout(pollActiveTasks, Math.max(50, Number(delay) || 1500));
    }

    async function fetchActiveTaskStatuses(ids){
        try {
            return await fetchJson('/api/ecommerce/tasks/status', {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({ids}),
            });
        } catch(batchError) {
            const tasks = await Promise.all(ids.map(async id => {
                try { return await fetchJson(`/api/ecommerce/tasks/${encodeURIComponent(id)}`); }
                catch(error) { return {id,task_id:id,status:'unknown',poll_error:error.message}; }
            }));
            return {tasks};
        }
    }

    async function pollActiveTasks(){
        if(state.taskPollInflight) return;
        const ids = [...state.activeTaskIds];
        if(!ids.length) return;
        state.taskPollInflight = true;
        try {
            const response = await fetchActiveTaskStatuses(ids);
            const updates = response.tasks || [];
            const completedIds = [];
            (response.missing || []).forEach(id => {
                storeTask({
                    id,
                    task_id:id,
                    status:'interrupted',
                    error:t('ecommerce.taskLoadFailed'),
                    updated_at:Date.now() / 1000,
                });
            });
            updates.forEach(update => {
                if(update.status === 'unknown') return;
                const previous = state.tasksById.get(taskIdOf(update));
                storeTask(update);
                if(previous && isTaskActive(previous) && !isTaskActive(update) && !update.result) completedIds.push(taskIdOf(update));
            });
            if(completedIds.length) {
                const completed = await Promise.all(completedIds.map(async id => {
                    try { return await fetchJson(`/api/ecommerce/tasks/${encodeURIComponent(id)}`); }
                    catch(error) { return state.tasksById.get(id); }
                }));
                completed.filter(Boolean).forEach(storeTask);
            }
            const currentId = taskIdOf(state.currentTask);
            const current = currentId ? state.tasksById.get(currentId) : null;
            if(current) renderTaskResult(current);
            else {
                const firstCompleted = state.tasks.find(task => task.operation === state.operation && task.status === 'succeeded' && (task.result?.images || []).length);
                if(firstCompleted) renderTaskResult(firstCompleted);
                else renderCandidateRail();
            }
            renderTaskList();
        } finally {
            state.taskPollInflight = false;
            scheduleTaskPolling();
        }
    }

    async function loadTask(taskId, closeDrawer=true){
        try {
            const task = await fetchJson(`/api/ecommerce/tasks/${encodeURIComponent(taskId)}`);
            storeTask(task);
            captureWorkspace();
            if(OPERATION_CONFIG[task.operation]) state.operation = task.operation;
            restoreWorkspace(state.operation);
            state.mode = 'standard';
            if(task.operation === 'universal') {
                state.inputs = Object.fromEntries((task.inputs || []).map((item,index) => {
                    const key=String(item.reference_id || `ref_restored_${index}`);
                    return [key,{...item,reference_id:key,reference_type:item.reference_type || item.role,order:index}];
                }));
            } else {
                state.inputs = Object.fromEntries((task.inputs || []).map(item => [item.role,{...item}]));
            }
            if(task.options && DEFAULT_OPTIONS[task.operation]) state.options[task.operation] = {...DEFAULT_OPTIONS[task.operation], ...task.options};
            const parameters = task.parameters || task.request?.parameters || {};
            state.providerId = String(task.request?.provider_id ?? task.provider_id ?? state.providerId);
            state.model = String(task.request?.model ?? task.model ?? state.model);
            state.aspectRatio = ASPECT_RATIOS.includes(parameters.aspect_ratio) ? parameters.aspect_ratio : 'source';
            state.resolution = RESOLUTIONS.includes(parameters.resolution) ? parameters.resolution : 'auto';
            state.quality = QUALITIES.includes(parameters.quality) ? parameters.quality : 'auto';
            state.count = [0,1,2,3,4].includes(Number(parameters.count)) ? Number(parameters.count) : 0;
            state.selectedOutput = Number(task.approval?.output_index ?? 0);
            updateTabs();
            renderInputs();
            renderOperationControls();
            populateModelSelectors();
            syncGenerationParameterControls();
            renderTaskResult(task);
            updateRouteSummary();
            persistSettings();
            if(closeDrawer) setHistoryOpen(false);
            if(isTaskActive(task)) scheduleTaskPolling(100);
        } catch(error) {
            showToast(`${t('ecommerce.taskLoadFailed')}：${error.message}`, true);
        }
    }

    async function loadTasks(){
        try {
            const response = await fetchJson('/api/ecommerce/tasks?limit=2000');
            (response.tasks || []).forEach(storeTask);
            renderTaskList();
            renderCandidateRail();
            scheduleTaskPolling(100);
            return state.tasks;
        } catch(error) {
            el.taskList.innerHTML = `<div class="ec-task-empty">${escapeHtml(error.message)}</div>`;
            return [];
        }
    }

    function renderTaskList(){
        if(!state.tasks.length) {
            el.taskList.innerHTML = `<div class="ec-task-empty">${escapeHtml(t('ecommerce.noTasks'))}</div>`;
            return;
        }
        el.taskList.innerHTML = state.tasks.slice(0,200).map(task => {
            const image = task.result?.images?.[0] || sourceUrlForTask(task);
            const operation = OPERATION_CONFIG[task.operation];
            const canRetry = !['queued','running'].includes(task.status);
            return `<article class="ec-task-item" data-task-id="${escapeHtml(task.id)}" tabindex="0">
                ${image ? `<img src="${escapeHtml(image)}" alt="">` : '<div class="ec-task-placeholder"></div>'}
                <div class="ec-task-info"><b>${escapeHtml(t(operation?.titleKey || 'ecommerce.title'))}</b>
                    <span>${escapeHtml(new Date(Number(task.created_at || 0) * 1000).toLocaleString())} · ${escapeHtml(t('ecommerce.standard'))}</span>
                    <span class="ec-task-status ${escapeHtml(task.status || '')}">${escapeHtml(t(`ecommerce.${task.status || 'queued'}`))}</span>
                    <div class="ec-task-actions"><button type="button" data-open-task="${escapeHtml(task.id)}">${escapeHtml(t('ecommerce.loadTask'))}</button>${canRetry ? `<button type="button" data-retry-task="${escapeHtml(task.id)}">${escapeHtml(t('ecommerce.retry'))}</button>` : ''}</div>
                </div>
            </article>`;
        }).join('');
        el.taskList.querySelectorAll('[data-open-task]').forEach(button => button.addEventListener('click', event => {
            event.stopPropagation();
            loadTask(button.dataset.openTask);
        }));
        el.taskList.querySelectorAll('[data-retry-task]').forEach(button => button.addEventListener('click', async event => {
            event.stopPropagation();
            await loadTask(button.dataset.retryTask);
            await createTask(button.dataset.retryTask);
        }));
        el.taskList.querySelectorAll('.ec-task-item').forEach(item => {
            item.addEventListener('click', () => loadTask(item.dataset.taskId));
            item.addEventListener('keydown', event => {
                if(event.key === 'Enter') loadTask(item.dataset.taskId);
            });
        });
    }

    function setHistoryOpen(open){
        el.taskDrawer.classList.toggle('open', !!open);
        el.taskDrawer.setAttribute('aria-hidden', open ? 'false' : 'true');
        el.drawerBackdrop.classList.toggle('hidden', !open);
        if(open) loadTasks();
    }

    function downloadSelectedPreview(){
        const url = state.currentTask?.result?.images?.[state.selectedOutput];
        if(!url) return;
        const link = document.createElement('a');
        link.href = url;
        link.download = `ecommerce-work-${state.currentTask.operation || 'image'}-${state.selectedOutput + 1}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        showToast(t('ecommerce.previewDownloaded'));
    }

    function openQualityReview(){
        const task = state.currentTask;
        if(task?.status !== 'succeeded') return;
        const checks = state.capabilities?.quality_checks?.[task.operation] || [];
        const approved = task.approval?.status === 'approved' && Number(task.approval.output_index) === state.selectedOutput;
        el.qualityChecks.innerHTML = checks.map(item => `<label class="ec-quality-check">
            <input type="checkbox" data-quality-id="${escapeHtml(item.id)}" ${approved && task.approval?.checks?.[item.id] ? 'checked':''}>
            <span>${escapeHtml(localizedLabel(item))}</span>
        </label>`).join('');
        el.qualityNote.value = approved ? (task.approval?.note || '') : '';
        el.qualityDialog.showModal();
    }

    async function approveSelectedCandidate(event){
        event.preventDefault();
        if(event.submitter?.value === 'cancel') {
            el.qualityDialog.close();
            return;
        }
        const inputs = Array.from(el.qualityChecks.querySelectorAll('[data-quality-id]'));
        if(!inputs.length || inputs.some(input => !input.checked)) {
            showToast(t('ecommerce.approveAll'), true);
            return;
        }
        const checks = Object.fromEntries(inputs.map(input => [input.dataset.qualityId, true]));
        try {
            const response = await fetchJson(`/api/ecommerce/tasks/${encodeURIComponent(state.currentTask.id)}/approve`, {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({output_index:state.selectedOutput, checks, note:el.qualityNote.value || ''}),
            });
            state.currentTask.approval = response.approval;
            const stored = state.tasks.find(item => item.id === state.currentTask.id);
            if(stored) stored.approval = response.approval;
            el.qualityDialog.close();
            renderApprovalState();
            renderTaskList();
            showToast(t('ecommerce.approved'));
        } catch(error) {
            showToast(error.message, true);
        }
    }

    async function ensureOfficialExport(){
        const task = state.currentTask;
        const currentApproval = task?.approval || {};
        if(currentApproval.status !== 'approved' || Number(currentApproval.output_index) !== state.selectedOutput) {
            throw new Error(t('ecommerce.exportBlocked'));
        }
        if(currentApproval.export?.url) return currentApproval.export;
        const response = await fetchJson(`/api/ecommerce/tasks/${encodeURIComponent(task.id)}/export`, {method:'POST'});
        task.approval.export = response.export;
        const stored = state.tasks.find(item => item.id === task.id);
        if(stored?.approval) stored.approval.export = response.export;
        return response.export;
    }

    async function exportSelectedCandidate(){
        try {
            const exported = await ensureOfficialExport();
            const link = document.createElement('a');
            link.href = exported.url;
            link.download = exported.name || 'ecommerce-listing-image';
            document.body.appendChild(link);
            link.click();
            link.remove();
            showToast(t('ecommerce.exported'));
        } catch(error) {
            showToast(error.message, true);
        }
    }

    async function saveApprovedAsset(){
        const library = selectedAssetLibrary();
        const category = selectedAssetCategory();
        if(!library || !category) {
            showToast(t('ecommerce.selectCategory'), true);
            return;
        }
        el.assetSaveConfirm.disabled = true;
        try {
            const exported = await ensureOfficialExport();
            const response = await fetchJson('/api/asset-library/items', {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({
                    library_id:library.id,
                    category_id:category.id,
                    url:exported.url,
                    name:exported.name || `ecommerce-${state.currentTask.operation}.png`,
                }),
            });
            state.assetLibrary = response.library || state.assetLibrary;
            el.assetDialog.close();
            showToast(t('ecommerce.saved'));
        } catch(error) {
            showToast(error.message, true);
        } finally {
            el.assetSaveConfirm.disabled = false;
        }
    }

    function bindComparison(){
        state.compareViewer = new window.CompareViewer({
            root:el.compareStage,
            before:el.beforeImage,
            after:el.afterImage,
            afterClip:el.afterClip,
            handle:el.compareHandle,
            zoomLabel:el.zoomReset,
            zoomInButton:el.zoomIn,
            zoomOutButton:el.zoomOut,
            fullscreenButton:el.compareFullscreen,
            divider:state.compareValue,
            scale:state.zoom,
            onChange:next => {
                state.compareValue = next.divider;
                state.zoom = next.scale;
                const workspace = activeWorkspace();
                workspace.compareValue = next.divider;
                workspace.zoom = next.scale;
            },
        });
        el.compareReset.addEventListener('click', () => {
            state.compareViewer.reset();
            state.compareValue = 50;
            state.zoom = 1;
            persistSettings();
        });
        window.addEventListener('resize', syncCompareGeometry);
    }

    function compatibleModels(){
        const models = state.capabilities?.models || [];
        if(!currentConfig()?.universal) return models;
        const referenceCount = universalEntries().filter(([,item]) => item.url).length;
        return models.filter(item => Number(item.max_reference_images || 0) >= referenceCount);
    }

    function populateModelSelectors(){
        const providers = state.capabilities?.providers || [];
        const models = compatibleModels();
        const previousProvider = state.providerId;
        const previousModel = state.model;
        state.providerId = providers.some(item => item.id === state.providerId) ? state.providerId : (providers[0]?.id || '');
        el.providerSelect.innerHTML = providers.length
            ? providers.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name || item.id)}</option>`).join('')
            : `<option value="">${escapeHtml(t('ecommerce.noConfiguredProvider'))}</option>`;
        el.providerSelect.value = state.providerId;
        el.providerSelect.disabled = providers.length === 0;
        const filtered = state.providerId ? models.filter(item => item.provider_id === state.providerId) : [];
        const recommended = resolveRecommendedRoute(state.providerId);
        const automaticLabel = recommended?.model
            ? t('ecommerce.autoRecommended',{model:recommended.model})
            : t('ecommerce.auto');
        el.modelSelect.innerHTML = `<option value="">${escapeHtml(automaticLabel)}</option>` + filtered.map(item => `<option value="${escapeHtml(item.model)}">${escapeHtml(item.model)}</option>`).join('');
        el.modelSelect.value = filtered.some(item => item.model === state.model) ? state.model : '';
        if(!el.modelSelect.value) state.model = '';
        el.modelSelect.disabled = filtered.length === 0;
        updateModelPanelSelection();
        if(previousProvider !== state.providerId || previousModel !== state.model) persistSettings();
    }

    function syncGenerationParameterControls(){
        if(el.ratioSelect) el.ratioSelect.value = ASPECT_RATIOS.includes(state.aspectRatio) ? state.aspectRatio : 'source';
        if(el.resolutionSelect) el.resolutionSelect.value = RESOLUTIONS.includes(state.resolution) ? state.resolution : 'auto';
        if(el.qualitySelect) el.qualitySelect.value = QUALITIES.includes(state.quality) ? state.quality : 'auto';
        if(el.countSelect) el.countSelect.value = String([0,1,2,3,4].includes(Number(state.count)) ? Number(state.count) : 0);
    }

    function resolveRecommendedRoute(providerId=''){
        const models = compatibleModels();
        const route = state.capabilities?.routes?.standard;
        const routeCompatible = route && models.some(item => item.provider_id === route.provider_id && item.model === route.model);
        if(providerId && (!routeCompatible || route?.provider_id !== providerId)) return models.find(item => item.provider_id === providerId) || null;
        return routeCompatible ? route : (models[0] || null);
    }

    function updateModelPanelSelection(){
        const provider = (state.capabilities?.providers || []).find(item => item.id === state.providerId);
        const route = state.model
            ? (state.capabilities?.models || []).find(item => item.provider_id === state.providerId && item.model === state.model)
            : resolveRecommendedRoute(state.providerId);
        if(el.modelPanelSelection) {
            const modelText = state.model || (route?.model ? t('ecommerce.autoRecommended',{model:route.model}) : t('ecommerce.noConfiguredModel'));
            el.modelPanelSelection.textContent = provider ? `${provider.name || provider.id} · ${modelText}` : t('ecommerce.noConfiguredProvider');
        }
        el.advancedSettings?.classList.toggle('collapsed', state.modelPanelCollapsed);
        el.modelPanelToggle?.setAttribute('aria-expanded', state.modelPanelCollapsed ? 'false' : 'true');
    }

    function updateRouteSummary(){
        const route = resolveDisplayedRoute();
        const strong = el.routeSummary.querySelector('strong');
        if(strong) strong.textContent = route ? `${route.provider_name || route.provider_id} · ${route.model}` : '—';
        updateModelPanelSelection();
    }

    function resolveDisplayedRoute(){
        const models = compatibleModels();
        if(state.model) {
            return models.find(item => item.model === state.model && (!state.providerId || item.provider_id === state.providerId));
        }
        const route = state.capabilities?.routes?.standard;
        if(state.providerId && route?.provider_id !== state.providerId) {
            return models.find(item => item.provider_id === state.providerId) || route;
        }
        return route || null;
    }

    function updateCapabilityStatus(){
        if(!state.capabilities) return;
        const count = state.capabilities.models?.length || 0;
        el.capabilityStatus.textContent = t(count > 0 ? 'ecommerce.enginesReady' : 'ecommerce.noEngine', {count});
        el.capabilityStatus.classList.toggle('ready', count > 0);
        el.capabilityStatus.classList.toggle('error', count <= 0);
    }

    async function loadCapabilities(){
        try {
            const response = await fetch('/api/ecommerce/capabilities');
            if(!response.ok) throw new Error(`HTTP ${response.status}`);
            state.capabilities = await response.json();
            updateCapabilityStatus();
            populateModelSelectors();
            renderOperationControls();
            updateRouteSummary();
        } catch(error) {
            state.capabilities = {models:[],providers:[],routes:{},pose_presets:[],background_presets:[]};
            updateCapabilityStatus();
            populateModelSelectors();
            renderOperationControls();
            updateRouteSummary();
        }
    }

    function bindBaseEvents(){
        el.operationTabs.addEventListener('click', event => {
            const button = event.target.closest('[data-operation]');
            if(button) switchOperation(button.dataset.operation);
        });
        el.modeToggle?.addEventListener('click', event => {
            const button = event.target.closest('[data-mode]');
            if(button) switchMode(button.dataset.mode);
        });
        el.providerSelect.addEventListener('change', () => {
            state.providerId = el.providerSelect.value;
            state.model = '';
            populateModelSelectors();
            updateRouteSummary();
            persistSettings();
        });
        el.modelSelect.addEventListener('change', () => {
            state.model = el.modelSelect.value;
            updateRouteSummary();
            persistSettings();
        });
        el.ratioSelect.addEventListener('change', () => {
            state.aspectRatio = ASPECT_RATIOS.includes(el.ratioSelect.value) ? el.ratioSelect.value : 'source';
            persistSettings();
        });
        el.resolutionSelect.addEventListener('change', () => {
            state.resolution = RESOLUTIONS.includes(el.resolutionSelect.value) ? el.resolutionSelect.value : 'auto';
            persistSettings();
        });
        el.qualitySelect.addEventListener('change', () => {
            state.quality = QUALITIES.includes(el.qualitySelect.value) ? el.qualitySelect.value : 'auto';
            persistSettings();
        });
        el.countSelect.addEventListener('change', () => {
            state.count = [0,1,2,3,4].includes(Number(el.countSelect.value)) ? Number(el.countSelect.value) : 0;
            persistSettings();
        });
        el.modelPanelToggle.addEventListener('click', () => {
            state.modelPanelCollapsed = !state.modelPanelCollapsed;
            updateModelPanelSelection();
            persistSettings();
        });
        el.generateButton.addEventListener('click', () => createTask());
        el.historyToggle.addEventListener('click', () => setHistoryOpen(true));
        el.closeHistory.addEventListener('click', () => setHistoryOpen(false));
        el.drawerBackdrop.addEventListener('click', () => setHistoryOpen(false));
        el.downloadPreview.addEventListener('click', downloadSelectedPreview);
        el.qualityReview.addEventListener('click', openQualityReview);
        el.qualityForm.addEventListener('submit', approveSelectedCandidate);
        el.cancelQuality.addEventListener('click', () => el.qualityDialog.close());
        el.exportFinal.addEventListener('click', exportSelectedCandidate);
        el.saveAsset.addEventListener('click', openAssetSaveDialog);
        el.assetSaveConfirm.addEventListener('click', saveApprovedAsset);
        el.assetLibrarySelect.addEventListener('change', renderAssetLibrarySelectors);
        el.assetCategorySelect.addEventListener('change', renderAssetGrid);
        byId('fileInput')?.addEventListener('change', event => {
            const file = event.target.files?.[0];
            if(file) handleSelectedFile(file, state.activeUploadRole);
            event.target.value = '';
        });
        document.addEventListener('paste', event => {
            if(document.querySelector('dialog[open]')) return;
            const file = Array.from(event.clipboardData?.files || []).find(item => item.type.startsWith('image/'));
            if(!file) return;
            const config = currentConfig();
            let role = config.inputs.find(item => !state.inputs[item.role])?.role || 'source';
            if(config.universal) {
                ensureUniversalPresets();
                const available = universalEntries().find(([,item]) => !item.url);
                if(available) role = available[0];
                else {
                    const limit = Number(state.capabilities?.universal_reference_limit || 14);
                    if(universalEntries().length >= limit) return;
                    role = createUniversalReference('prop', universalEntries().length);
                    renderUniversalInputs();
                }
            }
            handleSelectedFile(file, role);
        });
        window.addEventListener('message', event => {
            if(event.origin && event.origin !== location.origin) return;
            if(event.data?.type === 'studio-language') window.StudioI18n?.set?.(event.data.lang,{sync:false});
            if(event.data?.type === 'providers-changed') loadCapabilities();
            const incomingSettings = event.data?.type === 'canvas.preferences' ? event.data?.values?.ecommerce_settings : '';
            if(incomingSettings && incomingSettings !== state.settingsSerialized) {
                if(shouldIgnoreIncomingSettings()) return;
                applyIncomingSettings(String(incomingSettings));
            }
        });
        window.addEventListener('studio-lang-change', () => {
            updateTabs();
            renderInputs();
            renderOperationControls();
            populateModelSelectors();
            syncGenerationParameterControls();
            updateCapabilityStatus();
        });
        window.addEventListener('resize', () => {
            const previousWidth = state.viewportWidth;
            state.viewportWidth = window.innerWidth;
            if(previousWidth > 860 && state.viewportWidth <= 860 && currentConfig()?.universal) {
                requestAnimationFrame(() => { el.inputSlots.scrollLeft = 0; });
            }
        });
    }

    async function init(){
        cacheElements();
        loadSettings();
        restoreWorkspace(state.operation);
        state.settingsNeedsMigration = false;
        syncGenerationParameterControls();
        updateTabs();
        renderInputs();
        renderOperationControls();
        bindBaseEvents();
        bindComparison();
        bindMaskEditor();
        await loadCapabilities();
        await loadTasks();
        const savedTaskId = activeWorkspace().taskId || sessionStorage.getItem('ecommerce_current_task');
        if(savedTaskId && state.tasks.some(item => item.id === savedTaskId)) await loadTask(savedTaskId, false);
    }

    window.EcommerceStudio = {
        state,
        config:OPERATION_CONFIG,
        t,
        renderInputs,
        renderOperationControls,
        validateForm,
        showFormError,
        clearFormError,
        hideResult,
        updateRouteSummary,
        openAssetPicker:openAssetPickerForRole,
        uploadInput,
        createTask,
        loadTask,
    };
    document.addEventListener('DOMContentLoaded', init, {once:true});
})();
