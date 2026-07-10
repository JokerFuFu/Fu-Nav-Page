/* ============ Service Worker：浏览器书签 ⇄ 导航 双向同步 + 已收藏角标 ============
 * 收藏当前页改由工具栏弹窗 popup.html 处理（action.default_popup）。
 * 本 SW 负责：
 *   1) 后台把「Fu 导航」书签文件夹与导航配置保持一致（双向同步，签名防回环）。
 *   2) 已收藏角标：当前标签页若已在导航中，工具栏图标显示绿色 ✓，不点开就知道，避免重复收藏。
 */
import { loadConfig, saveConfig } from './shared/storage.js';
import { exportConfig as bmExport, importConfig as bmImport, rootSignature, bmAvailable, cfgSignature, acquireBmLock, releaseBmLock } from './shared/bmsync.js';
import { normUrl } from './shared/icon-map.js';

function badge(text, color){
  try{ chrome.action.setBadgeText({text}); chrome.action.setBadgeBackgroundColor({color}); setTimeout(()=>chrome.action.setBadgeText({text:''}), 1500); }catch{}
}

/* ---- 已收藏角标（per-tab）---- */
let favSet=null;   // 归一化收藏网址集合，SW 生命周期内缓存
function collectUrls(groups){
  const set=new Set();
  const walk=items=>{ for(const it of (items||[])){ if(!it) continue;
    if(it.type==='folder') walk(it.items); else if(it.url) set.add(normUrl(it.url)); } };
  (groups||[]).forEach(g=>walk(g.items));
  return set;
}
function sameSet(a,b){ if(!a||!b||a.size!==b.size) return false; for(const v of a) if(!b.has(v)) return false; return true; }
async function ensureFavSet(){
  if(favSet) return favSet;
  try{ const { config:cfg }=await loadConfig(); favSet=collectUrls(cfg&&cfg.groups); }catch{ favSet=new Set(); }
  return favSet;
}
async function badgeForTab(tab){
  if(!tab || tab.id==null) return;
  try{
    const set=await ensureFavSet();
    const hit = !!(tab.url && set.has(normUrl(tab.url)));
    await chrome.action.setBadgeText({ tabId:tab.id, text: hit?'✓':'' });
    if(hit){
      chrome.action.setBadgeBackgroundColor({ tabId:tab.id, color:'#16a34a' });
      if(chrome.action.setBadgeTextColor) chrome.action.setBadgeTextColor({ tabId:tab.id, color:'#ffffff' });
    }
  }catch{}   // 标签已关闭 / chrome:// 等受限页面 → 忽略
}
async function badgeActiveTab(){ try{ const [t]=await chrome.tabs.query({active:true,currentWindow:true}); if(t) await badgeForTab(t); }catch{} }
async function badgeAllTabs(){ try{ const tabs=await chrome.tabs.query({}); for(const t of tabs) badgeForTab(t); }catch{} }

if(chrome.tabs){
  chrome.tabs.onActivated.addListener(async ({tabId})=>{ try{ const tab=await chrome.tabs.get(tabId); await badgeForTab(tab); }catch{} });
  chrome.tabs.onUpdated.addListener((tabId, info, tab)=>{ if(info.url || info.status==='complete') badgeForTab(tab); });
}
if(chrome.windows && chrome.windows.onFocusChanged) chrome.windows.onFocusChanged.addListener(()=>badgeActiveTab());
if(chrome.runtime.onStartup) chrome.runtime.onStartup.addListener(()=>{ favSet=null; badgeAllTabs(); });
if(chrome.runtime.onInstalled) chrome.runtime.onInstalled.addListener(()=>{ favSet=null; badgeAllTabs(); });

/* ---- 浏览器书签双向同步（原逻辑不变，只是 storage.onChanged 监听器改成同时服务角标）---- */
let timer=null, busy=false, pending=false;
function schedule(){ clearTimeout(timer); timer=setTimeout(reconcile, 900); }

async function reconcile(){
  if(busy){ pending=true; return; }
  busy=true;
  let lockToken=null;
  try{
    const { config:cfg } = await loadConfig();
    if(!cfg || !Array.isArray(cfg.groups) || !cfg.settings) return;
    const bm=cfg.settings.bmSync;
    if(!bm || !bm.enabled || !bmAvailable()) return;
    lockToken=await acquireBmLock('sw');
    if(!lockToken) return;                                  // 另一上下文正在导出，下轮书签/storage 事件自然补齐

    let changed=false;
    const prev=cfg.settings.bmSig || '';
    const curSig=await rootSignature();
    if(curSig !== prev){                                   // 浏览器侧有改动 → 拉回导航
      const r=await bmImport(cfg);
      changed = changed || r.added>0 || r.removed>0;
    }
    const newSig=await bmExport(cfg,{lockToken});          // 导航 → 浏览器（令两边一致；复用本轮 SW 锁）
    if(newSig !== (cfg.settings.bmSig||'')){ cfg.settings.bmSig=newSig; changed=true; }

    if(changed){ await saveConfig(cfg); badge('↺','#6e7bff'); }   // 打开的首页经 storage.onChanged 自动刷新
  }catch(e){ console.warn('书签同步失败', e); }
  finally{ if(lockToken) await releaseBmLock(lockToken); busy=false; if(pending){ pending=false; schedule(); } }
}

// 书签四类变更 → 一定要重新对一遍（浏览器侧改动的唯一入口，事件量小，不用过滤）
if(chrome.bookmarks){
  ['onCreated','onChanged','onRemoved','onMoved'].forEach(ev=>{
    if(chrome.bookmarks[ev]) chrome.bookmarks[ev].addListener(()=>schedule());
  });
}
// 配置变更 → 一次 loadConfig 同时服务「已收藏角标」与「书签同步」。
// 角标：收藏集变了(收藏增删/改网址/其它端同步)才重画所有标签；仅点击计数/缓存写入则跳过。
// 书签：只有导航「结构」（分组/网站的名称、网址、文件夹层级）真的变了才唤醒 reconcile()——
//   点一次网站卡片(clicks++)这类无关写入不该触发，否则会重演之前修过的"无限刷新"问题。
let lastSeenCfgSig=null;
if(chrome.storage && chrome.storage.onChanged){
  chrome.storage.onChanged.addListener(async ()=>{
    try{
      const { config:cfg } = await loadConfig();
      if(!cfg || !Array.isArray(cfg.groups)) return;
      const nextSet=collectUrls(cfg.groups);
      if(!sameSet(favSet, nextSet)){ favSet=nextSet; badgeAllTabs(); }
      const sig = cfgSignature(cfg);
      if(sig === lastSeenCfgSig) return;
      lastSeenCfgSig = sig;
      schedule();
    }catch{}
  });
}
