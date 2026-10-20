import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { KeyRound, Lock, LogOut, MoreHorizontal, Pencil, Plus, Power, ShieldCheck, Trash2, Unlock, Users } from 'lucide-react';
import { ALL_PERMISSIONS } from '@taskora/shared';
import { api, type Paginated } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { fmtDateTime, fmtRelative } from '@/lib/utils';
import { DataTable, type Column } from '@/components/data-table';
import { PageBody, PageHeader, SearchInput } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Avatar, Badge, Card, CardHeader, EmptyState } from '@/components/ui/misc';
import { ConfirmDialog, DropdownContent, DropdownItem, DropdownMenu, DropdownSeparator, DropdownTrigger, Tabs, TabsContent, TabsList, TabsTrigger, Tooltip } from '@/components/ui/overlays';
import { handleFormError } from '@/components/form';
import { useTabParam } from '@/components/admin/tabs';
import { UserFormDialog, useRoles, type RoleRow, type UserRow } from '@/components/admin/user-form';
import { RoleFormDialog } from '@/components/admin/role-form';

const isLocked = (u: UserRow) => !!u.lockedUntil && new Date(u.lockedUntil).getTime() > Date.now();

export default function UsersPage() {
  const [tab, setTab] = useTabParam('users');
  const roles = useRoles();
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <PageHeader title="Users & Roles" subtitle="Who can sign in to Taskora and what they are allowed to do" icon={<Users />}>
        <TabsList className="-mx-1 border-b-0">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="roles" count={roles.data?.data.length}>
            Roles
          </TabsTrigger>
        </TabsList>
      </PageHeader>
      <PageBody>
        <TabsContent value="users">
          <UsersTab />
        </TabsContent>
        <TabsContent value="roles">
          <RolesTab />
        </TabsContent>
      </PageBody>
    </Tabs>
  );
}

/* ------------------------------------------------------------------- users */

