import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestApp, makeCompany, userClient, type Client, type TestContext } from './helpers.js';
import { schema } from '../src/db/client.js';
import { loadConfig } from '../src/config.js';
import { processInboundEmail, stripQuotedReply } from '../src/jobs/inbound-email.js';
import { saveSystemSettings } from '../src/lib/settings.js';

let ctx: TestContext;
let admin: Client;
const config = loadConfig({ NODE_ENV: 'test', UPLOAD_DIR: './.data/test-uploads' });

beforeAll(async () => {
  ctx = await createTestApp();
  admin = await userClient(ctx, 'administrator');
});
afterAll(async () => ctx.close());

describe('inbound e-mail', () => {
  it('strips quoted history from replies', () => {
    expect(stripQuotedReply('Thanks, works now.\n\nOn Mon, 19 Oct 2026 at 10:00, Support wrote:\n> old text')).toBe('Thanks, works now.');
    expect(stripQuotedReply('Hello\n> quoted\nBye')).toBe('Hello\nBye');
  });

  it('creates a ticket for a known contact, threads replies and reopens waiting tickets', async () => {
    const co = await makeCompany(admin, 'Inbound Co');
    const contact = await admin.post('/api/v1/contacts', { companyId: co.id, firstName: 'Emma', lastName: 'Smith', email: 'emma@inbound.example' });
    const created = await processInboundEmail(ctx.db, config, {
      messageId: '<m1@example>',
      fromAddress: 'Emma@Inbound.example',
      fromName: 'Emma Smith',
      subject: 'VPN not connecting',
      text: 'Since this morning the VPN fails.',
      attachments: [
        { fileName: 'error.png', contentType: 'image/png', content: Buffer.from('png') },
        { fileName: 'evil.exe', contentType: 'application/octet-stream', content: Buffer.from('x') },
      ],
    });
    expect(created.status).toBe('created');
    const ticket = (await admin.get(`/api/v1/tickets/${created.ticketId}`)).body;
    expect(ticket.contactId).toBe(contact.body.id);
    expect(ticket.companyId).toBe(co.id);
    expect(ticket.sourceName).toBe('Email');
    const files = (await admin.get(`/api/v1/attachments/ticket/${created.ticketId}`)).body.data;
    expect(files.map((f: { fileName: string }) => f.fileName)).toEqual(['error.png']);

    // Duplicate delivery is ignored.
    expect((await processInboundEmail(ctx.db, config, { messageId: '<m1@example>', fromAddress: 'emma@inbound.example', subject: 'VPN not connecting' })).status).toBe('duplicate');

    // The ticket waits for the customer, then the customer replies.
    const lookups = (await admin.get('/api/v1/lookups')).body;
    const waiting = lookups.statuses.find((s: { name: string }) => s.name === 'Waiting for Customer').id;
    await admin.patch(`/api/v1/tickets/${ticket.id}`, { statusId: waiting });
    const reply = await processInboundEmail(ctx.db, config, {
      messageId: '<m2@example>',
      fromAddress: 'emma@inbound.example',
      subject: `RE: [${ticket.ticketNumber}] VPN not connecting`,
      text: 'It works after the reboot.\n\nOn Tue, Support wrote:\n> please reboot',
    });
    expect(reply).toMatchObject({ status: 'appended', ticketId: ticket.id });
    const after = (await admin.get(`/api/v1/tickets/${ticket.id}`)).body;
    expect(after.statusCategory).toBe('open');
    const notes = await ctx.db.select().from(schema.ticketNotes).where(eq(schema.ticketNotes.ticketId, ticket.id));
    expect(notes.some((n) => n.visibility === 'public' && n.body.includes('It works after the reboot.') && !n.body.includes('please reboot'))).toBe(true);
  });

  it('rejects unknown senders unless a fallback company is configured', async () => {
    const r1 = await processInboundEmail(ctx.db, config, { messageId: '<m3@example>', fromAddress: 'stranger@unknown.example', subject: 'Hello' });
    expect(r1.status).toBe('rejected');
    const fallback = await makeCompany(admin, 'Unidentified senders');
    await saveSystemSettings(ctx.db, { inboundEmailCompanyId: fallback.id });
    const r2 = await processInboundEmail(ctx.db, config, { messageId: '<m4@example>', fromAddress: 'stranger@unknown.example', subject: 'Hello again', text: 'Please help' });
    expect(r2.status).toBe('created');
    const t = (await admin.get(`/api/v1/tickets/${r2.ticketId}`)).body;
    expect(t.companyId).toBe(fallback.id);
    expect(t.description).toContain('stranger@unknown.example');
    const log = (await admin.get('/api/v1/inbound-emails')).body;
    expect(log.data.length).toBeGreaterThanOrEqual(4);
  });
});
