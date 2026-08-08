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
