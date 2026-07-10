/* ============ 融合布局 v3.1：极简AI首页 + 时钟/天气卡 + 右键编辑 + 拖拽 ============ */
import { $, $$, el } from '../shared/core.js';
import { lucide } from '../shared/icon-map.js';
import { fetchGlances } from '../shared/hwmon.js';
import { PRESETS } from '../shared/bg-presets.js';
import { effectiveTheme, ONLINE_SOURCES, DEFAULT_ONLINE_SOURCE } from '../shared/background.js';
const DI = s => `https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons@main/svg/${s}.svg`;
const picon = p => (p.icon && p.icon.startsWith('http')) ? p.icon : DI(p.icon);
let active='home', clockTimer=null, drag=null, clockEls=null, ctxMenu=null;

document.addEventListener('click', hideCtx);
document.addEventListener('scroll', hideCtx, true);

export function mount(root, core){
  root.className='lay-fusion'+(core.settings.sideCollapsed?' side-collapsed':'');
  if(clockTimer){ clearInterval(clockTimer); clockTimer=null; } clockEls=null;
  if(core._navTo!==undefined){ active=core._navTo; core._navTo=undefined; }   // 命令面板/外部跳转分组
  if(active!=='home' && !findNode(core,active)) active='home';
  const wrap=el('div','fx-wrap');
  wrap.appendChild(buildSidebar(core));
  const main=el('section','fx-main'); main.id='fx-main';
  wrap.appendChild(main);
  root.appendChild(wrap);
  renderMain(core, main);
}

/* ---------- 侧边栏 ---------- */
function buildSidebar(core){
  const side=el('aside','fx-side');
  const brand=el('button','fx-brand'); brand.onclick=()=>go(core,'home'); brand.title=core.settings.title||'Fu 导航';
  const logo=el('img','fx-logo'); logo.src='icons/icon128.png'; logo.alt='';
  brand.append(logo, el('h1',null, core.settings.title||'Fu 导航'));
  // 快速收折按钮：贴在品牌右侧，点一下侧栏在「窄图标条 ⇄ 完整」间切换（CSS 过渡，无需重渲染）
  const collapseBtn=el('button','fx-collapse'); collapseBtn.title='收起/展开侧栏';
  const setCollapseIco=()=>{ collapseBtn.textContent=''; collapseBtn.appendChild(mico(core.settings.sideCollapsed?'chevrons-right':'chevrons-left',13)); }; setCollapseIco();
  collapseBtn.onclick=e=>{ e.stopPropagation(); core.settings.sideCollapsed=!core.settings.sideCollapsed; core.save();
    const r=document.querySelector('.lay-fusion'); if(r)r.classList.toggle('side-collapsed',core.settings.sideCollapsed);
    setCollapseIco(); };
  side.append(brand, collapseBtn);
  const nav=el('nav','fx-nav');
  nav.appendChild(navItem(core,'home','house','首页',null,()=>go(core,'home')));
  if(!core.settings.privacy){
    const pages=derivePages(core); let activePage=core.settings.activePage||'全部';
    if(!pages.includes(activePage)){ activePage='全部'; core.settings.activePage='全部'; }   // 工作区已不存在(如删掉该工作区所有分组)→回全部，避免分组全被过滤成空
    const inPage=g=> activePage==='全部' || (g.page||'')===activePage;   // 工作区切换在底部统一切换器里（全部/工作区/隐私）
    core.groups.filter(g=>inPage(g)&&!g.archived).forEach(g=> navGroup(core,g).forEach(n=>nav.appendChild(n)));
    if(!core.groups.length) nav.appendChild(el('div','fx-side-empty','还没有分组 — 从「新建分组」开始'));   // R5 空侧栏引导（下方按钮此时常显）
    const addG=el('button','fx-navitem fx-addgroup'+(core.groups.length?' edit-only':'')); addG.innerHTML=`<span class="fx-ni-ico lucide-mask" style="-webkit-mask-image:url('${lucide('plus')}');mask-image:url('${lucide('plus')}')"></span><span class="fx-ni-nm">新建分组</span>`; addG.onclick=()=>core.openGroupEditor(null); nav.appendChild(addG);
  }
  wireSidebarDnD(core,nav); side.appendChild(nav);
  const foot=el('div','fx-side-foot');
  // 添加网站
  const addBtn=sideBtn(core,'plus','添加网站',()=>core.openItemEditor(null, active!=='home'?active:core.groups[0]?.id));
  // 锁定/编辑模式：锁定=日常使用(点开链接/不可改)；解锁=可拖拽排序/编辑/删除卡片
  const editTitle=()=> core.editing ? '编辑模式 — 卡片可拖拽排序 / 悬停出现编辑与删除按钮 / 右键更多；点击锁定' : '已锁定 — 防误改，点击即打开链接；点击解锁可编辑/拖拽/删除';
  const editBtn=sideBtn(core, core.editing?'lock-open':'lock', editTitle(), function(){ core.editing=!core.editing; document.body.classList.toggle('editing',core.editing); setIcon(core,editBtn,core.editing?'lock-open':'lock'); editBtn.classList.toggle('on',core.editing); editBtn.title=editTitle(); core.toast(core.editing?'已解锁：可拖拽排序、编辑、删除卡片':'已锁定：点击即打开链接','ok'); core.rerender(); });
  if(core.editing) editBtn.classList.add('on');
  // 统一视图切换器：全部收藏 / 各工作区 / 隐私模式
  const modeBtn=sideBtn(core, core.settings.privacy?'eye':'layers', modeTitle(core), (e)=>openModeMenu(core,e));
  if(core.settings.privacy || (core.settings.activePage&&core.settings.activePage!=='全部')) modeBtn.classList.add('on');
  // 主题切换：跟随系统 → 浅 → 深 循环（#5 首页左下方按钮）
  const THEMES=[['auto','monitor','跟随系统'],['light','sun','浅色'],['dark','moon','深色']];
  const tcur=()=>{ const i=THEMES.findIndex(t=>t[0]===(core.settings.theme||'auto')); return i<0?0:i; };
  const themeBtn=sideBtn(core, THEMES[tcur()][1], '主题：'+THEMES[tcur()][2]+'（点击切换）', function(){
    const nx=THEMES[(tcur()+1)%THEMES.length]; core.settings.theme=nx[0]; core.applyTheme(); core.save();
    setIcon(core,themeBtn,nx[1]); themeBtn.title='主题：'+nx[2]+'（点击切换）'; });
  // 命令面板入口（⌘K 可发现性）
  const cmdBtn=sideBtn(core,'search','搜索 / 命令面板（⌘K 或 /）',()=>core.openPalette());
  // 设置
  const setBtn=sideBtn(core,'settings','设置',()=>core.openSettings());
  foot.append(cmdBtn, addBtn, editBtn, modeBtn, themeBtn, setBtn);
  side.appendChild(foot); setTimeout(markNav,0); return side;
}
function setIcon(core,btn,name){ const s=btn.querySelector('.fx-sb-ico'); if(s){ s.style.webkitMaskImage=s.style.maskImage=`url("${core.lucide(name)}")`; } }
function navItem(core,key,icon,name,count,on,group){
  const a=el('button','fx-navitem'); a.dataset.k=key; a.title=name; if(group)a.dataset.gid=group.id;
  const ico=el('span','fx-ni-ico');
  if(group) core.mountGroupIcon(ico,group); else { ico.classList.add('lucide-mask'); ico.style.webkitMaskImage=ico.style.maskImage=`url("${core.lucide(icon)}")`; ico.style.background='currentColor'; }
  a.append(ico, el('span','fx-ni-nm',name)); if(count!=null)a.appendChild(el('span','fx-ni-ct',String(count)));
  a.onclick=on; if(group) a.oncontextmenu=e=>{ e.preventDefault();
    const menu=[{ic:'pencil', label:'编辑分组', on:()=>core.openGroupEditor(group)}];
    derivePages(core).filter(p=>p!=='全部'&&p!==group.page).forEach(w=> menu.push({ic:'layers', label:'移到工作区「'+w+'」', on:()=>{ group.page=w; core.save(true); core.rerender(); core.toast('已移到工作区「'+w+'」','ok'); }}));
    menu.push({ic:'plus', label:'新建工作区…', on:()=>{ const n=prompt('新工作区名称（如 运维 / 影音）'); if(n&&n.trim()){ group.page=n.trim(); core.save(true); core.rerender(); core.toast('已加入工作区「'+n.trim()+'」','ok'); } }});
    if(group.page) menu.push({ic:'corner-up-left', label:'移出工作区「'+group.page+'」', on:()=>{ group.page=undefined; core.save(true); core.rerender(); }});
    menu.push('-', {ic: group.archived?'archive-restore':'archive', label: group.archived?'取消归档':'归档分组', on:()=>{ group.archived=group.archived?undefined:true; core.save(true); core.rerender(); core.toast(group.archived?'已归档，可在设置中管理':'已取消归档','ok'); }});
    showCtx(e.clientX,e.clientY,menu); };
  return a;
}
function sideBtn(core,icon,title,on){ const b=el('button','fx-sidebtn'); b.title=title; b.onclick=on;
  const s=el('span','fx-sb-ico lucide-mask'); s.style.webkitMaskImage=s.style.maskImage=`url("${core.lucide(icon)}")`; s.style.background='currentColor';
  b.appendChild(s); return b; }
