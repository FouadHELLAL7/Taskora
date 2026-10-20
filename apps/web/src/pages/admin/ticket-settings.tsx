import { useMemo, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { STATUS_CATEGORY } from '@taskora/shared';
import { useAuth } from '@/lib/auth';
import { byId, opts, useLookups, userOpts, type IssueType, type Named, type Priority, type Status, type SubIssueType } from '@/lib/lookups';
import type { Column } from '@/components/data-table';
import { PageBody, PageHeader } from '@/components/page';
import { Badge } from '@/components/ui/misc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/overlays';
import { ActiveBadge } from '@/components/badges';
import { ColorSwatch, SettingsTable, YesNo, type SettingsField } from '@/components/admin/settings-table';
import { useTabParam } from '@/components/admin/tabs';

interface NamedRow extends Named {
  description: string | null;
  isActive: boolean;
  sortOrder: number;
}
interface StatusRow extends Status {
  isSystem: boolean;
  sortOrder: number;
}
interface PriorityRow extends Priority {
  sortOrder: number;
}
interface QueueRow extends NamedRow {
  email: string | null;
  defaultAssigneeId: number | null;
}
interface IssueTypeRow extends NamedRow, Omit<IssueType, 'isActive' | 'sortOrder'> {}
interface SubIssueTypeRow extends NamedRow, Omit<SubIssueType, 'isActive' | 'sortOrder'> {}
interface TemplateRow {
  id: number;
  name: string;
  title: string | null;
  description: string | null;
  queueId: number | null;
  ticketTypeId: number | null;
  issueTypeId: number | null;
  subIssueTypeId: number | null;
  priorityId: number | null;
  sourceId: number | null;
  estimatedHours: number | null;
  isActive: boolean;
}

const nameField: SettingsField = { name: 'name', label: 'Name', type: 'text', required: true };
const descriptionField: SettingsField = { name: 'description', label: 'Description', type: 'textarea', rows: 2 };
const sortField: SettingsField = { name: 'sortOrder', label: 'Sort order', type: 'number', hint: 'Lower numbers are listed first' };
const activeField: SettingsField = { name: 'isActive', label: 'Active', type: 'checkbox', hint: 'Inactive values are hidden from pickers' };
const namedDefaults = { name: '', description: '', isActive: true, sortOrder: 0 };

function sortCol<T extends { sortOrder: number }>(): Column<T> {
  return { header: 'Order', meta: { align: 'right', className: 'w-16' }, cell: ({ row }) => <span className="text-muted">{row.original.sortOrder}</span> };
}
function activeCol<T extends { isActive?: boolean }>(): Column<T> {
  return { header: 'Status', meta: { className: 'w-24' }, cell: ({ row }) => <ActiveBadge active={row.original.isActive !== false} /> };
}
function nameCol<T extends { name: string; description?: string | null }>(): Column<T> {
  return {
    header: 'Name',
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="font-medium">{row.original.name}</div>
        {row.original.description && <div className="truncate text-xs text-muted">{row.original.description}</div>}
      </div>
    ),
  };
}

export default function TicketSettingsPage() {
  const { can } = useAuth();
  const canWrite = can('settings.manage');
  const [tab, setTab] = useTabParam('statuses');
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <PageHeader title="Ticket Settings" subtitle="Statuses, priorities, classification, queues and templates used by the service desk" icon={<ClipboardList />}>
        <TabsList className="-mx-1 border-b-0">
          <TabsTrigger value="statuses">Statuses</TabsTrigger>
          <TabsTrigger value="priorities">Priorities</TabsTrigger>
          <TabsTrigger value="types">Ticket types</TabsTrigger>
          <TabsTrigger value="issues">Issue types</TabsTrigger>
          <TabsTrigger value="queues">Queues</TabsTrigger>
          <TabsTrigger value="sources">Sources</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>
      </PageHeader>
      <PageBody>
        <TabsContent value="statuses">
          <StatusesTab canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="priorities">
          <PrioritiesTab canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="types">
          <SimpleNamedTab
            canWrite={canWrite}
            endpoint="/settings/ticket-types"
            title="Ticket types"
            entityLabel="ticket type"
            description="High-level ticket classification (incident, service request, problem, change…)"
          />
        </TabsContent>
        <TabsContent value="issues">
          <IssueTypesTab canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="queues">
          <QueuesTab canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="sources">
          <SimpleNamedTab canWrite={canWrite} endpoint="/settings/ticket-sources" title="Sources" entityLabel="source" description="How tickets reach the service desk (phone, e-mail, portal, monitoring…)" />
        </TabsContent>
        <TabsContent value="templates">
          <TemplatesTab canWrite={can('tickets.write')} />
        </TabsContent>
      </PageBody>
    </Tabs>
  );
}

