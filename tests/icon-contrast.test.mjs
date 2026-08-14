import test from 'node:test';
import assert from 'node:assert/strict';
import { readableTextColor } from '../shared/icons.js';

const hex = value => value.match(/[0-9a-f]{2}/gi).map(part => Number.parseInt(part, 16));
const luminance = color => color.map(channel => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
const contrast = (a, b) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};

test('letter icons choose a foreground with at least 4.5:1 contrast', () => {
  for (const background of ['#5b8def', '#22a3b5', '#36b37e', '#e2a032', '#e0567a', '#9b6ef3', '#ef6b4d', '#3aa0a0', '#7a86f0', '#c2557a']) {
    const foreground = readableTextColor(background);
    assert.ok(contrast(hex(background), hex(foreground)) >= 4.5, `${foreground} on ${background}`);
  }
});
