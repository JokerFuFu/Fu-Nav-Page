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
async function createSolidBackground(page, color) {
  return page.evaluate(async fill => {
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
    const context = canvas.getContext('2d'); context.fillStyle = fill; context.fillRect(0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolveBlob => canvas.toBlob(resolveBlob, 'image/png'));
    const module = await import(chrome.runtime.getURL('shared/bg-storage.js'));
    return module.putBgImage(blob);
  }, color);
}

(async () => {
  let markWallpaperRequested, releaseWallpaperResponse;
  const wallpaperRequested = new Promise(resolveRequested => { markWallpaperRequested = resolveRequested; });
  const wallpaperResponseGate = new Promise(resolveRelease => { releaseWallpaperResponse = resolveRelease; });
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
    await context.route('http://127.0.0.1:7842/wallpaper-auto.svg**', async route => {
      markWallpaperRequested();
      await wallpaperResponseGate;
      await route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#ffffff"/></svg>',
      });
    });
    await context.addInitScript(({ importUrl, recoveryBase }) => {
      if (typeof chrome === 'undefined' || !chrome.permissions || !location.protocol.startsWith('chrome-extension')) return;
      const recoveryCase = new URLSearchParams(location.search).get('e2e');
      const recoveryMode = recoveryCase === 'recovery-granted' || recoveryCase === 'recovery-flat-granted';
      const wallpaperMode = recoveryCase === 'wallpaper-auto';
      const flatRecoveryMode = recoveryCase === 'recovery-flat-granted';
      window.__fuPermissionGrant = recoveryMode || wallpaperMode;
      window.__fuPermissionGranted = recoveryMode || wallpaperMode;
      window.__fuPermissionRequests = 0;
      const reply = (callback, value) => queueMicrotask(() => callback(!!value));
      try { Object.defineProperty(chrome.permissions, 'contains', { configurable: true, value: (_query, callback) => reply(callback, window.__fuPermissionGranted) }); } catch {}
      try { Object.defineProperty(chrome.permissions, 'request', { configurable: true, value: (_query, callback) => { window.__fuPermissionRequests += 1; if (window.__fuPermissionGrant) window.__fuPermissionGranted = true; reply(callback, window.__fuPermissionGranted); } }); } catch {}

      let id = 40;
      const barChildren = [{ id: '10', parentId: '1', title: 'E2E 浏览器书签', children: [{ id: '11', parentId: '10', title: '授权导入网站', url: importUrl }] }];
      if (recoveryMode) barChildren.push(
        { id: '20', parentId: '1', title: 'Fu 导航', children: [{ id: '21', parentId: '20', title: '较小旧集合', url: `${recoveryBase}/recovery/small` }] },
        { id: '30', parentId: '1', title: 'Fu 导航', children: flatRecoveryMode ? [
          { id: '41', parentId: '30', title: '家里路由器', url: 'http://192.168.1.1/' },
          { id: '42', parentId: '30', title: 'Kimi', url: 'https://www.kimi.com/' },
          { id: '43', parentId: '30', title: 'GitHub', url: 'https://github.com/' },
          { id: '44', parentId: '30', title: 'Figma', url: 'https://www.figma.com/' },
          { id: '45', parentId: '30', title: 'Gmail', url: 'https://mail.google.com/' },
          { id: '46', parentId: '30', title: 'YouTube', url: 'https://www.youtube.com/' },
          { id: '47', parentId: '30', title: '无特征', url: 'https://misc.example.net/' },
        ] : [
          { id: '31', parentId: '30', title: '来源名称不应覆盖', url: `${recoveryBase}/recovery/keep/` },
          { id: '32', parentId: '30', title: '恢复网站一', url: `${recoveryBase}/recovery/one` },
          { id: '33', parentId: '30', title: '旧子目录', children: [
            { id: '36', parentId: '33', title: '更深目录', children: [
              { id: '34', parentId: '36', title: '恢复网站二', url: `${recoveryBase}/recovery/two?utm_source=legacy` },
              { id: '35', parentId: '36', title: '恢复网站一重复', url: `${recoveryBase}/recovery/one/` },
            ] },
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
        showClock: false,
        showWeather: false,
        showStatus: false,
        widgets: [],
        hiddenAgentCards: ['reminder', 'calendar', 'digest'],
        favGrid: { cols: 8, rows: 2 },
        background: { enabled: false, mode: 'none' },
        bmSync: { enabled: false },
        cloud: { enabled: false, type: 'webdav', url: '', user: '', pass: '', gdriveClientId: '' },
        bookmarkRecoveryV326: false,
        bookmarkStructureRecoveryV327: false,
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
      const has = items => (items || []).some(item => item.name === '恢复网站二' || (item.type === 'folder' && has(item.items)));
      resolveGet(value.fn_config?.settings?.bookmarkRecoveryV326 === true && value.fn_config?.settings?.bookmarkStructureRecoveryV327 === true && has(group?.items));
    })));
    const recoveryState = await storage(contextA, ['fn_config']);
    const recoveredGroup = recoveryState.fn_config.groups.find(group => group.name === 'Fu 导航');
    const kept = findNodes(recoveryState.fn_config, item => item.id === 'recovery-keep')[0]?.item;
    const recoveredTwo = findNodes(recoveryState.fn_config, item => item.name === '恢复网站二')[0];
    assert(recoveredGroup.items.length === 3, `recovery result mismatch: ${recoveredGroup.items.length}`);
    assert(kept?.name === '我的原名称' && kept.note === '原备注' && kept.tags?.[0] === '重要', 'recovery overwrote current bookmark metadata');
    assert(recoveredTwo?.path.join('/') === 'Fu 导航/旧子目录/更深目录/恢复网站二', `recovery structure mismatch: ${recoveredTwo?.path.join('/')}`);
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
    const repeatedNodes = findNodes(repeatedState.fn_config, (_item, path) => path[0] === 'Fu 导航');
    assert(repeatedGroup.items.length === 3 && new Set(repeatedNodes.map(entry => entry.item.id)).size === repeatedNodes.length, 'recovery is not idempotent after reload');
    evidence.bookmarkRecovery = { sourceFolder: 'largest Fu 导航', restored: 2, preservedMetadata: true, idempotent: true, permissionRequests: 0 };
    evidence.centering = { desktop: desktopCentering, mobile: mobileCentering };

    // 结构迁移专项：模拟已经完成旧版扁平恢复的用户，复用其稳定 ID 并把来源外网站归入“未归类”。
    await contextA.evaluate(({ baseUrl }) => new Promise(resolveSet => chrome.storage.local.get(['fn_config'], value => {
      const cfg = value.fn_config;
      cfg.settings.bookmarkRecoveryV326 = true;
      cfg.settings.bookmarkStructureRecoveryV327 = false;
      cfg.settings.bmSync = { enabled: false };
      cfg.groups = cfg.groups.filter(group => group.name !== 'Fu 导航');
      cfg.groups.push({ id: 'g-structure', name: 'Fu 导航', icon: 'star', color: '#64748b', items: [
        { id: 'structure-keep', name: '保留的用户名称', url: `${baseUrl}/recovery/keep`, note: '保留的用户备注', tags: ['原数据'], icon: '' },
        { id: 'structure-one', name: '扁平网站一', url: `${baseUrl}/recovery/one`, note: '', icon: '' },
        { id: 'structure-two', name: '扁平网站二', url: `${baseUrl}/recovery/two`, note: '', icon: '' },
        { id: 'structure-extra', name: '仅导航内存在', url: `${baseUrl}/recovery/extra`, note: '不能删除', icon: '' },
      ] });
      cfg.savedAt = Date.now() + 3000;
      chrome.storage.local.set({ fn_config: cfg }, resolveSet);
    })), { baseUrl: base });
    await contextA.goto(`chrome-extension://${extensionId}/newtab.html?e2e=recovery-granted`, { waitUntil: 'domcontentloaded' });
    await contextA.waitForSelector('.lay-fusion');
    await contextA.waitForFunction(() => new Promise(resolveGet => chrome.storage.local.get(['fn_config'], value => resolveGet(value.fn_config?.settings?.bookmarkStructureRecoveryV327 === true))));
    const structuredState = await storage(contextA, ['fn_config']);
    const structuredSites = findNodes(structuredState.fn_config, item => item.type !== 'folder' && ['structure-keep', 'structure-one', 'structure-two', 'structure-extra'].includes(item.id));
    const structureKeep = structuredSites.find(entry => entry.item.id === 'structure-keep');
    const structureTwo = structuredSites.find(entry => entry.item.id === 'structure-two');
    const structureExtra = structuredSites.find(entry => entry.item.id === 'structure-extra');
    assert(structuredSites.length === 4, `structure migration lost sites: ${structuredSites.length}`);
    assert(structureKeep?.item.name === '保留的用户名称' && structureKeep.item.note === '保留的用户备注' && structureKeep.item.tags?.[0] === '原数据', 'structure migration overwrote current metadata');
    assert(structureTwo?.path.join('/') === 'Fu 导航/旧子目录/更深目录/扁平网站二', `deep bookmark path mismatch: ${structureTwo?.path.join('/')}`);
    assert(structureExtra?.path.join('/') === 'Fu 导航/未归类/仅导航内存在', `unclassified path mismatch: ${structureExtra?.path.join('/')}`);
    assert(structuredState.fn_config.settings.bmSync.enabled === false, 'structure migration silently enabled bookmark sync');
    assert(await contextA.evaluate(() => window.__fuPermissionRequests) === 0, 'structure migration requested bookmark permission');
    await contextA.locator('.fx-navitem').filter({ hasText: 'Fu 导航' }).first().click();
    assert(await contextA.locator('.fx-folder').filter({ hasText: '旧子目录' }).count() === 1, 'restored top-level folder is absent from the UI');
    assert(await contextA.locator('.fx-folder').filter({ hasText: '未归类' }).count() === 1, 'unclassified folder is absent from the UI');
    await contextA.locator('.fx-folder').filter({ hasText: '旧子目录' }).click();
    await contextA.locator('.fx-folder').filter({ hasText: '更深目录' }).click();
    assert(await contextA.getByText('扁平网站二', { exact: true }).count() === 1, 'deep restored bookmark is not reachable in the UI');
    const structureBeforeReload = findNodes(structuredState.fn_config, (_item, path) => path[0] === 'Fu 导航').map(entry => ({ id: entry.item.id, path: entry.path.join('/') }));
    await contextA.reload({ waitUntil: 'domcontentloaded' });
    await contextA.waitForSelector('.lay-fusion');
    const structuredAgain = await storage(contextA, ['fn_config']);
    const structureAfterReload = findNodes(structuredAgain.fn_config, (_item, path) => path[0] === 'Fu 导航').map(entry => ({ id: entry.item.id, path: entry.path.join('/') }));
    assert(JSON.stringify(structureAfterReload) === JSON.stringify(structureBeforeReload), 'structure migration changed IDs or paths after reload');
    evidence.bookmarkStructureRecovery = { previousFlatMarker: true, sourceFolders: 2, sitesBefore: 4, sitesAfter: 4, reusedIds: 4, unclassified: 1, permissionRequests: 0, idempotent: true };

    // 完全扁平源兜底：没有任何原文件夹时才使用确定性本地规则拆分，仍复用旧网站对象。
    await contextA.evaluate(({ baseUrl }) => new Promise(resolveSet => chrome.storage.local.get(['fn_config'], value => {
      const cfg = value.fn_config;
      const samples = [
        ['flat-network', '用户-家里路由器', 'http://192.168.1.1/'],
        ['flat-ai', '用户-Kimi', 'https://www.kimi.com/'],
        ['flat-dev', '用户-GitHub', 'https://github.com/'],
        ['flat-design', '用户-Figma', 'https://www.figma.com/'],
        ['flat-mail', '用户-Gmail', 'https://mail.google.com/'],
        ['flat-media', '用户-YouTube', 'https://www.youtube.com/'],
        ['flat-other', '用户-无特征', 'https://misc.example.net/'],
      ];
      cfg.settings.bookmarkRecoveryV326 = true;
      cfg.settings.bookmarkStructureRecoveryV327 = false;
      cfg.settings.bmSync = { enabled: false };
      cfg.groups = cfg.groups.filter(group => group.name !== 'Fu 导航');
      cfg.groups.push({ id: 'g-flat-e2e', name: 'Fu 导航', icon: 'star', color: '#64748b', items: samples.map(([id, name, url]) => ({ id, name, url, note: `${id}-note`, icon: '' })) });
      cfg.savedAt = Date.now() + 4000;
      chrome.storage.local.set({ fn_config: cfg }, resolveSet);
    })), { baseUrl: base });
    await contextA.goto(`chrome-extension://${extensionId}/newtab.html?e2e=recovery-flat-granted`, { waitUntil: 'domcontentloaded' });
    await contextA.waitForSelector('.lay-fusion');
    await contextA.waitForFunction(() => new Promise(resolveGet => chrome.storage.local.get(['fn_config'], value => resolveGet(value.fn_config?.settings?.bookmarkStructureRecoveryV327 === true))));
    const flatState = await storage(contextA, ['fn_config']);
    const flatGroup = flatState.fn_config.groups.find(group => group.name === 'Fu 导航');
    const flatNames = flatGroup.items.map(item => item.name);
    assert(JSON.stringify(flatNames) === JSON.stringify(['网络与设备', 'AI 与效率', '开发工具', '设计创意', '邮箱通讯', '影音娱乐', '其他']), `flat categories mismatch: ${flatNames.join(' | ')}`);
    const flatSites = findNodes(flatState.fn_config, item => item.id?.startsWith('flat-'));
    assert(flatSites.length === 7 && flatSites.every(entry => entry.item.note === `${entry.item.id}-note`), 'flat classification lost existing IDs or metadata');
    assert(flatGroup.items.every(item => item.type === 'folder' && item.bookmarkAutoCategory === true), 'flat source still contains root-level sites');
    assert(await contextA.evaluate(() => window.__fuPermissionRequests) === 0, 'flat classification requested bookmark permission');
    evidence.bookmarkAutoCategory = { sourceFolders: 0, categories: flatNames, sitesBefore: 7, sitesAfter: flatSites.length, reusedIds: 7, permissionRequests: 0 };

    // 锁屏时钟 E2E：迁移旧组件、固定在搜索上方、随工作区常驻，并验证自动/手动配色与响应式。
    await contextA.evaluate(({ baseUrl }) => new Promise(resolveSet => chrome.storage.local.get(['fn_config'], value => {
      const cfg = value.fn_config;
      cfg.settings = {
        ...cfg.settings,
        onboarded: true,
        layout: 'fusion',
        activeMode: null,
        modes: [{ id: 'm-work', name: '工作', groupIds: ['g-work'], hiddenWidgets: [], showFavs: true }],
        showClock: true,
        heroClock: { font: 'mono', size: 'standard', weight: 'regular', style: 'shadow', format: '24', details: 'full', colorMode: 'auto', customColor: '#f5f7ff' },
        showWeather: false,
        showStatus: false,
        widgets: [{ id: 'legacy-clock-a', type: 'clock' }, { id: 'legacy-clock-b', type: 'clock' }],
        hiddenAgentCards: ['reminder', 'calendar', 'digest'],
        favGrid: { cols: 8, rows: 2 },
        sideCollapsed: false,
        demoMode: false,
        background: { enabled: false, mode: 'none' },
        bookmarkRecoveryV326: true,
        bookmarkStructureRecoveryV327: true,
      };
      const work = Array.from({ length: 4 }, (_, index) => ({ id: `work-${index + 1}`, name: `工作收藏 ${index + 1}`, url: `${baseUrl}/workspace/work-${index + 1}`, fav: true, note: '', icon: '' }));
      const life = Array.from({ length: 4 }, (_, index) => ({ id: `life-${index + 1}`, name: `生活收藏 ${index + 1}`, url: `${baseUrl}/workspace/life-${index + 1}`, fav: true, note: '', icon: '' }));
      cfg.favOrder = life.flatMap((item, index) => [item.id, work[index].id]);
      cfg.groups = [
        { id: 'g-work', name: '工作分组', icon: 'briefcase', color: '#4a55f3', items: work },
        { id: 'g-life', name: '生活分组', icon: 'house', color: '#14b8a6', items: life },
      ];
      cfg.savedAt = Date.now() + 5000;
      chrome.storage.local.set({ fn_config: cfg }, resolveSet);
    })), { baseUrl: base });
    await contextA.setViewportSize({ width: 1024, height: 768 });
    await contextA.goto(`chrome-extension://${extensionId}/newtab.html?e2e=workspace-home-clock`, { waitUntil: 'domcontentloaded' });
    await contextA.waitForSelector('.lay-fusion');
    await contextA.waitForFunction(() => /^\d{2}:\d{2}$/.test(document.querySelector('.fx-lock-time')?.textContent || ''));
    await contextA.waitForFunction(() => new Promise(resolveGet => chrome.storage.local.get(['fn_config'], value => resolveGet(value.fn_config?.settings?.widgets?.every(widget => widget.type !== 'clock')))));
    const favoriteNames = () => contextA.locator('.fx-fav .fx-fav-nm').allTextContents();
    const globalBefore = await favoriteNames();
    const expectedGlobal = ['生活收藏 1', '工作收藏 1', '生活收藏 2', '工作收藏 2', '生活收藏 3', '工作收藏 3', '生活收藏 4', '工作收藏 4'];
    assert(JSON.stringify(globalBefore) === JSON.stringify(expectedGlobal), `global homepage order changed: ${globalBefore.join(' | ')}`);
    const clockBefore = await contextA.locator('.fx-lock-time').textContent();
    const desktopClockLayout = await contextA.evaluate(() => {
      const clock = document.querySelector('.fx-lock-clock').getBoundingClientRect();
      const ask = document.querySelector('.fx-ask').getBoundingClientRect();
      const favorites = document.querySelector('.fx-favs').getBoundingClientRect();
      return { clockBottom: clock.bottom, askTop: ask.top, favoritesBottom: favorites.bottom, favoriteCount: document.querySelectorAll('.fx-fav').length, scrollWidth: document.documentElement.scrollWidth, viewportHeight: innerHeight, domOrder: !!(document.querySelector('.fx-lock-clock').compareDocumentPosition(document.querySelector('.fx-ask')) & Node.DOCUMENT_POSITION_FOLLOWING) };
    });
    assert(desktopClockLayout.domOrder && desktopClockLayout.clockBottom < desktopClockLayout.askTop, 'lock clock is not above search');
    assert(desktopClockLayout.favoriteCount === 8 && desktopClockLayout.favoritesBottom <= desktopClockLayout.viewportHeight, `clock/search/eight favorites do not fit 1024x768: ${JSON.stringify(desktopClockLayout)}`);
    assert(desktopClockLayout.scrollWidth <= 1024, `clock homepage overflows 1024px: ${desktopClockLayout.scrollWidth}`);

    await contextA.getByRole('button', { name: /工作区：全部收藏/ }).click();
    await contextA.getByRole('menuitem', { name: '工作', exact: true }).click();
    await contextA.waitForFunction(() => document.querySelector('.fx-mode-hub-copy strong')?.textContent === '工作');
    const workNames = await favoriteNames();
    assert(JSON.stringify(workNames) === JSON.stringify(['工作收藏 1', '工作收藏 2', '工作收藏 3', '工作收藏 4']), `workspace homepage leaked other groups: ${workNames.join(' | ')}`);
    assert(await contextA.locator('.fx-lock-time').isVisible(), 'clock disappeared after workspace switch');

    await contextA.getByRole('button', { name: /工作区：工作/ }).click();
    await contextA.getByRole('menuitem', { name: '全部收藏', exact: true }).click();
    await contextA.waitForFunction(() => document.querySelector('.fx-mode-hub-copy strong')?.textContent === '全部收藏');
    const globalAfter = await favoriteNames();
    assert(JSON.stringify(globalAfter) === JSON.stringify(globalBefore), `global homepage was not restored exactly: ${globalAfter.join(' | ')}`);
    const workspaceState = await storage(contextA, ['fn_config']);
    assert(workspaceState.fn_config.settings.activeMode === null, 'all-collections mode did not persist after switching back');
    const migratedClocks = workspaceState.fn_config.settings.widgets.filter(widget => widget.type === 'clock');
    assert(migratedClocks.length === 0 && workspaceState.fn_config.settings.heroClock.font === 'mono', `legacy clocks were not removed without losing preferences: ${migratedClocks.length}`);

    await contextA.setViewportSize({ width: 390, height: 844 });
    const mobileClockLayout = await contextA.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clockVisible: !!document.querySelector('.fx-lock-time')?.getClientRects().length, clockRight: document.querySelector('.fx-lock-clock').getBoundingClientRect().right }));
    assert(mobileClockLayout.clockVisible && mobileClockLayout.scrollWidth <= 390 && mobileClockLayout.clockRight <= 390, `mobile lock clock overflows: ${JSON.stringify(mobileClockLayout)}`);
    await contextA.setViewportSize({ width: 1024, height: 768 });

    const blackBackground = await createSolidBackground(contextA, '#000000');
    await contextA.evaluate(imageId => new Promise(resolveSet => chrome.storage.local.get(['fn_config'], value => {
      value.fn_config.settings.background = { enabled: true, mode: 'local', localImageId: imageId, scrimOpacity: 0.55 };
      value.fn_config.settings.heroClock.colorMode = 'auto'; value.fn_config.savedAt = Date.now() + 6000;
      chrome.storage.local.set({ fn_config: value.fn_config }, resolveSet);
    })), blackBackground);
    await contextA.reload({ waitUntil: 'domcontentloaded' });
    await contextA.waitForFunction(() => document.body.dataset.clockTone === 'light');
    const darkTone = await contextA.evaluate(() => ({ tone: document.body.dataset.clockTone, color: getComputedStyle(document.querySelector('.fx-lock-clock')).getPropertyValue('--clock-color').trim() }));

    const whiteBackground = await createSolidBackground(contextA, '#ffffff');
    await contextA.evaluate(imageId => new Promise(resolveSet => chrome.storage.local.get(['fn_config'], value => {
      value.fn_config.settings.background = { enabled: true, mode: 'local', localImageId: imageId, scrimOpacity: 0.55 };
      value.fn_config.settings.heroClock.colorMode = 'auto'; value.fn_config.savedAt = Date.now() + 7000;
      chrome.storage.local.set({ fn_config: value.fn_config }, resolveSet);
    })), whiteBackground);
    await contextA.reload({ waitUntil: 'domcontentloaded' });
    await contextA.waitForFunction(() => document.body.dataset.clockTone === 'dark');
    const brightTone = await contextA.evaluate(() => ({ tone: document.body.dataset.clockTone, color: getComputedStyle(document.querySelector('.fx-lock-clock')).getPropertyValue('--clock-color').trim() }));
    assert(darkTone.tone === 'light' && darkTone.color === '#f5f7ff', `dark wallpaper tone mismatch: ${JSON.stringify(darkTone)}`);
    assert(brightTone.tone === 'dark' && brightTone.color === '#15161c', `bright wallpaper tone mismatch: ${JSON.stringify(brightTone)}`);

    await contextA.getByRole('button', { name: '设置', exact: true }).click();
    const settingsDialog = contextA.getByRole('dialog', { name: '设置', exact: true });
    await settingsDialog.getByText('外观', { exact: true }).click();
    await settingsDialog.getByRole('button', { name: '自定义时钟', exact: true }).click();
    const clockEditor = contextA.getByRole('dialog', { name: '自定义锁屏时钟' });
    await clockEditor.getByRole('button', { name: '圆体', exact: true }).click();
    await clockEditor.getByRole('button', { name: '大号', exact: true }).click();
    await clockEditor.getByRole('button', { name: '粗', exact: true }).click();
    await clockEditor.getByRole('button', { name: '描边', exact: true }).click();
    await clockEditor.getByRole('button', { name: '12 小时', exact: true }).click();
    await clockEditor.getByRole('button', { name: '仅时间', exact: true }).click();
    await clockEditor.getByRole('button', { name: '自定义', exact: true }).click();
    await clockEditor.getByLabel('时钟自定义颜色').evaluate(input => { input.value = '#12abef'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await clockEditor.getByRole('button', { name: '保存', exact: true }).click();
    await contextA.waitForSelector('.fx-lock-clock[data-color-mode="custom"]');
    const manualClock = await contextA.evaluate(() => { const node = document.querySelector('.fx-lock-clock'); return { font: node.dataset.font, size: node.dataset.size, weight: node.dataset.weight, style: node.dataset.style, format: node.dataset.format, details: node.dataset.details, colorMode: node.dataset.colorMode, color: getComputedStyle(node).getPropertyValue('--clock-color').trim(), dateVisible: !!document.querySelector('.fx-lock-date')?.getClientRects().length, greetVisible: !!document.querySelector('.fx-lock-greet')?.getClientRects().length }; });
    assert(JSON.stringify(manualClock) === JSON.stringify({ font: 'rounded', size: 'large', weight: 'bold', style: 'outline', format: '12', details: 'time', colorMode: 'custom', color: '#12abef', dateVisible: false, greetVisible: false }), `manual clock preferences not applied: ${JSON.stringify(manualClock)}`);
    await contextA.reload({ waitUntil: 'domcontentloaded' });
    await contextA.waitForSelector('.fx-lock-clock[data-color-mode="custom"]');
    const persistedClock = (await storage(contextA, ['fn_config'])).fn_config.settings.heroClock;
    assert(persistedClock.font === 'rounded' && persistedClock.style === 'outline' && persistedClock.customColor === '#12abef', 'manual clock preferences did not persist after reload');
    evidence.workspaceHomeClock = { clock: clockBefore, migratedClocks: migratedClocks.length, globalBefore, work: workNames, globalAfter, activeMode: null, desktop: desktopClockLayout, mobile: mobileClockLayout, autoTone: { dark: darkTone, bright: brightTone }, manual: manualClock, persisted: true };

    // 在线壁纸自动更新：先让已到期请求停在服务器，确认旧图已显示；放行后必须在同一文档内换成新缓存图。
    const oldOnlineBackground = await createSolidBackground(contextA, '#000000');
    const oldFetchAt = Date.now() - 2 * 60_000;
    await contextA.evaluate(({ imageId, sourceUrl, lastFetchAt }) => new Promise(resolveSet => chrome.storage.local.get(['fn_config'], value => {
      value.fn_config.settings.background = {
        enabled: true,
        mode: 'online',
        onlineImageId: imageId,
        onlineSrc: { id: 'custom', url: sourceUrl },
        refreshEvery: 1,
        lastFetchAt,
        scrimOpacity: 0.55,
      };
      value.fn_config.savedAt = Date.now() + 8000;
      chrome.storage.local.set({ fn_config: value.fn_config }, resolveSet);
    })), { imageId: oldOnlineBackground, sourceUrl: 'http://127.0.0.1:7842/wallpaper-auto.svg', lastFetchAt: oldFetchAt });
    await contextA.goto(`chrome-extension://${extensionId}/newtab.html?e2e=wallpaper-auto`, { waitUntil: 'domcontentloaded' });
    await contextA.waitForSelector('body.bg-photo');
    await wallpaperRequested;
    const beforeAutoRefresh = await contextA.evaluate(() => {
      window.__wallpaperRefreshSentinel = 'same-document';
      return { image: document.body.style.getPropertyValue('--fx-bg-img'), url: location.href };
    });
    const storedBeforeAutoRefresh = await storage(contextA, ['fn_config']);
    assert(storedBeforeAutoRefresh.fn_config.settings.background.onlineImageId === oldOnlineBackground, 'old wallpaper was not visible before the scheduled response');
    releaseWallpaperResponse();
    await contextA.waitForFunction(previousCssImage => {
      const current = document.body.style.getPropertyValue('--fx-bg-img');
      return !!current && current !== previousCssImage;
    }, beforeAutoRefresh.image);
    const afterAutoRefresh = await contextA.evaluate(() => ({
      image: document.body.style.getPropertyValue('--fx-bg-img'),
      url: location.href,
      sameDocument: window.__wallpaperRefreshSentinel === 'same-document',
    }));
    const storedAfterAutoRefresh = await storage(contextA, ['fn_config','fn_wallpaper_refresh_v1']);
    assert(afterAutoRefresh.sameDocument && afterAutoRefresh.url === beforeAutoRefresh.url, 'scheduled wallpaper refresh reloaded or replaced the current document');
    assert(afterAutoRefresh.image !== beforeAutoRefresh.image, 'scheduled wallpaper refresh did not apply the new image to the current page');
    assert(storedAfterAutoRefresh.fn_wallpaper_refresh_v1?.onlineImageId && storedAfterAutoRefresh.fn_wallpaper_refresh_v1.onlineImageId !== oldOnlineBackground, 'scheduled wallpaper refresh did not replace the runtime cached image');
    assert(storedAfterAutoRefresh.fn_wallpaper_refresh_v1.lastFetchAt > oldFetchAt, 'scheduled wallpaper refresh did not persist its fetch time');
    evidence.wallpaperAutoRefresh = { frequencyMinutes: 1, sameDocument: true, imageChanged: true, fetchTimeAdvanced: true };

    // 搜索结果管理：锁定态也能固定到首页、拖入已展开文件夹，并用局部编辑态复用网站编辑器。
    await contextA.evaluate(({ baseUrl }) => new Promise(resolveSet => chrome.storage.local.get(['fn_config'], value => {
      const cfg=value.fn_config;
      cfg.settings={
        ...cfg.settings,
        activeMode:null,
        modes:[],
        locked:true,
        treeOpen:{'g-search-target':true},
        showClock:false,
        showWeather:false,
        showStatus:false,
        widgets:[],
        hiddenAgentCards:['reminder','calendar','digest'],
        background:{enabled:false,mode:'none'},
        bookmarkRecoveryV326:true,
        bookmarkStructureRecoveryV327:true,
      };
      cfg.favOrder=[];
      cfg.groups=[
        {id:'g-search-source',name:'搜索源',icon:'search',color:'#4a55f3',items:[
          {id:'i-search-manage',name:'搜索管理测试',url:`${baseUrl}/search-original`,note:'保留备注',tags:['保留标签'],aliases:['搜索别名'],icon:'',frame:true},
        ]},
        {id:'g-search-target',name:'目标收藏夹',icon:'folder',color:'#14b8a6',items:[
          {id:'f-search-target',type:'folder',name:'目标文件夹',icon:'folder',items:[]},
        ]},
      ];
      cfg.savedAt=Date.now()+9000;
      chrome.storage.local.set({fn_config:cfg},resolveSet);
    })),{baseUrl:base});
    await contextA.goto(`chrome-extension://${extensionId}/newtab.html?e2e=search-result-management`,{waitUntil:'domcontentloaded'});
    await contextA.waitForSelector('.lay-fusion');
    const searchInput=contextA.getByLabel('搜索或询问');
    await searchInput.fill('搜索管理测试');
    let searchResult=contextA.locator('.fx-res[data-iid="i-search-manage"]');
    await searchResult.waitFor();
    await searchResult.dragTo(contextA.getByRole('button',{name:'固定第一条搜索结果到首页（也可拖放）'}));
    await contextA.waitForFunction(()=>new Promise(resolveGet=>chrome.storage.local.get(['fn_config'],value=>{
      const cfg=value.fn_config, item=cfg.groups.flatMap(group=>group.items).find(entry=>entry.id==='i-search-manage');
      resolveGet(item?.fav===true&&cfg.favOrder.filter(id=>id==='i-search-manage').length===1);
    })));
    await contextA.locator('.fx-fav[data-iid="i-search-manage"]').waitFor();
    await contextA.getByLabel('搜索或询问').fill('搜索管理测试');
    searchResult=contextA.locator('.fx-res[data-iid="i-search-manage"]');
    const folderTarget=contextA.locator('.fx-navfolder[data-folder-id="f-search-target"]');
    await folderTarget.waitFor();
    await searchResult.dragTo(folderTarget);
    await contextA.waitForFunction(()=>new Promise(resolveGet=>chrome.storage.local.get(['fn_config'],value=>{
      const group=value.fn_config.groups.find(entry=>entry.id==='g-search-target');
      resolveGet(group?.items?.[0]?.items?.some(item=>item.id==='i-search-manage'));
    })));

    await contextA.getByLabel('搜索或询问').fill('搜索管理测试');
    await contextA.getByRole('button',{name:'编辑搜索结果'}).click();
    const localEditState=await contextA.evaluate(()=>({bodyEditing:document.body.classList.contains('editing')}));
    assert(localEditState.bodyEditing===false,'local search edit mode unlocked the whole app');
    await contextA.getByRole('button',{name:'编辑 搜索管理测试'}).click();
    const itemEditor=contextA.getByRole('dialog',{name:'编辑网站'});
    await itemEditor.getByRole('textbox',{name:'名称',exact:true}).fill('搜索管理已编辑');
    await itemEditor.getByRole('textbox',{name:'网址',exact:true}).fill(`${base}/search-edited`);
    await itemEditor.getByRole('textbox',{name:'备注',exact:true}).fill('编辑后的备注');
    await itemEditor.getByRole('button',{name:'保存',exact:true}).click();
    await contextA.waitForFunction(()=>new Promise(resolveGet=>chrome.storage.local.get(['fn_config'],value=>{
      const matches=find=>{for(const group of value.fn_config.groups){const stack=[...(group.items||[])];while(stack.length){const item=stack.shift();if(item?.id==='i-search-manage')return item;if(item?.type==='folder')stack.push(...(item.items||[]));}}return null;};
      resolveGet(matches()?.name==='搜索管理已编辑');
    })));
    const searchManagedState=await storage(contextA,['fn_config']);
    const managedHits=findNodes(searchManagedState.fn_config,item=>item.id==='i-search-manage');
    assert(managedHits.length===1,`search management duplicated the site: ${managedHits.length}`);
    const managed=managedHits[0];
    assert(managed.path.join('/')==='目标收藏夹/目标文件夹/搜索管理已编辑',`search drag target mismatch: ${managed.path.join('/')}`);
    assert(managed.item.fav===true&&searchManagedState.fn_config.favOrder.filter(id=>id==='i-search-manage').length===1,'search home drop lost or duplicated favorite state');
    assert(managed.item.url===`${base}/search-edited`&&managed.item.note==='编辑后的备注'&&managed.item.tags?.[0]==='保留标签'&&managed.item.frame===true,'search edit lost website metadata');
    assert(searchManagedState.fn_config.settings.locked===true,'local search edit mode changed the global lock setting');
    evidence.searchResultManagement={homePinned:true,targetPath:managed.path,edited:true,unique:true,globalLocked:true};

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
