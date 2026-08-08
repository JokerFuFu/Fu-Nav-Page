import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDestinationOptions, rememberDestination, savePopupItem } from '../shared/popup-model.js';
import { locateNode } from '../shared/tree.js';
import { makeConfig, makeFolder, makeGroup, makeSite } from './helpers/fixtures.mjs';

const nestedConfig = () => makeConfig({ groups: [
  makeGroup('g1', [makeFolder('f1', [makeFolder('f2', [])], { name: 'NAS' })], { name: '家庭网络' }),
  makeGroup('g2', [], { name: '工作' }),
] });

test('destination options include full two-level paths and prune recent destinations', () => {
  const config = nestedConfig();
  const destinations = buildDestinationOptions(config.groups, ['f:f2', 'g:g2', 'missing', 'f:f2', 'f:f1']);

  assert.deepEqual(destinations.options.map((option) => option.label), [
    '家庭网络',
    '家庭网络 / NAS',
    '家庭网络 / NAS / f2',
    '工作',
  ]);
  assert.deepEqual(destinations.recents.map((option) => option.key), ['f:f2', 'g:g2', 'f:f1']);
  assert.deepEqual(rememberDestination(destinations.recents.map((option) => option.key), 'g:g1', destinations.options.map((option) => option.key)), ['g:g1', 'f:f2', 'g:g2']);
});

test('saves a new item into the exact second-level folder', () => {
  const config = nestedConfig();
  const result = savePopupItem(config, {
    id: 'i-new',
    name: 'Portainer',
    url: 'https://portainer.example.com/',
    destinationKey: 'f:f2',
    note: 'server',
    fav: true,
    frame: true,
  });

  assert.equal(result.ok, true);
  const hit = locateNode(result.config.groups, 'i-new');
  assert.equal(hit.parent.id, 'f2');
  assert.equal(hit.node.note, 'server');
  assert.equal(hit.node.fav, true);
  assert.equal(hit.node.frame, true);
});

test('classifies exact, possible and forced duplicate saves', () => {
  const config = makeConfig({ groups: [makeGroup('g1', [
    makeSite('existing', { url: 'https://www.example.com/path/?utm_source=x' }),
  ])] });
  const base = { id: 'copy', name: 'Copy', destinationKey: 'g:g1' };

  const exact = savePopupItem(config, { ...base, url: 'https://www.example.com/path/' });
  assert.equal(exact.ok, false);
  assert.equal(exact.duplicate, 'exact');
  assert.deepEqual(exact.actions, ['open-existing', 'force-save']);

  const possible = savePopupItem(config, { ...base, url: 'http://example.com/path' });
  assert.equal(possible.ok, false);
  assert.equal(possible.duplicate, 'possible');

  const forced = savePopupItem(config, { ...base, url: 'https://www.example.com/path/', forceDuplicate: true });
  assert.equal(forced.ok, true);
  assert.equal(locateNode(forced.config.groups, 'copy').group.id, 'g1');

  const distinct = savePopupItem(config, { ...base, id: 'distinct', url: 'https://www.example.com/path?id=2' });
  assert.equal(distinct.ok, true);
});
