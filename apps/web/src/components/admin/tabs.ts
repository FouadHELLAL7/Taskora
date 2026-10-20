import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Active tab kept in the URL (?tab=…) so admin sections are linkable and
 * survive reloads. Switching tab drops the previous tab's list state.
 */
export function useTabParam(defaultTab: string, key = 'tab') {
  const [params, setParams] = useSearchParams();
  const tab = params.get(key) ?? defaultTab;
  const setTab = useCallback(
    (value: string) => {
      const next = new URLSearchParams();
      if (value !== defaultTab) next.set(key, value);
      setParams(next, { replace: true });
    },
    [defaultTab, key, setParams],
  );
  return [tab, setTab] as const;
}
