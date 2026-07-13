# 点击统计（小彩蛋）· 设计文档

日期：2026-07-13 ｜ 状态：已实现

## 问题

用户点了很久的导航页，却从不知道自己「最离不开哪个网站」。`item.clicks`（累计点击）和 `item.freq/lastVisit`（frecency，7 天半衰期）早已在 `shared/favorites.js` 里默默记录，只差一个展示出口——这是一个零新增存储、纯读展示的小彩蛋。

## 方案取舍

- **A. 命令面板 + 设置入口 → 统计模态（采用）**：入口低调符合"彩蛋"定位；复用 `openModal`/`mountIcon`/`seg` 全套现成组件；不动点击链路，风险最小。
- B. 首页 widget 卡片：常驻首页与「视觉退到内容后面」哲学冲突，且要接入 widget 类型/拖拽系统，过重。（放弃）
- C. 隐藏触发（点 logo N 次）：不可发现，统计诉求是主体、彩蛋只是包装。（放弃）

## 范围

**IN**
- `core.openStats()` 统计模态：
  - 总览三格（stat-tile）：收录网站 / 累计点击 / 点过的站数。
  - 彩蛋文案一句：Top1 网站 + 次数（空态时换鼓励文案）。
  - 榜单 seg 两档：「总点击」按 `clicks` 降序；「近期常用」按 `frecencyScore` 降序（只含 freq>0）。
  - Top 10 榜单行（leaderboard）：排名 + 网站图标 + 名称 + 相对条形 + 右侧 meta（总榜=次数，近期榜=相对时间）。行可点击打开该站（走 `recordVisit` + `settings.openIn`）。
- 入口两处：命令面板「操作」区（`trophy` 图标）、设置 → 高级 →「使用统计」。
- 排行纯函数放 `shared/favorites.js`（与 frecency 同居）：`rankByClicks(entries,n)` / `rankByFrecency(entries,n)`。

**OUT / CUT**
- 按日/周时间序列统计——需要新增存储与写路径，违背"零风险彩蛋"定位，等有真实诉求再说。
- 首页常驻组件、分享/导出图片。

## 视觉（唯一事实源 DESIGN.md，本次新增两个组件规范）

- **stat-tile**：大数字 28/750/tabular-nums + caps 11 标签（text-subtle），无边框无底，三列排布。
- **leaderboard**：行=button（整行 ≥32px 命中区），排名 caps/tabular（前三名 accent、650），图标 26px sm 圆角，名称 body/550，meta 用 caps+text-subtle+tabular；条形 3px（密集微网格例外档）pill 圆角，底 surface-raised、填充 accent 55% 透明度，行 hover 升 surface-raised。

## 验收标准

- [ ] 命令面板与设置高级区都能打开统计模态；模态挂 body 下（openModal 承载）。
- [ ] 双主题（深/浅/auto-浅）无硬编码色，全部走 token；390 宽不破版。
- [ ] 空态（无任何点击）显示鼓励文案而非空榜。
- [ ] 榜单行点击可打开对应网站并计入 recordVisit。
- [ ] 图标全 lucide-mask，无 emoji/文字符号；数字全 tabular-nums。
- [ ] `node --check` 语法闸门通过；无浏览器 console 报错。
