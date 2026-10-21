// Nightly backups of the stored documents, and restoring them.
//
// A backup of a day consists of one copy per document: backups/2026-10-22.json (tickets),
// backups/2026-10-22.projects.json and backups/2026-10-22.settings.json. A document that does not
// exist yet (for example the settings before anybody changed them) is skipped.

import { KEY, PROJECTS_KEY, SETTINGS_KEY } from './store.js';
import { HttpError } from './tickets.js';

const BACKUP_PREFIX = 'backups/';
const SAFETY_PREFIX = 'safety/';
const CHECK_PREFIX = 'restore-check/';
const BACKUPS_KEPT = 30;
const JSON_TYPE = { httpMetadata: { contentType: 'application/json' } };

// name is the part of a backup key between the day and ".json".
const DOCUMENTS = [
  { name: 'tickets', key: KEY, suffix: '', items: (doc) => doc.tickets, id: (t) => t.id },
  { name: 'projects', key: PROJECTS_KEY, suffix: '.projects', items: (doc) => doc, id: (p) => p.prefix },
  { name: 'settings', key: SETTINGS_KEY, suffix: '.settings', items: null, id: null },
];

const backupKey = (day, document) => `${BACKUP_PREFIX}${day}${document.suffix}.json`;
const isDay = (day) => /^\d{4}-\d\d-\d\d$/.test(day);

async function copyObject(env, from, to) {
  const source = await env.TICKETS.get(from);
  if (!source) return false;
  await env.TICKETS.put(to, await source.arrayBuffer(), JSON_TYPE);
  return true;
}

export async function backup(env) {
  const day = new Date().toISOString().slice(0, 10);
  const copied = [];
  for (const document of DOCUMENTS) {
    if (await copyObject(env, document.key, backupKey(day, document))) copied.push(document.name);
  }

  const { objects } = await env.TICKETS.list({ prefix: BACKUP_PREFIX });
  const keys = objects.map((o) => o.key).sort();
  const old = DOCUMENTS.flatMap((document) =>
    keys.filter((key) => key.slice(BACKUP_PREFIX.length + 10) === `${document.suffix}.json`).slice(0, -BACKUPS_KEPT));
  if (old.length) await env.TICKETS.delete(old);
  return { day, documents: copied };
}

// The days that have a backup, newest first, with the documents each of them holds.
export async function listBackups(env) {
  const { objects } = await env.TICKETS.list({ prefix: BACKUP_PREFIX });
  const days = {};
  for (const { key } of objects) {
    const match = key.match(/^backups\/(\d{4}-\d\d-\d\d)(?:\.(projects|settings))?\.json$/);
    if (match) (days[match[1]] ??= []).push(match[2] || 'tickets');
  }
  return Object.keys(days).sort().reverse().map((day) => ({ day, documents: days[day].sort() }));
}

// Differences between two lists of records, matched by ID.
export function compareRecords(backedUp, live, id) {
  const liveById = new Map(live.map((item) => [id(item), item]));
  const backedUpIds = new Set(backedUp.map(id));
  const changed = backedUp.filter((item) => liveById.has(id(item)) && JSON.stringify(liveById.get(id(item))) !== JSON.stringify(item)).map(id);
  return {
    backedUp: backedUp.length,
    live: live.length,
    onlyInBackup: backedUp.filter((item) => !liveById.has(id(item))).map(id),
    onlyLive: live.filter((item) => !backedUpIds.has(id(item))).map(id),
    changed,
  };
}

async function readDocument(env, key) {
  const object = await env.TICKETS.get(key);
  return object ? object.json() : null;
}

async function requireBackup(env, day) {
  if (!isDay(day)) throw new HttpError(400, 'The backup is named by its day, like 2026-10-22.');
  const present = (await listBackups(env)).find((b) => b.day === day);
  if (!present) throw new HttpError(404, `There is no backup of ${day}.`);
  return present;
}

// Restores a backup into a temporary place, reads it back, compares it with the backup and with the
// live data, and removes it again. Nothing live is touched.
export async function verifyBackup(env, day) {
  const present = await requireBackup(env, day);
  const place = `${CHECK_PREFIX}${day}/`;
  const report = { day, documents: {} };
  try {
    for (const document of DOCUMENTS.filter((d) => present.documents.includes(d.name))) {
      await copyObject(env, backupKey(day, document), place + document.key);
      const restored = await readDocument(env, place + document.key);
      const original = await readDocument(env, backupKey(day, document));
      const live = await readDocument(env, document.key);
      const entry = { restoredEqualsBackup: JSON.stringify(restored) === JSON.stringify(original) };
      if (document.items && live) Object.assign(entry, compareRecords(document.items(restored), document.items(live), document.id));
      else entry.liveExists = Boolean(live);
      report.documents[document.name] = entry;
    }
  } finally {
    const { objects } = await env.TICKETS.list({ prefix: place });
    if (objects.length) await env.TICKETS.delete(objects.map((o) => o.key));
  }
  report.ok = Object.values(report.documents).every((d) => d.restoredEqualsBackup);
  return report;
}

// Replaces the live documents with the ones of a backup. Refuses unless `confirm` repeats the day, and
// keeps a copy of the live documents under safety/ first so that the restore can be undone.
export async function restoreBackup(env, day, confirm) {
  const present = await requireBackup(env, day);
  if (confirm !== day) {
    throw new HttpError(400, `Restoring ${day} replaces the live data. Repeat the day as confirmation to go on.`);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const documents = DOCUMENTS.filter((d) => present.documents.includes(d.name));
  for (const document of documents) await copyObject(env, document.key, `${SAFETY_PREFIX}${stamp}/${document.key}`);
  for (const document of documents) await copyObject(env, backupKey(day, document), document.key);
  return { day, restored: documents.map((d) => d.name), safetyCopy: `${SAFETY_PREFIX}${stamp}/` };
}
