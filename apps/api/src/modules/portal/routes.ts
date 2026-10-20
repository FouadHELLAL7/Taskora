/**
 * Customer portal API (/api/portal/*). Contacts with portal access sign in
 * with their own credentials (separate cookie and session table). They only
 * ever see their own tickets — or their company's when they are the primary
 * contact — customer-visible notes and public knowledge-base articles. No
 * internal notes, time entries, assignments or other staff data is exposed.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '../../db/schema/index.js';
import { hashPassword, randomToken, sha256, verifyPassword } from '../../lib/crypto.js';
import { AppError, badRequest, forbidden, notFound, unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { idOf } from '../../lib/params.js';
import { likeTerm } from '../../lib/query.js';
import { addTicketNote, createTicket, updateTicket } from '../tickets/service.js';
import { runTicketRules } from '../automation/engine.js';

export const PORTAL_COOKIE = 'taskora_portal';
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

interface PortalContact {
  id: number;
  companyId: number;
  firstName: string;
  lastName: string;
  email: string | null;
  isPrimary: boolean;
  csrfToken: string;
  sessionId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    portalContact: PortalContact | null;
  }
}

const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(256) });
const ticketSchema = z.object({ title: z.string().trim().min(3, 'Please describe the issue briefly').max(255), description: z.string().trim().max(20000).default('') });
const replySchema = z.object({ body: z.string().trim().min(1, 'Required').max(20000) });
const accessSchema = z.object({ enabled: z.boolean(), resetPassword: z.boolean().default(false) });

function contactOf(req: FastifyRequest): PortalContact {
  if (!req.portalContact) throw unauthorized();
  return req.portalContact;
}

/** Tickets visible to a contact: their own, or the whole company for primary contacts. */
const visibleTickets = (c: PortalContact) => (c.isPrimary ? eq(s.tickets.companyId, c.companyId) : and(eq(s.tickets.companyId, c.companyId), eq(s.tickets.contactId, c.id)));

