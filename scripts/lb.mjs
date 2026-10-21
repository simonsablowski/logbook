#!/usr/bin/env node
// Command line client for the Logbook ticket API.
//
//   node scripts/lb.mjs list [--project MTV] [--status planned] [--priority now]
//   node scripts/lb.mjs show MTV-014
//   node scripts/lb.mjs add --project MTV --title "..." --type feature [--status planned] [--priority next] [--effort S] [--body "..."]
//   node scripts/lb.mjs set MTV-014 status=in-progress priority=now
//   node scripts/lb.mjs rm MTV-014
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
} else if (command === 'rm') {
  await api('DELETE', `/api/tickets/${args[0]}`);
  console.log(`Removed ${args[0]}`);
} else {
  fail('Commands: list, show, add, set, rm (see the comment at the top of this file).');
}
