#!/usr/bin/env node
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { chromium } = require('playwright');

const extensionPath = resolve(process.argv[2] || '.');
const profile = mkdtempSync(join(tmpdir(), 'fu-nav-offline-'));
const errors = [];

function watch(page, label) {
  page.on('pageerror', error => errors.push(`${label}: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error' && !/Failed to load resource/i.test(message.text())) errors.push(`${label}: ${message.text()}`);
  });
}

(async () => {
  console.log('offline-check:launch');
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  try {
    console.log('offline-check:browser-ready');
    let worker = context.serviceWorkers()[0];
    if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
    const extensionId = new URL(worker.url()).host;
    console.log(`offline-check:extension:${extensionId}`);
    const home = await context.newPage();
    home.setDefaultTimeout(5000);
    watch(home, 'home');
    await home.goto(`chrome-extension://${extensionId}/newtab.html?e2e=offline`, { waitUntil: 'domcontentloaded' });
    await home.waitForSelector('.lay-fusion');
    await home.waitForTimeout(160);
    console.log('offline-check:online-page-ready');
    const defer = home.getByRole('button', { name: '稍后决定' });
    if (await defer.isVisible().catch(() => false)) await defer.click();
    const onlineClose = home.locator('#fnMClose');
    if (await onlineClose.isVisible().catch(() => false)) await onlineClose.click();

    await context.setOffline(true);
    await home.reload({ waitUntil: 'domcontentloaded' });
    await home.waitForSelector('.lay-fusion');
    await home.waitForTimeout(160);
    console.log('offline-check:offline-page-ready');
    const deferOffline = home.getByRole('button', { name: '稍后决定' });
    if (await deferOffline.isVisible().catch(() => false)) await deferOffline.click();
    const offlineClose = home.locator('#fnMClose');
    if (await offlineClose.isVisible().catch(() => false)) await offlineClose.click();
    await home.waitForTimeout(2800);

    const iconState = await home.evaluate(() => ({
      total: document.querySelectorAll('.lucide-mask').length,
      local: [...document.querySelectorAll('.lucide-mask')].filter(node => getComputedStyle(node).maskImage.includes('data:image/svg+xml')).length,
      blank: [...document.querySelectorAll('.fx-ni-ico,.fx-fav-ico,.fx-card-ico')].filter(node => !node.textContent.trim() && !node.querySelector('img') && !getComputedStyle(node).maskImage.includes('data:image')).length,
    }));
    if (!iconState.total || iconState.local !== iconState.total || iconState.blank) throw new Error(`icon fallback mismatch ${JSON.stringify(iconState)}`);
    console.log(`offline-check:icons:${JSON.stringify(iconState)}`);

    const groupButtons = home.locator('.fx-navitem[data-gid]');
    const groupCount = await groupButtons.count();
    console.log(`offline-check:open-group:${groupCount}`);
    if (!groupCount) throw new Error('no groups available offline');
    let folderOpened = false;
    for (let index = 0; index < groupCount; index += 1) {
      await groupButtons.nth(index).click();
      await home.waitForSelector('.fx-gtop');
      const folder = home.locator('.fx-folder').first();
      if (await folder.count()) { await folder.click(); folderOpened = true; break; }
    }
    if (!folderOpened) throw new Error('no folder route available offline');
    console.log('offline-check:folder-ready');

    console.log('offline-check:open-editor');
    const lock = home.getByRole('button', { name: /已锁定/ });
    if (await lock.count()) await lock.click();
    await home.getByRole('button', { name: '添加网站' }).first().click();
    await home.getByRole('dialog').waitFor();
    if (!await home.getByRole('textbox', { name: '名称' }).isVisible()) throw new Error('editor unavailable offline');
    await home.getByRole('button', { name: '关闭' }).click();

    console.log('offline-check:open-settings');
    await home.getByRole('button', { name: '设置', exact: true }).click();
    await home.getByRole('dialog').waitFor();
    if (!await home.getByText('高级与诊断', { exact: true }).isVisible()) throw new Error('settings unavailable offline');
    await home.getByRole('button', { name: '关闭' }).click();

    const popup = await context.newPage();
    popup.setDefaultTimeout(5000);
    watch(popup, 'popup');
    await popup.goto(`chrome-extension://${extensionId}/popup.html?e2e=offline`, { waitUntil: 'domcontentloaded' });
    await popup.waitForSelector('#pop');
    if (!await popup.getByText(/收藏|当前页面|无法读取/).first().isVisible()) throw new Error('popup unavailable offline');
    console.log('offline-check:surfaces-ready');

    if (errors.length) throw new Error(`console errors: ${errors.join(' | ')}`);
    console.log(JSON.stringify({ ok: true, extensionId, iconState, surfaces: ['home', 'group', 'folder', 'editor', 'settings', 'popup'], consoleErrors: 0 }));
  } finally {
    await context.close();
    rmSync(profile, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
