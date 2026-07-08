# Fu 导航 · 开源后质量打磨（第一轮）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:executing-plans 逐工作包执行本计划（单会话、用户在旁做检查点）。步骤用 `- [ ]` 复选框跟踪。
>
> **本计划由 macmini 上的 claude 会话直接执行**：在 `Fu-Nav-Public` 的本地 clone 里改代码、自测、每工作包一个 commit 到 `main`；不派发、不开 PR。执行顺序 = Task 1→2→3→4→5（即 spec 建议序 ①包1→②包4→③包2→④包3→⑤包5）。

**Goal:** 把 Fu 导航从「合法开源」打磨到「陌生人打开即用」——修掉毁第一印象的 P0、设置页繁琐、UI 局部脱管、一个确定性删除 bug（spec 方案 B）。

**Architecture:** 纯 ES modules 无构建，改完刷新即生效。5 个内聚工作包各一个 commit；单会话顺序执行，`core.js` 无并行冲突。视觉唯一事实源是 `DESIGN.md`，工作纪律见 `CLAUDE.md`。Spec：`docs/superpowers/specs/2026-07-08-quality-polish-round1-design.md`（含 48 条审计明细附录，本计划按 ID 引用）。

**Tech Stack:** Chrome/Edge MV3 扩展、Lucide 图标（`mico()`/lucide-mask）、`python3 -m http.server` 预览验证、`gh`/`git`。

## Global Constraints（每个 Task 隐含遵守，值逐字取自 spec 与 CLAUDE.md）

- 文档/commit/UI 文案一律**中文**；品牌名保留「Fu 导航」；**无构建步骤**，改完刷新生效。
- **无自动化测试**：验证一律用 `python3 -m http.server 8000` 打开 `newtab.html`（非扩展环境自动走 localStorage + `data/seed.json`）+ `grep` + `python3 -m json.tool`。**无头预览有模块缓存，换 JS/CSS 后必须重启浏览器进程再看，不能只 reload。**
- **视觉改动先查 `DESIGN.md`** 有无对应 token/组件规则；没有先补 `DESIGN.md` 再写代码，不凭感觉造数值。改完一处视觉规则，去这几处搜同类旧写法：`renderHome`/`renderGroup`/`renderFolderPage`(fusion.js)、`openSettings`/`openItemEditor`/`openGroupEditor`(core.js)、`showCtx`、`openPalette`、`popup.html/css`。
- 表单控件走自定义样式（`core.toggle()`/`field()`/`seg()`），不用浏览器原生外观。
- **图标零文字符号/emoji**：一律 `mico('lucide名')` 或 lucide-mask；自查 grep 要同时查 `textContent=` 和 `innerHTML=`（历史上 `↵` 用 innerHTML 逃过 textContent grep）。
- `backdrop-filter` 磨砂玻璃只在 `body.bg-photo`；阴影只在 hover/浮层且走 `var(--shadow)`/`var(--shadow-lg)` token。
- 模态挂 `body`（`buildModalHost`/`openModal`），复用 `fx-*` 样式的容器要补 `lay-fusion` class。
- 触控目标 ≥32px 是硬条；裸 `<button>` 命中区=视觉尺寸，没 padding/伪元素扩热区就得直接 ≥32。
- commit 用中文 + `feat:/fix:/docs:/refactor:` 前缀，**每工作包一个 commit 到 `main`**；作者身份用仓库已配的 GitHub noreply。
- **推送时机**：5 个工作包全部完成且本地预览整体通过（收尾节）后**统一 `git push origin main`**，不中途推。

---

## Task 0：执行前置（macmini）

- [ ] **0.1** 确认在 `Fu-Nav-Public` 的 clone 里、拿到最新计划与 spec

```bash
cd <你机器上的 Fu-Nav-Public>    # 若无：git clone https://github.com/JokerFuFu/Fu-Nav-Page.git Fu-Nav-Public
git switch main && git pull
ls docs/superpowers/specs/2026-07-08-quality-polish-round1-design.md   # 应存在
git remote -v | grep origin       # 应指向 JokerFuFu/Fu-Nav-Page
```

