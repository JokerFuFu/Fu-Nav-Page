/* ============ 本机伴随 agent 取数（提醒事项/日历/AI日报）============
 * 仅当本机 127.0.0.1 agent 在跑时有数据；否则返回 null，UI 隐藏相应小组件。
 * 端口/token 与 agent/server.js 对应；可在设置里改。
 */
const DEFAULT_PORT = 7842;
const CACHE='fn_agentdata';

/* 回环/内网地址的 fetch：不同 Chrome 版本 LNA/PNA 对地址空间的枚举名不一致
 * （127.0.0.1 旧 PNA 叫 local、新 LNA 叫 loopback，声明错了直接 Failed to fetch）。
 * 先裸 fetch（扩展页有 host 权限、本地预览页都直接通）；失败再按 loopback→local 补声明重试。 */
export async function localFetch(url, init={}){
  let lastErr;
  try{ return await fetch(url, init); }catch(e){ lastErr=e; }
  if(typeof Request!=='undefined' && 'targetAddressSpace' in Request.prototype){
    for(const v of ['loopback','local']){
      try{ return await fetch(url, {...init, targetAddressSpace:v}); }catch(e){ lastErr=e; }
    }
  }
  throw lastErr;
}

export async function fetchAgentData(opts={}){
  const port = opts.port || DEFAULT_PORT;
  const token = opts.token || 'fu-nav-local';
  const ctl = new AbortController();
  const t = setTimeout(()=>ctl.abort(), 1500);
  try{
    const r = await localFetch(`http://127.0.0.1:${port}/data`, {
      headers:{ 'X-Token': token },
      signal: ctl.signal,
    });
    clearTimeout(t);
    if(!r.ok) return null;
    const data = await r.json();
    try{ sessionStorage.setItem(CACHE, JSON.stringify(data)); }catch{}
    return data;
  }catch{
    clearTimeout(t);
    return null; // agent 没跑 / 不在本机
  }
}

export function cachedAgentData(){ try{ return JSON.parse(sessionStorage.getItem(CACHE)); }catch{ return null; } }

/* 经本机 agent 对一批 URL 做 TCP 直连探测（POST /probe）。
 * 浏览器自己探内网会被 混合内容/自签证书/CORS 拦住而误判「不可达」；本机 TCP 能不能连上才是真在线。
 * 返回 { url:true/false } 映射；agent 没跑/超时返回 null（调用方自行回退或放弃）。 */
export async function agentProbe(targets, opts={}){
  if(!Array.isArray(targets) || !targets.length) return null;
  const port = opts.port || DEFAULT_PORT;
  const token = opts.token || 'fu-nav-local';
  const ctl = new AbortController();
  const t = setTimeout(()=>ctl.abort(), 20000);   // 批量全灭最坏情况较久，正常在线 <1s
  try{
    const r = await localFetch(`http://127.0.0.1:${port}/probe`, {
      method:'POST',
      headers:{ 'X-Token': token, 'Content-Type':'application/json' },
      body: JSON.stringify({targets}),
      signal: ctl.signal,
    });
    clearTimeout(t);
    if(!r.ok) return null;
    const d = await r.json();
    return d.results || null;
  }catch{
    clearTimeout(t);
    return null; // agent 没跑 / 不在本机
  }
}
