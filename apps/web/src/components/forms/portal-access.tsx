import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { fmtRelative } from '@/lib/utils';
import { Button } from '../ui/button';
import { Badge, Card, CardBody, CardHeader } from '../ui/misc';
import { handleFormError } from '../form';

/** Staff control for a contact's customer-portal access. */
export function PortalAccessCard({ contact, canWrite }: { contact: { id: number; email: string | null; portalEnabled?: boolean; portalLastLoginAt?: string | null }; canWrite: boolean }) {
  const qc = useQueryClient();
  const [password, setPassword] = useState<string | null>(null);
  const set = useMutation({
    mutationFn: (body: { enabled: boolean; resetPassword?: boolean }) => api.post<{ enabled: boolean; password: string | null }>(`/contacts/${contact.id}/portal`, body),
    onSuccess: (r) => {
      setPassword(r.password);
      toast.success(r.enabled ? 'Portal access updated' : 'Portal access disabled');
      qc.invalidateQueries({ queryKey: ['contact', contact.id] });
    },
    onError: (e) => handleFormError(e),
  });
  const portalUrl = `${window.location.origin}/portal`;
  return (
    <Card>
      <CardHeader title="Customer portal" actions={contact.portalEnabled ? <Badge tone="success">Enabled</Badge> : <Badge>Disabled</Badge>} />
      <CardBody className="space-y-2 text-[13px]">
        {contact.portalEnabled && <p className="text-xs text-muted">Last sign-in: {fmtRelative(contact.portalLastLoginAt, 'never')}</p>}
        {password && (
          <div className="rounded-md border border-warning/40 bg-warning-soft p-2.5 text-xs">
            <div className="mb-1 font-medium text-warning">Share these sign-in details securely — the password is shown only once.</div>
            <div>Portal: {portalUrl}</div>
            <div>E-mail: {contact.email}</div>
            <div className="flex items-center gap-1">
              Password: <code className="font-mono">{password}</code>
              <button
                className="cursor-pointer text-muted hover:text-foreground"
                onClick={() => {
                  navigator.clipboard?.writeText(`${portalUrl}\n${contact.email}\n${password}`);
                  toast.success('Copied');
                }}
                aria-label="Copy sign-in details"
              >
                <Copy className="size-3" />
              </button>
            </div>
          </div>
        )}
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            {contact.portalEnabled ? (
              <>
                <Button size="sm" onClick={() => set.mutate({ enabled: true, resetPassword: true })} loading={set.isPending}>
                  <KeyRound /> Reset password
                </Button>
                <Button size="sm" variant="ghost" onClick={() => set.mutate({ enabled: false })}>
                  Disable access
                </Button>
              </>
            ) : (
              <Button size="sm" variant="primary" disabled={!contact.email} onClick={() => set.mutate({ enabled: true })} loading={set.isPending}>
                Grant portal access
              </Button>
            )}
          </div>
        )}
        {!contact.email && <p className="text-xs text-muted">Add an e-mail address to enable portal access.</p>}
      </CardBody>
    </Card>
  );
}