- [ ] **0.2** 起预览，确认基线可用

```bash
python3 -m http.server 8000
```

浏览器开 `http://localhost:8000/newtab.html`，先 `localStorage.clear()` 再刷新 → 应渲染演示数据、console 无红错。这是改动前的基线。

---

## Task 1：演示与信任修复（spec 工作包 1；条目 R1/R2/R3/R4/R10/R11/R12）

**Files:** `data/seed.json`、`manifest.json`、`README.md`、`agent/README.md`

**背景:** 首屏摆着一张连不上的硬件监控卡（R1，毁第一印象）；manifest 带代码已不用的 `hitokoto` 权限（R3，伤"权限逐条如实"信任）；README 把 macOS 专属服务写成通用（R2）等文档不符。全是低风险文档/配置改动。

- [ ] **1.1** `data/seed.json`：删除 `settings.widgets` 数组里的硬件监控卡 `{"id":"w-hw1","type":"hwmon",...}` 整个对象（保留 clock/weather/today 三个）。
- [ ] **1.2** 验证 seed：`grep -c "w-hw1" data/seed.json`（预期 0）、`python3 -m json.tool data/seed.json >/dev/null && echo OK`。
- [ ] **1.3** `manifest.json`：`host_permissions` 删掉 `"https://v1.hitokoto.cn/*"` 这一行（连同前一行尾逗号处理好，保持 JSON 合法）。
- [ ] **1.4** `manifest.json:5` `description`：把开头「个人浏览器首页导航」改为「浏览器首页导航」（去掉「个人」二字，其余描述不动）。
- [ ] **1.5** `README.md`：① §🔒隐私 上方权限/host 说明里删除 `v1.hitokoto.cn`（一言）那一行（R3）；② §🔌本机小组件 与 ✨功能里伴随服务提及处补「（目前仅 macOS）」（R2）；③ §✨「内网在线状态…确认在线才亮绿点」改为「内网在线状态：best-effort 探测，装伴随服务后为真实在线状态」（R4）；④ §✨「内置上百个常用服务/homelab 图标」改为「内置近百个（96 个）常用服务/homelab 图标」（R10）；⑤ §🗂结构 里 `background.js` 注释区分——根目录 `background.js` 是 MV3 Service Worker，`shared/background.js` 是壁纸模块，别混（R11/R12）。
- [ ] **1.6** `manifest.json` JSON 合法性：`python3 -m json.tool manifest.json >/dev/null && echo OK`。
- [ ] **1.7** 敏感/文案自查：`grep -nE "hitokoto|个人浏览器" manifest.json README.md`（预期仅 README 里可能剩历史无关命中，hitokoto 应 0）。
- [ ] **1.8** 预览验证：重启浏览器进程 → `localStorage.clear()` 刷新 → **首屏不再出现硬件监控卡/「连接失败」**、其余演示数据正常、console 无红错。
- [ ] **1.9** 提交

```bash
git add data/seed.json manifest.json README.md agent/README.md
git commit -m "fix: 演示与信任修复——移除首屏报错监控卡/删废弃hitokoto权限/README补macOS标注与措辞订正"
```

## Task 2：popup + 图标语言收编（spec 工作包 4；U1/U2/U4/U5/U6/U7/U9/U10/U11/U12/R6）

**Files:** `popup.css`、`popup.js`、`layouts/fusion.js`、`shared/core.js`（仅文案）、`shared/base.css`、`layouts/fusion.css`

**背景:** `popup.css` 整个绕过 token 系统（第二强调色/硬编码绿/脱栅格）；一批文字符号/emoji 当图标散落各处。对照 `DESIGN.md` 收编。**先读 `DESIGN.md` 的颜色/圆角/间距/图标语言小节。**

