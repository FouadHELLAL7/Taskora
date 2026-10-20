import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Sort } from '@/components/data-table';

/**
 * List state (page, sort, search, filters) kept in the URL so views are
 * shareable, bookmarkable and survive navigation back from a record.
 */
export function useTableState(defaults: { sort?: string; order?: 'asc' | 'desc'; pageSize?: number; filters?: Record<string, string> } = {}) {
  const [params, setParams] = useSearchParams();

  const state = useMemo(() => {
    const filters: Record<string, string> = { ...(defaults.filters ?? {}) };
    params.forEach((v, k) => {
      if (!['page', 'sort', 'order', 'q', 'pageSize'].includes(k)) filters[k] = v;
    });
    return {
      page: Number(params.get('page') ?? 1) || 1,
      pageSize: Number(params.get('pageSize') ?? defaults.pageSize ?? 50),
      sort: params.get('sort') ?? defaults.sort,
      order: (params.get('order') as 'asc' | 'desc') ?? defaults.order ?? 'desc',
      q: params.get('q') ?? '',
      filters,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const update = useCallback(
    (patch: Record<string, string | number | null | undefined>, resetPage = true) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === undefined || v === '') next.delete(k);
            else next.set(k, String(v));
          }
          if (resetPage && !('page' in patch)) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  return {
    ...state,
    sortState: { sort: state.sort, order: state.order } as Sort,
    setPage: (page: number) => update({ page }, false),
    setSort: (s: Sort) => update({ sort: s.sort, order: s.order }),
    setQ: (q: string) => update({ q }),
    setFilter: (key: string, value: string | number | null | undefined) => update({ [key]: value }),
    setFilters: (patch: Record<string, string | number | null | undefined>) => update(patch),
    reset: () => setParams(new URLSearchParams(), { replace: true }),
    /** Query object to send to the API. */
    query: { page: state.page, pageSize: state.pageSize, sort: state.sort, order: state.order, q: state.q || undefined, ...state.filters },
  };
}

/** Debounced callback helper for search boxes. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms = 250) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
