# Fu 导航 · 工具栏收藏弹窗宽度修复 Implementation Plan

**Goal:** 消除 Chrome 工具栏收藏 popup 的窄列回归，恢复合理横向布局。

**Approach:** 先把真实 action popup 的几何测量固化为自动测试，再恢复明确首选宽度；不改 popup 信息架构和业务逻辑。

## Autonomous Execution Contract

- 全过程自动执行，不请求用户人工查看、验收或批准。
- 严格按 RED → GREEN：先确认真实扩展测试抓到窄宽度，再修改生产 CSS。
- `eval.md` 新增判据后只翻转 `passes`，不修改既有判据。

## Tasks

- [x] 创建真实扩展 popup 几何检查脚本，确认当前版本因宽度小于 400px 失败。
- [x] 更新 `DESIGN.md`，明确 action popup 的根尺寸规则。
- [x] 恢复 `popup.css` 的 420px 明确首选宽度并保留内部防溢出。
- [x] 更新静态响应式测试，防止 `vw` 循环依赖回归。
- [x] 运行 popup 专项、Node 全量、静态合约和产品 E2E。
- [x] 将 `HOTFIX-POPUP-WIDTH-001.passes` 在证据全部通过后翻为 `true`。
