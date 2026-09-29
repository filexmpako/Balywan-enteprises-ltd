/**
 * Weekly KPI engine.
 *
 * Pure/derived analysis of uploaded Weekly KPI workbooks (Sheet 2 servicing
 * rows). Mirrors the exact activity rules already used for Monthly data:
 *   - a wakala is ACTIVE once its CI+CO transaction count reaches the
 *     configured threshold (count only — amount plays no part)
 *   - a wakala is SERVED when either the uploaded servicing_status column
 *     or the computed amount/transaction rule says so (see isServedByRule)
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
import { formatToISODate } from './mappingEngine';
import {
  getActivityRules,
  isActiveByRule,
  isServedByRule,
  extractTxnCounts,
  calculatePenalty,
  type ActivityRules,
} from './activityRules';

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
  /** Volume attributed to wakalas that belong to a company owner. */
  baseValue: number;
  /**
   * IOP volume, read from the uploaded report's own IOP column: value the
   * report itself says was serviced by a network outside the company, for
   * wakalas that are still in our own base. Not derived/guessed — taken
   * as-is from the file.
   */
  iopValue: number;
  cashInTxns: number;
  cashOutTxns: number;
  /** CP_Servicing_Val summed for the week — the penalty basis, before the rate is applied. */
  cpValue: number;
  /** CP_Servicing_Val summed for the week, times the configured penalty rate. */
  penalty: number;
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
  /** IOP volume for this owner, read from the report's own IOP column. */
  iopValue: number;
  /** CP_Servicing_Val summed for this owner, times the configured penalty rate. */
  penalty: number;
  /** This owner's CP_Servicing_Val total — the penalty basis. */
  cpValue: number;
}

/** Per-wakala activity evaluation for one week, kept as history. */
export interface WeeklyWakalaEvaluation {
  msisdn: string;
  ownerId: string | null;
  ownerName: string | null;
  cashInTxns: number;
  cashOutTxns: number;
  totalTxns: number;
  totalValue: number;
  isActive: boolean;
  /** null when the week's rows carried no servicing_status value at all. */
  isServed: boolean | null;
  /** This wakala's CP_Servicing_Val for the week — the penalty basis. */
  cpValue: number;
  /** This wakala's IOP volume for the week, read from the report's own IOP column. */
  iopValue: number;
}

