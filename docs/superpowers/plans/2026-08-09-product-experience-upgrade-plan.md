# Fu 导航 · 产品体验与可靠性升级 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完整实现 P0–P2 产品优化，使 Fu 导航在交互正确性、数据安全、首屏效率、首次使用、规模化管理、可访问性、离线能力和工作区管理上形成可验证闭环。

**Architecture:** 保留 Manifest V3、原生 ES Modules、现有 `Core` 与设计 token，先把配置、树、URL、搜索和导入逻辑抽成无 DOM 的纯模块，并用 Node 内置测试固定行为；新标签页、popup 和 service worker 通过这些共享模块逐步收口。UI 改动继续使用现有 DOM 工具和 CSS 体系，避免框架迁移。

**Tech Stack:** Chrome/Edge Manifest V3、原生 JavaScript ES Modules、HTML/CSS、Node.js `node:test`、Chrome Storage/Bookmarks/Identity APIs、pinyin-pro 3.18.2（固定版本、MIT、随扩展打包）。

## Autonomous Execution Contract

- 实施 agent 自主完成全部任务，不向用户请求逐步查看、验收或批准。
- 遇到一般歧义时按 spec、eval、`CLAUDE.md` 和现有产品行为依次裁决，选择影响面最小、可回滚的方案，并把决策补进 plan。
- 只有缺少外部凭据且不存在本地替代、操作目标无法唯一确定，或继续执行会造成范围外不可恢复损失时，才允许记录为真实 blocker；不得把测试失败、实现困难或需要浏览器走查当作人工 blocker。
- agent 自己执行浏览器矩阵、键盘走查、扩展能力验证和证据截图；不把任何验收步骤转交给用户。
- 每个行为改动严格遵守 RED → GREEN → REFACTOR；未看到预期失败不得写生产代码。
- `eval.md` 判据只增不删不改，只在证据完成后翻转 `passes`。

**简要执行提示词：** 在 `Fu-Nav-Page` 根目录工作；完整阅读 `AGENTS.md`、`CLAUDE.md`、本 spec/plan/eval；完全自主按 TDD 实施 P0→P1→P2，不请求人工查看、验收或批准；复杂决策写回三件套；保护已有修改和凭据；持续执行并自行验证到 eval 全绿。

## Global Constraints

- 继续使用 Manifest V3 和原生 ES Modules，不引入运行时框架。
- 自动化单元测试使用 Node.js 内置 `node:test`，不新增测试运行时依赖。
- 保持 Chrome 与 Edge 的“加载已解压”安装方式。
- 保持现有配置向前兼容；迁移必须幂等，失败时保留原配置。
- 深色、浅色、自动主题均保持可用。
- 所有 UI 改动遵守 `DESIGN.md`；缺少规则时先更新设计规范。
- 页面和弹窗不得依赖联网才能完成导航、搜索、分组和编辑。
- 新增远程服务或第三方代码必须固定版本、记录许可证并在 README 披露。
- `eval.md` 是完成的唯一定义；判据只增不删不改，只更新 `passes`。
- 不修改或提交用户现有的 `.claude/launch.json` 变更。
- 以公开仓库 3.23.1 为实施基线，保留场景模式、七步引导、使用统计、Provider action、frecency favorites、本地 Inter 字体和 CI 语法闸门。
- `chrome.storage.local` 保持唯一权威；sync 仅作新设备引导快照；popup 使用 `fn_inbox` 增量交付；云端只允许显式手动恢复。

---

## File Map

### 新建

- `package.json`：Node 内置测试和静态验收命令。
- `tests/helpers/fixtures.mjs`：稳定配置、树、增量操作和恢复差异测试夹具。
- `tests/*.test.mjs`：配置、同步策略、树、搜索、导入、场景模式和静态规则测试。
- `tools/verify-static.mjs`：敏感字段、远程版本、权限和可访问名称静态检查。
- `shared/config-schema.js`：默认值、v2→v3 迁移、校验和规范化。
- `shared/config-secrets.js`：凭据拆分、注入和安全载荷。
- `shared/sync-policy.js`：本机权威、inbox 幂等、删除优先和显式恢复差异。
- `shared/config-history.js`：最近五份本机快照。
- `shared/config-import.js`：解析、校验和差异预览。
- `shared/tree.js`：递归树操作的唯一实现。
- `shared/url.js`：URL 规范化和重复等级。
- `shared/search-index.js`：统一搜索索引和模糊评分。
- `shared/runtime-state.js`：同步、权限、onboarding 和诊断状态。
- `shared/library-manager.js`：批量操作与重复聚类的纯逻辑。
- `shared/modes.js`：现有场景模式的增删改排、归档和影响统计。
- `vendor/pinyin-pro.esm.js`、`vendor/pinyin-pro.LICENSE`：固定版本拼音匹配实现与许可证。

### 修改

- `shared/storage.js`：保持本机唯一权威，增加 secrets、历史快照、inbox 幂等和配额状态。
- `shared/cloud.js`：只接收安全配置载荷，返回结构化状态。
- `shared/core.js`：改为编排共享模块，复用现有 Provider action、场景模式、导入和编辑状态。
- `shared/icon-map.js`：复用 `shared/url.js`，固定远程源并提供本地 fallback。
- `shared/icons.js`：本地图标优先与品牌图标缓存。
- `shared/weather.js`：定位同意和数据来源状态。
- `shared/bmsync.js`、`background.js`：使用共享 schema/tree/url/storage 接口。
- `layouts/fusion.js`：首屏层级、筛选语义、书签库、工作区、ARIA 与统一拖拽。
- `layouts/fusion.css`：高度响应、抽屉导航、书签库、对比度和组件紧凑态。
- `shared/base.css`：焦点、live region、dialog/menu 和通用可访问样式。
- `popup.html`、`popup.js`、`popup.css`：目录树、最近位置、重复提示和高级编辑。
- `newtab.html`：移除无用预连接，加载本地资源。
- `manifest.json`：可选权限、无用 host 权限和版本号。
- `data/seed.json`：去掉默认硬件失败组件，标记演示模板。
- `README.md`、`DESIGN.md`、`CLAUDE.md`：产品行为、权限、网络、组件和新踩坑记录。

