/**
 * Base reference data required by every installation (roles, default statuses,
 * priorities, types…). Idempotent: each table is only filled when empty, so
 * administrators can freely rename or deactivate the defaults afterwards.
 */
import { eq, sql } from 'drizzle-orm';
import { SYSTEM_ROLES } from '@taskora/shared';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { Db } from '../client.js';
import * as s from '../schema/index.js';

async function isEmpty(db: Db, table: PgTable): Promise<boolean> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(table);
  return (row?.n ?? 0) === 0;
}

export async function seedBase(db: Db): Promise<void> {
  for (const role of SYSTEM_ROLES) {
    await db
      .insert(s.roles)
      .values({ key: role.key, name: role.name, description: role.description, permissions: role.permissions, isSystem: true })
      .onConflictDoUpdate({
        target: s.roles.key,
        // System roles keep their permission set in sync with the code.
        set: { permissions: role.permissions, isSystem: true },
      });
  }

  if (await isEmpty(db, s.ticketStatuses)) {
    await db.insert(s.ticketStatuses).values([
      { name: 'New', category: 'new', color: '#3b82f6', isDefault: true, isSystem: true, sortOrder: 10 },
      { name: 'In Progress', category: 'open', color: '#8b5cf6', sortOrder: 20 },
      { name: 'Waiting for Customer', category: 'waiting', color: '#f59e0b', pausesSla: true, sortOrder: 30 },
      { name: 'Waiting for Vendor', category: 'waiting', color: '#f97316', pausesSla: true, sortOrder: 40 },
      { name: 'Scheduled', category: 'open', color: '#06b6d4', sortOrder: 50 },
      { name: 'Escalated', category: 'open', color: '#ef4444', sortOrder: 60 },
      { name: 'Resolved', category: 'resolved', color: '#22c55e', isSystem: true, sortOrder: 70 },
      { name: 'Closed', category: 'closed', color: '#64748b', isSystem: true, sortOrder: 80 },
    ]);
  }

  if (await isEmpty(db, s.ticketPriorities)) {
    await db.insert(s.ticketPriorities).values([
      { name: 'Critical', level: 1, color: '#dc2626', sortOrder: 10 },
      { name: 'High', level: 2, color: '#f97316', sortOrder: 20 },
      { name: 'Medium', level: 3, color: '#eab308', isDefault: true, sortOrder: 30 },
      { name: 'Low', level: 4, color: '#22c55e', sortOrder: 40 },
    ]);
  }

  if (await isEmpty(db, s.ticketTypes)) {
    await db.insert(s.ticketTypes).values([
      { name: 'Incident', description: 'Unplanned interruption or degradation of a service', sortOrder: 10 },
      { name: 'Service Request', description: 'Request for information, access or a standard change', sortOrder: 20 },
      { name: 'Problem', description: 'Underlying cause of one or more incidents', sortOrder: 30 },
      { name: 'Change Request', description: 'Planned change to a configuration item or service', sortOrder: 40 },
      { name: 'Alert', description: 'Raised automatically by monitoring', sortOrder: 50 },
    ]);
  }

  if (await isEmpty(db, s.ticketSources)) {
    await db.insert(s.ticketSources).values(
      ['Phone', 'Email', 'Portal', 'Walk-in', 'Monitoring Alert', 'Internal', 'Chat'].map((name, i) => ({ name, sortOrder: i * 10 })),
    );
  }

  if (await isEmpty(db, s.queues)) {
    await db.insert(s.queues).values([
      { name: 'Service Desk', description: 'First-line support', sortOrder: 10 },
      { name: 'Level 2 Support', description: 'Escalated technical issues', sortOrder: 20 },
      { name: 'Projects', description: 'Project-related work', sortOrder: 30 },
      { name: 'Monitoring Alerts', description: 'Tickets raised by monitoring and integrations', sortOrder: 40 },
    ]);
  }

  if (await isEmpty(db, s.issueTypes)) {
    const tree: Record<string, string[]> = {
      'Microsoft 365': ['Outlook', 'Teams', 'SharePoint / OneDrive', 'Licensing', 'Exchange Online'],
      'User Management': ['New User Onboarding', 'User Offboarding', 'Password Reset', 'Permissions Change'],
      Hardware: ['Laptop', 'Desktop', 'Printer', 'Peripheral', 'Mobile Device'],
      Network: ['Internet Connectivity', 'Wi-Fi', 'VPN', 'Firewall', 'Switching'],
      Software: ['Installation', 'Application Error', 'Updates & Patching'],
      Security: ['Phishing', 'Malware', 'Account Compromise', 'Endpoint Protection'],
      Server: ['Performance', 'Backup', 'Storage', 'Active Directory'],
    };
    let i = 0;
    for (const [issue, subs] of Object.entries(tree)) {
      const [row] = await db.insert(s.issueTypes).values({ name: issue, sortOrder: (i += 10) }).returning();
      await db.insert(s.subIssueTypes).values(subs.map((name, j) => ({ name, issueTypeId: row!.id, sortOrder: j * 10 })));
    }
  }

  if (await isEmpty(db, s.billingCodes)) {
    await db.insert(s.billingCodes).values([
      { code: 'LAB-REM', name: 'Labor — Remote', kind: 'labor', sortOrder: 10 },
      { code: 'LAB-ONS', name: 'Labor — Onsite', kind: 'labor', sortOrder: 20 },
      { code: 'LAB-PRJ', name: 'Labor — Project', kind: 'labor', sortOrder: 30 },
      { code: 'LAB-INT', name: 'Labor — Internal', kind: 'labor', sortOrder: 40 },
      { code: 'EXP-TRV', name: 'Travel expense', kind: 'expense', sortOrder: 50 },
      { code: 'EXP-MAT', name: 'Materials', kind: 'material', sortOrder: 60 },
      { code: 'SVC-MGD', name: 'Managed services', kind: 'service', sortOrder: 70 },
    ]);
  }

  if (await isEmpty(db, s.workTypes)) {
    const codes = await db.select().from(s.billingCodes);
    const code = (c: string) => codes.find((x) => x.code === c)?.id ?? null;
    await db.insert(s.workTypes).values([
      { name: 'Remote Support', code: 'REM', billingCodeId: code('LAB-REM'), hourlyRate: 95, sortOrder: 10 },
      { name: 'Onsite Support', code: 'ONS', billingCodeId: code('LAB-ONS'), hourlyRate: 120, sortOrder: 20 },
      { name: 'Project Work', code: 'PRJ', billingCodeId: code('LAB-PRJ'), hourlyRate: 110, sortOrder: 30 },
      { name: 'After-hours Emergency', code: 'EMG', billingCodeId: code('LAB-REM'), hourlyRate: 160, sortOrder: 40 },
      { name: 'Internal / Admin', code: 'INT', billingCodeId: code('LAB-INT'), isBillable: false, sortOrder: 50 },
    ]);
  }

  if (await isEmpty(db, s.ciTypes)) {
    const types: [string, string][] = [
      ['Laptop', 'workstation'],
      ['Desktop', 'workstation'],
      ['Server', 'server'],
      ['Virtual Machine', 'server'],
      ['Network Switch', 'network'],
      ['Router', 'network'],
      ['Firewall', 'network'],
      ['Wireless Access Point', 'network'],
      ['Printer', 'peripheral'],
      ['NAS', 'storage'],
      ['Mobile Device', 'mobile'],
      ['Software', 'software'],
      ['License', 'license'],
      ['Cloud Service', 'cloud'],
      ['Other', 'other'],
    ];
    await db.insert(s.ciTypes).values(types.map(([name, category], i) => ({ name, category, sortOrder: i * 10 })));
  }

  if (await isEmpty(db, s.businessHours)) {
    const day: [string, string][] = [['08:00', '17:00']];
    const [bh] = await db
      .insert(s.businessHours)
      .values({
        name: 'Standard business hours',
        timezone: 'Europe/Brussels',
        schedule: { mon: day, tue: day, wed: day, thu: day, fri: day, sat: [], sun: [] },
        isDefault: true,
      })
      .returning();
    const priorities = await db.select().from(s.ticketPriorities);
    const targets: Record<number, [number, number]> = { 1: [30, 240], 2: [60, 480], 3: [240, 1440], 4: [480, 2880] };
    const [standard] = await db
      .insert(s.slaPolicies)
      .values({ name: 'Standard SLA', description: 'Default response and resolution targets', businessHoursId: bh!.id, isDefault: true })
      .returning();
    await db.insert(s.slaTargets).values(
      priorities.map((p) => ({
        slaId: standard!.id,
        priorityId: p.id,
        firstResponseMinutes: targets[p.level]?.[0] ?? 480,
        resolutionMinutes: targets[p.level]?.[1] ?? 2880,
      })),
    );
    const prem: Record<number, [number, number]> = { 1: [15, 120], 2: [30, 240], 3: [120, 720], 4: [240, 1440] };
    const [premium] = await db
      .insert(s.slaPolicies)
      .values({ name: 'Premium SLA', description: 'Faster targets for managed-service clients', businessHoursId: bh!.id })
      .returning();
    await db.insert(s.slaTargets).values(
      priorities.map((p) => ({
        slaId: premium!.id,
        priorityId: p.id,
        firstResponseMinutes: prem[p.level]?.[0] ?? 240,
        resolutionMinutes: prem[p.level]?.[1] ?? 1440,
      })),
    );
  }

  if (await isEmpty(db, s.notificationTemplates)) {
    await db.insert(s.notificationTemplates).values([
      {
        event: 'ticket.assigned',
        name: 'Ticket assigned',
        subject: 'Ticket {{ticket.number}} assigned to you',
        body: '{{ticket.title}} ({{ticket.company}}) has been assigned to you by {{actor.name}}.',
      },
      {
        event: 'ticket.note_added',
        name: 'Note added to watched ticket',
        subject: 'New note on {{ticket.number}}',
        body: '{{actor.name}} added a note to {{ticket.title}}.',
      },
      {
        event: 'ticket.sla_breached',
        name: 'SLA breached',
        subject: 'SLA breached on {{ticket.number}}',
        body: 'The {{sla.event}} target for {{ticket.title}} ({{ticket.company}}) has been breached.',
      },
      {
        event: 'ticket.sla_warning',
        name: 'SLA at risk',
        subject: 'SLA at risk on {{ticket.number}}',
        body: 'The {{sla.event}} target for {{ticket.title}} is due {{sla.due}}.',
      },
    ]);
  }

  if (await isEmpty(db, s.kbCategories)) {
    await db
      .insert(s.kbCategories)
      .values(['Microsoft 365', 'Networking', 'Endpoints', 'Security', 'Procedures'].map((name, i) => ({ name, sortOrder: i * 10 })));
  }

  const [existing] = await db.select().from(s.integrations).where(eq(s.integrations.provider, 'action1'));
  if (!existing) {
    await db.insert(s.integrations).values({
      provider: 'action1',
      enabled: false,
      config: {
        region: 'eu',
        syncIntervalMinutes: 60,
        autoCreateCis: true,
        matchBySerial: true,
        matchByHostname: false,
        matchContacts: true,
        defaultCiTypeId: null,
      },
    });
  }
}
