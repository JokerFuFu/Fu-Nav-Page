# 壁纸后台持久自动更新 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking。

**Goal:** 把在线壁纸自动更新从短命新标签页迁移到 Manifest V3 Service Worker，使没有首页页面打开时仍按用户频率更新。

**Architecture:** 新建调度与独立运行状态模块；根 Service Worker 使用一次性 `chrome.alarms` 组合在线图片下载，但只写 `fn_wallpaper_refresh_v1`，不写整份收藏配置；首页读取与当前来源匹配的自动缓存，不再创建自动刷新 timer。

**Tech Stack:** Chrome Manifest V3、`chrome.alarms`、原生 ES Modules、IndexedDB、Node `node:test`、Playwright Chromium 扩展 E2E。

## Global Constraints

- 自动更新只有 Service Worker 一个所有者，不允许页面与后台重复拉取。
- 所有时间间隔直接来自用户的 `refreshEvery`，不增加新的产品阈值或重试次数。
- 自动任务不请求新权限；只使用必需 host 权限或用户已授权的 optional host 权限。
- 失败不清空旧图片，按同一用户频率再次尝试。
- 保留当前手动换图、来源、缓存、时钟取色和 storage 本机权威语义。
- 不修改既有 eval 判据；本轮新增独立 eval。

---

### Task 1: 后台调度纯函数

**Files:**
- Create: `shared/wallpaper-refresh.js`
- Modify: `tests/background-refresh.test.mjs`

**Interfaces:**
- Produces: `WALLPAPER_REFRESH_ALARM: string`
- Produces: `wallpaperRefreshIntervalMs(background): number`
- Produces: `wallpaperRefreshPlan(background, now, runtimeState): { enabled:boolean, due:boolean, dueAt:number|null, delay:number|null }`
- Produces: `load/save/clearWallpaperRefreshState()`，使用独立 local key 并检查 `chrome.runtime.lastError`

- [ ] **Step 1: 写失败测试**：将现有页面 timer 测试替换为持久计划断言；`lastRefreshAttemptAt` 必须优先阻止失败后的立即自旋。
- [ ] **Step 2: 运行 RED**：`node --test tests/background-refresh.test.mjs`，预期因 `shared/wallpaper-refresh.js` 尚不存在或导出缺失而失败。
- [ ] **Step 3: 最小实现**：间隔为 `refreshEvery * 60000`；基准时间为 `max(lastFetchAt, lastRefreshAttemptAt)`；禁用态返回空计划。
- [ ] **Step 4: 运行 GREEN**：同一命令全部通过。

### Task 2: Service Worker 持久调度

**Files:**
- Modify: `manifest.json`
- Modify: `background.js`
- Modify: `shared/background.js`
- Modify: `tests/offline-static.test.mjs`

**Interfaces:**
- Consumes: `wallpaperRefreshPlan()` 与 `WALLPAPER_REFRESH_ALARM`
- Consumes: `downloadOnlineBackground(source, { requestPermission:false })`
- Produces: Service Worker 在 install/startup/config-change/alarm 四个入口执行同一个 `reconcileWallpaperRefresh()`

- [ ] **Step 1: 写静态失败测试**：要求 manifest 声明 `alarms`，Service Worker 注册 alarm/config/startup 入口，页面模块不再包含 `createOnlineRefreshScheduler`。
- [ ] **Step 2: 运行 RED**：`node --test tests/offline-static.test.mjs`，预期缺少后台接线而失败。
- [ ] **Step 3: 最小实现**：为 manifest 增加 `alarms`；Service Worker 在外部 I/O 前先确认独立运行状态和 retry alarm 已落地，下载结束后只更新运行状态，结束后重新创建下一次 one-shot alarm。
- [ ] **Step 4: 权限边界**：`ensurePermission` 先查询 `chrome.permissions.contains`；自动刷新传 `requestPermission:false`，缺少权限直接返回失败，手动刷新继续允许主动请求。
- [ ] **Step 5: 删除页面 scheduler**：`applyBackground` 只负责当前页面显示；自动状态变化只重新应用背景，不读改写整份 `fn_config`。
- [ ] **Step 6: 运行 GREEN**：`node --test tests/background-refresh.test.mjs tests/offline-static.test.mjs`。

### Task 3: 无页面真实扩展回归

**Files:**
- Create: `tools/wallpaper-background-check.cjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `npm run verify:wallpaper-background`

- [ ] **Step 1: 复用已建立的 RED**：测试只启动扩展 Service Worker，不打开 Fu Nav 页面，写入已过期在线壁纸配置并等待缓存 ID 与抓取时间改变。
- [ ] **Step 2: 运行 GREEN**：`node tools/wallpaper-background-check.cjs .`，预期输出 `ok:true`、`noNewtabPage:true`。
- [ ] **Step 3: 运行全量**：`npm test && npm run verify:static && npm run verify:e2e && npm run verify:wallpaper-background`。
- [ ] **Step 4: 运行 eval checker**：`python3 ~/.claude/eval-kit/check_eval.py --eval docs/superpowers/evals/2026-08-18-durable-wallpaper-refresh-eval.md --state eval-state-durable-wallpaper.json`，预期退出 0。
