import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { sql } from 'drizzle-orm';
import type { Config } from './config.js';
import type { Db } from './db/client.js';
import { errorHandler } from './lib/errors.js';
import { registerAuthHook } from './modules/auth/session.js';
import { authRoutes } from './modules/auth/routes.js';
import { registerModules } from './modules/index.js';

export interface BuildOptions {
  db: Db;
  config: Config;
  logger?: boolean | object;
}

export async function buildApp({ db, config, logger }: BuildOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      logger ??
      (config.NODE_ENV === 'development'
        ? { level: config.LOG_LEVEL, transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } }
        : { level: config.LOG_LEVEL }),
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 2 * 1024 * 1024,
  });

  app.decorate('db', db);
  app.decorate('config', config);

  await app.register(helmet, {
    // The SPA is served by nginx (production) or Vite (development); the API only returns JSON/files.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-origin' },
  });
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(multipart, { limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024, files: 10 } });

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler((req, reply) =>
    reply.status(404).send({ error: { code: 'not_found', message: `Route ${req.method} ${req.url} not found` } }),
  );

  registerAuthHook(app);

  app.get('/api/health', { config: { public: true } }, async (_req, reply) => {
    try {
      await db.execute(sql`select 1`);
      return { status: 'ok', database: 'ok', time: new Date().toISOString() };
    } catch {
      return reply.status(503).send({ status: 'degraded', database: 'unreachable' });
    }
  });

  await app.register(
    async (api) => {
      await api.register(authRoutes);
      await registerModules(api);
    },
    { prefix: '/api/v1' },
  );

  return app;
}
