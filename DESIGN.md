---
version: alpha
name: Fu Nav
description: 个人浏览器新标签页导航。近单色、克制、单一靛蓝强调色 —— Raycast / Arc 一脉，为 homelab 与书签的一眼可达而生。
colors:
  background: "#0a0a0c"
  surface: "#141417"
  surface-raised: "#1b1b1f"
  surface-overlay: "#232328"
  border: "rgba(255,255,255,0.07)"
  border-strong: "rgba(255,255,255,0.12)"
  text: "#ededee"
  text-muted: "#a0a0a8"
  text-subtle: "#86868f"
  primary: "#6e7bff"
  primary-strong: "#4a55f3"
  on-primary: "#ffffff"
  ring: "rgba(110,123,255,0.28)"
  success: "#34d399"
  success-strong: "#16a34a"
  warning: "#f5b454"
  danger: "#fb7185"
  scrim: "rgba(6,9,18,0.58)"
typography:
  display:
    fontFamily: Inter
    fontSize: 2.5rem
    fontWeight: 750
    letterSpacing: -0.02em
  title:
    fontFamily: Inter
    fontSize: 1.25rem
    fontWeight: 650
    letterSpacing: -0.01em
  body:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: 600
  caps:
    fontFamily: Inter
    fontSize: 0.6875rem
    fontWeight: 600
    letterSpacing: 0.08em
rounded:
  sm: 8px
  md: 12px
  lg: 16px
  pill: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 32px
  3xl: 48px
components:
  search-box:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: 16px
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: 16px
  tile:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: 12px
  card-hover:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
  button-primary:
    backgroundColor: "{colors.primary-strong}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.sm}"
    padding: 8px 16px
  button-ghost:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.sm}"
    padding: 8px 16px
  chip:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.pill}"
    padding: 8px
  menu:
    backgroundColor: "{colors.surface-overlay}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: 8px
  toggle:
    backgroundColor: "{colors.surface-raised}"
    activeColor: "{colors.primary-strong}"
    rounded: "{rounded.pill}"
  checkbox:
    backgroundColor: "{colors.surface-raised}"
    activeColor: "{colors.primary-strong}"
    rounded: "4px"
  field:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: 12px
  meta:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-subtle}"
    typography: "{typography.caps}"
  status-online:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.success}"
  status-attention:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.warning}"
  status-danger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.danger}"
---

## Overview

**近单色的克制 + 单一靛蓝的锋利。** Fu 导航是新标签页，第一职责是「一眼找到、立刻打开」——所以视觉必须退到内容后面：深近黑的画布、几乎无色的表层、只有交互处才点亮的一抹靛蓝。气质参照 Raycast 的命令面板与 Arc 的侧栏：安静、紧凑、有呼吸，绝不喧宾夺主。

设计在**深色与浅色双主题**下都成立。深色是签名形态（本文 token 取深色值为基准）；浅色是同一套语义 token 的镜像，仅替换具体色值，结构、间距、圆角、层级完全一致。

## Colors

调色板是**高对比中性色 + 唯一强调色**。中性色铺满 95% 的界面，强调靛蓝只负责「这里能交互 / 这里是当下焦点」。

**深色（基准）**
- **background `#0a0a0c`** — 近黑画布，叠一层单向极淡靛蓝渐变（155°，6% 透明）替代多团光晕。
- **surface `#141417` / surface-raised `#1b1b1f` / surface-overlay `#232328`** — 三档抬升：卡片底 / 悬停·输入控件 / 浮层·菜单。靠明度而非阴影区分层级。
- **text `#ededee` / text-muted `#a0a0a8` / text-subtle `#86868f`** — 三档文字。subtle 专门由更暗值提亮到 4.5:1 以过 WCAG AA。
- **primary `#6e7bff`** — 靛蓝强调，用于边框高亮、焦点环、激活态指示、图标点睛。**不**直接做承载白字的填充（在深色上白字仅 3.5:1）。
- **primary-strong `#4a55f3`** — 需要白字的实心填充（主按钮、激活分段）用它，白字 5.41:1 过 AA。
- **on-primary `#ffffff`** — primary-strong 之上的文字。
- **border `rgba(255,255,255,.07)` / border-strong `rgba(255,255,255,.12)`** — 半透明描边，随表层明度自适应。
- **ring `rgba(110,123,255,.28)`** — 焦点/激活的柔光环。
- **success `#34d399` / warning `#f5b454` / danger `#fb7185`** — 状态色，仅状态点、警示文案、删除按钮，绝不滥用。
- **overlay-bg**（深 `#0a0a0c` / 浅 `#ffffff`）— 大居中浮层（模态、命令面板、iframe/背景面板、toast、搜索下拉）的底色，同一语义 token 双主题各取其值（深=最深画布、浅=纯白），配 shadow-lg + 1px border 抬升；不硬编码 `#fff`，避免 auto/显式浅色两条路径分叉。
- **scrim**（深 `rgba(6,9,18,.58)` / 浅 `rgba(23,25,35,.38)`）— 全屏浮层遮罩（模态背板、命令面板背板、iframe 面板背板）唯一底色 token：同一层级动作共用一档不透明度，浅色主题用更轻的一档，不各处手写 rgba。

