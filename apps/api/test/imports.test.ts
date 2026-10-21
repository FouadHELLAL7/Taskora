import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, userClient, type Client, type TestContext } from './helpers.js';
import { parseCsv } from '../src/modules/imports/routes.js';
import { splitNotes, toDateTime } from '../src/modules/imports/tickets.js';

let ctx: TestContext;
let admin: Client;

beforeAll(async () => {
  ctx = await createTestApp();
  admin = await userClient(ctx, 'administrator');
});
afterAll(async () => ctx.close());

describe('CSV import', () => {
  it('parses quoted CSV and semicolon files', () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\r\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"']]);
    expect(parseCsv('﻿name;city\nAcme;Ghent\n\n')).toEqual([['name', 'city'], ['Acme', 'Ghent']]);
  });

  it('previews then imports companies, contacts and CIs with matching', async () => {
    const companies = 'Company Name,Account Number,Phone,City\nNorthwind Traders,NW-01,+32 2 555 0100,Brussels\nContoso Ltd,CT-01,,Antwerp\n';
    const preview = await admin.post('/api/v1/imports', { entity: 'company', csv: companies, dryRun: true });
    expect(preview.body).toMatchObject({ dryRun: true, total: 2, valid: 2, creates: 2 });
    expect((await admin.get('/api/v1/companies?q=northwind')).body.total).toBe(0);

    const done = await admin.post('/api/v1/imports', { entity: 'company', csv: companies, dryRun: false });
    expect(done.body.creates).toBe(2);
    // Re-importing updates by account number instead of duplicating.
    const again = await admin.post('/api/v1/imports', { entity: 'company', csv: companies.replace('Brussels', 'Leuven'), dryRun: false });
    expect(again.body.updates).toBe(2);
    const nw = (await admin.get('/api/v1/companies?q=northwind')).body.data[0];
    expect(nw.city).toBe('Leuven');

    const contacts = 'Company,First Name,Last Name,Email Address,Job Title\nNorthwind Traders,Ana,Trujillo,ana@northwind.example,Owner\nUnknown Inc,Bob,X,bob@x.example,\n';
    const bad = await admin.post('/api/v1/imports', { entity: 'contact', csv: contacts, dryRun: false });
    expect(bad.status).toBe(400);
    expect((await admin.get(`/api/v1/contacts?companyId=${nw.id}`)).body.total).toBe(0);
    const good = await admin.post('/api/v1/imports', { entity: 'contact', csv: contacts.split('\n').slice(0, 2).join('\n'), dryRun: false });
    expect(good.body.creates).toBe(1);

    const cis = 'Device Name,Company,Type,Serial Number,Operating System,Assigned To,Warranty Expiration\nNW-LT-01,Northwind Traders,Laptop,SN-123,Windows 11 Pro,ana@northwind.example,31/12/2027\n';
    const ci = await admin.post('/api/v1/imports', { entity: 'ci', csv: cis, dryRun: false });
    expect(ci.body.creates).toBe(1);
    const row = (await admin.get('/api/v1/configuration-items?q=SN-123')).body.data[0];
    expect(row).toMatchObject({ name: 'NW-LT-01', ciTypeName: 'Laptop', contactName: 'Ana Trujillo', warrantyExpiresAt: '2027-12-31', source: 'import' });
  });

  it('parses European, US and ISO date/times in the organisation time zone', () => {
    expect(toDateTime('21/10/2026 14:30', 'Europe/Brussels')!.toISOString()).toBe('2026-10-21T12:30:00.000Z');
    expect(toDateTime('10/21/2026 2:30 PM', 'Europe/Brussels')!.toISOString()).toBe('2026-10-21T12:30:00.000Z');
    expect(toDateTime('2026-10-21 14:30', 'UTC')!.toISOString()).toBe('2026-10-21T14:30:00.000Z');
    expect(toDateTime('2026-10-21T09:00:00.000Z', 'Europe/Brussels')!.toISOString()).toBe('2026-10-21T09:00:00.000Z');
    expect(toDateTime('not a date', 'UTC')).toBeNull();
    expect(splitNotes('[2026-10-01 08:00 UTC · Alex Morgan]\nFirst\n\n[2026-10-02 09:30 UTC · customer-visible]\nSecond', 'internal')).toEqual([
      { body: 'First', visibility: 'internal', at: new Date('2026-10-01T08:00:00Z') },
      { body: 'Second', visibility: 'public', at: new Date('2026-10-02T09:30:00Z') },
    ]);
    expect(splitNotes('Plain note', 'public')).toEqual([{ body: 'Plain note', visibility: 'public' }]);
  });

  it('imports tickets with notes, maps statuses and is safe to re-import', async () => {
    const co = (await admin.post('/api/v1/companies', { name: 'Ticket Import Co' })).body;
    await admin.post('/api/v1/contacts', { companyId: co.id, firstName: 'Lena', lastName: 'Peeters', email: 'lena@tic.example' });
    const csv = [
      'Ticket;Title;Company;Contact;Status;Priority;Queue;Assigned to;Type;Issue type;SLA;Hours worked;Created;Resolved;Note',
      'T20260101.0001;Printer offline;Ticket Import Co;Lena Peeters;Complete;High;Service Desk;;Incident;Printer gremlins;Met;1,5;01/10/2026 09:00;02/10/2026 16:00;Replaced the toner',
      'T20260101.0001;;;;;;;;;;;;;;Customer confirmed it works',
      'T20260101.0002;"VPN; drops";Ticket Import Co;nobody@tic.example;In Progress;P3;;;;;;;2026-10-15 08:30;;',
    ].join('\n');
    const preview = await admin.post('/api/v1/imports', { entity: 'ticket', csv, dryRun: true });
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ total: 3, valid: 3, creates: 2, updates: 1, unmappedColumns: [] });
    expect(preview.body.results[0].warnings.join(' ')).toContain('Status "Complete" mapped to "Closed"');
    expect(preview.body.results[0].warnings.join(' ')).toContain('Issue type "Printer gremlins" not found');
    expect((await admin.get('/api/v1/tickets?q=Printer%20offline')).body.total).toBe(0);

    const done = await admin.post('/api/v1/imports', { entity: 'ticket', csv, dryRun: false });
    expect(done.status).toBe(200);
    const list = (await admin.get(`/api/v1/tickets?companyId=${co.id}&statusCategory=all`)).body.data;
    const printer = list.find((t: any) => t.ticketNumber === 'T20260101.0001');
    expect(printer).toMatchObject({ title: 'Printer offline', statusName: 'Closed', priorityName: 'High', queueName: 'Service Desk', contactName: 'Lena Peeters', minutesWorked: 90 });
    expect(printer.createdAt).toBe(new Date(Date.UTC(2026, 9, 1, 9, 0)).toISOString());
    expect(printer.resolvedAt).toBe(new Date(Date.UTC(2026, 9, 2, 16, 0)).toISOString());
    const vpn = list.find((t: any) => t.ticketNumber === 'T20260101.0002');
    expect(vpn).toMatchObject({ title: 'VPN; drops', statusName: 'In Progress', priorityName: 'Medium', contactId: null });
    const timeline = (await admin.get(`/api/v1/tickets/${printer.id}/timeline`)).body.data;
    const bodies = timeline.filter((i: any) => i.kind === 'note').map((i: any) => i.note.body);
    expect(bodies).toEqual(expect.arrayContaining(['Replaced the toner', 'Customer confirmed it works']));

    // Re-importing the same file adds no duplicate notes or time.
    const again = await admin.post('/api/v1/imports', { entity: 'ticket', csv, dryRun: false });
    expect(again.body).toMatchObject({ creates: 0, updates: 3 });
    const t2 = (await admin.get(`/api/v1/tickets/${printer.id}/timeline`)).body.data.filter((i: any) => i.kind === 'note');
    expect(t2).toHaveLength(2);
    expect((await admin.get(`/api/v1/tickets/${printer.id}`)).body.minutesWorked).toBe(90);

    // Export with chosen columns, including notes, and import it into a fresh ticket number.
    const exp = await admin.request('GET', `/api/v1/tickets/export.csv?companyId=${co.id}&statusCategory=all&columns=ticketNumber,title,companyName,statusName,notes,description`);
    const text = String(exp.body).replace(/^﻿/, '');
    expect(text.split('\r\n')[0]).toBe('Ticket,Title,Company,Status,Notes,Description');
    expect(text).toContain('Replaced the toner');
    const copy = text.replace(/T20260101\.0001/g, 'COPY-1').replace(/T20260101\.0002/g, 'COPY-2');
    const imported = await admin.post('/api/v1/imports', { entity: 'ticket', csv: copy, dryRun: false });
    expect(imported.body).toMatchObject({ creates: 2, unmappedColumns: [] });
    const copyTicket = (await admin.get('/api/v1/tickets?q=COPY-1&statusCategory=all')).body.data[0];
    const copyNotes = (await admin.get(`/api/v1/tickets/${copyTicket.id}/timeline`)).body.data.filter((i: any) => i.kind === 'note');
    expect(copyNotes.map((i: any) => i.note.body).sort()).toEqual(['Customer confirmed it works', 'Replaced the toner']);
  });

  it('rejects unknown companies unless missing records may be created', async () => {
    const csv = 'Title,Company,Contact,Contact email,Issue type,Sub-issue type,Note\nMailbox full,Brand New BV,Jan De Smet,jan@brandnew.example,E-mail,Mailbox,Raised quota\n';
    const strict = await admin.post('/api/v1/imports', { entity: 'ticket', csv, dryRun: true });
    expect(strict.body.results[0]).toMatchObject({ ok: false });
    expect(strict.body.results[0].errors[0]).toContain('Unknown company "Brand New BV"');
    const loose = await admin.post('/api/v1/imports', { entity: 'ticket', csv, dryRun: false, createMissing: true });
    expect(loose.status).toBe(200);
    const t = (await admin.get('/api/v1/tickets?q=Mailbox%20full')).body.data[0];
    expect(t).toMatchObject({ companyName: 'Brand New BV', contactName: 'Jan De Smet', issueTypeName: 'E-mail' });
    expect(t.ticketNumber).toMatch(/^TKA-/);
    const ro = await userClient(ctx, 'read_only');
    expect((await ro.post('/api/v1/imports', { entity: 'ticket', csv, dryRun: true })).status).toBe(403);
  });

  it('imports the documented example file', async () => {
    const csv = readFileSync(new URL('../../../docs/examples/tickets-import-example.csv', import.meta.url), 'utf8');
    const res = await admin.post('/api/v1/imports', { entity: 'ticket', csv, dryRun: false, createMissing: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 6, creates: 4, updates: 2, unmappedColumns: [] });
    const t = (await admin.get('/api/v1/tickets?q=T20260203.0007&statusCategory=all')).body.data[0];
    expect(t).toMatchObject({ statusName: 'In Progress', companyName: 'Northwind Traders', tags: ['onboarding'], minutesWorked: 90 });
    const notes = (await admin.get(`/api/v1/tickets/${t.id}/timeline`)).body.data.filter((i: any) => i.kind === 'note');
    expect(notes.map((i: any) => i.note.visibility).sort()).toEqual(['internal', 'internal', 'public']);

    // Importing the same file again changes nothing, including the row without a ticket number.
    const count = async () => (await admin.get('/api/v1/tickets?statusCategory=all&pageSize=1')).body.total as number;
    const before = await count();
    const again = await admin.post('/api/v1/imports', { entity: 'ticket', csv, dryRun: false, createMissing: true });
    expect(again.body).toMatchObject({ total: 6, creates: 0, updates: 6 });
    expect(await count()).toBe(before);
    const printers = (await admin.get('/api/v1/tickets?q=Printer on 2nd floor&statusCategory=all')).body.data;
    expect(printers).toHaveLength(1);
  });

  it('requires write permissions', async () => {
    const ro = await userClient(ctx, 'read_only');
    expect((await ro.post('/api/v1/imports', { entity: 'company', csv: 'name\nX', dryRun: true })).status).toBe(403);
  });
});
