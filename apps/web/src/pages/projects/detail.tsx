import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle, Clock, FolderKanban, Milestone, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatMinutes, formatMoney, PROJECT_STATUS, TASK_STATUS } from '@taskora/shared';
import { api, type Paginated } from '@/lib/api';
import { useAuth, useMe } from '@/lib/auth';
import { cn, fmtDate } from '@/lib/utils';
import { PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Avatar, Badge, Card, CardBody, CardHeader, EmptyState, Field, PageLoader, Stat } from '@/components/ui/misc';
import { ConfirmDialog, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/overlays';
import { Progress } from '@/components/charts';
import { RelatedTickets } from '@/components/related-tables';
import { DataTable, type Column } from '@/components/data-table';
import { LogTimeDialog } from '@/components/tickets/log-time-dialog';
import { MilestoneDialog, ProjectDialog, TaskDialog, type ProjectRecord, type TaskRecord } from '@/components/projects/project-dialogs';
import { Attachments } from '@/pages/tickets/detail';
import { handleFormError } from '@/components/form';
import { projectStatusTone } from './list';

interface Task extends TaskRecord {
  assigneeName: string | null;
  actualMinutes: number;
  completedAt: string | null;
}
interface MilestoneRow {
  id: number;
  name: string;
  dueDate: string | null;
  description: string | null;
  isComplete: boolean;
}
interface Project extends ProjectRecord {
  projectNumber: string;
  companyName: string;
  contractName: string | null;
  managerName: string | null;
  progress: number;
  actualMinutes: number;
  milestones: MilestoneRow[];
  tasks: Task[];
}

const COLUMNS = ['todo', 'in_progress', 'blocked', 'done'] as const;

export default function ProjectDetailPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { can } = useAuth();
  const write = can('projects.write');
  const q = useQuery({ queryKey: ['project', id], queryFn: () => api.get<Project>(`/projects/${id}`) });
  const [editing, setEditing] = useState(false);
  const [task, setTask] = useState<Task | null | 'new'>(null);
  const [milestone, setMilestone] = useState<MilestoneRow | null | 'new'>(null);
  const [timeFor, setTimeFor] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const moveTask = useMutation({
    mutationFn: ({ taskId, status }: { taskId: number; status: string }) => api.patch(`/project-tasks/${taskId}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', id] }),
  });
  const toggleMilestone = useMutation({
    mutationFn: (m: MilestoneRow) => api.patch(`/projects/${id}/milestones/${m.id}`, { isComplete: !m.isComplete }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', id] }),
  });
  const removeTask = useMutation({
    mutationFn: (taskId: number) => api.delete(`/project-tasks/${taskId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', id] }),
    onError: (e) => handleFormError(e),
  });
  const removeMilestone = useMutation({
    mutationFn: (mid: number) => api.delete(`/projects/${id}/milestones/${mid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', id] }),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/projects/${id}`),
    onSuccess: () => {
      toast.success('Project deleted');
      navigate('/projects');
    },
    onError: (e) => handleFormError(e),
  });

  if (q.isLoading) return <PageLoader />;
  if (!q.data) return <EmptyState title="Project not found" />;
  const p = q.data;
  const actualH = p.actualMinutes / 60;
  const est = p.estimatedHours ?? 0;

  return (
    <div>
      <PageHeader
        title={p.name}
        icon={<FolderKanban />}
        breadcrumbs={[{ label: 'Projects', to: '/projects' }, { label: p.companyName, to: `/companies/${p.companyId}` }, { label: p.projectNumber }]}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={projectStatusTone(p.status)}>{PROJECT_STATUS.labels[p.status as keyof typeof PROJECT_STATUS.labels]}</Badge>
            <span>{p.projectNumber}</span>
            {p.managerName && <span>· Managed by {p.managerName}</span>}
            {p.contractId && (
              <span>
                · Contract{' '}
                <Link to={`/contracts/${p.contractId}`} className="text-primary hover:underline">
                  {p.contractName}
                </Link>
              </span>
            )}
          </span>
        }
        actions={
          write && (
            <>
              <Button variant="primary" onClick={() => setTask('new')}>
                <Plus /> Task
              </Button>
              <Button onClick={() => setEditing(true)}>
                <Pencil /> Edit
              </Button>
              <Button variant="ghost" onClick={() => setDeleting(true)} aria-label="Delete project">
                <Trash2 />
              </Button>
            </>
          )
        }
      />
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Progress" value={`${p.progress}%`} hint={`${p.tasks.filter((t) => t.status === 'done').length} of ${p.tasks.length} tasks done`} />
          <Stat label="Hours logged" value={actualH.toFixed(1)} hint={est ? `of ${est} h estimated` : 'No estimate'} tone={est && actualH > est ? 'danger' : undefined} />
          <Stat label="Budget" value={p.budget ? formatMoney(p.budget) : '—'} />
          <Stat label="Start" value={fmtDate(p.startDate)} />
          <Stat label="Target end" value={fmtDate(p.endDate)} tone={p.endDate && new Date(p.endDate) < new Date() && p.status !== 'completed' ? 'danger' : undefined} />
        </div>
        {est > 0 && <Progress value={(actualH / est) * 100} tone={actualH > est ? 'danger' : 'primary'} />}

        <Tabs defaultValue="board">
          <TabsList>
            <TabsTrigger value="board" count={p.tasks.length}>
              Tasks
            </TabsTrigger>
            <TabsTrigger value="milestones" count={p.milestones.length}>
              Milestones
            </TabsTrigger>
            <TabsTrigger value="time">Time</TabsTrigger>
            <TabsTrigger value="tickets">Tickets</TabsTrigger>
            <TabsTrigger value="overview">Overview & files</TabsTrigger>
          </TabsList>
          <TabsContent value="board" className="mt-4">
            <div className="grid gap-3 lg:grid-cols-4">
              {COLUMNS.map((col) => {
                const tasks = p.tasks.filter((t) => t.status === col);
                return (
                  <div
                    key={col}
                    className="rounded-lg border border-border bg-surface-2/60 p-2"
                    onDragOver={(e) => write && e.preventDefault()}
                    onDrop={(e) => {
                      const taskId = Number(e.dataTransfer.getData('text/task'));
                      if (taskId) moveTask.mutate({ taskId, status: col });
                    }}
                  >
                    <div className="mb-2 flex items-center justify-between px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                      {TASK_STATUS.labels[col]} <span>{tasks.length}</span>
                    </div>
                    <div className="space-y-2">
                      {tasks.map((t) => (
                        <div
                          key={t.id}
                          draggable={write}
                          onDragStart={(e) => e.dataTransfer.setData('text/task', String(t.id))}
                          className="cursor-grab rounded-md border border-border bg-surface p-2.5 shadow-card"
                        >
                          <button className="w-full cursor-pointer text-left text-[13px] font-medium hover:text-primary" onClick={() => write && setTask(t)}>
                            {t.title}
                          </button>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                            {t.milestoneId && (
                              <Badge>
                                <Milestone className="size-3" /> {p.milestones.find((m) => m.id === t.milestoneId)?.name}
                              </Badge>
                            )}
                            {t.dueDate && <span className={cn(new Date(t.dueDate) < new Date() && t.status !== 'done' && 'text-danger')}>due {fmtDate(t.dueDate)}</span>}
                            <span>
                              {formatMinutes(t.actualMinutes)}
                              {t.estimatedHours ? ` / ${t.estimatedHours}h` : ''}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center gap-1">
                            {t.assigneeName ? <Avatar name={t.assigneeName} className="size-5 text-[9px]" /> : <span className="text-[11px] text-subtle">Unassigned</span>}
                            {can('time.write') && (
                              <Button size="icon-sm" variant="ghost" className="ml-auto" onClick={() => setTimeFor(t.id)} aria-label="Log time">
                                <Clock />
                              </Button>
                            )}
                            {write && (
                              <Button size="icon-sm" variant="ghost" onClick={() => confirm(`Delete "${t.title}"?`) && removeTask.mutate(t.id)} aria-label="Delete task">
                                <Trash2 />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                      {tasks.length === 0 && <p className="px-1 py-3 text-center text-[11px] text-subtle">{write ? 'Drop tasks here' : 'Empty'}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>
          <TabsContent value="milestones" className="mt-4">
            <Card>
              <CardHeader
                title="Milestones"
                actions={
                  write && (
                    <Button size="sm" onClick={() => setMilestone('new')}>
                      <Plus /> Milestone
                    </Button>
                  )
                }
              />
              {p.milestones.length === 0 ? (
                <EmptyState title="No milestones" />
              ) : (
                <ul className="divide-y divide-border">
                  {p.milestones.map((m) => {
                    const tasks = p.tasks.filter((t) => t.milestoneId === m.id);
                    const done = tasks.filter((t) => t.status === 'done').length;
                    const overdue = !m.isComplete && m.dueDate && new Date(m.dueDate) < new Date();
                    return (
                      <li key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                        <button disabled={!write} onClick={() => toggleMilestone.mutate(m)} className="cursor-pointer" aria-label="Toggle complete">
                          {m.isComplete ? <CheckCircle2 className="size-4 text-success" /> : <Circle className="size-4 text-muted" />}
                        </button>
                        <div className="flex-1">
                          <div className={cn('font-medium', m.isComplete && 'text-muted line-through')}>{m.name}</div>
                          {m.description && <div className="text-xs text-muted">{m.description}</div>}
                        </div>
                        <div className="w-40">
                          <div className="text-[11px] text-muted">
                            {done}/{tasks.length} tasks
                          </div>
                          <Progress value={tasks.length ? (done / tasks.length) * 100 : 0} tone="success" />
                        </div>
                        <span className={cn('w-28 text-right text-xs', overdue ? 'font-semibold text-danger' : 'text-muted')}>{fmtDate(m.dueDate)}</span>
                        {write && (
                          <>
                            <Button size="icon-sm" variant="ghost" onClick={() => setMilestone(m)} aria-label="Edit milestone">
                              <Pencil />
                            </Button>
                            <Button size="icon-sm" variant="ghost" onClick={() => removeMilestone.mutate(m.id)} aria-label="Delete milestone">
                              <Trash2 />
                            </Button>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </TabsContent>
          <TabsContent value="time" className="mt-4">
            <Card>
              <ProjectTime projectId={id} />
            </Card>
          </TabsContent>
          <TabsContent value="tickets" className="mt-4">
            <Card>
              <RelatedTickets filter={{ projectId: id }} scope="all" />
            </Card>
          </TabsContent>
          <TabsContent value="overview" className="mt-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader title="Details" />
                <CardBody className="space-y-3">
                  <dl className="grid grid-cols-2 gap-3">
                    <Field label="Company">
                      <Link to={`/companies/${p.companyId}`} className="hover:text-primary">
                        {p.companyName}
                      </Link>
                    </Field>
                    <Field label="Manager">{p.managerName}</Field>
                    <Field label="Estimated hours">{p.estimatedHours}</Field>
                    <Field label="Budget">{p.budget ? formatMoney(p.budget) : null}</Field>
                  </dl>
                  {p.description && <p className="prose-note text-[13px]">{p.description}</p>}
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Attachments" />
                <CardBody>
                  <Attachments entityType="project" entityId={id} canWrite={write} />
                </CardBody>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
      <ProjectDialog open={editing} onOpenChange={setEditing} project={p} />
      <TaskDialog open={task !== null} onOpenChange={(o) => !o && setTask(null)} projectId={id} task={task === 'new' ? null : task} milestones={p.milestones} />
      <MilestoneDialog open={milestone !== null} onOpenChange={(o) => !o && setMilestone(null)} projectId={id} milestone={milestone === 'new' ? null : milestone} />
      <LogTimeDialog open={timeFor !== null} onOpenChange={(o) => !o && setTimeFor(null)} projectTaskId={timeFor ?? undefined} />
      <ConfirmDialog open={deleting} onOpenChange={setDeleting} title="Delete project?" description="Projects with logged time cannot be deleted; cancel them instead." danger confirmLabel="Delete" loading={remove.isPending} onConfirm={() => remove.mutate()} />
    </div>
  );
}

interface TimeRow {
  id: number;
  startedAt: string;
  userName: string;
  taskTitle: string | null;
  durationMinutes: number;
  description: string;
  billable: boolean;
}

function ProjectTime({ projectId }: { projectId: number }) {
  const me = useMe();
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['time-entries', 'project', projectId, page],
    queryFn: () => api.get<Paginated<TimeRow> & { totals: { minutes: number } }>('/time-entries', { projectId, page, pageSize: 50, userId: me.user.permissions.includes('*') || me.user.permissions.includes('time.read_all') ? undefined : 'me' }),
  });
  const cols: Column<TimeRow>[] = [
    { header: 'Date', cell: ({ row }) => fmtDate(row.original.startedAt) },
    { header: 'Resource', cell: ({ row }) => row.original.userName },
    { header: 'Task', cell: ({ row }) => row.original.taskTitle ?? '—' },
    { header: 'Duration', meta: { align: 'right' }, cell: ({ row }) => formatMinutes(row.original.durationMinutes) },
    { header: 'Description', cell: ({ row }) => <span className="line-clamp-1 text-muted">{row.original.description}</span> },
  ];
  return (
    <>
      <div className="border-b border-border px-4 py-2 text-xs text-muted">Total: {formatMinutes(q.data?.totals.minutes ?? 0)}</div>
      <DataTable columns={cols} data={q.data?.data} total={q.data?.total} page={page} pageSize={50} onPageChange={setPage} loading={q.isLoading} />
    </>
  );
}