/* 工作区：从分组的 page 自动派生 + 全部（无需单独管理 UI；指定改由右键分组）*/
function derivePages(core){ const set=[]; core.groups.forEach(g=>{ if(g.page && !set.includes(g.page)) set.push(g.page); }); return ['全部',...set]; }
/* 统一视图切换器（底部）：全部收藏 / 各工作区 / 隐私模式 */
function modeTitle(core){ if(core.settings.privacy) return '当前：隐私模式（只搜索/天气）· 点击切换'; const ap=core.settings.activePage||'全部'; return '视图：'+(ap==='全部'?'全部收藏':'工作区 '+ap)+' · 点击切换（全部/工作区/隐私）'; }
function openModeMenu(core,e){
  if(e){ e.stopPropagation(); e.preventDefault(); }   // 阻止冒泡到 document 的 click→hideCtx 把菜单立刻关掉
  const priv=!!core.settings.privacy, ap=core.settings.activePage||'全部';
  const items=[{ic:'layout-grid', sel:!priv&&ap==='全部', label:'全部收藏', on:()=>{ core.settings.privacy=false; core.settings.activePage='全部'; core.save(); core.rerender(); }}];
  derivePages(core).filter(p=>p!=='全部').forEach(w=>{ items.push({ic:'layers', sel:!priv&&ap===w, label:w, on:()=>{ core.settings.privacy=false; core.settings.activePage=w; core.save(); core.rerender(); }}); });
  items.push('-', {ic:'eye-off', sel:priv, label:'隐私模式（只留搜索/天气）', on:()=>{ core.settings.privacy=true; core.save(); core.rerender(); }});
  const x=(e&&e.clientX)||120, y=(e&&e.clientY)||innerHeight-40; showCtx(x,y,items);
}
/* 侧栏点分组 → 进该分组页 */
function openGroup(core,gid){ go(core,gid); }
/* 侧栏两级子目录树：分组 → 文件夹 → 子文件夹，可展开/收折 */
function isTreeOpen(core,id){ return !!(core.settings.treeOpen && core.settings.treeOpen[id]); }
function toggleTree(core,id){ const t=core.settings.treeOpen||(core.settings.treeOpen={}); t[id]=!t[id]; core.save(); core.rerender(); }
function caret(core,id,onToggle,open){ const c=el('span','fx-ni-caret lucide-mask'+((open!=null?open:isTreeOpen(core,id))?' open':'')); c.style.webkitMaskImage=c.style.maskImage=`url("${lucide('chevron-right')}")`; c.onclick=e=>{ e.stopPropagation(); e.preventDefault(); onToggle(); }; return c; }
function navGroup(core,g){ const out=[]; const folders=(g.items||[]).filter(x=>core.isFolder(x));
  const activeInGroup=folders.some(f=>f.id===active);
  const row=navItem(core,g.id,g.icon,g.name,core.flatItems(g).length,()=>openGroup(core,g.id),g);
  if(folders.length) row.insertBefore(caret(core,g.id,()=>toggleTree(core,g.id), isTreeOpen(core,g.id)||activeInGroup), row.firstChild);
  out.push(row);
  // 二级菜单：分组 → 其（顶层）文件夹子项，点击进入该子项页面（更深子文件夹在页内进入，不塞侧栏）
  if(folders.length && (isTreeOpen(core,g.id)||activeInGroup)) folders.forEach(fd=>{
    const r=el('button','fx-navitem fx-navfolder'); r.title=fd.name||'文件夹'; r.dataset.k=fd.id;
    const ico=el('span','fx-ni-ico lucide-mask'); ico.style.webkitMaskImage=ico.style.maskImage=`url("${core.lucide('folder')}")`; ico.style.background='currentColor';
    r.append(ico, el('span','fx-ni-nm',fd.name||'文件夹'), el('span','fx-ni-ct',String((fd.items||[]).length)));
    r.onclick=()=>go(core,fd.id);   // 进入文件夹子页面
    out.push(r); });
  return out; }
function go(core,key){ active=key; renderMain(core,$('#fx-main')); markNav(); }
function markNav(){ $$('.fx-navitem').forEach(b=>b.classList.toggle('on', b.dataset.k===active)); }

/* ---------- 主区 ---------- */
/* 按 id 解析当前视图：分组 或 文件夹（含所属分组）*/
function findFolderById(core,g,id){ const find=arr=>{ for(const it of (arr||[])){ if(core.isFolder(it)){ if(it.id===id)return it; const r=find(it.items); if(r)return r; } } return null; }; return find(g.items); }
function findNode(core,id){ for(const g of core.groups){ if(g.id===id) return {group:g}; const fd=findFolderById(core,g,id); if(fd) return {group:g, folder:fd}; } return null; }
function renderMain(core,main){ if(!main)return; main.textContent='';
  if(active==='home'){ core.applyBackground(true); renderHome(core,main); return; }
  core.applyBackground(false);
  const node=findNode(core,active);
  if(!node){ active='home'; core.applyBackground(true); return renderHome(core,main); }
  if(node.folder) renderFolderPage(core,main,node.folder,node.group);
  else renderGroup(core,main,node.group);
}

function renderHome(core,main){
  const priv=core.settings.privacy;
  const home=el('div','fx-home'+(priv?' fx-home-priv':''));
  if(!priv) home.appendChild(buildBgTrigger(core));   // 背景切换悬浮入口（隐私模式不显示，减少干扰）
  if(core.settings.showClock) home.appendChild(buildHeroClock(core));   // 时钟+日期 固定 Hero，放在搜索框上方
  home.appendChild(buildAsk(core));               // 输入框（AI/搜索/收藏检索）
  home.appendChild(buildWidgetCards(core,priv));   // 时钟/天气/(本机)卡片
  if(!priv){ const favs=core.favorites(), grid=core.favGrid();
    if(favs.length){
      const row=el('div','fx-favs'); row.style.setProperty('--fav-cols',grid.cols);
      favs.forEach(({item,group,pinned})=>row.appendChild(favCard(core,item,group,pinned)));
      wireFavDnD(core,row);
      home.appendChild(row);
    } else {
      home.appendChild(el('div','fx-home-empty','还没有常用网站 — 解锁后点「添加网站」，或到 设置 → 导入浏览器书签'));   // R5 空态引导
    } }
  main.appendChild(home);
}