- [ ] **2.1** `popup.css:6` `.pop-logo`：去掉第二强调色 `#9b6ef3`（渐变改纯 `var(--accent)` 或直接用 `icons/icon32.png` 的 `<img>`），字重 `800`→`≤750`（用 `var` 或 700），裸 `border-radius:8px`→`var(--r-sm)`。（U1）
- [ ] **2.2** `popup.css:14` `.pop-status.ok`：`color:#22c55e`→`color:var(--ok)`。（U4）
- [ ] **2.3** `popup.css:4-15`：把 `padding:18px…`/`gap:14px/10px`/`.pop-foot .fn-btn padding:11px`/`.pop-loading padding:40px` 归到 8px 栅格（用 `var(--s*)` 或 8 的倍数：18→16、14→12、10→8/12、11→12、40→40 可留）；`letter-spacing:.2px`（popup.css:7）去掉。（U6/U12）
- [ ] **2.4** `layouts/fusion.js` 文字符号图标改 `mico()`：`:434` `'▸ '+r.focus`→`mico('chevron-right')`+文本；`:267` `fx-provitem-ck` 的 `'✓'`→`mico('check')`；`:314` `fx-wgrip` 的 `'⠿'`→`mico('grip-vertical')`；`:491/:505` 失效标 `'!'`→`mico('alert-triangle')`。面包屑 `'›'`(:465) **保留**为排版分隔符（审计认可，非图标）。（U2/U9）
- [ ] **2.5** `shared/core.js` 文案去 glyph/emoji：`:139/:160` flashSync 的 `'✓ 已同步'`/`'⚠ 配置过大'`/`'☁ 已备份'` 去掉前缀符号（或换 lucide-mask，纯状态文字亦可）；`:514-516` 云状态 `'✗ '`/`'✓ '`→纯文字（「失败：」/「成功：」）；`:495` hint 里 `'☁️'`、`:519` `'🔖'`→lucide-mask 或删；`:385` 命令面板脚注 `↵`→`mico('corner-down-left')`（`↑↓` 作方向键提示保留）。（U10/R6）
- [ ] **2.6** `popup.js:144/:146`：状态文案里的 `✓`/`✗` 前缀同样去符号或走 mico（与 2.5 口径一致）。（R6）
- [ ] **2.7** `layouts/fusion.js:56-57`：编辑锁 tooltip/toast 里的 `🔒🔓✎✕` 改纯文字（如「编辑模式」/「已锁定」）或 mico，不留 emoji。（R6）
- [ ] **2.8** 顺手碎值：`fusion.css:84,100,229` `border-radius:6px`→`var(--r-sm)`（U5）；`fusion.css:86` 已失效的 `font-size:9px` 规则删除（U12）；`base.css:89,111,131` 三处 `rgba(6,9,18,.5x)` 遮罩 → 在 `DESIGN.md` 补一个 `--scrim`（深/浅各一）token 并改用之（U7）；`base.css:229` `.fn-pill` 的 `backdrop-filter:blur(10px)` 用 `body.bg-photo .fn-pill{…}` 包起来，非背景图模式回退不透明 `var(--surface-2)`（U11）。
- [ ] **2.9** 图标零漏网自查（同时查两种赋值）：

```bash
grep -rnE "textContent *=.*['\"].*[▸✓⠿☰＋↗«»↵⚠☁🔖🔒🔓]|innerHTML *=.*[▸✓⠿☰＋↗«»↵⚠☁🔖🔒🔓🔖]" popup.js shared/ layouts/ | grep -v mico
```

预期：只剩有意保留项（面包屑 `›`、方向键 `↑↓`）。其余为 0。

- [ ] **2.10** `DESIGN.md` lint（若动了 token）：`npx @google/design.md lint DESIGN.md`（预期 0 errors）。
- [ ] **2.11** 预览验证：重启浏览器进程 → 点扩展弹窗 `popup.html`（预览下直接开 `http://localhost:8000/popup.html`）确认 logo 单色/成功态绿=`--ok`；首页命令面板脚注、provider 勾选、widget 拖柄、失效角标均为 lucide 图标不是字符。
- [ ] **2.12** 提交

