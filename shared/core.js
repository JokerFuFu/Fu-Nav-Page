/* ============ Fu 导航 · 共享内核 ============ */
import { isExtension, loadConfig, saveConfig, onRemoteChange, getBookmarksTree } from './storage.js';
import { mountItemIcon, mountGroupIcon } from './icons.js';
import { getWeather, preciseLocate, wmo } from './weather.js';
import { fetchAgentData, agentProbe } from './agent.js';
import { cloudEnabled, cloudGet, cloudPut, cloudTest } from './cloud.js';
import { lucide, hostOf, isPrivateHost, brandIcon, faviconCandidates, iconSearch } from './icon-map.js';
import { createIconEditor } from './icon-editor.js';
import { infinityToGroups, mergeInfinity } from './import-infinity.js';
import { exportConfig as bmExport, importConfig as bmImport, cfgSignature as bmCfgSig, bmAvailable, ROOT_TITLE } from './bmsync.js';
import { applyBackground, refreshOnlineBackground, effectiveTheme } from './background.js';
import { ACCENTS, DEFAULT_ACCENT_ID } from './accent-presets.js';
import { checkAllLinks as runLinkCheck, maybeAutoCheck } from './link-check.js';
import { putBgImage, deleteBgImage } from './bg-storage.js';

export const $  = (s,r=document)=>r.querySelector(s);
export const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
export const uid = p => p + Math.random().toString(36).slice(2,7) + Date.now().toString(36).slice(-3);
export function el(tag, cls, txt){ const e=document.createElement(tag); if(cls)e.className=cls; if(txt!=null)e.textContent=txt; return e; }

/* 同步复制到剪贴板（execCommand）：用户手势内即时完成，不受紧随其后的 window.open 抢焦点影响。
   navigator.clipboard.writeText 是异步的，开新标签会打断它导致复制失败——AI 发送场景必须用同步版。 */
export function copyTextSync(text){
  try{
    const ta=document.createElement('textarea'); ta.value=text;
    ta.setAttribute('readonly',''); ta.style.cssText='position:fixed;top:-9999px;left:-9999px;opacity:0';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    const ok=document.execCommand('copy'); document.body.removeChild(ta);
    if(!ok && navigator.clipboard) navigator.clipboard.writeText(text).catch(()=>{});   // 兜底再异步试一次
    return ok;
  }catch{ try{ navigator.clipboard && navigator.clipboard.writeText(text); }catch{} return false; }
}

export const ENGINES = {
  bing:{name:'Bing',badge:'B',q:'https://www.bing.com/search?q='},
  google:{name:'Google',badge:'G',q:'https://www.google.com/search?q='},
  baidu:{name:'百度',badge:'度',q:'https://www.baidu.com/s?wd='},
  ddg:{name:'DuckDuckGo',badge:'D',q:'https://duckduckgo.com/?q='},
};
/* 搜索 + AI 一体：q 模板支持直发；copy 类无 prefill 的打开主页并复制问题 */
export const PROVIDERS = {
  bing:      {name:'Bing',      kind:'search', icon:'bing',       q:'https://www.bing.com/search?q='},
  google:    {name:'Google',    kind:'search', icon:'google',     q:'https://www.google.com/search?q='},
  baidu:     {name:'百度',      kind:'search', icon:'baidu',      q:'https://www.baidu.com/s?wd='},
  kimi:      {name:'Kimi',      kind:'ai',     icon:'kimi-ai',    home:'https://www.kimi.com/', copy:true},
  chatgpt:   {name:'ChatGPT',   kind:'ai',     icon:'openai',     q:'https://chatgpt.com/?q='},
  claude:    {name:'Claude',    kind:'ai',     icon:'claude-ai', q:'https://claude.ai/new?q='},
  perplexity:{name:'Perplexity',kind:'ai',     icon:'perplexity', q:'https://www.perplexity.ai/search?q='},
  doubao:    {name:'豆包',      kind:'ai',     icon:'https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://www.doubao.com&size=64', home:'https://www.doubao.com/chat/', copy:true},
  deepseek:  {name:'DeepSeek',  kind:'ai',     icon:'deepseek',   home:'https://chat.deepseek.com/', copy:true},
};
const LUCIDE_GROUP_OPTS=['server','hard-drive','network','router','shield-check','monitor','radio','compass','flame','briefcase','clipboard-list','flask-conical','shopping-cart','film','music','wrench','book-open','folder','globe','star','cloud','database','cpu','gamepad-2','tv','rss'];
const COLORS=['#2563eb','#0891b2','#16a34a','#7c3aed','#64748b','#ef4444','#0ea5e9','#f59e0b','#14b8a6','#ec4899','#8b5cf6','#f43f5e','#6366f1','#22c55e','#eab308','#fb7185'];

class Core {
  constructor(){ this.cfg=null; this.layout=null; this.layoutMod=null; this.root=null; this.editing=false; this.agentData=null; this._saveT=null; this._pendingSave=null; this._quotaWarned=false; this._listeners=[]; }
  get settings(){ return this.cfg.settings; }
  get groups(){ return this.cfg.groups; }

  async boot(){
    const { config } = await loadConfig();
    this.cfg = (config && config.groups) ? config : await this.fetchSeed();
    this.migrate();
    const ql=new URLSearchParams(location.search).get('layout'); if(ql) this.settings.layout=ql; // 预览/截图用
    this.buildModalHost();
    this.wireChrome();
    this.applyTheme();
    if(!config) await this.save(true);
    await this.mountLayout(this.settings.layout || 'classic');
    // 远端变更：仅在 savedAt 严格更新时才回灌，杜绝"自己写入→读到旧/中间态覆盖内存→下次存旧值"的丢失循环
    onRemoteChange(async ()=>{ await this.flushSave();   // 先落盘本地未保存的防抖改动，避免被远端旧快照整体覆盖(吞掉刚删的卡片)
      const r=await loadConfig();
      if(r.config && (r.config.savedAt||0) > (this.cfg.savedAt||0)){ this.cfg=r.config; this.migrate();
        this._lastBmCfgSig=undefined;   // 换了一份新 cfg，旧的书签结构签名缓存已经不对应它了；不重置的话
                                         // 下次 save() 里 bmPush() 会误判"结构又变了"，白白再导出一次到书签，
                                         // 又触发 chrome.bookmarks.onChanged 唤醒 SW，形成第二条循环路径。
        this.applyTheme(); this.rerender(); this.toast('已更新'); } });
    // 本机 agent 数据（提醒/日历/AI日报）
    this.refreshAgent();
    // 不再开机自动从云拉取覆盖本地(会用云端旧快照冲掉本地改动)；跨设备同步改为设置里手动「从云恢复」
    // 跟随系统(auto)时，操作系统深浅色实时切换也要跟着换背景图（不用等用户手动点一次主题按钮）
    try{ matchMedia('(prefers-color-scheme: light)').addEventListener('change', ()=>{ if((this.settings.theme||'auto')==='auto') this.applyTheme(); }); }catch{}
    maybeAutoCheck(this);   // 距上次探测超 24 小时才会真的跑，不阻塞首屏渲染
  }
  async fetchSeed(){ try{ return await (await fetch('data/seed.json')).json(); }catch{ return {version:2,settings:this.defaults(),groups:[]}; } }
  defaults(){ return { title:'Fu.', layout:'fusion', theme:'auto', openIn:'_blank', searchEngine:'bing', askProvider:'bing', showClock:true, showWeather:true, showStatus:true, locked:true, cardView:'grid', privacy:false, sideCollapsed:false, agentPort:7842, agentToken:'fu-nav-local', cloud:{ enabled:false, type:'webdav', url:'', user:'', pass:'', gdriveClientId:'' }, bmSync:{ enabled:false }, bmSig:'',
      background:{ enabled:true, mode:'preset', presetId:'p01', onlineSource:'bing', onlineImageId:'', localImageId:'', scrimOpacity:0.55 },
      accentId: 'indigo', lastDeadCheck: 0,
      widgets:[{id:'w-clock',type:'clock'},{id:'w-weather',type:'weather'},{id:'w-today',type:'today',items:[],countdowns:[]}] }; }
  migrate(){ const s=this.cfg.settings||(this.cfg.settings=this.defaults()); for(const[k,v]of Object.entries(this.defaults())) if(s[k]===undefined)s[k]=v;
    if(s.title==='Fu 导航') s.title='Fu.';   // 品牌重塑：旧默认标题自动升级，用户自定义过的标题不动
    if(s.cloud && !s.cloud.type){ s.cloud.type='webdav'; if(s.cloud.gdriveClientId===undefined)s.cloud.gdriveClientId=''; } // 旧 cloud 配置补后端字段
    if(Array.isArray(s.widgets)){ s.widgets=s.widgets.filter(w=>w&&w.type!=='note'&&w.type!=='hitokoto'); // 移除已废弃的便签/一言
      const oldTodos=s.widgets.filter(w=>w.type==='todo'), oldCountdowns=s.widgets.filter(w=>w.type==='countdown');
      if(oldTodos.length || oldCountdowns.length){   // 首次升级：把旧的待办/倒数日卡片并进新的"今日"卡片，数据不丢
        const mergedItems=oldTodos.flatMap(w=>Array.isArray(w.items)?w.items:[]);
        const mergedCountdowns=oldCountdowns.filter(w=>w.date).map(w=>({id:uid('cd'),label:w.label||'倒数日',date:w.date}));
        s.widgets=s.widgets.filter(w=>w.type!=='todo'&&w.type!=='countdown');
        const existing=s.widgets.find(w=>w.type==='today');
        if(existing){ existing.items=[...(existing.items||[]),...mergedItems]; existing.countdowns=[...(existing.countdowns||[]),...mergedCountdowns]; }
        else s.widgets.push({id:'w-today',type:'today',items:mergedItems,countdowns:mergedCountdowns});
      }
    }   // 注意：不再"没 today 就强制补 today"——那会让用户删掉的今日卡每次 migrate 又复活（今日卡与其他卡一视同仁，可删可加）
    if(s.layout==='classic'||s.layout==='homepage') s.layout='fusion'; // 旧布局并入融合版
    if(s.background && s.background.onlineCacheUrl!==undefined){   // 旧字段是"会重定向的原始地址"，语义已变，不能留着误用
      delete s.background.onlineCacheUrl;
      if(s.background.onlineImageId===undefined) s.background.onlineImageId='';
      if(s.background.onlineSource===undefined) s.background.onlineSource='bing';
      if(s.background.mode==='online') s.background.mode='preset';   // 旧的在线壁纸设置这次直接失效，降级回预置图库，用户重新点一次"换一张"即可用新逻辑换回来
    }
    if(!s.deadCheckV2){ s.deadCheckV2=true; s.lastDeadCheck=0;   // 可达检测升级：清掉旧 favicon 时代的失效误标(含内网)，下次自动重检用 no-cors + 内网不标
      const clr=arr=>(arr||[]).forEach(it=>{ if(it&&it.type==='folder')clr(it.items); else if(it)delete it.deadSince; });
      this.groups.forEach(g=>clr(g.items)); }
    // 旧 emoji 分组图标 → 推断 lucide；文件夹条目补 items 数组
    for(const g of this.groups){ if(g.icon && /^[\x00-\x7f]+$/.test(g.icon)===false && !g.emoji){ g.emoji=g.icon; }
      const normF=arr=>(arr||[]).forEach(it=>{ if(it && it.type==='folder'){ if(!Array.isArray(it.items))it.items=[]; normF(it.items); } }); normF(g.items); } }