export interface WeeklyStatsEntry extends WeeklyWakalaStats {
  reportingWeek: string;
  reportingMonth?: string;
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

const TXN_KEYS = [
  'SA_Servicing_Txns', 'SA Servicing Txns', 'SA_Servicing_Transactions',
  'SA Servicing Transactions', 'sa_servicing_txns', 'servicing_txns',
  'Servicing Transactions', 'Transaction Count', 'Transactions', 'Txns',
];
const VAL_KEYS = [
  'SA_Servicing_Val', 'SA Servicing Val', 'SA_Servicing_Value',
  'SA Servicing Value', 'sa_servicing_val', 'servicing_val',
  'Servicing Amount', 'Transaction Amount', 'Volume', 'Amount', 'Value',
];
/** The penalty basis: CP_Servicing_Val, the value serviced via a cross-partner network. */
const CP_VAL_KEYS = [
  'CP_Servicing_Val', 'CP Servicing Val', 'cp_servicing_val',
  'CP_Servicing_Value', 'cp_servicing_value',
];
/** The report's own IOP column: volume serviced outside the company for a wakala still in our base. */
const IOP_KEYS = ['IOP', 'iop', 'Iop'];

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
  resolveOwner?: (msisdn: string) => { ownerId: string; ownerName: string } | null,
  rules: ActivityRules = getActivityRules()
):
  | (WeeklyWakalaStats & { byOwner: WeeklyOwnerBreakdown[]; evaluations: WeeklyWakalaEvaluation[] })
  | null {
  if (!rows || rows.length === 0) return null;

  const wakalaMap = new Map<
    string,
    {
      txns: number;
      val: number;
      cashIn: number;
      cashOut: number;
      countTotal: number;
      hasStatusCol: boolean;
      servedStatus: boolean | null;
      statusActive: boolean;
      cpValue: number;
      reportedIop: number;
    }
  >();

  rows.forEach((row: any) => {
    const msisdn = String(row.MSISDN || row.msisdn || row.phone || row.Phone || '').trim();
    if (!msisdn) return;
    const txns = getFieldValue(row, TXN_KEYS);
    const val = getFieldValue(row, VAL_KEYS);
    const counts = extractTxnCounts(row);
    const rowHasStatus = hasRowStatusKey(row);
    const rowServed = getServicedStatusFromColumn(row);
    const rowStatusActive = isRowStatusActive(row);
    const rowCpValue = getFieldValue(row, CP_VAL_KEYS);
    const rowReportedIop = getFieldValue(row, IOP_KEYS);

    const existing = wakalaMap.get(msisdn);
    if (existing) {
      existing.txns += txns;
      existing.val += val;
      existing.cashIn += counts.cashIn;
      existing.cashOut += counts.cashOut;
      existing.countTotal += counts.total;
      if (rowHasStatus) existing.hasStatusCol = true;
      existing.servedStatus = mergeServicedStatus(existing.servedStatus, rowServed);
      if (rowStatusActive) existing.statusActive = true;
      existing.cpValue += rowCpValue;
      existing.reportedIop += rowReportedIop;
    } else {
      wakalaMap.set(msisdn, {
        txns,
        val,
        cashIn: counts.cashIn,
        cashOut: counts.cashOut,
        countTotal: counts.total,
        hasStatusCol: rowHasStatus,
        servedStatus: rowServed,
        statusActive: rowStatusActive,
        cpValue: rowCpValue,
        reportedIop: rowReportedIop,
      });
    }
  });

  let activeCount = 0;
  let servedCount = 0;
  let notServedCount = 0;
  let noStatusCount = 0;
  let totalValue = 0;
  let totalTxns = 0;
  let cashInTxns = 0;
  let cashOutTxns = 0;
  let baseValue = 0;
  let iopValue = 0;
  let totalCpValue = 0;

  const ownerAgg = new Map<string, WeeklyOwnerBreakdown>();
  const evaluations: WeeklyWakalaEvaluation[] = [];

  wakalaMap.forEach((entry, msisdn) => {
    const { txns, val, cashIn, cashOut, countTotal, servedStatus, statusActive, cpValue, reportedIop } = entry;
    // Active / inactive is the uploaded wakala_status column merged with the
    // configurable system rule (cash-in + cash-out transaction count against
    // the threshold) — an "active" reading from either source wins, mirroring
    // the same merge Monthly data already uses (see KPIReportsView.tsx).
    // Served / unserved is the uploaded servicing_status column merged with
    // the computed amount/transaction rule — a "served" reading from either
    // source wins.
    const counts = { cashIn, cashOut, total: countTotal || txns, amount: val };
    const isActive = statusActive || isActiveByRule(counts, rules);
    const finalServed = mergeServicedStatus(servedStatus, isServedByRule(counts, isActive, rules));
    if (isActive) activeCount++;
    if (finalServed === true) servedCount++;
    else if (finalServed === false) notServedCount++;
    else noStatusCount++;
    totalValue += val;
    totalTxns += txns;
    cashInTxns += cashIn;
    cashOutTxns += cashOut;
    totalCpValue += cpValue;
    iopValue += reportedIop;

    const match = resolveOwner ? resolveOwner(msisdn) : null;
    const ownerId = match?.ownerId || UNASSIGNED_ID;
    const ownerName = match?.ownerName || 'Unassigned';
    if (match) baseValue += val;

    evaluations.push({
      msisdn,
      ownerId: match?.ownerId || null,
      ownerName: match?.ownerName || null,
      cashInTxns: cashIn,
      cashOutTxns: cashOut,
      totalTxns: countTotal || txns,
      totalValue: val,
      isActive,
      isServed: finalServed,
      cpValue,
      iopValue: reportedIop,
    });

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
        iopValue: 0,
        penalty: 0,
        cpValue: 0,
      };
      ownerAgg.set(ownerId, agg);
    }
    agg.total++;
    if (isActive) agg.active++;
    else agg.inactive++;
    if (finalServed === true) agg.served++;
    else if (finalServed === false) agg.notServed++;
    else agg.noStatus++;
    agg.value += val;
    agg.txns += txns;
    agg.iopValue += reportedIop;
    agg.cpValue += cpValue;
  });

  ownerAgg.forEach(agg => {
    agg.penalty = calculatePenalty(agg.cpValue, rules);
  });

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
    baseValue,
    iopValue,
    cashInTxns,
    cashOutTxns,
    cpValue: totalCpValue,
    penalty: calculatePenalty(totalCpValue, rules),
    byOwner: Array.from(ownerAgg.values()).sort((a, b) => b.value - a.value),
    evaluations,
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

const MONTH_NAMES_LOWER = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/**
 * Parses a "Week N (Month D - Month D, YYYY)" reportingWeek label (see
 * buildUploadWeekOptions in UploadReportsView.tsx) into an inclusive ISO
 * date range. Returns null if the label doesn't match that shape.
 */
