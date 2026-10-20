import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BarChart3, Download } from 'lucide-react';
import { api, downloadUrl } from '@/lib/api';
import { useLookups, userOpts } from '@/lib/lookups';
import { cn } from '@/lib/utils';
import { PageHeader, FilterSelect } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, EmptyState, Spinner } from '@/components/ui/misc';
import { BarList } from '@/components/charts';
import { EntityPicker } from '@/components/entity-picker';
import { DateRangeFilter, defaultRange, fmtNum, type DateRange } from '@/components/insights/filters';

const REPORTS = {
  tickets: {
    label: 'Tickets',
    path: '/reports/tickets',
    groups: { company: 'Company', queue: 'Queue', priority: 'Priority', status: 'Status', type: 'Ticket type', issue: 'Issue type', assignee: 'Technician', source: 'Source' },
    metric: 'created',
    description: 'Volume, backlog, resolution time and SLA breaches',
  },
  time: {
    label: 'Time & billing',
    path: '/reports/time',
    groups: { user: 'Technician', company: 'Company', workType: 'Work type', contract: 'Contract', project: 'Project', day: 'Day' },
    metric: 'hours',
    description: 'Hours logged, billable vs contract-covered, billable amount',
  },
  sla: {
    label: 'SLA compliance',
    path: '/reports/sla',
    groups: { priority: 'Priority', company: 'Company', sla: 'SLA policy', queue: 'Queue' },
    metric: 'resolutionCompliance',
    description: 'First response and resolution targets met',
  },
  assets: {
    label: 'Assets',
    path: '/reports/assets',
    groups: { type: 'CI type', company: 'Company', os: 'Operating system', lifecycle: 'Lifecycle', manufacturer: 'Manufacturer', source: 'Source' },
    metric: 'total',
    description: 'Configuration items, warranty and patch exposure',
  },
} as const;
type ReportKey = keyof typeof REPORTS;

const LABELS: Record<string, string> = {
  group: 'Group',
  created: 'Created',
  resolved: 'Resolved',
  open: 'Open now',
  avgResolutionHours: 'Avg resolution (h)',
  slaBreaches: 'SLA breaches',
  minutesWorked: 'Minutes worked',
  hours: 'Hours',
  billableHours: 'Billable h',
  contractHours: 'Contract h',
  nonBillableHours: 'Non-billable h',
  billableAmount: 'Billable amount',
  entries: 'Entries',
  tickets: 'Tickets',
  withFirstResponseTarget: 'With FR target',
  firstResponseMet: 'FR met',
  resolvedWithTarget: 'Resolved with target',
  resolutionMet: 'Resolution met',
  resolutionCompliance: 'Compliance %',
  total: 'Total',
  active: 'Active',
  warrantyExpired: 'Warranty expired',
  warrantyExpiring90d: 'Expiring ≤90 d',
  action1Managed: 'Action1 managed',
  needsPatching: 'Needs patching',
};

export default function ReportsPage() {
  const lookups = useLookups();
  const [report, setReport] = useState<ReportKey>('tickets');
  const [group, setGroup] = useState<string>('company');
  const [range, setRange] = useState<DateRange>(defaultRange());
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [userId, setUserId] = useState('');
  const [sort, setSort] = useState<{ key: string; desc: boolean } | null>(null);
  const def = REPORTS[report];
  const query = { group, from: range.from, to: range.to, companyId: companyId ?? undefined, userId: userId || undefined };
  const q = useQuery({
    queryKey: ['report', report, query],
    queryFn: () => api.get<{ data: Record<string, string | number>[] }>(def.path, query),
    placeholderData: keepPreviousData,
  });
  const rows = useMemo(() => {
    const data = [...(q.data?.data ?? [])];
    if (sort) data.sort((a, b) => (a[sort.key]! > b[sort.key]! ? 1 : -1) * (sort.desc ? -1 : 1));
    return data;
  }, [q.data, sort]);
  const cols = rows[0] ? Object.keys(rows[0]) : [];

  return (
    <div>
      <PageHeader
        title="Reports"
        icon={<BarChart3 />}
        subtitle="Operational and financial reports with CSV export"
        actions={
          <Button onClick={() => downloadUrl(def.path, { ...query, format: 'csv' })}>
            <Download /> Export CSV
          </Button>
        }
      >
        <div className="flex flex-wrap gap-1 pb-2">
          {(Object.keys(REPORTS) as ReportKey[]).map((k) => (
            <button
              key={k}
              onClick={() => {
                setReport(k);
                setGroup(Object.keys(REPORTS[k].groups)[0]!);
                setSort(null);
              }}
              className={cn('cursor-pointer rounded-md px-3 py-1.5 text-[13px]', report === k ? 'bg-primary-soft font-medium text-primary' : 'text-muted hover:bg-surface-2')}
            >
              {REPORTS[k].label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 pb-3">
          <FilterSelect value={group} onChange={(v) => v && setGroup(v)} placeholder="Group by" options={Object.entries(def.groups).map(([value, label]) => ({ value, label: `By ${label.toLowerCase()}` }))} />
          {report !== 'assets' && <DateRangeFilter value={range} onChange={setRange} />}
          <div className="w-52">
            <EntityPicker kind="company" value={companyId} onChange={setCompanyId} placeholder="All companies" />
          </div>
          {report !== 'assets' && <FilterSelect value={userId} onChange={setUserId} placeholder="All technicians" options={[{ value: 'me', label: 'Me' }, ...userOpts(lookups.data?.users)]} />}
          {q.isFetching && <Spinner />}
        </div>
      </PageHeader>
      <div className="grid gap-4 p-5 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader title={`${def.label} by ${(def.groups as Record<string, string>)[group]?.toLowerCase()}`} description={def.description} />
          {rows.length === 0 ? (
            <EmptyState title="No data for this selection" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr>
                    {cols.map((c) => (
                      <th
                        key={c}
                        onClick={() => setSort({ key: c, desc: sort?.key === c ? !sort.desc : true })}
                        className={cn('cursor-pointer whitespace-nowrap border-b border-border bg-surface-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted hover:text-foreground', c !== 'group' && 'text-right')}
                      >
                        {LABELS[c] ?? c}
                        {sort?.key === c ? (sort.desc ? ' ↓' : ' ↑') : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b border-border">
                      {cols.map((c) => (
                        <td key={c} className={cn('px-3 py-1.5', c === 'group' ? 'font-medium' : 'text-right tabular-nums')}>
                          {typeof r[c] === 'number' ? fmtNum(r[c] as number, Number.isInteger(r[c]) ? 0 : 2) : String(r[c] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card className="h-fit">
          <CardHeader title={LABELS[def.metric] ?? def.metric} description="Top 12" />
          <CardBody>
            <BarList data={rows.slice(0, 12).map((r) => ({ label: String(r.group), value: Number(r[def.metric] ?? 0) }))} format={(n) => fmtNum(n, Number.isInteger(n) ? 0 : 1)} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
