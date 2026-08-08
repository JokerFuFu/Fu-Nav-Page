import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyDuplicate, normalizeUrl } from '../shared/url.js';
import { normUrl } from '../shared/icon-map.js';

test('normalizes safe URL differences without collapsing business queries', () => {
  assert.equal(normalizeUrl('HTTPS://Example.com:443/path/?utm_source=x#top', 'strict'), 'https://example.com/path');
  assert.equal(classifyDuplicate('https://www.example.com/a', 'http://example.com/a').level, 'possible');
  assert.equal(classifyDuplicate('https://example.com/item?id=1', 'https://example.com/item?id=2').level, 'distinct');
});

test('strict normalization removes tracking only and remains the compatibility normUrl export', () => {
  assert.equal(normalizeUrl('https://EXAMPLE.com:443/a/?b=2&utm_medium=x&a=1#section', 'strict'), 'https://example.com/a?a=1&b=2');
  assert.equal(normUrl('https://EXAMPLE.com:443/a/?b=2&utm_medium=x&a=1#section'), 'https://example.com/a?a=1&b=2');
  assert.equal(classifyDuplicate('https://example.com/a?ref=one', 'https://example.com/a?ref=two').level, 'distinct');
});
