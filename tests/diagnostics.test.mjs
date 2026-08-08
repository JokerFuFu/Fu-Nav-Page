import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDiagnostics,
  cloudStatusPatch,
  exportSafeBackup,
  redactDiagnostics,
  saveStatusPatch,
} from '../shared/diagnostics.js';
import { buildCloudPayload } from '../shared/cloud.js';

const secretConfig = () => ({
  version: 3,
  revision: 17,
  savedAt: 1700000000000,
  settings: {
    agentToken: 'UNIQUE_AGENT_TOKEN',
    cloud: {
      enabled: true,
      type: 'webdav',
      url: 'https://UNIQUE_USER:UNIQUE_PASS@dav.example.test/private/',
      user: 'UNIQUE_USER',
      pass: 'UNIQUE_PASS',
    },
  },
  groups: [{ id: 'g1', name: 'PRIVATE_SITE_LIST', items: [{ id: 'i1', name: 'SECRET_BOOKMARK', url: 'https://internal.example.test/' }] }],
});

const runtime = {
  sync: { state: 'local-only', message: 'quota', at: 1700000001000 },
  permission: { bookmarks: 'denied', identity: 'granted' },
  diagnostics: {
    lastLocalSaveAt: 1700000001000,
    lastCloudBackupAt: 1700000002000,
    conflict: { state: 'detected', at: 1700000003000 },
    recentError: { code: 'cloud-http-503', message: 'UNIQUE_PASS leaked here', at: 1700000004000 },
  },
};

test('diagnostics is a strict metadata whitelist without credentials or site inventory', () => {
  const diagnostics = buildDiagnostics({ cfg: secretConfig(), runtime, agentData: null });
  assert.equal(diagnostics.schema, 3);
  assert.equal(diagnostics.revision, 17);
  assert.ok(diagnostics.configBytes > 0);
  assert.equal(diagnostics.sync.state, 'local-only');
  assert.equal(diagnostics.local.lastSavedAt, 1700000001000);
  assert.equal(diagnostics.cloud.lastBackupAt, 1700000002000);
  assert.equal(diagnostics.conflict.state, 'detected');
  assert.deepEqual(diagnostics.permission, { bookmarks: 'denied', identity: 'granted' });
  assert.equal(diagnostics.agent.state, 'unavailable');
  assert.deepEqual(diagnostics.recentError, { code: 'cloud-http-503', at: 1700000004000 });

  const text = JSON.stringify(diagnostics);
  assert.doesNotMatch(text, /UNIQUE_|PRIVATE_SITE_LIST|SECRET_BOOKMARK|internal\.example|dav\.example|"groups"|"url"/);
});

test('redaction ignores arbitrary secret-bearing fields instead of recursively copying them', () => {
  const redacted = redactDiagnostics({
    config: secretConfig(),
    runtime: { ...runtime, diagnostics: { ...runtime.diagnostics, recentError: null } },
    password: 'UNIQUE_PASS',
    token: 'UNIQUE_AGENT_TOKEN',
    websites: ['SECRET_BOOKMARK'],
    recentError: { code: 'cloud-host-PRIVATE_DAV_EXAMPLE', at: 1700000004000 },
  });
  assert.doesNotMatch(JSON.stringify(redacted), /UNIQUE_|PRIVATE_|SECRET_BOOKMARK|websites|password|token/);
  assert.equal(redacted.recentError.code, 'unknown-error');
  assert.equal(redacted.cloud.configured, true);
});

test('local save and cloud result patches persist structured state without raw errors', () => {
  const saved = saveStatusPatch({ ok: true, synced: false, reason: 'quota' }, secretConfig(), 1700000005000);
  assert.equal(saved.sync.state, 'local-only');
  assert.equal(saved.sync.message, 'quota');
  assert.equal(saved.diagnostics.lastLocalSaveAt, 1700000005000);
  assert.ok(saved.diagnostics.configBytes > 0);

  const failed = cloudStatusPatch({ ok: false, reason: 'HTTP 503 UNIQUE_PASS' }, 1700000006000);
  assert.equal(failed.sync.state, 'error');
  assert.deepEqual(failed.diagnostics.recentError, { code: 'cloud-http-503', at: 1700000006000 });
  assert.doesNotMatch(JSON.stringify(failed), /UNIQUE_PASS/);
});

test('sync quota failure keeps the edited config locally and reports local-only bytes', async () => {
  const previousChrome = globalThis.chrome;
  const local = {};
  const read = (store, keys) => {
    if (Array.isArray(keys)) return Object.fromEntries(keys.filter(key => key in store).map(key => [key, store[key]]));
    return keys && typeof keys === 'object'
      ? Object.fromEntries(Object.keys(keys).map(key => [key, store[key] ?? keys[key]]))
      : { [keys]: store[keys] };
  };
  globalThis.chrome = {
    runtime: { lastError: null },
    storage: {
      sync: {
        get: (keys, callback) => callback(read({}, keys)),
        set: (_value, callback) => {
          globalThis.chrome.runtime.lastError = { message: 'QUOTA_BYTES quota exceeded' };
          callback();
          globalThis.chrome.runtime.lastError = null;
        },
        remove: (_keys, callback) => callback?.(),
      },
      local: {
        get: (keys, callback) => callback(read(local, keys)),
        set: (value, callback) => { Object.assign(local, value); callback?.(); },
      },
    },
  };

  try {
    const { saveConfig } = await import(`../shared/storage.js?quota-test=${Date.now()}`);
    const edited = secretConfig();
    edited.groups[0].items[0].name = 'PERSISTED_AFTER_QUOTA';
    const result = await saveConfig(edited);
    const patch = saveStatusPatch(result, edited, 1700000007000);

    assert.equal(result.ok, true);
    assert.equal(result.synced, false);
    assert.equal(result.reason, 'quota');
    assert.equal(local.fn_config.groups[0].items[0].name, 'PERSISTED_AFTER_QUOTA');
    assert.equal(patch.sync.state, 'local-only');
    assert.ok(patch.diagnostics.configBytes > 0);
  } finally {
    if (previousChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = previousChrome;
  }
});

test('backup export and cloud payload share the secret-free configuration boundary', () => {
  const config = secretConfig();
  const backup = exportSafeBackup({ cfg: config });
  const cloud = buildCloudPayload(config);
  for (const payload of [backup, cloud]) {
    const text = JSON.stringify(payload);
    assert.doesNotMatch(text, /UNIQUE_|"pass"|"user"|agentToken/);
    assert.doesNotMatch(text, /https:\/\/[^/]*@/);
    assert.equal(payload.groups[0].name, 'PRIVATE_SITE_LIST');
  }
});
