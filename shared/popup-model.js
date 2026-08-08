import { classifyDuplicate } from './url.js';
import { listDestinations, locateNode, removeNode, walkTree } from './tree.js';

export const RECENT_DESTINATIONS_KEY = 'fu_nav_recent_destinations_v1';
const clone = (value) => JSON.parse(JSON.stringify(value));
const uid = (prefix) => prefix + Math.random().toString(36).slice(2, 7) + Date.now().toString(36).slice(-3);

export function rememberDestination(recents, key, validKeys) {
  const valid = new Set(validKeys || []);
  return [key, ...(recents || []).map((entry) => entry?.key || entry)]
    .filter((value, index, values) => value && valid.has(value) && values.indexOf(value) === index)
    .slice(0, 3);
}

export function buildDestinationOptions(groups, recents = []) {
  const options = listDestinations(groups);
  const byKey = new Map(options.map((option) => [option.key, option]));
  const normalized = [];
  for (const value of recents) {
    const key = value?.key || value;
    if (!byKey.has(key) || normalized.includes(key)) continue;
    normalized.push(key);
    if (normalized.length === 3) break;
  }
  return { options, recents: normalized.map((key) => ({ ...byKey.get(key), recent: true })) };
}

function normalizeInputUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function duplicateOf(groups, url, excludeId) {
  let possible = null;
  for (const entry of walkTree(groups || [])) {
    if (entry.node?.type === 'folder' || entry.node?.id === excludeId || !entry.node?.url) continue;
    const classification = classifyDuplicate(entry.node.url, url);
    if (classification.level === 'exact') return { level: 'exact', entry };
    if (classification.level === 'possible' && !possible) possible = { level: 'possible', entry };
  }
  return possible;
}

export function savePopupItem(config, form = {}) {
  const next = clone(config || { version: 3, settings: {}, groups: [] });
  if (!Array.isArray(next.groups)) next.groups = [];
  const url = normalizeInputUrl(form.url);
  if (!url) return { ok: false, code: 'missing-url', config: next };
  const destinations = listDestinations(next.groups);
  const destination = destinations.find((option) => option.key === form.destinationKey);
  if (!destination) return { ok: false, code: 'invalid-destination', config: next };
  const duplicate = duplicateOf(next.groups, url, form.existingId);
  if (duplicate && !form.forceDuplicate) {
    return { ok: false, code: `${duplicate.level}-duplicate`, duplicate: duplicate.level, existing: duplicate.entry.node, actions: ['open-existing', 'force-save'], config: next };
  }

  let item = form.existingId ? locateNode(next.groups, form.existingId)?.node : null;
  if (item) removeNode(next.groups, item.id);
  else item = { id: form.id || uid('i') };
  Object.assign(item, {
    name: String(form.name || '').trim() || url,
    url,
    note: String(form.note || '').trim(),
    icon: form.icon || item.icon || '',
    fav: form.fav ? true : undefined,
    frame: form.frame ? true : undefined,
  });
  if (Array.isArray(form.tags)) item.tags = [...new Set(form.tags.map(String).map((value) => value.trim()).filter(Boolean))];
  if (Array.isArray(form.aliases)) item.aliases = [...new Set(form.aliases.map(String).map((value) => value.trim()).filter(Boolean))];
  const targetGroup = next.groups.find((group) => group.id === destination.groupId);
  const targetItems = destination.folderId ? locateNode(next.groups, destination.folderId)?.node?.items : targetGroup?.items;
  if (!targetItems) return { ok: false, code: 'invalid-destination', config: next };
  targetItems.push(item);
  return { ok: true, code: 'saved', config: next, item, destination, forcedDuplicate: duplicate?.level || null };
}
