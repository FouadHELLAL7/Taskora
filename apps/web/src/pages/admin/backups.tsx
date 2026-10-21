import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArchiveRestore, DatabaseBackup, Download, HardDriveDownload, RotateCcw, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError, downloadUrl, request } from '@/lib/api';
import { fmtDateTime, fmtRelative } from '@/lib/utils';
import { PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Checkbox, Input } from '@/components/ui/input';
import { Badge, Card, CardBody, CardHeader, PageLoader } from '@/components/ui/misc';
import { ConfirmDialog, Dialog } from '@/components/ui/overlays';
import { DataTable, type Column } from '@/components/data-table';
import { FormField, FormGrid, handleFormError } from '@/components/form';

interface BackupFile {
  name: string;
  sizeBytes: number;
  createdAt: string;
  kind: 'auto' | 'manual' | 'pre-restore';
}

interface BackupList {
  data: BackupFile[];
  directory: string;
  autoBackupEnabled: boolean;
  autoBackupIntervalHours: number;
  backupRetention: number;
}

interface RestoreResult {
  tables: number;
  rows: number;
  files: number;
  safetyBackup: string | null;
}

const KIND: Record<BackupFile['kind'], { label: string; tone: 'neutral' | 'info' | 'warning' }> = {
  manual: { label: 'Manual', tone: 'neutral' },
  auto: { label: 'Automatic', tone: 'info' },
  'pre-restore': { label: 'Before restore', tone: 'warning' },
};

export function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** Restore target: a backup kept on the server, or an uploaded file. */
type RestoreSource = { kind: 'server'; name: string } | { kind: 'upload'; file: File };

export default function BackupsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['backups'], queryFn: () => api.get<BackupList>('/admin/backups') });
  const [includeFiles, setIncludeFiles] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<RestoreSource | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const create = useMutation({
    mutationFn: () => api.post<BackupFile>('/admin/backups', { includeFiles }),
    onSuccess: (b) => {
      toast.success(`Backup ${b.name} saved on the server`);
      qc.invalidateQueries({ queryKey: ['backups'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Backup failed'),
  });
  const remove = useMutation({
    mutationFn: (name: string) => api.delete(`/admin/backups/${encodeURIComponent(name)}`),
    onSuccess: () => {
      toast.success('Backup deleted');
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ['backups'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Delete failed'),
  });

  if (!q.data) return <PageLoader />;
  const d = q.data;
  const cols: Column<BackupFile>[] = [
    { header: 'Backup', cell: ({ row }) => <span className="font-mono text-[12px]">{row.original.name}</span> },
    { header: 'Type', cell: ({ row }) => <Badge tone={KIND[row.original.kind].tone}>{KIND[row.original.kind].label}</Badge> },
    { header: 'Created', cell: ({ row }) => <span title={fmtDateTime(row.original.createdAt)}>{fmtRelative(row.original.createdAt)}</span> },
    { header: 'Size', meta: { align: 'right' }, cell: ({ row }) => fmtBytes(row.original.sizeBytes) },
    {
      header: '',
      id: 'actions',
      meta: { align: 'right' },
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => downloadUrl(`/admin/backups/${encodeURIComponent(row.original.name)}`)}>
            <Download /> Download
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setRestoring({ kind: 'server', name: row.original.name })}>
            <RotateCcw /> Restore
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={() => setDeleting(row.original.name)} aria-label="Delete backup">
            <Trash2 />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Backup & Restore" icon={<DatabaseBackup />} subtitle="Full backups of all Taskora data: tickets, companies, contacts, assets, Action1 sync data, settings, users and files" />
      <div className="space-y-4 p-5">
        <Card>
          <CardHeader title="Create a backup" description="One compressed file with every table and, optionally, all uploaded attachments. Sessions and queued jobs are not included." />
          <CardBody className="space-y-4">
            <Checkbox label="Include uploaded files (attachments)" checked={includeFiles} onChange={(e) => setIncludeFiles(e.target.checked)} />
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" loading={create.isPending} onClick={() => create.mutate()}>
                <HardDriveDownload /> Save backup on the server
              </Button>
              <Button onClick={() => downloadUrl('/admin/backups/export', { includeFiles: includeFiles ? 'true' : 'false' })}>
                <Download /> Download a backup now
              </Button>
              <Button variant="ghost" onClick={() => fileInput.current?.click()}>
                <Upload /> Restore from a file…
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept=".gz,.json,application/gzip,application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) setRestoring({ kind: 'upload', file });
                }}
              />
            </div>
            <p className="text-xs text-muted">
              Server folder: <span className="font-mono">{d.directory}</span>. Integration secrets (Action1, SMTP) are stored encrypted with <span className="font-mono">TASKORA_ENCRYPTION_KEY</span>; keep that key with your
              backups to restore them on another server.
            </p>
          </CardBody>
        </Card>

        <AutoBackupSettings list={d} />

        <Card>
          <CardHeader title="Backups on the server" description={`${d.data.length} backup(s)`} />
          <DataTable columns={cols} data={d.data} loading={q.isLoading} empty={<p className="py-8 text-center text-xs text-muted">No backups yet.</p>} />
        </Card>
      </div>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this backup?"
        description={<span className="font-mono">{deleting}</span>}
        confirmLabel="Delete"
        danger
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
      {restoring && <RestoreDialog source={restoring} onClose={() => setRestoring(null)} />}
    </div>
  );
}

function AutoBackupSettings({ list }: { list: BackupList }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ autoBackupEnabled: list.autoBackupEnabled, autoBackupIntervalHours: list.autoBackupIntervalHours, backupRetention: list.backupRetention });
  useEffect(
    () => setF({ autoBackupEnabled: list.autoBackupEnabled, autoBackupIntervalHours: list.autoBackupIntervalHours, backupRetention: list.backupRetention }),
    [list.autoBackupEnabled, list.autoBackupIntervalHours, list.backupRetention],
  );
  const save = useMutation({
    mutationFn: () => api.put('/admin/backups/settings', f),
    onSuccess: () => {
      toast.success('Automatic backup settings saved');
      qc.invalidateQueries({ queryKey: ['backups'] });
    },
    onError: (e) => handleFormError(e),
  });
  const lastAuto = list.data.find((b) => b.kind === 'auto');
  return (
    <Card>
      <CardHeader title="Automatic backups" description="The background worker saves a backup on the server on this schedule and keeps only the newest ones. Manual backups are never deleted automatically." />
      <CardBody className="space-y-4">
        <Checkbox label="Create automatic backups" checked={f.autoBackupEnabled} onChange={(e) => setF({ ...f, autoBackupEnabled: e.target.checked })} />
        <FormGrid cols={3}>
          <FormField label="Every (hours)">
            <Input type="number" min={1} max={720} value={f.autoBackupIntervalHours} onChange={(e) => setF({ ...f, autoBackupIntervalHours: Number(e.target.value) })} />
          </FormField>
          <FormField label="Keep the last">
            <Input type="number" min={1} max={365} value={f.backupRetention} onChange={(e) => setF({ ...f, backupRetention: Number(e.target.value) })} />
          </FormField>
          <FormField label="Last automatic backup">
            <div className="flex h-8 items-center text-[13px]">{lastAuto ? `${fmtRelative(lastAuto.createdAt)} (${fmtBytes(lastAuto.sizeBytes)})` : 'None yet'}</div>
          </FormField>
        </FormGrid>
        <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
          Save
        </Button>
      </CardBody>
    </Card>
  );
}

