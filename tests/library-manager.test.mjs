import test from 'node:test';
import assert from 'node:assert/strict';
import { applyBulkOperation, clusterDuplicates, updateSelection } from '../shared/library-manager.js';
import { locateNode } from '../shared/tree.js';
import { makeConfig, makeFolder, makeGroup, makeSite } from './helpers/fixtures.mjs';

test('bulk move preserves ids and metadata for deeply nested sites', () => {
  const site = makeSite('i-deep', { tags: ['keep'], aliases: ['nas'], note: 'metadata' });
  const config = makeConfig({ groups: [
    makeGroup('g1', [makeFolder('f1', [makeFolder('f2', [site])])]),
    makeGroup('g2', []),
  ] });

  const result = applyBulkOperation(config, ['i-deep'], { type: 'move', destination: { groupId: 'g2' } });
  const moved = locateNode(result.config.groups, 'i-deep');
  assert.equal(result.ok, true);
  assert.equal(moved.group.id, 'g2');
  assert.deepEqual(moved.node.tags, ['keep']);
  assert.deepEqual(moved.node.aliases, ['nas']);
  assert.equal(moved.node.note, 'metadata');
  assert.ok(locateNode(config.groups, 'i-deep').parent, 'source config remains unchanged');
});

test('bulk delete emits tombstones and snapshots once before mutation', () => {
  const config = makeConfig({ groups: [makeGroup('g1', [makeSite('i1'), makeSite('i2'), makeSite('i3')])] });
  const calls = [];
  const result = applyBulkOperation(config, ['i1', 'i3'], { type: 'delete' }, {
    onSnapshot: (before) => calls.push(['snapshot', before.groups[0].items.length]),
    onTombstone: (id) => calls.push(['tombstone', id]),
  });

  assert.equal(result.ok, true);
  assert.equal(result.affected, 2);
  assert.deepEqual(result.tombstones.sort(), ['i1', 'i3']);
  assert.deepEqual(result.config.groups[0].items.map((item) => item.id), ['i2']);
  assert.deepEqual(calls, [['snapshot', 3], ['tombstone', 'i1'], ['tombstone', 'i3']]);
});

test('selection can select current results without disturbing hidden choices', () => {
  const selected = updateSelection(new Set(['hidden']), ['i1', 'i2'], 'select-all');
  assert.deepEqual([...selected].sort(), ['hidden', 'i1', 'i2']);
  assert.deepEqual([...updateSelection(selected, ['i1'], 'deselect-all')].sort(), ['hidden', 'i2']);
  assert.deepEqual([...updateSelection(selected, ['i2'], 'toggle')].sort(), ['hidden', 'i1']);
});

test('duplicate clustering keeps exact, possible and business-query-distinct cases separate', () => {
  const items = [
    makeSite('exact-a', { url: 'https://example.com/a?utm_source=x' }),
    makeSite('exact-b', { url: 'https://example.com/a/' }),
    makeSite('possible-a', { url: 'http://www.example.net/docs' }),
    makeSite('possible-b', { url: 'https://example.net/docs/' }),
    makeSite('query-a', { url: 'https://shop.example.com/item?id=1' }),
    makeSite('query-b', { url: 'https://shop.example.com/item?id=2' }),
  ];
  const clusters = clusterDuplicates(items);

  assert.deepEqual(clusters.filter((cluster) => cluster.level === 'exact').map((cluster) => cluster.items.map((item) => item.id)), [['exact-a', 'exact-b']]);
  assert.deepEqual(clusters.filter((cluster) => cluster.level === 'possible').map((cluster) => cluster.items.map((item) => item.id)), [['possible-a', 'possible-b']]);
  assert.equal(clusters.some((cluster) => cluster.items.some((item) => item.id.startsWith('query-'))), false);
});
