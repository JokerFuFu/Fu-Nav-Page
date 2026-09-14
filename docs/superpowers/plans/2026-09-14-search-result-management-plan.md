# 搜索结果管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户在首页搜索结果中直接固定到首页、拖入侧栏收藏夹，并通过局部编辑态修改网站信息。

**Architecture:** 保留 `buildAsk` 作为搜索浮层所有者，结果项只传稳定 ID；所有写操作复用 Core 的首页固定、树移动和 `openItemEditor`。侧栏拖放从“仅全局编辑态”拆成两层：分组排序仍只在全局编辑态，搜索结果投放始终可用。

**Tech Stack:** Chrome Manifest V3、原生 ES Modules、HTML5 Drag and Drop、Node `node:test`、Playwright 真实扩展 E2E。

## Global Constraints

- 不新增收藏数据 schema，不复制网站对象，不改变稳定 ID。
- 局部搜索编辑态不得切换 `core.editing` 或 `settings.locked`。
- 首页固定写入去重后的 `favOrder`；收藏夹移动保留 `fav`、标签、别名、图标、备注和 iframe 设置。
- 所有 UI 使用 `DESIGN.md` 既有 token、Lucide 图标、32px 以上命中区与 reduced-motion 守卫。
- 不修改主工作区中正在进行的原生提醒功能改动。

---

### Task 1: 验收基线与设计合同

**Files:**
- Modify: `DESIGN.md`
- Create: `tests/search-results-static.test.mjs`
- Modify: `tools/product-e2e-check.cjs`

**Interfaces:**
- Produces: 搜索结果管理区静态断言与真实扩展组合场景。

- [ ] **Step 1: 写静态失败测试**：要求结果头工具、`aria-pressed`、`draggable`、首页/侧栏投放和编辑器复用接线。

```js
assert.match(fusion,/fx-res-edit-toggle/);
assert.match(fusion,/aria-pressed/);
assert.match(fusion,/drag=\{type:'search',iid:it.id\}/);
assert.match(fusion,/core\.openItemEditor\(it,g\.id\)/);
```

- [ ] **Step 2: 写 E2E 失败场景**：注入源条目和带文件夹的目标分组；搜索后拖到首页、文件夹，再打开编辑器修改名称与网址。

```js
await page.getByLabel('搜索或询问').fill('搜索管理测试');
await page.locator('.fx-res').dragTo(page.locator('.fx-res-home-drop'));
await page.locator('.fx-res').dragTo(page.locator('.fx-navfolder[data-folder-id="search-folder"]'));
await page.getByRole('button',{name:'编辑搜索结果'}).click();
```

- [ ] **Step 3: 运行 RED**：`node --test tests/search-results-static.test.mjs` 失败；`npm run verify:e2e` 在缺少管理控件或投放行为处失败。
- [ ] **Step 4: 在 `DESIGN.md` 增加 `search-results-manager` 组件合同，不新增 token。**

### Task 2: 首页固定与局部编辑态

**Files:**
- Modify: `layouts/fusion.js`
- Modify: `layouts/fusion.css`
- Modify: `shared/core.js`

**Interfaces:**
- Consumes: `core.allItems()`、`core.pinFavorite(item)`、`core.openItemEditor(item,gid)`。
- Produces: `.fx-res-tools`、`.fx-res-home-drop`、`.fx-res-edit-toggle`、`.fx-res-edit`。

- [ ] **Step 1: 结果渲染改为容器 + 打开链接 + 可选编辑按钮，整行设置 `draggable=true` 并以稳定 ID 建立 drag payload。**

```js
row.draggable=true;
row.addEventListener('dragstart',event=>{
  drag={type:'search',iid:it.id};
  event.dataTransfer.setData('text/plain',it.id);
});
```

- [ ] **Step 2: 结果头增加首页投放 chip 和局部编辑开关；编辑开关只重画当前结果，不调用全局 `setEditing`。**

```js
editToggle.setAttribute('aria-pressed',String(searchEditing));
editToggle.onclick=()=>{ searchEditing=!searchEditing; renderResults(); };
```

- [ ] **Step 3: 首页放置调用 `pinFavorite`；让 `pinFavorite` 把 ID 去重追加到 `favOrder`，重复投放保持幂等。**

```js
pinFavorite(item){
  item.fav=true;
  const order=this.cfg.favOrder||(this.cfg.favOrder=[]);
  if(!order.includes(item.id))order.push(item.id);
  this.save(true);
}
```

- [ ] **Step 4: 运行静态测试并确认首页投放 E2E 转绿。**

### Task 3: 侧栏分组与文件夹投放

**Files:**
- Modify: `layouts/fusion.js`
- Modify: `layouts/fusion.css`
- Modify: `tools/product-e2e-check.cjs`

**Interfaces:**
- Consumes: `core.moveItemToGroup(iid,gid)`、`core.moveItemToFolder(item,folder,group)`。
- Produces: 搜索 drag payload `{type:'search',iid}`；侧栏分组/文件夹接受该 payload。

- [ ] **Step 1: `buildSidebar` 始终安装搜索投放监听；全局编辑态的分组排序仍受原锁定条件控制。**
- [ ] **Step 2: 侧栏首页接收搜索结果并固定；分组接收并移动到顶层；已展开文件夹接收并移动到文件夹。**

```js
if(drag?.type==='search'){
  const entry=core.allItems().find(row=>row.item.id===drag.iid);
  core.moveItemToFolder(entry.item,folder,group);
}
```

- [ ] **Step 3: 所有 dragend/drop 路径清理 `fx-dragging`、`fx-droptarget` 和全局 drag 状态。**
- [ ] **Step 4: 运行 E2E，断言稳定 ID 唯一、目标路径准确、首页固定状态与网站元数据保留。**

### Task 4: 全量验收

**Files:**
- Modify: `docs/superpowers/evals/2026-09-14-search-result-management-eval.md`

- [ ] **Step 1: 运行 `node --test tests/search-results-static.test.mjs`。**
- [ ] **Step 2: 运行 `npm test && npm run verify:static && npm run verify:e2e`。**
- [ ] **Step 3: 根据真实退出码更新 eval 的 `passes`，不得凭自述切换。**
- [ ] **Step 4: 请求独立只读代码审查，修复全部 Critical/Important 后重跑全量。**
