/**
 * Loads the fictional demo dataset into the configured database.
 *
 *   npm run db:seed:demo            (from apps/api)
 *
 * Development only: refuses to run with NODE_ENV=production unless
 * TASKORA_ALLOW_DEMO_SEED=true is set explicitly.
 */
import { loadConfig } from '../../config.js';
import { createDb, runMigrations } from '../client.js';
import { seedBase } from './base.js';
import { seedDemo } from './demo.js';

const EXIT_OK = 0;
const EXIT_ERROR = 1;
const EXIT_REFUSED = 2;
const EXIT_ALREADY_PRESENT = 3;

async function main(): Promise<number> {
  if (process.env.NODE_ENV === 'production' && process.env.TASKORA_ALLOW_DEMO_SEED !== 'true') {
    console.error(
      'Refusing to load demo data: NODE_ENV=production.\n' +
        'The demo seed creates fictional companies, users and tickets and must not be loaded into a real installation.\n' +
        'If you really want this (e.g. a throw-away demo server), re-run with TASKORA_ALLOW_DEMO_SEED=true.',
    );
    return EXIT_REFUSED;
  }

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    return EXIT_ERROR;
  }

  const { db, pool } = createDb(config.DATABASE_URL, 2);
  try {
    console.log('Applying migrations and base data…');
    await runMigrations(db);
    await seedBase(db);

    console.log('Loading demo data…');
    const started = Date.now();
    const result = await seedDemo(db, { log: (msg) => console.log(`  - ${msg}`) });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);

    const password = result.users[0]?.password ?? '';
    console.log(`\nDemo data loaded in ${seconds}s.\n`);
    console.log('WARNING: this is FICTIONAL demo data for development and demos only.');
    console.log('The password below is shown only once; it is not stored anywhere in clear text.\n');
    console.log('Demo logins (all share the same password):');
    for (const u of result.users) console.log(`  ${u.email.padEnd(32)} ${u.role}`);
    console.log(`\n  Password: ${password}\n`);
    return EXIT_OK;
  } catch (err) {
    if (err instanceof Error && err.message === 'Demo data already present') {
      console.error('Demo data is already present in this database (company "Northstar Consulting" exists). Nothing was changed.');
      return EXIT_ALREADY_PRESENT;
    }
    console.error('Demo seed failed; the transaction was rolled back.');
    console.error(err);
    return EXIT_ERROR;
  } finally {
    await pool.end();
  }
}

process.exit(await main());
