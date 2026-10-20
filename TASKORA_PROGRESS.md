# Taskora progress

_Last updated: 2026-10-20 — branch `develop/taskora-platform`_

## Verified

- `npm run typecheck` (api, web, shared): clean.
- API test suite: 83 tests across 8 files passing (auth/permissions, ticket lifecycle & SLA, CRM/CMDB, time/contracts/invoicing, workflow automation, projects/KB, reports, Action1 sync with mocked HTTP, demo seed, milestones).
- Live dev stack (`npm run dev`) with fictional demo data, checked in the browser: login, setup, dashboard, ticket list, ticket workspace (incl. Action1 device panel), company workspace, CI pages.
- Docker images and compose: written and statically reviewed; **not built locally** (no Docker on the development machine). CI workflow `.github/workflows/ci.yml` builds both images on Ubuntu.

## Implemented (backend + UI)

| Area | Status |
| --- | --- |
| Auth, setup token, sessions/CSRF, users & roles UI | ✅ |
| Dashboard, my work, calendar, notifications | ✅ |
| Tickets: list (views, bulk, export), new (templates, duplicates), workspace, queues, SLA monitor, service calls | ✅ |
| Companies (list + workspace), contacts (list + profile), locations | ✅ |
| Configuration items (list, devices, detail, form) | ✅ |
| Action1 backend (client, sync, mapping, review API, CI/ticket device panel) | ✅ |
| Contracts (list + detail), time entries, billing review, invoices list | ✅ |
| Ticket settings, custom fields admin | ✅ |
| Docker, compose, nginx, scripts, CI, docs | ✅ |
| Demo data seed | ✅ |

## Backend complete, UI pending

Opportunities, products, asset types, software inventory, Action1 endpoint review page, invoice detail, services catalog, projects/tasks/milestones, knowledge base & documentation, reports & analytics, workflow rule builder, integrations admin page, system settings (general, SLA, business hours, work types, billing codes, templates), audit log viewer. Their routes exist in `apps/web/src/App.tsx`; files still marked `STUB` render a placeholder header.

## Known gaps

- No SMTP e-mail delivery yet (in-app notifications only).
- No Playwright end-to-end tests yet.
- Ticket service ignores a backdated `ctx.now` for events/notifications (only relevant to the demo seed, which corrects timestamps itself).
