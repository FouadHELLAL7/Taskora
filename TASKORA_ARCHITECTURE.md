# Taskora architecture

## Overview

```
 Browser (React SPA)
     │  same-origin /api (cookies + CSRF header)
     ▼
 nginx (web container, :8080)  ──────────►  Fastify API (api container, :3000)
   static SPA, security headers                │  Drizzle ORM (node-postgres)
                                               ▼
                                         PostgreSQL 17 (internal network only)
                                               ▲
                     Worker (same image) ──────┘  jobs table (FOR UPDATE SKIP LOCKED)
                        │ scheduled: SLA monitor, status-age rules, Action1 sync, cleanup
                        ▼
                  Action1 REST API (read-only, outbound HTTPS)
```

- **Monorepo** (npm workspaces): `apps/api`, `apps/web`, `packages/shared` (Zod schemas, enums, permissions shared by both sides).
- **API**: Fastify 5, TypeScript, Drizzle ORM, PostgreSQL. Bundled with esbuild into `dist/` (server, worker, CLIs). Migrations run automatically on start (`drizzle/`), followed by an idempotent base seed of reference data.
- **Worker**: separate process from the same image. A Postgres-backed job queue (`jobs` table, dedupe keys, exponential backoff, stale-job recovery) — no Redis required.
- **Web**: React 19, Vite, Tailwind 4 design tokens (light/dark), TanStack Query & Table, react-hook-form, Radix primitives (shadcn-style components).

## API conventions

- Prefix `/api/v1`. JSON in/out. Lists return `{ data, total, page, pageSize }` with `page`, `pageSize`, `sort`, `order`, `q` and module-specific filters.
- **Authorization is centralised**: every route declares `config: { perm }`; a global `preHandler` authenticates the session cookie, verifies the CSRF header on mutations and checks the permission. Routes are private unless marked `public`.
- Validation with shared Zod schemas; errors are `{ error: { code, message, details: { fields } } }`. Postgres unique/foreign-key violations map to 409.
- Every mutation writes an `audit_logs` row (user, action, entity, diff, IP).
- Human-readable numbers (TKA-000142, CI-000031, CTR-, PRJ-, INV-, KB-) come from an atomic `sequences` table with configurable prefixes.

## Modules (apps/api/src/modules)

| Module | Responsibilities |
| --- | --- |
| auth | setup token flow, login/logout, sessions, CSRF, password change, preferences |
| admin | users, roles (permission matrix), resources, audit log |
| settings | statuses, priorities, types, issue/sub-issue types, sources, queues, work types, billing codes, CI types, custom fields, templates, business hours, holidays, SLA policies, system settings, `/lookups` |
| crm | companies (+ summary & activity feed), locations, contacts, activities, opportunities |
| tickets | ticket service (lifecycle, SLA, events, notifications), list/filters/export, notes, timeline, watchers, relations, duplicates, bulk, saved views |
| cmdb | configuration items, relations, software, activity |
| time | time entries (contract-aware rates & coverage), timer, approvals, weekly totals |
| contracts | contracts, rates, hour blocks, contract services, usage |
| billing | expenses, billing review, invoices (draft generation, lifecycle, lines, PDF) |
| projects | projects, milestones, tasks, cross-project milestones |
| kb | knowledge base & company documentation, ticket links |
| automation | workflow rule engine and management, executions |
| scheduling | service calls, calendar feed |
| reports | dashboard, my work, ticket/time/SLA/asset reports (CSV) |
| integrations | Action1 settings, sync runs, org mapping, endpoint review, CI device panel |
| attachments, notifications, search | files, in-app notifications, global search |

## Key domain logic

- **SLA**: policy = explicit ticket SLA → contract SLA → company default → system default. Deadlines are computed in business minutes (`lib/business-time.ts`, DST-aware via `Intl`). Statuses flagged `pausesSla` stop the clock; paused business minutes extend the resolution target. First response is recorded on the first customer-visible note or the first move out of a *new* status. The worker flags breaches once and fires `ticket.sla_breached` rules.
- **Workflow rules**: evaluated after commits for `ticket.created`/`ticket.updated`; actions run with `automation: true` and never re-trigger rules (loop prevention). Time-based rules use dedupe keys (one execution per ticket and status period).
- **Time & billing**: rate = contract work-type rate → contract hourly rate → work type rate. Time on fixed/recurring/retainer/block/per-ticket contracts is flagged *contract covered*. Invoice drafts reserve approved billable time, billable expenses and recurring contract fees; issuing marks time *billed*; voiding releases it.
- **Action1**: see `docs/research/action1-api.md` and `apps/api/src/integrations/action1`. Read-only by design (GET + token request only). Endpoints are keyed by Action1 id; matching never crosses companies; disappearing endpoints are flagged, never deleted.

## Data model

40+ tables; see `apps/api/src/db/schema/*.ts` and `docs/research/taskora-data-model.md`. Core relations:

```
companies 1─* contacts, locations, configuration_items, contracts, projects, tickets
contacts 1─* configuration_items (assigned), tickets
tickets *─1 status/priority/queue/type/issue/sub-issue/source/SLA/contract/CI/assignee
tickets 1─* ticket_notes, ticket_events, time_entries, attachments, relations, watchers
contracts 1─* contract_rates, contract_blocks, contract_services, time_entries
projects 1─* project_milestones, project_tasks 1─* time_entries
configuration_items 1─0..1 action1_endpoints ; action1_organizations → companies
```

Custom fields are stored as validated JSONB (`custom_fields`) against `custom_field_definitions`.

## Security

Argon2id password hashing, httpOnly SameSite=Lax session cookies (hashed server-side), CSRF tokens on mutations, login rate limiting + lockout, permission checks in a single hook, AES-256-GCM for integration secrets (`TASKORA_ENCRYPTION_KEY`), upload type blocking with `nosniff` and sandboxed downloads, helmet headers, CSP from nginx, read-only containers, internal DB network, no default credentials (one-time setup token).

## Testing

`apps/api/test` runs the real Fastify app against an in-process PostgreSQL (PGlite) with migrations — auth, permissions, CRUD, ticket lifecycle/SLA, CMDB relations, time, contracts/invoicing, workflows, reports, Action1 (mock HTTP server) and the demo seed.
