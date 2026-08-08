import { sanitizeConfig } from './config-secrets.js';

const SYNC_STATES = new Set(['idle', 'saving', 'synced', 'local-only', 'conflict', 'error']);
const PERMISSION_STATES = new Set(['unknown', 'granted', 'denied']);
const SAFE_MESSAGES = new Set(['', 'preview', 'quota', 'too-large', 'throttled', 'synced', 'cloud-ok', 'cloud-error']);
const SAFE_CODES = new Set([
  'unknown-error', 'storage-error', 'storage-quota', 'storage-too-large',
  'cloud-error', 'cloud-empty', 'cloud-network', 'cloud-timeout',
  'sync-error', 'permission-denied', 'permission-unavailable', 'agent-unavailable',
]);

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const safeState = (value, allowed, fallback) => allowed.has(value) ? value : fallback;
const safeBytes = (config) => {
  const text = JSON.stringify(sanitizeConfig(config || {}));
  try { return new TextEncoder().encode(text).length; } catch { return text.length; }
};
const safeCode = (value, fallback = 'unknown-error') => {
  const text = String(value || '').toLowerCase();
  const http = text.match(/http[\s-]*(\d{3})/i);
  if (http) {
    const family = text.match(/^(cloud|storage|sync|permission|agent)-http/)?.[1]
      || (fallback.startsWith('cloud') ? 'cloud' : fallback);
    return `${family}-http-${http[1]}`;
  }
  if (/quota/.test(text)) return fallback.startsWith('storage') ? 'storage-quota' : fallback;
  if (/too[- ]?large|exceed/.test(text)) return fallback.startsWith('storage') ? 'storage-too-large' : fallback;
  if (/timeout|timed[- ]?out/.test(text)) return fallback.startsWith('cloud') ? 'cloud-timeout' : fallback;
  if (/failed[- ]?to[- ]?fetch|network|无法连接/.test(text)) return fallback.startsWith('cloud') ? 'cloud-network' : fallback;
  return SAFE_CODES.has(text) ? text : fallback;
};
const permissionState = value => safeState(value, PERMISSION_STATES, 'unknown');

export function redactDiagnostics(value = {}) {
  const config = value.config || value.cfg || {};
  const runtime = value.runtime || {};
  const persisted = runtime.diagnostics || value.diagnostics || {};
  const cloud = config.settings?.cloud || value.cloud || {};
  const sync = runtime.sync || value.sync || {};
  const conflict = persisted.conflict || value.conflict || {};
  const recentError = persisted.recentError || value.recentError || null;
  const agentState = value.agentData ? 'connected' : safeState(value.agent?.state || persisted.agent?.state, new Set(['connected', 'unavailable']), 'unavailable');
  const message = SAFE_MESSAGES.has(sync.message) ? sync.message : safeCode(sync.message, 'sync-error');

  return {
    diagnosticsVersion: 1,
    schema: finite(config.version ?? value.schema),
    revision: finite(config.revision ?? value.revision),
    configBytes: safeBytes(config.version != null || config.settings || config.groups ? config : {}),
    sync: {
      state: safeState(sync.state, SYNC_STATES, 'idle'),
      message,
      at: finite(sync.at),
    },
    local: {
      lastSavedAt: finite(persisted.lastLocalSaveAt ?? value.local?.lastSavedAt ?? config.savedAt),
    },
    cloud: {
      enabled: !!cloud.enabled,
      type: cloud.type === 'gdrive' ? 'gdrive' : cloud.type === 'webdav' ? 'webdav' : 'none',
      configured: !!(cloud.url || cloud.gdriveClientId || value.cloud?.configured),
      lastBackupAt: finite(persisted.lastCloudBackupAt ?? value.cloud?.lastBackupAt),
    },
    conflict: {
      state: safeState(conflict.state, new Set(['none', 'detected', 'resolved']), conflict === true ? 'detected' : 'none'),
      at: finite(conflict.at),
    },
    permission: {
      bookmarks: permissionState(runtime.permission?.bookmarks ?? value.permission?.bookmarks),
      identity: permissionState(runtime.permission?.identity ?? value.permission?.identity),
    },
    agent: {
      state: agentState,
      at: finite(persisted.agent?.at ?? value.agent?.at),
    },
    recentError: recentError ? {
      code: safeCode(recentError.code, 'unknown-error'),
      at: finite(recentError.at),
    } : null,
  };
}

export function buildDiagnostics(core) {
  return redactDiagnostics({
    cfg: core?.cfg,
    runtime: core?.runtime,
    agentData: core?.agentData,
  });
}

export function exportSafeBackup(core) {
  return sanitizeConfig(core?.cfg || core || {});
}

export function saveStatusPatch(result = {}, config = {}, now = Date.now()) {
  const ok = result.ok !== false;
  const state = !ok ? 'error' : result.synced ? 'synced' : 'local-only';
  const message = SAFE_MESSAGES.has(result.reason) ? (result.reason || (result.synced ? 'synced' : '')) : safeCode(result.reason, 'storage-error');
  return {
    sync: { state, message, at: now },
    diagnostics: {
      configBytes: safeBytes(config),
      lastLocalSaveAt: now,
      ...(ok ? {} : { recentError: { code: safeCode(result.reason, 'storage-error'), at: now } }),
    },
  };
}

export function cloudStatusPatch(result = {}, now = Date.now()) {
  if (result.ok) return {
    sync: { state: 'synced', message: 'cloud-ok', at: now },
    diagnostics: { lastCloudBackupAt: now, recentError: null },
  };
  return {
    sync: { state: 'error', message: 'cloud-error', at: now },
    diagnostics: { recentError: { code: safeCode(result.reason, 'cloud'), at: now } },
  };
}

export function conflictStatusPatch(count, now = Date.now()) {
  return {
    sync: { state: count > 0 ? 'conflict' : 'idle', message: '', at: now },
    diagnostics: { conflict: { state: count > 0 ? 'detected' : 'none', at: count > 0 ? now : 0 } },
  };
}

export function agentStatusPatch(connected, now = Date.now()) {
  return { diagnostics: { agent: { state: connected ? 'connected' : 'unavailable', at: now } } };
}
