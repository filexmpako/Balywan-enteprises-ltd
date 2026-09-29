/**
 * IndexedDB Utility Helper for WakalaServicingDB
 */

const DB_NAME = 'WakalaServicingDB';
const DB_VERSION = 5;
const ROW_STORE = 'monthlyServicingRows';
const COL_STORE = 'monthlyServicingColumns';
const WEEKLY_ROW_STORE = 'weeklyServicingRows';
const WEEKLY_COL_STORE = 'weeklyServicingColumns';
const DAILY_ROW_STORE = 'dailyServicingRows';
const AUDIT_LOG_STORE = 'classificationAuditLogs';

export function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      return reject(err);
    }

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const txn = request.transaction;

      try {
        if (!db.objectStoreNames.contains(ROW_STORE)) {
          const rowStore = db.createObjectStore(ROW_STORE, { keyPath: 'compositeKey' });
          rowStore.createIndex('reportingMonth', 'reportingMonth', { unique: false });
          rowStore.createIndex('siteid', 'siteid', { unique: false });
          rowStore.createIndex('Sales_region', 'Sales_region', { unique: false });
          rowStore.createIndex('Owner_Name', 'Owner_Name', { unique: false });
          rowStore.createIndex('MSISDN', 'MSISDN', { unique: false });
          rowStore.createIndex('servicing_status', 'servicing_status', { unique: false });
        } else if (txn) {
          const rowStore = txn.objectStore(ROW_STORE);
          if (!rowStore.indexNames.contains('reportingMonth')) rowStore.createIndex('reportingMonth', 'reportingMonth', { unique: false });
          if (!rowStore.indexNames.contains('siteid')) rowStore.createIndex('siteid', 'siteid', { unique: false });
          if (!rowStore.indexNames.contains('Sales_region')) rowStore.createIndex('Sales_region', 'Sales_region', { unique: false });
          if (!rowStore.indexNames.contains('Owner_Name')) rowStore.createIndex('Owner_Name', 'Owner_Name', { unique: false });
          if (!rowStore.indexNames.contains('MSISDN')) rowStore.createIndex('MSISDN', 'MSISDN', { unique: false });
          if (!rowStore.indexNames.contains('servicing_status')) rowStore.createIndex('servicing_status', 'servicing_status', { unique: false });
        }

        if (!db.objectStoreNames.contains(COL_STORE)) {
          db.createObjectStore(COL_STORE, { keyPath: 'reportingMonth' });
        }

        if (!db.objectStoreNames.contains(WEEKLY_ROW_STORE)) {
          const weeklyRowStore = db.createObjectStore(WEEKLY_ROW_STORE, { keyPath: 'compositeKey' });
          weeklyRowStore.createIndex('reportingWeek', 'reportingWeek', { unique: false });
          weeklyRowStore.createIndex('reportingMonth', 'reportingMonth', { unique: false });
          weeklyRowStore.createIndex('siteid', 'siteid', { unique: false });
          weeklyRowStore.createIndex('Sales_region', 'Sales_region', { unique: false });
          weeklyRowStore.createIndex('Owner_Name', 'Owner_Name', { unique: false });
          weeklyRowStore.createIndex('MSISDN', 'MSISDN', { unique: false });
          weeklyRowStore.createIndex('servicing_status', 'servicing_status', { unique: false });
        } else if (txn) {
          const weeklyRowStore = txn.objectStore(WEEKLY_ROW_STORE);
          if (!weeklyRowStore.indexNames.contains('reportingWeek')) weeklyRowStore.createIndex('reportingWeek', 'reportingWeek', { unique: false });
          if (!weeklyRowStore.indexNames.contains('reportingMonth')) weeklyRowStore.createIndex('reportingMonth', 'reportingMonth', { unique: false });
          if (!weeklyRowStore.indexNames.contains('siteid')) weeklyRowStore.createIndex('siteid', 'siteid', { unique: false });
          if (!weeklyRowStore.indexNames.contains('Sales_region')) weeklyRowStore.createIndex('Sales_region', 'Sales_region', { unique: false });
          if (!weeklyRowStore.indexNames.contains('Owner_Name')) weeklyRowStore.createIndex('Owner_Name', 'Owner_Name', { unique: false });
          if (!weeklyRowStore.indexNames.contains('MSISDN')) weeklyRowStore.createIndex('MSISDN', 'MSISDN', { unique: false });
          if (!weeklyRowStore.indexNames.contains('servicing_status')) weeklyRowStore.createIndex('servicing_status', 'servicing_status', { unique: false });
        }

        if (!db.objectStoreNames.contains(WEEKLY_COL_STORE)) {
          db.createObjectStore(WEEKLY_COL_STORE, { keyPath: 'reportingWeek' });
        }

        if (!db.objectStoreNames.contains(DAILY_ROW_STORE)) {
          const dailyRowStore = db.createObjectStore(DAILY_ROW_STORE, { keyPath: '_id' });
          dailyRowStore.createIndex('servicingDate', 'servicingDate', { unique: false });
          dailyRowStore.createIndex('Branch_msisdn', 'Branch_msisdn', { unique: false });
        } else if (txn) {
          const dailyRowStore = txn.objectStore(DAILY_ROW_STORE);
          if (dailyRowStore.indexNames.contains('Servicing Date')) {
            try { dailyRowStore.deleteIndex('Servicing Date'); } catch (e) {}
          }
          if (!dailyRowStore.indexNames.contains('servicingDate')) {
            dailyRowStore.createIndex('servicingDate', 'servicingDate', { unique: false });
          }
          if (!dailyRowStore.indexNames.contains('Branch_msisdn')) {
            dailyRowStore.createIndex('Branch_msisdn', 'Branch_msisdn', { unique: false });
          }
        }

        if (!db.objectStoreNames.contains(AUDIT_LOG_STORE)) {
          const auditStore = db.createObjectStore(AUDIT_LOG_STORE, { keyPath: 'transactionId' });
          auditStore.createIndex('classificationBucket', 'classificationBucket', { unique: false });
          auditStore.createIndex('ownerId', 'ownerId', { unique: false });
          auditStore.createIndex('timestamp', 'timestamp', { unique: false });
        } else if (txn) {
          const auditStore = txn.objectStore(AUDIT_LOG_STORE);
          if (!auditStore.indexNames.contains('classificationBucket')) auditStore.createIndex('classificationBucket', 'classificationBucket', { unique: false });
          if (!auditStore.indexNames.contains('ownerId')) auditStore.createIndex('ownerId', 'ownerId', { unique: false });
          if (!auditStore.indexNames.contains('timestamp')) auditStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      } catch (upgradeError) {
        console.error('Error during IndexedDB upgrade:', upgradeError);
        txn?.abort();
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      console.warn('Failed to open WakalaServicingDB, attempting recovery by deleting and recreating...', request.error);
      const deleteReq = indexedDB.deleteDatabase(DB_NAME);
      deleteReq.onsuccess = () => {
        const retryReq = indexedDB.open(DB_NAME, DB_VERSION);
        retryReq.onupgradeneeded = request.onupgradeneeded;
        retryReq.onsuccess = () => resolve(retryReq.result);
        retryReq.onerror = () => reject(retryReq.error);
      };
      deleteReq.onerror = () => reject(request.error);
    };
  });
}

