#!/usr/bin/env node
// Development launcher: embedded PostgreSQL (unless one already listens on
// the dev port or DATABASE_URL is set), API + worker with auto-reload, and
// the Vite dev server. Ctrl+C stops everything.
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';

const DB_PORT = Number(process.env.DEV_DB_PORT ?? 54329);
const colors = { db: 35, api: 36, worker: 33, web: 32 };
const children = [];

function portOpen(port) {
  return new Promise((resolve) => {
    const s = createConnection({ port, host: '127.0.0.1' });
    s.once('connect', () => (s.end(), resolve(true)));
    s.once('error', () => resolve(false));
  });
}

function run(name, cmd, args, env = {}) {
  const child = spawn(process.platform === 'win32' ? `${cmd} ${args.join(' ')}` : cmd, process.platform === 'win32' ? [] : args, { shell: process.platform === 'win32', env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const prefix = `\x1b[${colors[name]}m[${name}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buf = '';
    stream.on('data', (d) => {
      buf += d.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      for (const l of lines) out.write(prefix + l + '\n');
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => console.log(`${prefix}exited with code ${code}`));
  children.push(child);
  return child;
}

async function waitForPort(port, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await portOpen(port)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// The web port may be injected as PORT by preview tooling; the API always uses API_PORT.
const WEB_PORT = process.env.WEB_PORT ?? process.env.PORT ?? '5173';
const API_PORT = process.env.API_PORT ?? '3000';
const env = { NODE_ENV: 'development', PORT: API_PORT, DATABASE_URL: process.env.DATABASE_URL ?? `postgres://taskora:taskora@localhost:${DB_PORT}/taskora` };

if (!process.env.DATABASE_URL && !(await portOpen(DB_PORT))) {
  run('db', 'node', ['scripts/dev-db.mjs']);
  if (!(await waitForPort(DB_PORT))) {
    console.error('Database did not start');
    process.exit(1);
  }
}

run('api', 'npm', ['run', 'dev', '-w', '@taskora/api'], env);
await waitForPort(Number(API_PORT));
run('worker', 'npm', ['run', 'dev:worker', '-w', '@taskora/api'], env);
run('web', 'npm', ['run', 'dev', '-w', '@taskora/web'], { WEB_PORT, API_URL: `http://localhost:${API_PORT}` });

const stop = () => {
  for (const c of children) {
    // On Windows the child is a shell; kill the whole process tree.
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(c.pid), '/T', '/F'], { stdio: 'ignore' });
    else c.kill('SIGINT');
  }
  setTimeout(() => process.exit(0), 1500);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
