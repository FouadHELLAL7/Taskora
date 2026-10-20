import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestApp, makeCompany, makeContact, userClient, type Client, type TestContext } from './helpers.js';
import { schema } from '../src/db/client.js';
import { runSlaMonitor } from '../src/jobs/sla-monitor.js';

let ctx: TestContext;
let admin: Client & { userId: number };
let tech: Client & { userId: number };
let lookups: any;
const statusId = (name: string) => lookups.statuses.find((s: { name: string }) => s.name === name).id;
const priorityId = (name: string) => lookups.priorities.find((s: { name: string }) => s.name === name).id;

beforeAll(async () => {
  ctx = await createTestApp();
  admin = await userClient(ctx, 'administrator');
  tech = await userClient(ctx, 'technician');
  lookups = (await admin.get('/api/v1/lookups')).body;
  // Use a 24x7 SLA for deterministic deadlines.
  const sla = await admin.post('/api/v1/settings/sla-policies', {
    name: '24x7 test SLA',
    isDefault: true,
    targets: lookups.priorities.map((p: { id: number; level: number }) => ({ priorityId: p.id, firstResponseMinutes: 60 * p.level, resolutionMinutes: 240 * p.level })),
  });
  expect(sla.status).toBe(201);
});
afterAll(async () => ctx.close());

