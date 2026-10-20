/**
 * Background worker: runs scheduled maintenance (SLA monitoring, time-based
 * workflow rules, Action1 synchronisation) and processes queued jobs.
 * Several workers can run concurrently; jobs are claimed with SKIP LOCKED.
 */
import { hostname } from 'node:os';
import { and, eq, lte, sql } from 'drizzle-orm';
import pino from 'pino';
import { loadConfig, type Config } from './config.js';
import { createDb, runMigrations, type Db } from './db/client.js';
import { integrations } from './db/schema/index.js';
import { claimJob, completeJob, enqueue, failJob, recoverStaleJobs, type JobRow } from './jobs/queue.js';
import { runSlaMonitor } from './jobs/sla-monitor.js';
import { runStatusAgeRules } from './modules/automation/engine.js';
import { runAction1Sync } from './integrations/action1/sync.js';
import { dispatchNotificationEmails, expireStaleEmails, smtpConfigured } from './jobs/email.js';

const config = loadConfig();
const log = pino({ level: config.LOG_LEVEL, base: { svc: 'worker' } });
const workerId = `${hostname()}:${process.pid}`;

type Handler = (db: Db, config: Config, job: JobRow) => Promise<unknown>;

const handlers: Record<string, Handler> = {
  'sla.check': (db) => runSlaMonitor(db),
  'workflow.status_age': (db) => runStatusAgeRules(db),
  'action1.sync': (db, cfg, job) =>
    runAction1Sync(db, cfg, {
      trigger: (job.payload.trigger as 'manual' | 'scheduled') ?? 'scheduled',
      userId: (job.payload.userId as number | null) ?? null,
    }),
  'email.dispatch': (db, cfg) => dispatchNotificationEmails(db, cfg),
  'maintenance.cleanup': async (db) => {
    await expireStaleEmails(db);
    await db.execute(sql`delete from sessions where expires_at < now()`);
    await db.execute(sql`delete from notifications where read_at is not null and read_at < now() - interval '90 days'`);
    await db.execute(sql`delete from jobs where status in ('done','failed') and coalesce(finished_at, created_at) < now() - interval '14 days'`);
    await db.execute(sql`delete from workflow_executions where executed_at < now() - interval '180 days'`);
  },
};

/** Enqueues periodic jobs; dedupe keys prevent piling up when a run is slow. */
async function schedule(db: Db) {
  await enqueue(db, 'sla.check', {}, { dedupeKey: 'sla.check', maxAttempts: 1 });
  await enqueue(db, 'workflow.status_age', {}, { dedupeKey: 'workflow.status_age', maxAttempts: 1 });
  if (smtpConfigured(config)) await enqueue(db, 'email.dispatch', {}, { dedupeKey: 'email.dispatch', maxAttempts: 1 });
  const [a1] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.provider, 'action1'), eq(integrations.enabled, true), lte(integrations.nextSyncAt, new Date())));
  if (a1) await enqueue(db, 'action1.sync', { trigger: 'scheduled' }, { dedupeKey: 'action1.sync', maxAttempts: 3 });
}

async function main() {
  const { db, pool } = createDb(config.DATABASE_URL, Math.min(config.DATABASE_POOL_MAX, 5));
  await runMigrations(db);
  log.info({ workerId }, 'worker started');

  let stopping = false;
  let lastSchedule = 0;
  let lastCleanup = 0;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    log.info('worker stopping');
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  while (!stopping) {
    try {
      const now = Date.now();
      if (now - lastSchedule >= 60_000) {
        lastSchedule = now;
        await recoverStaleJobs(db);
        await schedule(db);
      }
      if (now - lastCleanup >= 24 * 3600_000) {
        lastCleanup = now;
        await enqueue(db, 'maintenance.cleanup', {}, { dedupeKey: 'maintenance.cleanup', maxAttempts: 1 });
      }
      const job = await claimJob(db, workerId);
      if (!job) {
        await new Promise((r) => setTimeout(r, config.WORKER_POLL_MS));
        continue;
      }
      const handler = handlers[job.type];
      const started = Date.now();
      try {
        if (!handler) throw new Error(`No handler for job type ${job.type}`);
        const result = await handler(db, config, job);
        await completeJob(db, job.id);
        log.info({ job: job.type, id: job.id, ms: Date.now() - started, result: summarise(result) }, 'job done');
      } catch (err) {
        await failJob(db, job, err);
        log.warn({ job: job.type, id: job.id, attempt: job.attempts, err: (err as Error).message }, 'job failed');
      }
    } catch (err) {
      log.error({ err }, 'worker loop error');
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  await pool.end();
}

function summarise(result: unknown) {
  if (!result || typeof result !== 'object') return result;
  const r = result as Record<string, unknown>;
  return 'stats' in r ? { status: r.status, stats: r.stats } : r;
}

main().catch((err) => {
  log.fatal({ err }, 'worker crashed');
  process.exit(1);
});
