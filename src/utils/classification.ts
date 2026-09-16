import { SATill, BaseWakala } from '../types';
import type { ServicingRow } from './mappingEngine';
import { resolveOwnerMatch } from './ownerMatch';
import { normalizeMsisdn } from './msisdn';
import { ClassificationAuditRecord, ClassificationBucket } from '../types/classificationAudit';
import { saveClassificationAuditRecords } from './indexedDB';

export type { ClassificationBucket };

export interface ClassifiedRow {
  row: ServicingRow;
  bucket: ClassificationBucket;
  attributedOwnerId: string | null;
  attributedOwnerName: string | null;
  matchedVia: 'sa_till' | 'base_wakala' | 'unmatched';
  auditRecord: ClassificationAuditRecord;
}

/**
 * Classifies every Daily MGT row as SA_INTERNAL, BASE, 
 * or IOP by looking up Dest_MSISDN against the SA Till Registry, then the 
 * Base Wakala Index. 
 *
 * Strict 3-Tier Lookup Chain:
 * 1. SA Till Registry Match:
 *    - Dest_MSISDN in saTillRegistry
 *    - Same owner -> SA_INTERNAL
 * 2. Base Wakala Index Match:
 *    - Dest_MSISDN (or altMsisdn) in baseWakalaIndex
 *    - Any match -> BASE (credited to servicing owner)
 * 3. Fallback:
 *    - Dest_MSISDN matches neither -> IOP
 *
 * Serviced Value Rule:
 * Use the raw transaction Amount directly (unsigned volume) — no sign 
 * inversions (+/-) or balance-difference adjustments.
 */