---

### Task 1: 建立零依赖测试与静态验收基线

**Files:**
- Create: `package.json`
- Create: `tests/helpers/fixtures.mjs`
- Create: `tests/baseline.test.mjs`
- Create: `tools/verify-static.mjs`

**Interfaces:**
- Produces: `npm test -- <file>`；`npm run verify:static`；`makeConfig()`、`makeGroup()`、`makeSite()`、`makeFolder()`。

- [x] **Step 1: 写测试入口和夹具测试**

```js
// tests/baseline.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeConfig, makeSite } from './helpers/fixtures.mjs';

test('fixture returns isolated versioned configs', () => {
  const first = makeConfig({ groups: [{ id: 'g1', items: [makeSite('i1')] }] });
  const second = makeConfig();
  first.groups[0].name = 'changed';
  assert.equal(first.version, 3);
  assert.equal(second.groups.length, 0);
});
```

- [x] **Step 2: 运行测试并确认因夹具缺失而失败**

Run: `node --test tests/baseline.test.mjs`
Expected: FAIL，提示无法导入 `tests/helpers/fixtures.mjs`。

- [x] **Step 3: 创建 package 与测试夹具**

```json
{
  "name": "fu-nav-page",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test",
    "verify:static": "node tools/verify-static.mjs"
  }
}
```

