# Changelog

## [Unreleased]

### Added
- Ticket CSV import (Tickets → Import, or Admin → Data Import) with notes, hours worked, created/resolved dates, status/priority mapping, optional creation of missing companies/contacts/picklist values, and safe re-import; ticket CSV export with a column chooser (adds description, notes, resolution and more). See [docs/ticket-import.md](docs/ticket-import.md).

## [0.2.0] — 2026-10-20

### Added
- Backup & Restore (Administration → System): full backups of every table and uploaded file, saved on the server or downloaded; scheduled automatic backups with retention; all-or-nothing restore from a server backup or an uploaded file with an automatic pre-restore backup. New permission `backups.manage`.
- E-mail settings page: SMTP host/port/TLS/credentials/sender/reply-to/signature configurable in the UI (password encrypted), test e-mail; environment variables remain a fallback.
- Send e-mail from a ticket: To/Cc/Bcc, pre-filled contact and `[TKA-…]` subject, ticket attachments, signature, optional status change; recorded as a customer-visible note and timeline event.
- Logos for client companies (companies list, company workspace, ticket contact card) and for the organization (sidebar, sign-in page).
- Grouped navigation: collapsible sections and sub-menus; the compact sidebar shows one flyout menu per section.

### Fixed
- Action1 organization mapping tab was always empty: the UI read the organization list as `{ data: [...] }` although the API returns a plain array.

### Upgrade notes
- Rebuild and restart all services (`docker compose up -d --build`): the database migration adds the `logos` table, and a new `taskora-backups` volume is mounted on api and worker.

## [Unreleased] — branch `develop/taskora-platform`

### Added
- Monorepo foundation, PostgreSQL schema (40+ tables) and migrations.
- Authentication (setup token, Argon2id, sessions, CSRF, lockout), RBAC with four built-in roles, audit log.
- CRM: companies with workspace and KPIs, contacts, locations, activities, opportunities.
- Service desk: tickets with full lifecycle, SLA engine, notes, timeline, watchers, relations, duplicates, saved views, bulk updates, templates, CSV export, service calls, calendar.
- CMDB: configuration items, relations, software, device workspace.
- Action1 read-only integration with sync, mapping, matching, review and device panels.
- Contracts, time tracking with timer and approval, expenses, billing review, invoices with PDF.
- Projects, milestones, tasks; knowledge base and documentation API.
- Workflow automation engine, notifications, global search, custom fields, reports and dashboards.
- Background worker with Postgres job queue.
- Docker images, docker-compose, nginx, Ubuntu install/backup/restore/update scripts, CI workflow.
- Fictional demo data seed (development only).
- E-mail: SMTP notifications, customer replies from notes, IMAP inbound e-mail to ticket.
- Recurring tickets, ticket checklists, dispatch board.
- Session management, CSV import, generated API reference.
- Ticket merge, portal password reset, system health view.
- Customer portal MVP; contract renewal and warranty reminders; ticket list column chooser.
- Playwright end-to-end tests.
