# Taskora Key User Workflows

> Each workflow is written as numbered steps naming the **screen**, the **fields** touched (Taskora column names from `taskora-data-model.md`), and the **system behaviour**. Where the behaviour mirrors Autotask, it is tagged **[AT-C]** (confirmed in public Autotask docs) or **[AT-U]** (assumed). Untagged = Taskora design decision.
>
> Phase tags in brackets show when each workflow becomes available.

---

## W1. New ticket intake [Phase 2]

### W1a. Manual (phone / walk-up)
1. **Screen: Global "+ New → Ticket"** (also from Company, Contact, or CI page, which pre-fills context).
2. Pick **Company** (`company_id`, typeahead on name/short code/phone). Company `alert_text` shows as a banner [AT-C: CompanyAlerts].
3. Pick **Contact** (`contact_id`) filtered to company + parent company [AT-C: contact must belong to company or parent]. Inline "new contact" allowed.
4. Optionally pick **CI** (`configuration_item_id`) filtered to company; show CI warranty/last-seen. (Phase 3.)
5. Choose **Template** (`template_id`; AT "ticket category") → applies defaults: ticket type, priority, status, queue, issue/sub-issue, source, estimated hours, due offset [AT-C: TicketCategoryFieldDefaults]. If none, use user's default template, else the global default [AT-C].
6. Enter **Title** (required), **Description**.
7. Set **Ticket type** (default `service_request` [AT-C]), **Issue type → Sub-issue type** (sub-issue list filtered by issue [AT-C]), **Priority** (required, active only [AT-C]), **Source** = Phone.
8. Assign: **Queue** and/or **Primary resource + labor role** (resource must be a member of ≥1 queue [AT-C]). "Assign to me" shortcut.
9. **Due date**: from template offset, or from SLA (Phase 5) when SLA has "set ticket due date" [AT-C].
10. Save → system:
    - generates `ticket_number` `T{YYYYMMDD}.{NNNN}` [AT-C format];
    - sets `status` = New (system) unless template sets otherwise;
    - (Phase 5) resolves contract & SLA (W6, W7) and computes SLA due dates; writes `sla_events(start)`;
    - writes `audit_events`, `ticket_status_history`;
    - queues notifications: contact "ticket received" (if `receives_notifications`), assignee "assigned to you", queue members if unassigned.

### W1b. Email intake
1. Poller reads **mailbox** (`email_mailboxes`) every N seconds; stores `inbound_emails`.
2. **Loop/dupe guard**: >2 messages same sender+subject within 5 min → reject & log [AT-C].
3. If subject contains a ticket number pattern `T\d{8}\.\d{4}` (or `In-Reply-To` matches a stored `email_message_id`) → **append note** (W2 step 6) with `note_type=email_in`, `visibility=customer`; if ticket status is Waiting Customer, move to configured "Customer replied" status (resumes SLA) [AT-C reply→note; status rule is Taskora/Workflow].
4. Else **new ticket**: subject → `title`, body → `description` [AT-C]; sender address → `contact_emails` lookup → contact & company; unknown sender → domain match on company website/known emails → else "Unknown sender" company/queue for triage.
5. Defaults from mailbox: queue, template, priority; `source=email`.
6. Attachments stored; inline images preserved.
7. Auto-acknowledge email to sender (template), unless sender is internal or no-reply.
8. Failures send a failure notice to the originator [AT-C] (configurable).

### W1c. Monitoring / Action1 alert [Phase 4]
1. Integration receives/derives an alert for an endpoint → finds CI by (`sync_source`, `external_id`).
2. If an open ticket exists with same `rmm_alert_ref` → add note instead of duplicate.
3. Else create ticket: `ticket_type=alert`, template "Monitoring alert" [AT-C: Alert type gets Alert category], queue "Monitoring alerts" (system), company from CI, CI linked, `source=monitoring`.
4. Contract & SLA resolve via the CI first [AT-C].

---

## W2. Technician ticket handling end-to-end [Phase 2; SLA parts Phase 5]

