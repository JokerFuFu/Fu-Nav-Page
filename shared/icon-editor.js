/* ============ 可复用图标编辑器（仿 Infinity）============
 * 四模式：自动 / 纯色(字母) / 在线(联网候选+URL) / 本地(上传)。
 * 纯色模式产出 `L|文字|颜色|字号%`（字号为占图标格高度的百分比，省略则用 CSS 默认）。
 * 被 core.openItemEditor 与工具栏 popup 复用，保证两处不漂移。
 */
import { mountItemIcon } from './icons.js';
import { iconSearch } from './icon-map.js';

export const ICON_COLORS = ['#ef4444','#f97316','#f59e0b','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#ec4899','#64748b'];
const DEF_FONT = 45;   // 纯色字号默认（% of tile）
const DI = s => `https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons@main/svg/${s}.svg`;
/* 内置精选图标库（dashboard-icons slug，常用 homelab + 主流站点），免 favicon 抓取失败 */
const ICON_LIB = ['synology','plex','jellyfin','emby','portainer','docker','grafana','prometheus','home-assistant','adguard-home','pi-hole','nginx','nginx-proxy-manager','traefik','gitea','github','gitlab','jenkins','sonarr','radarr','prowlarr','bazarr','jellyseerr','overseerr','qbittorrent','transmission','sabnzbd','tautulli','uptime-kuma','vaultwarden','nextcloud','immich','paperless-ngx','frigate','proxmox','truenas','unraid','openwrt','pfsense','opnsense','wireguard','tailscale','cloudflare','authentik','keycloak','jackett','calibre-web','audiobookshelf','navidrome','filebrowser','code-server','n8n','node-red','influxdb','mariadb','postgresql','redis','mongodb','minio','rclone','duplicati','watchtower','dozzle','glances','netdata','homepage','homarr','heimdall','dashy','jdownloader','aria2','rustdesk','guacamole','wikijs','bookstack','mealie','firefly-iii','stirling-pdf','it-tools','excalidraw','kavita','komga','mastodon','element','jitsi','rocket-chat','mattermost','steam','kodi','youtube','bilibili','spotify','google','notion','obsidian','figma'];

const E = (t,c,x)=>{ const e=document.createElement(t); if(c)e.className=c; if(x!=null)e.textContent=x; return e; };

/* 创建编辑器。返回 { node, getIcon(), setContext(name,url) }。
 * opts: { icon, name, url, colors, onChange } */
