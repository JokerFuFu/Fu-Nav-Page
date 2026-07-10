/* ============ 首页背景图应用层 ============
 * 只负责：算出当前该显示什么背景、把它写进 body class + CSS 变量。
 * #bg-layer 是 position:fixed;inset:0;z-index:-2 的既有元素（newtab.html 里已有），
 * 覆盖整个视口；侧栏/模态/卡片都有自己的不透明背景色，天然盖在它上面，
 * 所以只要把这个应用限定在"当前路由是首页"时才生效，就等价于"只影响首页 Hero"。
 */
import { PRESETS } from './bg-presets.js';
import { putBgImage, deleteBgImage, bgObjectURL } from './bg-storage.js';

export const DEFAULT_ONLINE_SOURCE='ycy';
let autoRefreshInFlight=null;
const previewMode=()=>typeof chrome==='undefined'||!(chrome.storage&&chrome.storage.local);

/* 当前"生效"的主题（auto 时看系统偏好），供预置图挑选深/浅变体、强调色复用 */
export function effectiveTheme(core){
  const t = core.settings.theme || 'auto';
  if(t==='dark' || t==='light') return t;
  try{ return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; }catch{ return 'dark'; }
}

export async function applyBackground(core, onHome){
  const bg = core.settings.background;
  const body = document.body;
  if(!onHome || !bg || !bg.enabled || bg.mode==='none'){
    body.classList.remove('bg-photo');
    body.style.removeProperty('--fx-bg-img');
    return;
  }
  let url = null;
  if(bg.mode==='preset'){
    const p = PRESETS.find(x=>x.id===bg.presetId) || PRESETS[0];
    url = p ? (p[effectiveTheme(core)] || p.dark) : null;   // 浅色变体缺失兜底用深色版
  } else if(bg.mode==='online'){
    // 在线源现在也是本地缓存的一份图片二进制，跟"本地上传"走同一套存取，读的时候完全不发网络请求，
    // 也就不存在"存下来的地址每次加载都换一张"这个问题了（那是旧版直接存网络 URL 才有的坑）。
    url = await bgObjectURL(bg.onlineImageId);
    if(!url && previewMode()) url=bg.onlineDirectUrl||null;   // 预览受 CORS 限制，校验通过后仅存直连 URL
    if(!url){ // 换设备后本机没有缓存，当前页用预置图兜底，但保留 online 模式以便后台补拉
      bg.presetId = bg.presetId || 'p01';
      const dp = PRESETS.find(x=>x.id===bg.presetId)||PRESETS[0]; url = dp[effectiveTheme(core)] || dp.dark;
    }
    if(isOnlineRefreshDue(bg) && !autoRefreshInFlight){
      autoRefreshInFlight=refreshOnlineBackground(core,bg.onlineSrc||{id:DEFAULT_ONLINE_SOURCE},{apply:false})
        .catch(()=>null).finally(()=>{autoRefreshInFlight=null;});
    }
  } else if(bg.mode==='local'){
    url = await bgObjectURL(bg.localImageId);
    if(!url){ // 换设备后本机没有这张图 → 静默降级为预置默认图
      bg.mode='preset'; bg.presetId = bg.presetId || 'p01';
      const dp = PRESETS.find(x=>x.id===bg.presetId)||PRESETS[0]; url = dp[effectiveTheme(core)] || dp.dark;
    }
  }
  if(!url){ body.classList.remove('bg-photo'); body.style.removeProperty('--fx-bg-img'); return; }
  // 相对路径转绝对 URL：--fx-bg-img 经 var() 代入 base.css 时，相对 url() 会以样式表(/shared/)为基准
  // 解析而非文档根，导致 /shared/icons/... 404（扩展环境同理）；blob:/http(s):/data: 已是绝对，原样保留。
  const absUrl = /^(?:https?:|blob:|data:)/.test(url) ? url : new URL(url, document.baseURI).href;
  body.style.setProperty('--fx-bg-img', `url("${absUrl}")`);
  body.style.setProperty('--fx-bg-scrim', String(bg.scrimOpacity!=null ? bg.scrimOpacity : 0.55));
  body.classList.add('bg-photo');
}

/* ---- 在线源 ---- */
function ensurePermission(url){
  return new Promise(res=>{
    try{
      if(typeof chrome==='undefined' || !chrome.permissions){ res(true); return; } // 非扩展预览环境
      const origin = new URL(url).origin + '/*';
      chrome.permissions.request({origins:[origin]}, res);
    }catch{ res(true); }
  });
}

/* 必应每日壁纸：JSON 接口直接给出当天固定的图片路径，本身就是稳定 URL（非官方端点，服务方随时可能变） */
export async function fetchBingImage(){
  const ok = await ensurePermission('https://www.bing.com/HPImageArchive.aspx');
  if(!ok) return null;
  try{
    const r = await fetch('https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN');
    const d = await r.json();
    const rel = d && d.images && d.images[0] && d.images[0].url;
    return rel ? ('https://www.bing.com' + rel + '&w=1920') : null;
  }catch{ return null; }
}