**浅色（镜像，同语义）**
background `#fafafb` · surface `#ffffff` · surface-raised `#f4f4f6` · surface-overlay `#ebebef` · text `#1a1b22` · text-muted `#565a68` · text-subtle `#6b6f80` · primary `#4a55f3` · border `rgba(20,25,50,.09)` · ring `rgba(74,85,243,.22)` · scrim `rgba(23,25,35,.38)`。浅色主题里 primary 本身即 `#4a55f3`（白字过 AA），primary-strong 可等同之。

## Typography

**Inter 一种字族通吃**，靠字重与字号建立层级，不引入第二字体（中文回退 PingFang SC / 微软雅黑）。负字距只给大字号，让标题更紧致。

**字号阶（px，唯一集合，不出表外值）**：`clamp(72–108)`（hero-clock 响应式英雄时钟）· `44 / 32 / 28`（display 三档：大数字统计）· `20`（title）· `17`（subtitle）· `15`（lead）· `14`（body）· `13`（secondary）· `12`（label）· `11`（caps/meta）· `8`（micro，仅 2×2 迷你磁贴字母）。
**字重阶（唯一集合）**：`750`（display）· `700`（strong：品牌、字母磁贴、温度）· `650`（title）· `600`（label/caps、hero-clock）· `550`（medium：导航项、卡片名等交互文字）· `400`（body）。

- **hero-clock** — 首页固定英雄时钟：`clamp(72px, 9vw, 108px)` / 600（超大字号用偏细字重更通透）/ `letter-spacing:1px`（tabular 数字用正字距拉开位间距，是巨型数字的例外，不适用"负字距只给大字号"的比例文本规则）/ tabular-nums。背景图态转白 + 阴影保证可读。
- **display** 44px / 750 / -0.02em — 问候等大数字；统计数字用 32/28。
- **title** 20px / 650 / -0.01em — 分组标题、面包屑当前项、模块标题。
- **subtitle** 17px / 700 — 模态标题、天气温度。
- **lead** 15px — 首屏日期、次级强调文字。
- **body** 14px / 400 / 1.5 — 正文、卡片名（卡片名用 550 medium）、输入框。
- **secondary** 13px — 备注/副标题、行内提示、子目录项。
- **label** 12px / 600 — 字段标签、次级按钮。
- **caps** 11px / 600 / +0.08em，配 `text-transform:uppercase` — 计数、元信息、分区小标。

## Layout

**8 像素栅格 + 一条间距阶。** 所有间隙取自 spacing（4 / 8 / 12 / 16 / 24 / 32 / 48），不出现表外数值。例外：2×2 迷你磁贴预览、进度条等**密集微网格**允许 2–3px 的子栅格微缝（`gap:2px` / `padding:3px`），因低于 4px 栅格的元素靠微缝分隔更自然。

- 内容**居中、留白优先**：搜索英雄区垂直靠上居中，下方依次是卡片行、常用行，纵向节奏用 xl(24)–2xl(32) 分段。
- 卡片网格自适应列宽，行/列间距统一 md(12)–lg(16)。
- 侧栏定宽，可折叠到仅图标（236px ↔ 64px）。
- 触控/点击目标 ≥ 32px（含模态关闭钮、强调色swatch、分段按钮等小控件，均须 ≥32px 命中区）。
- **首页单屏自适应（`--home-scale`）**：首页三行（时钟英雄区/小组件行/常用网格）的尺寸与间距统一乘以 `--home-scale` 变量（由常用区规格等内容密度决定，取值 ≤1），保证内容多时整页仍一屏放下——被乘数**仍必须取自上表 token**（`calc(token × var(--home-scale))`），缩放不豁免栅格纪律；`@media 760` 下强制 `--home-scale:1` 并允许纵向滚动。仅首页使用，弹层/分组页/设置不缩放。

## Elevation & Depth

**默认零阴影，深度靠表层明度。** 卡片与画布的区分来自 surface 比 background 亮一档，而非投影。阴影是「正在浮起/悬停」的临时信号，只出现在：浮层菜单、模态、卡片 hover。

- **shadow** `0 12px 32px rgba(0,0,0,.45)`（浅色 `0 12px 30px rgba(40,50,90,.12)`）——菜单/下拉/悬停等小浮层。
- **shadow-lg** `0 28px 80px rgba(0,0,0,.55)`（浅色 `0 28px 80px rgba(40,50,90,.22)`）——大居中浮层（模态、命令面板、iframe 面板、背景面板）用更深一档抬升。两档都随主题切换，浅色用蓝灰低透明度，深色用黑，绝不在浅色留重黑晕。
- hover 抬升 = 背景升一档（surface → surface-raised）+ 轻微上移 1px，而非加重阴影。
- 玻璃拟态（backdrop-blur）仅用于切换器/吸顶等悬浮控件，节制使用。

## Shapes

**圆角只三档 + 一个胶囊。** sm(8) 小控件/图标块、md(12) 卡片/菜单、lg(16) 搜索框/大容器、pill(999) 切换器/标签/快捷 chip。统一、可预测，不出现表外半径。描边一律 1px。

