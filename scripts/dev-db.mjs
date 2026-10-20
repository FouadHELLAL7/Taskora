#!/usr/bin/env node
// Development-only PostgreSQL using the `embedded-postgres` binaries, for
// machines without Docker or a local PostgreSQL. Data lives in .data/pg.
// Production deployments use the postgres service in docker-compose.yml.
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const dataDir = resolve(process.cwd(), '.data', 'pg');
const port = Number(process.env.DEV_DB_PORT ?? 54329);
const fresh = !existsSync(resolve(dataDir, 'PG_VERSION'));

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'taskora',
  password: 'taskora',
  port,
  persistent: true,
  onLog: () => {},
  onError: (e) => console.error('[dev-db]', String(e).trim()),
});

if (fresh) {
  console.log('[dev-db] initialising cluster in', dataDir);
  await pg.initialise();
}
await pg.start();
if (fresh) {
  await pg.createDatabase('taskora');
  await pg.createDatabase('taskora_test');
}
console.log(`[dev-db] PostgreSQL ready on postgres://taskora:taskora@localhost:${port}/taskora`);

const stop = async () => {
  console.log('[dev-db] stopping…');
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
