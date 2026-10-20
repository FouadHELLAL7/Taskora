import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PROJECT_STATUS, TASK_STATUS } from '@taskora/shared';
import { api } from '@/lib/api';
import { useLookups, userOpts } from '@/lib/lookups';
import { Button } from '../ui/button';
import { Checkbox, Input, Select, Textarea } from '../ui/input';
import { Dialog } from '../ui/overlays';
import { FormField, FormGrid, handleFormError } from '../form';
import { EntityPicker } from '../entity-picker';

export interface ProjectRecord {
  id: number;
  name: string;
  companyId: number;
  companyName?: string;
  contractId: number | null;
  contractName?: string | null;
  managerId: number | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  estimatedHours: number | null;
  budget: number | null;
  description: string | null;
}

type Errors = Record<string, string>;
const setErr = (set: (e: Errors) => void) => (name: string, e: { message: string }) => set({ [name]: e.message });

export function ProjectDialog({ open, onOpenChange, project, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; project?: ProjectRecord | null; onSaved?: (p: ProjectRecord) => void }) {
  const qc = useQueryClient();
  const lookups = useLookups();
  const empty = { name: '', companyId: 0, contractId: null as number | null, managerId: null as number | null, status: 'planning', startDate: '', endDate: '', estimatedHours: '', budget: '', description: '' };
  const [f, setF] = useState(empty);
  const [errors, setErrors] = useState<Errors>({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF(
      project
        ? {
            name: project.name,
            companyId: project.companyId,
            contractId: project.contractId,
            managerId: project.managerId,
            status: project.status,
            startDate: project.startDate ?? '',
            endDate: project.endDate ?? '',
            estimatedHours: project.estimatedHours?.toString() ?? '',
            budget: project.budget?.toString() ?? '',
            description: project.description ?? '',
          }
        : empty,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project]);
  const save = useMutation({
    mutationFn: () => {
      const body = { ...f, estimatedHours: f.estimatedHours || null, budget: f.budget || null };
      return project ? api.patch<ProjectRecord>(`/projects/${project.id}`, body) : api.post<ProjectRecord>('/projects', body);
    },
    onSuccess: (p) => {
      toast.success(project ? 'Project updated' : 'Project created');
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['project', p.id] });
      onOpenChange(false);
      onSaved?.(p);
    },
    onError: (e) => handleFormError(e, setErr(setErrors)),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={project ? 'Edit project' : 'New project'}
      size="lg"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
            {project ? 'Save' : 'Create project'}
          </Button>
        </>
      }
    >
      <FormGrid cols={2}>
        <FormField label="Name" required error={errors.name} className="sm:col-span-2">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </FormField>
        <FormField label="Company" required error={errors.companyId}>
          <EntityPicker kind="company" value={f.companyId || null} label={project?.companyName} onChange={(id) => setF({ ...f, companyId: id ?? 0, contractId: null })} disabled={!!project} />
        </FormField>
        <FormField label="Contract" error={errors.contractId}>
          <EntityPicker kind="contract" value={f.contractId} label={project?.contractName} filter={{ companyId: f.companyId || undefined }} disabled={!f.companyId} onChange={(id) => setF({ ...f, contractId: id })} />
        </FormField>
        <FormField label="Project manager">
          <Select value={f.managerId ?? ''} onChange={(e) => setF({ ...f, managerId: e.target.value ? Number(e.target.value) : null })} placeholder="—" options={userOpts(lookups.data?.users, f.managerId)} />
        </FormField>
        <FormField label="Status">
          <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} options={PROJECT_STATUS.values.map((v) => ({ value: v, label: PROJECT_STATUS.labels[v] }))} />
        </FormField>
        <FormField label="Start date">
          <Input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} />
        </FormField>
        <FormField label="Target end date">
          <Input type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} />
        </FormField>
        <FormField label="Estimated hours">
          <Input type="number" min={0} step="0.5" value={f.estimatedHours} onChange={(e) => setF({ ...f, estimatedHours: e.target.value })} />
        </FormField>
        <FormField label="Budget">
          <Input type="number" min={0} step="0.01" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} />
        </FormField>
        <FormField label="Description" className="sm:col-span-2">
          <Textarea rows={4} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </FormField>
      </FormGrid>
    </Dialog>
  );
}

export interface TaskRecord {
  id: number;
  projectId: number;
  title: string;
  description: string | null;
  milestoneId: number | null;
  assignedUserId: number | null;
  status: string;
  estimatedHours: number | null;
  startDate: string | null;
  dueDate: string | null;
}

