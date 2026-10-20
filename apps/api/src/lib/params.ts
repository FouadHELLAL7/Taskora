import type { FastifyRequest } from 'fastify';
import { badRequest } from './errors.js';

/** Reads a positive integer route param (default `id`). */
export function idOf(req: FastifyRequest, name = 'id'): number {
  const raw = (req.params as Record<string, string>)[name];
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw badRequest(`Invalid ${name}`);
  return n;
}