/* ---------- 首页背景切换（悬浮入口 + 快捷面板）---------- */
function buildBgTrigger(core){
  const b=el('button','fx-bg-trigger'); b.type='button'; b.title='更换首页背景';
  const ic=el('span','fx-bg-trigger-ico lucide-mask'); ic.style.webkitMaskImage=ic.style.maskImage=`url("${core.lucide('image')}")`; ic.style.background='currentColor';
  b.appendChild(ic);
  b.onclick=e=>{ e.stopPropagation(); toggleBgPanel(core, b); };
  return b;
}
let bgPanelEl=null;
function toggleBgPanel(core, anchor){
  if(bgPanelEl){ bgPanelEl.remove(); bgPanelEl=null; return; }
  const bg=core.settings.background;
  const panel=el('div','fx-bg-panel');
  const grid=el('div','fx-bg-grid');
  PRESETS.forEach(p=>{
    const cell=el('button','fx-bg-cell'+((bg.mode==='preset'&&bg.presetId===p.id)?' sel':'')); cell.type='button'; cell.title=p.name;
    cell.style.backgroundImage=`url("${p[effectiveTheme(core)] || p.dark}")`;
    cell.onclick=()=>{ core.setBackgroundPreset(p.id); toggleBgPanel(core); };
    grid.appendChild(cell);
  });
  panel.appendChild(grid);
  const status=el('div','fn-sub','');
  // 在线源按用途分组；点选后走统一的图片响应校验 + Blob 落盘管线。
  panel.appendChild(el('div','fx-bg-seclabel','在线壁纸源'));
  const current=(bg.onlineSrc&&bg.onlineSrc.id)||DEFAULT_ONLINE_SOURCE;
  const SRC_ICONS={ bing:'mountain', ycy:'sparkles', moez:'wand-sparkles', ai:'bot', ysz:'sparkles', pc:'monitor', moe:'sparkles', fj:'camera', bd:'sun', ys:'image', acg:'film', mp:'smartphone', picsum:'camera' };
  ['每日精选','二次元','摄影','其他'].forEach(group=>{
    const sources=ONLINE_SOURCES.filter(s=>s.group===group); if(!sources.length)return;
    panel.appendChild(el('div','fx-bg-group',group)); const srcRow=el('div','fx-bg-srcrow');
    sources.forEach(s=>{
      const btn=el('button','fx-bg-src'+(bg.mode==='online'&&current===s.id?' sel':'')); btn.type='button'; btn.title=s.name+'：'+s.desc;
      const ic=el('span','fx-bg-src-ic lucide-mask'); ic.style.webkitMaskImage=ic.style.maskImage=`url("${core.lucide(SRC_ICONS[s.id]||'image')}")`;
      btn.append(ic, el('span','fx-bg-src-nm',s.name), el('span','fx-bg-src-ds',s.desc));
      btn.onclick=async()=>{ status.textContent='拉取中…'; const r=await core.refreshOnlineBackground({id:s.id});
        status.textContent=r.ok?('已换「'+s.name+'」'):('失败：'+r.reason);
        $$('.fx-bg-src',panel).forEach(x=>x.classList.remove('sel')); if(r.ok)btn.classList.add('sel'); };
      srcRow.appendChild(btn);
    }); panel.appendChild(srcRow);
  });
  panel.appendChild(el('div','fx-bg-seclabel','自定义图片地址'));
  const customRow=el('div','fx-bg-custom fn-field'), customI=core.inp(current==='custom'?(bg.onlineSrc.url||''):'','https://example.com/wallpaper.jpg'); customI.type='url';
  const customBtn=core.btn('使用','ghost',async()=>{ const url=customI.value.trim(); try{ const u=new URL(url); if(!/^https?:$/.test(u.protocol))throw 0; }catch{ core.toast('请输入有效的 http(s) 图片地址','err'); return; }
    await core.ensureCloudPermission(url); status.textContent='正在校验图片…'; const r=await core.refreshOnlineBackground({id:'custom',url});
    status.textContent=r.ok?'已应用自定义壁纸':'该地址未返回图片，请检查'; if(!r.ok)core.toast('该地址未返回图片，请检查','err'); },'link');
  customRow.append(customI,customBtn); panel.appendChild(customRow);
  panel.appendChild(el('div','fx-bg-seclabel','更新频率'));
  const presetValues=new Set([0,15,60,720,1440,10080]), refresh=Number(bg.refreshEvery)||0, refreshKey=presetValues.has(refresh)?String(refresh):'custom';
  const customMinutes=core.inp(refreshKey==='custom'?String(refresh):'','分钟数'); customMinutes.type='number'; customMinutes.min='1'; customMinutes.step='1';
  const customRefresh=el('div','fx-bg-custom fn-field');
  const applyMinutes=core.btn('应用分钟数','ghost',()=>{ const n=Math.floor(Number(customMinutes.value)); if(!(n>0)){status.textContent='请输入大于 0 的分钟数';return;} bg.refreshEvery=n; core.save(true); status.textContent='已设为每 '+n+' 分钟检查一次'; },'timer-reset');
  customRefresh.append(customMinutes,applyMinutes); customRefresh.hidden=refreshKey!=='custom';
  const refreshSeg=core.seg([['0','仅手动'],['15','15 分钟'],['60','1 小时'],['720','12 小时'],['1440','1 天'],['10080','7 天'],['custom','自定义']],refreshKey,v=>{
    customRefresh.hidden=v!=='custom'; if(v!=='custom'){ bg.refreshEvery=Number(v); core.save(true); status.textContent=v==='0'?'已设为仅手动更新':'更新频率已保存'; }
  });
  const refreshWrap=el('div','fx-bg-refresh'); refreshWrap.append(refreshSeg,customRefresh); panel.appendChild(refreshWrap);
  const actions=el('div','fn-wrap');
  const upBtn=core.btn('上传本地图片…','ghost',()=>{ const f=el('input'); f.type='file'; f.accept='image/*';
    f.onchange=async()=>{ const file=f.files[0]; if(!file)return; status.textContent='上传中…'; const r=await core.setBackgroundLocal(file); status.textContent=r.ok?'已应用':('失败：'+r.reason); }; f.click(); },'upload');
  const noneBtn=core.btn('恢复默认纯色','ghost',()=>{ core.clearBackground(); toggleBgPanel(core); },'rotate-ccw');
  actions.append(upBtn, noneBtn);
  panel.append(actions, status);
  document.body.appendChild(panel);
  const r=anchor.getBoundingClientRect(), pr=panel.getBoundingClientRect();
  panel.style.top=(r.bottom+8)+'px'; panel.style.left=Math.max(8, r.right-pr.width)+'px';
  bgPanelEl=panel;
  const closeOnOutside=e=>{ if(!panel.contains(e.target) && e.target!==anchor){ panel.remove(); bgPanelEl=null; document.removeEventListener('click',closeOnOutside); } };
  setTimeout(()=>document.addEventListener('click',closeOnOutside),0);
}

/* ---------- AI/搜索 一体框（provider 收进左侧下拉切换）---------- */
function buildAsk(core){
  const wrap=el('div','fx-ask');
  const box=el('form','fx-ask-box');
  const prov=el('button','fx-ask-prov'); prov.type='button'; prov.title='切换搜索引擎 / AI';
  prov.appendChild(el('span','fx-ask-prov-cv'));   // 单独图标层，留出下拉小箭头
  { const ar=mico('chevron-down',10); ar.classList.add('fx-ask-prov-ar'); prov.appendChild(ar); }
  const inp=el('input'); inp.type='text'; inp.autocomplete='off';
  const send=el('button','fx-ask-send'); send.type='submit'; send.title='发送'; send.appendChild(mico('corner-down-left',17));
  box.append(prov,inp,send);
  const menu=el('div','fx-provmenu'); menu.hidden=true;
  const results=el('div','fx-ask-results'); results.hidden=true;
  const cv=prov.querySelector('.fx-ask-prov-cv');
  const setProv=()=>{ const p=core.PROVIDERS[core.activeProvider()]; cv.textContent=''; const img=new Image(); img.onerror=()=>{cv.textContent=p.name[0];}; img.src=picon(p); cv.appendChild(img);
    inp.placeholder=p.kind==='ai'?`问 ${p.name}…`:`用 ${p.name} 搜索，左侧切换 AI`; };
  // 下拉：按 搜索引擎 / AI 助手 两组列出全部 provider
  const closeMenu=()=>{ menu.hidden=true; prov.classList.remove('open'); };
  const buildMenu=()=>{ menu.textContent=''; const ids=Object.keys(core.PROVIDERS);
    [['search','搜索引擎'],['ai','AI 助手']].forEach(([kind,label])=>{ const sect=ids.filter(id=>core.PROVIDERS[id].kind===kind); if(!sect.length)return;
      menu.appendChild(el('div','fx-provmenu-h',label));
      sect.forEach(id=>{ const p=core.PROVIDERS[id]; const cur=id===core.activeProvider(); const it=el('button','fx-provitem'+(cur?' on':'')); it.type='button';
        const ic=el('span','fx-provitem-ico'); const img=new Image(); img.onerror=()=>{ic.textContent=p.name[0];ic.classList.add('txt');}; img.src=picon(p); ic.appendChild(img);
        it.append(ic, el('span','fx-provitem-nm',p.name)); if(cur){ const ck=el('span','fx-provitem-ck'); ck.appendChild(mico('check',12)); it.appendChild(ck); }
        it.onclick=()=>{ core.setProvider(id); setProv(); closeMenu(); if(inp.value.trim()) core.ask(id,inp.value); else inp.focus(); };
        menu.appendChild(it); });
    }); };
  prov.onclick=e=>{ e.stopPropagation(); if(menu.hidden){ buildMenu(); menu.hidden=false; prov.classList.add('open'); } else closeMenu(); };
  setProv();
  inp.addEventListener('input',()=>{ const q=inp.value.trim().toLowerCase(); results.textContent=''; if(!q){results.hidden=true;return;}
    const ms=[]; core.allItems().forEach(({item,group})=>{ if((item.name+' '+item.url+' '+(item.note||'')).toLowerCase().includes(q)) ms.push({it:item,g:group}); });
    if(!ms.length){results.hidden=true;return;}
    results.appendChild(el('div','fx-res-h','我的收藏 · 点击打开'));
    ms.slice(0,7).forEach(({it,g})=>{ const r=el('a','fx-res'); r.href=it.url; r.target=core.settings.openIn==='_self'?'_self':'_blank'; r.rel='noopener';
      const ico=el('span','fx-res-ico'); core.mountIcon(ico,it,32); r.append(ico, el('span','fx-res-nm',it.name), el('span','fx-res-g',g.name)); r.addEventListener('click',()=>core.recordVisit(it)); results.appendChild(r); });
    results.hidden=false; });
  inp.addEventListener('keydown',e=>{ if(e.key==='Escape'){inp.value='';results.hidden=true;closeMenu();} });
  box.addEventListener('submit',e=>{e.preventDefault();core.ask(core.activeProvider(),inp.value);});
  document.addEventListener('click',e=>{ if(!wrap.contains(e.target)){ results.hidden=true; closeMenu(); } });
  wrap.append(box,menu,results); setTimeout(()=>inp.focus(),60);
  return wrap;
}

