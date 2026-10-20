import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Link2, Plug, PlusCircle, RotateCcw, Settings, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { ENDPOINT_MATCH_STATUS } from '@taskora/shared';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDateTime, fmtRelative } from '@/lib/utils';
import { useTableState } from '@/hooks/use-table-state';
import { DataTable, type Column } from '@/components/data-table';
import { FilterSelect, ListLayout, PageHeader, SearchInput } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState } from '@/components/ui/misc';
import { Dialog, Tooltip } from '@/components/ui/overlays';
import { DeviceStateBadge } from '@/components/badges';
import { EntityPicker } from '@/components/entity-picker';
import { handleFormError } from '@/components/form';

interface Endpoint {
  id: number;
  externalId: string;
  orgName: string | null;
  companyId: number | null;
  companyName: string | null;
  configurationItemId: number | null;
  ciName: string | null;
  ciNumber: string | null;
  name: string | null;
  osName: string | null;
  serialNumber: string | null;
  loggedInUser: string | null;
  agentStatus: string | null;
  onlineStatus: string | null;
  lastSeenAt: string | null;
  rebootRequired: boolean | null;
  missingCriticalUpdates: number | null;
  missingOtherUpdates: number | null;
  matchStatus: string;
  matchNote: string | null;
  missingSince: string | null;
  previousNames: string[];
}

const TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  matched: 'success',
  created: 'success',
  unmatched: 'warning',
  conflict: 'danger',
  ignored: 'neutral',
  unmapped_org: 'info',
};

