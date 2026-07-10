# Fu 导航 · 第二轮优化（9 条需求 + 删除撤销）Product Spec

日期：2026-07-10 ｜ 状态：设计已获用户批准 ｜ 执行：**codex 开发**（配套 plan + eval 三件套）

## 0. 决策记录（brainstorm 已确认）

| 决策点 | 结论 |
|---|---|
| 常用区排序 | **frecency**（点击 × 时间衰减，半衰期 7 天）；锁定段 + 自动段两段式 |
| 常用区规格 | **用户自选网格**（仿 Infinity）：6×2 / 8×2 / 6×3 / 8×3，`settings.favGrid={cols,rows}` |
| 「更多常用」 | **删除**，按所选规格全部直接展示 |
| 归档入口 | **设置→高级「归档管理」子弹层 + 命令面板可搜直达**；侧栏彻底移除归档区 |
| WebDAV 备份 | 手动备份**新文件**（时间戳命名），**保留最近 10 份**自动清理；自动备份仍写固定文件 |
| 动漫壁纸默认源 | **t.alcy.cc/ycy（二次元自适应）**；且 alcy **全部 11 个分类全收录**为内置源（用户提供文档页截图确认）：/ycy 二次元自适应、/moez 萌版自适应、/ai AI自适应、/ysz 原神自适应、/pc PC横图、/moe 萌版横图、/fj 风景横图、/bd 白底横图、/ys 原神横图、/acg ACG动图（站方标注测试中）、/mp 移动竖图 |
| 壁纸更新频率 | **可自定义**（用户追加）：仅手动（默认，保持现状）/ 15 分钟 / 1 小时 / 12 小时 / 1 天 / 7 天 / 自定义分钟数；惰性触发（打开新标签页时检查超期→后台拉新图，下次打开生效，零闪烁） |
| 补充功能 | 仅采纳**删除撤销 undo toast**（本地自动快照本轮不做） |
| 执行模式 | codex 在 `Fu-Nav-Public` 开发；本机验收。**eval 判据只增不删，codex 只许翻 passes** |

## 1. 问题

首发 + 一轮打磨后产品可用，但日常高频路径仍有 9 处硬伤（用户实测反馈）：AI 搜索无反馈像丢词（Kimi/豆包/DeepSeek）；壁纸源少且不可自定义；常用区被固定项占死、不随使用习惯流动、还藏进无意义的「更多常用」折叠；没有位置锁定概念；新用户无引导；WebDAV 手动备份覆盖唯一文件（误备份=丢历史）；归档占侧栏；书签双向同步产生重复书签。另有误删无后悔药的长期隐患。

## 2. 假设

把「每天摸的路径」（搜索、常用区、壁纸）做顺滑，用户打开新标签页的次数会自然增长；把「数据操作」（备份、同步、删除）做可靠且可后悔，用户才敢把全部书签托付进来。机制：高频路径的顺滑决定粘性，数据可靠性决定信任上限。

## 3. 范围

### IN —— 8 个工作包

**W1 · AI 搜索词直达与反馈**（需求1）
- 现状：`shared/core.js` `ask()`（约 410-421 行）对 `copy:true` 的 provider（kimi/doubao/deepseek）已做**同步剪贴板复制**（`copyTextSync`，规避 window.open 抢焦点导致异步复制失败），但复制后**零提示**，用户感知为"搜索词丢了"。
- 改动：① codex 实现时**逐家实测** kimi.com / doubao.com / chat.deepseek.com 当前是否支持 URL 预填参数（如 `?q=`），支持的改为 `q:` 模板直填并去掉 `copy:true`；② 仍不支持的保留同步复制，但 `window.open` 前必须 `toast('问题已复制，到 ' + p.name + ' 粘贴发送即可','ok')`；③ PROVIDERS 表每项的实测结果写进 PR 描述。

