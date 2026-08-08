const normalizeName = value => String(value || '').trim().replace(/\s+/g, ' ');
const keyOf = value => normalizeName(value).toLocaleLowerCase();
const allModes = settings => Array.isArray(settings?.modes) ? settings.modes : (settings.modes = []);
const makeId = () => `m${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;

export function listModes(settings, options = {}) {
  const status = options.status || 'active';
  return allModes(settings).filter(mode => status === 'all' || (status === 'archived' ? !!mode.archived : !mode.archived));
}

export function createMode(settings, name, options = {}) {
  const normalized = normalizeName(name);
  if (!normalized) return { ok: false, code: 'invalid-name' };
  if (allModes(settings).some(mode => keyOf(mode.name) === keyOf(normalized))) return { ok: false, code: 'duplicate-name' };
  const mode = {
    id: (options.idFactory || makeId)(),
    name: normalized,
    groupIds: [],
    hiddenWidgets: [],
    showFavs: true,
  };
  settings.modes.push(mode);
  return { ok: true, code: 'created', mode };
}

export function renameMode(settings, id, name) {
  const mode = allModes(settings).find(item => item.id === id);
  if (!mode) return { ok: false, code: 'not-found' };
  const normalized = normalizeName(name);
  if (!normalized) return { ok: false, code: 'invalid-name' };
  if (allModes(settings).some(item => item.id !== id && keyOf(item.name) === keyOf(normalized))) return { ok: false, code: 'duplicate-name' };
  mode.name = normalized;
  return { ok: true, code: 'renamed', mode };
}

export function reorderModes(settings, ids) {
  const modes = allModes(settings), active = modes.filter(mode => !mode.archived);
  const unique = [...new Set(Array.isArray(ids) ? ids : [])];
  if (unique.length !== active.length || unique.some(id => !active.some(mode => mode.id === id))) return { ok: false, code: 'invalid-order' };
  const byId = new Map(active.map(mode => [mode.id, mode]));
  settings.modes = [...unique.map(id => byId.get(id)), ...modes.filter(mode => mode.archived)];
  return { ok: true, code: 'reordered', modes: settings.modes };
}

export function archiveMode(settings, id) {
  const mode = allModes(settings).find(item => item.id === id);
  if (!mode) return { ok: false, code: 'not-found' };
  mode.archived = true;
  if (settings.activeMode === id) settings.activeMode = null;
  return { ok: true, code: 'archived', mode };
}

export function restoreMode(settings, id) {
  const mode = allModes(settings).find(item => item.id === id);
  if (!mode) return { ok: false, code: 'not-found' };
  delete mode.archived;
  return { ok: true, code: 'restored', mode };
}

export function deleteMode(settings, id, options = {}) {
  const modes = allModes(settings), index = modes.findIndex(item => item.id === id);
  if (index < 0) return { ok: false, code: 'not-found' };
  const [mode] = modes.splice(index, 1);
  const wasActive = settings.activeMode === id;
  if (wasActive) settings.activeMode = null;

  const strategy = options.strategy === 'delete-groups' ? 'delete-groups' : 'detach';
  const deletedGroupIds = [];
  if (strategy === 'delete-groups' && Array.isArray(options.groups)) {
    const affected = new Set(mode.groupIds || []);
    const removedGroups = [];
    for (let groupIndex = options.groups.length - 1; groupIndex >= 0; groupIndex -= 1) {
      const group = options.groups[groupIndex];
      if (!affected.has(group.id)) continue;
      options.groups.splice(groupIndex, 1);
      deletedGroupIds.unshift(group.id);
      removedGroups.unshift(group);
    }
    removedGroups.forEach(group => options.markDeleted?.(group));
    for (const other of modes) other.groupIds = (other.groupIds || []).filter(groupId => !affected.has(groupId));
  }
  return {
    ok: true,
    code: 'deleted',
    strategy,
    mode,
    index,
    wasActive,
    affectedGroupIds: [...new Set(mode.groupIds || [])],
    deletedGroupIds,
  };
}
