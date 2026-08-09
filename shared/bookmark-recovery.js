import { normalizeUrl } from './url.js';

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function countBookmarks(node) {
  if (!node) return 0;
  if (node.url) return normalizeUrl(node.url, 'strict') ? 1 : 0;
  return (node.children || []).reduce((sum, child) => sum + countBookmarks(child), 0);
}

function collectFolders(nodes, output = []) {
  for (const node of nodes || []) {
    if (!node || node.url) continue;
    output.push(node);
    collectFolders(node.children, output);
  }
  return output;
}

function flattenBookmarks(nodes, output = []) {
  for (const node of nodes || []) {
    if (!node) continue;
    if (node.url) {
      const normalized = normalizeUrl(node.url, 'strict');
      if (normalized) output.push({ name: node.title || node.url, url: node.url, normalized });
      continue;
    }
    flattenBookmarks(node.children, output);
  }
  return output;
}

function collectExistingUrls(items, output = new Set()) {
  for (const item of items || []) {
    if (!item) continue;
    if (item.type === 'folder') collectExistingUrls(item.items, output);
    else {
      const normalized = normalizeUrl(item.url, 'strict');
      if (normalized) output.add(normalized);
    }
  }
  return output;
}

export function findLargestNamedFolder(tree, title = 'Fu 导航') {
  const matches = collectFolders(tree).filter(folder => String(folder.title || '') === title);
  matches.sort((left, right) => countBookmarks(right) - countBookmarks(left));
  return matches[0] || null;
}

export function mergeBookmarkFolder(input, folder, options = {}) {
  const config = clone(input || {});
  if (!Array.isArray(config.groups)) config.groups = [];
  if (!folder) return { config, added: 0, duplicates: 0, total: 0, groupId: null };

  const sites = flattenBookmarks(folder.children || []);
  const title = String(folder.title || '').trim() || 'Fu 导航';
  const makeId = typeof options.makeId === 'function'
    ? options.makeId
    : prefix => `${prefix}-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
  let group = config.groups.find(candidate => candidate && candidate.name === title);
  if (!group) {
    group = {
      id: makeId('g'),
      name: title,
      icon: 'star',
      color: options.color || '#64748b',
      collapsed: false,
      items: [],
    };
    config.groups.push(group);
  }
  if (!Array.isArray(group.items)) group.items = [];

  const seen = collectExistingUrls(group.items);
  let added = 0;
  let duplicates = 0;
  for (const site of sites) {
    if (seen.has(site.normalized)) {
      duplicates += 1;
      continue;
    }
    seen.add(site.normalized);
    group.items.push({ id: makeId('i'), name: site.name, url: site.url, note: '', icon: '' });
    added += 1;
  }

  return { config, added, duplicates, total: sites.length, groupId: group.id };
}
