import { and, eq, inArray } from 'drizzle-orm';
import type { Tx } from '../../db/client.js';
import * as s from '../../db/schema/index.js';

export interface NotificationInput {
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  entityType?: string | null;
  entityId?: number | null;
}

/** Renders `{{a.b}}` placeholders from a nested variables object. */
export function renderTemplate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path: string) => {
    let v: unknown = vars;
    for (const k of path.split('.')) v = v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined;
    return v === undefined || v === null ? '' : String(v);
  });
}

/** Creates in-app notifications for active users, skipping the actor. */
export async function notify(db: Tx, userIds: (number | null | undefined)[], n: NotificationInput, actorId?: number | null) {
  const ids = [...new Set(userIds.filter((u): u is number => !!u && u !== actorId))];
  if (!ids.length) return;
  const active = await db
    .select({ id: s.users.id })
    .from(s.users)
    .where(and(inArray(s.users.id, ids), eq(s.users.isActive, true)));
  if (!active.length) return;
  await db.insert(s.notifications).values(
    active.map((u) => ({
      userId: u.id,
      type: n.type,
      title: n.title.slice(0, 255),
      body: n.body ?? null,
      link: n.link ?? null,
      entityType: n.entityType ?? null,
      entityId: n.entityId ?? null,
    })),
  );
}

/** Notification using the admin-editable template for `event` (falls back to the given text). */
export async function notifyFromTemplate(
  db: Tx,
  event: string,
  userIds: (number | null | undefined)[],
  vars: Record<string, unknown>,
  fallback: NotificationInput,
  actorId?: number | null,
) {
  const [tpl] = await db.select().from(s.notificationTemplates).where(eq(s.notificationTemplates.event, event));
  const n = tpl?.isActive
    ? { ...fallback, title: renderTemplate(tpl.subject, vars), body: renderTemplate(tpl.body, vars) }
    : tpl && !tpl.isActive
      ? null
      : fallback;
  if (n) await notify(db, userIds, n, actorId);
}