  async refreshAgent(){
    if(!isExtension){ this.agentData=null; return; }
    this.agentData = await fetchAgentData({port:this.settings.agentPort, token:this.settings.agentToken});
    this._emit('agent');
  }

  /* 防丢合并：把 latest 里我们内存没有的分组/条目并进来(按 id 并集)，避免覆盖掉如工具栏一键收藏(独立 SW)刚写入的内容 */
  _mergeIn(latest){ if(!latest||!Array.isArray(latest.groups))return; const mine=this.groups; const byId=new Map(mine.map(g=>[g.id,g]));
    for(const lg of latest.groups){ const mg=byId.get(lg.id);
      if(!mg){ mine.push(lg); continue; }                                  // 整组是新的 → 直接并入
      const have=new Set((mg.items||[]).map(i=>i.id));
      (lg.items||[]).forEach(it=>{ if(!have.has(it.id)) mg.items.push(it); }); // 组内并入缺失条目
    } }

  /* ---- 持久化 ---- */
  save(immediate){ clearTimeout(this._saveT); this._saveT=null;
    // 提为实例字段(run)，便于 onRemoteChange 回灌前 flush（否则防抖窗口内未落盘的改动会被远端旧快照整体覆盖→删除复活）
    const run=this._pendingSave=async()=>{
      // local 是唯一权威：直接存当前内存，不再做「防丢合并」(那个只加不删的合并正是删除被复活的元凶)
      await this.bmPush();        // 书签双向同步：导航变更 → 镜像到浏览器「Fu 导航」文件夹（内部按结构签名跳过无关变更）
      const r=await saveConfig(this.cfg);
      if(r.synced){ this.flashSync('已同步到所有终端'); this._quotaWarned=false; }
      else if(r.reason==='preview') this.flashSync('（预览：存于本浏览器）');
      else if(r.reason==='quota' || r.reason==='too-large'){
        // 超浏览器账号同步配额：本机 local 已存好。配了 WebDAV(不受 100KB 限制、在做跨端)就无需打扰；
        // 否则只在首次提示一次引导开 WebDAV，之后低调收尾，不再每次删改都弹红字。
        if(cloudEnabled(this.settings)) this.flashSync('已保存（跨端走云同步）');
        else if(!this._quotaWarned){ this._quotaWarned=true; this.toast('收藏较多，已超浏览器账号同步上限，现仅存本机；要跨设备同步请到 设置 → 同步与备份 开启 WebDAV 云同步','err'); }
        else this.flashSync('已保存（仅本机）');
      }
      else this.flashSync('已保存');
      this.cloudPush();           // 自托管云：改动后自动备份（内部防抖）
      if(this._pendingSave===run) this._pendingSave=null; };   // 落盘完成才清(且只清自己，不误清后来的 save)
    return immediate ? run() : (this._saveT=setTimeout(run,600)); }

  /* 把排队中的防抖保存立即落盘——远端回灌(onRemoteChange)前必须调用，
     否则防抖窗口内未落盘的改动(如刚删的卡片)会被远端旧快照整体覆盖，刷新后"复活"。 */
  async flushSave(){ const p=this._pendingSave; if(this._saveT){ clearTimeout(this._saveT); this._saveT=null; } if(p) await p(); }

  /* ---- 浏览器书签双向同步 ---- */
  bmOn(){ return !!(this.settings.bmSync && this.settings.bmSync.enabled); }
  /* 导航 → 浏览器（仅在分组/网站结构真的变了时才导出，避免每次点击都重做） */
  async bmPush(){ if(!isExtension || !this.bmOn() || !bmAvailable()) return;
    try{ const sig=bmCfgSig(this.cfg); if(sig===this._lastBmCfgSig) return;
      const newSig=await bmExport(this.cfg); this.settings.bmSig=newSig; this._lastBmCfgSig=sig; }catch(e){ console.warn('书签导出失败',e); } }
  /* 手动：立即导出（导航→浏览器） */
  async bmExportNow(){ if(!bmAvailable()){ this.toast('预览模式无法访问浏览器书签','err'); return false; }
    try{ const sig=await bmExport(this.cfg); this.settings.bmSig=sig; this._lastBmCfgSig=bmCfgSig(this.cfg); await this.save(true);
      this.toast(`已导出到浏览器「${ROOT_TITLE}」文件夹`,'ok'); return true; }catch(e){ this.toast('导出失败：'+(e&&e.message||e),'err'); return false; } }
  /* 手动：立即导入（浏览器→导航） */
  async bmImportNow(){ if(!bmAvailable()){ this.toast('预览模式无法访问浏览器书签','err'); return false; }
    try{ const r=await bmImport(this.cfg); this.settings.bmSig=r.sig; this._lastBmCfgSig=bmCfgSig(this.cfg); await this.save(true); this.rerender();
      this.toast(`书签已同步：新增 ${r.added}，移除 ${r.removed}`,'ok'); return true; }catch(e){ this.toast('导入失败：'+(e&&e.message||e),'err'); return false; } }

  /* ---- 自托管云同步（WebDAV）---- */
  cloudPush(immediate){ if(!isExtension || !cloudEnabled(this.settings)) return; clearTimeout(this._cloudT);
    const run=async()=>{ const r=await cloudPut(this.settings, this.cfg); this.flashSync(r.ok?'已备份到云':'云备份失败：'+(r.reason||'')); };
    return immediate ? run() : (this._cloudT=setTimeout(run, 3500)); }
  /* 启动后台拉取：仅当云端 savedAt 严格更新时才覆盖本地 */
  async cloudPull(){ if(!isExtension || !cloudEnabled(this.settings)) return;
    try{ const r=await cloudGet(this.settings);
      if(r.ok && r.config && r.config.groups && (r.config.savedAt||0) > (this.cfg.savedAt||0)){
        this.cfg=r.config; this.migrate(); this.applyTheme(); this.rerender(); await saveConfig(this.cfg); this.toast('已从云端拉取最新配置','ok'); }
    }catch{} }
  /* 手动：一键从云恢复（无条件覆盖本地）*/
  async cloudRestore(){ const r=await cloudGet(this.settings);
    if(r.ok && r.config && r.config.groups){ this.cfg=r.config; this.migrate(); this.applyTheme(); this.rerender(); await this.save(true); this.toast('已从云端恢复','ok'); return true; }
    this.toast('恢复失败：'+(r.reason||'云端无备份'),'err'); return false; }
  cloudTest(){ return cloudTest(this.settings); }
  /* 申请目标主机的跨域授权（在设置保存按钮的用户手势里调用）*/
  async ensureCloudPermission(url){ try{ if(!chrome.permissions||!url) return true; const o=new URL(url).origin+'/*';
    return await new Promise(res=>chrome.permissions.request({origins:[o]}, res)); }catch{ return true; } }

