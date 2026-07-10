/* ============ 浏览器书签 ⇄ 导航 双向同步（支持子文件夹）============
 * 契约：浏览器「书签栏 / Fu 导航」文件夹 与 导航的分组/网站/子文件夹 保持一致。
 *   - 导出 export：让该文件夹"等于"导航（分组→子文件夹，网站→书签，导航子文件夹→浏览器子文件夹；多删少补）。
 *   - 导入 import：把该文件夹里的改动（增/删/改名/子文件夹）拉回导航。
 *   - 防回环：每次同步后记录该文件夹的"签名"，监听到的变更若签名未变即判定为自己写入，忽略。
 * 安全：分组、子文件夹的"整体删除"不自动从浏览器传播回导航（只增/改名 + 删除确曾同步的单条书签），避免误删。
 * 图标只存在导航侧（书签 API 不存图标），故导入不覆盖已有条目的图标；改名以浏览器为准（双向收敛）。
 */
import { isExtension } from './storage.js';
import { normUrl } from './icon-map.js';

export const ROOT_TITLE = 'Fu 导航';
const GROUP_COLORS=['#2563eb','#0891b2','#16a34a','#7c3aed','#64748b','#ef4444','#0ea5e9','#f59e0b','#14b8a6','#ec4899','#8b5cf6','#f43f5e'];
const uid = p => p + Math.random().toString(36).slice(2,7) + Date.now().toString(36).slice(-3);
const S1='', S2='', S3='', S4='', S5='';   // 签名分隔符
const isFolder = it => !!(it && it.type==='folder');
const BM_LOCK='bm_lock', BM_LOCK_TTL=30000;
const CONTEXT_ID=Math.random().toString(36).slice(2,9);
let _exporting=null;

export function bmAvailable(){ return isExtension && typeof chrome!=='undefined' && !!(chrome.bookmarks); }

/* Promise 包装（忽略 lastError，避免未捕获报错） */
const B = {
  getTree:    ()=>new Promise(r=>chrome.bookmarks.getTree(t=>{ void chrome.runtime.lastError; r(t||[]); })),
  getSubTree: id=>new Promise(r=>chrome.bookmarks.getSubTree(id,t=>{ void chrome.runtime.lastError; r((t&&t[0])||null); })),
  getChildren:id=>new Promise(r=>chrome.bookmarks.getChildren(id,c=>{ void chrome.runtime.lastError; r(c||[]); })),
  create:  o=>new Promise(r=>chrome.bookmarks.create(o,n=>{ void chrome.runtime.lastError; r(n||null); })),
  update:  (id,o)=>new Promise(r=>chrome.bookmarks.update(id,o,n=>{ void chrome.runtime.lastError; r(n||null); })),
  remove:  id=>new Promise(r=>chrome.bookmarks.remove(id,()=>{ void chrome.runtime.lastError; r(); })),
  removeTree:id=>new Promise(r=>chrome.bookmarks.removeTree(id,()=>{ void chrome.runtime.lastError; r(); })),
};

const lockGet=()=>new Promise(r=>chrome.storage.local.get(BM_LOCK,o=>{ void chrome.runtime.lastError; r((o&&o[BM_LOCK])||null); }));
const lockSet=v=>new Promise(r=>chrome.storage.local.set({[BM_LOCK]:v},()=>{ void chrome.runtime.lastError; r(); }));
const lockDel=()=>new Promise(r=>chrome.storage.local.remove(BM_LOCK,()=>{ void chrome.runtime.lastError; r(); }));
const wait=ms=>new Promise(r=>setTimeout(r,ms));

/* chrome.storage 没有原子 compare-and-set：写入后短暂让出并回读，只有最终持有者进入导出。 */
export async function acquireBmLock(kind='newtab'){
  if(!bmAvailable()) return null;
  const now=Date.now(), current=await lockGet();
  if(current && now-(current.ts||0)<BM_LOCK_TTL) return null;
  const token=`${kind}:${CONTEXT_ID}:${now.toString(36)}:${Math.random().toString(36).slice(2,7)}`;
  await lockSet({ts:now,owner:token});
  await wait(40+Math.floor(Math.random()*40));
  const held=await lockGet();
  return held && held.owner===token ? token : null;
}

export async function releaseBmLock(token){
  if(!token || !bmAvailable()) return;
  const held=await lockGet();
  if(held && held.owner===token) await lockDel();   // 不得误删已被超时接管的新锁
}

