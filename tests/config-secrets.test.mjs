import test from 'node:test';
import assert from 'node:assert/strict';
import { makeConfig } from './helpers/fixtures.mjs';
import {
  injectSecrets,
  sanitizeConfig,
  splitSecrets,
} from '../shared/config-secrets.js';
import { cloudPut } from '../shared/cloud.js';

test('sanitized config never contains secret keys or values', () => {
  const raw = makeConfig({
    settings: {
      askProvider: 'bing',
      agentToken: 'agent-secret',
      cloud: {
        enabled: true,
        type: 'webdav',
        url: 'https://dav.example.com',
        user: 'fu-user',
        pass: 'dav-secret',
        gdriveClientId: 'public-client-id',
      },
    },
  });

  const safe = sanitizeConfig(raw);
  const text = JSON.stringify(safe);

  assert.doesNotMatch(text, /dav-secret|agent-secret|fu-user|"pass"|"user"|agentToken/);
  assert.match(text, /public-client-id/);
  assert.deepEqual(raw.settings.cloud.user, 'fu-user');
});

test('split and inject preserve runtime credentials without changing safe config', () => {
  const runtime = makeConfig({
    settings: {
      askProvider: 'bing',
      agentToken: 'agent-secret',
      cloud: {
        enabled: true,
        type: 'webdav',
        url: 'https://dav.example.com',
        user: 'fu-user',
        pass: 'dav-secret',
      },
    },
  });

  const { config, secrets } = splitSecrets(runtime);
  const reinjected = injectSecrets(config, secrets);

  assert.equal(config.settings.agentToken, undefined);
  assert.equal(config.settings.cloud.user, undefined);
  assert.equal(reinjected.settings.agentToken, 'agent-secret');
  assert.equal(reinjected.settings.cloud.user, 'fu-user');
  assert.equal(reinjected.settings.cloud.pass, 'dav-secret');
});

test('preview storage keeps secrets in a separate local key', async () => {
  const memory = new Map();
  globalThis.localStorage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key),
  };
  const { loadConfig, saveConfig } = await import(`../shared/storage.js?secrets=${Date.now()}`);
  const runtime = makeConfig({
    settings: {
      askProvider: 'bing',
      agentToken: 'agent-secret',
      cloud: {
        enabled: true,
        type: 'webdav',
        url: 'https://dav.example.com',
        user: 'fu-user',
        pass: 'dav-secret',
      },
    },
  });

  await saveConfig(runtime);
  const storedConfig = memory.get('fn_config');
  const storedSecrets = memory.get('fn_secrets_v1');
  const loaded = await loadConfig();

  assert.doesNotMatch(storedConfig, /agent-secret|fu-user|dav-secret/);
  assert.match(storedSecrets, /agent-secret/);
  assert.equal(loaded.config.settings.agentToken, 'agent-secret');
  assert.equal(loaded.config.settings.cloud.pass, 'dav-secret');
  delete globalThis.localStorage;
});

test('WebDAV upload keeps credentials in authorization header but not JSON body', async () => {
  const previousFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url, init };
    return { ok: true, status: 200 };
  };
  const runtime = makeConfig({
    settings: {
      askProvider: 'bing',
      agentToken: 'agent-secret',
      cloud: {
        enabled: true,
        type: 'webdav',
        url: 'https://dav.example.com',
        user: 'fu-user',
        pass: 'dav-secret',
      },
    },
  });

  const result = await cloudPut(runtime.settings, runtime);

  assert.equal(result.ok, true);
  assert.match(request.init.headers.Authorization, /^Basic /);
  assert.doesNotMatch(request.init.body, /fu-user|dav-secret|agent-secret|"user"|"pass"|agentToken/);
  globalThis.fetch = previousFetch;
});
