import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import * as s from '../db/schema/index.js';
import { notify } from '../modules/notifications/service.js';

/**
 * Daily business reminders: contracts ending and CI warranties expiring
 * within 30 days. Each item is announced once (tracked by notification
 * entity + type), to the company's account manager or, if none, to
 * administrators.
 */
export async function runBusinessReminders(db: Db, days = 30): Promise<{ contracts: number; warranties: number }> {
  const admins = (
    await db
      .select({ id: s.users.id })
      .from(s.users)
      .innerJoin(s.roles, eq(s.roles.id, s.users.roleId))
      .where(and(eq(s.users.isActive, true), eq(s.roles.key, 'administrator')))
  ).map((u) => u.id);
  const recipients = (accountManagerId: number | null) => (accountManagerId ? [accountManagerId] : admins);
  const already = async (type: string, entityType: string, entityId: number) => {
    const [row] = await db
      .select({ id: s.notifications.id })
      .from(s.notifications)
      .where(and(eq(s.notifications.type, type), eq(s.notifications.entityType, entityType), eq(s.notifications.entityId, entityId)))
      .limit(1);
    return !!row;
  };

  let contracts = 0;
  const ending = await db
    .select({ id: s.contracts.id, name: s.contracts.name, endDate: s.contracts.endDate, companyName: s.companies.name, accountManagerId: s.companies.accountManagerId })
    .from(s.contracts)
    .innerJoin(s.companies, eq(s.companies.id, s.contracts.companyId))
    .where(and(eq(s.contracts.status, 'active'), sql`${s.contracts.endDate} between current_date and current_date + ${days}::int`));
  for (const c of ending) {
    if (await already('contract.expiring', 'contract', c.id)) continue;
    await notify(db, recipients(c.accountManagerId), {
      type: 'contract.expiring',
      title: `Contract ending ${c.endDate}: ${c.name}`,
      body: `${c.companyName} — review renewal`,
      link: `/contracts/${c.id}`,
      entityType: 'contract',
      entityId: c.id,
    });
    contracts++;
  }

  let warranties = 0;
  const expiring = await db
    .select({ id: s.configurationItems.id, name: s.configurationItems.name, warrantyExpiresAt: s.configurationItems.warrantyExpiresAt, companyName: s.companies.name, accountManagerId: s.companies.accountManagerId })
    .from(s.configurationItems)
    .innerJoin(s.companies, eq(s.companies.id, s.configurationItems.companyId))
    .where(and(eq(s.configurationItems.lifecycleStatus, 'active'), sql`${s.configurationItems.warrantyExpiresAt} between current_date and current_date + ${days}::int`))
    .limit(500);
  for (const ci of expiring) {
    if (await already('ci.warranty_expiring', 'configuration_item', ci.id)) continue;
    await notify(db, recipients(ci.accountManagerId), {
      type: 'ci.warranty_expiring',
      title: `Warranty expires ${ci.warrantyExpiresAt}: ${ci.name}`,
      body: ci.companyName,
      link: `/assets/${ci.id}`,
      entityType: 'configuration_item',
      entityId: ci.id,
    });
    warranties++;
  }
  return { contracts, warranties };
}
