import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestApp, makeCompany, userClient, type Client, type TestContext } from './helpers.js';
import { schema } from '../src/db/client.js';
import { loadConfig } from '../src/config.js';
import { dispatchNotificationEmails, sendCustomerNote } from '../src/jobs/email.js';

let ctx: TestContext;
let admin: Client & { userId: number };
let tech: Client & { userId: number };
const smtp = loadConfig({ NODE_ENV: 'test', SMTP_HOST: 'smtp.example.test', SMTP_FROM: 'taskora@example.test', PUBLIC_URL: 'https://psa.example.test' });

beforeAll(async () => {
  ctx = await createTestApp();
  admin = await userClient(ctx, 'administrator');
  tech = await userClient(ctx, 'technician');
});
afterAll(async () => ctx.close());

describe('e-mail notifications', () => {
  it('mails pending notifications once, with a link, and honours opt-out', async () => {
    const sent: { to: string; subject: string; text: string }[] = [];
    const transport = { sendMail: async (m: { to: string; subject: string; text: string }) => void sent.push(m) } as never;
    const co = await makeCompany(admin, 'Mail Co');
    const { body: t } = await admin.post('/api/v1/tickets', { title: 'Printer down', companyId: co.id, assignedUserId: tech.userId });

    // Disabled SMTP: nothing happens.
    expect(await dispatchNotificationEmails(ctx.db, loadConfig({ NODE_ENV: 'test' }), transport)).toEqual({ sent: 0, skipped: 0, failed: 0 });

    const first = await dispatchNotificationEmails(ctx.db, smtp, transport);
    expect(first.sent).toBe(1);
    expect(sent[0]!.subject).toContain(`Ticket ${t.ticketNumber} assigned to you`);
    expect(sent[0]!.text).toContain(`https://psa.example.test/tickets/${t.id}`);
    expect((await dispatchNotificationEmails(ctx.db, smtp, transport)).sent).toBe(0);

    // Opt out, then a new notification is skipped.
    expect((await tech.patch('/api/v1/auth/preferences', { emailNotifications: false })).status).toBe(200);
    await admin.patch(`/api/v1/tickets/${t.id}`, { assignedUserId: null });
    await admin.patch(`/api/v1/tickets/${t.id}`, { assignedUserId: tech.userId });
    const third = await dispatchNotificationEmails(ctx.db, smtp, transport);
    expect(third).toMatchObject({ sent: 0, skipped: 1 });
    const rows = await ctx.db.select().from(schema.notifications).where(eq(schema.notifications.userId, tech.userId));
    expect(rows.every((r) => r.emailStatus !== null)).toBe(true);
  });

  it('e-mails customer-visible notes to the ticket contact with the ticket number in the subject', async () => {
    const sent: { to: string; subject: string; text: string }[] = [];
    const transport = { sendMail: async (m: { to: string; subject: string; text: string }) => void sent.push(m) } as never;
    const co = await makeCompany(admin, 'Reply Co');
    const contact = await admin.post('/api/v1/contacts', { companyId: co.id, firstName: 'Liam', lastName: 'Brown', email: 'liam@reply.example' });
    const { body: t } = await tech.post('/api/v1/tickets', { title: 'Mailbox full', companyId: co.id, contactId: contact.body.id });
    const note = await tech.post(`/api/v1/tickets/${t.id}/notes`, { body: 'I archived old items, please check.', visibility: 'public', notifyContact: true });
    expect(note.status).toBe(201);
    const [job] = await ctx.db.select().from(schema.jobs).where(eq(schema.jobs.type, 'email.customer_note'));
    expect(job!.payload).toEqual({ noteId: note.body.id });
    expect(await sendCustomerNote(ctx.db, smtp, note.body.id, transport)).toEqual({ sent: true });
    expect(sent[0]).toMatchObject({ to: 'liam@reply.example', subject: `[${t.ticketNumber}] Mailbox full` });
    expect(sent[0]!.text).toContain('I archived old items');
  });
});