/* ---------- 卡片：时钟 / 天气 / 待办 / 倒数日（可拖拽重排、可增删）---------- */
function buildWidgetCards(core, priv){
  const row=el('div','fx-wcards');
  (core.settings.widgets||[]).forEach(w=>{
    if(w.type==='clock') return;   // 时钟已移到搜索框上方的固定 Hero，不再作为卡片渲染
    if(w.type==='weather' && !core.settings.showWeather) return;
    if(priv && w.type!=='weather')   return;   // 隐私模式只留天气卡（时钟是 Hero，另行渲染）
    let card=null;
    switch(w.type){
      case 'weather':   card=widgetWeather(core); break;
      case 'today':     card=widgetToday(core,w); break;
      case 'hwmon':     card=widgetHwmon(core,w); break;
    }
    if(card) row.appendChild(decorateWidget(core,card,w));
  });
  if(!priv){
    const hidden=core.settings.hiddenAgentCards||[];
    [...buildAgentCards(core), ...resourceCards(core)].forEach(card=>{
      const kind=card.dataset.agentKind;
      if(kind && hidden.includes(kind)) return;                       // 用户已隐藏的本机服务卡 → 不渲染
      if(core.editing && kind){                                        // 编辑态给本机服务卡加「隐藏」钮（它们不在 widgets 数组，需单独处理，否则删不掉）
        card.style.position='relative';
        const del=el('button','fx-wdel'); del.type='button'; del.title='隐藏此卡'; del.appendChild(mico('x',11));
        del.onclick=e=>{ e.preventDefault(); e.stopPropagation();
          core.settings.hiddenAgentCards=[...(core.settings.hiddenAgentCards||[]), kind];
          core.save(true); core.rerender(); core.toast('已隐藏（解锁态右键卡片区可恢复）','ok'); };
        card.appendChild(del);
      }
      row.appendChild(card);
    });
  }
  // 加卡片不再占首页位置：解锁🔓 时右键卡片区空白处添加；或到 设置→小组件 管理
  if(!priv) row.addEventListener('contextmenu',e=>{ if(e.target.closest('.fx-wcard'))return;   // 点在卡片上交给卡片自身菜单
    e.preventDefault(); if(core.editing) addWidgetMenu(core,e);
    else showCtx(e.clientX,e.clientY,[{ic:'lock-open', label:'解锁后可在此添加/管理卡片', on:()=>{ core.editing=true; document.body.classList.add('editing'); core.rerender(); }}]); });
  wireWidgetDnD(core,row);
  return row;
}
/* 卡片本身始终可交互(待办勾选、天气点刷新)；拖拽手柄+✕删除 仅解锁🔓时出现 */
function decorateWidget(core, card, w){
  card.dataset.wid=w.id; if(getComputedStyle(card).position==='static') card.style.position='relative';
  if(core.editing){
    const grip=el('span','fx-wgrip'); grip.appendChild(mico('grip-vertical',12)); grip.title='拖拽重排卡片'; grip.draggable=true;
    grip.addEventListener('dragstart',e=>{ drag={type:'widget',wid:w.id}; card.classList.add('fx-dragging'); e.dataTransfer.effectAllowed='move'; try{e.dataTransfer.setData('text/plain',w.id);}catch{} });
    grip.addEventListener('dragend',()=>{ card.classList.remove('fx-dragging'); drag=null; });
    const del=el('button','fx-wdel'); del.type='button'; del.title='移除卡片'; del.appendChild(mico('x',11));
    del.onclick=e=>{e.preventDefault();e.stopPropagation(); core.removeWidget(w.id);};   // 走 removeWidget(save(true) 立即落盘)，不再用防抖 save() 留删除丢失窗口
    card.append(grip, del);
  }
  card.addEventListener('contextmenu',e=>widgetMenu(core,e,w));
  return card;
}
function buildHeroClock(core){ const c=el('div','fx-hero-clock'); const t=el('div','fx-hero-time'),d=el('div','fx-hero-date'),g=el('div','fx-hero-greet'); c.append(t,d,g); clockEls={time:t,date:d,greet:g}; startClock(core); return c; }
function widgetWeather(core){ const c=el('div','fx-wcard fx-wc-weather'); c.textContent='天气加载中…'; fillWeather(core,c); return c; }
/* "今日"卡片：待办 + 倒数日（可多条）+ 日历（只读，来自本机伴随服务），三节纵向堆叠 */
function widgetToday(core,w){
  if(!Array.isArray(w.items))w.items=[];
  if(!Array.isArray(w.countdowns))w.countdowns=[];
  const c=el('div','fx-wcard fx-wtoday'); c.append(agentHead(core,'sun','今日'));

  // ---- 待办 ----
  const todoSec=el('div','fx-today-sec');
  const todoList=el('div','fx-todo-list');
  const renderTodo=()=>{ todoList.textContent='';
    if(!w.items.length) todoList.appendChild(el('div','fx-todo-empty','暂无待办，下方输入添加'));
    w.items.forEach((t,i)=>{ const row=el('label','fx-todo-item'+(t.done?' done':''));
      const cb=el('input'); cb.type='checkbox'; cb.checked=!!t.done; cb.onchange=()=>{ t.done=cb.checked; row.classList.toggle('done',t.done); core.save(); };
      const sp=el('span','fx-todo-tx',t.text);
      const del=el('button','fx-todo-del'); del.appendChild(mico('x',10)); del.type='button'; del.title='删除'; del.onclick=e=>{e.preventDefault();e.stopPropagation(); w.items.splice(i,1); core.save(true); renderTodo();};
      row.append(cb,sp,del); todoList.appendChild(row); }); };
  renderTodo();
  const todoForm=el('form','fx-todo-add'); const todoInp=el('input'); todoInp.placeholder='加一条待办，回车…'; todoForm.appendChild(todoInp);
  todoForm.addEventListener('submit',e=>{e.preventDefault(); const v=todoInp.value.trim(); if(!v)return; w.items.push({text:v,done:false}); todoInp.value=''; core.save(); renderTodo();});
  todoSec.append(todoList, todoForm);

  // ---- 倒数日（可多条）----
  const cdSec=el('div','fx-today-sec fx-today-cd');
  const cdList=el('div','fx-cd-list');
  const renderCd=()=>{ cdList.textContent='';
    w.countdowns.forEach((cd,i)=>{
      const today=new Date(); today.setHours(0,0,0,0); const tgt=new Date(cd.date+'T00:00:00');
      const bad=isNaN(tgt); const days=bad?0:Math.round((tgt-today)/864e5);   // 无效日期守卫：不渲染字面 NaN，留删除钮可清理
      const row=el('div','fx-cd-row');
      const num=el('span','fx-cd-num', bad?'—':(days>0?String(days):(days===0?'今天':String(-days))));
      const lb=el('span','fx-cd-lb', cd.label+(bad?' · 日期无效':(days>0?' · 天后':days===0?'':' · 天前')));
      const del=el('button','fx-todo-del'); del.appendChild(mico('x',10)); del.type='button'; del.title='删除'; del.onclick=e=>{e.preventDefault();e.stopPropagation(); w.countdowns.splice(i,1); core.save(true); renderCd();};
      row.append(num,lb,del); cdList.appendChild(row);
    }); };
  renderCd();
  const cdForm=el('form','fx-cd-add'); const cdLabelI=el('input'); cdLabelI.placeholder='名称，如生日/Deadline'; const cdDateI=el('input'); cdDateI.type='date';
  const cdAddBtn=el('button','fx-cd-addbtn'); cdAddBtn.appendChild(mico('plus',13)); cdAddBtn.type='submit';
  cdForm.append(cdLabelI, cdDateI, cdAddBtn);
  cdForm.addEventListener('submit',e=>{e.preventDefault(); if(!cdDateI.value)return; w.countdowns.push({id:core.uid('cd'),label:cdLabelI.value.trim()||'倒数日',date:cdDateI.value}); cdLabelI.value=''; cdDateI.value=''; core.save(); renderCd();});
  cdSec.append(el('div','fx-today-h','倒数日'), cdList, cdForm);

  // ---- 日历（只读，来自本机伴随服务，没有就不显示这节）----
  const calSec=el('div','fx-today-sec fx-today-cal');
  const d=core.agentData;
  if(d && d.calendar && d.calendar.length){
    calSec.append(el('div','fx-today-h','今日日程'));
    d.calendar.slice(0,4).forEach(ev=>calSec.append(el('div','fx-wca-li','• '+(ev.title||ev.when))));
  }

  c.append(todoSec, cdSec); if(calSec.children.length) c.append(calSec);
  return c;
}
function widgetMenu(core,e,w){ e.preventDefault(); e.stopPropagation();
  if(!core.editing){ showCtx(e.clientX,e.clientY,[{ic:'lock-open', label:'解锁后可移除/编辑卡片', on:()=>{ core.editing=true; document.body.classList.add('editing'); core.rerender(); }}]); return; }
  const items=[];
  if(w.type==='hwmon') items.push({ic:'pencil', label:'设置监控端点', on:()=>core.openHwmonEditor(w)});
  items.push({ic:'trash-2', label:'移除卡片', danger:true, on:()=>{ core.removeWidget(w.id); }});
  showCtx(e.clientX,e.clientY,items); }
