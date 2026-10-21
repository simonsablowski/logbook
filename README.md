# Logbook

A lightweight ticket system for the projects below: pending changes and ideas, prioritised, plus a complete history of what was implemented and in which commits.

Tickets are Markdown files in `tickets/`. `npm run build` validates them and generates `docs/data.js`; `docs/index.html` renders the board, backlog and changelog from it.

## Projects

| Prefix | Project | Repository |
|---|---|---|
| CRS | courses.simsab.net | `simonsablowski/courses` |
| RSR | resources.simsab.net | `simonsablowski/resources` |
| MTV | motivado.com | `simonsablowski/motivado` |
| SIM | simsab.net | `simonsablowski/simsab` |
| IKS | shop.inkarnatoons.com | `simonsablowski/shop` |
| DBP | dbp12.simsab.net | `simonsablowski/dbp12` |
| NOR | norahammer.com | `simonsablowski/norahammer` |
| NMB | notmybiz.com | `simonsablowski/notmybiz` |
| BEU | beatemup.simsab.net | `simonsablowski/beatemup` |

The registry lives in `projects.json`. Every project must have a GitHub repository.

## Ticket format

File name `<PREFIX>-<number>.md`, for example `tickets/MTV-014.md`.

```markdown
---
id: MTV-014
project: MTV
title: Add newsletter signup form to footer
type: feature            # feature | change | content | bug | chore | docs | idea
status: planned          # idea | planned | in-progress | completed
priority: now            # now | next | later (not needed once completed)
effort: S                # S | M | L
created: 2026-10-21
completed: null          # YYYY-MM-DD, required when status is completed
origin: live             # live | reconstructed
confidence: null         # high | medium | low, reconstructed tickets only
verified: true           # false until a reconstructed ticket has been reviewed
commits:
  - a1b2c3d | MTV-014: Add newsletter signup form to footer
---

## Summary

What changed and why, in a few sentences.

## Motivation

Why it was needed, or "Not documented."
```

## Conventions

- Everything in this repository is English: ticket text, UI and commit messages.
- The repository is public. Never put credentials, personal data or customer data into a ticket.
- Every commit in a project repository starts with the ticket ID: `MTV-014: Add newsletter signup form to footer`. Install the check with `cp scripts/commit-msg <project>/.git/hooks/commit-msg`.
- Tickets whose history was derived from git are marked `origin: reconstructed` and shown with a dashed border until they are reviewed and set to `verified: true`.
- Priorities: `now` is the current work list, `next` is queued, `later` is parked.

## Viewing

Open `docs/index.html` through any static server, or enable GitHub Pages for the `main` branch with the `/docs` folder.

## Status

All 27 tickets for MTV (motivado.com) are backfilled from the git history of October 2026. The other projects follow.
