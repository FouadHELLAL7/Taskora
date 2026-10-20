import { Link, useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CheckCircle2, Milestone } from 'lucide-react';
import { api, type Paginated } from '@/lib/api';
import { cn, fmtDate } from '@/lib/utils';
import { useTableState } from '@/hooks/use-table-state';
import { DataTable, type Column } from '@/components/data-table';
import { FilterSelect, ListLayout, PageHeader, SearchInput } from '@/components/page';
import { Badge, EmptyState } from '@/components/ui/misc';
import { Progress } from '@/components/charts';

interface Row {
  id: number;
  projectId: number;
  name: string;
  dueDate: string | null;
  isComplete: boolean;
  completedAt: string | null;
  projectName: string;
  projectNumber: string;
  companyName: string;
  taskCount: number;
  doneTaskCount: number;
}

export default function MilestonesPage() {
  const navigate = useNavigate();
  const t = useTableState({ filters: { status: 'open' } });
  const list = useQuery({ queryKey: ['milestones', t.query], queryFn: () => api.get<Paginated<Row>>('/project-milestones', t.query), placeholderData: keepPreviousData });
  const cols: Column<Row>[] = [
    {
      header: 'Milestone',
      cell: ({ row }) => (
        <span className="flex items-center gap-2 font-medium">
          {row.original.isComplete ? <CheckCircle2 className="size-4 text-success" /> : <Milestone className="size-4 text-muted" />}
          {row.original.name}
        </span>
      ),
    },
    {
      header: 'Project',
      cell: ({ row }) => (
        <Link to={`/projects/${row.original.projectId}`} onClick={(e) => e.stopPropagation()} className="hover:text-primary">
          {row.original.projectName} <span className="text-[11px] text-muted">{row.original.projectNumber}</span>
        </Link>
      ),
    },
    { header: 'Company', cell: ({ row }) => row.original.companyName },
    {
      header: 'Due',
      cell: ({ row }) => {
        const overdue = !row.original.isComplete && row.original.dueDate && new Date(row.original.dueDate) < new Date();
        return (
          <span className={cn(overdue ? 'font-semibold text-danger' : 'text-muted')}>
            {fmtDate(row.original.dueDate)} {overdue && <Badge tone="danger">Overdue</Badge>}
          </span>
        );
      },
    },
    {
      header: 'Tasks',
      cell: ({ row }) => (
        <div className="w-36">
          <div className="text-[11px] text-muted">
            {row.original.doneTaskCount}/{row.original.taskCount} done
          </div>
          <Progress value={row.original.taskCount ? (row.original.doneTaskCount / row.original.taskCount) * 100 : 0} tone="success" />
        </div>
      ),
    },
  ];
  return (
    <ListLayout
      header={<PageHeader title="Milestones" icon={<Milestone />} subtitle="Upcoming and overdue project milestones" />}
      toolbar={
        <>
          <SearchInput value={t.q} onChange={t.setQ} placeholder="Search milestones or projects…" />
          <FilterSelect
            value={t.filters.status}
            onChange={(v) => t.setFilter('status', v || 'all')}
            placeholder="All"
            options={[
              { value: 'open', label: 'Open' },
              { value: 'complete', label: 'Completed' },
            ]}
          />
        </>
      }
    >
      <DataTable className="h-full" columns={cols} data={list.data?.data} total={list.data?.total} page={t.page} pageSize={t.pageSize} loading={list.isLoading} onPageChange={t.setPage} onRowClick={(r) => navigate(`/projects/${r.projectId}`)} empty={<EmptyState icon={<Milestone />} title="No milestones" />} />
    </ListLayout>
  );
}
