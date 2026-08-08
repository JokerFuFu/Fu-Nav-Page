import test from 'node:test';
import assert from 'node:assert/strict';
import { makeConfig } from './helpers/fixtures.mjs';

test('keeps the latest five safe snapshots and restores by id', async () => {
  const memory = new Map();
  globalThis.localStorage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key),
  };
  const history = await import(`../shared/config-history.js?history=${Date.now()}`);

  for (let index = 1; index <= 6; index += 1) {
    await history.saveSnapshot(
      makeConfig({ revision: index, settings: { askProvider: 'bing', agentToken: `secret-${index}`, cloud: {} } }),
      `snapshot-${index}`,
      index,
    );
  }
  const snapshots = await history.listSnapshots();
  const restored = await history.restoreSnapshot(snapshots[4].id);

  assert.equal(snapshots.length, 5);
  assert.deepEqual(snapshots.map((entry) => entry.reason), [
    'snapshot-6',
    'snapshot-5',
    'snapshot-4',
    'snapshot-3',
    'snapshot-2',
  ]);
  assert.equal(restored.revision, 2);
  assert.doesNotMatch(memory.get('fn_history_v1'), /secret-/);
  delete globalThis.localStorage;
});
