import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const runtimeFiles = [
  'newtab.html', 'popup.html', 'shared/icon-map.js', 'shared/icons.js',
  'shared/icon-editor.js', 'layouts/fusion.js',
];

const read = path => readFile(path, 'utf8');

test('runtime icon dependencies are local or pinned to an immutable version', async () => {
  const sources = (await Promise.all(runtimeFiles.map(read))).join('\n');
  assert.doesNotMatch(sources, /@(latest|main)(?:\/|\b)/i);
  const jsdelivr = [...sources.matchAll(/https:\/\/cdn\.jsdelivr\.net\/(?:npm|gh)\/[^'"`\s)]+/g)].map(match => match[0]);
  assert.ok(jsdelivr.length > 0, 'expected fixed remote brand icon fallbacks');
  for (const url of jsdelivr) assert.match(url, /@[a-z0-9][a-z0-9._-]{4,}\//i, `unpinned jsDelivr URL: ${url}`);
  assert.doesNotMatch(await read('newtab.html'), /rel=["']preconnect["']/i);
  assert.doesNotMatch(await read('popup.html'), /rel=["']preconnect["']/i);
});

test('the layout reuses the exact core module URL so boot runs only once', async () => {
  const [newtab, fusion] = await Promise.all([read('newtab.html'), read('layouts/fusion.js')]);
  const entry = newtab.match(/src=["']shared\/core\.js(\?v=[^"']+)?["']/)?.[1] || '';
  const dependency = fusion.match(/from ["']\.\.\/shared\/core\.js(\?v=[^"']+)?["']/)?.[1] || '';
  assert.equal(dependency, entry);
});

test('homepage hotfix modules share the entry cache version in long-lived Chrome profiles', async () => {
  const [newtab, core, fusion] = await Promise.all([read('newtab.html'), read('shared/core.js'), read('layouts/fusion.js')]);
  const version = newtab.match(/src=["']shared\/core\.js\?v=([^"']+)["']/)?.[1];
  assert.ok(version, 'newtab core entry must have an explicit cache version');
  assert.match(core, new RegExp(`from ['"]\\./favorites\\.js\\?v=${version.replaceAll('.', '\\.')}`));
  assert.match(core, new RegExp(`from ['"]\\./hero-clock\\.js\\?v=${version.replaceAll('.', '\\.')}`));
  assert.match(core, new RegExp(`layouts/\\$\\{name\\}\\.js\\?v=${version.replaceAll('.', '\\.')}`));
  assert.match(fusion, new RegExp(`from ['"]\\.\\./shared/home-settings\\.js\\?v=${version.replaceAll('.', '\\.')}`));
  assert.match(fusion, new RegExp(`from ['"]\\.\\./shared/hero-clock\\.js\\?v=${version.replaceAll('.', '\\.')}`));
});

test('lock screen clock is a permanent hero above search and outside widget lifecycle', async () => {
  const [core, fusion] = await Promise.all([read('shared/core.js'), read('layouts/fusion.js')]);
  const renderHome = fusion.match(/function renderHome\(core,main\)\{[\s\S]*?(?=\nfunction buildDemoBadge)/)?.[0] || '';
  const widgets = fusion.match(/function buildWidgetCards\(core, priv\)\{[\s\S]*?(?=\n\/\* 卡片本身)/)?.[0] || '';
  const hero = fusion.match(/function buildHeroClock\(core\)\{[\s\S]*?(?=\nfunction widgetWeather)/)?.[0] || '';

  assert.ok(renderHome.indexOf('buildHeroClock(core)') < renderHome.indexOf('buildAsk(core)'), 'clock must render before search');
  assert.doesNotMatch(hero, /fx-wcard/);
  assert.doesNotMatch(widgets, /case ['"]clock['"]/);
  assert.match(core, /migrateHeroClock\(s\)/);
  assert.doesNotMatch(core, /ensureClockWidget|setClockEnabled|clockEnabled/);
  assert.match(core, /显示锁屏时钟/);
  assert.match(core, /自定义时钟/);
});

test('wallpaper refresh is durably owned by the service worker', async () => {
  const [fusion, core, pageBackground, worker, manifestText] = await Promise.all([
    read('layouts/fusion.js'), read('shared/core.js'), read('shared/background.js'), read('background.js'), read('manifest.json'),
  ]);
  const manifest = JSON.parse(manifestText);
  const start = fusion.indexOf("const applyMinutes=core.btn('应用分钟数'");
  const end = fusion.indexOf("const refreshWrap=el('div','fx-bg-refresh')", start);
  assert.ok(start >= 0 && end > start, 'wallpaper refresh settings section is missing');
  const refreshSettings = fusion.slice(start, end);
  assert.equal((refreshSettings.match(/core\.save\(true\)/g)||[]).length, 2,
    'preset and custom refresh frequency saves must both notify storage');
  assert.ok(manifest.permissions.includes('alarms'),'manifest must declare the alarms permission');
  assert.match(worker,/chrome\.alarms\.onAlarm\.addListener/);
  assert.match(worker,/WALLPAPER_REFRESH_ALARM/);
  assert.match(worker,/reconcileWallpaperRefresh/);
  assert.match(worker,/downloadOnlineBackground\([\s\S]*requestPermission:false/,
    'service-worker refresh must never request a new host permission');
  assert.doesNotMatch(pageBackground,/createOnlineRefreshScheduler|autoRefreshScheduler/,
    'short-lived newtab pages must not own automatic wallpaper timers');
  assert.match(core,/cancelOnlineBackgroundRefresh/);
  assert.equal((core.match(/cancelOnlineBackgroundRefresh\(\)/g)||[]).length,3,
    'local, preset and none paths must invalidate a pending online download');
});

test('core and arbitrary group icons resolve to bundled data URLs', async () => {
  const { lucide, LOCAL_LUCIDE_NAMES } = await import('../shared/icon-map.js');
  for (const name of ['server', 'folder', 'search', 'settings', 'menu', 'cloud-rain', 'unknown-user-icon']) {
    assert.match(lucide(name), /^data:image\/svg\+xml,/);
  }
  for (const name of ['server', 'folder', 'search', 'settings', 'menu']) assert.ok(LOCAL_LUCIDE_NAMES.includes(name));
});

test('brand candidates prefer browser-local sources and always end in local fallback', async () => {
  const { brandIconCandidates, FORCE_LETTER } = await import('../shared/icon-map.js');
  const candidates = brandIconCandidates(
    { name: 'GitHub', url: 'https://github.com/' },
    { extensionFavicon: '/_favicon/?pageUrl=github', cachedIcon: 'data:image/png;base64,AA==' },
  );
  assert.deepEqual(candidates.slice(0, 2), ['/_favicon/?pageUrl=github', 'data:image/png;base64,AA==']);
  assert.match(candidates[2], /@[a-f0-9]{40}\//i);
  assert.equal(candidates.at(-1), FORCE_LETTER);
});

test('manifest permissions and runtime network hosts are disclosed in README', async () => {
  const manifest = JSON.parse(await read('manifest.json'));
  const readme = await read('README.md');
  assert.doesNotMatch(JSON.stringify(manifest), /hitokoto/i);

  for (const permission of [...manifest.permissions, ...manifest.optional_permissions]) {
    assert.match(readme, new RegExp(`\\b${permission.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`));
  }
  for (const pattern of [...manifest.host_permissions, ...manifest.optional_host_permissions]) {
    const label = pattern.includes('127.0.0.1') ? '127.0.0.1' : pattern === '*://*/*' ? '*://*/*' : new URL(pattern.replace('*.', 'wildcard.')).hostname.replace(/^wildcard\./, '');
    assert.ok(readme.includes(label), `README missing host permission ${pattern}`);
  }

  for (const host of ['cdn.jsdelivr.net', 't3.gstatic.com', 'avatars.githubusercontent.com', 'icon.horse', 'ipwho.is', 'get.geojs.io', 'api.open-meteo.com', 'www.googleapis.com', 'accounts.google.com', 'www.bing.com', 'alcy.cc', 'picsum.photos']) {
    assert.ok(readme.includes(host), `README missing runtime network host ${host}`);
  }
});