// Monthly servicing data: Postgres is the only store (see monthlyStore.ts /
// monthly.functions.ts). These are thin server-backed shims kept under their
// original names so every existing caller works unchanged with no local
// cache involved anywhere.
export async function saveMonthlyServicingData(
  _reportingMonth: string,
  _rows: any[],
  _columns: string[]
): Promise<void> {
  // No-op: persistence happens via monthlyStore.persistMonthlyServicing ->
  // saveMonthlyServicingRows (Postgres). Nothing to cache locally.
}

export async function getServicingRows(reportingMonth?: string): Promise<any[]> {
  const { fetchMonthlyServicingRows } = await import('../lib/monthly.functions');
  const res = await fetchMonthlyServicingRows({ data: { reportingMonth } });
  return res?.rows ?? [];
}

export async function getServicingColumns(reportingMonth: string): Promise<string[]> {
  const rows = await getServicingRows(reportingMonth);
  return rows.length > 0 ? Object.keys(rows[0]) : [];
}

export async function clearMonthlyServicingData(reportingMonth: string): Promise<void> {
  const { deleteMonthlyServicingRows } = await import('../lib/monthly.functions');
  await deleteMonthlyServicingRows({ data: { reportingMonth } });
}

// Weekly servicing data: Postgres is the only store (see weeklyStore.ts /
// weekly.functions.ts). Same server-backed-shim treatment as Monthly above.
export async function saveWeeklyServicingData(
  _reportingWeek: string,
  _reportingMonth: string,
  _rows: any[],
  _columns: string[]
): Promise<void> {
  // No-op: persistence happens via weeklyStore.persistWeeklyServicing ->
  // saveWeeklyServicingRows (Postgres). Nothing to cache locally.
}