## Components

- **search-box** — 英雄输入框。surface 底、lg 圆角、16 内距；左侧 provider 图标可点开下拉切换引擎/AI，右侧回车发送。聚焦时描边转 primary + ring 柔光。
- **card** — widget 卡片基元（时钟/天气/待办/倒数日）。surface 底、md 圆角、16 内距、1px border。**card-hover**：升 surface-raised、上移 1px。
- **tile** — 紧凑磁贴（分组页网站卡 `.fx-card`、首页常用 `.fx-fav`）。同 card 的 surface 底/md 圆角/1px border，但为高信息密度用 12 内距（比 widget 卡更紧）。
- **button-primary** — 主操作。primary-strong 实心 + 白字（过 AA）、sm 圆角、纵 8 横 16 内距。
- **button-ghost** — 次操作。surface-raised 底、text-muted 字、sm 圆角。
- **chip** — 胶囊快捷标签（视图切换、provider 快选）。surface-raised 底、pill 圆角。
- **menu** — 右键菜单 / provider 下拉 / 浮层。surface-overlay 底、md 圆角、shadow 浮起；菜单项 hover 用 hairline 色（border token）做淡填充——overlay 已是最亮表层档，之上不再升档。
- **meta** — 计数、分组名等元信息，用 caps 排版 + text-subtle。
- **toggle** — 开关/复选框统一用轨道+圆钮的自定义样式（不用浏览器原生 checkbox），未激活 surface-raised 底、激活态轨道变 primary-strong，圆钮位移动效 130ms。所有「是否勾选」类设置项都用它，包括表单里的 fav/frame 复选框。
- **checkbox** — 内容清单里的勾选（待办完成、书签导入挑选）用方形自定义勾选框：surface-raised 底 + 1px border、4px 圆角，勾选后 primary-strong 底白色 ✓。设置类布尔项不用它（用 toggle）。
- **field** — 文本输入/select/date 等表单字段：surface-raised 底、sm 圆角、1px border、聚焦转 primary 描边 + ring；select 去原生箭头改自定义 ▾，date 图标随主题。字体一律继承 Inter。
- **badge** — 实心状态徽章。success-strong 底 + 白字 + 图标，pill 圆角，纵 8 横 12 内距。强确认场景（popup「已收藏」提示）用，比 status-online 的「surface 底 + 状态色字」更醒目；节制使用，一处场景一个。工具栏图标的「已收藏」角标是它在浏览器原生 UI 里的等价物（同 success-strong 底、白 ✓）。
- **floating-control** — 悬浮在视口角的圆形轻控件（首页壁纸入口 `.fx-bg-trigger`）。`position:fixed` 贴视口**真正的角落**（不随内容区偏移）、pill 全圆角、36px 命中区、hover 上移 1px。磨砂玻璃**仅 `body.bg-photo` 背景图模式**启用（`--surface-glass` 底 + `backdrop-filter:blur(14) saturate(1.3)` + 白 14% 描边），纯色模式退回不透明表层。用于「不抢首页焦点、又要随手可及」的单一浮动操作；承载多个并列动作是 menu/panel 的活，不要塞进这里。
- **icon-button** — 带 lucide 图标的按钮统一走 `core.btn(label,cls,on,ic)`（`.fn-btn.has-ic` + `.fn-btn-ic.lucide-mask`，图标 `currentColor` 随按钮态变色）。凡是有语义图标的操作按钮（含壁纸弹窗的在线源/上传/恢复）都用它，不再出现「没有图标的纯文字操作框」与 emoji 前缀。

## Do's and Don'ts

- **Do** 让靛蓝稀缺——一屏里强调色越少，每一处越有指向性。
- **Do** 用表层明度建立层级；hover 用「升一档 + 1px 位移」。
- **Do** 一切间距/圆角/字号取自 token，新增值先进 token。
- **Do** 承载白字的强调填充用 primary-strong（而非 primary），保证 AA。
- **Do** 让首页之外的页面（分组页/表单/设置/菜单）跟首页拿一样的打磨标准，不因为不是「门面」就将就。
- **Don't** 用 primary 当大面积背景或承载小字白字。
- **Don't** 靠阴影堆叠层级，或给静态元素加投影。
- **Don't** 引入第二字体、第二强调色或表外圆角。
- **Don't** 在菜单/工具条/按钮里用 emoji 或文字符号当图标——UI 骨架的图标语言唯一是 **Lucide 单色遮罩**（`lucide-mask` + currentColor）；emoji 只允许出现在用户自定义的分组图标里。
- **Don't** 给「空占位」（名称/网址都没填的图标预览）上彩色哈希——空态一律中性 surface-3 底 + text-3 字（`.is-letter.is-empty`）。
- **Don't** 让装饰（渐变、模糊、动效）抢占内容注意力。**动效分层**：交互微动效（hover / focus / 态切换 / 圆钮位移）统一 130ms（`--t`）；浮层入场（fade/pop）120–160ms、侧栏收折 ~220ms、toast 进出 ~250ms 等较大动作按幅度略长，但不超过 300ms。
