import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, createTestApp, makeCompany, userClient, type TestContext } from './helpers.js';

let ctx: TestContext;
let admin: Client;

beforeAll(async () => {
  ctx = await createTestApp();
  admin = await userClient(ctx, 'administrator');
});
afterAll(async () => ctx.close());

async function portalLogin(email: string, password: string) {
  const c = new Client(ctx.app);
  const res = await c.post('/api/portal/login', { email, password });
  if (res.status !== 200) throw new Error(JSON.stringify(res.body));
  c.csrf = res.body.csrfToken;
  return c;
}

describe('customer portal', () => {
  it('lets a contact see only their tickets and customer-visible notes', async () => {
    const co = await makeCompany(admin, 'Portal Co');
    const emma = (await admin.post('/api/v1/contacts', { companyId: co.id, firstName: 'Emma', lastName: 'Smith', email: 'emma@portal.example' })).body;
    const liam = (await admin.post('/api/v1/contacts', { companyId: co.id, firstName: 'Liam', lastName: 'Brown', email: 'liam@portal.example' })).body;
    expect(emma.portalPasswordHash).toBeUndefined();

    const access = await admin.post(`/api/v1/contacts/${emma.id}/portal`, { enabled: true });
    expect(access.body.password).toBeTruthy();
    const portal = await portalLogin('emma@portal.example', access.body.password);
    expect((await portal.get('/api/portal/me')).body.contact.companyName).toBe('Portal Co');

    const mine = (await admin.post('/api/v1/tickets', { title: 'Emma printer', companyId: co.id, contactId: emma.id })).body;
    const other = (await admin.post('/api/v1/tickets', { title: 'Liam laptop', companyId: co.id, contactId: liam.id })).body;
    await admin.post(`/api/v1/tickets/${mine.id}/notes`, { body: 'Internal: printer is ancient', visibility: 'internal' });
    await admin.post(`/api/v1/tickets/${mine.id}/notes`, { body: 'We ordered a new toner.', visibility: 'public' });

    const list = await portal.get('/api/portal/tickets');
    expect(list.body.data.map((t: { id: number }) => t.id)).toEqual([mine.id]);
    expect((await portal.get(`/api/portal/tickets/${other.id}`)).status).toBe(404);
    const detail = (await portal.get(`/api/portal/tickets/${mine.id}`)).body;
    expect(detail.notes.map((n: { body: string }) => n.body)).toEqual(['We ordered a new toner.']);
    expect(JSON.stringify(detail)).not.toContain('ancient');

    // Portal cookie grants nothing on the staff API, and CSRF is enforced.
    expect((await portal.get('/api/v1/companies')).status).toBe(401);
    const csrf = portal.csrf;
    portal.csrf = '';
    expect((await portal.post('/api/portal/tickets', { title: 'No CSRF here' })).status).toBe(403);
    portal.csrf = csrf;

    const created = await portal.post('/api/portal/tickets', { title: 'Need a new mouse', description: 'Scroll wheel broken' });
    expect(created.status).toBe(201);
    const staffView = (await admin.get(`/api/v1/tickets/${created.body.id}`)).body;
    expect(staffView).toMatchObject({ contactId: emma.id, companyId: co.id, sourceName: 'Portal' });

    expect((await portal.post(`/api/portal/tickets/${mine.id}/replies`, { body: 'Thanks!' })).status).toBe(201);
    expect((await portal.post(`/api/portal/tickets/${other.id}/replies`, { body: 'sneaky' })).status).toBe(404);

    // Disabling access ends the session.
    await admin.post(`/api/v1/contacts/${emma.id}/portal`, { enabled: false });
    expect((await portal.get('/api/portal/tickets')).status).toBe(401);
  });

  it('rejects wrong passwords and contacts without access', async () => {
    const res = await new Client(ctx.app).post('/api/portal/login', { email: 'liam@portal.example', password: 'whatever-123' });
    expect(res.status).toBe(401);
  });

  it('shows only public, published knowledge-base articles', async () => {
    const co = await makeCompany(admin, 'KB Portal Co');
    const c = (await admin.post('/api/v1/contacts', { companyId: co.id, firstName: 'Ana', lastName: 'T', email: 'ana@kbportal.example' })).body;
    const pw = (await admin.post(`/api/v1/contacts/${c.id}/portal`, { enabled: true })).body.password;
    await admin.post('/api/v1/kb/articles', { title: 'How to reset your password', body: 'Use the self-service page.', visibility: 'public', status: 'published' });
    await admin.post('/api/v1/kb/articles', { title: 'Internal runbook', body: 'secret', visibility: 'internal', status: 'published' });
    const portal = await portalLogin('ana@kbportal.example', pw);
    const titles = (await portal.get('/api/portal/kb')).body.data.map((a: { title: string }) => a.title);
    expect(titles).toContain('How to reset your password');
    expect(titles).not.toContain('Internal runbook');
  });
});