  /* ---- 布局 ---- */
  async mountLayout(name){
    this.layout=name; this.settings.layout=name;
    if(!this.root){ this.root=$('#root'); }
    try{ this.layoutMod = await import(`../layouts/${name}.js`); }
    catch(e){ console.error('布局加载失败',name,e); if(name!=='fusion'){ this.layout='fusion'; this.settings.layout='fusion'; try{ this.layoutMod=await import('../layouts/fusion.js'); }catch{ this.layoutMod=null; } } else this.layoutMod=null; }
    this.rerender();
    $$('.layout-switch [data-l]').forEach(b=>b.classList.toggle('on', b.dataset.l===name));
  }
  rerender(){ if(this.layoutMod && this.root){ this.root.textContent=''; try{ this.layoutMod.mount(this.root, this); }catch(e){ console.error('渲染失败',e); } } this._emit('render'); }
  switchLayout(name){ this.mountLayout(name); this.save(); }

  wireChrome(){ $$('.layout-switch [data-l]').forEach(b=>b.onclick=()=>this.switchLayout(b.dataset.l)); }
  on(ev,cb){ this._listeners.push([ev,cb]); }
  _emit(ev){ this._listeners.forEach(([e,cb])=>e===ev&&cb()); }

  /* ---- 主题 ---- */
  applyTheme(){ const qt=new URLSearchParams(location.search).get('theme'); document.body.dataset.theme=qt||this.settings.theme||'auto'; document.title=this.settings.title||'Fu.';
    this.applyAccent();
    if(this._onHome!==undefined) this.applyBackground(this._onHome);   // 主题变了，预置图库模式的背景图也跟着换深/浅版本
  }

  /* ---- 图标/天气/工具 透传 ---- */
  mountIcon(box,item,sz){ mountItemIcon(box,item,sz); }
  mountGroupIcon(box,group){ mountGroupIcon(box,group); }
  weather={ get:getWeather, locate:preciseLocate, wmo }; lucide=lucide; hostOf=hostOf; isPrivateHost=isPrivateHost; COLORS=COLORS; LUCIDE_GROUP_OPTS=LUCIDE_GROUP_OPTS; isExtension=isExtension; uid=uid;
  applyBackground(onHome){ this._onHome=onHome; return applyBackground(this, onHome); }
  refreshOnlineBackground(src){ return refreshOnlineBackground(this, src); }
  applyAccent(){ const a = ACCENTS.find(x=>x.id===this.settings.accentId) || ACCENTS[0];
    const v = a[effectiveTheme(this)] || a.dark; const body=document.body;
    if(a.id===DEFAULT_ACCENT_ID){ body.style.removeProperty('--accent'); body.style.removeProperty('--accent-strong'); body.style.removeProperty('--ring'); }
    else { body.style.setProperty('--accent', v.accent); body.style.setProperty('--accent-strong', v.strong); body.style.setProperty('--ring', v.ring); }
  }
  checkLinksNow(){ return runLinkCheck(this); }
  /* 本地上传背景图：只存 IndexedDB，config 里只留一个 id 引用（不进 chrome.storage.sync） */
  async setBackgroundLocal(file){
    if(!file) return { ok:false, reason:'未选择文件' };
    if(file.size > 8*1024*1024) return { ok:false, reason:'图片请小于 8MB' };
    const bg = this.settings.background;
    const oldId = bg.mode==='local' ? bg.localImageId : null;
    const id = await putBgImage(file);
    if(oldId && oldId!==id) await deleteBgImage(oldId);   // 换图后清掉旧的，避免 IndexedDB 无限堆积
    bg.mode='local'; bg.localImageId=id;
    this.save(true);
    await this.applyBackground(true);
    return { ok:true };
  }
  setBackgroundPreset(id){ const bg=this.settings.background; bg.mode='preset'; bg.presetId=id; this.save(true); this.applyBackground(true); }
  clearBackground(){ const bg=this.settings.background; bg.mode='none'; this.save(true); this.applyBackground(true); }

  openUrl(item, ev){ const t=this.settings.openIn==='_self'?'_self':'_blank'; if(ev){ev.preventDefault();} window.open(item.url, t, 'noopener'); }
  /* 首页常用（最多一排 12 个，超出自动换行）。fav 三态：true=固定 / false=排除(永不自动上首页) / 空=按点击自动。
     优先级：手动拖拽顺序(favOrder) → 显式固定(fav===true) → 访问次数(clicks) → 兜底「常用」分组。
     任何来源都跳过 fav===false（这正是“取消常用”能真正把卡片移出首页的关键）。 */
  favorites(){ const all=this.allItems();   // 含文件夹内的网站，文件夹本身不入常用
    const byId=id=>all.find(x=>x.item.id===id);
    const out=[], seen=new Set();
    const add=x=>{ if(x&&out.length<12&&!seen.has(x.item.id)&&x.item.fav!==false){ out.push(x); seen.add(x.item.id); } };
    (this.cfg.favOrder||[]).forEach(id=>add(byId(id)));
    all.filter(x=>x.item.fav===true).forEach(add);
    all.filter(x=>x.item.clicks>0).sort((a,b)=>(b.item.clicks||0)-(a.item.clicks||0)||(b.item.lastVisit||0)-(a.item.lastVisit||0)).forEach(add);
    const cm=this.groups.find(g=>/常用|收藏|favorite|book/i.test(g.name)); if(cm) cm.items.forEach(i=>add({item:i,group:cm}));
    return out.slice(0,12); }
  /* 该项当前是否显示在首页常用里（不论靠固定还是点击次数） */
  isFavored(item){ return !!item && this.favorites().some(x=>x.item.id===item.id); }
  /* 取消常用：硬排除(fav=false) + 从拖拽顺序里剔除，保证立刻离开首页且不会被点击次数带回来 */
  unfavorite(item){ if(!item)return; item.fav=false; if(Array.isArray(this.cfg.favOrder)) this.cfg.favOrder=this.cfg.favOrder.filter(id=>id!==item.id); this.save(true); }
  /* 设为常用：固定到首页 */
  pinFavorite(item){ if(!item)return; item.fav=true; this.save(true); }
  setFavOrder(ids){ this.cfg.favOrder=ids; this.save(true); }
  /* 递归定位（任意层级，含文件夹内）后移动到目标分组顶层；同组顶层为无操作，同组文件夹内=移出文件夹 */
  moveItemToGroup(iid, toGid){ const to=this.groups.find(g=>g.id===toGid); if(!to)return false;
    for(const g of this.groups){ const hit=this.flatItems(g).find(x=>x.item.id===iid);
      if(!hit) continue;
      if(g===to && !hit.folder) return false;
      this._removeItem(g, hit.item); to.items.push(hit.item); this.save(true); return true; }
    return false; }

