import { normalizeUrl } from './url.js';

const AUTO_CATEGORIES = [
  { key: 'network', name: '网络与设备', pattern: /192\.168\.|(?:^|\/)10\.\d+\.|172\.(?:1[6-9]|2\d|3[01])\.|localhost|127\.0\.0\.1|synology|群晖|dsm|openclash|homeassistant|home assistant|router|路由|软路由|nas\b|proxmox|unraid|cloudflare/ },
  { key: 'ai', name: 'AI 与效率', pattern: /chatgpt|openai|claude|kimi|deepseek|perplexity|gemini|copilot|midjourney|notion|飞书|语雀/ },
  { key: 'development', name: '开发工具', pattern: /github|gitlab|gitee|stackoverflow|npmjs|docker|kubernetes|vercel|jira|postman|developer|devtool|api\.|开发|代码|编程/ },
  { key: 'design', name: '设计创意', pattern: /figma|dribbble|behance|coolors|iconfont|canva|unsplash|设计|配色|图标/ },
  { key: 'communication', name: '邮箱通讯', pattern: /gmail|mail\.|outlook|protonmail|telegram|discord|slack|邮箱|邮件/ },
  { key: 'media', name: '影音娱乐', pattern: /youtube|youtu\.be|bilibili|netflix|spotify|twitch|douyin|抖音|音乐|视频|影视|直播/ },
  { key: 'finance', name: '财经购物', pattern: /binance|okx|coinbase|pancakeswap|dexscreener|revolut|paypal|taobao|tmall|jd\.com|amazon|smzdm|值得买|购物|银行|证券|财经/ },
  { key: 'learning', name: '学习阅读', pattern: /zhihu|wikipedia|z-library|translate|scholar|coursera|udemy|medium\.com|知乎|翻译|图书|学习|文档/ },
  { key: 'other', name: '其他', pattern: null },
];

function autoCategory(node) {
  const haystack = `${node?.title || ''} ${node?.url || ''}`.toLowerCase();
  return AUTO_CATEGORIES.find(category => category.pattern?.test(haystack)) || AUTO_CATEGORIES.at(-1);
}

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

function pushIndex(index, key, value) {
  if (!key) return;
  const entries = index.get(key) || [];
  entries.push(value);
  index.set(key, entries);
}

function takeUnused(index, key, used) {
  const entries = index.get(key) || [];
  return entries.find(entry => !used.has(entry)) || null;
}

