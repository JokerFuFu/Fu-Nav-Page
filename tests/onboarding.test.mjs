import test from 'node:test';
import assert from 'node:assert/strict';
import { completeOnboarding, requestCapability } from '../shared/runtime-state.js';
import { getWeather } from '../shared/weather.js';

const config = () => ({
  version: 3,
  settings: { demoMode: true, showWeather: true },
  groups: [{ id: 'g1', name: '演示', items: [{ id: 'i1', name: '示例', url: 'https://example.com' }] }],
});

test('onboarding choices are mutually exclusive and close stays deferred', async () => {
  let permissionRequests = 0;
  const ask = async () => { permissionRequests += 1; return { ok: true, state: 'granted' }; };

  const deferred = await completeOnboarding(null, { config: config(), requestPermission: ask });
  assert.equal(deferred.deferred, true);
  assert.equal(deferred.state.onboarding.completed, false);
  assert.equal(permissionRequests, 0);

  const template = await completeOnboarding('template', { config: config(), requestPermission: ask });
  assert.equal(template.state.onboarding.completed, true);
  assert.equal(template.config.settings.demoMode, true);
  assert.equal(template.config.groups.length, 1);
  assert.equal(permissionRequests, 0);

  const blank = await completeOnboarding('blank', { config: config(), requestPermission: ask });
  assert.equal(blank.state.onboarding.completed, true);
  assert.equal(blank.config.settings.demoMode, false);
  assert.deepEqual(blank.config.groups, []);
  assert.equal(permissionRequests, 0);

  const bookmarks = await completeOnboarding('bookmarks', { config: config(), requestPermission: ask });
  assert.equal(bookmarks.state.onboarding.completed, true);
  assert.equal(bookmarks.config.settings.demoMode, false);
  assert.equal(bookmarks.shouldImportBookmarks, true);
  assert.equal(permissionRequests, 1);
});

test('capability requests persist granted and denied results without throwing', async () => {
  const patches = [];
  const denied = await requestCapability('bookmarks', {
    permissionsApi: {
      contains: (_query, callback) => callback(false),
      request: (_query, callback) => callback(false),
    },
    saveState: async (patch) => { patches.push(patch); return patch; },
  });
  assert.deepEqual(denied, { ok: false, code: 'permission-denied', capability: 'bookmarks', state: 'denied' });
  assert.equal(patches.at(-1).permission.bookmarks, 'denied');

  const granted = await requestCapability('identity', {
    permissionsApi: {
      contains: (_query, callback) => callback(true),
      request: () => assert.fail('already granted permission must not be requested again'),
    },
    saveState: async (patch) => patch,
  });
  assert.equal(granted.ok, true);
  assert.equal(granted.state, 'granted');
});

test('weather performs no location or forecast request before consent', async () => {
  let fetches = 0;
  const storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  const weather = await getWeather(false, {
    consent: false,
    storage,
    fetcher: async () => { fetches += 1; throw new Error('must not fetch'); },
  });

  assert.equal(weather, null);
  assert.equal(fetches, 0);
});