**W2 · 壁纸源扩展 + 自定义源 + 自动更新频率**（需求2 + 用户追加）
- 现状：`shared/background.js` 在线源共 3 个（bing 每日、alcy `/moe` 动漫、alcy `/fj` 风光），源表硬编码（约 66-80 行），已有"下载成 Blob 存 IndexedDB"管线；换图仅手动点「换一张」。
- 改动：
  1. 源表扩充为 **bing 每日 + alcy 全 11 分类 + Picsum**（≥13 个）：alcy 按决策记录全收录（id/名称/endpoint 一一对应文档页），动漫默认源=`/ycy`；Picsum=`https://picsum.photos/1920/1080`；codex 逐一实测（GET 返回 image/* 或 30x 到图）后收录，/acg 站方标注"测试中"，实测不稳则收录但描述标注「测试源」。
  2. 背景设置面板源**列表化**（分组展示：每日精选/二次元/摄影/其他），当前源高亮，点选即切换并立刻拉一张。
  3. **自定义源**：输入任意 URL（GET 返回图片或重定向到图片），保存时经 `ensureCloudPermission` 申请该域授权，走同一下载管线；保存前校验一次，非图响应给明确错误提示且不落盘。
  4. **自动更新频率**：`settings.background.refreshEvery`（分钟，0=仅手动默认）；预设档 15 分钟/1 小时/12 小时/1 天/7 天 + 自定义分钟输入；**惰性触发**——新标签页加载时若 `now - lastFetchAt > refreshEvery` 则本次仍显示缓存图、后台拉新图存 IndexedDB，下次打开生效（零闪烁、无需 SW 定时器）；拉取失败静默保留旧图，下次再试。
- 数据：`settings.background.onlineSrc` 扩展为 `{id}` 或 `{id:'custom', url}`；新增 `settings.background.refreshEvery`（number，分钟）与存储侧 `lastFetchAt` 时间戳。

**W3 · 常用区重设计**（需求3/4/5 合一，最大工作包）
- 现状：`shared/core.js` `favorites()`（约 272-285 行）优先级 favOrder→fav===true→clicks 累计→「常用」兜底分组，上限 12；`layouts/fusion.js` 157-160 行超 8 个折入 `moreFavCard`。固定项占满前排导致"常用固定不变"；纯累计 clicks 无新近度；`recordVisit`（core.js:422）防抖保存，`openIn=_self` 时计数随导航丢失（审计 D10）。
- 改动：
  1. **两段式**：锁定段=`fav===true`（favOrder 定序，卡片右上角小锁角标 `mico('pin')` 或 lock，编辑态可拖拽），自动段=其余按 **frecency** 降序填满剩余格。
  2. **frecency**：`item.freq`（衰减累计分）+ `item.lastVisit`。每次访问：`freq = freq * 0.5^((now-lastVisit)/7d) + 1`；排序读取时同样先衰减到当前时刻再比较。旧数据迁移：`freq` 缺失时用 `clicks` 一次性初始化（migrate 里做，**一次性迁移允许**，禁止常驻兜底——见 CLAUDE.md 2026-07-09 铁律）。
  3. **网格规格**：`settings.favGrid={cols:8,rows:2}`（默认 8×2）；设置「常用」区加规格选择（6×2/8×2/6×3/8×3 四档 seg 或 2×2 预览选择器）；`favorites()` 上限 = cols×rows；CSS 网格列数随 cols（`grid-template-columns:repeat(var(--fav-cols),…)`，390 宽媒体查询下自动降列）。
  4. **删除** `moreFavCard`/`moreFavPanelEl` 及其样式。
  5. `recordVisit` 改 `save(true)` 立即落盘（修 D10；本机 local 写入廉价，frecency 依赖计数可靠）。
  6. 右键/编辑弹层动作文案统一为「锁定到常用 / 取消锁定」（复用现有 pinFavorite/unfavorite）。

**W4 · 归档移出侧栏**（需求8）
- 现状：`layouts/fusion.js:47-48` 侧栏渲染 `buildArchiveSection`。
- 改动：① 侧栏不再渲染归档区（`buildArchiveSection` 及样式删除）；② 设置→高级新增「归档管理」按钮→子弹层（照 `openHwmonEditor` 模式）：列出归档分组（名称/条目数），每行「取消归档」与「进入」按钮；③ 命令面板搜索结果包含归档分组，标注「已归档」徽标，回车跳转其分组页（mount active 守卫已支持任意分组 id，无需改）；④ 分组编辑/右键的「归档」入口保留。

**W5 · WebDAV 多备份**（需求7）
- 现状：`shared/cloud.js` 固定 `FILE='fu-nav-config.json'`，手动/自动备份同一文件互相覆盖。
- 改动：① 手动「立即备份到云」→ 写 `fu-nav-backup-YYYYMMDD-HHmmss.json`（新文件）；成功后 PROPFIND（Depth:1）列目录，`fu-nav-backup-*.json` 按名倒序保留 10 份，多余 DELETE；② 自动备份（cloudPush 防抖）不变，仍写固定 `fu-nav-config.json`；③ 「从云恢复」改为弹层列出固定文件 + 全部备份文件（文件名解析时间显示 + Content-Length 大小），单选恢复；④ PROPFIND/DELETE 失败的降级：列不出目录时回退恢复固定文件（老行为），清理失败静默（下次再清）；⑤ Google Drive 路径保持单文件不变（UI 上 GDrive 模式隐藏备份列表，说明文案注明）。

**W6 · 书签双向同步去重**（需求9）
- 现状与根因：`shared/bmsync.js` 单次 `reconcileInto` 按 normUrl 匹配无懈可击，但：(a) `ensureRoot` 不幂等——历史多上下文并发在书签栏创建过**多个同名「Fu 导航」根**，此后每次同步只维护其一，其余整树残留=用户看到的双份；(b) SW（background.js reconcile）与新标签页 bmPush 可并发，`getChildren` 读后各自 `create` 造成同层重复；(c) 无重复清扫。
- 改动：① `ensureRoot` 幂等化：查到多个同名根时保留最早创建的、**其余整树删除**（根内容是导航配置的镜像，删除安全，真源在配置）；② 导出互斥：同上下文 in-flight Promise 复用 + 跨上下文 `chrome.storage.local` 锁 `bm_lock={ts,owner}`（30s 超时自动接管），拿不到锁的一方跳过本轮（下轮通知自然补）；③ `reconcileInto` 收尾对每层子节点按 normUrl 清扫重复（保留第一个）；④ 修完后首次同步自动收敛存量重复（eval 有端到端判据）。

**W7 · 新手引导**（需求6）
- 自绘轻量 tour，零依赖：全屏遮罩 + 目标元素高亮（大 `box-shadow` 挖洞法）+ 气泡卡（标题/一句话/上一步/下一步/跳过，步进圆点）。
- 5 步：① 侧栏（分组即页面，点击切换）→ ② 搜索框（左侧下拉切搜索引擎与 AI）→ ③ 锁定钮（解锁后可拖拽/编辑/删除）→ ④ 工具栏扩展图标（收藏当前页，气泡指向视口右上方向即可）→ ⑤ 设置（同步与备份都在这）。
- 触发：boot 加载 seed（全新用户）且 `settings.onboarded!==true` → 首屏渲染后自动开始；完成/跳过后置 `onboarded=true` 落盘。设置→高级加「重看新手引导」。
- 约束：样式全走 DESIGN.md token（双主题可读），动效落在全局 `prefers-reduced-motion` 守卫内；气泡按目标元素位置自动上下翻转，390 宽可用。

**W8 · 删除撤销**（补充采纳）
- 范围：网站条目、文件夹、分组、小组件四类删除路径（`deleteItem`/分组编辑弹层删除/`removeWidget`/文件夹删除）。
- 交互：删除立即生效并落盘，同时 toast「已删除 ×××」+「撤销」按钮，5 秒窗口；点撤销→按快照放回原位置（父数组+index）→ 落盘 → `_tombstones` 移除相应 id（防收件箱/采纳路径误杀复活的合法恢复）。
- 实现：`toast(msg,kind,action?)` 扩展 action 参数（带 action 的 toast 停留 5s）；删除前构造 `{restore()=>…}` 快照闭包，仅保留最近一次删除的快照（新删除顶掉旧的）。顺带把 `err` 类 toast 停留时长也提到 5s（审计 R8 遗留）。

### OUT（明确不做）
- 本地自动快照/回滚（用户未采纳）；Google Drive 多备份；书签同步的「导入方向」重构（仅修导出重复与根幂等）；tour 的多语言。

### CUT（刻意取舍）
- frecency 不引入完整访问历史表（只存 freq+lastVisit 两字段，增量衰减，足够且零膨胀）。
- 自定义壁纸源不做源健康巡检，仅保存时校验一次（失败有明确报错，用户自查）。
- 撤销只保留最近一次删除（多级撤销栈不做）。

## 4. 用户体验（关键动线）

- 问 Kimi：输入问题回车 → Kimi 打开 + toast「问题已复制，粘贴发送即可」→ 粘贴即问（若实测已支持直填则完全无感直达）。
- 常用区：新用户默认 8×2；常点的站两三天内自动浮到自动段前排；右键任意卡「锁定到常用」→ 带锁角标固定在锁定段，拖拽排序；设置里一键切 6×3 等规格。
- 误删分组：toast「已删除 工作·公司（34 个网站）· 撤销」→ 5 秒内点撤销完整回来。
- 手动备份：设置→云同步→立即备份 → 云端多出一个带时间戳的新文件；恢复时从列表挑任意历史备份。
- 新用户：装上第一屏自动开始 5 步引导，跳过后不再打扰。

## 5. 验收标准（意图层；执行层判据见 eval 文件，判据只增不删）

1. **W1**：三家 copy 类 AI 搜索后，用户能明确知道词在哪（直填进输入框，或 toast 明示已复制）；PR 附逐家实测结论。
2. **W2**：内置源 ≥13 个（bing + alcy 全 11 分类 + Picsum）且逐一实测可出图，动漫默认=/ycy；自定义源输入合法 URL 可换源成功、非图 URL 有明确报错不落盘；更新频率各档可选，超期后打开新标签页会后台换图、未超期不换。
3. **W3**：锁定段/自动段视觉可区分；频繁点击某站 → 重启后它在自动段位置前移；规格四档切换即时生效且 390 宽不破版；「更多常用」代码与样式零残留。
4. **W4**：侧栏无归档区；归档管理子弹层可取消归档；命令面板可搜到归档分组并直达。
5. **W5**：手动备份两次 → 云端两个时间戳文件且固定文件未被覆盖；备份 >10 份自动清到 10；恢复列表可选任意一份恢复成功。
6. **W6**：人工制造双份「Fu 导航」根 + 组内重复书签 → 跑一次同步全部收敛为单份；开两个新标签页同时触发导出不产生重复。
7. **W7**：清空数据首启自动出 5 步引导，跳过/完成后重启不再出现；设置可重看；双主题+reduced-motion 下正常。
8. **W8**：四类删除均出现带撤销 toast；5 秒内撤销完整恢复（含文件夹内条目回原文件夹原位置）；撤销后刷新不复活不丢失。
9. **全局**：`python3 -m http.server` 预览全流程 console 无红错；深浅双主题过 6 界面无破版；grep 无 emoji/文字符号新增图标。

## 6. 成功指标（上线后观察）

- 自己与早期用户的新标签页停留使用频次上升（常用区流动是否符合直觉的主观确认）。
- 不再出现「书签重复」「备份被覆盖」类反馈；出现「误删救回来了」的正反馈。
- 新 issue 里"怎么用"类问题减少（引导生效信号）。

## 附录 · 工作包 → 文件锚点速查（基于 v3.20.1）

| 包 | 主要文件 | 关键锚点 |
|---|---|---|
| W1 | shared/core.js | PROVIDERS(36-46)、ask()(410-421)、copyTextSync |
| W2 | shared/background.js、shared/core.js(背景面板) | 源表(66-80)、下载管线注释(83)、ensureCloudPermission |
| W3 | shared/core.js、layouts/fusion.js、layouts/fusion.css | favorites()(272-285)、recordVisit(422)、moreFav(157-198)、migrate |
| W4 | layouts/fusion.js、shared/core.js | buildArchiveSection(47)、openSettings 高级区、openPalette(318-360) |
| W5 | shared/cloud.js、shared/core.js(云弹层) | FILE(9)、davUrl(15)、openCloudEditor(约 505-547) |
| W6 | shared/bmsync.js、background.js | ensureRoot(约 38-42)、reconcileInto(55-80)、SW reconcile(background.js:76 附近) |
| W7 | 新建 shared/tour.js + base.css 增量 | boot 触发点(core.js:60-75)、buildModalHost 模式参考 |
| W8 | shared/core.js、layouts/fusion.js | toast(626)、deleteItem/removeWidget/分组删除(486)、_tombstones |
