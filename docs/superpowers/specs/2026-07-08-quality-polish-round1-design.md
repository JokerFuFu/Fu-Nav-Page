# Fu 导航 · 开源后质量打磨（第一轮）Product Spec

日期：2026-07-08 ｜ 状态：待用户审阅 ｜ 形态：Product Spec（六段式）+ 审计明细附录

## 0. 决策记录（brainstorm 已确认）

| 决策点 | 结论 |
|---|---|
| 触发 | 开源首发（v3.18.0）已完成，但自评「离真正可用的开源工具有距离」——UI 不统一、设置繁琐、疑似 bug |
| 开局方式 | **先做系统性质量审计**：4 维度并行 agent（UI 一致性 / 设置信息架构 / 缺陷稳定性 / 开源就绪度），已完成，产出 48 条分级明细（附录 A） |
| 修复范围 | **方案 B「一轮体面打磨」**：P0 全修 + 全部 P1 + 递归 bug 家族；纯 P2 稳定性 bug 留下一轮 |
| 执行 | **在 macmini 上由 claude 会话直接执行**（用户在旁）：逐工作包开发→自测→commit 到公开仓 `main`；不走 fleet 派发 / PR / 本机审阅。单机单会话，`core.js` 串行约束天然满足 |
| 代码落地 | `~/Projects/personal/Fu-Nav-Public`（首发后唯一开发真源），PR 进公开仓 `JokerFuFu/Fu-Nav-Page` |
| 过程文档 | **公开进 `Fu-Nav-Public/docs/`**（首发后约定，延续 AI 协作叙事） |
| 行号基准 | 附录 A/B 的 `file:line` 均基于 v3.18.0 首发代码，作为 macmini 定位线索 |

## 1. 问题

首发把 Fu 导航**合法开源**了，但没有**打磨到位**。审计证实三个具体痛点，都伤"陌生人第一次用"的体验：

1. **毁第一印象**：默认新标签页就渲染一张「连接失败」的硬件监控卡（伴随服务默认没装、Windows/Linux 装不了）；清空演示数据后空首页零引导。首次用户开局像"装了个坏的"。
2. **设置劝退**：`openSettings` 是单一模态塞了 4 折叠区约 28 个控件，把「显示时钟」这种日常开关和「自建 Google OAuth 客户端」这种一辈子配一次的基建平铺在一起；云同步一展开就是满屏 DDNS/OAuth 术语。
3. **损专业感与信任**：一个「删了没删掉」的确定性 bug（编辑弹层删除文件夹内条目静默失效）；popup 界面整个绕过设计 token（冒出第二强调色）；一批文字符号/emoji 当图标；README 把 macOS 专属服务写成通用、manifest 带一条代码已不用的联网权限，戳破"权限逐条如实"的信任卖点。

## 2. 假设

修掉「毁第一印象的 P0 + 设置分层 + UI 收编 + 确定性 bug」后，陌生 homelab 用户会因为「打开即用、设置不劝退、操作可信」而愿意留下长期使用，而不是装上看一眼就卸载。机制：第一印象决定去留，信任决定是否敢开权限，一致性决定是否觉得"这是个正经项目"。

## 3. 范围

### IN —— 5 个工作包（映射方案 B）

每个工作包 = 一个可独立验收的 PR。完整条目→工作包映射见附录 A 的「工作包」列。

1. **演示与信任修复**（文档/配置，低风险）— R1 移除报错监控卡、R2 README 标注 macOS 专属、R3 删 `hitokoto.cn` 废弃权限、R4 内网状态改 best-effort 措辞、R10/R11/R12 README 三处小不符与 manifest 描述。
2. **递归 bug 家族**（确定性 bug）— D1 编辑删除文件夹内条目失效、D9 拖拽文件夹卡片到分组失效；全库 grep 所有"只扫分组顶层 items"的同源写法统一改走递归 `deleteItem`/`_removeItem`/`findItemById`。
3. **设置页信息架构重构**（最大一块）— S1 云同步渐进披露、S2 常用/高级分层、S3 删搜索引擎死控件、S4 拆分 openSettings、S5 Infinity 按钮并入导入备份、S6 失效链接检测移命令面板、S7 数据区按钮分组、S8 主题入口收敛；顺手 S9-S12（打开方式降级、启用态 gate 字段、在线探测归类、抽 syncActionRow）。
4. **popup + 图标语言收编**（UI 一致性）— U1 popup logo 去第二强调色/字重、U2 文字符号图标 ▸✓⠿ 走 mico、U4 popup 成功色用 `--ok`、U6 popup 收进 8px 栅格、U9 警告/面包屑符号、U10 状态 pill glyph、R6 面向用户文案的 emoji；顺手 U5/U7/U11/U12（6px 圆角、scrim 令牌化、fn-pill 磨砂 gate、碎值）。
5. **触控 + 空状态 + 配额提示**（可用性收尾）— U3 视图切换/折叠钮 <32px、U8 hover 微钮热区、R5 空首页/空侧栏引导、D2 超 sync 配额改提示「配置过大，仅存本机」。

