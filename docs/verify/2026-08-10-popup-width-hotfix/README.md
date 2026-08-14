# 工具栏收藏 popup 宽度修复验收记录

日期：2026-08-10
判据：`HOTFIX-POPUP-WIDTH-001`

## RED

命令：`node tools/popup-layout-check.cjs .`

- action popup `innerWidth`: 128px
- 标题高度：67.5px
- 结果：`popup viewport 过窄或过宽：128px`

静态测试 `node --test tests/responsive-static.test.mjs` 同时因根宽度仍为 `min(420px,100vw)` 按预期失败。

## GREEN

同一真实扩展检查修复后输出：

- action popup `innerWidth`: 420px
- `document.scrollWidth`: 420px
- 标题高度：22.5px（单行）
- 双列表单宽度：388px
- 主操作宽度：188px，右边界 404px，小于 420px 视口

## 全量回归

- `npm test`: 80 passed, 0 failed
- `npm run verify:static`: 全部 PASS
- `npm run verify:e2e`: `ok: true`，popup 二级目录保存成功，console errors 0
- `node tools/popup-layout-check.cjs .`: `ok: true`
