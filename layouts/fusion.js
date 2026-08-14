/* ============ 融合布局 v3.1：极简AI首页 + 锁屏时钟 + 右键编辑 + 拖拽 ============ */
import { $, $$, el, safeHref } from '../shared/core.js?v=3.26.8';
import { dashboardIcon, lucide } from '../shared/icon-map.js?v=3.26.3';
import { fetchGlances } from '../shared/hwmon.js';
import { PRESETS } from '../shared/bg-presets.js';
import { effectiveTheme, ONLINE_SOURCES, DEFAULT_ONLINE_SOURCE } from '../shared/background.js';
import { filterContent, filterKeyAction } from '../shared/provider-action.js';
import { homeDensity, visibleWidgets } from '../shared/home-settings.js?v=3.26.8';
import { formatHeroClock, normalizeHeroClock } from '../shared/hero-clock.js?v=3.26.8';
const picon = p => (p.icon && p.icon.startsWith('http')) ? p.icon : dashboardIcon(p.icon);
let active='home', clockTimer=null, drag=null, clockEls=null, ctxMenu=null, ctxTrigger=null, askOutsideHandler=null, sidebarOpen=false;

document.addEventListener('click', ()=>hideCtx());
document.addEventListener('scroll', ()=>hideCtx(), true);
document.addEventListener('keydown', event=>{ if(event.key==='Escape' && sidebarOpen) setSidebarOpen(false); });

export function setSidebarOpen(value){
  sidebarOpen=!!value;
  const root=document.querySelector('.lay-fusion');
  if(root) root.classList.toggle('sidebar-open',sidebarOpen);
  document.body.classList.toggle('sidebar-open',sidebarOpen);
  const trigger=root&&root.querySelector('.fx-mobile-menu');
  if(trigger) trigger.setAttribute('aria-expanded',String(sidebarOpen));
}

export function mount(root, core){
  root.className='lay-fusion'+(core.settings.sideCollapsed?' side-collapsed':'')+(sidebarOpen?' sidebar-open':'');
  if(clockTimer){ clearInterval(clockTimer); clockTimer=null; } clockEls=null;
  hideCtx();                                                     // D8: 右键菜单随重渲染清理，防残留 body
  if(bgPanelEl){ bgPanelEl.remove(); bgPanelEl=null; }           // D8: 背景面板锚点已随旧树销毁，面板不清会滞留
  if(core._navTo!==undefined){ active=core._navTo; core._navTo=undefined; }   // 命令面板/外部跳转分组
  if(active!=='home' && !findNode(core,active)) active='home';
  const wrap=el('div','fx-wrap');
  const mobileMenu=el('button','fx-mobile-menu'); mobileMenu.type='button'; mobileMenu.title='打开导航'; mobileMenu.setAttribute('aria-label','打开导航'); mobileMenu.setAttribute('aria-controls','fx-side'); mobileMenu.setAttribute('aria-expanded',String(sidebarOpen)); mobileMenu.appendChild(mico('menu',18)); mobileMenu.onclick=()=>setSidebarOpen(true);
  const scrim=el('button','fx-side-scrim'); scrim.type='button'; scrim.tabIndex=-1; scrim.setAttribute('aria-label','关闭导航'); scrim.onclick=()=>setSidebarOpen(false);
  wrap.append(mobileMenu,buildSidebar(core),scrim);
  const main=el('section','fx-main'); main.id='fx-main';
  wrap.appendChild(main);
  root.appendChild(wrap);
  renderMain(core, main);
}

