# Taskora roadmap

Status legend: ✅ done · 🟡 partial · ⬜ planned

## Phase 0 — Research & foundation ✅
- ✅ Autotask functional analysis, feature matrix, data model, workflows (`docs/research`)
- ✅ Action1 API spec, REA evaluation
- ✅ Monorepo, architecture, PostgreSQL schema & migrations, dev environment

## Phase 1 — PSA foundation ✅
- ✅ Authentication, sessions, setup token, roles & permissions, audit log
- ✅ App shell (sidebar, global search, shortcuts, themes), dashboard
- ✅ Companies (workspace), contacts, locations, activities, opportunities API
- ✅ Core settings (all picklists, system settings)

## Phase 2 — Service desk ✅
- ✅ Tickets: create/list/detail workspace, notes, timeline, assignments, queues, statuses, priorities
- ✅ Time entries, timer, filtering, saved views, bulk updates, export, duplicates, relations, watchers, templates
- ✅ SLA engine + monitor, service calls, calendar

## Phase 3 — CMDB ✅
- ✅ CIs, CI types, manual creation, company/contact/ticket relationships, relations, software, detail workspace

## Phase 4 — Action1 ✅
- ✅ Client, sync, mapping, matching/dedupe, logs, CI & ticket device panels
- ✅ Admin integration page and endpoint review page

## Phase 5 — Business functions ✅
- ✅ Contracts, SLAs, time & billing API; contracts/time/billing/invoice list UI
- ✅ Invoice detail, services catalog, projects and knowledge base UI

## Phase 6 — Advanced ✅ (first iteration)
- ✅ Workflow engine, notifications, global search, custom fields (API + editor), reports API
- ✅ Workflow builder UI, reports/analytics UI, system settings UI, audit UI

## Later
- ⬜ E-mail (SMTP) notifications and inbound e-mail to ticket
- ✅ Customer portal MVP (separate auth realm, public notes/KB only)
- ⬜ OIDC / Keycloak SSO
- ⬜ Inventory & procurement, quotes
- ⬜ Additional RMM integrations, webhooks, public API tokens
- ⬜ Playwright end-to-end tests in CI
