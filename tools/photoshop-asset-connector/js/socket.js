/* WebSocket 实时同步：心跳 15s、指数退避重连、防重复连、重连后补刷。
 * 抖动只影响自动刷新，不影响浏览/置入/导出（那些都是独立 REST）。 */
(function () {
  const state = DX.state;
  const net = DX.net;

  // handlers = { isLive: () => bool, onUpdate: (source?) => void }
  function openSocket(handlers) {
    closeSocket();
    if (!handlers.isLive()) return;
    let ws;
    try { ws = new WebSocket(`${net.wsBase()}/ws/events`); }
    catch (e) { return; }
    state.ws = ws;

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'auth', token: state.token, client_id: 'photoshop' }));
      state.wsBackoff = 1000;
      clearInterval(state.wsPing);
      state.wsPing = setInterval(() => { try { ws.send('ping'); } catch (e) {} }, 15000);
      if (state.wsWasOpen) handlers.onUpdate();      // 断线期间可能错过推送
      state.wsWasOpen = true;
    });

    ws.addEventListener('message', (evt) => {
      let msg; try { msg = JSON.parse(evt.data); } catch (e) { return; }
      if (!msg || msg.type === 'pong') return;
      if (msg.type === 'entity.changed' && msg.topic === 'asset') handlers.onUpdate('assets');
      else if (msg.type === 'entity.changed' && msg.topic === 'canvas') handlers.onUpdate('canvas');
    });

    ws.addEventListener('close', () => {
      if (state.ws !== ws) return;                   // 已被取代/主动关闭
      clearInterval(state.wsPing);
      if (state.connected && handlers.isLive()) {
        clearTimeout(state.reconnectTimer);
        state.reconnectTimer = setTimeout(() => openSocket(handlers), state.wsBackoff);
        state.wsBackoff = Math.min(state.wsBackoff * 2, 8000);
      }
    });

    ws.addEventListener('error', () => { try { ws.close(); } catch (e) {} });
  }

  function closeSocket() {
    clearInterval(state.wsPing);
    clearTimeout(state.reconnectTimer);
    if (state.ws) { try { state.ws.close(); } catch (e) {} state.ws = null; }
  }

  DX.socket = { openSocket, closeSocket };
})();
