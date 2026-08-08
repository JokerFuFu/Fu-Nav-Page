function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function walkItems(items, visit) {
  for (const item of items || []) {
    if (!item) continue;
    visit(item);
    if (item.type === 'folder') walkItems(item.items, visit);
  }
}

function locateItem(groups, id) {
  for (const group of groups || []) {
    const stack = [group.items || []];
    while (stack.length) {
      const holder = stack.pop();
      for (const item of holder) {
        if (!item) continue;
        if (item.id === id) return { item, holder, group };
        if (item.type === 'folder') stack.push(item.items || []);
      }
    }
  }
  return null;
}

function groupHasUrl(group, url) {
  const target = String(url || '').trim().replace(/\/$/, '').toLowerCase();
  if (!target) return false;
  let found = false;
  walkItems(group.items, (item) => {
    if (String(item.url || '').trim().replace(/\/$/, '').toLowerCase() === target) found = true;
  });
  return found;
}

function opKey(op, index) {
  return String(op && (op.opId || op._k) || `legacy-${index}-${op && op.op || 'unknown'}-${op && op.id || ''}`);
}

function trimSeen(seen, limit = 512) {
  while (seen.size > limit) seen.delete(seen.values().next().value);
}

export function applyInboxOps(input, operations, seenInput = new Set(), options = {}) {
  const config = clone(input || {});
  if (!Array.isArray(config.groups)) config.groups = [];
  const seenOpIds = new Set(seenInput || []);
  const tombstones = new Set(options.tombstones || []);
  const ops = Array.isArray(operations) ? operations.filter(Boolean) : [];
  const batchDeletes = new Set(ops.filter((op) => op.op === 'del' && op.id).map((op) => op.id));
  let applied = 0;
  let skipped = 0;

  ops.forEach((op, index) => {
    const key = opKey(op, index);
    if (seenOpIds.has(key)) {
      skipped += 1;
      return;
    }
    seenOpIds.add(key);

    if (op.op === 'del' && op.id) {
      const hit = locateItem(config.groups, op.id);
      if (hit) hit.holder.splice(hit.holder.indexOf(hit.item), 1);
      tombstones.add(op.id);
      applied += 1;
      return;
    }

    if (op.op === 'edit' && op.id) {
      if (tombstones.has(op.id) || batchDeletes.has(op.id)) {
        skipped += 1;
        return;
      }
      const hit = locateItem(config.groups, op.id);
      if (!hit) {
        skipped += 1;
        return;
      }
      if (op.patch && typeof op.patch === 'object') {
        const patch = clone(op.patch);
        delete patch.id;
        Object.assign(hit.item, patch);
      }
      if (op.tgid && op.tgid !== hit.group.id && !tombstones.has(op.tgid)) {
        const target = config.groups.find((group) => group.id === op.tgid);
        if (target) {
          hit.holder.splice(hit.holder.indexOf(hit.item), 1);
          target.items.push(hit.item);
        }
      }
      applied += 1;
      return;
    }

    if (op.op !== 'add' || !op.item || tombstones.has(op.item.id) || batchDeletes.has(op.item.id) || tombstones.has(op.gid)) {
      skipped += 1;
      return;
    }
    if (locateItem(config.groups, op.item.id)) {
      skipped += 1;
      return;
    }
    let target = config.groups.find((group) => group.id === op.gid);
    if (!target) {
      target = {
        id: op.gid || `g-${key}`,
        name: op.gname || '收藏',
        icon: op.gicon || 'star',
        color: op.gcolor || '#22c55e',
        collapsed: false,
        items: [],
      };
      config.groups.unshift(target);
    }
    if (groupHasUrl(target, op.item.url)) {
      tombstones.add(op.item.id);
      skipped += 1;
      return;
    }
    target.items.push(clone(op.item));
    applied += 1;
  });

  trimSeen(seenOpIds);
  return {
    config,
    applied,
    skipped,
    seenOpIds,
    deletedIds: tombstones,
  };
}

function indexNodes(config) {
  const index = new Map();
  const ownFields = (node) => {
    const value = clone(node);
    delete value.items;
    return value;
  };
  for (const group of config && config.groups || []) {
    index.set(group.id, ownFields(group));
    walkItems(group.items, (item) => index.set(item.id, ownFields(item)));
  }
  return index;
}

export function diffRestore(current, candidate) {
  const local = indexNodes(current);
  const remote = indexNodes(candidate);
  const added = [];
  const updated = [];
  const removed = [];

  for (const [id, value] of remote) {
    if (!local.has(id)) added.push(id);
    else if (JSON.stringify(local.get(id)) !== JSON.stringify(value)) updated.push(id);
  }
  for (const id of local.keys()) if (!remote.has(id)) removed.push(id);

  return {
    added: added.sort(),
    updated: updated.sort(),
    removed: removed.sort(),
    conflicts: updated.slice().sort(),
  };
}
