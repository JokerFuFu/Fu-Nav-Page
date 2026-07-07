# Fu 导航 · 项目行为准则

给 Claude/AI 编码助手看的项目专属规则。全局通用的编码习惯不重复写，只写这个项目会踩的坑。
视觉/样式的唯一事实源是 `DESIGN.md`（长什么样）；本文件管「怎么干活」（做错事/漏做事）。

## 视觉改动铁律

- 新增/修改任何 UI，先查 `DESIGN.md` 有没有对应 token/组件规则；没有就先补 `DESIGN.md` 再写代码，不要凭感觉现造数值。
- **改动不能只覆盖首页**。首页(`renderHome`)之外，至少要过一遍：分组页(`renderGroup`)、文件夹页(`renderFolderPage`)、设置弹层(`openSettings`)、添加/编辑表单(`openItemEditor`/`openGroupEditor`)、右键菜单(`showCtx`)、命令面板(`openPalette`)、工具栏弹窗(`popup.html`)。改完一处视觉规则，去这几个地方搜一下有没有同类旧写法没跟上。
- 表单控件（checkbox/toggle/select/date）统一用自定义样式（见 DESIGN.md 的 `toggle`/`checkbox` 组件），不用浏览器原生外观。布尔设置项一律走 `core.toggle()`，不要自己拼 `<input type=checkbox>`。
- `backdrop-filter` 磨砂玻璃只在 `body.bg-photo`（背景图模式）场景允许；阴影只在 hover/浮层（DESIGN.md Elevation 节）。
- 模态/弹层挂在 `body` 下（`buildModalHost`），**不在 `.lay-fusion` 里**——要复用 `fx-*` 样式须给容器补 `lay-fusion` class（v3.10 文件夹弹层踩过）。

## 工程纪律

- 本项目**没有自动化测试**。改完用 `python3 -m http.server 8000` + 打开 `newtab.html` 手动验证；`shared/storage.js` 非扩展环境自动走 localStorage + `data/seed.json`，不用打桩 chrome API。
- 只在真实扩展环境（`chrome://extensions` 加载已解压）才能测：书签双向同步(`chrome.bookmarks`)、跨域授权(`chrome.permissions`)、本机 agent 的 LNA 行为——预览服务器测不出。
- 无构建步骤：纯 ES modules，改完刷新即生效；但无头预览有模块缓存，换 JS/CSS 后要**重启**预览浏览器进程再截图，不能只 reload。
- `codex-image-runs/`、`/*.png` 已 gitignore，不要手动提交截图/出图产物。
- 提交信息用中文、`feat:/fix:/docs:/chore:` 前缀，一类改动一笔提交。

## 犯错记录（错误沉淀法：每收敛一类问题在此追加一行，避免再犯）

