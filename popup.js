/* ============ 工具栏收藏弹窗 ============
 * 点扩展图标 → 弹出 Infinity 式编辑框，收藏/编辑当前网页（名称 + 四模式图标 + 分组）。
 * 已收藏检测递归进文件夹（locateFavorite），跟 background.js 的图标角标共用同一套 normUrl 归一化口径。
 */
import { loadConfig, saveConfig } from './shared/storage.js';
import { createIconEditor } from './shared/icon-editor.js';
import { hostOf, normUrl } from './shared/icon-map.js';

const uid = p => p + Math.random().toString(36).slice(2,7) + Date.now().toString(36).slice(-3);
const E = (t,c,x)=>{ const e=document.createElement(t); if(c)e.className=c; if(x!=null)e.textContent=x; return e; };
const field = (label,input)=>{ const w=E('div','fn-field'); w.appendChild(E('label',null,label)); w.appendChild(input); return w; };
const inp = (v='',ph='')=>{ const i=E('input'); i.value=v; i.placeholder=ph; return i; };
const btn = (t,cls,on)=>{ const b=E('button','fn-btn '+(cls||''),t); b.type='button'; if(on)b.onclick=on; return b; };

/* 递归查找当前网址是否已收藏（含任意层级文件夹）。返回 { item, group, holder, path } 或 null。
 * holder = 该 item 实际所在的数组（分组顶层 items，或某个文件夹的 items）——
 *   删除/移动必须对 holder 操作，不能假设都在 group.items 里，否则文件夹内的收藏删不掉/移不动。
 * path = 面包屑（[分组名, 文件夹名, ...]），供弹窗徽章显示"分组 › 文件夹"。 */
function locateFavorite(groups, url){
  const target = normUrl(url);
  if(!target) return null;
  for(const g of (groups||[])){
    const hit = findInItems(g.items, target, [g.name || '未命名分组']);
    if(hit) return { item: hit.item, group: g, holder: hit.holder, path: hit.path };
  }
  return null;
}
function findInItems(items, target, path){
  for(const it of (items||[])){
    if(!it) continue;
    if(it.type==='folder'){
      const r = findInItems(it.items, target, [...path, it.name || '文件夹']);
      if(r) return r;
    } else if(normUrl(it.url)===target){
      return { item: it, holder: items, path };
    }
  }
  return null;
}

const pop = document.getElementById('pop');
pop.appendChild(E('div','pop-loading','载入当前页…'));

function getActiveTab(){
  return new Promise(res=>{
    if(typeof chrome==='undefined' || !chrome.tabs){ res({ url:location.href, title:document.title||'示例网站（预览）' }); return; } // 非扩展：预览兜底
    try{ chrome.tabs.query({active:true,currentWindow:true}, tabs=>res(tabs&&tabs[0]||null)); }
    catch{ res(null); }
  });
}

async function init(){
  const [tab, { config }] = await Promise.all([getActiveTab(), loadConfig()]);
  const cfg = (config && Array.isArray(config.groups)) ? config : { version:2, settings:{}, groups:[] };
  document.body.dataset.theme = (cfg.settings && cfg.settings.theme) || 'auto';

  const url = (tab && tab.url) || '';
  const title = (tab && tab.title) || '';
  const httpOk = /^https?:\/\//i.test(url);

  const hit = httpOk ? locateFavorite(cfg.groups, url) : null;
  const existing = hit ? hit.item : null;

  render(cfg, { url: existing?existing.url:url, title: existing?existing.name:title, httpOk,
    existing, existingGroup: hit?hit.group:null, existingHolder: hit?hit.holder:null, existingPath: hit?hit.path:null });
}