/* ---------- 侧边栏 ---------- */
function buildSidebar(core){
  const side=el('aside','fx-side'); side.id='fx-side';
  const close=el('button','fx-side-close'); close.type='button'; close.title='关闭导航'; close.setAttribute('aria-label','关闭导航'); close.appendChild(mico('x',18)); close.onclick=()=>setSidebarOpen(false); side.appendChild(close);
  const brand=el('button','fx-brand'); brand.onclick=()=>go(core,'home'); brand.title=core.settings.title||'Fu 导航';
  const logo=el('img','fx-logo'); logo.src='icons/icon128.png'; logo.alt='';
  brand.append(logo, el('h1',null, core.settings.title||'Fu 导航'));
  // 快速收折按钮：贴在品牌右侧，点一下侧栏在「窄图标条 ⇄ 完整」间切换（CSS 过渡，无需重渲染）
  const collapseBtn=el('button','fx-collapse'); collapseBtn.title='收起/展开侧栏';
  collapseBtn.setAttribute('aria-label','收起或展开侧栏');
  const setCollapseIco=()=>{ collapseBtn.textContent=''; collapseBtn.setAttribute('aria-expanded',String(!core.settings.sideCollapsed)); collapseBtn.appendChild(mico(core.settings.sideCollapsed?'chevrons-right':'chevrons-left',13)); }; setCollapseIco();
  collapseBtn.onclick=e=>{ e.stopPropagation(); core.settings.sideCollapsed=!core.settings.sideCollapsed; core.save();
    const r=document.querySelector('.lay-fusion'); if(r)r.classList.toggle('side-collapsed',core.settings.sideCollapsed);
    setCollapseIco(); };
  side.append(brand, collapseBtn);
  const nav=el('nav','fx-nav');
  nav.appendChild(navItem(core,'home','house','首页',null,()=>go(core,'home')));
  const am=core.activeModeObj();
  if(am!=='privacy'){
    const inMode=g=>am===null || am.groupIds.includes(g.id);
    const visibleGroups=core.groups.filter(g=>inMode(g)&&!g.archived);
    visibleGroups.forEach(g=> navGroup(core,g).forEach(n=>nav.appendChild(n)));
    if(!visibleGroups.length) nav.appendChild(el('div','fx-side-empty',am===null?'还没有分组 — 从「新建分组」开始':'这个模式还没有分组 — 到「管理模式」勾选分组'));
    if(core.editing){ const addG=el('button','fx-navitem fx-addgroup'); addG.innerHTML=`<span class="fx-ni-ico lucide-mask" style="-webkit-mask-image:url('${lucide('plus')}');mask-image:url('${lucide('plus')}')"></span><span class="fx-ni-nm">新建分组</span>`; addG.onclick=()=>core.openGroupEditor(null); nav.appendChild(addG); }
  }
  if(core.editing) wireSidebarDnD(core,nav); side.appendChild(nav);
  const modeHub=el('div','fx-mode-hub');
  const modeCurrent=am==='privacy'?'隐私模式':am?am.name:'全部收藏';
  const modeSwitch=el('button','fx-mode-hub-main'+(am!==null?' on':'')); modeSwitch.type='button'; modeSwitch.dataset.tour='mode';
  modeSwitch.title=`工作区：${modeCurrent}（点击切换）`; modeSwitch.setAttribute('aria-label',modeSwitch.title);
  modeSwitch.append(mico(am==='privacy'?'eye':'layers',16),el('span','fx-mode-hub-copy',null));
  const modeCopy=modeSwitch.querySelector('.fx-mode-hub-copy'); modeCopy.append(el('small',null,'工作区'),el('strong',null,modeCurrent)); modeSwitch.onclick=e=>openModeMenu(core,e);
  const modeManage=el('button','fx-mode-hub-manage'); modeManage.type='button'; modeManage.title='管理工作区'; modeManage.setAttribute('aria-label','管理工作区'); modeManage.appendChild(mico('settings-2',14)); modeManage.onclick=()=>{setSidebarOpen(false);core.openModeManager();};
  modeHub.append(modeSwitch,modeManage); side.appendChild(modeHub);
  const foot=el('div','fx-side-foot');
  // 添加网站
  const addBtn=sideBtn(core,'plus','添加网站',()=>core.openItemEditor(null, active!=='home'?active:core.groups[0]?.id));
  // 锁定/编辑模式：锁定=日常使用(点开链接/不可改)；解锁=可拖拽排序/编辑/删除卡片
  const editTitle=()=> core.editing ? '编辑模式 — 卡片可拖拽排序 / 悬停出现编辑与删除按钮 / 右键更多；点击锁定' : '已锁定 — 防误改，点击即打开链接；点击解锁可编辑/拖拽/删除';
  const editBtn=sideBtn(core, core.editing?'lock-open':'lock', editTitle(), function(){ const editing=core.setEditing(!core.editing); core.toast(editing?'已解锁：可拖拽排序、编辑、删除卡片':'已锁定：点击即打开链接','ok'); });
  editBtn.dataset.tour='lock';
  if(core.editing) editBtn.classList.add('on');
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
  setBtn.dataset.tour='settings';
  foot.append(cmdBtn); if(core.editing)foot.append(addBtn); foot.append(editBtn, themeBtn, setBtn);
  side.appendChild(foot); setTimeout(markNav,0); return side;
}
function setIcon(core,btn,name){ const s=btn.querySelector('.fx-sb-ico'); if(s){ s.style.webkitMaskImage=s.style.maskImage=`url("${core.lucide(name)}")`; } }
function navItem(core,key,icon,name,count,on,group){
  const a=el('button','fx-navitem'); a.dataset.k=key; a.title=name; if(group)a.dataset.gid=group.id;
  const ico=el('span','fx-ni-ico');
  if(group) core.mountGroupIcon(ico,group); else { ico.classList.add('lucide-mask'); ico.style.webkitMaskImage=ico.style.maskImage=`url("${core.lucide(icon)}")`; ico.style.background='currentColor'; }
  a.append(ico, el('span','fx-ni-nm',name)); if(count!=null)a.appendChild(el('span','fx-ni-ct',String(count)));
  a.onclick=on; if(group) a.oncontextmenu=e=>{ e.preventDefault();
    if(!core.editing){ showCtx(e.clientX,e.clientY,[{ic:'lock-open',label:'解锁后可编辑分组',on:()=>core.setEditing(true)}],e.currentTarget); return; }
    const menu=[{ic:'pencil', label:'编辑分组', on:()=>core.openGroupEditor(group)}];
    if(core.modes().length){ menu.push('-'); core.modes().forEach(mode=>{ const has=mode.groupIds.includes(group.id);
      menu.push({ic:'layers',sel:has,label:mode.name,on:()=>{ core.toggleModeGroup(mode,group.id); core.toast(has?('已移出「'+mode.name+'」'):('已加入「'+mode.name+'」'),'ok'); }}); }); }
    menu.push({ic:'settings-2', label:'管理模式…', on:()=>core.openModeManager()});
    menu.push('-', {ic: group.archived?'archive-restore':'archive', label: group.archived?'取消归档':'归档分组', on:()=>{ group.archived=group.archived?undefined:true; core.save(true); core.rerender(); core.toast(group.archived?'已归档，可在设置中管理':'已取消归档','ok'); }});
    showCtx(e.clientX,e.clientY,menu,e.currentTarget); };
  return a;
}
function sideBtn(core,icon,title,on){ const b=el('button','fx-sidebtn'); b.title=title; b.setAttribute('aria-label',title); b.onclick=event=>{ setSidebarOpen(false); on(event); };
  const s=el('span','fx-sb-ico lucide-mask'); s.style.webkitMaskImage=s.style.maskImage=`url("${core.lucide(icon)}")`; s.style.background='currentColor';
  b.appendChild(s); return b; }
/* 场景模式切换器：全部 / 多属分组模式 / 隐私 */
function openModeMenu(core,e){
  if(e){ e.stopPropagation(); e.preventDefault(); }   // 阻止冒泡到 document 的 click→hideCtx 把菜单立刻关掉
  const am=core.activeModeObj();
  const items=[{ic:'layout-grid',sel:am===null,label:'全部收藏',on:()=>core.setActiveMode(null)}];
  core.modes().forEach(mode=>items.push({ic:'layers',sel:am&&am.id===mode.id,label:mode.name,on:()=>core.setActiveMode(mode.id)}));
  items.push('-', {ic:'eye-off',sel:am==='privacy',label:'隐私模式（只留搜索/天气）',on:()=>core.setActiveMode('privacy')});
  items.push('-', {ic:'settings-2',label:'管理模式…',on:()=>core.openModeManager()});
  if(e?.currentTarget){openMenu(e.currentTarget,items);return;} const x=120, y=innerHeight-40; showCtx(x,y,items);
}
/* 侧栏点分组 → 进该分组页 */
function openGroup(core,gid){ go(core,gid); }
/* 侧栏两级子目录树：分组 → 文件夹 → 子文件夹，可展开/收折 */
function isTreeOpen(core,id){ return !!(core.settings.treeOpen && core.settings.treeOpen[id]); }
function toggleTree(core,id){ const t=core.settings.treeOpen||(core.settings.treeOpen={}); t[id]=!t[id]; core.save(); core.rerender(); }
function caret(core,id,onToggle,open){ const expanded=open!=null?open:isTreeOpen(core,id); const c=el('span','fx-ni-caret lucide-mask'+(expanded?' open':'')); c.style.webkitMaskImage=c.style.maskImage=`url("${lucide('chevron-right')}")`; c.setAttribute('aria-hidden','true');
  c.onclick=e=>{ e.stopPropagation(); e.preventDefault(); onToggle(); }; return c; }
