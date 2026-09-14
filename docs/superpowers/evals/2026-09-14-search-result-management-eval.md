# 搜索结果管理 Eval

```yaml
suite: search-result-management-2026-09-14
criteria:
  - id: SEARCH-MANAGE-001
    assertion: 搜索结果面板提供局部编辑开关；开启后每条结果可调用现有完整网站编辑器，且不改变全局锁定状态。
    verification: node --test tests/search-results-static.test.mjs && npm run verify:search-results
    passes: true

  - id: SEARCH-HOME-DROP-001
    assertion: 搜索结果无需全局解锁即可拖到首页，稳定 ID 被去重追加到 favOrder 并固定显示，重复投放不重复。
    verification: npm run verify:search-results
    passes: true

  - id: SEARCH-FOLDER-DROP-001
    assertion: 搜索结果可拖到侧栏分组或已展开文件夹；原网站被移动而非复制，稳定 ID、元数据和首页固定状态保留。
    verification: npm run verify:search-results
    passes: true

  - id: SEARCH-A11Y-001
    assertion: 搜索管理控件具有可访问名称、aria-pressed 和不小于 32px 的命中区；普通搜索点击打开行为保持不变。
    verification: node --test tests/search-results-static.test.mjs tests/accessibility-static.test.mjs
    passes: true

  - id: SEARCH-REG-001
    assertion: 搜索管理功能未破坏既有单元、静态、popup、书签、工作区、壁纸和真实扩展产品流程。
    verification: npm test && npm run verify:static && npm run verify:search-results && npm run verify:e2e
    passes: true
```
