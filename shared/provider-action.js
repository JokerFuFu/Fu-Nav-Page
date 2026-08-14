export function providerAction(provider,query){
  const p=provider||{}, q=(query||'').trim();
  if(!q){
    const home=p.home||(p.q?p.q.replace(/[?&]q=.*$/,''):'about:blank');
    return {url:home,shouldCopy:false,successMessage:null,failureMessage:null};
  }
  if(p.q) return {url:p.q+encodeURIComponent(q),shouldCopy:false,successMessage:null,failureMessage:null};
  const shouldCopy=p.kind==='ai'&&p.copy===true;
  return {url:p.home||'about:blank',shouldCopy,successMessage:shouldCopy?`问题已复制，到 ${p.name} 粘贴发送即可`:null,failureMessage:shouldCopy?'复制失败，请手动输入':null};
}

export function setAskProvider(settings, providers, id){
  if(!settings || !providers || !providers[id]) return {ok:false,providerId:settings?.askProvider||null,submitted:false};
  settings.askProvider=id;
  return {ok:true,providerId:id,submitted:false};
}

export function submitAsk(text, options={}){
  const settings=options.settings||{}, providers=options.providers||{};
  const providerId=providers[settings.askProvider]?settings.askProvider:Object.keys(providers)[0];
  const provider=providers[providerId]||{};
  const action=providerAction(provider,text);
  let copied=null;
  if(action.shouldCopy){ copied=!!options.copy?.(String(text||'').trim());
    options.feedback?.(copied?action.successMessage:action.failureMessage,copied?'ok':'err'); }
  options.opener?.(action.url);
  return {submitted:true,providerId,url:action.url,copied,shouldCopy:action.shouldCopy};
}

export function filterContent(entries, query){
  const q=String(query||'').trim().toLowerCase(); if(!q)return [...(entries||[])];
  return (entries||[]).filter(item=>{
    const extra=[...(item.tags||[]),...(item.aliases||[])].join(' ');
    return `${item.name||''} ${item.url||''} ${item.note||''} ${extra}`.toLowerCase().includes(q);
  });
}

export function filterKeyAction(key){
  if(key==='Escape')return {prevented:true,clear:true,submitted:false};
  if(key==='Enter')return {prevented:true,clear:false,submitted:false};
  return {prevented:false,clear:false,submitted:false};
}
