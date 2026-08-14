# 壁纸按频率自动更新 Eval

```yaml
contract:
  version: 1
  task: wallpaper-refresh-scheduler-2026-08-14
  spec: docs/superpowers/specs/2026-08-14-wallpaper-refresh-scheduler-design.md
  plan: docs/superpowers/plans/2026-08-14-wallpaper-refresh-scheduler-plan.md
  timeout: 300

gate:
  - id: WALLPAPER-SCHEDULE-001
    assertion: 在线壁纸按用户设置的分钟数安排触发，成功和失败后均按同一频率继续排期；仅手动、离开首页或关闭背景会取消排期。
    run: node --test tests/background-refresh.test.mjs

  - id: WALLPAPER-SETTINGS-001
    assertion: 预设与自定义更新频率保存后会立即同步当前背景排期，不依赖页面重载。
    run: node --test tests/offline-static.test.mjs tests/background-refresh.test.mjs

  - id: WALLPAPER-E2E-001
    assertion: 真实扩展中的在线壁纸到期后会自动拉取并立即替换当前首页背景，无需刷新页面。
    run: npm run verify:e2e

  - id: WALLPAPER-REG-001
    assertion: 壁纸自动更新修改未破坏项目既有单元、静态和真实扩展产品流程。
    run: npm test && npm run verify:static && npm run verify:e2e

human: []
```
