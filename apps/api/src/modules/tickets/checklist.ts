import type { FastifyInstance } from 'fastify';
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import * as s from '../../db/schema/index.js';
import { notFound } from '../../lib/errors.js';
import { idOf } from '../../lib/params.js';
import { currentUser } from '../../lib/context.js';
import { getTicketRow } from './service.js';

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
}
