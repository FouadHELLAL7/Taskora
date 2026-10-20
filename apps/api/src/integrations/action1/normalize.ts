/**
 * Pure normalisation helpers for Action1 endpoint payloads (see docs/research/action1-api.md §6).
 * Rule: never invent values — anything missing, empty or a known placeholder becomes null.
 */

/** Columns of `action1_endpoints` derived from an Action1 Endpoint object. */
export interface NormalizedEndpoint {
  name: string | null;
  deviceName: string | null;
  osName: string | null;
  platform: string | null;
  serialNumber: string | null;
  manufacturer: string | null;
  ipAddress: string | null;
  macAddress: string | null;
  loggedInUser: string | null;
  agentStatus: string | null;
  onlineStatus: string | null;
  lastSeenAt: Date | null;
  lastBootAt: Date | null;
  rebootRequired: boolean | null;
  updateStatus: string | null;
  vulnerabilityStatus: string | null;
  missingCriticalUpdates: number | null;
  missingOtherUpdates: number | null;
  agentVersion: string | null;
  cpu: string | null;
  ramText: string | null;
  diskText: string | null;
  raw: Record<string, unknown>;
}

/** Trimmed non-empty string, or null. Numbers are stringified (the spec's serial example is numeric). */
export function str(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
}

/** Non-negative integer, or null. Accepts numeric strings. */
export function int(v: unknown): number | null {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}

const A1_DATE = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

/**
 * Parses Action1 timestamps in the format `YYYY-MM-DD_HH-mm-ss` (e.g. "2026-10-19_08-41-07").
 * The spec does not state a timezone; we interpret the value as **UTC** (documented as
 * "probably UTC, uncertain" in the research notes). ISO-8601 strings are accepted as a fallback.
 * Returns null for anything else (never guesses).
 */
export function parseAction1Date(v: unknown): Date | null {
  const s = str(v);
  if (!s) return null;
  const m = A1_DATE.exec(s);
  if (m) {
    const [, y, mo, d, h, mi, se] = m.map(Number) as number[];
    const ms = Date.UTC(y!, mo! - 1, d!, h!, mi!, se!);
    const date = new Date(ms);
    // Reject impossible dates such as 2026-02-31 (Date.UTC would silently roll them over).
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo! - 1 || date.getUTCDate() !== d) return null;
    if (h! > 23 || mi! > 59 || se! > 59) return null;
    return date;
  }
  if (ISO_DATE.test(s)) {
    const t = Date.parse(s);
    return Number.isFinite(t) ? new Date(t) : null;
  }
  return null;
}

/** "Yes"/"No" (any case) or booleans → boolean; anything else → null. */
export function parseYesNo(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  const s = str(v)?.toLowerCase();
  if (s === 'yes' || s === 'true') return true;
  if (s === 'no' || s === 'false') return false;
  return null;
}

const PLACEHOLDER_SERIALS = new Set(
  [
    '0',
    '00000000',
    '000000000000',
    'none',
    'null',
    'n/a',
    'na',
    'unknown',
    'default string',
    'to be filled by o.e.m.',
    'to be filled by oem',
    'system serial number',
    'chassis serial number',
    'serial number',
    'not specified',
    'not applicable',
    'invalid',
    'oem',
    'o.e.m.',
    '123456789',
    '1234567890',
    'xxxxxxxxxx',
  ].map((x) => x.toLowerCase()),
);

/**
 * Returns the serial when it is usable for matching/storing; known BIOS placeholders
 * ("To be filled by O.E.M.", "Default string", "0", "System Serial Number", …) and strings made only
 * of zeros/spaces become null. Hypervisor serials such as "VMware-42 1a …" are kept (they are unique).
 */
export function usableSerial(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const lower = s.toLowerCase();
  if (PLACEHOLDER_SERIALS.has(lower)) return null;
  if (/^[0\s\-.]+$/.test(s)) return null;
  if (/^(x|-|\.|\*)+$/i.test(s)) return null;
  return s;
}

function nested(raw: Record<string, unknown>, key: string, sub: string): unknown {
  const obj = raw[key];
  return obj && typeof obj === 'object' && !Array.isArray(obj) ? (obj as Record<string, unknown>)[sub] : undefined;
}