/* 书签栏节点 id（根的第一个文件夹） */
async function barId(){ const tree=await B.getTree(); const roots=(tree[0]&&tree[0].children)||[]; return (roots[0]&&roots[0].id)||'1'; }

/* 找到/创建根文件夹「Fu 导航」；历史重复根保留最早一份，其余镜像树清掉。 */
async function ensureRoot(){
  const bar=await barId();
  let roots=(await B.getChildren(bar)).filter(c=>!c.url && c.title===ROOT_TITLE);
  if(!roots.length){ await B.create({ parentId:bar, title:ROOT_TITLE }); roots=(await B.getChildren(bar)).filter(c=>!c.url && c.title===ROOT_TITLE); }
  roots.sort((a,b)=>(a.dateAdded||0)-(b.dateAdded||0)||String(a.id).localeCompare(String(b.id)));
  const keep=roots[0];
  for(const extra of roots.slice(1)) await B.removeTree(extra.id);
  if(roots.length>1) console.info(`书签同步：已清理 ${roots.length-1} 个重复「${ROOT_TITLE}」根文件夹`);
  return keep && keep.id;
}

/* 子树 → 稳定签名（递归一层子文件夹；文件夹名 + 书签[标题|URL]，排序无关） */
function bmSig(node){   // 递归任意层
  const bm=(node.children||[]).filter(k=>k.url).map(k=>(k.title||'')+S1+normUrl(k.url)).sort();
  const sub=(node.children||[]).filter(k=>!k.url).map(sf=>(sf.title||'')+S2+bmSig(sf)).sort();
  return bm.join(S3)+S5+sub.join(S3);
}
function sigOf(rootNode){
  const folders=((rootNode&&rootNode.children)||[]).filter(c=>!c.url);
  return folders.map(f=>(f.title||'')+S2+bmSig(f)).sort().join(S4);
}

/* 当前根文件夹签名（监听守卫用） */
export async function rootSignature(){ if(!bmAvailable())return''; const id=await ensureRoot(); if(!id)return''; const node=await B.getSubTree(id); return sigOf(node); }

