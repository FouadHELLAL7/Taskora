import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestApp, makeCompany, userClient, type Client, type TestContext } from './helpers.js';
import { schema } from '../src/db/client.js';
import { resolveSmtp } from '../src/lib/mail.js';

interface Sent {
  from: string;
  to: string[] | string;
  cc?: string[];
  subject: string;
  text: string;
  replyTo?: string;
  attachments?: { filename: string }[];
}

let ctx: TestContext;
let admin: Client & { userId: number };
let tech: Client & { userId: number };
let readOnly: Client & { userId: number };
const sent: Sent[] = [];
let fail = false;
const transport = {
  sendMail: async (m: Sent) => {
    if (fail) throw new Error('550 relay denied');
    sent.push(m);
  },
} as never;
const api = (p: string) => `/api/v1${p}`;
const smtp = { enabled: true, host: 'smtp.example.test', port: 587, secure: false, user: 'mailer', password: 'fake-smtp-pass-123', from: 'Support <support@example.test>', replyTo: 'help@example.test', signature: 'Fouad\nExample IT' };

beforeAll(async () => {
  ctx = await createTestApp({}, { mailTransport: transport });
  admin = await userClient(ctx, 'administrator');
  tech = await userClient(ctx, 'technician');
  readOnly = await userClient(ctx, 'read_only');
});
afterAll(async () => ctx.close());

describe('SMTP settings', () => {
  it('stores settings with an encrypted password that is never returned', async () => {
    expect((await tech.get(api('/settings/email'))).status).toBe(403);
    expect((await admin.get(api('/auth/me'))).body.emailEnabled).toBe(false);

    const res = await admin.put(api('/settings/email'), smtp);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ enabled: true, host: 'smtp.example.test', hasPassword: true, effectiveSource: 'settings' });
    expect(JSON.stringify(res.body)).not.toContain('fake-smtp-pass');
    const [row] = await ctx.db.select().from(schema.systemSettings).where(eq(schema.systemSettings.key, 'smtp'));
    expect(JSON.stringify(row!.value)).not.toContain('fake-smtp-pass');
    expect((await resolveSmtp(ctx.db, ctx.app.config))?.password).toBe('fake-smtp-pass-123');

    // Saving without a password keeps the stored one.
    const { password: _p, ...withoutPassword } = smtp;
    await admin.put(api('/settings/email'), { ...withoutPassword, port: 2525 });
    expect(await resolveSmtp(ctx.db, ctx.app.config)).toMatchObject({ port: 2525, password: 'fake-smtp-pass-123' });
    expect((await admin.get(api('/auth/me'))).body.emailEnabled).toBe(true);
  });

  it('rejects incomplete settings and sends a test e-mail', async () => {
    expect((await admin.put(api('/settings/email'), { ...smtp, host: '' })).status).toBe(400);
    expect((await admin.put(api('/settings/email'), { ...smtp, from: 'not an address' })).status).toBe(400);
    const res = await admin.post(api('/settings/email/test'), { to: 'me@example.test' });
    expect(res.status).toBe(200);
    expect(sent.at(-1)).toMatchObject({ to: 'me@example.test', from: 'Support <support@example.test>', replyTo: 'help@example.test' });
    expect(sent.at(-1)!.text).toContain('Example IT');
  });
});

