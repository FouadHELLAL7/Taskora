import { and, eq } from 'drizzle-orm';
import type { Tx } from '../../db/client.js';
import * as s from '../../db/schema/index.js';
import { badRequest } from '../../lib/errors.js';

/** Contract types whose labour is covered by a pre-agreed fee rather than billed per hour. */
const COVERED_TYPES = new Set(['fixed_price', 'recurring', 'retainer', 'block_hours', 'per_ticket']);

export interface TimeContext {
  companyId: number;
  projectId: number | null;
  contractId: number | null;
}

/** Derives company/project/contract from the ticket or project task the entry is logged against. */
export async function resolveTimeContext(db: Tx, ticketId: number | null, projectTaskId: number | null): Promise<TimeContext> {
  if (ticketId) {
    const [t] = await db
      .select({ companyId: s.tickets.companyId, projectId: s.tickets.projectId, contractId: s.tickets.contractId })
      .from(s.tickets)
      .where(eq(s.tickets.id, ticketId));
    if (!t) throw badRequest('Unknown ticket', { fields: { ticketId: 'Unknown ticket' } });
    return t;
  }
  if (projectTaskId) {
    const [t] = await db
      .select({ companyId: s.projects.companyId, projectId: s.projects.id, contractId: s.projects.contractId })
      .from(s.projectTasks)
      .innerJoin(s.projects, eq(s.projects.id, s.projectTasks.projectId))
      .where(eq(s.projectTasks.id, projectTaskId));
    if (!t) throw badRequest('Unknown project task', { fields: { projectTaskId: 'Unknown task' } });
    return t;
  }
  throw badRequest('Link the entry to a ticket or a project task');
}

/**
 * Billing classification: rate precedence is contract work-type rate →
 * contract hourly rate → work type default rate. Time under covered contract
 * types is flagged `contractCovered` so it is not invoiced again.
 */
export async function classifyTime(
  db: Tx,
  contractId: number | null,
  workTypeId: number | null,
  billableRequested: boolean | undefined,
): Promise<{ billable: boolean; contractCovered: boolean; hourlyRate: number | null }> {
  let workType: typeof s.workTypes.$inferSelect | undefined;
  if (workTypeId) {
    [workType] = await db.select().from(s.workTypes).where(eq(s.workTypes.id, workTypeId));
    if (!workType) throw badRequest('Unknown work type', { fields: { workTypeId: 'Unknown work type' } });
  }
  const billable = billableRequested ?? workType?.isBillable ?? true;
  let rate: number | null = workType?.hourlyRate ?? null;
  let covered = false;
  if (contractId) {
    const [contract] = await db.select().from(s.contracts).where(eq(s.contracts.id, contractId));
    if (contract) {
      covered = billable && COVERED_TYPES.has(contract.type);
      if (contract.hourlyRate !== null) rate = contract.hourlyRate;
      if (workTypeId) {
        const [cr] = await db
          .select()
          .from(s.contractRates)
          .where(and(eq(s.contractRates.contractId, contractId), eq(s.contractRates.workTypeId, workTypeId)));
        if (cr) rate = cr.hourlyRate;
      }
    }
  }
  return { billable, contractCovered: covered, hourlyRate: billable ? rate : null };
}

export function roundMinutes(minutes: number, increment: number): number {
  if (increment <= 1) return Math.max(1, Math.round(minutes));
  return Math.max(increment, Math.ceil(minutes / increment) * increment);
}
