let cached: string[] | null = null;

/** IANA time zones supported by the browser (UTC first). */
export function timezones(): string[] {
  if (!cached) {
    let list: string[] = [];
    try {
      list = Intl.supportedValuesOf('timeZone');
    } catch {
      list = [];
    }
    cached = ['UTC', ...list.filter((z) => z !== 'UTC')];
  }
  return cached;
}

/** Select options for a time zone picker; keeps an unknown current value selectable. */
export function timezoneOptions(current?: string | null) {
  const list = timezones();
  const all = current && !list.includes(current) ? [current, ...list] : list;
  return all.map((z) => ({ value: z, label: z.replace(/_/g, ' ') }));
}