### OUT —— 这轮不做（纯 P2，多需真机或下一轮）

D3 跨上下文删除合并复活、D4 buildAsk 监听器泄漏、D5 隐私模式残留、D7 远端同步覆盖编辑、D8 悬浮面板残留、D10 openIn=_self 访问计数丢失、R7 prompt/confirm 原生弹窗、R8 错误 toast 时长、R9 天气首屏自动联网。

> **低成本防御性例外**：D6（importConfig 畸形文件空白页，一个 `Array.isArray` 守卫）、D11（倒数日 NaN，一个 `isNaN` 守卫）、D12（编辑保存时目标分组被删抛错，一个 `if(!tg)` 兜底）——若对应工作包 agent 碰到同文件有余力，plan 阶段可评估顺手纳入；否则留下一轮。不扩大 B 的承诺。

### CUT —— 刻意砍掉

- **不追求极致并行**：3 个工作包（2/3/5）都重度改 `shared/core.js`，串行 merge 而非硬凑并行。
- **不重做设计系统**：token 体系保留演进（memory 已记 design-taste 取"preserve"），这轮是收编脱管处，不推倒。
- **不碰真机专属深度测试**：书签双向同步、agent 伴随服务、per-tab 角标的真机回归留到有真实用户反馈时。

## 4. 用户体验

以修复后的产品本身为原型（无需另做 mockup）。关键动线改善：

- **首次打开**：不再有报错监控卡；空状态（首页/侧栏）出现一句轻量引导（「＋ 添加网站，或 设置→导入浏览器书签」）。
- **进设置**：顶部「常用」区一屏覆盖日常项（主题/强调色/时钟/天气/在线探测）；云同步与书签同步收成「一句话状态 + 一个按钮」，点开才进子弹层——陌生人不再撞满屏术语。
- **日常操作**：删除文件夹内的网站真能删掉；工具栏 popup 与主界面同一套视觉语言；界面无文字符号/emoji 充当图标。

## 5. 验收标准（每工作包 pass/fail 闸门 · 意图层）

执行层的精确断言与命令由 plan 阶段每工作包的 exit criteria 承载；此处定意图锚点：

1. **工作包 1**：全新 profile 加载扩展，首屏**无**「连接失败」卡；`grep hitokoto manifest.json` 零命中且 README 权限表同步删行；README 出现「（目前仅 macOS）」标注；图标数表述与 `ICON_LIB` 实际条数一致。
2. **工作包 2**：预览环境复现——建文件夹→放一个网站→编辑弹层点删除→**条目真消失**（不是假装成功）；拖拽文件夹内卡片到侧栏分组**真移动**且有 toast。PR 附复现步骤截图。
3. **工作包 3**：设置页出现「常用/高级」分层，日常项在默认展开区；云同步/书签同步默认是折叠摘要态，展开走独立子弹层；设置页无「搜索引擎」下拉；`openSettings` 主函数显著瘦身（云/书签 UI 抽出）。
4. **工作包 4**：全库 grep 图标语言**零漏网**（▸✓⠿!☁️🔖🔓 等不再出现在 `textContent`/`innerHTML`/toast/hint）；`popup.css` 无第二强调色 `#9b6ef3`、无硬编码绿、成功色走 `--ok`、间距走 `--s*` 令牌；对照 DESIGN.md 无表外硬编码。
5. **工作包 5**：视图切换钮/折叠钮命中区 ≥32px；空首页与空侧栏有引导文案；超配额时提示「仅存本机」而非「已保存」〔真机验证:sync 配额〕。

**全局闸门**：五个 PR 全 merge 后，公开仓 `python3 -m http.server` 预览演示数据正常渲染、console 无红错；`npx @google/design.md lint DESIGN.md` 0 errors（若改了 token）。

## 6. 成功指标（上线后观察，不设阈值）

