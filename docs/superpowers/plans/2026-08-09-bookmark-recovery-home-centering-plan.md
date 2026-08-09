# 原收藏恢复与首页居中 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 无损恢复浏览器 `Fu 导航` 收藏文件夹，并让首页搜索与常用区在右侧主区获得稳定的光学居中。

**Architecture:** 书签数据转换放进无 DOM 的纯函数模块，Core 只负责权限边界、快照与持久化。首页新增主任务容器，CSS 用明确的 6/8/4 列 flex basis 让不满行卡片居中，并按有无组件选择垂直舞台。

**Tech Stack:** Chrome Manifest V3、原生 JavaScript ES Modules、CSS、Node.js `node:test`、Playwright 真实扩展 E2E。

## Global Constraints

- `eval.md` 原判据只增不删不改，只在实际验证通过后翻转本轮 `passes`。
- 收藏恢复只增不删，不覆盖现有条目元数据，不自动申请权限或开启双向同步。
- 视觉继续使用 `DESIGN.md` token；390、768、1024、1268、1440 宽度无横向溢出。
- 全程自主执行，不设置人工查看、验收或批准门槛。

---

### Task 1: 书签恢复纯函数

**Files:**
- Create: `shared/bookmark-recovery.js`
- Create: `tests/bookmark-recovery.test.mjs`

**Interfaces:**
- Produces: `findLargestNamedFolder(tree, title='Fu 导航')`。
- Produces: `mergeBookmarkFolder(config, folder, { makeId, color }) -> { config, added, duplicates, total, groupId }`。

- [ ] **Step 1: 写失败测试**

测试构造两份 `Fu 导航` 文件夹、深层子目录、URL 尾斜杠重复项和带备注的现有条目；断言选择数据较多的一份，展平后新增缺失 URL，现有条目的 ID/备注不变，第二次执行 `added === 0`。

```js
const folder=findLargestNamedFolder(tree,'Fu 导航');
assert.equal(folder.id,'large');
const first=mergeBookmarkFolder(config,folder,{makeId:()=>`new-${++seq}`,color:'#64748b'});
assert.equal(first.added,2);
assert.equal(first.config.groups[0].items.find(item=>item.url==='https://keep.example/').note,'保留备注');
const second=mergeBookmarkFolder(first.config,folder,{makeId:()=>`repeat-${++seq}`,color:'#64748b'});
assert.equal(second.added,0);
```

- [ ] **Step 2: 运行 RED**

Run: `node --test tests/bookmark-recovery.test.mjs`

Expected: FAIL，原因是 `shared/bookmark-recovery.js` 尚不存在。

- [ ] **Step 3: 最小实现**

用递归计数和展平实现两个导出函数；克隆输入配置，使用 `normalizeUrl(..., 'strict')` 对目标分组去重，不改变输入对象。

```js
export function findLargestNamedFolder(tree,title='Fu 导航'){
  return collectFolders(tree).filter(folder=>folder.title===title)
    .sort((a,b)=>countBookmarks(b)-countBookmarks(a))[0]||null;
}

export function mergeBookmarkFolder(input,folder,{makeId,color='#64748b'}={}){
  const config=structuredClone(input||{});
  const sites=flattenBookmarks(folder?.children||[]);
  // 查找或创建同名分组，只把严格规范化后缺失的 URL 追加进去。
  return {config,added,duplicates,total:sites.length,groupId:group.id};
}
```

- [ ] **Step 4: 运行 GREEN**

Run: `node --test tests/bookmark-recovery.test.mjs`

Expected: PASS。

### Task 2: Core 一次性自动恢复

**Files:**
- Modify: `shared/core.js`
- Modify: `tests/bookmark-recovery.test.mjs`
- Modify: `tools/product-e2e-check.cjs`

**Interfaces:**
- Consumes: Task 1 两个纯函数。
- Produces: `Core.recoverOriginalBookmarks()`。

- [ ] **Step 1: 写失败测试与 E2E 断言**

静态断言 Core 使用 `chrome.permissions.contains` 而不是 `request`；E2E 在已授权页面注入包含 `Fu 导航` 的浏览器书签树，断言目标分组存在、重复 URL 只有一条、恢复标记已写入。

```js
assert.match(core,/async recoverOriginalBookmarks\(\)/);
assert.match(core,/chrome\.permissions\.contains/);
assert.doesNotMatch(recoveryMethod,/permissions\.request/);
```

- [ ] **Step 2: 运行 RED**

Run: `node --test tests/bookmark-recovery.test.mjs`

Expected: FAIL，原因是 Core 尚未接入恢复函数。

- [ ] **Step 3: 最小实现**

boot 挂载布局后异步调用恢复；只检查既有权限。发现新增时先 `saveSnapshot(this.cfg,'bookmark-recovery')`，再替换配置并 `await save(true)`、rerender、toast；成功核对后写 `bookmarkRecoveryV326`。