/** Maps an Action1 Endpoint object to `action1_endpoints` columns. */
export function normalizeEndpoint(raw: Record<string, unknown>): NormalizedEndpoint {
  // missing_updates {critical, other} (documented, needs fields=missing_updates); the flat
  // missing_critical_updates / missing_other_updates keys are an undocumented variant we also accept.
  const critical = int(nested(raw, 'missing_updates', 'critical')) ?? int(raw.missing_critical_updates);
  const other = int(nested(raw, 'missing_updates', 'other')) ?? int(raw.missing_other_updates);
  return {
    name: str(raw.name),
    deviceName: str(raw.device_name),
    osName: str(raw.OS),
    platform: str(raw.platform),
    serialNumber: usableSerial(raw.serial),
    manufacturer: str(raw.manufacturer),
    ipAddress: str(raw.address),
    macAddress: str(raw.MAC),
    loggedInUser: str(raw.user),
    agentStatus: str(raw.status),
    onlineStatus: str(raw.online_status),
    lastSeenAt: parseAction1Date(raw.last_seen),
    lastBootAt: parseAction1Date(raw.last_boot_time),
    rebootRequired: parseYesNo(raw.reboot_required),
    updateStatus: str(raw.update_status),
    vulnerabilityStatus: str(raw.vulnerability_status),
    missingCriticalUpdates: critical,
    missingOtherUpdates: other,
    agentVersion: str(raw.agent_version),
    cpu: str(raw.CPU_name) ?? str(raw.CPU_model),
    ramText: str(raw.RAM),
    diskText: str(raw.disk),
    raw,
  };
}

/** Host name used for matching/CI hostname: the original device name, falling back to the display name. */
export function endpointHostname(e: Pick<NormalizedEndpoint, 'deviceName' | 'name'>): string | null {
  return e.deviceName ?? e.name;
}

const VM_MANUFACTURER = /\b(vmware|qemu|innotek|virtualbox|xen|parallels|bochs|nutanix|kvm)\b/i;

/**
 * Suggests a CI type name only when it can be inferred reliably; otherwise null (the caller falls
 * back to the configured default CI type, then 'Other').
 *  - Virtual Machine: hypervisor manufacturer (VMware, QEMU, VirtualBox/innotek, Xen, Parallels…) or a
 *    "VMware-" serial. (Microsoft Corporation is deliberately not used: it also makes Surface laptops.)
 *  - Server: OS name contains "Server" (e.g. "Windows Server 2022").
 *  - Laptop: Windows assigns the "LAPTOP-XXXX" host name to portable chassis, so a host name token
 *    "LAPTOP" is treated as reliable. "DESKTOP-XXXX" is NOT used: Windows gives that name to any device.
 */
export function guessCiTypeName(
  e: Pick<NormalizedEndpoint, 'osName' | 'manufacturer' | 'serialNumber' | 'name' | 'deviceName'> & { raw?: Record<string, unknown> },
): 'Virtual Machine' | 'Server' | 'Laptop' | null {
  const rawSerial = str(e.raw?.serial) ?? e.serialNumber;
  if ((e.manufacturer && VM_MANUFACTURER.test(e.manufacturer)) || (rawSerial && /^vmware-/i.test(rawSerial))) {
    return 'Virtual Machine';
  }
  if (e.osName && /\bserver\b/i.test(e.osName)) return 'Server';
  for (const n of [e.deviceName, e.name]) {
    if (n && n.toUpperCase().split(/[^A-Z0-9]+/).includes('LAPTOP')) return 'Laptop';
  }
  return null;
}

/* --------------------------------------------------------------- contacts */

/** Lowercase, accents removed, only [a-z0-9]. */
export function normToken(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Splits a logged-in user value into its parts:
 * "DOMAIN\\emma.smith" → { login: "emma.smith" }, "emma.smith@northstar.example" → { login, email }.
 */
export function parseLoggedInUser(v: string | null | undefined): { login: string; email: string | null } | null {
  const s = str(v);
  if (!s) return null;
  const afterDomain = s.includes('\\') ? s.slice(s.lastIndexOf('\\') + 1) : s;
  const at = afterDomain.indexOf('@');
  if (at > 0) return { login: afterDomain.slice(0, at), email: afterDomain.toLowerCase() };
  return afterDomain ? { login: afterDomain, email: null } : null;
}

export interface ContactCandidate {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
}

/**
 * Finds contacts matching a logged-in user. An exact e-mail match wins; otherwise contacts whose
 * e-mail local part or first+last name ("emma.smith", "EmmaSmith", "emma_smith") equals the login.
 */
export function matchContactCandidates<T extends ContactCandidate>(loggedInUser: string | null | undefined, contacts: T[]): T[] {
  const parsed = parseLoggedInUser(loggedInUser);
  if (!parsed) return [];
  if (parsed.email) {
    const exact = contacts.filter((c) => c.email && c.email.trim().toLowerCase() === parsed.email);
    if (exact.length) return exact;
  }
  const login = normToken(parsed.login);
  if (login.length < 3) return [];
  return contacts.filter((c) => {
    const local = c.email && c.email.includes('@') ? normToken(c.email.slice(0, c.email.indexOf('@'))) : '';
    if (local && local === login) return true;
    const full = normToken(`${c.firstName}${c.lastName}`);
    return !!full && full === login;
  });
}
