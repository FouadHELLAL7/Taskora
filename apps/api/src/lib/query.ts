import { and, asc, desc, ilike, or, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import type { ListQuery, Paginated } from '@taskora/shared';
import { listQuerySchema } from '@taskora/shared';
import type { Tx } from '../db/client.js';
import { sequences } from '../db/schema/index.js';

export function parseList(query: unknown): ListQuery & Record<string, unknown> {
  const base = listQuerySchema.parse(query ?? {});
  return { ...(query as Record<string, unknown>), ...base };
}

/** Escapes LIKE wildcards in user search input. */
export function likeTerm(q: string): string {
  return `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}

export function searchAny(q: string | undefined, columns: (AnyColumn | SQL)[]): SQL | undefined {
  if (!q) return undefined;
  const term = likeTerm(q);
  return or(...columns.map((c) => ilike(c as AnyColumn, term)));
}

export function orderFrom(
  sort: string | undefined,
  order: 'asc' | 'desc',
  allowed: Record<string, AnyColumn | SQL>,
  fallback: SQL | AnyColumn,
): SQL[] {
  const col = sort && allowed[sort];
  const dir = order === 'asc' ? asc : desc;
  if (!col) return [desc(fallback as AnyColumn)];
  return [dir(col as AnyColumn)];
}

export function whereAll(...conds: (SQL | undefined | false | null)[]): SQL | undefined {
  const list = conds.filter(Boolean) as SQL[];
  return list.length ? and(...list) : undefined;
}

export function paginated<T>(data: T[], total: number, q: ListQuery): Paginated<T> {
  return { data, total, page: q.page, pageSize: q.pageSize };
}

export const countAll = sql<number>`count(*)::int`;

/** Atomically increments and returns a named sequence value. */
export async function nextSequence(db: Tx, name: string): Promise<number> {
  const [row] = await db
    .insert(sequences)
    .values({ name, value: 1 })
    .onConflictDoUpdate({ target: sequences.name, set: { value: sql`${sequences.value} + 1` } })
    .returning({ value: sequences.value });
  return row!.value;
}

/** Parses a comma separated list of positive integers from a query value. */
export function idList(v: unknown): number[] {
  if (v === undefined || v === null || v === '') return [];
  const arr = Array.isArray(v) ? v : String(v).split(',');
  return arr.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0);
}

export function boolParam(v: unknown): boolean | undefined {
  if (v === 'true' || v === '1' || v === true) return true;
  if (v === 'false' || v === '0' || v === false) return false;
  return undefined;
}

export function intParam(v: unknown): number | undefined {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isInteger(n) && n > 0 ? n : undefined;
}