export function TaskDialog({
  open,
  onOpenChange,
  projectId,
  task,
  milestones,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: number;
  task?: TaskRecord | null;
  milestones: { id: number; name: string }[];
}) {
  const qc = useQueryClient();
  const lookups = useLookups();
  const empty = { title: '', description: '', milestoneId: null as number | null, assignedUserId: null as number | null, status: 'todo', estimatedHours: '', startDate: '', dueDate: '' };
  const [f, setF] = useState(empty);
  const [errors, setErrors] = useState<Errors>({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF(task ? { ...empty, ...task, description: task.description ?? '', estimatedHours: task.estimatedHours?.toString() ?? '', startDate: task.startDate ?? '', dueDate: task.dueDate ?? '' } : empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task]);
  const save = useMutation({
    mutationFn: () => {
      const body = { title: f.title, description: f.description, milestoneId: f.milestoneId, assignedUserId: f.assignedUserId, status: f.status, estimatedHours: f.estimatedHours || null, startDate: f.startDate, dueDate: f.dueDate };
      return task ? api.patch(`/project-tasks/${task.id}`, body) : api.post(`/projects/${projectId}/tasks`, body);
    },
    onSuccess: () => {
      toast.success(task ? 'Task updated' : 'Task added');
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      qc.invalidateQueries({ queryKey: ['project-tasks'] });
      onOpenChange(false);
    },
    onError: (e) => handleFormError(e, setErr(setErrors)),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={task ? 'Edit task' : 'New task'}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <FormGrid cols={2}>
        <FormField label="Title" required error={errors.title} className="sm:col-span-2">
          <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </FormField>
        <FormField label="Milestone">
          <Select value={f.milestoneId ?? ''} onChange={(e) => setF({ ...f, milestoneId: e.target.value ? Number(e.target.value) : null })} placeholder="—" options={milestones.map((m) => ({ value: m.id, label: m.name }))} />
        </FormField>
        <FormField label="Assigned to">
          <Select value={f.assignedUserId ?? ''} onChange={(e) => setF({ ...f, assignedUserId: e.target.value ? Number(e.target.value) : null })} placeholder="Unassigned" options={userOpts(lookups.data?.users, f.assignedUserId)} />
        </FormField>
        <FormField label="Status">
          <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} options={TASK_STATUS.values.map((v) => ({ value: v, label: TASK_STATUS.labels[v] }))} />
        </FormField>
        <FormField label="Estimated hours">
          <Input type="number" min={0} step="0.25" value={f.estimatedHours} onChange={(e) => setF({ ...f, estimatedHours: e.target.value })} />
        </FormField>
        <FormField label="Start date">
          <Input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} />
        </FormField>
        <FormField label="Due date">
          <Input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
        </FormField>
        <FormField label="Description" className="sm:col-span-2">
          <Textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </FormField>
      </FormGrid>
    </Dialog>
  );
}

export function MilestoneDialog({ open, onOpenChange, projectId, milestone }: { open: boolean; onOpenChange: (o: boolean) => void; projectId: number; milestone?: { id: number; name: string; dueDate: string | null; description: string | null; isComplete: boolean } | null }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: '', dueDate: '', description: '', isComplete: false });
  useEffect(() => {
    if (open) setF(milestone ? { name: milestone.name, dueDate: milestone.dueDate ?? '', description: milestone.description ?? '', isComplete: milestone.isComplete } : { name: '', dueDate: '', description: '', isComplete: false });
  }, [open, milestone]);
  const save = useMutation({
    mutationFn: () => (milestone ? api.patch(`/projects/${projectId}/milestones/${milestone.id}`, f) : api.post(`/projects/${projectId}/milestones`, f)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      qc.invalidateQueries({ queryKey: ['milestones'] });
      onOpenChange(false);
    },
    onError: (e) => handleFormError(e),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={milestone ? 'Edit milestone' : 'New milestone'}
      size="sm"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" disabled={!f.name.trim()} loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <FormField label="Name" required>
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </FormField>
        <FormField label="Due date">
          <Input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
        </FormField>
        <FormField label="Description">
          <Textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </FormField>
        <Checkbox label="Completed" checked={f.isComplete} onChange={(e) => setF({ ...f, isComplete: e.target.checked })} />
      </div>
    </Dialog>
  );
}
