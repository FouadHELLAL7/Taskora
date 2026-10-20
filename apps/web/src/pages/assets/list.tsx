import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download, HardDrive, Plus } from 'lucide-react';
import { CI_CATEGORY, CI_LIFECYCLE } from '@taskora/shared';
import { api, downloadUrl, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { opts, useLookups } from '@/lib/lookups';
import { useTableState } from '@/hooks/use-table-state';
import { DataTable } from '@/components/data-table';
import { FilterSelect, ListLayout, PageHeader, SearchInput } from '@/components/page';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { EntityPicker } from '@/components/entity-picker';
import { ciColumns, type CiRow } from '@/components/related-tables';
import { CiFormDialog } from '@/components/forms/ci-form';

export function CiListPage({ title, subtitle, fixed = {}, icon }: { title: string; subtitle: string; fixed?: Record<string, string>; icon: React.ReactNode }) {
  const navigate = useNavigate();
  const { can } = useAuth();
  const lookups = useLookups();
  const [params, setParams] = useSearchParams();
  const t = useTableState({ sort: 'name', order: 'asc' });
  const [creating, setCreating] = useState(false);
  const query = { ...t.query, ...fixed };
  const list = useQuery({ queryKey: ['cis', query], queryFn: () => api.get<Paginated<CiRow>>('/configuration-items', query as never), placeholderData: keepPreviousData });

  // Deep link from the company workspace: /assets?new=1&companyId=…
  useEffect(() => {
    if (params.get('new') === '1') {
      setCreating(true);
      const next = new URLSearchParams(params);
      next.delete('new');
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ListLayout
      header={
        <PageHeader
          title={title}
          subtitle={list.data ? `${subtitle} · ${list.data.total} items` : subtitle}
          icon={icon}
          actions={
            <>
              <Button onClick={() => downloadUrl('/configuration-items/export.csv', query as never)}>
                <Download /> Export
              </Button>
              {can('cis.write') && (
                <Button variant="primary" onClick={() => setCreating(true)}>
                  <Plus /> New CI
                </Button>
              )}
            </>
          }
        />
      }
      toolbar={
        <>
          <SearchInput value={t.q} onChange={t.setQ} placeholder="Name, serial, hostname, IP, asset tag, user…" className="w-72" />
          <div className="w-52">
            <EntityPicker kind="company" value={t.filters.companyId ? Number(t.filters.companyId) : null} onChange={(id) => t.setFilter('companyId', id)} placeholder="Any company" />
          </div>
          {!fixed.category && (
            <FilterSelect value={t.filters.category} onChange={(v) => t.setFilter('category', v)} placeholder="Any category" options={CI_CATEGORY.values.map((v) => ({ value: v, label: CI_CATEGORY.labels[v] }))} />
          )}
          <FilterSelect value={t.filters.ciTypeId} onChange={(v) => t.setFilter('ciTypeId', v)} placeholder="Any type" options={opts(lookups.data?.ciTypes)} />
          <FilterSelect value={t.filters.lifecycleStatus} onChange={(v) => t.setFilter('lifecycleStatus', v)} placeholder="Any lifecycle" options={CI_LIFECYCLE.values.map((v) => ({ value: v, label: CI_LIFECYCLE.labels[v] }))} />
          <FilterSelect
            value={t.filters.warranty}
            onChange={(v) => t.setFilter('warranty', v)}
            placeholder="Any warranty"
            options={[
              { value: 'expiring', label: 'Expiring within 90 days' },
              { value: 'expired', label: 'Expired' },
            ]}
          />
          <FilterSelect
            value={t.filters.attention}
            onChange={(v) => t.setFilter('attention', v)}
            placeholder="Any health"
            options={[{ value: 'true', label: 'Needs attention (Action1)' }]}
          />
          <FilterSelect
            value={t.filters.source}
            onChange={(v) => t.setFilter('source', v)}
            placeholder="Any source"
            options={[
              { value: 'manual', label: 'Manual' },
              { value: 'action1', label: 'Action1' },
            ]}
          />
        </>
      }
    >
      <DataTable
        className="h-full"
        columns={ciColumns}
        data={list.data?.data}
        total={list.data?.total}
        page={t.page}
        pageSize={t.pageSize}
        loading={list.isLoading}
        sort={t.sortState}
        onSortChange={t.setSort}
        onPageChange={t.setPage}
        onRowClick={(r) => navigate(`/assets/${r.id}`)}
        empty={<EmptyState icon={<HardDrive />} title="No configuration items found" description="Create CIs manually or connect Action1 to discover devices automatically." />}
      />
      <CiFormDialog
        open={creating}
        onOpenChange={setCreating}
        defaults={t.filters.companyId ? { companyId: Number(t.filters.companyId) } : undefined}
        onSaved={(ci) => navigate(`/assets/${ci.id}`)}
      />
    </ListLayout>
  );
}

export default function AssetsPage() {
  return <CiListPage title="Configuration Items" subtitle="Every managed asset across your customers" icon={<HardDrive />} />;
}
