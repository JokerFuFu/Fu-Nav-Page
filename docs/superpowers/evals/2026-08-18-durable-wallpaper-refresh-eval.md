# 壁纸后台持久自动更新 Eval

```yaml
contract:
  version: 1
  task: durable-wallpaper-refresh-2026-08-18
  spec: docs/superpowers/specs/2026-08-18-durable-wallpaper-refresh-design.md
  plan: docs/superpowers/plans/2026-08-18-durable-wallpaper-refresh-plan.md

gate:
  - id: DURABLE-WALLPAPER-PLAN-001
    assertion: 在线壁纸计划以用户频率和最近成功/尝试时间计算，失败后不会立即自旋；仅手动、关闭背景和非在线模式不创建计划。
    run: node --test tests/background-refresh.test.mjs

  - id: DURABLE-WALLPAPER-WIRING-001
    assertion: Manifest 和 Service Worker 持有唯一自动更新调度职责，页面不再依赖短命 timer。
    run: node --test tests/offline-static.test.mjs tests/background-refresh.test.mjs

  - id: DURABLE-WALLPAPER-E2E-001
    assertion: 没有任何 Fu Nav 页面打开时，真实扩展 Service Worker 仍会更新已过期在线壁纸的缓存和抓取时间。
    run: node tools/wallpaper-background-check.cjs .

  - id: DURABLE-WALLPAPER-LIFECYCLE-001
    assertion: Service Worker 在外部下载前已预排 retry alarm，未来 alarm 能主动唤醒刷新，迟到响应不会覆盖新配置，自动任务不会请求新 host 权限。
    run: node tools/wallpaper-background-check.cjs .

  - id: DURABLE-WALLPAPER-REG-001
    assertion: 持久自动更新未破坏既有单元、静态与真实扩展产品流程。
    run: npm test && npm run verify:static && npm run verify:e2e && node tools/wallpaper-background-check.cjs .

human: []
```
