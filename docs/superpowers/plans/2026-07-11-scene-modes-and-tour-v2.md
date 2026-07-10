# Fu 导航 · 场景模式 + 新手引导 v2 实现计划（codex 执行）

> **For agentic workers:** 本计划由 **codex** 在 `~/Projects/personal/Fu-Nav-Public` 逐任务执行。三件套：
> - Spec：`docs/superpowers/specs/2026-07-11-scene-modes-and-tour-v2-design.md`
> - 本 Plan：步骤用 `- [ ]` 勾选跟踪
> - **Eval：`docs/superpowers/evals/2026-07-11-scene-modes-and-tour-v2-eval.md`——判据只增不删改，你只许翻 passes；真机项没条件验就保持 false 注明待验**

**Goal:** 工作区升级为一等公民「场景模式」（多属分组+每模式小组件/常用区配置+管理弹层），新手引导升级为目标提升法（可引导弹窗内部）并修「设置弹窗遮挡引导」bug。

**Architecture:** 纯 ES modules 零构建。模式数据放 `settings.modes[]`（mode 持有 groupIds，勾选式管理），`activeMode` 单字段替代旧 `activePage+privacy` 双字段，migrate 一次性迁移并删除旧字段（**禁常驻兜底**，见 CLAUDE.md 犯错记录 2026-07-09）。tour 高亮改「元素浮出遮罩」：mask z=100 全屏，目标 `.fn-tour-hl` z=110 浮出，所在弹窗 `.fn-tour-elevated` z=105。

**Tech Stack:** Chrome/Edge MV3、Lucide（mico/lucide-mask）、`python3 -m http.server 8000` 预览验证（模式与 tour 均预览可验，无真机依赖）。

## Global Constraints（每任务隐含遵守）

- 中文文案/commit（`feat:/fix:/refactor:` 前缀，每任务一个 commit）；git 身份 noreply：`git config user.name "JokerFuFu" && git config user.email "161151890+JokerFuFu@users.noreply.github.com"`。
- 视觉铁律：新 UI 先查 `DESIGN.md`；控件走 `core.toggle()/field()/seg()/btn(l,c,on,ic)/promptModal()`；图标一律 `mico()`，零 emoji/文字符号；触控 ≥32px；动效在 `prefers-reduced-motion` 守卫内；模态挂 body（openModal）。
- 数据铁律：破坏性操作 `save(true)` 立即落盘 + `_tombstones` 登记（撤销时移除）；migrate 仅一次性迁移；**不得引入任何后台自动覆盖本地的路径**。
- 验证：预览浏览器 + DevTools + grep；**改 JS/CSS 后重启预览浏览器进程**（模块缓存）。
- 版本：收尾统一 `3.21.1 → 3.22.0`。
- 执行序：Task 1→2→3（模式系统，依次依赖）→ 4→5（tour v2）→ 收尾。

---

## Task 0：前置

- [ ] `cd ~/Projects/personal/Fu-Nav-Public && git pull`；设 noreply git 身份。
- [ ] 通读三件套 + CLAUDE.md 犯错记录 + DESIGN.md；重点读 `layouts/fusion.js:44-107`（inPage/modeBtn/derivePages/openModeMenu/分组右键）、`shared/core.js` migrate 区、`shared/tour.js` 全文、`shared/base.css:240`（.fn-tour-*）与 `:92`（.fn-backdrop z=60）。
- [ ] 基线预览正常、console 无红错。

## Task 1：模式数据层 + 一次性迁移（M1）

**Files:** Modify `shared/core.js`（defaults/migrate + 新方法区）

**Interfaces（后续任务依赖，签名精确）:**
- `core.modes()` → `settings.modes` 数组（保证已初始化，返回引用）
- `core.activeModeObj()` → 当前模式对象 | `null`（全部）| `'privacy'` 字符串
- `core.setActiveMode(v)`（`null|'privacy'|modeId`；设为 privacy 时置 `_navTo='home'` 语义沿用 D5）
- `core.createMode(name)` → 新 mode 对象（`{id:uid('m'), name, groupIds:[], hiddenWidgets:[], showFavs:true}`），push+save(true)
- `core.deleteMode(id)`（含 `_offerUndo` 快照恢复；activeMode 指向它时回 null）
- `core.toggleModeGroup(mode, gid)` / `core.toggleModeWidget(mode, wid)` / `core.setModeShowFavs(mode, v)`（写入并 save(true)）

