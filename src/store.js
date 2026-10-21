import { HttpError } from './tickets.js';

const KEY = 'tickets.json';
const PROJECTS_KEY = 'projects.json';
const SYNC_KEY = 'commit-sync.json';
const BACKUP_PREFIX = 'backups/';
const BACKUPS_KEPT = 30;

async function load(env) {
  const object = await env.TICKETS.get(KEY);
  if (!object) return { etag: null, tickets: [] };
  const document = await object.json();
  return { etag: object.etag, tickets: document.tickets };
}

async function save(env, tickets, etag) {
  const body = JSON.stringify({ version: 1, updated: new Date().toISOString(), tickets });
  const written = await env.TICKETS.put(KEY, body, {
    httpMetadata: { contentType: 'application/json' },
    ...(etag ? { onlyIf: { etagMatches: etag } } : {}),
  });
  return written !== null;
}

export async function readTickets(env) {
  return (await load(env)).tickets;
}

// Applies `change` to the current tickets and stores the result. A conditional write guards against
// concurrent changes; the change is re-applied to the fresh data when somebody else wrote first.
export async function mutate(env, change) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { etag, tickets } = await load(env);
    const { tickets: updated, result } = change(tickets);
    if (await save(env, updated, etag)) return result;
  }
  throw new HttpError(409, 'The tickets were changed at the same time. Try again.');
}

// The list of projects (prefix, name, live URL, repository) is kept in its own object, like the tickets.
export async function readProjects(env) {
  const object = await env.TICKETS.get(PROJECTS_KEY);
  if (!object) throw new HttpError(500, `The storage has no ${PROJECTS_KEY}.`);
  return object.json();
}

// What the last commit collection did, per repository. Not part of the backups: it can be rebuilt.
export async function readSyncState(env) {
  const object = await env.TICKETS.get(SYNC_KEY);
  return object ? object.json() : {};
}

export async function writeSyncState(env, state) {
  await env.TICKETS.put(SYNC_KEY, JSON.stringify(state), { httpMetadata: { contentType: 'application/json' } });
}

async function copyObject(env, key, backupKey) {
  const source = await env.TICKETS.get(key);
  if (source) await env.TICKETS.put(backupKey, source.body, { httpMetadata: { contentType: 'application/json' } });
}

export async function backup(env) {
  const day = new Date().toISOString().slice(0, 10);
  await copyObject(env, KEY, `${BACKUP_PREFIX}${day}.json`);
  await copyObject(env, PROJECTS_KEY, `${BACKUP_PREFIX}${day}.projects.json`);

  const { objects } = await env.TICKETS.list({ prefix: BACKUP_PREFIX });
  const keys = objects.map((o) => o.key).sort();
  const isProjects = (key) => key.endsWith('.projects.json');
  const old = [
    ...keys.filter((key) => !isProjects(key)).slice(0, -BACKUPS_KEPT),
    ...keys.filter(isProjects).slice(0, -BACKUPS_KEPT),
  ];
  if (old.length) await env.TICKETS.delete(old);
}
