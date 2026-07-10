# Fu 导航 · 第二轮优化 实现计划（W1-W8，codex 执行）

> **For agentic workers:** 本计划由 **codex** 在 `~/Projects/personal/Fu-Nav-Public` 逐任务执行。配套三件套：
> - Spec（建什么）：`docs/superpowers/specs/2026-07-10-round2-optimization-design.md`
> - 本 Plan（怎么建）：任务步骤用 `- [ ]` 勾选跟踪
> - **Eval（什么算建成）**：`docs/superpowers/evals/2026-07-10-round2-optimization-eval.md` —— 每个任务的 exit criteria 引用 eval 条目 id；**判据只增不删改，你只许把 passes 翻 true/false**，要改判据必须人确认。

**Goal:** 修 4 个体验硬伤（AI 搜索反馈/书签重复/备份覆盖/归档占位）+ 重设计常用区（frecency+锁定+网格规格）+ 壁纸源体系（11+2 源/自定义/频率）+ 新手引导 + 删除撤销。

**Architecture:** 纯 ES modules 零构建（改完刷新生效）；配置存 `chrome.storage.local`（唯一权威，v3.20.x 定版架构**勿动**——禁止引入任何"后台自动覆盖本地"路径，禁止 migrate 常驻补默认件，见 CLAUDE.md 犯错记录 2026-07-09）。视觉唯一事实源 `DESIGN.md`。

**Tech Stack:** Chrome/Edge MV3、Lucide 图标（`mico()`/lucide-mask）、IndexedDB（壁纸 Blob）、WebDAV（PROPFIND/PUT/DELETE）、`python3 -m http.server` 预览验证。

## Global Constraints（每个任务隐含遵守）

- 文档/commit/UI 文案一律**中文**；commit 前缀 `feat:/fix:/refactor:`，**每任务一个 commit**。
- **git 身份**：首次提交前执行 `git config user.name "JokerFuFu" && git config user.email "161151890+JokerFuFu@users.noreply.github.com"`（公开仓禁真实邮箱）。
- **无自动化测试**：验证=`python3 -m http.server 8000` 开 `newtab.html`（非扩展环境自动走 localStorage+seed）+ DevTools + grep；**换 JS/CSS 后必须重启预览浏览器进程**（模块缓存）。真机项（chrome.bookmarks/WebDAV/剪贴板焦点）在 `chrome://extensions` 加载已解压后验，eval 里已标注。
- **视觉铁律**：新 UI 先查 `DESIGN.md` 有无对应 token/组件；表单控件走 `core.toggle()/field()/seg()/btn(label,cls,on,ic)`；图标一律 `mico('lucide名')`，**零 emoji/文字符号**（grep 自查含 `innerHTML=`）；触控目标 ≥32px；磨砂玻璃仅 `body.bg-photo`；动效落 `prefers-reduced-motion` 守卫内；模态挂 body（`openModal`）。
- **数据铁律**：删除类操作 `save(true)` 立即落盘；删除登记 `this._tombstones`（W8 撤销时相应移除）；migrate 只做一次性迁移。
- 版本：全部任务完成后 manifest `3.20.1 → 3.21.0`（收尾节统一做，任务内不动版本）。
- 执行序：**Task 1(W6 书签去重) → 2(W5 备份) → 3(W3 常用区) → 4(W2 壁纸) → 5(W1 搜索) → 6(W4 归档) → 7(W8 撤销) → 8(W7 引导)**——先 bug 与数据安全，后功能增量；3/6/7 都动 core.js+fusion.js，顺序做无冲突。

---

## Task 0：前置

- [ ] `cd ~/Projects/personal/Fu-Nav-Public && git pull`；设置 noreply git 身份（见 Global Constraints）。
- [ ] 通读三件套 + `CLAUDE.md`（尤其犯错记录 2026-07-09 两条）+ `DESIGN.md` 的组件/token 节。
- [ ] 起基线预览：`python3 -m http.server 8000` → `localStorage.clear()` 后确认演示数据正常、console 无红错。

## Task 1：书签双向同步去重（W6）

**Files:** `shared/bmsync.js`（ensureRoot/reconcileInto/导出主流程）、`background.js`（SW 侧 reconcile 调用处，约 76 行附近）

**Interfaces:** 对外 API（`bmExport/bmImport/rootSignature`）签名不变；新增模块内 `acquireBmLock()/releaseBmLock()`。

