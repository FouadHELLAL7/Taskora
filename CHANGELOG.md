# Changelog

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
- Playwright end-to-end tests.