export async function portalRoutes(app: FastifyInstance) {
  const ttlHours = app.config.SESSION_TTL_HOURS;
  app.decorateRequest('portalContact', null);

  // Portal authentication + CSRF. Every portal route is "public" for the staff hook.
  app.addHook('onRoute', (route) => {
    route.config = { ...(route.config ?? {}), public: true };
  });

  await app.register(
    async (portal) => {
      portal.addHook('preHandler', async (req) => {
        const token = req.cookies[PORTAL_COOKIE];
        if (token) {
          const [row] = await app.db
            .select({ session: s.portalSessions, contact: s.contacts })
            .from(s.portalSessions)
            .innerJoin(s.contacts, eq(s.contacts.id, s.portalSessions.contactId))
            .where(and(eq(s.portalSessions.id, sha256(token)), sql`${s.portalSessions.expiresAt} > now()`));
          if (row && row.contact.isActive && row.contact.portalEnabled) {
            req.portalContact = {
              id: row.contact.id,
              companyId: row.contact.companyId,
              firstName: row.contact.firstName,
              lastName: row.contact.lastName,
              email: row.contact.email,
              isPrimary: row.contact.isPrimary,
              csrfToken: row.session.csrfToken,
              sessionId: row.session.id,
            };
          }
        }
        const open = req.url.endsWith('/login') || (req.method === 'GET' && req.url.endsWith('/me'));
        if (open) return;
        if (!req.portalContact) throw unauthorized();
        if (!SAFE.has(req.method) && req.headers['x-csrf-token'] !== req.portalContact.csrfToken) throw forbidden('Missing or invalid CSRF token');
      });

      portal.post('/login', { config: { rateLimit: { max: app.config.AUTH_RATE_LIMIT_PER_MINUTE, timeWindow: '1 minute' } } }, async (req, reply: FastifyReply) => {
        const input = loginSchema.parse(req.body);
        const candidates = await app.db
          .select()
          .from(s.contacts)
          .where(and(sql`lower(${s.contacts.email}) = ${input.email}`, eq(s.contacts.portalEnabled, true), eq(s.contacts.isActive, true)));
        let match: (typeof candidates)[number] | undefined;
        for (const c of candidates) if (c.portalPasswordHash && (await verifyPassword(c.portalPasswordHash, input.password))) match = c;
        if (!candidates.length) await verifyPassword('$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$ZGVmYXVsdGhhc2hkZWZhdWx0aGFzaA', input.password);
        if (!match) throw new AppError(401, 'unauthorized', 'Invalid e-mail or password');
        const token = randomToken(32);
        const csrfToken = randomToken(24);
        const expiresAt = new Date(Date.now() + ttlHours * 3600_000);
        await app.db.insert(s.portalSessions).values({ id: sha256(token), contactId: match.id, csrfToken, expiresAt });
        await app.db.update(s.contacts).set({ portalLastLoginAt: new Date() }).where(eq(s.contacts.id, match.id));
        reply.setCookie(PORTAL_COOKIE, token, { path: '/api/portal', httpOnly: true, sameSite: 'lax', secure: app.config.COOKIE_SECURE === 'true' || (app.config.COOKIE_SECURE === 'auto' && req.protocol === 'https'), expires: expiresAt });
        return { ok: true, csrfToken };
      });

      portal.post('/logout', async (req, reply) => {
        const c = contactOf(req);
        await app.db.delete(s.portalSessions).where(eq(s.portalSessions.id, c.sessionId));
        reply.clearCookie(PORTAL_COOKIE, { path: '/api/portal' });
        return { ok: true };
      });

      portal.get('/me', async (req) => {
        if (!req.portalContact) return { contact: null };
        const c = req.portalContact;
        const [co] = await app.db.select({ name: s.companies.name }).from(s.companies).where(eq(s.companies.id, c.companyId));
        const [org] = await app.db.select({ value: s.systemSettings.value }).from(s.systemSettings).where(eq(s.systemSettings.key, 'system'));
        return {
          contact: { firstName: c.firstName, lastName: c.lastName, email: c.email, companyName: co?.name ?? '', seesCompanyTickets: c.isPrimary },
          organizationName: (org?.value as { organizationName?: string } | undefined)?.organizationName ?? 'Taskora',
          csrfToken: c.csrfToken,
        };
      });

      portal.get('/tickets', async (req) => {
        const c = contactOf(req);
        const q = req.query as { state?: string };
        const rows = await app.db
          .select({
            id: s.tickets.id,
            ticketNumber: s.tickets.ticketNumber,
            title: s.tickets.title,
            statusName: s.ticketStatuses.name,
            statusColor: s.ticketStatuses.color,
            statusCategory: s.ticketStatuses.category,
            priorityName: s.ticketPriorities.name,
            contactName: sql<string | null>`${s.contacts.firstName} || ' ' || ${s.contacts.lastName}`,
            createdAt: s.tickets.createdAt,
            lastActivityAt: s.tickets.lastActivityAt,
          })
          .from(s.tickets)
          .innerJoin(s.ticketStatuses, eq(s.ticketStatuses.id, s.tickets.statusId))
          .innerJoin(s.ticketPriorities, eq(s.ticketPriorities.id, s.tickets.priorityId))
          .leftJoin(s.contacts, eq(s.contacts.id, s.tickets.contactId))
          .where(and(visibleTickets(c), q.state === 'closed' ? inArray(s.ticketStatuses.category, ['resolved', 'closed']) : q.state === 'all' ? undefined : sql`${s.ticketStatuses.category} not in ('resolved','closed')`))
          .orderBy(desc(s.tickets.lastActivityAt))
          .limit(200);
        return { data: rows };
      });

      const loadTicket = async (c: PortalContact, id: number) => {
        const [t] = await app.db
          .select({
            id: s.tickets.id,
            ticketNumber: s.tickets.ticketNumber,
            title: s.tickets.title,
            description: s.tickets.description,
            statusId: s.tickets.statusId,
            statusName: s.ticketStatuses.name,
            statusColor: s.ticketStatuses.color,
            statusCategory: s.ticketStatuses.category,
            priorityName: s.ticketPriorities.name,
            resolution: s.tickets.resolution,
            createdAt: s.tickets.createdAt,
            resolvedAt: s.tickets.resolvedAt,
          })
          .from(s.tickets)
          .innerJoin(s.ticketStatuses, eq(s.ticketStatuses.id, s.tickets.statusId))
          .innerJoin(s.ticketPriorities, eq(s.ticketPriorities.id, s.tickets.priorityId))
          .where(and(eq(s.tickets.id, id), visibleTickets(c)));
        if (!t) throw notFound('Ticket');
        return t;
      };

      portal.get('/tickets/:id', async (req) => {
        const c = contactOf(req);
        const t = await loadTicket(c, idOf(req));
        const notes = await app.db
          .select({
            id: s.ticketNotes.id,
            body: s.ticketNotes.body,
            kind: s.ticketNotes.kind,
            createdAt: s.ticketNotes.createdAt,
            author: sql<string | null>`${s.users.firstName} || ' ' || ${s.users.lastName}`,
          })
          .from(s.ticketNotes)
          .leftJoin(s.users, eq(s.users.id, s.ticketNotes.userId))
          .where(and(eq(s.ticketNotes.ticketId, t.id), eq(s.ticketNotes.visibility, 'public')))
          .orderBy(asc(s.ticketNotes.createdAt));
        return { ...t, statusId: undefined, notes: notes.map((n) => ({ ...n, fromCustomer: n.kind === 'portal' || n.kind === 'email', author: n.author ?? null })) };
      });

      portal.post('/tickets', async (req, reply) => {
        const c = contactOf(req);
        const input = ticketSchema.parse(req.body);
        const [source] = await app.db.select({ id: s.ticketSources.id }).from(s.ticketSources).where(sql`lower(${s.ticketSources.name}) = 'portal'`);
        const ticket = await app.db.transaction((tx) =>
          createTicket({ db: tx, userId: null }, { title: input.title, description: input.description, companyId: c.companyId, contactId: c.id, sourceId: source?.id ?? null }),
        );
        await audit(app.db, req, { action: 'create', entityType: 'ticket', entityId: ticket.id, summary: `${ticket.ticketNumber} via customer portal` }, null);
        await runTicketRules(app.db, 'ticket.created', ticket.id);
        return reply.status(201).send({ id: ticket.id, ticketNumber: ticket.ticketNumber });
      });

      portal.post('/tickets/:id/replies', async (req, reply) => {
        const c = contactOf(req);
        const t = await loadTicket(c, idOf(req));
        const input = replySchema.parse(req.body);
        await app.db.transaction(async (tx) => {
          await addTicketNote({ db: tx, userId: null }, t.id, { body: `${c.firstName} ${c.lastName} wrote:\n\n${input.body}`, visibility: 'public', kind: 'portal' });
          if (['waiting', 'resolved'].includes(t.statusCategory)) {
            const [open] = await tx
              .select({ id: s.ticketStatuses.id })
              .from(s.ticketStatuses)
              .where(and(eq(s.ticketStatuses.category, 'open'), eq(s.ticketStatuses.isActive, true)))
              .orderBy(asc(s.ticketStatuses.sortOrder))
              .limit(1);
            if (open) await updateTicket({ db: tx, userId: null }, t.id, { statusId: open.id });
          }
        });
        await runTicketRules(app.db, 'ticket.updated', t.id);
        return reply.status(201).send({ ok: true });
      });

      portal.get('/kb', async (req) => {
        const c = contactOf(req);
        const q = String((req.query as { q?: string }).q ?? '').trim();
        const rows = await app.db
          .select({ id: s.kbArticles.id, title: s.kbArticles.title, excerpt: sql<string>`left(${s.kbArticles.body}, 240)`, updatedAt: s.kbArticles.updatedAt })
          .from(s.kbArticles)
          .where(
            and(
              eq(s.kbArticles.visibility, 'public'),
              eq(s.kbArticles.status, 'published'),
              or(isNull(s.kbArticles.companyId), eq(s.kbArticles.companyId, c.companyId)),
              q ? or(sql`${s.kbArticles.title} ilike ${likeTerm(q)}`, sql`${s.kbArticles.body} ilike ${likeTerm(q)}`) : undefined,
            ),
          )
          .orderBy(desc(s.kbArticles.updatedAt))
          .limit(50);
        return { data: rows };
      });

      portal.get('/kb/:id', async (req) => {
        const c = contactOf(req);
        const [a] = await app.db
          .select({ id: s.kbArticles.id, title: s.kbArticles.title, body: s.kbArticles.body, updatedAt: s.kbArticles.updatedAt })
          .from(s.kbArticles)
          .where(and(eq(s.kbArticles.id, idOf(req)), eq(s.kbArticles.visibility, 'public'), eq(s.kbArticles.status, 'published'), or(isNull(s.kbArticles.companyId), eq(s.kbArticles.companyId, c.companyId))));
        if (!a) throw notFound('Article');
        return a;
      });
    },
    { prefix: '/api/portal' },
  );
}