function indexCurrentTree(items) {
  const sites = [];
  const sitesByUrl = new Map();
  const folders = [];
  const foldersBySourceId = new Map();
  const foldersByPath = new Map();
  const walk = (nodes, names = []) => {
    for (const node of nodes || []) {
      if (!node) continue;
      if (node.type === 'folder') {
        folders.push(node);
        if (!node.bookmarkStructureUnclassified) {
          pushIndex(foldersBySourceId, String(node.bookmarkSourceId || ''), node);
          pushIndex(foldersByPath, JSON.stringify([...names, node.name || '']), node);
        }
        walk(node.items, [...names, node.name || '']);
        continue;
      }
      sites.push(node);
      pushIndex(sitesByUrl, normalizeUrl(node.url, 'strict'), node);
    }
  };
  walk(items);
  return { sites, sitesByUrl, folders, foldersBySourceId, foldersByPath };
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

export function rebuildBookmarkFolderStructure(input, folder, options = {}) {
  const config = clone(input || {});
  if (!Array.isArray(config.groups)) config.groups = [];
  if (!folder) return { config, changed: false, total: 0, folders: 0, reused: 0, added: 0, unclassified: 0, groupId: null };

  const sourceSites = flattenBookmarks(folder.children || []);
  const total = new Set(sourceSites.map(site => site.normalized)).size;
  if (!total) return { config, changed: false, total: 0, folders: 0, reused: 0, added: 0, unclassified: 0, groupId: null };

  const title = String(folder.title || '').trim() || 'Fu 导航';
  const makeId = typeof options.makeId === 'function'
    ? options.makeId
    : prefix => `${prefix}-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
  let group = config.groups.find(candidate => candidate && candidate.name === title);
  const createdGroup = !group;
  if (!group) {
    group = { id: makeId('g'), name: title, icon: 'star', color: options.color || '#64748b', collapsed: false, items: [] };
    config.groups.push(group);
  }
  if (!Array.isArray(group.items)) group.items = [];

  const beforeItems = JSON.stringify(group.items);
  const current = indexCurrentTree(group.items);
  const usedSites = new Set();
  const usedFolders = new Set();
  const sourceSeen = new Set();
  let reused = 0;
  let added = 0;
  let folderCount = 0;

  const buildSite = node => {
    const normalized = normalizeUrl(node?.url, 'strict');
    if (!normalized || sourceSeen.has(normalized)) return null;
    sourceSeen.add(normalized);
    const existing = takeUnused(current.sitesByUrl, normalized, usedSites);
    if (existing) {
      usedSites.add(existing);
      reused += 1;
      return existing;
    }
    added += 1;
    return { id: makeId('i'), name: node.title || node.url, url: node.url, note: '', icon: '' };
  };

  const buildFolder = (node, name, pathNames, items) => {
    const pathKey = JSON.stringify(pathNames);
    const sourceKey = String(node.id || '');
    const existing = takeUnused(current.foldersBySourceId, sourceKey, usedFolders)
      || takeUnused(current.foldersByPath, pathKey, usedFolders);
    if (existing) usedFolders.add(existing);
    const rebuilt = existing ? { ...existing } : { id: makeId('f'), type: 'folder', name, icon: 'folder', items: [] };
    rebuilt.type = 'folder';
    rebuilt.name = name;
    rebuilt.icon = rebuilt.icon || 'folder';
    rebuilt.bookmarkSourceId = sourceKey;
    rebuilt.items = items;
    return rebuilt;
  };

  /* 产品树封顶两级：更深的 Chrome 路径折叠成第二级名字，例如“前端 / 框架”，网站仍按来源分开。 */
  const buildSecondLevelBranches = (node, parentNames, foldedNames = []) => {
    folderCount += 1;
    const ownName = String(node.title || '').trim() || '未命名文件夹';
    const parts = [...foldedNames, ownName];
    const displayName = parts.join(' / ');
    const directSites = (node.children || []).filter(child => child?.url).map(buildSite).filter(Boolean);
    const branches = [buildFolder(node, displayName, [...parentNames, displayName], directSites)];
    for (const child of node.children || []) {
      if (child && !child.url) branches.push(...buildSecondLevelBranches(child, parentNames, parts));
    }
    return branches;
  };

  const buildRoot = (nodes, names = []) => {
    const output = [];
    for (const node of nodes || []) {
      if (!node) continue;
      if (node.url) {
        const site = buildSite(node);
        if (site) output.push(site);
        continue;
      }
      folderCount += 1;
      const name = String(node.title || '').trim() || '未命名文件夹';
      const children = [];
      for (const child of node.children || []) {
        if (child?.url) {
          const site = buildSite(child);
          if (site) children.push(site);
        } else if (child) children.push(...buildSecondLevelBranches(child, [...names, name]));
      }
      output.push(buildFolder(node, name, [...names, name], children));
    }
    return output;
  };

  const sourceHasFolders = (folder.children || []).some(node => node && !node.url);
  let structured;
  if (sourceHasFolders) structured = buildRoot(folder.children || []);
  else {
    const buckets = new Map(AUTO_CATEGORIES.map(category => [category.key, []]));
    for (const node of folder.children || []) {
      const site = buildSite(node);
      if (site) buckets.get(autoCategory(node).key).push(site);
    }
    structured = AUTO_CATEGORIES.flatMap(category => {
      const items = buckets.get(category.key);
      if (!items.length) return [];
      const categoryFolder = buildFolder({ id: `auto:${category.key}` }, category.name, [category.name], items);
      categoryFolder.bookmarkAutoCategory = true;
      return [categoryFolder];
    });
    folderCount = structured.length;
  }
  const leftovers = current.sites.filter(site => !usedSites.has(site));
  if (leftovers.length) {
    let unclassified = current.folders.find(candidate => candidate.bookmarkStructureUnclassified && !usedFolders.has(candidate));
    if (!unclassified) unclassified = { id: makeId('f'), type: 'folder', name: '未归类', icon: 'folder', items: [] };
    unclassified = { ...unclassified, type: 'folder', name: '未归类', icon: unclassified.icon || 'folder', bookmarkStructureUnclassified: true, items: leftovers };
    structured.push(unclassified);
  }
  group.items = structured;

  return {
    config,
    changed: createdGroup || beforeItems !== JSON.stringify(group.items),
    total,
    folders: folderCount,
    reused,
    added,
    unclassified: leftovers.length,
    groupId: group.id,
  };
}
