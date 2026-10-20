#!/usr/bin/env node
/**
 * Build-time helper (used by the Dockerfile `web` stage).
 *
 * Computes the CSP hash of every inline <script> in the built SPA's
 * index.html and substitutes it for the __CSP_SCRIPT_HASHES__ placeholder in
 * the nginx security-headers snippet. This keeps `script-src` strict (no
 * 'unsafe-inline') while allowing the tiny pre-paint theme script in
 * apps/web/index.html — and it stays correct when that script is edited,
 * because the hash is always taken from the exact bytes that nginx serves.
 *
 * Usage: node inject-csp-hashes.mjs <dist/index.html> <snippet.in> <snippet.out>
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const PLACEHOLDER = '__CSP_SCRIPT_HASHES__';
const [htmlPath, inPath, outPath] = process.argv.slice(2);
if (!htmlPath || !inPath || !outPath) {
  console.error('Usage: node inject-csp-hashes.mjs <index.html> <snippet.in> <snippet.out>');
  process.exit(2);
}

const html = readFileSync(htmlPath, 'utf8');
const hashes = new Set();
// Inline scripts are <script ...> elements without a src attribute. The hash
// covers the raw text between the opening and closing tags, byte for byte.
const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
for (const m of html.matchAll(re)) {
  const attrs = m[1] ?? '';
  const body = m[2] ?? '';
  if (/\bsrc\s*=/i.test(attrs)) continue;
  // JSON data blocks are never executed, so CSP does not apply to them.
  if (/\btype\s*=\s*["']?application\/(ld\+)?json/i.test(attrs)) continue;
  if (body.length === 0) continue;
  hashes.add(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`);
}

const snippet = readFileSync(inPath, 'utf8');
if (!snippet.includes(PLACEHOLDER)) {
  console.error(`${inPath} does not contain ${PLACEHOLDER}`);
  process.exit(1);
}
const value = [...hashes].join(' ');
writeFileSync(outPath, snippet.split(PLACEHOLDER).join(value));
console.log(`CSP: ${hashes.size} inline script hash(es) ${value || '(none)'}`);
