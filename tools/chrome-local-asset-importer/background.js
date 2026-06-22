// 后台嗅探：很多站点的视频/音频是通过 XHR/fetch 加载的，DOM 里看不到。
// 这里用 webRequest 监听媒体请求，按标签页记录，供 popup 扫描时取用。

// 整段可下载的媒体文件
const MEDIA_EXT = /\.(mp4|webm|mov|m4v|flv|mkv|avi|mp3|m4a|wav|ogg|flac|aac)(?:[?#]|$)/i;
// 流媒体清单（HLS/DASH）
const STREAM_EXT = /\.(m3u8|mpd)(?:[?#]|$)/i;
// 切片文件——数量巨大且单独无意义，忽略
const SEGMENT_EXT = /\.(ts|m4s|cmf[vat])(?:[?#]|$)/i;
const MEDIA_CT = /^(?:video\/|audio\/|application\/(?:vnd\.apple\.mpegurl|x-mpegurl|dash\+xml))/i;

const MAX_PER_TAB = 120;
const byTab = new Map(); // tabId -> Map(url -> {url, contentType, kind})

function kindFor(url, ct){
  if(STREAM_EXT.test(url) || /mpegurl|dash/i.test(ct || '')) return 'stream';
  if(/^audio\//i.test(ct || '') || /\.(mp3|m4a|wav|ogg|flac|aac)(?:[?#]|$)/i.test(url)) return 'audio';
  return 'video';
}

function record(tabId, url, contentType){
  if(typeof tabId !== 'number' || tabId < 0 || !url) return;
  if(url.startsWith('data:') || url.startsWith('blob:')) return;
  let map = byTab.get(tabId);
  if(!map){ map = new Map(); byTab.set(tabId, map); }
  if(map.has(url) || map.size >= MAX_PER_TAB) return;
  map.set(url, {url, contentType: contentType || '', kind: kindFor(url, contentType)});
}

chrome.webRequest.onHeadersReceived.addListener(
  details => {
    // 主文档导航 = 翻到新页面，清空上一页记录
    if(details.type === 'main_frame'){
      byTab.delete(details.tabId);
      return;
    }
    if(SEGMENT_EXT.test(details.url)) return;
    const ctHeader = (details.responseHeaders || [])
      .find(h => (h.name || '').toLowerCase() === 'content-type');
    const ct = (ctHeader?.value || '').split(';', 1)[0].trim();
    if(/mp2t/i.test(ct)) return; // HLS 切片的 content-type，忽略
    if(MEDIA_CT.test(ct) || MEDIA_EXT.test(details.url) || STREAM_EXT.test(details.url)){
      record(details.tabId, details.url, ct);
    }
  },
  {urls: ['<all_urls>']},
  ['responseHeaders']
);

chrome.tabs.onRemoved.addListener(tabId => byTab.delete(tabId));

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if(message?.type === 'ic-get-media'){
    const map = byTab.get(message.tabId);
    sendResponse({items: map ? [...map.values()] : []});
  }
  return true;
});
