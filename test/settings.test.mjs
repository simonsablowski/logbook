import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_SETTINGS, patchSettings } from '../src/settings.js';

test('the defaults limit Planned to 6 and In progress to 2', () => {
  assert.deepEqual(DEFAULT_SETTINGS.wipLimits, { planned: 6, 'in-progress': 2 });
});

test('patchSettings sets, changes and removes limits without touching the others', () => {
  const set = patchSettings(DEFAULT_SETTINGS, { wipLimits: { idea: 10, planned: 4 } });
  assert.deepEqual(set.wipLimits, { planned: 4, 'in-progress': 2, idea: 10 });
  const removed = patchSettings(set, { wipLimits: { 'in-progress': null } });
  assert.deepEqual(removed.wipLimits, { planned: 4, idea: 10 });
  assert.deepEqual(DEFAULT_SETTINGS.wipLimits, { planned: 6, 'in-progress': 2 }, 'the input is not changed');
});

test('patchSettings rejects unknown statuses and invalid limits', () => {
  for (const wipLimits of [{ doing: 3 }, { planned: 0 }, { planned: 2.5 }, { planned: '3' }, { planned: 100 }, { planned: -1 }]) {
    assert.throws(() => patchSettings(DEFAULT_SETTINGS, { wipLimits }), { status: 400 });
  }
  for (const patch of [null, {}, { wipLimits: null }, 'x']) {
    assert.throws(() => patchSettings(DEFAULT_SETTINGS, patch), { status: 400 });
  }
});
