/* 共享状态 + 本地持久化键。挂到全局 DX 命名空间（多 script 共享作用域）。 */
window.DX = window.DX || {};

DX.LS = {
  host: 'daxiong.assets.host',
  token: 'daxiong.assets.token',
  source: 'daxiong.assets.source',
  exportLayer: 'daxiong.assets.exportLayer',
};

DX.state = {
  host: '',
  token: '',
  connected: false,
  tab: 'assets',                 // assets | generate | settings
  source: 'assets',              // assets | canvas | local
  raw: { assets: null, canvas: null, local: null },
  aId: '',
  bId: '',
  selectedId: '',
  exportLayer: false,
  // WebSocket
  ws: null,
  wsPing: null,
  wsBackoff: 1000,
  wsWasOpen: false,
  reconnectTimer: null,
  reloadTimer: null,
};
