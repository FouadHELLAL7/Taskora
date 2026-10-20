import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FolderKanban, Plus } from 'lucide-react';
import { PROJECT_STATUS } from '@taskora/shared';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLookups, userOpts } from '@/lib/lookups';
import { fmtDate } from '@/lib/utils';
import { useTableState } from '@/hooks/use-table-state';
import { DataTable, type Column } from '@/components/data-table';
import { FilterSelect, ListLayout, PageHeader, SearchInput } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState } from '@/components/ui/misc';
import { Progress } from '@/components/charts';
import { EntityPicker } from '@/components/entity-picker';
import { ProjectDialog } from '@/components/projects/project-dialogs';

interface Row {
  id: number;
  projectNumber: string;
  name: string;
  status: string;
  companyId: number;
  companyName: string;
  managerName: string | null;
  startDate: string | null;
  endDate: string | null;
  estimatedHours: number | null;
  progress: number;
  actualMinutes: number;
  openTasks: number;
}

export const projectStatusTone = (s: string) => ({ planning: 'info', active: 'primary', on_hold: 'warning', completed: 'success', cancelled: 'neutral' })[s] as 'info' | 'primary' | 'warning' | 'success' | 'neutral';

export default function ProjectsPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const lookups = useLookups();
  const t = useTableState({ filters: { status: 'planning,active,on_hold' } });
  const [creating, setCreating] = useState(false);
  const list = useQuery({ queryKey: ['projects', t.query], queryFn: () => api.get<Paginated<Row>>('/projects', t.query), placeholderData: keepPreviousData });
  const cols: Column<Row>[] = [
    {
      header: 'Project',
      meta: { sortKey: 'name' },
      cell: ({ row }) => (
        <div>
          <Link to={`/projects/${row.original.id}`} className="font-medium hover:text-primary" onClick={(e) => e.stopPropagation()}>
            {row.original.name}
          </Link>
          <div className="text-[11px] text-muted">{row.original.projectNumber}</div>
        </div>
      ),
    },
    { header: 'Company', meta: { sortKey: 'company' }, cell: ({ row }) => <Link to={`/companies/${row.original.companyId}`} onClick={(e) => e.stopPropagation()} className="hover:text-primary">{row.original.companyName}</Link> },
    { header: 'Status', meta: { sortKey: 'status' }, cell: ({ row }) => <Badge tone={projectStatusTone(row.original.status)}>{PROJECT_STATUS.labels[row.original.status as keyof typeof PROJECT_STATUS.labels]}</Badge> },
    { header: 'Manager', cell: ({ row }) => row.original.managerName ?? '—' },
    { header: 'Timeline', meta: { sortKey: 'endDate' }, cell: ({ row }) => <span className="text-xs text-muted">{fmtDate(row.original.startDate, '?')} → {fmtDate(row.original.endDate, '?')}</span> },
    {
      header: 'Progress',
      cell: ({ row }) => (
        <div className="w-32">
          <div className="text-[11px] text-muted">
            {row.original.progress}% · {row.original.openTasks} open tasks
          </div>
          <Progress value={row.original.progress} tone="success" />
        </div>
      ),
    },
    {
      header: 'Hours',
      meta: { align: 'right' },
      cell: ({ row }) => {
        const actual = row.original.actualMinutes / 60;
        const over = row.original.estimatedHours && actual > row.original.estimatedHours;
        return <span className={over ? 'font-semibold text-danger' : ''}>{actual.toFixed(1)}{row.original.estimatedHours ? ` / ${row.original.estimatedHours}` : ''}</span>;
      },
    },
  ];
  return (
    <ListLayout
      header={
        <PageHeader
          title="Projects"
          icon={<FolderKanban />}
          subtitle="Client projects with milestones, tasks and tracked effort"
          actions={
            can('projects.write') && (
              <Button variant="primary" onClick={() => setCreating(true)}>
                <Plus /> New project
              </Button>
            )
          }
        />
      }
      toolbar={
        <>
          <SearchInput value={t.q} onChange={t.setQ} placeholder="Search projects…" />
          <FilterSelect
            value={t.filters.status}
            onChange={(v) => t.setFilter('status', v || 'planning,active,on_hold,completed,cancelled')}
            placeholder="Any status"
            options={[{ value: 'planning,active,on_hold', label: 'Open projects' }, ...PROJECT_STATUS.values.map((v) => ({ value: v, label: PROJECT_STATUS.labels[v] }))]}
          />
          <FilterSelect value={t.filters.managerId} onChange={(v) => t.setFilter('managerId', v)} placeholder="Any manager" options={userOpts(lookups.data?.users)} />
          <div className="w-52">
            <EntityPicker kind="company" value={t.filters.companyId ? Number(t.filters.companyId) : null} onChange={(id) => t.setFilter('companyId', id)} placeholder="Any company" />
          </div>
        </>
      }
    >
      <DataTable
        className="h-full"
        columns={cols}
        data={list.data?.data}
        total={list.data?.total}
        page={t.page}
        pageSize={t.pageSize}
        loading={list.isLoading}
        sort={t.sortState}
        onSortChange={t.setSort}
        onPageChange={t.setPage}
        onRowClick={(r) => navigate(`/projects/${r.id}`)}
        empty={<EmptyState icon={<FolderKanban />} title="No projects" />}
      />
      <ProjectDialog open={creating} onOpenChange={setCreating} onSaved={(p) => navigate(`/projects/${p.id}`)} />
    </ListLayout>
  );
}
