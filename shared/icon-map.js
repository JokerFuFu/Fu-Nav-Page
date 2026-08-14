/* ============ 图标映射：本地线性图标 + 固定版本品牌图标 ============ */
import { classifyDuplicate, normalizeUrl } from './url.js';

export const dashboardIcon = (slug, fmt='svg') => `https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons@6250ca55068356eb351bc2501a25b8b9d84fcef1/${fmt}/${slug}.${fmt}`;
export const simpleIcon = (slug) => `https://cdn.jsdelivr.net/npm/simple-icons@16.27.0/icons/${slug}.svg`;
const DI=dashboardIcon, SIMPLE=simpleIcon;
/* GitHub 项目官方头像：图标库没有时的真实 logo 兜底（稳定 CDN，私网服务也能加载） */
const GH = (login) => `https://avatars.githubusercontent.com/${login}?size=128`;

/*
 * 核心线性图标直接内嵌为 data URL：扩展断网时仍可渲染，且任意用户输入的
 * Lucide 名都会落到本地 circle fallback，不再触发远程代码或资源请求。
 * 路径使用 24×24、round stroke 的 Lucide 视觉语法；相近语义复用同一轮廓。
 */
const ICON_SHAPES={
  circle:'<circle cx="12" cy="12" r="9"/>',
  menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  x:'<path d="m6 6 12 12M18 6 6 18"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  right:'<path d="m9 18 6-6-6-6"/>',
  left:'<path d="m15 18-6-6 6-6"/>',
  up:'<path d="m18 15-6-6-6 6"/>',
  down:'<path d="m6 9 6 6 6-6"/>',
  folder:'<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  home:'<path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  list:'<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  code:'<path d="m8 9-3 3 3 3M16 9l3 3-3 3M14 5l-4 14"/>',
  palette:'<path d="M12 3a9 9 0 0 0 0 18h1.5a2 2 0 0 0 0-4H12a2 2 0 0 1 0-4h5a4 4 0 0 0 4-4c0-3.3-4-6-9-6Z"/><circle cx="7.5" cy="10" r="1"/><circle cx="9" cy="6.5" r="1"/><circle cx="14" cy="6.5" r="1"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a2 2 0 0 0 .4 2.2l.1.1-2.6 2.6-.1-.1a2 2 0 0 0-2.2-.4 2 2 0 0 0-1.2 1.8V21h-3.6v-.2A2 2 0 0 0 9 19a2 2 0 0 0-2.2.4l-.1.1-2.6-2.6.1-.1A2 2 0 0 0 4.6 15a2 2 0 0 0-1.8-1.2H2v-3.6h.8A2 2 0 0 0 4.6 9a2 2 0 0 0-.4-2.2l-.1-.1 2.6-2.6.1.1A2 2 0 0 0 9 4.6a2 2 0 0 0 1.2-1.8V2h3.6v.8A2 2 0 0 0 15 4.6a2 2 0 0 0 2.2-.4l.1-.1 2.6 2.6-.1.1A2 2 0 0 0 19.4 9a2 2 0 0 0 1.8 1.2H22v3.6h-.8A2 2 0 0 0 19.4 15Z"/>',
  server:'<rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 7h.01M7 17h.01M11 7h7M11 17h7"/>',
  database:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/>',
  monitor:'<rect x="3" y="3" width="18" height="13" rx="2"/><path d="M8 21h8M12 16v5"/>',
  network:'<circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M12 7v5M5 17v-3h14v3"/>',
  shield:'<path d="M12 2 20 6v6c0 5-3.4 8.3-8 10-4.6-1.7-8-5-8-10V6Z"/><path d="m8 12 2.5 2.5L16 9"/>',
  eye:'<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  layers:'<path d="m12 2 9 5-9 5-9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
  image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/>',
  moon:'<path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/>',
  cloud:'<path d="M17.5 19H7a5 5 0 1 1 1-9.9A6 6 0 0 1 19.5 11 4 4 0 0 1 17.5 19Z"/>',
  star:'<path d="m12 2 3 6 6.5 1-4.7 4.6 1.1 6.4-5.9-3-5.9 3 1.1-6.4L2.5 9 9 8Z"/>',
  book:'<path d="M4 19a2 2 0 0 1 2-2h14V4H6a2 2 0 0 0-2 2Z"/><path d="M4 19a2 2 0 0 0 2 2h14v-4"/>',
  cpu:'<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M18 9h4M2 15h4M18 15h4"/>',
  globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  flame:'<path d="M12 22c4 0 7-3 7-7 0-5-4-7-4-11-3 2-4 5-4 7-1-1-2-3-2-4-3 2-4 5-4 8 0 4 3 7 7 7Z"/>',
  briefcase:'<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V4h6v3M3 12h18M10 12v2h4v-2"/>',
  clipboard:'<rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 4V2h6v2M9 10h6M9 14h6M9 18h4"/>',
  flask:'<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M8 15h8"/>',
  cart:'<path d="M3 3h2l2 12h10l3-8H6M9 21h.01M17 21h.01"/>',
  film:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M17 9h4M3 15h4M17 15h4"/>',
  music:'<path d="M9 18V5l10-2v13M9 9l10-2"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/>',
  wrench:'<path d="M14 7a5 5 0 0 0-7-4l3 3-4 4-3-3a5 5 0 0 0 7 7l7 7 4-4-7-7Z"/>',
  gamepad:'<path d="M7 8h10a5 5 0 0 1 4 7l-2 4a2 2 0 0 1-3 .5L14 17h-4l-2 2.5A2 2 0 0 1 5 19l-2-4a5 5 0 0 1 4-7Z"/><path d="M8 11v4M6 13h4M16 12h.01M18 14h.01"/>',
  tv:'<rect x="3" y="6" width="18" height="14" rx="2"/><path d="m8 2 4 4 4-4"/>',
  rss:'<circle cx="5" cy="19" r="1"/><path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16"/>',
  trash:'<path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/>',
  pencil:'<path d="m4 20 4-1 11-11-3-3L5 16Z"/><path d="m14 6 3 3"/>',
  download:'<path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16"/>',
  upload:'<path d="M12 21V9m0 0 4 4m-4-4-4 4M4 3h16"/>',
  archive:'<rect x="3" y="5" width="18" height="4" rx="1"/><path d="M5 9v11h14V9M9 13h6"/>',
  bookmark:'<path d="M6 3h12v18l-6-4-6 4Z"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  trophy:'<path d="M8 4h8v5a4 4 0 0 1-8 0ZM8 6H4v2a4 4 0 0 0 4 4M16 6h4v2a4 4 0 0 1-4 4M12 13v5M8 21h8M9 18h6"/>',
  link:'<path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/>',
  sparkles:'<path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2ZM5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8ZM19 13l.8 2.2L22 16l-2.2.8L19 19l-.8-2.2L16 16l2.2-.8Z"/>',
  alert:'<path d="M12 3 2 21h20ZM12 9v5M12 18h.01"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};
const ICON_ALIASES={
  'chevron-right':'right','chevrons-right':'right','arrow-right':'right','corner-down-left':'left','corner-up-left':'left','arrow-left':'left',
  'chevron-down':'down','arrow-down':'down','arrow-up':'up','chevrons-left':'left','folder-plus':'folder','folder-open':'folder','folder-input':'folder',
  'layout-grid':'grid','layout-template':'grid','rows-3':'list','list-ordered':'list','list-checks':'list','library-big':'book','book-open':'book','hard-drive':'server','router':'network','radio':'rss',
  'shield-check':'shield','clipboard-list':'clipboard','flask-conical':'flask','shopping-cart':'cart','gamepad-2':'gamepad','trash-2':'trash','external-link':'link',
  'settings-2':'settings','lock-open':'lock','eye-off':'eye','sun-moon':'sun','pin':'star','alert-triangle':'alert','check-square':'check','grip-vertical':'list',
  'cloud-sun':'cloud','cloud-moon':'cloud','cloud-fog':'cloud','cloud-drizzle':'cloud','cloud-rain':'cloud','cloud-sun-rain':'cloud','cloud-moon-rain':'cloud',
  'cloud-rain-wind':'cloud','cloud-snow':'cloud','cloud-lightning':'cloud','cloud-off':'cloud','snowflake':'star','cloud-upload':'upload','cloud-download':'download',
  'archive-restore':'archive','history':'clock','copy':'clipboard','graduation-cap':'book','plug-zap':'link','timer-reset':'clock','rotate-ccw':'clock','git-merge':'network','code-2':'code','file-plus-2':'folder',
};
export const LOCAL_LUCIDE_NAMES=Object.freeze([...new Set([...Object.keys(ICON_SHAPES),...Object.keys(ICON_ALIASES)])]);
export const lucide = (name) => {
  const key=ICON_SHAPES[name]?name:(ICON_ALIASES[name]||'circle');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON_SHAPES[key]}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

/* 关键词/host → dashboard-icons（实测存在的 slug；nastool/ikuai 仅 png） */
const LETTER='__letter__'; // 强制字母块（图标库无对应、且 url 易误中其它规则时用）
const RULES = [
  // 图标库均无 openclash/clash/mihomo/istoreos/lucky 的 slug（已实测全 404）→ 用各项目 GitHub 官方头像作真实 logo。
  // 名称优先匹配，避免 url 里的 luci 误中 iStoreOS、openwrt 等。
  [/openclash/i, GH('vernesong')],
  [/\bclash\b|mihomo|metacubex/i, GH('MetaCubeX')],
  [/istoreos|爱思|i ?store ?os/i, GH('istoreos')],
  [/\blucky\b/i, GH('gdy666')],
  // homelab 服务
  [/synology|群晖|\bdsm\b/i, DI('synology-dsm')],
  [/container\s*manager|容器/i, DI('docker')],
  [/gitea/i, DI('gitea')],
  [/memos/i, DI('memos')],
  [/qbittorrent|qbit|\bqb\b/i, DI('qbittorrent')],
  [/transmission/i, DI('transmission')],
  [/\bplex\b/i, DI('plex')],
  [/jellyfin/i, DI('jellyfin')],
  [/emby/i, DI('emby')],
  [/adguard/i, DI('adguard-home')],
  [/openwrt/i, DI('openwrt')],   // 注意：不再匹配 istoreos/luci/旁路由（让它们用各自真实 favicon）
  [/esxi|vmware/i, DI('vmware-esxi')],
  [/nastool|nas-tools|nas工具/i, DI('nastool','png')],
  [/青龙|qinglong|\bql\b|qd\s*登录/i, DI('qinglong')],
  [/librespeed|测速/i, DI('librespeed')],
  [/ikuai|爱快/i, DI('ikuai','png')],
  [/portainer/i, DI('portainer')],
  [/home\s*assistant|hass/i, DI('home-assistant')],
  [/jackett|prowlarr/i, DI('prowlarr')],
  [/aria2/i, DI('aria2')],
  [/photoprism/i, DI('photoprism')],
  [/synology\s*photos|photos/i, DI('synology-photos')],
  [/vaultwarden|bitwarden/i, DI('vaultwarden')],
  [/nginx|npm|proxy\s*manager/i, DI('nginx-proxy-manager')],
  // 常用站点
  [/bilibili|b站|哔哩/i, DI('bilibili')],
  [/youtube|\byt\b/i, DI('youtube')],
  [/github/i, DI('github')],
  [/chatgpt|openai|\bgpt\b/i, DI('openai')],
  [/kimi/i, DI('kimi-ai')],
  [/claude|anthropic/i, DI('claude-ai')],
  [/gemini|bard/i, DI('google-gemini')],
  [/zhihu|知乎/i, SIMPLE('zhihu')],
  [/什么值得买|值得买|smzdm/i, SIMPLE('smartthings')], // 近似；多数会走 favicon
  [/网易云|netease.*music|music\.163/i, DI('netease-cloud-music')],
  [/qq音乐|y\.qq/i, SIMPLE('tencentqq')],
  [/telegram/i, DI('telegram')],
  [/notion/i, DI('notion')],
];

/* 私网/本地 host 判定 */
export function isPrivateHost(host){
  if(!host) return true;
  if(host==='localhost' || host.endsWith('.local') || host.endsWith('.lan')) return true;
  const m=/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if(!m) return false;
  const a=+m[1], b=+m[2];
  return a===10||a===127||(a===192&&b===168)||(a===172&&b>=16&&b<=31);
}
export function hostOf(url){ try{ return new URL(url).hostname; }catch{ return ''; } }
export const normUrl = u => normalizeUrl(u,'strict');
export { classifyDuplicate, normalizeUrl };

export const FORCE_LETTER = LETTER;
/* 返回已知服务的品牌图标 URL；LETTER=强制字母块；null=未知(走 favicon) */
export function brandIcon(item){
  if(item.slug){ return item.slug.startsWith('http') ? item.slug : DI(item.slug); }
  const name=item.name||'', url=item.url||'';
  // 名称优先（避免 url 里的 luci/openwrt 等关键词误中）
  for(const [re, u] of RULES) if(re.test(name)) return u;
  for(const [re, u] of RULES) if(re.test(url)) return u;
  return null;
}

export function brandIconCandidates(item, options={}){
  const out=[];
  if(options.extensionFavicon)out.push(options.extensionFavicon);
  if(options.cachedIcon)out.push(options.cachedIcon);
  if(item?.icon && /^(?:data:|blob:|\/)/i.test(item.icon))out.push(item.icon);
  const remote=brandIcon(item||{}); if(remote&&remote!==LETTER)out.push(remote);
  return [...new Set(out),LETTER];
}

const GFAVICON = host => `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent('https://'+host)}&size=128`;
/* 自动挂载用的 favicon 候选：只用 Google gstatic faviconV2（快、稳、size=128）。
   刻意不含 apple-touch-icon（很多站点 200 返回非图片/挂起，既不 onload 也不 onerror，会卡住）
   与 icon.horse（无图标站点常返回近空白图）——自动场景宁可干净字母块，也不要卡死或假图标。 */
export function faviconCandidates(url){
  const host=hostOf(url); if(!host) return [];
  return [ GFAVICON(host) ];
}
/* 编辑器图标自动匹配：多源候选，由调用方探测后“目视”挑选（可放 apple-touch/icon.horse 这类不稳定源，人工过滤） */
export function iconSearch(name, url){
  const out=[]; const slug=(name||'').toLowerCase().trim().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');
  if(slug){ out.push(DI(slug), DI(slug,'png'), SIMPLE(slug)); }
  const b=brandIcon({name,url}); if(b && b!=='__letter__' && !out.includes(b)) out.unshift(b);
  const h=hostOf(url); if(h){ out.push(`https://${h}/apple-touch-icon.png`, GFAVICON(h), `https://icon.horse/icon/${h}`); }
  return [...new Set(out)];
}
