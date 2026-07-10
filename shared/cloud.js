/* ============ 云同步：WebDAV（自托管/群晖）+ Google Drive ============
 * 把整份配置 JSON 存到你选的云端，跨设备同步、离家也能用。
 * settings.cloud = { enabled, type:'webdav'|'gdrive', url,user,pass, gdriveClientId }
 * 自动备份固定写 fu-nav-config.json；WebDAV 手动备份写时间戳文件并保留最近 10 份。
 * - webdav：群晖「WebDAV Server」套件 / Nextcloud / 任意 WebDAV（数据在你自己服务器）。
 * - gdrive：Google Drive 的 appData 隐藏空间（需你自建 OAuth Client ID，一次性）。
 * 注意：iCloud 无对浏览器扩展开放的 API/WebDAV，无法直接接入（用 WebDAV 或 Google Drive 替代）。
 */
const FILE = 'fu-nav-config.json';
const BACKUP_RE=/^fu-nav-backup-\d{8}-\d{6}\.json$/;
let lastBackupTime=0;
const b64 = s => { try{ return btoa(unescape(encodeURIComponent(s))); }catch{ return btoa(s); } };
export function cloudOf(settings){ return (settings && settings.cloud) || {}; }
export function cloudEnabled(settings){ const c=cloudOf(settings); if(!c.enabled) return false; return c.type==='gdrive' ? !!c.gdriveClientId : !!c.url; }

/* ---------------- WebDAV ---------------- */
function davBase(c){ return String(c.url||'').replace(/\/+$/,'') + '/'; }
function davUrl(c,name=FILE){ return davBase(c) + encodeURIComponent(name); }
function davHeaders(c, extra){ return Object.assign({ 'Authorization':'Basic '+b64(`${c.user||''}:${c.pass||''}`) }, extra||{}); }
async function davPut(c, config, name=FILE){
  try{ const r=await fetch(davUrl(c,name),{ method:'PUT', headers:davHeaders(c,{'Content-Type':'application/json; charset=utf-8'}), body:JSON.stringify(config) });
    return r.ok?{ok:true}:{ok:false,reason:'HTTP '+r.status}; }
  catch(e){ return {ok:false,reason:(e&&e.message)||'network'}; }
}
async function davGet(c,name=FILE){
  try{ const r=await fetch(davUrl(c,name),{ method:'GET', headers:davHeaders(c), cache:'no-store' });
    if(r.status===404) return {ok:true,config:null}; if(!r.ok) return {ok:false,reason:'HTTP '+r.status};
    const t=await r.text(); let config=null; try{ config=JSON.parse(t); }catch{ return {ok:false,reason:'非法 JSON'}; }
    return {ok:true,config}; }
  catch(e){ return {ok:false,reason:(e&&e.message)||'network'}; }
}

function backupName(){
  let now=Date.now(); if(now<=lastBackupTime) now=lastBackupTime+1000; lastBackupTime=now;
  const d=new Date(now), p=n=>String(n).padStart(2,'0');
  return `fu-nav-backup-${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.json`;
}

function xmlText(node,local){ const hit=node.getElementsByTagNameNS('*',local)[0]; return hit ? (hit.textContent||'').trim() : ''; }

export async function cloudListBackups(settings){
  const c=cloudOf(settings); if(c.type==='gdrive') return {ok:false,reason:'Google Drive 仅支持单文件恢复'};
  try{
    const r=await fetch(davBase(c),{method:'PROPFIND',headers:davHeaders(c,{Depth:'1'}),cache:'no-store'});
    if(!r.ok) return {ok:false,reason:'HTTP '+r.status};
    const doc=new DOMParser().parseFromString(await r.text(),'application/xml');
    if(doc.getElementsByTagNameNS('*','parsererror').length) return {ok:false,reason:'目录响应解析失败'};
    const files=[];
    for(const row of [...doc.getElementsByTagNameNS('*','response')]){
      const href=xmlText(row,'href'); if(!href) continue;
      let name=''; try{ name=decodeURIComponent(new URL(href,davBase(c)).pathname.split('/').filter(Boolean).pop()||''); }catch{ continue; }
      if(name!==FILE && !BACKUP_RE.test(name)) continue;
      files.push({name,size:Number(xmlText(row,'getcontentlength'))||0,mtime:xmlText(row,'getlastmodified'),url:new URL(href,davBase(c)).href});
    }
    const fixed=files.filter(f=>f.name===FILE), backups=files.filter(f=>BACKUP_RE.test(f.name)).sort((a,b)=>b.name.localeCompare(a.name));
    return {ok:true,files:[...fixed.slice(0,1),...backups]};
  }catch(e){ return {ok:false,reason:(e&&e.message)||'无法列出目录'}; }
}

async function davDelete(c,name){ try{ const r=await fetch(davUrl(c,name),{method:'DELETE',headers:davHeaders(c)}); return r.ok; }catch{ return false; } }

