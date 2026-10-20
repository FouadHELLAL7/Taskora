import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, makeCompany, userClient, type Client, type TestContext } from './helpers.js';
import { nextOccurrence, runRecurringTickets } from '../src/modules/tickets/recurring.js';

let ctx: TestContext;
let admin: Client;

beforeAll(async () => {
  ctx = await createTestApp();
  admin = await userClient(ctx, 'administrator');
});
afterAll(async () => ctx.close());

describe('recurring tickets', () => {
  it('computes next occurrences', () => {
    const base = new Date('2026-01-31T08:00:00Z');
    expect(nextOccurrence(base, 'daily', 2).toISOString()).toBe('2026-02-02T08:00:00.000Z');
    expect(nextOccurrence(base, 'weekly', 1).toISOString()).toBe('2026-02-07T08:00:00.000Z');
    expect(nextOccurrence(new Date('2026-01-15T08:00:00Z'), 'quarterly', 1).toISOString()).toBe('2026-04-15T08:00:00.000Z');
    expect(nextOccurrence(new Date('2026-01-15T08:00:00Z'), 'yearly', 1).toISOString()).toBe('2027-01-15T08:00:00.000Z');
  });

  it('creates tickets when due, once, and advances the schedule', async () => {
    const co = await makeCompany(admin, 'Maintenance Co');
    const res = await admin.post('/api/v1/recurring-tickets', {
      name: 'Monthly server check',
      companyId: co.id,
      title: 'Monthly server health check',
      description: 'Check disk space, event logs and backups.',
      frequency: 'monthly',
      dueInHours: 48,
      nextRunAt: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(res.status).toBe(201);
    expect(await runRecurringTickets(ctx.db)).toBe(1);
    expect(await runRecurringTickets(ctx.db)).toBe(0);
    const list = (await admin.get('/api/v1/recurring-tickets')).body.data;
    const r = list.find((x: { id: number }) => x.id === res.body.id);
    expect(new Date(r.nextRunAt).getTime()).toBeGreaterThan(Date.now() + 20 * 86400_000);
    expect(r.lastTicketNumber).toMatch(/^TKA-/);
    const tickets = (await admin.get(`/api/v1/tickets?companyId=${co.id}`)).body.data;
    expect(tickets).toHaveLength(1);
    expect(tickets[0].tags).toContain('recurring');
    expect(tickets[0].dueAt).toBeTruthy();

    // Run now creates another one immediately.
    await admin.post(`/api/v1/recurring-tickets/${res.body.id}/run`);
    expect((await admin.get(`/api/v1/tickets?companyId=${co.id}`)).body.total).toBe(2);
  });

  it('validates input', async () => {
    const res = await admin.post('/api/v1/recurring-tickets', { name: '', companyId: null, title: '', nextRunAt: 'x' });
    expect(res.status).toBe(400);
  });
});
