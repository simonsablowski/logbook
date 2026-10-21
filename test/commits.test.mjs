import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attachCommits, ticketCommits, ticketIdOf } from '../src/commits.js';

const github = (sha, message) => ({ sha: `${sha}0000000000000000000000000000000`, commit: { message } });

test('ticketIdOf reads the ID at the start of the first line', () => {
  assert.equal(ticketIdOf('MTV-014: Add footer form'), 'MTV-014');
  assert.equal(ticketIdOf('MTV-014: Add footer form\n\nLonger text'), 'MTV-014');
  assert.equal(ticketIdOf('Add footer form'), null);
  assert.equal(ticketIdOf('Fix MTV-014: later in the line'), null);
  assert.equal(ticketIdOf('MTV-014 without colon'), null);
  assert.equal(ticketIdOf('mtv-014: lower case'), null);
});

test('ticketCommits groups by ticket, oldest first, and ignores other prefixes', () => {
  const newestFirst = [
    github('ccccccc', 'MTV-002: Third'),
    github('bbbbbbb', 'MTV-001: Second\n\nBody'),
    github('aaaaaaa', 'MTV-001: First'),
    github('ddddddd', 'IKS-001: Wrong repository'),
    github('eeeeeee', 'Merge branch main'),
  ];
  const found = ticketCommits(newestFirst, 'MTV');
  assert.deepEqual(Object.keys(found).sort(), ['MTV-001', 'MTV-002']);
  assert.deepEqual(found['MTV-001'], [
    { sha: 'ddddddd'.slice(0, 0) + 'aaaaaaa', subject: 'MTV-001: First' },
    { sha: 'bbbbbbb', subject: 'MTV-001: Second' },
  ]);
});

test('attachCommits adds only unknown commits and counts them', () => {
  const tickets = [
    { id: 'MTV-001', commits: [{ sha: 'aaaaaaa', subject: 'MTV-001: First' }] },
    { id: 'MTV-003', commits: [] },
  ];
  const found = {
    'MTV-001': [{ sha: 'aaaaaaa', subject: 'MTV-001: First' }, { sha: 'bbbbbbb', subject: 'MTV-001: Second' }],
    'MTV-009': [{ sha: 'fffffff', subject: 'MTV-009: Unknown ticket' }],
  };
  const { tickets: updated, added } = attachCommits(tickets, found);
  assert.equal(added, 1);
  assert.deepEqual(updated[0].commits.map((c) => c.sha), ['aaaaaaa', 'bbbbbbb']);
  assert.equal(updated[1], tickets[1]);
});

test('attachCommits is idempotent', () => {
  const found = { 'MTV-001': [{ sha: 'aaaaaaa', subject: 'MTV-001: First' }] };
  const once = attachCommits([{ id: 'MTV-001', commits: [] }], found);
  assert.equal(attachCommits(once.tickets, found).added, 0);
});

const started = (status, extra = {}) => ({ id: 'MTV-001', status, priority: 'next', commits: [], ...extra });
const first = { 'MTV-001': [{ sha: 'aaaaaaa', subject: 'MTV-001: First' }] };

test('a new commit moves a ticket in idea or planned to in-progress', () => {
  for (const status of ['idea', 'planned']) {
    const { tickets, moved } = attachCommits([started(status)], first);
    assert.equal(tickets[0].status, 'in-progress');
    assert.deepEqual(moved, ['MTV-001']);
  }
});

test('tickets in progress or completed keep their status', () => {
  for (const status of ['in-progress', 'completed']) {
    const { tickets, moved } = attachCommits([started(status, { completed: '2026-10-01' })], first);
    assert.equal(tickets[0].status, status);
    assert.deepEqual(moved, []);
  }
});

test('a commit that is already attached moves nothing, so a ticket moved back by hand stays', () => {
  const known = started('planned', { commits: [{ sha: 'aaaaaaa', subject: 'MTV-001: First' }] });
  const { tickets, added, moved } = attachCommits([known], first);
  assert.equal(added, 0);
  assert.equal(tickets[0].status, 'planned');
  assert.deepEqual(moved, []);
});

test('the next new commit moves the ticket again', () => {
  const back = started('planned', { commits: [{ sha: 'aaaaaaa', subject: 'MTV-001: First' }] });
  const second = { 'MTV-001': [...first['MTV-001'], { sha: 'bbbbbbb', subject: 'MTV-001: Second' }] };
  assert.equal(attachCommits([back], second).tickets[0].status, 'in-progress');
});

test('tickets without new commits are not touched', () => {
  const idle = [started('planned'), { ...started('idea'), id: 'MTV-002' }];
  const { tickets, moved } = attachCommits(idle, first);
  assert.equal(tickets[1].status, 'idea');
  assert.deepEqual(moved, ['MTV-001']);
});
