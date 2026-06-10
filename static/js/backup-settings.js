let localBackups = [];
let webdavConfigured = false;

function refreshIcons(){ if(window.lucide) lucide.createIcons(); }

function setStatus(msg, type=''){
    const el = document.getElementById('status');
    el.textContent = msg;
    el.style.color = type === 'success' ? '#16a34a' : type === 'error' ? '#ef4444' : '';
}

function formatBytes(bytes){
    if(!bytes || bytes < 1) return '0 B';
    const units = ['B','KB','MB','GB'];
    let i = 0;
    let val = bytes;
    while(val >= 1024 && i < units.length - 1){ val /= 1024; i++; }
    return `${val.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatTime(ts){
    if(!ts) return '--';
    const d = new Date(Number(ts));
    if(isNaN(d.getTime())) return '--';
    return d.toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
}

// === 创建备份 ===

document.querySelectorAll('.backup-option').forEach(opt => {
    opt.addEventListener('click', function(e){
        const cb = this.querySelector('input[type="checkbox"]');
        cb.checked = !cb.checked;
        this.classList.toggle('active', cb.checked);
    });
});

async function createBackup(){
    const el = document.getElementById('createStatus');
    el.className = 'status-msg loading';
    el.textContent = '正在创建备份...';
    const options = {};
    document.querySelectorAll('.backup-option').forEach(opt => {
        const key = opt.dataset.key;
        options[key] = opt.querySelector('input[type="checkbox"]').checked;
    });
    try {
        const res = await fetch('/api/backup', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify(options),
        });
        if(!res.ok){ const d = await res.json().catch(()=>({})); throw new Error(d.detail || '创建失败'); }
        const data = await res.json();
        el.className = 'status-msg success';
        el.textContent = `备份创建成功：${data.backup.id}（${formatBytes(data.backup.size)}，${data.backup.stats.file_count} 个文件）`;
        loadLocalBackups();
    } catch(e) {
        el.className = 'status-msg error';
        el.textContent = `创建失败：${e.message}`;
    }
}

// === 本地备份列表 ===

async function loadLocalBackups(){
    const container = document.getElementById('backupListContainer');
    try {
        const res = await fetch('/api/backup/list');
        if(!res.ok) throw new Error('加载失败');
        const data = await res.json();
        localBackups = data.backups || [];
        renderLocalBackups();
    } catch(e) {
        container.innerHTML = `<p style="font-size:12px;color:#ef4444;font-weight:700;">加载备份列表失败：${e.message}</p>`;
    }
}

function renderLocalBackups(){
    const container = document.getElementById('backupListContainer');
    if(!localBackups.length){
        container.innerHTML = '<p style="font-size:12px;color:var(--faint);font-weight:700;">暂无本地备份</p>';
        return;
    }
    let html = `<table class="backup-table"><thead><tr><th>备份文件</th><th>时间</th><th>大小</th><th>内容</th><th></th></tr></thead><tbody>`;
    localBackups.forEach(b => {
        const contents = b.contents || {};
        const tags = [];
        if(contents.secrets) tags.push('<span class="tag tag-warning"><i data-lucide="key-round" class="w-3 h-3"></i> 密钥</span>');
        if(contents.assets_library) tags.push('<span class="tag"><i data-lucide="image" class="w-3 h-3"></i> 资产库</span>');
        if(contents.assets_output) tags.push('<span class="tag"><i data-lucide="package" class="w-3 h-3"></i> 输出</span>');
        if(contents.assets_input) tags.push('<span class="tag"><i data-lucide="upload" class="w-3 h-3"></i> 输入</span>');
        if(contents.assets_uploads) tags.push('<span class="tag"><i data-lucide="folder" class="w-3 h-3"></i> 上传</span>');
        if(!tags.length) tags.push('<span class="tag">仅配置</span>');
        const stats = b.stats || {};
        const info = `画布 ${stats.canvas_count || 0} / 对话 ${stats.conversation_count || 0}`;
        html += `<tr>
            <td style="font-weight:800;font-size:11.5px;">${escapeHtml(b.id)}</td>
            <td style="font-size:11px;color:var(--muted);">${formatTime(b.created_at)}</td>
            <td style="font-size:11px;color:var(--muted);">${formatBytes(b.size)}</td>
            <td><div style="display:flex;flex-wrap:wrap;gap:4px;">${tags.join(' ')}<br><span style="font-size:10px;color:var(--faint);font-weight:700;">${escapeHtml(info)}</span></div></td>
            <td class="actions">
                <button class="secondary-btn" onclick="downloadBackup('${b.id}')" title="下载"><i data-lucide="download" class="w-3 h-3"></i></button>
                <button class="danger-btn" onclick="deleteBackup('${b.id}')" title="删除"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
            </td>
        </tr>`;
    });
    html += '</tbody></table>';
    html += `<p style="font-size:10.5px;color:var(--faint);font-weight:700;margin-top:8px;">共 ${localBackups.length} 个备份</p>`;
    container.innerHTML = html;
    refreshIcons();
}

function escapeHtml(text){
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
}

async function downloadBackup(id){
    try {
        const res = await fetch(`/api/backup/download/${encodeURIComponent(id)}`);
        if(!res.ok) throw new Error('下载失败');
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = id;
        a.click();
        URL.revokeObjectURL(a.href);
    } catch(e) {
        setStatus(`下载失败：${e.message}`, 'error');
    }
}

async function deleteBackup(id){
    if(!confirm(`确定删除备份 ${id}？`)) return;
    try {
        const res = await fetch(`/api/backup/${encodeURIComponent(id)}`, {method:'DELETE'});
        if(!res.ok){ const d = await res.json().catch(()=>({})); throw new Error(d.detail || '删除失败'); }
        setStatus('已删除', 'success');
        loadLocalBackups();
    } catch(e) {
        setStatus(`删除失败：${e.message}`, 'error');
    }
}

// === 恢复 ===

let restoreDragCounter = 0;
const restoreZone = document.getElementById('restoreZone');

restoreZone.addEventListener('dragenter', e => {
    e.preventDefault();
    restoreDragCounter++;
    restoreZone.classList.add('dragover');
});
restoreZone.addEventListener('dragleave', e => {
    e.preventDefault();
    restoreDragCounter--;
    if(restoreDragCounter <= 0){ restoreDragCounter = 0; restoreZone.classList.remove('dragover'); }
});
restoreZone.addEventListener('dragover', e => e.preventDefault());
restoreZone.addEventListener('drop', e => {
    e.preventDefault();
    restoreDragCounter = 0;
    restoreZone.classList.remove('dragover');
    const file = e.dataTransfer.files?.[0];
    if(file && file.name.endsWith('.zip')) restoreBackup(file);
    else setStatus('请拖入 .zip 文件', 'error');
});

async function restoreBackup(file){
    if(!file || !file.name.endsWith('.zip')){
        document.getElementById('restoreStatus').textContent = '请选择 .zip 文件';
        return;
    }
    const el = document.getElementById('restoreStatus');
    const progress = document.getElementById('restoreProgress');
    el.className = 'status-msg loading';
    el.textContent = '正在恢复...';
    progress.style.display = 'block';
    const restoreSecrets = document.getElementById('restoreSecretsCheck').checked;
    try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('restore_secrets', restoreSecrets ? 'true' : 'false');
        const res = await fetch('/api/backup/restore', {method:'POST', body:fd});
        progress.style.display = 'none';
        if(!res.ok){ const d = await res.json().catch(()=>({})); throw new Error(d.detail || '恢复失败'); }
        const data = await res.json();
        if(data.errors && data.errors.length){
            el.className = 'status-msg warning';
            el.textContent = `恢复完成：${data.restored} 个文件，跳过密钥 ${data.skipped_secrets} 个，${data.errors.length} 个错误`;
            console.warn('恢复错误：', data.errors);
        } else {
            el.className = 'status-msg success';
            el.textContent = `恢复完成：${data.restored} 个文件${data.skipped_secrets ? `，跳过 ${data.skipped_secrets} 个密钥文件` : ''}`;
        }
        loadLocalBackups();
    } catch(e) {
        progress.style.display = 'none';
        el.className = 'status-msg error';
        el.textContent = `恢复失败：${e.message}`;
    }
}

// === WebDAV ===

async function loadWebdavConfig(){
    try {
        const res = await fetch('/api/backup/webdav');
        if(!res.ok) throw new Error('加载失败');
        const data = await res.json();
        webdavConfigured = data.configured;
        document.getElementById('webdavUrl').value = data.url || '';
        document.getElementById('webdavUser').value = data.username || '';
        document.getElementById('webdavPath').value = data.remote_path || '/backups';
        const statusEl = document.getElementById('webdavStatus');
        if(data.configured){
            statusEl.className = 'webdav-status connected';
            statusEl.innerHTML = '<i data-lucide="check-circle" class="w-4 h-4"></i> WebDAV 已配置';
        } else {
            statusEl.className = 'webdav-status disconnected';
            statusEl.innerHTML = '<i data-lucide="cloud-off" class="w-4 h-4"></i> 未配置 WebDAV';
        }
        refreshIcons();
    } catch(e) {
        document.getElementById('webdavStatus').className = 'webdav-status disconnected';
        document.getElementById('webdavStatus').innerHTML = `<i data-lucide="alert-circle" class="w-4 h-4"></i> 加载失败：${e.message}`;
        refreshIcons();
    }
}

async function saveWebdav(){
    const el = document.getElementById('webdavStatusMsg');
    el.className = 'status-msg loading';
    el.textContent = '保存中...';
    try {
        const res = await fetch('/api/backup/webdav', {
            method:'PUT',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({
                url: document.getElementById('webdavUrl').value.trim(),
                username: document.getElementById('webdavUser').value.trim(),
                password: document.getElementById('webdavPass').value,
                remote_path: document.getElementById('webdavPath').value.trim() || '/backups',
            }),
        });
        if(!res.ok){ const d = await res.json().catch(()=>({})); throw new Error(d.detail || '保存失败'); }
        el.className = 'status-msg success';
        el.textContent = '配置已保存';
        document.getElementById('webdavPass').value = '';
        loadWebdavConfig();
    } catch(e) {
        el.className = 'status-msg error';
        el.textContent = `保存失败：${e.message}`;
    }
}

async function testWebdav(){
    const el = document.getElementById('webdavStatusMsg');
    el.className = 'status-msg loading';
    el.textContent = '测试连接中...';
    try {
        // 通过列出远程备份来测试连接
        const res = await fetch('/api/backup/webdav/list');
        if(!res.ok){ const d = await res.json().catch(()=>({})); throw new Error(d.detail || '连接失败'); }
        const data = await res.json();
        if(data.error) throw new Error(data.error);
        el.className = 'status-msg success';
        el.textContent = `连接成功，远程有 ${(data.backups || []).length} 个备份`;
    } catch(e) {
        el.className = 'status-msg error';
        el.textContent = `连接失败：${e.message}`;
    }
}

async function clearWebdav(){
    if(!confirm('清除 WebDAV 配置？')) return;
    try {
        const res = await fetch('/api/backup/webdav', {method:'DELETE'});
        if(!res.ok) throw new Error('清除失败');
        document.getElementById('webdavUrl').value = '';
        document.getElementById('webdavUser').value = '';
        document.getElementById('webdavPass').value = '';
        document.getElementById('webdavPath').value = '/backups';
        document.getElementById('webdavStatusMsg').className = 'status-msg success';
        document.getElementById('webdavStatusMsg').textContent = '配置已清除';
        loadWebdavConfig();
    } catch(e) {
        document.getElementById('webdavStatusMsg').className = 'status-msg error';
        document.getElementById('webdavStatusMsg').textContent = `清除失败：${e.message}`;
    }
}

async function pushToWebdav(){
    if(!webdavConfigured){ setStatus('请先配置 WebDAV', 'error'); return; }
    if(!localBackups.length){ setStatus('没有本地备份可推送', 'error'); return; }
    const el = document.getElementById('webdavSyncStatus');
    el.className = 'status-msg loading';
    el.textContent = '正在推送...';
    try {
        const res = await fetch('/api/backup/webdav/push', {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'});
        if(!res.ok){ const d = await res.json().catch(()=>({})); throw new Error(d.detail || '推送失败'); }
        const data = await res.json();
        el.className = 'status-msg success';
        el.textContent = `成功推送 ${data.count} 个备份`;
    } catch(e) {
        el.className = 'status-msg error';
        el.textContent = `推送失败：${e.message}`;
    }
}

async function listRemoteBackups(){
    if(!webdavConfigured){ setStatus('请先配置 WebDAV', 'error'); return; }
    const el = document.getElementById('remoteBackupList');
    el.innerHTML = '<p style="font-size:12px;color:var(--faint);font-weight:700;">查询中...</p>';
    try {
        const res = await fetch('/api/backup/webdav/list');
        if(!res.ok){ const d = await res.json().catch(()=>({})); throw new Error(d.detail || '查询失败'); }
        const data = await res.json();
        if(data.error) throw new Error(data.error);
        const items = data.backups || [];
        if(!items.length){
            el.innerHTML = '<p style="font-size:12px;color:var(--faint);font-weight:700;">远程无备份文件</p>';
        } else {
            let html = '<div style="display:flex;flex-direction:column;gap:4px;">';
            items.forEach(name => {
                const exists = localBackups.some(b => b.id === name);
                html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border-radius:8px;background:var(--soft);font-size:11.5px;font-weight:700;">
                    <span>${escapeHtml(name)}</span>
                    <div style="display:flex;gap:4px;">
                        ${exists ? '<span class="tag" style="font-size:9px;">已下载</span>' : ''}
                        <button class="secondary-btn" style="height:26px;padding:0 8px;font-size:10px;" onclick="pullFromWebdav('${name}')"><i data-lucide="download" class="w-3 h-3"></i> 拉取</button>
                    </div>
                </div>`;
            });
            html += '</div>';
            el.innerHTML = html;
            refreshIcons();
        }
    } catch(e) {
        el.innerHTML = `<p style="font-size:12px;color:#ef4444;font-weight:700;">查询失败：${e.message}</p>`;
    }
}

function pullFromWebdavPrompt(){
    if(!webdavConfigured){ setStatus('请先配置 WebDAV', 'error'); return; }
    const name = prompt('输入远程备份文件名（如 backup_20260610-120000.zip）：');
    if(name) pullFromWebdav(name.trim());
}

async function pullFromWebdav(backupId){
    const el = document.getElementById('webdavSyncStatus');
    el.className = 'status-msg loading';
    el.textContent = `正在拉取 ${backupId}...`;
    try {
        const res = await fetch('/api/backup/webdav/pull', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({backup_id: backupId}),
        });
        if(!res.ok){ const d = await res.json().catch(()=>({})); throw new Error(d.detail || '拉取失败'); }
        const data = await res.json();
        el.className = 'status-msg success';
        el.textContent = `已下载到本地：${data.backup.id}（${formatBytes(data.backup.size)}）`;
        loadLocalBackups();
        document.getElementById('remoteBackupList').innerHTML = '';
    } catch(e) {
        el.className = 'status-msg error';
        el.textContent = `拉取失败：${e.message}`;
    }
}

// === 初始化 ===

loadLocalBackups();
loadWebdavConfig();
