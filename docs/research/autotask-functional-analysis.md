# Autotask PSA — Functional Analysis for Taskora

> Purpose: give Taskora engineers a module-by-module understanding of how Datto/Kaseya Autotask PSA behaves, based **only on public documentation** (Autotask online help and the REST API entity reference). Everything here is summarised in our own words. Taskora is an original implementation; we copy *concepts*, not code, UI, or text.
>
> Legend used throughout:
> - **[C]** = confirmed from a public Autotask source (see Sources at the end; source shorthand in brackets, e.g. `[C: Tickets entity]`).
> - **[U]** = uncertain / assumed / inferred from naming or third-party material. Verify before relying on it.
> - **Taskora →** = what Taskora should keep, simplify, or improve.

---

## 0. Big picture

Autotask is organised around a CRM core (Organizations/"Companies", Contacts, Locations) with operational modules hanging off it: Service Desk (tickets), Devices/CIs (CMDB), Contracts & Billing, Projects, Inventory, Knowledge Base, Time & Timesheets, Scheduling, Workflow Rules, Reporting. Almost every operational record carries a `companyID`, and most configurable behaviour is driven by **picklists** (statuses, priorities, queues, issue types...) and **categories** (per-entity form layouts with field defaults/requirements). [C: Companies overview, Tickets entity, Intro to categories]

Key architectural traits worth copying:
1. **Company is the tenant-of-work**: tickets, contacts, CIs, contracts, projects must belong to a company (or its parent). Related references on a ticket (contact, CI, project, opportunity) must belong to the ticket's company or its parent. [C: Tickets entity]
2. **Picklists everywhere** with `isActive` semantics: inactive values remain on old records but cannot be newly assigned. [C: Tickets entity]
3. **Contract + Role + Work type** determine the price of every time entry; SLA is derived from CI → contract service → contract → ticket category. [C: Tickets entity, How contracts are applied]
4. **Event-driven automation** (workflow rules) on create/edit/time-based events with conditions, updates and notifications. [C: Workflow rules]
5. **UTC storage** for all datetimes; per-resource and per-location time zones for display and business-hour calculations. [C: Tickets entity, Queues]

Taskora → keep these four pillars, but collapse Autotask's dozens of legacy concepts (e.g. "configurationItemType" vs "configurationItemCategory", deprecated billing code fields, SOAP-era naming) into a smaller, consistent model.

### Technician navigation chain

The core "follow the work" chain an MSP technician uses daily. Taskora must make every hop one click, in both directions:

```
Company ──< Contact
   │            │ (ticket.contact_id)
   ├──< Ticket >┘──── CI (ticket.configuration_item_id) ──> Product / CI type
   │      │                      │
   │      ├──< Time Entry ───────┤ (time_entry.contract_id inherited from ticket)
   │      │         │            │
   │      └── Contract <─────────┘ (CI.contract_id has precedence for ticket contract)
   │              └── SLA (via CI → contract service → contract → category)
   └──< Contract / CI / Location / Project
```

- Company → Contact: Contacts are children of a company; one `primaryContact` per company. [C: Contacts entity]
- Contact → Ticket: `Tickets.contactID` must belong to the ticket company (or parent). [C: Tickets entity]
- Ticket → CI: `Tickets.configurationItemID`; CI must belong to the same company/parent. [C]
- Ticket → Time Entry: `TimeEntries.ticketID`; ticket entries require `summaryNotes`. [C: TimeEntries entity]
- Time Entry → Contract: `TimeEntries.contractID` is inherited from the ticket on create; exclusions may redirect to the exclusion contract. [C: TimeEntries entity, How contracts are applied]
- CI → Contract: `ConfigurationItems.contractID` (+ `contractServiceID` / `contractServiceBundleID`); a CI's contract overrides the default contract when the CI is on the ticket. [C: CI entity, How contracts are applied]

---

## 1. Dashboard & navigation

**What it does.** Autotask has a configurable home dashboard made of tabs with widgets. Each data widget is bound to a single entity (tickets, time entries...) and only sees that entity's data; HTML widgets hold static content. Up to 24 data widgets per tab; a library of pre-built widgets exists. Creating/editing widgets is a security-level permission. [C: About dashboard widgets]
Navigation is via a left navigation menu (CRM, Service Desk, Projects, Contracts, Inventory, Reports, Admin...) plus "My" workspace pages (My Tickets, My Timesheets, calendar). [C: various help page breadcrumbs, e.g. "Left Navigation Menu > Admin > Admin Categories > Activations"] Global search exists in the product but no public help page was retrieved. [U]

**Key user actions.** Add/arrange widgets; drill from widget into list; open records in new tabs; access "My Work" lists; quick-create (ticket, time entry).

