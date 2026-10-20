import { z } from 'zod';

const bool = (def: boolean) =>
  z
    .enum(['true', 'false', '1', '0', 'yes', 'no'])
    .optional()
    .transform((v) => (v === undefined ? def : ['true', '1', 'yes'].includes(v)));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.string().default('postgres://taskora:taskora@localhost:54329/taskora'),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  /** 32-byte key (hex or base64) used to encrypt integration secrets at rest. */
  TASKORA_ENCRYPTION_KEY: z.string().optional(),
  /** Optional fixed token for the first-run admin setup; otherwise a random one is logged. */
  TASKORA_SETUP_TOKEN: z.string().min(16).optional(),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 90).default(12),
  /** 'auto' marks cookies Secure when the request arrived over HTTPS. */
  COOKIE_SECURE: z.enum(['auto', 'true', 'false']).default('auto'),
  TRUST_PROXY: bool(true),
  UPLOAD_DIR: z.string().default('./.data/uploads'),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(512).default(25),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Allows overriding Action1 base URLs (tests / proxies). */
  ACTION1_BASE_URL_OVERRIDE: z.string().url().optional(),
  WORKER_POLL_MS: z.coerce.number().int().min(200).default(2000),
  /** Public base URL used in e-mail links, e.g. https://psa.example.com */
  PUBLIC_URL: z.string().url().optional(),
  /** Optional SMTP relay for e-mail notifications (in-app notifications always work). */
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_SECURE: bool(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  /** Optional IMAP mailbox polled by the worker to create/append tickets from e-mail. */
  IMAP_HOST: z.string().optional(),
  IMAP_PORT: z.coerce.number().int().default(993),
  IMAP_SECURE: bool(true),
  IMAP_USER: z.string().optional(),
  IMAP_PASSWORD: z.string().optional(),
  IMAP_MAILBOX: z.string().default('INBOX'),
});

export type Config = z.infer<typeof envSchema> & { encryptionKey: Buffer };

function parseKey(raw: string | undefined, env: string): Buffer {
  if (!raw) {
    if (env === 'production') {
      throw new Error(
        'TASKORA_ENCRYPTION_KEY is required in production. Generate one with: openssl rand -hex 32',
      );
    }
    // Deterministic development key — never used in production.
    return Buffer.alloc(32, 7);
  }
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('TASKORA_ENCRYPTION_KEY must decode to 32 bytes (64 hex chars)');
  return buf;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${msg}`);
  }
  return { ...parsed.data, encryptionKey: parseKey(parsed.data.TASKORA_ENCRYPTION_KEY, parsed.data.NODE_ENV) };
}