function UsersTab() {
  const me = useMe();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [toggling, setToggling] = useState<UserRow | null>(null);
  const pageSize = 50;

  const list = useQuery({
    queryKey: ['users', { q, page }],
    queryFn: () => api.get<Paginated<UserRow>>('/users', { q: q || undefined, page, pageSize }),
    placeholderData: keepPreviousData,
  });

  const patch = useMutation({
    mutationFn: ({ user, data }: { user: UserRow; data: Record<string, unknown> }) => api.patch(`/users/${user.id}`, data),
    onSuccess: (_d, { user, data }) => {
      toast.success(
        'isActive' in data ? `${user.firstName} ${user.lastName} ${data.isActive ? (isLocked(user) && user.isActive ? 'unlocked' : 'activated') : 'deactivated'}` : 'User updated',
      );
      setToggling(null);
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['lookups'] });
    },
    onError: (e) => {
      setToggling(null);
      handleFormError(e);
    },
  });

  const columns = useMemo<Column<UserRow>[]>(
    () => [
      {
        header: 'Name',
        cell: ({ row }) => {
          const u = row.original;
          return (
            <div className="flex min-w-0 items-center gap-2">
              <Avatar name={`${u.firstName} ${u.lastName}`} />
              <div className="min-w-0">
                <div className="truncate font-medium">
                  {u.firstName} {u.lastName}
                  {u.id === me.user.id && <span className="ml-1.5 text-xs font-normal text-muted">(you)</span>}
                </div>
                {u.title && <div className="truncate text-xs text-muted">{u.title}</div>}
              </div>
            </div>
          );
        },
      },
      { header: 'E-mail', cell: ({ row }) => <span className="text-muted">{row.original.email}</span> },
      { header: 'Role', cell: ({ row }) => <Badge>{row.original.roleName}</Badge> },
      { header: 'Technician', cell: ({ row }) => (row.original.isTechnician ? <Badge tone="info">Technician</Badge> : <span className="text-subtle">—</span>) },
      {
        header: 'Status',
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1">
            {row.original.isActive ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}
            {isLocked(row.original) && (
              <Tooltip content={`Locked after failed sign-ins until ${fmtDateTime(row.original.lockedUntil)}`}>
                <span>
                  <Badge tone="danger">
                    <Lock className="size-3" /> Locked
                  </Badge>
                </span>
              </Tooltip>
            )}
          </span>
        ),
      },
      {
        header: 'Last sign-in',
        cell: ({ row }) =>
          row.original.lastLoginAt ? (
            <Tooltip content={fmtDateTime(row.original.lastLoginAt)}>
              <span className="text-muted">{fmtRelative(row.original.lastLoginAt)}</span>
            </Tooltip>
          ) : (
            <span className="text-subtle">Never</span>
          ),
      },
      { header: 'Time zone', cell: ({ row }) => <span className="text-muted">{row.original.timezone}</span> },
      {
        id: 'actions',
        header: '',
        meta: { className: 'w-16 text-right' },
        cell: ({ row }) => {
          const u = row.original;
          const self = u.id === me.user.id;
          return (
            <div className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
              <Button size="icon-sm" variant="ghost" aria-label="Edit user" onClick={() => setEditing(u)}>
                <Pencil />
              </Button>
              <DropdownMenu>
                <DropdownTrigger asChild>
                  <Button size="icon-sm" variant="ghost" aria-label="More actions">
                    <MoreHorizontal />
                  </Button>
                </DropdownTrigger>
                <DropdownContent>
                  <DropdownItem
                    onSelect={async () => {
                      const r = await api.post<{ revoked: number }>(`/users/${u.id}/revoke-sessions`);
                      toast.success(`Signed out of ${r.revoked} session(s)`);
                    }}
                  >
                    <LogOut /> Sign out everywhere
                  </DropdownItem>
                  <DropdownItem onSelect={() => setEditing(u)}>
                    <KeyRound /> Edit / reset password
                  </DropdownItem>
                  {isLocked(u) && u.isActive && (
                    <DropdownItem onSelect={() => patch.mutate({ user: u, data: { isActive: true } })}>
                      <Unlock /> Unlock account
                    </DropdownItem>
                  )}
                  {!self && (
                    <>
                      <DropdownSeparator />
                      <DropdownItem danger={u.isActive} onSelect={() => (u.isActive ? setToggling(u) : patch.mutate({ user: u, data: { isActive: true } }))}>
                        <Power /> {u.isActive ? 'Deactivate' : 'Activate'}
                      </DropdownItem>
                    </>
                  )}
                </DropdownContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [me.user.id],
  );

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Users"
        description={list.data ? `${list.data.total} user${list.data.total === 1 ? '' : 's'}` : undefined}
        actions={
          <>
            <SearchInput
              value={q}
              onChange={(v) => {
                setQ(v);
                setPage(1);
              }}
              placeholder="Search name or e-mail…"
              className="w-56"
            />
            <Button size="sm" variant="primary" onClick={() => setCreating(true)}>
              <Plus /> New user
            </Button>
          </>
        }
      />
      <DataTable
        columns={columns}
        data={list.data?.data}
        total={list.data?.total}
        page={page}
        pageSize={pageSize}
        loading={list.isLoading}
        onPageChange={setPage}
        onRowClick={(u) => setEditing(u)}
        rowClassName={(u) => (!u.isActive ? 'opacity-60' : undefined)}
        empty={<EmptyState icon={<Users />} title="No users found" description={q ? 'Try another search.' : undefined} />}
      />
      <UserFormDialog
        open={creating || !!editing}
        onOpenChange={(o) => {
          if (!o) {
            setCreating(false);
            setEditing(null);
          }
        }}
        user={editing}
      />
      <ConfirmDialog
        open={!!toggling}
        onOpenChange={(o) => !o && setToggling(null)}
        title="Deactivate user?"
        description={
          <>
            <strong className="text-foreground">
              {toggling?.firstName} {toggling?.lastName}
            </strong>{' '}
            will be signed out and can no longer sign in. Their tickets, time entries and history are kept.
          </>
        }
        confirmLabel="Deactivate"
        danger
        loading={patch.isPending}
        onConfirm={() => toggling && patch.mutate({ user: toggling, data: { isActive: false } })}
      />
    </Card>
  );
}

/* ------------------------------------------------------------------- roles */

function RolesTab() {
  const qc = useQueryClient();
  const roles = useRoles();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<RoleRow | null>(null);
  const [template, setTemplate] = useState<{ name: string; description: string | null; permissions: string[] } | null>(null);
  const [deleting, setDeleting] = useState<RoleRow | null>(null);

  const remove = useMutation({
    mutationFn: (r: RoleRow) => api.delete(`/roles/${r.id}`),
    onSuccess: (_d, r) => {
      toast.success(`Role ${r.name} deleted`);
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: (e) => {
      setDeleting(null);
      handleFormError(e);
    },
  });

  const openRole = (r: RoleRow | null, tpl: typeof template = null) => {
    setRole(r);
    setTemplate(tpl);
    setOpen(true);
  };

  const columns = useMemo<Column<RoleRow>[]>(
    () => [
      {
        header: 'Role',
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-medium">
              {row.original.name}
              {row.original.isSystem ? <Badge>Built-in</Badge> : <Badge tone="info">Custom</Badge>}
            </div>
            {row.original.description && <div className="truncate text-xs text-muted">{row.original.description}</div>}
          </div>
        ),
      },
      {
        header: 'Permissions',
        cell: ({ row }) =>
          row.original.permissions.includes('*') ? (
            <Badge tone="primary">
              <ShieldCheck className="size-3" /> Full access
            </Badge>
          ) : (
            <span className="tabular-nums text-muted">
              {row.original.permissions.length} / {ALL_PERMISSIONS.length}
            </span>
          ),
      },
      { header: 'Users', meta: { align: 'right' }, cell: ({ row }) => <span className={row.original.userCount ? 'font-medium' : 'text-subtle'}>{row.original.userCount}</span> },
      {
        id: 'actions',
        header: '',
        meta: { className: 'w-16 text-right' },
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownTrigger asChild>
                  <Button size="icon-sm" variant="ghost" aria-label="Role actions">
                    <MoreHorizontal />
                  </Button>
                </DropdownTrigger>
                <DropdownContent>
                  <DropdownItem onSelect={() => openRole(r)}>
                    <Pencil /> {r.isSystem ? 'View permissions' : 'Edit'}
                  </DropdownItem>
                  <DropdownItem onSelect={() => openRole(null, { name: `${r.name} (copy)`, description: r.description, permissions: r.permissions })}>
                    <Plus /> Duplicate
                  </DropdownItem>
                  {!r.isSystem && (
                    <>
                      <DropdownSeparator />
                      <DropdownItem danger disabled={r.userCount > 0} onSelect={() => setDeleting(r)}>
                        <Trash2 /> {r.userCount > 0 ? `Delete (reassign ${r.userCount} user${r.userCount === 1 ? '' : 's'} first)` : 'Delete'}
                      </DropdownItem>
                    </>
                  )}
                </DropdownContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [],
  );

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Roles"
        description="Built-in roles are read-only. Create custom roles to grant a specific set of permissions."
        actions={
          <Button size="sm" variant="primary" onClick={() => openRole(null)}>
            <Plus /> New role
          </Button>
        }
      />
      <DataTable columns={columns} data={roles.data?.data} loading={roles.isLoading} onRowClick={(r) => openRole(r)} />
      <RoleFormDialog
        open={open}
        onOpenChange={setOpen}
        role={role}
        template={template}
        onDuplicate={(r) => openRole(null, { name: `${r.name} (copy)`, description: r.description, permissions: r.permissions })}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete role?"
        description={
          <>
            The custom role <strong className="text-foreground">{deleting?.name}</strong> will be permanently deleted.
          </>
        }
        confirmLabel="Delete role"
        danger
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </Card>
  );
}
