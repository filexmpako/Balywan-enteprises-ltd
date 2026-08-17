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

export async function saveMonthlyServicingData(
  reportingMonth: string,
  rows: any[],
  columns: string[]
): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([ROW_STORE, COL_STORE], 'readwrite');
    const rowStore = transaction.objectStore(ROW_STORE);
    const colStore = transaction.objectStore(COL_STORE);

    transaction.onerror = () => {
      reject(transaction.error);
    };

    transaction.oncomplete = () => {
      resolve();
    };

    // Save columns
    colStore.put({
      reportingMonth,
      columns
    });

    // Save rows using stable compositeKey
    rows.forEach((row) => {
      const stableId = row.MSISDN || row.msisdn || row.phone || row._id || row.id;
      if (!stableId) {
        console.warn('Skipping monthly row missing MSISDN or ID:', row);
        return;
      }
      const compositeKey = `${reportingMonth}_${stableId}`;
      const enrichedRow = {
        ...row,
        reportingMonth,
        compositeKey,
        // Ensure indexed fields are explicitly on the top-level row structure
        siteid: row.siteid || row.site_id || row.SiteID || row.SITEID || '',
        Sales_region: row.Sales_region || row.sales_region || row.Region || row.sales_zone || '',
        Owner_Name: row.Owner_Name || row.owner_name || row['Wakala Name'] || row.owner || '',
        MSISDN: row.MSISDN || row.msisdn || row.phone || '',
        servicing_status: row.servicing_status || row.status || row.Status || ''
      };
      rowStore.put(enrichedRow);
    });
  });
}

export async function getServicingRows(reportingMonth?: string): Promise<any[]> {
  await cleanupDuplicateServicingData();
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([ROW_STORE], 'readonly');
    const store = transaction.objectStore(ROW_STORE);
    const request = reportingMonth 
      ? store.index('reportingMonth').getAll(IDBKeyRange.only(reportingMonth))
      : store.getAll();

    request.onsuccess = () => {
      resolve(request.result || []);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function getServicingColumns(reportingMonth: string): Promise<string[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([COL_STORE], 'readonly');
    const store = transaction.objectStore(COL_STORE);
    const request = store.get(reportingMonth);

    request.onsuccess = () => {
      resolve(request.result ? request.result.columns : []);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function clearMonthlyServicingData(reportingMonth: string): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([ROW_STORE, COL_STORE], 'readwrite');
    const rowStore = transaction.objectStore(ROW_STORE);
    const colStore = transaction.objectStore(COL_STORE);

    colStore.delete(reportingMonth);

    const index = rowStore.index('reportingMonth');
    const range = IDBKeyRange.only(reportingMonth);
    const cursorRequest = index.openCursor(range);

    cursorRequest.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onerror = () => {
      reject(transaction.error);
    };
  });
}

export async function saveWeeklyServicingData(
  reportingWeek: string,
  reportingMonth: string,
  rows: any[],
  columns: string[]
): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([WEEKLY_ROW_STORE, WEEKLY_COL_STORE], 'readwrite');
    const rowStore = transaction.objectStore(WEEKLY_ROW_STORE);
    const colStore = transaction.objectStore(WEEKLY_COL_STORE);

    transaction.onerror = () => {
      reject(transaction.error);
    };

    transaction.oncomplete = () => {
      resolve();
    };

    // Save columns
    colStore.put({
      reportingWeek,
      columns
    });

    // Save rows using stable compositeKey
    rows.forEach((row) => {
      const stableId = row.MSISDN || row.msisdn || row.phone || row._id || row.id;
      if (!stableId) {
        console.warn('Skipping weekly row missing MSISDN or ID:', row);
        return;
      }
      const compositeKey = `${reportingWeek}_${stableId}`;
      const enrichedRow = {
        ...row,
        reportingWeek,
        reportingMonth,
        compositeKey,
        // Ensure indexed fields are explicitly on the top-level row structure
        siteid: row.siteid || row.site_id || row.SiteID || row.SITEID || '',
        Sales_region: row.Sales_region || row.sales_region || row.Region || row.sales_zone || '',
        Owner_Name: row.Owner_Name || row.owner_name || row['Wakala Name'] || row.owner || '',
        MSISDN: row.MSISDN || row.msisdn || row.phone || '',
        servicing_status: row.servicing_status || row.status || row.Status || ''
      };
      rowStore.put(enrichedRow);
    });
  });
}