export default function Action1EndpointsPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const manage = can('integrations.manage');
  const t = useTableState({ sort: 'name', order: 'asc' });
  const [linking, setLinking] = useState<Endpoint | null>(null);
  const list = useQuery({ queryKey: ['action1-endpoints', t.query], queryFn: () => api.get<Paginated<Endpoint>>('/integrations/action1/endpoints', t.query), placeholderData: keepPreviousData });
  const resolve = useMutation({
    mutationFn: ({ id, action, configurationItemId }: { id: number; action: string; configurationItemId?: number | null }) =>
      api.post(`/integrations/action1/endpoints/${id}/resolve`, { action, configurationItemId }),
    onSuccess: (_r, v) => {
      toast.success({ link: 'Endpoint linked', create: 'Configuration item created', ignore: 'Endpoint ignored', unignore: 'Endpoint restored' }[v.action] ?? 'Done');
      setLinking(null);
      qc.invalidateQueries({ queryKey: ['action1-endpoints'] });
      qc.invalidateQueries({ queryKey: ['action1'] });
    },
    onError: (e) => handleFormError(e),
  });
  const sync = useMutation({
    mutationFn: () => api.post<{ queued?: boolean; reason?: string }>('/integrations/action1/sync'),
    onSuccess: (r) => (r.queued ? toast.success('Synchronisation queued') : toast.message(r.reason ?? 'Already queued')),
    onError: (e) => handleFormError(e),
  });

  const columns: Column<Endpoint>[] = [
    {
      header: 'Device',
      meta: { sortKey: 'name' },
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.name}</div>
          <div className="text-[11px] text-muted">
            {row.original.orgName}
            {row.original.previousNames?.length ? ` · was ${row.original.previousNames.join(', ')}` : ''}
          </div>
        </div>
      ),
    },
    { header: 'Company', meta: { sortKey: 'companyName' }, cell: ({ row }) => (row.original.companyId ? <Link to={`/companies/${row.original.companyId}`} className="hover:text-primary">{row.original.companyName}</Link> : <span className="text-subtle">Not mapped</span>) },
    { header: 'OS', cell: ({ row }) => <span className="text-muted">{row.original.osName ?? '—'}</span> },
    { header: 'Serial', cell: ({ row }) => <span className="font-mono text-[12px]">{row.original.serialNumber ?? '—'}</span> },
    { header: 'User', cell: ({ row }) => <span className="text-muted">{row.original.loggedInUser ?? '—'}</span> },
    {
      header: 'State',
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          <DeviceStateBadge agentStatus={row.original.agentStatus} onlineStatus={row.original.onlineStatus} />
          {row.original.rebootRequired && (
            <Badge tone="warning">
              <RotateCcw className="size-3" />
            </Badge>
          )}
          {!!row.original.missingCriticalUpdates && <Badge tone="danger">{row.original.missingCriticalUpdates} crit.</Badge>}
          {row.original.missingSince && <Badge tone="warning">Not reported</Badge>}
        </div>
      ),
    },
    { header: 'Last seen', meta: { sortKey: 'lastSeenAt' }, cell: ({ row }) => <span className="text-xs text-muted" title={fmtDateTime(row.original.lastSeenAt)}>{fmtRelative(row.original.lastSeenAt)}</span> },
    {
      header: 'Match',
      meta: { sortKey: 'matchStatus' },
      cell: ({ row }) => {
        const b = <Badge tone={TONE[row.original.matchStatus] ?? 'neutral'}>{ENDPOINT_MATCH_STATUS.labels[row.original.matchStatus as keyof typeof ENDPOINT_MATCH_STATUS.labels] ?? row.original.matchStatus}</Badge>;
        return row.original.matchNote ? <Tooltip content={row.original.matchNote}>{b}</Tooltip> : b;
      },
    },
    {
      header: 'Configuration item',
      cell: ({ row }) =>
        row.original.configurationItemId ? (
          <Link to={`/assets/${row.original.configurationItemId}`} className="hover:text-primary">
            {row.original.ciName} <span className="text-[11px] text-muted">{row.original.ciNumber}</span>
          </Link>
        ) : (
          <span className="text-subtle">—</span>
        ),
    },
    ...(manage
      ? [
          {
            id: 'actions',
            header: '',
            cell: ({ row }: { row: { original: Endpoint } }) => {
              const e = row.original;
              if (e.matchStatus === 'ignored')
                return (
                  <Button size="sm" variant="ghost" onClick={() => resolve.mutate({ id: e.id, action: 'unignore' })}>
                    <Undo2 /> Restore
                  </Button>
                );
              if (e.matchStatus === 'unmapped_org') return null;
              return (
                <div className="flex justify-end gap-1">
                  {!e.configurationItemId && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setLinking(e)}>
                        <Link2 /> Link
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => resolve.mutate({ id: e.id, action: 'create' })}>
                        <PlusCircle /> Create CI
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => resolve.mutate({ id: e.id, action: 'ignore' })}>
                    <Ban /> Ignore
                  </Button>
                </div>
              );
            },
          } as Column<Endpoint>,
        ]
      : []),
  ];

  return (
    <ListLayout
      header={
        <PageHeader
          title="Action1 endpoints"
          icon={<Plug />}
          subtitle="Devices reported by Action1 and how they map to configuration items"
          actions={
            <>
              <Link to="/admin/integrations">
                <Button>
                  <Settings /> Settings
                </Button>
              </Link>
              {manage && (
                <Button variant="primary" loading={sync.isPending} onClick={() => sync.mutate()}>
                  Sync now
                </Button>
              )}
            </>
          }
        />
      }
      toolbar={
        <>
          <SearchInput value={t.q} onChange={t.setQ} placeholder="Device, serial, user…" />
          <FilterSelect value={t.filters.matchStatus} onChange={(v) => t.setFilter('matchStatus', v)} placeholder="Any match state" options={ENDPOINT_MATCH_STATUS.values.map((v) => ({ value: v, label: ENDPOINT_MATCH_STATUS.labels[v] }))} />
          <FilterSelect value={t.filters.attention} onChange={(v) => t.setFilter('attention', v)} placeholder="Any health" options={[{ value: 'true', label: 'Needs attention' }]} />
          <FilterSelect value={t.filters.missing} onChange={(v) => t.setFilter('missing', v)} placeholder="Any presence" options={[{ value: 'true', label: 'Not reported in last sync' }]} />
          <div className="w-52">
            <EntityPicker kind="company" value={t.filters.companyId ? Number(t.filters.companyId) : null} onChange={(id) => t.setFilter('companyId', id)} placeholder="Any company" />
          </div>
        </>
      }
    >
      <DataTable
        className="h-full"
        columns={columns}
        data={list.data?.data}
        total={list.data?.total}
        page={t.page}
        pageSize={t.pageSize}
        loading={list.isLoading}
        sort={t.sortState}
        onSortChange={t.setSort}
        onPageChange={t.setPage}
        empty={<EmptyState icon={<Plug />} title="No endpoints" description="Configure the Action1 integration and run a synchronisation." />}
      />
      <LinkDialog endpoint={linking} onClose={() => setLinking(null)} onLink={(ciId) => linking && resolve.mutate({ id: linking.id, action: 'link', configurationItemId: ciId })} loading={resolve.isPending} />
    </ListLayout>
  );
}

function LinkDialog({ endpoint, onClose, onLink, loading }: { endpoint: Endpoint | null; onClose: () => void; onLink: (ciId: number) => void; loading: boolean }) {
  const [ci, setCi] = useState<number | null>(null);
  return (
    <Dialog
      open={!!endpoint}
      onOpenChange={(o) => !o && onClose()}
      title={`Link ${endpoint?.name ?? ''} to a configuration item`}
      description={`Only configuration items of ${endpoint?.companyName ?? 'the mapped company'} can be linked.`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!ci} loading={loading} onClick={() => ci && onLink(ci)}>
            Link
          </Button>
        </>
      }
    >
      {endpoint?.matchNote && <p className="mb-3 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">{endpoint.matchNote}</p>}
      <EntityPicker kind="ci" value={ci} onChange={setCi} filter={{ companyId: endpoint?.companyId ?? undefined }} placeholder="Search configuration items…" />
    </Dialog>
  );
}
