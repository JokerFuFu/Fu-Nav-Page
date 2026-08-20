#!/usr/bin/env node
const { mkdtempSync, rmSync } = require('node:fs');
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
const profile = mkdtempSync(join(tmpdir(), 'fu-nav-wallpaper-background-'));
const sourceUrl = 'http://127.0.0.1:7842/wallpaper-auto.svg';
const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms));

async function readConfig(worker) {
  return worker.evaluate(() => new Promise(resolveGet => chrome.storage.local.get(['fn_config'], value => resolveGet(value.fn_config || null))));
}
async function readBackground(worker) {
  return (await readConfig(worker))?.settings?.background || null;
}
async function readRuntime(worker) {
  return worker.evaluate(() => new Promise(resolveGet => chrome.storage.local.get(['fn_wallpaper_refresh_v1'], value => resolveGet(value.fn_wallpaper_refresh_v1 || null))));
}
async function setBackground(worker, background, settingsPatch={}) {
  return worker.evaluate(({ nextBackground, patch }) => new Promise(resolveSet => chrome.storage.local.get(['fn_config'], value => {
    const current=value.fn_config||{version:3,revision:1,settings:{},groups:[]};
    current.settings={...current.settings,...patch,background:nextBackground};
    current.savedAt=Date.now();
    chrome.storage.local.set({fn_config:current},resolveSet);
  })), {nextBackground:background,patch:settingsPatch});
}
async function waitForRefresh(worker, previousImageId) {
  const deadline = Date.now() + 4000;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await readRuntime(worker);
    if (latest?.onlineImageId && latest.onlineImageId !== previousImageId && latest.lastFetchAt > 0) return latest;
    await sleep(50);
  }
  throw new Error(`没有首页页面时，在线壁纸未被后台任务更新：${JSON.stringify(latest)}`);
}

