import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from './schema/index.js';

export type Schema = typeof schema;
export type Db = NodePgDatabase<Schema>;
/** A database handle or an open transaction. */
export type Tx = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

// Return DATE columns as plain strings and NUMERIC as JS numbers.
pg.types.setTypeParser(1082, (v) => v);

export function createDb(url: string, max = 10): { db: Db; pool: pg.Pool } {
  const pool = new pg.Pool({ connectionString: url, max });
  const db = drizzle(pool, { schema, casing: undefined });
  return { db, pool };
}

/** Locates the drizzle migrations folder both in source (tsx) and bundled (dist) layouts. */
export function migrationsFolder(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, '../../drizzle'),
    resolve(here, '../drizzle'),
    resolve(here, '../../../drizzle'),
    resolve(process.cwd(), 'drizzle'),
    resolve(process.cwd(), 'apps/api/drizzle'),
  ];
  const found = candidates.find((c) => existsSync(resolve(c, 'meta/_journal.json')));
  if (!found) throw new Error(`Could not locate migrations folder (tried ${candidates.join(', ')})`);
  return found;
}

/**
 * Waits until PostgreSQL accepts queries (it may still be starting or
 * recovering after a reboot) instead of crashing on the first attempt.
 */
export async function waitForDatabase(pool: pg.Pool, timeoutMs = 120_000, log: (m: string) => void = console.warn): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  for (;;) {
    try {
      await pool.query('select 1');
      return;
    } catch (err) {
      attempt++;
      if (Date.now() > deadline) throw err;
      if (attempt === 1 || attempt % 10 === 0) log(`Waiting for the database: ${(err as Error).message}`);
      await new Promise((r) => setTimeout(r, Math.min(5000, 500 * attempt)));
    }
  }
}

export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: migrationsFolder() });
}

export { schema };
