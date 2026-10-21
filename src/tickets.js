import { validateTicket } from './validate.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Fields a client may set. Everything else (id, project, created, origin) is fixed by the server.
const EDITABLE = ['title', 'type', 'status', 'priority', 'effort', 'body', 'completed', 'verified', 'commits'];

export function nextId(tickets, project) {
  const numbers = tickets
    .filter((t) => t.project === project)
    .map((t) => Number(t.id.slice(4)))
    .filter(Number.isFinite);
  return `${project}-${String(Math.max(0, ...numbers) + 1).padStart(3, '0')}`;
}

// List bullets are written with "-", never "*" or "+", so that every ticket looks the same.
// Lines inside fenced code blocks stay untouched.
export function normalizeBody(body) {
  let fenced = false;
  return body
    .split('\n')
    .map((line) => {
      if (/^\s*```/.test(line)) fenced = !fenced;
      return fenced ? line : line.replace(/^(\s*)[*+](\s+)/, '$1-$2');
    })
    .join('\n');
}

function check(ticket, prefixes) {
  if (typeof ticket.body === 'string') ticket.body = normalizeBody(ticket.body);
  const errors = validateTicket(ticket, prefixes);
  if (errors.length) throw new HttpError(400, errors.join('; '));
  return ticket;
}

export function createTicket(input, tickets, prefixes, today) {
  if (!prefixes.includes(input.project)) throw new HttpError(400, `unknown project ${input.project}`);
  const ticket = {
    id: nextId(tickets, input.project),
    project: input.project,
    status: 'idea',
    effort: null,
    completed: null,
    body: '',
    commits: [],
    ...Object.fromEntries(EDITABLE.filter((k) => k in input).map((k) => [k, input[k]])),
    created: today,
    origin: 'live',
    verified: true,
  };
  if (ticket.status === 'completed' && !ticket.completed) ticket.completed = today;
  return check(ticket, prefixes);
}

export function patchTicket(ticket, patch, prefixes, today) {
  const next = { ...ticket, ...Object.fromEntries(EDITABLE.filter((k) => k in patch).map((k) => [k, patch[k]])) };
  if (next.status === 'completed' && !next.completed) next.completed = today;
  if (next.status !== 'completed' && ticket.status === 'completed' && !('completed' in patch)) next.completed = null;
  return check(next, prefixes);
}
