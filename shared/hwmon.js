/* ============ 硬件监控：对接 Glances Web API ============
 * 零 agent，监控任意跑了 Glances 的服务器（含本机）。
 * 目标机执行：`glances -w`（默认端口 61208），或
 *   docker run -d --restart=always --network host nicolargo/glances:latest-full glances -w
 * 兼容 Glances v4(/api/4) 与 v3(/api/3)。扩展页对声明主机 fetch 不受 CORS 限制。
 */
import { localFetch } from './agent.js';
const num = v => (typeof v==='number' ? v : (v!=null && v!=='' ? +v : null));

export async function fetchGlances(base){
  base=(base||'').replace(/\/+$/,''); if(!base) return null;
  // localFetch：先裸 fetch，失败再按 loopback→local 补 LNA 地址空间声明重试
  // （127.0.0.1 是 loopback、内网 IP 是 local，声明错会直接 Failed to fetch）
  for(const ver of ['4','3']){
    try{
      const ctl=new AbortController(); const t=setTimeout(()=>ctl.abort(), 4000);
      const r=await localFetch(`${base}/api/${ver}/all`, { signal:ctl.signal });
      clearTimeout(t);
      if(!r.ok) continue;
      const d=await r.json();
      if(d && (d.cpu || d.mem || d.fs)) return normalize(d);
    }catch{}
  }
  return null;
}

function normalize(d){
  const cpu  = d.cpu ? Math.round(num(d.cpu.total)) : null;
  const mem  = d.mem ? Math.round(num(d.mem.percent)) : null;
  const swap = d.memswap ? Math.round(num(d.memswap.percent)) : null;
  const disks = Array.isArray(d.fs)
    ? d.fs.map(f=>({ mnt:(f.mnt_point||f.device_name||'').replace(/^\/dev\//,''), pct:Math.round(num(f.percent)) }))
        .filter(x=>x.pct!=null && x.mnt).slice(0,4)
    : [];
  let temp=null;
  if(Array.isArray(d.sensors)){
    const ts=d.sensors.filter(s=>typeof s.value==='number' && (s.unit==='C' || /temp/i.test(s.type||'') || /(cpu|core|package|tctl|composite)/i.test(s.label||'')));
    if(ts.length){ temp=Math.round(Math.max(...ts.map(s=>s.value))); }
  }
  const host = (d.system && (d.system.hostname || d.system.os_name)) || '';
  const load = d.load ? num(d.load.min1) : null;
  const cores = d.load ? num(d.load.cpucore) : null;
  let uptime = d.uptime; if(uptime && typeof uptime==='object') uptime=uptime.seconds;
  return { host, cpu, mem, swap, disks, temp, load, cores, uptime };
}