/* ---------------------------------------------------------------- statuses */

function StatusesTab({ canWrite }: { canWrite: boolean }) {
  const columns = useMemo<Column<StatusRow>[]>(
    () => [
      sortCol<StatusRow>(),
      {
        header: 'Name',
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-2">
            <ColorSwatch color={row.original.color} name={<span className="font-medium">{row.original.name}</span>} />
            {row.original.isSystem && <Badge>System</Badge>}
            {row.original.isDefault && <Badge tone="primary">Default</Badge>}
          </span>
        ),
      },
      { header: 'Category', cell: ({ row }) => <Badge>{STATUS_CATEGORY.labels[row.original.category] ?? row.original.category}</Badge> },
      { header: 'Pauses SLA', cell: ({ row }) => <YesNo value={row.original.pausesSla} /> },
      activeCol<StatusRow>(),
    ],
    [],
  );
  const fields: SettingsField<StatusRow>[] = [
    nameField,
    { name: 'category', label: 'Category', type: 'select', required: true, options: STATUS_CATEGORY.values.map((v) => ({ value: v, label: STATUS_CATEGORY.labels[v] })), hint: 'Drives behaviour: resolved/closed stop the SLA clock' },
    { name: 'color', label: 'Colour', type: 'color' },
    sortField,
    { name: 'pausesSla', label: 'Pauses SLA', type: 'checkbox', hint: 'Resolution clock stops while in this status' },
    { name: 'isDefault', label: 'Default for new tickets', type: 'checkbox' },
    activeField,
  ];
  return (
    <SettingsTable<StatusRow>
      title="Ticket statuses"
      description="Every status maps to a category that drives SLA and reporting behaviour. System statuses cannot be deleted."
      entityLabel="status"
      endpoint="/settings/ticket-statuses"
      columns={columns}
      fields={fields}
      defaults={{ name: '', category: 'open', color: '#64748b', pausesSla: false, isDefault: false, isActive: true, sortOrder: 0 }}
      canWrite={canWrite}
      canDelete={(r) => !r.isSystem}
      emptyText="No statuses defined yet."
    />
  );
}

/* -------------------------------------------------------------- priorities */

function PrioritiesTab({ canWrite }: { canWrite: boolean }) {
  const columns = useMemo<Column<PriorityRow>[]>(
    () => [
      sortCol<PriorityRow>(),
      {
        header: 'Name',
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-2">
            <ColorSwatch color={row.original.color} name={<span className="font-medium">{row.original.name}</span>} />
            {row.original.isDefault && <Badge tone="primary">Default</Badge>}
          </span>
        ),
      },
      { header: 'Level', meta: { align: 'right', className: 'w-20' }, cell: ({ row }) => row.original.level },
      activeCol<PriorityRow>(),
    ],
    [],
  );
  const fields: SettingsField<PriorityRow>[] = [
    nameField,
    { name: 'level', label: 'Level', type: 'number', required: true, min: 1, max: 10, hint: '1 = most urgent' },
    { name: 'color', label: 'Colour', type: 'color' },
    sortField,
    { name: 'isDefault', label: 'Default for new tickets', type: 'checkbox' },
    activeField,
  ];
  return (
    <SettingsTable<PriorityRow>
      title="Priorities"
      description="SLA targets are defined per priority (System Settings → SLA policies)."
      entityLabel="priority"
      endpoint="/settings/priorities"
      columns={columns}
      fields={fields}
      defaults={{ name: '', level: 3, color: '#64748b', isDefault: false, isActive: true, sortOrder: 0 }}
      canWrite={canWrite}
      rowLabel={(r) => r.name}
    />
  );
}

/* -------------------------------------------------- simple named settings */

function SimpleNamedTab({ canWrite, endpoint, title, entityLabel, description }: { canWrite: boolean; endpoint: string; title: string; entityLabel: string; description: string }) {
  const columns = useMemo<Column<NamedRow>[]>(() => [sortCol<NamedRow>(), nameCol<NamedRow>(), activeCol<NamedRow>()], []);
  return (
    <SettingsTable<NamedRow>
      title={title}
      description={description}
      entityLabel={entityLabel}
      endpoint={endpoint}
      columns={columns}
      fields={[nameField, sortField, descriptionField, activeField]}
      defaults={namedDefaults}
      canWrite={canWrite}
    />
  );
}

