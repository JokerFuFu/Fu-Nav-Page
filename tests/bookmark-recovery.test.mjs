import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { findLargestNamedFolder, mergeBookmarkFolder } from '../shared/bookmark-recovery.js';

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

test('Core recovery checks existing permission without silently requesting it', async () => {
  const core = await readFile('shared/core.js', 'utf8');
  const method = core.match(/async recoverOriginalBookmarks\(\)[\s\S]*?\n  \}/)?.[0] || '';
  assert.match(method, /chrome\.permissions\.contains/);
  assert.doesNotMatch(method, /chrome\.permissions\.request/);
  assert.match(core, /recoverOriginalBookmarks\(\)/);
});
