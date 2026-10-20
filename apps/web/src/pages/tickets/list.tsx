import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookmarkPlus, Download, Flag, Inbox, Plus, Star, Ticket, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, downloadUrl, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { opts, useLookups, userOpts } from '@/lib/lookups';
import { cn, fmtRelative } from '@/lib/utils';
import { useTableState } from '@/hooks/use-table-state';
import { DataTable, type Column } from '@/components/data-table';
import { FilterSelect, ListLayout, PageHeader, SearchInput } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Avatar, EmptyState } from '@/components/ui/misc';
import { Dialog, DropdownContent, DropdownItem, DropdownLabel, DropdownMenu, DropdownSeparator, DropdownTrigger } from '@/components/ui/overlays';
import { Checkbox, Input } from '@/components/ui/input';
import { PriorityBadge, SlaBadge, StatusBadge, type SlaState } from '@/components/badges';
import { EntityPicker } from '@/components/entity-picker';
import { handleFormError } from '@/components/form';

export interface TicketRow {
  id: number;
  ticketNumber: string;
  title: string;
  companyId: number;
  companyName: string;
  contactName: string | null;
  ciName: string | null;
  assignedUserId: number | null;
  assigneeName: string | null;
  queueName: string | null;
  statusName: string;
  statusColor: string;
  statusCategory: string;
  priorityName: string;
  priorityColor: string;
  priorityLevel: number;
  ticketTypeName: string | null;
  issueTypeName: string | null;
  tags: string[];
  dueAt: string | null;
  firstResponseDueAt: string | null;
  firstResponseAt: string | null;
  resolutionDueAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  lastActivityAt: string;
  minutesWorked: number;
  sla: { firstResponse: SlaState; resolution: SlaState; overall: SlaState };
}

export function slaDue(r: Pick<TicketRow, 'sla' | 'firstResponseAt' | 'firstResponseDueAt' | 'resolutionDueAt'>) {
  return !r.firstResponseAt && r.firstResponseDueAt && r.sla.firstResponse !== 'met' ? r.firstResponseDueAt : r.resolutionDueAt;
}

export const ticketColumns: Column<TicketRow>[] = [
  {
    header: 'Ticket',
    meta: { sortKey: 'ticketNumber', className: 'w-28' },
    cell: ({ row }) => <span className="font-mono text-[12px] text-muted">{row.original.ticketNumber}</span>,
  },
  {
    header: 'Title',
    meta: { sortKey: 'title', className: 'min-w-72' },
    cell: ({ row }) => (
      <div className="min-w-0">
        <Link to={`/tickets/${row.original.id}`} onClick={(e) => e.stopPropagation()} className="line-clamp-1 font-medium hover:text-primary">
          {row.original.title}
        </Link>
        <div className="truncate text-[11px] text-muted">
          {[row.original.issueTypeName, row.original.contactName, row.original.ciName].filter(Boolean).join(' · ') || row.original.ticketTypeName}
        </div>
      </div>
    ),
  },
  {
    header: 'Company',
    meta: { sortKey: 'company' },
    cell: ({ row }) => (
      <Link to={`/companies/${row.original.companyId}`} onClick={(e) => e.stopPropagation()} className="hover:text-primary">
        {row.original.companyName}
      </Link>
    ),
  },
  { header: 'Status', meta: { sortKey: 'status' }, cell: ({ row }) => <StatusBadge name={row.original.statusName} color={row.original.statusColor} /> },
  { header: 'Priority', meta: { sortKey: 'priority' }, cell: ({ row }) => <PriorityBadge name={row.original.priorityName} color={row.original.priorityColor} level={row.original.priorityLevel} /> },
  {
    header: 'Assigned',
    meta: { sortKey: 'assignee' },
    cell: ({ row }) =>
      row.original.assigneeName ? (
        <span className="inline-flex items-center gap-1.5">
          <Avatar name={row.original.assigneeName} className="size-5 text-[9px]" />
          <span className="truncate">{row.original.assigneeName}</span>
        </span>
      ) : (
        <span className="text-subtle">Unassigned</span>
      ),
  },
  { header: 'Queue', meta: { sortKey: 'queue' }, cell: ({ row }) => <span className="text-muted">{row.original.queueName ?? '—'}</span> },
  {
    header: 'SLA',
    meta: { sortKey: 'dueAt' },
    cell: ({ row }) => <SlaBadge state={row.original.sla.overall} due={['resolved', 'closed'].includes(row.original.statusCategory) ? null : slaDue(row.original)} />,
  },
  {
    header: 'Activity',
    meta: { sortKey: 'lastActivityAt' },
    cell: ({ row }) => <span className="whitespace-nowrap text-xs text-muted">{fmtRelative(row.original.lastActivityAt)}</span>,
  },
];

