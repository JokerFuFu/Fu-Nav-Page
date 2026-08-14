#!/usr/bin/env node
const { mkdtempSync, rmSync } = require('node:fs');
const { createServer } = require('node:http');
const { homedir, tmpdir } = require('node:os');
const { dirname, join, resolve } = require('node:path');

let playwright = null;
for (const candidate of [
  'playwright',
  join(dirname(dirname(process.execPath)), 'node_modules/playwright'),
  join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'),
]) {
  try { playwright = require(candidate); break; } catch {}
}
if (!playwright) throw new Error('Playwright 未安装；请在 Codex Desktop 工作区运行');

const extensionPath = resolve(process.argv[2] || '.');
const profile = mkdtempSync(join(tmpdir(), 'fu-nav-popup-layout-'));
const server = createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end('<!doctype html><title>官方驱动下载</title><h1>Popup target</h1>');
});

const assert = (value, message) => { if (!value) throw new Error(message); };
const listen = () => new Promise((resolveListen, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolveListen));
const closeServer = () => new Promise(resolveClose => server.close(resolveClose));

async function readPopupMetrics(cdp, targetId) {
  const attached = await cdp.send('Target.attachToTarget', { targetId, flatten: false });
  let messageId = 0;
  const send = (method, params = {}) => new Promise((resolveMessage, rejectMessage) => {
    const id = ++messageId;
    const listener = event => {
      if (event.sessionId !== attached.sessionId) return;
      const message = JSON.parse(event.message);
      if (message.id !== id) return;
      cdp.off('Target.receivedMessageFromTarget', listener);
      if (message.error) rejectMessage(new Error(message.error.message));
      else resolveMessage(message.result);
    };
    cdp.on('Target.receivedMessageFromTarget', listener);
    cdp.send('Target.sendMessageToTarget', {
      sessionId: attached.sessionId,
      message: JSON.stringify({ id, method, params }),
    }).catch(rejectMessage);
  });

  try {
    await send('Runtime.enable');
    const result = await send('Runtime.evaluate', {
      expression: `new Promise(resolve => {
        const started=Date.now();
        const read=()=>{
          const title=document.querySelector('.pop-title');
          const row=document.querySelector('.pop-row');
          const footer=document.querySelector('.pop-foot');
          const primary=footer?.querySelector('.primary');
          if((!title||!row||!footer||!primary)&&Date.now()-started<2000)return setTimeout(read,25);
          const rect=node=>{const r=node?.getBoundingClientRect();return r&&{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
          resolve({innerWidth,innerHeight,body:rect(document.body),scrollWidth:document.documentElement.scrollWidth,title:rect(title),row:rect(row),footer:rect(footer),primary:rect(primary)});
        };
        read();
      })`,
      awaitPromise: true,
      returnByValue: true,
    });
    return result.result.value;
  } finally {
    await cdp.send('Target.detachFromTarget', { sessionId: attached.sessionId });
  }
}

(async () => {
  await listen();
  const context = await playwright.chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1024, height: 768 },
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  try {
    let workers = context.serviceWorkers();
    if (!workers.length) workers = [await context.waitForEvent('serviceworker')];
    const extensionId = new URL(workers[0].url()).host;
    const targetPage = await context.newPage();
    await targetPage.goto(`http://127.0.0.1:${server.address().port}/target`, { waitUntil: 'domcontentloaded' });
    await targetPage.bringToFront();

    await workers[0].evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      await chrome.action.openPopup({ windowId: tab.windowId });
    });

    const cdp = await context.newCDPSession(targetPage);
    const snapshot = await cdp.send('Target.getTargets');
    const popupTarget = snapshot.targetInfos.find(target => target.url === `chrome-extension://${extensionId}/popup.html`);
    assert(popupTarget, '真实 action popup target 未创建');
    const metrics = await readPopupMetrics(cdp, popupTarget.targetId);

    assert(metrics.innerWidth >= 400 && metrics.innerWidth <= 440, `popup viewport 过窄或过宽：${metrics.innerWidth}px`);
    assert(metrics.body && Math.abs(metrics.body.width - metrics.innerWidth) <= 1, `popup body 未占满视口：${metrics.body?.width}/${metrics.innerWidth}`);
    assert(metrics.scrollWidth <= metrics.innerWidth, `popup 发生横向溢出：${metrics.scrollWidth}/${metrics.innerWidth}`);
    assert(metrics.title && metrics.title.height <= 24, `popup 标题发生多行换行：${metrics.title?.height}px`);
    assert(metrics.row && metrics.row.width >= 360, `popup 双列表单被压缩：${metrics.row?.width}px`);
    assert(metrics.primary && metrics.primary.right <= metrics.innerWidth && metrics.primary.width >= 150, `popup 主操作被裁切或过窄：${JSON.stringify(metrics.primary)}`);
    console.log(JSON.stringify({ ok: true, extensionId, metrics }));
  } finally {
    await context.close();
  }
})().catch(error => {
  console.error(`popup-layout-check: ${error.message}`);
  process.exitCode = 1;
}).finally(async () => {
  if (server.listening) await closeServer();
  rmSync(profile, { recursive: true, force: true });
});
