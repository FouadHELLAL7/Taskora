import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, gte, lte, ne, sql } from 'drizzle-orm';
import { ALL_PERMISSIONS, roleSchema, userCreateSchema, userUpdateSchema } from '@taskora/shared';
import * as s from '../../db/schema/index.js';
import { hashPassword } from '../../lib/crypto.js';
import { audit, diff } from '../../lib/audit.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { idOf } from '../../lib/params.js';
import { countAll, intParam, paginated, parseList, searchAny, whereAll } from '../../lib/query.js';
import { currentUser } from '../../lib/context.js';

const userColumns = {
  id: s.users.id,
  email: s.users.email,
  firstName: s.users.firstName,
  lastName: s.users.lastName,
  title: s.users.title,
  phone: s.users.phone,
  roleId: s.users.roleId,
  roleName: s.roles.name,
  isActive: s.users.isActive,
  isTechnician: s.users.isTechnician,
  timezone: s.users.timezone,
  hourlyCost: s.users.hourlyCost,
  lastLoginAt: s.users.lastLoginAt,
  lockedUntil: s.users.lockedUntil,
  createdAt: s.users.createdAt,
};

function cleanPermissions(perms: string[]): string[] {
  if (perms.includes('*')) return ['*'];
  return [...new Set(perms.filter((p) => (ALL_PERMISSIONS as string[]).includes(p)))];
}

