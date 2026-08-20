/**
 * Weekly KPI engine.
 *
 * Pure/derived analysis of uploaded Weekly KPI workbooks (Sheet 2 servicing
 * rows). Mirrors the exact activity rules already used for Monthly data:
 *   - a wakala is ACTIVE when Wakala_Status === 1
 *   - a wakala is SERVED when (active ? txns > 6 || val > 600000 : txns > 6)
 *
 * Adds a per-owner breakdown by resolving each row's MSISDN through the
 * Base Wakala index / till registry, so weekly results can be shown on the
 * Owner dashboard next to that owner's KPI 1 target.
 *
 * Nothing here touches storage or React — callers own persistence.
 */

import { BaseWakala, Owner } from '../types';
import { normalizeMsisdn } from './msisdn';
import { resolveOwnerMatch } from './ownerMatch';
import { getServicedStatusFromColumn, mergeServicedStatus } from './servicingStatus';

export interface WeeklyWakalaStats {
  total: number;
  active: number;
  inactive: number;
  served: number;
  notServed: number;
  /** Wakalas whose row carried no servicing_status value at all. */
  noStatus: number;
  servedPercent: string;
  notServedPercent: string;
  totalValue: number;
  totalTxns: number;
}

export interface WeeklyOwnerBreakdown {
  ownerId: string;
  ownerName: string;
  total: number;
  active: number;
  inactive: number;
  served: number;
  notServed: number;
  noStatus: number;
  value: number;
  txns: number;
}

export interface WeeklyStatsEntry extends WeeklyWakalaStats {
  reportingWeek: string;
  uploadedAt: string;
  byOwner: WeeklyOwnerBreakdown[];
}

const UNASSIGNED_ID = '__unassigned__';

export function isRowStatusActive(row: any): boolean {
  if (!row) return false;
  const val =
    row.wakala_status ??
    row.Wakala_Status ??
    row['Wakala Status'] ??
    row['wakala status'] ??
    row.status ??
    row.Status;
  if (val === undefined || val === null || val === '') return false;
  return Number(val) === 1;
}

export function hasRowStatusKey(row: any): boolean {
  if (!row) return false;
  return (
    'wakala_status' in row ||
    'Wakala_Status' in row ||
    'Wakala Status' in row ||
    'wakala status' in row ||
    'status' in row ||
    'Status' in row
  );
}

export function getFieldValue(row: any, keys: string[]): number {
  if (!row) return 0;
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null) {
      const val = parseFloat(String(row[k]).replace(/,/g, '').trim());
      if (!isNaN(val)) return val;
    }
  }
  for (const rowKey of Object.keys(row)) {
    const normRowKey = rowKey.toLowerCase().replace(/[\s_-]+/g, '');
    for (const searchKey of keys) {
      if (normRowKey === searchKey.toLowerCase().replace(/[\s_-]+/g, '')) {
        const val = parseFloat(String(row[rowKey]).replace(/,/g, '').trim());
        if (!isNaN(val)) return val;
      }
    }
  }
  return 0;
}

const TXN_KEYS = ['SA_Servicing_Txns', 'SA Servicing Txns', 'sa_servicing_txns'];
const VAL_KEYS = ['SA_Servicing_Val', 'SA Servicing Val', 'sa_servicing_val'];

/**
 * Builds an MSISDN -> ownerId resolver from the Base Wakala index (primary and
 * alternate numbers) plus any till lists already assigned to owners.
 * Same resolution order the monthly/daily engines use: an owner id carried by
 * the source row wins, then owner-name matching.
 */
