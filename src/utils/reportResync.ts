/**
 * Report resync, client side. Uploaded reports keep working off the data
 * already stored: after owners, tills, SA tills or the Base Wakala Index
 * change, this re-attributes what was stamped at upload time (Daily MGT
 * transaction owners and buckets, priority wakala owners, Weekly and Monthly
 * report row owners) so no file has to be uploaded again. Runs on its own after staff edit those registries, and
 * from the "Resync now" button.
 */
import { resyncDailyTransactions, resyncPriorityWakalas, resyncReportOwners } from '../lib/resync.functions';
import { hydrateFromCloud, whenSynced } from '../lib/cloudSync';
import { REGISTRIES_CHANGED_EVENT } from '../lib/cloudSyncEvents';
import { getDailyServicingRows } from './indexedDB';
import { invalidateClassificationCache } from './classificationCache';

export interface ResyncResult {
  at: string;
  months: string[];
  transactionsChecked: number;
  transactionsUpdated: number;
  priorityChecked: number;
  priorityUpdated: number;
  reportRowsChecked: number;
  reportRowsUpdated: number;
  indexOwnersLinked: number;
}

export const RESYNC_DONE_EVENT = 'reports-resynced';
const LAST_KEY = 'reportResyncLast';

export function readLastResync(): ResyncResult | null {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) || 'null');
  } catch {
    return null;
  }
}

let running: Promise<ResyncResult> | null = null;

/** One resync at a time; a call while one runs joins it. */
export function resyncReports(onProgress?: (message: string) => void): Promise<ResyncResult> {
  if (!running) running = run(onProgress).finally(() => { running = null; });
  return running;
}

async function run(onProgress?: (message: string) => void): Promise<ResyncResult> {
  // Registry edits are pushed to the server shortly after they are made;
  // re-attributing before they land would use the old registries.
  await whenSynced();

  // Index owners first: priority wakalas and report rows are attributed from them.
  onProgress?.('Weekly and Monthly report owners…');
  const reports = await resyncReportOwners();

  onProgress?.('Priority wakala list…');
  const priority = await resyncPriorityWakalas();

  const rows = await getDailyServicingRows();
  const months = Array.from(
    new Set(rows.map(r => String(r?.['Servicing Date'] || '').slice(0, 7)).filter(m => /^\d{4}-\d{2}$/.test(m))),
  ).sort();

  let checked = 0;
  let updated = 0;
  for (const month of months) {
    for (let offset = 0; ; ) {
      onProgress?.(`Daily MGT ${month}${offset ? ` (${offset.toLocaleString()} rows done)` : ''}…`);
      const res = await resyncDailyTransactions({ data: { period: month, offset } });
      checked += res.checked;
      updated += res.updated;
      if (res.done) break;
      offset += res.checked;
    }
  }

  const result: ResyncResult = {
    at: new Date().toISOString(),
    months,
    transactionsChecked: checked,
    transactionsUpdated: updated,
    priorityChecked: priority.checked,
    priorityUpdated: priority.updated,
    reportRowsChecked: reports.checked,
    reportRowsUpdated: reports.updated,
    indexOwnersLinked: reports.linked,
  };

  // Pull the re-attributed priority list and index into the cache, then let every
  // view (and the weekly history) recompute.
  if (priority.updated > 0 || reports.linked > 0) await hydrateFromCloud();
  invalidateClassificationCache();
  window.dispatchEvent(new Event('servicing-rows-updated'));
  window.dispatchEvent(new Event('weekly-kpi-updated'));
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(result));
  } catch {
    /* display only */
  }
  window.dispatchEvent(new Event(RESYNC_DONE_EVENT));
  return result;
}

/**
 * Staff sessions: resync a few seconds after the last registry change, so a
 * burst of edits (or a Base Wakala upload) triggers one run.
 */
export function startAutoResync(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      resyncReports().catch(err => console.warn('[resync] automatic resync failed', err));
    }, 4000);
  };
  window.addEventListener(REGISTRIES_CHANGED_EVENT, schedule);
  return () => {
    if (timer) clearTimeout(timer);
    window.removeEventListener(REGISTRIES_CHANGED_EVENT, schedule);
  };
}