export async function adminRoutes(app: FastifyInstance) {
  /* ---------------------------------------------------------------- users */

  app.get('/users', { config: { perm: 'users.manage' } }, async (req) => {
    const q = parseList(req.query);
    const where = whereAll(searchAny(q.q, [s.users.email, s.users.firstName, s.users.lastName]));
    const rows = await app.db
      .select(userColumns)
      .from(s.users)
      .innerJoin(s.roles, eq(s.roles.id, s.users.roleId))
      .where(where)
      .orderBy(asc(s.users.firstName))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [{ n }] = (await app.db.select({ n: countAll }).from(s.users).where(where)) as [{ n: number }];
    return paginated(rows, n, q);
  });

  /** Technician directory with workload (any signed-in user). */
  app.get('/resources', async () => {
    const rows = await app.db.execute(sql`
      select u.id, u.first_name as "firstName", u.last_name as "lastName", u.email, u.title, u.phone,
        r.name as "roleName",
        (select count(*) from tickets t join ticket_statuses st on st.id = t.status_id
          where t.assigned_user_id = u.id and st.category not in ('resolved','closed'))::int as "openTickets",
        (select coalesce(sum(duration_minutes),0) from time_entries te
          where te.user_id = u.id and te.started_at >= date_trunc('week', now()))::int as "minutesThisWeek"
      from users u join roles r on r.id = u.role_id
      where u.is_active and u.is_technician
      order by u.first_name`);
    return { data: rows.rows };
  });

  app.get('/users/:id', { config: { perm: 'users.manage' } }, async (req) => {
    const [row] = await app.db
      .select(userColumns)
      .from(s.users)
      .innerJoin(s.roles, eq(s.roles.id, s.users.roleId))
      .where(eq(s.users.id, idOf(req)));
    if (!row) throw notFound('User');
    return row;
  });

  app.post('/users', { config: { perm: 'users.manage' } }, async (req, reply) => {
    const input = userCreateSchema.parse(req.body);
    const { password, ...rest } = input;
    const [row] = await app.db
      .insert(s.users)
      .values({ ...rest, passwordHash: await hashPassword(password) })
      .returning({ id: s.users.id, email: s.users.email });
    await audit(app.db, req, { action: 'create', entityType: 'user', entityId: row!.id, summary: row!.email });
    return reply.status(201).send(row);
  });

  app.patch('/users/:id', { config: { perm: 'users.manage' } }, async (req) => {
    const id = idOf(req);
    const me = currentUser(req);
    const input = userUpdateSchema.parse(req.body);
    const body = req.body as Record<string, unknown>;
    const [before] = await app.db.select().from(s.users).where(eq(s.users.id, id));
    if (!before) throw notFound('User');
    const { password, ...rest } = input;
    const data: Record<string, unknown> = Object.fromEntries(Object.entries(rest).filter(([k]) => k in body));
    if (id === me.id && (data.isActive === false || (data.roleId && data.roleId !== before.roleId))) {
      throw badRequest('You cannot deactivate yourself or change your own role');
    }
    if (password) data.passwordHash = await hashPassword(password);
    if ('isActive' in data && data.isActive) data.lockedUntil = null;
    await app.db.update(s.users).set(data).where(eq(s.users.id, id));
    if (password || data.isActive === false) await app.db.delete(s.sessions).where(eq(s.sessions.userId, id));
    await audit(app.db, req, {
      action: 'update',
      entityType: 'user',
      entityId: id,
      changes: { ...diff(before, rest as Record<string, unknown>), ...(password ? { password: 'changed' } : {}) },
    });
    return { ok: true };
  });

  /* ---------------------------------------------------------------- roles */

  app.get('/roles', { config: { perm: 'users.manage' } }, async () => {
    const rows = await app.db
      .select({
        id: s.roles.id,
        key: s.roles.key,
        name: s.roles.name,
        description: s.roles.description,
        permissions: s.roles.permissions,
        isSystem: s.roles.isSystem,
        userCount: sql<number>`(select count(*)::int from users u where u.role_id = ${s.roles.id})`,
      })
      .from(s.roles)
      .orderBy(asc(s.roles.id));
    return { data: rows };
  });

  app.post('/roles', { config: { perm: 'users.manage' } }, async (req, reply) => {
    const input = roleSchema.parse(req.body);
    const key = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + '_' + Date.now().toString(36);
    const [row] = await app.db
      .insert(s.roles)
      .values({ key, name: input.name, description: input.description, permissions: cleanPermissions(input.permissions) })
      .returning();
    await audit(app.db, req, { action: 'create', entityType: 'role', entityId: row!.id, summary: row!.name });
    return reply.status(201).send(row);
  });

  app.patch('/roles/:id', { config: { perm: 'users.manage' } }, async (req) => {
    const id = idOf(req);
    const input = roleSchema.partial().parse(req.body);
    const [role] = await app.db.select().from(s.roles).where(eq(s.roles.id, id));
    if (!role) throw notFound('Role');
    if (role.isSystem && input.permissions) throw badRequest('Permissions of built-in roles cannot be changed. Create a custom role instead.');
    const data: Record<string, unknown> = {};
    if (input.name) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.permissions) data.permissions = cleanPermissions(input.permissions);
    const [row] = await app.db.update(s.roles).set(data).where(eq(s.roles.id, id)).returning();
    await audit(app.db, req, { action: 'update', entityType: 'role', entityId: id, changes: data });
    return row;
  });

  app.delete('/roles/:id', { config: { perm: 'users.manage' } }, async (req) => {
    const id = idOf(req);
    const [role] = await app.db.select().from(s.roles).where(eq(s.roles.id, id));
    if (!role) throw notFound('Role');
    if (role.isSystem) throw badRequest('Built-in roles cannot be deleted');
    await app.db.delete(s.roles).where(and(eq(s.roles.id, id), ne(s.roles.isSystem, true)));
    await audit(app.db, req, { action: 'delete', entityType: 'role', entityId: id, summary: role.name });
    return { ok: true };
  });

  /* ----------------------------------------------------------- audit logs */

  app.get('/audit-logs', { config: { perm: 'audit.read' } }, async (req) => {
    const q = parseList(req.query);
    const where = whereAll(
      q.entityType ? eq(s.auditLogs.entityType, String(q.entityType)) : undefined,
      q.entityId ? eq(s.auditLogs.entityId, String(q.entityId)) : undefined,
      q.action ? eq(s.auditLogs.action, String(q.action)) : undefined,
      intParam(q.userId) ? eq(s.auditLogs.userId, intParam(q.userId)!) : undefined,
      q.from ? gte(s.auditLogs.at, new Date(String(q.from))) : undefined,
      q.to ? lte(s.auditLogs.at, new Date(String(q.to))) : undefined,
      searchAny(q.q, [s.auditLogs.summary, s.auditLogs.entityType]),
    );
    const rows = await app.db
      .select({
        id: s.auditLogs.id,
        at: s.auditLogs.at,
        action: s.auditLogs.action,
        entityType: s.auditLogs.entityType,
        entityId: s.auditLogs.entityId,
        summary: s.auditLogs.summary,
        changes: s.auditLogs.changes,
        ip: s.auditLogs.ip,
        userName: sql<string | null>`${s.users.firstName} || ' ' || ${s.users.lastName}`,
      })
      .from(s.auditLogs)
      .leftJoin(s.users, eq(s.users.id, s.auditLogs.userId))
      .where(where)
      .orderBy(desc(s.auditLogs.at))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [{ n }] = (await app.db.select({ n: countAll }).from(s.auditLogs).where(where)) as [{ n: number }];
    return paginated(rows, n, q);
  });
}
