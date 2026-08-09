# 原收藏目录结构恢复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把上一版已恢复但平铺的 `Fu 导航` 网站按浏览器原文件夹树自动重组，并完整保留现有网站元数据。

**Architecture:** 在现有书签恢复纯函数模块中新增结构重建函数，Core 只负责既有权限检查、快照、版本标记和持久化。迁移先按规范化 URL 复用现有网站，再按 Chrome 文件夹树重建容器；无法匹配的网站进入 `未归类`。

**Tech Stack:** Chrome Manifest V3、原生 JavaScript ES Modules、Node.js `node:test`、Playwright 真实扩展 E2E。

## Global Constraints

- 不修改已有 eval 判据，只追加本轮判据并在验证通过后翻转 `passes`。
- 不删除网站，不覆盖现有网站 ID、名称、备注、标签、图标、收藏状态和访问统计。
- 不静默请求书签权限，不开启双向同步，不反向写浏览器书签。
- 浏览器原目录树是唯一分类事实；只有源目录外的现有网站进入 `未归类`。
- 全程自主执行，不设置人工查看、验收或批准门槛。

---

### Task 1: 目录结构重建纯函数

**Files:**
- Modify: `shared/bookmark-recovery.js`
- Modify: `tests/bookmark-recovery.test.mjs`

**Interfaces:**
- Consumes: `normalizeUrl(url, 'strict')`、现有导航 config、Chrome bookmark folder。
- Produces: `rebuildBookmarkFolderStructure(config, folder, { makeId, color })`。

- [ ] **Step 1: 写失败测试**

构造一个已平铺的 `Fu 导航` 分组和带“开发 / 前端 / 文档”嵌套结构的浏览器目录。现有网站带自定义名称、备注、标签与固定 ID；另有一个源目录外网站。

```js
const result = rebuildBookmarkFolderStructure(config, source, { makeId: () => `new-${++seq}` });
const development = result.config.groups[0].items.find(item => item.type === 'folder' && item.name === '开发');
const frontend = development.items.find(item => item.type === 'folder' && item.name === '前端');
assert.equal(frontend.items[0].id, 'keep-id');
assert.equal(frontend.items[0].note, '保留备注');
assert.equal(result.config.groups[0].items.find(item => item.name === '未归类').items[0].id, 'extra-id');
```

- [ ] **Step 2: 运行 RED**

Run: `node --test tests/bookmark-recovery.test.mjs`

Expected: FAIL，`rebuildBookmarkFolderStructure` 尚未导出。

- [ ] **Step 3: 最小实现**

实现网站池、源 ID/路径文件夹池和递归转换。网站按 strict URL 只消费一次；源外网站移入 `未归类`；返回总数和结构统计。

```js
export function rebuildBookmarkFolderStructure(input, folder, options = {}) {
  const config = clone(input || {});
  // index existing sites/folders -> recursively build source children -> append unclassified
  return { config, changed, total, folders, reused, added, unclassified, groupId };
}
```

- [ ] **Step 4: 验证 GREEN 和幂等**

Run: `node --test tests/bookmark-recovery.test.mjs`

Expected: 所有结构测试通过；把首次结果再次输入时网站和文件夹 ID 不变、`changed === false`。

### Task 2: Core 结构升级

**Files:**
- Modify: `shared/core.js`
- Modify: `tests/bookmark-recovery.test.mjs`
- Modify: `newtab.html`
- Modify: `layouts/fusion.js`
- Modify: `manifest.json`

**Interfaces:**
- Consumes: Task 1 的 `rebuildBookmarkFolderStructure`。
- Produces: `Core.recoverOriginalBookmarkStructure()` 和 `settings.bookmarkStructureRecoveryV327`。

- [ ] **Step 1: 写 Core 失败测试**

```js
const method = core.match(/async recoverOriginalBookmarkStructure\(\)[\s\S]*?\n  \}/)?.[0] || '';
assert.match(method, /chrome\.permissions\.contains/);
assert.doesNotMatch(method, /chrome\.permissions\.request/);
assert.match(method, /bookmarkStructureRecoveryV327/);
assert.match(method, /bookmark-structure-recovery/);
```

- [ ] **Step 2: 运行 RED**

Run: `node --test tests/bookmark-recovery.test.mjs`

Expected: FAIL，Core 尚无结构升级方法。

- [ ] **Step 3: 实现一次性结构迁移**

在旧网址恢复之后调用新方法。方法只检查既有权限，选择最大的同名目录，结构变化前保存快照，抑制 `bmPush` 后保存并写新标记；异常由 boot 捕获并留待下次重试。

```js
try { await this.recoverOriginalBookmarkStructure(); }
catch (error) { console.warn('原收藏目录结构恢复失败，保留当前配置并等待重试', error); }
```

- [ ] **Step 4: 提升运行时缓存版本并验证**

把 newtab/core/layout 查询版本提升一个补丁号，manifest 提升补丁版本。

Run: `npm test`

Expected: 全量测试通过，离线模块 URL 仍严格一致。

### Task 3: 真实扩展旧用户迁移 E2E

**Files:**
- Modify: `tools/product-e2e-check.cjs`

**Interfaces:**
- Consumes: 已完成旧扁平恢复的配置、带两层子目录的 Chrome bookmark tree。
- Produces: `evidence.bookmarkStructureRecovery`。

- [ ] **Step 1: 扩充 E2E 源目录与断言**

模拟配置设置 `bookmarkRecoveryV326: true` 且目标分组网站平铺；浏览器源放置根层网站、一级文件夹和二级文件夹。启动后递归定位路径并验证原网站 ID/备注。

```js
assert(pathOf(group.items, `${base}/recovery/two`).join('/') === '旧子目录/更深目录/恢复网站二');
assert(recovered.id === 'recovery-keep' && recovered.note === '原备注');
assert(config.settings.bookmarkStructureRecoveryV327 === true);
```

- [ ] **Step 2: 运行真实扩展 E2E**

Run: `npm run verify:e2e`

Expected: 结构标记写入，目录路径正确，网站总数不变，权限请求 0，第二次启动 ID/路径不变，console error 0。

### Task 4: 全量门禁、验收记录与提交

**Files:**
- Modify: `eval.md`（只翻本轮新增 passes）
- Create: `docs/verify/2026-08-09-bookmark-structure-recovery/README.md`

- [ ] **Step 1: 运行完整门禁**

Run: `npm test`

Run: `npm run verify:static`

Run: `npm run verify:e2e`

Run: `git diff --check`

Expected: 全部 exit 0。

- [ ] **Step 2: 写验收记录并翻绿**

记录源目录树、迁移前后网站总数、路径、复用 ID、未归类、幂等和权限请求数量；只把 `HOTFIX-BOOKMARK-STRUCTURE-001` 与 `HOTFIX-BOOKMARK-STRUCTURE-E2E-001` 的 `passes` 从 false 改为 true。

- [ ] **Step 3: 提交**

```bash
git add shared/bookmark-recovery.js shared/core.js newtab.html layouts/fusion.js manifest.json tests/bookmark-recovery.test.mjs tools/product-e2e-check.cjs eval.md docs/verify
git commit -m "fix: 按原目录重组恢复收藏"
```