- [ ] **1.1** defaults() 增加 `modes:[]`、`activeMode:null`（不再有 privacy/activePage 默认值——但 defaults 的 for-in 补缺不会删除旧字段，删除在迁移里做）。
- [ ] **1.2** migrate() 一次性迁移块（放现有迁移区，带存在性判断只跑一次）：

```js
// 工作区/隐私 → 场景模式（2026-07：一次性迁移，旧字段删除避免双源）
if(!Array.isArray(s.modes)){
  s.modes=[];
  const byPage=new Map();
  for(const g of (this.cfg.groups||[])){ if(g.page){ if(!byPage.has(g.page)) byPage.set(g.page,[]); byPage.get(g.page).push(g.id); } }
  for(const [name,ids] of byPage) s.modes.push({ id:uid('m'), name, groupIds:ids, hiddenWidgets:[], showFavs:true });
  if(s.privacy===true) s.activeMode='privacy';
  else if(s.activePage && s.activePage!=='全部'){ const m=s.modes.find(x=>x.name===s.activePage); s.activeMode=m?m.id:null; }
  else if(s.activeMode===undefined) s.activeMode=null;
  for(const g of (this.cfg.groups||[])) delete g.page;
  delete s.activePage; delete s.privacy;
}
```

- [ ] **1.3** 新方法区（放 favorites() 附近）按 Interfaces 实现六个方法；`deleteMode` 快照 `{idx, mode}`，undo 时 `splice(idx,0,mode)`+恢复 activeMode（若删除前正激活）。
- [ ] **1.4** `deleteGroup`（现有分组删除路径）联动：删除前记录 `affected=[{mode, hadAt:mode.groupIds.indexOf(gid)}]`，从所有 `mode.groupIds` 移除 gid；其 `_offerUndo` 快照的 restore 里连带 `affected.forEach(({mode,hadAt})=>mode.groupIds.splice(hadAt,0,gid))`。
- [ ] **1.5** 预览验证（DevTools console）：构造旧数据 `localStorage` 写入含 `g.page:'工作'`×2、`activePage:'工作'` 的配置 → 刷新 → `JSON.parse(localStorage.fn_config)` 断言：`settings.modes` 含名为「工作」的 mode 且 groupIds 对、`activeMode` 为其 id、所有 `g.page`/`activePage`/`privacy` 字段消失。**Exit: eval M-1**。
- [ ] **1.6** Commit：`feat: 场景模式数据层——settings.modes/activeMode 一次性迁移工作区与隐私旧字段+六个模式操作方法`

## Task 2：切换器 + 三层渲染过滤（M2）

**Files:** Modify `layouts/fusion.js`（44-47 过滤、62-63 modeBtn、97 derivePages 删除、99-107 modeTitle/openModeMenu、widgets 遍历、renderHome favs 区）

**Interfaces:** Consumes Task 1 六方法；`data-tour="mode"` 锚点挂在 modeBtn 上（Task 5 用）。

- [ ] **2.1** 过滤逻辑：`derivePages` 删除；侧栏与主区分组过滤改为：

```js
const am=core.activeModeObj();   // null | 'privacy' | mode对象
const inMode=g=> am===null ? true : (am==='privacy' ? false : am.groupIds.includes(g.id));
```

隐私分支沿用现渲染（只搜索/天气）；`settings.privacy` 的所有读取点改为 `core.settings.activeMode==='privacy'`（grep `settings.privacy` 清零）。
- [ ] **2.2** modeBtn：图标 `am==='privacy'?'eye':'layers'`；title：全部=「视图：全部收藏…」/模式=「模式：<名>…」/隐私沿用；`am!==null` 时加 `.on`；挂 `modeBtn.dataset.tour='mode'`。
- [ ] **2.3** openModeMenu 重写：

