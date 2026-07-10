/* ============ 存储层 ============
 * 目标：配置在所有终端同步。
 * - 扩展环境：chrome.storage.sync（随账号同步到所有 Chrome/Edge），
 *   单项上限 8KB，故把 JSON 切片为多个 chunk；同时镜像一份到 local 做离线缓存/兜底。
 * - 配置过大无法同步时：自动降级到 local（仅本机），并提示。
 * - 非扩展环境（直接打开 html 预览）：用 localStorage。
 */
const ITEM_BYTES = 7600;            // 每片字节数，留余量 < 8192
const META = 'fn_meta';
const CHUNK = 'fn_c';
const LOCAL = 'fn_config';
const MAX_CHUNKS = 480;             // sync 总量约 100KB / 512 项

export const isExtension = typeof chrome !== 'undefined' && !!(chrome.storage && chrome.storage.sync);

const sGet = k => new Promise(r => chrome.storage.sync.get(k, r));
const sSet = o => new Promise((res, rej) => chrome.storage.sync.set(o, () => chrome.runtime.lastError ? rej(chrome.runtime.lastError) : res()));
const sDel = k => new Promise(r => chrome.storage.sync.remove(k, r));
const lGet = k => new Promise(r => chrome.storage.local.get(k, r));
const lSet = o => new Promise(r => chrome.storage.local.set(o, r));

function sliceUtf8(str, max){
  // 按字节安全切片（避免拆断多字节字符）
  const enc = new TextEncoder(), dec = new TextDecoder();
  const bytes = enc.encode(str);
  const chunks = [];
  for(let i=0;i<bytes.length;){
    let end = Math.min(i+max, bytes.length);
    // 回退到完整字符边界
    while(end < bytes.length && (bytes[end] & 0xC0) === 0x80) end--;
    chunks.push(dec.decode(bytes.subarray(i,end)));
    i = end;
  }
  return chunks.length ? chunks : [''];
}

export async function loadConfig(){
  if(isExtension){
    // local 是唯一权威源：只要本机有配置就用它，杜绝跨设备/跨上下文的旧 sync 快照把本地改动(尤其删除)覆盖掉。
    try{ const localCfg = (await lGet(LOCAL))[LOCAL] || null; if(localCfg) return { config: localCfg, source:'local' }; }catch(e){}
    // 本机为空(首次安装 / 新设备)才从 sync 引导一次
    try{
      const meta = (await sGet(META))[META];
      if(meta && meta.chunks){
        const keys = Array.from({length:meta.chunks},(_,i)=>CHUNK+i);
        const parts = await sGet(keys);
        let s=''; for(let i=0;i<meta.chunks;i++) s += parts[CHUNK+i] || '';
        if(s) return { config: JSON.parse(s), source:'sync' };
      }
    }catch(e){ console.warn('sync 引导读取失败', e); }
    return { config:null, source:null };
  }
  const s = localStorage.getItem(LOCAL);
  return { config: s ? JSON.parse(s) : null, source: s ? 'local' : null };
}

/* sync 镜像节流：local 已是唯一权威，sync 只充当"新设备首次引导"的快照，不追实时。
 * 高频写 sync 会触发 Chrome 速率限制(每分钟/每小时写入上限)——之前被误报成"配置过大"。
 * 60s 内多次保存只写一次，窗口内合并为尾随一次（SW 短命上下文丢尾随也无妨，下次保存补上）。 */
const SYNC_MIN_GAP = 60000;
let _syncLastTs = 0, _syncTimer = null, _syncPendingJson = null;
async function _mirrorToSync(json, ver){
  const chunks = sliceUtf8(json, ITEM_BYTES);
  const oldMeta = (await sGet(META))[META];
  const obj = { [META]: { chunks: chunks.length, ts: Date.now(), v: ver || 1 } };
  chunks.forEach((c,i)=> obj[CHUNK+i] = c);
  await sSet(obj);
  // 清掉多余旧片
  if(oldMeta && oldMeta.chunks > chunks.length){
    const rm=[]; for(let i=chunks.length;i<oldMeta.chunks;i++) rm.push(CHUNK+i);
    await sDel(rm);
  }
}