  /* ===== 子文件夹（分组 → 文件夹 → 网站，两级）===== */
  isFolder(it){ return !!(it && it.type==='folder'); }
  /* 展平一个分组的全部可点击网站（任意层文件夹内），返回 [{item,group,folder?}] —— 搜索/常用用 */
  flatItems(g){ const out=[]; const walk=(arr,folder)=>{ (arr||[]).forEach(it=>{ if(this.isFolder(it)) walk(it.items,it); else out.push({item:it,group:g,folder}); }); }; walk(g.items,null); return out; }
  /* 全部网站（跨分组，含文件夹内） */
  allItems(){ const out=[]; this.groups.forEach(g=>out.push(...this.flatItems(g))); return out; }
  /* 递归：该分组里（任意层）是否包含此条目 */
  _containsItem(g, item){ const has=arr=>(arr||[]).includes(item)||(arr||[]).some(it=>this.isFolder(it)&&has(it.items||[])); return has(g.items||[]); }
  /* 递归：从某分组（任意层）移除条目 */
  _removeItem(g, item){ const rm=arr=>{ const i=arr.indexOf(item); if(i>=0){ arr.splice(i,1); return true; } for(const it of arr){ if(this.isFolder(it) && rm(it.items||(it.items=[]))) return true; } return false; }; return rm(g.items||[]); }
  /* 递归：所有文件夹（任意层），带 depth（0=顶层） —— 移入子菜单/侧栏树用 */
  allFolders(g){ const out=[]; const walk=(arr,depth)=>{ (arr||[]).forEach(it=>{ if(this.isFolder(it)){ out.push({folder:it,depth}); walk(it.items,depth+1); } }); }; walk(g.items,0); return out; }
  /* 某文件夹的直接父容器数组 + 所在分组 */
  _folderParent(folder){ for(const g of this.groups){ const find=arr=>{ if(arr.includes(folder))return arr; for(const it of arr){ if(this.isFolder(it)){ const r=find(it.items||[]); if(r)return r; } } return null; }; const arr=find(g.items||[]); if(arr) return {arr,group:g}; } return null; }
  /* 某条目所在的直接文件夹（任意层），无则 null */
  _itemFolder(g, item){ const find=arr=>{ for(const it of arr){ if(this.isFolder(it)){ if((it.items||[]).includes(item))return it; const r=find(it.items||[]); if(r)return r; } } return null; }; return find(g.items||[]); }
  /* 删除条目（跨分组、含文件夹内） */
  deleteItem(item){ for(const g of this.groups){ if(this._removeItem(g,item)){ this.save(true); this.rerender(); return true; } } return false; }
  /* 移入文件夹 / 移出文件夹 */
  moveItemToFolder(item, folder, g){ if(item===folder)return; if(this._removeItem(g,item)){ (folder.items||(folder.items=[])).push(item); this.save(true); this.rerender(); } }
  moveItemOutOfFolder(item, folder, g){ const j=(folder.items||[]).indexOf(item); if(j>=0){ folder.items.splice(j,1); g.items.push(item); this.save(true); this.rerender(); } }
  /* 新建/重命名/删除文件夹 */
  openFolderEditor(folder, gid, container){ const isNew=!folder; const nameI=this.inp(folder?.name||'', container?'子文件夹名称':'文件夹名称');
    const save=this.btn(isNew?'创建':'保存','primary',()=>{ const name=nameI.value.trim()||'新文件夹';
      if(isNew){ const arr = container || (this.groups.find(x=>x.id===gid)||{}).items; if(arr) arr.push({ id:uid('f'), type:'folder', name, icon:'folder', items:[] }); }
      else { folder.name=name; }
      this.save(true); this.rerender(); this.closeModal(); });
    const del = isNew ? null : this.btn('删除文件夹','danger',()=>{ const p=this._folderParent(folder); if(!p){this.closeModal();return;}
      const n=(folder.items||[]).length;
      if(n && !confirm(`文件夹「${folder.name}」内有 ${n} 项，删除后它们会移到上一层。确认？`)) return;
      const idx=p.arr.indexOf(folder); p.arr.splice(idx,1,...(folder.items||[]));   // 子项移到上一层，不丢
      this.save(true); this.rerender(); this.closeModal(); });
    this.openModal(isNew?'新建文件夹':'重命名文件夹',[this.field('名称',nameI)],[del,this.btn('取消','ghost',()=>this.closeModal()),save].filter(Boolean)); setTimeout(()=>nameI.focus(),50); }

  /* ---- 跳转分组（命令面板/外部调用，布局 mount 读 _navTo）---- */
  gotoGroup(gid){ this._navTo=gid; this.rerender(); }

  /* ====== 命令面板（⌘/Ctrl+K 或 /）：搜网站/分组/操作，键盘可达 ====== */
  openPalette(){ const back=$('#fnPalBack'), inp=$('#fnPalInp'), list=$('#fnPalList'); if(!back||!back.hidden)return;
    back.hidden=false;
    let rows=[], sel=0;
    const markSel=()=>{ rows.forEach((r,i)=>r.classList.toggle('sel', i===sel)); const s=rows[sel]; if(s)s.scrollIntoView({block:'nearest'}); };
    const mkRow=(o)=>{ const r=el('button','fn-pal-row'); const ic=el('span','fn-pal-ic');
      if(o.item) this.mountIcon(ic,o.item,32); else if(o.group) this.mountGroupIcon(ic,o.group);
      else { ic.classList.add('lucide-mask'); const u=`url("${lucide(o.ic||'circle')}")`; ic.style.webkitMaskImage=ic.style.maskImage=u; ic.style.background='currentColor'; }
      r.append(ic, el('span','fn-pal-nm',o.label)); if(o.sub) r.append(el('span','fn-pal-sub',o.sub));
      r._run=o.run; const idx=rows.length; r.onmouseenter=()=>{ sel=idx; markSel(); }; r.onclick=()=>r._run();
      rows.push(r); list.appendChild(r); };
    const render=()=>{ const q=inp.value.trim().toLowerCase(); list.textContent=''; rows=[];
      const sec=t=>list.appendChild(el('div','fn-pal-sec',t));
      const open=it=>{ this.recordVisit(it); window.open(it.url, this.settings.openIn==='_self'?'_self':'_blank'); this.closePalette(); };
      const actions=[
        {ic:'plus',label:'新建网站',run:()=>this.openItemEditor(null, this.groups[0]&&this.groups[0].id)},
        {ic:'layout-grid',label:'新建工作区',run:()=>{ const n=prompt('新工作区名称（如 运维 / 影音）'); if(!n||!n.trim())return;
          const g={id:uid('g'),name:'新分组',icon:'server',color:COLORS[0],collapsed:false,items:[],page:n.trim()};
          this.groups.push(g); this.save(true); this.rerender(); this.openGroupEditor(g); }},
        {ic:'cpu',label:'硬件监控设置',run:()=>{ const w=(this.settings.widgets||[]).find(x=>x.type==='hwmon'); w?this.openHwmonEditor(w):this.addWidget('hwmon'); }},
        {ic:'download',label:'导出备份',run:()=>this.exportConfig()},
        {ic:'upload',label:'导入备份',run:()=>this.importConfig()},
        {ic:'link',label:'检测失效链接',run:async()=>{ this.toast('检测中…'); await this.checkLinksNow(); this.toast('检测完成','ok'); }},
        {ic:'settings',label:'打开设置',run:()=>this.openSettings()},
        {ic:'sun-moon',label:'切换深浅色',run:()=>{ const seq=['auto','dark','light']; const i=seq.indexOf(this.settings.theme||'auto'); this.settings.theme=seq[(i+1)%3]; this.applyTheme(); this.save(); }},
        {ic:'bookmark',label:'导入浏览器书签',run:()=>this.importBookmarks()},
      ].filter(a=>!q || a.label.toLowerCase().includes(q));
      if(actions.length){ sec('操作'); actions.forEach(a=>mkRow({ic:a.ic,label:a.label,run:()=>{ this.closePalette(); a.run(); }})); }
      const groups=this.groups.filter(g=>!q || (g.name||'').toLowerCase().includes(q)).slice(0,6);
      if(groups.length){ sec('分组'); groups.forEach(g=>mkRow({group:g,label:g.name,sub:this.flatItems(g).length+' 个',run:()=>{ this.closePalette(); this.gotoGroup(g.id); }})); }
      const sites=this.allItems().filter(({item})=>!q || (item.name+' '+item.url+' '+(item.note||'')).toLowerCase().includes(q)).slice(0,9);
      if(sites.length){ sec('网站'); sites.forEach(({item,group})=>mkRow({item,label:item.name,sub:group.name,run:()=>open(item)})); }
      if(!rows.length) list.appendChild(el('div','fn-pal-empty','没有匹配项'));
      sel=0; markSel(); };
    inp.value=''; render(); setTimeout(()=>inp.focus(),20);
    inp.oninput=render;
    inp.onkeydown=e=>{ if(e.key==='ArrowDown'){ e.preventDefault(); if(rows.length){ sel=(sel+1)%rows.length; markSel(); } }
      else if(e.key==='ArrowUp'){ e.preventDefault(); if(rows.length){ sel=(sel-1+rows.length)%rows.length; markSel(); } }
      else if(e.key==='Enter'){ e.preventDefault(); const r=rows[sel]; if(r)r._run(); }
      else if(e.key==='Escape'){ e.preventDefault(); this.closePalette(); } };
  }
  closePalette(){ const b=$('#fnPalBack'); if(b)b.hidden=true; }

  /* ====== 面板内打开（iframe，仿 Sun-Panel，homelab 后台不跳页）====== */
  openFrame(item){ const back=$('#fnFrameBack'), ttl=$('#fnFrameTtl'), ext=$('#fnFrameExt'), body=$('#fnFrameBody');
    if(!back){ window.open(item.url, '_blank'); return; }
    ttl.textContent=item.name||item.url; ext.href=item.url; body.textContent='';
    const fr=el('iframe','fn-frame-if'); fr.src=item.url; fr.setAttribute('referrerpolicy','no-referrer'); fr.setAttribute('allow','fullscreen');
    body.appendChild(fr); back.hidden=false; this.recordVisit(item); }
  closeFrame(){ const b=$('#fnFrameBack'); if(b){ b.hidden=true; const body=$('#fnFrameBody'); if(body)body.textContent=''; } }

