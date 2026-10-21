#!/usr/bin/env node
// Command line client for the Logbook ticket API.
//
//   node scripts/lb.mjs list [--project MTV] [--status planned] [--priority now]
//   node scripts/lb.mjs show MTV-014
//   node scripts/lb.mjs add --project MTV --title "..." --type feature [--status planned] [--priority next] [--effort S] [--body "..."]
//   node scripts/lb.mjs set MTV-014 status=in-progress priority=now
//   node scripts/lb.mjs rm MTV-014
//   node scripts/lb.mjs backups                          list the days that have a backup
//   node scripts/lb.mjs backup                           create today's backup now
//   node scripts/lb.mjs verify 2026-10-22                restore into a temporary place and compare with the live data
//   node scripts/lb.mjs restore 2026-10-22 --confirm 2026-10-22   replace the live data with the backup
//
// Environment:
//   LOGBOOK_URL              defaults to the workers.dev address of the Worker
//   CF_ACCESS_CLIENT_ID      Cloudflare Access service token
//   CF_ACCESS_CLIENT_SECRET

const BASE_URL = process.env.LOGBOOK_URL || 'https://logbook.empty-shape-d969.workers.dev';
const CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID || '';
const CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET || '';

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

async function api(method, path, body) {
  if (!CLIENT_ID || !CLIENT_SECRET) fail('Set CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET to an Access service token.');
  const response = await fetch(new URL(path, BASE_URL), {
    method,
    redirect: 'manual',
    headers: {
      'CF-Access-Client-Id': CLIENT_ID,
      'CF-Access-Client-Secret': CLIENT_SECRET,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status >= 300 && response.status < 400) fail('Access redirected to the login page. Check the service token and its Service Auth policy.');
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) fail(`${response.status}: ${data.error || response.statusText}`);
  return data;
}

function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i].startsWith('--') || i + 1 >= args.length) fail(`Expected --name value, got ${args[i]}`);
    flags[args[i].slice(2)] = args[i + 1];
  }
  return flags;
}

const line = (t) => [t.id, t.status.padEnd(11), (t.priority || '-').padEnd(5), (t.effort || '-').padEnd(1), t.title].join('  ');

const [command, ...args] = process.argv.slice(2);

if (command === 'list') {
  const flags = parseFlags(args);
  const { tickets } = await api('GET', '/api/data');
  tickets
    .filter((t) => (!flags.project || t.project === flags.project) && (!flags.status || t.status === flags.status) && (!flags.priority || t.priority === flags.priority))
    .forEach((t) => console.log(line(t)));
} else if (command === 'show') {
  const { tickets } = await api('GET', '/api/data');
  const ticket = tickets.find((t) => t.id === args[0]);
  if (!ticket) fail(`No ticket ${args[0]}`);
  console.log(JSON.stringify(ticket, null, 2));
} else if (command === 'add') {
  const ticket = await api('POST', '/api/tickets', parseFlags(args));
  console.log(line(ticket));
} else if (command === 'set') {
  const [id, ...pairs] = args;
  if (!id || !pairs.length) fail('Usage: set ID key=value ...');
  const patch = Object.fromEntries(pairs.map((pair) => {
    const [key, ...value] = pair.split('=');
    const text = value.join('=');
    return [key, text === 'null' ? null : text === 'true' ? true : text === 'false' ? false : text];
  }));
  console.log(line(await api('PATCH', `/api/tickets/${id}`, patch)));
} else if (command === 'backups') {
  (await api('GET', '/api/tickets/backups')).forEach((b) => console.log(`${b.day}  ${b.documents.join(', ')}`));
} else if (command === 'backup') {
  const made = await api('POST', '/api/tickets/backups');
  console.log(`Backed up ${made.documents.join(', ')} as ${made.day}`);
} else if (command === 'verify') {
  if (!args[0]) fail('Usage: verify DAY');
  const report = await api('POST', `/api/tickets/backups/${args[0]}/verify`);
  for (const [name, d] of Object.entries(report.documents)) {
    const diff = d.backedUp === undefined ? '' : `  backup ${d.backedUp}, live ${d.live}, only in backup ${d.onlyInBackup.length}, only live ${d.onlyLive.length}, changed ${d.changed.length}`;
    console.log(`${name.padEnd(9)} restored ${d.restoredEqualsBackup ? 'identical to the backup' : 'DIFFERENT FROM THE BACKUP'}${diff}`);
  }
  if (!report.ok) process.exit(1);
} else if (command === 'restore') {
  const [day, flag, confirm] = args;
  if (!day) fail('Usage: restore DAY --confirm DAY   (replaces the live data)');
  const body = { confirm: flag === '--confirm' ? confirm : undefined };
  const done = await api('POST', `/api/tickets/backups/${day}/restore`, body);
  console.log(`Restored ${done.restored.join(', ')} from ${done.day}. The data before is kept in ${done.safetyCopy}`);
} else if (command === 'rm') {
  await api('DELETE', `/api/tickets/${args[0]}`);
  console.log(`Removed ${args[0]}`);
} else {
  fail('Commands: list, show, add, set, rm (see the comment at the top of this file).');
}