function addWidgetMenu(core,e){ const types=[['today','今日'],['hwmon','硬件监控'],['weather','天气']];
  const items=types.map(([t,label])=>({ic:'plus', label:label, on:()=>core.addWidget(t)}));
  if((core.settings.hiddenAgentCards||[]).length) items.push('-', {ic:'eye', label:'恢复隐藏的本机服务卡片', on:()=>{ core.settings.hiddenAgentCards=[]; core.save(true); core.rerender(); core.toast('已恢复本机服务卡片','ok'); }});
  showCtx(e.clientX,e.clientY, items); }
function wireWidgetDnD(core,row){
  row.addEventListener('dragover',e=>{ if(!drag||drag.type!=='widget')return; e.preventDefault(); const after=afterEl(row,'.fx-wcard[data-wid]',e.clientX,e.clientY); const d=row.querySelector('.fx-wcard.fx-dragging'); if(!d)return; if(after==null) row.appendChild(d); else row.insertBefore(d,after); });
  row.addEventListener('drop',e=>{ if(!drag||drag.type!=='widget')return; e.preventDefault(); const order=$$('.fx-wcard[data-wid]',row).map(c=>c.dataset.wid); core.settings.widgets.sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id)); drag=null; core.save(true); }); }
/* 本机/NAS 硬件容量卡（需伴随服务上报 agentData.resources，有则显示）*/
function resourceCards(core){ const d=core.agentData; const out=[]; if(!d||!d.resources)return out;
  (d.resources||[]).slice(0,4).forEach(r=>{ const c=el('div','fx-wcard fx-wc-res'); c.dataset.agentKind='resources'; c.append(agentHead(core, r.icon||'hard-drive', r.name||'存储'));
    const pct=Math.max(0,Math.min(100, r.percent||0)); const bar=el('div','fx-res-bar'); const fill=el('div','fx-res-barfill'); fill.style.width=pct+'%'; if(pct>88)fill.style.background='var(--danger)'; bar.appendChild(fill);
    c.append(bar, el('div','fx-res-txt', `${r.used||'?'} / ${r.total||'?'} · ${pct}%`)); out.push(c); });
  return out; }
/* 硬件监控卡（对接 Glances，5s 刷新）*/
function widgetHwmon(core,w){
  const c=el('div','fx-wcard fx-wc-hw'); c.append(agentHead(core,'cpu', w.label||'硬件监控'));
  const body=el('div','fx-hw-body'); c.appendChild(body);
  const barRow=(label,pct,extra)=>{ const row=el('div','fx-hw-row'); const head=el('div','fx-hw-head');
    head.append(el('span','fx-hw-lb',label), el('span','fx-hw-val',(pct!=null?pct+'%':'—')+(extra||'')));
    const bar=el('div','fx-res-bar'); const fill=el('div','fx-res-barfill'); const p=Math.max(0,Math.min(100,pct||0)); fill.style.width=p+'%';
    if(p>=85)fill.style.background='var(--danger)'; else if(p>=70)fill.style.background='var(--warn)'; bar.appendChild(fill);
    row.append(head,bar); return row; };
  const render=(d)=>{ body.textContent='';
    if(!w.url){ body.appendChild(el('div','fx-wcw-sub','右键卡片 → 设置 Glances 端点')); return; }
    if(d===undefined){ body.appendChild(el('div','fx-wcw-sub','读取中…')); return; }
    if(!d){ body.appendChild(el('div','fx-wcw-sub','连接失败 · 检查 Glances 端点/授权')); return; }
    if(d.host) body.appendChild(el('div','fx-hw-host',d.host));
    if(d.cpu!=null) body.appendChild(barRow('CPU', d.cpu, d.temp!=null?(' · '+d.temp+'°'):''));
    if(d.mem!=null) body.appendChild(barRow('内存', d.mem));
    (d.disks||[]).slice(0,2).forEach(dk=> body.appendChild(barRow(dk.mnt, dk.pct)));
    if(d.cpu==null && d.mem==null && !(d.disks||[]).length) body.appendChild(el('div','fx-wcw-sub','无可用指标'));
  };
  const cache=(core._hwCache||(core._hwCache={}));
  render(w.url ? cache[w.id] : null);
  if(w.url){ const tick=async()=>{ const d=await fetchGlances(w.url); cache[w.id]=d; if(document.body.contains(c)) render(d); };
    tick(); const iv=setInterval(()=>{ if(!document.body.contains(c)){ clearInterval(iv); return; } tick(); }, 5000); }
  return c;
}
function fillWeather(core,card){
  core.weather.get().then(d=>{ const keep=[...card.querySelectorAll('.fx-wgrip,.fx-wdel')]; card.textContent=''; keep.forEach(k=>card.appendChild(k));  // 保留拖拽手柄/删除按钮
    if(!d){ card.classList.add('fx-wc-dim'); card.append(wcIcon(core,'cloud-off'), el('div','fx-wcw-cond','天气暂不可用')); return; }
    const top=el('div','fx-wcw-top'); top.append(wcIcon(core,d.icon), el('span','fx-wcw-temp',d.temp+'°'));
    card.append(top, el('div','fx-wcw-cond',`${d.text} · 体感${d.feels}°`), el('div','fx-wcw-sub',`${d.city||''} ${d.hi}°/${d.lo}° · 湿度${d.humidity}%`));
    if(d.daily && d.daily.length>1){ const fc=el('div','fx-wcw-fc'); d.daily.slice(1,4).forEach(day=>{ const c=el('div','fx-wcw-fd');
      const wd=['日','一','二','三','四','五','六'][new Date(day.date).getDay()]; const wm=core.weather.wmo(day.code,true);
      const ic=el('span','fx-wcw-fdi lucide-mask'); ic.style.webkitMaskImage=ic.style.maskImage=`url("${core.lucide(wm.icon)}")`; ic.style.background='currentColor';
      c.append(el('span','fx-wcw-fdw','周'+wd), ic, el('span','fx-wcw-fdt',`${day.hi}°`)); fc.appendChild(c); }); card.append(fc); }
    card.style.cursor='pointer'; card.title='点击刷新天气'; card.onclick=async()=>{await core.weather.locate();await core.weather.get(true);core.rerender();};
  });
}
function wcIcon(core,name){ const s=el('span','fx-wcw-ico lucide-mask'); s.style.webkitMaskImage=s.style.maskImage=`url("${core.lucide(name)}")`; s.style.background='currentColor'; return s; }
function buildAgentCards(core){ const d=core.agentData; const out=[]; if(!d)return out;
  if(d.report){ const c=el('div','fx-wcard fx-wc-agent'); c.dataset.agentKind='report'; c.append(agentHead(core,'sparkles','AI 日报')); const r=typeof d.report==='string'?safe(d.report):d.report;
    if(r&&r.summary){ c.append(el('div','fx-wca-main',r.summary)); if(r.focus){ const sub=el('div','fx-wca-sub'); sub.append(mico('chevron-right',12), el('span',null,r.focus)); c.append(sub); } } out.push(c); }
  if(d.reminders&&d.reminders.length){ const c=el('div','fx-wcard fx-wc-agent'); c.dataset.agentKind='reminders'; c.append(agentHead(core,'check-square','今日提醒')); d.reminders.slice(0,4).forEach(r=>c.append(el('div','fx-wca-li','• '+r.name))); out.push(c); }
  if(d.calendar&&d.calendar.length){ const c=el('div','fx-wcard fx-wc-agent'); c.dataset.agentKind='calendar'; c.append(agentHead(core,'calendar','今日日程')); d.calendar.slice(0,4).forEach(e=>c.append(el('div','fx-wca-li','• '+(e.title||e.when)))); out.push(c); }
  return out;
}
function agentHead(core,icon,title){ const h=el('div','fx-wca-h'); const i=el('span','fx-wca-ico lucide-mask'); i.style.webkitMaskImage=i.style.maskImage=`url("${core.lucide(icon)}")`; i.style.background='currentColor'; h.append(i,el('span',null,title)); return h; }
function safe(s){ try{return JSON.parse(s);}catch{return null;} }

