import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, makeCompany, userClient, type Client, type TestContext } from './helpers.js';

let ctx: TestContext;
let tech: Client;
let ro: Client;

beforeAll(async () => {
  ctx = await createTestApp();
  tech = await userClient(ctx, 'technician');
  ro = await userClient(ctx, 'read_only');
});
afterAll(async () => ctx.close());

describe('ticket checklists', () => {
  it('adds, ticks, renames and removes items', async () => {
    const co = await makeCompany(tech, 'Checklist Co');
    const { body: t } = await tech.post('/api/v1/tickets', { title: 'New starter', companyId: co.id });
    const added = await tech.post(`/api/v1/tickets/${t.id}/checklist`, { items: ['Create account', 'Assign licence', 'Prepare laptop'] });
    expect(added.status).toBe(201);
    expect(added.body.data.map((i: { text: string }) => i.text)).toEqual(['Create account', 'Assign licence', 'Prepare laptop']);
    const first = added.body.data[0].id;
    const ticked = await tech.patch(`/api/v1/tickets/${t.id}/checklist/${first}`, { isDone: true });
    expect(ticked.body.data[0]).toMatchObject({ isDone: true });
    expect(ticked.body.data[0].doneByName).toBeTruthy();
    const removed = await tech.delete(`/api/v1/tickets/${t.id}/checklist/${first}`);
    expect(removed.body.data).toHaveLength(2);
    expect((await tech.post(`/api/v1/tickets/${t.id}/checklist`, { text: '' })).status).toBe(400);
    expect((await ro.get(`/api/v1/tickets/${t.id}/checklist`)).status).toBe(200);
    expect((await ro.post(`/api/v1/tickets/${t.id}/checklist`, { text: 'x' })).status).toBe(403);
  });

  it('merges a duplicate ticket into another one', async () => {
    const co = await makeCompany(tech, 'Merge Co');
    const other = await makeCompany(tech, 'Other Merge Co');
    const a = (await tech.post('/api/v1/tickets', { title: 'Outlook crash', companyId: co.id })).body;
    const b = (await tech.post('/api/v1/tickets', { title: 'Outlook crashes again', companyId: co.id, description: 'Same issue' })).body;
    const c = (await tech.post('/api/v1/tickets', { title: 'Elsewhere', companyId: other.id })).body;
    await tech.post(`/api/v1/tickets/${b.id}/notes`, { body: 'Note on duplicate', visibility: 'internal' });
    await tech.post('/api/v1/time-entries', { ticketId: b.id, startedAt: new Date().toISOString(), durationMinutes: 15, description: 'Triage' });
    expect((await tech.post(`/api/v1/tickets/${b.id}/merge`, { intoTicketId: c.id })).status).toBe(400);
    expect((await tech.post(`/api/v1/tickets/${b.id}/merge`, { intoTicketId: a.id })).status).toBe(200);
    const merged = (await tech.get(`/api/v1/tickets/${b.id}`)).body;
    expect(merged.statusCategory).toBe('closed');
    expect(merged.resolution).toContain(a.ticketNumber);
    const target = (await tech.get(`/api/v1/tickets/${a.id}`)).body;
    expect(target.minutesWorked).toBe(15);
    const timeline = (await tech.get(`/api/v1/tickets/${a.id}/timeline`)).body.data;
    expect(timeline.some((i: { kind: string; note?: { body: string } }) => i.kind === 'note' && i.note!.body === 'Note on duplicate')).toBe(true);
  });
});
