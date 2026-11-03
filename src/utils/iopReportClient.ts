/**
 * Month-end IOP report, client side: one cached read per month and owner
 * scope, cleared after an upload / delete and when registries change.
 */
import { fetchIopAgents, fetchIopReport } from '../lib/iopReport.functions';
import { CLOUD_HYDRATED_EVENT, REGISTRIES_CHANGED_EVENT } from '../lib/cloudSyncEvents';
import { toIsoPeriod } from './periodUtils';
import type { IopOwnerAgentsView, IopReportSummary } from './iopReport';

export const IOP_REPORT_EVENT = 'iop-report-updated';

export interface IopReportView {
  month: string;
  fileName: string;
  uploadedAt: string;
  summary: IopReportSummary;
}

const cache = new Map<string, Promise<unknown>>();
if (typeof window !== 'undefined') {
  const clear = () => cache.clear();
  [IOP_REPORT_EVENT, CLOUD_HYDRATED_EVENT, REGISTRIES_CHANGED_EVENT].forEach(e => window.addEventListener(e, clear));
}

function cached<T>(kind: string, period: string, ownerId: string | undefined, fetch: (month: string) => Promise<T | null | undefined>): Promise<T | null> {
  const month = toIsoPeriod(period);
  if (!/^\d{4}-\d{2}$/.test(month)) return Promise.resolve(null);
  const key = `${kind}|${month}|${ownerId || 'all'}`;
  let promise = cache.get(key) as Promise<T | null> | undefined;
  if (!promise) {
    promise = fetch(month).then(r => r ?? null);
    cache.set(key, promise);
    promise.catch(() => cache.delete(key));
  }
  return promise;
}

/** The month's IOP report (all owners for staff; `ownerId` = that owner's line), or null. */
export function loadIopReport(period: string, ownerId?: string): Promise<IopReportView | null> {
  return cached('report', period, ownerId, month => fetchIopReport({ data: { month, ownerId } }) as Promise<IopReportView | null>);
}

/** One owner's REWARD / CLAWBACK agents for the month, or null when the month has no IOP report. */
export function loadIopAgents(period: string, ownerId?: string): Promise<IopOwnerAgentsView | null> {
  if (!ownerId) return Promise.resolve(null);
  return cached('agents', period, ownerId, month => fetchIopAgents({ data: { month, ownerId } }) as Promise<IopOwnerAgentsView | null>);
}

/** Each owner's REWARD for KPI 1 (company-level REWARD under the unassigned key), or null when the month has no IOP report. */
export function iopRewardByOwner(report: IopReportView | null): Map<string, number> | null {
  if (!report) return null;
  return new Map(report.summary.byOwner.map(o => [o.ownerId, o.reward]));
}