/* ---------- 分组视图 ---------- */
function renderGroup(core,main,g){
  if(!g){ active='home'; return renderHome(core,main); }
  const top=el('div','fx-gtop');
  const title=el('div','fx-gtitle'); const ico=el('span','fx-gtitle-ico'); core.mountGroupIcon(ico,g); title.append(ico, el('span',null,g.name), el('span','fx-gtitle-ct',core.flatItems(g).length+' 个'));
  const f=el('form','fx-gsearch'); const si=el('input'); si.placeholder='筛选本组…'; f.appendChild(si); f.addEventListener('submit',e=>{e.preventDefault();core.ask(core.activeProvider(),si.value);});
  si.addEventListener('input',()=>{ const q=si.value.trim().toLowerCase(); $$('.fx-card',main).forEach(c=>{ const t=(c.textContent+' '+(c.title||'')).toLowerCase(); c.style.display=(!q||t.includes(q))?'':'none'; }); });
  const vt=el('div','fx-viewtoggle');
  [['grid','layout-grid','大图'],['list','rows-3','列表'],['detail','list','详情']].forEach(([v,ic,t])=>{ const b=el('button','fx-vbtn'+(core.settings.cardView===v?' on':'')); b.title=t; b.appendChild(mico(ic)); b.onclick=()=>{core.settings.cardView=v;core.save();core.rerender();}; vt.appendChild(b); });
  const acts=el('div','fx-gacts'); acts.append(vt, gbtn('plus','添加网站',()=>core.openItemEditor(null,g.id)), gbtn('folder-plus','新建文件夹',()=>core.openFolderEditor(null,g.id)), gbtn('pencil','编辑分组',()=>core.openGroupEditor(g)));
  top.append(title,f,acts); main.appendChild(top);
  main.appendChild(el('div','fx-draghint','拖拽卡片可排序，拖到分组导航上可移动归类；右键卡片可编辑/删除'));
  const grid=el('div','fx-grid view-'+(core.settings.cardView||'grid')); if(!g.items.length)grid.appendChild(el('div','fx-empty','空分组 — 点上方「添加网站」'));
  g.items.forEach(it=>grid.appendChild(card(core,g,it))); wireGridDnD(core,grid,g); main.appendChild(grid);
}

/* ---------- 文件夹页（二级菜单：子网站/子文件夹当作页面，非弹层）---------- */
function renderFolderPage(core,main,fd,g){
  const isTop=(g.items||[]).includes(fd);   // 顶层文件夹才可再建子文件夹（封顶两级）
  const top=el('div','fx-gtop');
  const title=el('div','fx-gtitle');
  const crumb=el('button','fx-crumb',g.name); crumb.title='返回 '+g.name; crumb.onclick=()=>go(core,g.id);
  const fico=el('span','fx-gtitle-ico lucide-mask'); fico.style.webkitMaskImage=fico.style.maskImage=`url("${core.lucide('folder')}")`; fico.style.background='currentColor';
  title.append(crumb, el('span','fx-crumb-sep','›'), fico, el('span',null,fd.name||'文件夹'), el('span','fx-gtitle-ct',(fd.items||[]).length+' 项'));
  const f=el('form','fx-gsearch'); const si=el('input'); si.placeholder='筛选…'; f.appendChild(si); f.addEventListener('submit',e=>{e.preventDefault();core.ask(core.activeProvider(),si.value);});
  si.addEventListener('input',()=>{ const q=si.value.trim().toLowerCase(); $$('.fx-card',main).forEach(c=>{ const t=(c.textContent+' '+(c.title||'')).toLowerCase(); c.style.display=(!q||t.includes(q))?'':'none'; }); });
  const vt=el('div','fx-viewtoggle'); [['grid','layout-grid','大图'],['list','rows-3','列表'],['detail','list','详情']].forEach(([v,ic,t])=>{ const b=el('button','fx-vbtn'+(core.settings.cardView===v?' on':'')); b.title=t; b.appendChild(mico(ic)); b.onclick=()=>{core.settings.cardView=v;core.save();core.rerender();}; vt.appendChild(b); });
  const acts=el('div','fx-gacts'); acts.append(vt, gbtn('plus','添加网站',()=>{ core._addToFolder={folder:fd,gid:g.id}; core.openItemEditor(null,g.id); }));
  if(isTop) acts.append(gbtn('folder-plus','新建子文件夹',()=>core.openFolderEditor(null,g.id,fd.items||(fd.items=[]))));
  acts.append(gbtn('pencil','重命名/删除文件夹',()=>core.openFolderEditor(fd,g.id)));
  top.append(title,f,acts); main.appendChild(top);
  main.appendChild(el('div','fx-draghint','点击子文件夹进入下一级；右键卡片可编辑/删除/移动；拖拽可排序'));
  const grid=el('div','fx-grid view-'+(core.settings.cardView||'grid')); if(!(fd.items||[]).length)grid.appendChild(el('div','fx-empty','空文件夹 — 点上方「添加网站」'));
  (fd.items||[]).forEach(it=>grid.appendChild(card(core,g,it,isTop?1:2))); wireGridDnD(core,grid,g,fd.items); main.appendChild(grid);
}

