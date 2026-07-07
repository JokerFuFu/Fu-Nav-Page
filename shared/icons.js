/* ============ 图标装配 ============ */
import { isExtension } from './storage.js';
import { brandIcon, faviconCandidates, hostOf, isPrivateHost, lucide, FORCE_LETTER } from './icon-map.js';

const PALETTE=['#5b8def','#22a3b5','#36b37e','#e2a032','#e0567a','#9b6ef3','#ef6b4d','#3aa0a0','#7a86f0','#c2557a'];
function colorFor(s){ let h=0; for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0; return PALETTE[h%PALETTE.length]; }
function initialOf(name,url){ const s=(name||'').trim(); if(s) return s[0].toUpperCase(); const h=hostOf(url); return (h[0]||'?').toUpperCase(); }

function extFavicon(url,size=64){ return isExtension ? `/_favicon/?pageUrl=${encodeURIComponent(url)}&size=${Math.min(size,64)}` : null; }

/* 字母图标字号：按图标格自身高度的百分比渲染，跨尺寸自适应（DOM 未就绪时 rAF 重试） */
function sizeLetter(box, pct){ let n=0; const apply=()=>{ const h=box.clientHeight; if(h){ box.style.fontSize=Math.round(h*pct/100)+'px'; } else if(n++<20){ requestAnimationFrame(apply); } }; apply(); }

/* 给 .ico 容器装配网站/服务图标 + 兜底链 */
export function mountItemIcon(box, item, size=64){
  box.textContent=''; box.classList.remove('is-letter'); box.style.background=''; box.style.fontSize='';
  // 自定义「纯色字母图标」：L|文字|颜色|字号%（编辑器纯色模式，字号可省略）
  if(item.icon && item.icon.slice(0,2)==='L|'){ const p=item.icon.split('|'); box.classList.add('is-letter'); box.textContent=(p[1]||'?'); box.style.background=p[2]||colorFor(item.url||item.name||'?'); if(p[3]) sizeLetter(box,+p[3]||45); return; }
  const host=hostOf(item.url), priv=isPrivateHost(host);
  const cands=[];
  if(item.icon) cands.push(item.icon);
  const brand=brandIcon(item);
  if(brand && brand!==FORCE_LETTER) cands.push(brand);
  const letter=()=>{ box.classList.add('is-letter');
    const hasCtx=!!(((item.name||'').trim())||((item.url||'').trim()));
    if(!hasCtx){ box.classList.add('is-empty'); box.textContent='?'; return; }   // 空占位走中性样式(css .is-empty)，不吃彩色哈希
    box.textContent=initialOf(item.name,item.url); box.style.background=colorFor(item.url||item.name); };
  // 强制字母（图标库无对应且 url 易误中）：仅当没有自定义图标时
  if(brand===FORCE_LETTER && !item.icon){ letter(); return; }
  if(!priv) cands.push(...faviconCandidates(item.url));
  const ef=extFavicon(item.url,size); if(ef) cands.push(ef);
  if(!cands.length){ letter(); return; }
  const img=document.createElement('img'); img.loading='lazy'; img.alt=''; img.decoding='async';
  let i=0, settled=false, tmr=null;
  const tryLoad=src=>{ clearTimeout(tmr); tmr=setTimeout(advance,2200); img.src=src; }; // 超时兜底：有些 200-非图片请求既不 onload 也不 onerror，会卡住
  function advance(){ if(settled)return; clearTimeout(tmr); i++; if(i<cands.length) tryLoad(cands[i]); else { settled=true; letter(); } }
  img.onerror=advance;
  // onload 但尺寸异常也算失败：0=200 却非有效图片(常见于返回 HTML 的 apple-touch-icon)；≤16=极小 favicon 上采样进大框会糊/发白
  img.onload=()=>{ if(settled)return; if(!img.naturalWidth || img.naturalWidth<=16){ advance(); } else { settled=true; clearTimeout(tmr); } };
  box.appendChild(img); tryLoad(cands[0]);
}

/* Lucide 线性图标（mask 实现，跟随 currentColor），失败回退 emoji */
const lucideOK=new Map();
const urlOK=new Set();   // 本会话曾成功加载过的自定义图标 URL → 再渲染不因瞬时错误闪现 emoji
export function mountGroupIcon(box, group){
  const ic=group.icon||''; const emoji=group.emoji||(/^[\x00-\x7f]+$/.test(ic)?'📁':ic);
  box.textContent=''; box.classList.remove('lucide-mask'); box.style.webkitMaskImage=box.style.maskImage=''; box.style.background='';
  // 网络/自定义图标 URL（联网获取真实 logo）：曾成功过就不再降级到 emoji，避免点击重渲染时闪现 📁
  if(/^https?:\/\//.test(ic)){
    const img=document.createElement('img'); img.loading='lazy'; img.alt=''; img.decoding='async';
    img.style.width='100%'; img.style.height='100%'; img.style.objectFit='contain';   // 兜底：不依赖各调用点 CSS，杜绝 URL 图标按原始尺寸撑爆容器
    img.onload=()=>urlOK.add(ic);
    img.onerror=()=>{ if(!urlOK.has(ic)) box.textContent=emoji||'📁'; };
    img.src=ic; box.appendChild(img); return;
  }
  // 纯 ascii 视为 lucide 名
  if(/^[a-z0-9-]+$/.test(ic)){
    const apply=()=>{ const u=`url("${lucide(ic)}")`; box.classList.add('lucide-mask');
      box.style.webkitMaskImage=u; box.style.maskImage=u; box.style.background='currentColor'; };
    if(lucideOK.get(ic)===true) return apply();
    if(lucideOK.get(ic)===false){ box.textContent=emoji; return; }
    box.textContent=emoji; // 先占位
    const probe=new Image();
    probe.onload=()=>{ lucideOK.set(ic,true); box.textContent=''; apply(); };
    probe.onerror=()=>{ lucideOK.set(ic,false); };
    probe.src=lucide(ic);
  } else {
    box.textContent=ic||'📁';
  }
}

export { colorFor, initialOf };
