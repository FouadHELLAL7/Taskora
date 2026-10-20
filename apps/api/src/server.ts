import { loadConfig } from './config.js';
import { createDb, runMigrations } from './db/client.js';
import { seedBase } from './db/seed/base.js';
import { buildApp } from './app.js';
import { announceSetupToken } from './modules/auth/routes.js';

const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL, config.DATABASE_POOL_MAX);

// Migrations are idempotent and guarded by drizzle's migration table, so the
// API applies them on start-up; this keeps `docker compose up` a single step.
await runMigrations(db);
await seedBase(db);

const app = await buildApp({ db, config });
await announceSetupToken(app);

const shutdown = async (signal: string) => {
  app.log.info(`${signal} received, shutting down`);
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host: config.HOST, port: config.PORT });
