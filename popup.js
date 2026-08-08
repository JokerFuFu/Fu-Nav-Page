/* ============ 工具栏目录级收藏器 ============ */
import { loadConfig, saveConfig, pushInbox } from './shared/storage.js';
import { createIconEditor } from './shared/icon-editor.js?v=3.24.5';
import { hostOf, normUrl } from './shared/icon-map.js';
import { locateNode, removeNode, walkTree } from './shared/tree.js';
import { buildDestinationOptions, rememberDestination, savePopupItem, RECENT_DESTINATIONS_KEY } from './shared/popup-model.js';

const E = (tag, className, text) => { const node=document.createElement(tag); if(className)node.className=className; if(text!=null)node.textContent=text; return node; };
let fieldSeq=0;
const field = (labelText, control) => { const wrap=E('div','fn-field'); if(control?.matches?.('input,select,textarea')){ const label=E('label',null,labelText); control.id=control.id||`pop-field-${++fieldSeq}`; label.htmlFor=control.id; wrap.appendChild(label); }
  else { const label=E('div','fn-field-label',labelText); label.id=`pop-field-label-${++fieldSeq}`; control?.setAttribute?.('role','group'); control?.setAttribute?.('aria-labelledby',label.id); wrap.appendChild(label); } wrap.appendChild(control); return wrap; };
const inp = (value='',placeholder='') => { const input=E('input'); input.value=value; input.placeholder=placeholder; return input; };
const btn = (text,className,onClick) => { const button=E('button','fn-btn '+(className||''),text); button.type='button'; if(onClick)button.onclick=onClick; return button; };
const footRow = (buttons) => { const row=E('div','pop-foot'); buttons.forEach(button=>row.appendChild(button)); return row; };
const uid = (prefix) => prefix+Math.random().toString(36).slice(2,7)+Date.now().toString(36).slice(-3);

function locateFavorite(groups,url){
  const target=normUrl(url); if(!target)return null;
  const hit=walkTree(groups).find(entry=>entry.node.type!=='folder'&&normUrl(entry.node.url)===target); if(!hit)return null;
  const folders=[]; let parent=hit.parent;
  while(parent){folders.unshift(parent.name||'文件夹');parent=locateNode(groups,parent.id)?.parent||null;}
  return {item:hit.node,group:hit.group,holder:hit.parentItems,path:[hit.group.name||'未命名分组',...folders],destinationKey:hit.parent?`f:${hit.parent.id}`:`g:${hit.group.id}`};
}

function getActiveTab(){ return new Promise(resolve=>{ if(typeof chrome==='undefined'||!chrome.tabs){resolve({url:location.href,title:document.title||'示例网站（预览）'});return;} try{chrome.tabs.query({active:true,currentWindow:true},tabs=>resolve(tabs?.[0]||null));}catch{resolve(null);} }); }
function readRecents(){ return new Promise(resolve=>{ if(typeof chrome!=='undefined'&&chrome.storage?.local){chrome.storage.local.get(RECENT_DESTINATIONS_KEY,value=>resolve(value?.[RECENT_DESTINATIONS_KEY]||[]));return;} try{resolve(JSON.parse(localStorage.getItem(RECENT_DESTINATIONS_KEY)||'[]'));}catch{resolve([]);} }); }
function writeRecents(recents){ if(typeof chrome!=='undefined'&&chrome.storage?.local)return new Promise(resolve=>chrome.storage.local.set({[RECENT_DESTINATIONS_KEY]:recents},resolve)); try{localStorage.setItem(RECENT_DESTINATIONS_KEY,JSON.stringify(recents));}catch{} return Promise.resolve(); }

const pop=document.getElementById('pop'); pop.appendChild(E('div','pop-loading','载入当前页…'));

async function init(){
  const [tab,{config},recents]=await Promise.all([getActiveTab(),loadConfig(),readRecents()]);
  const cfg=config&&Array.isArray(config.groups)?config:{version:3,settings:{},groups:[]};
  if(!cfg.groups.length)cfg.groups.push({id:uid('g'),name:'收藏',icon:'star',color:'#22c55e',collapsed:false,items:[]});
  document.body.dataset.theme=cfg.settings?.theme||'auto';
  const url=tab?.url||'',title=tab?.title||'',httpOk=/^https?:\/\//i.test(url),hit=httpOk?locateFavorite(cfg.groups,url):null;
  render(cfg,{tab,url:hit?.item.url||url,title:hit?.item.name||title,httpOk,existing:hit?.item||null,existingPath:hit?.path||null,existingDestinationKey:hit?.destinationKey||null},recents);
}