export async function getWeeklyServicingRows(reportingWeek: string): Promise<any[]> {
  const { fetchWeeklyServicingRows } = await import('../lib/weekly.functions');
  const res = await fetchWeeklyServicingRows({ data: { reportingWeek } });
  return res?.rows ?? [];
}

export async function getWeeklyServicingColumns(reportingWeek: string): Promise<string[]> {
  const rows = await getWeeklyServicingRows(reportingWeek);
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
// One shared download per signed-in user: every page used to fetch the full
// Daily MGT set separately. Invalidated whenever data changes (upload,
// realtime from another device, re-hydration). RLS on the server still scopes
// owners to their own transactions.
let dailyCache: { userId: string; promise: Promise<any[]> } | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('servicing-rows-updated', () => { dailyCache = null; }, { capture: true } as any);
}

export async function getDailyServicingRows(): Promise<any[]> {
  const { supabase } = await import('../integrations/supabase/client');
  const { data: s } = await supabase.auth.getSession();
  const userId = s.session?.user?.id ?? '';
  if (dailyCache && dailyCache.userId === userId) return dailyCache.promise;
  const promise = (async () => {
    const { fetchTransactions } = await import('../lib/hasidadi.functions');
    const rows = await fetchTransactions({ data: {} });
    return Array.isArray(rows) ? rows : [];
  })();
  dailyCache = { userId, promise };
  promise.catch(() => { if (dailyCache?.promise === promise) dailyCache = null; });
  return promise;
}

export async function saveDailyServicingData(newRows: any[]): Promise<void> {
  // No-op: the rows were already persisted server-side by the caller's own
  // ingestServicingRows call. This just tells mounted views to re-fetch.
  if (!Array.isArray(newRows) || newRows.length === 0) return;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('servicing-rows-updated'));
}

export async function clearDailyServicingData(): Promise<void> {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('servicing-rows-updated'));
}

// Classification audit trail: Postgres is the only store now (see
// hasidadi.functions.ts's fetchClassificationAuditRecords). Server-side
// ingest already persists the authoritative trail via persistClassifiedRows;
// classifyServicingRows() only calls saveClassificationAuditRecords as a
// client-side fallback, which is now a no-op since there's nowhere local
// left to put it.
export async function saveClassificationAuditRecords(_records: any[]): Promise<void> {
  // No-op.
}

export async function getClassificationAuditLogs(): Promise<any[]> {
  const { fetchClassificationAuditRecords } = await import('../lib/hasidadi.functions');
  const records = await fetchClassificationAuditRecords({ data: {} });
  return Array.isArray(records) ? records : [];
}

export async function clearClassificationAuditLogs(): Promise<void> {
  // No-op: nothing cached locally to clear.
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
