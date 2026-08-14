import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSearchIndex, querySearchIndex } from '../shared/search-index.js';
import { makeConfig, makeFolder, makeGroup, makeSite } from './helpers/fixtures.mjs';

test('matches Chinese names by full pinyin, initials and typo-tolerant latin text', () => {
  const config = makeConfig({ groups: [makeGroup('g1', [makeSite('i1', {
    name: '家庭网络',
    url: 'https://nas.example.com',
    aliases: ['nas'],
  })])] });
  const index = buildSearchIndex(config);

  assert.equal(querySearchIndex(index, 'jiatingwangluo')[0].id, 'i1');
  assert.equal(querySearchIndex(index, 'jtwl')[0].id, 'i1');
  assert.equal(querySearchIndex(index, 'nsa')[0].id, 'i1');
});

test('indexes url, note, tags, aliases, group and nested folder path', () => {
  const site = makeSite('i2', {
    name: '文档',
    url: 'https://docs.example.com/guide',
    note: '季度复盘资料',
    tags: ['工作', '参考'],
    aliases: ['handbook'],
  });
  const config = makeConfig({ groups: [makeGroup('g-work', [makeFolder('f-nas', [makeFolder('f-docs', [site], { name: '资料库' })], { name: 'NAS' })], { name: '开发工具' })] });
  const index = buildSearchIndex(config);

  for (const query of ['docs.example.com', '季度复盘', '工作', 'handbook', '开发工具', '资料库']) {
    assert.equal(querySearchIndex(index, query)[0].id, 'i2', query);
  }
  assert.equal(querySearchIndex(index, '', { groupId: 'g-work', folderId: 'f-docs', tag: '参考' }).length, 1);
  assert.equal(querySearchIndex(index, '', { deadOnly: true }).length, 0);
});

test('a rebuild reflects edits and never retains deleted entries', () => {
  const initial = makeConfig({ groups: [makeGroup('g1', [makeSite('i1', { name: '旧名称' }), makeSite('i2')])] });
  const first = buildSearchIndex(initial);
  assert.equal(querySearchIndex(first, '旧名称')[0].id, 'i1');

  initial.groups[0].items[0].name = '新名称';
  initial.groups[0].items.splice(1, 1);
  const rebuilt = buildSearchIndex(initial);
  assert.equal(querySearchIndex(rebuilt, '旧名称').length, 0);
  assert.equal(querySearchIndex(rebuilt, '新名称')[0].id, 'i1');
  assert.equal(querySearchIndex(rebuilt, 'i2').length, 0);
});
