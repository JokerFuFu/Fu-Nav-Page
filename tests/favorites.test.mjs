import test from 'node:test';
import assert from 'node:assert/strict';
import { rankFavorites, rankModeFavorites } from '../shared/favorites.js';

const entry = (id, groupId, patch = {}) => ({
  group: { id: groupId, name: groupId },
  item: { id, name: id, url: `https://${id}.example/`, ...patch },
});

test('keeps the all-collections homepage exactly equivalent to the existing ranking', () => {
  const now = 1_800_000_000_000;
  const all = [
    entry('work-auto', 'g-work', { freq: 4, lastVisit: now }),
    entry('life-pinned', 'g-life', { fav: true }),
    entry('work-pinned', 'g-work', { fav: true }),
    entry('fallback', 'g-common'),
  ];
  const fallback = [all[3]];
  const favOrder = ['life-pinned', 'work-pinned'];
  const before = structuredClone({ all, fallback, favOrder });

  const legacy = rankFavorites(all, favOrder, fallback, 4, now);
  const global = rankModeFavorites(all, favOrder, fallback, 4, null, now);

  assert.deepEqual(global, legacy);
  assert.deepEqual({ all, fallback, favOrder }, before);
});

test('limits pinned, automatic, and fallback favorites to the active workspace groups', () => {
  const now = 1_800_000_000_000;
  const all = [
    entry('life-pinned', 'g-life', { fav: true }),
    entry('work-pinned', 'g-work', { fav: true }),
    entry('life-auto', 'g-life', { freq: 99, lastVisit: now }),
    entry('work-auto', 'g-work', { freq: 2, lastVisit: now }),
    entry('work-fallback', 'g-work'),
    entry('life-fallback', 'g-life'),
  ];
  const favOrder = ['life-pinned', 'work-pinned'];
  const result = rankModeFavorites(all, favOrder, [all[4], all[5]], 8, { id: 'm-work', groupIds: ['g-work'] }, now);

  assert.deepEqual(result.map(({ item }) => item.id), ['work-pinned', 'work-auto', 'work-fallback']);
  assert.deepEqual(favOrder, ['life-pinned', 'work-pinned']);
});

test('does not leak global favorites into an empty workspace or privacy mode', () => {
  const all = [entry('global-pinned', 'g-global', { fav: true })];

  assert.deepEqual(rankModeFavorites(all, ['global-pinned'], [], 8, { id: 'm-empty', groupIds: [] }), []);
  assert.deepEqual(rankModeFavorites(all, ['global-pinned'], [], 8, 'privacy'), []);
});
