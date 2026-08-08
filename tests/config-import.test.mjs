import test from 'node:test';
import assert from 'node:assert/strict';
import { makeConfig, makeFolder, makeGroup, makeSite } from './helpers/fixtures.mjs';
import { parseImport, mergeImportCandidate, applyImport } from '../shared/config-import.js';
import { listSnapshots, restoreSnapshot } from '../shared/config-history.js';

test('rejects malformed trees and reports exact paths without mutating current config', () => {
  const current = makeConfig();
  const before = structuredClone(current);
  const missingUrl = parseImport(JSON.stringify({
    version: 3,
    settings: {},
    groups: [{ id: 'g1', items: [{ id: 'i1', name: 'missing url' }] }],
  }), current, 500);
  const tooDeep = parseImport(JSON.stringify(makeConfig({
    groups: [makeGroup('g1', [makeFolder('f1', [makeFolder('f2', [makeFolder('f3')])])])],
  })), current, 500);
  const brokenJson = parseImport('{"groups":', current, 500);

  assert.equal(missingUrl.ok, false);
  assert.match(missingUrl.errors[0].path, /groups\[0\]\.items\[0\]\.url/);
  assert.equal(tooDeep.ok, false);
  assert.match(tooDeep.errors[0].path, /groups\[0\]\.items\[0\]\.items\[0\]\.items\[0\]\.items/);
  assert.equal(brokenJson.ok, false);
  assert.equal(brokenJson.errors[0].path, '$');
  assert.deepEqual(current, before);
});

test('summarizes added, updated, removed and normalized duplicate entries exactly', () => {
  const current = makeConfig({
    settings: { askProvider: 'bing', cloud: {} },
    groups: [makeGroup('g1', [
      makeSite('same', { url: 'https://same.example.com/' }),
      makeSite('updated', { name: 'local' }),
      makeSite('removed'),
    ])],
  });
  const candidate = makeConfig({
    settings: { askProvider: 'google', cloud: {} },
    groups: [makeGroup('g1', [
      makeSite('same', { url: 'https://same.example.com/' }),
      makeSite('updated', { name: 'remote' }),
      makeSite('added'),
      makeSite('duplicate', { url: 'HTTPS://same.example.com:443/?utm_source=backup' }),
    ])],
  });

  const result = parseImport(JSON.stringify(candidate), current, 500);

  assert.equal(result.ok, true);
  assert.deepEqual(result.diff.counts, {
    added: 1,
    updated: 1,
    removed: 1,
    duplicates: 1,
    invalid: 0,
    settings: 1,
  });
  assert.deepEqual(result.diff.addedIds, ['added']);
  assert.deepEqual(result.diff.updatedIds, ['updated']);
  assert.deepEqual(result.diff.removedIds, ['removed']);
  assert.deepEqual(result.diff.duplicateIds, ['duplicate']);
  assert.equal(result.candidate.version, 3);
});

test('local-first merge preserves conflicts while adding unrelated remote nodes', () => {
  const current = makeConfig({
    groups: [makeGroup('g1', [makeSite('conflict', { name: 'local', updatedAt: 200 })])],
  });
  const candidate = makeConfig({
    groups: [makeGroup('g1', [
      makeSite('conflict', { name: 'cloud', updatedAt: 200 }),
      makeSite('remote-only'),
    ])],
  });

  const merged = mergeImportCandidate(current, candidate);

  assert.equal(merged.groups[0].items.find((item) => item.id === 'conflict').name, 'local');
  assert.equal(merged.groups[0].items.some((item) => item.id === 'remote-only'), true);
  assert.equal(current.groups[0].items.length, 1);
});

test('application snapshots the untouched current config before replacing it', async () => {
  const memory = new Map();
  globalThis.localStorage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key),
  };
  const current = makeConfig({ settings: { title: 'Local', askProvider: 'bing', cloud: {} } });
  const candidate = makeConfig({ settings: { title: 'Imported', askProvider: 'google', cloud: {} } });
  const result = parseImport(candidate, current, 500);
  const calls = [];
  const core = {
    cfg: current,
    migrate: () => calls.push('migrate'),
    applyTheme: () => calls.push('theme'),
    rerender: () => calls.push('render'),
    save: async () => calls.push('save'),
  };

  const applied = await applyImport(core, result, 'test-import');
  const snapshots = await listSnapshots();
  const restored = await restoreSnapshot(snapshots[0].id);

  assert.equal(applied.ok, true);
  assert.equal(core.cfg.settings.title, 'Imported');
  assert.equal(restored.settings.title, 'Local');
  assert.deepEqual(calls, ['migrate', 'theme', 'render', 'save']);
  delete globalThis.localStorage;
});
