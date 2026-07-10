const STEPS=[
  {sel:'.fx-side',title:'欢迎使用 Fu 导航',text:'左侧是分组导航：分组即页面，点击切换；常用操作也在这里。'},
  {sel:'.fx-ask',title:'搜索与 AI',text:'输入关键词回车即搜；点左侧图标可切换搜索引擎或 AI（Kimi/ChatGPT 等）。'},
  {sel:'[data-tour="lock"]',title:'编辑锁',text:'日常保持锁定防误改；解锁后才可拖拽排序、编辑与删除。'},
  {sel:'.fx-side-foot',title:'快捷入口',text:'命令面板、添加网站、场景切换、主题都在这排按钮里。'},
  {sel:'[data-tour="settings"]',title:'设置与同步',text:'外观、常用区布局、云同步与备份、归档管理都在设置里。'},
];

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function waitFor(sel,ms=3000){ const started=Date.now(); while(Date.now()-started<ms){ const node=document.querySelector(sel); if(node)return node; await wait(120); } return null; }

function position(pop,target){
  const pad=16, margin=12, w=pop.offsetWidth||320, h=pop.offsetHeight||160;
  if(!target){ pop.style.left=Math.max(pad,(innerWidth-w)/2)+'px'; pop.style.top=Math.max(pad,(innerHeight-h)/2)+'px'; return; }
  const r=target.getBoundingClientRect();
  const candidates=[
    {left:r.left,top:r.bottom+margin},
    {left:r.left,top:r.top-h-margin},
    {left:r.right+margin,top:r.top},
    {left:r.left-w-margin,top:r.top},
  ];
  const place=candidates.find(c=>c.left>=pad&&c.top>=pad&&c.left+w<=innerWidth-pad&&c.top+h<=innerHeight-pad)||candidates[0];
  pop.style.left=Math.max(pad,Math.min(innerWidth-w-pad,place.left))+'px';
  pop.style.top=Math.max(pad,Math.min(innerHeight-h-pad,place.top))+'px';
}

export function startTour(core){
  core.closeModal();
  document.querySelector('.fn-tour-mask')?.remove(); document.querySelector('.fn-tour-pop')?.remove();
  document.querySelectorAll('.fn-tour-hl').forEach(node=>node.classList.remove('fn-tour-hl'));
  document.querySelectorAll('.fn-tour-elevated').forEach(node=>node.classList.remove('fn-tour-elevated'));
  let index=0, current=null, finished=false;
  const mask=document.createElement('div'),pop=document.createElement('section'); mask.className='fn-tour-mask'; pop.className='fn-tour-pop';
  const clearStep=async()=>{ if(!current)return; current.el?.classList.remove('fn-tour-hl'); current.el?.closest('.fn-backdrop')?.classList.remove('fn-tour-elevated'); if(current.step.cleanup)await current.step.cleanup(core); current=null; };
  const done=async()=>{ if(finished)return; finished=true; await clearStep(); mask.remove(); pop.remove(); window.removeEventListener('resize',draw); document.removeEventListener('keydown',key); core.settings.onboarded=true; core.save(true); };
  const key=e=>{ if(e.key==='Escape')done(); };
  const advance=async delta=>{ index=Math.max(0,Math.min(STEPS.length-1,index+delta)); await draw(); };
  const draw=async()=>{ if(finished)return; await clearStep(); const step=STEPS[index]; if(step.before)await step.before(core); const target=step.sel?await waitFor(step.sel):null;
    if(step.sel&&!target){ if(index<STEPS.length-1)return advance(1); return done(); }
    if(target){ target.classList.add('fn-tour-hl'); target.closest('.fn-backdrop')?.classList.add('fn-tour-elevated'); }
    current={el:target,step};
    pop.innerHTML=`<div class="fn-tour-dots">${STEPS.map((_,i)=>`<i class="${i===index?'on':''}"></i>`).join('')}</div><strong>${step.title}</strong><p>${step.text}</p><div><button class="fn-tour-prev" ${index?'':'disabled'}>上一步</button><button class="fn-tour-skip">跳过</button><button class="fn-tour-next">${index===STEPS.length-1?'完成':'下一步'}</button></div>`;
    position(pop,target); pop.querySelector('.fn-tour-prev').onclick=()=>advance(-1); pop.querySelector('.fn-tour-skip').onclick=done; pop.querySelector('.fn-tour-next').onclick=()=>index===STEPS.length-1?done():advance(1); };
  document.body.append(mask,pop); window.addEventListener('resize',draw); document.addEventListener('keydown',key); draw();
}