- 不再出现「打开就报错 / 装了个坏的」类反馈。
- issue/讨论里「设置里找不到 X」「某项改了没反应」类困惑减少。
- 出现 Windows/Linux 用户正常使用的信号（不再误以为伴随服务对自己可用而受挫）。

---

## 附录 A：审计完整明细（48 条）

维度：S=设置信息架构 · U=UI 一致性 · R=开源就绪度 · D=缺陷稳定性。评级为审计原评；「B内」标记本轮是否修；「包」为工作包归属（— = OUT）。

| ID | 级 | 问题 | 位置 | B内 | 包 |
|---|---|---|---|---|---|
| R1 | P0 | 默认演示渲染「连接失败」硬件监控卡 | seed `w-hw1`；fusion.js:406；README:44 | ✅ | 1 |
| S3 | P0 | 设置「搜索引擎」下拉未接首页搜索，死控件且与搜索框下拉分叉 | core.js:482,550 vs fusion.js:281 | ✅ | 3 |
| D1 | P0※ | 编辑弹层「删除」对文件夹内条目静默失效（非递归查找） | core.js:431 | ✅ | 2 |
| S1 | P0 | 云同步一展开全字段+满屏术语，无渐进披露/空态 | core.js:497-518,546 | ✅ | 3 |
| S2 | P0 | 高频显示开关与外观分家、默认折叠，常用项难找 | core.js:532-534,537-542 | ✅ | 3 |
| D2 | P1 | 超 sync 配额静默停跨端同步却提示「✓已保存」 | storage.js:71-88；core.js:139 | ✅ | 5 |
| S4 | P1 | openSettings 单函数~74行，云UI内联22行 | core.js:480-553 | ✅ | 3 |
| S5 | P1 | 「导入Infinity备份」按钮冗余（导入备份已能嗅探） | core.js:490 | ✅ | 3 |
| S6 | P1 | 「立即检测失效链接」是维护动作不该常驻设置 | core.js:493 | ✅ | 3 |
| S7 | P1 | 数据区6个ghost按钮平铺，例行/迁移/维护/危险混堆 | core.js:488-494,549 | ✅ | 3 |
| S8 | P1 | 主题入口三处暴露，设置里那份最少用 | core.js:539；fusion.js:65；core.js:310 | ✅ | 3 |
| U1 | P1 | popup logo 第二强调色`#9b6ef3`+字重800 | popup.css:6 | ✅ | 4 |
| U2 | P1 | 文字符号当图标 ▸✓⠿（▸是回归） | fusion.js:434,267,314 | ✅ | 4 |
| U3 | P1 | 视图切换钮30px/折叠钮24px <32px 硬条 | fusion.css:290,17 | ✅ | 5 |
| U4 | P1 | popup 成功色`#22c55e`分叉`--ok` | popup.css:14 | ✅ | 4 |
| R2 | P1 | 伴随服务macOS专属，主README写成通用 | README:123-125；agent/README:3 | ✅ | 1 |
| R3 | P1 | manifest带已废弃`v1.hitokoto.cn`权限 | manifest.json:31；README:95 | ✅ | 1 |
| R4 | P1 | 「内网在线状态…确认在线才亮绿点」过度承诺 | README:42 | ✅ | 1 |
| R5 | P1 | 清空数据后空首页/空侧栏零引导 | fusion.js:147-164 | ✅ | 5 |
| S9 | P2 | 「打开方式」低频却占外观区黄金位 | core.js:540 | ✅ | 3 |
| S10 | P2 | 云启用开关不gate字段可见性，onchange空函数 | core.js:501 | ✅ | 3 |
| S11 | P2 | 「内网在线状态探测」归类到「卡片」区错位 | core.js:534 | ✅ | 3 |
| S12 | P2 | 云/书签同步结构复制，applyCl每次从DOM刮 | core.js:511 | ✅ | 3 |
| U5 | P2 | 头像/图标容器6px表外圆角 | fusion.css:84,100,229 | ✅ | 4 |
| U6 | P2 | popup.css脱离8px间距栅格 | popup.css:4-15 | ✅ | 4 |
| U7 | P2 | overlay遮罩三处未令牌化魔数 | base.css:89,111,131 | ✅ | 4 |
| U8 | P2 | 编辑态20px hover微钮 <32px | fusion.css:203,207,125 | ✅ | 5 |
| U9 | P2 | 警告`!`与面包屑`›`文字符号 | fusion.js:491,505,465 | ✅ | 4 |
| U10 | P2 | flashSync/popup状态glyph+emoji前缀 | core.js:139,160,514-516,495,519 | ✅ | 4 |
| U11 | P2 | `.fn-pill`磨砂玻璃未gate `body.bg-photo` | base.css:229 | ✅ | 4 |
| U12 | P2 | 表外碎值9px/letter-spacing/裸8px圆角 | fusion.css:86；popup.css:7,6；base.css:73 | ✅ | 4 |
| R6 | P2 | 面向用户文案混emoji/文字符号(🔓☁️✓✗⚠↵↑↓⠿) | core.js:530-531,385等 | ✅ | 4 |
| R10 | P2 | 「内置上百个图标」实为96条 | README:40 vs icon-editor.js:13 | ✅ | 1 |
| R11 | P2 | manifest描述以「个人」开头 | manifest.json:5 | ✅ | 1 |
| R12 | P2 | README结构树把根目录background.js归到shared | README:177 | ✅ | 1 |
| D9 | P2 | 拖拽文件夹内卡片到侧栏分组静默无效（同D1根因） | core.js:247 | ✅ | 2 |
| D6 | P2 | importConfig畸形文件(groups非数组)致空白页 | core.js:566-568 | ◐ | 2? |
| D11 | P2 | 倒数日非法日期渲染"NaN" | fusion.js:352-356 | ◐ | 5? |
| D12 | P2 | 编辑保存时目标分组被并发删除→解引用抛错 | core.js:428-429 | ◐ | 2? |
| D3 | P2 | 跨上下文删除被add-only合并复活〔真机〕 | core.js:125-136 | — | — |
| D4 | P2 | buildAsk每次渲染挂永不解绑click监听(泄漏) | fusion.js:282 | — | — |
| D5 | P2 | 隐私模式从分组页进入仍显示该组内容 | fusion.js:44-46,138-145 | — | — |
| D7 | P2 | 远端同步在编辑弹层开着时覆盖cfg致编辑丢失 | core.js:71-76 | — | — |
| D8 | P2 | 悬浮面板rerender后残留游离节点 | fusion.js:174-193等 | — | — |
| D10 | P2 | openIn=_self时recordVisit防抖保存随导航丢失 | core.js:374 | — | — |
| R7 | P2 | 原生prompt()/confirm()破坏自定义弹层观感 | fusion.js:84；core.js:516 | — | — |
| R8 | P2 | 错误toast与成功一样2.6s自动消失 | core.js:577 | — | — |
| R9 | P2 | 天气首屏未经点击自动IP定位联网 | seed:14；weather.js | — | — |