function navGroup(core,g){ const out=[]; const folders=(g.items||[]).filter(x=>core.isFolder(x));
  const activeInGroup=folders.some(f=>f.id===active);
  const row=navItem(core,g.id,g.icon,g.name,core.flatItems(g).length,()=>openGroup(core,g.id),g);
  if(folders.length){ const expanded=isTreeOpen(core,g.id)||activeInGroup; row.setAttribute('aria-expanded',String(expanded)); row.setAttribute('aria-label',`${g.name}，${expanded?'已展开':'已收起'}，按左右方向键展开或收起`);
    row.addEventListener('keydown',e=>{ if(e.key==='ArrowRight'&&!expanded){e.preventDefault();toggleTree(core,g.id);} else if(e.key==='ArrowLeft'&&expanded){e.preventDefault();toggleTree(core,g.id);} });
    row.insertBefore(caret(core,g.id,()=>toggleTree(core,g.id),expanded),row.firstChild); }
  out.push(row);
  // 二级菜单：分组 → 其（顶层）文件夹子项，点击进入该子项页面（更深子文件夹在页内进入，不塞侧栏）
  if(folders.length && (isTreeOpen(core,g.id)||activeInGroup)) folders.forEach(fd=>{
    const r=el('button','fx-navitem fx-navfolder'); r.title=fd.name||'文件夹'; r.dataset.k=fd.id;
    const ico=el('span','fx-ni-ico lucide-mask'); ico.style.webkitMaskImage=ico.style.maskImage=`url("${core.lucide('folder')}")`; ico.style.background='currentColor';
    r.append(ico, el('span','fx-ni-nm',fd.name||'文件夹'), el('span','fx-ni-ct',String((fd.items||[]).length)));
    r.onclick=()=>go(core,fd.id);   // 进入文件夹子页面
    out.push(r); });
  return out; }
function go(core,key){ active=key; setSidebarOpen(false); renderMain(core,$('#fx-main')); markNav(); }
function markNav(){ $$('.fx-navitem').forEach(b=>b.classList.toggle('on', b.dataset.k===active)); }

/* ---------- 主区 ---------- */
/* 按 id 解析当前视图：分组 或 文件夹（含所属分组）*/
function findFolderById(core,g,id){ const find=arr=>{ for(const it of (arr||[])){ if(core.isFolder(it)){ if(it.id===id)return it; const r=find(it.items); if(r)return r; } } return null; }; return find(g.items); }
function findNode(core,id){ for(const g of core.groups){ if(g.id===id) return {group:g}; const fd=findFolderById(core,g,id); if(fd) return {group:g, folder:fd}; } return null; }
function renderMain(core,main){ if(!main)return; main.className='fx-main'; main.textContent='';
  if(active==='home'){ core.applyBackground(true); renderHome(core,main); return; }
  core.applyBackground(false);
  const node=findNode(core,active);
  if(!node){ active='home'; core.applyBackground(true); return renderHome(core,main); }
  if(node.folder) renderFolderPage(core,main,node.folder,node.group);
  else renderGroup(core,main,node.group);
}

function renderHome(core,main){
  const am=core.activeModeObj(), priv=am==='privacy';
  const density=homeDensity(innerWidth,innerHeight);
  main.classList.toggle('home-compact',density==='compact');
  const home=el('div','fx-home density-'+density+(priv?' fx-home-priv':''));
  home.dataset.density=density;
  if(!priv){ const grid=core.favGrid(); const contentScale=grid.rows===3?(grid.cols===8?.76:.84):1; home.style.setProperty('--home-scale',density==='compact'?Math.min(contentScale,.82):contentScale); }
  if(!priv) home.appendChild(buildBgTrigger(core));   // 背景切换悬浮入口（隐私模式不显示，减少干扰）
  if(!priv && core.settings.demoMode) home.appendChild(buildDemoBadge(core));
  const primary=el('div','fx-home-primary');
  if(!priv && core.settings.showClock!==false) primary.appendChild(buildHeroClock(core));
  primary.appendChild(buildAsk(core));               // 搜索是首页第一任务
  if(!priv && !(am&&am.showFavs===false)){ const favs=core.favorites(), grid=core.favGrid();
    if(favs.length){
      const row=el('div',`fx-favs cols-${grid.cols}`); row.style.setProperty('--fav-cols',grid.cols);
      favs.forEach(({item,group,pinned})=>row.appendChild(favCard(core,item,group,pinned)));
      if(core.editing) wireFavDnD(core,row);
      primary.appendChild(row);
    } else {
      primary.appendChild(el('div','fx-home-empty','还没有常用网站 — 解锁后点「添加网站」，或到 设置 → 导入浏览器书签'));   // R5 空态引导
    } }
  const widgets=buildWidgetCards(core,priv);
  home.classList.toggle('no-widgets',!widgets.childElementCount);
  home.appendChild(primary);
  if(widgets.childElementCount) home.appendChild(widgets);   // 组件始终位于搜索与常用之后
  main.appendChild(home);
}

