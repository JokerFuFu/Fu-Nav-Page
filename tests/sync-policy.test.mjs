import test from 'node:test';
import assert from 'node:assert/strict';
import { makeConfig, makeGroup, makeSite } from './helpers/fixtures.mjs';
import { applyInboxOps, diffRestore } from '../shared/sync-policy.js';

test('delete wins stale edit while unrelated edit survives and replay is idempotent', () => {
  const config = makeConfig({
    groups: [makeGroup('g1', [makeSite('gone'), makeSite('kept')])],
  });
  const ops = [
    { opId: 'op-edit', at: 310, op: 'edit', id: 'kept', patch: { name: 'updated' } },
    { opId: 'op-old-edit', at: 200, op: 'edit', id: 'gone', patch: { name: 'stale' } },
    { opId: 'op-del', at: 300, op: 'del', id: 'gone' },
  ];

  const first = applyInboxOps(config, ops, new Set());
  const second = applyInboxOps(first.config, ops, first.seenOpIds);

  assert.equal(JSON.stringify(first.config).includes('gone'), false);
  assert.equal(first.config.groups[0].items[0].name, 'updated');
  assert.equal(first.applied, 2);
  assert.equal(first.skipped, 1);
  assert.equal(second.applied, 0);
  assert.equal(second.skipped, 3);
});

test('add recreates a missing target group once and rejects duplicate URLs', () => {
  const config = makeConfig();
  const site = makeSite('new', { url: 'https://example.com/' });
  const ops = [
    { opId: 'add-1', at: 100, op: 'add', gid: 'g-new', gname: '收藏', gicon: 'star', gcolor: '#22c55e', item: site },
    { opId: 'add-2', at: 110, op: 'add', gid: 'g-new', item: makeSite('duplicate', { url: 'https://example.com/' }) },
  ];

  const result = applyInboxOps(config, ops, new Set());

  assert.equal(result.config.groups.length, 1);
  assert.equal(result.config.groups[0].items.length, 1);
  assert.equal(result.config.groups[0].items[0].id, 'new');
});

test('restore diff reports added, updated, removed and conflicting IDs without mutation', () => {
  const current = makeConfig({
    groups: [makeGroup('g1', [makeSite('same'), makeSite('updated', { name: 'local' }), makeSite('removed')])],
  });
  const candidate = makeConfig({
    groups: [makeGroup('g1', [makeSite('same'), makeSite('updated', { name: 'remote' }), makeSite('added')])],
  });
  const before = structuredClone(current);

  const diff = diffRestore(current, candidate);

  assert.deepEqual(diff.added, ['added']);
  assert.deepEqual(diff.updated, ['updated']);
  assert.deepEqual(diff.removed, ['removed']);
  assert.deepEqual(diff.conflicts, ['updated']);
  assert.deepEqual(current, before);
});