/* ------------------------------------------------------------------ queues */

function QueuesTab({ canWrite }: { canWrite: boolean }) {
  const lookups = useLookups();
  const users = lookups.data?.users;
  const columns = useMemo<Column<QueueRow>[]>(
    () => [
      sortCol<QueueRow>(),
      nameCol<QueueRow>(),
      { header: 'E-mail', cell: ({ row }) => row.original.email ?? <span className="text-subtle">—</span> },
      {
        header: 'Default assignee',
        cell: ({ row }) => {
          const u = byId(users, row.original.defaultAssigneeId);
          return u ? `${u.firstName} ${u.lastName}` : <span className="text-subtle">—</span>;
        },
      },
      activeCol<QueueRow>(),
    ],
    [users],
  );
  const fields: SettingsField<QueueRow>[] = [
    nameField,
    { name: 'email', label: 'Queue e-mail', type: 'email', placeholder: 'support@example.com' },
    { name: 'defaultAssigneeId', label: 'Default assignee', type: 'select', numeric: true, placeholder: 'Nobody', options: (_v, row) => userOpts(users, row?.defaultAssigneeId), hint: 'Notified about SLA events of unassigned tickets' },
    sortField,
    descriptionField,
    activeField,
  ];
  return (
    <SettingsTable<QueueRow>
      title="Queues"
      description="Work queues tickets are routed to."
      entityLabel="queue"
      endpoint="/settings/queues"
      columns={columns}
      fields={fields}
      defaults={{ ...namedDefaults, email: '', defaultAssigneeId: null }}
      canWrite={canWrite}
    />
  );
}

/* ------------------------------------------------ issue + sub-issue types */

