import * as XLSX from 'xlsx';
import { normalizeMsisdn } from './msisdn';
import { initDB } from './indexedDB';
import { AuditReport } from '../types';

export interface ReferenceRoster {
  validMsisdns: Set<string>;
  validTills: Set<string>;
  validOwnerNames: Set<string>;
  validSiteIds: Set<string>;
}

export interface StoreScanResult {
  storeName: string;
  scanned: number;
  matched: number;
  flagged: number;
  details: string[];
}

export interface CleanupAuditSummary {
  timestamp: string;
  scannedCount: number;
  matchedCount: number;
  flaggedCount: number;
  breakdown: Record<string, StoreScanResult>;
  flaggedSample: Array<{ store: string; identifier: string; reason: string }>;
}

const MONTHLY_ROW_STORE = 'monthlyServicingRows';
const WEEKLY_ROW_STORE = 'weeklyServicingRows';

/**
 * Builds or loads the authoritative Balwyn reference roster.
 * If fileData is provided (ArrayBuffer or row array), it parses columns matching
 * MASTER_FILE_BALWYN_UPDATED or BALWYN_TILL_OWNERS format.
 * Otherwise, it loads reference data from localStorage.
 */
export function buildReferenceRoster(fileData?: ArrayBuffer | any[]): ReferenceRoster {
  const validMsisdns = new Set<string>();
  const validTills = new Set<string>();
  const validOwnerNames = new Set<string>();
  const validSiteIds = new Set<string>();

  // 1. Seed existing Balwyn owners and tills from localStorage
  const savedOwners = localStorage.getItem('ownersList');
  if (savedOwners) {
    try {
      const parsed = JSON.parse(savedOwners);
      if (Array.isArray(parsed)) {
        parsed.forEach((o: any) => {
          if (o.name) validOwnerNames.add(String(o.name).trim().toLowerCase());
          if (o.masterAgentId) validOwnerNames.add(String(o.masterAgentId).trim().toLowerCase());
        });
      }
    } catch {}
  }

  const savedTills = localStorage.getItem('tillsList');
  if (savedTills) {
    try {
      const parsed = JSON.parse(savedTills);
      if (Array.isArray(parsed)) {
        parsed.forEach((t: any) => {
          const msisdn = normalizeMsisdn(t.transactionTill || t.tillMsisdn || t.msisdn);
          if (msisdn) validMsisdns.add(msisdn);
          if (t.transactionTill) validTills.add(String(t.transactionTill).trim().toLowerCase());
          if (t.mgtTillName) validTills.add(String(t.mgtTillName).trim().toLowerCase());
          if (t.ownerName) validOwnerNames.add(String(t.ownerName).trim().toLowerCase());
        });
      }
    } catch {}
  }

  const savedBase = localStorage.getItem('baseWakalaIndex');
  if (savedBase) {
    try {
      const parsed = JSON.parse(savedBase);
      if (Array.isArray(parsed)) {
        parsed.forEach((b: any) => {
          const norm = normalizeMsisdn(b.msisdn);
          if (norm) validMsisdns.add(norm);
          const altNorm = normalizeMsisdn(b.alternateNumber);
          if (altNorm) validMsisdns.add(altNorm);
          if (b.ownerName && b.ownerName !== '#N/A') validOwnerNames.add(String(b.ownerName).trim().toLowerCase());
          if (b.siteId) validSiteIds.add(String(b.siteId).trim().toLowerCase());
          if (b.code) validTills.add(String(b.code).trim().toLowerCase());
        });
      }
    } catch {}
  }

  const savedSaTills = localStorage.getItem('saTillRegistry');
  if (savedSaTills) {
    try {
      const parsed = JSON.parse(savedSaTills);
      if (Array.isArray(parsed)) {
        parsed.forEach((s: any) => {
          const norm = normalizeMsisdn(s.tillMsisdn);
          if (norm) validMsisdns.add(norm);
          if (s.ownerName) validOwnerNames.add(String(s.ownerName).trim().toLowerCase());
        });
      }
    } catch {}
  }

  // 2. Parse fileData if provided
  if (fileData) {
    try {
      let rows: any[] = [];
      if (fileData instanceof ArrayBuffer) {
        const workbook = XLSX.read(fileData, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(sheet);
      } else if (Array.isArray(fileData)) {
        rows = fileData;
      }

      rows.forEach((row) => {
        Object.keys(row).forEach((k) => {
          const cleanKey = k.trim().toLowerCase();
          const val = String(row[k] || '').trim();
          if (!val) return;

          // Check for MSISDN / phone / till numbers
          if (
            cleanKey === 'msisdn' ||
            cleanKey === 'transaction till' ||
            cleanKey === 'phone' ||
            cleanKey === 'till' ||
            cleanKey === 'altern no' ||
            cleanKey === 'branch_msisdn'
          ) {
            const norm = normalizeMsisdn(val);
            if (norm) validMsisdns.add(norm);
            validTills.add(val.toLowerCase());
          }

          // Check for Owner / Agent Name
          if (
            cleanKey === 'owner' ||
            cleanKey === 'owner name' ||
            cleanKey === 'full_name' ||
            cleanKey === 'agent_name' ||
            cleanKey === 'wakala name'
          ) {
            if (val.toUpperCase() !== '#N/A' && val.toUpperCase() !== 'N/A') {
              validOwnerNames.add(val.toLowerCase());
            }
          }

          // Check for siteid or code
          if (cleanKey === 'siteid' || cleanKey === 'code') {
            validSiteIds.add(val.toLowerCase());
            validTills.add(val.toLowerCase());
          }
        });
      });
    } catch (e) {
      console.error('Failed to parse reference roster file:', e);
    }
  }

  return { validMsisdns, validTills, validOwnerNames, validSiteIds };
}

/**
 * Checks if a single record matches Balwyn's reference roster.
 */
export function isRecordBalwynValid(record: any, roster: ReferenceRoster): boolean {
  // If roster is completely empty, don't flag everything as invalid
  if (
    roster.validMsisdns.size === 0 &&
    roster.validTills.size === 0 &&
    roster.validOwnerNames.size === 0
  ) {
    return true;
  }

  // 1. Check MSISDN
  const msisdnCandidates = [
    normalizeMsisdn(record.MSISDN || record.msisdn || record.Branch_msisdn || record.phone || record.tillMsisdn || record.transactionTill),
    normalizeMsisdn(record.alternateNumber || record.altern_no || record['ALTERN NO']),
  ].filter(Boolean);

  for (const m of msisdnCandidates) {
    if (roster.validMsisdns.has(m)) return true;
  }

  // 2. Check Owner Name
  const ownerCandidates = [
    record.Owner_Name,
    record.owner_name,
    record.ownerName,
    record.Owner,
    record.owner,
    record.name,
    record['Wakala Name'],
    record.FULL_NAME,
    record.Full_Name,
  ]
    .filter(Boolean)
    .map((s) => String(s).trim().toLowerCase());

  for (const o of ownerCandidates) {
    if (o !== '#n/a' && o !== 'n/a' && roster.validOwnerNames.has(o)) return true;
  }

  // 3. Check Till Name or Code or Site ID
  const tillCandidates = [
    record.transactionTill,
    record.mgtTillName,
    record.code,
    record.CODE,
    record.siteid,
    record.site_id,
  ]
    .filter(Boolean)
    .map((s) => String(s).trim().toLowerCase());

  for (const t of tillCandidates) {
    if (roster.validTills.has(t) || roster.validSiteIds.has(t)) return true;
  }

  return false;
}

/**
 * Scans all client-side data (localStorage and IndexedDB) and returns a detailed audit summary.
 */
export async function scanDataIntegrity(
  fileData?: ArrayBuffer | any[]
): Promise<CleanupAuditSummary> {
  const roster = buildReferenceRoster(fileData);
  const timestamp = new Date().toISOString();
  const breakdown: Record<string, StoreScanResult> = {};
  const flaggedSample: Array<{ store: string; identifier: string; reason: string }> = [];

  let totalScanned = 0;
  let totalMatched = 0;
  let totalFlagged = 0;

  // Helper to register store result
  const registerResult = (
    storeName: string,
    scanned: number,
    matched: number,
    flagged: number,
    details: string[]
  ) => {
    breakdown[storeName] = { storeName, scanned, matched, flagged, details };
    totalScanned += scanned;
    totalMatched += matched;
    totalFlagged += flagged;
  };

  // 1. Scan localStorage: ownersList
  try {
    const raw = localStorage.getItem('ownersList');
    if (raw) {
      const owners: any[] = JSON.parse(raw);
      let matched = 0;
      let flagged = 0;
      const details: string[] = [];

      owners.forEach((o) => {
        if (isRecordBalwynValid(o, roster)) {
          matched++;
        } else {
          flagged++;
          const name = o.name || o.id || 'Unknown Owner';
          details.push(`Unrecognized Owner: ${name}`);
          if (flaggedSample.length < 20) {
            flaggedSample.push({
              store: 'ownersList',
              identifier: name,
              reason: 'Owner name/ID not matched in Balwyn Reference Roster',
            });
          }
        }
      });
      registerResult('localStorage: ownersList', owners.length, matched, flagged, details);
    }
  } catch (e) {
    console.error('Error auditing ownersList:', e);
  }

  // 2. Scan localStorage: tillsList
  try {
    const raw = localStorage.getItem('tillsList');
    if (raw) {
      const tills: any[] = JSON.parse(raw);
      let matched = 0;
      let flagged = 0;
      const details: string[] = [];

      tills.forEach((t) => {
        if (isRecordBalwynValid(t, roster)) {
          matched++;
        } else {
          flagged++;
          const id = t.transactionTill || t.tillMsisdn || t.id || 'Unknown Till';
          details.push(`Unrecognized Till: ${id}`);
          if (flaggedSample.length < 20) {
            flaggedSample.push({
              store: 'tillsList',
              identifier: id,
              reason: 'Till MSISDN or Till Code not in Balwyn Reference Roster',
            });
          }
        }
      });
      registerResult('localStorage: tillsList', tills.length, matched, flagged, details);
    }
  } catch (e) {
    console.error('Error auditing tillsList:', e);
  }

  // 3. Scan localStorage: baseWakalaIndex
  try {
    const raw = localStorage.getItem('baseWakalaIndex');
    if (raw) {
      const base: any[] = JSON.parse(raw);
      let matched = 0;
      let flagged = 0;
      const details: string[] = [];

      base.forEach((b) => {
        if (isRecordBalwynValid(b, roster)) {
          matched++;
        } else {
          flagged++;
          const id = b.msisdn || b.code || 'Unknown Base Wakala';
          details.push(`Unrecognized Base Wakala MSISDN: ${id}`);
          if (flaggedSample.length < 20) {
            flaggedSample.push({
              store: 'baseWakalaIndex',
              identifier: id,
              reason: 'Base Wakala MSISDN/Code not in Balwyn Reference Roster',
            });
          }
        }
      });
      registerResult('localStorage: baseWakalaIndex', base.length, matched, flagged, details);
    }
  } catch (e) {
    console.error('Error auditing baseWakalaIndex:', e);
  }

  // 4. Scan localStorage: saTillRegistry
  try {
    const raw = localStorage.getItem('saTillRegistry');
    if (raw) {
      const sa: any[] = JSON.parse(raw);
      let matched = 0;
      let flagged = 0;
      const details: string[] = [];

      sa.forEach((s) => {
        if (isRecordBalwynValid(s, roster)) {
          matched++;
        } else {
          flagged++;
          const id = s.tillMsisdn || 'Unknown SA Till';
          details.push(`Unrecognized SA Till MSISDN: ${id}`);
          if (flaggedSample.length < 20) {
            flaggedSample.push({
              store: 'saTillRegistry',
              identifier: id,
              reason: 'SA Till MSISDN not in Balwyn Reference Roster',
            });
          }
        }
      });
      registerResult('localStorage: saTillRegistry', sa.length, matched, flagged, details);
    }
  } catch (e) {
    console.error('Error auditing saTillRegistry:', e);
  }

  // 5. Scan IndexedDB: monthlyServicingRows & weeklyServicingRows
  try {
    const db = await initDB();

    // Monthly Servicing Rows
    await new Promise<void>((resolve) => {
      const tx = db.transaction([MONTHLY_ROW_STORE], 'readonly');
      const store = tx.objectStore(MONTHLY_ROW_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        const rows: any[] = request.result || [];
        let matched = 0;
        let flagged = 0;
        const details: string[] = [];

        rows.forEach((r) => {
          if (isRecordBalwynValid(r, roster)) {
            matched++;
          } else {
            flagged++;
            const id = r.MSISDN || r.Branch_msisdn || r.compositeKey || 'Unknown Row';
            details.push(`Non-Balwyn Servicing Row: ${id}`);
            if (flaggedSample.length < 20) {
              flaggedSample.push({
                store: 'IndexedDB: monthlyServicingRows',
                identifier: id,
                reason: 'Row MSISDN/Owner not in Balwyn Reference Roster',
              });
            }
          }
        });
        registerResult('IndexedDB: monthlyServicingRows', rows.length, matched, flagged, details);
        resolve();
      };

      request.onerror = () => resolve();
    });

    // Weekly Servicing Rows
    await new Promise<void>((resolve) => {
      const tx = db.transaction([WEEKLY_ROW_STORE], 'readonly');
      const store = tx.objectStore(WEEKLY_ROW_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        const rows: any[] = request.result || [];
        let matched = 0;
        let flagged = 0;
        const details: string[] = [];

        rows.forEach((r) => {
          if (isRecordBalwynValid(r, roster)) {
            matched++;
          } else {
            flagged++;
            const id = r.MSISDN || r.Branch_msisdn || r.compositeKey || 'Unknown Row';
            details.push(`Non-Balwyn Weekly Servicing Row: ${id}`);
            if (flaggedSample.length < 20) {
              flaggedSample.push({
                store: 'IndexedDB: weeklyServicingRows',
                identifier: id,
                reason: 'Weekly row MSISDN/Owner not in Balwyn Reference Roster',
              });
            }
          }
        });
        registerResult('IndexedDB: weeklyServicingRows', rows.length, matched, flagged, details);
        resolve();
      };

      request.onerror = () => resolve();
    });
  } catch (e) {
    console.error('Error auditing IndexedDB stores:', e);
  }

  return {
    timestamp,
    scannedCount: totalScanned,
    matchedCount: totalMatched,
    flaggedCount: totalFlagged,
    breakdown,
    flaggedSample,
  };
}

/**
 * Scans client-side data, removes non-matching / orphaned records from localStorage and IndexedDB,
 * logs an audit record into auditHistoryReports, and returns the audit summary.
 */
export async function purgeNonBalwynData(
  fileData?: ArrayBuffer | any[]
): Promise<CleanupAuditSummary> {
  const roster = buildReferenceRoster(fileData);
  const summary = await scanDataIntegrity(fileData);

  // 1. Purge localStorage: ownersList
  try {
    const raw = localStorage.getItem('ownersList');
    if (raw) {
      const owners: any[] = JSON.parse(raw);
      const cleaned = owners.filter((o) => isRecordBalwynValid(o, roster));
      localStorage.setItem('ownersList', JSON.stringify(cleaned));
    }
  } catch (e) {
    console.error('Failed to purge ownersList:', e);
  }

  // 2. Purge localStorage: tillsList
  try {
    const raw = localStorage.getItem('tillsList');
    if (raw) {
      const tills: any[] = JSON.parse(raw);
      const cleaned = tills.filter((t) => isRecordBalwynValid(t, roster));
      localStorage.setItem('tillsList', JSON.stringify(cleaned));
    }
  } catch (e) {
    console.error('Failed to purge tillsList:', e);
  }

  // 3. Purge localStorage: baseWakalaIndex
  try {
    const raw = localStorage.getItem('baseWakalaIndex');
    if (raw) {
      const base: any[] = JSON.parse(raw);
      const cleaned = base.filter((b) => isRecordBalwynValid(b, roster));
      localStorage.setItem('baseWakalaIndex', JSON.stringify(cleaned));
    }
  } catch (e) {
    console.error('Failed to purge baseWakalaIndex:', e);
  }

  // 4. Purge localStorage: saTillRegistry
  try {
    const raw = localStorage.getItem('saTillRegistry');
    if (raw) {
      const sa: any[] = JSON.parse(raw);
      const cleaned = sa.filter((s) => isRecordBalwynValid(s, roster));
      localStorage.setItem('saTillRegistry', JSON.stringify(cleaned));
    }
  } catch (e) {
    console.error('Failed to purge saTillRegistry:', e);
  }

  // 5. Purge IndexedDB: monthlyServicingRows & weeklyServicingRows
  try {
    const db = await initDB();

    // Monthly Servicing Rows
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([MONTHLY_ROW_STORE], 'readwrite');
      const store = tx.objectStore(MONTHLY_ROW_STORE);
      const cursorReq = store.openCursor();

      cursorReq.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (cursor) {
          if (!isRecordBalwynValid(cursor.value, roster)) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          resolve();
        }
      };

      cursorReq.onerror = () => reject(cursorReq.error);
    });

    // Weekly Servicing Rows
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([WEEKLY_ROW_STORE], 'readwrite');
      const store = tx.objectStore(WEEKLY_ROW_STORE);
      const cursorReq = store.openCursor();

      cursorReq.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (cursor) {
          if (!isRecordBalwynValid(cursor.value, roster)) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          resolve();
        }
      };

      cursorReq.onerror = () => reject(cursorReq.error);
    });
  } catch (e) {
    console.error('Failed to purge IndexedDB records:', e);
  }

  // 6. Log cleanup action into auditHistoryReports
  try {
    const savedReportsRaw = localStorage.getItem('auditHistoryReports');
    let reports: AuditReport[] = [];
    if (savedReportsRaw) {
      try {
        reports = JSON.parse(savedReportsRaw);
      } catch {}
    }

    const newReport: AuditReport = {
      id: `audit-purge-${Date.now()}`,
      fileName: 'Balwyn Data Integrity Purge',
      type: 'Data Cleanup Audit',
      uploadedBy: 'System Integrity Engine',
      date: new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      size: `${summary.flaggedCount} records purged`,
      status: 'Success',
    };

    const updatedReports = [newReport, ...reports];
    localStorage.setItem('auditHistoryReports', JSON.stringify(updatedReports));
  } catch (e) {
    console.error('Failed to record audit cleanup report:', e);
  }

  return summary;
}