export function buildMsisdnOwnerResolver(
  baseWakalaIndex: BaseWakala[],
  owners: Owner[],
  tillsList: any[] = []
): (msisdn: string) => { ownerId: string; ownerName: string } | null {
  const ownersById = new Map(
    (owners || []).filter(o => o && o.id).map(o => [String(o.id).trim().toLowerCase(), o])
  );
  const byMsisdn = new Map<string, { ownerId: string; ownerName: string }>();

  const register = (raw: any, ownerId: string, ownerName: string) => {
    const key = normalizeMsisdn(raw);
    if (!key || byMsisdn.has(key)) return;
    byMsisdn.set(key, { ownerId, ownerName });
  };

  (baseWakalaIndex || []).forEach(w => {
    if (!w) return;
    const direct = (w as any).ownerId
      ? ownersById.get(String((w as any).ownerId).trim().toLowerCase())
      : undefined;
    const matched = direct || resolveOwnerMatch((w as any).ownerName, owners).matchedOwner;
    if (!matched || !matched.id) return;
    register(w.msisdn, matched.id, matched.name || 'Unknown Owner');
    register((w as any).altMsisdn || (w as any).alternateNumber, matched.id, matched.name || 'Unknown Owner');
  });

  // Tills explicitly assigned to an owner (manual adds / owner sync)
  (owners || []).forEach(o => {
    const tills: any[] = (o as any)?.assignedTills || [];
    tills.forEach(t => register(typeof t === 'string' ? t : t?.msisdn, o.id || '', o.name || 'Unknown Owner'));
  });

  (tillsList || []).forEach(t => {
    if (!t) return;
    const ownerRef = t.ownerId || t.owner_id;
    const owner = ownerRef ? ownersById.get(String(ownerRef).trim().toLowerCase()) : undefined;
    const matched = owner || resolveOwnerMatch(t.assignedOwner || t.ownerName, owners).matchedOwner;
    if (!matched || !matched.id) return;
    register(t.transactionTill || t.msisdn || t.till, matched.id, matched.name || 'Unknown Owner');
  });

  return (msisdn: string) => {
    const key = normalizeMsisdn(msisdn);
    if (!key) return null;
    return byMsisdn.get(key) || null;
  };
}

/**
 * Company-wide + per-owner weekly stats for one uploaded week's rows.
 */
export function computeWeeklyStats(
  rows: any[],
  resolveOwner?: (msisdn: string) => { ownerId: string; ownerName: string } | null
): WeeklyWakalaStats & { byOwner: WeeklyOwnerBreakdown[] } | null {
  if (!rows || rows.length === 0) return null;

  const wakalaMap = new Map<
    string,
    { txns: number; val: number; isActiveStatus: boolean; hasStatusCol: boolean; servedStatus: boolean | null }
  >();

  rows.forEach((row: any) => {
    const msisdn = String(row.MSISDN || row.msisdn || row.phone || row.Phone || '').trim();
    if (!msisdn) return;
    const txns = getFieldValue(row, TXN_KEYS);
    const val = getFieldValue(row, VAL_KEYS);
    const rowActive = isRowStatusActive(row);
    const rowHasStatus = hasRowStatusKey(row);
    const rowServed = getServicedStatusFromColumn(row);

    const existing = wakalaMap.get(msisdn);
    if (existing) {
      existing.txns += txns;
      existing.val += val;
      if (rowActive) existing.isActiveStatus = true;
      if (rowHasStatus) existing.hasStatusCol = true;
      existing.servedStatus = mergeServicedStatus(existing.servedStatus, rowServed);
    } else {
      wakalaMap.set(msisdn, {
        txns,
        val,
        isActiveStatus: rowActive,
        hasStatusCol: rowHasStatus,
        servedStatus: rowServed,
      });
    }
  });

  let activeCount = 0;
  let servedCount = 0;
  let notServedCount = 0;
  let noStatusCount = 0;
  let datasetHasStatusCol = false;
  let totalValue = 0;
  let totalTxns = 0;

  const ownerAgg = new Map<string, WeeklyOwnerBreakdown>();

  wakalaMap.forEach(({ txns, val, isActiveStatus, hasStatusCol, servedStatus }, msisdn) => {
    if (hasStatusCol) datasetHasStatusCol = true;
    // Weekly served/unserved comes straight from the uploaded servicing_status
    // column — no computed threshold. Missing values are excluded, never
    // counted as unserved.
    if (isActiveStatus) activeCount++;
    if (isActiveStatus) activeCount++;
    if (servedStatus === true) servedCount++;
    else if (servedStatus === false) notServedCount++;
    else noStatusCount++;
    totalValue += val;
    totalTxns += txns;

    const match = resolveOwner ? resolveOwner(msisdn) : null;
    const ownerId = match?.ownerId || UNASSIGNED_ID;
    const ownerName = match?.ownerName || 'Unassigned';
    let agg = ownerAgg.get(ownerId);
    if (!agg) {
      agg = {
        ownerId,
        ownerName,
        total: 0,
        active: 0,
        inactive: 0,
        served: 0,
        notServed: 0,
        noStatus: 0,
        value: 0,
        txns: 0,
      };
      ownerAgg.set(ownerId, agg);
    }
    agg.total++;
    if (isActiveStatus) agg.active++;
    else agg.inactive++;
    if (servedStatus === true) agg.served++;
    else if (servedStatus === false) agg.notServed++;
    else agg.noStatus++;
    agg.value += val;
    agg.txns += txns;
  });

  // Datasets without a status column: treat served wakalas as the active set,
  // exactly as the monthly widget already does.
  if (!datasetHasStatusCol && activeCount === 0) {
    activeCount = servedCount;
    ownerAgg.forEach(agg => {
      agg.active = agg.served;
      agg.inactive = agg.total - agg.served;
    });
  }

  const totalCount = wakalaMap.size;
  const served = servedCount;
  const notServed = notServedCount;
  // Only rows that actually carried a status participate in the percentages.
  const denom = served + notServed || 1;

  return {
    total: totalCount,
    active: activeCount,
    inactive: totalCount - activeCount,
    served,
    notServed,
    noStatus: noStatusCount,
    servedPercent: ((served / denom) * 100).toFixed(1),
    notServedPercent: ((notServed / denom) * 100).toFixed(1),
    totalValue,
    totalTxns,
    byOwner: Array.from(ownerAgg.values()).sort((a, b) => b.value - a.value),
  };
}

