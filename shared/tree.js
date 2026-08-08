function isFolder(node) {
  return Boolean(node && node.type === 'folder');
}

export function walkTree(groups) {
  const rows = [];
  for (const group of groups || []) {
    const walk = (items, parent, depth) => {
      (items || []).forEach((node, index) => {
        if (!node) return;
        rows.push({ node, group, parent, parentItems: items, index, depth });
        if (isFolder(node)) walk(node.items || [], node, depth + 1);
      });
    };
    walk(group.items || [], null, 0);
  }
  return rows;
}

export function locateNode(groups, id) {
  return walkTree(groups).find((entry) => entry.node.id === id) || null;
}

export function removeNode(groups, id) {
  const location = locateNode(groups, id);
  if (!location) return { ok: false, code: 'not-found' };
  location.parentItems.splice(location.index, 1);
  return {
    ok: true,
    node: location.node,
    group: location.group,
    parent: location.parent,
    index: location.index,
  };
}

function folderSpan(node) {
  if (!isFolder(node)) return 0;
  let childSpan = 0;
  for (const child of node.items || []) childSpan = Math.max(childSpan, folderSpan(child));
  return 1 + childSpan;
}

function descendants(node) {
  const ids = new Set();
  const walk = (item) => {
    if (!item) return;
    ids.add(item.id);
    if (isFolder(item)) (item.items || []).forEach(walk);
  };
  walk(node);
  return ids;
}

function resolveDestination(groups, source, destination) {
  const group = (groups || []).find((item) => item.id === destination?.groupId);
  if (!group) return { ok: false, code: 'invalid-destination' };
  if (!destination.folderId) return { ok: true, group, folder: null, items: group.items || (group.items = []), parentDepth: 0 };
  const folderLocation = locateNode(groups, destination.folderId);
  if (!folderLocation || folderLocation.group !== group || !isFolder(folderLocation.node)) return { ok: false, code: 'invalid-destination' };
  if (descendants(source).has(folderLocation.node.id)) return { ok: false, code: 'invalid-destination' };
  return {
    ok: true,
    group,
    folder: folderLocation.node,
    items: folderLocation.node.items || (folderLocation.node.items = []),
    parentDepth: folderLocation.depth + 1,
  };
}

export function canMoveNode(groups, id, destination) {
  const source = locateNode(groups, id);
  if (!source) return { ok: false, code: 'not-found' };
  const target = resolveDestination(groups, source.node, destination);
  if (!target.ok) return target;
  if (target.parentDepth + folderSpan(source.node) > 2) return { ok: false, code: 'invalid-destination' };
  return { ok: true };
}

export function moveNode(groups, id, destination) {
  const allowed = canMoveNode(groups, id, destination);
  if (!allowed.ok) return allowed;
  const source = locateNode(groups, id);
  const target = resolveDestination(groups, source.node, destination);
  let index = Number.isInteger(destination?.index) ? destination.index : target.items.length;
  if (target.items === source.parentItems && source.index < index) index -= 1;
  source.parentItems.splice(source.index, 1);
  index = Math.max(0, Math.min(index, target.items.length));
  target.items.splice(index, 0, source.node);
  return { ok: true, node: source.node, group: target.group, parent: target.folder, index };
}

export function countTree(items) {
  let sites = 0;
  let folders = 0;
  const walk = (nodes) => {
    for (const node of nodes || []) {
      if (isFolder(node)) {
        folders += 1;
        walk(node.items);
      } else if (node) sites += 1;
    }
  };
  walk(items);
  return { topLevel: (items || []).length, sites, folders, total: sites + folders };
}
