/* ============ Infinity New Tab 备份逆向导入 ============
 * 解析 .infinity（JSON）→ 本项目 groups/items 结构。
 * 结构：data.site.sites[0] 是顶层条目数组：
 *   - 含 children 的对象 = 文件夹（→ 分组），children 是站点
 *   - type:'web' = 站点（→ 书签，target 为 URL）
 *   - type:'app'（infinity://…）= 内置应用，跳过
 * 图标：bgImage(http) → 直接用作图标 URL；bgType:color + bgText → `L|文字|颜色`。
 * 全局按规范化 URL 去重（保留首次出现）。
 */
import { normUrl } from './icon-map.js';

const GROUP_COLORS=['#2563eb','#0891b2','#16a34a','#7c3aed','#64748b','#ef4444','#0ea5e9','#f59e0b','#14b8a6','#ec4899','#8b5cf6','#f43f5e'];
const uid = p => p + Math.random().toString(36).slice(2,7) + Date.now().toString(36).slice(-3);

const isHttp  = u => /^https?:\/\//i.test(u||'');

/* rgba(44,214,223,1) / #rrggbb → #rrggbb；过浅(近白)返回空，交给自动配色 */
function toHex(c){
  c=(c||'').trim(); if(!c) return '';
  let r,g,b;
  let m=c.match(/^#([0-9a-f]{6})$/i); if(m){ return '#'+m[1].toLowerCase(); }
  m=c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if(m){ r=+m[1]; g=+m[2]; b=+m[3]; }
  else return '';
  if(r>235 && g>235 && b>235) return '';   // 近白：弃用，避免白底白字
  const h=n=>n.toString(16).padStart(2,'0');
  return '#'+h(r)+h(g)+h(b);
}

/* 站点 → 图标字符串（空=自动） */
function iconOf(s){
  const img=(s.bgImage||'').trim();
  if(isHttp(img)) return img;
  const txt=(s.bgText||'').trim();
  if(txt){ const hex=toHex(s.bgColor); return 'L|'+txt.slice(0,2)+(hex?('|'+hex):'|#3b82f6'); }
  return '';
}

/* 把任意嵌套的站点拍平成站点数组 */
function flattenSites(node){
  const out=[];
  (node.children||[]).forEach(c=>{
    if(c.children) out.push(...flattenSites(c));
    else if(isHttp(c.target)) out.push(c);
  });
  return out;
}

function mkItem(s){ return { id:uid('i'), name:(s.name||s.target||'').slice(0,120)||s.target, url:s.target, note:'', icon:iconOf(s) }; }

/* 主入口：返回 { groups, stats } */
export function infinityToGroups(backup){
  const root = backup && backup.data && backup.data.site && backup.data.site.sites && backup.data.site.sites[0];
  const stats={ folders:0, total:0, kept:0, dropped:0 };
  if(!Array.isArray(root)) return { groups:[], stats };

  const seen=new Set(); let ci=0;
  const dedupePush=(arr,s)=>{ const k=normUrl(s.target); stats.total++;
    if(!k || seen.has(k)){ stats.dropped++; return; } seen.add(k); arr.push(mkItem(s)); stats.kept++; };

  const groups=[]; const loose=[];
  root.forEach(s=>{
    if(s.children){                                   // 文件夹 → 分组
      stats.folders++;
      const items=[]; flattenSites(s).forEach(c=>dedupePush(items,c));
      if(items.length) groups.push({ id:uid('g'), name:(s.name||'分组').slice(0,40), icon:'folder', color:GROUP_COLORS[ci++%GROUP_COLORS.length], collapsed:false, items });
    } else if(s.type==='web' && isHttp(s.target)){    // 顶层站点 → 收藏组
      dedupePush(loose, s);
    }                                                 // app / infinity:// 跳过
  });
  if(loose.length) groups.unshift({ id:uid('g'), name:'收藏', icon:'star', color:'#22c55e', collapsed:false, items:loose });
  return { groups, stats };
}

/* 合并进现有配置：去重(对已有 URL)后并入，返回新增条数 */
export function mergeInfinity(cfg, parsed){
  const have=new Set();
  (cfg.groups||[]).forEach(g=>(g.items||[]).forEach(i=>have.add(normUrl(i.url))));
  const gkey=s=>(s||'').trim().toLowerCase();
  let added=0;
  parsed.groups.forEach(ng=>{
    let g=cfg.groups.find(x=>gkey(x.name)===gkey(ng.name));   // 同名分组忽略大小写并入（Science/science）
    if(!g){ g={ id:uid('g'), name:ng.name, icon:ng.icon, color:ng.color, collapsed:false, items:[] }; cfg.groups.push(g); }
    ng.items.forEach(it=>{ const k=normUrl(it.url); if(have.has(k))return; have.add(k); g.items.push({ ...it, id:uid('i') }); added++; });
  });
  return added;
}
