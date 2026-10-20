import type { FastifyRequest } from 'fastify';
import type { Tx } from '../db/client.js';
import { auditLogs } from '../db/schema/index.js';

export interface AuditEntry {
  action: 'create' | 'update' | 'delete' | 'login' | 'logout' | 'login_failed' | 'sync' | 'execute' | string;
  entityType: string;
  entityId?: string | number | null;
  summary?: string;
  changes?: Record<string, unknown> | null;
}

export async function audit(db: Tx, req: FastifyRequest | null, entry: AuditEntry, userId?: number | null) {
  await db.insert(auditLogs).values({
    userId: userId ?? req?.user?.id ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId == null ? null : String(entry.entityId),
    summary: entry.summary ?? null,
    changes: entry.changes ?? null,
    ip: req?.ip ?? null,
  });
}

const IGNORED = new Set(['updatedAt', 'createdAt', 'passwordHash', 'secretsEncrypted']);

/** Shallow diff of two records, returning { field: [before, after] } for changed keys of `after`. */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const changes: Record<string, [unknown, unknown]> = {};
  for (const key of Object.keys(after)) {
    if (IGNORED.has(key)) continue;
    const a = normalise(before[key]);
    const b = normalise(after[key]);
    if (JSON.stringify(a) !== JSON.stringify(b)) changes[key] = [a, b];
  }
  return changes;
}

function normalise(v: unknown) {
  if (v instanceof Date) return v.toISOString();
  if (v === undefined) return null;
  return v;
}