**Taskora →**
- P0 dashboard: fixed technician home (My open tickets, Tickets by status in my queues, SLA at risk, Today's time vs target) + manager home (queue load, unassigned, SLA breach count).
- Widgets as declarative JSON (entity, filter, group-by, visualisation) stored per user/role so they are later reusable by Reports (Phase 6).
- Left nav fixed; command palette (Ctrl+K) for global search and quick-create — a clear UX improvement over Autotask's menu depth.

---

## 2. Service Desk (tickets)

### 2.1 Concept
A ticket is the reactive work unit (projects are the planned unit). Ticket number format is `T` + `YYYYMMDD` + `.` + daily counter, e.g. `T20230719.0007`. [C: Intro to tickets, Tickets entity]
Ticket types: **Service Request** (default), **Incident**, **Problem**, **Change Request** (requires Change Management), **Alert** (RMM-generated; Alert tickets get the Alert category). [C: Ticket types]
Problem/Incident linking: only Incidents link to a Problem (`problemTicketId`); Problems can't change type while incidents are linked; Change Requests can't have a problem link. [C: Tickets entity]
Tickets can be standalone or part of a **recurring series**. [C: Intro to tickets]

### 2.2 Key ticket fields (REST names) [C: Tickets entity]
| Group | Fields |
|---|---|
| Identity | `id`, `ticketNumber`, `title` (255, required), `description` (8000, rich text), `externalID`, `createDate`, `creatorResourceID`, `creatorType`, `createdByContactID` |
| Customer | `companyID` (required), `companyLocationID`, `contactID`, `configurationItemID`, `opportunityID`, `projectID` |
| Classification | `ticketType`, `ticketCategory`, `issueType`, `subIssueType` (depends on issueType), `priority` (required), `status` (required), `source`, `queueID` |
| Assignment | `assignedResourceID`, `assignedResourceRoleID` (resource+role must belong to ≥1 queue), secondary resources (child entity), `completedByResourceID`, `completedDate` |
| Scheduling | `dueDateTime` (required unless the category defines default due date+time), `estimatedHours`, `hoursToBeScheduled` (RO) |
| Billing | `contractID`, `contractServiceID`, `contractServiceBundleID`, `billingCodeID` (work type), `purchaseOrderNumber` |
| SLA (RO) | `serviceLevelAgreementID` (writable), `firstResponseDateTime`, `firstResponseDueDateTime`, `firstResponseAssignedResourceID`, `firstResponseInitiatingResourceID`, `resolutionPlanDateTime`, `resolutionPlanDueDateTime`, `resolvedDateTime`, `resolvedDueDateTime`, `serviceLevelAgreementHasBeenMet`, `serviceLevelAgreementPausedNextEventHours` |
| Resolution | `resolution` (32000, rich text) |
| Activity | `lastActivityDate`, `lastActivityResourceID`, `lastActivityPersonType`, `lastCustomerNotificationDateTime`, `lastCustomerVisibleActivityDateTime`, `lastTrackedModificationDateTime` |
| ITIL | `problemTicketId`, `changeApprovalBoard`, `changeApprovalStatus`, `changeApprovalType`, `changeInfoField1..5` |
| RMA | `rmaStatus`, `rmaType` |
| RMM | `monitorID`, `monitorTypeID`, `rMMAlertID` (RO, Datto RMM only), `apiVendorID` |
| Other | `currentServiceThermometerRating`, `previousServiceThermometerRating`, `serviceThermometerTemperature`, `isVisibleToComanaged`, `isAssignedToComanaged`, up to 300 UDFs |

Child entities: attachments, notes, charges, checklist items, secondary resources, tag associations. Tickets cannot be deleted via API. [C]

### 2.3 Business rules worth replicating [C: Tickets entity unless noted]
- **Company change** is blocked once posted time/charges/expenses exist; otherwise changing company clears contract, unposted time and costs.
- **Contract & exclusions**: if the sub-issue type is excluded from the ticket's contract, the ticket moves to the exclusion contract (or none).
- **SLA default order**: CI's SLA → contract service/bundle SLA → contract SLA → ticket-category SLA.
- **Category default**: if no category given, resource's default category, else company default.
- **Queue requirement** is category-driven: always / never / only when no primary resource.
- **Issue & sub-issue** are not API-required; UI requires them only if a system setting is on; sub-issue requires issue.
- **Priority** must be active on create.
- **Rich text**: the API only handles plain text; editing via API strips formatting. Taskora → store rich text as sanitized HTML/Markdown and keep API and UI symmetric (improvement).
- **Completing a ticket** can bypass incomplete "important" checklist items via API. Taskora → enforce consistently (configurable).

### 2.4 User actions
New ticket (from company, contact, CI, email, portal, RMM alert, workflow rule), Accept ticket (sets self as primary; uses default service-desk role; blocked if already has a primary) [C: Assigning tickets], Edit, Forward/Modify (reassign + note in one step) [C: SLA page lists "Forward or modify"], Add note, Add time entry, Add charge, Add attachment, Add to service call, Mark as incident/problem, Create KB article from ticket, Complete.

**Taskora →**
- Keep the field set but group into a clean core; ITIL change fields (CAB) and RMA → P2/later.
- Replace integer picklists with FK tables (`ticket_statuses`, `ticket_priorities`, ...) with stable `code` columns so workflows/SLA logic reference codes, not ids.
- Implement "Accept" and "Forward/Modify" as first-class actions.

---

## 3. Ticket queues & ticket detail

### 3.1 Queues [C: Service Desk queues]
- Fields: Name (unique), Active, **Internal Location** (required; drives time zone), Number, Appears in Client Portal, Description, up to 4 "Other email" groups (for workflow notifications), Resources (members) with optional **Owner** flag.
- System queues: Client Portal, Post Sale, Monitoring Alert (renamable, not deletable).
- A resource can work tickets only if a member of ≥1 queue. A ticket sits in exactly one queue; it can have a queue, a resource, or both. [C: Assigning tickets]
- Issue types can have an associated queue used by workflow rules to route. [C: Issue types]
- Deletion only if unused; otherwise inactivate.

### 3.2 Ticket detail page
Public help confirms: ticket type controls which accessory tabs/tools appear [C: Ticket types]; categories control which fields show on New/Detail/Edit pages, defaults, required flags (up to 100 categories per entity) [C: Intro to categories]; activity feed records workflow notes [C: Workflow rules: "a note appears in the Activity feed"]; ticket history has an SLA tab where admins/managers can edit SLA dates retroactively [C: SLA main]; Tags section with "View Potential Solutions" (KB articles by shared tags) [C: Using KB]. Exact layout (left "insights" panel vs right activity feed) — [U].

**Ticket categories** [C: TicketCategories, TicketCategoryFieldDefaults]: `name` (30), `nickname` (3), `displayColorRGB`, `isActive`, `isApiOnly`, `isGlobalDefault`. Field defaults per category: `title`, `description`, `estimatedHours`, `issueTypeID`, `subIssueTypeID`, `priority`, `queueID`, `serviceLevelAgreementID`, `sourceID`, `status`, `ticketTypeID`, `workTypeID`, `purchaseOrderNumber`, `resolution`. Category settings also include "Require titles on ticket notes" [C: TicketNotes entity] and due-date/time defaults [C: Tickets entity].

**Taskora →** Simplify categories to "ticket templates": a template = defaults + required-field set + visible-section set. Don't build a full per-category layout designer in v1.

### 3.3 Classification hierarchy [C: Issue/sub-issue types; Tickets entity; SLA main]
```
Ticket Type (fixed enum: Service Request | Incident | Problem | Change Request | Alert)
Ticket Category (form/template; independent of type)
Issue Type (admin list; optional associated queue; active flag)
  └── Sub-Issue Type (belongs to exactly one issue type; "Excluded from New Contracts" flag)
Priority, Status, Source, Queue (independent picklists)
```
Issue/sub-issue types drive routing (via workflow rules and the issue's queue), contract exclusions (sub-issue level), SLA objective matching, search and reporting.

### 3.4 Statuses [C: Task & ticket statuses; SLA status mapping]
- One status list shared by tickets and tasks.
- System statuses: **New**, **Waiting Customer**, **Complete** (+ statuses used by email/duplicate handling); cannot be inactivated or renamed.
- Per status: icon, colour, name, **SLA event mapping** (one event per status, many statuses per event), Active, display order.
- Default SLA mapping: New → none; Waiting Customer → Waiting Customer; Complete → Resolved; all other statuses → First Response.
- If Resolved is mapped to a non-Complete status, the ticket isn't auto-closed.

### 3.5 Notes [C: TicketNotes entity]
Fields: `ticketID`, `title` (250; required if the category says so), `description` (32000), `noteType` (picklist), `publish` (picklist: visibility — e.g. internal only vs all), `createDateTime`, `creatorResourceID`, `createdByContactID`, `lastActivityDate`. noteType 13 = System Workflow Note [C]. Other noteType/publish values [U]. Notes can't be deleted via API.

**Taskora →** `ticket_notes` with `visibility` enum (`internal`, `customer`) and `note_type` enum (`manual`, `email_in`, `email_out`, `workflow`, `system`), plus `is_resolution` flag to optionally append to resolution (Autotask allows appending note/time summaries to resolution and KB [C: KB from ticket]).

---

## 4. Companies (Organizations)

[C: Companies entity, Overview of organizations]
- **Types** (fixed): Customer, Lead, Prospect, Dead, Cancelation, Vendor, Partner. Dead/Cancelation can't receive tickets via email/API.
- **Hierarchy**: strictly two levels (parent → sub-organizations); sub-orgs have own billing, can bill parent.
- Key fields: `companyName` (required), `companyNumber`, `companyType` (required), `phone`, `fax`, `webAddress`, address (`address1/2`, `city`, `state`, `postalCode`, `countryID`), `parentCompanyID`, `ownerResourceID` (account manager), `classification`, `territoryID`, `marketSegmentID`, `companyCategoryID`, `isActive`, `taxRegionID`, `isTaxExempt`, `currencyID`, `invoiceMethod`, billing address fields, `isClientPortalActive`, `lastActivityDate`, `createDate`, up to 200 UDFs.
- Child entities: Contacts, Locations, Notes, Attachments, Alerts, Site configurations, Teams, To-dos.
- Locations: up to 5,000 per org; contracts can't attach to locations; work billed to org but tracked by location.

**Taskora →** P0: name, number/short code, type, parent, account manager, phone, website, primary location, active, notes. Billing/invoice fields deferred to Phase 5. "Company alerts" (banner text shown when opening the company/ticket) is cheap and very useful → P1.

## 5. Contacts
[C: Contacts entity]
- Fields: `companyID` (required), `firstName`, `lastName` (required), `title`, `emailAddress`, `emailAddress2`, `emailAddress3` (used for email→ticket matching), `phone`, `extension`, `mobilePhone`, `alternatePhone`, `companyLocationID` (address auto-fills from location), address fields, `isActive` (required), `primaryContact` (one per company), `receivesEmailNotifications`, `billingContact`, `externalID`, `note`, social URLs, opt-out flags.
- Cannot delete if referenced by tickets/tasks/KB etc.

**Taskora →** Keep emails as a child table `contact_emails` (unlimited, one primary) for email intake matching; soft-delete only. Add `is_vip` flag (common MSP need) [Taskora addition].

## 6. Company locations
[C: CompanyLocations entity] `companyID`, `name` (required), `address1/2`, `city`, `state`, `postalCode`, `countryID`, `phone`, `fax`, `description`, `isActive`, `isPrimary` (one per company), tax fields, `roundtripDistance`.
**Taskora →** Same, add `timezone` (Autotask uses internal locations for TZ; customer location TZ is a useful addition for on-site scheduling).

---

## 7. Configuration Items (Devices / Assets)

[C: ConfigurationItems entity, Device overview]
- A CI ("device", "asset", "installed product") is **a product from the product catalogue linked to a customer**. `productID` is required.
- Fields: `companyID` (required, immutable), `companyLocationID`, `contactID`, `productID`, `configurationItemCategoryID`, `configurationItemType` (legacy), `referenceTitle` (name), `referenceNumber`, `serialNumber`, `installDate`, `installedByID`, `warrantyExpirationDate`, `isActive`, `location` (free text area), `notes` (5000), `parentConfigurationItemID` (two-level parent/child), `vendorID`, `contractID`, `contractServiceID`/`contractServiceBundleID`, `serviceLevelAgreementID`, costs (`dailyCost`, `hourlyCost`, `monthlyCost`, `perUseCost`, `setupFee`), `numberOfUsers`, domain fields (Domain category), SSL fields (cert category, RO), **RMM audit fields** (RO: hostname, IP, MAC, OS, last user, manufacturer, model, memory/storage bytes, patch status, missing patch count, open alert count, `rmmDeviceUID`, `rmmDeviceID`), Datto BCDR fields, `apiVendorID`, `lastModifiedTime`, up to 500 UDFs (protected/encrypted UDFs supported).
- Versioning: updates create new versions; history visible in UI only.
- RMM alerts create tickets already linked to the CI; workflow rules route by issue type, device category, org. [C: Device overview]
- CI contract overrides the default contract on tickets; CI SLA is first in the SLA default chain. [C]

**Taskora →**
- `configuration_items` with explicit sync columns (`source`, `external_id`, `last_seen_at`, `hostname`, `os_name`, `os_version`, `ip_addresses`, `mac_addresses`, `manufacturer`, `model`, `cpu`, `ram_bytes`, `disk_bytes`, `last_user`, `agent_version`) instead of 40 vendor-specific columns; vendor-specific raw payload in `jsonb`.
- `ci_history` (field-level audit) + `ci_relationships` (n-level, typed) — improvement over Autotask's two-level parent only.
- `product_id` optional in Taskora (MSPs often don't maintain catalogues); use `ci_type_id` as the primary classification.

## 8. Products & CI types/categories

[C: Products, ConfigurationItemTypes, ConfigurationItemCategories entities]
- **Products**: `name`, `description`, `sKU`, `manufacturerName`, `manufacturerProductName`, `productCategory`, `defaultVendorID`, `vendorProductNumber`, `unitCost`, `unitPrice`, `mSRP`, `markupRate`, `isSerialized`, `isEligibleForRma`, `doesNotRequireProcurement`, `periodType`, `billingType`, `chargeBillingCodeID`, `defaultInstalledProductCategoryID`, `isActive`.
- **ConfigurationItemTypes** (legacy): `id`, `name` (unique), `isActive`.
- **ConfigurationItemCategories**: `name`, `nickname` (3), `displayColorRGB`, `isActive` (max 200 active), `isGlobalDefault`, `isClientPortalDefault`; child `ConfigurationItemCategoryUdfAssociations` (which UDFs apply). Categories control CI page layout; "device types are no longer used". [C: Configuring device settings]

**Taskora →** Single concept `ci_types` (Workstation, Laptop, Server, Network device, Printer, Mobile, Virtual machine, Software licence, Domain, SSL cert, Other) with per-type custom-field set. Products optional catalogue (Phase 5 with billing/inventory).

---

## 9. Contracts

### 9.1 Types [C: Business cases & contract types; Contracts entity; ContractBlocks/Retainers/TicketPurchases entities]
| Type (UI) | API name | Billing model | Child purchase entity |
|---|---|---|---|
| Time & Materials | Time and Materials | Hourly labour at contract-level role rates (overrides); materials billed | — (rates) |
| Fixed Price | Fixed Price | Fixed amount billed via **milestones** (Ready to Bill); labour cost tracked for profitability, labour price locked | ContractMilestones [U name] |
| Block Hours | Block Hours | Prepaid hour blocks drawn down by billable labour; role-based hour multipliers ("hour factors"); overage rate when exhausted; auto-repurchase/alerts | `ContractBlocks` (`hours`, `hourlyRate`, `startDate`, `endDate`, `datePurchased`, `hoursApproved`, `isPaid`, `status`), `ContractBlockHourFactors` |
| Retainer | Retainer | Prepaid **currency** balance drawn by labour at contract rates and charges | `ContractRetainers` (`amount`, `amountApproved`, dates, `isPaid`, `status`) |
| Per Ticket | **Incident** | Prepaid number of tickets; a ticket is deducted on completion (dated to creation) | `ContractTicketPurchases` (`ticketsPurchased`, `ticketsUsed`, `perTicketRate`, dates) |
| Recurring Service | Recurring Service (contractType = 7) | Fixed price per unit per period (monthly/quarterly/semi-annual/yearly), prorated mid-period changes; services & bundles; CIs linked to contract apply it to tickets | `ContractServices` (`serviceID`, `unitPrice`, `unitCost`, `invoiceDescription`), ContractServiceUnits, ContractServiceBundles |

"Per Ticket" = API "Incident" is inferred from naming and from `ContractTicketPurchases` being restricted to Per Ticket contracts. [C for the restriction; mapping strongly supported]
Block Hour, Fixed Price, Per Ticket and Retainer types can be deactivated via Admin > Activations. [C]
Umbrella contracts can combine multiple arrangements; billing rules by contact/device exist. [C]

### 9.2 Contract fields [C: Contracts entity]
`contractName` (required), `contractNumber`, `contractType` (required), `contractCategory`, `companyID` (required; active Customer companies only), `contactID`, `billToCompanyID`, `billToCompanyContactID`, `startDate`, `endDate` (required), `status` (required), `serviceLevelAgreementID`, `isDefaultContract`, `description`, `estimatedCost/Hours/Revenue` (required except Recurring), `contractPeriodType` & `setupFee` (Recurring), `overageBillingRate`, `purchaseOrderNumber`, `opportunityID`, `renewedContractID`, `contractExclusionSetID`, `exclusionContractID`, `billingPreference` (2 = Reconcile/manual is default), `timeReportingRequiresStartAndStopTimes` (0/1), `isCompliant`, up to 50 UDFs.

### 9.3 Exclusions [C: How contracts are applied; ContractExclusionSets; Issue types]
- Exclusion sets (reusable: `name`, `description`, `isActive`) list excluded **roles** and **work types**; sub-issue types can be excluded per contract.
- An excluded time entry goes to the contract's **exclusion contract**, else contract cleared and billed at admin role rates × work type multiplier.
- `Roles.isExcludedFromNewContracts`, `BillingCodes.isExcludedFromNewContracts`, sub-issue "Excluded from New Contracts" control defaults for new contracts.

### 9.4 Contract application precedence on tickets [C: How contracts are applied]
1. Contract of the CI on the ticket. 2. Company default service-desk contract (`isDefaultContract`, date-range bound). 3. Parent company default. 4. Sub-issue exclusion → exclusion contract (and its SLA). Users with permission can override manually; expired contracts selectable but only apply to time dated within range.

**Taskora →** Phase 5. Model contracts as one table + `contract_type` enum + type-specific child tables (`contract_blocks`, `contract_retainers`, `contract_ticket_purchases`, `contract_services`, `contract_milestones`), plus `contract_rates` (role rate overrides) and `contract_exclusions`. Implement the precedence resolver as a pure function (`resolveTicketContract(ticket)`) with unit tests.

## 10. SLAs

[C: SLA main, Adding/editing SLAs, SLA status mapping, SLA results entity, Tickets entity]
- **SLA** = name, description, business-hours source (an internal location's hours, or custom hours with holiday set), "use SLA to set ticket due date" (Resolved target drives `dueDateTime`), goal % per event (First Response, Resolution Plan, Resolved).
- **Objectives** (rows within an SLA): match on Priority × Ticket Type × Ticket Category × Issue Type × Sub-Issue Type with `[All]` wildcards; combination unique per SLA; most specific match wins (evaluated Priority first, then type, category, issue, sub-issue as tie-breakers); one default all-`[All]` objective that can't be deactivated.
- Targets per event: *Within N hours*, *End of Day – min N hours*, *End of Next Day – min N hours*; timeframe: Business Hours, Extended Hours, or All (24×7). Holidays respected.
- **Events**: First Response (clock running), Resolution Plan (running), Waiting Customer (paused; resumes on next status change), Resolved (stopped). Events fire when the ticket status changes to a status mapped to that event.
- **Event time source**: ticket edit time; status-change time on note; time-entry *start* for First Response and *end* for Resolution Plan/Resolved (retroactive); forward/modify time; workflow rule fire time.
- **Back-fill**: if a later event is recorded first, missing earlier events inherit its timestamp; completing before first response sets first response automatically.
- **Rounding**: start rounded to end of first minute.
- Ticket stores `firstResponseDueDateTime`, `resolutionPlanDueDateTime`, `resolvedDueDateTime`, the actual datetimes, `serviceLevelAgreementHasBeenMet`, and `serviceLevelAgreementPausedNextEventHours` (set on entering Waiting Customer, cleared on leaving).
- **ServiceLevelAgreementResults** (RO): per ticket — `serviceLevelAgreementName`, `firstResponseElapsedHours`, `isFirstResponseMet`, `firstResponseResourceID`, `firstResponseInitiatingResourceID`, `resolutionPlanElapsedHours`, `isResolutionPlanMet`, `resolutionPlanResourceID`, `resolutionElapsedHours`, `isResolutionMet`, `resolutionResourceID`.
- Changing an SLA doesn't recalc existing tickets. Admin/manager can edit SLA dates retroactively.
- Workflow-rule time events: e.g. "SLA: Resolution Overdue by" with SLA minutes/hours measured in SLA business hours. [C: Workflow rules creating/editing]

**Taskora →** P0 for Phase 5 but put the **SLA columns on tickets in Phase 2** (nullable) so no migration pain. Implement an `sla_events` append-only table (ticket_id, event, occurred_at, resource_id, source) + computed `ticket_sla_state` (due dates, paused_seconds, met flags). Use a business-calendar library with holiday sets.

## 11. Time tracking

[C: TimeEntries entity, Entering regular time, Approve & Post, Approving timesheets]
- One `TimeEntries` table for three kinds: **ticket** (`ticketID`), **task** (`taskID`), **general/regular** (neither; uses `internalBillingCodeID` category such as meeting/admin/holiday/sick; always non-billable). `timeEntryType` picklist distinguishes (2 = ticket, 6 = project task are documented examples).
- Fields: `resourceID` (required), `roleID` (required), `dateWorked`, `startDateTime`, `endDateTime`, `hoursWorked` (0 < h ≤ 24; computed from start/end if empty), `hoursToBill` (RO), `offsetHours`, `summaryNotes` (required for ticket/task entries; customer-facing — invoices, notifications, portal), `internalNotes` (never shown to customers), `billingCodeID` (work type; inherited from ticket/task), `contractID` (+ service/bundle; inherited), `isNonBillable`, `showOnInvoice` (not allowed on Fixed Price/Recurring), approval fields (`billingApprovalDateTime`, `billingApprovalResourceID`, `billingApprovalLevelMostRecent`), audit fields.
- Start/stop times required when the project/contract demands it (`timeReportingRequiresStartAndStopTimes`).
- **Timesheets**: weekly per resource; statuses New/Submitted/Approved/Rejected (entries can only be added to New or Rejected timesheets) [C]; timesheet approval is separate from **billing approval** (Approve & Post) by default; contract billing preference can post labour on timesheet approval or immediately. [C]
- Proxy time entry permission lets a user enter time for others. [C]
- Approved & posted entries are immutable. [C]

**Taskora →** Phase 2: ticket time entries (start/end or duration, work type, role, billable flag, summary + internal notes, "append to resolution"), simple per-ticket timer. Phase 5: weekly timesheet submit/approve, billing approval & posting, contract deduction.

## 12. Work types / billing codes / roles

[C: BillingCodes, Roles entities]
- **BillingCodes** (allocation codes) is a unified table with `useType`: 1 Work Types (labour), 2 Expense categories, 3 Regular/internal time, 4 Material, 5 Services, 6 Milestones. Fields: `name`, `description`, `externalNumber`, `billingCodeType`, `afterHoursWorkType` (link to another work type), `department`, `generalLedgerAccount`, `taxCategoryID`, `unitCost`, `unitPrice`, `markupRate`, `isActive`, `isExcludedFromNewContracts`.
- Work types carry a rate **multiplier** (inferred from "billed at Admin role rates with work type multipliers") [C for multiplier concept; exact field name U].
- **Roles**: `name`, `description`, `hourlyRate` (standard bill rate), `hourlyFactor`, `isActive`, `isExcludedFromNewContracts`, `isSystemRole`, `roleType`. Resources have a set of roles and a default service-desk role.
- **Price of labour** = role rate (or contract rate override) × work-type multiplier (× block-hour factor for block contracts). [C/U composite]

**Taskora →** Split into `work_types` (labour: name, multiplier, billable default, after_hours_work_type_id), `internal_time_categories`, and later `billing_items`/`products`. Keep `roles` with default rate.

## 13. Resources (users)

[C: Resources entity]
Fields: `firstName`, `lastName`, `email` (+2,3), `userName`, `title`, `isActive`, `locationID` (primary internal location → TZ/business hours), `resourceType`, `userType`/security level, `licenseType`, phones, `defaultServiceDeskRoleID`, `payrollIdentifier`, `hireDate`, `internalCost`, `travelAvailabilityPct`, date/time/number formats. Child entities: roles, skills, availability, time-off balances, approvers, attachments. Resources cannot be created via API (only UI). [C]

**Taskora →** `users` (auth identity) + `resources` view = users with `is_technician`. Roles/permissions RBAC table (`security_roles`) separate from billing `roles` — Autotask overloads "role"; Taskora names billing roles `labor_roles` to avoid confusion.

## 14. Scheduling / dispatch

[C: Dispatching landing; ServiceCalls entity; Basic ticket workflow]
- Personal calendar + shared **Dispatch Calendar** (multi-resource), color-coded calendar items: service calls, appointments, to-dos.
- **Service Call** = scheduled time block for a company (`companyID`, `companyLocationID`, `startDateTime`, `endDateTime`, `duration`, `description`, `status`, `isComplete`, cancellation fields) that can contain multiple tickets (`ServiceCallTickets`) and tasks (`ServiceCallTasks`), each with assigned resources (`ServiceCallTicketResources`, `ServiceCallTaskResources`).
- Statement of Work printable from a service call.
- Workflow event "Ticket added to work list" and "add to primary resource's work list" action exist. [C]

**Taskora →** Phase 6 (or late 5): `appointments` table (resource, start, end, ticket_id/task_id nullable, company_id, location_id, status). Skip the service-call → ticket → resource three-level indirection; an appointment links to one ticket or task and N resources.

## 15. Projects / phases / tasks

[C: Projects, Phases, Tasks entities]
- **Project**: `projectName`, `projectNumber`, `companyID`, `projectType` (picklist; Baseline/Template/Internal/Client etc. — exact values [U]), `status` (incl. Inactive, Complete), `startDateTime`, `endDateTime`, `projectLeadResourceID`, `contractID`, `opportunityID`, `department`, `description`, `estimatedTime`, `actualHours`, `completedPercentage`, `completedDateTime`, budget/revenue fields, `purchaseOrderNumber`, `statusDetail`, up to 200 UDFs. Completing a project completes all tasks.
- **Phase**: `projectID`, `parentPhaseID` (sub-phases), `title`, `description`, `startDate`, `dueDate`, `estimatedHours` (RO roll-up), `phaseNumber`.
- **Task**: `projectID`, `phaseID`, `title`, `description`, `status` (same list as tickets; complete = 5 zeros `remainingHours`), `taskType`, `assignedResourceID` + `assignedResourceRoleID` (requires `billingCodeID`), `departmentID`, `estimatedHours`, `remainingHours`, `startDateTime`, `endDateTime`, `priorityLabel`, `priority` (order), `isVisibleInClientPortal`, `canClientPortalUserCompleteTask`, `isTaskBillable` (RO), `companyLocationID`, `taskNumber`. Predecessor/successor and secondary resources exist [C: workflow "set successor task statuses"].
- Time entries on tasks; task time may require start/stop times.

**Taskora →** Phase 5, simplified: projects → phases (one level) → tasks; dependencies table; reuse the ticket status model and time entry model.

## 16. Inventory

[C: InventoryItems entity]
Per (product × inventory location) stock record: `productID`, `inventoryLocationID`, `quantityOnHand`, `quantityMinimum`, `quantityMaximum`, `quantityOnOrder`, `quantityReserved`, `quantityPicked`, `backOrderQuantity`, `bin`, `referenceNumber`; child `InventoryItemSerialNumbers`. Stocked items can become CIs (CI serial updates propagate to the inventory item). Workflow action "release reserved inventory" exists on opportunities. [C]

**Taskora →** P2 / post-v1. Keep a hook: `configuration_items.source = 'inventory'`.

## 17. Knowledge Base

[C: KnowledgeBaseArticles entity, Using KB, KB from ticket]
- Article: `title` (200), content (rich text), `articleCategoryID` (KB categories, hierarchical [U]), `keywords` (300), `errorCodes` (200), `referenceLink`, `publish` (Internal only / All Client Portal / internal + one customer/territory/classification), `isActive`, created/modified by + dates; versions & drafts with approval exist in UI (API sees only published latest).
- Ticket ↔ article association via `ArticleTicketAssociations`; checklist items can reference an article (`knowledgebaseArticleID`).
- Create article from ticket: title←ticket title, content←description (+resolution/notes/time summaries flagged "append"), issue/sub-issue → keywords, tags copied; defaults to "All Articles", Internal Only, Active.
- Suggested articles via shared **tags**.

**Taskora →** Phase 5: `kb_articles` (markdown, versions table, visibility), `kb_categories` (tree), `kb_article_tickets`, Postgres full-text search with `tsvector`; "suggest articles" by FTS on ticket title + issue type (improvement over tag-only matching).

## 18. Notifications

[C: Workflow rules creating/editing; Basic ticket workflow; Queues]
- Notification templates per event, sent by workflow rules or by built-in ticket notification checkboxes (notify contact/primary/secondary resources on note/time entry — the checkboxes themselves [U] from public text; the SLA page references "floating notification panel" on time entry [C: Entering regular time]).
- Recipients: role-based (primary resource, contact, account manager, queue owner, queue other emails), explicit resources/contacts, free emails, SMS for resources; "do not notify initiating resource"; send-from options; BCC; MS Teams channels via webhook (≤10).
- Notification sent can be saved as an uneditable note.
- Contacts have `receivesEmailNotifications`.

**Taskora →** Phase 6 engine, but Phase 2 needs minimal: email on ticket created (to contact), on customer-visible note, on assignment (to tech). Build an `outbox` table + template table early.

## 19. Workflow rules

[C: Workflow rules overview + creating/editing]
- Entities: Ticket; Project, Task; Contract; Opportunity, Sales Order, Quote, Device.
- Max 200 active rules; cascades up to 5 levels for immediate events; time-based rules never trigger other rules; fire typically within 5 minutes; apply only to records created/edited after the rule exists.
- **Events** (OR-combined): regular (Created, Edited, Scheduled...), actor-specific (Created by / Note Added by: resource, contact, portal user, co-managed user), time-based with N minutes/hours/days (Due in, Overdue by, Idle for, SLA: Resolution Overdue by, warranty/SSL expiry). SLA events use SLA business hours. Business days for tickets: primary resource's location → queue's location → default location.
- **Conditions**: up to 5, AND-combined; attribute (entity/related entity field, incl. UDF) + operator (incl. Changed / Changed to / Changed from, In list) + value(s). Restrictions on Changed* with time events.
- **Time-sensitive window**: inside/outside business hours of an internal location, or custom hours.
- **Updates**: up to 5 field updates, static or dynamic (`[Account Manager]`, `[Queue Owner]`, `[Issue Type Queue]`, …). Updating category does *not* apply its defaults.
- **Actions**: send survey, add checklist from library, add to work list, execute extension callout (webhook), create to-dos (≤10), create ticket note (Workflow Rule Action Note; can append to resolution), create tickets (from CRM/contract/project rules), post to Teams, AI triage.
- **Notifications**: recipients, template, subject override, recurrence (≤10 repeats, stops when conditions stop matching, final updates after last), create note from notification.

**Taskora →** Phase 6. JSON rule definition: `{entity, events[], conditions[], time_window, updates[], actions[], notifications}` evaluated by a worker consuming a domain-event stream (`ticket.created`, `ticket.updated` with diff, `ticket.note_added`, `ticket.time_added`, `sla.warning`, `sla.breached`) plus a scheduler for time-based events. Store an execution log (Autotask has "Auditing workflow rules" [C: link exists]). Loop protection: max depth 5 like Autotask.

## 20. User-defined fields (UDFs)

[C: UserDefinedFieldDefinitions entity; UDF help]
- Definition: `name` (45), `description`, `udfType` (target entity: Company, Site Configuration, Contact, Contract, ConfigurationItem, Opportunity, Service, Service Bundle, Project, Product, Sales Order, Subscription, Task, Ticket), `dataType` (string, date, numeric, list, text/email; immutable), `displayFormat` (single/multi-line), `defaultValue`, `isRequired` (not for Ticket/Task — required-ness set per ticket category), `isProtected`/`isEncrypted`/`isPrivate` (sensitive data; mostly CI/site config), `isVisibleToClientPortal` (CI/Ticket), `numberOfDecimalPlaces` (1–4), `sortOrder`, `mergeVariableName`, `isActive`. List values in `UserDefinedFieldListItems`.
- Per-entity active limits: 50 (Contract) … 200 (Company, Project) … 300 (Ticket) … 500 (CI, Site config).

**Taskora →** Phase 6. `custom_field_definitions` + values in a `custom_fields jsonb` column per entity (GIN-indexed) rather than EAV; protected fields encrypted with pgcrypto/app-level envelope encryption and permission-gated.

## 21. Reports

[C: Reporting in Autotask; dashboard widgets]
Pre-built reports (e.g. "SLA Performance by SLA", ticket metrics), **LiveReports Designer** for custom reports (copy/edit system reports; share by category, department, security level, resource), dashboards/widgets.

**Taskora →** Phase 6: saved queries over SQL views (`v_ticket_facts`, `v_time_facts`, `v_sla_facts`) with CSV export; a handful of built-in reports (SLA compliance, time by tech/company, billable vs non-billable, ticket volume by issue type, aging).

## 22. Admin configuration

Confirmed admin areas [C across pages]: Activations (turn modules on/off), Task & Ticket Statuses, Issue & Sub-Issue Types, Queues, Ticket Categories (and other entity categories), SLAs (+ business hours, status mapping), Workflow Rules, Notification templates, Incoming Email Processing (mailboxes; new email → ticket, reply with ticket number → note; loop/dupe protection: ≤2 emails same sender+subject per 5 min), UDFs, Roles, Allocation/billing codes, Internal locations & holiday sets, Security levels, Client Portal request types, System settings (e.g. require issue/sub-issue, require summary notes, completed-ticket time entry restrictions).

**Taskora →** Phase 1 settings page with sections: Organisation (name, logo, default TZ, business hours, holidays), Users & security roles, Ticket config (statuses, priorities, queues, types, issue/sub-issue, sources, categories/templates), Time config (work types, internal categories, labour roles), Integrations (Action1), Email (SMTP/IMAP mailbox). Seed sensible MSP defaults.

## 23. Search

Autotask has global search and per-entity search pages (ticket search can filter by issue/sub-issue to find similar past problems [C: Issue types]). Global search details [U — no public page retrieved].

**Taskora →** Postgres FTS (`tsvector`) on tickets (number, title, description, notes), companies, contacts (name, emails, phones), CIs (name, serial, hostname, IP/MAC), KB. Exact-match fast paths: ticket number `T…`, serial, IP, email. Command palette UI.

---

## 24. Summary: what Taskora should simplify / improve

1. **Consistent naming**: Autotask mixes "company/organization/account", "CI/asset/device/installed product", "billing code/allocation code/work type/ProjectCharges". Taskora: `company`, `configuration_item` (UI: "Asset"), `work_type`.
2. **FK tables instead of integer picklists** with `code` slugs for system values (`new`, `waiting_customer`, `complete`).
3. **Rich text parity** between API and UI.
4. **SLA engine** as an append-only event log + pure calculation, re-computable when SLA definitions change (opt-in recalculation — Autotask cannot).
5. **CMDB**: n-level relationships, RMM-agnostic sync columns + `jsonb` raw data, field history.
6. **Templates over category layout designer** in v1.
7. **Automation** with an execution log and dry-run/test mode (not in Autotask public docs).
8. **Single global search / command palette**.

---

## Confirmed vs uncertain

**Confirmed (public docs):** Ticket field names and behaviours listed in §2.2–2.3; ticket number format; ticket types; status system values & default SLA mapping; SLA events, objective matching, target modes, timeframes, back-fill & rounding; SLA results fields; contract types and child purchase entities (ContractBlocks, ContractRetainers, ContractTicketPurchases, ContractServices); Recurring Service = contractType 7; billingPreference 2 = Reconcile; contract precedence on tickets; exclusion sets; TimeEntries fields and rules; BillingCodes useType values; Company types; two-level company hierarchy; queue fields & system queues; issue/sub-issue hierarchy; CI fields; KB fields & from-ticket behaviour; UDF definition fields; workflow rule structure and limits; Approve & Post tabs.

**Uncertain / assumed:** Numeric values for most picklists (status ids, priority ids, noteType/publish values, contractType ids other than 7, project types); "Per Ticket" = API "Incident" (strongly implied, not stated verbatim); exact ticket detail page layout; full ticket workflow event list (shown only as a screenshot in docs); built-in note/time notification checkboxes; global search behaviour; work type multiplier field name; KB category hierarchy depth; Fixed-price milestone entity name; timesheet status names beyond New/Rejected/approved (Submitted inferred).

## Sources

Developer (REST API entity reference):
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/TicketsEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/TicketNotesEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/TimeEntriesEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/ConfigurationItemsEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/ConfigurationItemTypesEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/ConfigurationItemCategoriesEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/ContractsEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/ContractServicesEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/ContractBlocksEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/ContractRetainersEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/ContractTicketPurchasesEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/ContractExclusionSetsEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/ServiceLevelAgreementResultsEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/CompaniesEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/ContactsEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/CompanyLocationsEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/ResourcesEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/RolesEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/BillingCodesEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/ServicesEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/ProjectsEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/PhasesEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/TasksEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/ProductsEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/InventoryItemsEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/KnowledgeBaseArticlesEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/TicketCategoriesEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/TicketCategoryFieldDefaultsEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/TicketChecklistItemsEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/TicketSecondaryResourcesEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/TicketChargesEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/ServiceCallsEntity.htm
- https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/OpportunitiesEntity.htm
- https://autotask.net/help/DeveloperHelp/Content/APIs/REST/Entities/UserDefinedFieldDefinitionsEntity.htm
- (404) https://www.autotask.net/help/developerhelp/Content/APIs/REST/Entities/ServiceLevelAgreementsEntity.htm — no standalone SLA entity page; SLA is a picklist on tickets/contracts.

Online help:
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
- https://autotask.net/help/Content/3_Features/7_ServiceDesk/TicketPages/TicketTypes.htm (via search summary)
- https://autotask.net/help/Content/3_Features/7_ServiceDesk/ManageTickets/AssignAcceptTickets.htm
- https://autotask.net/help/content/3_Features/7_ServiceDesk/Workflows/Basic_Ticket_Workflow.htm
- https://autotask.net/help/Content/3_Features/7_ServiceDeskAutomation/Dispatching/DISPATCHLANDING.htm
- https://autotask.net/help/Content/3_Features/3_CRM/Companies/COMPANIESMAIN.htm
- https://autotask.net/help/Content/3_Features/4_Assets/ASSET_OVERVIEW.htm
- https://autotask.net/help/Content/3_Features/4_Assets/CONFIGURE_Assets.htm (via search summary)
- https://autotask.net/help/Content/3_Features/7_Knowledgebase_Documentation/Knowledgebase/UsingKBwithAT.htm
- https://autotask.net/help/Content/3_Features/7_Knowledgebase_Documentation/Knowledgebase/New_Article_From_Ticket.htm (via search summary)
- https://autotask.net/help/Content/2_Getting_Started/Timesheets/TimeEntryRegular.htm
- https://autotask.net/help/content/2_Getting_Started/Timesheets/ApproveRejectTimesheets.htm (via search summary)
- https://autotask.net/help/Content/3_Features/6_Contracts/AdminGeneral/BillingPreferences.htm (via search summary)
- https://autotask.net/help/Content/4_Admin/2FeaturesSettings/ApplicationWide/UserDefinedFields/UDFsadd.htm (via search summary)
- https://autotask.net/help/Content/4_Admin/2FeaturesSettings/_Categories/INTRODUCTION_TO_CATEGORIES.htm (via search summary)
- https://autotask.net/help/Content/3_Features/2_Dashboards/Widgets/About_Dashboard_Widgets.htm (via search summary)
- https://autotask.net/help/Content/3_Features/11_Reporting/REPORTINGINAUTOTASK.htm (via search summary)
- https://autotask.net/help/content/3_Features/6_Contracts/ContractMenu/6Assets.htm (via search summary)
- https://autotask.net/help/Content/4_Admin/3Automation/EmailSurvey/EMAILS/IncomingEmailProcessing/Loops_Dupes.htm (via search summary)