/* ---------- 卡片 ---------- */
/* 编辑模式🔓才显示的 ✎编辑 / ✕删除 浮层（锁定🔒时整组隐藏） */
function cardActions(core, it, g){
  const box=el('div','fx-cact edit-only');
  const ed=el('button','fx-cact-btn'); ed.type='button'; ed.title='编辑'; ed.appendChild(mico('pencil',11));
  ed.onclick=e=>{e.preventDefault();e.stopPropagation();core.openItemEditor(it,g&&g.id);};
  const del=el('button','fx-cact-btn danger'); del.type='button'; del.title='删除'; del.appendChild(mico('x',11));
  del.onclick=e=>{e.preventDefault();e.stopPropagation(); core.deleteItem(it);};
  box.append(ed,del); return box;
}
function favCard(core,it,g,pinned){
  const a=el('a','fx-fav'+(it.deadSince?' fx-fav-dead':'')); a.href=it.url; a.target=core.settings.openIn==='_self'?'_self':'_blank'; a.rel='noopener'; a.title=it.url+(it.deadSince?'（最近探测不可达）':''); a.dataset.iid=it.id; a.dataset.pinned=pinned?'true':'false'; a.draggable=!!core.editing&&!!pinned;
  const ico=el('span','fx-fav-ico'); core.mountIcon(ico,it,128);
  const pin=pinned?el('span','fx-fav-pin'):null; if(pin)pin.appendChild(mico('pin',10));
  const dead=el('span','fx-dead-badge'); dead.hidden=!it.deadSince; dead.appendChild(mico('alert-triangle',9));
  a.append(ico, el('span','fx-fav-nm',it.name)); if(pin)a.appendChild(pin); a.append(dead, cardActions(core,it,g));
  a.addEventListener('contextmenu',e=>cardMenu(core,e,it,g));
  a.addEventListener('click',e=>{ if(core.editing){e.preventDefault();core.openItemEditor(it,g&&g.id);} else if(it.frame){e.preventDefault();core.openFrame(it);} else core.recordVisit(it); });
  a.addEventListener('dragstart',e=>{ if(!core.editing||!pinned){e.preventDefault();return;} drag={type:'fav',iid:it.id}; a.classList.add('fx-dragging'); e.dataTransfer.effectAllowed='move'; });
  a.addEventListener('dragend',()=>{a.classList.remove('fx-dragging');drag=null;});
  return a;
}
function card(core,g,it,depth){
  if(core.isFolder(it)) return folderCard(core,g,it,depth||0);
  const a=el('a','fx-card'+(it.deadSince?' fx-card-dead':'')); a.href=it.url; a.target=core.settings.openIn==='_self'?'_self':'_blank'; a.rel='noopener'; a.title=it.url+(it.deadSince?'（最近探测不可达）':''); a.dataset.iid=it.id; a.draggable=!!core.editing;
  const ico=el('span','fx-card-ico'); core.mountIcon(ico,it,64);
  const meta=el('span','fx-card-meta'); meta.append(el('span','fx-card-nm',it.name)); if(it.note)meta.append(el('span','fx-card-note',it.note)); meta.append(el('span','fx-card-url',it.url));
  const dot=el('span','fx-dot'); dot.hidden=true;
  const dead=el('span','fx-dead-badge'); dead.hidden=!it.deadSince; dead.appendChild(mico('alert-triangle',9));
  a.append(ico,meta,dot,dead,cardActions(core,it,g));
  a.addEventListener('contextmenu',e=>cardMenu(core,e,it,g));
  a.addEventListener('click',e=>{ if(core.editing){e.preventDefault();core.openItemEditor(it,g.id);} else if(it.frame){e.preventDefault();core.openFrame(it);} else core.recordVisit(it); });
  a.addEventListener('dragstart',e=>{ if(!core.editing){e.preventDefault();return;} drag={type:'card',gid:g.id,iid:it.id}; a.classList.add('fx-dragging'); e.dataTransfer.effectAllowed='move'; try{e.dataTransfer.setData('text/plain',it.id);}catch{} });
  a.addEventListener('dragend',()=>{a.classList.remove('fx-dragging');drag=null;});
  core.probeStatus(dot,it); return a;
}

/* ---------- 文件夹卡片（子收藏夹）---------- */
function renderFolderMini(core, box, fd){
  box.textContent=''; box.className='fx-card-ico fx-folder-mini'; box.style.cssText='';
  const kids=(fd.items||[]).slice(0,4);
  if(!kids.length){ box.classList.add('lucide-mask'); const u=`url("${core.lucide('folder')}")`; box.style.webkitMaskImage=box.style.maskImage=u; box.style.background='currentColor'; return; }
  box.classList.add('grid'); kids.forEach(ci=>{ const s=el('span','fx-fmini-c');
    if(core.isFolder(ci)){ s.classList.add('lucide-mask'); const u=`url("${core.lucide('folder')}")`; s.style.webkitMaskImage=s.style.maskImage=u; s.style.background='currentColor'; }
    else core.mountIcon(s,ci,32); box.appendChild(s); });
  for(let i=kids.length;i<4;i++) box.appendChild(el('span','fx-fmini-c'));   // 不足 4 项补空格子，2×2 马赛克不残缺
}
function folderActions(core, fd, g){
  const box=el('div','fx-cact edit-only');
  const ed=el('button','fx-cact-btn'); ed.type='button'; ed.title='重命名文件夹'; ed.appendChild(mico('pencil',11));
  ed.onclick=e=>{e.preventDefault();e.stopPropagation();core.openFolderEditor(fd,g.id);};
  const del=el('button','fx-cact-btn danger'); del.type='button'; del.title='删除文件夹'; del.appendChild(mico('x',11));
  del.onclick=e=>{e.preventDefault();e.stopPropagation();core.openFolderEditor(fd,g.id);}; // 删除走编辑器(带子项移回确认)
  box.append(ed,del); return box;
}
function folderCard(core,g,fd,depth){
  const a=el('button','fx-card fx-folder'); a.type='button'; a.title=fd.name||'文件夹'; a.dataset.iid=fd.id; a.draggable=!!core.editing;
  const nSub=(fd.items||[]).filter(x=>core.isFolder(x)).length, nSite=(fd.items||[]).length-nSub;
  const ico=el('span','fx-card-ico fx-folder-mini'); renderFolderMini(core,ico,fd);
  const meta=el('span','fx-card-meta'); meta.append(el('span','fx-card-nm',fd.name||'文件夹'), el('span','fx-card-url', nSite+' 网站'+(nSub?(' · '+nSub+' 子夹'):'')));
  a.append(ico,meta, folderActions(core,fd,g));
  a.addEventListener('click',e=>{ e.preventDefault(); if(core.editing) core.openFolderEditor(fd,g.id); else go(core,fd.id); });   // 进入文件夹页（二级菜单，非弹层）
  a.addEventListener('contextmenu',e=>folderMenu(core,e,fd,g,depth||0));
  // 文件夹本身可拖拽重排（作为一张卡）
  a.addEventListener('dragstart',e=>{ if(!core.editing){e.preventDefault();return;} drag={type:'card',gid:g.id,iid:fd.id}; a.classList.add('fx-dragging'); e.dataTransfer.effectAllowed='move'; try{e.dataTransfer.setData('text/plain',fd.id);}catch{} });
  a.addEventListener('dragend',()=>{a.classList.remove('fx-dragging');drag=null;});
  // 拖一张卡到文件夹上 → 移入（Toby 式显式落入，非 Infinity 悬停叠夹）
  a.addEventListener('dragover',e=>{ if(drag&&drag.type==='card'&&drag.iid!==fd.id){ e.preventDefault(); e.stopPropagation(); a.classList.add('fx-folder-drop'); } });
  a.addEventListener('dragleave',()=>a.classList.remove('fx-folder-drop'));
  a.addEventListener('drop',e=>{ a.classList.remove('fx-folder-drop'); if(drag&&drag.type==='card'&&drag.iid!==fd.id){ e.preventDefault(); e.stopPropagation();
    const item=findItemById(core,g,drag.iid); if(item && !core.isFolder(item)){ core.moveItemToFolder(item,fd,g); core.toast('已移入「'+(fd.name||'文件夹')+'」','ok'); } drag=null; } });
  return a;
}
function findItemById(core,g,iid){ const find=arr=>{ for(const it of (arr||[])){ if(it.id===iid)return it; if(core.isFolder(it)){ const r=find(it.items); if(r)return r; } } return null; }; return find(g.items); }
function folderMenu(core,e,fd,g,depth){ e.preventDefault(); depth=depth||0;
  const items=[{ic:'folder-open', label:'打开文件夹', on:()=>go(core,fd.id)}];
  if(core.editing){ items.push('-', {ic:'pencil', label:'重命名', on:()=>core.openFolderEditor(fd,g.id)});
    if(depth<1) items.push({ic:'folder-plus', label:'新建子文件夹', on:()=>core.openFolderEditor(null,g.id,fd.items||(fd.items=[]))});
    items.push({ic:'trash-2', label:'删除文件夹', danger:true, on:()=>core.openFolderEditor(fd,g.id)}); }
  else items.push('-', {ic:'lock-open', label:'解锁后可编辑', on:()=>{ core.editing=true; document.body.classList.add('editing'); core.rerender(); }});
  showCtx(e.clientX,e.clientY,items);
}