export function weekNumberOf(week: string): number {
  return parseInt(String(week).match(/(\d+)/)?.[1] || '0', 10);
}

/**
 * Append-only merge: a new week is added, a re-uploaded week replaces only its
 * own entry, every other week in the running series is preserved.
 */
export function mergeWeeklyHistory(
  existing: WeeklyStatsEntry[],
  incoming: WeeklyStatsEntry[]
): WeeklyStatsEntry[] {
  const byWeek = new Map<string, WeeklyStatsEntry>();
  (existing || []).forEach(e => {
    if (e && e.reportingWeek) byWeek.set(e.reportingWeek, e);
  });
  (incoming || []).forEach(e => {
    if (e && e.reportingWeek) byWeek.set(e.reportingWeek, e);
  });
  return Array.from(byWeek.values()).sort(
    (a, b) => weekNumberOf(a.reportingWeek) - weekNumberOf(b.reportingWeek)
  );
}

/** Cumulative servicing value across weeks, in week order. */
export function withCumulativeValue(entries: WeeklyStatsEntry[]): Array<WeeklyStatsEntry & { cumulativeValue: number }> {
  let running = 0;
  return entries.map(e => {
    running += e.totalValue || 0;
    return { ...e, cumulativeValue: running };
  });
}

/** Cumulative servicing value for one owner across weeks, in week order. */
export function ownerWeeklySeries(
  entries: WeeklyStatsEntry[],
  ownerId: string
): Array<{ reportingWeek: string; breakdown: WeeklyOwnerBreakdown | null; cumulativeValue: number }> {
  let running = 0;
  return entries.map(e => {
    const breakdown = (e.byOwner || []).find(b => b.ownerId === ownerId) || null;
    running += breakdown?.value || 0;
    return { reportingWeek: e.reportingWeek, breakdown, cumulativeValue: running };
  });
}

/** Expected linear pace for a given week index (1-based) of a 4-week month. */
export function expectedPacePercent(weekNum: number): number {
  return Math.min(100, Math.max(0, weekNum) * 25);
}

export function paceLabel(progressPercent: number, weekNum: number): {
  label: string;
  tone: 'ahead' | 'ontrack' | 'behind';
} {
  const expected = expectedPacePercent(weekNum);
  if (progressPercent >= expected) return { label: 'AHEAD OF SCHEDULE', tone: 'ahead' };
  if (progressPercent >= expected - 15) return { label: 'ON TRACK', tone: 'ontrack' };
  return { label: 'BEHIND SCHEDULE', tone: 'behind' };
}

export const UNASSIGNED_OWNER_ID = UNASSIGNED_ID;
