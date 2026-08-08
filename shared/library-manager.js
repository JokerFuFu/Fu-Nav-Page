import { classifyDuplicate, normalizeUrl } from './url.js';
import { locateNode, moveNode, removeNode } from './tree.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const rawItem = (value) => value?.item || value;

export function updateSelection(current, visibleIds, action) {
  const next = new Set(current || []);
  for (const id of visibleIds || []) {
    if (action === 'select-all') next.add(id);
    else if (action === 'deselect-all') next.delete(id);
    else if (action === 'toggle') next.has(id) ? next.delete(id) : next.add(id);
  }
  return next;
}

export function clusterDuplicates(values) {
  const items = (values || []).map(rawItem).filter((item) => item?.id && item?.url);
  const strict = new Map();
  for (const item of items) {
    const key = normalizeUrl(item.url, 'strict');
    if (!key) continue;
    if (!strict.has(key)) strict.set(key, []);
    strict.get(key).push(item);
  }
  const exact = [...strict.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({ level: 'exact', key, items: group }));
  const exactIds = new Set(exact.flatMap((cluster) => cluster.items.map((item) => item.id)));
  const relaxed = new Map();
  for (const item of items.filter((entry) => !exactIds.has(entry.id))) {
    const key = normalizeUrl(item.url, 'relaxed');
    if (!key) continue;
    if (!relaxed.has(key)) relaxed.set(key, []);
    relaxed.get(key).push(item);
  }
  const possible = [...relaxed.entries()]
    .filter(([, group]) => group.length > 1 && new Set(group.map((item) => normalizeUrl(item.url, 'strict'))).size > 1)
    .filter(([, group]) => group.every((item, index) => group.slice(index + 1).every((other) => classifyDuplicate(item.url, other.url).level !== 'distinct')))
    .map(([key, group]) => ({ level: 'possible', key, items: group }));
  return [...exact, ...possible];
}

export function applyBulkOperation(config, ids, operation, hooks = {}) {
  const next = clone(config);
  const uniqueIds = [...new Set(ids || [])];
  const validIds = uniqueIds.filter((id) => locateNode(next.groups || [], id));
  if (!validIds.length) return { ok: false, code: 'nothing-selected', config: next, affected: 0, tombstones: [], errors: [] };
  hooks.onSnapshot?.(clone(config));
  const tombstones = [], errors = [];
  let affected = 0;
  for (const id of validIds) {
    if (operation?.type === 'delete') {
      const removed = removeNode(next.groups || [], id);
      if (!removed.ok) { errors.push({ id, code: removed.code }); continue; }
      tombstones.push(id); hooks.onTombstone?.(id); affected += 1;
    } else if (operation?.type === 'move') {
      const moved = moveNode(next.groups || [], id, operation.destination);
      if (!moved.ok) { errors.push({ id, code: moved.code }); continue; }
      affected += 1;
    } else errors.push({ id, code: 'unknown-operation' });
  }
  return { ok: affected > 0 && errors.length === 0, code: errors.length ? 'partial-failure' : 'ok', config: next, affected, tombstones, errors };
}
