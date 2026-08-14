import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { findLargestNamedFolder, mergeBookmarkFolder, rebuildBookmarkFolderStructure } from '../shared/bookmark-recovery.js';
import { validateConfig } from '../shared/config-schema.js';

const site = (id, title, url) => ({ id, title, url });
const folder = (id, title, children = []) => ({ id, title, children });

test('selects the largest named folder and merges all descendants without overwriting current metadata', () => {
  const small = folder('small', 'Fu 导航', [site('s1', '小集合', 'https://small.example/')]);
  const large = folder('large', 'Fu 导航', [
    site('b1', '已有书签的新名称', 'https://keep.example/'),
    folder('nested', '二级目录', [
      site('b2', '新增一', 'https://one.example/path/'),
      folder('deep', '更深目录', [site('b3', '新增二', 'https://two.example/?utm_source=old')]),
    ]),
    site('b4', '重复一', 'https://one.example/path'),
  ]);
  const tree = [{ id: '0', title: '', children: [folder('bar', '书签栏', [small, large])] }];
  const original = {
    version: 3,
    settings: {},
    groups: [{
      id: 'g-existing',
      name: 'Fu 导航',
      icon: 'star',
      color: '#64748b',
      items: [{ id: 'keep-id', name: '我的名称', url: 'https://keep.example', note: '保留备注', tags: ['重要'] }],
    }],
  };
  let seq = 0;

  const selected = findLargestNamedFolder(tree, 'Fu 导航');
  const first = mergeBookmarkFolder(original, selected, { makeId: () => `new-${++seq}`, color: '#2563eb' });
  const kept = first.config.groups[0].items.find(item => item.id === 'keep-id');

  assert.equal(selected.id, 'large');
  assert.equal(first.total, 4);
  assert.equal(first.added, 2);
  assert.equal(first.duplicates, 2);
  assert.equal(first.groupId, 'g-existing');
  assert.equal(kept.name, '我的名称');
  assert.equal(kept.note, '保留备注');
  assert.deepEqual(kept.tags, ['重要']);
  assert.equal(first.config.groups[0].items.length, 3);
  assert.equal(original.groups[0].items.length, 1, 'input config must remain untouched');

  const second = mergeBookmarkFolder(first.config, selected, { makeId: () => `repeat-${++seq}`, color: '#2563eb' });
  assert.equal(second.added, 0);
  assert.equal(second.duplicates, 4);
  assert.equal(second.config.groups[0].items.length, 3);
});

test('creates one group and treats a missing or empty folder as a no-op', () => {
  const config = { version: 3, settings: {}, groups: [] };
  const source = folder('source', 'Fu 导航', [site('a', '站点', 'https://site.example/')]);

  const merged = mergeBookmarkFolder(config, source, { makeId: prefix => `${prefix}-fixed`, color: '#14b8a6' });
  assert.equal(merged.added, 1);
  assert.equal(merged.config.groups.length, 1);
  assert.equal(merged.config.groups[0].name, 'Fu 导航');
  assert.equal(merged.config.groups[0].items[0].name, '站点');

  assert.equal(findLargestNamedFolder([], 'Fu 导航'), null);
  const noop = mergeBookmarkFolder(merged.config, null, { makeId: () => 'unused' });
  assert.equal(noop.added, 0);
  assert.deepEqual(noop.config, merged.config);
});

test('rebuilds the original bookmark tree from a flat recovery while preserving current metadata', () => {
  const source = folder('source', 'Fu 导航', [
    site('root-site', '根层来源名', 'https://root.example/'),
    folder('dev-source', '开发', [
      folder('front-source', '前端', [
        site('keep-source', '来源名称不覆盖', 'https://keep.example/'),
        site('new-source', '新增网站', 'https://new.example/docs'),
      ]),
      site('docs-source', '开发文档', 'https://docs.example/'),
    ]),
    site('new-duplicate', '新增网站重复', 'https://new.example/docs/'),
  ]);
  const config = {
    version: 3,
    settings: {},
    groups: [{
      id: 'g-existing',
      name: 'Fu 导航',
      icon: 'star',
      color: '#64748b',
      items: [
        { id: 'keep-id', name: '我的名称', url: 'https://keep.example', note: '保留备注', tags: ['重要'], clicks: 9 },
        { id: 'root-id', name: '我的根层名称', url: 'https://root.example', note: '', icon: '' },
        { id: 'extra-id', name: '仅导航内存在', url: 'https://extra.example/', note: '不能删除', icon: '' },
      ],
    }],
  };
  let seq = 0;

  const first = rebuildBookmarkFolderStructure(config, source, { makeId: prefix => `${prefix}-new-${++seq}` });
  const target = first.config.groups[0];
  const development = target.items.find(item => item.type === 'folder' && item.name === '开发');
  const frontend = development.items.find(item => item.type === 'folder' && item.name === '前端');
  const kept = frontend.items.find(item => item.id === 'keep-id');
  const unclassified = target.items.find(item => item.type === 'folder' && item.name === '未归类');

  assert.deepEqual(target.items.map(item => item.name), ['我的根层名称', '开发', '未归类']);
  assert.equal(development.bookmarkSourceId, 'dev-source');
  assert.equal(frontend.bookmarkSourceId, 'front-source');
  assert.equal(kept.name, '我的名称');
  assert.equal(kept.note, '保留备注');
  assert.deepEqual(kept.tags, ['重要']);
  assert.equal(kept.clicks, 9);
  assert.deepEqual(unclassified.items.map(item => item.id), ['extra-id']);
  assert.deepEqual({ total: first.total, folders: first.folders, reused: first.reused, added: first.added, unclassified: first.unclassified }, { total: 4, folders: 2, reused: 2, added: 2, unclassified: 1 });
  assert.equal(first.changed, true);
  assert.equal(config.groups[0].items.length, 3, 'input config must remain flat and untouched');

  const second = rebuildBookmarkFolderStructure(first.config, source, { makeId: () => { throw new Error('idempotent rebuild must reuse ids'); } });
  assert.equal(second.changed, false);
  assert.deepEqual(second.config, first.config);
});

