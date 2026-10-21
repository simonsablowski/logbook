import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authenticate, isPublicRead } from '../src/auth.js';

const request = (method, path = '/api/data', headers = {}) => new Request(`https://logbook.example${path}`, { method, headers });
const open = { PUBLIC_READ: '1' };
const configured = { ...open, ACCESS_TEAM_DOMAIN: 'https://team.example', ACCESS_AUD: 'aud' };

test('reading is public only when PUBLIC_READ is 1', () => {
  assert.equal(isPublicRead(request('GET'), open), true);
  assert.equal(isPublicRead(request('GET', '/'), open), true);
  assert.equal(isPublicRead(request('HEAD'), open), true);
  assert.equal(isPublicRead(request('GET'), {}), false);
  assert.equal(isPublicRead(request('GET'), { PUBLIC_READ: '0' }), false);
});

test('writing is never public', () => {
  for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
    assert.equal(isPublicRead(request(method), open), false);
  }
});

test('nothing under /api/tickets is public, not even reads', () => {
  assert.equal(isPublicRead(request('GET', '/api/tickets/session'), open), false);
  assert.equal(isPublicRead(request('GET', '/api/tickets/login'), open), false);
  assert.equal(isPublicRead(request('GET', '/api/tickets/LGB-001'), open), false);
});

test('public reads need no token', async () => {
  assert.deepEqual(await authenticate(request('GET'), open), { user: 'public' });
});

test('the session check needs a valid token even when reading is public', async () => {
  assert.equal((await authenticate(request('GET', '/api/tickets/session'), configured)).error.status, 401);
  assert.equal((await authenticate(request('GET', '/api/tickets/session'), open)).error.status, 503);
});

test('writes without a token are refused, and fail closed when Access is not configured', async () => {
  assert.equal((await authenticate(request('PATCH'), configured)).error.status, 401);
  assert.equal((await authenticate(request('PATCH'), open)).error.status, 503);
  assert.equal((await authenticate(request('PATCH', '/api/data', { 'Cf-Access-Jwt-Assertion': 'a.b.c' }), configured)).error.status, 401);
});

test('private mode refuses reads without a token', async () => {
  assert.equal((await authenticate(request('GET'), {})).error.status, 503);
});