(async () => {
  let firstRequestResolve, firstResponseRelease, requestCount=0;
  const firstRequest = new Promise(resolveRequest => { firstRequestResolve=resolveRequest; });
  const firstResponseGate = new Promise(resolveRelease => { firstResponseRelease=resolveRelease; });
  const context = await playwright.chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  try {
    await context.route('http://127.0.0.1:7842/wallpaper-auto.svg**', async route => {
      requestCount++;
      if(requestCount===1){ firstRequestResolve(); await firstResponseGate; }
      await route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="${requestCount%2?'#ffffff':'#eeeeee'}"/></svg>`,
      });
    });
    let worker = context.serviceWorkers()[0];
    if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 10000 });
    const permissionProbeInstalled = await worker.evaluate(() => {
      globalThis.__wallpaperPermissionRequests=0;
      try{
        Object.defineProperty(chrome.permissions,'request',{configurable:true,value:(_query,callback)=>{
          globalThis.__wallpaperPermissionRequests++;
          queueMicrotask(()=>callback(false));
        }});
        return true;
      }catch{return false;}
    });
    if(!permissionProbeInstalled)throw new Error('无法安装后台权限请求探针');

    const extensionPages = context.pages().filter(page => page.url().startsWith('chrome-extension://'));
    if (extensionPages.length) throw new Error(`测试前不应存在 Fu Nav 页面：${extensionPages.map(page => page.url()).join(', ')}`);

    // 场景 1：下载期间必须已经预排下一次 alarm；用户随后改配置时，迟到响应不得整份覆盖。
    const firstStartedAt=Date.now();
    await setBackground(worker,{
      enabled:true,mode:'online',onlineImageId:'bg_stale_old',onlineSrc:{id:'custom',url:sourceUrl},
      refreshEvery:1,lastFetchAt:firstStartedAt-2*60_000,scrimOpacity:0.55,
    },{title:'下载前配置',bmSync:{enabled:false}});
    await firstRequest;
    const duringRequest=await readRuntime(worker);
    const duringBackground=await readBackground(worker);
    const armedDuringRequest=await worker.evaluate(() => new Promise(resolveGet => chrome.alarms.get('fu-nav-wallpaper-refresh',resolveGet)));
    const expectedRetryAt=duringRequest.lastAttemptAt+duringBackground.refreshEvery*60_000;
    if(!armedDuringRequest||armedDuringRequest.scheduledTime!==expectedRetryAt){
      throw new Error(`网络请求期间没有持久 retry alarm：${JSON.stringify(armedDuringRequest)}`);
    }
    await setBackground(worker,{
      enabled:true,mode:'preset',presetId:'p01',refreshEvery:0,lastFetchAt:duringRequest.lastFetchAt,scrimOpacity:0.55,
    },{title:'下载期间的新配置'});
    firstResponseRelease();
    await sleep(500);
    const afterStaleResponse=await readConfig(worker);
    if(afterStaleResponse.settings.title!=='下载期间的新配置'||afterStaleResponse.settings.background.mode!=='preset'){
      throw new Error(`迟到壁纸响应覆盖了较新配置：${JSON.stringify(afterStaleResponse.settings)}`);
    }

    // 场景 2：没有首页页面时，过期配置由 Service Worker 更新并按原频率排下一次。
    const successStartedAt=Date.now();
    await setBackground(worker,{
      enabled:true,mode:'online',onlineImageId:'bg_success_old',onlineSrc:{id:'custom',url:sourceUrl},
      refreshEvery:1,lastFetchAt:successStartedAt-2*60_000,scrimOpacity:0.55,
    });
    const refreshed=await waitForRefresh(worker,'bg_success_old');
    const refreshedBackground=await readBackground(worker);
    const nextAlarm=await worker.evaluate(() => new Promise(resolveGet => chrome.alarms.get('fu-nav-wallpaper-refresh',resolveGet)));
    const expectedNextAt=refreshed.lastFetchAt+refreshedBackground.refreshEvery*60_000;
    if(!nextAlarm||nextAlarm.scheduledTime!==expectedNextAt)throw new Error(`刷新后未按原频率安排下一次任务：${JSON.stringify(nextAlarm)}`);

    // 场景 3：等待未来 alarm 自己触发；等待期间不轮询 Worker，避免测试代码人为保活。
    const alarmRequestBaseline=requestCount, alarmStartedAt=Date.now();
    await setBackground(worker,{
      enabled:true,mode:'online',onlineImageId:'bg_alarm_old',onlineSrc:{id:'custom',url:sourceUrl},
      refreshEvery:0.01,lastFetchAt:alarmStartedAt,scrimOpacity:0.55,
    });
    await sleep(1800);
    const afterAlarm=await readRuntime(worker);
    if(requestCount<=alarmRequestBaseline||afterAlarm.onlineImageId==='bg_alarm_old'){
      throw new Error(`未来 alarm 没有触发后台更新：${JSON.stringify({requestCount,alarmRequestBaseline,afterAlarm})}`);
    }

    // 场景 4：未授权自定义源只能失败并重排，不得在无用户手势的 Worker 中请求权限。
    const permissionStartedAt=Date.now();
    await setBackground(worker,{
      enabled:true,mode:'online',onlineImageId:'bg_permission_old',onlineSrc:{id:'custom',url:'https://ungranted.invalid/wallpaper.svg'},
      refreshEvery:1,lastFetchAt:permissionStartedAt-2*60_000,scrimOpacity:0.55,
    });
    const permissionDeadline=Date.now()+2000;
    let permissionState=null;
    while(Date.now()<permissionDeadline){
      permissionState=await readRuntime(worker);
      if(permissionState?.lastAttemptAt>=permissionStartedAt)break;
      await sleep(50);
    }
    await sleep(100);
    const permissionRequests=await worker.evaluate(()=>globalThis.__wallpaperPermissionRequests);
    if(permissionRequests!==0)throw new Error(`后台任务错误请求了新 host 权限：${permissionRequests}`);
    const permissionBackground=await readBackground(worker);
    if(permissionBackground?.onlineImageId!=='bg_permission_old'||permissionState?.onlineImageId)throw new Error('未授权来源不应替换现有壁纸');
    const permissionAlarm=await worker.evaluate(() => new Promise(resolveGet => chrome.alarms.get('fu-nav-wallpaper-refresh',resolveGet)));
    const expectedPermissionRetry=permissionState.lastAttemptAt+permissionBackground.refreshEvery*60_000;
    if(!permissionAlarm||permissionAlarm.scheduledTime!==expectedPermissionRetry)throw new Error(`未授权失败后没有按原频率重排：${JSON.stringify(permissionAlarm)}`);

    console.log(JSON.stringify({
      ok:true,
      noNewtabPage:true,
      retryAlarmPrearmed:true,
      staleResponseDiscarded:true,
      imageChanged:true,
      futureAlarmTriggered:true,
      permissionRequests,
    }));
  } finally {
    await context.close();
  }
})().catch(error => {
  console.error(`wallpaper-background-check: ${error.message}`);
  process.exitCode = 1;
}).finally(() => {
  rmSync(profile,{recursive:true,force:true});
});
