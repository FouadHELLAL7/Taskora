import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { eq } from 'drizzle-orm';
import { createTestApp, makeCompany, makeContact, userClient, type Client, type TestContext } from './helpers.js';
import { schema } from '../src/db/client.js';
import { autoBackupDue, pruneAutoBackups, saveBackup } from '../src/lib/backup.js';

let ctx: TestContext;
let admin: Client & { userId: number };
let tech: Client & { userId: number };
const dirs = { backups: mkdtempSync(join(tmpdir(), 'taskora-backups-')), uploads: mkdtempSync(join(tmpdir(), 'taskora-uploads-')) };
const api = (p: string) => `/api/v1${p}`;

function multipart(name: string, content: Buffer) {
  const boundary = '----taskora-test-boundary';
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/gzip\r\n\r\n`),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

async function upload(c: Client, url: string, name: string, content: Buffer) {
  const { body, contentType } = multipart(name, content);
  const res = await ctx.app.inject({ method: 'POST', url, payload: body, headers: { 'content-type': contentType, cookie: c.cookie, 'x-csrf-token': c.csrf } });
  return { status: res.statusCode, body: res.json() as any };
}

beforeAll(async () => {
  ctx = await createTestApp({ BACKUP_DIR: dirs.backups, UPLOAD_DIR: dirs.uploads });
  admin = await userClient(ctx, 'administrator');
  tech = await userClient(ctx, 'technician');
});
afterAll(async () => {
  await ctx.close();
  rmSync(dirs.backups, { recursive: true, force: true });
  rmSync(dirs.uploads, { recursive: true, force: true });
});

describe('backups', () => {
  it('is limited to the backups.manage permission', async () => {
    expect((await tech.get(api('/admin/backups'))).status).toBe(403);
    expect((await tech.post(api('/admin/backups'), {})).status).toBe(403);
    expect((await tech.get(api('/admin/backups/export'))).status).toBe(403);
  });

  it('exports every table (tickets, companies, settings, users) as a gzip download', async () => {
    const co = await makeCompany(admin, 'Backup Co');
    await admin.post(api('/tickets'), { title: 'Backed up ticket', companyId: co.id });
    const res = await ctx.app.inject({ method: 'GET', url: api('/admin/backups/export'), headers: { cookie: admin.cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="taskora-backup-\d{8}-\d{6}\.json\.gz"/);
    const doc = JSON.parse(gunzipSync(res.rawPayload).toString('utf8'));
    expect(doc.format).toBe('taskora-backup');
    expect(doc.tables.companies.rows.map((r: { name: string }) => r.name)).toContain('Backup Co');
    expect(doc.tables.tickets.rows.map((r: { title: string }) => r.title)).toContain('Backed up ticket');
    expect(doc.tables.users.rows.length).toBeGreaterThanOrEqual(2);
    expect(doc.tables.system_settings).toBeDefined();
    expect(doc.tables.action1_organizations).toBeDefined();
    // Runtime state is never exported.
    expect(doc.tables.sessions).toBeUndefined();
    expect(doc.tables.jobs).toBeUndefined();
  });

  it('saves backups on the server, lists, downloads and deletes them', async () => {
    const created = await admin.post(api('/admin/backups'), { includeFiles: true });
    expect(created.status).toBe(201);
    expect(created.body.name).toMatch(/^taskora-backup-\d{8}-\d{6}\.json\.gz$/);
    const list = await admin.get(api('/admin/backups'));
    expect(list.body.data.map((b: { name: string }) => b.name)).toContain(created.body.name);
    expect(list.body.autoBackupEnabled).toBe(true);

    const dl = await ctx.app.inject({ method: 'GET', url: api(`/admin/backups/${created.body.name}`), headers: { cookie: admin.cookie } });
    expect(dl.statusCode).toBe(200);
    expect(dl.rawPayload.subarray(0, 2)).toEqual(Buffer.from([0x1f, 0x8b]));

    // Names are validated: no path traversal.
    expect((await admin.get(api('/admin/backups/..%2F..%2Fetc%2Fpasswd'))).status).toBe(400);
    expect((await admin.delete(api(`/admin/backups/${created.body.name}`))).status).toBe(200);
    expect((await admin.get(api(`/admin/backups/${created.body.name}`))).status).toBe(404);
  });

  it('restores everything from a server backup and refuses without confirmation', async () => {
    const co = await makeCompany(admin, 'Restore Me Co');
    const contact = await makeContact(admin, co.id, 'Ana', 'Restore');
    const t = await admin.post(api('/tickets'), { title: 'Survives restore', companyId: co.id, contactId: contact.id });
    await admin.post(api(`/tickets/${t.body.id}/notes`), { body: 'A note to keep', visibility: 'internal' });
    const saved = await admin.post(api('/admin/backups'), {});

    // Data changed after the backup...
    await admin.post(api('/tickets'), { title: 'Created after backup', companyId: co.id });
    await admin.delete(api(`/tickets/${t.body.id}`));

    expect((await admin.post(api(`/admin/backups/${saved.body.name}/restore`), {})).status).toBe(400);
    const restored = await admin.post(api(`/admin/backups/${saved.body.name}/restore`), { confirm: 'RESTORE' });
    expect(restored.status).toBe(200);
    expect(restored.body.safetyBackup).toMatch(/pre-restore/);

    const titles = (await ctx.db.select({ title: schema.tickets.title }).from(schema.tickets)).map((r) => r.title);
    expect(titles).toContain('Survives restore');
    expect(titles).not.toContain('Created after backup');
    const [note] = await ctx.db.select().from(schema.ticketNotes).where(eq(schema.ticketNotes.ticketId, t.body.id));
    expect(note?.body).toBe('A note to keep');

    // Everybody is signed out; identity sequences continue after the restored ids.
    expect((await admin.get(api('/auth/me'))).status).toBe(401);
    await admin.login(`administrator1@example.test`, 'Correct-Horse-42');
    const next = await admin.post(api('/tickets'), { title: 'After restore', companyId: co.id });
    expect(next.status).toBe(201);
    expect(next.body.id).toBeGreaterThan(t.body.id);

    const [log] = await ctx.db.select().from(schema.auditLogs).where(eq(schema.auditLogs.action, 'restore'));
    expect(log?.summary).toContain(saved.body.name);
  });

  it('restores an uploaded backup file and rejects files that are not backups', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: api('/admin/backups/export'), headers: { cookie: admin.cookie } });
    const file = res.rawPayload;
    await makeCompany(admin, 'Gone After Upload Restore');

    const bad = await upload(admin, api('/admin/backups/restore?confirm=RESTORE'), 'x.json.gz', Buffer.from('not a backup'));
    expect(bad.status).toBe(400);
    expect((await upload(admin, api('/admin/backups/restore'), 'b.json.gz', file)).status).toBe(400);

    const ok = await upload(admin, api('/admin/backups/restore?confirm=RESTORE&safetyBackup=false'), 'b.json.gz', file);
    expect(ok.status).toBe(200);
    expect(ok.body.safetyBackup).toBeNull();
    const names = (await ctx.db.select({ name: schema.companies.name }).from(schema.companies)).map((r) => r.name);
    expect(names).not.toContain('Gone After Upload Restore');
    expect(names).toContain('Backup Co');
  });

  it('keeps only the configured number of automatic backups', async () => {
    await admin.login(`administrator1@example.test`, 'Correct-Horse-42');
    const put = await admin.put(api('/admin/backups/settings'), { autoBackupEnabled: true, autoBackupIntervalHours: 24, backupRetention: 2 });
    expect(put.status).toBe(200);
    expect(await autoBackupDue(ctx.app.config, 24)).toBe(true);
    for (let i = 0; i < 3; i++) await saveBackup(ctx.db, ctx.app.config, 'auto', { includeFiles: false });
    expect(await autoBackupDue(ctx.app.config, 24)).toBe(false);
    expect(await pruneAutoBackups(ctx.app.config, 2)).toBe(1);
    const list = (await admin.get(api('/admin/backups'))).body.data as { kind: string }[];
    expect(list.filter((b) => b.kind === 'auto')).toHaveLength(2);
    expect(list.some((b) => b.kind === 'manual' || b.kind === 'pre-restore')).toBe(true);
  }, 60_000);
});
