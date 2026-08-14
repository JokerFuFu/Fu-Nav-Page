# 壁纸按频率自动更新 Implementation Plan

**Goal:** 让在线壁纸在首页打开期间严格由用户选择的更新频率驱动，并在成功拉取后立即更新当前页面。

**Architecture:** 在 `shared/background.js` 内增加一个可注入时钟边界的单实例排期器；`applyBackground` 负责按当前首页和背景状态同步排期，设置页保存频率后重新调用背景应用以即时重排。现有 `refreshOnlineBackground` 继续负责来源解析、缓存和最后请求获胜。

**Tech Stack:** Chrome Manifest V3、原生 JavaScript ES Modules、Node.js `node:test`、Playwright 真实扩展 E2E。

## Autonomous Execution Contract

- 全过程自动执行，不请求用户人工查看、验收或批准。
- 严格按 RED → GREEN：新增测试必须先在旧实现上真实失败，再修改生产代码。
- 本次 eval 的 gate 判据只增不删不改；状态仅由 checker 写入独立 state 文件。
- 保留工作树已有改动，不重置、不覆盖、不提交无关文件。
- 不进行与壁纸自动更新无关的重构。

## Tasks

1. 新增 `tests/background-refresh.test.mjs`，用可控时钟证明当前实现缺少持续排期，并记录 RED 输出。
2. 在 `shared/background.js` 实现一次性自动刷新排期器：按持久化时间计算等待时长，到期执行并在结束后重排，停用条件立即清理计时器。
3. 让自动拉取成功后重新应用当前首页背景；保留旧图作为失败回退，并沿用现有请求竞态保护。
4. 在 `layouts/fusion.js` 的预设频率与自定义分钟保存路径中触发背景状态同步，使设置立即生效。
5. 扩展 `tools/product-e2e-check.cjs`，加入“到期在线壁纸在当前页自动替换”的组合场景。
6. 运行专项测试、`npm test`、`npm run verify:static`、`npm run verify:e2e`，最后运行本次独立 eval checker。