※ D1 审计原评 P1，因「删了没删掉」是确定性数据操作失效，本 spec 提级 P0。
◐ 低成本防御性例外，plan 阶段评估是否顺手纳入括注的工作包。

**审计确认已收敛（不用动）**：rerender 有 try/catch、mount 的 active 守卫枚举正确、菜单 click 已 stopPropagation、per-tab 角标未命中已清空、normUrl 三处口径一致、storage 回环有 savedAt 守卫、README 权限表准确覆盖 manifest、seed 泛化得当无个人信息泄漏。

## 附录 B：5 工作包执行提要（plan 阶段细化为 task）

| 包 | 主要文件 | 建议序 | 验证 | 真机项 |
|---|---|---|---|---|
| 1 演示与信任 | data/seed.json、README.md、manifest.json、agent/README.md | ① | 静态grep + 预览 | 无 |
| 2 递归bug家族 | shared/core.js | ③ | 预览复现 | 无 |
| 3 设置页重构 | shared/core.js（+新子弹层） | ④ | 预览 | 云同步子弹层 |
| 4 popup+图标 | popup.css、fusion.js、base.css、fusion.css、shared/core.js文案 | ② | grep + 对照DESIGN.md + 预览 | 无 |
| 5 触控+空态+配额 | fusion.css、fusion.js、shared/storage.js、shared/core.js | ⑤ | 预览 | sync配额 |

**执行模型**：单机单会话（macmini 上的 claude，用户在旁）按建议序 **①1→②4→③2→④3→⑤5** 顺序执行——先低风险文档/UI，再核心 bug 与重构。包 2/3/5 都改 `core.js`，顺序做天然无冲突，无需 worktree/PR/rebase。每工作包独立 commit 到 `main`；5 包全部完成且本地预览验证通过后统一 push 公开仓 `JokerFuFu/Fu-Nav-Page`。
