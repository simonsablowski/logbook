# Logbook

A lightweight ticket system for a set of projects: pending changes and ideas, prioritised, plus the history of what was implemented and in which commits.

Tickets and projects are **not** stored in this repository. They live in a private Cloudflare R2 bucket and are served by a Cloudflare Worker behind Cloudflare Access. This repository contains only code.

## Projects

The list of projects is stored in the bucket as `projects.json`, like the tickets: for each project a three-letter prefix, the name, the URL of the live site and the repository. Read it with `GET /api/data`. The order of the list is the order of the Projects tab and of the project filter; it is set by drag and drop in the Projects tab and stored in the bucket. Name, live site and repository can be edited there and new projects can be added; the prefix is chosen once when a project is added (the viewer suggests the first three consonants of the name and checks that it is free) and can never be changed, because it is part of every ticket ID and of the commit messages in the repositories. A ticket ID is the prefix of its project and a number, for example `MTV-014`. Every project must have a GitHub repository.

## Architecture

```text
public/    viewer (HTML, CSS, JavaScript), served by the Worker
src/       Worker: Access check, ticket API, R2 storage, nightly backup and restore
scripts/   lb.mjs (command line client), commit-msg (Git hook)
docs/      redirect page for logbook.simsab.net (GitHub Pages)
test/      unit tests (npm test)
```

- **Storage:** two JSON documents in the R2 bucket `logbook-tickets`: `tickets.json` and `projects.json`. Writes are conditional on the document's ETag, so concurrent changes cannot overwrite each other. A scheduled run copies the documents to `backups/` every night (`<date>.json`, `<date>.projects.json` and, once it exists, `<date>.settings.json`) and keeps the last 30 of each. See Backups below for restoring.
- **Commits:** every hour the Worker reads the new commits of all project repositories through the GitHub API and attaches each commit whose message starts with a ticket ID (`MTV-014: ...`) to that ticket. Only IDs with the prefix of the repository's project count, known commits are skipped. A newly attached commit moves a ticket in Idea or Planned to In progress, even when the WIP limit is exceeded; tickets in In progress or Completed keep their status, and no ticket is ever completed by itself. The repositories are public, so no login is needed; if GitHub starts refusing requests because of its rate limit, store a token without any permissions with `npx wrangler secret put GITHUB_TOKEN`. `POST /api/tickets/sync` runs the collection right away and `GET /api/tickets/sync` shows the result of the last run (both need Access).
- **Access:** every request except a public read must carry a valid Cloudflare Access token for the configured team domain and audience (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` in `wrangler.jsonc`). Without that configuration the Worker refuses such requests with 503. Browsers sign in through Access; command line clients use an Access service token. See [Access mode](#access-mode).
- **Address:** https://logbook.empty-shape-d969.workers.dev. The DNS of simsab.net is not on Cloudflare, so `logbook.simsab.net` is a GitHub Pages site that redirects there.

## Access mode

`PUBLIC_READ` in `wrangler.jsonc` decides who may view the Logbook. Changing tickets always requires Access.

| `PUBLIC_READ` | Viewing | Cloudflare Access application |
|---|---|---|
| `"1"` (public) | everybody | destination limited to the path `api/tickets` |
| `"0"` (private) | only people allowed by Access | destination is the whole hostname (empty path) |

To switch, change both: the variable (then `npm run deploy`) and the destination of the Access application in Zero Trust. If they do not match, the Worker stays closed rather than open: with `"0"` and a path-limited application, reads have no Access token and are refused.

## Tickets

Fields: `id` (`<PREFIX>-<number>`), `project`, `title`, `type` (feature, change, content, bug, chore, docs, idea), `status` (idea, planned, in-progress, completed), `priority` (now, next, later; not needed once completed), `effort` (S, M, L), `created`, `completed`, `body` (Markdown with `## Summary` and optional `## Motivation`), `commits` (list of `{ sha, subject }`), `origin`, `verified`.

Ticket text is Markdown: `## Section` headings, paragraphs, bullet lists and numbered lists, for example a `## Acceptance criteria` section. Write bullets with `-`; bullets written with `*` or `+` are converted to `-` when a ticket is saved.

The server assigns `id`, `created` and `origin` and stamps `completed` when a ticket becomes completed. Empty sections and fields are hidden in the viewer.

## Command line client

```bash
export CF_ACCESS_CLIENT_ID=...        # Access service token
export CF_ACCESS_CLIENT_SECRET=...
node scripts/lb.mjs list --status planned
node scripts/lb.mjs add --project MTV --title "Add footer form" --type feature --status planned --priority next --effort S
node scripts/lb.mjs set MTV-014 status=in-progress
node scripts/lb.mjs rm MTV-014
```

`LOGBOOK_URL` overrides the address. Creating or changing a ticket never creates a commit.

## Backups

All commands need the Access service token, like the rest of the command line client.

```bash
node scripts/lb.mjs backups                                   # days that have a backup
node scripts/lb.mjs backup                                    # create today's backup now
node scripts/lb.mjs verify 2026-10-22                         # restore into a temporary place and compare
node scripts/lb.mjs restore 2026-10-22 --confirm 2026-10-22   # replace the live data
```

1. Run `backups` and choose a day.
2. Run `verify DAY`. It restores the backup into a temporary place in the bucket (`restore-check/`), reads it back, checks that it is identical to the backup, lists how many tickets and projects differ from the live data (only in the backup, only live, changed), and removes the temporary copy. Nothing live is touched. Run it now and then to prove that the backups can be restored.
3. Run `restore DAY --confirm DAY` to replace the live documents. Without the day repeated as confirmation the command refuses. Before it overwrites anything it copies the live documents to `safety/<time>/`, so a wrong restore can be undone by copying them back in the Cloudflare dashboard.

The same operations are available as `GET|POST /api/tickets/backups`, `POST /api/tickets/backups/:day/verify` and `POST /api/tickets/backups/:day/restore` with `{ "confirm": "<day>" }`.

## Conventions

- Everything in this repository is English: ticket text, UI and commit messages.
- Titles and summaries of tickets are written in the imperative mood, like commit messages ("Add footer form", not "Added" or "Adds"), and stay that way after a ticket is completed.
- Write tickets so that they are understandable without the conversation they came from: no references to chats or screenshots; describe images in words and give values such as colours as hex codes.
- The repository is public. Keep credentials and personal data out of the code.
- Every commit in a project repository starts with the ticket ID: `MTV-014: Add newsletter signup form to footer`. Install the check with `cp scripts/commit-msg <project>/.git/hooks/commit-msg`.
- Commits to this repository concern code only.
- Board limits (work in progress): planned max. 6, in-progress max. 2, counted across all projects; ideas and completed are unlimited. The limits are `WIP_LIMITS` in `public/app.js`.

## Development

```bash
npm install
npm test          # unit tests
npm run dev       # local Worker; .dev.vars with ACCESS_BYPASS=1 skips the Access check locally
npm run deploy    # deploy the Worker
```

`.dev.vars` is not committed. Never set `ACCESS_BYPASS` in `wrangler.jsonc`.
