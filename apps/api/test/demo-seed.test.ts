import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { schema as s } from '../src/db/client.js';
import { seedDemo, type SeedDemoResult } from '../src/db/seed/demo.js';
import { Client, createTestApp, type TestContext } from './helpers.js';

const count = sql<number>`count(*)::int`;

describe('demo seed', () => {
  let ctx: TestContext;
  let result: SeedDemoResult;
  let seedMs = 0;

  beforeAll(async () => {
    ctx = await createTestApp();
    const started = Date.now();
    result = await seedDemo(ctx.db);
    seedMs = Date.now() - started;
  }, 120_000);

  afterAll(async () => {
    await ctx?.close();
  });

  it('returns demo logins with a generated password', () => {
    expect(result.users.length).toBeGreaterThanOrEqual(5);
    const roles = result.users.map((u) => u.role);
    expect(roles).toContain('service_desk_manager');
    expect(roles.filter((r) => r === 'technician')).toHaveLength(3);
    expect(roles).toContain('read_only');
    const passwords = new Set(result.users.map((u) => u.password));
    expect(passwords.size).toBe(1);
    expect([...passwords][0]!.length).toBeGreaterThanOrEqual(20);
    for (const u of result.users) expect(u.email).toMatch(/@taskora\.demo$/);
  });

  it('creates companies and contacts', async () => {
    const [companies] = await ctx.db.select({ n: count }).from(s.companies);
    expect(companies!.n).toBeGreaterThanOrEqual(5);
    const [ns] = await ctx.db.select().from(s.companies).where(eq(s.companies.name, 'Northstar Consulting'));
    expect(ns).toBeTruthy();
    const [nsContacts] = await ctx.db.select({ n: count }).from(s.contacts).where(eq(s.contacts.companyId, ns!.id));
    expect(nsContacts!.n).toBe(25);
    const [internal] = await ctx.db.select({ n: count }).from(s.companies).where(eq(s.companies.type, 'internal'));
    expect(internal!.n).toBe(1);
  });

  it('links NS-LAPTOP-014 to Emma Smith', async () => {
    const [laptop] = await ctx.db
      .select({ ci: s.configurationItems, first: s.contacts.firstName, last: s.contacts.lastName })
      .from(s.configurationItems)
      .innerJoin(s.contacts, eq(s.contacts.id, s.configurationItems.contactId))
      .where(eq(s.configurationItems.name, 'NS-LAPTOP-014'));
    expect(laptop).toBeTruthy();
    expect(`${laptop!.first} ${laptop!.last}`).toBe('Emma Smith');
    expect(laptop!.ci.model).toBe('Dell Latitude 7440');
    expect(laptop!.ci.osName).toBe('Windows 11 Pro');
    expect(laptop!.ci.ciNumber).toMatch(/^CI-\d{6}$/);

    const [ticket] = await ctx.db
      .select({ ticket: s.tickets, status: s.ticketStatuses.name, priority: s.ticketPriorities.name })
      .from(s.tickets)
      .innerJoin(s.ticketStatuses, eq(s.ticketStatuses.id, s.tickets.statusId))
      .innerJoin(s.ticketPriorities, eq(s.ticketPriorities.id, s.tickets.priorityId))
      .where(eq(s.tickets.title, 'Laptop running slowly'));
    expect(ticket!.ticket.configurationItemId).toBe(laptop!.ci.id);
    expect(ticket!.status).toBe('In Progress');
    expect(ticket!.priority).toBe('High');
  });

  it('creates a ticket history with lifecycle timestamps', async () => {
    const [tickets] = await ctx.db.select({ n: count }).from(s.tickets);
    expect(tickets!.n).toBeGreaterThanOrEqual(60);
    const [resolved] = await ctx.db.select({ n: count }).from(s.tickets).where(isNotNull(s.tickets.resolvedAt));
    expect(resolved!.n).toBeGreaterThan(10);
    const [breached] = await ctx.db.select({ n: count }).from(s.tickets).where(eq(s.tickets.firstResponseBreached, true));
    expect(breached!.n).toBeGreaterThan(0);
    const [notes] = await ctx.db.select({ n: count }).from(s.ticketNotes);
    expect(notes!.n).toBeGreaterThan(60);
    // History is backdated: tickets span more than a month.
    const [span] = await ctx.db.select({ oldest: sql<string>`min(created_at)::text` }).from(s.tickets);
    expect(Date.now() - new Date(span!.oldest).getTime()).toBeGreaterThan(30 * 86_400_000);
  });

  it('creates time entries, projects, contracts and KB articles', async () => {
    const [time] = await ctx.db.select({ n: count }).from(s.timeEntries);
    expect(time!.n).toBeGreaterThan(0);
    const [approved] = await ctx.db.select({ n: count }).from(s.timeEntries).where(eq(s.timeEntries.status, 'approved'));
    expect(approved!.n).toBeGreaterThan(0);
    const [projects] = await ctx.db.select({ n: count }).from(s.projects);
    expect(projects!.n).toBe(3);
    const [contracts] = await ctx.db.select({ n: count }).from(s.contracts);
    expect(contracts!.n).toBeGreaterThanOrEqual(5);
    const [kb] = await ctx.db.select({ n: count }).from(s.kbArticles);
    expect(kb!.n).toBeGreaterThanOrEqual(10);
  });

  it('creates an Action1 snapshot with linked endpoints and keeps the integration disabled', async () => {
    const [linked] = await ctx.db
      .select({ n: count })
      .from(s.action1Endpoints)
      .where(and(eq(s.action1Endpoints.matchStatus, 'matched'), isNotNull(s.action1Endpoints.configurationItemId)));
    expect(linked!.n).toBeGreaterThanOrEqual(15);
    const [review] = await ctx.db.select({ n: count }).from(s.action1Endpoints).where(inArray(s.action1Endpoints.matchStatus, ['unmatched', 'conflict']));
    expect(review!.n).toBe(3);
    const [integration] = await ctx.db.select().from(s.integrations).where(eq(s.integrations.provider, 'action1'));
    expect(integration!.enabled).toBe(false);
    expect(integration!.secretsEncrypted).toBeNull();
    const [runs] = await ctx.db.select({ n: count }).from(s.syncRuns);
    expect(runs!.n).toBeGreaterThanOrEqual(2);
  });

  it('refuses to run twice', async () => {
    await expect(seedDemo(ctx.db)).rejects.toThrow('Demo data already present');
    const [companies] = await ctx.db.select({ n: count }).from(s.companies).where(eq(s.companies.name, 'Northstar Consulting'));
    expect(companies!.n).toBe(1);
  });

  it('lets a demo user log in and see the dashboard', async () => {
    const manager = result.users.find((u) => u.role === 'service_desk_manager')!;
    const client = await new Client(ctx.app).login(manager.email, manager.password);
    const res = await client.get('/api/v1/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.kpi.openTickets).toBeGreaterThan(0);
    expect(res.body.assets.syncedEndpoints).toBeGreaterThan(0);
  });

  it('completes within a reasonable time', () => {
    expect(seedMs).toBeLessThan(60_000);
  });
});
