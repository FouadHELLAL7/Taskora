import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { createdAt, id, updatedAt, users } from './core.js';
import { companies, contacts } from './crm.js';
import { configurationItems } from './service.js';

/** One row per integration provider (e.g. 'action1'). Secrets are AES-256-GCM encrypted. */
export const integrations = pgTable('integrations', {
  id: id(),
  provider: text('provider').notNull().unique(),
  enabled: boolean('enabled').notNull().default(false),
  /** Non-secret settings (region, sync interval, matching options…). */
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  secretsEncrypted: text('secrets_encrypted'),
  status: text('status').notNull().default('not_configured'),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
  lastError: text('last_error'),
  nextSyncAt: timestamp('next_sync_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const syncRuns = pgTable(
  'sync_runs',
  {
    id: id(),
    provider: text('provider').notNull(),
    trigger: text('trigger').notNull(),
    status: text('status').notNull().default('running'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    stats: jsonb('stats').$type<Record<string, number>>().notNull().default(sql`'{}'::jsonb`),
    log: jsonb('log').$type<{ at: string; level: string; message: string }[]>().notNull().default(sql`'[]'::jsonb`),
    error: text('error'),
    triggeredById: integer('triggered_by_id').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [index('sync_runs_provider_idx').on(t.provider, t.startedAt)],
);

/** Log of e-mails received by the inbound mailbox poller (also used for de-duplication). */
export const inboundEmails = pgTable(
  'inbound_emails',
  {
    id: id(),
    messageId: text('message_id').notNull().unique(),
    fromAddress: text('from_address').notNull(),
    fromName: text('from_name'),
    subject: text('subject'),
    /** 'created' | 'appended' | 'rejected' | 'failed' */
    status: text('status').notNull(),
    ticketId: integer('ticket_id'),
    detail: text('detail'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('inbound_emails_received_idx').on(t.receivedAt)],
);

/** Explicit Action1 organization → Taskora company mapping (never guessed). */
export const action1Organizations = pgTable('action1_organizations', {
  id: id(),
  externalId: text('external_id').notNull().unique(),
  name: text('name').notNull(),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'set null' }),
  enabled: boolean('enabled').notNull().default(true),
  endpointCount: integer('endpoint_count').notNull().default(0),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Normalised snapshot of an Action1 managed endpoint, keyed by its persistent Action1 id. */
export const action1Endpoints = pgTable(
  'action1_endpoints',
  {
    id: id(),
    externalId: text('external_id').notNull().unique(),
    orgExternalId: text('org_external_id').notNull(),
    configurationItemId: integer('configuration_item_id').references(() => configurationItems.id, { onDelete: 'set null' }),
    contactId: integer('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    name: text('name'),
    deviceName: text('device_name'),
    osName: text('os_name'),
    platform: text('platform'),
    serialNumber: text('serial_number'),
    manufacturer: text('manufacturer'),
    ipAddress: text('ip_address'),
    macAddress: text('mac_address'),
    loggedInUser: text('logged_in_user'),
    agentStatus: text('agent_status'),
    onlineStatus: text('online_status'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    lastBootAt: timestamp('last_boot_at', { withTimezone: true }),
    rebootRequired: boolean('reboot_required'),
    updateStatus: text('update_status'),
    vulnerabilityStatus: text('vulnerability_status'),
    missingCriticalUpdates: integer('missing_critical_updates'),
    missingOtherUpdates: integer('missing_other_updates'),
    agentVersion: text('agent_version'),
    cpu: text('cpu'),
    ramText: text('ram_text'),
    diskText: text('disk_text'),
    missingUpdates: jsonb('missing_updates').$type<unknown[]>(),
    raw: jsonb('raw').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    matchStatus: text('match_status').notNull().default('unmatched'),
    matchNote: text('match_note'),
    contactMatchNote: text('contact_match_note'),
    /** Set when the endpoint was absent from the latest full sync (never auto-deleted). */
    missingSince: timestamp('missing_since', { withTimezone: true }),
    previousNames: text('previous_names').array().notNull().default(sql`'{}'::text[]`),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('a1_endpoints_org_idx').on(t.orgExternalId),
    index('a1_endpoints_ci_idx').on(t.configurationItemId),
    uniqueIndex('a1_endpoints_ci_uq').on(t.configurationItemId).where(sql`${t.configurationItemId} is not null`),
  ],
);
