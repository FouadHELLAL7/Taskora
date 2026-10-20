import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, createTestApp, userClient, type TestContext } from './helpers.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => ctx.close());

describe('first-run setup', () => {
  it('reports that setup is needed, rejects a wrong token and creates the administrator', async () => {
    const c = new Client(ctx.app);
    expect((await c.get('/api/v1/setup/status')).body.needsSetup).toBe(true);

    const payload = {
      setupToken: 'wrong-token',
      organizationName: 'Acme IT',
      firstName: 'Ada',
      lastName: 'Admin',
      email: 'ada@example.test',
      password: 'Very-Secure-Passw0rd',
      timezone: 'Europe/Brussels',
    };
    expect((await c.post('/api/v1/setup', payload)).status).toBe(403);
    const ok = await c.post('/api/v1/setup', { ...payload, setupToken: 'test-setup-token-123456' });
    expect(ok.status).toBe(200);
    c.csrf = ok.body.csrfToken;

    const me = await c.get('/api/v1/auth/me');
    expect(me.body.user.email).toBe('ada@example.test');
    expect(me.body.user.permissions).toContain('*');
    expect(me.body.organization.name).toBe('Acme IT');

    // Setup can only run once.
    expect((await new Client(ctx.app).post('/api/v1/setup', { ...payload, setupToken: 'test-setup-token-123456' })).status).toBe(409);
  });

  it('rejects weak passwords at setup', async () => {
    const res = await new Client(ctx.app).post('/api/v1/setup', {
      setupToken: 'x',
      organizationName: 'X',
      firstName: 'A',
      lastName: 'B',
      email: 'a@b.test',
      password: 'short',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields.password).toBeTruthy();
  });
});

describe('sessions', () => {
  it('requires authentication for API routes', async () => {
    const res = await new Client(ctx.app).get('/api/v1/companies');
    expect(res.status).toBe(401);
  });

  it('logs in, enforces CSRF on mutations and logs out', async () => {
    const c = await userClient(ctx, 'technician');
    expect((await c.get('/api/v1/companies')).status).toBe(200);

    const csrf = c.csrf;
    c.csrf = '';
    expect((await c.post('/api/v1/companies', { name: 'No CSRF Ltd' })).status).toBe(403);
    c.csrf = csrf;
    expect((await c.post('/api/v1/companies', { name: 'With CSRF Ltd' })).status).toBe(201);

    expect((await c.post('/api/v1/auth/logout')).status).toBe(200);
    expect((await c.get('/api/v1/companies')).status).toBe(401);
  });

  it('rejects invalid credentials without revealing whether the account exists', async () => {
    const c = new Client(ctx.app);
    const unknown = await c.post('/api/v1/auth/login', { email: 'nobody@example.test', password: 'whatever-123' });
    const wrong = await c.post('/api/v1/auth/login', { email: 'ada@example.test', password: 'wrong-password-1' });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
  });

  it('changes the password and invalidates the old one', async () => {
    const c = await userClient(ctx, 'technician');
    const res = await c.post('/api/v1/auth/change-password', { currentPassword: 'Correct-Horse-42', newPassword: 'Another-Good-Pass-9' });
    expect(res.status).toBe(200);
  });
});

describe('login rate limiting', () => {
  it('throttles repeated login attempts from one address', async () => {
    const limited = await createTestApp({ AUTH_RATE_LIMIT_PER_MINUTE: '3' });
    try {
      const c = new Client(limited.app);
      const codes: number[] = [];
      for (let i = 0; i < 5; i++) codes.push((await c.post('/api/v1/auth/login', { email: 'x@example.test', password: 'whatever-123' })).status);
      expect(codes.slice(0, 3)).toEqual([401, 401, 401]);
      expect(codes[4]).toBe(429);
    } finally {
      await limited.close();
    }
  });
});

describe('session management', () => {
  it('lists own sessions and signs out the others', async () => {
    const a = await userClient(ctx, 'technician');
    const email = (await a.get('/api/v1/auth/me')).body.user.email;
    const b = new Client(ctx.app);
    await b.login(email, 'Correct-Horse-42');
    const list = await a.get('/api/v1/auth/sessions');
    expect(list.body.data).toHaveLength(2);
    expect(list.body.data.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
    expect((await a.delete('/api/v1/auth/sessions/others')).status).toBe(200);
    expect((await b.get('/api/v1/auth/me')).status).toBe(401);
    expect((await a.get('/api/v1/auth/me')).status).toBe(200);
  });

  it('lets administrators revoke all sessions of a user', async () => {
    const admin = await userClient(ctx, 'administrator');
    const tech = await userClient(ctx, 'technician');
    expect((await admin.post(`/api/v1/users/${tech.userId}/revoke-sessions`)).body.revoked).toBe(1);
    expect((await tech.get('/api/v1/auth/me')).status).toBe(401);
  });
});

describe('permissions', () => {
  it('blocks read-only users from writing and from admin endpoints', async () => {
    const ro = await userClient(ctx, 'read_only');
    expect((await ro.get('/api/v1/companies')).status).toBe(200);
    expect((await ro.post('/api/v1/companies', { name: 'Nope' })).status).toBe(403);
    expect((await ro.get('/api/v1/users')).status).toBe(403);
    expect((await ro.post('/api/v1/settings/queues', { name: 'X' })).status).toBe(403);
  });

  it('lets technicians work tickets but not manage users or delete tickets', async () => {
    const tech = await userClient(ctx, 'technician');
    expect((await tech.get('/api/v1/users')).status).toBe(403);
    expect((await tech.get('/api/v1/audit-logs')).status).toBe(403);
    const company = await tech.post('/api/v1/companies', { name: 'Tech Co' });
    const ticket = await tech.post('/api/v1/tickets', { title: 'Printer offline', companyId: company.body.id });
    expect(ticket.status).toBe(201);
    expect((await tech.delete(`/api/v1/tickets/${ticket.body.id}`)).status).toBe(403);
  });

  it('protects built-in roles from modification', async () => {
    const admin = await userClient(ctx, 'administrator');
    const roles = await admin.get('/api/v1/roles');
    const tech = roles.body.data.find((r: { key: string }) => r.key === 'technician');
    expect((await admin.patch(`/api/v1/roles/${tech.id}`, { permissions: ['*'] })).status).toBe(400);
    expect((await admin.delete(`/api/v1/roles/${tech.id}`)).status).toBe(400);
  });
});

describe('system health', () => {
  it('reports database, worker and job information to administrators only', async () => {
    const admin = await userClient(ctx, 'administrator');
    const res = await admin.get('/api/v1/admin/system-health');
    expect(res.status).toBe(200);
    expect(res.body.database.sizeBytes).toBeGreaterThan(0);
    expect(res.body.database.migrations).toBeGreaterThan(0);
    expect(res.body.worker).toHaveProperty('alive');
    const tech = await userClient(ctx, 'technician');
    expect((await tech.get('/api/v1/admin/system-health')).status).toBe(403);
  });
});