```bash
git add popup.css popup.js layouts/fusion.js layouts/fusion.css shared/base.css shared/core.js DESIGN.md
git commit -m "fix: UI一致性收编——popup收进token/图标语言零漏网/scrim与fn-pill磨砂令牌化"
```

## Task 3：递归 bug 家族（spec 工作包 2；D1/D9，顺手 D6/D12）

**Files:** `shared/core.js`

**背景:** 删除/移动条目用了只扫分组顶层 `items` 的非递归查找，文件夹内条目永远匹配不到 → 「删了没删掉」「拖了没拖动」还静默假装成功。项目已有递归实现 `deleteItem`/`_removeItem`/`findItemById` 可复用。

- [ ] **3.1** 先读 `shared/core.js` 里现有的 `deleteItem`、`_removeItem`、`findItemById`（或等价递归方法），确认签名与返回值。
- [ ] **3.2** `core.js:431` 编辑弹层「删除」按钮：把内联的 `this.groups.find(x=>x.items.includes(item))` 非递归删除，改为调用已有递归实现 `this.deleteItem(item)`（与卡片悬停 ✕ 走同一条路径）。（D1）
- [ ] **3.3** `core.js:247` `moveItemToGroup(iid,toGid)`：把 `g.items.find(x=>x.id===iid)` 只扫顶层，改为用递归 `findItemById`/`_removeItem` 先在任意层级定位并摘出，再 push 到目标分组。（D9）
- [ ] **3.4** 全库找同源「只扫顶层」写法并逐一评估：

```bash
grep -nE "\.items\.(includes|find|indexOf|filter)\(" shared/core.js layouts/fusion.js
```

对每处判断：操作对象是否可能在文件夹内？是则改递归定位。列出判断结果（改了哪几处、哪几处确认无需改）。
- [ ] **3.5** 顺手（◐，低成本防御）：`core.js:566-568` `importConfig` 在 `this.cfg=d` 前加 `if(!Array.isArray(d.groups)) throw 0;` 守卫（D6）；`core.js:428-429` 编辑保存前 `const tg=…find(...); if(!tg){ this.toast('目标分组已不存在','err'); return; }`（D12）。
- [ ] **3.6** 预览复现验证（改动前后对比）：
  1. 解锁🔓 → 建一个分组 → 组内建文件夹 → 文件夹内加一个网站；
  2. 进文件夹页 → 悬停该网站 ✎ 编辑 → 弹层点「删除」→ **条目真消失**（不是弹层关了但还在）；
  3. 文件夹内拖一张卡片到侧栏另一分组 → **真移动 + 出现 toast**。
  录屏或截图放 commit 描述。
- [ ] **3.7** 提交

```bash
git add shared/core.js
git commit -m "fix: 递归bug家族——文件夹内条目删除/移动改走递归定位（修复删了没删掉/拖了没动）"
```

## Task 4：设置页信息架构重构（spec 工作包 3；S1-S8，顺手 S9/S10/S11/S12）

**Files:** `shared/core.js`（`openSettings` 重组 + 新增 `openCloudEditor`/`openBmEditor` 子弹层）、`shared/core.js` 的 `openPalette`（接收失效链接检测）

**背景:** `openSettings` 单函数~74 行、把日常开关和一次性重配平铺、云同步一展开满屏术语。目标：常用/高级分层 + 云/书签同步收成「摘要+按钮→子弹层」，照抄已有 `openHwmonEditor`(core.js:473) 的子弹层模式。**先读 `openSettings`(479-553) 全段、`openHwmonEditor`、`sect/field/toggle/btn/seg` 辅助方法、`openPalette`(288-326)。**

