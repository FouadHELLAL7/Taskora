# Importing and exporting tickets (CSV)

## Export

**Tickets → Export** opens a menu: tick the columns you want, then **Download CSV**. The export follows the filters on the list (state, queue, company…) and holds up to 10,000 tickets. Your column choice is remembered in the browser.

Default columns: Ticket, Title, Company, Contact, Status, Priority, Queue, Assigned to, Type, Issue type, SLA, Hours worked, Created, Resolved.
Optional columns: Description, Notes (all notes of the ticket), Resolution, Contact email, Account number, Sub-issue type, Source, Configuration item, Due date, First response, Closed, Last activity, Tags.

Dates are exported in UTC (ISO 8601). The file is UTF-8 with a BOM, so Excel shows accented characters correctly.

## Import

**Tickets → Import** (or **Administration → Data Import → Tickets**): choose the CSV file, click **Preview**, check the rows, then click **Import**. If any row is invalid, nothing is imported.

You need the `tickets.write` permission. Ticking **Create missing companies, contacts, queues, types, issue types and sources** also needs `companies.write`.

Example file: [examples/tickets-import-example.csv](examples/tickets-import-example.csv). The dialog also has **Download example**.

### Columns

Only **Title** and **Company** are required, and only for new tickets. Header names are not case-sensitive. Comma- or semicolon-separated files both work.

| Column | Meaning | Also accepted as |
| --- | --- | --- |
| Ticket | Ticket number. A known number updates that ticket. An unknown number creates a ticket with that number. Leave it empty for a new Taskora number. | Ticket Number, Number, Ticket ID |
| Title | Ticket title | Subject, Summary |
| Description | Ticket description | Details |
| Company | Company name | Account, Account Name, Customer, Client |
| Account number | Matches the company by account number | Company Number |
| Contact | Contact full name ("First Last") at that company | Contact Name, Requester |
| Contact email | Matches the contact by e-mail address | Email, Requester Email |
| Status | Status name. Unknown names are mapped by meaning, e.g. "Complete" → Closed, "Waiting Customer" → Waiting for Customer. | |
| Priority | Priority name, or P1–P4, Critical/High/Medium/Normal/Low | |
| Queue, Type, Issue type, Sub-issue type, Source | Picklist names | |
| Assigned to | Technician full name or e-mail address (users are never created) | Primary Resource, Resource, Assignee |
| Configuration item | Device name, serial number or CI number at that company | CI, Device |
| Due date, Created, Resolved | Dates (see below) | Create Date, Completed Date |
| Hours worked | Logged as one approved, non-billable time entry (`1.5` or `1,5`) | Total Hours Worked |
| Resolution | Resolution text | |
| Note | Internal note added to the ticket | Notes, Internal Note |
| Note date | Date of that note | |
| Public note | Customer-visible note | Customer Note |
| Tags | Separated by `;` or `,` | |

"SLA", "Closed", "First response" and "Last activity" from the export are recognised and ignored.

### Rules

- **Several notes for one ticket:** repeat the ticket number on more rows. Each row adds its note; the other cells can stay empty.
- **Safe re-import:** a note that is already on the ticket is not added again. "Hours worked" only tops logged time up to the CSV value, so importing the same file twice changes nothing.
- **Notes from a Taskora export:** the Notes column is split back into separate notes, keeping each note's date and visibility.
- **Dates** can be `dd/mm/yyyy hh:mm`, `yyyy-mm-dd hh:mm`, `mm/dd/yyyy h:mm AM/PM` or ISO 8601. Values without a time zone are read in the organisation time zone (System Settings → General). If a date could be either day-first or month-first, it is read day-first.
- **History does not raise alarms:** imported tickets send no assignment notifications. SLA deadlines already in the past are flagged as breached straight away, so no breach e-mails are sent for old tickets. A ticket past "New" counts as responded at its creation time.
- **Updating an existing ticket** changes only the cells that are filled in. The company of an existing ticket is never changed.
- **Limits:** up to 20,000 rows and 25 MB per file. Behind nginx, `NGINX_CLIENT_MAX_BODY_SIZE` (default 30m) must allow the file size.