function RestoreDialog({ source, onClose }: { source: RestoreSource; onClose: () => void }) {
  const [confirm, setConfirm] = useState('');
  const [safetyBackup, setSafetyBackup] = useState(true);
  const restore = useMutation({
    mutationFn: async () => {
      if (source.kind === 'server') return api.post<RestoreResult>(`/admin/backups/${encodeURIComponent(source.name)}/restore`, { confirm, safetyBackup });
      const fd = new FormData();
      fd.append('file', source.file, source.file.name);
      return request<RestoreResult>('POST', '/admin/backups/restore', fd, { query: { confirm, safetyBackup: safetyBackup ? 'true' : 'false' } });
    },
    onSuccess: (r) => {
      toast.success(`Restored ${r.rows} records and ${r.files} files. Please sign in again.`, { duration: 10000 });
      // Every session was cleared by the restore.
      setTimeout(() => window.location.assign('/login'), 1500);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Restore failed', { duration: 10000 }),
  });
  const label = source.kind === 'server' ? source.name : `${source.file.name} (${fmtBytes(source.file.size)})`;
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !restore.isPending && onClose()}
      title="Restore a backup"
      size="sm"
      footer={
        <>
          <Button onClick={onClose} disabled={restore.isPending}>
            Cancel
          </Button>
          <Button variant="danger" disabled={confirm !== 'RESTORE'} loading={restore.isPending} onClick={() => restore.mutate()}>
            <ArchiveRestore /> Replace all data
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[13px]">
        <p>
          <b>All current data will be replaced</b> by <span className="break-all font-mono text-xs">{label}</span>. Everyone, including you, is signed out afterwards. The restore is all-or-nothing: if anything fails, nothing
          changes.
        </p>
        <Checkbox label="Save the current data as a backup first (recommended)" checked={safetyBackup} onChange={(e) => setSafetyBackup(e.target.checked)} />
        <FormField label="Type RESTORE to confirm">
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
        </FormField>
      </div>
    </Dialog>
  );
}
