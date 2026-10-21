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
