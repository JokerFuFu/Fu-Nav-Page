import test from 'node:test';
import assert from 'node:assert/strict';
import {
  archiveMode,
  createMode,
  deleteMode,
  listModes,
  renameMode,
  reorderModes,
  restoreMode,
} from '../shared/modes.js';

const mode = (id, name, extra = {}) => ({
  id, name, groupIds: [`g-${id}`], hiddenWidgets: [`w-${id}`], showFavs: true, ...extra,
});

test('complete workspace lifecycle preserves identity and rejects duplicate normalized names', () => {
  const settings = { modes: [mode('one', '工作')], activeMode: null };
  const created = createMode(settings, '  Deep   Work  ', { idFactory: () => 'm-new' });
  assert.equal(created.ok, true);
  assert.deepEqual(created.mode, { id: 'm-new', name: 'Deep Work', groupIds: [], hiddenWidgets: [], showFavs: true });
  assert.equal(createMode(settings, 'deep work').code, 'duplicate-name');

  created.mode.groupIds = ['g1', 'g2'];
  created.mode.hiddenWidgets = ['w1'];
  created.mode.showFavs = false;
  const before = structuredClone(created.mode);
  const renamed = renameMode(settings, 'm-new', '  专注   工作  ');
  assert.equal(renamed.ok, true);
  assert.equal(renamed.mode.name, '专注 工作');
  assert.deepEqual({ ...renamed.mode, name: before.name }, before);
  assert.equal(renameMode(settings, 'm-new', '工作').code, 'duplicate-name');
});

test('reorder, archive and restore only change lifecycle fields', () => {
  const first = mode('one', '一'), second = mode('two', '二'), archived = mode('old', '旧', { archived: true });
  const settings = { modes: [first, second, archived], activeMode: 'two' };
  const snapshots = new Map(settings.modes.map(item => [item.id, structuredClone(item)]));

  assert.equal(reorderModes(settings, ['two', 'one']).ok, true);
  assert.deepEqual(settings.modes.map(item => item.id), ['two', 'one', 'old']);
  assert.deepEqual(settings.modes.map(item => ({ ...item, archived: snapshots.get(item.id).archived })), [...settings.modes].map(item => ({ ...snapshots.get(item.id), archived: snapshots.get(item.id).archived })));

  const archivedResult = archiveMode(settings, 'two');
  assert.equal(archivedResult.ok, true);
  assert.equal(settings.activeMode, null);
  assert.deepEqual(listModes(settings).map(item => item.id), ['one']);
  assert.deepEqual(listModes(settings, { status: 'archived' }).map(item => item.id), ['two', 'old']);
  assert.deepEqual({ ...archivedResult.mode, archived: undefined }, { ...snapshots.get('two'), archived: undefined });

  const restored = restoreMode(settings, 'two');
  assert.equal(restored.ok, true);
  assert.equal(restored.mode.archived, undefined);
  assert.deepEqual({ ...restored.mode, archived: undefined }, { ...snapshots.get('two'), archived: undefined });
});

test('default workspace deletion detaches membership without deleting groups', () => {
  const groups = [{ id: 'g1', name: '一' }, { id: 'g2', name: '二' }];
  const settings = {
    activeMode: 'one',
    modes: [mode('one', '工作', { groupIds: ['g1', 'g2'] }), mode('two', '共享', { groupIds: ['g2'] })],
  };
  const marked = [];
  const result = deleteMode(settings, 'one', { groups, markDeleted: group => marked.push(group.id) });
  assert.equal(result.ok, true);
  assert.equal(result.strategy, 'detach');
  assert.deepEqual(groups.map(group => group.id), ['g1', 'g2']);
  assert.deepEqual(settings.modes.map(item => item.id), ['two']);
  assert.deepEqual(settings.modes[0].groupIds, ['g2']);
  assert.equal(settings.activeMode, null);
  assert.deepEqual(marked, []);
});

test('groups and tombstones change only after explicit delete-groups strategy', () => {
  const groups = [{ id: 'g1', name: '一' }, { id: 'g2', name: '二' }, { id: 'g3', name: '三' }];
  const settings = {
    activeMode: null,
    modes: [mode('one', '工作', { groupIds: ['g1', 'g2'] }), mode('two', '其他', { groupIds: ['g2', 'g3'] })],
  };
  const marked = [];
  const result = deleteMode(settings, 'one', { strategy: 'delete-groups', groups, markDeleted: group => marked.push(group.id) });
  assert.equal(result.ok, true);
  assert.equal(result.strategy, 'delete-groups');
  assert.deepEqual(result.deletedGroupIds, ['g1', 'g2']);
  assert.deepEqual(groups.map(group => group.id), ['g3']);
  assert.deepEqual(settings.modes[0].groupIds, ['g3']);
  assert.deepEqual(marked, ['g1', 'g2']);
});