- [ ] **4.1** 新增 `openCloudEditor()`：把 `openSettings` 现有云同步 UI（约 497-518 的 `clUrl/clUser/clPass/clCid/typeSeg/davBox/gdBox/clBtns/clStatus/clHint/showByType`）整体迁入新方法，用 `this.openModal('云同步',[…],[关闭,保存])` 弹出（结构照 `openHwmonEditor`）。保存逻辑（`applyCl` + `ensureCloudPermission`）随之搬入。
- [ ] **4.2** 新增 `openBmEditor()`：把书签双向同步 UI（约 520-528 的 `bmToggle/bmBtns/bmStatus/bmHint`）迁入新子弹层，同样 `openModal('浏览器书签同步',…)`。
- [ ] **4.3** 重组 `openSettings` 的 `openModal('设置',[…])` 分区为三层：
  - **`sect('常用', […], true)`**（默认展开）：标题 `titleI`、主题 seg、强调色 `accentGrid`、以及从原「卡片」区移来的三个 toggle（显示时钟/显示天气/内网在线状态探测，S2/S11）。
  - **`sect('同步与备份', […])`**：云同步=一行摘要（如「未配置 / 已启用 WebDAV」）+ `btn('设置云同步','ghost',()=>this.openCloudEditor(),'cloud')`；书签同步=摘要 + `btn('设置书签同步',…,()=>this.openBmEditor(),'bookmark')`；导出/导入备份两个按钮（S1/S4/S7）。
  - **`sect('高级', […])`**：打开方式 seg（S9 从常用降级到此）、`btn('恢复默认','ghost',…,'rotate-ccw')` 单独作 danger 动作隔离（S7）。
- [ ] **4.4** 删死控件与冗余：① 删掉「搜索引擎」`engSel` 及其 field 与「完成」按钮里的 `s.searchEngine=engSel.value`（S3；先确认首页搜索走 `fusion.js:281` 的 `activeProvider()`，与 `s.searchEngine` 无关）；② 删「导入 Infinity 备份」独立按钮，`importConfig` 已能嗅探 `.infinity`，在「导入备份」hint 补「支持 Infinity 备份」（S5）；③ 把「立即检测失效链接」从设置移到命令面板——在 `openPalette` 的 actions（约 301-312，与导出/导入备份并列）新增一项 `{ic:'link',label:'检测失效链接',run:async()=>{…checkLinksNow…}}`（S6）；④ 设置里的主题 seg 保留作规范入口，不再新增主题入口（S8）。
- [ ] **4.5** 顺手（◐/P2，均在本函数内）：云同步子弹层里让「启用」开关驱动字段显隐（S10）；抽 `syncActionRow(buttons,status)` 供云/书签按钮行复用（S12，可选）。
- [ ] **4.6** 确认设置面板控件仍走自定义样式（`toggle()`/`seg()`），无原生 checkbox/select 外观；新子弹层挂 `body`（`openModal` 已处理），无需补 class。
- [ ] **4.7** 预览验证：重启浏览器进程 → 打开设置：① 「常用」区默认展开、日常项一屏可见；② 「同步与备份」里云同步是**摘要+按钮**，点按钮弹出独立子弹层且 WebDAV/GDrive 配置在里面；③ 设置里**无**「搜索引擎」下拉；④ 命令面板（⌘K）能搜到「检测失效链接」；⑤ 主题/强调色即时生效。console 无红错。
- [ ] **4.8** 提交

```bash
git add shared/core.js
git commit -m "refactor: 设置页信息架构重构——常用/高级分层+云与书签同步收进子弹层+删搜索引擎死控件与Infinity冗余"
```

## Task 5：触控目标 + 空状态 + 配额提示（spec 工作包 5；U3/U8/R5/D2，顺手 D11）

**Files:** `layouts/fusion.css`、`layouts/fusion.js`、`shared/storage.js`、`shared/core.js`

**背景:** 一批可见按钮 <32px 硬条；清空数据后空首页零引导；超 `chrome.storage.sync` 配额时静默停同步却假报「已保存」。

