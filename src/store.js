import { HttpError } from './tickets.js';

const KEY = 'tickets.json';
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

export async function backup(env) {
  const source = await env.TICKETS.get(KEY);
  if (!source) return;
  const day = new Date().toISOString().slice(0, 10);
  await env.TICKETS.put(`${BACKUP_PREFIX}${day}.json`, source.body, { httpMetadata: { contentType: 'application/json' } });

  const { objects } = await env.TICKETS.list({ prefix: BACKUP_PREFIX });
  const old = objects.map((o) => o.key).sort().slice(0, -BACKUPS_KEPT);
  if (old.length) await env.TICKETS.delete(old);
}
