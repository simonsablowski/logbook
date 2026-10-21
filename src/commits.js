// Collects the commits of every project repository and attaches them to their tickets by the
// ticket ID at the start of the commit message ("MTV-014: Add footer form").

import { mutate, readProjects, readSyncState, readTickets, writeSyncState } from './store.js';

const INITIAL_SINCE = '2026-09-01T00:00:00Z';
// Commits are read again for this long, because a commit keeps its date when it is pushed later.
const OVERLAP_MS = 14 * 24 * 60 * 60 * 1000;
const PAGES_MAX = 5;

export const ticketIdOf = (message) => message.split('\n')[0].match(/^([A-Z]{3}-\d+):\s/)?.[1] ?? null;

// commits: the list GitHub returns for a repository, newest first. Only IDs with the project's prefix count.
// Returns the commits per ticket ID, oldest first.
export function ticketCommits(commits, prefix) {
  const found = {};
  for (const { sha, commit } of [...commits].reverse()) {
    const id = ticketIdOf(commit.message);
    if (!id || !id.startsWith(`${prefix}-`)) continue;
    (found[id] ??= []).push({ sha: sha.slice(0, 7), subject: commit.message.split('\n')[0] });
  }
  return found;
}

// Statuses that mean the work has not started. A new commit moves such a ticket to in-progress.
const NOT_STARTED = ['idea', 'planned'];

// Adds the commits a ticket does not have yet and starts the work on tickets that had not begun.
// Only a commit that is attached now moves a ticket, so a ticket that somebody moves back by hand
// stays where it is until the next new commit. Tickets that are in progress or completed keep
// their status, and no ticket is completed here.
// Returns the tickets, the number of added commits and the IDs of the tickets that were moved.
export function attachCommits(tickets, found) {
  let added = 0;
  const moved = [];
  const updated = tickets.map((ticket) => {
    const fresh = (found[ticket.id] || []).filter((c) => !ticket.commits.some((known) => known.sha === c.sha));
    if (!fresh.length) return ticket;
    added += fresh.length;
    const next = { ...ticket, commits: [...ticket.commits, ...fresh] };
    if (NOT_STARTED.includes(ticket.status)) {
      next.status = 'in-progress';
      moved.push(ticket.id);
    }
    return next;
  });
  return { tickets: updated, added, moved };
}

async function fetchCommits(repo, since, token) {
  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': 'logbook',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
  const commits = [];
  let url = `https://api.github.com/repos/${repo}/commits?since=${since}&per_page=100`;
  for (let page = 0; url && page < PAGES_MAX; page++) {
    const response = await fetch(url, { headers });
    if (response.status === 409) return commits; // empty repository
    if (!response.ok) {
      const detail = (await response.text()).replace(/\s+/g, ' ').slice(0, 160);
      const limited = response.headers.get('x-ratelimit-remaining') === '0' ? ' (rate limit used up)' : '';
      throw new Error(`GitHub answered ${response.status} for ${repo}${limited}: ${detail}`);
    }
    commits.push(...(await response.json()));
    url = response.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
  }
  return commits;
}

const isoSeconds = (time) => new Date(time).toISOString().replace(/\.\d+Z$/, 'Z');

export async function syncCommits(env) {
  const now = Date.now();
  const projects = await readProjects(env);
  const state = await readSyncState(env);
  const run = { time: new Date(now).toISOString(), added: 0, moved: [], repos: {} };
  const found = {};

  for (const project of projects) {
    const done = Boolean(state.repos?.[project.repo]?.done);
    try {
      const commits = await fetchCommits(project.repo, done ? isoSeconds(now - OVERLAP_MS) : INITIAL_SINCE, env.GITHUB_TOKEN);
      Object.assign(found, ticketCommits(commits, project.prefix));
      run.repos[project.repo] = { done: true, fetched: commits.length };
    } catch (error) {
      run.repos[project.repo] = { done, error: error.message };
    }
  }

  if (attachCommits(await readTickets(env), found).added) {
    const result = await mutate(env, (tickets) => {
      const { tickets: updated, added, moved } = attachCommits(tickets, found);
      return { tickets: updated, result: { added, moved } };
    });
    run.added = result.added;
    run.moved = result.moved;
  }
  await writeSyncState(env, run);
  return run;
}
