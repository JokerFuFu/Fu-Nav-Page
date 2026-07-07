#!/usr/bin/env node
/* ============ Fu 导航 · 本机伴随服务（零依赖）============
 * 仅监听回环地址；CORS 锁扩展 origin（可留空放行）；X-Token 收口；带 PNA 头。
 * 端口/Token 与扩展设置一致（默认 7842 / fu-nav-local）。
 * 端点：
 *   GET  /data       提醒/日历/AI日报（build.sh 生成的 ~/.fu-nav/data.json）
 *   GET  /health     健康检查
 *   POST /probe      TCP 探测一批内网服务是否在线 {targets:["http://ip:port",...]}
 *                    —— 浏览器探测受混合内容/自签证书/CORS 限制会误判，本机 TCP 直连才是准的
 *   GET  /api/4/all  本机硬件数据（Glances v4 兼容格式），hwmon 小组件填 http://127.0.0.1:7842 即可
 *                    —— 免 token：只在回环可达，且 fetchGlances 不带自定义头（对真 Glances 也不带）
 */
const http = require('http');
const fs = require('fs');
const net = require('net');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

const PORT  = +(process.env.FN_PORT  || 7842);
const TOKEN = process.env.FN_TOKEN || 'fu-nav-local';
// 允许的扩展来源：留空 '*'（个人单机够用）；要更严就填 chrome-extension://<你的ID>
const ORIGIN = process.env.FN_ORIGIN || '*';
const DATA = path.join(os.homedir(), '.fu-nav', 'data.json');

/* ---- TCP 探测：host:port 能建立连接即在线（不管 TLS 证书/HTTP 状态码） ---- */
function tcpProbe(url, timeout=2500){
  return new Promise(resolve=>{
    let host, port;
    try{ const u=new URL(url); host=u.hostname; port=+u.port || (u.protocol==='https:'?443:80); }
    catch{ resolve(false); return; }
    const sock=net.connect({host, port, timeout});
    const done=ok=>{ sock.destroy(); resolve(ok); };
    sock.once('connect',()=>done(true));
    sock.once('timeout',()=>done(false));
    sock.once('error',()=>done(false));
  });
}
async function probeBatch(targets){
  const list=[...new Set(targets)].slice(0,200);   // 上限防滥用
  const out={}; let i=0;
  await Promise.all(Array.from({length:Math.min(12,list.length)},async()=>{
    while(i<list.length){ const t=list[i++]; out[t]=await tcpProbe(t); }
  }));
  return out;
}

/* ---- 本机硬件（macOS 自带命令，Glances v4 兼容输出，缓存 4s 免频繁起进程） ---- */
const sh = cmd => new Promise(r=>exec(cmd,{timeout:8000},(e,so)=>r(e?'':String(so))));
let hwCache=null, hwAt=0, hwBusy=null;
async function collectHw(){
  const [topOut, vmOut, memsize, dfOut, loadOut, ncpu, boot] = await Promise.all([
    sh('top -l 2 -n 0 -s 1 | grep "CPU usage" | tail -1'),   // 第二次采样才是即时值
    sh('vm_stat'),
    sh('/usr/sbin/sysctl -n hw.memsize'),
    sh('df -k /System/Volumes/Data / 2>/dev/null'),
    sh('/usr/sbin/sysctl -n vm.loadavg'),
    sh('/usr/sbin/sysctl -n hw.ncpu'),
    sh('/usr/sbin/sysctl -n kern.boottime'),
  ]);
  // CPU: "CPU usage: 7.89% user, 10.52% sys, 81.57% idle"
  let cpu=null; { const m=/([\d.]+)%\s*idle/.exec(topOut); if(m) cpu=Math.max(0,100-parseFloat(m[1])); }
  // 内存: (active+wired+compressed)*pagesize / hw.memsize
  let memPct=null; {
    const pg=+((/page size of (\d+)/.exec(vmOut)||[])[1]||16384);
    const g=k=>+(((new RegExp(k+':\\s+(\\d+)')).exec(vmOut)||[])[1]||0);
    const used=(g('Pages active')+g('Pages wired down')+g('Pages occupied by compressor'))*pg;
    const total=+memsize||0; if(total) memPct=used/total*100;
  }
  // 磁盘: df 每行 → {mnt_point, percent}
  const fsArr=dfOut.trim().split('\n').slice(1).map(l=>{ const c=l.trim().split(/\s+/);
    const pct=parseInt(c[4]); const mnt=c[c.length-1];
    return {mnt_point: mnt==='/System/Volumes/Data'?'Data':mnt, percent:isNaN(pct)?null:pct};
  }).filter((f,i,a)=>f.percent!=null && a.findIndex(x=>x.mnt_point===f.mnt_point)===i);
  // 负载/核数/开机时长
  const lm=/\{?\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(loadOut);
  const bm=/sec\s*=\s*(\d+)/.exec(boot);
  return {
    system: { hostname: os.hostname().replace(/\.local$/,'') },
    cpu:  cpu!=null ? { total: cpu } : undefined,
    mem:  memPct!=null ? { percent: memPct } : undefined,
    fs:   fsArr,
    load: lm ? { min1:+lm[1], min5:+lm[2], min15:+lm[3], cpucore:+ncpu||null } : undefined,
    uptime: bm ? Math.round(Date.now()/1000 - +bm[1]) : undefined,
  };
}
async function getHw(){
  if(hwCache && Date.now()-hwAt<4000) return hwCache;
  if(!hwBusy) hwBusy=collectHw().then(d=>{ hwCache=d; hwAt=Date.now(); hwBusy=null; return d; })
                               .catch(()=>{ hwBusy=null; return hwCache; });
  return hwBusy;
}

const json=(res,code,obj)=>{ res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(obj)); };

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'X-Token, Content-Type');
  res.setHeader('Access-Control-Allow-Private-Network', 'true'); // 应对 Chrome PNA/LNA 预检
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  const route = req.url.split('?')[0];

  if (route === '/api/4/all') { getHw().then(d=>json(res,200,d||{})); return; }   // 免 token，见文件头

  if (TOKEN && req.headers['x-token'] !== TOKEN) { res.writeHead(403).end('forbidden'); return; }

  if (route === '/data') {
    fs.readFile(DATA, 'utf8', (err, txt) => {
      if (err) { json(res,200,{error:'no-data', hint:'先跑 build.sh', generatedAt:null}); return; }
      res.writeHead(200, {'Content-Type':'application/json; charset=utf-8'});
      res.end(txt);
    });
  } else if (route === '/probe' && req.method === 'POST') {
    let body=''; req.on('data',c=>{ body+=c; if(body.length>65536) req.destroy(); });
    req.on('end', async ()=>{
      try{
        const { targets } = JSON.parse(body||'{}');
        if(!Array.isArray(targets)) { json(res,400,{error:'targets required'}); return; }
        json(res,200,{ results: await probeBatch(targets) });
      }catch{ json(res,400,{error:'bad json'}); }
    });
  } else if (route === '/health') {
    json(res,200,{ok:true, probe:true, hw:true});
  } else {
    res.writeHead(404).end('not found');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Fu-Nav agent on http://127.0.0.1:${PORT} (data=${DATA})`));
