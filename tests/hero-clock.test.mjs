import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HERO_CLOCK_DEFAULTS,
  averageImageDataLuminance,
  chooseHeroClockTone,
  contrastRatio,
  coverSourceRect,
  formatHeroClock,
  migrateHeroClock,
  normalizeHeroClock,
} from '../shared/hero-clock.js';

test('normalizes every supported hero clock option and rejects invalid values', () => {
  assert.deepEqual(normalizeHeroClock({}), HERO_CLOCK_DEFAULTS);
  assert.deepEqual(normalizeHeroClock({
    font: 'rounded',
    size: 'large',
    weight: 'bold',
    style: 'outline',
    format: '12',
    details: 'date',
    colorMode: 'custom',
    customColor: '#12abEF',
  }), {
    font: 'rounded',
    size: 'large',
    weight: 'bold',
    style: 'outline',
    format: '12',
    details: 'date',
    colorMode: 'custom',
    customColor: '#12abef',
  });
  assert.deepEqual(normalizeHeroClock({
    font: 'comic', size: 'huge', weight: 'black', style: 'glow',
    format: 'seconds', details: 'weather', colorMode: 'rainbow', customColor: 'red',
  }), HERO_CLOCK_DEFAULTS);
});

test('migrates all legacy clock widgets out of the component collection once', () => {
  const settings = {
    showClock: true,
    heroClock: { font: 'mono', colorMode: 'dark' },
    widgets: [
      { id: 'w-clock-a', type: 'clock' },
      { id: 'w-weather', type: 'weather' },
      { id: 'w-clock-b', type: 'clock' },
      { id: 'w-today', type: 'today' },
    ],
  };

  assert.equal(migrateHeroClock(settings), true);
  assert.deepEqual(settings.widgets.map(widget => widget.type), ['weather', 'today']);
  assert.equal(settings.showClock, true);
  assert.equal(settings.heroClock.font, 'mono');
  assert.equal(settings.heroClock.colorMode, 'dark');
  assert.equal(migrateHeroClock(settings), false);
});

test('formats 24 and 12 hour faces while exposing deterministic detail visibility', () => {
  const afternoon = new Date(2026, 7, 10, 17, 5, 0);
  assert.deepEqual(formatHeroClock(afternoon, { format: '24', details: 'full' }), {
    time: '17:05',
    date: '8月10日 周一',
    greeting: '下午好',
    showDate: true,
    showGreeting: true,
    datetime: afternoon.toISOString(),
  });
  assert.deepEqual(formatHeroClock(afternoon, { format: '12', details: 'time' }), {
    time: '5:05 PM',
    date: '8月10日 周一',
    greeting: '下午好',
    showDate: false,
    showGreeting: false,
    datetime: afternoon.toISOString(),
  });
});

test('chooses opposite automatic tones for dark and bright rendered backgrounds at 3:1 or better', () => {
  const dark = chooseHeroClockTone({ luminance: 0.02, scrimOpacity: 0.52 });
  const bright = chooseHeroClockTone({ luminance: 1, scrimOpacity: 0.42 });

  assert.equal(dark.tone, 'light');
  assert.equal(bright.tone, 'dark');
  assert.ok(dark.contrast >= 3, `dark sample contrast ${dark.contrast}`);
  assert.ok(bright.contrast >= 3, `bright sample contrast ${bright.contrast}`);
  assert.equal(chooseHeroClockTone({ luminance: Number.NaN, scrimOpacity: 0.5 }), null);
  assert.ok(contrastRatio(1, 0) >= 21);
});

test('samples the visible top-center clock region after cover cropping', () => {
  assert.deepEqual(coverSourceRect(2000, 1000, 1000, 1000, { x: 0.25, y: 0, width: 0.5, height: 0.25 }), {
    x: 750, y: 0, width: 500, height: 250,
  });
  assert.deepEqual(coverSourceRect(1000, 2000, 1000, 1000, { x: 0.25, y: 0, width: 0.5, height: 0.25 }), {
    x: 250, y: 500, width: 500, height: 250,
  });
  assert.equal(averageImageDataLuminance(new Uint8ClampedArray([
    0, 0, 0, 255,
    255, 255, 255, 255,
  ])), 0.5);
  assert.equal(averageImageDataLuminance(new Uint8ClampedArray([255, 0, 0, 0])), null);
});
