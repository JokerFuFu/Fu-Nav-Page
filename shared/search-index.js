import { pinyin } from '../vendor/pinyin-pro.esm.js';

const text = (value) => String(value ?? '').normalize('NFKC').toLowerCase().trim();
const list = (value) => Array.isArray(value) ? value.map(text).filter(Boolean) : [];

function pinyinForms(value) {
  const chunks = String(value || '').match(/[\u3400-\u9fff]+/g) || [];
  const syllables = chunks.flatMap((chunk) => pinyin(chunk, { toneType: 'none', type: 'array' }));
  return syllables.length ? { full: syllables.join('').toLowerCase(), initials: syllables.map((part) => part[0] || '').join('').toLowerCase() } : { full: '', initials: '' };
}

function words(values) {
  return [...new Set(values.flatMap((value) => text(value).split(/[^\p{L}\p{N}.-]+/u)).filter(Boolean))];
}

function damerauDistance(a, b) {
  const left = text(a), right = text(b);
  const rows = left.length + 1, cols = right.length + 1;
  const matrix = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1]) {
        matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + 1);
      }
    }
  }
  return matrix[left.length][right.length];
}

function makeEntry(item, group, folders) {
  const tags = list(item.tags), aliases = list(item.aliases), folderNames = folders.map((folder) => folder.name || '');
  const fields = [item.id, item.name, item.url, item.note, ...tags, ...aliases, group.name, ...folderNames].map(text).filter(Boolean);
  const forms = pinyinForms([item.name, item.note, ...tags, ...aliases, group.name, ...folderNames].join(' '));
  return {
    id: item.id,
    type: 'site',
    item,
    name: item.name || item.url || '',
    url: item.url || '',
    groupId: group.id,
    groupName: group.name || '',
    folderId: folders.at(-1)?.id || null,
    folderIds: folders.map((folder) => folder.id),
    folderPath: folderNames,
    tags,
    aliases,
    dead: !!item.deadSince,
    fields,
    tokens: words(fields),
    pinyin: forms.full,
    initials: forms.initials,
  };
}

export function buildSearchIndex(config) {
  const entries = [];
  for (const group of config?.groups || []) {
    const walk = (items, folders = []) => {
      for (const item of items || []) {
        if (!item) continue;
        if (item.type === 'folder') walk(item.items || [], [...folders, item]);
        else entries.push(makeEntry(item, group, folders));
      }
    };
    walk(group.items || []);
  }
  return { revision: config?.revision || 0, entries };
}

function scoreEntry(entry, query) {
  if (!query) return 1;
  let score = 0;
  if (entry.fields.some((field) => field === query)) score = Math.max(score, 130);
  if (entry.fields.some((field) => field.includes(query))) score = Math.max(score, 110);
  if (entry.pinyin.includes(query)) score = Math.max(score, 100);
  if (entry.initials.includes(query)) score = Math.max(score, 96);
  if (query.length >= 3 && /^[a-z0-9.-]+$/.test(query)) {
    const fuzzy = entry.tokens.some((token) => Math.abs(token.length - query.length) <= 1 && damerauDistance(token, query) <= Math.max(1, Math.floor(query.length * 0.25)));
    if (fuzzy) score = Math.max(score, 72);
  }
  return score;
}

export function querySearchIndex(index, value, options = {}) {
  const query = text(value);
  return (index?.entries || [])
    .filter((entry) => !options.groupId || entry.groupId === options.groupId)
    .filter((entry) => !options.folderId || entry.folderIds.includes(options.folderId))
    .filter((entry) => !options.tag || entry.tags.includes(text(options.tag)))
    .filter((entry) => !options.deadOnly || entry.dead)
    .map((entry) => ({ entry, score: scoreEntry(entry, query) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name, 'zh-CN'))
    .slice(0, Number.isFinite(options.limit) ? options.limit : 500)
    .map((row) => row.entry);
}
