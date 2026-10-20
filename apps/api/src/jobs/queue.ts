import { sql } from 'drizzle-orm';
import type { Db, Tx } from '../db/client.js';
import { jobs } from '../db/schema/index.js';

export type JobRow = typeof jobs.$inferSelect;

/** Enqueues a job. With a dedupe key, at most one pending/running job of that key exists. */
export async function enqueue(
  db: Tx,
  type: string,
  payload: Record<string, unknown> = {},
  opts: { dedupeKey?: string; runAt?: Date; maxAttempts?: number } = {},
): Promise<JobRow | null> {
  const [row] = await db
    .insert(jobs)
    .values({ type, payload, dedupeKey: opts.dedupeKey ?? null, runAt: opts.runAt ?? new Date(), maxAttempts: opts.maxAttempts ?? 5 })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

/** Atomically claims the next due job (safe with several workers). */
export async function claimJob(db: Db, workerId: string): Promise<JobRow | null> {
  const res = await db.execute<Record<string, unknown>>(sql`
    update jobs set status = 'running', locked_at = now(), locked_by = ${workerId}, attempts = attempts + 1
    where id = (
      select id from jobs where status = 'pending' and run_at <= now()
      order by run_at, id for update skip locked limit 1
    )
    returning id`);
  const id = res.rows[0]?.id;
  if (!id) return null;
  const [row] = await db.select().from(jobs).where(sql`${jobs.id} = ${Number(id)}`);
  return row ?? null;
}

export async function completeJob(db: Db, id: number) {
  await db.update(jobs).set({ status: 'done', finishedAt: new Date(), lockedAt: null }).where(sql`${jobs.id} = ${id}`);
}

/** Exponential backoff with jitter: 30s, 60s, 120s… capped at 1 hour. */
export function backoffMs(attempt: number): number {
  const base = Math.min(3600_000, 30_000 * 2 ** Math.max(0, attempt - 1));
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

export async function failJob(db: Db, job: JobRow, error: unknown) {
  const message = String((error as Error)?.message ?? error).slice(0, 2000);
  if (job.attempts >= job.maxAttempts) {
    await db.update(jobs).set({ status: 'failed', lastError: message, finishedAt: new Date(), lockedAt: null }).where(sql`${jobs.id} = ${job.id}`);
  } else {
    await db
      .update(jobs)
      .set({ status: 'pending', lastError: message, lockedAt: null, runAt: new Date(Date.now() + backoffMs(job.attempts)) })
      .where(sql`${jobs.id} = ${job.id}`);
  }
}

/** Returns jobs stuck in "running" (crashed worker) to the queue. */
export async function recoverStaleJobs(db: Db, olderThanMinutes = 30) {
  await db.execute(sql`update jobs set status = 'pending', locked_at = null
    where status = 'running' and locked_at < now() - make_interval(mins => ${olderThanMinutes})`);
}
