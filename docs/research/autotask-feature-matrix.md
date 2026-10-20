# Autotask → Taskora Feature Matrix

Legend
- **Autotask**: `C` = confirmed in public Autotask docs (source key in Notes or see functional analysis), `U` = uncertain/assumed, `—` = not an Autotask feature (Taskora addition).
- **Priority**: `P0` = needed for a usable MSP service desk MVP, `P1` = expected by MSPs soon after MVP, `P2` = nice-to-have / later.
- **Phase**: 0 = project bootstrap (repo, CI, infra), 1 = foundation (auth, companies, contacts, locations, settings, dashboard), 2 = service desk (tickets, queues, statuses, notes, time entries), 3 = CMDB, 4 = Action1 integration, 5 = contracts / SLA / billing / projects / KB, 6 = workflow automation / reporting / notifications / search / custom fields.

Detailed rationale per module is in `autotask-functional-analysis.md`; tables in `taskora-data-model.md`; flows in `taskora-workflows.md`.

## 0. Platform

| Feature | Autotask | Priority | Phase | Notes |
|---|---|---|---|---|
| Monorepo, Docker Compose, Postgres, migrations, CI | — | P0 | 0 | Self-hosted target. |
| Seed data with MSP defaults (statuses, priorities, queues, issue types, work types) | C (instances ship with common issue types) | P0 | 0/1 | Autotask pre-populates issue types [Issue types page]. |
| REST API (JSON) for all entities | C (REST API) | P0 | 1→ | Design our own API; don't mirror Autotask paths. |
| Webhooks (outbound) | C (Tickets/Companies support webhooks) | P1 | 6 | |
| UTC storage + per-user TZ | C (all API times UTC) | P0 | 1 | |
| Audit log (who changed what) | C (lastTrackedModificationDateTime, ticket history) | P0 | 1 | Generic `audit_events` table from day 1. |
| Module activation toggles | C (Admin > Activations) | P2 | 1 | Simple feature flags in settings. |

## 1. Foundation

| Feature | Autotask | Priority | Phase | Notes |
|---|---|---|---|---|
| Local auth (email + password, hashed) | C (resources have username/email) | P0 | 1 | |
| SSO (OIDC / Entra ID) | U | P1 | 1 | Common MSP requirement. |
| MFA (TOTP) | U | P1 | 1 | |
| Security roles / permissions (RBAC) | C (security levels) | P0 | 1 | Keep simple: Admin, Manager, Technician, Read-only. |
| Resources (technicians) with default role & location | C (Resources entity) | P0 | 1 | |
| Internal locations with time zone & business hours | C (queues/SLA use internal location) | P0 | 1 | Needed by SLA in phase 5; build in 1. |
| Holiday sets | C (SLA business hours respect holidays) | P1 | 1 | |
| Companies CRUD | C | P0 | 1 | |
| Company types (Customer, Lead, Prospect, Dead, Cancelation, Vendor, Partner) | C | P0 | 1 | Enum. |
| Parent / sub-company (2 levels) | C | P1 | 1 | Taskora: allow 2 levels, validate. |
| Account manager (owner resource) | C (ownerResourceID) | P1 | 1 | |
| Classification / territory / market segment | C | P2 | 1 | Tags instead. |
| Company alerts / banner notes | C (CompanyAlerts child) | P1 | 1 | Show on ticket open. |
| Company notes | C (CompanyNotes) | P1 | 1 | |
| Company attachments | C | P1 | 1 | |
| Company locations (primary flag) | C | P0 | 1 | |
| Contacts CRUD | C | P0 | 1 | |
| Multiple contact emails (for email intake) | C (emailAddress 2/3) | P0 | 1 | Child table, unlimited. |
| Primary contact (1 per company) | C | P1 | 1 | |
| Contact receives notifications flag | C | P0 | 1 | |
| Inactive contacts (no delete when referenced) | C | P0 | 1 | Soft delete. |
| Settings UI (org profile, users, picklists) | C (Admin) | P0 | 1 | |
| Dashboard (fixed technician/manager widgets) | C (dashboards) | P0 | 1 | Configurable widgets later. |
| Configurable dashboard widgets (≤24 per tab) | C | P2 | 6 | |
| Client portal | C | P2 | — | Post-v1. |

## 2. Service desk