/* 把一个父书签节点对齐到一组导航条目（递归子文件夹一层；多删少补） */
async function reconcileInto(parentId, items){
  const kids=await B.getChildren(parentId);
  const byUrl=new Map(), subByTitle=new Map();
  kids.filter(k=>k.url).forEach(k=>{ const key=normUrl(k.url); if(!byUrl.has(key)) byUrl.set(key,k); });
  kids.filter(k=>!k.url).forEach(k=>{ if(!subByTitle.has(k.title)) subByTitle.set(k.title,k); });
  const wantUrl=new Set(), wantSub=new Set();
  for(const it of (items||[])){
    if(isFolder(it)){
      wantSub.add(it.name);
      let sf=subByTitle.get(it.name);
      if(!sf) sf=await B.create({ parentId, title:it.name||'文件夹' });
      if(sf) await reconcileInto(sf.id, it.items||[]);   // 递归一层
      continue;
    }
    if(!/^https?:\/\//i.test(it.url||'')) continue;
    const k=normUrl(it.url); wantUrl.add(k);
    const bk=byUrl.get(k);
    if(!bk) await B.create({ parentId, title:it.name||it.url, url:it.url });
    else if((bk.title||'')!==(it.name||it.url)) await B.update(bk.id,{ title:it.name||it.url });
  }
  for(const k of kids){
    if(k.url){ if(!wantUrl.has(normUrl(k.url))) await B.remove(k.id); }      // 多余书签
    else { if(!wantSub.has(k.title)) await B.removeTree(k.id); }            // 多余子文件夹
  }
  // 收尾清扫：Map 只能选出一个匹配项，不能自动删除存量重复；每层都要显式收敛。
  const fresh=await B.getChildren(parentId), seenUrl=new Set(), seenFolder=new Set();
  for(const k of fresh){
    const key=k.url?normUrl(k.url):(k.title||'');
    const seen=k.url?seenUrl:seenFolder;
    if(seen.has(key)){ if(k.url) await B.remove(k.id); else await B.removeTree(k.id); }
    else seen.add(key);
  }
}

async function runExport(cfg, options){
  let token=options&&options.lockToken, ownLock=false;
  if(!token){ token=await acquireBmLock((options&&options.owner)||'newtab'); if(!token) return null; ownLock=true; }
  try{
  const rootId=await ensureRoot(); if(!rootId) return '';
  const folders=(await B.getChildren(rootId)).filter(c=>!c.url);
  const byTitle=new Map(); folders.forEach(f=>{ if(!byTitle.has(f.title)) byTitle.set(f.title,f); });
  const wanted=new Set((cfg.groups||[]).map(g=>g.name));
  for(const g of (cfg.groups||[])){
    let folder=byTitle.get(g.name);
    if(!folder) folder=await B.create({ parentId:rootId, title:g.name });
    if(!folder) continue;
    await reconcileInto(folder.id, g.items||[]);
  }
  for(const f of folders) if(!wanted.has(f.title)) await B.removeTree(f.id);   // 导航已删的分组 → 删对应文件夹
  // 根下也可能有并发生成的同名分组镜像，按标题保留第一份。
  const fresh=await B.getChildren(rootId), seen=new Set();
  for(const f of fresh.filter(c=>!c.url)){ if(seen.has(f.title)) await B.removeTree(f.id); else seen.add(f.title); }
  const node=await B.getSubTree(rootId); return sigOf(node);
  }finally{ if(ownLock) await releaseBmLock(token); }
}

/* 导出：让「Fu 导航」文件夹等于当前导航（多删少补）。同上下文复用 in-flight，跨上下文由 storage 锁互斥。 */
export async function exportConfig(cfg, options){
  if(!bmAvailable()) return '';
  if(_exporting) return _exporting;
  _exporting=runExport(cfg,options);
  try{ return await _exporting; }finally{ _exporting=null; }
}

/* 导入：把「Fu 导航」文件夹的增/删/改名/子文件夹并回导航，返回 { added, removed, sig } */
export async function importConfig(cfg){
  if(!bmAvailable()) return { added:0, removed:0, sig:'' };
  const rootId=await ensureRoot(); if(!rootId) return { added:0, removed:0, sig:'' };
  const node=await B.getSubTree(rootId);
  const folders=((node&&node.children)||[]).filter(c=>!c.url);
  let added=0, removed=0, ci=(cfg.groups||[]).length;

  /* 把浏览器节点的子项(书签+子文件夹)递归对齐到 navArr（增/改名 + 删除确曾同步的书签；文件夹整体删不自动传播）*/
  const mergeChildren=(navArr, browserChildren)=>{
    const bm=browserChildren.filter(k=>k.url);
    const browserUrls=new Set(bm.map(k=>normUrl(k.url)));
    const navByUrl=new Map(navArr.filter(it=>!isFolder(it)).map(it=>[normUrl(it.url),it]));
    for(const k of bm){ const it=navByUrl.get(normUrl(k.url));
      if(!it){ navArr.push({ id:uid('i'), name:k.title||k.url, url:k.url, note:'', icon:'' }); added++; }
      else if(k.title && it.name!==k.title){ it.name=k.title; } }
    const subs=browserChildren.filter(k=>!k.url);
    for(const sf of subs){ let nf=navArr.find(it=>isFolder(it)&&it.name===sf.title);
      if(!nf){ nf={ id:uid('f'), type:'folder', name:sf.title||'文件夹', icon:'folder', items:[] }; navArr.push(nf); }
      mergeChildren(nf.items, sf.children||[]); }   // 递归任意层子文件夹
    const before=navArr.length;
    const kept=navArr.filter(it=> isFolder(it) ? true : browserUrls.has(normUrl(it.url)) );
    removed += before-kept.length;
    if(kept.length!==before){ navArr.length=0; navArr.push(...kept); }
  };

  for(const f of folders){
    let g=(cfg.groups||[]).find(x=>x.name===f.title);
    if(!g){ g={ id:uid('g'), name:f.title||'书签', icon:'folder', color:GROUP_COLORS[ci++%GROUP_COLORS.length], collapsed:false, items:[] }; cfg.groups.push(g); }
    mergeChildren(g.items, f.children||[]);
  }
  return { added, removed, sig:sigOf(node) };
}

/* 轻量结构签名（core 判断"导航是否真的变了"，含文件夹内项；避免每次点击都重做导出） */
function itemsSig(items){ return (items||[]).map(i=> isFolder(i) ? ('F'+S2+(i.name||'')+S2+itemsSig(i.items)) : ((i.name||'')+S1+normUrl(i.url)) ).join(S3); }
export function cfgSignature(cfg){ return (cfg.groups||[]).map(g=>(g.name||'')+S2+itemsSig(g.items)).join(S4); }
