/** Formatting helpers shared by API (exports, PDFs) and web. */

export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—';
  const sign = minutes < 0 ? '-' : '';
  const m = Math.abs(Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${sign}${rest}m`;
  return rest === 0 ? `${sign}${h}h` : `${sign}${h}h ${rest}m`;
}

export function formatHours(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '0.00';
  return (minutes / 60).toFixed(2);
}

export function formatMoney(value: number | string | null | undefined, currency = 'EUR'): string {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0);
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number.isFinite(n) ? n : 0);
}

export function fullName(p: { firstName?: string | null; lastName?: string | null } | null | undefined): string {
  if (!p) return '';
  return [p.firstName, p.lastName].filter(Boolean).join(' ');
}

/** Pads a numeric sequence into a display number, e.g. ("TKA-", 142) → "TKA-000142". */
export function formatNumber(prefix: string, seq: number, width = 6): string {
  return `${prefix}${String(seq).padStart(width, '0')}`;
}
