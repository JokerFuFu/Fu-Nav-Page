const KEY = 'fn_runtime_state_v1';
const CAPABILITY_PERMISSIONS = { bookmarks: ['bookmarks'], identity: ['identity'] };

export const DEFAULT_RUNTIME_STATE = Object.freeze({
  version: 1,
  initialized: false,
  sync: { state: 'idle', message: '', at: 0 },
  permission: { bookmarks: 'unknown', identity: 'unknown' },
  onboarding: { completed: false, weatherConsent: false, choice: null },
  diagnostics: {
    configBytes: 0,
    lastLocalSaveAt: 0,
    lastCloudBackupAt: 0,
    conflict: { state: 'none', at: 0 },
    agent: { state: 'unavailable', at: 0 },
    recentError: null,
  },
});

const clone = (value) => JSON.parse(JSON.stringify(value));
const mergeState = (base, patch = {}) => ({
  ...base,
  ...patch,
  sync: { ...base.sync, ...(patch.sync || {}) },
  permission: { ...base.permission, ...(patch.permission || {}) },
  onboarding: { ...base.onboarding, ...(patch.onboarding || {}) },
  diagnostics: {
    ...base.diagnostics,
    ...(patch.diagnostics || {}),
    conflict: { ...base.diagnostics.conflict, ...(patch.diagnostics?.conflict || {}) },
    agent: { ...base.diagnostics.agent, ...(patch.diagnostics?.agent || {}) },
  },
});

function normalize(raw) {
  return mergeState(clone(DEFAULT_RUNTIME_STATE), raw && typeof raw === 'object' ? raw : {});
}

function defaultStorage() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    return {
      get: () => new Promise((resolve) => chrome.storage.local.get(KEY, (value) => resolve(value?.[KEY]))),
      set: (value) => new Promise((resolve) => chrome.storage.local.set({ [KEY]: value }, resolve)),
    };
  }
  if (typeof localStorage !== 'undefined') {
    return {
      get: async () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } },
      set: async (value) => localStorage.setItem(KEY, JSON.stringify(value)),
    };
  }
  return { get: async () => null, set: async () => {} };
}

export async function loadRuntimeState(options = {}) {
  const storage = options.storage || defaultStorage();
  try { return normalize(await storage.get()); } catch { return normalize(null); }
}

export async function saveRuntimeState(patch, options = {}) {
  const storage = options.storage || defaultStorage();
  const current = options.current ? normalize(options.current) : await loadRuntimeState({ storage });
  const next = mergeState(current, patch);
  try { await storage.set(next); } catch {}
  return next;
}

function callPermission(api, method, query) {
  return new Promise((resolve) => {
    try { api[method](query, (value) => resolve(!!value)); } catch { resolve(false); }
  });
}

export async function requestCapability(name, options = {}) {
  const permissions = CAPABILITY_PERMISSIONS[name];
  if (!permissions) return { ok: false, code: 'unknown-capability', capability: name, state: 'denied' };
  const api = options.permissionsApi || (typeof chrome !== 'undefined' ? chrome.permissions : null);
  const saveState = options.saveState || ((patch) => saveRuntimeState(patch));
  if (!api?.contains || !api?.request) {
    await saveState({ permission: { [name]: 'denied' } });
    return { ok: false, code: 'permission-unavailable', capability: name, state: 'denied' };
  }
  const query = { permissions };
  const already = await callPermission(api, 'contains', query);
  const granted = already || await callPermission(api, 'request', query);
  const state = granted ? 'granted' : 'denied';
  await saveState({ permission: { [name]: state } });
  return granted
    ? { ok: true, code: 'permission-granted', capability: name, state }
    : { ok: false, code: 'permission-denied', capability: name, state };
}

export async function completeOnboarding(choice, options = {}) {
  const source = options.config || { version: 3, settings: {}, groups: [] };
  const config = clone(source);
  const state = normalize(options.runtimeState);
  if (!choice) return { ok: true, deferred: true, choice: null, config, state };
  if (!['bookmarks', 'template', 'blank'].includes(choice)) {
    return { ok: false, code: 'invalid-choice', deferred: false, choice, config, state };
  }

  let permission = null;
  let shouldImportBookmarks = false;
  if (choice === 'bookmarks') {
    const ask = options.requestPermission || ((name) => requestCapability(name));
    permission = await ask('bookmarks');
    shouldImportBookmarks = !!permission?.ok;
    config.settings.demoMode = false;
  } else if (choice === 'blank') {
    config.groups = [];
    config.settings.demoMode = false;
  } else {
    config.settings.demoMode = true;
  }
  config.settings.onboarded = true;
  const nextState = mergeState(state, {
    initialized: true,
    permission: permission ? { bookmarks: permission.state } : {},
    onboarding: { completed: true, choice, weatherConsent: !!options.weatherConsent },
  });
  return { ok: true, deferred: false, choice, config, state: nextState, permission, shouldImportBookmarks };
}