export async function getWeeklyServicingRows(reportingWeek: string): Promise<any[]> {
  await cleanupDuplicateServicingData();
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([WEEKLY_ROW_STORE], 'readonly');
    const store = transaction.objectStore(WEEKLY_ROW_STORE);
    const index = store.index('reportingWeek');
    const request = index.getAll(IDBKeyRange.only(reportingWeek));

    request.onsuccess = () => {
      resolve(request.result || []);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function getWeeklyServicingColumns(reportingWeek: string): Promise<string[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([WEEKLY_COL_STORE], 'readonly');
    const store = transaction.objectStore(WEEKLY_COL_STORE);
    const request = store.get(reportingWeek);

    request.onsuccess = () => {
      resolve(request.result ? request.result.columns : []);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function clearWeeklyServicingData(reportingWeek: string): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([WEEKLY_ROW_STORE, WEEKLY_COL_STORE], 'readwrite');
    const rowStore = transaction.objectStore(WEEKLY_ROW_STORE);
    const colStore = transaction.objectStore(WEEKLY_COL_STORE);

    colStore.delete(reportingWeek);

    const index = rowStore.index('reportingWeek');
    const range = IDBKeyRange.only(reportingWeek);
    const cursorRequest = index.openCursor(range);

    cursorRequest.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onerror = () => {
      reject(transaction.error);
    };
  });
}

function getDedupeKey(r: any): string {
  const id = r['Transaction ID'] || r['transactionId'] || r._id || '';
  const msisdn = (r['Branch_msisdn'] || r['branch_msisdn'] || '').trim();
  if (id && msisdn) {
    return `${String(id).toLowerCase()}_${msisdn}`;
  }
  return r._id || `row_${Math.random()}`;
}

let migrationPromise: Promise<void> | null = null;

export async function migrateLocalStorageToIndexedDB(): Promise<void> {
  if (migrationPromise) return migrationPromise;
  migrationPromise = (async () => {
    try {
      const saved = localStorage.getItem('servicingDataRows');
      if (saved) {
        let rows: any[] = [];
        try {
          rows = JSON.parse(saved);
        } catch (e) {
          console.error('Failed to parse servicingDataRows from localStorage during migration:', e);
        }
        if (Array.isArray(rows) && rows.length > 0) {
          await saveDailyServicingData(rows);
        }
        localStorage.removeItem('servicingDataRows');
        console.log(`Migrated ${rows.length} rows from localStorage servicingDataRows into WakalaServicingDB IndexedDB.`);
      }
    } catch (err) {
      console.error('Failed migrating servicingDataRows to IndexedDB:', err);
    }
  })();
  return migrationPromise;
}

export async function getDailyServicingRows(): Promise<any[]> {
  await migrateLocalStorageToIndexedDB();
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([DAILY_ROW_STORE], 'readonly');
    const store = transaction.objectStore(DAILY_ROW_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      resolve(request.result || []);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function saveDailyServicingData(newRows: any[]): Promise<void> {
  if (!Array.isArray(newRows) || newRows.length === 0) return;
  const db = await initDB();

  // Deduplicate within the incoming batch (keeping last occurrence) and assign stable _id
  const batchMap = new Map<string, any>();
  newRows.forEach((row, index) => {
    const key = getDedupeKey(row);
    const stableId = row._id || key || `mgt-row-${index}`;
    batchMap.set(stableId, {
      ...row,
      _id: stableId,
      servicingDate: row.servicingDate || row['Servicing Date'] || row.Servicing_Date || row.date || '',
      Branch_msisdn: row.Branch_msisdn || row['Branch_msisdn'] || row.branch_msisdn || row.msisdn || ''
    });
  });

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([DAILY_ROW_STORE], 'readwrite');
    const store = transaction.objectStore(DAILY_ROW_STORE);

    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => {
      window.dispatchEvent(new CustomEvent('servicing-rows-updated'));
      resolve();
    };

    batchMap.forEach((enrichedRow) => {
      store.put(enrichedRow);
    });
  });
}

export async function appendDailyServicingData(newRows: any[]): Promise<void> {
  return saveDailyServicingData(newRows);
}

export async function clearDailyServicingData(): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([DAILY_ROW_STORE], 'readwrite');
    const store = transaction.objectStore(DAILY_ROW_STORE);
    const request = store.clear();

    request.onsuccess = () => {
      localStorage.removeItem('servicingDataRows');
      window.dispatchEvent(new CustomEvent('servicing-rows-updated'));
      resolve();
    };

    request.onerror = () => reject(request.error);
  });
}

export async function saveClassificationAuditRecords(records: any[]): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([AUDIT_LOG_STORE], 'readwrite');
    const store = transaction.objectStore(AUDIT_LOG_STORE);
    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => resolve();
    records.forEach((record) => {
      if (record?.transactionId) {
        store.put(record); // put() = insert or overwrite by transactionId, this is the dedup
      }
    });
  });
}

export async function getClassificationAuditLogs(): Promise<any[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([AUDIT_LOG_STORE], 'readonly');
    const store = transaction.objectStore(AUDIT_LOG_STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function clearClassificationAuditLogs(): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([AUDIT_LOG_STORE], 'readwrite');
    const store = transaction.objectStore(AUDIT_LOG_STORE);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