export function classifyServicingRows(
  rows: ServicingRow[],
  saTillRegistry: SATill[] = [],
  baseWakalaIndex: BaseWakala[] = [],
  tillsList: { transactionTill: string; assignedOwner: string }[] = [],
  owners: { id: string; name: string; nameAliases?: string[] }[] = []
): ClassifiedRow[] {
  // SA Till Registry Lookup Map
  const saTillByMsisdn = new Map<string, SATill>();
  saTillRegistry.forEach(t => {
    const key = normalizeMsisdn(t.tillMsisdn);
    if (key) saTillByMsisdn.set(key, t);
  });

  // Base Wakala Lookup Map (msisdn & altMsisdn)
  const baseWakalaByMsisdn = new Map<string, BaseWakala>();
  baseWakalaIndex.forEach(w => {
    const msisdnKey = normalizeMsisdn(w.msisdn);
    if (msisdnKey) baseWakalaByMsisdn.set(msisdnKey, w);

    const altKey = normalizeMsisdn((w as any).altMsisdn || (w as any).alternateNumber);
    if (altKey) baseWakalaByMsisdn.set(altKey, w);
  });

  // Transaction Till -> assigned owner lookup map, built once (mirrors
  // saTillByMsisdn/baseWakalaByMsisdn above) instead of a per-row
  // Array.find() scan, which was O(rows x tillsList.length) and could
  // block the main thread once Daily MGT history and the till list both
  // grow over months of uploads.
  const tillOwnerByMsisdn = new Map<string, string>();
  tillsList.forEach(t => {
    const key = normalizeMsisdn(t.transactionTill);
    if (key) tillOwnerByMsisdn.set(key, t.assignedOwner);
  });

  const auditRecords: ClassificationAuditRecord[] = [];

  const classified = rows.map((row, idx): ClassifiedRow => {
    const rawDestMsisdn = String(row['Dest_MSISDN'] || row['destMsisdn'] || row['Dest Msisdn'] || '');
    const destMsisdn = normalizeMsisdn(rawDestMsisdn);

    const rawBranchMsisdn = String(row['Branch_msisdn'] || row['branchMsisdn'] || row['transactionTill'] || row['Transaction Till'] || '');
    const branchMsisdn = normalizeMsisdn(rawBranchMsisdn);

    const txId = String(row['Receipt No'] || row['Receipt_No'] || row['Trans ID'] || row['_id'] || `tx-${Date.now()}-${idx}`);
    const timestamp = String(row['Servicing Date'] || row['date'] || row['Date'] || row['Timestamp'] || new Date().toISOString());

    const amount = Math.abs(Number(row['Amount'] ?? row['Volume (TZS)'] ?? row['volume'] ?? row['servicedVolume'] ?? 0));

    // Resolve servicing till owner
    const servicingTillOwnerName = (branchMsisdn ? tillOwnerByMsisdn.get(branchMsisdn) : undefined) || row['Owner Name'] || row['ownerName'] || null;

    const servicingOwnerMatch = servicingTillOwnerName
      ? resolveOwnerMatch(servicingTillOwnerName, owners as any, 'Classification Engine')
      : { matchedOwner: null };
    
    const servicingOwnerId = servicingOwnerMatch.matchedOwner?.id || row['Owner ID'] || row['ownerId'] || '';
    const servicingOwnerFinalName = servicingOwnerMatch.matchedOwner?.name || servicingTillOwnerName;

    // --- STEP 1: SA Till Registry Match ---
    // ANY match here means SA-to-SA internal float movement, regardless of
    // which owner is on either end — always excluded from volume.
    const saMatch = destMsisdn ? saTillByMsisdn.get(destMsisdn) : undefined;
    if (saMatch) {
      const saOwnerMatch = resolveOwnerMatch(saMatch.ownerName, owners as any, 'Classification Engine');
      const saOwnerId = saMatch.ownerId || saOwnerMatch.matchedOwner?.id || '';
      const saOwnerName = saOwnerMatch.matchedOwner?.name || saMatch.ownerName;

      const bucket: ClassificationBucket = 'SA_INTERNAL';
      const ruleTriggered = 'Matched SA Till (Internal Transfer — Excluded From Volume)';

      const auditRecord: ClassificationAuditRecord = {
        id: `audit-${txId}-${idx}`,
        transactionId: txId,
        timestamp,
        rawMsisdn: rawDestMsisdn,
        normalizedMsisdn: destMsisdn,
        amount,
        ownerId: servicingOwnerId || 'UNASSIGNED',
        matchedEntityId: saMatch.id || saMatch.tillMsisdn,
        matchedEntityType: 'SA_TILL',
        classificationBucket: bucket,
        ruleTriggered
      };

      auditRecords.push(auditRecord);

      return {
        row,
        bucket,
        attributedOwnerId: saOwnerId || null,
        attributedOwnerName: saOwnerName || null,
        matchedVia: 'sa_till',
        auditRecord
      };
    }

    // --- STEP 2: Base Wakala Index Match ---
    // Any match means this wakala IS registered within the company — this
    // is always BASE volume, credited to whichever owner's till actually
    // serviced it. Cross-owner servicing is no longer a separate bucket;
    // it's just BASE volume attributed to the servicer.
    const baseMatch = destMsisdn ? baseWakalaByMsisdn.get(destMsisdn) : undefined;
    if (baseMatch) {
      const baseOwnerMatch = resolveOwnerMatch(baseMatch.ownerName, owners as any, 'Classification Engine');
      const baseOwnerId = baseMatch.ownerId || baseOwnerMatch.matchedOwner?.id || '';
      const baseOwnerName = baseOwnerMatch.matchedOwner?.name || baseMatch.ownerName;

      const sameOwner = (baseOwnerId && servicingOwnerId && baseOwnerId === servicingOwnerId) ||
        (baseOwnerName && servicingOwnerFinalName && baseOwnerName.trim().toLowerCase() === servicingOwnerFinalName.trim().toLowerCase());

      const bucket: ClassificationBucket = 'BASE';
      const ruleTriggered = sameOwner 
        ? 'Matched Base Wakala (Owner Match)' 
        : 'Matched Base Wakala (Serviced By Different Owner — Credited To Servicer)';

      const auditRecord: ClassificationAuditRecord = {
        id: `audit-${txId}-${idx}`,
        transactionId: txId,
        timestamp,
        rawMsisdn: rawDestMsisdn,
        normalizedMsisdn: destMsisdn,
        amount,
        ownerId: servicingOwnerId || 'UNASSIGNED',
        matchedEntityId: baseMatch.id || (baseMatch as any).wakalaCode || baseMatch.msisdn,
        matchedEntityType: 'BASE_WAKALA',
        classificationBucket: bucket,
        ruleTriggered
      };

      auditRecords.push(auditRecord);

      return {
        row,
        bucket,
        attributedOwnerId: servicingOwnerId || null,
        attributedOwnerName: servicingOwnerFinalName || null,
        matchedVia: 'base_wakala',
        auditRecord
      };
    }

    // --- STEP 3: Fallback (Unmatched Destination MSISDN -> IOP) ---
    const auditRecord: ClassificationAuditRecord = {
      id: `audit-${txId}-${idx}`,
      transactionId: txId,
      timestamp,
      rawMsisdn: rawDestMsisdn,
      normalizedMsisdn: destMsisdn,
      amount,
      ownerId: servicingOwnerId || 'UNASSIGNED',
      matchedEntityType: 'NONE',
      classificationBucket: 'IOP',
      ruleTriggered: 'Unmatched Destination MSISDN (IOP Fallback)'
    };

    auditRecords.push(auditRecord);

    return {
      row,
      bucket: 'IOP',
      attributedOwnerId: null,
      attributedOwnerName: servicingOwnerFinalName,
      matchedVia: 'unmatched',
      auditRecord
    };
  });

  // Persist classification audit records to IndexedDB. put() by
  // transactionId means re-classifying the same transaction overwrites
  // its prior entry instead of duplicating it — no cap needed.
  // Browser only: the offline audit cache. On the server the caller persists
  // the same records to Postgres (classification_audit_records).
  if (typeof indexedDB !== 'undefined') {
    saveClassificationAuditRecords(auditRecords).catch((e) => {
      console.warn('Could not persist classification audit records:', e);
    });
  }

  return classified;
}

export function summarizeClassification(classified: ClassifiedRow[]) {
  const summary = {
    SA_INTERNAL: { count: 0, volume: 0 },
    BASE: { count: 0, volume: 0 },
    IOP: { count: 0, volume: 0 },
  };
  classified.forEach(c => {
    const vol = Math.abs(c.row['Volume (TZS)'] || c.row['Amount'] || 0);
    if (summary[c.bucket]) {
      summary[c.bucket].count += 1;
      summary[c.bucket].volume += vol;
    }
  });
  return summary;
}