<!-- 格式：日期 + 一句话规则 + 出处 -->
- 2026-06-30 `el(tag,cls,text)` 第三参是 textContent——含 `<b>` 等标签的提示要用 `innerHTML`，否则标签原样显示。
- 2026-07-01 click 触发的菜单按钮会冒泡到 `document` 的 `click→hideCtx` 把菜单秒关——打开菜单的 handler 首行必须 `e.stopPropagation()`（右键 contextmenu 无此问题）。
- 2026-07-01 `mount()` 里的 active 校验守卫要枚举**所有**合法 active 值（分组 id/文件夹 id/home/…），新增页面类型时同步更新，否则刷新后被重置回 home。
- 2026-07-02 `<input>/<select>/<textarea>` 不继承字体，新表单控件要确认 `font-family:inherit` 已覆盖（base.css 已加全局规则，别再单独造字体声明）。
- 2026-07-02 `targetAddressSpace` 枚举：127.0.0.1 是 `loopback` 不是 `local`，声明错直接 Failed to fetch——本机/内网 fetch 一律走 `shared/agent.js` 的 `localFetch` 级联，不要手写该选项。
- 2026-07-02 `<input>` 上 `::before/::after` 不生效——自定义 checkbox 的 ✓、开关的圆钮要用 `background-image` SVG data-URI 画（见 base.css 自定义控件区）。
- 2026-07-02 `.fn-field input/select` 用了 `background:` 简写——低特异性规则里的 `background-image`（如 select 的 ▾）会被它的隐式 `none` 压掉，装饰图规则要用同级选择器（`select, .fn-field select`）。
- 2026-07-02 菜单项/工具条按钮不要写 emoji 前缀当图标——`showCtx` 菜单项用 `{ic:'lucide名', label:'纯文字'}`、选中态用 `sel:true`，工具条用 `gbtn('lucide名',…)`；新增菜单/按钮先照这个走（DESIGN.md 图标语言 Don't）。
- 2026-07-02 布局改动必须过 390 宽：双列表单行(`.fn-row`)要 `flex-wrap + flex-basis + min-width:0`（input 固有宽会撑破模态）；侧栏这类桌面纵向结构在 `@media 760` 里要显式重排（footer 整行/收折钮隐藏、navitem 改内联 chips），否则要么浮到诡异位置、要么占满整个首屏。
- 2026-07-02 严格评审用强模型(Fable)比宽松模型(Opus)多抓出真问题——收敛判定的 dry round 要用严格模型跑，别被宽松模型的满分误导为达标。
- 2026-07-02 浮层阴影必须走**主题化 token**：小浮层(菜单/下拉)用 `var(--shadow)`、大浮层(模态/命令面板/iframe/背景面板)用 `var(--shadow-lg)`；两档都有深/浅两套值——硬编码 `0 28px 80px rgba(0,0,0,.55)` 会在浅色留重黑晕(grep `box-shadow:0 [12]` 自查,焦点环 `0 0 0` 除外)。
- 2026-07-02 浅色主题白圆钮(toggle)压在浅轨道上几乎不可辨——`--sw-knob` SVG 加 `feDropShadow` 柔和投影,双主题都能分辨钮位;数字计数类元素(含命令面板 `.fn-pal-sub`)都要 `font-variant-numeric:tabular-nums`。
- 2026-07-02 大浮层底色不要 `background:var(--bg)` + `[data-theme=light]{background:#fff}` 硬编码——`auto` 浅色路径会回落 `--bg=#fafafb` 与显式浅色 `#fff` 分叉。统一走 `--overlay-bg`(深/浅镜像 token,三个主题块都定义),模态/命令面板/iframe/toast/搜索下拉共用。
- 2026-07-02 触控目标 ≥32px 是硬条(DESIGN Layout)：`.fn-x` 关闭钮、`.fn-colorpick` 色点、`.fn-seg button` 分段都曾 27-30px 被 Fable 抓;裸 `<button>` 命中区=视觉尺寸,没有 padding/伪元素扩热区就得直接 ≥32。
- 2026-07-02 实现组件时要**逐字段对照 DESIGN.md 的 YAML**（背景档位/圆角档最易错）：本轮 field(surface→surface-raised)、button(md→sm 圆角)、ghost/seg 底、toggle 轨道、右键菜单(bg→surface-overlay)五处错档一次纠正。新组件写完 grep 一遍 `var(--surface` 和 `--r-` 与规范核对。
- 2026-07-02 文字符号（✕ ▾ ▦ ≣ ☰ ＋ ↗ ▸ « » ↵）当图标与 emoji 同罪——已全部换 `mico('lucide名')`/lucide-mask。grep 自查除 `textContent=` 外还要查 `innerHTML=`（发送钮 `↵` 用 `innerHTML='&#8629;'` 曾逃过 textContent grep，被 Fable 严格评审抓出）。
- 2026-07-02 组件圆角/内距要**按组件归属对齐 DESIGN.md YAML**而非只看"值在阶内"：widget 卡=card(md 圆角)、紧凑磁贴=tile(md 圆角+12 内距)、大容器/搜索框才用 lg——.fx-wcard/.fx-fav 曾错用 r-lg，值虽在阶内但组件档位错。
- 2026-07-02 一类问题修复必须**全库 grep 该模式**（如 `var(--r-md)`、单字符图标），不能只改 base.css——R7 dry round 在 fusion.css 抓出 9 处同类漏网（gbtn/gsearch 圆角、▸«» 残留、30/14 表外间距）。
- 2026-07-02 `openSettings` 数据/云/书签区那一批 ghost 按钮曾是 emoji 前缀（📑⬇⬆🔗↺🔌 等）——已给 `core.btn()` 加第 4 参 `ic`（Lucide 图标）；新增设置按钮传 `ic` 而非在 label 里塞 emoji。
- 2026-07-02 DESIGN.md 的字号/字重阶要**如实声明代码在用的完整有限集**（本轮补了 15/13/550 等），别只写理想化的 5 档——否则每轮评审都把合法的中间档当"表外值"反复抓。真正的散值（10/16/18/800/500/60/27/6px）才 snap 到阶。
- 2026-07-04 工具栏「已收藏」标识：① 收藏命中检测必须**递归进文件夹**——旧 popup 只查分组第一层，文件夹内已收藏的页会被判「未收藏」而重复收藏；popup 的 `locateFavorite` 与 SW 角标共用 `icon-map.js` 的 `normUrl` 同口径(trim+去尾斜杠+小写)，改口径只改一处。② 图标角标要 **per-tab**(`chrome.action.setBadgeText({tabId})`)，未命中必须显式 `text:''` 清空、否则切标签残留上一页的 ✓；监听 tab 切换/读 `tab.url` 需 manifest 加 `tabs` 权限(activeTab 不够，重载扩展会弹新权限提示)。③ 收藏增删刷角标走 `storage.onChanged` 里 `sameSet` 比对收藏集(避免点击计数等无关写入触发全量重画)。④ 角标 ✓(U+2713) 极少数系统可能显方框，属真机验证点。
- 2026-07-05 design-taste-frontend 通盘重设计取「preserve/演进」而非推倒：**token 体系整体保留**(颜色/间距/圆角/字体 token 未动，故本区旧的 token 类规则仍有效，不要因为"又重设计过"就当它们失效)。实测首页/分组/设置/命令面板等已是 Raycast/Arc 级、彼此协调，演进落在三条跨界面约定上：① 悬浮在视口角的**单一**浮动操作用 floating-control(`.fx-bg-trigger` 式：`position:fixed` 贴视口真角、pill 全圆、磨砂玻璃**仅 `body.bg-photo`**、纯色退回不透明表层)。② 有语义图标的操作按钮一律走 `core.btn(label,cls,on,ic)`(`.fn-btn.has-ic`+`.fn-btn-ic.lucide-mask`)，不再出现"没图标的纯文字操作框"/emoji 前缀。③ 交互元素统一 `:active` 触觉下压(scale .9~.99)，且已加全局 `@media (prefers-reduced-motion:reduce)` 守卫——**以后新增任何动效都要落在这个守卫覆盖范围内**。