function render(cfg, ctx){
  pop.textContent='';
  // 头部
  const head=E('div','pop-h');
  const logo=E('div','pop-logo'); const logoImg=new Image(); logoImg.src='icons/icon32.png'; logoImg.alt=''; logo.appendChild(logoImg);
  head.append(logo, E('div','pop-title', ctx.existing?'编辑收藏':'收藏到 Fu.'));
  if(!ctx.existing) head.appendChild(E('div','pop-sub','当前网页'));
  pop.appendChild(head);
  if(ctx.existing){
    const badge=E('div','pop-badge');
    badge.append(E('span','pop-badge-ic'), E('span',null,'已收藏 · '+(ctx.existingPath||[]).join(' › ')));
    pop.appendChild(badge);
  }

  if(!ctx.httpOk){
    pop.appendChild(E('div','pop-loading','当前页面不是普通网页（http/https），无法收藏。'));
    pop.appendChild(footRow([ btn('关闭','primary',()=>window.close()) ]));
    return;
  }

  // 名称
  const nameI=inp(ctx.title,'网站名称');
  pop.appendChild(field('网站名称', nameI));

  // 图标编辑器（自动/纯色/在线/本地）
  const iconEd=createIconEditor({ icon: ctx.existing?ctx.existing.icon||'':'', name: ctx.title, url: ctx.url });
  nameI.addEventListener('input',()=>iconEd.setContext(nameI.value, urlI.value));
  pop.appendChild(field('选择图标', iconEd.node));

  // 网址 + 分组（紧凑一行）
  const urlI=inp(ctx.url,'https://…');
  urlI.addEventListener('input',()=>iconEd.setContext(nameI.value, urlI.value));
  const sel=E('select');
  cfg.groups.forEach(g=>{ const o=E('option',null,g.name); o.value=g.id; if(ctx.existingGroup&&g.id===ctx.existingGroup.id)o.selected=true; sel.appendChild(o); });
  if(!ctx.existingGroup){ const fav=cfg.groups.find(g=>/收藏|常用|favorite|book/i.test(g.name)); if(fav)sel.value=fav.id; }
  const newOpt=E('option',null,'新建「收藏」分组…'); newOpt.value='__new__'; sel.appendChild(newOpt);
  const row=E('div','pop-row'); row.append(field('网址', urlI), field('分组', sel)); pop.appendChild(row);

  const status=E('div','pop-status'); pop.appendChild(status);

  // 底部按钮
  const foot=[];
  if(ctx.existing) foot.push(btn('删除','danger',()=>{
    const holder=ctx.existingHolder; if(holder){ const i=holder.indexOf(ctx.existing); if(i>=0) holder.splice(i,1); }
    persist(cfg, status, '已删除'); }));
  foot.push(btn('取消','ghost',()=>window.close()));
  foot.push(btn(ctx.existing?'保存':'确定','primary',()=>{
    let url=urlI.value.trim(); if(!url){ status.textContent='请填写网址'; status.className='pop-status err'; return; }
    if(!/^[a-z]+:\/\//i.test(url)) url='https://'+url;
    const data={ name:nameI.value.trim()||hostOf(url)||url, url, icon:iconEd.getIcon() };
    if(ctx.existing){ const keep=ctx.existing.id; Object.assign(ctx.existing, data); ctx.existing.id=keep;
      // 跨组移动：目标分组跟当前顶层分组不一样才移，从实际所在的 holder（可能在文件夹内）挪出去
      const tg=resolveGroup(cfg, sel.value); if(tg && ctx.existingGroup && tg!==ctx.existingGroup){
        const holder=ctx.existingHolder; if(holder){ const i=holder.indexOf(ctx.existing); if(i>=0) holder.splice(i,1); }
        tg.items.push(ctx.existing);
      }
    } else {
      const tg=resolveGroup(cfg, sel.value); data.id=uid('i'); data.note=''; tg.items.push(data);
    }
    persist(cfg, status, ctx.existing?'已保存':'已收藏');
  }));
  pop.appendChild(footRow(foot));

  setTimeout(()=>nameI.focus(),60);
}

/* 解析目标分组：__new__ 或无分组时创建「收藏」 */
function resolveGroup(cfg, val){
  if(val && val!=='__new__'){ const g=cfg.groups.find(x=>x.id===val); if(g)return g; }
  let g=cfg.groups.find(x=>/^收藏$/.test(x.name)); if(g)return g;
  g={ id:uid('g'), name:'收藏', icon:'star', color:'#22c55e', collapsed:false, items:[] }; cfg.groups.unshift(g); return g;
}

function footRow(btns){ const f=E('div','pop-foot'); btns.forEach(b=>f.appendChild(b)); return f; }

async function persist(cfg, status, okMsg){
  status.className='pop-status'; status.textContent='保存中…';
  try{ await saveConfig(cfg); status.className='pop-status ok'; status.textContent=okMsg+'，已同步到首页';
    setTimeout(()=>window.close(), 650);
  }catch(e){ status.className='pop-status err'; status.textContent='保存失败：'+(e&&e.message||e); }
}

init();