export async function cloudPutBackup(settings,config){
  const c=cloudOf(settings); if(c.type==='gdrive') return cloudPut(settings,config);
  const name=backupName(), put=await davPut(c,config,name); if(!put.ok) return put;
  const listed=await cloudListBackups(settings);
  if(listed.ok){ const backups=listed.files.filter(f=>BACKUP_RE.test(f.name)); for(const old of backups.slice(10)) await davDelete(c,old.name); }
  return {ok:true,name};
}

export async function cloudGetFile(settings,name=FILE){
  const c=cloudOf(settings); if(c.type==='gdrive') return gdGet(c);
  if(name!==FILE && !BACKUP_RE.test(name||'')) return {ok:false,reason:'非法备份文件名'};
  return davGet(c,name);
}
async function davTest(c){ if(!c.url) return {ok:false,reason:'未填 URL'};
  try{ const r=await fetch(davUrl(c),{ method:'GET', headers:davHeaders(c), cache:'no-store' });
    if(r.ok||r.status===404) return {ok:true, reason:r.status===404?'已连通（云端暂无备份）':'已连通'};
    if(r.status===401) return {ok:false,reason:'401 账号或密码错误'};
    return {ok:false,reason:'HTTP '+r.status}; }
  catch(e){ return {ok:false,reason:(e&&e.message)||'无法连接（检查 URL/授权）'}; }
}

/* ---------------- Google Drive（appDataFolder）---------------- */
const GD_SCOPE='https://www.googleapis.com/auth/drive.appdata';
let gdToken=null, gdExp=0;
async function gdAuth(c, interactive){
  if(gdToken && Date.now()<gdExp-60000) return gdToken;
  if(!(typeof chrome!=='undefined' && chrome.identity)) throw new Error('需在扩展环境（非预览）');
  if(!c.gdriveClientId) throw new Error('未填 Google OAuth Client ID');
  const redirect=chrome.identity.getRedirectURL();
  const p=new URLSearchParams({ client_id:c.gdriveClientId, response_type:'token', redirect_uri:redirect, scope:GD_SCOPE });
  if(interactive) p.set('prompt','consent');
  const url='https://accounts.google.com/o/oauth2/v2/auth?'+p.toString();
  const resp=await new Promise((res,rej)=>chrome.identity.launchWebAuthFlow({url, interactive:!!interactive}, r=>chrome.runtime.lastError?rej(new Error(chrome.runtime.lastError.message)):res(r)));
  const q=new URLSearchParams(((resp||'').split('#')[1])||'');
  const tok=q.get('access_token'); if(!tok) throw new Error('未取到授权令牌');
  gdToken=tok; gdExp=Date.now()+(+(q.get('expires_in')||'3600'))*1000; return tok;
}
async function gdFindId(token){
  const u='https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id)&q='+encodeURIComponent("name='"+FILE+"'");
  const r=await fetch(u,{headers:{Authorization:'Bearer '+token}}); if(!r.ok) throw new Error('Drive 列表 HTTP '+r.status);
  const d=await r.json(); return (d.files&&d.files[0])?d.files[0].id:null;
}
async function gdPut(c, config){
  try{ const token=await gdAuth(c,true); const id=await gdFindId(token);
    const meta=id?{}:{name:FILE,parents:['appDataFolder']};
    const bd='fnb'+Math.random().toString(36).slice(2);
    const body='--'+bd+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(meta)+'\r\n--'+bd+'\r\nContent-Type: application/json\r\n\r\n'+JSON.stringify(config)+'\r\n--'+bd+'--';
    const url=id?('https://www.googleapis.com/upload/drive/v3/files/'+id+'?uploadType=multipart'):'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    const r=await fetch(url,{method:id?'PATCH':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'multipart/related; boundary='+bd},body});
    return r.ok?{ok:true}:{ok:false,reason:'HTTP '+r.status}; }
  catch(e){ return {ok:false,reason:(e&&e.message)||'gdrive'}; }
}
async function gdGet(c){
  try{ const token=await gdAuth(c,true); const id=await gdFindId(token);
    if(!id) return {ok:true,config:null};
    const r=await fetch('https://www.googleapis.com/drive/v3/files/'+id+'?alt=media',{headers:{Authorization:'Bearer '+token}});
    if(!r.ok) return {ok:false,reason:'HTTP '+r.status}; const config=await r.json(); return {ok:true,config}; }
  catch(e){ return {ok:false,reason:(e&&e.message)||'gdrive'}; }
}
async function gdTest(c){ if(!c.gdriveClientId) return {ok:false,reason:'未填 Client ID'};
  try{ await gdAuth(c,true); return {ok:true,reason:'已授权 Google Drive'}; }catch(e){ return {ok:false,reason:(e&&e.message)||'授权失败'}; } }

/* ---------------- 统一入口（按 type 分发）---------------- */
export async function cloudPut(settings, config){ const c=cloudOf(settings); return c.type==='gdrive'?gdPut(c,config):davPut(c,config); }
export async function cloudGet(settings){ const c=cloudOf(settings); return c.type==='gdrive'?gdGet(c):davGet(c); }
export async function cloudTest(settings){ const c=cloudOf(settings); return c.type==='gdrive'?gdTest(c):davTest(c); }
