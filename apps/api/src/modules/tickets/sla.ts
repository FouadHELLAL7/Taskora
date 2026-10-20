import { and, eq } from 'drizzle-orm';
import type { Tx } from '../../db/client.js';
import * as s from '../../db/schema/index.js';
import { addBusinessMinutes, businessMinutesBetween, type BusinessCalendar } from '../../lib/business-time.js';

export async function loadCalendar(db: Tx, slaId: number | null): Promise<BusinessCalendar | null> {
  let bhId: number | null = null;
  if (slaId) {
    const [p] = await db.select({ bh: s.slaPolicies.businessHoursId }).from(s.slaPolicies).where(eq(s.slaPolicies.id, slaId));
    bhId = p?.bh ?? null;
  }
  if (!bhId) return null; // 24x7 when the policy has no business-hours calendar
  const [bh] = await db.select().from(s.businessHours).where(eq(s.businessHours.id, bhId));
  if (!bh) return null;
  const hol = await db.select({ date: s.holidays.date }).from(s.holidays).where(eq(s.holidays.businessHoursId, bh.id));
  return { timezone: bh.timezone, schedule: bh.schedule, holidays: hol.map((h) => h.date) };
}

/**
 * SLA resolution order (mirrors the Autotask behaviour documented in
 * docs/research): explicit ticket SLA → contract SLA → company default SLA →
 * the system default policy.
 */
export async function resolveSlaId(
  db: Tx,
  t: { slaId?: number | null; contractId?: number | null; companyId: number },
): Promise<number | null> {
  if (t.slaId) return t.slaId;
  if (t.contractId) {
    const [c] = await db.select({ slaId: s.contracts.slaId }).from(s.contracts).where(eq(s.contracts.id, t.contractId));
    if (c?.slaId) return c.slaId;
  }
  const [co] = await db.select({ slaId: s.companies.defaultSlaId }).from(s.companies).where(eq(s.companies.id, t.companyId));
  if (co?.slaId) return co.slaId;
  const [def] = await db
    .select({ id: s.slaPolicies.id })
    .from(s.slaPolicies)
    .where(and(eq(s.slaPolicies.isDefault, true), eq(s.slaPolicies.isActive, true)));
  return def?.id ?? null;
}

export async function computeDueDates(
  db: Tx,
  t: { slaId: number | null; priorityId: number; createdAt: Date; slaPausedMinutes: number },
): Promise<{ firstResponseDueAt: Date | null; resolutionDueAt: Date | null }> {
  if (!t.slaId) return { firstResponseDueAt: null, resolutionDueAt: null };
  const [target] = await db
    .select()
    .from(s.slaTargets)
    .where(and(eq(s.slaTargets.slaId, t.slaId), eq(s.slaTargets.priorityId, t.priorityId)));
  if (!target) return { firstResponseDueAt: null, resolutionDueAt: null };
  const cal = await loadCalendar(db, t.slaId);
  return {
    firstResponseDueAt: target.firstResponseMinutes ? addBusinessMinutes(t.createdAt, target.firstResponseMinutes, cal) : null,
    // Pauses (e.g. waiting for customer) extend the resolution target only.
    resolutionDueAt: target.resolutionMinutes ? addBusinessMinutes(t.createdAt, target.resolutionMinutes + t.slaPausedMinutes, cal) : null,
  };
}

export async function pausedBusinessMinutes(db: Tx, slaId: number | null, from: Date, to: Date): Promise<number> {
  return businessMinutesBetween(from, to, await loadCalendar(db, slaId));
}
