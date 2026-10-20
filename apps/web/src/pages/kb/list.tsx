import { Link, useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BookOpen, Eye, Folder, Lock, Plus, Tag } from 'lucide-react';
import { KB_STATUS } from '@taskora/shared';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn, fmtRelative } from '@/lib/utils';
import { useTableState } from '@/hooks/use-table-state';
import { FilterSelect, PageHeader, SearchInput } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui/misc';
import { EntityPicker } from '@/components/entity-picker';

export interface ArticleRow {
  id: number;
  articleNumber: string;
  title: string;
  excerpt: string;
  categoryId: number | null;
  categoryName: string | null;
  companyId: number | null;
  companyName: string | null;
  tags: string[];
  visibility: string;
  status: string;
  views: number;
  authorName: string | null;
  updatedAt: string;
}

export function ArticleList({ scope }: { scope: 'kb' | 'docs' }) {
  const navigate = useNavigate();
  const { can } = useAuth();
  const t = useTableState({ pageSize: 30 });
  const cats = useQuery({ queryKey: ['kb-categories'], queryFn: () => api.get<{ data: { id: number; name: string }[] }>('/kb/categories') });
  const list = useQuery({ queryKey: ['kb', scope, t.query], queryFn: () => api.get<Paginated<ArticleRow>>('/kb/articles', { ...t.query, scope } as never), placeholderData: keepPreviousData });
  const docs = scope === 'docs';
  const pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / t.pageSize));

  return (
    <div>
      <PageHeader
        title={docs ? 'Documentation' : 'Knowledge Base'}
        icon={<BookOpen />}
        subtitle={docs ? 'Company-specific documentation: network layouts, procedures, configurations' : 'Reusable solutions and procedures for the service desk'}
        actions={
          can('kb.write') && (
            <Button variant="primary" onClick={() => navigate(`/kb/new${docs && t.filters.companyId ? `?companyId=${t.filters.companyId}` : docs ? '?docs=1' : ''}`)}>
              <Plus /> {docs ? 'New document' : 'New article'}
            </Button>
          )
        }
      >
        <div className="flex flex-wrap items-center gap-2 pb-3">
          <SearchInput value={t.q} onChange={t.setQ} placeholder={docs ? 'Search documentation…' : 'Search articles, tags…'} className="w-80" />
          {docs && (
            <div className="w-56">
              <EntityPicker kind="company" value={t.filters.companyId ? Number(t.filters.companyId) : null} onChange={(id) => t.setFilter('companyId', id)} placeholder="All companies" />
            </div>
          )}
          <FilterSelect value={t.filters.status} onChange={(v) => t.setFilter('status', v)} placeholder="Any status" options={KB_STATUS.values.map((v) => ({ value: v, label: KB_STATUS.labels[v] }))} />
          <FilterSelect
            value={t.filters.visibility}
            onChange={(v) => t.setFilter('visibility', v)}
            placeholder="Any visibility"
            options={[
              { value: 'internal', label: 'Internal' },
              { value: 'public', label: 'Public' },
            ]}
          />
          {t.filters.tag && (
            <Badge tone="primary">
              <Tag className="size-3" /> {t.filters.tag}
              <button className="ml-1 cursor-pointer" onClick={() => t.setFilter('tag', null)}>
                ×
              </button>
            </Badge>
          )}
        </div>
      </PageHeader>
      <div className={cn('grid gap-4 p-5', !docs && 'lg:grid-cols-[220px_1fr]')}>
        {!docs ? (
          <Card className="h-fit p-2">
            <button onClick={() => t.setFilter('categoryId', null)} className={cn('flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-surface-2', !t.filters.categoryId && 'bg-surface-2 font-medium')}>
              <Folder className="size-3.5 text-muted" /> All categories
            </button>
            {cats.data?.data.map((c) => (
              <button
                key={c.id}
                onClick={() => t.setFilter('categoryId', c.id)}
                className={cn('flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-surface-2', t.filters.categoryId === String(c.id) && 'bg-surface-2 font-medium')}
              >
                <Folder className="size-3.5 text-muted" /> {c.name}
              </button>
            ))}
          </Card>
        ) : null}
        <div className="space-y-2">
          {list.isLoading && Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
          {list.data?.data.length === 0 && <EmptyState icon={<BookOpen />} title="No articles found" />}
          {list.data?.data.map((a) => (
            <Card key={a.id} className="cursor-pointer p-4 transition-colors hover:border-border-strong" onClick={() => navigate(`/kb/${a.id}`)}>
              <div className="flex flex-wrap items-center gap-2">
                <Link to={`/kb/${a.id}`} className="text-[14px] font-semibold hover:text-primary">
                  {a.title}
                </Link>
                {a.status !== 'published' && <Badge tone={a.status === 'draft' ? 'warning' : 'neutral'}>{KB_STATUS.labels[a.status as keyof typeof KB_STATUS.labels]}</Badge>}
                {a.visibility === 'internal' ? (
                  <Badge>
                    <Lock className="size-3" /> Internal
                  </Badge>
                ) : (
                  <Badge tone="info">Public</Badge>
                )}
              </div>
              <p className="mt-1 line-clamp-2 text-[13px] text-muted">{a.excerpt}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-subtle">
                <span className="font-mono">{a.articleNumber}</span>
                {a.companyName && <span>· {a.companyName}</span>}
                {a.categoryName && <span>· {a.categoryName}</span>}
                <span>· {a.authorName ?? 'Unknown'}</span>
                <span>· updated {fmtRelative(a.updatedAt)}</span>
                <span className="inline-flex items-center gap-1">
                  · <Eye className="size-3" /> {a.views}
                </span>
                {a.tags.map((tag) => (
                  <button
                    key={tag}
                    onClick={(e) => {
                      e.stopPropagation();
                      t.setFilter('tag', tag);
                    }}
                    className="cursor-pointer rounded bg-surface-2 px-1.5 py-0.5 text-muted hover:text-foreground"
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            </Card>
          ))}
          {pages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2 text-xs text-muted">
              <Button size="sm" disabled={t.page <= 1} onClick={() => t.setPage(t.page - 1)}>
                Previous
              </Button>
              {t.page} / {pages}
              <Button size="sm" disabled={t.page >= pages} onClick={() => t.setPage(t.page + 1)}>
                Next
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function KnowledgeBasePage() {
  return <ArticleList scope="kb" />;
}
