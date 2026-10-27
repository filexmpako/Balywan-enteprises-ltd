import { useEffect, useState } from 'react';
import type { ClassifiedRow } from '../utils/classification';
import { getDailyServicingRows } from '../utils/indexedDB';
import { classifyWithStoredRegistries } from '../utils/classificationCache';
import { CLOUD_HYDRATED_EVENT } from '../lib/cloudSyncEvents';

/**
 * One month's classified Daily MGT rows (none when `period` is empty). Shares
 * the per-month download with every other view, and reloads when data or
 * registries are refreshed.
 */
export function useClassifiedMonth(period: string | null | undefined): ClassifiedRow[] {
  const [rows, setRows] = useState<ClassifiedRow[]>([]);
  useEffect(() => {
    if (!period) {
      setRows([]);
      return;
    }
    let cancelled = false;
    const load = () =>
      getDailyServicingRows(period)
        .then(r => {
          if (!cancelled) setRows(classifyWithStoredRegistries(r));
        })
        .catch(err => console.error('Daily MGT load failed:', err));
    load();
    window.addEventListener('servicing-rows-updated', load);
    window.addEventListener(CLOUD_HYDRATED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener('servicing-rows-updated', load);
      window.removeEventListener(CLOUD_HYDRATED_EVENT, load);
    };
  }, [period]);
  return rows;
}