function IssueTypesTab({ canWrite }: { canWrite: boolean }) {
  const lookups = useLookups();
  const ticketTypes = lookups.data?.ticketTypes;
  const queues = lookups.data?.queues;
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = byId(lookups.data?.issueTypes, selectedId);

  const issueColumns = useMemo<Column<IssueTypeRow>[]>(
    () => [
      sortCol<IssueTypeRow>(),
      nameCol<IssueTypeRow>(),
      {
        header: 'Ticket type',
        cell: ({ row }) => byId(ticketTypes, row.original.ticketTypeId)?.name ?? <span className="text-subtle">Any</span>,
      },
      {
        header: 'Sub-issues',
        meta: { align: 'right' },
        cell: ({ row }) => (lookups.data?.subIssueTypes ?? []).filter((s) => s.issueTypeId === row.original.id).length,
      },
      activeCol<IssueTypeRow>(),
    ],
    [ticketTypes, lookups.data?.subIssueTypes],
  );
  const subColumns = useMemo<Column<SubIssueTypeRow>[]>(
    () => [
      sortCol<SubIssueTypeRow>(),
      nameCol<SubIssueTypeRow>(),
      { header: 'Routes to queue', cell: ({ row }) => byId(queues, row.original.queueId)?.name ?? <span className="text-subtle">—</span> },
      activeCol<SubIssueTypeRow>(),
    ],
    [queues],
  );

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <SettingsTable<IssueTypeRow>
        title="Issue types"
        description="Select an issue type to manage its sub-issue types."
        entityLabel="issue type"
        endpoint="/settings/issue-types"
        columns={issueColumns}
        fields={[
          nameField,
          { name: 'ticketTypeId', label: 'Restrict to ticket type', type: 'select', numeric: true, placeholder: 'Any ticket type', options: (_v, row) => opts(ticketTypes, row?.ticketTypeId) },
          sortField,
          descriptionField,
          activeField,
        ]}
        defaults={{ ...namedDefaults, ticketTypeId: null }}
        canWrite={canWrite}
        onSelect={(r) => setSelectedId(r.id)}
        selectedId={selectedId}
      />
      {selected ? (
        <SettingsTable<SubIssueTypeRow>
          key={selected.id}
          title={`Sub-issue types of “${selected.name}”`}
          description="Optionally route tickets of a sub-issue type to a queue."
          entityLabel="sub-issue type"
          endpoint="/settings/sub-issue-types"
          params={{ issueTypeId: selected.id }}
          columns={subColumns}
          fields={[
            nameField,
            { name: 'queueId', label: 'Route to queue', type: 'select', numeric: true, placeholder: 'No routing', options: (_v, row) => opts(queues, row?.queueId) },
            sortField,
            descriptionField,
            activeField,
          ]}
          defaults={{ ...namedDefaults, queueId: null }}
          canWrite={canWrite}
          emptyText="No sub-issue types for this issue type yet."
        />
      ) : (
        <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-border-strong bg-surface p-6 text-center text-[13px] text-muted">
          Select an issue type on the left to view and manage its sub-issue types.
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- templates */

function TemplatesTab({ canWrite }: { canWrite: boolean }) {
  const lookups = useLookups();
  const l = lookups.data;
  const columns = useMemo<Column<TemplateRow>[]>(
    () => [
      {
        header: 'Template',
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="font-medium">{row.original.name}</div>
            {row.original.title && <div className="truncate text-xs text-muted">Title: {row.original.title}</div>}
          </div>
        ),
      },
      { header: 'Queue', cell: ({ row }) => byId(l?.queues, row.original.queueId)?.name ?? <span className="text-subtle">—</span> },
      { header: 'Type', cell: ({ row }) => byId(l?.ticketTypes, row.original.ticketTypeId)?.name ?? <span className="text-subtle">—</span> },
      {
        header: 'Issue',
        cell: ({ row }) => {
          const issue = byId(l?.issueTypes, row.original.issueTypeId)?.name;
          const sub = byId(l?.subIssueTypes, row.original.subIssueTypeId)?.name;
          return issue ? [issue, sub].filter(Boolean).join(' › ') : <span className="text-subtle">—</span>;
        },
      },
      { header: 'Priority', cell: ({ row }) => byId(l?.priorities, row.original.priorityId)?.name ?? <span className="text-subtle">—</span> },
      { header: 'Est. hours', meta: { align: 'right' }, cell: ({ row }) => row.original.estimatedHours ?? <span className="text-subtle">—</span> },
      activeCol<TemplateRow>(),
    ],
    [l],
  );
  const fields: SettingsField<TemplateRow>[] = [
    { name: 'name', label: 'Template name', type: 'text', required: true },
    { name: 'title', label: 'Ticket title', type: 'text', placeholder: 'Pre-filled ticket title' },
    { name: 'description', label: 'Ticket description', type: 'textarea', rows: 5 },
    { name: 'queueId', label: 'Queue', type: 'select', numeric: true, options: (_v, r) => opts(l?.queues, r?.queueId) },
    { name: 'priorityId', label: 'Priority', type: 'select', numeric: true, options: (_v, r) => opts(l?.priorities, r?.priorityId) },
    {
      name: 'ticketTypeId',
      label: 'Ticket type',
      type: 'select',
      numeric: true,
      options: (_v, r) => opts(l?.ticketTypes, r?.ticketTypeId),
      resets: ['issueTypeId', 'subIssueTypeId'],
    },
    { name: 'sourceId', label: 'Source', type: 'select', numeric: true, options: (_v, r) => opts(l?.sources, r?.sourceId) },
    {
      name: 'issueTypeId',
      label: 'Issue type',
      type: 'select',
      numeric: true,
      resets: ['subIssueTypeId'],
      options: (v, r) => {
        const tt = v.ticketTypeId ? Number(v.ticketTypeId) : null;
        return opts(
          (l?.issueTypes ?? []).filter((i) => !i.ticketTypeId || !tt || i.ticketTypeId === tt),
          r?.issueTypeId,
        );
      },
    },
    {
      name: 'subIssueTypeId',
      label: 'Sub-issue type',
      type: 'select',
      numeric: true,
      placeholder: '—',
      options: (v, r) => {
        const it = v.issueTypeId ? Number(v.issueTypeId) : null;
        return it ? opts((l?.subIssueTypes ?? []).filter((s) => s.issueTypeId === it), r?.subIssueTypeId) : [];
      },
      hint: 'Choose an issue type first',
    },
    { name: 'estimatedHours', label: 'Estimated hours', type: 'number', step: 0.25, min: 0 },
    { name: 'isActive', label: 'Active', type: 'checkbox' },
  ];
  return (
    <SettingsTable<TemplateRow>
      title="Ticket templates"
      description="Pre-filled values offered when creating a ticket."
      entityLabel="template"
      endpoint="/settings/ticket-templates"
      columns={columns}
      fields={fields}
      defaults={{ name: '', title: '', description: '', queueId: null, ticketTypeId: null, issueTypeId: null, subIssueTypeId: null, priorityId: null, sourceId: null, estimatedHours: null, isActive: true }}
      canWrite={canWrite}
      dialogSize="lg"
      invalidate={[['ticket-templates']]}
    />
  );
}
