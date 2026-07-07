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

/* 书签栏节点 id（根的第一个文件夹） */
async function barId(){ const tree=await B.getTree(); const roots=(tree[0]&&tree[0].children)||[]; return (roots[0]&&roots[0].id)||'1'; }

/* 找到/创建 根文件夹「Fu 导航」，返回其 id */
async function ensureRoot(){
  const bar=await barId();
  const kids=await B.getChildren(bar);
  const hit=kids.find(c=>!c.url && c.title===ROOT_TITLE);
  if(hit) return hit.id;
  const node=await B.create({ parentId:bar, title:ROOT_TITLE });
  return node && node.id;
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
  const byUrl=new Map(kids.filter(k=>k.url).map(k=>[normUrl(k.url),k]));
  const subByTitle=new Map(kids.filter(k=>!k.url).map(k=>[k.title,k]));
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
}

/* 导出：让「Fu 导航」文件夹等于当前导航（多删少补），返回新签名 */
export async function exportConfig(cfg){
  if(!bmAvailable()) return '';
  const rootId=await ensureRoot(); if(!rootId) return '';
  const folders=(await B.getChildren(rootId)).filter(c=>!c.url);
  const byTitle=new Map(folders.map(f=>[f.title,f]));
  for(const g of (cfg.groups||[])){
    let folder=byTitle.get(g.name);
    if(folder) byTitle.delete(g.name);
    else folder=await B.create({ parentId:rootId, title:g.name });
    if(!folder) continue;
    await reconcileInto(folder.id, g.items||[]);
  }
  for(const f of byTitle.values()) await B.removeTree(f.id);   // 导航已删的分组 → 删对应文件夹
  const node=await B.getSubTree(rootId); return sigOf(node);
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
