/* ============ 失效链接检测（只针对公网站点）============
 * **内网/私有地址永不标失效**：homelab/公司内网服务的可达性取决于你当前在哪个网络（在家/公司/在外），
 *   在外面连不上不代表服务挂了——给它标「失效」是错的。内网只用绿色在线点(core.probeStatus)表达
 *   「此刻连得上」，连不上就没点，绝不打叉。
 * 公网站点用 `fetch(url, {mode:'no-cors'})` 探测——命中真实 URL（不依赖是否在根路径放 favicon）、
 *   走浏览器代理（挂了科学上网被墙站也能正确判可达），收到响应头即算可达，网络失败才判不可达。
 * 后台每天一次批量跑，标记 item.deadSince；不自动删除，只在卡片标灰+小图标提醒。
 */

/* 公网可达探测：no-cors fetch，只看请求能否完成（任意响应=可达，DNS/连接失败=不可达） */
function probeOne(url){
  return new Promise(resolve=>{
    const ctl = new AbortController();
    const to = setTimeout(()=>{ try{ctl.abort();}catch{} resolve(false); }, 6000);
    fetch(url, { mode:'no-cors', signal:ctl.signal, cache:'no-store', redirect:'follow' })
      .then(()=>{ clearTimeout(to); resolve(true); })
      .catch(()=>{ clearTimeout(to); resolve(false); });
  });
}

/* 有限并发跑一批，避免几十上百个站点同时发请求卡住浏览器 */
async function probeBatch(entries, concurrency=8){
  let i=0;
  const workers=Array.from({length:Math.min(concurrency,entries.length)}, async ()=>{
    while(i<entries.length){
      const {item}=entries[i++];
      const ok = await probeOne(item.url);
      if(ok) delete item.deadSince; else item.deadSince = item.deadSince || Date.now();
    }
  });
  await Promise.all(workers);
}

/* no-cors fetch 对「安全上下文(扩展页/https)下的 http 站」会被混合内容拦截，失败≠真挂了 → 跳过不误标 */
function fetchProbeable(url){
  if(!/^https?:\/\//i.test(url||'')) return false;
  const secure = location.protocol==='https:' || location.protocol==='chrome-extension:';
  if(secure && /^http:\/\//i.test(url)) return false;
  return true;
}

export async function checkAllLinks(core){
  const pub=[];
  for(const e of core.allItems()){
    const u=e.item.url||''; if(!/^https?:\/\//i.test(u)){ delete e.item.deadSince; continue; }
    let host; try{ host=new URL(u).hostname; }catch{ delete e.item.deadSince; continue; }
    if(core.isPrivateHost(host)){ delete e.item.deadSince; continue; }   // 内网永不标失效，清掉任何旧标
    pub.push(e);
  }
  // 公网：no-cors fetch 探测；混合内容拦截的(扩展页下 http 站)测不准 → 跳过并清旧标
  pub.filter(e=>!fetchProbeable(e.item.url)).forEach(({item})=>{ delete item.deadSince; });
  const entries = pub.filter(e=>fetchProbeable(e.item.url));
  if(entries.length) await probeBatch(entries);
  core.settings.lastDeadCheck = Date.now();
  core.save(true);
  core.rerender();
}

/* 打开导航页时自动检查：距上次探测超过 24 小时才跑，避免每次打开都探测拖慢体验 */
export function maybeAutoCheck(core){
  const last = core.settings.lastDeadCheck || 0;
  if(Date.now() - last > 24*3600*1000) checkAllLinks(core);
}