test('folds browser folders deeper than two levels into named second-level paths', () => {
  const source = folder('source', 'Fu 导航', [
    folder('a', '开发', [
      folder('b', '前端', [
        site('b-site', '前端入口', 'https://front.example/'),
        folder('c', '框架', [site('c-site', '框架文档', 'https://framework.example/')]),
      ]),
    ]),
  ]);
  let seq = 0;

  const result = rebuildBookmarkFolderStructure({ version: 3, settings: {}, groups: [] }, source, { makeId: prefix => `${prefix}-${++seq}` });
  const development = result.config.groups[0].items[0];

  assert.equal(development.name, '开发');
  assert.deepEqual(development.items.map(item => item.name), ['前端', '前端 / 框架']);
  assert.equal(development.items[0].items[0].name, '前端入口');
  assert.equal(development.items[1].items[0].name, '框架文档');
  assert.equal(development.items.some(item => item.items.some(child => child.type === 'folder')), false, 'config must remain within the two-folder-level contract');
  assert.deepEqual(validateConfig(result.config), { ok: true, errors: [] });
});

test('classifies a fully flat browser source into deterministic semantic folders', () => {
  const samples = [
    ['network-id', '家里路由器', 'http://192.168.1.1/'],
    ['ai-id', 'Kimi', 'https://www.kimi.com/'],
    ['dev-id', 'GitHub', 'https://github.com/'],
    ['design-id', 'Figma', 'https://www.figma.com/'],
    ['mail-id', 'Gmail', 'https://mail.google.com/'],
    ['media-id', 'YouTube', 'https://www.youtube.com/'],
    ['other-id', '没有特征的网站', 'https://example.net/'],
  ];
  const source = folder('source', 'Fu 导航', samples.map(([id, name, url]) => site(`source-${id}`, name, url)));
  const config = { version: 3, settings: {}, groups: [{ id: 'g-flat', name: 'Fu 导航', items: samples.map(([id, name, url]) => ({ id, name: `用户-${name}`, url, note: `${id}-note`, icon: '' })) }] };
  let seq = 0;

  const first = rebuildBookmarkFolderStructure(config, source, { makeId: prefix => `${prefix}-category-${++seq}` });
  const target = first.config.groups[0];
  const expected = {
    '网络与设备': 'network-id',
    'AI 与效率': 'ai-id',
    '开发工具': 'dev-id',
    '设计创意': 'design-id',
    '邮箱通讯': 'mail-id',
    '影音娱乐': 'media-id',
    '其他': 'other-id',
  };

  assert.deepEqual(target.items.map(item => item.name), Object.keys(expected));
  for (const category of target.items) {
    assert.equal(category.type, 'folder');
    assert.equal(category.items[0].id, expected[category.name]);
    assert.equal(category.items[0].note, `${expected[category.name]}-note`);
    assert.match(category.bookmarkSourceId, /^auto:/);
  }

  const second = rebuildBookmarkFolderStructure(first.config, source, { makeId: () => { throw new Error('flat classification must reuse ids'); } });
  assert.equal(second.changed, false);
  assert.deepEqual(second.config, first.config);
});

test('Core recovery checks existing permission without silently requesting it', async () => {
  const core = await readFile('shared/core.js', 'utf8');
  const method = core.match(/async recoverOriginalBookmarks\(\)[\s\S]*?\n  \}/)?.[0] || '';
  assert.match(method, /chrome\.permissions\.contains/);
  assert.doesNotMatch(method, /chrome\.permissions\.request/);
  assert.match(core, /recoverOriginalBookmarks\(\)/);
});

test('Core runs a separately versioned structure migration for already-flattened users', async () => {
  const core = await readFile('shared/core.js', 'utf8');
  const method = core.match(/async recoverOriginalBookmarkStructure\(\)[\s\S]*?\n  \}/)?.[0] || '';
  assert.match(method, /bookmarkStructureRecoveryV327/);
  assert.match(method, /chrome\.permissions\.contains/);
  assert.match(method, /bookmark-structure-recovery/);
  assert.match(method, /rebuildBookmarkFolderStructure/);
  assert.doesNotMatch(method, /chrome\.permissions\.request/);
  assert.match(core, /recoverOriginalBookmarks\(\)[\s\S]{0,300}recoverOriginalBookmarkStructure\(\)/);
});
