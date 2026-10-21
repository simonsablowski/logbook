# Logbook

A lightweight ticket system for the projects below: pending changes and ideas, prioritised, plus the history of what was implemented and in which commits.

Tickets are **not** stored in this repository. They live in a private Cloudflare R2 bucket and are served by a Cloudflare Worker behind Cloudflare Access. This repository contains only code.

## Projects

| Prefix | Project | Repository |
|---|---|---|
| CRS | courses.simsab.net | `simonsablowski/simsab-courses` |
| RSR | resources.simsab.net | `simonsablowski/simsab-resources` |
| MTV | motivado.com | `simonsablowski/motivado` |
| SIM | simsab.net | `simonsablowski/simsab` |
| IKS | shop.inkarnatoons.com | `simonsablowski/inkarnatoons-shop` |
| DBP | dbp12.simsab.net | `simonsablowski/dbp12` |
| NOR | norahammer.com | `simonsablowski/norahammer` |
| NMB | notmybiz.com | `simonsablowski/notmybiz-lp` |
| BEU | beatemup.simsab.net | `simonsablowski/beatemup` |
| LGB | logbook | `simonsablowski/logbook` |

The registry lives in `projects.json`. Every project must have a GitHub repository.

## Architecture

```text
public/    viewer (HTML, CSS, JavaScript), served by the Worker
src/       Worker: Access check, ticket API, R2 storage, nightly backup
scripts/   lb.mjs (command line client), commit-msg (Git hook)
docs/      redirect page for logbook.simsab.net (GitHub Pages)
test/      unit tests (npm test)
```

- **Storage:** one JSON document (`tickets.json`) in the R2 bucket `logbook-tickets`. Writes are conditional on the document's ETag, so concurrent changes cannot overwrite each other. A scheduled run copies the document to `backups/<date>.json` every night and keeps the last 30.
- **Access:** the Worker accepts a request only if it carries a valid Cloudflare Access token for the configured team domain and audience (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` in `wrangler.jsonc`). Without that configuration it answers every request with 503. Browsers sign in through Access; command line clients use an Access service token.
- **Address:** https://logbook.empty-shape-d969.workers.dev. The DNS of simsab.net is not on Cloudflare, so `logbook.simsab.net` is a GitHub Pages site that redirects there.

## Tickets

Fields: `id` (`<PREFIX>-<number>`), `project`, `title`, `type` (feature, change, content, bug, chore, docs, idea), `status` (idea, planned, in-progress, completed), `priority` (now, next, later; not needed once completed), `effort` (S, M, L), `created`, `completed`, `body` (Markdown with `## Summary` and optional `## Motivation`), `commits` (list of `{ sha, subject }`), `origin`, `verified`.

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

## Conventions

- Everything in this repository is English: ticket text, UI and commit messages.
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
