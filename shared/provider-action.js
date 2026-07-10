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
