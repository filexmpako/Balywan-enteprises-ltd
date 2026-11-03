import { useEffect, useState } from 'react';
import { IOP_REPORT_EVENT, loadIopAgents, loadIopReport, type IopReportView } from '../utils/iopReportClient';
import type { IopOwnerAgentsView } from '../utils/iopReport';
import { CLOUD_HYDRATED_EVENT, REGISTRIES_CHANGED_EVENT } from '../lib/cloudSyncEvents';

/** undefined while loading, null when there is nothing (or it could not be read); reloads after uploads and registry changes. */
function useIopData<T>(load: (period: string, ownerId?: string) => Promise<T | null>, period: string, ownerId?: string): T | null | undefined {
  const [value, setValue] = useState<T | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    const run = () =>
      load(period, ownerId)
        .then(r => { if (!cancelled) setValue(r); })
        .catch(err => {
          console.error('IOP report load failed:', err);
          if (!cancelled) setValue(null);
        });
    setValue(undefined);
    run();
    const events = [IOP_REPORT_EVENT, CLOUD_HYDRATED_EVENT, REGISTRIES_CHANGED_EVENT];
    events.forEach(e => window.addEventListener(e, run));
    return () => {
      cancelled = true;
      events.forEach(e => window.removeEventListener(e, run));
    };
  }, [load, period, ownerId]);
  return value;
}

/** The month's IOP report; `ownerId` limits it to that owner. */
export function useIopReport(period: string, ownerId?: string): IopReportView | null | undefined {
  return useIopData(loadIopReport, period, ownerId);
}

/** One owner's REWARD / CLAWBACK agents for the month. */
export function useIopAgents(period: string, ownerId?: string): IopOwnerAgentsView | null | undefined {
  return useIopData(loadIopAgents, period, ownerId);
}