export function createIconEditor(opts={}){
  const colors = opts.colors || ICON_COLORS;
  let icon = opts.icon || '';
  let name = opts.name || '';
  let url  = opts.url || '';
  const onChange = typeof opts.onChange==='function' ? opts.onChange : ()=>{};

  const isL = icon.slice(0,2)==='L|';
  let mode  = isL ? 'letter' : (icon.slice(0,5)==='data:' ? 'local' : (icon ? 'online' : 'auto'));
  const lp  = isL ? icon.split('|') : [];
  let lColor = isL ? (lp[2]||colors[0]) : colors[0];
  let lFont  = isL ? (+lp[3]||DEF_FONT) : DEF_FONT;

  const emit = ()=>onChange(icon);

  // 预览
  const prev = E('span','fn-iconprev');
  const drawPrev = ()=>mountItemIcon(prev, { name, url, icon }, 64);

  // ── 纯色：文字 + 字号 + 颜色 ──
  const ltI = E('input'); ltI.className='fn-iinp'; ltI.maxLength=2; ltI.placeholder='1-2 字'; ltI.value = isL ? (lp[1]||'') : '';
  const fontI = E('input'); fontI.type='range'; fontI.min='25'; fontI.max='75'; fontI.step='1'; fontI.value=String(lFont); fontI.className='fn-irange';
  const fontV = E('span','fn-irangev', String(lFont));
  const lcg = E('div','fn-colorgrid');
  const applyLetter = ()=>{ const t=(ltI.value||(name||'?')[0]||'?').slice(0,2); icon='L|'+t+'|'+lColor+'|'+lFont; drawPrev(); emit(); };
  colors.forEach(c=>{ const b=E('button','fn-colorpick'+(c===lColor?' sel':'')); b.type='button'; b.style.background=c;
    b.onclick=()=>{ lColor=c; [...lcg.children].forEach(x=>x.classList.remove('sel')); b.classList.add('sel'); applyLetter(); }; lcg.appendChild(b); });
  ltI.addEventListener('input', applyLetter);
  fontI.addEventListener('input', ()=>{ lFont=+fontI.value; fontV.textContent=fontI.value; applyLetter(); });
  const pLetter = E('div','fn-ipanel');
  pLetter.append(field('图标文字', ltI), field('字体大小', sliderRow(fontI,fontV)), field('颜色', lcg));

  // ── 在线：自动候选 + URL ──
  const sug = E('div','fn-iconsug');
  const urlInput = E('input'); urlInput.className='fn-iinp'; urlInput.placeholder='或粘贴图标 URL'; urlInput.value = (mode==='online') ? icon : '';
  const renderSug = ()=>{ sug.textContent='';
    iconSearch(name, url).filter(u=>u && u!=='__letter__').slice(0,10).forEach(u=>{
      const b=E('button','fn-isug'+(icon===u?' sel':'')); b.type='button';
      const img=new Image(); img.onerror=()=>b.remove(); img.src=u; b.appendChild(img);
      b.onclick=()=>{ icon=u; urlInput.value=u; [...sug.children].forEach(x=>x.classList.remove('sel')); b.classList.add('sel'); drawPrev(); emit(); };
      sug.appendChild(b); }); };
  urlInput.addEventListener('input', ()=>{ icon=urlInput.value.trim(); drawPrev(); emit(); });
  // 图标库：可搜索的精选服务图标网格
  const libSearch = E('input'); libSearch.className='fn-iinp'; libSearch.placeholder='搜索图标库（synology / plex / grafana…）';
  const libGrid = E('div','fn-iconsug fn-iconlib');
  const renderLib = ()=>{ libGrid.textContent=''; const q=libSearch.value.trim().toLowerCase();
    const list=(q ? ICON_LIB.filter(s=>s.includes(q)) : ICON_LIB).slice(0,42);
    list.forEach(slug=>{ const b=E('button','fn-isug'+(icon===DI(slug)?' sel':'')); b.type='button'; b.title=slug;
      const img=new Image(); img.onerror=()=>b.remove(); img.src=DI(slug); b.appendChild(img);
      b.onclick=()=>{ icon=DI(slug); urlInput.value=icon; [...libGrid.children].forEach(x=>x.classList.remove('sel')); b.classList.add('sel'); drawPrev(); emit(); };
      libGrid.appendChild(b); }); };
  libSearch.addEventListener('input', renderLib);
  const pOnline = E('div','fn-ipanel');
  pOnline.append(E('div','fn-sub','点选自动匹配的图标，或粘贴 URL'), sug, urlInput, E('div','fn-sub','或从精选图标库挑选'), libSearch, libGrid);

  // ── 本地：上传图片 ──
  const pLocal = E('div','fn-ipanel');
  const upBtn = E('button','fn-btn ghost','选择本地图片…'); upBtn.type='button';
  const upErr = E('div','fn-sub','');
  upBtn.onclick = ()=>{ const f=E('input'); f.type='file'; f.accept='image/*';
    f.onchange=()=>{ const file=f.files[0]; if(!file)return; if(file.size>200*1024){ upErr.textContent='⚠ 图片请小于 200KB'; return; }
      const r=new FileReader(); r.onload=()=>{ icon=r.result; upErr.textContent='✓ 已选择'; drawPrev(); emit(); }; r.readAsDataURL(file); }; f.click(); };
  pLocal.append(E('div','fn-sub','上传图片做图标（建议 <200KB，随配置同步/备份）'), upBtn, upErr);

  // ── 自动 ──
  const pAuto = E('div','fn-ipanel');
  pAuto.append(E('div','fn-sub','根据网址自动获取图标（已知服务用品牌图标，其它用 favicon）'));

  // ── 模式切换 ──
  const showMode = ()=>{
    pAuto.hidden = mode!=='auto'; pLetter.hidden = mode!=='letter'; pOnline.hidden = mode!=='online'; pLocal.hidden = mode!=='local';
    if(mode==='auto'){ icon=''; drawPrev(); emit(); }
    else if(mode==='letter') applyLetter();
    else if(mode==='online'){ renderSug(); renderLib(); drawPrev(); }
    else drawPrev();
  };
  const seg = E('div','fn-seg');
  [['auto','自动'],['letter','纯色'],['online','在线'],['local','本地']].forEach(([m,lb])=>{
    const b=E('button',null,lb); b.type='button'; if(m===mode)b.classList.add('on');
    b.onclick=()=>{ mode=m; [...seg.children].forEach(x=>x.classList.remove('on')); b.classList.add('on'); showMode(); }; seg.appendChild(b); });

  const head = E('div','fn-iconhead'); head.append(prev, seg);
  const node = E('div','fn-iconedit'); node.append(head, pAuto, pLetter, pOnline, pLocal);

  // 初次渲染
  setTimeout(()=>{ showMode(); drawPrev(); }, 0);

  return {
    node,
    getIcon(){ return icon; },
    setContext(n,u){ name=n??name; url=u??url;
      if(mode==='online'){ clearTimeout(node._sugT); node._sugT=setTimeout(renderSug,400); }
      if(mode==='letter' && !ltI.value) applyLetter();
      drawPrev(); },
  };
}

/* 内部小工具：字段包裹 + 字号滑杆行 */
function field(label,input){ const w=E('div','fn-field'); w.appendChild(E('label',null,label)); w.appendChild(input); return w; }
function sliderRow(range,val){ const w=E('div','fn-sliderrow'); w.append(range,val); return w; }
