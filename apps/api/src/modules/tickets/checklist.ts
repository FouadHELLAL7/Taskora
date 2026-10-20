import type { FastifyInstance } from 'fastify';
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '../../db/schema/index.js';
import { notFound } from '../../lib/errors.js';
import { idOf } from '../../lib/params.js';
import { currentUser } from '../../lib/context.js';
import { addTicketNote, getTicketRow, updateTicket } from './service.js';
import { audit } from '../../lib/audit.js';
import { badRequest } from '../../lib/errors.js';

const itemSchema = z.object({ text: z.string().trim().min(1, 'Required').max(500) });
const patchSchema = z.object({ text: z.string().trim().min(1).max(500).optional(), isDone: z.boolean().optional(), sortOrder: z.coerce.number().int().optional() });

/** Ticket checklists: ordered to-do items technicians tick off while working. */
export async function checklistRoutes(app: FastifyInstance) {
  const list = (ticketId: number) =>
    app.db
      .select({
        id: s.ticketChecklistItems.id,
        text: s.ticketChecklistItems.text,
        isDone: s.ticketChecklistItems.isDone,
        doneAt: s.ticketChecklistItems.doneAt,
        doneByName: sql<string | null>`${s.users.firstName} || ' ' || ${s.users.lastName}`,
        sortOrder: s.ticketChecklistItems.sortOrder,
      })
      .from(s.ticketChecklistItems)
      .leftJoin(s.users, eq(s.users.id, s.ticketChecklistItems.doneById))
      .where(eq(s.ticketChecklistItems.ticketId, ticketId))
      .orderBy(asc(s.ticketChecklistItems.sortOrder), asc(s.ticketChecklistItems.id));

  app.get('/tickets/:id/checklist', { config: { perm: 'tickets.read' } }, async (req) => ({ data: await list(idOf(req)) }));

  app.post('/tickets/:id/checklist', { config: { perm: 'tickets.write' } }, async (req, reply) => {
    const ticketId = idOf(req);
    await getTicketRow(app.db, ticketId);
    const body = req.body as { text?: string; items?: string[] };
    const texts = Array.isArray(body.items) ? body.items.map((t) => itemSchema.parse({ text: t }).text) : [itemSchema.parse(body).text];
    const [{ max }] = (await app.db
      .select({ max: sql<number>`coalesce(max(${s.ticketChecklistItems.sortOrder}), 0)::int` })
      .from(s.ticketChecklistItems)
      .where(eq(s.ticketChecklistItems.ticketId, ticketId))) as [{ max: number }];
    await app.db.insert(s.ticketChecklistItems).values(texts.map((text, i) => ({ ticketId, text, sortOrder: max + (i + 1) * 10 })));
    return reply.status(201).send({ data: await list(ticketId) });
  });

  app.patch('/tickets/:id/checklist/:itemId', { config: { perm: 'tickets.write' } }, async (req) => {
    const ticketId = idOf(req);
    const input = patchSchema.parse(req.body);
    const data: Record<string, unknown> = {};
    if (input.text !== undefined) data.text = input.text;
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
    if (input.isDone !== undefined) {
      data.isDone = input.isDone;
      data.doneAt = input.isDone ? new Date() : null;
      data.doneById = input.isDone ? currentUser(req).id : null;
    }
    const [row] = await app.db
      .update(s.ticketChecklistItems)
      .set(data)
      .where(and(eq(s.ticketChecklistItems.id, idOf(req, 'itemId')), eq(s.ticketChecklistItems.ticketId, ticketId)))
      .returning();
    if (!row) throw notFound('Checklist item');
    await app.db.update(s.tickets).set({ lastActivityAt: new Date() }).where(eq(s.tickets.id, ticketId));
    return { data: await list(ticketId) };
  });

  app.delete('/tickets/:id/checklist/:itemId', { config: { perm: 'tickets.write' } }, async (req) => {
    const ticketId = idOf(req);
    await app.db.delete(s.ticketChecklistItems).where(and(eq(s.ticketChecklistItems.id, idOf(req, 'itemId')), eq(s.ticketChecklistItems.ticketId, ticketId)));
    return { data: await list(ticketId) };
  });

  /**
   * Merges a duplicate ticket into another ticket of the same company: notes,
   * time entries, attachments, checklist items and watchers move to the
   * target; the duplicate is closed with a link to the surviving ticket.
   */
  app.post('/tickets/:id/merge', { config: { perm: 'tickets.write' } }, async (req) => {
    const sourceId = idOf(req);
    const targetId = Number((req.body as { intoTicketId?: number }).intoTicketId);
    if (!Number.isInteger(targetId) || targetId <= 0 || targetId === sourceId) throw badRequest('Choose another ticket to merge into');
    const me = currentUser(req);
    await app.db.transaction(async (tx) => {
      const source = await getTicketRow(tx, sourceId);
      const target = await getTicketRow(tx, targetId);
      if (source.companyId !== target.companyId) throw badRequest('Only tickets of the same company can be merged');
      await tx.update(s.ticketNotes).set({ ticketId: targetId }).where(eq(s.ticketNotes.ticketId, sourceId));
      await tx.update(s.timeEntries).set({ ticketId: targetId }).where(eq(s.timeEntries.ticketId, sourceId));
      await tx.update(s.attachments).set({ entityId: targetId }).where(and(eq(s.attachments.entityType, 'ticket'), eq(s.attachments.entityId, sourceId)));
      await tx.update(s.ticketChecklistItems).set({ ticketId: targetId }).where(eq(s.ticketChecklistItems.ticketId, sourceId));
      await tx.execute(sql`insert into ticket_watchers (ticket_id, user_id) select ${targetId}, user_id from ticket_watchers where ticket_id = ${sourceId} on conflict do nothing`);
      await tx.insert(s.ticketRelations).values({ ticketId: sourceId, relatedTicketId: targetId, type: 'duplicate_of' }).onConflictDoNothing();
      await addTicketNote({ db: tx, userId: me.id }, targetId, {
        body: `Merged ${source.ticketNumber} "${source.title}" into this ticket.${source.description ? `

Original description:
${source.description}` : ''}`,
        visibility: 'internal',
      });
      const [closed] = await tx
        .select({ id: s.ticketStatuses.id })
        .from(s.ticketStatuses)
        .where(and(eq(s.ticketStatuses.category, 'closed'), eq(s.ticketStatuses.isActive, true)))
        .orderBy(asc(s.ticketStatuses.sortOrder))
        .limit(1);
      await updateTicket({ db: tx, userId: me.id }, sourceId, { resolution: `Merged into ${target.ticketNumber}`, ...(closed ? { statusId: closed.id } : {}) });
      await audit(tx, req, { action: 'update', entityType: 'ticket', entityId: sourceId, summary: `Merged ${source.ticketNumber} into ${target.ticketNumber}` });
    });
    return { ok: true, ticketId: targetId };
  });
}
