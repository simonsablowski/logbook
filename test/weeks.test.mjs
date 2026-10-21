import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupByWeek, lastWeeks, weekCounts, weekNumber, weekOf, weekRange } from '../public/weeks.js';

const done = (id, project, completedAt) => ({ id, project, status: 'completed', completed: completedAt.slice(0, 10), completedAt });
const local = (y, m, d, h = 12) => new Date(y, m - 1, d, h);

test('weekOf returns the Monday, also for Sundays and Mondays', () => {
  assert.equal(weekOf(local(2026, 10, 19)), '2026-10-19'); // Monday
  assert.equal(weekOf(local(2026, 10, 21)), '2026-10-19'); // Wednesday
  assert.equal(weekOf(local(2026, 10, 25, 23)), '2026-10-19'); // Sunday evening
  assert.equal(weekOf(local(2026, 10, 26, 0)), '2026-10-26'); // next Monday
  assert.equal(weekOf(local(2027, 1, 1)), '2026-12-28'); // across the year
});

test('lastWeeks lists twelve Mondays ending with the current week, oldest first', () => {
  const weeks = lastWeeks(12, local(2026, 10, 21));
  assert.equal(weeks.length, 12);
  assert.equal(weeks.at(-1), '2026-10-19');
  assert.equal(weeks[0], '2026-08-03');
});

test('weekCounts counts per week and project and leaves empty weeks at zero', () => {
  const weeks = lastWeeks(3, local(2026, 10, 21));
  const counts = weekCounts([
    done('MTV-1', 'MTV', local(2026, 10, 20).toISOString()),
    done('MTV-2', 'MTV', local(2026, 10, 19, 8).toISOString()),
    done('IKS-1', 'IKS', local(2026, 10, 21).toISOString()),
    done('IKS-2', 'IKS', local(2026, 10, 5).toISOString()),
    done('IKS-3', 'IKS', local(2026, 1, 5).toISOString()), // older than the strip
    { id: 'IKS-4', project: 'IKS', status: 'planned' },
  ], weeks);
  assert.deepEqual(counts.map((c) => c.total), [1, 0, 3]);
  assert.deepEqual(counts[2].byProject, { MTV: 2, IKS: 1 });
});

test('groupByWeek keeps the order and splits at the week', () => {
  const sorted = [
    done('A', 'MTV', local(2026, 10, 21).toISOString()),
    done('B', 'MTV', local(2026, 10, 19).toISOString()),
    done('C', 'MTV', local(2026, 10, 18).toISOString()),
  ];
  const groups = groupByWeek(sorted);
  assert.deepEqual(groups.map((g) => [g.week, g.tickets.map((t) => t.id)]), [['2026-10-19', ['A', 'B']], ['2026-10-12', ['C']]]);
});

test('weekNumber and weekRange name the week', () => {
  assert.equal(weekNumber('2026-10-19'), 43);
  assert.equal(weekNumber('2026-12-28'), 53);
  assert.equal(weekNumber('2027-01-04'), 1);
  assert.equal(weekRange('2026-10-19'), '19 – 25 Oct 2026');
  assert.equal(weekRange('2026-10-26'), '26 Oct – 1 Nov 2026');
});
