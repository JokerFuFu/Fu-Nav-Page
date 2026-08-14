# 锁屏式首页时钟 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将时钟从可管理组件重构为搜索框上方的锁屏式常驻英雄元素，并提供背景自动取色与完整个性化设置。

**Architecture:** 新建 `shared/hero-clock.js` 作为数据迁移、显示格式和自动对比色的深模块；`shared/background.js` 只负责采样并把自动色结果写到页面语义状态；`layouts/fusion.js` 负责独立渲染英雄时钟；Core 负责编辑器与持久化。旧 clock widget 只作为迁移输入，不再进入渲染和组件管理。

**Tech Stack:** Chrome Manifest V3、原生 JavaScript ES Modules、CSS variables、Canvas 2D、Node `node:test`、Playwright 真实扩展 E2E。

## Global Constraints

- 不修改收藏内容、`favOrder`、工作区、搜索和背景配置。
- 时钟在普通工作区常驻，不进入 `settings.widgets` 或 `hiddenWidgets`。
- 自动颜色的大字时间对采样后的实际背景达到至少 3:1；采样失败安全回退。
- 只用现有 token 和本地/系统字体，不增加依赖。
- 新行为严格走 RED -> GREEN；验收合约只在真实证据通过后翻转 `passes`。

---

### Task 1: 时钟领域模型与旧数据迁移

**Files:**
- Create: `shared/hero-clock.js`
- Create: `tests/hero-clock.test.mjs`
- Modify: `shared/core.js`
- Modify: `shared/home-settings.js`
- Modify: `data/seed.json`

**Interfaces:**
- Produces: `normalizeHeroClock(settings)`, `migrateHeroClock(settings)`, `formatHeroClock(date, config)`, `chooseHeroClockTone(input)`。
- Consumes: `settings.showClock`、`settings.heroClock`、`settings.widgets`。

- [ ] **Step 1: 写迁移与格式化失败测试**

覆盖旧 clock widget 被移除、新配置默认值、非法枚举回退、12/24 小时格式、time/date/full 详情。

- [ ] **Step 2: 运行 RED**

Run: `node --test tests/hero-clock.test.mjs`

Expected: FAIL，原因是 `shared/hero-clock.js` 尚不存在或导出缺失。

- [ ] **Step 3: 实现最小纯函数**

```js
export function migrateHeroClock(settings) {
  const before = Array.isArray(settings.widgets) ? settings.widgets : [];
  settings.widgets = before.filter(widget => widget?.type !== 'clock');
  settings.heroClock = normalizeHeroClock(settings.heroClock);
  return before.length !== settings.widgets.length;
}
```

Core `migrate()` 调用迁移并把变化合并进 `dirty`；默认配置和 seed 的 widgets 删除 clock，新增 `heroClock`。

- [ ] **Step 4: 运行 GREEN**

Run: `node --test tests/hero-clock.test.mjs tests/home-settings.test.mjs`

Expected: PASS。

### Task 2: 自动背景取色

**Files:**
- Modify: `shared/hero-clock.js`
- Modify: `shared/background.js`
- Modify: `tests/hero-clock.test.mjs`

**Interfaces:**
- Produces: `contrastRatio(a,b)`, `chooseHeroClockTone({luminance,scrimOpacity})`, `sampleCoverRegionLuminance(url, viewport, region)`。
- `applyBackground()` 把结果写入 `body.dataset.clockTone`，无背景或失败时删除该属性。

- [ ] **Step 1: 写亮暗样本与对比阈值失败测试**

使用纯 RGB/亮度输入验证浅色和深色文字选择，并断言获选方案对叠加遮罩后的背景对比度不低于 3:1。

- [ ] **Step 2: 运行 RED**

Run: `node --test tests/hero-clock.test.mjs`

Expected: FAIL，原因是取色接口未实现。

- [ ] **Step 3: 实现最小取色与 Canvas cover 采样**

取样器加载当前已缓存/本地的背景 URL，按 `cover + center` 计算源图裁切，只读取时钟区域的缩略像素；捕获解码与 Canvas 错误并返回 `null`。

- [ ] **Step 4: 运行 GREEN**