```js
const items=[{ic:'layout-grid', sel:am===null, label:'全部收藏', on:()=>core.setActiveMode(null)}];
core.modes().forEach(m=> items.push({ic:'layers', sel:am&&am.id===m.id, label:m.name, on:()=>core.setActiveMode(m.id)}));
items.push('-', {ic:'eye-off', sel:am==='privacy', label:'隐私模式（只留搜索/天气）', on:()=>core.setActiveMode('privacy')});
items.push('-', {ic:'settings-2', label:'管理模式…', on:()=>core.openModeManager()});
```

（`setActiveMode` 内部 save+rerender，菜单项 on 里不再重复。）
- [ ] **2.4** 小组件过滤：widgets 遍历处（`(core.settings.widgets||[]).forEach`）前置 `const hidden=(am&&am!=='privacy')?am.hiddenWidgets||[]:[]`，`if(hidden.includes(w.id)) return;`。
- [ ] **2.5** 常用区开关：renderHome favs 区块整体包 `if(!(am&&am!=='privacy'&&am.showFavs===false)){ …现渲染… }`。
- [ ] **2.6** 分组右键「所属模式」子菜单（替换 85-90 的移到工作区/新建工作区两项）：

```js
if(core.modes().length){ menu.push('-'); core.modes().forEach(m=>{ const has=m.groupIds.includes(group.id);
  menu.push({ic:'layers', sel:has, label:(has?'✓已在? no—用sel':'')+m.name, on:()=>{ core.toggleModeGroup(m,group.id); core.toast(has?('已移出「'+m.name+'」'):('已加入「'+m.name+'」'),'ok'); }}); }); }
menu.push({ic:'settings-2', label:'管理模式…', on:()=>core.openModeManager()});
```

（label 用纯模式名，选中态走 `sel:has`——showCtx 已支持 sel 勾选样式，**不要**在 label 里拼字符。）
- [ ] **2.7** 预览验证：建两个模式分别勾不同分组 → 切换器逐一切换：分组集合/小组件/常用区按配置变化且刷新持久；隐私仍只留搜索天气；`grep -n "settings.privacy\|activePage\|derivePages" layouts/ shared/` 仅剩迁移块命中。**Exit: eval M-2 / M-3**。
- [ ] **2.8** Commit：`feat: 场景模式切换器与三层渲染过滤（分组/小组件/常用区），分组右键改勾选式所属模式`

## Task 3：管理模式弹层（M3）

**Files:** Modify `shared/core.js`（新增 `openModeManager()`，设置→高级加入口）

**Interfaces:** Consumes Task 1 方法；Produces `core.openModeManager()`（Task 2 菜单已引用）。

- [ ] **3.1** `openModeManager()`（openModal 子弹层，结构照 openArchiveManager 的列表式先例）：
  - 列表视图：每模式一行（名称 + 「N 个分组」sub）+ 行内 `btn('编辑','ghost',…,'pencil')` + `btn('删除','ghost danger',…,'trash-2')`；底部 `btn('新建模式','primary',()=>this.promptModal('新建模式','模式名称，如 学习 / 工作 / 生活',n=>{ const m=this.createMode(n); this.openModeEditor(m); }),'plus')`。空态一句「还没有模式——新建一个，按场景定制首屏」。
  - 删除走 `deleteMode`（内含 undo toast），刷新列表。
- [ ] **3.2** `openModeEditor(mode)` 编辑子视图（同弹层内容替换或二级 openModal，返回按钮回列表）：
  - 名称：`inp`（onblur/保存时写 mode.name）
  - **分组勾选**：全部分组逐行 `this.toggle(g.name, mode.groupIds.includes(g.id), v=>this.toggleModeGroup(mode,g.id))`
  - **小组件勾选**：`(settings.widgets||[])` 逐行 `this.toggle(中文名(w.type), !mode.hiddenWidgets.includes(w.id), v=>this.toggleModeWidget(mode,w.id))`（类型中文映射：clock 时钟/weather 天气/today 今日/hwmon 硬件监控）
  - **常用区**：`this.toggle('显示常用区', mode.showFavs!==false, v=>this.setModeShowFavs(mode,v))`
  - 底部「完成」回列表视图。
