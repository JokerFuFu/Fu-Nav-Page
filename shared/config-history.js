import { sanitizeConfig } from './config-secrets.js';

const KEY = 'fn_history_v1';
const LIMIT = 5;

const extensionStorage = () => typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

async function readEntries() {
  if (extensionStorage()) {
    return await new Promise((resolve) => chrome.storage.local.get(KEY, (result) => resolve(result[KEY] || [])));
  }
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}

async function writeEntries(entries) {
  if (extensionStorage()) {
    await new Promise((resolve) => chrome.storage.local.set({ [KEY]: entries }, resolve));
  } else {
    localStorage.setItem(KEY, JSON.stringify(entries));
  }
}

function publicEntry(entry) {
  return {
    id: entry.id,
    at: entry.at,
    reason: entry.reason,
    revision: entry.config && entry.config.revision || 0,
    bytes: JSON.stringify(entry.config || {}).length,
  };
}

export async function saveSnapshot(config, reason = 'manual', now = Date.now()) {
  const entries = await readEntries();
  const safeConfig = sanitizeConfig(config);
  const entry = {
    id: `snap-${now}-${safeConfig.revision || 0}`,
    at: now,
    reason,
    config: safeConfig,
  };
  const next = [entry, ...entries.filter((item) => item.id !== entry.id)]
    .sort((a, b) => b.at - a.at)
    .slice(0, LIMIT);
  await writeEntries(next);
  return publicEntry(entry);
}

export async function listSnapshots() {
  return (await readEntries()).sort((a, b) => b.at - a.at).map(publicEntry);
}

export async function restoreSnapshot(id) {
  const entry = (await readEntries()).find((item) => item.id === id);
  return entry ? sanitizeConfig(entry.config) : null;
}

export async function deleteSnapshot(id) {
  const entries = await readEntries();
  const next = entries.filter((item) => item.id !== id);
  await writeEntries(next);
  return next.length !== entries.length;
}