1. **Screen: My Work / Queue view** — list of tickets filtered by `assigned_user_id = me` or `queue_id in my queues`, sorted by SLA next due then priority. Columns: number, title, company, contact, status, priority, due, SLA badge, last activity.
2. **Accept** an unassigned queue ticket (row action or toolbar): sets `assigned_user_id = me`, `assigned_labor_role_id = my default role`; fails if a primary already exists (show who) [AT-C].
3. **Open Ticket detail** — layout:
   - Header: number, title, status, priority, type, SLA countdowns (first response / resolution plan / resolved).
   - Left panel: Company (link, alert), Contact (phone/email click-to-call), CI (link, key specs, Action1 deep link), Contract (Phase 5, with balance), Queue, Assignees, Issue/Sub-issue, Due, Estimate vs actual hours.
   - Centre: unified **activity timeline** (notes, emails, time entries, status changes, workflow notes, attachments) with filter internal/customer.
   - Right/bottom: Checklist, Related (problem/incidents, KB articles, other open tickets for this contact/CI).
4. **First contact**: tech replies to customer → **Add note** with `visibility=customer`, "Notify contact" checked, and **status change** to "In Progress" in the same dialog. System records `first_response` SLA event at the status-change time [AT-C: note + status change uses status-change time; In Progress maps to First Response by default].
5. **Diagnosis/work**: tech uses **Timer** (start/stop on ticket) or enters time directly → W4.
6. **Notes**: internal notes for team; customer notes emailed to contact (and other selected recipients). `append_to_resolution` option.
7. **Need customer input**: set status **Waiting Customer** → SLA clock **pauses** [AT-C]; optional workflow reminder after N business hours (Phase 6).
8. **Resolution plan** (optional): a status mapped to `resolution_plan` (e.g., "Plan Agreed") or note+status records the event [AT-C].
9. **Escalate/reassign**: **Forward/Modify** dialog = change queue/primary/secondary resources + internal note + optional notify, one save [AT-C concept].
10. **Resolve**: fill `resolution` (or build from flagged notes/time summaries), complete required checklist items ("important" items block completion — Taskora enforces; AT API doesn't [AT-C]), set status **Complete** → `resolved` SLA event, `completed_at`, `completed_by_user_id` [AT-C].
11. Notify contact with resolution (template). Optional "Create KB article from ticket" (W10).
12. Reopen: customer reply on a Complete ticket within X days → status "Reopened"/In Progress; `sla_events(reopen)`; resolved timestamps retained in history (Taskora rule; AT behaviour [AT-U]).

---

## W3. Dispatch / assignment [Phase 2 basic, Phase 5–6 calendar]

1. **Screen: Queue board** (Kanban by status or table) for dispatchers/queue owners.
2. Unassigned filter: `assigned_user_id is null` [AT-C: managers find unassigned tickets in queues].
3. Dispatcher selects ticket(s) → **Assign** dialog: primary resource + role, secondary resources (`ticket_secondary_resources`; primary can't also be secondary [AT-C]), optionally move queue.
4. Workload hint: each tech's open ticket count, hours scheduled today, and availability (Phase 5).
5. **Schedule on-site/remote slot** (Phase 5/6): "Schedule" → `appointments` (start, end, location, resources, ticket link). Calendar view per tech / multi-tech dispatch view [AT-C: dispatch calendar, service calls].
6. Notifications: assignee gets "assigned" email/in-app; contact optionally gets appointment confirmation.
7. Auto-routing (Phase 6 workflow): on create, if `sub_issue_type.queue_id` or `issue_type.queue_id` set → move to that queue [AT-C: issue type associated queue used by workflow rules]; if queue has owner → assign owner [AT-C dynamic value].

---

## W4. Time entry & approval [Phase 2 entry, Phase 5 approval]

### Entry (ticket)
1. From ticket: **Add time** (or stop timer). Dialog fields: date worked, start/end **or** hours (`hours_worked` 0<h≤24 [AT-C]), labor role (default = ticket's assigned role or user's default [AT-C]), work type (default from ticket/template [AT-C]), **summary notes** (required, customer-facing [AT-C]), internal notes, billable toggle, show on invoice, append to resolution, **status change** (optional, same dialog), notify contact.
2. Contract shown read-only (inherited from ticket on create [AT-C]); users with permission may override (Phase 5).
3. Validation: ticket not Complete unless setting allows [AT-C]; start/end required if contract `requires_start_stop` [AT-C]; general time must be non-billable [AT-C].
4. If status change included: SLA event time = **time entry start** for First Response, **end** for Resolution Plan/Resolved [AT-C].
5. After-hours: if entry falls outside business hours and work type has `after_hours_work_type_id`, suggest switching [AT-C field exists; auto-switch logic AT-U].

### Entry (general/internal)
6. **My Timesheet → New → Internal time**: category (meeting, admin, training, leave), hours per day, notes; always non-billable [AT-C].

### Timesheet approval (Phase 5)
7. Week end: tech opens **My Timesheet**, reviews totals per day vs target, **Submit** → status Submitted; entries locked [AT-C: entries added only to New/Rejected sheets].
8. Approver (**Approvals → Timesheets**): approve or reject with reason; with proxy permission can edit entries before approving [AT-C].

### Billing approval (Phase 5)
9. **Billing → Approve & Post → Labor**: lists approved, billable, unposted entries grouped by company/contract. Approver may adjust **hours to bill**, rate, billable flag, show-on-invoice [AT-C]; locked for per-ticket, recurring and fixed-price contracts [AT-C].
10. **Post** → creates `billing_items`; entries become immutable [AT-C]; block-hour / retainer balances decrement (W7).
11. Contract `labor_approval_mode` can skip manual approval: post on timesheet approval or immediately [AT-C].

---

## W5. SLA tracking [Phase 5; columns exist from Phase 2]

1. **Assignment of SLA** on ticket create/update: CI SLA → contract service SLA → contract SLA → template SLA → global default [AT-C order, last step Taskora]. Manual override allowed [AT-C].
2. **Objective match**: pick most-specific active objective in that SLA for (priority, type, template, issue, sub-issue); `null` = all [AT-C].
3. **Compute due dates** from ticket `created_at` using objective target mode (within N hours / end of day min N / end of next day min N) and timeframe (business / extended / 24x7) with the SLA's business hours & holidays [AT-C]. Store `first_response_due_at`, `resolution_plan_due_at`, `resolved_due_at`; if SLA `set_ticket_due_date` → `due_at = resolved_due_at` [AT-C].
4. **Events** are recorded when the ticket's status changes to a status mapped to an SLA event (`ticket_statuses.sla_event`) [AT-C]; event time depends on how the change happened (edit / note / time entry start or end / forward / workflow) [AT-C].
5. **Back-fill**: recording a later event fills earlier missing events with the same time; completing before first response sets first response [AT-C]. Initiating user stored.
6. **Pause**: status mapped to `waiting_customer` → set `sla_paused_since`, emit `pause`; leaving that status → add elapsed business seconds to `sla_paused_seconds`, emit `resume`, **shift all not-yet-met due dates** by the paused business time [AT-C pause; due-date shift implementation is Taskora's interpretation of "clock paused"].
7. **Met/missed**: when each event is recorded, compare to due → set per-event met flags in `sla_results`; elapsed hours computed in SLA business time, start rounded to end of first minute [AT-C]. `sla_met` = all applicable events met.
8. **Warnings**: background job every minute finds tickets with `*_due_at - now() < warn_threshold` and not met → emit `sla.warning` domain event; overdue → `sla.breached` (feeds notifications and workflow rules [AT-C: "SLA: Resolution Overdue by" event]).
9. **UI**: countdown chips on lists/detail (green → amber → red; grey when paused); SLA tab on ticket history; managers can edit SLA event times retroactively with audit [AT-C].
10. **SLA definition changes** do not alter existing tickets by default [AT-C]; Taskora adds an explicit "recalculate open tickets" admin action (improvement).
11. **Reporting**: SLA compliance by SLA/company/priority vs goal % [AT-C: SLA Performance by SLA].

---

## W6. Contract-covered vs billable time [Phase 5]

1. **Ticket contract resolution** on create (and on CI/company/sub-issue change):
   1. CI's contract if CI set and contract active & in date [AT-C];
   2. else company default service-desk contract (date-bound) [AT-C];
   3. else parent company default [AT-C];
   4. if sub-issue excluded by the resulting contract → its exclusion contract (and that contract's SLA) or none [AT-C].
2. **Time entry** inherits ticket contract; if labor role or work type excluded → exclusion contract or none (then billed at standard role rate × work-type multiplier) [AT-C].
3. **Coverage by contract type** (what billing does at posting):
   - **Time & Materials**: billable hours × (contract role rate ?? role rate) × work-type multiplier [AT-C].
   - **Block Hours**: billable hours × block hour factor deducted from oldest active block; when exhausted → overage at `overage_rate` or prompt to purchase new block; low-balance alert [AT-C].
   - **Retainer**: billable amount deducted from currency balance [AT-C].
   - **Per Ticket**: one ticket deducted when ticket completes, dated to ticket creation [AT-C]; labour not billed separately.
   - **Recurring Service**: labour covered (price locked; `show_on_invoice` disallowed) — billing is per service unit per period [AT-C]; time still tracked for profitability.
   - **Fixed Price**: labour price locked; billing via milestones [AT-C].
   - **No contract**: billable at standard rates (Taskora rule; AT fallback for "never had a contract" [AT-U]).
4. **UI**: ticket header shows contract chip with type and balance ("Block: 6.5 h left"); time entry dialog shows "Covered by Recurring Service — not billed" vs "Billable at €95/h".
5. **Non-billable** flag always wins (internal rework, goodwill).

---

## W7. CI lifecycle [Phase 3]

1. **Create**: manual (CI page → New; pick company, type, name, serial, location, contact, warranty) [AT-C fields], CSV import [AT-C], or integration sync (W8). Status `planned`/`in_stock`/`active`.
2. **Deploy**: set `status=active`, `install_date`, `installed_by_user_id`, `contact_id` (primary user), location.
3. **Relate**: add relationships (laptop → monitor `connected_to`, VM `runs_on` host) — n-level [AT-C two-level parent only; Taskora extends].
4. **Contract coverage** (Phase 5): link CI to recurring contract service → tickets on this CI get that contract & SLA automatically [AT-C].
5. **Service history**: CI page lists all tickets (`configuration_item_id`), time spent, notes, change history (`audit_events`) [AT-C: device history page].
6. **Repair**: status `in_repair` (optional linked ticket).
7. **Warranty watch** (Phase 6): workflow time event "warranty expires in N days" → notify account manager / create ticket [AT-C: "Past Warranty Expiration by" event].
8. **Retire/Dispose**: status `retired` → hidden from pickers, kept for history; `disposed` with date/notes. Never hard-delete [AT-C: no delete via API].

---

## W8. Action1 device sync → CI [Phase 4]

1. **Admin → Integrations → Action1**: enter API client credentials and region; **Test connection**.
2. **Org mapping screen**: list Action1 organizations (`GET /organizations` [Action1 docs]) → map each to a Taskora company (auto-suggest by name) → `integration_company_maps`.
3. **Default CI type mapping**: by OS family (Windows Server → Server, Windows 10/11 → Workstation/Laptop by chassis if available [AT-U on Action1 fields]).
4. **Scheduled sync job** (e.g. every 30–60 min, respecting ~30 req/min [Action1 docs]):
   1. For each mapped org, page through endpoints.
   2. Upsert CI by (`sync_source='action1'`, `external_id`); update hostname, OS, IPs, MAC, last user, manufacturer/model, RAM/disk, `last_seen_at`, `raw_data`, patch status / missing update count.
   3. New endpoints → create CI with `status=active`, company from mapping, `ci_type` from mapping.
   4. Endpoints not seen for N days → flag `stale` (badge), never auto-delete.
   5. Field changes written to `audit_events` (source = integration).
   6. `integration_runs` row with counts and errors; failures notify admins.
5. **Conflict policy**: integration-owned fields read-only in UI (lock icon); user-owned fields (contact, location, notes, contract) never overwritten.
6. **CI page**: "Open in Action1" deep link; patch summary; "Create ticket" pre-filled with CI.
7. (Optional) alert/missing-critical-patch → ticket (W1c).

---

## W9. Project delivery [Phase 5]

1. **Create project** from company (or from opportunity later): name, type (client/internal), lead, start/end, contract (T&M, fixed price, or block hours) [AT-C fields].
2. **Plan**: add phases (optionally sub-phases [AT-C]) and tasks with estimates, work type (required when assigned [AT-C]), assignee + role, dependencies.
3. **Kick-off**: set status Active; tasks appear in assignees' My Work alongside tickets.
4. **Execute**: techs log **task time** (summary notes required; start/stop if contract requires [AT-C]); update task status (shared status list [AT-C]) and remaining hours; completing a task zeros remaining hours [AT-C].
5. **Issues during project**: create ticket linked to project (`tickets.project_id`) [AT-C].
6. **Track**: project dashboard — % complete (hours), estimate vs actual, overdue tasks, budget.
7. **Bill**: per contract type — T&M via Approve & Post; fixed price via milestones marked Ready to Bill [AT-C].
8. **Close**: completing project completes remaining tasks [AT-C]; project post-mortem note.

---

## W10. Knowledge base use from a ticket [Phase 5]

1. On ticket detail, **Suggested articles** panel: FTS over `kb_articles.search_vector` using ticket title + description + issue/sub-issue names + tags (AT uses shared tags [AT-C]; Taskora adds FTS).
2. Tech opens article in side panel; **Link to ticket** → `kb_article_tickets` [AT-C ArticleTicketAssociations].
3. **Send to customer**: insert article link/content into a customer note — only if article visibility allows (internal vs customers vs specific company [AT-C publish levels]).
4. **Checklist from article** (optional): checklist items can reference a KB article [AT-C].
5. **Create article from ticket**: title ← ticket title, body ← description + resolution + notes/time summaries flagged `append_to_resolution`, keywords ← issue/sub-issue, tags copied; defaults: category "General", visibility internal, status draft (AT defaults to active/internal [AT-C]; Taskora uses draft for review).
6. Article updates create versions; linked tickets show "article updated" badge.

---

## W11. Workflow rules: triggers and actions [Phase 6]

### Authoring
1. **Admin → Automation → Rules → New**: name, description, entity (ticket first; later CI, contract, project, task), active, documentation URL [AT-C].
2. **Events** (OR) [AT-C structure]:
   - Immediate: `created`, `edited`, `status_changed`, `note_added` (filter by author: technician / contact / integration), `time_added`, `assigned`.
   - Time-based (value + unit; business or calendar time): `due_in`, `overdue_by`, `idle_for`, `sla_first_response_due_in`, `sla_resolution_overdue_by`, CI `warranty_expires_in`, contract `expires_in` / `block_balance_below`.
3. **Conditions** (AND, ≥5 allowed; Taskora also supports OR groups): field (incl. related entity & custom fields) + operator (`equals`, `in`, `not in`, `contains`, `changed`, `changed_to`, `changed_from`, `is_empty`) + value(s). Reject `changed*` on time-based events [AT-C restriction].
4. **Time window**: inside/outside business hours of a location or custom hours [AT-C].
5. **Updates** (static or dynamic values like `[account_manager]`, `[queue_owner]`, `[issue_type_queue]`) [AT-C]: status, priority, queue, assignee/role, template, ticket type, due date, custom fields. Changing template does **not** apply its defaults unless "apply template defaults" ticked (AT never applies [AT-C]; Taskora makes it optional).
6. **Actions**: add note (internal/customer; optional append to resolution) [AT-C], add checklist from library [AT-C], create ticket (from contract/CI/project rules) [AT-C], send webhook (AT extension callout) [AT-C], post to Teams/Slack webhook [AT-C Teams], create to-do/appointment [AT-C to-dos], send survey [AT-C].
7. **Notifications**: recipients (contact, primary, secondary, queue members/owner/other emails, account manager, specific users/emails), template, subject override, "don't notify initiator", create-note-from-notification, recurrence (≤10, stop when conditions no longer match, final updates) [AT-C].
8. **Test**: dry-run against an existing ticket shows which conditions match and what would change (Taskora addition).

### Runtime
9. Domain events (`ticket.created` with snapshot, `ticket.updated` with diff, ...) written to an outbox in the same transaction as the change.
10. Rule worker consumes events, evaluates matching active rules (sorted), applies updates as system user `Workflow`, logs `workflow_rule_runs`.
11. Updates produce new events → cascade up to depth 5 [AT-C]; time-based rule effects never trigger further rules [AT-C].
12. Time-based events: scheduler materialises `scheduled_triggers` when a ticket enters a qualifying state; re-evaluated (and cancelled) when the ticket changes; idle timers not reset by rule-made changes [AT-C].
13. Rules apply only to tickets created/edited after the rule exists (AT [AT-C]); Taskora offers "apply to existing open tickets" as an explicit admin action.

### Seed rules (examples)
- New ticket from email with no contact match → assign queue "Triage", notify queue owner.
- Ticket in Waiting Customer idle for 3 business days → customer reminder (repeat 2×), then set status Complete with note.
- SLA first response due in 30 minutes and unassigned → notify queue owner + Teams.
- Sub-issue "Password reset" → priority Low, queue "Service Desk L1".
- Block-hour balance < 10% → notify account manager.

---

## Confirmed vs uncertain

- **Confirmed [AT-C]**: ticket number format; template/category defaults; contact/CI company constraints; accept-ticket rules; status→SLA mapping and pause semantics; SLA event timing sources and back-fill; SLA objective matching; contract precedence & exclusions; time entry rules (hours range, summary notes, inheritance, general time non-billable, start/stop); timesheet & Approve & Post behaviours and contract-type locks; Per Ticket deduction on completion; KB from ticket mapping & publish levels; workflow rule structure, limits, cascade depth, time-based restrictions; email intake subject→title, ticket number in subject → note, loop limit.
- **Uncertain [AT-U] / Taskora design**: reopen behaviour; how AT shifts due dates during pause (we implement shifting); after-hours work type auto-switch; billing of time with no contract; Action1 endpoint field names and alert API; ticket detail layout; most UI specifics.

## Sources

- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/TicketsEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/TicketNotesEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/TimeEntriesEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/ConfigurationItemsEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/ContractsEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/ContractTicketPurchasesEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/ContractBlocksEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/ServiceLevelAgreementResultsEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/TicketChecklistItemsEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/TasksEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/ProjectsEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/KnowledgeBaseArticlesEntity.htm
- https://autotask.net/help/Content/3_Features/7_ServiceDeskAutomation/ServiceLevelManagement/SLAMAIN.htm
- https://autotask.net/help/Content/4_Admin/2FeaturesSettings/ServiceDeskTickets/SLAAdmin/SLAAddEdit.htm
- https://autotask.net/help/Content/4_Admin/2FeaturesSettings/ServiceDeskTickets/SLAAdmin/SLAstatusmapping.htm
- https://autotask.net/help/Content/4_Admin/2FeaturesSettings/ServiceDeskTickets/Tickets/IssueandSubIssueTypes.htm
- https://autotask.net/help/Content/4_Admin/2FeaturesSettings/ServiceDeskTickets/Tickets/QueuesManage.htm
- https://autotask.net/help/Content/4_Admin/3Automation/WorkflowRules/AUTOTASK_WFR.htm
- https://autotask.net/help/Content/4_Admin/3Automation/WorkflowRules/WorkflowRulesCreatingEditing.htm
- https://autotask.net/help/Content/3_Features/6_Contracts/AdminGeneral/BusinessCaseContracts.htm
- https://autotask.net/help/Content/3_Features/6_Contracts/AdminGeneral/ApplyContractToTicketProject.htm
- https://autotask.net/help/Content/3_Features/10_Billing/ApprovePost/Approve_Post.htm
- https://autotask.net/help/Content/3_Features/7_ServiceDesk/ManageTickets/AssignAcceptTickets.htm
- https://autotask.net/help/content/3_Features/7_ServiceDesk/Workflows/Basic_Ticket_Workflow.htm
- https://autotask.net/help/Content/3_Features/7_ServiceDeskAutomation/Dispatching/DISPATCHLANDING.htm
- https://autotask.net/help/Content/3_Features/4_Assets/ASSET_OVERVIEW.htm
- https://autotask.net/help/Content/3_Features/7_Knowledgebase_Documentation/Knowledgebase/UsingKBwithAT.htm
- https://autotask.net/help/Content/3_Features/7_Knowledgebase_Documentation/Knowledgebase/New_Article_From_Ticket.htm (via search summary)
- https://autotask.net/help/Content/2_Getting_Started/Timesheets/TimeEntryRegular.htm
- https://autotask.net/help/content/2_Getting_Started/Timesheets/ApproveRejectTimesheets.htm (via search summary)
- https://autotask.net/help/Content/4_Admin/3Automation/EmailSurvey/EMAILS/IncomingEmailProcessing/Loops_Dupes.htm (via search summary)
- https://www.action1.com/api-documentation/making-example-calls/ (via search summary)
