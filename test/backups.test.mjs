import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backup, compareRecords, listBackups, restoreBackup, verifyBackup } from '../src/backups.js';

// Just enough of an R2 bucket for the backup code.
function bucket(initial = {}) {
  const files = new Map(Object.entries(initial));
  const object = (value) => ({
    json: async () => JSON.parse(value),
    arrayBuffer: async () => new TextEncoder().encode(value).buffer,
  });
  return {
    files,
    get: async (key) => (files.has(key) ? object(files.get(key)) : null),
    put: async (key, value) => {
      files.set(key, typeof value === 'string' ? value : new TextDecoder().decode(value));
      return {};
    },
    list: async ({ prefix }) => ({ objects: [...files.keys()].filter((k) => k.startsWith(prefix)).sort().map((key) => ({ key })) }),
    delete: async (keys) => [].concat(keys).forEach((key) => files.delete(key)),
  };
}

const doc = (tickets) => JSON.stringify({ version: 1, updated: 'x', tickets });
const projects = (...prefixes) => JSON.stringify(prefixes.map((prefix) => ({ prefix, name: prefix })));
const today = new Date().toISOString().slice(0, 10);

function live() {
  return bucket({
    'tickets.json': doc([{ id: 'MTV-001', title: 'One' }, { id: 'MTV-002', title: 'Two' }]),
    'projects.json': projects('MTV', 'IKS'),
  });
}

test('backup copies the documents that exist and lists them', async () => {
  const env = { TICKETS: live() };
  const made = await backup(env);
  assert.deepEqual(made.documents, ['tickets', 'projects']);
  assert.deepEqual(await listBackups(env), [{ day: today, documents: ['projects', 'tickets'] }]);
});

test('backup keeps the last 30 days of each kind', async () => {
  const files = { 'tickets.json': doc([]), 'projects.json': projects('MTV') };
  for (let day = 1; day <= 31; day++) {
    const name = `2026-09-${String(day).padStart(2, '0')}`;
    files[`backups/${name}.json`] = doc([]);
    files[`backups/${name}.projects.json`] = projects('MTV');
  }
  const env = { TICKETS: bucket(files) };
  await backup(env);
  const days = await listBackups(env);
  assert.equal(days.length, 30);
  assert.ok(!days.some((d) => d.day === '2026-09-01'));
  assert.ok(days.every((d) => d.documents.length === 2 || d.day === today));
});

test('compareRecords reports records only in one side and changed ones', () => {
  const id = (item) => item.id;
  const report = compareRecords(
    [{ id: 'A', n: 1 }, { id: 'B', n: 1 }, { id: 'C', n: 1 }],
    [{ id: 'A', n: 1 }, { id: 'B', n: 2 }, { id: 'D', n: 1 }],
    id,
  );
  assert.deepEqual(report, { backedUp: 3, live: 3, onlyInBackup: ['C'], onlyLive: ['D'], changed: ['B'] });
});

test('verify restores into a temporary place, compares with the live data and cleans up', async () => {
  const env = { TICKETS: live() };
  await backup(env);
  env.TICKETS.files.set('tickets.json', doc([{ id: 'MTV-001', title: 'One changed' }, { id: 'MTV-003', title: 'Three' }]));
  const before = new Map(env.TICKETS.files);

  const report = await verifyBackup(env, today);
  assert.equal(report.ok, true);
  assert.deepEqual(report.documents.tickets.onlyInBackup, ['MTV-002']);
  assert.deepEqual(report.documents.tickets.onlyLive, ['MTV-003']);
  assert.deepEqual(report.documents.tickets.changed, ['MTV-001']);
  assert.deepEqual(report.documents.projects.onlyInBackup, []);
  assert.deepEqual([...env.TICKETS.files], [...before], 'nothing is left behind and nothing live changed');
});

test('restore refuses without the day as confirmation', async () => {
  const env = { TICKETS: live() };
  await backup(env);
  env.TICKETS.files.set('tickets.json', doc([]));
  for (const confirm of [undefined, true, '2020-01-01']) {
    await assert.rejects(restoreBackup(env, today, confirm), { status: 400 });
  }
  assert.equal(JSON.parse(env.TICKETS.files.get('tickets.json')).tickets.length, 0);
});

test('restore replaces the live data and keeps a safety copy of what it replaced', async () => {
  const env = { TICKETS: live() };
  await backup(env);
  env.TICKETS.files.set('tickets.json', doc([{ id: 'MTV-009', title: 'New' }]));

  const done = await restoreBackup(env, today, today);
  assert.deepEqual(done.restored, ['tickets', 'projects']);
  assert.deepEqual(JSON.parse(env.TICKETS.files.get('tickets.json')).tickets.map((t) => t.id), ['MTV-001', 'MTV-002']);
  const safety = JSON.parse(env.TICKETS.files.get(`${done.safetyCopy}tickets.json`));
  assert.deepEqual(safety.tickets.map((t) => t.id), ['MTV-009']);
});

test('unknown or malformed days are rejected', async () => {
  const env = { TICKETS: live() };
  await assert.rejects(verifyBackup(env, '2020-01-01'), { status: 404 });
  await assert.rejects(restoreBackup(env, '../tickets', '../tickets'), { status: 400 });
});
