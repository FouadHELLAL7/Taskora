# Taskora progress

_Last updated: 2026-10-20 (end of session 1) — branch `develop/taskora-platform`_

## Verified

- `npm run typecheck` (api, web, shared): clean.
- API test suite: 83 tests across 8 files passing (auth/permissions, ticket lifecycle & SLA, CRM/CMDB, time/contracts/invoicing, workflow automation, projects/KB, reports, Action1 sync with mocked HTTP, demo seed, milestones).
- Playwright browser E2E (`e2e/`): sign in → create company → raise ticket → internal note → log time → resolve; global search. 2/2 passing against the dev stack.
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

## Also implemented (UI)

Opportunities pipeline (drag & drop), products, asset types with counts, software inventory, Action1 integration settings (credentials, mapping, sync history) and endpoint review, invoice detail (lines, issue/pay/void, PDF), services catalogue, projects (board, milestones, time), tasks, milestones, knowledge base & documentation (Markdown editor with preview), reports (tickets/time/SLA/assets with CSV) and analytics, workflow rule builder with dry-run test and execution history, system settings (general, SLA policies, business hours & holidays, work types, billing codes, CI types, notification templates), audit log viewer.

All routes in `apps/web/src/App.tsx` are implemented; `npx vite build` succeeds.

## Added later in session 1

- Outbound e-mail notifications (SMTP) with per-user opt-out; customer-visible notes can be e-mailed to the ticket contact.
- Inbound e-mail → ticket (IMAP) with reply threading on `[TKA-…]`, fallback company, processing log.
- Recurring tickets (preventive maintenance schedules) with run-now.
- Ticket checklists, dispatch board (technicians × days), session management (list/revoke, admin revoke), configurable login rate limit.
- CSV data import (companies, contacts, CIs) with preview, matching and Autotask-style headers.
- Generated REST API reference `docs/api.md` (287 endpoints with permissions).
- Production bundles (`dist/server.js`, `dist/worker.js`) smoke-tested with NODE_ENV=production against PostgreSQL.
- Playwright E2E tests; web unit tests; 99 API tests across 14 files.

## Known gaps

- Browser E2E tests are not yet wired into CI (they need a running stack with a known user).
- Ticket service ignores a backdated `ctx.now` for events/notifications (only relevant to the demo seed, which corrects timestamps itself).
