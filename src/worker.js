import { authenticate } from './auth.js';
import { backup, listBackups, restoreBackup, verifyBackup } from './backups.js';
import { syncCommits } from './commits.js';
import { COLOURS, createProject, patchProject, reorderProjects } from './projects.js';
import { patchSettings } from './settings.js';
import { mutate, mutateProjects, mutateSettings, readProjects, readSettings, readSyncState, readTickets, readVersion } from './store.js';
import { HttpError, createTicket, patchTicket } from './tickets.js';

const BACKUP_CRON = '0 3 * * *';

const readPrefixes = async (env) => (await readProjects(env)).map((p) => p.prefix);
const now = () => new Date().toISOString();

const reply = (body, status = 200) =>
  new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

async function readJson(request) {
  if (!(request.headers.get('content-type') || '').startsWith('application/json')) {
    throw new HttpError(415, 'Send the body as application/json.');
  }
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'The body is not valid JSON.');
  }
}

async function handleApi(request, env, url, auth) {
  const { pathname } = url;
  const method = request.method;
  const ticketId = pathname.match(/^\/api\/tickets\/([A-Z]{3}-\d+)$/)?.[1];

  if (pathname === '/api/data' && method === 'GET') {
    const [projects, tickets, settings, version] = await Promise.all([readProjects(env), readTickets(env), readSettings(env), readVersion(env)]);
    tickets.sort((a, b) => a.id.localeCompare(b.id));
    return reply({ projects, colours: COLOURS, settings, version, tickets, generated: new Date().toISOString(), user: auth.user });
  }

  // Everything that changes data lives under /api/tickets, the path Cloudflare Access protects.
  if (pathname === '/api/tickets/projects' && method === 'POST') {
    const input = await readJson(request);
    return reply(await mutateProjects(env, (projects) => {
      const project = createProject(projects, input);
      return { projects: [...projects, project], result: project };
    }), 201);
  }

  if (pathname === '/api/tickets/projects/order' && method === 'PUT') {
    const { order } = await readJson(request);
    return reply(await mutateProjects(env, (projects) => {
      const reordered = reorderProjects(projects, order);
      return { projects: reordered, result: reordered.map((p) => p.prefix) };
    }));
  }

  const projectPrefix = pathname.match(/^\/api\/tickets\/projects\/([A-Z]{3})$/)?.[1];
  if (projectPrefix && method === 'PATCH') {
    const patch = await readJson(request);
    return reply(await mutateProjects(env, (projects) => {
      const index = projects.findIndex((p) => p.prefix === projectPrefix);
      if (index < 0) throw new HttpError(404, `No project ${projectPrefix}`);
      const project = patchProject(projects[index], patch, projects);
      return { projects: projects.with(index, project), result: project };
    }));
  }

  // The viewer asks who is signed in to decide whether to offer editing.
  if (pathname === '/api/tickets/session' && method === 'GET') return reply({ user: auth.user });

  if (pathname === '/api/version' && method === 'GET') return reply({ version: await readVersion(env) });

  // Opening this address makes Access ask for a sign-in, then returns to the viewer.
  if (pathname === '/api/tickets/login' && method === 'GET') {
    const next = url.searchParams.get('next') || '';
    return Response.redirect(new URL(`/${next.startsWith('#') ? next : ''}`, url).href, 302);
  }

  if (pathname === '/api/tickets/settings' && method === 'PATCH') {
    const patch = await readJson(request);
    return reply(await mutateSettings(env, (settings) => {
      const updated = patchSettings(settings, patch);
      return { settings: updated, result: updated };
    }));
  }

  if (pathname === '/api/tickets/backups' && method === 'GET') return reply(await listBackups(env));
  if (pathname === '/api/tickets/backups' && method === 'POST') return reply(await backup(env), 201);
  const backupDay = pathname.match(/^\/api\/tickets\/backups\/([^/]+)\/(verify|restore)$/);
  if (backupDay && backupDay[2] === 'verify' && method === 'POST') return reply(await verifyBackup(env, backupDay[1]));
  if (backupDay && backupDay[2] === 'restore' && method === 'POST') {
    const { confirm } = await readJson(request);
    return reply(await restoreBackup(env, backupDay[1], confirm));
  }

  // The commit collection runs every hour; this shows its last result or runs it right away.
  if (pathname === '/api/tickets/sync' && method === 'GET') return reply(await readSyncState(env));
  if (pathname === '/api/tickets/sync' && method === 'POST') return reply(await syncCommits(env));

  if (pathname === '/api/tickets' && method === 'POST') {
    const input = await readJson(request);
    const prefixes = await readPrefixes(env);
    return reply(await mutate(env, (tickets) => {
      const ticket = createTicket(input, tickets, prefixes, now());
      return { tickets: [...tickets, ticket], result: ticket };
    }), 201);
  }

  if (ticketId && method === 'PATCH') {
    const patch = await readJson(request);
    const prefixes = await readPrefixes(env);
    return reply(await mutate(env, (tickets) => {
      const index = tickets.findIndex((t) => t.id === ticketId);
      if (index < 0) throw new HttpError(404, `No ticket ${ticketId}`);
      const ticket = patchTicket(tickets[index], patch, prefixes, now());
      return { tickets: tickets.with(index, ticket), result: ticket };
    }));
  }

  if (ticketId && method === 'DELETE') {
    await mutate(env, (tickets) => {
      if (!tickets.some((t) => t.id === ticketId)) throw new HttpError(404, `No ticket ${ticketId}`);
      return { tickets: tickets.filter((t) => t.id !== ticketId), result: null };
    });
    return reply(null, 204);
  }

  throw new HttpError(404, 'Not found');
}

export default {
  async fetch(request, env) {
    const auth = await authenticate(request, env);
    if (auth.error) return new Response(auth.error.message, { status: auth.error.status });

    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    try {
      return await handleApi(request, env, url, auth);
    } catch (error) {
      if (error instanceof HttpError) return reply({ error: error.message }, error.status);
      console.error(error);
      return reply({ error: 'Internal error' }, 500);
    }
  },

  // Two schedules in wrangler.jsonc: the nightly backup and the hourly commit collection.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(event.cron === BACKUP_CRON ? backup(env) : syncCommits(env));
  },
};
