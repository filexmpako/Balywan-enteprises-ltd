import { toIsoPeriod } from './periodUtils';

/**
 * Servicing data access. Postgres is the only store: these are server-backed
 * reads plus the 'servicing-rows-updated' signal mounted views re-fetch on.
 * (The file name dates from the IndexedDB cache it replaced.)
 */

export async function getServicingRows(reportingMonth?: string): Promise<any[]> {
  const { fetchMonthlyServicingRows } = await import('../lib/monthly.functions');
  const res = await fetchMonthlyServicingRows({ data: { reportingMonth } });
  return res?.rows ?? [];
}

export async function getServicingColumns(reportingMonth: string): Promise<string[]> {
  const rows = await getServicingRows(reportingMonth);
  return rows.length > 0 ? Object.keys(rows[0]) : [];
}

export async function clearWeeklyServicingData(reportingWeek: string): Promise<void> {
  const { deleteWeeklyServicingRows } = await import('../lib/weekly.functions');
  await deleteWeeklyServicingRows({ data: { reportingWeek } });
}

// Daily MGT transaction rows: Postgres is the only store now. Upload
// persistence already happens server-side via ingestServicingRows during
// ingest (see DailyMgtMappingEngine.tsx / UploadReportsView.tsx); these are
// thin server-backed shims kept under their original names so every
// existing caller works unchanged with no local cache involved anywhere.
// One shared download per signed-in user and month (or full history when no
// month is given): every page used to fetch the full Daily MGT set
// separately. Invalidated whenever data changes (upload, realtime from
// another device, re-hydration). RLS on the server still scopes owners to
// their own transactions.
const dailyCache = new Map<string, Promise<any[]>>();
let rangeCache: Promise<{ earliest: string | null; latest: string | null; months: string[] }> | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('servicing-rows-updated', () => { dailyCache.clear(); rangeCache = null; }, { capture: true } as any);
}

async function currentUserId(): Promise<string> {
  const { supabase } = await import('../integrations/supabase/client');
  const { data: s } = await supabase.auth.getSession();
  return s.session?.user?.id ?? '';
}

/**
 * Daily MGT rows for one month ("YYYY-MM" or a label like "October 2026"),
 * or every month when `period` is omitted. Pages that show one reporting
 * month should pass it: full history grows by every day uploaded.
 */
export async function getDailyServicingRows(period?: string): Promise<any[]> {
  const iso = period ? toIsoPeriod(period) : '';
  const month = /^\d{4}-\d{2}$/.test(iso) ? iso : '';
  const key = `${await currentUserId()}|${month || 'all'}`;
  const cached = dailyCache.get(key);
  if (cached) return cached;
  // The full history already holds every month: cut it instead of fetching.
  const all = month ? dailyCache.get(key.replace(/\|.*$/, '|all')) : undefined;
  const promise = all
    ? all.then(rows => rows.filter(r => String(r?.['Servicing Date'] ?? '').slice(0, 7) === month))
    : (async () => {
        const { fetchTransactions } = await import('../lib/hasidadi.functions');
        const rows = await fetchTransactions({ data: month ? { period: month } : {} });
        return Array.isArray(rows) ? rows : [];
      })();
  dailyCache.set(key, promise);
  promise.catch(() => { if (dailyCache.get(key) === promise) dailyCache.delete(key); });
  return promise;
}

/** First/last Daily MGT date and the months holding data, without the rows. */
export function getDailyDateRange(): Promise<{ earliest: string | null; latest: string | null; months: string[] }> {
  if (!rangeCache) {
    const promise = import('../lib/hasidadi.functions').then(({ fetchDailyDateRange }) => fetchDailyDateRange());
    rangeCache = promise;
    promise.catch(() => { if (rangeCache === promise) rangeCache = null; });
  }
  return rangeCache;
}

export async function saveDailyServicingData(newRows: any[]): Promise<void> {
  // No-op: the rows were already persisted server-side by the caller's own
  // ingestServicingRows call. This just tells mounted views to re-fetch.
  if (!Array.isArray(newRows) || newRows.length === 0) return;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('servicing-rows-updated'));
}

export async function getClassificationAuditLogs(): Promise<any[]> {
  const { fetchClassificationAuditRecords } = await import('../lib/hasidadi.functions');
  const records = await fetchClassificationAuditRecords({ data: {} });
  return Array.isArray(records) ? records : [];
}

/**
 * No-op: rows were already purged server-side by the caller (see
 * deleteUploadedReport). Kept under its original name/signature since
 * App.tsx still calls it after that server delete.
 */
export async function deleteDailyServicingRowsByRefs(refs: string[]): Promise<number> {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('servicing-rows-updated'));
  return (refs || []).length;
}
