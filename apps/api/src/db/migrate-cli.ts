/**
 * Applies pending database migrations and the idempotent base seed, then exits.
 *
 *   npm run db:migrate                     (development, via tsx)
 *   node dist/db/migrate-cli.js            (production / Docker image)
 *
 * The API server also does this on start-up; this entry point exists for
 * explicit upgrades, CI and troubleshooting.
 */
import { loadConfig } from '../config.js';
import { createDb, migrationsFolder, runMigrations, waitForDatabase } from './client.js';
import { seedBase } from './seed/base.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const { db, pool } = createDb(config.DATABASE_URL, 2);
  try {
    console.log(`[migrate] applying migrations from ${migrationsFolder()}`);
    await waitForDatabase(pool);
    await runMigrations(db);
    console.log('[migrate] migrations up to date');
    await seedBase(db);
    console.log('[migrate] base seed applied');
  } finally {
    await pool.end();
  }
}

main().then(
  () => process.exit(0),
  (err: unknown) => {
    console.error('[migrate] failed:', err instanceof Error ? err.message : err);
    if (err instanceof Error && err.stack) console.error(err.stack);
    process.exit(1);
  },
);
