import { migrateConfig, validateConfig } from './config-schema.js';
import { injectSecrets, splitSecrets } from './config-secrets.js';
import { saveSnapshot } from './config-history.js';
import { diffRestore } from './sync-policy.js';
import { normalizeUrl } from './url.js';

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function emptyDiff(invalid = 0) {
  return {
    counts: { added: 0, updated: 0, removed: 0, duplicates: 0, invalid, settings: 0 },
    addedIds: [],
    updatedIds: [],
    removedIds: [],
    duplicateIds: [],
    conflictIds: [],
    settingsChanged: false,
  };
}

function invalidResult(errors) {
  return { ok: false, candidate: null, diff: emptyDiff(errors.length), errors };
}

function walkItems(items, visit) {
  for (const item of items || []) {
    if (!item) continue;
    visit(item);
    if (item.type === 'folder') walkItems(item.items, visit);
  }
}

function duplicateIds(config) {
  const seen = new Map();
  const duplicates = [];
  for (const group of config.groups || []) {
    walkItems(group.items, (item) => {
      if (item.type === 'folder') return;
      const key = normalizeUrl(item.url, 'strict');
      if (!key) return;
      if (seen.has(key)) duplicates.push(item.id);
      else seen.set(key, item.id);
    });
  }
  return [...new Set(duplicates)].sort();
}

export function parseImport(text, current, now = Date.now()) {
  let parsed;
  try {
    parsed = typeof text === 'string' ? JSON.parse(text) : clone(text);
  } catch (error) {
    return invalidResult([{ path: '$', message: 'JSON 无法解析', code: 'invalid_json' }]);
  }

  const rawValidation = validateConfig(parsed);
  if (!rawValidation.ok) return invalidResult(rawValidation.errors);

  const migrated = migrateConfig(parsed, now);
  const validation = validateConfig(migrated.config);
  if (!validation.ok) return invalidResult(validation.errors);

  const candidate = migrated.config;
  const baseDiff = diffRestore(current, candidate);
  const duplicates = duplicateIds(candidate);
  const duplicateSet = new Set(duplicates);
  const addedIds = baseDiff.added.filter((id) => !duplicateSet.has(id));
  const updatedIds = baseDiff.updated.filter((id) => !duplicateSet.has(id));
  const settingsChanged = JSON.stringify(splitSecrets(current).config.settings || {}) !== JSON.stringify(candidate.settings || {});
  const diff = {
    counts: {
      added: addedIds.length,
      updated: updatedIds.length,
      removed: baseDiff.removed.length,
      duplicates: duplicates.length,
      invalid: 0,
      settings: settingsChanged ? 1 : 0,
    },
    addedIds,
    updatedIds,
    removedIds: baseDiff.removed,
    duplicateIds: duplicates,
    conflictIds: baseDiff.conflicts,
    settingsChanged,
  };

  return { ok: true, candidate, diff, errors: [] };
}

function collectIds(items, ids) {
  walkItems(items, (item) => ids.add(item.id));
}

function mergeItems(localItems, remoteItems, ids) {
  const localById = new Map((localItems || []).map((item) => [item.id, item]));
  for (const remote of remoteItems || []) {
    const local = localById.get(remote.id);
    if (local) {
      if (local.type === 'folder' && remote.type === 'folder') mergeItems(local.items || (local.items = []), remote.items, ids);
      continue;
    }
    if (ids.has(remote.id)) continue;
    const addition = clone(remote);
    localItems.push(addition);
    ids.add(addition.id);
    if (addition.type === 'folder') collectIds(addition.items, ids);
  }
}

export function mergeImportCandidate(current, candidate) {
  const merged = clone(current);
  if (!Array.isArray(merged.groups)) merged.groups = [];
  const ids = new Set(merged.groups.map((group) => group.id));
  merged.groups.forEach((group) => collectIds(group.items, ids));
  const localGroups = new Map(merged.groups.map((group) => [group.id, group]));

  for (const remoteGroup of candidate && candidate.groups || []) {
    const localGroup = localGroups.get(remoteGroup.id);
    if (localGroup) {
      mergeItems(localGroup.items || (localGroup.items = []), remoteGroup.items, ids);
      continue;
    }
    if (ids.has(remoteGroup.id)) continue;
    const addition = clone(remoteGroup);
    merged.groups.push(addition);
    localGroups.set(addition.id, addition);
    ids.add(addition.id);
    collectIds(addition.items, ids);
  }
  return merged;
}

export async function applyImport(core, result, reason = 'config-import') {
  if (!result || !result.ok || !result.candidate) return { ok: false, code: 'invalid_import' };
  const localSecrets = splitSecrets(core.cfg).secrets;
  await saveSnapshot(core.cfg, reason);
  core.cfg = injectSecrets(result.candidate, localSecrets);
  if (typeof core.migrate === 'function') core.migrate();
  if (typeof core.applyTheme === 'function') core.applyTheme();
  if (typeof core.rerender === 'function') core.rerender();
  if (typeof core.save === 'function') await core.save(true);
  return { ok: true };
}