- [ ] **3.3** 设置→高级：`btn('管理模式','ghost',()=>this.openModeManager(),'layers')`（放归档管理旁）。
- [ ] **3.4** 预览验证：管理弹层建「学习」→勾 2 分组→隐藏天气卡→关常用区→切到学习模式全部生效；改名生效；删除→undo toast 撤销→模式完整回来（groupIds/hiddenWidgets/showFavs 原样）；390 宽弹层不破版。**Exit: eval M-4 / M-5**。
- [ ] **3.5** Commit：`feat: 管理模式弹层——建/改/删(可撤销)+分组与小组件勾选+常用区开关，设置高级区入口`

## Task 4：tour v2 引擎——目标提升法 + 钩子（T1）

**Files:** Modify `shared/tour.js`（重写引擎）、`shared/base.css:240` 区（tour 样式替换）

**Interfaces:** Produces `startTour(core)`（签名不变）；步骤结构 `{sel, title, text, before?, cleanup?}`；CSS 类 `.fn-tour-mask/.fn-tour-hl/.fn-tour-elevated/.fn-tour-pop`（`.fn-tour-spot` 删除）。

- [ ] **4.1** 样式（base.css，替换现 240 行区）：

```css
.fn-tour-mask{position:fixed;inset:0;z-index:100;background:var(--scrim)}
.fn-tour-hl{position:relative!important;z-index:110!important;box-shadow:0 0 0 3px var(--accent)!important;border-radius:var(--r-sm)}
.fn-backdrop.fn-tour-elevated{z-index:105}
.fn-tour-pop{position:fixed;z-index:120;width:min(340px,calc(100vw - 32px));background:var(--overlay-bg);border:1px solid var(--border-2);border-radius:var(--r-lg);box-shadow:var(--shadow-lg);padding:var(--s4)}
.fn-tour-pop p{color:var(--text-2);margin:var(--s2) 0 var(--s3)}
.fn-tour-dots{display:flex;gap:6px;margin-bottom:var(--s3)}.fn-tour-dots i{width:6px;height:6px;border-radius:999px;background:var(--border-2)}.fn-tour-dots i.on{background:var(--accent)}
.fn-tour-pop button{min-height:32px;margin-right:var(--s2);padding:var(--s1) var(--s3);border-radius:var(--r-sm);background:var(--surface-2);color:var(--text)}
.fn-tour-next{background:var(--accent-strong)!important;color:#fff!important}
@media (prefers-reduced-motion:no-preference){
  .fn-tour-pop{animation:fnPop .14s ease}
  .fn-tour-hl{animation:fnTourPulse 1.6s ease-in-out infinite}
  @keyframes fnTourPulse{0%,100%{box-shadow:0 0 0 3px var(--accent)}50%{box-shadow:0 0 0 6px var(--ring)}}
}
```

- [ ] **4.2** 引擎重写（tour.js）：