describe('e-mail from a ticket', () => {
  it('pre-fills a draft for the ticket contact', async () => {
    const co = await makeCompany(admin, 'Mailing Co');
    const contact = await admin.post(api('/contacts'), { companyId: co.id, firstName: 'Nora', lastName: 'Lee', email: 'nora@mailing.example' });
    const t = await tech.post(api('/tickets'), { title: 'VPN drops', companyId: co.id, contactId: contact.body.id });
    const draft = await tech.get(api(`/tickets/${t.body.id}/email/draft`));
    expect(draft.body).toMatchObject({ enabled: true, to: ['nora@mailing.example'], subject: `[${t.body.ticketNumber}] VPN drops` });
    expect(draft.body.body).toContain('Hello Nora,');
  });

  it('sends to several recipients, records a public note and a timeline event', async () => {
    const co = await makeCompany(admin, 'Send Co');
    const t = await tech.post(api('/tickets'), { title: 'Printer offline', companyId: co.id });
    const res = await tech.post(api(`/tickets/${t.body.id}/email`), {
      to: ['a@send.example', 'B@send.example'],
      cc: ['boss@send.example'],
      subject: 'Printer update',
      body: 'We replaced the toner.',
    });
    expect(res.status).toBe(201);
    const m = sent.at(-1)!;
    expect(m.to).toEqual(['a@send.example', 'b@send.example']);
    expect(m.cc).toEqual(['boss@send.example']);
    expect(m.subject).toBe(`[${t.body.ticketNumber}] Printer update`);
    expect(m.text).toContain('We replaced the toner.');
    expect(m.text).toContain('Example IT');

    const [note] = await ctx.db.select().from(schema.ticketNotes).where(eq(schema.ticketNotes.id, res.body.noteId));
    expect(note).toMatchObject({ visibility: 'public', kind: 'email_out' });
    expect(note!.body).toContain('To: a@send.example, b@send.example');
    const events = await ctx.db.select().from(schema.ticketEvents).where(eq(schema.ticketEvents.ticketId, t.body.id));
    expect(events.find((e) => e.type === 'email_sent')?.data).toMatchObject({ subject: m.subject, cc: ['boss@send.example'] });
    // A customer-visible message counts as the first response.
    const [after] = await ctx.db.select().from(schema.tickets).where(eq(schema.tickets.id, t.body.id));
    expect(after!.firstResponseAt).not.toBeNull();
  });

  it('validates recipients and permissions, and reports SMTP failures without recording a note', async () => {
    const co = await makeCompany(admin, 'Fail Co');
    const t = await tech.post(api('/tickets'), { title: 'Mail test', companyId: co.id });
    expect((await readOnly.post(api(`/tickets/${t.body.id}/email`), { to: ['x@y.example'], subject: 's', body: 'b' })).status).toBe(403);
    expect((await tech.post(api(`/tickets/${t.body.id}/email`), { to: [], subject: 's', body: 'b' })).status).toBe(400);
    expect((await tech.post(api(`/tickets/${t.body.id}/email`), { to: ['nope'], subject: 's', body: 'b' })).status).toBe(400);
    expect((await tech.post(api(`/tickets/${t.body.id}/email`), { to: ['x@y.example'], subject: 's', body: 'b', attachmentIds: [999999] })).status).toBe(400);

    fail = true;
    const res = await tech.post(api(`/tickets/${t.body.id}/email`), { to: ['x@y.example'], subject: 's', body: 'b' });
    fail = false;
    expect(res.status).toBe(502);
    expect(res.body.error.message).toContain('550 relay denied');
    expect(await ctx.db.select().from(schema.ticketNotes).where(eq(schema.ticketNotes.ticketId, t.body.id))).toHaveLength(0);
  });

  it('refuses to send when outgoing e-mail is disabled', async () => {
    await admin.put(api('/settings/email'), { ...smtp, enabled: false });
    const co = await makeCompany(admin, 'Off Co');
    const t = await tech.post(api('/tickets'), { title: 'Off', companyId: co.id });
    const res = await tech.post(api(`/tickets/${t.body.id}/email`), { to: ['x@y.example'], subject: 's', body: 'b' });
    expect(res.status).toBe(400);
    expect((await tech.get(api(`/tickets/${t.body.id}/email/draft`))).body.enabled).toBe(false);
  });
});

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4cf0000000049454e44ae426082', 'hex');

describe('logos', () => {
  it('uploads, serves and removes a company logo', async () => {
    const co = await makeCompany(admin, 'Logo Co');
    expect((await readOnly.put(api(`/logos/company/${co.id}`), { dataUrl: `data:image/png;base64,${PNG.toString('base64')}` })).status).toBe(403);
    const up = await tech.put(api(`/logos/company/${co.id}`), { dataUrl: `data:image/png;base64,${PNG.toString('base64')}` });
    expect(up.status).toBe(200);
    expect((await tech.get(api(`/companies/${co.id}`))).body.logoUpdatedAt).toBeTruthy();
    const list = await tech.get(api('/companies?q=Logo Co'));
    expect(list.body.data[0].logoUpdatedAt).toBeTruthy();

    const img = await ctx.app.inject({ method: 'GET', url: api(`/logos/company/${co.id}`), headers: { cookie: readOnly.cookie } });
    expect(img.statusCode).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.rawPayload.equals(PNG)).toBe(true);

    expect((await tech.delete(api(`/logos/company/${co.id}`))).status).toBe(200);
    expect((await tech.get(api(`/logos/company/${co.id}`))).status).toBe(404);
    expect((await tech.get(api(`/companies/${co.id}`))).body.logoUpdatedAt).toBeNull();
  });

  it('rejects SVG, mismatched content and oversized files', async () => {
    const co = await makeCompany(admin, 'Bad Logo Co');
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');
    expect((await tech.put(api(`/logos/company/${co.id}`), { dataUrl: `data:image/svg+xml;base64,${svg}` })).status).toBe(400);
    expect((await tech.put(api(`/logos/company/${co.id}`), { dataUrl: `data:image/png;base64,${Buffer.from('GIF89a').toString('base64')}` })).status).toBe(400);
    const big = Buffer.concat([PNG, Buffer.alloc(600 * 1024)]).toString('base64');
    expect((await tech.put(api(`/logos/company/${co.id}`), { dataUrl: `data:image/png;base64,${big}` })).status).toBe(400);
  });

  it('serves the organization logo publicly and lets only admins change it', async () => {
    expect((await tech.put(api('/logos/organization'), { dataUrl: `data:image/png;base64,${PNG.toString('base64')}` })).status).toBe(403);
    expect((await admin.put(api('/logos/organization'), { dataUrl: `data:image/png;base64,${PNG.toString('base64')}` })).status).toBe(200);
    const res = await ctx.app.inject({ method: 'GET', url: api('/logos/organization') });
    expect(res.statusCode).toBe(200);
    expect((await admin.get(api('/settings/system'))).body.logoUpdatedAt).toBeTruthy();
  });
});
