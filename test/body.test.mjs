import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTicket, normalizeBody, patchTicket } from '../src/tickets.js';

test('normalizeBody writes list bullets with a dash', () => {
  assert.equal(normalizeBody('* one\n+ two\n- three'), '- one\n- two\n- three');
  assert.equal(normalizeBody('  * nested'), '  - nested');
});

test('normalizeBody leaves emphasis, numbers and text alone', () => {
  const text = '*emphasis* stays\n1. first\nplain * star\n**bold**';
  assert.equal(normalizeBody(text), text);
});

test('normalizeBody leaves fenced code blocks alone', () => {
  const text = '* before\n```\n* code\n```\n* after';
  assert.equal(normalizeBody(text), '- before\n```\n* code\n```\n- after');
});

test('tickets are stored with dash bullets', () => {
  const input = { project: 'MTV', title: 'Add form', type: 'feature', status: 'idea', priority: 'later', body: '## Acceptance criteria\n\n* One\n* Two' };
  const ticket = createTicket(input, [], ['MTV'], '2026-10-21');
  assert.equal(ticket.body, '## Acceptance criteria\n\n- One\n- Two');
  const patched = patchTicket(ticket, { body: '* Changed' }, ['MTV'], '2026-10-22');
  assert.equal(patched.body, '- Changed');
});