```js
async function waitFor(sel, ms=3000){ const t0=Date.now(); while(Date.now()-t0<ms){ const n=document.querySelector(sel); if(n) return n; await new Promise(r=>setTimeout(r,120)); } return null; }
export function startTour(core){
  core.closeModal();                                   // 修 bug：从设置重看时先关设置弹窗
  document.querySelector('.fn-tour-mask')?.remove(); document.querySelectorAll('.fn-tour-hl').forEach(n=>n.classList.remove('fn-tour-hl'));
  document.querySelectorAll('.fn-tour-elevated').forEach(n=>n.classList.remove('fn-tour-elevated'));
  let i=0, cur=null;                                    // cur={el, step}
  const mask=el('div','fn-tour-mask'), pop=el('section','fn-tour-pop');
  const clearStep=async()=>{ if(cur){ cur.el?.classList.remove('fn-tour-hl'); cur.el?.closest('.fn-backdrop')?.classList.remove('fn-tour-elevated'); if(cur.step.cleanup) await cur.step.cleanup(core); cur=null; } };
  const done=async()=>{ await clearStep(); mask.remove(); pop.remove(); window.removeEventListener('resize',draw); document.removeEventListener('keydown',key); core.settings.onboarded=true; core.save(true); };
  const key=e=>{ if(e.key==='Escape') done(); };
  const draw=async()=>{ await clearStep(); const step=STEPS[i];
    if(step.before) await step.before(core);
    const target=step.sel ? await waitFor(step.sel) : null;
    if(step.sel && !target){ return advance(1); }        // 目标缺失→跳过该步不卡死
    if(target){ target.classList.add('fn-tour-hl'); target.closest('.fn-backdrop')?.classList.add('fn-tour-elevated'); }
    cur={el:target, step};
    pop.innerHTML=`<div class="fn-tour-dots">${STEPS.map((_,k)=>`<i class="${k===i?'on':''}"></i>`).join('')}</div><strong>${step.title}</strong><p>${step.text}</p><div><button class="fn-tour-prev"${i?'':' disabled'}>上一步</button><button class="fn-tour-skip">跳过</button><button class="fn-tour-next">${i===STEPS.length-1?'完成':'下一步'}</button></div>`;
    position(pop,target);                                // 无 target=居中
    pop.querySelector('.fn-tour-prev').onclick=()=>advance(-1);
    pop.querySelector('.fn-tour-skip').onclick=done;
    pop.querySelector('.fn-tour-next').onclick=()=>(i===STEPS.length-1)?done():advance(1); };
  const advance=async(d)=>{ i=Math.min(STEPS.length-1, Math.max(0, i+d)); await draw(); };
  mask.appendChild=null; document.body.append(mask,pop); window.addEventListener('resize',draw); document.addEventListener('keydown',key); draw(); }
```

（`position(pop,target)`：有 target 按 rect 四向智能放置且 clamp 视口 16px 内边距；无 target 居中。`el` 从 core.js import 或本地小助手——tour.js 现已自建 createElement，沿用其风格实现，**上述为语义骨架，落地时用文件现有工具函数**；`mask.appendChild=null` 为笔误示意，删除该行。）
- [ ] **4.3** 预览验证（改 tour.js 后重启预览进程）：正常 7 步（Task 5 前先用现 5 步表跑通引擎）步进/回退/Esc/完成；`.fn-tour-hl` 元素描边浮出遮罩（DevTools 查 computed z-index=110）；done 后无残留 class。**Exit: eval T-1 前半**。
- [ ] **4.4** Commit：`refactor: 引导引擎目标提升法重写——元素浮出遮罩+before/cleanup 钩子+目标缺失跳步不卡死`

## Task 5：7 步表 + 设置内引导 + bug 终验（T2）

**Files:** Modify `shared/tour.js`（STEPS 表）、`shared/core.js`（openSettings 给「同步与备份」sect 加锚 `data-tour="sync-sect"`；634 行重看入口无需再手动关弹窗——引擎已统一处理，确认即可）

- [ ] **5.1** STEPS 七步表：

```js
const STEPS=[
 {sel:'.fx-side',              title:'欢迎使用 Fu 导航', text:'左侧是分组导航：分组即页面，点击切换；常用操作也在这里。'},
 {sel:'.fx-ask',               title:'搜索与 AI',       text:'输入关键词回车即搜；点左侧图标可切换搜索引擎或 AI（Kimi/ChatGPT 等）。'},
 {sel:'[data-tour="lock"]',    title:'编辑锁',          text:'日常保持锁定防误改；解锁后才可拖拽排序、编辑与删除。'},
 {sel:'[data-tour="mode"]',    title:'场景模式',        text:'按场景切换首屏：全部 / 自定义模式（学习、工作…）/ 隐私。在这里也能进入模式管理。'},
 {sel:'[data-tour="settings"]',title:'设置入口',        text:'外观、常用区布局、归档与模式管理都在设置里。'},
 {sel:'[data-tour="sync-sect"]', title:'云同步与备份',  text:'WebDAV 自托管云备份/多历史备份/书签双向同步都在这一区。',
   before:async(core)=>{ core.openSettings(); const n=await waitFor('[data-tour="sync-sect"]'); n?.closest('details,.fn-sect,section')?.setAttribute('open',''); },
   cleanup:async(core)=>{ core.closeModal(); }},
 {sel:null,                    title:'开始使用吧',      text:'随时可在 设置 → 高级 → 重看新手引导 再次打开本引导。'},
];
```