| Feature | Autotask | Priority | Phase | Notes |
|---|---|---|---|---|
| Tickets CRUD (no hard delete) | C | P0 | 2 | |
| Ticket number `T{YYYYMMDD}.{NNNN}` | C | P0 | 2 | Daily counter via sequence table. |
| Ticket types (Service Request, Incident, Problem, Change Request, Alert) | C | P0 | 2 | Enum; default Service Request. |
| Problem ↔ incident linking | C | P1 | 2 | `problem_ticket_id`. |
| Change request approvals (CAB) | C | P2 | 6 | |
| Ticket categories / templates (defaults, required fields) | C | P1 | 2 | Simplified "ticket templates". |
| Issue type → sub-issue type hierarchy | C | P0 | 2 | Sub-issue belongs to one issue. |
| Issue type associated queue | C | P1 | 2 | Used by routing. |
| Priorities (admin list, active flag) | C | P0 | 2 | |
| Sources (Phone, Email, Portal, Monitoring...) | C (field) / U (values) | P0 | 2 | |
| Statuses with system New / Waiting Customer / Complete | C | P0 | 2 | |
| Status → SLA event mapping | C | P0 | 2 | Column exists in 2; used in 5. |
| Status colour/icon/order | C | P1 | 2 | |
| Queues with members, owner, internal location | C | P0 | 2 | |
| System queues (Client Portal, Post Sale, Monitoring Alert) | C | P1 | 2 | Taskora: "Email intake", "Monitoring alerts". |
| Primary resource + role | C | P0 | 2 | |
| Secondary resources | C | P1 | 2 | |
| Accept ticket | C | P0 | 2 | |
| Forward / modify (reassign + note) | C | P1 | 2 | |
| Due date/time, estimated hours | C | P0 | 2 | |
| Ticket notes (internal / customer-visible) | C | P0 | 2 | |
| Note title required per category | C | P2 | 2 | |
| Attachments on ticket/notes | C | P0 | 2 | Local disk or S3-compatible. |
| Activity feed (notes, time, status changes, workflow notes) | C | P0 | 2 | Unified timeline. |
| Ticket history / audit | C | P0 | 2 | |
| Checklists (items, important flag, KB link) | C | P1 | 2 | |
| Checklist library templates | C | P2 | 6 | |
| Ticket charges (materials) | C | P2 | 5 | |
| Ticket expenses | C | P2 | 5 | |
| Resolution field + append notes/time to resolution | C | P0 | 2 | |
| Recurring tickets | C | P1 | 5 | |
| Ticket tags | C | P1 | 2 | Used for KB suggestions. |
| Incoming email → ticket; reply with ticket number → note | C | P0 | 2 | IMAP/Graph mailbox poller. |
| Email loop/dupe protection | C (≤2 same sender+subject / 5 min) | P0 | 2 | |
| Merge / duplicate tickets | C (duplicate ticket handling) | P1 | 2 | |
| Customer satisfaction surveys | C | P2 | 6 | |
| Co-managed visibility | C | P2 | — | Out of scope. |
| RMA tickets | C | P2 | — | Out of scope. |
| AI triage | C (workflow action) | P2 | 6+ | |

## 3. Time

| Feature | Autotask | Priority | Phase | Notes |
|---|---|---|---|---|
| Ticket time entries (start/end or hours, role, work type) | C | P0 | 2 | |
| Summary notes (customer-facing, required) + internal notes | C | P0 | 2 | |
| Billable / non-billable flag; show on invoice | C | P0 | 2 | Billing use in 5. |
| Contract inherited from ticket on create | C | P0 | 2 | contract_id nullable in 2. |
| Timer on ticket | U (no Autotask page found) | P1 | 2 | Taskora UX improvement. |
| General/regular time (internal categories) | C | P1 | 2 | Meetings, admin, training, leave. |
| Task time entries | C | P0 | 5 | With projects. |
| Weekly timesheets submit / approve / reject | C | P1 | 5 | |
| Proxy time entry | C | P2 | 5 | |
| Billing approval / Approve & Post | C | P1 | 5 | |
| Start/stop required per contract/project | C | P2 | 5 | |
| Work types with multiplier & after-hours work type | C (afterHoursWorkType; multiplier concept) | P0 | 2 | |
| Labour roles with hourly rate | C | P0 | 2 | |

## 4. CMDB (Phase 3)

| Feature | Autotask | Priority | Phase | Notes |
|---|---|---|---|---|
| CIs linked to company, location, contact | C | P0 | 3 | |
| CI type/category controlling fields | C (categories; types legacy) | P0 | 3 | Single `ci_types`. |
| Product reference (catalogue) | C (required in AT) | P2 | 5 | Optional in Taskora. |
| Serial, reference number, name, install date, warranty | C | P0 | 3 | |
| Active/inactive | C | P0 | 3 | Lifecycle states richer in Taskora. |
| Parent/child CI | C (2 levels) | P1 | 3 | N-level typed relationships. |
| CI on ticket; ticket list on CI | C | P0 | 3 | |
| CI contract/service/SLA link | C | P1 | 5 | |
| RMM audit fields (hostname, IP, MAC, OS, last user, model, RAM, storage, patch status) | C | P0 | 3/4 | Generic columns + jsonb. |
| CI history / versions | C | P1 | 3 | Field-level diff table. |
| Protected / encrypted CI fields | C | P2 | 6 | Credentials better left to a vault. |
| Domain & SSL certificate CIs + expiry events | C | P2 | 6 | |
| CI notes & attachments | C | P1 | 3 | |
| Bulk import (CSV) | C (import templates) | P1 | 3 | |

