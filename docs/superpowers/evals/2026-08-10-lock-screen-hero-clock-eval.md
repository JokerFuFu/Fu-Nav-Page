# 锁屏式首页时钟 Eval（验收合约）

> 铁律：下列判据只增不删不改；执行方只允许在证据实际通过后翻转 `passes`。

```yaml
suite: lock-screen-hero-clock-2026-08-10
criteria:
  - id: HERO-CLOCK-001
    assertion: 时钟是搜索框上方的独立首页英雄元素，不带 fx-wcard，不由 buildWidgetCards、组件排序、组件删除或工作区 hiddenWidgets 管理。
    verification: node --test tests/offline-static.test.mjs
    passes: true

  - id: HERO-CLOCK-002
    assertion: 旧配置中的全部 clock widgets 在迁移中被移除且不会补回；showClock 与合法个性化配置保留，重复迁移幂等。
    verification: node --test tests/hero-clock.test.mjs
    passes: true

  - id: HERO-CLOCK-003
    assertion: 时钟支持 system/rounded/serif/mono 字体、compact/standard/large 大小、light/regular/bold 字重、solid/shadow/outline 样式、12/24 小时制、time/date/full 信息量及 auto/light/dark/custom 颜色模式；非法值确定性回退。
    verification: node --test tests/hero-clock.test.mjs
    passes: true

  - id: CLOCK-TONE-001
    assertion: 自动取色把时钟区域原图亮度和当前黑色遮罩共同纳入计算，在浅色与深色代表样本上选择不同文字 tone，获选大字时间对有效背景的对比度均不低于 3:1；采样失败安全回退。
    verification: node --test tests/hero-clock.test.mjs
    passes: true

  - id: CLOCK-SETTINGS-001
    assertion: 设置外观区提供“显示锁屏时钟”和“自定义时钟”，编辑器复用可访问表单基元并保存全部个性化字段；组件管理器不显示时钟。
    verification: node --test tests/accessibility-static.test.mjs tests/offline-static.test.mjs
    passes: true

  - id: CLOCK-RESPONSIVE-001
    assertion: 1024×768 下时钟、搜索和至少八个常用网站完整位于首屏；390×844 下时钟保持锁屏层级且页面没有横向溢出。
    verification: npm run verify:e2e
    passes: true

  - id: CLOCK-E2E-001
    assertion: 真实扩展从含 clock widget 的旧配置启动后，首页以独立英雄时钟显示有效时间并持久化无 clock widget 状态；明暗背景自动 tone 不同；手动样式保存后优先；切换工作区时钟保持可见且切回全部收藏后原收藏顺序完整恢复。
    verification: npm run verify:e2e
    passes: true

  - id: CLOCK-REG-001
    assertion: 本轮修改未破坏既有单元、静态、弹窗、书签、存储、云同步及真实扩展产品流程。
    verification: npm test && npm run verify:static && npm run verify:e2e
    passes: true
```
