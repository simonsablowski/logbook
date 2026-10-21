import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authenticate, isPublicRead } from '../src/auth.js';

const request = (method, headers = {}) => new Request('https://logbook.example/api/data', { method, headers });
const open = { PUBLIC_READ: '1' };

test('reading is public only when PUBLIC_READ is 1', () => {
  assert.equal(isPublicRead(request('GET'), open), true);
  assert.equal(isPublicRead(request('HEAD'), open), true);
  assert.equal(isPublicRead(request('GET'), {}), false);
  assert.equal(isPublicRead(request('GET'), { PUBLIC_READ: '0' }), false);
});

test('writing is never public', () => {
  for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
    assert.equal(isPublicRead(request(method), open), false);
  }
});

test('public reads need no token', async () => {
  assert.deepEqual(await authenticate(request('GET'), open), { user: 'public' });
});

test('writes without a token are refused, and fail closed when Access is not configured', async () => {
  const configured = { ...open, ACCESS_TEAM_DOMAIN: 'https://team.example', ACCESS_AUD: 'aud' };
  assert.equal((await authenticate(request('PATCH'), configured)).error.status, 401);
  assert.equal((await authenticate(request('PATCH'), open)).error.status, 503);
  assert.equal((await authenticate(request('PATCH', { 'Cf-Access-Jwt-Assertion': 'a.b.c' }), configured)).error.status, 401);
});

test('private mode refuses reads without a token', async () => {
  assert.equal((await authenticate(request('GET'), {})).error.status, 503);
});
