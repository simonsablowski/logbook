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

// Adds the commits a ticket does not have yet. Returns the tickets and the number of added commits.
export function attachCommits(tickets, found) {
  let added = 0;
  const updated = tickets.map((ticket) => {
    const fresh = (found[ticket.id] || []).filter((c) => !ticket.commits.some((known) => known.sha === c.sha));
    if (!fresh.length) return ticket;
    added += fresh.length;
    return { ...ticket, commits: [...ticket.commits, ...fresh] };
  });
  return { tickets: updated, added };
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
    if (!response.ok) throw new Error(`GitHub answered ${response.status} for ${repo}`);
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
  const run = { time: new Date(now).toISOString(), added: 0, repos: {} };
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
    run.added = await mutate(env, (tickets) => {
      const { tickets: updated, added } = attachCommits(tickets, found);
      return { tickets: updated, result: added };
    });
  }
  await writeSyncState(env, run);
  return run;
}