```js
async recoverOriginalBookmarks(){
  if(!isExtension||this.settings.bookmarkRecoveryV326)return false;
  const granted=await new Promise(resolve=>chrome.permissions.contains({permissions:['bookmarks']},resolve));
  if(!granted||!bmAvailable())return false;
  const folder=findLargestNamedFolder(await getBookmarksTree(),ROOT_TITLE);
  if(!folder)return false;
  const result=mergeBookmarkFolder(this.cfg,folder,{makeId:()=>uid('i'),color:COLORS[this.groups.length%COLORS.length]});
  if(result.added)await saveSnapshot(this.cfg,'bookmark-recovery');
  this.cfg=result.config;
  this.settings.bookmarkRecoveryV326=true;
  await this.save(true);
  this.rerender();
  return result;
}
```

- [ ] **Step 4: 运行 GREEN 与扩展 E2E**

Run: `npm test`

Run: `npm run verify:e2e`

Expected: 全绿，E2E 输出 `bookmarkRecovery.added > 0` 且 `duplicates === 0`。

### Task 3: 首页主任务块光学居中

**Files:**
- Modify: `layouts/fusion.js`
- Modify: `layouts/fusion.css`
- Modify: `tests/responsive-static.test.mjs`
- Modify: `DESIGN.md`

**Interfaces:**
- Produces: `.fx-home-primary`、`.has-widgets`、`.no-widgets`、`.cols-6`、`.cols-8` 响应式契约。

- [ ] **Step 1: 写失败测试**

断言布局把搜索与常用区包在 `fx-home-primary`，根据 widget 子节点数设置 has/no-widgets；CSS 无组件场景使用 `justify-content:center` 和可用视口高度，6/8 列 flex basis 明确，移动端覆盖为 4 列并取消主舞台最小高度。

```js
assert.match(layout,/fx-home-primary/);
assert.match(layout,/widgets\.childElementCount/);
assert.match(css,/\.fx-home\.no-widgets \.fx-home-primary/);
assert.match(css,/\.fx-favs\.cols-8 \.fx-fav/);
assert.match(css,/\.fx-favs\.cols-6 \.fx-fav/);
```

- [ ] **Step 2: 运行 RED**

Run: `node --test tests/responsive-static.test.mjs`

Expected: FAIL，缺少 `.fx-home-primary`。

- [ ] **Step 3: 最小实现**

`renderHome` 先构造 primary，再构造 widgets；CSS 复用现有 gap/token，桌面无组件垂直居中，有组件使用受控舞台，移动端恢复顶对齐。常用卡改为居中 flex-wrap，并按 cols class 设置 basis。

```js
const primary=el('div','fx-home-primary');
primary.appendChild(buildAsk(core));
const widgets=buildWidgetCards(core,priv);
home.classList.add(widgets.childElementCount?'has-widgets':'no-widgets');
home.append(primary);
if(widgets.childElementCount)home.append(widgets);
```

```css
.lay-fusion .fx-home-primary{width:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:clamp(360px,58dvh,560px)}
.lay-fusion .fx-home.no-widgets .fx-home-primary{min-height:calc(100dvh - 2 * var(--home-pad))}
.lay-fusion .fx-favs{display:flex;flex-wrap:wrap;justify-content:center}
.lay-fusion .fx-favs.cols-8 .fx-fav{flex:0 0 calc((100% - 7 * var(--fav-gap))/8)}
.lay-fusion .fx-favs.cols-6 .fx-fav{flex:0 0 calc((100% - 5 * var(--fav-gap))/6)}
```

- [ ] **Step 4: 运行 GREEN**

Run: `node --test tests/responsive-static.test.mjs`

Expected: PASS。

### Task 4: 全量验证、eval 与提交

**Files:**
- Modify: `eval.md`（只翻本轮 passes）
- Create: `docs/verify/2026-08-09-bookmark-recovery-home-centering/README.md`

- [ ] **Step 1: 运行全量门禁**

Run: `npm test`

Run: `npm run verify:static`

Run: `npm run verify:e2e`

Run: `git diff --check`

Expected: 全部 exit 0。

- [ ] **Step 2: 浏览器几何验收**

在真实扩展 1024×768、1440×900、2048×955 与 390×844 检查主任务中心、末行卡片中心、首屏与横向溢出；无组件桌面场景主任务块中心与右侧可用视口中心误差 ≤2px。

- [ ] **Step 3: 写验收记录并翻转 passes**

记录命令、数量和几何结果；只把 `HOTFIX-BOOKMARK-001`、`HOTFIX-LAYOUT-001`、`HOTFIX-E2E-001` 的 `passes` 从 false 改为 true。

- [ ] **Step 4: 提交**

```bash
git add shared/bookmark-recovery.js shared/core.js layouts/fusion.js layouts/fusion.css DESIGN.md tests/bookmark-recovery.test.mjs tests/responsive-static.test.mjs tools/product-e2e-check.cjs eval.md docs/superpowers docs/verify
git commit -m "fix: 恢复原收藏并居中首页主任务"
```
