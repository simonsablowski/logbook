import { DEFAULT_SETTINGS } from './settings.js';
import { HttpError } from './tickets.js';

export const KEY = 'tickets.json';
export const PROJECTS_KEY = 'projects.json';
export const SETTINGS_KEY = 'settings.json';
const SYNC_KEY = 'commit-sync.json';

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

// Same conditional write as for the tickets: the change is applied again when somebody else wrote first.
export async function mutateProjects(env, change) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const object = await env.TICKETS.get(PROJECTS_KEY);
    if (!object) throw new HttpError(500, `The storage has no ${PROJECTS_KEY}.`);
    const { projects, result } = change(await object.json());
    const written = await env.TICKETS.put(PROJECTS_KEY, JSON.stringify(projects, null, 2), {
      httpMetadata: { contentType: 'application/json' },
      onlyIf: { etagMatches: object.etag },
    });
    if (written !== null) return result;
  }
  throw new HttpError(409, 'The projects were changed at the same time. Try again.');
}

// A bucket without settings.json uses the defaults until somebody changes a setting.
export async function readSettings(env) {
  const object = await env.TICKETS.get(SETTINGS_KEY);
  return object ? object.json() : structuredClone(DEFAULT_SETTINGS);
}

export async function mutateSettings(env, change) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const object = await env.TICKETS.get(SETTINGS_KEY);
    const { settings, result } = change(object ? await object.json() : structuredClone(DEFAULT_SETTINGS));
    const written = await env.TICKETS.put(SETTINGS_KEY, JSON.stringify(settings, null, 2), {
      httpMetadata: { contentType: 'application/json' },
      ...(object ? { onlyIf: { etagMatches: object.etag } } : { onlyIf: { etagDoesNotMatch: '*' } }),
    });
    if (written !== null) return result;
  }
  throw new HttpError(409, 'The settings were changed at the same time. Try again.');
}

// Changes whenever one of the documents is written: the ETags of the documents, joined. Viewers ask for it
// to find out whether they need to load the data again.
export async function readVersion(env) {
  const heads = await Promise.all([KEY, PROJECTS_KEY, SETTINGS_KEY].map((key) => env.TICKETS.head(key)));
  return heads.map((head) => head?.etag ?? '-').join('.');
}