describe('ticket lifecycle', () => {
  it('creates a ticket with defaults, number, SLA deadlines and a created event', async () => {
    const company = await makeCompany(admin, 'Northstar Consulting');
    const contact = await makeContact(admin, company.id);
    const res = await tech.post('/api/v1/tickets', { title: 'Laptop running slowly', companyId: company.id, contactId: contact.id, priorityId: priorityId('High') });
    expect(res.status).toBe(201);
    const t = res.body;
    expect(t.ticketNumber).toMatch(/^TKA-\d{6}$/);
    expect(t.statusId).toBe(statusId('New'));
    expect(t.slaId).toBeTruthy();
    const created = new Date(t.createdAt).getTime();
    expect(new Date(t.firstResponseDueAt).getTime() - created).toBe(120 * 60_000);
    expect(new Date(t.resolutionDueAt).getTime() - created).toBe(480 * 60_000);

    const detail = await tech.get(`/api/v1/tickets/${t.id}`);
    expect(detail.body.companyName).toBe('Northstar Consulting');
    expect(detail.body.contactName).toBe('Emma Smith');
    expect(detail.body.sla.firstResponse).toBe('pending');

    const timeline = await tech.get(`/api/v1/tickets/${t.id}/timeline`);
    expect(timeline.body.data.some((i: any) => i.kind === 'event' && i.event.type === 'created')).toBe(true);
  });

  it('rejects contacts, CIs and contracts from another company', async () => {
    const a = await makeCompany(admin, 'BluePeak Logistics');
    const b = await makeCompany(admin, 'Meridian Technologies');
    const contactB = await makeContact(admin, b.id, 'Liam', 'Brown');
    const res = await tech.post('/api/v1/tickets', { title: 'Wrong contact', companyId: a.id, contactId: contactB.id });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields.contactId).toBeTruthy();
  });

  it('records first response, pauses SLA while waiting, resolves, closes and reopens', async () => {
    const company = await makeCompany(admin, 'Lifecycle Co');
    const { body: t } = await tech.post('/api/v1/tickets', { title: 'Outlook crashes', companyId: company.id });

    // Public note = first response
    const note = await tech.post(`/api/v1/tickets/${t.id}/notes`, { body: 'Looking into it', visibility: 'public' });
    expect(note.status).toBe(201);
    let row = (await tech.get(`/api/v1/tickets/${t.id}`)).body;
    expect(row.firstResponseAt).toBeTruthy();
    expect(row.sla.firstResponse).toBe('met');

    // Waiting for customer pauses the SLA clock
    await tech.patch(`/api/v1/tickets/${t.id}`, { statusId: statusId('Waiting for Customer') });
    row = (await tech.get(`/api/v1/tickets/${t.id}`)).body;
    expect(row.slaPausedAt).toBeTruthy();
    expect(row.sla.resolution).toBe('paused');

    // Simulate 30 minutes of waiting, then resume
    await ctx.db.update(schema.tickets).set({ slaPausedAt: new Date(Date.now() - 30 * 60_000) }).where(eq(schema.tickets.id, t.id));
    const before = new Date(row.resolutionDueAt).getTime();
    await tech.patch(`/api/v1/tickets/${t.id}`, { statusId: statusId('In Progress') });
    row = (await tech.get(`/api/v1/tickets/${t.id}`)).body;
    expect(row.slaPausedAt).toBeNull();
    expect(row.slaPausedMinutes).toBeGreaterThanOrEqual(29);
    expect(new Date(row.resolutionDueAt).getTime() - before).toBeGreaterThanOrEqual(29 * 60_000);

    // Resolve with a resolution
    await tech.patch(`/api/v1/tickets/${t.id}`, { statusId: statusId('Resolved'), resolution: 'Rebuilt the Outlook profile' });
    row = (await tech.get(`/api/v1/tickets/${t.id}`)).body;
    expect(row.resolvedAt).toBeTruthy();
    expect(row.resolution).toBe('Rebuilt the Outlook profile');

    await tech.patch(`/api/v1/tickets/${t.id}`, { statusId: statusId('Closed') });
    row = (await tech.get(`/api/v1/tickets/${t.id}`)).body;
    expect(row.closedAt).toBeTruthy();

    // Reopen clears resolution timestamps
    await tech.patch(`/api/v1/tickets/${t.id}`, { statusId: statusId('In Progress') });
    row = (await tech.get(`/api/v1/tickets/${t.id}`)).body;
    expect(row.resolvedAt).toBeNull();
    expect(row.closedAt).toBeNull();
    const timeline = (await tech.get(`/api/v1/tickets/${t.id}/timeline`)).body.data;
    expect(timeline.some((i: any) => i.kind === 'event' && i.event.type === 'reopened')).toBe(true);
  });

  it('recalculates deadlines when the priority changes', async () => {
    const company = await makeCompany(admin, 'Priority Co');
    const { body: t } = await tech.post('/api/v1/tickets', { title: 'Server down', companyId: company.id, priorityId: priorityId('Low') });
    const res = await tech.patch(`/api/v1/tickets/${t.id}`, { priorityId: priorityId('Critical') });
    expect(new Date(res.body.firstResponseDueAt).getTime() - new Date(t.createdAt).getTime()).toBe(60 * 60_000);
  });

  it('notifies on assignment and tracks watchers', async () => {
    const company = await makeCompany(admin, 'Notify Co');
    const { body: t } = await admin.post('/api/v1/tickets', { title: 'VPN issue', companyId: company.id, assignedUserId: tech.userId });
    const notes = await tech.get('/api/v1/notifications');
    expect(notes.body.data.some((n: any) => n.type === 'ticket.assigned' && n.entityId === t.id)).toBe(true);
    expect((await admin.post(`/api/v1/tickets/${t.id}/watch`)).status).toBe(200);
    await tech.post(`/api/v1/tickets/${t.id}/notes`, { body: 'Tunnel reset', visibility: 'internal' });
    const adminNotes = await admin.get('/api/v1/notifications?unread=true');
    expect(adminNotes.body.data.some((n: any) => n.type === 'ticket.note_added')).toBe(true);
  });

  it('filters, searches and paginates the ticket list', async () => {
    const company = await makeCompany(admin, 'Filter Co');
    for (let i = 0; i < 3; i++) await tech.post('/api/v1/tickets', { title: `Printer jam ${i}`, companyId: company.id, assignedUserId: tech.userId });
    const mine = await tech.get(`/api/v1/tickets?assignedUserId=me&companyId=${company.id}&pageSize=2`);
    expect(mine.body.total).toBe(3);
    expect(mine.body.data).toHaveLength(2);
    const search = await tech.get('/api/v1/tickets?q=printer%20jam%201');
    expect(search.body.data.map((r: any) => r.title)).toContain('Printer jam 1');
    const open = await tech.get(`/api/v1/tickets?statusCategory=open&companyId=${company.id}`);
    expect(open.body.total).toBe(3);
    const csv = await tech.request('GET', `/api/v1/tickets/export.csv?companyId=${company.id}`);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(String(csv.body).split('\r\n')).toHaveLength(4);
  });

  it('suggests duplicates for similar open tickets of the same company', async () => {
    const company = await makeCompany(admin, 'Dupes Co');
    const { body: first } = await tech.post('/api/v1/tickets', { title: 'Outlook keeps asking for password', companyId: company.id });
    const res = await tech.get(`/api/v1/tickets/duplicates?companyId=${company.id}&title=${encodeURIComponent('Outlook asking password again')}`);
    expect(res.body.data.map((d: any) => d.id)).toContain(first.id);
  });

  it('relates tickets and bulk-updates as a manager', async () => {
    const company = await makeCompany(admin, 'Bulk Co');
    const a = (await tech.post('/api/v1/tickets', { title: 'A', companyId: company.id })).body;
    const b = (await tech.post('/api/v1/tickets', { title: 'B', companyId: company.id })).body;
    expect((await tech.post(`/api/v1/tickets/${a.id}/relations`, { relatedTicketId: b.id, type: 'related' })).status).toBe(201);
    expect((await tech.get(`/api/v1/tickets/${b.id}/relations`)).body.data[0].ticketId).toBe(a.id);
    expect((await tech.post('/api/v1/tickets/bulk', { ids: [a.id, b.id], changes: { priorityId: priorityId('Low') } })).status).toBe(403);
    const mgr = await userClient(ctx, 'service_desk_manager');
    const res = await mgr.post('/api/v1/tickets/bulk', { ids: [a.id, b.id], changes: { priorityId: priorityId('Low'), assignedUserId: tech.userId } });
    expect(res.body.updated).toBe(2);
  });
});

describe('SLA monitor', () => {
  it('flags breaches once and notifies the assignee', async () => {
    const company = await makeCompany(admin, 'Breach Co');
    const { body: t } = await admin.post('/api/v1/tickets', { title: 'Down', companyId: company.id, assignedUserId: tech.userId });
    await ctx.db
      .update(schema.tickets)
      .set({ firstResponseDueAt: new Date(Date.now() - 60_000), resolutionDueAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.tickets.id, t.id));
    const first = await runSlaMonitor(ctx.db);
    expect(first.breached).toBeGreaterThanOrEqual(2);
    const second = await runSlaMonitor(ctx.db);
    expect(second.breached).toBe(0);
    const row = (await tech.get(`/api/v1/tickets/${t.id}`)).body;
    expect(row.firstResponseBreached).toBe(true);
    expect(row.sla.overall).toBe('breached');
    const n = await tech.get('/api/v1/notifications');
    expect(n.body.data.some((x: any) => x.type === 'ticket.sla_breached' && x.entityId === t.id)).toBe(true);
  });
});
