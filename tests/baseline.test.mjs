import test from 'node:test';
import assert from 'node:assert/strict';
import { makeConfig, makeGroup, makeSite } from './helpers/fixtures.mjs';

test('fixture returns isolated versioned configs', () => {
  const first = makeConfig({
    groups: [makeGroup('g1', [makeSite('i1')])],
  });
  const second = makeConfig();

  first.groups[0].name = 'changed';

  assert.equal(first.version, 3);
  assert.equal(second.groups.length, 0);
});