- [ ] **1.1** `ensureRoot()` 幂等化：`chrome.bookmarks.search({title:ROOT_TITLE})` 过滤出**书签栏直下**的同名文件夹；>1 个时按 `dateAdded` 保留最早的，其余逐个 `removeTree`（根内容是导航配置镜像，删除安全；真源在配置）。console.info 记录清理数量。
- [ ] **1.2** 跨上下文导出互斥：`acquireBmLock()`——读 `chrome.storage.local` 的 `bm_lock`，若存在且 `Date.now()-ts<30000` 返回 false（跳过本轮）；否则写 `{ts:Date.now(),owner:'newtab'|'sw'}` 返回 true。`bmExport` 入口拿锁、`finally` 释放（`remove('bm_lock')`）。同上下文再加 in-flight Promise 复用：`let _exporting=null; if(_exporting) return _exporting; _exporting=run().finally(()=>_exporting=null);`
- [ ] **1.3** `reconcileInto` 收尾清扫：处理完 items 后重新 `getChildren(parentId)`，对 `k.url` 子节点按 `normUrl` 分组，每组保留第一个、其余 `remove`；对无 url 子文件夹按 title 分组同理（保留第一个，其余 `removeTree`）。
- [ ] **1.4** `background.js` SW 侧 reconcile 调用改为同样先 `acquireBmLock`，拿不到就 return（newtab 优先）。
- [ ] **1.5** 真机验证（加载已解压 + 开书签同步）：手工把「Fu 导航」根整个复制一份、组内复制两条书签 → 触发一次导出（导航里任意增删一条）→ 书签栏收敛为单根、无重复条目。**Exit: eval W6-1 / W6-2 / W6-3 全 true**。
- [ ] **1.6** Commit：`fix: 书签双向同步去重——ensureRoot幂等+跨上下文导出互斥锁+对齐后同层清扫（修重复书签）`

## Task 2：WebDAV 多备份（W5）

**Files:** `shared/cloud.js`（新增 list/put-backup/delete + 保留清理）、`shared/core.js`（`openCloudEditor` 约 505-547 行：立即备份/从云恢复两个按钮的行为与恢复选择弹层）

**Interfaces:** cloud.js 新增导出：`cloudPutBackup(settings,cfg)`（写 `fu-nav-backup-YYYYMMDD-HHmmss.json` + 清理留 10 份）、`cloudListBackups(settings)`（PROPFIND Depth:1 → `[{name,size,mtime,url}]` 按名倒序，含固定文件在首位）、`cloudGetFile(settings,name)`。自动备份 `cloudPut`（固定文件）**签名与行为不变**。

- [ ] **2.1** `cloudPutBackup`：文件名 `fu-nav-backup-`+`new Date()` 格式化 `YYYYMMDD-HHmmss`+`.json`，PUT 到 `davUrl` 同目录；成功后调清理。
- [ ] **2.2** `cloudListBackups`：`PROPFIND`（`Depth:1`，body 可为空）解析 multistatus XML（`DOMParser`，取 `href`/`getcontentlength`/`getlastmodified`），过滤 `fu-nav-backup-*.json` + `fu-nav-config.json`；解析失败（部分 WebDAV 实现差异）返回 `{ok:false}`。
- [ ] **2.3** 保留清理：list 成功后 backup 类按文件名倒序，第 11 个起逐个 `DELETE`；任一删除失败静默跳过（下次再清）。
- [ ] **2.4** GDrive 分支不动（`cl.type==='gdrive'` 时立即备份仍走旧 `cloudPut` 单文件，恢复不出列表）。
- [ ] **2.5** `openCloudEditor` UI：「立即备份到云」→ WebDAV 时改调 `cloudPutBackup`，状态行显示新文件名；「从云恢复」→ 先 `cloudListBackups`，成功则弹选择子层（`openModal` 列表：文件名+时间+大小，单选+「恢复此份」danger 按钮+confirm），失败回退旧行为（直接恢复固定文件，状态行注明「无法列目录，已恢复自动备份」）。hint 补一句多备份说明。
- [ ] **2.6** 真机验证（真实 WebDAV）：备份两次 → 目录出现两个时间戳文件且 `fu-nav-config.json` 未变；伪造 11 个 backup 文件 → 再备份后只剩 10；从列表选旧份恢复成功。**Exit: eval W5-1 / W5-2 / W5-3 全 true**。
- [ ] **2.7** Commit：`feat: WebDAV手动备份生成时间戳新文件+保留最近10份+从云恢复可选任意备份`

