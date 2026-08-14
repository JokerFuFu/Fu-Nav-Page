# 工作区首页联动与时钟修复 Eval（验收合约）

> 铁律：下列判据只增不删不改；执行方只允许在证据实际通过后翻转 `passes`。

```yaml
suite: workspace-home-clock-fix-2026-08-10
criteria:
  - id: WS-HOME-001
    assertion: 普通工作区首页收藏只包含 mode.groupIds 对应分组中的条目，锁定顺序、自动常用和容量规则继续复用现有排名算法；空 groupIds 不回退到全局收藏。
    verification: node --test tests/favorites.test.mjs
    passes: true

  - id: WS-HOME-002
    assertion: activeMode 为 null 时的首页收藏结果与改动前直接调用 rankFavorites 完全相同，输入 favOrder 与条目数据均不被修改。
    verification: node --test tests/favorites.test.mjs
    passes: true

  - id: CLOCK-001
    assertion: showClock=true 但 widgets 缺少 clock 时，界面不得继续把开关呈现为真实启用；用户执行启用动作后恰好补入一个 clock，重复启用不重复。
    verification: node --test tests/home-settings.test.mjs
    passes: true

  - id: CLOCK-002
    assertion: 关闭时钟只隐藏 clock，不删除组件、不改变 widgets 的顺序；重新开启后原位置恢复可见。
    verification: node --test tests/home-settings.test.mjs
    passes: true

  - id: CLOCK-003
    assertion: 对历史遗留的 showClock=true 且缺少 clock 组件状态，启动迁移只补入一次时钟并持久化；showClock=false 时不补，用户今后主动删除时钟会同步关闭开关，避免重启复活。
    verification: node --test tests/home-settings.test.mjs && npm run verify:e2e
    passes: true

  - id: USER-DATA-001
    assertion: 当前优化备份 showClock=true 且包含恰好一个 clock 组件；favOrder、工作区、分组和收藏内容未因本修复被重排。
    verification: node tools/verify-bookmark-optimization.mjs fu-nav-backup-2026-08-10.json fu-nav-backup-2026-08-10-optimized.json && node -e "const c=require('./fu-nav-backup-2026-08-10-optimized.json'); if(c.settings.showClock!==true||c.settings.widgets.filter(w=>w.type==='clock').length!==1)process.exit(1)"
    passes: true

  - id: LIVE-E2E-001
    assertion: 真实扩展界面中时钟显示有效时间；从全部收藏切到工作区后首页只剩该工作区网站，切回全部收藏后原全局收藏顺序完整恢复。
    verification: npm run verify:e2e
    passes: true

  - id: REG-001
    assertion: 本轮修改未破坏既有单元、静态与真实扩展产品流程。
    verification: npm test && npm run verify:static && npm run verify:e2e
    passes: true
```
