/**
 * Emergency password reset for a Taskora user (e.g. a locked-out administrator).
 *
 *   node dist/cli/reset-password.js <email>                       (Docker image)
 *   npm run admin:reset-password -w @taskora/api -- <email>       (development)
 *
 * A strong random password is generated unless TASKORA_NEW_PASSWORD is set.
 * The account is unlocked and all of its sessions are revoked. A deactivated
 * account stays deactivated (re-activate it in Admin > Users).
 * The new password is printed once; it is never logged anywhere else.
 */
import { randomInt } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { loadConfig } from '../config.js';
import { createDb } from '../db/client.js';
import { sessions, users } from '../db/schema/index.js';
import { hashPassword } from '../lib/crypto.js';

// No ambiguous characters (0/O, 1/l/I) so the password can be read off a terminal.
const LETTERS = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const ALPHABET = LETTERS + DIGITS;

function generatePassword(length = 20): string {
  for (;;) {
    let out = '';
    for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
    // Must satisfy the application password policy (letters and numbers).
    if (/[a-zA-Z]/.test(out) && /[0-9]/.test(out)) return out;
  }
}

function validatePassword(p: string): string | null {
  if (p.length < 12) return 'must be at least 12 characters';
  if (p.length > 256) return 'must be at most 256 characters';
  if (!/[a-zA-Z]/.test(p) || !/[0-9]/.test(p)) return 'must contain letters and numbers';
  return null;
}

function usage(): never {
  console.error('Usage: node dist/cli/reset-password.js <email>');
  console.error('Optionally set TASKORA_NEW_PASSWORD to choose the new password instead of generating one.');
  process.exit(2);
}

async function main(): Promise<number> {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  if (args.length !== 1 || args[0] === '-h' || args[0] === '--help') usage();
  const email = args[0]!.trim().toLowerCase();
  if (!email.includes('@')) usage();

  const provided = process.env.TASKORA_NEW_PASSWORD;
  if (provided !== undefined) {
    const problem = validatePassword(provided);
    if (problem) {
      console.error(`TASKORA_NEW_PASSWORD ${problem}.`);
      return 2;
    }
  }
  const password = provided ?? generatePassword();

  const config = loadConfig();
  const { db, pool } = createDb(config.DATABASE_URL, 1);
  try {
    const [user] = await db
      .select({ id: users.id, email: users.email, isActive: users.isActive })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`);
    if (!user) {
      console.error(`No user found with e-mail address ${email}.`);
      return 1;
    }

    const passwordHash = await hashPassword(password);
    const revoked = await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ passwordHash, failedLogins: 0, lockedUntil: null, updatedAt: new Date() })
        .where(eq(users.id, user.id));
      const deleted = await tx.delete(sessions).where(eq(sessions.userId, user.id)).returning({ id: sessions.id });
      return deleted.length;
    });

    console.log(`Password reset for ${user.email} (user #${user.id}).`);
    if (!user.isActive) console.log('Warning: this account is deactivated; an administrator must re-activate it before it can sign in.');
    console.log(`Revoked ${revoked} active session(s); the account lockout was cleared.`);
    if (provided === undefined) {
      console.log('');
      console.log(`New password: ${password}`);
      console.log('');
      console.log('This password is shown only once. Sign in and change it under your profile.');
    } else {
      console.log('The password from TASKORA_NEW_PASSWORD has been set.');
    }
    return 0;
  } finally {
    await pool.end();
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error('Password reset failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