## Task 3：常用区重设计（W3，最大任务）

**Files:** `shared/core.js`（favorites/recordVisit/migrate/openSettings 常用区）、`layouts/fusion.js`（157-198 行常用渲染 + moreFav 删除 + 锁角标）、`layouts/fusion.css`（网格列变量 + 锁角标样式，先补 `DESIGN.md` 若无对应 token）

**Interfaces:** `favorites()` 返回结构不变（`[{item,group,folder?}]`），内部排序改 frecency；新增 `core.favGrid()`→`{cols,rows}`（读 `settings.favGrid`，默认 `{cols:8,rows:2}`）；`settings.favGrid` 持久化。

- [ ] **3.1** frecency 数据层：`recordVisit(item)` 改为——`const now=Date.now(), HALF=7*864e5; item.freq=(item.freq||0)*Math.pow(0.5,(now-(item.lastVisit||now))/HALF)+1; item.lastVisit=now; item.clicks=(item.clicks||0)+1; this.save(true);`（clicks 保留作展示/迁移兜底；**save(true) 立即落盘修 D10**）。
- [ ] **3.2** migrate 一次性初始化：`if(it.freq===undefined && it.clicks>0) it.freq=it.clicks;`（递归全条目；仅缺失时赋值，**不做常驻兜底**）。
- [ ] **3.3** `favorites()` 重写：`const {cols,rows}=this.favGrid(); const cap=cols*rows;` 锁定段=`favOrder` 序的 `fav===true` 条目 + 未入 favOrder 的其余 `fav===true`；自动段=其余 `fav!==false` 且 `freq>0` 按「衰减到当下的 freq」降序（`f=(it.freq||0)*Math.pow(0.5,(now-(it.lastVisit||now))/HALF)`）；兜底「常用」分组逻辑保留在最后补位；每项标记 `pinned:true|false` 供渲染；截断 `cap`。
- [ ] **3.4** 网格规格：`settings.favGrid` 默认 `{cols:8,rows:2}`；`openSettings`「常用」区加「常用区布局」field，`seg([['6x2','6×2'],['8x2','8×2'],['6x3','6×3'],['8x3','8×3']],…)` 切换即 `save()`+`rerender()`。fusion.js 渲染处 `row.style.setProperty('--fav-cols',cols)`；fusion.css `.fx-favs{grid-template-columns:repeat(var(--fav-cols,8),minmax(0,1fr))}`（沿用现有卡片尺寸 token；`@media 760` 下强制降为 4 列不破版）。
- [ ] **3.5** 删除「更多常用」：fusion.js `moreFavCard`/`moreFavPanelEl`/`visible/hidden 切分`（157-198）整段移除，渲染全部 `favorites()`；fusion.css 相关 `.fx-morefav*` 样式删除。`grep -rn "moreFav\|更多常用" layouts/ shared/` 零命中。
- [ ] **3.6** 锁定视觉：`pinned` 项卡片右上角 `mico('pin',10)` 角标（新样式 `.fx-fav-pin`，用 `--text-3` 色、不抢视觉）；右键菜单/编辑弹层动作文案统一「锁定到常用/取消锁定」（改现有 pinFavorite/unfavorite 的 label）；锁定段内拖拽排序沿用 favOrder 机制，自动段卡片**不可拖**（dragstart 里 `pinned===false` 时 preventDefault）。
- [ ] **3.7** 预览验证：清 localStorage → 默认 8×2；连点某站 5 次刷新 → 它进自动段前排；右键另一站「锁定」→ 带 pin 角标排锁定段；设置切 6×3 → 网格即变；390 宽（DevTools 模拟）不破版；grep 更多常用零残留。**Exit: eval W3-1…W3-5 全 true**。
- [ ] **3.8** Commit：`feat: 常用区重设计——锁定段+frecency自动段/网格规格自选(6×2~8×3)/删更多常用/访问计数立即落盘`

## Task 4：壁纸源体系（W2）

**Files:** `shared/background.js`（源表+惰性刷新）、`shared/core.js`（背景面板 UI：源列表/自定义源/频率）、`data/seed.json` 不动