export async function saveConfig(config){
  config.savedAt = Date.now();                 // 时间戳：本机 local 权威判新用
  const json = JSON.stringify(config);
  if(!isExtension){
    localStorage.setItem(LOCAL, json);
    return { ok:true, synced:false, reason:'preview' };
  }
  // 始终先镜像到 local（唯一权威，最快最可靠）
  await lSet({ [LOCAL]: config });
  const chunks = sliceUtf8(json, ITEM_BYTES);
  if(chunks.length > MAX_CHUNKS){
    return { ok:true, synced:false, reason:'too-large' };
  }
  const now = Date.now();
  if(now - _syncLastTs < SYNC_MIN_GAP){
    _syncPendingJson = json;
    clearTimeout(_syncTimer);
    _syncTimer = setTimeout(()=>{ const j=_syncPendingJson; _syncPendingJson=null; if(!j) return;
      _syncLastTs = Date.now(); _mirrorToSync(j, config.version).catch(()=>{}); }, SYNC_MIN_GAP - (now - _syncLastTs));
    return { ok:true, synced:false, reason:'throttled' };   // 本机已存好；sync 快照稍后跟上
  }
  _syncLastTs = now;
  try{
    await _mirrorToSync(json, config.version);
    return { ok:true, synced:true };
  }catch(e){
    console.warn('sync 写入失败（仅存本机）:', (e && e.message) || e);
    return { ok:true, synced:false, reason:'quota' };   // 归一化：core.save 据此给明确提示，不再假报「已保存」
  }
}

/* ---- popup → 新标签页 的增量收件箱 ----
 * popup 写整份配置仍可能被"开着的新标签页里未落盘的旧内存"覆盖（flushSave 时序）。
 * 故 popup 的增/删动作冗余记一份到 fn_inbox，由新标签页在 保存前/变更通知/启动 时兑现，
 * 配合会话墓碑（删除过的 id 不复活）保证 popup 收藏零丢失。 */
const INBOX = 'fn_inbox';
export async function pushInbox(ops){
  if(!isExtension || !ops || !ops.length) return;
  try{ const cur=(await lGet(INBOX))[INBOX]||[];
    const stamped=ops.map(o=>({ ...o, _k: Math.random().toString(36).slice(2)+Date.now().toString(36) }));   // 唯一键：drain 按键清理
    await lSet({ [INBOX]: cur.concat(stamped) }); }catch{}
}
export async function drainInbox(){
  if(!isExtension) return [];
  try{
    const cur=(await lGet(INBOX))[INBOX]||[]; if(!cur.length) return [];
    // 清理前重读、只清"本次读到"的条目——把「drain 期间 popup 又推入新 op 被整箱清掉」的丢失窗从整个处理期缩到一次读写间隙
    const took=new Set(cur.map(o=>o&&o._k).filter(Boolean));
    const latest=(await lGet(INBOX))[INBOX]||[];
    // 只保留「drain 期间新推入的带键条目」；无 _k 的一律视为已取走（两次 lGet 对象身份不同，includes 永假会造成永不清除→无限重放）
    const rest=latest.filter(o=> o && o._k && !took.has(o._k));
    await lSet({ [INBOX]: rest });
    return cur;
  }catch{ return []; }
}

/* 其他终端/其他上下文改动 → 回调（本地实时刷新）。
   同时监听 sync(跨端) 与 local(本机另一上下文，如工具栏一键收藏的 service worker 写入)，
   配合 core 里的 savedAt 守卫避免自我覆盖。 */
export function onRemoteChange(cb){
  if(!isExtension || !chrome.storage.onChanged) return;
  let t=null;
  chrome.storage.onChanged.addListener((changes, area)=>{
    // 只响应本机 local 变化(同浏览器另一上下文，如工具栏一键收藏的 SW 写入)——用于刷新 UI；
    // 不再响应跨设备 sync 推送，杜绝远端旧快照在后台覆盖本地(那是幽灵复活的根源)。
    const relevant = (area==='local' && changes[LOCAL]);
    if(relevant){ clearTimeout(t); t=setTimeout(cb, 200); }
  });
}

/* 浏览器书签 API（导入用） */
export function getBookmarksTree(){
  return new Promise((res)=>{
    if(isExtension && chrome.bookmarks) chrome.bookmarks.getTree(res);
    else res(null);
  });
}
