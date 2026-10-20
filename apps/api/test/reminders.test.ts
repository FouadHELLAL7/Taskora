import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, makeCompany, userClient, type Client, type TestContext } from './helpers.js';
import { runBusinessReminders } from '../src/jobs/reminders.js';

let ctx: TestContext;
let admin: Client & { userId: number };

beforeAll(async () => {
  ctx = await createTestApp();
  admin = await userClient(ctx, 'administrator');
});
afterAll(async () => ctx.close());

const inDays = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);

describe('business reminders', () => {
  it('announces ending contracts and expiring warranties once', async () => {
    const co = await makeCompany(admin, 'Renewal Co');
    await admin.post('/api/v1/contracts', { name: 'Support 2026', companyId: co.id, type: 'recurring', startDate: inDays(-300), endDate: inDays(20) });
    await admin.post('/api/v1/contracts', { name: 'Long contract', companyId: co.id, type: 'recurring', startDate: inDays(-10), endDate: inDays(200) });
    const types = (await admin.get('/api/v1/lookups')).body.ciTypes;
    await admin.post('/api/v1/configuration-items', { name: 'OLD-SRV', ciTypeId: types[0].id, companyId: co.id, warrantyExpiresAt: inDays(10) });
    expect(await runBusinessReminders(ctx.db)).toEqual({ contracts: 1, warranties: 1 });
    expect(await runBusinessReminders(ctx.db)).toEqual({ contracts: 0, warranties: 0 });
    const n = (await admin.get('/api/v1/notifications')).body.data.map((x: { type: string }) => x.type);
    expect(n).toContain('contract.expiring');
    expect(n).toContain('ci.warranty_expiring');
  });
});