**Interfaces:** 源表导出 `ONLINE_SOURCES=[{id,name,group,desc,endpoint}]`；`settings.background.onlineSrc={id}` 或 `{id:'custom',url}`；`settings.background.refreshEvery`（分钟，0=仅手动）；存储侧记录 `lastFetchAt`（随图存 IndexedDB 元数据或 settings.background.lastFetchAt，选后者简单）。

- [ ] **4.1** 源表：bing-daily（现有逻辑保留）+ alcy 11 分类（id 与路径一一对应：ycy/moez/ai/ysz/pc/moe/fj/bd/ys/acg/mp，name 用文档页中文名，group 分「二次元/摄影/其他」）+ picsum（`https://picsum.photos/1920/1080`）。**逐一 curl 实测**（`curl -sIL -m 8 <endpoint> | grep -i "content-type\|HTTP/"`，期待 image/* 或 30x→image）；不通的源仍收录但 desc 标注「暂不可用」并在 PR 记录；/acg desc 标「测试源」。动漫类默认=ycy（`DEFAULT` 常量同步改）。
- [ ] **4.2** 惰性自动刷新：`applyBackground` 在线模式分支里——`const re=(s.background.refreshEvery||0)*60000; if(re && Date.now()-(s.background.lastFetchAt||0)>re){ 先渲染缓存图，然后后台 refreshOnlineBackground(当前源)（成功后更新 lastFetchAt 并 save()；失败静默） }`。手动「换一张」也更新 `lastFetchAt`。
- [ ] **4.3** 背景面板 UI（core.js 背景设置区）：① 源列表按 group 分节渲染（当前源高亮，点选=写 `onlineSrc`+立即 `refreshOnlineBackground`）；② 「自定义源」行：URL 输入 + 「使用」按钮——点击后先 `ensureCloudPermission(url)`，再试拉一张（走现有下载管线校验 Content-Type image/* 或跟随重定向后为图），成功才写 `{id:'custom',url}` 并落盘，失败 `toast('该地址未返回图片，请检查','err')` 不落盘；③ 「更新频率」field：`seg` 预设（仅手动/15分/1时/12时/1天/7天）+ 「自定义」选项弹出分钟数输入（`this.inp`，>0 整数校验）。
- [ ] **4.4** 预览验证：源列表分组齐全 13+ 项、当前高亮；预览环境切源可换图（预览无 chrome 权限 API，`ensureCloudPermission` 已有非扩展兜底返回 true——确认不抛错）；自定义源填 `https://picsum.photos/1200/800` 成功、填 `https://example.com` 报错不落盘；频率选 15 分钟 → 手改 `lastFetchAt` 为 20 分钟前 → 刷新页面触发后台拉新（Network 面板见请求）→ 再刷新显示新图。**Exit: eval W2-1…W2-4 全 true**。
- [ ] **4.5** Commit：`feat: 壁纸源体系——alcy全11分类+Picsum内置/自定义源校验落盘/自动更新频率(惰性触发)`

## Task 5：AI 搜索词直达与反馈（W1）

**Files:** `shared/core.js`（PROVIDERS 36-46、ask() 410-421）

- [ ] **5.1** 真机逐家实测（加载已解压，地址栏手测）：`https://www.kimi.com/?q=测试`、豆包/DeepSeek 各自官网带 `?q=`/`#q=` 等常见 prefill 形态，看输入框是否自动填入。把结论写成 PROVIDERS 表内注释 + PR 描述（`日期+实测行为`）。
- [ ] **5.2** 支持直填的：PROVIDERS 对应项加 `q:'…?q='` 模板并删 `copy:true`。仍不支持的保留 copy 路径。
- [ ] **5.3** ask() copy 分支补反馈：`if(copied && tgt!=='_self') this.toast('问题已复制，到 '+p.name+' 粘贴发送即可','ok');`（`_self` 打开时页面即将被替换，toast 无意义故跳过；`copied===false` 时 toast `'复制失败，请手动输入'` err 类）。
- [ ] **5.4** 预览验证：Kimi 搜「测试问题」→ 新标签开 kimi 主页 + 原页面出现复制提示 toast；Bing/ChatGPT 等 q 类不出多余 toast。**Exit: eval W1-1 / W1-2 true**。
- [ ] **5.5** Commit：`fix: AI搜索词反馈——copy类provider复制后明确提示(+实测各家prefill支持并更新模板)`

## Task 6：归档移出侧栏（W4）

**Files:** `layouts/fusion.js`（47-48 行侧栏归档区 + buildArchiveSection 函数与样式）、`shared/core.js`（openSettings 高级区 + 新 `openArchiveManager()` + openPalette 搜索源）

- [ ] **6.1** fusion.js：删侧栏 `buildArchiveSection` 调用与函数体、fusion.css 相关 `.fx-arch*` 样式；`grep -n "arch" layouts/fusion.js layouts/fusion.css` 确认仅剩 `g.archived` 过滤逻辑。
- [ ] **6.2** `openArchiveManager()`（照 `openHwmonEditor` 子弹层模式）：列出 `groups.filter(g=>g.archived)` 每行「名称 · N 个网站」+ `btn('取消归档','ghost',…,'archive-restore')` + `btn('进入','ghost',…,'arrow-right')`（进入=关弹层+切该分组页）；空态一句「没有归档的分组」。openSettings「高级」区加 `btn('归档管理','ghost',()=>this.openArchiveManager(),'archive')`。
- [ ] **6.3** openPalette：分组搜索源包含 archived 分组，结果行加「已归档」sub 标注（`.fn-pal-sub` 既有样式），回车正常跳转分组页。
- [ ] **6.4** 预览验证：归档一个分组 → 侧栏消失；⌘K 搜其名 → 带「已归档」可直达；设置→高级→归档管理可取消归档回侧栏。**Exit: eval W4-1 / W4-2 true**。
- [ ] **6.5** Commit：`feat: 归档移出侧栏——设置·归档管理子弹层+命令面板可搜直达`

## Task 7：删除撤销（W8）

**Files:** `shared/core.js`（toast 扩展 + 四类删除路径挂快照）、`layouts/fusion.js`（文件夹删除路径若在此）

**Interfaces:** `toast(msg,kind,action)`——`action={label:'撤销',run:Function}` 可选；带 action 或 kind==='err' 时停留 5000ms（否则 2600ms 不变）。新增 `core._undoSnap`（仅存最近一次）与 `core._offerUndo(desc,restoreFn)`。

- [ ] **7.1** toast 扩展：action 存在时渲染 `.fn-toast-act` 按钮（`btn` 样式复用 ghost、≥32px 命中区），点击执行 `run()` 并立即移除该 toast；`err` 类时长同步提至 5000（R8 遗留）。
- [ ] **7.2** `_offerUndo(desc,restore)`：`this._undoSnap={restore}; this.toast('已删除 '+desc,'ok',{label:'撤销',run:()=>{ const s=this._undoSnap; this._undoSnap=null; if(s){ s.restore(); this.save(true); this.rerender(); } }});`
- [ ] **7.3** 四类删除接入（删除前构造快照闭包，记录父数组引用+index+对象+涉及的 tombstone id 列表；restore=splice 回原位 + `ids.forEach(id=>this._tombstones.delete(id))`）：
  - `deleteItem`（网站/文件夹）：`_removeItem` 前先定位 `{arr,idx}`（改 `_removeItem` 返回位置或先用 `findIndex` 递归定位）；desc=item.name。
  - 分组删除（openGroupEditor foot，约 486 行）：快照=`{groups 数组, idx, group}`；desc=`group.name+'（'+条目数+' 个网站）'`。
  - `removeWidget`：快照=widgets 数组+idx+w；desc=类型中文名。
  - popup 侧不做（范围外，popup 有已收藏徽标可重加）。
- [ ] **7.4** 预览验证：删网站/删文件夹（含子项）/删分组/删小组件 → 各出现带「撤销」toast → 点撤销全部原位恢复（文件夹内条目回原文件夹原 index）→ 刷新不复活不丢；不点撤销 5s 后 toast 消失、刷新确认删除持久。**Exit: eval W8-1 / W8-2 / W8-3 全 true**。
- [ ] **7.5** Commit：`feat: 删除撤销——四类删除5秒undo toast(快照原位恢复+墓碑回退)，err类toast延至5s`

## Task 8：新手引导（W7）

**Files:** Create `shared/tour.js`；Modify `shared/base.css`（tour 样式，token 化）、`shared/core.js`（boot 触发 + 设置入口）

**Interfaces:** `tour.js` 导出 `startTour(core)`；`settings.onboarded:boolean`。

- [ ] **8.1** `tour.js`：步骤表 `[{sel,title,text,pos}]` 5 步（侧栏 `.fx-side`、搜索框 `.fx-ask`、锁定钮（title 含「锁定/解锁」的 sideBtn，加 `data-tour="lock"` 锚点更稳）、工具栏收藏（无页面元素，气泡定位视口右上 `pos:'toolbar'`）、设置钮 `data-tour="settings"`）。实现：全屏遮罩 `.fn-tour-mask`（`position:fixed;inset:0`）+ 高亮=目标元素 `getBoundingClientRect` 的镂空框（独立 `.fn-tour-spot` 用 `box-shadow:0 0 0 9999px var(--scrim)` 挖洞法）+ 气泡卡 `.fn-tour-pop`（标题/正文/步点/上一步/下一步/跳过，`--overlay-bg` 底、`--shadow-lg`，按目标位置上下翻转，390 宽内收边距）；`Esc`=跳过；窗口 resize 重定位。**动效（气泡淡入/spot 过渡）写在 `@media (prefers-reduced-motion:no-preference)` 内**。
- [ ] **8.2** 触发：core.js boot 里加载 seed（`!config`）且 `settings.onboarded!==true` → `mountLayout` 完成后 `import('./tour.js').then(m=>m.startTour(this))`；完成/跳过回调置 `settings.onboarded=true; save(true)`。设置→高级加 `btn('重看新手引导','ghost',()=>startTour(this),'graduation-cap')`（动态 import 同路径）。
- [ ] **8.3** 预览验证：`localStorage.clear()` 刷新 → 自动进入 5 步引导，步进/上一步/跳过/Esc 正常，气泡不出屏；完成后刷新不再出现；设置可重看；深浅双主题 + DevTools reduced-motion 模拟下正常。**Exit: eval W7-1 / W7-2 true**。
- [ ] **8.4** Commit：`feat: 新手引导——首启5步自绘tour(遮罩挖洞+气泡)，设置可重看，reduced-motion守卫`

## 收尾：整体回归 + 版本 + 推送

- [ ] **9.1** 整体回归（重启预览进程 + `localStorage.clear()`）：首页/分组页/文件夹页/设置(含新子弹层×3)/命令面板/popup 深浅双主题各过一遍；console 无红错；`grep -rnE "textContent *=.*['\"][▸✓⠿☰＋↗«»↵⚠☁🔖🔒🔓]|innerHTML *=.*[▸✓⠿☰＋↗«»↵⚠☁🔖🔒🔓]" shared/ layouts/ popup.js | grep -v mico` 零新增。
- [ ] **9.2** manifest `version` → `3.21.0`；`python3 -m json.tool manifest.json` 通过。
- [ ] **9.3** 过一遍 eval 文件：所有条目 `passes` 如实翻牌（真机项没条件验的**保持 false 并在 PR 注明待验**，不许假翻）；端到端条目 E2E-1/E2E-2 实际走完。
- [ ] **9.4** Commit `chore: 版本号 3.20.1 → 3.21.0（第二轮优化 W1-W8）` + `git push origin main`。
- [ ] **9.5** 汇报：每工作包一句话结论 + eval 通过率 + 待真机项清单。

---

## Self-Review（写计划时已核对）

- **Spec 覆盖**：W1→T5、W2(含 11 源/自定义/频率)→T4、W3(frecency/规格/删更多常用/D10)→T3、W4→T6、W5→T2、W6→T1、W7→T8、W8(含 R8 toast 时长)→T7；spec OUT/CUT 未混入。
- **无占位符**：每步有锚点/数据结构/公式/验证命令；frecency 公式、锁超时 30s、保留 10 份、refreshEvery 语义均为确切值。
- **命名一致**：`favGrid()/ONLINE_SOURCES/cloudPutBackup/cloudListBackups/acquireBmLock/_offerUndo/startTour/onboarded` 全计划唯一；`toast(msg,kind,action)` 第三参在 T7 定义、其余任务不依赖。
- **与既有架构一致**：不新增后台自动覆盖路径（W2 惰性刷新只写壁纸 IndexedDB 与 lastFetchAt，不碰配置合并；W5 恢复走既有 cloudRestore 用户手动确认）。