- [ ] **5.1** `fusion.css:290` `.fx-vbtn`（视图切换钮，每个分组/文件夹页常驻）`30px`→`32px`；`fusion.css:17` `.fx-collapse` `24px`→`32px`（或加 padding 把命中区扩到 ≥32）。（U3）
- [ ] **5.2** `fusion.css:203/:207/:125` 编辑态 hover 微钮 `.fx-cact-btn`/`.fx-wdel`/`.fx-wgrip`（20px）：加 padding 或伪元素热区，命中 ≥32px（视觉 glyph 可仍小）。（U8）
- [ ] **5.3** `fusion.js:147-164` `renderHome`：`favs.length===0` 时渲染一句轻量空态引导（文案如「还没有常用网站 —— 解锁🔓后点 ＋ 添加，或到 设置 → 导入浏览器书签」，**注意按 Global Constraints 不带 emoji，用 `mico('plus')` 或纯文字**）；空侧栏（无分组）同理给「＋ 新建分组」提示。（R5）
- [ ] **5.4** `shared/storage.js:71-88` + `shared/core.js:139` 超配额提示：`saveConfig` 返回 `{synced:false,reason:'quota'}` 时，`save()` 的分支要识别 `reason==='quota'` 并 `this.toast('配置过大，已仅存本机（跨端同步暂停）','err')`，不再落到 `else` 报「✓ 已保存」。（D2）
- [ ] **5.5** 顺手（◐）：`fusion.js:352-356` 倒数日 `const days=Math.round((tgt-today)/864e5)`，前面加 `if(isNaN(tgt)){…跳过或显示「日期无效」…}` 守卫，避免渲染字面「NaN」。（D11）
- [ ] **5.6** 预览验证：① `preview_inspect`/DevTools 量 `.fx-vbtn`/`.fx-collapse` 命中区 ≥32px；② 清空所有分组/常用 → 首页与侧栏出现引导文案；③ 配额提示为真机项〔待真机验证〕：预览环境（localStorage）测不出，代码走查确认 `reason==='quota'` 分支文案正确即可。
- [ ] **5.7** 提交

```bash
git add layouts/fusion.css layouts/fusion.js shared/storage.js shared/core.js
git commit -m "fix: 触控目标≥32px+空首页/侧栏引导+超配额明确提示（不再假报已保存）"
```

## 收尾：整体验证 + 推送

- [ ] **6.1** 五包 commit 齐了，`git log --oneline -6` 核对 5 个工作包提交都在 `main`。
- [ ] **6.2** 整体回归（重启浏览器进程，`localStorage.clear()` 后逐一走）：**首页 / 分组页 / 文件夹二级页 / 设置（三层+两个子弹层）/ 命令面板 / popup**，各在**深色与浅色**两主题下过一遍——无报错卡、无文字符号/emoji 图标、无 <32px、无 console 红错。
- [ ] **6.3** 最终自查：

```bash
grep -rnE "w-hw1|v1\.hitokoto|#9b6ef3|#22c55e" data/seed.json manifest.json popup.css   # 预期全 0
grep -rn "个人浏览器" manifest.json                                                       # 预期 0
python3 -m json.tool data/seed.json >/dev/null && python3 -m json.tool manifest.json >/dev/null && echo "JSON OK"
```

- [ ] **6.4** 统一推送公开仓

```bash
git push origin main
```

- [ ] **6.5** 回报用户：5 个工作包完成、整体回归结论、公开仓 commit 范围。若任一验证不过：定位到对应工作包修复、重跑该包验证，再进收尾。

---

## Self-Review（写计划时已核对）

- **spec 覆盖**：B 范围 IN 的 5 工作包 + 全部 P0（R1/S3/D1/S1/S2）+ 全部 P1（D2/S4-S8/U1-U4/R2-R5）+ 递归家族（D9）逐条落到 Task 步骤；OUT 9 条未纳入（正确）；◐ 三条（D6/D11/D12）作顺手步骤且标注。
- **无占位符**：每步给了 `file:line` + 目标值 + 验证命令；子弹层给了迁移骨架（照 `openHwmonEditor`）。
- **命名一致**：`deleteItem`/`_removeItem`/`findItemById`/`openCloudEditor`/`openBmEditor`/`openHwmonEditor`/`activeProvider`/`saveConfig` 全计划一致；`mico()` 为既有图标辅助。
- **执行序**：Task 1→5 = spec 建议序 ①包1→②包4→③包2→④包3→⑤包5，`core.js`（Task 3/4/5）顺序改无冲突。
