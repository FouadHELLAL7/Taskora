import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListChecks } from 'lucide-react';
import { TASK_STATUS } from '@taskora/shared';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLookups, userOpts } from '@/lib/lookups';
import { cn, fmtDate } from '@/lib/utils';
import { useTableState } from '@/hooks/use-table-state';
import { DataTable, type Column } from '@/components/data-table';
import { FilterSelect, ListLayout, PageHeader, SearchInput } from '@/components/page';
import { EmptyState } from '@/components/ui/misc';
import { handleFormError } from '@/components/form';

interface Row {
  id: number;
  title: string;
  status: string;
  projectId: number;
  projectName: string;
  projectNumber: string;
  companyName: string;
  assigneeName: string | null;
  milestoneName: string | null;
  dueDate: string | null;
  estimatedHours: number | null;
}

export default function TasksPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const lookups = useLookups();
  const t = useTableState({ filters: { assignedUserId: 'me', open: 'true' } });
  const list = useQuery({ queryKey: ['project-tasks', t.query], queryFn: () => api.get<Paginated<Row>>('/project-tasks', t.query), placeholderData: keepPreviousData });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => api.patch(`/project-tasks/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-tasks'] }),
    onError: (e) => handleFormError(e),
  });
  const cols: Column<Row>[] = [
    { header: 'Task', cell: ({ row }) => <div><div className="font-medium">{row.original.title}</div>{row.original.milestoneName && <div className="text-[11px] text-muted">{row.original.milestoneName}</div>}</div> },
    {
      header: 'Project',
      cell: ({ row }) => (
        <Link to={`/projects/${row.original.projectId}`} className="hover:text-primary">
          {row.original.projectName} <span className="text-[11px] text-muted">{row.original.companyName}</span>
        </Link>
      ),
    },
    { header: 'Assigned', cell: ({ row }) => row.original.assigneeName ?? <span className="text-subtle">Unassigned</span> },
    {
      header: 'Due',
      cell: ({ row }) => <span className={cn(row.original.dueDate && new Date(row.original.dueDate) < new Date() && row.original.status !== 'done' ? 'font-semibold text-danger' : 'text-muted')}>{fmtDate(row.original.dueDate)}</span>,
    },
    { header: 'Estimate', meta: { align: 'right' }, cell: ({ row }) => (row.original.estimatedHours ? `${row.original.estimatedHours} h` : '—') },
    {
      header: 'Status',
      cell: ({ row }) => (
        <select
          disabled={!can('projects.write')}
          value={row.original.status}
          onChange={(e) => setStatus.mutate({ id: row.original.id, status: e.target.value })}
          className="h-7 cursor-pointer rounded border border-border-strong bg-surface px-1.5 text-[12px]"
        >
          {TASK_STATUS.values.map((v) => (
            <option key={v} value={v}>
              {TASK_STATUS.labels[v]}
            </option>
          ))}
        </select>
      ),
    },
  ];
  return (
    <ListLayout
      header={<PageHeader title="Tasks" icon={<ListChecks />} subtitle="Project tasks across all projects" />}
      toolbar={
        <>
          <SearchInput value={t.q} onChange={t.setQ} placeholder="Search tasks or projects…" />
          <FilterSelect value={t.filters.assignedUserId} onChange={(v) => t.setFilter('assignedUserId', v || 'all')} placeholder="Anyone" options={[{ value: 'me', label: 'Assigned to me' }, ...userOpts(lookups.data?.users)]} />
          <FilterSelect value={t.filters.open} onChange={(v) => t.setFilter('open', v || 'false')} placeholder="All tasks" options={[{ value: 'true', label: 'Open tasks' }]} />
          <FilterSelect value={t.filters.status} onChange={(v) => t.setFilter('status', v)} placeholder="Any status" options={TASK_STATUS.values.map((v) => ({ value: v, label: TASK_STATUS.labels[v] }))} />
        </>
      }
    >
      <DataTable className="h-full" columns={cols} data={list.data?.data} total={list.data?.total} page={t.page} pageSize={t.pageSize} loading={list.isLoading} onPageChange={t.setPage} empty={<EmptyState icon={<ListChecks />} title="No tasks" />} />
    </ListLayout>
  );
}
