import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ExternalLink, RefreshCw, RotateCcw, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { fmtDateTime, fmtRelative } from '@/lib/utils';
import { DeviceStateBadge } from './badges';
import { Button } from './ui/button';
import { Badge, Field, Skeleton } from './ui/misc';
import { Tooltip } from './ui/overlays';

export interface Action1Endpoint {
  id: number;
  externalId: string;
  name: string | null;
  deviceName: string | null;
  osName: string | null;
  platform: string | null;
  serialNumber: string | null;
  manufacturer: string | null;
  ipAddress: string | null;
  macAddress: string | null;
  loggedInUser: string | null;
  agentStatus: string | null;
  onlineStatus: string | null;
  lastSeenAt: string | null;
  lastBootAt: string | null;
  rebootRequired: boolean | null;
  updateStatus: string | null;
  vulnerabilityStatus: string | null;
  missingCriticalUpdates: number | null;
  missingOtherUpdates: number | null;
  agentVersion: string | null;
  cpu: string | null;
  ramText: string | null;
  diskText: string | null;
  lastSyncedAt: string | null;
  missingSince: string | null;
  missingUpdates: Record<string, unknown>[] | null;
}

interface Action1Response {
  linked: boolean;
  endpoint?: Action1Endpoint;
  consoleUrl?: string;
  consoleUrlLabel?: string;
}

function updateTitle(u: Record<string, unknown>): string {
  return String(u.name ?? u.title ?? u.update_name ?? u.package_name ?? u.kb ?? 'Update');
}
function updateSeverity(u: Record<string, unknown>): string | null {
  const s = u.severity ?? u.security_severity ?? u.classification;
  return s ? String(s) : null;
}

/**
 * Live device information from Action1 for a configuration item. Read-only:
 * Taskora never sends commands to Action1.
 */
export function Action1Panel({ ciId, compact }: { ciId: number; compact?: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['ci-action1', ciId], queryFn: () => api.get<Action1Response>(`/configuration-items/${ciId}/action1`) });
  const refresh = useMutation({
    mutationFn: () => api.post<{ count: number }>(`/configuration-items/${ciId}/action1/refresh-updates`),
    onSuccess: (r) => {
      toast.success(`Missing updates refreshed (${r.count})`);
      qc.invalidateQueries({ queryKey: ['ci-action1', ciId] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not reach Action1'),
  });

  if (q.isLoading) return <Skeleton className="h-24 w-full" />;
  if (!q.data?.linked || !q.data.endpoint) {
    return <p className="text-xs text-muted">Not managed by Action1. Devices appear here automatically once the integration syncs a matching endpoint.</p>;
  }
  const e = q.data.endpoint;
  const critical = e.missingCriticalUpdates ?? 0;
  const other = e.missingOtherUpdates ?? 0;
  const updates = e.missingUpdates ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <DeviceStateBadge agentStatus={e.agentStatus} onlineStatus={e.onlineStatus} />
        {e.rebootRequired && (
          <Badge tone="warning">
            <RotateCcw className="size-3" /> Reboot required
          </Badge>
        )}
        {critical > 0 && (
          <Badge tone="danger">
            <ShieldAlert className="size-3" /> {critical} critical update{critical === 1 ? '' : 's'}
          </Badge>
        )}
        {other > 0 && <Badge tone="info">{other} other updates</Badge>}
        {critical === 0 && other === 0 && e.missingCriticalUpdates !== null && <Badge tone="success">Fully patched</Badge>}
        {e.missingSince && (
          <Tooltip content={`Absent from Action1 since ${fmtDateTime(e.missingSince)}`}>
            <Badge tone="warning">
              <AlertTriangle className="size-3" /> Not reported
            </Badge>
          </Tooltip>
        )}
      </div>
      <dl className={compact ? 'grid grid-cols-2 gap-x-3 gap-y-2' : 'grid grid-cols-2 gap-x-4 gap-y-2.5 lg:grid-cols-3'}>
        <Field label="Last seen">{e.lastSeenAt ? <span title={fmtDateTime(e.lastSeenAt)}>{fmtRelative(e.lastSeenAt)}</span> : null}</Field>
        <Field label="Operating system">{e.osName}</Field>
        <Field label="Logged-in user">{e.loggedInUser}</Field>
        <Field label="IP address">{e.ipAddress}</Field>
        {!compact && <Field label="MAC address">{e.macAddress}</Field>}
        {!compact && <Field label="Serial">{e.serialNumber}</Field>}
        {!compact && <Field label="Manufacturer">{e.manufacturer}</Field>}
        {!compact && <Field label="CPU">{e.cpu}</Field>}
        {!compact && <Field label="RAM">{e.ramText}</Field>}
        {!compact && <Field label="Disk">{e.diskText}</Field>}
        <Field label="Last boot">{e.lastBootAt ? fmtDateTime(e.lastBootAt) : null}</Field>
        <Field label="Update status">{e.updateStatus}</Field>
        {!compact && <Field label="Vulnerabilities">{e.vulnerabilityStatus}</Field>}
        {!compact && <Field label="Agent version">{e.agentVersion}</Field>}
        <Field label="Synced">{e.lastSyncedAt ? fmtRelative(e.lastSyncedAt) : null}</Field>
      </dl>
      {updates.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-subtle">Missing updates</div>
          <ul className="max-h-40 space-y-1 overflow-y-auto text-[12px]">
            {updates.slice(0, compact ? 5 : 50).map((u, i) => (
              <li key={i} className="flex items-start justify-between gap-2 rounded bg-surface-2 px-2 py-1">
                <span className="min-w-0 break-words">{updateTitle(u)}</span>
                {updateSeverity(u) && <Badge tone={/crit/i.test(updateSeverity(u)!) ? 'danger' : 'neutral'}>{updateSeverity(u)}</Badge>}
              </li>
            ))}
            {compact && updates.length > 5 && <li className="text-[11px] text-muted">+{updates.length - 5} more</li>}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => refresh.mutate()} loading={refresh.isPending}>
          <RefreshCw /> Refresh updates
        </Button>
        {q.data.consoleUrl && (
          <a href={q.data.consoleUrl} target="_blank" rel="noreferrer noopener">
            <Button size="sm" variant="ghost">
              <ExternalLink /> {q.data.consoleUrlLabel ?? 'Open in Action1'}
            </Button>
          </a>
        )}
      </div>
    </div>
  );
}