/* ---------- 右键菜单 ---------- */
function cardMenu(core,e,it,g){
  e.preventDefault();
  const items=[
    {ic:'external-link', label:'新标签打开', on:()=>window.open(it.url,'_blank')},
    {ic:'monitor', label:'面板内打开', on:()=>core.openFrame(it)},
    {ic:'copy', label:'复制链接', on:()=>{ try{navigator.clipboard.writeText(it.url);core.toast('链接已复制','ok');}catch{} }},
  ];
  // 编辑/常用/删除 只在解锁🔓时给（锁定时只读，防误操作）
  if(core.editing){
    const pinned=it.fav===true;
    items.unshift({ic:'pencil', label:'编辑', on:()=>core.openItemEditor(it, g&&g.id)});
    items.push({ic:pinned?'pin-off':'pin', label:pinned?'取消锁定':'锁定到常用', on:()=>{ pinned?core.unfavorite(it):core.pinFavorite(it); core.toast(pinned?'已取消锁定':'已锁定到常用','ok'); core.rerender(); }});
    // 文件夹移动（递归列出各层文件夹，缩进标示层级）
    if(g){ const inFolder=core._itemFolder(g,it);
      if(inFolder) items.push({ic:'corner-up-left', label:'移出到分组', on:()=>core.moveItemOutOfFolder(it,inFolder,g)});
      core.allFolders(g).forEach(({folder:fd,depth})=>{ if(fd!==inFolder) items.push({ic:'folder-input', label:'　'.repeat(depth)+'移入「'+(fd.name||'文件夹')+'」', on:()=>{ core.moveItemToFolder(it,fd,g); core.toast('已移入「'+(fd.name||'文件夹')+'」','ok'); }}); });
      items.push({ic:'folder-plus', label:'新建文件夹并移入', on:()=>{ const fd={id:core.uid('f'),type:'folder',name:'新文件夹',icon:'folder',items:[]}; g.items.push(fd); core.moveItemToFolder(it,fd,g); core.openFolderEditor(fd,g.id); }});
    }
    items.push('-', {ic:'trash-2', label:'删除', danger:true, on:()=>core.deleteItem(it)});
  } else {
    items.push('-', {ic:'lock-open', label:'解锁后可编辑/删除', on:()=>{ core.editing=true; document.body.classList.add('editing'); core.rerender(); }});
  }
  showCtx(e.clientX, e.clientY, items);
}
function showCtx(x,y,items){
  hideCtx(); ctxMenu=el('div','fx-ctx');
  items.forEach(it=>{ if(it==='-'){ctxMenu.appendChild(el('div','fx-ctx-sep'));return;}
    const b=el('button','fx-ctx-item'+(it.danger?' danger':'')+(it.sel?' sel':''));
    if(it.ic){ const s=el('span','fx-ctx-ico lucide-mask'); s.style.webkitMaskImage=s.style.maskImage=`url("${lucide(it.ic)}")`; s.style.background='currentColor'; b.appendChild(s); }
    b.appendChild(el('span','fx-ctx-lb',it.label));
    b.onclick=ev=>{ev.stopPropagation();hideCtx();it.on();}; ctxMenu.appendChild(b); });
  ctxMenu.style.left=x+'px'; ctxMenu.style.top=y+'px'; document.body.appendChild(ctxMenu);
  const r=ctxMenu.getBoundingClientRect(); if(r.right>innerWidth)ctxMenu.style.left=(x-r.width)+'px'; if(r.bottom>innerHeight)ctxMenu.style.top=(y-r.height)+'px';
}
function hideCtx(){ if(ctxMenu){ctxMenu.remove();ctxMenu=null;} }

/* ---------- 拖拽（默认即可拖，无需编辑模式）---------- */
function wireGridDnD(core,grid,g,arr){ arr=arr||g.items;
  grid.addEventListener('dragover',e=>{ if(!drag||drag.type!=='card'||drag.gid!==g.id)return; e.preventDefault(); const after=afterEl(grid,'.fx-card',e.clientX,e.clientY); const d=grid.querySelector('.fx-card.fx-dragging'); if(!d)return; if(after==null)grid.appendChild(d); else grid.insertBefore(d,after); });
  grid.addEventListener('drop',e=>{ if(!drag||drag.type!=='card')return; e.preventDefault(); const order=$$('.fx-card',grid).map(c=>c.dataset.iid); arr.sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id)); drag=null; core.save(true); });
}
function wireFavDnD(core,row){
  row.addEventListener('dragover',e=>{ if(!drag||drag.type!=='fav')return; e.preventDefault();
    const after=afterEl(row,'.fx-fav[data-pinned="true"]',e.clientX,e.clientY); const d=row.querySelector('.fx-fav.fx-dragging'); if(!d)return;
    if(after==null) row.insertBefore(d,row.querySelector('.fx-fav[data-pinned="false"]')); else row.insertBefore(d,after); });
  row.addEventListener('drop',e=>{ if(!drag||drag.type!=='fav')return; e.preventDefault();
    const visibleIds=$$('.fx-fav[data-pinned="true"]',row).map(c=>c.dataset.iid);
    core.setFavOrder(visibleIds);
    drag=null; });
}
function wireSidebarDnD(core,nav){
  const add=nav.querySelector('.fx-addgroup');
  nav.addEventListener('dragover',e=>{ if(drag&&drag.type==='group'){ e.preventDefault(); const after=afterEl(nav,'.fx-navitem[data-gid]',e.clientX,e.clientY); const d=nav.querySelector('.fx-navitem.fx-dragging'); if(!d)return; if(after==null)nav.insertBefore(d,add); else nav.insertBefore(d,after); } });
  nav.addEventListener('drop',e=>{ if(drag&&drag.type==='group'){ e.preventDefault(); const order=$$('.fx-navitem[data-gid]',nav).map(c=>c.dataset.gid); core.groups.sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id)); drag=null; core.save(true); } });
  setTimeout(()=>$$('.fx-navitem[data-gid]',nav).forEach(item=>{
    item.draggable=true;
    item.addEventListener('dragstart',e=>{ drag={type:'group',gid:item.dataset.gid}; item.classList.add('fx-dragging'); e.dataTransfer.effectAllowed='move'; });
    item.addEventListener('dragend',()=>{item.classList.remove('fx-dragging');drag=null;});
    // 卡片拖到分组上 → 归类
    item.addEventListener('dragover',e=>{ if(drag&&drag.type==='card'){ e.preventDefault(); item.classList.add('fx-droptarget'); } });
    item.addEventListener('dragleave',()=>item.classList.remove('fx-droptarget'));
    item.addEventListener('drop',e=>{ if(drag&&drag.type==='card'){ e.preventDefault(); item.classList.remove('fx-droptarget'); const gid=item.dataset.gid, iid=drag.iid; if(core.moveItemToGroup(iid,gid)){ const gn=(core.groups.find(g=>g.id===gid)||{}).name; core.toast('已移动到「'+gn+'」','ok'); drag=null; core.rerender(); } } });
  }),0);
}
function afterEl(box,sel,x,y){ const els=$$(sel+':not(.fx-dragging)',box); let best=null,bestD=Infinity,before=true;
  for(const c of els){ const r=c.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,d=Math.hypot(cx-x,cy-y); if(d<bestD){bestD=d;best=c;before=(y<cy-3)||(Math.abs(y-cy)<=3&&x<cx);} }
  if(!best)return null; return before?best:best.nextElementSibling;
}
function mico(name,size){ const s=el('span','lucide-mask'); s.style.webkitMaskImage=s.style.maskImage=`url("${lucide(name)}")`; s.style.background='currentColor'; const z=(size||14)+'px'; s.style.width=z; s.style.height=z; return s; }
function gbtn(ic,title,on){ const b=el('button','fx-gbtn'); b.title=title; b.onclick=on;
  const s=el('span','fx-gbtn-ico lucide-mask'); s.style.webkitMaskImage=s.style.maskImage=`url("${lucide(ic)}")`; s.style.background='currentColor'; b.appendChild(s); return b; }
function startClock(core){
  const tick=()=>{ if(!clockEls)return; const d=new Date(),p=n=>String(n).padStart(2,'0');
    if(!core.settings.showClock){ clockEls.time.textContent=''; clockEls.date.textContent=''; clockEls.greet.textContent=''; return; }
    clockEls.time.textContent=`${p(d.getHours())}:${p(d.getMinutes())}`;
    const wk=['日','一','二','三','四','五','六'][d.getDay()]; clockEls.date.textContent=`${d.getMonth()+1}月${d.getDate()}日 周${wk}`;
    const h=d.getHours(); clockEls.greet.textContent=h<6?'夜深了':h<11?'早上好':h<14?'中午好':h<18?'下午好':h<22?'晚上好':'夜深了'; };
  tick(); clockTimer=setInterval(tick,1000*15);
}