## 5. Action1 integration (Phase 4)

| Feature | Autotask | Priority | Phase | Notes |
|---|---|---|---|---|
| Integration settings (API credentials, region) | — (AT has RMM integrations) | P0 | 4 | Store secrets encrypted. |
| Map Action1 organizations → Taskora companies | — | P0 | 4 | Mapping table. |
| Scheduled endpoint sync → CIs (create/update, mark stale) | C (concept: RMM syncs devices into CIs) | P0 | 4 | Rate limit ~30 req/min per Action1 docs. |
| Missing-updates / patch status on CI | C (concept: rmmDeviceAuditPatchStatusID, missing patch count) | P1 | 4 | |
| Alerts → tickets linked to CI | C (concept: RMM alerts create tickets) | P1 | 4 | If Action1 exposes alerts; [U]. |
| Deep link from CI to Action1 console | — | P1 | 4 | |
| Sync log & error reporting | — | P0 | 4 | `integration_runs`. |

## 6. Contracts, SLA, billing, projects, KB (Phase 5)

| Feature | Autotask | Priority | Phase | Notes |
|---|---|---|---|---|
| Contracts (company, dates, status, category, default flag) | C | P0 | 5 | |
| Type: Time & Materials (role-rate overrides) | C | P0 | 5 | |
| Type: Fixed Price (milestones) | C | P2 | 5 | |
| Type: Block Hours (blocks, hour factors, overage) | C | P0 | 5 | Very common for MSPs. |
| Type: Retainer (currency balance) | C | P2 | 5 | |
| Type: Per Ticket (API "Incident"; ticket purchases) | C | P2 | 5 | |
| Type: Recurring Service (services, units, period, proration) | C | P0 | 5 | Managed-services core. |
| Services / service bundles catalogue | C | P1 | 5 | |
| Contract exclusions (roles, work types, sub-issues) + exclusion contract | C | P1 | 5 | |
| Default service-desk contract per company | C | P0 | 5 | |
| Contract precedence resolver (CI → default → parent default → exclusion) | C | P0 | 5 | |
| Block-hour balance alerts / auto-repurchase | C | P1 | 5/6 | |
| SLA definitions with business hours / 24x7 | C | P0 | 5 | |
| SLA objectives matrix (priority × type × category × issue × sub-issue) | C | P1 | 5 | Start with priority-only, expand. |
| SLA events: first response, resolution plan, resolved; waiting-customer pause | C | P0 | 5 | |
| SLA default chain (CI → contract service → contract → category) | C | P0 | 5 | |
| SLA due dates on ticket, met flags, results | C | P0 | 5 | |
| SLA goal % and performance report | C | P1 | 6 | |
| Retroactive SLA edit by manager | C | P2 | 5 | |
| Ticket charges / products / expenses billing | C | P2 | 5 | |
| Approve & Post → billing items | C | P1 | 5 | |
| Invoicing / accounting export | C | P2 | 5+ | Export to CSV/accounting integration; no invoice PDF in v1. |
| Projects, phases (sub-phases), tasks | C | P1 | 5 | One-level phases in v1. |
| Task dependencies / successor statuses | C | P2 | 5 | |
| Project templates | C | P2 | 5 | |
| Knowledge base articles, categories | C | P1 | 5 | |
| KB publish levels (internal / portal / per customer) | C | P1 | 5 | |
| KB article ↔ ticket links | C | P1 | 5 | |
| Create KB from ticket | C | P1 | 5 | |
| KB suggestions on ticket | C (tag-based) | P1 | 5 | FTS-based in Taskora. |
| KB versions / drafts / approval | C | P2 | 5 | |
| Inventory locations & stock | C | P2 | — | Post-v1. |
| Opportunities / quotes / sales orders | C | P2 | — | Out of scope for v1 PSA core. |
| Dispatch calendar / service calls / appointments | C | P1 | 5/6 | Appointments table. |

## 7. Automation, reporting, notifications, search, custom fields (Phase 6)

