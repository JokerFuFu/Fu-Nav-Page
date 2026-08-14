import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { homeDensity, visibleWidgets } from '../shared/home-settings.js';

test('uses compact home below laptop height and mobile layout by width', () => {
  assert.equal(homeDensity(1440, 900), 'comfortable');
  assert.equal(homeDensity(1268, 714), 'compact');
  assert.equal(homeDensity(1024, 768), 'compact');
  assert.equal(homeDensity(768, 800), 'compact');
  assert.equal(homeDensity(390, 844), 'mobile');
});

test('hides unconfigured hardware and preserves configured widget order', () => {
  const settings = {
    showWeather: true,
    widgets: [
      { id: 'w1', type: 'hwmon', url: '' },
      { id: 'w2', type: 'today' },
      { id: 'w3', type: 'hwmon', url: 'http://127.0.0.1:61208/' },
      { id: 'w4', type: 'clock' },
    ],
  };

  assert.deepEqual(visibleWidgets(settings).map(widget => widget.id), ['w2', 'w3']);
});

test('honors component toggles and never renders a legacy clock as a component', () => {
  const settings = {
    showClock: true,
    showWeather: false,
    disabledWidgets: ['w-today'],
    widgets: [
      { id: 'w-today', type: 'today' },
      { id: 'w-clock', type: 'clock' },
      { id: 'w-weather', type: 'weather' },
    ],
  };

  assert.deepEqual(visibleWidgets(settings), []);
  assert.deepEqual(settings.widgets.map(widget => widget.id), ['w-today', 'w-clock', 'w-weather']);
});

test('default seed is an explicit demo without legacy clock or hardware components', async () => {
  const seed = JSON.parse(await readFile(new URL('../data/seed.json', import.meta.url), 'utf8'));
  assert.equal(seed.settings.demoMode, true);
  assert.deepEqual(seed.settings.widgets.map(widget => widget.type), ['weather', 'today']);
  assert.equal(seed.settings.heroClock.colorMode, 'auto');
  assert.equal(seed.settings.widgets.some(widget => widget.type === 'hwmon'), false);
  const pinned = seed.groups.flatMap(group => group.items).filter(item => item.fav === true);
  assert.ok(pinned.length >= 8, 'seed must fill the first row of the default 8-column favorites grid');
});