  /* ---- 在线状态探测（仅内网，只亮绿点）----
     攒一批经本机 agent TCP 直连探测（准，不受混合内容/自签证书/CORS 限制）；
     agent 没跑时回退 favicon Image 探测（http 站在扩展页会被浏览器拦，测不全但聊胜于无） */
  probeStatus(dotEl,item){ if(!this.settings.showStatus)return; const host=hostOf(item.url); if(!isPrivateHost(host))return;
    try{ new URL(item.url); }catch{ return; }
    const q=this._probeQ||(this._probeQ=[]); q.push([dotEl,item.url]);
    clearTimeout(this._probeT);
    this._probeT=setTimeout(async()=>{
      const batch=q.splice(0); if(!batch.length)return;
      const map=await agentProbe([...new Set(batch.map(([,u])=>u))], {port:this.settings.agentPort, token:this.settings.agentToken});
      batch.forEach(([dot,u])=>{ if(map){ if(map[u]){ dot.hidden=false; dot.classList.add('on'); } } else this._probeImg(dot,u); });
    },120); }
  _probeImg(dotEl,url){ let origin; try{origin=new URL(url).origin;}catch{return;} const img=new Image(); let done=false;
    const to=setTimeout(()=>{done=true;img.src='';},4000);
    img.onload=()=>{if(done)return;done=true;clearTimeout(to);dotEl.hidden=false;dotEl.classList.add('on');};
    img.onerror=()=>{done=true;clearTimeout(to);}; img.src=origin+'/favicon.ico?_t='+Date.now(); }

  /* ---- 搜索 ---- */
  currentEngine(){ return ENGINES[this.settings.searchEngine]||ENGINES.bing; }
  cycleEngine(){ const ks=Object.keys(ENGINES); const i=ks.indexOf(this.settings.searchEngine); this.settings.searchEngine=ks[(i+1)%ks.length]; this.save(); this._emit('engine'); }
  runSearch(q){ if(!q.trim())return; window.open(this.currentEngine().q+encodeURIComponent(q), this.settings.openIn==='_self'?'_self':'_blank'); }
  /* 搜索/AI 一体发送 */
  PROVIDERS=PROVIDERS;
  activeProvider(){ return (this.settings.askProvider && PROVIDERS[this.settings.askProvider]) ? this.settings.askProvider : 'bing'; }
  setProvider(id){ if(PROVIDERS[id]){ this.settings.askProvider=id; this.save(); } }
  ask(id, q){ const p=PROVIDERS[id]||PROVIDERS.bing; const tgt=this.settings.openIn==='_self'?'_self':'_blank'; q=(q||'').trim();
    if(!q){ window.open(p.home || (p.q?p.q.replace(/[?&]q=.*$/,''):'about:blank'), tgt); return; }
    if(p.kind==='ai'){
      // 有 ?q 查询 URL（ChatGPT/Claude/Perplexity 等）→ 内容进 URL 直接打开，像搜索引擎一样自动填入。
      // 无查询 URL 的 AI（Kimi/DeepSeek/豆包）→ 网站不认参数，只能复制到剪贴板让用户粘贴。
      // 关键：必须**同步**复制(execCommand)——navigator.clipboard.writeText 是异步的，紧接着的
      // window.open 会抢走焦点导致异步写入失败，输入的字就丢了(这正是之前 Kimi 等一直没内容的根因)。
      const copied = copyTextSync(q);
      window.open(p.q ? p.q+encodeURIComponent(q) : p.home, tgt);
      if(p.q) this.toast(`已在 ${p.name} 打开`+(copied?'（若没自动填入，内容已复制可 ⌘V 粘贴）':''), 'ok');
      else    this.toast(copied?`内容已复制 → 在 ${p.name} 按 ⌘V 粘贴发送`:`请在 ${p.name} 手动输入`, 'ok');
    } else { window.open(p.q+encodeURIComponent(q), tgt); } }
  recordVisit(item){ if(!item)return; item.clicks=(item.clicks||0)+1; item.lastVisit=Date.now(); this.save(); }
  iconSuggestions(name,url){ return iconSearch(name,url).filter(u=>u&&u!=='__letter__').slice(0,10); }

  /* ====== 模态 ====== */
  buildModalHost(){ if($('#fn-modal-host'))return; const h=el('div'); h.id='fn-modal-host'; h.innerHTML=`
    <div class="fn-backdrop" id="fnBackdrop" hidden><div class="fn-modal" role="dialog" aria-modal="true">
      <div class="fn-mhead"><h3 id="fnMTitle"></h3><button class="fn-x" id="fnMClose" title="关闭"><span class="lucide-mask" style="-webkit-mask-image:url('${lucide('x')}');mask-image:url('${lucide('x')}');width:14px;height:14px"></span></button></div>
      <div class="fn-mbody" id="fnMBody"></div><div class="fn-mfoot" id="fnMFoot"></div></div></div>
    <div class="fn-pal-back" id="fnPalBack" hidden><div class="fn-pal" role="dialog" aria-modal="true">
      <input class="fn-pal-inp" id="fnPalInp" placeholder="搜索网站 / 分组 / 操作…" autocomplete="off" spellcheck="false" />
      <div class="fn-pal-list" id="fnPalList"></div>
      <div class="fn-pal-foot"><span>↑↓ 选择</span><span><span class="lucide-mask" style="-webkit-mask-image:url('${lucide('corner-down-left')}');mask-image:url('${lucide('corner-down-left')}');width:11px;height:11px"></span> 打开</span><span>esc 关闭</span></div></div></div>
    <div class="fn-frame-back" id="fnFrameBack" hidden><div class="fn-frame">
      <div class="fn-frame-head"><span class="fn-frame-ttl" id="fnFrameTtl"></span>
        <a class="fn-frame-ext" id="fnFrameExt" target="_blank" rel="noopener"><span class="lucide-mask" style="-webkit-mask-image:url('${lucide('external-link')}');mask-image:url('${lucide('external-link')}');width:12px;height:12px"></span>新标签打开</a>
        <button class="fn-x" id="fnFrameClose" title="关闭"><span class="lucide-mask" style="-webkit-mask-image:url('${lucide('x')}');mask-image:url('${lucide('x')}');width:14px;height:14px"></span></button></div>
      <div class="fn-frame-body" id="fnFrameBody"></div></div></div>
    <div class="fn-toasts" id="fnToasts"></div><div class="fn-pill" id="fnPill" hidden></div>`;
    document.body.appendChild(h);
    $('#fnMClose').onclick=()=>this.closeModal(); $('#fnBackdrop').addEventListener('click',e=>{if(e.target===$('#fnBackdrop'))this.closeModal();});
    $('#fnPalBack').addEventListener('click',e=>{ if(e.target===$('#fnPalBack'))this.closePalette(); });
    $('#fnFrameClose').onclick=()=>this.closeFrame(); $('#fnFrameBack').addEventListener('click',e=>{ if(e.target===$('#fnFrameBack'))this.closeFrame(); });
    document.addEventListener('keydown',e=>{
      const tag=(e.target&&e.target.tagName)||''; const typing=/INPUT|TEXTAREA|SELECT/.test(tag)||(e.target&&e.target.isContentEditable);
      if((e.metaKey||e.ctrlKey)&&!e.altKey&&(e.key==='k'||e.key==='K')){ e.preventDefault(); $('#fnPalBack').hidden?this.openPalette():this.closePalette(); return; }
      if(e.key==='/'&&!typing&&$('#fnPalBack').hidden&&$('#fnBackdrop').hidden&&$('#fnFrameBack').hidden){ e.preventDefault(); this.openPalette(); return; }
      if(e.key==='Escape'){ if(!$('#fnPalBack').hidden){this.closePalette();return;} if(!$('#fnFrameBack').hidden){this.closeFrame();return;} if(!$('#fnBackdrop').hidden)this.closeModal(); }
    }); }
  openModal(title,body,foot){ $('#fnMTitle').textContent=title; const b=$('#fnMBody'),f=$('#fnMFoot'); b.textContent=''; f.textContent='';
    (Array.isArray(body)?body:[body]).forEach(n=>n&&b.appendChild(n)); (foot||[]).forEach(n=>n&&f.appendChild(n)); $('#fnBackdrop').hidden=false; }
  closeModal(){ $('#fnBackdrop').hidden=true; }
  field(label,input){ const w=el('div','fn-field'); if(label)w.appendChild(el('label',null,label)); w.appendChild(input); return w; }
  inp(v='',ph=''){ const i=el('input'); i.value=v; i.placeholder=ph; return i; }
  btn(t,cls,on,ic){ const b=el('button','fn-btn '+(cls||''));
    if(ic){ b.classList.add('has-ic'); const s=el('span','fn-btn-ic lucide-mask'); s.style.webkitMaskImage=s.style.maskImage=`url("${lucide(ic)}")`; s.style.background='currentColor'; b.append(s, el('span',null,t)); }
    else b.textContent=t;
    if(on)b.onclick=on; return b; }
  toggle(label,val,on){ const w=el('label','fn-switch'); const c=el('input'); c.type='checkbox'; c.checked=val; c.onchange=()=>on(c.checked); w.append(el('span',null,label),c); return w; }
  /* 分段选择（主题/打开方式/云端类型等）*/
  seg(opts,cur,on){ const w=el('div','fn-seg'); opts.forEach(([v,t])=>{ const b=el('button',null,t); if(v===cur)b.classList.add('on'); b.onclick=()=>{ $$('button',w).forEach(x=>x.classList.remove('on')); b.classList.add('on'); on(v); }; w.appendChild(b); }); return w; }
  /* 同步类弹层的「按钮行 + 状态行」组合（云 / 书签共用）*/
  syncActionRow(buttons,status){ const w=el('div'); const row=el('div','fn-wrap'); (buttons||[]).forEach(b=>b&&row.appendChild(b)); w.append(row,status); return w; }
  /* 可折叠分区（设置面板分区用）*/
  sect(title, nodes, open){ const d=el('details','fn-sect'); if(open)d.open=true; const s=el('summary','fn-sect-h'); const ar=el('span','fn-sect-ar lucide-mask'); ar.style.webkitMaskImage=ar.style.maskImage=`url("${lucide('chevron-down')}")`; s.append(el('span',null,title), ar); d.appendChild(s); (nodes||[]).forEach(n=>n&&d.appendChild(n)); return d; }

