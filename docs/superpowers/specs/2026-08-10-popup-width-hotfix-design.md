# Fu 导航 · 工具栏收藏弹窗宽度修复 Product Spec

日期：2026-08-10
状态：按用户“完全自主执行”约束直接实施
配套计划：`docs/superpowers/plans/2026-08-10-popup-width-hotfix-plan.md`
验收合约：`eval.md` 的 `HOTFIX-POPUP-WIDTH-001`

## 问题与根因

工具栏收藏 popup 在 Chrome 中被压缩为窄列，标题、表单和操作按钮逐字换行。回归来自 `c041723`：`body{width:420px}` 被替换为 `width:min(420px,100vw);max-width:100vw`。浏览器在创建 action popup 时尚未确定 viewport，viewport 单位参与首选尺寸计算形成循环依赖，最终按内容最小宽度收缩。真实扩展自动复现测得 `innerWidth=118px`、标题高度 `90px`。

## 方案比较

1. **恢复明确的 420px popup 首选宽度（采用）**：符合 Chrome action popup 的尺寸模型，恢复改动前行为，风险和改动面最小。
2. **只加 `min-width` 并保留 `100vw`**：仍让 viewport 单位参与初始尺寸协商，不能可靠消除循环依赖。
3. **运行时由 JavaScript 设置宽度**：CSS 首次布局仍会先窄后宽，产生闪动，且将纯布局问题错误地下沉到脚本。

## 设计

- action popup 根页面使用明确的 420 CSS px 首选宽度，不在根尺寸上使用 `vw`。
- 表单控件继续保留 `min-width:0` 和内部防溢出规则；网址与保存位置维持双列，底部操作维持横排。
- Chrome/Edge 工具栏 popup 实测宽度必须在 400–440px；标题不得逐字换行，主操作不得被裁切。
- 普通页面、新标签页和移动端响应式规则不改；本修复只处理浏览器 action popup。

## 自动验收

- 静态回归测试禁止 popup 根宽度重新使用 `vw`，并要求明确的 420px 首选宽度。
- 真实扩展测试通过 `chrome.action.openPopup()` 打开 action popup，再以 Chrome DevTools Protocol 读取其真实 viewport 和关键元素几何。
- 全量 Node 测试、静态合约检查和既有产品 E2E 必须继续通过。
