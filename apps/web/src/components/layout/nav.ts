import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  Boxes,
  Briefcase,
  Building2,
  Calendar,
  CalendarClock,
  CalendarRange,
  ClipboardList,
  Clock,
  Cog,
  Contact,
  Cpu,
  CreditCard,
  FileClock,
  FileSignature,
  FileText,
  Flag,
  FolderKanban,
  Gauge,
  HardDrive,
  Inbox,
  KeyRound,
  Layers,
  LayoutDashboard,
  ListChecks,
  ListTodo,
  MapPin,
  Milestone,
  Package,
  PhoneCall,
  Repeat,
  Plug,
  Receipt,
  ScrollText,
  Settings2,
  ShieldCheck,
  Sparkles,
  Tags,
  Ticket,
  TrendingUp,
  UserRound,
  Users,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import type { Permission } from '@taskora/shared';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  perm?: Permission;
  /** Key in /tickets/counts used for a badge. */
  badge?: 'mine' | 'unassigned' | 'breached';
  end?: boolean;
}
export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    label: 'Workspace',
    items: [
      { label: 'Dashboard', to: '/', icon: LayoutDashboard, perm: 'dashboard.read', end: true },
      { label: 'My Work', to: '/my-work', icon: ListTodo },
      { label: 'Calendar', to: '/calendar', icon: Calendar },
      { label: 'Notifications', to: '/notifications', icon: Bell },
    ],
  },
  {
    label: 'Service Desk',
    items: [
      { label: 'All Tickets', to: '/tickets', icon: Ticket, perm: 'tickets.read', end: true },
      { label: 'My Tickets', to: '/tickets/mine', icon: Inbox, perm: 'tickets.read', badge: 'mine' },
      { label: 'Queues', to: '/tickets/queues', icon: Layers, perm: 'tickets.read' },
      { label: 'Unassigned Tickets', to: '/tickets/unassigned', icon: Flag, perm: 'tickets.read', badge: 'unassigned' },
      { label: 'Service Calls', to: '/service-calls', icon: PhoneCall, perm: 'tickets.read' },
      { label: 'Dispatch', to: '/dispatch', icon: CalendarRange, perm: 'tickets.read' },
      { label: 'SLA Monitor', to: '/sla-monitor', icon: Gauge, perm: 'tickets.read', badge: 'breached' },
      { label: 'Recurring Tickets', to: '/recurring-tickets', icon: Repeat, perm: 'tickets.read' },
    ],
  },
  {
    label: 'CRM',
    items: [
      { label: 'Companies', to: '/companies', icon: Building2, perm: 'companies.read' },
      { label: 'Contacts', to: '/contacts', icon: Contact, perm: 'companies.read' },
      { label: 'Locations', to: '/locations', icon: MapPin, perm: 'companies.read' },
      { label: 'Opportunities', to: '/opportunities', icon: TrendingUp, perm: 'opportunities.read' },
    ],
  },
  {
    label: 'Assets',
    items: [
      { label: 'Configuration Items', to: '/assets', icon: HardDrive, perm: 'cis.read', end: true },
      { label: 'Devices', to: '/assets/devices', icon: Cpu, perm: 'cis.read' },
      { label: 'Products', to: '/products', icon: Package, perm: 'cis.read' },
      { label: 'Asset Types', to: '/asset-types', icon: Boxes, perm: 'cis.read' },
      { label: 'Software', to: '/software', icon: Layers, perm: 'cis.read' },
      { label: 'Action1 Integration', to: '/integrations/action1/endpoints', icon: Plug, perm: 'integrations.read' },
    ],
  },
  {
    label: 'Business',
    items: [
      { label: 'Contracts', to: '/contracts', icon: FileSignature, perm: 'contracts.read' },
      { label: 'Time Entries', to: '/time', icon: Clock, perm: 'time.read' },
      { label: 'Billing', to: '/billing', icon: CreditCard, perm: 'billing.read' },
      { label: 'Invoices', to: '/invoices', icon: Receipt, perm: 'billing.read' },
      { label: 'Services', to: '/services', icon: Briefcase, perm: 'contracts.read' },
    ],
  },
  {
    label: 'Projects',
    items: [
      { label: 'Projects', to: '/projects', icon: FolderKanban, perm: 'projects.read' },
      { label: 'Tasks', to: '/tasks', icon: ListChecks, perm: 'projects.read' },
      { label: 'Milestones', to: '/milestones', icon: Milestone, perm: 'projects.read' },
    ],
  },
  {
    label: 'Knowledge',
    items: [
      { label: 'Knowledge Base', to: '/kb', icon: BookOpen, perm: 'kb.read' },
      { label: 'Documentation', to: '/documentation', icon: FileText, perm: 'kb.read' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { label: 'Reports', to: '/reports', icon: BarChart3, perm: 'reports.read' },
      { label: 'Analytics', to: '/analytics', icon: Activity, perm: 'reports.read' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { label: 'Users & Roles', to: '/admin/users', icon: Users, perm: 'users.manage' },
      { label: 'Ticket Settings', to: '/admin/ticket-settings', icon: ClipboardList, perm: 'settings.manage' },
      { label: 'Workflow Rules', to: '/admin/workflows', icon: Workflow, perm: 'automation.manage' },
      { label: 'Custom Fields', to: '/admin/custom-fields', icon: Tags, perm: 'settings.manage' },
      { label: 'Integrations', to: '/admin/integrations', icon: Plug, perm: 'integrations.read' },
      { label: 'System Settings', to: '/admin/system', icon: Settings2, perm: 'settings.manage' },
      { label: 'Audit Logs', to: '/admin/audit', icon: ScrollText, perm: 'audit.read' },
    ],
  },
];

// Re-exported so pages can reuse consistent icons.
export const ICONS = { Building2, Contact, HardDrive, Ticket, FileSignature, FolderKanban, BookOpen, Clock, UserRound, CalendarClock, FileClock, ShieldCheck, KeyRound, Sparkles, Cog };