  /* 网站 增/改 —— 链接等信息可编辑 */
  openItemEditor(item, gid){ const isNew=!item; const addTo=this._addToFolder; this._addToFolder=null;   // 从文件夹弹层「＋添加到此」进来时，新条目落入该文件夹
    const nameI=this.inp(item?.name||'','名称'), urlI=this.inp(item?.url||'','https://…'), noteI=this.inp(item?.note||'','备注/副标题（可选）');
    const sel=el('select'); this.groups.forEach(g=>{const o=el('option',null,g.name);o.value=g.id;if(g.id===gid)o.selected=true;sel.appendChild(o);});
    const favC=this.toggle('固定到首页常用（不勾则按访问次数自动上榜）', item?.fav===true, ()=>{});
    const frameC=this.toggle('点击在面板内打开（iframe，适合内网后台，不跳页）', item?.frame===true, ()=>{});
    // ===== 图标编辑器（自动 / 纯色 / 在线 / 本地，仿 Infinity）=====
    const iconEd=createIconEditor({ icon:item?.icon||'', name:item?.name||'', url:item?.url||'' });
    nameI.addEventListener('input',()=>iconEd.setContext(nameI.value, urlI.value));
    urlI.addEventListener('input',()=>iconEd.setContext(nameI.value, urlI.value));
    const save=this.btn(isNew?'添加':'保存','primary',()=>{ let url=urlI.value.trim(); if(!url){this.toast('请填写网址','err');return;}
      if(!/^[a-z]+:\/\//i.test(url)&&!/^(javascript|chrome|edge|about):/i.test(url)) url='https://'+url;
      const data={name:nameI.value.trim()||hostOf(url)||url,url,note:noteI.value.trim(),icon:iconEd.getIcon(),fav:favC.querySelector('input').checked?true:undefined,frame:frameC.querySelector('input').checked?true:undefined};
      const tg=this.groups.find(g=>g.id===sel.value);
      if(!tg){ this.toast('目标分组已不存在','err'); return; }
      if(isNew){ data.id=uid('i'); if(addTo && addTo.gid===tg.id && this.isFolder(addTo.folder)){ (addTo.folder.items||(addTo.folder.items=[])).push(data); } else tg.items.push(data); } else { const keep=item.id; Object.assign(item,data); item.id=keep; const cur=this.groups.find(g=>this._containsItem(g,item)); if(cur&&cur!==tg){ this._removeItem(cur,item); tg.items.push(item); } }
      this.save(true);this.rerender();this.closeModal(); });
    const foot=[ isNew?null:this.btn('删除','danger',()=>{this.deleteItem(item);this.closeModal();}), this.btn('取消','ghost',()=>this.closeModal()), save ];   // deleteItem 递归定位（含文件夹内），与卡片悬停删除同一条路径
    const row=el('div','fn-row'); row.append(this.field('所属分组',sel),this.field('备注',noteI));
    this.openModal(isNew?'添加网站':'编辑网站',[this.field('名称',nameI),this.field('网址',urlI),row,this.field('图标',iconEd.node),favC,frameC],foot.filter(Boolean));
    setTimeout(()=>urlI.focus(),50); }

  /* 分组 增/改 */
  openGroupEditor(group){ const isNew=!group; const nameI=this.inp(group?.name||'','分组名称'); let color=group?.color||COLORS[0];
    const isUrl=v=>/^https?:\/\//.test(v||'');
    // 双轨：Lucide 线性图标 lucideSel + 联网图标 URL；保存时 URL 优先
    let lucideSel = isUrl(group?.icon) ? 'server' : (group?.icon || 'server');
    const urlI=this.inp(isUrl(group?.icon)?group.icon:'', '图标 URL（联网 logo，留空则用上面线性图标）');
    // Lucide 网格
    const ig=el('div','fn-icongrid');
    const markLucide=()=>$$('.fn-iconpick',ig).forEach(b=>b.classList.toggle('sel', b.dataset.n===lucideSel && !urlI.value.trim()));
    this.LUCIDE_GROUP_OPTS.forEach(n=>{const b=el('button','fn-iconpick'); b.type='button'; b.dataset.n=n; const s=el('span','fn-li'); s.style.webkitMaskImage=s.style.maskImage=`url("${lucide(n)}")`; s.style.background='currentColor'; b.appendChild(s);
      b.onclick=()=>{ lucideSel=n; urlI.value=''; markLucide(); markSug(); }; ig.appendChild(b);});
    // 联网图标：按分组名自动匹配的候选（点选写入 URL）+ 自定义 URL
    const sug=el('div','fn-iconsug');
    const markSug=()=>$$('.fn-isug',sug).forEach(b=>b.classList.toggle('sel', b.dataset.u===urlI.value.trim()));
    const renderSug=()=>{ sug.textContent='';
      this.iconSuggestions(nameI.value||group?.name, '').forEach(u=>{ const b=el('button','fn-isug'); b.type='button'; b.dataset.u=u;
        const img=new Image(); img.onerror=()=>b.remove(); img.src=u; b.appendChild(img);
        b.onclick=()=>{ urlI.value=u; markSug(); markLucide(); }; sug.appendChild(b); }); markSug(); };
    urlI.addEventListener('input',()=>{ markLucide(); markSug(); });
    nameI.addEventListener('input',()=>{ clearTimeout(this._gsugT); this._gsugT=setTimeout(renderSug,400); });
    const cg=el('div','fn-colorgrid'); COLORS.forEach(c=>{const b=el('button','fn-colorpick'+(c===color?' sel':''));b.type='button';b.style.background=c;b.onclick=()=>{color=c;$$('.fn-colorpick',cg).forEach(x=>x.classList.remove('sel'));b.classList.add('sel');};cg.appendChild(b);});
    const iconWrap=el('div'); iconWrap.append(ig, el('div','fn-sub','或联网图标（按分组名自动匹配，或填 URL）'), sug, urlI);
    const archC=this.toggle('归档此分组（收进侧栏「归档」折叠区，主列表不占位）', group?.archived===true, ()=>{});
    const save=this.btn(isNew?'创建':'保存','primary',()=>{const name=nameI.value.trim()||'新分组'; const icon=urlI.value.trim()||lucideSel; const archived=archC.querySelector('input').checked||undefined;
      if(isNew)this.groups.push({id:uid('g'),name,icon,color,collapsed:false,items:[],archived}); else{group.name=name;group.icon=icon;group.color=color;group.emoji='';group.archived=archived;} this.save(true);this.rerender();this.closeModal();});   // 工作区(page)不在此编辑，改由侧栏右键分组指定
    const foot=[ isNew?null:this.btn('删除分组','danger',()=>{if(group.items.length&&!confirm(`「${group.name}」内有 ${group.items.length} 个网站，确认删除整组？`))return;this.cfg.groups=this.groups.filter(g=>g!==group);this.save(true);this.rerender();this.closeModal();}), this.btn('取消','ghost',()=>this.closeModal()), save ];
    this.openModal(isNew?'新建分组':'编辑分组',[this.field('名称',nameI),this.field('图标',iconWrap),this.field('强调色',cg),archC],foot.filter(Boolean));
    setTimeout(()=>{nameI.focus();markLucide();renderSug();},50); }

  /* 卡片增删（首页右键 / 设置共用） */
  addWidget(type){ const ws=this.settings.widgets=(this.settings.widgets||[]); const w={id:uid('w'),type};
    if(type==='today'){ w.items=[]; w.countdowns=[]; } if(type==='hwmon')w.url='';
    if(type==='clock')this.settings.showClock=true; if(type==='weather')this.settings.showWeather=true;   // 加时钟/天气同时确保未被隐藏
    ws.push(w); this.save(); this.rerender(); if(type==='hwmon') this.openHwmonEditor(w); }   // 硬件监控加完即弹端点设置
  removeWidget(id){ this.settings.widgets=(this.settings.widgets||[]).filter(x=>x.id!==id); this.save(true); this.rerender(); }

  /* 硬件监控卡片编辑（Glances 端点）*/
  openHwmonEditor(w){ const labelI=this.inp(w.label||'硬件监控','名称'); const urlI=this.inp(w.url||'','http://127.0.0.1:7842（本机）或 http://服务器IP:61208');
    const hint=el('div','fn-hint'); hint.innerHTML='监控<b>本机（这台 Mac）</b>：装好 Fu 导航伴随服务（仓库 <code>agent/install.sh</code>）后填 <code>http://127.0.0.1:7842</code>，零额外依赖。<br>监控<b>其它服务器</b>：对接 <b>Glances</b>——目标机执行 <code>glances -w</code>（端口默认 <b>61208</b>），或 Docker：<br><code>docker run -d --restart=always --network host nicolargo/glances:latest-full glances -w</code><br>URL 填 <code>http://你的IP:61208</code>。首次保存会请求访问该地址的授权，点允许。';
    const save=this.btn('保存','primary',async()=>{ w.label=labelI.value.trim()||'硬件监控'; w.url=urlI.value.trim().replace(/\/+$/,''); if(w.url) await this.ensureCloudPermission(w.url); this.save(true); this.rerender(); this.closeModal(); });
    this.openModal('硬件监控（Glances）',[this.field('名称',labelI),this.field('Glances 端点',urlI),hint],[this.btn('取消','ghost',()=>this.closeModal()),save]); setTimeout(()=>urlI.focus(),50); }


  /* 云同步（WebDAV / Google Drive）子弹层 —— 从 openSettings 拆出（S1/S4），结构照 openHwmonEditor；关闭/保存回设置 */
  openCloudEditor(){ const s=this.settings;
    const cl = s.cloud || (s.cloud={enabled:false,type:'webdav',url:'',user:'',pass:'',gdriveClientId:''}); if(!cl.type)cl.type='webdav';
    const clUrl=this.inp(cl.url||'','https://你的群晖DDNS:5006/共享文件夹/'), clUser=this.inp(cl.user||'','WebDAV 账号'), clPass=this.inp(cl.pass||'','密码'); clPass.type='password';
    const clCid=this.inp(cl.gdriveClientId||'','xxxxx.apps.googleusercontent.com');
    const clStatus=el('div','fn-sub','');
    const DAV_HINT='存到你<b>自己的 WebDAV</b>（群晖「WebDAV Server」套件 / Nextcloud / 任意 WebDAV），数据在自己服务器、不靠第三方账号（仿 Floccus）。<br><b>群晖：</b>装 <code>WebDAV Server</code> 套件→启用 HTTPS（默认 5006）→建共享文件夹→URL 填 <code>https://你的DDNS:5006/文件夹/</code>，账号密码用 DSM 账号。首次「测试/备份」会弹授权该网址，点允许。';
    const GD_HINT='存到你的 <b>Google Drive</b>（应用隐藏空间 appData，不占可见文件）。需一次性自建 OAuth：<br>① <a href="https://console.cloud.google.com/" target="_blank">Google Cloud Console</a> 建项目→启用 <b>Google Drive API</b>；② 凭据→创建 OAuth 客户端 ID→类型选 <b>Web 应用</b>；③ 「已获授权的重定向 URI」填 <code id="fn-gdredir"></code>（这是本扩展的回调地址）；④ 把客户端 ID 粘到上面。iCloud 无对扩展开放的接口，做不了，用这两种之一。';
    const davBox=el('div'); const clRow=el('div','fn-row'); const fU=el('div','fn-field'); fU.append(el('label',null,'账号'),clUser); const fP=el('div','fn-field'); fP.append(el('label',null,'密码'),clPass); clRow.append(fU,fP);
    const fUrl=el('div','fn-field'); fUrl.appendChild(clUrl);   // 裸 input 需 .fn-field 皮肤（宽度/底色/焦点环）
    davBox.append(el('div','fn-sub','WebDAV 地址（填到目录）'), fUrl, clRow);
    const gdBox=el('div'); const fCid=el('div','fn-field'); fCid.appendChild(clCid); gdBox.append(el('div','fn-sub','Google OAuth Client ID'), fCid);
    const clHint=el('div','fn-hint');
    const cfgBox=el('div');
    const showByType=()=>{ cfgBox.hidden=!clToggle.querySelector('input').checked;   // S10: 启用开关驱动配置区显隐
      davBox.hidden=(cl.type!=='webdav'); gdBox.hidden=(cl.type!=='gdrive'); clHint.innerHTML=(cl.type==='gdrive'?GD_HINT:DAV_HINT);
      const re=$('#fn-gdredir',clHint); if(re&&isExtension&&chrome.identity){ try{re.textContent=chrome.identity.getRedirectURL();}catch{} } };
    const clToggle=this.toggle('启用（改动自动备份 + 启动自动拉取最新）', !!cl.enabled, ()=>showByType());
    const typeSeg=this.seg([['webdav','WebDAV / 群晖'],['gdrive','Google Drive']], cl.type, v=>{ cl.type=v; showByType(); });
    const applyCl=()=>{ cl.url=clUrl.value.trim(); cl.user=clUser.value.trim(); cl.pass=clPass.value; cl.gdriveClientId=clCid.value.trim(); cl.enabled=clToggle.querySelector('input').checked; };
    const missing=()=> cl.type==='webdav' ? !clUrl.value.trim() : !clCid.value.trim();
    const clBtns=[
      this.btn('测试连接','ghost',async()=>{ applyCl(); if(missing()){clStatus.textContent='请先填好上面的字段';return;} clStatus.textContent='测试中…'; if(cl.type==='webdav')await this.ensureCloudPermission(cl.url); const r=await this.cloudTest(); clStatus.textContent=(r.ok?'成功：':'失败：')+r.reason; },'plug-zap'),
      this.btn('立即备份到云','ghost',async()=>{ applyCl(); if(missing()){clStatus.textContent='请先填好上面的字段';return;} if(cl.type==='webdav')await this.ensureCloudPermission(cl.url); clStatus.textContent='备份中…'; const r=await cloudPut(this.settings,this.cfg); clStatus.textContent=r.ok?'已备份到云':'失败：'+(r.reason||''); this.save(); },'cloud-upload'),
      this.btn('从云恢复','ghost',async()=>{ applyCl(); if(missing()){clStatus.textContent='请先填好上面的字段';return;} if(!confirm('用云端配置覆盖本机当前配置？'))return; if(cl.type==='webdav')await this.ensureCloudPermission(cl.url); clStatus.textContent='恢复中…'; const ok=await this.cloudRestore(); clStatus.textContent=ok?'已从云恢复':'恢复失败'; if(ok)this.closeModal(); },'cloud-download'),
    ];
    cfgBox.append(el('div','fn-sub','云端'), typeSeg, davBox, gdBox, this.syncActionRow(clBtns,clStatus), clHint); showByType();
    this.openModal('云同步（WebDAV / Google Drive）',[clToggle, cfgBox],[
      this.btn('关闭','ghost',()=>this.openSettings()),
      this.btn('保存','primary',async()=>{ applyCl(); if(cl.enabled&&cl.url)await this.ensureCloudPermission(cl.url); this.save(true); this.openSettings(); }) ]); }

  /* 浏览器书签双向同步 子弹层 —— 从 openSettings 拆出（S1/S4）；关闭/保存回设置 */
  openBmEditor(){ const s=this.settings;
    const bmS = s.bmSync || (s.bmSync={enabled:false});
    const bmToggle=this.toggle('启用自动双向同步（导航改动↔浏览器书签实时互通）', !!bmS.enabled, ()=>{});
    const bmStatus=el('div','fn-sub','');
    const bmBtns=[
      this.btn('立即导出到书签','ghost',async()=>{ bmStatus.textContent='导出中…'; const ok=await this.bmExportNow(); bmStatus.textContent=ok?('已导出到浏览器「'+ROOT_TITLE+'」文件夹'):'导出失败'; },'upload'),
      this.btn('从书签导入','ghost',async()=>{ bmStatus.textContent='导入中…'; const ok=await this.bmImportNow(); bmStatus.textContent=ok?'已从浏览器书签同步':'导入失败'; },'download'),
    ];
    const bmHint=el('div','fn-hint'); bmHint.innerHTML='导航的分组/网站 与浏览器「书签栏 / <b>'+ROOT_TITLE+'</b>」文件夹保持一致：导航里增删改写入该文件夹，浏览器里增删改也会同步回导航（其它书签不动）。';
    this.openModal('浏览器书签同步',[bmToggle, this.syncActionRow(bmBtns,bmStatus), bmHint],[
      this.btn('关闭','ghost',()=>this.openSettings()),
      this.btn('保存','primary',async()=>{ const bmWas=!!bmS.enabled; bmS.enabled=bmToggle.querySelector('input').checked; this.save(true); if(bmS.enabled&&!bmWas)await this.bmExportNow(); this.openSettings(); }) ]); }

  /* 设置 —— 常用（默认展开）/ 同步与备份 / 高级 三层（S2/S7/S9）；云与书签同步收成「摘要+按钮→子弹层」（S1） */
  openSettings(){ const s=this.settings; const titleI=this.inp(s.title||'Fu 导航');
    const accentGrid=el('div','fn-colorgrid');
    ACCENTS.forEach(a=>{ const b=el('button','fn-colorpick'+(s.accentId===a.id?' sel':'')); b.type='button'; b.title=a.name;
      b.style.background=a.dark.accent;
      b.onclick=()=>{ s.accentId=a.id; $$('.fn-colorpick',accentGrid).forEach(x=>x.classList.remove('sel')); b.classList.add('sel'); this.applyAccent(); };
      accentGrid.appendChild(b); });
    const addRow=el('div','fn-wrap');
    [['today','今日'],['hwmon','硬件监控'],['weather','天气']].forEach(([t,lb])=>addRow.appendChild(this.btn(lb,'ghost',()=>{ if(t==='hwmon'){this.closeModal();} this.addWidget(t); if(t!=='hwmon')this.toast('已添加「'+lb+'」卡片，首页解锁后可拖拽排序','ok'); },'plus')));
    // 同步摘要（渐进披露：设置里只见状态，配置进子弹层）
    const cl=s.cloud||{}; const cloudSum= cl.enabled ? ('已启用 '+(cl.type==='gdrive'?'Google Drive':'WebDAV')) : ((cl.url||cl.gdriveClientId)?'已配置，未启用':'未配置');
    const bmSum=(s.bmSync&&s.bmSync.enabled)?'已启用自动双向同步':'未启用';
    const cloudWrap=el('div'); cloudWrap.append(el('div','fn-sub',cloudSum), this.btn('设置云同步','ghost',()=>this.openCloudEditor(),'cloud'));
    const bmWrap=el('div'); bmWrap.append(el('div','fn-sub',bmSum), this.btn('设置书签同步','ghost',()=>this.openBmEditor(),'bookmark'));
    const backupBtns=el('div','fn-wrap'); backupBtns.append(
      this.btn('导出备份','ghost',()=>this.exportConfig(),'download'),
      this.btn('导入备份','ghost',()=>this.importConfig(),'upload'),
      this.btn('导入浏览器书签','ghost',()=>this.importBookmarks(),'bookmark'));
    const backupHint=el('div','fn-hint'); backupHint.innerHTML='「导入备份」支持本应用备份与 <b>Infinity</b> 备份（.infinity 自动识别、按 URL 去重并入）；「检测失效链接」在命令面板（⌘K）。';
    const backupWrap=el('div'); backupWrap.append(backupBtns, backupHint);
    const info=el('div','fn-hint'); info.innerHTML=isExtension?'<b>浏览器账号同步已开启</b>：配置随 Chrome/Edge 账号自动同步到登录同账号的设备。要存到<b>自己的服务器</b>用上方「云同步」。提醒/日历/AI日报 需本机 <code>agent/</code> 服务。':'<b>预览模式</b>：配置仅存本浏览器；装成扩展后启用同步。';
    const dangerWrap=el('div','fn-wrap'); dangerWrap.append(
      this.btn('恢复默认','ghost',async()=>{if(confirm('用内置默认覆盖当前配置？')){this.cfg=await this.fetchSeed();this.migrate();this.applyTheme();this.rerender();this.save(true);this.closeModal();}},'rotate-ccw'));
    this.openModal('设置',[
      this.sect('常用',[
        this.field('标题',titleI),
        this.field('主题',this.seg([['auto','跟随系统'],['dark','深色'],['light','浅色']],s.theme,v=>{s.theme=v;this.applyTheme();})),
        this.field('强调色',accentGrid),
        this.toggle('显示时钟与问候',s.showClock,v=>{s.showClock=v;}),
        this.toggle('显示天气',s.showWeather,v=>{s.showWeather=v;}),
        this.toggle('内网在线状态探测',s.showStatus,v=>{s.showStatus=v;}),
        el('div','fn-sub','添加卡片（或在首页解锁后右键卡片区添加）'), addRow,
      ], true),
      this.sect('同步与备份',[
        this.field('云同步（WebDAV / Google Drive）',cloudWrap),
        this.field('浏览器书签双向同步',bmWrap),
        this.field('备份与导入',backupWrap),
        info,
      ]),
      this.sect('高级',[
        this.field('打开方式',this.seg([['_blank','新标签页'],['_self','当前页']],s.openIn,v=>{s.openIn=v;})),
        this.field('危险操作',dangerWrap),
      ]),
    ],[ this.btn('完成','primary',()=>{ s.title=titleI.value.trim()||'Fu 导航'; this.applyTheme(); this.save(true); this.rerender(); this.closeModal(); }) ]); }

  /* 书签导入 */
  async importBookmarks(){ const tree=await getBookmarksTree(); if(!tree){this.toast('预览模式无法读取浏览器书签','err');return;}
    const roots=[]; (tree[0]?.children||[]).forEach(r=>(r.children||[]).forEach(c=>{if(c.children)roots.push(c);}));
    const cnt=n=>{let c=0;(n.children||[]).forEach(x=>x.url?c++:c+=cnt(x));return c;};
    const flat=n=>{const a=[];(n.children||[]).forEach(x=>x.url?a.push({name:x.title||x.url,url:x.url}):a.push(...flat(x)));return a;};
    const box=el('div','fn-bmtree'); const picks=new Map();
    roots.filter(r=>cnt(r)>0).forEach(r=>{const row=el('label','fn-check');const c=el('input');c.type='checkbox';c.checked=true;row.append(c,el('span',null,r.title||'(未命名)'),el('span','fn-c',cnt(r)+''));box.appendChild(row);picks.set(r,c);});
    this.openModal('导入浏览器书签',[el('div','fn-hint','勾选要导入的文件夹（按文件夹建分组，去重）：'),box],
      [this.btn('取消','ghost',()=>this.closeModal()),this.btn('导入','primary',()=>{let n=0;picks.forEach((c,f)=>{if(!c.checked)return;const items=flat(f).map(x=>({id:uid('i'),name:x.name,url:x.url,note:'',icon:''}));if(!items.length)return;let g=this.groups.find(x=>x.name===(f.title||''));if(!g){g={id:uid('g'),name:f.title||'书签',icon:'star',color:COLORS[this.groups.length%COLORS.length],collapsed:false,items:[]};this.groups.push(g);}const seen=new Set(g.items.map(i=>i.url));items.forEach(it=>{if(!seen.has(it.url)){g.items.push(it);n++;}});});this.save(true);this.rerender();this.closeModal();this.toast(`已导入 ${n} 个书签`,'ok');})]); }

  exportConfig(){ const b=new Blob([JSON.stringify(this.cfg,null,2)],{type:'application/json'});const a=el('a');a.href=URL.createObjectURL(b);a.download='fu-nav-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);this.toast('已导出','ok'); }
  importConfig(){ const i=el('input');i.type='file';i.accept='.json,.infinity';i.onchange=()=>{const f=i.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(r.result);
    if(d && d.data && d.data.site){ return this._mergeInfinity(d); }   // Infinity 备份 → 合并导入
    if(!Array.isArray(d.groups))throw 0;this.cfg=d;this.migrate();this.applyTheme();this.rerender();this.save(true);this.closeModal();this.toast('已导入','ok');}catch{this.toast('文件格式错误','err');}};r.readAsText(f);};i.click(); }
  /* 逆向导入 Infinity New Tab 备份（.infinity），文件夹→分组、去重后并入 */
  importInfinity(){ const i=el('input');i.type='file';i.accept='.infinity,.json';i.onchange=()=>{const f=i.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{let d;try{d=JSON.parse(r.result);}catch{this.toast('文件解析失败','err');return;} this._mergeInfinity(d);};r.readAsText(f);};i.click(); }
  _mergeInfinity(d){ const parsed=infinityToGroups(d);
    if(!parsed.groups.length){ this.toast('未识别到 Infinity 收藏（请选 .infinity 备份文件）','err'); return; }
    const added=mergeInfinity(this.cfg, parsed); this.save(true); this.rerender(); this.closeModal();
    this.toast(`已导入 ${added} 个收藏（${parsed.groups.length} 组，已去重 ${parsed.stats.dropped}）`,'ok'); }

  /* 提示 */
  toast(msg,kind){ const t=el('div','fn-toast '+(kind||''),msg); $('#fnToasts').appendChild(t); setTimeout(()=>{t.style.opacity='0';t.style.transform='translateX(20px)';setTimeout(()=>t.remove(),250);},2600); }
  flashSync(msg){ const p=$('#fnPill'); if(!p)return; p.hidden=false; p.textContent=msg; clearTimeout(this._pt); this._pt=setTimeout(()=>p.hidden=true,1800); }
}

export const core = new Core();
core.boot();
