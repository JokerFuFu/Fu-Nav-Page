import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFolder, makeGroup, makeSite } from './helpers/fixtures.mjs';
import { canMoveNode, countTree, locateNode, moveNode, removeNode, walkTree } from '../shared/tree.js';

test('moves a two-level nested site to another group and deletes it recursively', () => {
  const site = makeSite('deep');
  const groups = [
    makeGroup('g1', [makeFolder('f1', [makeFolder('f2', [site])])]),
    makeGroup('g2'),
  ];

  assert.equal(moveNode(groups, 'deep', { groupId: 'g2' }).ok, true);
  assert.equal(locateNode(groups, 'deep').group.id, 'g2');
  assert.equal(removeNode(groups, 'deep').node.id, 'deep');
  assert.equal(locateNode(groups, 'deep'), null);
});

test('rejects moving a folder into itself, a descendant or a third folder level atomically', () => {
  const groups = [
    makeGroup('g1', [
      makeFolder('f1', [makeFolder('f2', [makeSite('inside')])]),
      makeFolder('target'),
    ]),
  ];
  const before = structuredClone(groups);

  assert.deepEqual(canMoveNode(groups, 'f1', { groupId: 'g1', folderId: 'f1' }), { ok: false, code: 'invalid-destination' });
  assert.deepEqual(moveNode(groups, 'f1', { groupId: 'g1', folderId: 'f2' }), { ok: false, code: 'invalid-destination' });
  assert.deepEqual(moveNode(groups, 'target', { groupId: 'g1', folderId: 'f2' }), { ok: false, code: 'invalid-destination' });
  assert.deepEqual(groups, before);
});

test('walk and count expose stable depth, parent and recursive totals', () => {
  const groups = [makeGroup('g1', [
    makeSite('top'),
    makeFolder('f1', [makeSite('nested'), makeFolder('f2', [makeSite('deep')])]),
  ])];

  const rows = walkTree(groups);
  const deep = rows.find((entry) => entry.node.id === 'deep');

  assert.equal(deep.group.id, 'g1');
  assert.equal(deep.parent.id, 'f2');
  assert.equal(deep.depth, 2);
  assert.deepEqual(countTree(groups[0].items), { topLevel: 2, sites: 3, folders: 2, total: 5 });
});