interface SavedView {
  id: number;
  name: string;
  filters: Record<string, string>;
  isShared: boolean;
  isOwner: boolean;
}

const PRESETS = {
  all: { title: 'All Tickets', icon: <Ticket />, filters: { statusCategory: 'open' } },
  mine: { title: 'My Tickets', icon: <Inbox />, filters: { statusCategory: 'open', assignedUserId: 'me' } },
  unassigned: { title: 'Unassigned Tickets', icon: <Flag />, filters: { statusCategory: 'open', assignedUserId: 'none' } },
};

export default function TicketListPage({ preset = 'all' }: { preset?: keyof typeof PRESETS }) {
  const p = PRESETS[preset];
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { can } = useAuth();
  const lookups = useLookups();
  const t = useTableState({ sort: 'lastActivityAt', order: 'desc', filters: p.filters });
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [saveOpen, setSaveOpen] = useState(false);
  const selectedIds = Object.keys(selection).filter((k) => selection[k]).map(Number);

  const query = useMemo(() => {
    const q: Record<string, unknown> = { ...t.query };
    // Preset filters cannot be removed on preset pages.
    if (preset !== 'all') Object.assign(q, { assignedUserId: (p.filters as Record<string, string>).assignedUserId });
    return q;
  }, [t.query, preset, p.filters]);

  const list = useQuery({
    queryKey: ['tickets', query],
    queryFn: () => api.get<Paginated<TicketRow>>('/tickets', query as never),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
  const views = useQuery({ queryKey: ['saved-views', 'tickets'], queryFn: () => api.get<{ data: SavedView[] }>('/saved-views', { entity: 'tickets' }) });

  const bulk = useMutation({
    mutationFn: (changes: Record<string, number | null>) => api.post<{ updated: number }>('/tickets/bulk', { ids: selectedIds, changes }),
    onSuccess: (r) => {
      toast.success(`${r.updated} ticket${r.updated === 1 ? '' : 's'} updated`);
      setSelection({});
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['ticket-counts'] });
    },
    onError: (e) => handleFormError(e),
  });

  const deleteView = useMutation({
    mutationFn: (id: number) => api.delete(`/saved-views/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-views'] }),
  });

  const L = lookups.data;
  const activeFilters = Object.entries(t.filters).filter(([k, v]) => v && !(preset !== 'all' && k === 'assignedUserId'));

  return (
    <ListLayout
      header={
        <PageHeader
          title={p.title}
          icon={p.icon}
          subtitle={list.data ? `${list.data.total} ticket${list.data.total === 1 ? '' : 's'}` : undefined}
          actions={
            <>
              <DropdownMenu>
                <DropdownTrigger asChild>
                  <Button>
                    <Star /> Views
                  </Button>
                </DropdownTrigger>
                <DropdownContent>
                  <DropdownLabel>Saved views</DropdownLabel>
                  {(views.data?.data ?? []).length === 0 && <div className="px-2 py-1.5 text-xs text-muted">No saved views yet</div>}
                  {views.data?.data.map((v) => (
                    <DropdownItem key={v.id} onSelect={() => navigate(`/tickets?${new URLSearchParams(v.filters).toString()}`)}>
                      <span className="flex-1">{v.name}</span>
                      {v.isShared && <span className="text-[10px] text-muted">shared</span>}
                      {v.isOwner && (
                        <span
                          role="button"
                          className="text-muted hover:text-danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            deleteView.mutate(v.id);
                          }}
                        >
                          <Trash2 />
                        </span>
                      )}
                    </DropdownItem>
                  ))}
                  <DropdownSeparator />
                  <DropdownItem onSelect={() => setSaveOpen(true)}>
                    <BookmarkPlus /> Save current filters…
                  </DropdownItem>
                </DropdownContent>
              </DropdownMenu>
              <Button onClick={() => downloadUrl('/tickets/export.csv', query as never)}>
                <Download /> Export
              </Button>
              {can('tickets.write') && (
                <Button variant="primary" onClick={() => navigate('/tickets/new')}>
                  <Plus /> New ticket
                </Button>
              )}
            </>
          }
        />
      }
      toolbar={
        selectedIds.length > 0 ? (
          <div className="flex w-full flex-wrap items-center gap-2">
            <span className="text-[13px] font-medium">{selectedIds.length} selected</span>
            <FilterSelect value="" placeholder="Set status…" options={opts(L?.statuses)} onChange={(v) => v && bulk.mutate({ statusId: Number(v) })} />
            <FilterSelect value="" placeholder="Set priority…" options={opts(L?.priorities)} onChange={(v) => v && bulk.mutate({ priorityId: Number(v) })} />
            <FilterSelect value="" placeholder="Set queue…" options={opts(L?.queues)} onChange={(v) => v && bulk.mutate({ queueId: Number(v) })} />
            <FilterSelect
              value=""
              placeholder="Assign to…"
              options={[{ value: 'none', label: 'Unassigned' }, ...userOpts(L?.users)]}
              onChange={(v) => v && bulk.mutate({ assignedUserId: v === 'none' ? null : Number(v) })}
            />
            <Button variant="ghost" size="sm" onClick={() => setSelection({})}>
              <X /> Clear selection
            </Button>
          </div>
        ) : (
          <>
            <SearchInput value={t.q} onChange={t.setQ} placeholder="Search number, title, company…" className="w-72" />
            <FilterSelect
              value={t.filters.statusCategory}
              onChange={(v) => t.setFilter('statusCategory', v || 'all')}
              placeholder="Any state"
              options={[
                { value: 'open', label: 'Open' },
                { value: 'new', label: 'New' },
                { value: 'waiting', label: 'Waiting' },
                { value: 'done', label: 'Resolved / closed' },
                { value: 'all', label: 'All tickets' },
              ]}
            />
            <FilterSelect value={t.filters.statusIds} onChange={(v) => t.setFilter('statusIds', v)} placeholder="Status" options={opts(L?.statuses)} />
            <FilterSelect value={t.filters.priorityIds} onChange={(v) => t.setFilter('priorityIds', v)} placeholder="Priority" options={opts(L?.priorities)} />
            <FilterSelect value={t.filters.queueIds} onChange={(v) => t.setFilter('queueIds', v)} placeholder="Queue" options={opts(L?.queues)} />
            {preset === 'all' && (
              <FilterSelect
                value={t.filters.assignedUserId}
                onChange={(v) => t.setFilter('assignedUserId', v)}
                placeholder="Assignee"
                options={[{ value: 'me', label: 'Me' }, { value: 'none', label: 'Unassigned' }, ...userOpts(L?.users)]}
              />
            )}
            <FilterSelect
              value={t.filters.slaState}
              onChange={(v) => t.setFilter('slaState', v)}
              placeholder="SLA"
              options={[
                { value: 'breached', label: 'Breached' },
                { value: 'at_risk', label: 'At risk' },
              ]}
            />
            <div className="w-48">
              <EntityPicker kind="company" value={t.filters.companyId ? Number(t.filters.companyId) : null} onChange={(id) => t.setFilter('companyId', id)} placeholder="Any company" />
            </div>
            {activeFilters.length > 1 && (
              <Button variant="ghost" size="sm" onClick={() => t.setFilters(Object.fromEntries(Object.keys(t.filters).map((k) => [k, k === 'statusCategory' ? 'open' : null])))}>
                Reset
              </Button>
            )}
          </>
        )
      }
    >
      <DataTable
        className="h-full"
        columns={ticketColumns}
        data={list.data?.data}
        total={list.data?.total}
        page={t.page}
        pageSize={t.pageSize}
        loading={list.isLoading}
        sort={t.sortState}
        onSortChange={t.setSort}
        onPageChange={t.setPage}
        onRowClick={(r, e) => (e.ctrlKey || e.metaKey ? window.open(`/tickets/${r.id}`, '_blank') : navigate(`/tickets/${r.id}`))}
        selectable={can('tickets.bulk')}
        selection={selection}
        onSelectionChange={setSelection}
        getRowId={(r) => String(r.id)}
        rowClassName={(r) => cn(r.sla.overall === 'breached' && !['resolved', 'closed'].includes(r.statusCategory) && 'shadow-[inset_3px_0_0_var(--danger)]')}
        empty={<EmptyState icon={<Ticket />} title="No tickets match these filters" description="Adjust or reset the filters to see more tickets." />}
      />
      <SaveViewDialog open={saveOpen} onOpenChange={setSaveOpen} filters={{ ...t.filters, ...(t.q ? { q: t.q } : {}) }} />
    </ListLayout>
  );
}

function SaveViewDialog({ open, onOpenChange, filters }: { open: boolean; onOpenChange: (o: boolean) => void; filters: Record<string, string> }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const save = useMutation({
    mutationFn: () => api.post('/saved-views', { name, entity: 'tickets', filters, isShared: shared }),
    onSuccess: () => {
      toast.success('View saved');
      qc.invalidateQueries({ queryKey: ['saved-views'] });
      onOpenChange(false);
      setName('');
    },
    onError: (e) => handleFormError(e),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Save view"
      size="sm"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" disabled={!name.trim()} loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Critical tickets in Level 2" />
        <Checkbox label="Share with the team" checked={shared} onChange={(e) => setShared(e.target.checked)} />
        <p className="text-xs text-muted">Saves the current filters: {Object.entries(filters).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'}</p>
      </div>
    </Dialog>
  );
}
