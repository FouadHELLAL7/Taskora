/**
 * Ticket CSV columns shared by the export endpoint and the column chooser.
 * The labels are also accepted as import headers, so an export can be edited
 * in Excel and imported again.
 */
export const TICKET_EXPORT_COLUMNS = [
  { key: 'ticketNumber', label: 'Ticket', default: true },
  { key: 'title', label: 'Title', default: true },
  { key: 'companyName', label: 'Company', default: true },
  { key: 'contactName', label: 'Contact', default: true },
  { key: 'statusName', label: 'Status', default: true },
  { key: 'priorityName', label: 'Priority', default: true },
  { key: 'queueName', label: 'Queue', default: true },
  { key: 'assigneeName', label: 'Assigned to', default: true },
  { key: 'ticketTypeName', label: 'Type', default: true },
  { key: 'issueTypeName', label: 'Issue type', default: true },
  { key: 'slaState', label: 'SLA', default: true },
  { key: 'hoursWorked', label: 'Hours worked', default: true },
  { key: 'createdAt', label: 'Created', default: true },
  { key: 'resolvedAt', label: 'Resolved', default: true },
  { key: 'description', label: 'Description', default: false },
  { key: 'notes', label: 'Notes', default: false },
  { key: 'resolution', label: 'Resolution', default: false },
  { key: 'contactEmail', label: 'Contact email', default: false },
  { key: 'accountNumber', label: 'Account number', default: false },
  { key: 'subIssueTypeName', label: 'Sub-issue type', default: false },
  { key: 'sourceName', label: 'Source', default: false },
  { key: 'ciName', label: 'Configuration item', default: false },
  { key: 'dueAt', label: 'Due date', default: false },
  { key: 'firstResponseAt', label: 'First response', default: false },
  { key: 'closedAt', label: 'Closed', default: false },
  { key: 'lastActivityAt', label: 'Last activity', default: false },
  { key: 'tags', label: 'Tags', default: false },
] as const;

export type TicketExportColumn = (typeof TICKET_EXPORT_COLUMNS)[number]['key'];

/** Header row of the ticket import template (required: Title, Company). */
export const TICKET_IMPORT_TEMPLATE = [
  'Ticket',
  'Title',
  'Description',
  'Company',
  'Contact',
  'Contact email',
  'Status',
  'Priority',
  'Queue',
  'Assigned to',
  'Type',
  'Issue type',
  'Sub-issue type',
  'Source',
  'Configuration item',
  'Due date',
  'Hours worked',
  'Created',
  'Resolved',
  'Resolution',
  'Note',
  'Note date',
  'Public note',
  'Tags',
] as const;