export function parseWeekDateRange(reportingWeek: string): { start: string; end: string } | null {
  const match = String(reportingWeek || '').match(
    /\(([A-Za-z]+)\s+(\d{1,2})\s*-\s*[A-Za-z]+\s+(\d{1,2}),\s*(\d{4})\)/
  );
  if (!match) return null;
  const [, monthName, startDay, endDay, year] = match;
  const monthIndex = MONTH_NAMES_LOWER.indexOf(monthName.toLowerCase());
  if (monthIndex < 0) return null;
  const pad = (n: string) => n.padStart(2, '0');
  return {
    start: `${year}-${pad(String(monthIndex + 1))}-${pad(startDay)}`,
    end: `${year}-${pad(String(monthIndex + 1))}-${pad(endDay)}`,
  };
}

export interface WeeklyIopOwnerComparison {
  ownerId: string;
  ownerName: string;
  reportedIop: number;
  dailyMgtIop: number;
  /** dailyMgtIop - reportedIop. Never a good sign in either direction — IOP always represents externally-serviced (leaked) volume. */
  iopRemaining: number;
  /** This owner's CP_Servicing_Val for the week — the penalty basis. */
  cpValue: number;
}

export interface WeeklyIopComparison {
  reportingWeek: string;
  /** This week's IOP total from the uploaded report's own IOP column. */
  reportedIop: number;
  /** Daily MGT's own IOP-bucket total (classification.ts) for this week's date range. */
  dailyMgtIop: number;
  /** dailyMgtIop - reportedIop. Never a good sign in either direction — IOP always represents externally-serviced (leaked) volume. */
  iopRemaining: number;
  /** This week's CP_Servicing_Val total — the penalty basis. */
  cpValue: number;
  byOwner: WeeklyIopOwnerComparison[];
}

/**
 * Compares one week's Daily MGT IOP-bucket total against the same week's
 * uploaded report's own IOP column — both scoped to the week's date range
 * (Daily MGT) or already scoped by the caller (the report figures).
 * classifiedDailyRows is the full, unfiltered classifyServicingRows() output
 * for Daily MGT transactions; this filters it to the week internally.
 */
export function computeWeeklyIopComparison(
  reportingWeek: string,
  classifiedDailyRows: Array<{ row: any; bucket: string; attributedOwnerId: string | null; attributedOwnerName: string | null }>,
  reportedIopTotal: number,
  reportedIopByOwner: WeeklyOwnerBreakdown[],
  reportedCpValueTotal: number = 0
): WeeklyIopComparison | null {
  const range = parseWeekDateRange(reportingWeek);
  if (!range) return null;

  const getAmount = (row: any): number =>
    Math.abs(Number(row['Amount'] ?? row['Volume (TZS)'] ?? row['volume'] ?? row['servicedVolume'] ?? 0)) || 0;

  let dailyMgtIop = 0;
  const dailyMgtIopByOwner = new Map<string, { ownerName: string; value: number }>();

  classifiedDailyRows.forEach(c => {
    if (c.bucket !== 'IOP') return;
    const dateStr = formatToISODate(
      String(c.row['Servicing Date'] || c.row['date'] || c.row['Date'] || c.row['Timestamp'] || '')
    );
    if (dateStr < range.start || dateStr > range.end) return;

    const amount = getAmount(c.row);
    dailyMgtIop += amount;

    const ownerId = c.attributedOwnerId || UNASSIGNED_ID;
    const ownerName = c.attributedOwnerName || 'Unassigned';
    const existing = dailyMgtIopByOwner.get(ownerId);
    if (existing) existing.value += amount;
    else dailyMgtIopByOwner.set(ownerId, { ownerName, value: amount });
  });

  const byOwnerMap = new Map<string, WeeklyIopOwnerComparison>();
  reportedIopByOwner.forEach(o => {
    byOwnerMap.set(o.ownerId, {
      ownerId: o.ownerId,
      ownerName: o.ownerName,
      reportedIop: o.iopValue || 0,
      dailyMgtIop: 0,
      iopRemaining: 0,
      cpValue: o.cpValue || 0,
    });
  });
  dailyMgtIopByOwner.forEach((v, ownerId) => {
    const existing = byOwnerMap.get(ownerId);
    if (existing) existing.dailyMgtIop = v.value;
    else byOwnerMap.set(ownerId, { ownerId, ownerName: v.ownerName, reportedIop: 0, dailyMgtIop: v.value, iopRemaining: 0, cpValue: 0 });
  });

  const byOwner = Array.from(byOwnerMap.values())
    .map(o => ({ ...o, iopRemaining: o.dailyMgtIop - o.reportedIop }))
    .filter(o => o.reportedIop !== 0 || o.dailyMgtIop !== 0)
    .sort((a, b) => Math.abs(b.iopRemaining) - Math.abs(a.iopRemaining));

  return {
    reportingWeek,
    reportedIop: reportedIopTotal,
    dailyMgtIop,
    iopRemaining: dailyMgtIop - reportedIopTotal,
    cpValue: reportedCpValueTotal,
    byOwner,
  };
}
