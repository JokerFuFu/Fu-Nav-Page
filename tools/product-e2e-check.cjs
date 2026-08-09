#!/usr/bin/env node
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { createServer } = require('node:http');
const { homedir, tmpdir } = require('node:os');
const { dirname, join, resolve } = require('node:path');
let playwright = null;
for (const candidate of ['playwright', join(dirname(dirname(process.execPath)), 'node_modules/playwright'), join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')]) {
  try { playwright = require(candidate); break; } catch {}
}
if (!playwright) throw new Error('Playwright 未安装；请先安装 playwright，或在 Codex Desktop 工作区运行');
const { chromium } = playwright;

const extensionPath = resolve(process.argv[2] || '.');
const profile = mkdtempSync(join(tmpdir(), 'fu-nav-product-e2e-'));
const errors = [];
const davRequests = [];
const evidence = {};

function assert(value, message) { if (!value) throw new Error(message); }
function watch(target, label) {
  target.on('pageerror', error => errors.push(`${label}: ${error.message}`));
  target.on('console', message => {
    if (message.type() === 'error' && !/Failed to load resource|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED/i.test(message.text())) errors.push(`${label}: ${message.text()}`);
  });
}
function listen(server, port) { return new Promise((resolveListen, reject) => server.once('error', reject).listen(port, '127.0.0.1', resolveListen)); }
function closeServer(server) { return new Promise(resolveClose => server.close(resolveClose)); }
function storage(page, keys = null) { return page.evaluate(query => new Promise(resolveGet => chrome.storage.local.get(query, resolveGet)), keys); }
function findNodes(config, predicate) {
  const found = [];
  const visit = (items, path = []) => (items || []).forEach(item => {
    const next = [...path, item.name || item.id];
    if (predicate(item, next)) found.push({ item, path: next });
    if (item.type === 'folder') visit(item.items, next);
  });
  (config.groups || []).forEach(group => visit(group.items, [group.name]));
  return found;
}
async function readPermissionState(page) {
  return page.evaluate(async () => {
    const state = await new Promise(resolveGet => chrome.storage.local.get(['fn_runtime_state_v1'], resolveGet));
    return {
      requestCount: window.__fuPermissionRequests,
      permissionState: state.fn_runtime_state_v1?.permission?.bookmarks,
      onboarding: state.fn_runtime_state_v1?.onboarding,
    };
  });
}
async function openNested(page, groupName = 'E2E Data') {
  await page.locator('.fx-navitem').filter({ hasText: groupName }).first().click();
  await page.locator('.fx-folder').filter({ hasText: 'Level One' }).first().click();
  await page.locator('.fx-folder').filter({ hasText: 'Level Two' }).first().click();
}
async function unlock(page) {
  const button = page.getByRole('button', { name: /已锁定/ });
  if (await button.count()) await button.click();
}
async function openPopupForTarget(context, target, extensionId, tag) {
  const popup = await context.newPage();
  popup.setDefaultTimeout(6000);
  watch(popup, `popup-${tag}`);
  await target.bringToFront();
  await popup.goto(`chrome-extension://${extensionId}/popup.html?e2e=${tag}`, { waitUntil: 'domcontentloaded' });
  await popup.waitForSelector('#pop');
  await popup.getByLabel('网站名称').waitFor();
  return popup;
}
async function setTheme(page, wanted) {
  for (let attempts = 0; attempts < 4; attempts += 1) {
    if (await page.evaluate(theme => document.body.dataset.theme === theme, wanted)) return;
    await page.getByRole('button', { name: /^主题：/ }).click();
    await page.waitForTimeout(80);
  }
  throw new Error(`unable to set theme ${wanted}`);
}

(async () => {
  const server = createServer((request, response) => {
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(`<!doctype html><title>${request.url}</title><h1>Fu Nav E2E ${request.url}</h1>`);
    });
  });
  await listen(server, 0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1024, height: 768 },
    acceptDownloads: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  try {
    await context.route('http://127.0.0.1:7842/dav/**', async route => {
      const request = route.request();
      davRequests.push({ method: request.method(), url: request.url(), headers: request.headers(), body: request.postData() || '' });
      if (request.method() === 'PROPFIND') await route.fulfill({ status: 207, contentType: 'application/xml', body: '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"></d:multistatus>' });
      else if (request.method() === 'GET') await route.fulfill({ status: 404, body: '' });
      else await route.fulfill({ status: 201, body: 'ok' });
    });
    await context.addInitScript(({ importUrl, recoveryBase }) => {
      if (typeof chrome === 'undefined' || !chrome.permissions || !location.protocol.startsWith('chrome-extension')) return;
      const recoveryMode = new URLSearchParams(location.search).get('e2e') === 'recovery-granted';
      window.__fuPermissionGrant = recoveryMode;
      window.__fuPermissionGranted = recoveryMode;
      window.__fuPermissionRequests = 0;
      const reply = (callback, value) => queueMicrotask(() => callback(!!value));
      try { Object.defineProperty(chrome.permissions, 'contains', { configurable: true, value: (_query, callback) => reply(callback, window.__fuPermissionGranted) }); } catch {}
      try { Object.defineProperty(chrome.permissions, 'request', { configurable: true, value: (_query, callback) => { window.__fuPermissionRequests += 1; if (window.__fuPermissionGrant) window.__fuPermissionGranted = true; reply(callback, window.__fuPermissionGranted); } }); } catch {}

      let id = 40;
      const barChildren = [{ id: '10', parentId: '1', title: 'E2E 浏览器书签', children: [{ id: '11', parentId: '10', title: '授权导入网站', url: importUrl }] }];
      if (recoveryMode) barChildren.push(
        { id: '20', parentId: '1', title: 'Fu 导航', children: [{ id: '21', parentId: '20', title: '较小旧集合', url: `${recoveryBase}/recovery/small` }] },
        { id: '30', parentId: '1', title: 'Fu 导航', children: [
          { id: '31', parentId: '30', title: '来源名称不应覆盖', url: `${recoveryBase}/recovery/keep/` },
          { id: '32', parentId: '30', title: '恢复网站一', url: `${recoveryBase}/recovery/one` },
          { id: '33', parentId: '30', title: '旧子目录', children: [
            { id: '34', parentId: '33', title: '恢复网站二', url: `${recoveryBase}/recovery/two?utm_source=legacy` },
            { id: '35', parentId: '33', title: '恢复网站一重复', url: `${recoveryBase}/recovery/one/` },
          ] },
        ] },
      );
      const tree = { id: '0', title: '', children: [{ id: '1', title: '书签栏', children: barChildren }] };
      const locate = (node, target) => { if (node.id === target) return node; for (const child of node.children || []) { const hit = locate(child, target); if (hit) return hit; } return null; };
      const detach = target => { let removed = null; const walk = node => { const index = (node.children || []).findIndex(child => child.id === target); if (index >= 0) { [removed] = node.children.splice(index, 1); return true; } return (node.children || []).some(walk); }; walk(tree); return removed; };
      const clone = value => JSON.parse(JSON.stringify(value));
      const bookmarks = {
        getTree: callback => queueMicrotask(() => callback([clone(tree)])),
        getSubTree: (target, callback) => queueMicrotask(() => callback(locate(tree, target) ? [clone(locate(tree, target))] : [])),
        getChildren: (target, callback) => queueMicrotask(() => callback(clone(locate(tree, target)?.children || []))),
        create: (input, callback) => { const parent = locate(tree, input.parentId); const node = { id: String(++id), parentId: input.parentId, title: input.title || '', ...(input.url ? { url: input.url } : { children: [] }) }; parent?.children?.push(node); queueMicrotask(() => callback?.(clone(node))); },
        update: (target, patch, callback) => { const node = locate(tree, target); if (node) Object.assign(node, patch); queueMicrotask(() => callback?.(clone(node))); },
        remove: (target, callback) => { detach(target); queueMicrotask(() => callback?.()); },
        removeTree: (target, callback) => { detach(target); queueMicrotask(() => callback?.()); },
      };
      try { Object.defineProperty(chrome, 'bookmarks', { configurable: true, value: bookmarks }); } catch {}
    }, { importUrl: `${base}/imported`, recoveryBase: base });

    let worker = context.serviceWorkers()[0];
    if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
    const extensionId = new URL(worker.url()).host;
    const home = await context.newPage();
    home.setDefaultTimeout(6000);
    watch(home, 'home');
    await home.goto(`chrome-extension://${extensionId}/newtab.html?e2e=permission`, { waitUntil: 'domcontentloaded' });
    await home.waitForSelector('.lay-fusion');
    await home.getByRole('dialog', { name: '欢迎使用 Fu 导航' }).waitFor();

    // P1-PERM-001：首次拒绝后核心可用，随后从设置再次请求并授权。
    await home.getByRole('button', { name: /导入浏览器书签/ }).click();
    await home.waitForFunction(() => window.__fuPermissionRequests === 1);
    await home.getByRole('dialog', { name: '欢迎使用 Fu 导航' }).waitFor({ state: 'hidden' });
    const denied = await readPermissionState(home);
    assert(denied.permissionState === 'denied', 'denied permission state was not persisted');
    assert(await home.locator('.fx-ask').isVisible(), 'core search unavailable after permission denial');
    assert(await home.locator('.fx-navitem').count() > 0, 'local navigation unavailable after permission denial');
    await home.getByRole('button', { name: '设置', exact: true }).click();
    await home.getByText('数据与同步', { exact: true }).click();
    await home.evaluate(() => { window.__fuPermissionGrant = true; });
    await home.getByRole('button', { name: '设置书签同步' }).click();
    await home.getByRole('checkbox', { name: /启用自动双向同步/ }).check();
    await home.getByRole('button', { name: '保存', exact: true }).click();
    await home.waitForTimeout(350);
    const granted = await readPermissionState(home);
    assert(granted.permissionState === 'granted' && granted.requestCount >= 2, 'settings retry did not grant bookmarks permission');
    evidence.permission = { denied, granted };

    // 通过设置中的真实导入流，将模拟的浏览器书签树导入配置。
    await home.getByText('数据与同步', { exact: true }).click();
    await home.getByRole('button', { name: '导入浏览器书签' }).click();
    await home.getByRole('dialog', { name: '导入浏览器书签' }).waitFor();
    await home.getByRole('button', { name: '导入', exact: true }).click();
    await home.waitForTimeout(250);
    let state = await storage(home, ['fn_config']);
    assert(findNodes(state.fn_config, item => item.url === `${base}/imported`).length === 1, 'authorized bookmark import did not reach config');

    // 注入有两级目录、并发样本和 8 个常用网站的稳定 E2E 基线。
    await home.evaluate(({ baseUrl }) => new Promise(resolveSet => chrome.storage.local.get(['fn_config'], value => {
      const cfg = value.fn_config;
      cfg.settings = { ...cfg.settings, onboarded: true, layout: 'fusion', theme: 'dark', openIn: '_blank', askProvider: 'bing', showWeather: false, showStatus: false, favGrid: { cols: 8, rows: 2 }, locked: true, background: { enabled: false, mode: 'none' } };
      const favorites = Array.from({ length: 8 }, (_, index) => ({ id: `fav-${index + 1}`, name: `Favorite ${index + 1}`, url: `${baseUrl}/favorite-${index + 1}`, fav: true, note: '', icon: '' }));
      cfg.groups = [{ id: 'g-e2e', name: 'E2E Data', icon: 'flask', color: '#4a55f3', items: [...favorites, { id: 'f-level-1', type: 'folder', name: 'Level One', icon: 'folder', items: [{ id: 'f-level-2', type: 'folder', name: 'Level Two', icon: 'folder', items: [{ id: 'delete-me', name: 'Concurrent Delete', url: `${baseUrl}/delete-me`, note: '', icon: '' }, { id: 'edit-me', name: 'Concurrent Edit', url: `${baseUrl}/edit-me`, note: '', icon: '' }] }] }] }];
      cfg.savedAt = Date.now() + 100;
      chrome.storage.local.set({ fn_config: cfg }, resolveSet);
    })), { baseUrl: base });
    await home.reload({ waitUntil: 'domcontentloaded' });
    await home.waitForSelector('.lay-fusion');

    // E2E-001：普通网页 → popup → 二级目录 → 新标签页 → popup 编辑与 badge。
    const target = await context.newPage();
    await target.goto(`${base}/popup-target`, { waitUntil: 'domcontentloaded' });
    const targetTab = await worker.evaluate(url => new Promise(resolveQuery => chrome.tabs.query({}, tabs => resolveQuery(tabs.find(tab => tab.url === url)))), `${base}/popup-target`);
    assert(targetTab?.id != null, 'target tab unavailable for popup E2E');
    let popup = await openPopupForTarget(context, target, extensionId, 'save');
    await popup.getByLabel('网站名称').fill('Popup Saved');
    const destinations = await popup.locator('#pop-destination option').allTextContents();
    const nestedLabel = destinations.find(label => label.includes('E2E Data') && label.includes('Level Two'));
    assert(nestedLabel, `nested destination missing: ${destinations.join(' | ')}`);
    await popup.locator('#pop-destination').selectOption({ label: nestedLabel });
    await popup.getByRole('button', { name: '快速保存' }).click();
    await popup.getByText(/已收藏，已同步到首页/).waitFor();
    await popup.waitForTimeout(180);
    state = await storage(home, ['fn_config']);
    let popupHits = findNodes(state.fn_config, item => item.url === `${base}/popup-target`);
    assert(popupHits.length === 1 && popupHits[0].path.slice(-2).join('/') === 'Level Two/Popup Saved', 'popup save missed exact nested destination');
    await home.waitForTimeout(400);
    const badge = await worker.evaluate(tabId => new Promise(resolveBadge => chrome.action.getBadgeText({ tabId }, resolveBadge)), targetTab.id);
    assert(badge === '✓', `saved-tab badge mismatch: ${badge}`);
    if (!popup.isClosed()) await popup.close();
    popup = await openPopupForTarget(context, target, extensionId, 'edit');
    await popup.getByText(/已收藏.*E2E Data.*Level Two/).waitFor();
    await popup.getByLabel('网站名称').fill('Popup Updated');
    await popup.getByRole('button', { name: '保存', exact: true }).click();
    await popup.getByText(/已保存，已同步到首页/).waitFor();
    await popup.waitForTimeout(180);
    if (!popup.isClosed()) await popup.close();
    await home.bringToFront();
    await home.reload({ waitUntil: 'domcontentloaded' });
    await home.waitForSelector('.lay-fusion');
    const residualDialog = home.locator('#fnBackdrop .fn-modal');
    if (await residualDialog.isVisible()) {
      console.log(`residual-dialog:${await home.locator('#fnMTitle').textContent()}`);
      await home.getByRole('button', { name: '关闭', exact: true }).click();
    }
    await openNested(home);
    assert(await home.getByText('Popup Updated', { exact: true }).count() === 1, 'updated popup item absent from nested newtab view');
    state = await storage(home, ['fn_config']);
    popupHits = findNodes(state.fn_config, item => item.url === `${base}/popup-target`);
    assert(popupHits.length === 1 && popupHits[0].item.name === 'Popup Updated', 'popup update duplicated or lost item');
    evidence.popup = { path: popupHits[0].path, count: popupHits.length, badge };

    // E2E-002：两个真实扩展上下文交错删除/编辑，再叠加显式云副本合并。
    const contextA = home;
    const contextB = await context.newPage();
    contextB.setDefaultTimeout(6000);
    watch(contextB, 'context-b');
    await contextA.goto(`chrome-extension://${extensionId}/newtab.html?e2e=concurrent-a`, { waitUntil: 'domcontentloaded' });
    await contextB.goto(`chrome-extension://${extensionId}/newtab.html?e2e=concurrent-b`, { waitUntil: 'domcontentloaded' });
    await Promise.all([contextA.waitForSelector('.lay-fusion'), contextB.waitForSelector('.lay-fusion')]);
    await Promise.all([openNested(contextA), openNested(contextB)]);
    await Promise.all([unlock(contextA), unlock(contextB)]);
    await contextB.locator('.fx-card').filter({ hasText: 'Concurrent Edit' }).click();
    await contextB.getByRole('dialog', { name: '编辑网站' }).waitFor();
    const deleteCard = contextA.locator('.fx-card').filter({ hasText: 'Concurrent Delete' });
    await deleteCard.locator('.fx-cact-btn.danger').click();
    await contextA.waitForTimeout(220);
    await contextB.getByLabel('名称').fill('Concurrent Edited');
    await contextB.getByRole('button', { name: '保存', exact: true }).click();
    await contextB.waitForTimeout(500);
    await contextA.evaluate(async () => {
      const value = await new Promise(resolveGet => chrome.storage.local.get(['fn_config'], resolveGet));
      const current = value.fn_config;
      const remote = structuredClone(current);
      remote.groups.push({ id: 'g-remote', name: 'Remote Merge', icon: 'cloud', color: '#64748b', items: [{ id: 'remote-only', name: 'Remote Only', url: 'https://remote.invalid/', note: '', icon: '' }] });
      const { mergeImportCandidate } = await import(chrome.runtime.getURL('shared/config-import.js'));
      const merged = mergeImportCandidate(current, remote);
      merged.savedAt = Date.now() + 1000;
      await new Promise(resolveSet => chrome.storage.local.set({ fn_config: merged }, resolveSet));
    });
    await Promise.all([contextA.reload({ waitUntil: 'domcontentloaded' }), contextB.reload({ waitUntil: 'domcontentloaded' })]);
    state = await storage(contextA, ['fn_config']);
    const allIds = findNodes(state.fn_config, () => true).map(entry => entry.item.id);
    assert(!allIds.includes('delete-me'), 'concurrent deletion resurrected');
    assert(findNodes(state.fn_config, item => item.id === 'edit-me' && item.name === 'Concurrent Edited').length === 1, 'unrelated concurrent edit was lost');
    assert(findNodes(state.fn_config, item => item.id === 'remote-only').length === 1, 'remote-only merge item missing');
    assert(new Set(allIds).size === allIds.length, 'duplicate IDs after concurrent merge');
    evidence.concurrent = { deletedAbsent: true, edited: 'Concurrent Edited', remoteOnly: 1, uniqueIds: true };

    // E2E-003：切换 Provider 不提交，Enter 只打开一次且保留原始查询。
    await contextA.locator('.fx-navitem').filter({ hasText: '首页' }).first().click();
    const query = `provider-e2e-${Date.now()}`;
    const ask = contextA.getByRole('textbox', { name: '搜索或询问' });
    await ask.fill(query);
    const pagesBefore = context.pages().length;
    await contextA.getByRole('button', { name: '切换搜索引擎 / AI' }).click();
    await contextA.getByRole('menuitem', { name: /Google/ }).click();
    await contextA.getByRole('button', { name: '切换搜索引擎 / AI' }).click();
    await contextA.getByRole('menuitem', { name: /百度/ }).click();
    assert(await ask.inputValue() === query, 'provider switch changed query text');
    assert(context.pages().length === pagesBefore, 'provider switch opened a page before submit');
    const openedPromise = context.waitForEvent('page');
    await ask.press('Enter');
    const opened = await openedPromise;
    await opened.waitForTimeout(80);
    assert(context.pages().length === pagesBefore + 1, 'provider submit did not open exactly one page');
    const providerDestination=decodeURIComponent(opened.url());
    assert(providerDestination.includes('www.baidu.com/s?wd=') && providerDestination.includes(query), `provider destination mismatch: ${opened.url()}`);
    evidence.provider = { query, opened: opened.url(), openedCount: 1 };
    await opened.close();

    // E2E-004：1024×768 深浅主题首屏第八个常用项、设置与 popup 状态共同持久化。
    await contextA.bringToFront();
    await contextA.reload({ waitUntil: 'domcontentloaded' });
    await contextA.waitForSelector('.lay-fusion');
    await setTheme(contextA, 'dark');
    const darkEighth = await contextA.locator('.fx-fav').nth(7).boundingBox();
    assert(darkEighth && darkEighth.y+darkEighth.height <= 768 && await contextA.evaluate(() => scrollY === 0), 'dark theme eighth favorite is below first viewport');
    let favoriteOpen = context.waitForEvent('page');
    await contextA.locator('.fx-fav').nth(7).click();
    let favoritePage = await favoriteOpen; await favoritePage.close(); await contextA.bringToFront();
    await setTheme(contextA, 'light');
    const lightEighth = await contextA.locator('.fx-fav').nth(7).boundingBox();
    assert(lightEighth && lightEighth.y+lightEighth.height <= 768 && await contextA.evaluate(() => scrollY === 0), 'light theme eighth favorite is below first viewport');
    favoriteOpen = context.waitForEvent('page');
    await contextA.locator('.fx-fav').nth(7).click();
    favoritePage = await favoriteOpen; await favoritePage.close(); await contextA.bringToFront();
    await contextA.getByRole('button', { name: '设置', exact: true }).click();
    await contextA.getByLabel('默认搜索 / AI').selectOption('google');
    await contextA.getByRole('button', { name: '完成', exact: true }).click();
    await contextA.waitForTimeout(250);
    await contextA.reload({ waitUntil: 'domcontentloaded' });
    state = await storage(contextA, ['fn_config']);
    assert(state.fn_config.settings.theme === 'light' && state.fn_config.settings.askProvider === 'google', 'theme/provider did not persist');
    assert(findNodes(state.fn_config, item => item.url === `${base}/popup-target`).length === 1, 'popup item did not persist through E2E-004');
    evidence.viewport = { darkEighthBottom: darkEighth.y+darkEighth.height, lightEighthBottom: lightEighth.y+lightEighth.height, theme: 'light', provider: 'google', popupPersisted: true };

    // E2E-005：从设置输入 secret，覆盖 local/sync/cloud/export/diagnostics 所有可观察边界。
    const secret = { user: `user-${Date.now()}`, pass: `pass-${Date.now()}`, token: `token-${Date.now()}` };
    await contextA.getByRole('button', { name: '设置', exact: true }).click();
    await contextA.getByText('高级与诊断', { exact: true }).click();
    await contextA.getByLabel('本机 Agent Token').fill(secret.token);
    await contextA.getByRole('button', { name: '完成', exact: true }).click();
    await contextA.waitForTimeout(150);
    await contextA.getByRole('button', { name: '设置', exact: true }).click();
    await contextA.getByText('数据与同步', { exact: true }).click();
    await contextA.getByRole('button', { name: '设置云同步' }).click();
    await contextA.getByRole('checkbox', { name: /启用（改动自动备份/ }).check();
    await contextA.getByLabel('WebDAV 地址（填到目录）').fill('http://127.0.0.1:7842/dav/');
    await contextA.getByLabel('账号').fill(secret.user);
    await contextA.getByLabel('密码').fill(secret.pass);
    await contextA.getByRole('button', { name: '保存', exact: true }).click();
    await contextA.getByRole('button', { name: '完成', exact: true }).click();
    await contextA.waitForTimeout(350);
    let persisted = await contextA.evaluate(() => Promise.all([
      new Promise(resolveGet => chrome.storage.local.get(null, resolveGet)),
      new Promise(resolveGet => chrome.storage.sync.get(null, resolveGet)),
    ]));
    const [localPayload, syncPayload] = persisted;
    assert(localPayload.fn_secrets_v1?.cloudUser === secret.user && localPayload.fn_secrets_v1?.cloudPass === secret.pass && localPayload.fn_secrets_v1?.agentToken === secret.token, 'secrets missing from isolated local storage');
    const safeLocalText = JSON.stringify(localPayload.fn_config);
    const syncText = JSON.stringify(syncPayload);
    for (const value of Object.values(secret)) { assert(!safeLocalText.includes(value), 'secret leaked into local config'); assert(!syncText.includes(value), 'secret leaked into sync storage'); }

    await contextA.getByRole('button', { name: '设置', exact: true }).click();
    await contextA.getByText('数据与同步', { exact: true }).click();
    await contextA.getByRole('button', { name: '设置云同步' }).click();
    await contextA.getByRole('button', { name: '立即备份到云' }).click();
    await contextA.getByText(/已生成 fu-nav-backup-/).waitFor();
    const put = davRequests.find(request => request.method === 'PUT');
    assert(put, 'WebDAV PUT was not observed');
    assert(String(put.headers.authorization || '').includes(Buffer.from(`${secret.user}:${secret.pass}`).toString('base64')), 'WebDAV credentials missing from authorized header');
    for (const value of Object.values(secret)) assert(!put.body.includes(value), 'secret leaked into WebDAV JSON body');
    await contextA.locator('#fnMFoot').getByRole('button', { name: '关闭', exact: true }).click();
    await contextA.getByText('数据与同步', { exact: true }).click();
    const downloadPromise = contextA.waitForEvent('download');
    await contextA.getByRole('button', { name: '导出备份' }).click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    const backupText = readFileSync(downloadPath, 'utf8');
    await contextA.getByText('高级与诊断', { exact: true }).click();
    await contextA.evaluate(() => { window.__fuCopiedText = ''; document.execCommand = command => { if (command === 'copy') { window.__fuCopiedText = document.activeElement?.value || ''; return true; } return false; }; });
    await contextA.getByRole('button', { name: '复制脱敏诊断' }).click();
    const diagnosticText = await contextA.evaluate(() => window.__fuCopiedText);
    for (const value of Object.values(secret)) { assert(!backupText.includes(value), 'secret leaked into exported backup'); assert(!diagnosticText.includes(value), 'secret leaked into diagnostics'); }
    evidence.secrets = { isolatedLocal: true, syncMatches: 0, cloudBodyMatches: 0, exportMatches: 0, diagnosticMatches: 0, authorizationHeaderOnly: true };

    // 最窄支持宽度补充检查：新增的 Agent 凭据字段和设置主操作都不能撑破或被裁切。
    await contextA.setViewportSize({ width: 390, height: 844 });
    const [mobileLayout, mobileAgent, mobileComplete] = await Promise.all([
      contextA.evaluate(() => ({ viewport: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth })),
      contextA.getByLabel('本机 Agent Token').boundingBox(),
      contextA.getByRole('button', { name: '完成', exact: true }).boundingBox(),
    ]);
    assert(mobileLayout.scrollWidth <= mobileLayout.viewport, `mobile settings overflow: ${mobileLayout.scrollWidth}/${mobileLayout.viewport}`);
    assert(mobileAgent && mobileAgent.x >= 0 && mobileAgent.x + mobileAgent.width <= 390, 'Agent token field is clipped at 390px');
    assert(mobileComplete && mobileComplete.x >= 0 && mobileComplete.x + mobileComplete.width <= 390, 'settings primary action is clipped at 390px');
    evidence.mobile = { width: 390, scrollWidth: mobileLayout.scrollWidth, agentFieldVisible: true, primaryActionVisible: true };

    // HOTFIX E2E：在已具备旧书签权限时自动恢复最大「Fu 导航」目录；无组件首页与六张残行卡均光学居中。
    await contextA.evaluate(({ baseUrl }) => new Promise(resolveSet => chrome.storage.local.get(['fn_config', 'fn_runtime_state_v1'], value => {
      const cfg = value.fn_config;
      const favorites = Array.from({ length: 6 }, (_, index) => ({ id: `center-fav-${index + 1}`, name: `居中收藏 ${index + 1}`, url: `${baseUrl}/center-${index + 1}`, fav: true, note: '', icon: '' }));
      cfg.settings = {
        ...cfg.settings,
        onboarded: true,
        layout: 'fusion',
        theme: 'dark',
        activeMode: null,
        sideCollapsed: false,
        demoMode: false,
        showWeather: false,
        showStatus: false,
        widgets: [],
        hiddenAgentCards: ['reminder', 'calendar', 'digest'],
        favGrid: { cols: 8, rows: 2 },
        background: { enabled: false, mode: 'none' },
        bmSync: { enabled: false },
        cloud: { enabled: false, type: 'webdav', url: '', user: '', pass: '', gdriveClientId: '' },
        bookmarkRecoveryV326: false,
      };
      cfg.favOrder = favorites.map(item => item.id);
      cfg.groups = [
        { id: 'g-center', name: '常用推荐', icon: 'star', color: '#4a55f3', items: favorites },
        { id: 'g-recovery', name: 'Fu 导航', icon: 'star', color: '#64748b', items: [{ id: 'recovery-keep', name: '我的原名称', url: `${baseUrl}/recovery/keep`, note: '原备注', tags: ['重要'], icon: '' }] },
      ];
      cfg.savedAt = Date.now() + 2000;
      const runtime = { ...(value.fn_runtime_state_v1 || {}), initialized: true, onboarding: { completed: true, weatherConsent: false, choice: 'existing' } };
      chrome.storage.local.set({ fn_config: cfg, fn_runtime_state_v1: runtime }, resolveSet);
    })), { baseUrl: base });
    await contextA.setViewportSize({ width: 2048, height: 955 });
    await contextA.goto(`chrome-extension://${extensionId}/newtab.html?e2e=recovery-granted`, { waitUntil: 'domcontentloaded' });
    await contextA.waitForSelector('.lay-fusion');
    await contextA.waitForFunction(() => new Promise(resolveGet => chrome.storage.local.get(['fn_config'], value => {
      const group = value.fn_config?.groups?.find(item => item.name === 'Fu 导航');
      resolveGet(value.fn_config?.settings?.bookmarkRecoveryV326 === true && group?.items?.some(item => item.name === '恢复网站二'));
    })));
    const recoveryState = await storage(contextA, ['fn_config']);
    const recoveredGroup = recoveryState.fn_config.groups.find(group => group.name === 'Fu 导航');
    const kept = recoveredGroup.items.find(item => item.id === 'recovery-keep');
    assert(recoveredGroup.items.length === 3, `recovery result mismatch: ${recoveredGroup.items.length}`);
    assert(kept?.name === '我的原名称' && kept.note === '原备注' && kept.tags?.[0] === '重要', 'recovery overwrote current bookmark metadata');
    assert(recoveryState.fn_config.settings.bmSync.enabled === false, 'recovery silently enabled bookmark sync');
    const measureCentering = () => contextA.evaluate(() => {
      const rect = selector => document.querySelector(selector).getBoundingClientRect();
      const side = rect('.fx-side');
      const ask = rect('.fx-ask');
      const primary = rect('.fx-home-primary');
      const cards = [...document.querySelectorAll('.fx-fav')].map(node => node.getBoundingClientRect());
      const taskNodes = [rect('.fx-ask'), rect('.fx-favs')];
      const taskTop = Math.min(...taskNodes.map(item => item.top));
      const taskBottom = Math.max(...taskNodes.map(item => item.bottom));
      const cardsLeft = Math.min(...cards.map(item => item.left));
      const cardsRight = Math.max(...cards.map(item => item.right));
      const availableCenter = (side.right + innerWidth) / 2;
      return {
        favoriteCount: cards.length,
        askHorizontalError: Math.abs((ask.left + ask.right) / 2 - availableCenter),
        primaryVerticalError: Math.abs((primary.top + primary.bottom) / 2 - innerHeight / 2),
        taskVerticalError: Math.abs((taskTop + taskBottom) / 2 - innerHeight / 2),
        partialRowError: Math.abs((cardsLeft + cardsRight) / 2 - (ask.left + ask.right) / 2),
        permissionRequests: window.__fuPermissionRequests,
        viewport: `${innerWidth}x${innerHeight}`,
        scrollWidth: document.documentElement.scrollWidth,
      };
    });
    const desktopCentering = [];
    for (const viewport of [{ width: 1024, height: 768 }, { width: 1440, height: 900 }, { width: 2048, height: 955 }]) {
      await contextA.setViewportSize(viewport);
      const metrics = await measureCentering();
      assert(metrics.favoriteCount === 6, `expected six favorites at ${metrics.viewport}, got ${metrics.favoriteCount}`);
      assert(metrics.askHorizontalError <= 2, `home task is not horizontally centered at ${metrics.viewport}: ${metrics.askHorizontalError}`);
      assert(metrics.primaryVerticalError <= 2 && metrics.taskVerticalError <= 2, `home task is not vertically centered: ${JSON.stringify(metrics)}`);
      assert(metrics.partialRowError <= 2, `incomplete favorite row is not centered at ${metrics.viewport}: ${metrics.partialRowError}`);
      assert(metrics.scrollWidth <= viewport.width, `home overflows horizontally at ${metrics.viewport}: ${metrics.scrollWidth}`);
      assert(metrics.permissionRequests === 0, 'automatic recovery requested permission interactively');
      desktopCentering.push(metrics);
    }
    await contextA.setViewportSize({ width: 390, height: 844 });
    const mobileCentering = await contextA.evaluate(() => {
      const primary = document.querySelector('.fx-home-primary').getBoundingClientRect();
      return { viewport: `${innerWidth}x${innerHeight}`, primaryTop: primary.top, scrollWidth: document.documentElement.scrollWidth };
    });
    assert(mobileCentering.primaryTop >= 72, `mobile primary task escaped top-safe area: ${mobileCentering.primaryTop}`);
    assert(mobileCentering.scrollWidth <= 390, `mobile home overflow: ${mobileCentering.scrollWidth}`);
    await contextA.setViewportSize({ width: 2048, height: 955 });
    await contextA.reload({ waitUntil: 'domcontentloaded' });
    await contextA.waitForSelector('.lay-fusion');
    const repeatedState = await storage(contextA, ['fn_config']);
    const repeatedGroup = repeatedState.fn_config.groups.find(group => group.name === 'Fu 导航');
    assert(repeatedGroup.items.length === 3 && new Set(repeatedGroup.items.map(item => item.id)).size === 3, 'recovery is not idempotent after reload');
    evidence.bookmarkRecovery = { sourceFolder: 'largest Fu 导航', restored: 2, preservedMetadata: true, idempotent: true, permissionRequests: 0 };
    evidence.centering = { desktop: desktopCentering, mobile: mobileCentering };

    assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
    console.log(JSON.stringify({ ok: true, extensionId, evidence, davRequests: davRequests.map(request => ({ method: request.method, url: request.url, bodyBytes: request.body.length })), consoleErrors: errors.length }, null, 2));
  } finally {
    await context.close();
    await closeServer(server);
    rmSync(profile, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
