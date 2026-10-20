import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, userClient, type Client, type TestContext } from './helpers.js';
import { parseCsv } from '../src/modules/imports/routes.js';

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

  it('requires write permissions', async () => {
    const ro = await userClient(ctx, 'read_only');
    expect((await ro.post('/api/v1/imports', { entity: 'company', csv: 'name\nX', dryRun: true })).status).toBe(403);
  });
});
