import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MapPin, MoreHorizontal, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useTableState } from '@/hooks/use-table-state';
import { DataTable, type Column } from '@/components/data-table';
import { ListLayout, PageHeader, SearchInput } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Checkbox, Input, Textarea } from '@/components/ui/input';
import { Badge, EmptyState } from '@/components/ui/misc';
import { ConfirmDialog, Dialog, DropdownContent, DropdownItem, DropdownMenu, DropdownTrigger } from '@/components/ui/overlays';
import { FormField, FormGrid, FormSection, handleFormError } from '@/components/form';
import { EntityPicker } from '@/components/entity-picker';
import { ActiveBadge } from '@/components/badges';

interface LocationRow {
  id: number;
  companyId: number;
  companyName: string;
  name: string;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  phone: string | null;
  isPrimary: boolean;
  isActive: boolean;
  notes: string | null;
}

type FormValues = Omit<LocationRow, 'id' | 'companyName' | 'companyId'> & { companyId: number | null };

const empty: FormValues = {
  companyId: null,
  name: '',
  address1: '',
  address2: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
  phone: '',
  isPrimary: false,
  isActive: true,
  notes: '',
};

export default function LocationsPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const t = useTableState({ pageSize: 50 });
  const [editing, setEditing] = useState<LocationRow | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<LocationRow | null>(null);
  const companyId = t.filters.companyId ? Number(t.filters.companyId) : null;
  const canWrite = can('companies.write');
  const canDelete = can('companies.delete');

  const list = useQuery({
    queryKey: ['locations', t.query],
    queryFn: () => api.get<Paginated<LocationRow>>('/locations', t.query),
    placeholderData: keepPreviousData,
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/locations/${id}`),
    onSuccess: () => {
      toast.success('Location deleted');
      qc.invalidateQueries({ queryKey: ['locations'] });
      setDeleting(null);
    },
    onError: (e) => handleFormError(e),
  });

  const columns: Column<LocationRow>[] = [
    {
      header: 'Location',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.original.name}</span>
          {row.original.isPrimary && (
            <Badge tone="primary">
              <Star className="size-3" /> Primary
            </Badge>
          )}
        </div>
      ),
    },
    {
      header: 'Company',
      cell: ({ row }) => (
        <Link to={`/companies/${row.original.companyId}`} onClick={(e) => e.stopPropagation()} className="hover:text-primary">
          {row.original.companyName}
        </Link>
      ),
    },
    { header: 'Address', cell: ({ row }) => <span className="text-muted">{[row.original.address1, row.original.address2].filter(Boolean).join(', ') || '—'}</span> },
    { header: 'City', cell: ({ row }) => [row.original.postalCode, row.original.city].filter(Boolean).join(' ') || '—' },
    { header: 'Region', cell: ({ row }) => row.original.state ?? '—' },
    { header: 'Country', cell: ({ row }) => row.original.country ?? '—' },
    {
      header: 'Phone',
      cell: ({ row }) =>
        row.original.phone ? (
          <a href={`tel:${row.original.phone}`} onClick={(e) => e.stopPropagation()} className="hover:text-primary">
            {row.original.phone}
          </a>
        ) : (
          '—'
        ),
    },
    { header: 'Status', cell: ({ row }) => <ActiveBadge active={row.original.isActive} /> },
    {
      id: 'actions',
      header: '',
      meta: { className: 'w-10' },
      cell: ({ row }) =>
        (canWrite || canDelete) && (
          <div onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownTrigger asChild>
                <Button size="icon-sm" variant="ghost" aria-label="Actions">
                  <MoreHorizontal />
                </Button>
              </DropdownTrigger>
              <DropdownContent>
                {canWrite && (
                  <DropdownItem onSelect={() => setEditing(row.original)}>
                    <Pencil /> Edit
                  </DropdownItem>
                )}
                {canDelete && (
                  <DropdownItem danger onSelect={() => setDeleting(row.original)}>
                    <Trash2 /> Delete
                  </DropdownItem>
                )}
              </DropdownContent>
            </DropdownMenu>
          </div>
        ),
    },
  ];

  return (
    <ListLayout
      header={
        <PageHeader
          title="Locations"
          subtitle="Sites and offices of your customers"
          icon={<MapPin />}
          actions={
            canWrite && (
              <Button variant="primary" onClick={() => setEditing(null)}>
                <Plus /> New location
              </Button>
            )
          }
        />
      }
      toolbar={
        <>
          <SearchInput value={t.q} onChange={t.setQ} placeholder="Search name, city, address…" />
          <div className="w-60">
            <EntityPicker kind="company" value={companyId} onChange={(id) => t.setFilter('companyId', id)} placeholder="All companies" />
          </div>
        </>
      }
    >
      <DataTable
        className="h-full"
        columns={columns}
        data={list.data?.data}
        total={list.data?.total}
        page={t.page}
        pageSize={t.pageSize}
        loading={list.isLoading}
        onPageChange={t.setPage}
        onRowClick={canWrite ? (r) => setEditing(r) : undefined}
        empty={
          <EmptyState
            icon={<MapPin />}
            title="No locations found"
            description="Add the offices and sites of your customers to link contacts and assets to them."
            action={
              canWrite && (
                <Button variant="primary" onClick={() => setEditing(null)}>
                  <Plus /> New location
                </Button>
              )
            }
          />
        }
      />
      <LocationDialog open={editing !== undefined} onOpenChange={(o) => !o && setEditing(undefined)} location={editing ?? null} defaultCompanyId={companyId} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete location?"
        description={`"${deleting?.name}" will be removed. Contacts and assets linked to it keep existing but lose the location.`}
        confirmLabel="Delete"
        danger
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </ListLayout>
  );
}

function LocationDialog({ open, onOpenChange, location, defaultCompanyId }: { open: boolean; onOpenChange: (o: boolean) => void; location: LocationRow | null; defaultCompanyId: number | null }) {
  const qc = useQueryClient();
  const { register, handleSubmit, reset, setError, control, formState } = useForm<FormValues>({ defaultValues: empty });

  useEffect(() => {
    if (!open) return;
    if (location) {
      const { id: _id, companyName: _cn, ...rest } = location;
      void _id;
      void _cn;
      reset({ ...empty, ...Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, v ?? ''])), companyId: location.companyId } as FormValues);
    } else reset({ ...empty, companyId: defaultCompanyId });
  }, [open, location, defaultCompanyId, reset]);

  const save = useMutation({
    mutationFn: (v: FormValues) => {
      if (location) {
        const { companyId: _c, ...patch } = v;
        void _c;
        return api.patch<LocationRow>(`/locations/${location.id}`, patch);
      }
      return api.post<LocationRow>('/locations', v);
    },
    onSuccess: () => {
      toast.success(location ? 'Location updated' : 'Location created');
      qc.invalidateQueries({ queryKey: ['locations'] });
      qc.invalidateQueries({ queryKey: ['picker', 'location'] });
      onOpenChange(false);
    },
    onError: (e) => handleFormError(e, setError),
  });

  const err = (k: keyof FormValues) => formState.errors[k]?.message as string | undefined;
  const submit = handleSubmit((v) => save.mutate(v));

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={location ? `Edit ${location.name}` : 'New location'}
      size="lg"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>
            {location ? 'Save changes' : 'Create location'}
          </Button>
        </>
      }
    >
      <form className="space-y-5" onSubmit={submit}>
        <FormSection title="General">
          <FormGrid cols={2}>
            <FormField label="Company" required error={err('companyId')} hint={location ? 'A location cannot be moved to another company.' : undefined}>
              <Controller
                control={control}
                name="companyId"
                render={({ field }) => <EntityPicker kind="company" value={field.value} onChange={field.onChange} label={location?.companyName} disabled={!!location} invalid={!!err('companyId')} />}
              />
            </FormField>
            <FormField label="Name" required error={err('name')}>
              <Input {...register('name')} placeholder="e.g. Head office" aria-invalid={!!err('name')} />
            </FormField>
            <FormField label="Phone" error={err('phone')}>
              <Input {...register('phone')} />
            </FormField>
          </FormGrid>
          <div className="flex gap-5">
            <Checkbox label="Primary location" {...register('isPrimary')} />
            <Checkbox label="Active" {...register('isActive')} />
          </div>
        </FormSection>
        <FormSection title="Address">
          <FormGrid cols={2}>
            <FormField label="Address line 1">
              <Input {...register('address1')} />
            </FormField>
            <FormField label="Address line 2">
              <Input {...register('address2')} />
            </FormField>
          </FormGrid>
          <FormGrid cols={4}>
            <FormField label="Postal code">
              <Input {...register('postalCode')} />
            </FormField>
            <FormField label="City">
              <Input {...register('city')} />
            </FormField>
            <FormField label="State / region">
              <Input {...register('state')} />
            </FormField>
            <FormField label="Country">
              <Input {...register('country')} />
            </FormField>
          </FormGrid>
        </FormSection>
        <FormField label="Notes">
          <Textarea rows={3} {...register('notes')} placeholder="Access instructions, opening hours, parking…" />
        </FormField>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
