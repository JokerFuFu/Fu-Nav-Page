import test from 'node:test';
import assert from 'node:assert/strict';
import { makeConfig } from './helpers/fixtures.mjs';
import { migrateConfig, validateConfig } from '../shared/config-schema.js';
import { injectSecrets } from '../shared/config-secrets.js';

test('migrates v2 provider and extracts cloud credentials idempotently', () => {
  const raw = makeConfig({
    version: 2,
    revision: undefined,
    settings: {
      searchEngine: 'google',
      agentToken: 'agent-secret',
      cloud: {
        enabled: true,
        type: 'webdav',
        url: 'https://dav.example.com',
        user: 'fu',
        pass: 'secret',
      },
    },
  });

  const first = migrateConfig(raw, 500);
  const second = migrateConfig(first.config, 900);

  assert.equal(first.config.version, 3);
  assert.equal(first.config.revision, 0);
  assert.equal(first.config.settings.askProvider, 'google');
  assert.equal('searchEngine' in first.config.settings, false);
  assert.equal('agentToken' in first.config.settings, false);
  assert.equal('user' in first.config.settings.cloud, false);
  assert.equal('pass' in first.config.settings.cloud, false);
  assert.deepEqual(second.config, first.config);
  assert.deepEqual(first.secrets, {
    agentToken: 'agent-secret',
    cloudUser: 'fu',
    cloudPass: 'secret',
  });
});

test('validates config tree shape without mutating the input', () => {
  const config = makeConfig();
  const before = structuredClone(config);
  assert.deepEqual(validateConfig(config), { ok: true, errors: [] });
  assert.deepEqual(config, before);

  const invalid = makeConfig({ groups: [{ id: 'g1', items: 'not-an-array' }] });
  const result = validateConfig(invalid);
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].path, 'groups[0].items');
});

test('runtime secret injection alone does not mark schema as changed', () => {
  const safe = makeConfig();
  const runtime = injectSecrets(safe, {
    agentToken: 'agent-secret',
    cloudUser: 'fu',
    cloudPass: 'secret',
  });

  const result = migrateConfig(runtime, 900);

  assert.equal(result.changed, false);
});