| Feature | Autotask | Priority | Phase | Notes |
|---|---|---|---|---|
| Built-in email notifications (new ticket, note, assignment, completion) | C (templates) | P0 | 2 | Minimal set early; full engine in 6. |
| Notification templates with merge variables | C | P1 | 6 | |
| Teams webhook notifications | C | P2 | 6 | |
| Workflow rules: immediate events (created, edited, note added) | C | P1 | 6 | |
| Workflow rules: actor filters (resource vs contact) | C | P2 | 6 | |
| Workflow rules: time-based (due in, overdue, idle, SLA overdue) | C | P1 | 6 | |
| Conditions (≤5, AND, changed/changed to/from) | C | P1 | 6 | Allow more, plus OR groups. |
| Updates (≤5, static & dynamic values) | C | P1 | 6 | |
| Actions: add note, create ticket, add checklist, webhook callout, to-do | C | P1 | 6 | |
| Notification recurrence | C | P2 | 6 | |
| Cascade limit (5) + execution log | C (limit) / — (log) | P1 | 6 | |
| Dry-run rule tester | — | P2 | 6 | Taskora improvement. |
| Custom fields (UDF) per entity: text, number, date, list, email | C | P1 | 6 | jsonb storage. |
| Required custom fields per template | C (per category) | P2 | 6 | |
| Pre-built reports (SLA, time, volume, aging) | C | P1 | 6 | |
| Custom report builder | C (LiveReports) | P2 | 6 | Saved queries + CSV. |
| Global search / command palette | U (exists, undocumented publicly) | P0 | 6 | Basic search earlier per list (phase 1–2). |
| Per-list filtering, sorting, saved views | C (search pages) | P0 | 1/2 | |

## Confirmed vs uncertain

- All rows marked `C` are backed by the pages listed below (see the functional analysis for per-fact citations).
- `U` rows: global search mechanics, ticket timer, SSO/MFA options, ticket source picklist values, Action1 alert API.
- Priorities and phases are Taskora product decisions, not Autotask facts.

## Sources

- REST entity reference: Tickets, TicketNotes, TimeEntries, ConfigurationItems, ConfigurationItemTypes, ConfigurationItemCategories, Contracts, ContractServices, ContractBlocks, ContractRetainers, ContractTicketPurchases, ContractExclusionSets, ServiceLevelAgreementResults, Companies, Contacts, CompanyLocations, Resources, Roles, BillingCodes, Services, Projects, Phases, Tasks, Products, InventoryItems, KnowledgeBaseArticles, TicketCategories, TicketCategoryFieldDefaults, TicketChecklistItems, TicketSecondaryResources, TicketCharges, ServiceCalls, Opportunities, UserDefinedFieldDefinitions — all under https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/
- https://autotask.net/help/Content/3_Features/7_ServiceDeskAutomation/ServiceLevelManagement/SLAMAIN.htm
- https://autotask.net/help/Content/4_Admin/2FeaturesSettings/ServiceDeskTickets/SLAAdmin/SLAAddEdit.htm
- https://autotask.net/help/Content/4_Admin/2FeaturesSettings/ServiceDeskTickets/SLAAdmin/SLAstatusmapping.htm
- https://autotask.net/help/Content/4_Admin/2FeaturesSettings/ServiceDeskTickets/Tickets/Task_Ticket_Statuses.htm
- https://autotask.net/help/Content/4_Admin/2FeaturesSettings/ServiceDeskTickets/Tickets/IssueandSubIssueTypes.htm
- https://autotask.net/help/Content/4_Admin/2FeaturesSettings/ServiceDeskTickets/Tickets/QueuesManage.htm
- https://autotask.net/help/Content/4_Admin/3Automation/WorkflowRules/AUTOTASK_WFR.htm
- https://autotask.net/help/Content/4_Admin/3Automation/WorkflowRules/WorkflowRulesCreatingEditing.htm
- https://autotask.net/help/Content/3_Features/6_Contracts/AdminGeneral/BusinessCaseContracts.htm
- https://autotask.net/help/Content/3_Features/6_Contracts/AdminGeneral/ApplyContractToTicketProject.htm
- https://autotask.net/help/Content/3_Features/10_Billing/ApprovePost/Approve_Post.htm
- https://autotask.net/help/Content/3_Features/7_ServiceDesk/Introduction_to_Tickets.htm
- https://autotask.net/help/Content/3_Features/7_ServiceDesk/ManageTickets/AssignAcceptTickets.htm
- https://autotask.net/help/content/3_Features/7_ServiceDesk/Workflows/Basic_Ticket_Workflow.htm
- https://autotask.net/help/Content/3_Features/7_ServiceDeskAutomation/Dispatching/DISPATCHLANDING.htm
- https://autotask.net/help/Content/3_Features/3_CRM/Companies/COMPANIESMAIN.htm
- https://autotask.net/help/Content/3_Features/4_Assets/ASSET_OVERVIEW.htm
- https://autotask.net/help/Content/3_Features/7_Knowledgebase_Documentation/Knowledgebase/UsingKBwithAT.htm
- https://autotask.net/help/Content/2_Getting_Started/Timesheets/TimeEntryRegular.htm
- https://www.action1.com/api-documentation/making-example-calls/ and https://action1.com/api-documentation/how-action1-api-works (Action1 rate limit / organizations endpoint, via search summary)
