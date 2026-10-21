import { authenticate } from './auth.js';
import { backup, mutate, readProjects, readTickets } from './store.js';
import { HttpError, createTicket, patchTicket } from './tickets.js';

const readPrefixes = async (env) => (await readProjects(env)).map((p) => p.prefix);
const today = () => new Date().toISOString().slice(0, 10);

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
    const [projects, tickets] = await Promise.all([readProjects(env), readTickets(env)]);
    tickets.sort((a, b) => a.id.localeCompare(b.id));
    return reply({ projects, tickets, generated: new Date().toISOString(), user: auth.user });
  }

  // The viewer asks who is signed in to decide whether to offer editing.
  if (pathname === '/api/tickets/session' && method === 'GET') return reply({ user: auth.user });

  // Opening this address makes Access ask for a sign-in, then returns to the viewer.
  if (pathname === '/api/tickets/login' && method === 'GET') {
    const next = url.searchParams.get('next') || '';
    return Response.redirect(new URL(`/${next.startsWith('#') ? next : ''}`, url).href, 302);
  }

  if (pathname === '/api/tickets' && method === 'POST') {
    const input = await readJson(request);
    const prefixes = await readPrefixes(env);
    return reply(await mutate(env, (tickets) => {
      const ticket = createTicket(input, tickets, prefixes, today());
      return { tickets: [...tickets, ticket], result: ticket };
    }), 201);
  }

  if (ticketId && method === 'PATCH') {
    const patch = await readJson(request);
    const prefixes = await readPrefixes(env);
    return reply(await mutate(env, (tickets) => {
      const index = tickets.findIndex((t) => t.id === ticketId);
      if (index < 0) throw new HttpError(404, `No ticket ${ticketId}`);
      const ticket = patchTicket(tickets[index], patch, prefixes, today());
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

  async scheduled(event, env, ctx) {
    ctx.waitUntil(backup(env));
  },
};