export const ONLINE_SOURCES = [
  { id:'bing',   name:'必应每日',   group:'每日精选', desc:'每日一图', fetch:fetchBingImage },
  { id:'ycy',    name:'二次元自适应',group:'二次元', desc:'默认动漫源', endpoint:'https://t.alcy.cc/ycy' },
  { id:'moez',   name:'萌版自适应', group:'二次元', desc:'自适应尺寸', endpoint:'https://t.alcy.cc/moez' },
  { id:'ai',     name:'AI 自适应',  group:'其他', desc:'AI 随机图', endpoint:'https://t.alcy.cc/ai' },
  { id:'ysz',    name:'原神自适应', group:'二次元', desc:'自适应尺寸', endpoint:'https://t.alcy.cc/ysz' },
  { id:'pc',     name:'PC 横图',    group:'摄影', desc:'桌面横屏', endpoint:'https://t.alcy.cc/pc' },
  { id:'moe',    name:'萌版横图',   group:'二次元', desc:'桌面横屏', endpoint:'https://t.alcy.cc/moe' },
  { id:'fj',     name:'风景横图',   group:'摄影', desc:'风光摄影', endpoint:'https://t.alcy.cc/fj' },
  { id:'bd',     name:'白底横图',   group:'摄影', desc:'浅色简洁', endpoint:'https://t.alcy.cc/bd' },
  { id:'ys',     name:'原神横图',   group:'二次元', desc:'桌面横屏', endpoint:'https://t.alcy.cc/ys' },
  { id:'acg',    name:'ACG 动图',   group:'二次元', desc:'测试源，当前可能返回视频', endpoint:'https://t.alcy.cc/acg' },
  { id:'mp',     name:'移动竖图',   group:'其他', desc:'竖屏图片', endpoint:'https://t.alcy.cc/mp' },
  { id:'picsum', name:'Picsum',     group:'其他', desc:'随机摄影', endpoint:'https://picsum.photos/1920/1080' },
];

/* 把某个在线源解析成一份图片二进制。无论最终是 bing 那种"JSON 直接给固定 URL"，
 * 还是 anime/photo 那种"请求会 301→302 重定向到随机图"，统一在这一步把图下载完存住——
 * 下载完之后这份 blob 就跟网络彻底脱钩了，不再关心解析出来的 URL 是否"稳定"，
 * 从根上避免"存下来的地址每次浏览器加载都命中新图"的问题（这正是这次要修的 bug 的根因）。 */
async function sourceUrl(src){
  let url;
  if(src.fetch){ url = await src.fetch(); if(!url) return null; }
  else { url = src.endpoint + (src.endpoint.includes('?')?'&':'?') + 'r=' + Date.now(); }
  return url;
}

async function fetchImageBlob(url){
  if(!url)return null;
  const ok = await ensurePermission(url);
  if(!ok) return null;
  try{
    const r = await fetch(url, { redirect:'follow', cache:'no-store' });
    if(!r.ok) return null;
    const blob=await r.blob(), type=(r.headers.get('content-type')||blob.type||'').toLowerCase();
    return type.startsWith('image/') ? blob : null;
  }catch{ return null; }
}

export async function fetchSourceBlob(src){ return fetchImageBlob(await sourceUrl(src)); }

function validateDirectImage(url){ return new Promise(resolve=>{
  if(!previewMode() || typeof Image==='undefined'){resolve(false);return;}
  const img=new Image(), done=ok=>{ clearTimeout(timer); img.onload=img.onerror=null; resolve(ok); };
  const timer=setTimeout(()=>done(false),12000); img.onload=()=>done(true); img.onerror=()=>done(false); img.src=url;
}); }

export function isOnlineRefreshDue(bg,now=Date.now()){
  const minutes=Number(bg&&bg.refreshEvery)||0;
  return minutes>0 && now-(Number(bg&&bg.lastFetchAt)||0)>minutes*60000;
}

function resolveSource(ref){
  if(ref && typeof ref==='object' && ref.id==='custom' && /^https?:\/\//i.test(ref.url||'')) return {id:'custom',name:'自定义源',group:'其他',desc:'用户地址',endpoint:ref.url,url:ref.url};
  const id=typeof ref==='string'?ref:(ref&&ref.id);
  return ONLINE_SOURCES.find(s=>s.id===id) || ONLINE_SOURCES.find(s=>s.id===DEFAULT_ONLINE_SOURCE);
}

export async function refreshOnlineBackground(core, sourceRef, options={}){
  const src = resolveSource(sourceRef);
  const url=await sourceUrl(src), blob = await fetchImageBlob(url);
  const directOk=!blob && await validateDirectImage(url);
  if(!blob && !directOk) return { ok:false, reason:'该地址未返回图片，请检查' };   // 下载失败：不动 settings.background，当前壁纸保持不变
  const bg = core.settings.background;
  const oldId = bg.mode==='online' ? bg.onlineImageId : null;
  const id = blob ? await putBgImage(blob) : '';
  if(oldId && oldId!==id) await deleteBgImage(oldId);   // 换图后清掉旧的，避免 IndexedDB 无限堆积
  bg.mode = 'online';
  bg.onlineSrc = src.id==='custom'?{id:'custom',url:src.url}:{id:src.id};
  bg.onlineImageId = id;
  if(directOk)bg.onlineDirectUrl=url; else delete bg.onlineDirectUrl;
  bg.lastFetchAt=Date.now();
  core.save(true);
  if(options.apply!==false) await applyBackground(core, true);
  return { ok:true };
}
