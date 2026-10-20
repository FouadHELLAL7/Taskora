import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import * as s from '../db/schema/index.js';
import { getSystemSettings } from '../lib/settings.js';
import { notifyFromTemplate } from '../modules/notifications/service.js';
import { runTicketRules } from '../modules/automation/engine.js';

type Candidate = {
  id: number;
  ticketNumber: string;
  title: string;
  companyName: string;
  assignedUserId: number | null;
  queueDefaultAssignee: number | null;
  firstResponseDueAt: string | Date | null;
  resolutionDueAt: string | Date | null;
};

/**
 * Flags SLA breaches on open tickets, notifies the assignee (or the queue's
 * default assignee), raises "at risk" warnings once per target and fires
 * `ticket.sla_breached` workflow rules exactly once per breach.
 */
export async function runSlaMonitor(db: Db, now = new Date()): Promise<{ breached: number; warned: number }> {
  const settings = await getSystemSettings(db);
  let breached = 0;
  let warned = 0;

  const open = sql`t.status_id in (select id from ticket_statuses where category not in ('resolved','closed'))`;
  const load = async (where: ReturnType<typeof sql>) =>
    (
      await db.execute<Candidate>(sql`
        select t.id, t.ticket_number as "ticketNumber", t.title, c.name as "companyName", t.assigned_user_id as "assignedUserId",
               q.default_assignee_id as "queueDefaultAssignee", t.first_response_due_at as "firstResponseDueAt", t.resolution_due_at as "resolutionDueAt"
        from tickets t join companies c on c.id = t.company_id left join queues q on q.id = t.queue_id
        where ${open} and ${where} limit 500`)
    ).rows;

  const handle = async (t: Candidate, kind: 'first_response' | 'resolution') => {
    const flag = kind === 'first_response' ? { firstResponseBreached: true } : { resolutionBreached: true };
    await db.update(s.tickets).set(flag).where(eq(s.tickets.id, t.id));
    await db.insert(s.ticketEvents).values({ ticketId: t.id, userId: null, type: 'sla_breached', data: { target: kind } });
    const label = kind === 'first_response' ? 'first response' : 'resolution';
    await notifyFromTemplate(
      db,
      'ticket.sla_breached',
      [t.assignedUserId ?? t.queueDefaultAssignee],
      { ticket: { number: t.ticketNumber, title: t.title, company: t.companyName }, sla: { event: label } },
      { type: 'ticket.sla_breached', title: `SLA breached on ${t.ticketNumber}`, body: `${label} target missed: ${t.title}`, link: `/tickets/${t.id}`, entityType: 'ticket', entityId: t.id },
    );
    await runTicketRules(db, 'ticket.sla_breached', t.id, { dedupeKey: `${t.id}:${kind}` });
    breached++;
  };

  for (const t of await load(sql`not t.first_response_breached and t.first_response_at is null and t.first_response_due_at < ${now}`)) {
    await handle(t, 'first_response');
  }
  for (const t of await load(sql`not t.resolution_breached and t.resolved_at is null and t.sla_paused_at is null and t.resolution_due_at < ${now}`)) {
    await handle(t, 'resolution');
  }

  // At-risk warnings (once per ticket and target).
  const soon = new Date(now.getTime() + settings.slaWarningMinutes * 60_000);
  const atRisk = await load(sql`t.sla_paused_at is null and (
      (t.first_response_at is null and not t.first_response_breached and t.first_response_due_at between ${now} and ${soon}) or
      (t.resolved_at is null and not t.resolution_breached and t.resolution_due_at between ${now} and ${soon}))`);
  for (const t of atRisk) {
    // Raw query results carry timestamps as strings or Dates depending on the driver.
    const kind = t.firstResponseDueAt && new Date(t.firstResponseDueAt) <= soon ? 'first_response' : 'resolution';
    const [already] = await db
      .select({ id: s.ticketEvents.id })
      .from(s.ticketEvents)
      .where(and(eq(s.ticketEvents.ticketId, t.id), eq(s.ticketEvents.type, 'sla_warning'), sql`${s.ticketEvents.data}->>'target' = ${kind}`))
      .limit(1);
    if (already) continue;
    await db.insert(s.ticketEvents).values({ ticketId: t.id, userId: null, type: 'sla_warning', data: { target: kind } });
    const due = kind === 'first_response' ? t.firstResponseDueAt : t.resolutionDueAt;
    await notifyFromTemplate(
      db,
      'ticket.sla_warning',
      [t.assignedUserId ?? t.queueDefaultAssignee],
      { ticket: { number: t.ticketNumber, title: t.title, company: t.companyName }, sla: { event: kind.replace('_', ' '), due: due ? new Date(due).toISOString() : '' } },
      { type: 'ticket.sla_warning', title: `SLA at risk on ${t.ticketNumber}`, body: t.title, link: `/tickets/${t.id}`, entityType: 'ticket', entityId: t.id },
    );
    warned++;
  }
  return { breached, warned };
}