（`sync-sect` 锚：openSettings 里「同步与备份」sect 的标题元素加 `dataset.tour='sync-sect'`；before 里展开折叠的实现按 sect() 实际 DOM 调整——读 core.js sect() 后落地，展开手段必须真实生效。）
- [ ] **5.2** 全链验证（重启预览进程）：
  1. 清 localStorage 首启自动引导 7 步全走：第 4 步高亮底部模式钮、第 6 步**设置弹窗自动打开且「同步与备份」区浮出遮罩带光圈**（弹窗整体可见不被压暗盖死）、离开第 6 步设置自动关、第 7 步居中结尾卡；
  2. **bug 复验**：完成引导后打开设置→高级→重看新手引导 → 设置弹窗自动关闭、第 1 步正常高亮侧栏（无弹窗遮挡）；
  3. 第 6 步中途 Esc → 设置弹窗被 cleanup 关闭、无 `.fn-tour-hl/.fn-tour-elevated` 残留（DevTools 断言 querySelectorAll 均 0）；
  4. DevTools 模拟 reduced-motion：无呼吸动画仍可完整走完；深浅双主题气泡可读。
  **Exit: eval T-1 / T-2 / T-3 全 true**。
- [ ] **5.3** Commit：`feat: 新手引导7步表——新增场景模式步+设置内云同步引导(弹窗内高亮)，修设置弹窗遮挡引导`

## 收尾：README + 回归 + 版本

- [ ] **6.1** README：「工作区与归档」章改「场景模式与归档」（模式=命名场景，多属分组、每模式小组件/常用区、管理入口）；新手引导描述更新（7 步、可引导设置内部）。
- [ ] **6.2** 整体回归（重启预览进程 + 清 localStorage）：六界面×双主题 console 无红错；旧数据迁移复验（构造 g.page 数据）；`grep -rn "settings.privacy\|activePage" shared/ layouts/ popup.js` 仅剩 migrate 迁移块；图标语言 grep 零新增。**Exit: eval G-1 / G-2 / E2E-1**。
- [ ] **6.3** manifest `3.22.0` + `python3 -m json.tool manifest.json` 通过。
- [ ] **6.4** eval 全量如实翻牌 → Commit `chore: 版本号 3.21.1 → 3.22.0（场景模式+引导v2）` → `git push origin main`。
- [ ] **6.5** 汇报：两工作包结论 + eval 通过率 + 遗留项。

---

## Self-Review（已核对）

- **Spec 覆盖**：M1-M7（数据/迁移/过滤/切换器/管理/右键/README）→ Task1/2/3/收尾；T1-T6（bug/提升法/钩子/7步/视觉/README）→ Task4/5/收尾；OUT 未混入。
- **接口一致**：`modes()/activeModeObj()/setActiveMode()/createMode()/deleteMode()/toggleModeGroup()/toggleModeWidget()/setModeShowFavs()/openModeManager()/openModeEditor()/waitFor()/data-tour="mode"/"sync-sect"` 全计划唯一。
- **占位符**：4.2 引擎为语义骨架并显式标注「用文件现有工具函数落地、笔误行删除」；5.1 before 的展开手段标注「读 sect() 实际 DOM 后落地」——均为明确的落地指令而非 TBD。
- **风险注记**：`.fn-tour-hl` 对 `position:fixed` 祖先内元素的 z-index 提升在本项目层级（root 内容无高 z 层）下成立；若个别目标自身有 transform 上下文导致光圈裁切，允许 fallback 给该步骤换更外层选择器（judgment call，记录在 PR）。
