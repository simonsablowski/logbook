import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTicket, nextId, patchTicket } from '../src/tickets.js';
import { validateTicket } from '../src/validate.js';

const prefixes = ['MTV', 'LGB'];
const existing = [
  { id: 'MTV-001', project: 'MTV' },
  { id: 'MTV-007', project: 'MTV' },
  { id: 'LGB-002', project: 'LGB' },
];
const planned = { project: 'MTV', title: 'Add footer form', type: 'feature', status: 'planned', priority: 'now', effort: 'S' };

test('nextId continues after the highest number of the project', () => {
  assert.equal(nextId(existing, 'MTV'), 'MTV-008');
  assert.equal(nextId(existing, 'LGB'), 'LGB-003');
  assert.equal(nextId([], 'MTV'), 'MTV-001');
});

test('createTicket fills server-controlled fields', () => {
  const ticket = createTicket(planned, existing, prefixes, '2026-10-21');
  assert.equal(ticket.id, 'MTV-008');
  assert.equal(ticket.created, '2026-10-21');
  assert.equal(ticket.origin, 'live');
  assert.deepEqual(ticket.commits, []);
});

test('createTicket ignores fields a client must not set', () => {
  const ticket = createTicket({ ...planned, id: 'MTV-999', created: '2000-01-01', origin: 'reconstructed' }, existing, prefixes, '2026-10-21');
  assert.equal(ticket.id, 'MTV-008');
  assert.equal(ticket.created, '2026-10-21');
  assert.equal(ticket.origin, 'live');
});

test('createTicket rejects unknown projects and missing priorities', () => {
  assert.throws(() => createTicket({ ...planned, project: 'XYZ' }, existing, prefixes, '2026-10-21'), /unknown project/);
  assert.throws(() => createTicket({ ...planned, priority: undefined }, existing, prefixes, '2026-10-21'), /priority/);
});

test('patchTicket stamps and clears the completion date', () => {
  const ticket = createTicket(planned, existing, prefixes, '2026-10-21');
  const done = patchTicket(ticket, { status: 'completed' }, prefixes, '2026-10-22');
  assert.equal(done.completed, '2026-10-22');
  const reopened = patchTicket(done, { status: 'in-progress', priority: 'now' }, prefixes, '2026-10-23');
  assert.equal(reopened.completed, null);
});

test('patchTicket cannot change the id or project', () => {
  const ticket = createTicket(planned, existing, prefixes, '2026-10-21');
  const changed = patchTicket(ticket, { id: 'LGB-001', project: 'LGB', title: 'New title' }, prefixes, '2026-10-21');
  assert.equal(changed.id, ticket.id);
  assert.equal(changed.project, 'MTV');
  assert.equal(changed.title, 'New title');
});

test('validateTicket reports every problem', () => {
  const errors = validateTicket({ id: 'x', project: 'MTV', title: '', type: 'nope', status: 'nope', commits: 'x', body: 1 }, prefixes);
  assert.ok(errors.length >= 6);
});

test('a completed ticket gets the time of its completion', () => {
  const ticket = createTicket({ ...planned, status: 'completed' }, existing, prefixes, '2026-10-21T08:57:55.123Z');
  assert.equal(ticket.completed, '2026-10-21');
  assert.equal(ticket.completedAt, '2026-10-21T08:57:55.123Z');
});

test('completing and reopening a ticket sets and clears the time', () => {
  const open = createTicket(planned, existing, prefixes, '2026-10-21T08:00:00.000Z');
  assert.equal(open.completedAt, null);
  const done = patchTicket(open, { status: 'completed' }, prefixes, '2026-10-22T09:30:00.000Z');
  assert.equal(done.completed, '2026-10-22');
  assert.equal(done.completedAt, '2026-10-22T09:30:00.000Z');
  const reopened = patchTicket(done, { status: 'in-progress', priority: 'now' }, prefixes, '2026-10-23T10:00:00.000Z');
  assert.equal(reopened.completed, null);
  assert.equal(reopened.completedAt, null);
});

test('a completion date set by hand has no time, unless the time is sent along', () => {
  const done = createTicket({ ...planned, status: 'completed' }, existing, prefixes, '2026-10-21T08:57:55.123Z');
  assert.equal(patchTicket(done, { completed: '2026-10-01' }, prefixes, '2026-10-22T00:00:00.000Z').completedAt, null);
  const both = patchTicket(done, { completed: '2026-10-01', completedAt: '2026-10-01T12:00:00Z' }, prefixes, '2026-10-22T00:00:00.000Z');
  assert.equal(both.completedAt, '2026-10-01T12:00:00Z');
  assert.throws(() => patchTicket(done, { completedAt: 'yesterday' }, prefixes, '2026-10-22'), /completedAt must be a time/);
});