Run: `node --test tests/hero-clock.test.mjs`

Expected: PASS。

### Task 3: 独立首页英雄时钟

**Files:**
- Modify: `layouts/fusion.js`
- Modify: `layouts/fusion.css`
- Modify: `DESIGN.md`
- Modify: `tests/offline-static.test.mjs`
- Modify: `tests/responsive-static.test.mjs`

**Interfaces:**
- Consumes: `formatHeroClock()` 和归一化后的 `settings.heroClock`。
- Produces: `.fx-lock-clock`、`.fx-lock-date`、`.fx-lock-time`、`.fx-lock-greet`。

- [ ] **Step 1: 写结构与响应式失败测试**

断言 `renderHome` 在 `.fx-home-primary` 中先加入 hero clock 再加入 `.fx-ask`，`buildWidgetCards` 没有 clock 分支，CSS 包含 72-108px 英雄字号与 390px 回退。

- [ ] **Step 2: 运行 RED**

Run: `node --test tests/offline-static.test.mjs tests/responsive-static.test.mjs`

Expected: FAIL，原因是仍存在 `fx-wcard fx-hero-clock` 和 clock widget 分支。

- [ ] **Step 3: 重构 DOM 与 CSS**

在搜索前渲染独立 `<section>`，日期、时间、问候按详情配置显隐；从 widget switch、拖拽、删除和工作区隐藏逻辑中移除 clock。样式使用英雄字号、系统字体栈枚举和语义 CSS 变量。

- [ ] **Step 4: 运行 GREEN**

Run: `node --test tests/offline-static.test.mjs tests/responsive-static.test.mjs`

Expected: PASS。

### Task 4: 个性化编辑器与设置接入

**Files:**
- Modify: `shared/core.js`
- Modify: `layouts/fusion.js`
- Modify: `layouts/fusion.css`
- Modify: `tests/accessibility-static.test.mjs`

**Interfaces:**
- Produces: `Core.openHeroClockEditor()`。
- Settings “外观”使用 `showClock` 和 `heroClock`；组件管理只处理 weather/today/hwmon。

- [ ] **Step 1: 写设置入口与可访问性失败测试**

断言存在“显示锁屏时钟”“自定义时钟”，颜色输入有 label，组件管理器不再把 clock 作为可管理卡片。

- [ ] **Step 2: 运行 RED**

Run: `node --test tests/accessibility-static.test.mjs tests/offline-static.test.mjs`

Expected: FAIL。

- [ ] **Step 3: 实现编辑器**

复用 `seg()`、`field()`、`toggle()` 和 `openModal()`，提供即时预览；保存调用 `save(true)`、`rerender()`。时钟右键菜单复用该入口。

- [ ] **Step 4: 运行 GREEN**

Run: `node --test tests/accessibility-static.test.mjs tests/offline-static.test.mjs`

Expected: PASS。

### Task 5: 真实扩展组合验收与缓存版本

**Files:**
- Modify: `tools/product-e2e-check.cjs`
- Modify: `tests/offline-static.test.mjs`
- Modify: `newtab.html`
- Modify: `shared/core.js`
- Modify: `layouts/fusion.js`

**Interfaces:**
- E2E 输入旧 `widgets:[clock]` 配置；输出迁移、DOM 顺序、自动色、个性化持久化和工作区常驻证据。

- [ ] **Step 1: 扩展 E2E 断言**

验证 `.fx-lock-time` 在 `.fx-ask` 前、迁移后 clock widget 数为 0、明暗背景得到不同 tone、手动字体/样式/颜色持久化、工作区切换后时钟仍显示、全部收藏顺序恢复。

- [ ] **Step 2: 同步提升模块 URL 版本**

统一更新 newtab core、fusion reverse import、动态 layout import、hero clock 和 background 依赖 URL，避免长生命周期 Chrome 混载。

- [ ] **Step 3: 运行完整验收**

Run: `npm test && npm run verify:static && npm run verify:e2e`

Expected: 全部 exit 0、E2E `consoleErrors: 0`。

- [ ] **Step 4: 更新 Eval**

逐条核对证据，只把真实通过项的 `passes` 从 `false` 翻为 `true`。