```js
// tests/helpers/fixtures.mjs
export const makeSite = (id = 'i1', extra = {}) => ({ id, name: id, url: `https://${id}.example.com/`, updatedAt: 100, ...extra });
export const makeFolder = (id = 'f1', items = [], extra = {}) => ({ id, type: 'folder', name: id, items, updatedAt: 100, ...extra });
export const makeGroup = (id = 'g1', items = [], extra = {}) => ({ id, name: id, icon: 'folder', color: '#64748b', items, updatedAt: 100, ...extra });
export function makeConfig(extra = {}) {
  return structuredClone({ version: 3, revision: 1, savedAt: 100, tombstones: {}, settings: { askProvider: 'bing', cloud: { enabled: false, type: 'webdav', url: '', gdriveClientId: '' } }, groups: [], ...extra });
}
```

- [x] **Step 4: 创建首版静态检查器**

`tools/verify-static.mjs` 递归读取受控源码文件，输出每条规则的 PASS/FAIL，并在任意失败时设置 `process.exitCode = 1`。首版规则检查 `eval.md`、spec、plan 均存在，后续任务逐项增加安全、权限和可访问性规则。

- [x] **Step 5: 运行基线**

Run: `npm test -- tests/baseline.test.mjs`
Expected: 1 test passed, 0 failed。
Run: `npm run verify:static`
Expected: 三件套存在性检查 PASS。

- [x] **Step 6: 提交**

```bash
git add package.json tests tools/verify-static.mjs
git commit -m "test: 建立产品升级验收基线"
```

### Task 2: 配置 schema、迁移与凭据隔离

**Files:**
- Create: `shared/config-schema.js`
- Create: `shared/config-secrets.js`
- Create: `tests/config-schema.test.mjs`
- Create: `tests/config-secrets.test.mjs`
- Modify: `shared/storage.js`
- Modify: `shared/core.js`

**Interfaces:**
- Produces: `defaultConfig()`；`migrateConfig(raw, now)`；`validateConfig(raw)`；`splitSecrets(config)`；`injectSecrets(config, secrets)`；`sanitizeConfig(config)`；`loadSecrets()`；`saveSecrets(secrets)`。

- [ ] **Step 1: 写迁移失败测试**

```js
test('migrates v2 provider and extracts cloud credentials idempotently', () => {
  const raw = makeConfig({ version: 2, settings: { searchEngine: 'google', cloud: { enabled: true, type: 'webdav', url: 'https://dav.example.com', user: 'fu', pass: 'secret' } } });
  const first = migrateConfig(raw, 500);
  const second = migrateConfig(first.config, 900);
  assert.equal(first.config.version, 3);
  assert.equal(first.config.settings.askProvider, 'google');
  assert.equal('user' in first.config.settings.cloud, false);
  assert.equal('pass' in first.config.settings.cloud, false);
  assert.deepEqual(second.config, first.config);
  assert.deepEqual(first.secrets, { cloudUser: 'fu', cloudPass: 'secret' });
});
```

- [ ] **Step 2: 写安全载荷失败测试**

```js
test('sanitized config never contains secret keys or values', () => {
  const raw = makeConfig({ settings: { askProvider: 'bing', agentToken: 'agent-secret', cloud: { enabled: true, type: 'webdav', url: 'https://dav.example.com', user: 'fu', pass: 'dav-secret', gdriveClientId: 'public-client-id' } } });
  const text = JSON.stringify(sanitizeConfig(raw));
  assert.doesNotMatch(text, /dav-secret|agent-secret|"pass"|"user"|agentToken/);
});
```

- [ ] **Step 3: 运行并确认 RED**

Run: `npm test -- tests/config-schema.test.mjs tests/config-secrets.test.mjs`
Expected: FAIL，两个模块均不存在。

- [ ] **Step 4: 实现 schema 与 secret 边界**

`migrateConfig` 必须克隆输入、补 `version/revision/savedAt/tombstones/updatedAt`、将有效 `searchEngine` 迁入 `askProvider`、提取 `cloud.user/pass` 和 `agentToken`、返回 `{ config, secrets, warnings }`。`sanitizeConfig` 递归删除 `pass/password/token/agentToken/user/cloudUser/cloudPass` 等 secret 字段，但保留 `gdriveClientId`。

`storage.js` 使用键 `fu_nav_secrets_v1` 保存 secrets：扩展环境固定使用 `chrome.storage.local`，预览环境使用独立的 `localStorage` 键；`saveConfig` 只接收已经清洗的同步配置。

- [ ] **Step 5: Core 启动迁移并持久化凭据**

`Core.boot()` 调用 `migrateConfig`，先保存提取出的 secrets，再把无 secret 的 config 赋给 `this.cfg`。设置保存 WebDAV 时调用 `saveSecrets`，不得把凭据写回 `settings.cloud`。

- [ ] **Step 6: 运行测试与静态扫描**

Run: `npm test -- tests/config-schema.test.mjs tests/config-secrets.test.mjs`
Expected: 全部 PASS。
Run: `rg -n "cloud\.(user|pass)|agentToken" shared data popup.js background.js`
Expected: 仅迁移兼容和本机 secret 接口出现，不得出现在导出或云载荷路径。

- [ ] **Step 7: 提交**

```bash
git add shared/config-schema.js shared/config-secrets.js shared/storage.js shared/core.js tests/config-*.test.mjs
git commit -m "fix: 隔离配置凭据并升级数据结构"
```

### Task 3: 加固本机权威、增量操作与本机历史

**Files:**
- Create: `shared/sync-policy.js`
- Create: `shared/config-history.js`
- Create: `tests/sync-policy.test.mjs`
- Create: `tests/config-history.test.mjs`
- Modify: `shared/storage.js`
- Modify: `shared/core.js`
- Modify: `shared/cloud.js`

**Interfaces:**
- Produces: `applyInboxOps(config, ops, seenOpIds)` → `{ config, applied, skipped, seenOpIds }`；`diffRestore(current, candidate)`；`saveSnapshot(config, reason)`；`listSnapshots()`；`restoreSnapshot(id)`。

- [ ] **Step 1: 写增量操作删除优先测试**

```js
test('delete wins stale edit while unrelated edit survives and replay is idempotent', () => {
  const config = makeConfig({ groups: [makeGroup('g1', [makeSite('gone'), makeSite('kept')])] });
  const ops = [
    { opId: 'op-del', at: 300, op: 'del', id: 'gone' },
    { opId: 'op-old-edit', at: 200, op: 'edit', id: 'gone', patch: { name: 'stale' } },
    { opId: 'op-edit', at: 310, op: 'edit', id: 'kept', patch: { name: 'updated' } }
  ];
  const first = applyInboxOps(config, ops, new Set());
  const second = applyInboxOps(first.config, ops, first.seenOpIds);
  assert.equal(JSON.stringify(first.config).includes('gone'), false);
  assert.equal(first.config.groups[0].items[0].name, 'updated');
  assert.equal(second.applied, 0);
});
```

- [ ] **Step 2: 写恢复差异与快照轮换测试**

`diffRestore` 必须列出新增、更新、删除和同 ID 冲突，但不得自动应用；第六份快照写入后只保留最新五份，恢复返回迁移并校验后的 config。

- [ ] **Step 3: 运行并确认 RED**

Run: `npm test -- tests/sync-policy.test.mjs tests/config-history.test.mjs`
Expected: FAIL，模块不存在。

- [ ] **Step 4: 实现本机权威同步策略**

保留现有 `chrome.storage.local` 唯一权威和 sync 首次引导行为。为 `fn_inbox` 操作补 `opId/at`，在本机维护有界的已消费 opId 集；按时间排序应用，删除优先于更早的新增/编辑，重放同一 opId 不产生二次变化。不得增加任何后台整份远端 merge。

- [ ] **Step 5: 接入 save、remote change 和 cloud**

`Core._applyInbox` 改用 `applyInboxOps`；`onRemoteChange` 只处理本机 local/inbox，不响应跨设备 sync 推送。`cloudPut` 只接受 `sanitizeConfig(this.cfg)`；云恢复先创建快照和差异摘要，再由显式“合并副本/保留本机/使用云端”操作应用，绝不自动拉取。

- [ ] **Step 6: 验证**

Run: `npm test -- tests/sync-policy.test.mjs tests/config-history.test.mjs`
Expected: 全部 PASS。
Run: `npm test`
Expected: 0 failed。

- [ ] **Step 7: 提交**

```bash
git add shared/sync-policy.js shared/config-history.js shared/storage.js shared/core.js shared/cloud.js tests/sync-policy.test.mjs tests/config-history.test.mjs
git commit -m "fix: 加固本机权威同步与恢复历史"
```

### Task 4: 导入校验、差异预览与回滚

**Files:**
- Create: `shared/config-import.js`
- Create: `tests/config-import.test.mjs`
- Modify: `shared/core.js`
- Modify: `layouts/fusion.js`
- Modify: `shared/base.css`

**Interfaces:**
- Produces: `parseImport(text, current, now)` → `{ ok, candidate, diff, errors }`；`applyImport(core, result)`。

- [ ] **Step 1: 写无效导入不改变当前配置测试**

```js
test('rejects malformed trees and reports exact paths', () => {
  const current = makeConfig();
  const result = parseImport(JSON.stringify({ version: 3, settings: {}, groups: [{ id: 'g1', items: [{ id: 'i1', name: 'missing url' }] }] }), current, 500);
  assert.equal(result.ok, false);
  assert.match(result.errors[0].path, /groups\[0\]\.items\[0\]\.url/);
  assert.deepEqual(current, makeConfig());
});
```

- [ ] **Step 2: 写差异摘要测试**

候选配置新增一项、更新一项、删除一项、包含一个规范化重复时，`diff` 精确返回 `{ added:1, updated:1, removed:1, duplicates:1, invalid:0 }` 和对应 ID 列表。

- [ ] **Step 3: RED、实现、GREEN**

Run: `npm test -- tests/config-import.test.mjs`
Expected before implementation: FAIL。
实现解析、校验、迁移副本和差异算法；UI 使用标准 dialog 展示摘要，确认后调用 `saveSnapshot` 再应用。
Run: `npm test -- tests/config-import.test.mjs`
Expected after implementation: PASS。

- [ ] **Step 4: 把本地导入和云恢复接入同一流水线**

`Core.importBackup`、`Core.cloudRestore` 和历史恢复都必须经过 `parseImport` 或等价 schema 校验；取消预览时不写 storage、不 rerender。

- [ ] **Step 5: 提交**

```bash
git add shared/config-import.js shared/core.js layouts/fusion.js shared/base.css tests/config-import.test.mjs
git commit -m "feat: 增加导入预览校验与回滚"
```

### Task 5: 统一树操作并修复锁定/嵌套交互

**Files:**
- Create: `shared/tree.js`
- Create: `tests/tree.test.mjs`
- Modify: `shared/core.js`
- Modify: `layouts/fusion.js`
- Modify: `layouts/fusion.css`
- Modify: `shared/bmsync.js`
- Modify: `popup.js`

**Interfaces:**
- Produces: `walkTree(groups)`；`locateNode(groups, id)`；`removeNode(groups, id)`；`moveNode(groups, id, destination)`；`countTree(items)`；`canMoveNode(groups, id, destination)`。

- [ ] **Step 1: 写两级嵌套移动和删除测试**

```js
test('moves a nested site to another group and deletes it recursively', () => {
  const site = makeSite('deep');
  const groups = [makeGroup('g1', [makeFolder('f1', [makeFolder('f2', [site])])]), makeGroup('g2')];
  assert.equal(moveNode(groups, 'deep', { groupId: 'g2' }).ok, true);
  assert.equal(locateNode(groups, 'deep').group.id, 'g2');
  assert.equal(removeNode(groups, 'deep').node.id, 'deep');
  assert.equal(locateNode(groups, 'deep'), null);
});
```

- [ ] **Step 2: 写循环与深度限制测试**

移动文件夹到自身或后代、创建第三级文件夹必须返回 `{ ok:false, code:'invalid-destination' }`，且原树不变。

- [ ] **Step 3: RED、实现、GREEN**

Run: `npm test -- tests/tree.test.mjs`
Expected before implementation: FAIL。
实现纯函数并替换 Core、书签同步、popup 的重复递归逻辑。
Run: `npm test -- tests/tree.test.mjs`
Expected after implementation: PASS。

- [ ] **Step 4: 收口编辑模式**

`wireSidebarDnD`、`wireGridDnD`、folder drop 和 favorite drag 仅在 `core.editing` 时绑定；所有 draggable 属性、抓取光标、编辑帮助文案和卡片操作按钮均从 `core.editing` 派生。解锁/锁定入口使用一个 `core.setEditing(boolean)` 方法。

- [ ] **Step 5: 增加页面计数**

分组标题显示“顶层 N 项 · 共 M 网站”，文件夹卡显示“X 网站 · Y 子文件夹”；grid/detail 两种视图都可见。

- [ ] **Step 6: 提交**

```bash
git add shared/tree.js shared/core.js shared/bmsync.js layouts/fusion.js layouts/fusion.css popup.js tests/tree.test.mjs
git commit -m "fix: 统一嵌套树操作和编辑锁定语义"
```

### Task 6: 统一 Provider、筛选语义和 URL 规范化

**Files:**
- Create: `shared/url.js`
- Create: `tests/url.test.mjs`
- Create: `tests/provider.test.mjs`
- Modify: `shared/core.js`
- Modify: `shared/icon-map.js`
- Modify: `layouts/fusion.js`
- Modify: `popup.js`
- Modify: `background.js`

**Interfaces:**
- Produces: `normalizeUrl(url, mode)`；`classifyDuplicate(a, b)`；`setAskProvider(id)`；`submitAsk(text)`。

- [ ] **Step 1: 写 URL 规范化和重复等级测试**

```js
test('normalizes safe URL differences without collapsing business queries', () => {
  assert.equal(normalizeUrl('HTTPS://Example.com:443/path/?utm_source=x#top', 'strict'), 'https://example.com/path');
  assert.equal(classifyDuplicate('https://www.example.com/a', 'http://example.com/a').level, 'possible');
  assert.equal(classifyDuplicate('https://example.com/item?id=1', 'https://example.com/item?id=2').level, 'distinct');
});
```

- [ ] **Step 2: 写 Provider 状态测试**

迁移后的设置只读写 `askProvider`；切换 Provider 返回 `{ submitted:false }` 且不调用 opener；只有 `submitAsk` 调用一次 opener。分组筛选 Enter 只提交本地 filter，不调用 `submitAsk`。

- [ ] **Step 3: RED、实现、GREEN**

Run: `npm test -- tests/url.test.mjs tests/provider.test.mjs`
Expected before implementation: FAIL。
实现并让 `icon-map.js` 兼容性重导出 `normalizeUrl`；统一 newtab、popup、badge 的重复口径。
Run: `npm test -- tests/url.test.mjs tests/provider.test.mjs`
Expected after implementation: PASS。

- [ ] **Step 4: 修复页面事件**

Provider 菜单点击只更新按钮、placeholder 和 settings；首页发送按钮/Enter 调用 `submitAsk`。分组、文件夹输入框的 placeholder、input、keydown 均使用“筛选”，Escape 清空，Enter 不跳出页面。

- [ ] **Step 5: 修复 copy 型 AI 反馈**

复制成功后在新开标签前更新可访问 live region 和 provider 按钮状态为“已复制，请粘贴”，状态保持至少 8 秒或直到下一次输入。

- [ ] **Step 6: 提交**

```bash
git add shared/url.js shared/core.js shared/icon-map.js layouts/fusion.js popup.js background.js tests/url.test.mjs tests/provider.test.mjs
git commit -m "fix: 统一搜索服务商筛选与网址口径"
```

### Task 7: 重排首页首屏与组件策略

**Files:**
- Modify: `DESIGN.md`
- Modify: `layouts/fusion.js`
- Modify: `layouts/fusion.css`
- Modify: `shared/core.js`
- Modify: `data/seed.json`
- Create: `tests/home-settings.test.mjs`

**Interfaces:**
- Produces: `homeDensity(width, height)` → `comfortable|compact|mobile`；`visibleWidgets(settings)`。

- [ ] **Step 1: 先更新设计规范**

在 `DESIGN.md` 增加首页顺序“搜索 → 常用 → 组件”、高度断点 820px、1024×768 首屏要求、1100px 自动折叠建议和移动抽屉规则；不改变色彩、圆角和字体 token。

- [ ] **Step 2: 写密度与组件可见性失败测试**

```js
test('uses compact home and hides unconfigured hardware at laptop height', () => {
  assert.equal(homeDensity(1024, 768), 'compact');
  const settings = { widgets: [{ id: 'w1', type: 'hwmon', url: '' }, { id: 'w2', type: 'today' }] };
  assert.deepEqual(visibleWidgets(settings).map(x => x.id), ['w2']);
});
```

- [ ] **Step 3: RED、实现、GREEN**

Run: `npm test -- tests/home-settings.test.mjs`
Expected before implementation: FAIL。
把密度判断写成纯函数，DOM 只消费结果 class。
Run: `npm test -- tests/home-settings.test.mjs`
Expected after implementation: PASS。

- [ ] **Step 4: 调整 DOM 顺序和 CSS**

`renderHome` 依次创建搜索、favorites、widgets。紧凑态将 hero clock 降为 title-scale，日期与问候同行，组件卡高度收紧；1024×768 下前 8 个 favorites 的完整卡片位于 viewport 内。

- [ ] **Step 5: 更新 seed**

删除默认 `w-hw1`，保留时钟、天气和今日卡；加入 `demoMode:true`，首页显示可关闭的演示标识，直到用户完成 onboarding 或第一次实际编辑。

- [ ] **Step 6: 截图矩阵验证**

启动本地服务器，验证深/浅主题 × 1440×900、1268×714、1024×768、768×800、390×844；记录 `scrollHeight`、favorites 底边和 console 错误数。

- [ ] **Step 7: 提交**

```bash
git add DESIGN.md layouts/fusion.js layouts/fusion.css shared/core.js data/seed.json tests/home-settings.test.mjs
git commit -m "feat: 让搜索和常用回到首页首屏"
```

### Task 8: 首次使用、天气同意与按需权限

**Files:**
- Create: `shared/runtime-state.js`
- Create: `tests/onboarding.test.mjs`
- Modify: `shared/storage.js`
- Modify: `shared/weather.js`
- Modify: `shared/core.js`
- Modify: `layouts/fusion.js`
- Modify: `layouts/fusion.css`
- Modify: `manifest.json`
- Modify: `README.md`

**Interfaces:**
- Produces: `loadRuntimeState()`；`saveRuntimeState(patch)`；`requestCapability(name)`；`completeOnboarding(choice)`。

- [ ] **Step 1: 写 onboarding 状态机测试**

三种选择必须产生互斥结果：bookmark 选择只在用户点击后请求权限，template 保留演示数据并去掉提示，blank 清空 groups；三者都设置 `completed:true`。天气在 `weatherConsent:false` 时不得调用定位 fetch。

- [ ] **Step 2: RED、实现、GREEN**

Run: `npm test -- tests/onboarding.test.mjs`
Expected before implementation: FAIL。
实现 runtime state 和同意守卫。
Run: `npm test -- tests/onboarding.test.mjs`
Expected after implementation: PASS。

- [ ] **Step 3: 构建三选一 onboarding dialog**

对话框解释每个选项的数据结果；关闭等同“稍后决定”，不得静默选模板。启用天气时展示 `ipwho.is/get.geojs.io + Open-Meteo` 数据流说明。

- [ ] **Step 4: 调整权限**

将平台允许按需申请的 `bookmarks`、`identity` 移入 `optional_permissions`；用户拒绝时展示不阻塞的说明。保留角标所需的最小权限，并在 README 准确解释。

- [ ] **Step 5: 提交**

```bash
git add shared/runtime-state.js shared/storage.js shared/weather.js shared/core.js layouts/fusion.js layouts/fusion.css manifest.json README.md tests/onboarding.test.mjs
git commit -m "feat: 增加首次使用与按需授权流程"
```

### Task 9: 统一搜索索引、书签库、批量与重复处理

**Files:**
- Create: `vendor/pinyin-pro.esm.js`
- Create: `vendor/pinyin-pro.LICENSE`
- Create: `shared/search-index.js`
- Create: `shared/library-manager.js`
- Create: `tests/search-index.test.mjs`
- Create: `tests/library-manager.test.mjs`
- Modify: `shared/core.js`
- Modify: `layouts/fusion.js`
- Modify: `layouts/fusion.css`
- Modify: `README.md`

**Interfaces:**
- Produces: `buildSearchIndex(config)`；`querySearchIndex(index, query, options)`；`clusterDuplicates(items)`；`applyBulkOperation(config, ids, operation)`。

- [ ] **Step 1: 固定第三方源码与许可证**

从 `pinyin-pro@3.18.2` 官方发布包提取浏览器 ESM 构建，保存完整 MIT LICENSE；在 README Third-party 区记录版本、用途和上游地址。源码不得从 CDN 动态加载。

- [ ] **Step 2: 写拼音和模糊搜索失败测试**

```js
test('matches Chinese names by full pinyin, initials and typo-tolerant latin text', () => {
  const index = buildSearchIndex(makeConfig({ groups: [makeGroup('g1', [makeSite('i1', { name: '家庭网络', url: 'https://nas.example.com', aliases: ['nas'] })])] }));
  assert.equal(querySearchIndex(index, 'jiatingwangluo')[0].id, 'i1');
  assert.equal(querySearchIndex(index, 'jtwl')[0].id, 'i1');
  assert.equal(querySearchIndex(index, 'nsa')[0].id, 'i1');
});
```

- [ ] **Step 3: 写批量操作与重复聚类测试**

批量移动深层网站保留 ID 和 metadata；批量删除写墓碑；精确重复自动成组，possible 重复只提示不自动合并，业务查询不同保持 distinct。

- [ ] **Step 4: RED、实现、GREEN**

Run: `npm test -- tests/search-index.test.mjs tests/library-manager.test.mjs`
Expected before implementation: FAIL。
实现索引、评分、批量纯函数和重复聚类。
Run: `npm test -- tests/search-index.test.mjs tests/library-manager.test.mjs`
Expected after implementation: PASS。

- [ ] **Step 5: 构建书签库 UI**

命令面板和设置增加“打开书签库”。书签库包含搜索、分组/状态筛选、结果计数、多选、全选当前结果、批量移动/删除、重复组和失效链接视图。所有危险操作先显示影响数量并创建快照。

- [ ] **Step 6: 接入标签、别名与备注**

网站编辑器增加 `tags:string[]` 和 `aliases:string[]`，输入使用逗号分隔并规范化去重；搜索索引包含 name/url/note/tags/aliases/group/folder path。

- [ ] **Step 7: 提交**

```bash
git add vendor shared/search-index.js shared/library-manager.js shared/core.js layouts/fusion.js layouts/fusion.css README.md tests/search-index.test.mjs tests/library-manager.test.mjs
git commit -m "feat: 增加书签库拼音搜索与批量管理"
```

### Task 10: 升级工具栏弹窗为目录级收藏器

**Files:**
- Modify: `popup.html`
- Modify: `popup.js`
- Modify: `popup.css`
- Create: `tests/popup-model.test.mjs`
- Modify: `shared/tree.js`
- Modify: `shared/url.js`

**Interfaces:**
- Produces: `buildDestinationOptions(groups, recents)`；`savePopupItem(config, form)`；storage key `fu_nav_recent_destinations_v1`。

- [ ] **Step 1: 写目录树和最近位置测试**

两级文件夹按完整路径输出；最近位置去重、最多三个、已删除目录自动剔除；保存到二级文件夹后 `locateNode` 能找到新网站。

- [ ] **Step 2: 写重复提示测试**

精确重复阻止默认保存并提供“打开已有/仍然保存”；possible 重复允许确认；distinct 直接保存。

- [ ] **Step 3: RED、实现、GREEN**

Run: `npm test -- tests/popup-model.test.mjs`
Expected before implementation: FAIL。
把 popup 的纯数据逻辑放在可导入函数中，再连接 Chrome tabs/storage。
Run: `npm test -- tests/popup-model.test.mjs`
Expected after implementation: PASS。

- [ ] **Step 4: 构建可访问目录树和高级编辑**

目录触发器显示完整路径，支持方向键展开/收起；默认显示快速保存，高级区提供备注、常用、面板打开和图标。所有 `label` 使用 `for`，图标按钮提供名称。

- [ ] **Step 5: 提交**

```bash
git add popup.html popup.js popup.css shared/tree.js shared/url.js tests/popup-model.test.mjs
git commit -m "feat: 支持弹窗保存到嵌套文件夹"
```

### Task 11: 建立 dialog、menu、表单与 live region 可访问基元

**Files:**
- Modify: `shared/core.js`
- Modify: `shared/base.css`
- Modify: `layouts/fusion.js`
- Modify: `popup.html`
- Modify: `popup.js`
- Modify: `tools/verify-static.mjs`
- Create: `tests/a11y-static.test.mjs`

**Interfaces:**
- Produces: `openDialog({ title, content, initialFocus, onClose })`；`closeDialog()`；`announce(message, tone)`；`openMenu(anchor, items)`。

- [ ] **Step 1: 写静态失败测试**

检查所有 dialog 有 `aria-modal` 和 `aria-labelledby`，可见 label 有 `for` 或包含控件，图标按钮有文本/`title`/`aria-label`，展开按钮有 `aria-expanded`。

- [ ] **Step 2: 运行并记录现有失败数量**

Run: `npm test -- tests/a11y-static.test.mjs`
Expected: FAIL，并列出 settings 与 popup 的无名称控件。

- [ ] **Step 3: 实现可访问基元**

`openDialog` 保存先前焦点、把标题 ID 写入 `aria-labelledby`、Tab/Shift+Tab 循环、Escape 关闭、关闭后恢复焦点。`openMenu` 使用 roving tabindex，支持 ArrowUp/Down、Home/End、Enter/Space、Escape。

- [ ] **Step 4: 全面替换调用点**

覆盖设置、网站/分组/文件夹编辑器、导入预览、书签库、工作区管理、背景面板、命令面板和 popup。同步、复制、保存、错误消息统一调用 `announce`。

- [ ] **Step 5: GREEN 与键盘手测**

Run: `npm test -- tests/a11y-static.test.mjs`
Expected: PASS。
操作：仅用键盘打开设置、遍历控件、打开并操作右键菜单、关闭后焦点回到触发按钮。

- [ ] **Step 6: 提交**

```bash
git add shared/core.js shared/base.css layouts/fusion.js popup.html popup.js tools/verify-static.mjs tests/a11y-static.test.mjs
git commit -m "fix: 补齐对话框菜单和表单可访问性"
```

### Task 12: 重组设置、同步诊断与安全导出

**Files:**
- Modify: `shared/core.js`
- Modify: `layouts/fusion.js`
- Modify: `shared/base.css`
- Modify: `shared/storage.js`
- Modify: `shared/cloud.js`
- Create: `tests/diagnostics.test.mjs`

**Interfaces:**
- Produces: `buildDiagnostics(core)`；`redactDiagnostics(value)`；`exportSafeBackup(core)`。

- [ ] **Step 1: 写脱敏诊断测试**

输入包含 WebDAV URL userinfo、agent token、密码和网站清单时，输出只保留配置字节数、版本、状态、权限布尔值和错误 code，不包含 secret 或完整网站列表。

- [ ] **Step 2: RED、实现、GREEN**

Run: `npm test -- tests/diagnostics.test.mjs`
Expected before implementation: FAIL。
实现结构化诊断与脱敏。
Run: `npm test -- tests/diagnostics.test.mjs`
Expected after implementation: PASS。

- [ ] **Step 3: 重组设置信息架构**

顺序固定为“常用、数据与同步、外观、组件、高级与诊断”。常用默认展开，其余收起；设置 dialog 在 720px 高度下标题和底部主操作保持 sticky，内容区独立滚动。

- [ ] **Step 4: 显示持久状态**

诊断区显示 schema/revision、同步配置字节数、最后本机保存、最后云备份、冲突、权限、本机 Agent 和最近错误；提供复制脱敏诊断、查看五份快照、恢复和删除快照。

- [ ] **Step 5: 验证安全载荷**

设置 WebDAV 凭据后导出备份并调用 cloud payload builder，对两个 JSON 运行 secret 扫描，必须零命中。

- [ ] **Step 6: 提交**

```bash
git add shared/core.js shared/base.css shared/storage.js shared/cloud.js layouts/fusion.js tests/diagnostics.test.mjs
git commit -m "feat: 重组设置并增加同步诊断"
```

### Task 13: 本地核心图标、权限与网络披露收口

**Files:**
- Modify: `shared/icon-map.js`
- Modify: `shared/icons.js`
- Modify: `newtab.html`
- Modify: `manifest.json`
- Modify: `README.md`
- Modify: `tools/verify-static.mjs`
- Create: `tests/offline-static.test.mjs`

**Interfaces:**
- Produces: 本地 `lucide(name)` 映射；`brandIconCandidates(item)` 的本地优先候选列表。

- [ ] **Step 1: 写静态失败测试**

禁止运行时代码出现 `@latest`、`@main`、未固定 jsDelivr 包地址；manifest 禁止 `v1.hitokoto.cn`；README 权限表必须覆盖 manifest permissions/host permissions。

- [ ] **Step 2: 运行 RED**

Run: `npm test -- tests/offline-static.test.mjs`
Expected: FAIL，列出当前远程图标和未使用权限。

- [ ] **Step 3: 打包核心图标并提供 fallback**

将代码实际引用的 Lucide SVG 固定在本地模块；品牌图标候选顺序为扩展 favicon API → 本机缓存 → 固定版本远程源 → 字母 fallback。断网不得产生未捕获错误。

- [ ] **Step 4: 清理 manifest 与 HTML**

移除 hitokoto host 权限和无字体样式对应的 gstatic/jsDelivr preconnect；核对所有剩余 host 权限均有源码调用和 README 解释。

- [ ] **Step 5: GREEN 与离线手测**

Run: `npm test -- tests/offline-static.test.mjs`
Expected: PASS。
浏览器离线后打开新标签页，分组、搜索、编辑、设置和 popup 均可识别并无 console error。

- [ ] **Step 6: 提交**

```bash
git add shared/icon-map.js shared/icons.js newtab.html manifest.json README.md tools/verify-static.mjs tests/offline-static.test.mjs
git commit -m "fix: 固定核心图标并收紧网络权限"
```

### Task 14: 场景模式（工作区）管理闭环

**Files:**
- Create: `shared/modes.js`
- Create: `tests/modes.test.mjs`
- Modify: `shared/core.js`
- Modify: `layouts/fusion.js`
- Modify: `layouts/fusion.css`

**Interfaces:**
- Produces: `listModes(settings)`；`createMode(settings, name)`；`renameMode(settings, id, name)`；`reorderModes(settings, ids)`；`archiveMode(settings, id)`；`restoreMode(settings, id)`；`deleteMode(settings, id)`。

- [ ] **Step 1: 写工作区影响测试**

基于现有 `settings.modes`：创建名称去空格且拒绝重复；重命名保留 mode id 和 groupIds；排序只改变 modes 顺序；归档保留完整配置但不出现在常用切换列表；恢复后原配置不变；删除模式不删除分组，若正在激活则回到全部收藏。

- [ ] **Step 2: RED、实现、GREEN**

Run: `npm test -- tests/modes.test.mjs`
Expected before implementation: FAIL。
实现纯函数。
Run: `npm test -- tests/modes.test.mjs`
Expected after implementation: PASS。

- [ ] **Step 3: 构建管理界面**

扩展现有侧栏模式入口和管理 dialog，显示分组数、创建、重命名、排序、归档、恢复和删除。删除前明确说明只删除模式、不删除分组。

- [ ] **Step 4: 命令面板接入**

保留切换/新建操作，新增“管理场景模式”和“恢复归档模式”，搜索结果使用统一 search index；用户搜索“工作区”也能命中这些操作。

- [ ] **Step 5: 提交**

```bash
git add shared/modes.js shared/core.js layouts/fusion.js layouts/fusion.css tests/modes.test.mjs
git commit -m "feat: 完成场景模式管理闭环"
```

### Task 15: 移动抽屉、内容密度与背景对比度收口

**Files:**
- Modify: `DESIGN.md`
- Modify: `layouts/fusion.js`
- Modify: `layouts/fusion.css`
- Modify: `shared/base.css`
- Modify: `shared/background.js`
- Create: `tests/responsive-static.test.mjs`

**Interfaces:**
- Produces: `setSidebarOpen(boolean)`；CSS states `sidebar-open`、`home-compact`、`content-sparse`。

- [ ] **Step 1: 写响应式静态测试**

760px breakpoint 必须包含 fixed drawer、scrim、关闭按钮和 body scroll guard；`prefers-reduced-motion` 覆盖抽屉与所有新增动效；文件夹 metadata 不得在 grid view 隐藏。

- [ ] **Step 2: RED、实现、GREEN**

Run: `npm test -- tests/responsive-static.test.mjs`
Expected before implementation: FAIL。
实现移动抽屉、稀疏内容宽度、可见文件夹计数和背景 scrim token。
Run: `npm test -- tests/responsive-static.test.mjs`
Expected after implementation: PASS。

- [ ] **Step 3: 视觉矩阵验证**

在 1440×900、1268×714、1024×768、768×800、390×844 下验证 home/group/folder/settings/palette/library/workspaces/popup；每个尺寸覆盖深浅主题和背景图模式。检查横向溢出、首屏 favorites、焦点环、小字号对比度和抽屉关闭路径。

- [ ] **Step 4: 提交**

```bash
git add DESIGN.md layouts/fusion.js layouts/fusion.css shared/base.css shared/background.js tests/responsive-static.test.mjs
git commit -m "feat: 收口响应式导航与背景可读性"
```

### Task 16: 端到端回归、文档与 eval 全绿

**Files:**
- Modify: `eval.md`（只更新 `passes`）
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `manifest.json`
- Create: `docs/verify/2026-08-09-product-experience-upgrade/README.md`

**Interfaces:**
- Consumes: Tasks 1–15 的全部接口。
- Produces: 可复现验收记录、最终版本号和全绿 `eval.md`。

- [ ] **Step 1: 运行完整自动化套件**

Run: `npm test`
Expected: 0 failed。
Run: `npm run verify:static`
Expected: 所有静态规则 PASS。

- [ ] **Step 2: 执行五条组合场景**

逐条执行 spec 第 11 节的安装/导入/popup/同步、并发删除、Provider、1024×768 首屏和 secret 安全场景；在验证记录中写入环境、步骤、实际结果和证据路径。

- [ ] **Step 3: 执行真实扩展能力检查**

在全新 Chrome 或 Edge profile 中加载已解压扩展，验证按需书签权限、popup 当前标签、per-tab 已收藏角标、storage sync、WebDAV 权限请求、天气同意和离线启动。

- [ ] **Step 4: 更新文档**

README 更新首次使用、书签库、工作区、隐私、权限、网络和恢复说明；CLAUDE.md 追加本轮数据迁移、secret、树操作和可访问基元的踩坑规则；manifest version 按语义化版本升级。

- [ ] **Step 5: 逐条更新 eval**

只在对应命令 exit 0 或人工步骤证据完成后，将该项 `passes: false` 改为 `passes: true`。不得修改 ID、断言、验证方式或阈值。任意 false 都阻止完成声明。

- [ ] **Step 6: 最终提交**

```bash
git add eval.md README.md CLAUDE.md manifest.json docs/verify/2026-08-09-product-experience-upgrade
git commit -m "chore: 完成产品体验升级验收"
```

---

## Plan Self-Review Checklist

- [ ] Spec 的 P0 正确性、安全、同步和首屏分别映射到 Tasks 2–7。
- [ ] Spec 的 P1 首次使用、规模化管理、popup 和可访问性分别映射到 Tasks 8–11。
- [ ] Spec 的 P2 设置、离线、工作区和响应式分别映射到 Tasks 12–15。
- [ ] 每个生产行为任务都有先失败、后实现、再通过的测试步骤。
- [ ] 所有新接口在首次使用前已经定义。
- [ ] 所有命令都给出预期结果。
- [ ] `eval.md` 至少包含一条跨 newtab、popup、storage 的端到端判据。
- [ ] 计划没有省略项、占位符或未定义的后续工作。