/** Staff endpoint: enable/disable portal access for a contact and (re)issue a password. */
export async function portalAdminRoutes(app: FastifyInstance) {
  app.post('/contacts/:id/portal', { config: { perm: 'companies.write' } }, async (req) => {
    const id = idOf(req);
    const input = accessSchema.parse(req.body);
    const [contact] = await app.db.select().from(s.contacts).where(eq(s.contacts.id, id));
    if (!contact) throw notFound('Contact');
    if (input.enabled && !contact.email) throw badRequest('The contact needs an e-mail address to sign in to the portal');
    let password: string | null = null;
    const data: Partial<typeof contact> = { portalEnabled: input.enabled };
    if (input.enabled && (input.resetPassword || !contact.portalPasswordHash)) {
      password = `${randomToken(9)}-${randomToken(6)}`;
      data.portalPasswordHash = await hashPassword(password);
    }
    await app.db.update(s.contacts).set(data).where(eq(s.contacts.id, id));
    if (!input.enabled || password) await app.db.delete(s.portalSessions).where(eq(s.portalSessions.contactId, id));
    await audit(app.db, req, { action: 'update', entityType: 'contact', entityId: id, summary: input.enabled ? (password ? 'Portal access granted / password reset' : 'Portal access enabled') : 'Portal access disabled' });
    // The generated password is returned once so staff can share it securely.
    return { enabled: input.enabled, password };
  });
}