function render(cfg,ctx,recentKeys){
  pop.textContent='';
  const head=E('div','pop-h'),logo=E('div','pop-logo'),logoImg=new Image(); logoImg.src='icons/icon32.png';logoImg.alt='';logo.appendChild(logoImg);
  head.append(logo,E('div','pop-title',ctx.existing?'编辑收藏':'收藏到 Fu.')); if(!ctx.existing)head.appendChild(E('div','pop-sub','当前网页'));pop.appendChild(head);
  if(ctx.existing){const badge=E('div','pop-badge');badge.append(E('span','pop-badge-ic'),E('span',null,'已收藏 · '+(ctx.existingPath||[]).join(' › ')));pop.appendChild(badge);}
  if(!ctx.httpOk){pop.append(E('div','pop-loading','当前页面不是普通网页（http/https），无法收藏。'),footRow([btn('关闭','primary',()=>window.close())]));return;}

  const nameI=inp(ctx.title,'网站名称'),urlI=inp(ctx.url,'https://…'); pop.appendChild(field('网站名称',nameI));
  const destinations=buildDestinationOptions(cfg.groups,recentKeys),select=E('select'); select.id='pop-destination';
  destinations.options.forEach(option=>{const node=E('option',null,option.label);node.value=option.key;select.appendChild(node);});
  const common=destinations.options.find(option=>/收藏|常用|favorite|book/i.test(option.label)); select.value=ctx.existingDestinationKey||destinations.recents[0]?.key||common?.key||destinations.options[0]?.key||'';
  if(destinations.recents.length){const recent=E('div','pop-recents');recent.appendChild(E('span','pop-recents-label','最近位置'));destinations.recents.forEach(option=>recent.appendChild(btn(option.label,'pop-recent',()=>{select.value=option.key;})));pop.appendChild(recent);}
  const quickRow=E('div','pop-row');quickRow.append(field('网址',urlI),field('保存位置',select));pop.appendChild(quickRow);

  const advanced=E('details','pop-advanced'),summary=E('summary',null,'高级编辑');summary.setAttribute('aria-expanded','false');advanced.addEventListener('toggle',()=>summary.setAttribute('aria-expanded',String(advanced.open)));advanced.appendChild(summary);
  const noteI=inp(ctx.existing?.note||'','备注（可选）'),favI=E('input'),frameI=E('input');favI.type=frameI.type='checkbox';favI.checked=ctx.existing?.fav===true;frameI.checked=ctx.existing?.frame===true;
  const toggle=(labelText,control)=>{const label=E('label','pop-toggle');control.id=control.id||`pop-field-${++fieldSeq}`;label.htmlFor=control.id;label.append(E('span',null,labelText),control);return label;};
  const iconEd=createIconEditor({icon:ctx.existing?.icon||'',name:ctx.title,url:ctx.url});nameI.addEventListener('input',()=>iconEd.setContext(nameI.value,urlI.value));urlI.addEventListener('input',()=>iconEd.setContext(nameI.value,urlI.value));
  advanced.append(field('备注',noteI),toggle('固定到首页常用',favI),toggle('在面板内打开',frameI),field('选择图标',iconEd.node));pop.appendChild(advanced);
  const status=E('div','pop-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');pop.appendChild(status);

  const save=async(forceDuplicate=false)=>{
    const url=urlI.value.trim();if(!url){status.className='pop-status err';status.textContent='请填写网址';return;}
    const result=savePopupItem(cfg,{existingId:ctx.existing?.id,name:nameI.value.trim()||hostOf(url)||url,url,destinationKey:select.value,note:noteI.value,icon:iconEd.getIcon(),fav:favI.checked,frame:frameI.checked,forceDuplicate});
    if(!result.ok&&(result.duplicate==='exact'||result.duplicate==='possible')){
      status.className='pop-status warn';status.textContent=result.duplicate==='exact'?'这个网址已经收藏过。':'发现一个可能相同的网址，请确认。';
      const choices=E('div','pop-duplicate-actions');
      choices.append(btn('打开已有','ghost',()=>{if(typeof chrome!=='undefined'&&chrome.tabs?.create)chrome.tabs.create({url:result.existing.url});else window.open(result.existing.url,'_blank');}),btn('仍然保存','primary',()=>save(true)));status.appendChild(choices);return;
    }
    if(!result.ok){status.className='pop-status err';status.textContent=result.code==='invalid-destination'?'保存位置已经不存在，请重新选择':'无法保存当前网址';return;}
    const valid=destinations.options.map(option=>option.key),nextRecents=rememberDestination(recentKeys,select.value,valid);await writeRecents(nextRecents);
    const destination=result.destination,item=result.item,group=result.config.groups.find(entry=>entry.id===destination.groupId);
    const op=ctx.existing?{op:'edit',id:item.id,patch:{name:item.name,url:item.url,note:item.note,icon:item.icon,fav:item.fav,frame:item.frame},tgid:destination.groupId,tfid:destination.folderId||undefined}:{op:'add',gid:destination.groupId,folderId:destination.folderId||undefined,gname:group?.name,gicon:group?.icon,gcolor:group?.color,item};
    await persist(result.config,status,ctx.existing?'已保存':'已收藏',[op]);
  };

  const footer=[];
  if(ctx.existing)footer.push(btn('删除','danger',()=>{removeNode(cfg.groups,ctx.existing.id);persist(cfg,status,'已删除',[{op:'del',id:ctx.existing.id}]);}));
  footer.push(btn('取消','ghost',()=>window.close()),btn(ctx.existing?'保存':'快速保存','primary',()=>save(false)));pop.appendChild(footRow(footer));setTimeout(()=>nameI.focus(),60);
}

async function persist(cfg,status,message,ops){status.className='pop-status';status.textContent='保存中…';try{await saveConfig(cfg);if(ops?.length)await pushInbox(ops);status.className='pop-status ok';status.textContent=message+'，已同步到首页';setTimeout(()=>window.close(),650);}catch(error){status.className='pop-status err';status.textContent='保存失败：'+(error?.message||error);}}

init();
