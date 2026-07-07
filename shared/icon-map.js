/* ============ 图标映射：服务 → dashboard-icons / Lucide ============ */
const DI = (slug, fmt='svg') => `https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons@main/${fmt}/${slug}.${fmt}`;
const SIMPLE = (slug) => `https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/${slug}.svg`;
/* GitHub 项目官方头像：图标库没有时的真实 logo 兜底（稳定 CDN，私网服务也能加载） */
const GH = (login) => `https://avatars.githubusercontent.com/${login}?size=128`;
export const lucide = (name) => `https://cdn.jsdelivr.net/npm/lucide-static@latest/icons/${name}.svg`;

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
export const normUrl = u => (u||'').trim().replace(/\/+$/,'').toLowerCase();

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
  if(slug){ out.push(DI(slug), DI(slug,'png'), `https://cdn.jsdelivr.net/gh/selfhst/icons/svg/${slug}.svg`, `https://cdn.jsdelivr.net/gh/selfhst/icons/png/${slug}.png`, SIMPLE(slug)); }
  const b=brandIcon({name,url}); if(b && b!=='__letter__' && !out.includes(b)) out.unshift(b);
  const h=hostOf(url); if(h){ out.push(`https://${h}/apple-touch-icon.png`, GFAVICON(h), `https://icon.horse/icon/${h}`); }
  return [...new Set(out)];
}