function buildDemoBadge(core){
  const badge=el('aside','fx-demo-badge'); badge.setAttribute('aria-label','演示数据提示');
  badge.appendChild(el('span',null,'正在浏览演示数据'));
  const replace=el('button',null,'更换'); replace.type='button'; replace.title='更换演示数据'; replace.onclick=()=>core.openOnboarding();
  const clear=el('button',null,'清空'); clear.type='button'; clear.title='清空演示数据'; clear.onclick=()=>core.clearDemoData();
  const close=el('button',null,'关闭'); close.type='button'; close.title='关闭演示提示';
  close.onclick=()=>{ core.settings.demoMode=false; core.save(true); badge.remove(); };
  badge.append(replace,clear,close); return badge;
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
  const status=el('div','fn-sub',''); status.setAttribute('role','status'); status.setAttribute('aria-live','polite');
  // 在线源按用途分组；点选后走统一的图片响应校验 + Blob 落盘管线。
  panel.appendChild(el('div','fx-bg-seclabel','在线壁纸源'));
  const current=(bg.onlineSrc&&bg.onlineSrc.id)||DEFAULT_ONLINE_SOURCE;
  const SRC_ICONS={ bing:'mountain', ycy:'sparkles', moez:'wand-sparkles', ai:'bot', ysz:'sparkles', pc:'monitor', moe:'sparkles', fj:'camera', bd:'sun', ys:'image', acg:'film', mp:'smartphone', picsum:'camera' };
  ['每日精选','二次元','摄影','其他'].forEach(group=>{
    const sources=ONLINE_SOURCES.filter(s=>s.group===group); if(!sources.length)return;
    panel.appendChild(el('div','fx-bg-group',group)); const srcRow=el('div','fx-bg-srcrow');
    sources.forEach(s=>{
      const btn=el('button','fx-bg-src'+(bg.mode==='online'&&current===s.id?' sel':'')); btn.type='button'; btn.title=s.name+'：'+s.desc;
      const ic=el('span','fx-bg-src-ic lucide-mask');
      const setIc=(name,spin)=>{ ic.style.webkitMaskImage=ic.style.maskImage=`url("${core.lucide(name)}")`; ic.classList.toggle('spin',!!spin); };
      setIc(SRC_ICONS[s.id]||'image'); btn._resetIc=()=>setIc(SRC_ICONS[s.id]||'image');
      btn.append(ic, el('span','fx-bg-src-nm',s.name), el('span','fx-bg-src-ds',s.desc));
      // 大图下载要几秒：反馈就地落在被点按钮上（spinner），不能只靠面板底部的 status 文本（DESIGN.md 动效分层）
      btn.onclick=async()=>{
        $$('.fx-bg-src',panel).forEach(x=>x._resetIc&&x._resetIc());   // 改点新源时，把上一个还在转的恢复
        setIc('loader-circle',true); status.textContent='拉取「'+s.name+'」中…（随机大图下载可能要几秒）';
        const r=await core.refreshOnlineBackground({id:s.id});
        if(r.superseded) return;   // 已被更新的点击取代：新请求的回调接管 UI
        setIc(SRC_ICONS[s.id]||'image');
        status.textContent=r.ok?('已换「'+s.name+'」'):('失败：'+r.reason);
        if(!r.ok) core.toast('壁纸拉取失败：'+r.reason,'err');
        $$('.fx-bg-src',panel).forEach(x=>x.classList.remove('sel')); if(r.ok)btn.classList.add('sel'); };
      srcRow.appendChild(btn);
    }); panel.appendChild(srcRow);
  });
  panel.appendChild(el('div','fx-bg-seclabel','自定义图片地址'));
  const customRow=el('div','fx-bg-custom fn-field'), customI=core.inp(current==='custom'?(bg.onlineSrc.url||''):'','https://example.com/wallpaper.jpg'); customI.type='url';
  customI.setAttribute('aria-label','自定义壁纸图片地址');
  const customBtn=core.btn('使用','ghost',async()=>{ const url=customI.value.trim(); try{ const u=new URL(url); if(!/^https?:$/.test(u.protocol))throw 0; }catch{ core.toast('请输入有效的 http(s) 图片地址','err'); return; }
    await core.ensureCloudPermission(url); status.textContent='正在校验图片…'; const r=await core.refreshOnlineBackground({id:'custom',url});
    if(r.superseded) return;
    status.textContent=r.ok?'已应用自定义壁纸':'该地址未返回图片，请检查'; if(!r.ok)core.toast('该地址未返回图片，请检查','err'); },'link');
  customRow.append(customI,customBtn); panel.appendChild(customRow);
  panel.appendChild(el('div','fx-bg-seclabel','更新频率'));
  const presetValues=new Set([0,15,60,720,1440,10080]), refresh=Number(bg.refreshEvery)||0, refreshKey=presetValues.has(refresh)?String(refresh):'custom';
  const customMinutes=core.inp(refreshKey==='custom'?String(refresh):'','分钟数'); customMinutes.type='number'; customMinutes.min='1'; customMinutes.step='1'; customMinutes.setAttribute('aria-label','壁纸自动更新分钟数');
  const customRefresh=el('div','fx-bg-custom fn-field');
  const applyMinutes=core.btn('应用分钟数','ghost',()=>{ const n=Math.floor(Number(customMinutes.value)); if(!(n>0)){status.textContent='请输入大于 0 的分钟数';return;} bg.refreshEvery=n; core.save(true); core.applyBackground(true); status.textContent='已设为每 '+n+' 分钟检查一次'; },'timer-reset');
  customRefresh.append(customMinutes,applyMinutes); customRefresh.hidden=refreshKey!=='custom';
  const refreshSeg=core.seg([['0','仅手动'],['15','15 分钟'],['60','1 小时'],['720','12 小时'],['1440','1 天'],['10080','7 天'],['custom','自定义']],refreshKey,v=>{
    customRefresh.hidden=v!=='custom'; if(v!=='custom'){ bg.refreshEvery=Number(v); core.save(true); core.applyBackground(true); status.textContent=v==='0'?'已设为仅手动更新':'更新频率已保存'; }
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
  prov.setAttribute('aria-label','切换搜索引擎 / AI'); prov.setAttribute('aria-haspopup','menu'); prov.setAttribute('aria-expanded','false');
  prov.appendChild(el('span','fx-ask-prov-cv'));   // 单独图标层，留出下拉小箭头
  { const ar=mico('chevron-down',10); ar.classList.add('fx-ask-prov-ar'); prov.appendChild(ar); }
  const inp=el('input'); inp.type='text'; inp.autocomplete='off'; inp.setAttribute('aria-label','搜索或询问');
  const send=el('button','fx-ask-send'); send.type='submit'; send.title='发送'; send.appendChild(mico('corner-down-left',17));
  box.append(prov,inp,send);
  const menu=el('div','fx-provmenu'); menu.hidden=true; menu.setAttribute('role','menu');
  const results=el('div','fx-ask-results'); results.hidden=true;
  const status=el('div','fx-ask-status'); status.hidden=true; status.setAttribute('role','status'); status.setAttribute('aria-live','polite');
  const cv=prov.querySelector('.fx-ask-prov-cv');
  let feedbackTimer=null;
  const clearFeedback=()=>{ clearTimeout(feedbackTimer); status.hidden=true; status.textContent=''; prov.classList.remove('copied'); prov.setAttribute('aria-label','切换搜索引擎 / AI'); prov.title='切换搜索引擎 / AI'; };
  const showFeedback=(message,kind)=>{ const text=kind==='ok'?'已复制，请粘贴':message; status.textContent=text; status.className='fx-ask-status '+(kind||''); status.hidden=false; prov.classList.toggle('copied',kind==='ok'); prov.setAttribute('aria-label',text); prov.title=text; clearTimeout(feedbackTimer); feedbackTimer=setTimeout(clearFeedback,8000); };
  const setProv=()=>{ const p=core.PROVIDERS[core.activeProvider()]; cv.textContent=''; const img=new Image(); img.onerror=()=>{cv.textContent=p.name[0];}; img.src=picon(p); cv.appendChild(img);
    inp.placeholder=p.kind==='ai'?`问 ${p.name}…`:`用 ${p.name} 搜索，左侧切换 AI`; if(status.hidden){prov.title='切换搜索引擎 / AI';prov.setAttribute('aria-label','切换搜索引擎 / AI');} };
  // 下拉：按 搜索引擎 / AI 助手 两组列出全部 provider
  const closeMenu=(restore=false)=>{ menu.hidden=true; prov.classList.remove('open'); prov.setAttribute('aria-expanded','false'); if(restore)prov.focus(); };
  const buildMenu=()=>{ menu.textContent=''; const ids=Object.keys(core.PROVIDERS);
    [['search','搜索引擎'],['ai','AI 助手']].forEach(([kind,label])=>{ const sect=ids.filter(id=>core.PROVIDERS[id].kind===kind); if(!sect.length)return;
      menu.appendChild(el('div','fx-provmenu-h',label));
      sect.forEach(id=>{ const p=core.PROVIDERS[id]; const cur=id===core.activeProvider(); const it=el('button','fx-provitem'+(cur?' on':'')); it.type='button';
        it.setAttribute('role','menuitem');
        const ic=el('span','fx-provitem-ico'); const img=new Image(); img.onerror=()=>{ic.textContent=p.name[0];ic.classList.add('txt');}; img.src=picon(p); ic.appendChild(img);
        it.append(ic, el('span','fx-provitem-nm',p.name)); if(cur){ const ck=el('span','fx-provitem-ck'); ck.appendChild(mico('check',12)); it.appendChild(ck); }
        it.onclick=()=>{ core.setAskProvider(id); setProv(); closeMenu(); inp.focus(); };
        menu.appendChild(it); });
    }); wireMenuKeyboard(menu,()=>closeMenu(true)); };
  prov.onclick=e=>{ e.stopPropagation(); if(menu.hidden){ buildMenu(); menu.hidden=false; prov.classList.add('open'); prov.setAttribute('aria-expanded','true'); setTimeout(()=>menu.querySelector('[role="menuitem"]')?.focus(),0); } else closeMenu(true); };
  setProv();
  inp.addEventListener('input',()=>{ clearFeedback(); const q=inp.value.trim().toLowerCase(); results.textContent=''; if(!q){results.hidden=true;return;}
    const ms=[]; core.allItems().forEach(({item,group})=>{ if((item.name+' '+item.url+' '+(item.note||'')).toLowerCase().includes(q)) ms.push({it:item,g:group}); });
    if(!ms.length){results.hidden=true;return;}
    results.appendChild(el('div','fx-res-h','我的收藏 · 点击打开'));
    ms.slice(0,7).forEach(({it,g})=>{ const r=el('a','fx-res'); r.href=safeHref(it.url); r.target=core.settings.openIn==='_self'?'_self':'_blank'; r.rel='noopener';
      const ico=el('span','fx-res-ico'); core.mountIcon(ico,it,32); r.append(ico, el('span','fx-res-nm',it.name), el('span','fx-res-g',g.name)); r.addEventListener('click',()=>core.recordVisit(it)); results.appendChild(r); });
    results.hidden=false; });
  inp.addEventListener('keydown',e=>{ if(e.key==='Escape'){inp.value='';results.hidden=true;closeMenu();} });
  box.addEventListener('submit',e=>{e.preventDefault();core.submitAsk(inp.value,{feedback:showFeedback});});
  // D4: 单例外点监听——重挂前先解绑旧的，否则每次 rerender 累积一个持有游离 DOM 的监听器（泄漏）
  if(askOutsideHandler) document.removeEventListener('click', askOutsideHandler);
  askOutsideHandler = e=>{ if(!wrap.contains(e.target)){ results.hidden=true; closeMenu(); } };
  document.addEventListener('click', askOutsideHandler);
  wrap.append(box,menu,results,status); setTimeout(()=>inp.focus(),60);
  return wrap;
}

/* ---------- 卡片：天气 / 待办 / 倒数日（可拖拽重排、可增删）---------- */
function buildWidgetCards(core, priv){
  const row=el('div','fx-wcards');
  const am=core.activeModeObj(), hidden=(am&&am!=='privacy')?(am.hiddenWidgets||[]):[];
  visibleWidgets(core.settings).forEach(w=>{
    if(hidden.includes(w.id)) return;
    if(priv && w.type!=='weather') return;   // 隐私模式只留天气
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
    else showCtx(e.clientX,e.clientY,[{ic:'lock-open', label:'解锁后可在此添加/管理卡片', on:()=>core.setEditing(true)}],e.currentTarget); });
  if(core.editing) wireWidgetDnD(core,row);
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
function buildHeroClock(core){ const config=normalizeHeroClock(core.settings.heroClock), c=el('section','fx-lock-clock');
  c.setAttribute('aria-label','当前日期与时间');
  for(const [key,value] of Object.entries(config)) if(key!=='customColor')c.dataset[key]=value;
  c.style.setProperty('--clock-manual-color',config.customColor);
  const d=el('div','fx-lock-date'),t=el('time','fx-lock-time'),g=el('div','fx-lock-greet'); c.append(d,t,g);
  clockEls={time:t,date:d,greet:g}; startClock(core);
  c.addEventListener('contextmenu',event=>{ event.preventDefault(); event.stopPropagation(); showCtx(event.clientX,event.clientY,[{ic:'settings-2',label:'自定义时钟',on:()=>core.openHeroClockEditor()}],c); });
  return c; }
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
  const todoForm=el('form','fx-todo-add'); const todoInp=el('input'); todoInp.placeholder='加一条待办，回车…'; todoInp.setAttribute('aria-label','添加待办'); todoForm.appendChild(todoInp);
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
  const cdForm=el('form','fx-cd-add'); const cdLabelI=el('input'); cdLabelI.placeholder='名称，如生日/Deadline'; cdLabelI.setAttribute('aria-label','倒数日名称'); const cdDateI=el('input'); cdDateI.type='date'; cdDateI.setAttribute('aria-label','倒数日日期');
  const cdAddBtn=el('button','fx-cd-addbtn'); cdAddBtn.appendChild(mico('plus',13)); cdAddBtn.type='submit'; cdAddBtn.title='添加倒数日'; cdAddBtn.setAttribute('aria-label','添加倒数日');
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
  if(!core.editing){ showCtx(e.clientX,e.clientY,[{ic:'lock-open', label:'解锁后可移除/编辑卡片', on:()=>core.setEditing(true)}],e.currentTarget); return; }
  const items=[];
  if(w.type==='hwmon') items.push({ic:'pencil', label:'设置监控端点', on:()=>core.openHwmonEditor(w)});
  items.push({ic:'trash-2', label:'移除卡片', danger:true, on:()=>{ core.removeWidget(w.id); }});
  showCtx(e.clientX,e.clientY,items,e.currentTarget); }
function addWidgetMenu(core,e){ const types=[['today','今日'],['hwmon','硬件监控'],['weather','天气']];
  const items=types.map(([t,label])=>({ic:'plus', label:label, on:()=>core.addWidget(t)}));
  if((core.settings.hiddenAgentCards||[]).length) items.push('-', {ic:'eye', label:'恢复隐藏的本机服务卡片', on:()=>{ core.settings.hiddenAgentCards=[]; core.save(true); core.rerender(); core.toast('已恢复本机服务卡片','ok'); }});
  showCtx(e.clientX,e.clientY, items,e.currentTarget); }
function wireWidgetDnD(core,row){
  if(!core.editing)return;
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
  if(!core.weather.hasConsent()){
    card.textContent=''; card.classList.add('fx-weather-consent');
    card.append(wcIcon(core,'cloud-sun'),el('div','fx-wcw-cond','天气尚未启用'),el('div','fx-wcw-sub','启用后会连接 ipwho.is / geojs 与 Open-Meteo'));
    const enable=el('button','fn-btn ghost','了解并启用天气'); enable.type='button'; enable.onclick=async event=>{event.preventDefault();event.stopPropagation();enable.disabled=true;await core.weather.enable();}; card.appendChild(enable); return;
  }
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
function wireLocalFilter(input,scope){ const apply=()=>{ const cards=$$('.fx-card',scope), entries=cards.map(card=>({card,name:card.textContent,url:card.title||''})); const visible=new Set(filterContent(entries,input.value).map(entry=>entry.card)); cards.forEach(card=>card.style.display=visible.has(card)?'':'none'); };
  input.addEventListener('input',apply); input.addEventListener('keydown',event=>{ const action=filterKeyAction(event.key); if(!action.prevented)return; event.preventDefault(); if(action.clear){input.value='';apply();} }); }
function renderGroup(core,main,g){
  if(!g){ active='home'; return renderHome(core,main); }
  const stats=core.treeCount(g.items);
  main.classList.toggle('content-sparse',stats.topLevel<=4);
  const top=el('div','fx-gtop');
  const title=el('div','fx-gtitle'); const ico=el('span','fx-gtitle-ico'); core.mountGroupIcon(ico,g); title.append(ico, el('span',null,g.name), el('span','fx-gtitle-ct',`顶层 ${stats.topLevel} 项 · 共 ${stats.sites} 网站`));
  const f=el('form','fx-gsearch'); const si=el('input'); si.placeholder='筛选本组…'; si.setAttribute('aria-label','筛选本组网站'); f.appendChild(si); f.addEventListener('submit',e=>e.preventDefault());
  wireLocalFilter(si,main);
  const vt=el('div','fx-viewtoggle');
  [['grid','layout-grid','大图'],['list','rows-3','列表'],['detail','list','详情']].forEach(([v,ic,t])=>{ const b=el('button','fx-vbtn'+(core.settings.cardView===v?' on':'')); b.title=t; b.appendChild(mico(ic)); b.onclick=()=>{core.settings.cardView=v;core.save();core.rerender();}; vt.appendChild(b); });
  const acts=el('div','fx-gacts'); acts.append(vt); if(core.editing)acts.append(gbtn('plus','添加网站',()=>core.openItemEditor(null,g.id)), gbtn('folder-plus','新建文件夹',()=>core.openFolderEditor(null,g.id)), gbtn('pencil','编辑分组',()=>core.openGroupEditor(g)));
  top.append(title,f,acts); main.appendChild(top);
  if(core.editing)main.appendChild(el('div','fx-draghint','拖拽卡片可排序，拖到分组导航上可移动归类；右键卡片可编辑/删除'));
  const grid=el('div','fx-grid view-'+(core.settings.cardView||'grid')); if(!g.items.length)grid.appendChild(el('div','fx-empty','空分组 — 点上方「添加网站」'));
  g.items.forEach(it=>grid.appendChild(card(core,g,it))); if(core.editing)wireGridDnD(core,grid,g); main.appendChild(grid);
}

/* ---------- 文件夹页（二级菜单：子网站/子文件夹当作页面，非弹层）---------- */
function renderFolderPage(core,main,fd,g){
  const isTop=(g.items||[]).includes(fd);   // 顶层文件夹才可再建子文件夹（封顶两级）
  const stats=core.treeCount(fd.items||[]);
  main.classList.toggle('content-sparse',stats.topLevel<=4);
  const top=el('div','fx-gtop');
  const title=el('div','fx-gtitle');
  const crumb=el('button','fx-crumb',g.name); crumb.title='返回 '+g.name; crumb.onclick=()=>go(core,g.id);
  const fico=el('span','fx-gtitle-ico lucide-mask'); fico.style.webkitMaskImage=fico.style.maskImage=`url("${core.lucide('folder')}")`; fico.style.background='currentColor';
  title.append(crumb, el('span','fx-crumb-sep','›'), fico, el('span',null,fd.name||'文件夹'), el('span','fx-gtitle-ct',`顶层 ${stats.topLevel} 项 · 共 ${stats.sites} 网站`));
  const f=el('form','fx-gsearch'); const si=el('input'); si.placeholder='筛选…'; si.setAttribute('aria-label','筛选当前文件夹'); f.appendChild(si); f.addEventListener('submit',e=>e.preventDefault());
  wireLocalFilter(si,main);
  const vt=el('div','fx-viewtoggle'); [['grid','layout-grid','大图'],['list','rows-3','列表'],['detail','list','详情']].forEach(([v,ic,t])=>{ const b=el('button','fx-vbtn'+(core.settings.cardView===v?' on':'')); b.title=t; b.appendChild(mico(ic)); b.onclick=()=>{core.settings.cardView=v;core.save();core.rerender();}; vt.appendChild(b); });
  const acts=el('div','fx-gacts'); acts.append(vt); if(core.editing){ acts.append(gbtn('plus','添加网站',()=>{ core._addToFolder={folder:fd,gid:g.id}; core.openItemEditor(null,g.id); }));
    if(isTop) acts.append(gbtn('folder-plus','新建子文件夹',()=>core.openFolderEditor(null,g.id,fd.items||(fd.items=[]))));
    acts.append(gbtn('pencil','重命名/删除文件夹',()=>core.openFolderEditor(fd,g.id))); }
  top.append(title,f,acts); main.appendChild(top);
  if(core.editing)main.appendChild(el('div','fx-draghint','点击子文件夹进入下一级；右键卡片可编辑/删除/移动；拖拽可排序'));
  const grid=el('div','fx-grid view-'+(core.settings.cardView||'grid')); if(!(fd.items||[]).length)grid.appendChild(el('div','fx-empty','空文件夹 — 点上方「添加网站」'));
  (fd.items||[]).forEach(it=>grid.appendChild(card(core,g,it,isTop?1:2))); if(core.editing)wireGridDnD(core,grid,g,fd.items); main.appendChild(grid);
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
  const a=el('a','fx-fav'+(it.deadSince?' fx-fav-dead':'')); a.href=safeHref(it.url); a.target=core.settings.openIn==='_self'?'_self':'_blank'; a.rel='noopener'; a.title=it.url+(it.deadSince?'（最近探测不可达）':''); a.dataset.iid=it.id; a.dataset.pinned=pinned?'true':'false'; a.draggable=!!core.editing&&!!pinned;
  const ico=el('span','fx-fav-ico'); core.mountIcon(ico,it,128);
  const pin=pinned?el('span','fx-fav-pin'):null; if(pin)pin.appendChild(mico('pin',10));
  const dead=el('span','fx-dead-badge'); dead.hidden=!it.deadSince; dead.appendChild(mico('alert-triangle',9));
  a.append(ico, el('span','fx-fav-nm',it.name)); if(pin)a.appendChild(pin); a.appendChild(dead); if(core.editing)a.appendChild(cardActions(core,it,g));
  a.addEventListener('contextmenu',e=>cardMenu(core,e,it,g));
  a.addEventListener('click',e=>{ if(core.editing){e.preventDefault();core.openItemEditor(it,g&&g.id);} else if(it.frame){e.preventDefault();core.openFrame(it);} else core.recordVisit(it); });
  if(core.editing&&pinned){ a.addEventListener('dragstart',e=>{ drag={type:'fav',iid:it.id}; a.classList.add('fx-dragging'); e.dataTransfer.effectAllowed='move'; });
    a.addEventListener('dragend',()=>{a.classList.remove('fx-dragging');drag=null;}); }
  return a;
}
function card(core,g,it,depth){
  if(core.isFolder(it)) return folderCard(core,g,it,depth||0);
  const a=el('a','fx-card'+(it.deadSince?' fx-card-dead':'')); a.href=safeHref(it.url); a.target=core.settings.openIn==='_self'?'_self':'_blank'; a.rel='noopener'; a.title=it.url+(it.deadSince?'（最近探测不可达）':''); a.dataset.iid=it.id; a.draggable=!!core.editing;
  const ico=el('span','fx-card-ico'); core.mountIcon(ico,it,64);
  const meta=el('span','fx-card-meta'); meta.append(el('span','fx-card-nm',it.name)); if(it.note)meta.append(el('span','fx-card-note',it.note)); meta.append(el('span','fx-card-url',it.url));
  const dot=el('span','fx-dot'); dot.hidden=true;
  const dead=el('span','fx-dead-badge'); dead.hidden=!it.deadSince; dead.appendChild(mico('alert-triangle',9));
  a.append(ico,meta,dot,dead); if(core.editing)a.appendChild(cardActions(core,it,g));
  a.addEventListener('contextmenu',e=>cardMenu(core,e,it,g));
  a.addEventListener('click',e=>{ if(core.editing){e.preventDefault();core.openItemEditor(it,g.id);} else if(it.frame){e.preventDefault();core.openFrame(it);} else core.recordVisit(it); });
  if(core.editing){ a.addEventListener('dragstart',e=>{ drag={type:'card',gid:g.id,iid:it.id}; a.classList.add('fx-dragging'); e.dataTransfer.effectAllowed='move'; try{e.dataTransfer.setData('text/plain',it.id);}catch{} });
    a.addEventListener('dragend',()=>{a.classList.remove('fx-dragging');drag=null;}); }
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
  const stats=core.treeCount(fd.items||[]);
  const ico=el('span','fx-card-ico fx-folder-mini'); renderFolderMini(core,ico,fd);
  const meta=el('span','fx-card-meta'); meta.append(el('span','fx-card-nm',fd.name||'文件夹'), el('span','fx-folder-count', `${stats.sites} 网站 · ${stats.folders} 子文件夹`));
  a.append(ico,meta); if(core.editing)a.appendChild(folderActions(core,fd,g));
  a.addEventListener('click',e=>{ e.preventDefault(); if(core.editing) core.openFolderEditor(fd,g.id); else go(core,fd.id); });   // 进入文件夹页（二级菜单，非弹层）
  a.addEventListener('contextmenu',e=>folderMenu(core,e,fd,g,depth||0));
  // 文件夹本身可拖拽重排（作为一张卡）
  if(core.editing){ a.addEventListener('dragstart',e=>{ drag={type:'card',gid:g.id,iid:fd.id}; a.classList.add('fx-dragging'); e.dataTransfer.effectAllowed='move'; try{e.dataTransfer.setData('text/plain',fd.id);}catch{} });
    a.addEventListener('dragend',()=>{a.classList.remove('fx-dragging');drag=null;});
    // 拖一张卡到文件夹上 → 移入（纯树策略会拒绝自身、后代和第三级）
    a.addEventListener('dragover',e=>{ if(drag&&drag.type==='card'&&drag.iid!==fd.id){ e.preventDefault(); e.stopPropagation(); a.classList.add('fx-folder-drop'); } });
    a.addEventListener('dragleave',()=>a.classList.remove('fx-folder-drop'));
    a.addEventListener('drop',e=>{ a.classList.remove('fx-folder-drop'); if(drag&&drag.type==='card'&&drag.iid!==fd.id){ e.preventDefault(); e.stopPropagation();
      const item=findItemById(core,g,drag.iid); if(item && core.moveItemToFolder(item,fd,g)) core.toast('已移入「'+(fd.name||'文件夹')+'」','ok'); drag=null; } }); }
  return a;
}
function findItemById(core,g,iid){ const find=arr=>{ for(const it of (arr||[])){ if(it.id===iid)return it; if(core.isFolder(it)){ const r=find(it.items); if(r)return r; } } return null; }; return find(g.items); }
function folderMenu(core,e,fd,g,depth){ e.preventDefault(); depth=depth||0;
  const items=[{ic:'folder-open', label:'打开文件夹', on:()=>go(core,fd.id)}];
  if(core.editing){ items.push('-', {ic:'pencil', label:'重命名', on:()=>core.openFolderEditor(fd,g.id)});
    if(depth<1) items.push({ic:'folder-plus', label:'新建子文件夹', on:()=>core.openFolderEditor(null,g.id,fd.items||(fd.items=[]))});
    items.push({ic:'trash-2', label:'删除文件夹', danger:true, on:()=>core.openFolderEditor(fd,g.id)}); }
  else items.push('-', {ic:'lock-open', label:'解锁后可编辑', on:()=>core.setEditing(true)});
  showCtx(e.clientX,e.clientY,items,e.currentTarget);
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
    items.push('-', {ic:'lock-open', label:'解锁后可编辑/删除', on:()=>core.setEditing(true)});
  }
  showCtx(e.clientX, e.clientY, items,e.currentTarget);
}
function wireMenuKeyboard(menu,onClose){ const entries=()=>$$('[role="menuitem"]',menu).filter(item=>!item.disabled); const focusAt=index=>{ const items=entries(); if(!items.length)return; const next=(index+items.length)%items.length; items.forEach((item,i)=>item.tabIndex=i===next?0:-1); items[next].focus(); };
  const items=entries(); items.forEach((item,index)=>item.tabIndex=index===0?0:-1);
  menu.onkeydown=e=>{ const rows=entries(),current=Math.max(0,rows.indexOf(document.activeElement)); let next=null;
    if(e.key==='ArrowDown')next=current+1; else if(e.key==='ArrowUp')next=current-1; else if(e.key==='Home')next=0; else if(e.key==='End')next=rows.length-1;
    else if(e.key==='Enter'||e.key===' '){e.preventDefault();rows[current]?.click();return;} else if(e.key==='Escape'){e.preventDefault();onClose();return;} else return;
    e.preventDefault();focusAt(next); };
}
export function openMenu(anchor,items){ const rect=anchor.getBoundingClientRect(); showCtx(rect.left,rect.bottom+4,items,anchor); }
function showCtx(x,y,items,trigger){
  hideCtx(); ctxTrigger=trigger||document.activeElement; ctxMenu=el('div','fx-ctx'); ctxMenu.setAttribute('role','menu'); ctxMenu.setAttribute('aria-label','操作菜单');
  items.forEach(it=>{ if(it==='-'){ctxMenu.appendChild(el('div','fx-ctx-sep'));return;}
    const b=el('button','fx-ctx-item'+(it.danger?' danger':'')+(it.sel?' sel':''));
    b.type='button'; b.setAttribute('role','menuitem');
    if(it.ic){ const s=el('span','fx-ctx-ico lucide-mask'); s.style.webkitMaskImage=s.style.maskImage=`url("${lucide(it.ic)}")`; s.style.background='currentColor'; b.appendChild(s); }
    b.appendChild(el('span','fx-ctx-lb',it.label));
    b.onclick=ev=>{ev.stopPropagation();hideCtx(true);it.on();}; ctxMenu.appendChild(b); });
  ctxMenu.style.left=x+'px'; ctxMenu.style.top=y+'px'; document.body.appendChild(ctxMenu);
  const r=ctxMenu.getBoundingClientRect(); if(r.right>innerWidth)ctxMenu.style.left=(x-r.width)+'px'; if(r.bottom>innerHeight)ctxMenu.style.top=(y-r.height)+'px';
  wireMenuKeyboard(ctxMenu,()=>hideCtx(true)); setTimeout(()=>ctxMenu?.querySelector('[role="menuitem"]')?.focus(),0);
}
function hideCtx(restore=false){ if(ctxMenu){ctxMenu.remove();ctxMenu=null;} const trigger=ctxTrigger; ctxTrigger=null; if(restore&&trigger?.isConnected)trigger.focus(); }

/* ---------- 拖拽（默认即可拖，无需编辑模式）---------- */
function wireGridDnD(core,grid,g,arr){ arr=arr||g.items;
  if(!core.editing)return;
  grid.addEventListener('dragover',e=>{ if(!drag||drag.type!=='card'||drag.gid!==g.id)return; e.preventDefault(); const after=afterEl(grid,'.fx-card',e.clientX,e.clientY); const d=grid.querySelector('.fx-card.fx-dragging'); if(!d)return; if(after==null)grid.appendChild(d); else grid.insertBefore(d,after); });
  grid.addEventListener('drop',e=>{ if(!drag||drag.type!=='card')return; e.preventDefault(); const order=$$('.fx-card',grid).map(c=>c.dataset.iid); arr.sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id)); drag=null; core.save(true); });
}
function wireFavDnD(core,row){
  if(!core.editing)return;
  row.addEventListener('dragover',e=>{ if(!drag||drag.type!=='fav')return; e.preventDefault();
    const after=afterEl(row,'.fx-fav[data-pinned="true"]',e.clientX,e.clientY); const d=row.querySelector('.fx-fav.fx-dragging'); if(!d)return;
    if(after==null) row.insertBefore(d,row.querySelector('.fx-fav[data-pinned="false"]')); else row.insertBefore(d,after); });
  row.addEventListener('drop',e=>{ if(!drag||drag.type!=='fav')return; e.preventDefault();
    const visibleIds=$$('.fx-fav[data-pinned="true"]',row).map(c=>c.dataset.iid);
    core.setFavOrder(visibleIds);
    drag=null; });
}
function wireSidebarDnD(core,nav){
  if(!core.editing)return;
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
  if(clockTimer)clearInterval(clockTimer);
  const tick=()=>{ if(!clockEls)return; const face=formatHeroClock(new Date(),core.settings.heroClock);
    clockEls.time.textContent=face.time; clockEls.time.dateTime=face.datetime;
    clockEls.date.textContent=face.date; clockEls.greet.textContent=face.greeting;
    clockEls.date.hidden=!face.showDate; clockEls.greet.hidden=!face.showGreeting; };
  tick(); clockTimer=setInterval(tick,1000*15);
}
