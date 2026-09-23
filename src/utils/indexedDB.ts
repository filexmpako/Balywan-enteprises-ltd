import { invalidateClassificationCache } from './classificationCache';

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

let cleanupPromise: Promise<{ totalRemoved: number; perMonthCount: Record<string, number> }> | null = null;

export async function cleanupDuplicateServicingData(): Promise<{ totalRemoved: number; perMonthCount: Record<string, number> }> {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = runCleanup();
  return cleanupPromise;
}

async function runCleanup(): Promise<{ totalRemoved: number; perMonthCount: Record<string, number> }> {
  const db = await initDB();
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction([ROW_STORE], 'readwrite');
      const store = transaction.objectStore(ROW_STORE);
      const getAllReq = store.getAll();

      getAllReq.onerror = () => {
        console.error('Error reading ROW_STORE during cleanup:', getAllReq.error);
        resolve({ totalRemoved: 0, perMonthCount: {} });
      };

      getAllReq.onsuccess = () => {
        const allRows: any[] = getAllReq.result || [];
        if (allRows.length === 0) {
          resolve({ totalRemoved: 0, perMonthCount: {} });
          return;
        }

        const getRowMsisdn = (r: any) => (r.MSISDN || r.msisdn || r.phone || r._id || r.id || '').toString().trim();
        const grouped: Record<string, Record<string, any[]>> = {};

        allRows.forEach(row => {
          const month = row.reportingMonth || 'UNKNOWN_MONTH';
          const msisdn = getRowMsisdn(row);
          if (!msisdn) return;

          if (!grouped[month]) grouped[month] = {};
          if (!grouped[month][msisdn]) grouped[month][msisdn] = [];
          grouped[month][msisdn].push(row);
        });

        const perMonthCount: Record<string, number> = {};
        let totalRemoved = 0;

        Object.entries(grouped).forEach(([month, msisdnMap]) => {
          let removedInMonth = 0;

          Object.entries(msisdnMap).forEach(([msisdn, rows]) => {
            const stableCompositeKey = `${month}_${msisdn}`;

            if (rows.length > 1) {
              rows.sort((a, b) => {
                const getTs = (r: any) => {
                  if (r.compositeKey === stableCompositeKey) return Number.MAX_SAFE_INTEGER;
                  const match = String(r.compositeKey || '').match(/(\d+)$/);
                  return match ? parseInt(match[1], 10) : 0;
                };
                return getTs(b) - getTs(a);
              });

              const keepRow = rows[0];
              const duplicateRows = rows.slice(1);

              store.put({
                ...keepRow,
                compositeKey: stableCompositeKey
              });

              duplicateRows.forEach(dup => {
                if (dup.compositeKey !== stableCompositeKey) {
                  store.delete(dup.compositeKey);
                }
                removedInMonth++;
                totalRemoved++;
              });

              if (keepRow.compositeKey !== stableCompositeKey) {
                store.delete(keepRow.compositeKey);
              }
            } else {
              const row = rows[0];
              if (row.compositeKey !== stableCompositeKey) {
                store.delete(row.compositeKey);
                store.put({
                  ...row,
                  compositeKey: stableCompositeKey
                });
              }
            }
          });

          if (removedInMonth > 0) {
            perMonthCount[month] = removedInMonth;
          }
        });

        transaction.oncomplete = () => {
          if (totalRemoved > 0) {
            console.log(`[IndexedDB Cleanup] Removed ${totalRemoved} duplicate monthly servicing rows:`, perMonthCount);
            invalidateClassificationCache();
          } else {
            console.log('[IndexedDB Cleanup] No duplicate monthly servicing rows found.');
          }

          cleanupWeeklyStore(db).then(() => {
            resolve({ totalRemoved, perMonthCount });
          }).catch(() => {
            resolve({ totalRemoved, perMonthCount });
          });
        };

        transaction.onerror = () => {
          console.error('Transaction error during cleanup:', transaction.error);
          resolve({ totalRemoved: 0, perMonthCount: {} });
        };
      };
    } catch (err) {
      console.error('Error during runCleanup:', err);
      resolve({ totalRemoved: 0, perMonthCount: {} });
    }
  });
}

async function cleanupWeeklyStore(db: IDBDatabase): Promise<void> {
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction([WEEKLY_ROW_STORE], 'readwrite');
      const store = transaction.objectStore(WEEKLY_ROW_STORE);
      const getAllReq = store.getAll();

      getAllReq.onerror = () => resolve();
      getAllReq.onsuccess = () => {
        const allRows: any[] = getAllReq.result || [];
        if (allRows.length === 0) {
          resolve();
          return;
        }

        const getRowMsisdn = (r: any) => (r.MSISDN || r.msisdn || r.phone || r._id || r.id || '').toString().trim();
        const grouped: Record<string, Record<string, any[]>> = {};

        allRows.forEach(row => {
          const week = row.reportingWeek || 'UNKNOWN_WEEK';
          const msisdn = getRowMsisdn(row);
          if (!msisdn) return;

          if (!grouped[week]) grouped[week] = {};
          if (!grouped[week][msisdn]) grouped[week][msisdn] = [];
          grouped[week][msisdn].push(row);
        });

        let totalRemoved = 0;

        Object.entries(grouped).forEach(([week, msisdnMap]) => {
          Object.entries(msisdnMap).forEach(([msisdn, rows]) => {
            const stableCompositeKey = `${week}_${msisdn}`;

            if (rows.length > 1) {
              rows.sort((a, b) => {
                const getTs = (r: any) => {
                  if (r.compositeKey === stableCompositeKey) return Number.MAX_SAFE_INTEGER;
                  const match = String(r.compositeKey || '').match(/(\d+)$/);
                  return match ? parseInt(match[1], 10) : 0;
                };
                return getTs(b) - getTs(a);
              });

              const keepRow = rows[0];
              const duplicateRows = rows.slice(1);

              store.put({
                ...keepRow,
                compositeKey: stableCompositeKey
              });

              duplicateRows.forEach(dup => {
                if (dup.compositeKey !== stableCompositeKey) {
                  store.delete(dup.compositeKey);
                }
                totalRemoved++;
              });

              if (keepRow.compositeKey !== stableCompositeKey) {
                store.delete(keepRow.compositeKey);
              }
            } else {
              const row = rows[0];
              if (row.compositeKey !== stableCompositeKey) {
                store.delete(row.compositeKey);
                store.put({
                  ...row,
                  compositeKey: stableCompositeKey
                });
              }
            }
          });
        });

        transaction.oncomplete = () => {
          if (totalRemoved > 0) {
            console.log(`[IndexedDB Cleanup] Removed ${totalRemoved} duplicate weekly servicing rows.`);
            invalidateClassificationCache();
          }
          resolve();
        };

        transaction.onerror = () => resolve();
      };
    } catch (e) {
      resolve();
    }
  });
}

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
export async function getDailyServicingRows(): Promise<any[]> {
  const { fetchTransactions } = await import('../lib/hasidadi.functions');
  const rows = await fetchTransactions({ data: {} });
  return Array.isArray(rows) ? rows : [];
}

export async function saveDailyServicingData(newRows: any[]): Promise<void> {
  // No-op: the rows were already persisted server-side by the caller's own
  // ingestServicingRows call. This just tells mounted views to re-fetch.
  if (!Array.isArray(newRows) || newRows.length === 0) return;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('servicing-rows-updated'));
}

export async function appendDailyServicingData(newRows: any[]): Promise<void> {
  return saveDailyServicingData(newRows);
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
