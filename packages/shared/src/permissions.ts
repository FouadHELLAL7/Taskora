/**
 * Central permission catalogue. Permissions are enforced by the API; the web
 * client only uses them to hide actions the user cannot perform.
 */
export const PERMISSIONS = {
  'dashboard.read': 'View dashboards',
  'companies.read': 'View companies, contacts and locations',
  'companies.write': 'Create and edit companies, contacts and locations',
  'companies.delete': 'Delete companies, contacts and locations',
  'opportunities.read': 'View opportunities',
  'opportunities.write': 'Create and edit opportunities',
  'tickets.read': 'View tickets',
  'tickets.write': 'Create and edit tickets, add notes',
  'tickets.delete': 'Delete tickets',
  'tickets.bulk': 'Bulk update tickets',
  'cis.read': 'View configuration items',
  'cis.write': 'Create and edit configuration items',
  'cis.delete': 'Delete configuration items',
  'time.read': 'View own time entries',
  'time.read_all': 'View all time entries',
  'time.write': 'Log own time',
  'time.write_all': 'Log and edit time for any user',
  'time.approve': 'Approve time entries',
  'contracts.read': 'View contracts and services',
  'contracts.write': 'Create and edit contracts and services',
  'billing.read': 'View billing and invoices',
  'billing.write': 'Create and edit invoices and expenses',
  'projects.read': 'View projects',
  'projects.write': 'Create and edit projects, tasks and milestones',
  'kb.read': 'View knowledge base',
  'kb.write': 'Create and edit knowledge base articles',
  'reports.read': 'View reports and analytics',
  'integrations.read': 'View integration status and synced data',
  'integrations.manage': 'Configure integrations and run synchronisation',
  'automation.manage': 'Manage workflow rules',
  'settings.manage': 'Manage service desk and system settings',
  'users.manage': 'Manage users and roles',
  'audit.read': 'View audit logs',
  'backups.manage': 'Create, download and restore full backups',
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const PERMISSION_GROUPS: { label: string; prefix: string[] }[] = [
  { label: 'Workspace', prefix: ['dashboard.'] },
  { label: 'CRM', prefix: ['companies.', 'opportunities.'] },
  { label: 'Service Desk', prefix: ['tickets.'] },
  { label: 'Assets', prefix: ['cis.'] },
  { label: 'Time', prefix: ['time.'] },
  { label: 'Business', prefix: ['contracts.', 'billing.'] },
  { label: 'Projects', prefix: ['projects.'] },
  { label: 'Knowledge', prefix: ['kb.'] },
  { label: 'Insights', prefix: ['reports.'] },
  { label: 'Administration', prefix: ['integrations.', 'automation.', 'settings.', 'users.', 'audit.', 'backups.'] },
];

const READ_ONLY: Permission[] = [
  'dashboard.read',
  'companies.read',
  'opportunities.read',
  'tickets.read',
  'cis.read',
  'time.read',
  'contracts.read',
  'projects.read',
  'kb.read',
  'reports.read',
  'integrations.read',
];

const TECHNICIAN: Permission[] = [
  ...READ_ONLY,
  'companies.write',
  'tickets.write',
  'cis.write',
  'time.write',
  'projects.write',
  'kb.write',
];

const MANAGER: Permission[] = [
  ...TECHNICIAN,
  'opportunities.write',
  'tickets.bulk',
  'tickets.delete',
  'cis.delete',
  'time.read_all',
  'time.write_all',
  'time.approve',
  'contracts.write',
  'billing.read',
  'billing.write',
  'automation.manage',
  'audit.read',
];

/** Built-in roles. `*` grants every permission. */
export const SYSTEM_ROLES: { key: string; name: string; description: string; permissions: (Permission | '*')[] }[] = [
  { key: 'administrator', name: 'Administrator', description: 'Full access to every module and setting', permissions: ['*'] },
  {
    key: 'service_desk_manager',
    name: 'Service Desk Manager',
    description: 'Manages tickets, time, contracts, billing and automation',
    permissions: MANAGER,
  },
  { key: 'technician', name: 'Technician', description: 'Works tickets, logs time, maintains CIs and knowledge', permissions: TECHNICIAN },
  { key: 'read_only', name: 'Read-only User', description: 'Can view operational data but not change it', permissions: READ_ONLY },
];

export function hasPermission(granted: readonly string[], required: Permission): boolean {
  return granted.includes('*') || granted.includes(required);
}
