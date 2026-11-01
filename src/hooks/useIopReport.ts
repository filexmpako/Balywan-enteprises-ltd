import { useEffect, useState } from 'react';
import { IOP_REPORT_EVENT, loadIopReport, type IopReportView } from '../utils/iopReportClient';
import { CLOUD_HYDRATED_EVENT, REGISTRIES_CHANGED_EVENT } from '../lib/cloudSyncEvents';

/**
 * The month's IOP report: undefined while loading, null when none was
 * uploaded (or it could not be read). `ownerId` limits it to that owner.
 */
export function useIopReport(period: string, ownerId?: string): IopReportView | null | undefined {
  const [report, setReport] = useState<IopReportView | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      loadIopReport(period, ownerId)
        .then(r => { if (!cancelled) setReport(r); })
        .catch(err => {
          console.error('IOP report load failed:', err);
          if (!cancelled) setReport(null);
        });
    setReport(undefined);
    load();
    const events = [IOP_REPORT_EVENT, CLOUD_HYDRATED_EVENT, REGISTRIES_CHANGED_EVENT];
    events.forEach(e => window.addEventListener(e, load));
    return () => {
      cancelled = true;
      events.forEach(e => window.removeEventListener(e, load));
    };
  }, [period, ownerId]);
  return report;
}
