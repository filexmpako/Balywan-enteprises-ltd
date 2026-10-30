import { ClassifiedRow } from './classification';
import { Owner, ManualOwnerTarget } from '../types';
import { resolveOwnerTarget, getSavedManualOwnerTargets } from './targetResolution';
import { weightedKpi1 } from './ownerKpiScore';
import { formatToISODate } from './mappingEngine';
import { parseWeekDateRange, type WeeklyStatsEntry } from './weeklyKpiEngine';
import { periodsMatch, toIsoPeriod } from './periodUtils';

function rowIsoDate(cr: ClassifiedRow): string {
  return formatToISODate(
    String(cr.row['Servicing Date'] || cr.row['date'] || cr.row['Date'] || cr.row['Timestamp'] || '')
  );
}

/**
 * Keeps only the rows whose servicing date falls in `period` (ISO "YYYY-MM"
 * or a label like "September 2026"). Daily MGT history spans every uploaded
 * month, so month-to-date figures must be cut to the selected month.
 */
export function filterClassifiedRowsToPeriod(rows: ClassifiedRow[], period?: string): ClassifiedRow[] {
  if (!period) return rows;
  const iso = toIsoPeriod(period);
  if (!/^\d{4}-\d{2}$/.test(iso)) return rows;
  return rows.filter(cr => rowIsoDate(cr).slice(0, 7) === iso);
}

export type KPI1Status = 'Green' | 'Blue' | 'Yellow' | 'Red';

/** Where a served figure came from. */
export type MtdSource = 'daily' | 'weekly' | 'monthly';

export interface OwnerMtdVolumeResult {
  /** Base + IOP: the KPI 1 served value. */
  servedVolume: number;
  baseVolume: number;
  iopVolume: number;
  baseSource: MtdSource;
  iopSource: MtdSource;
  /** Daily MGT alone, for comparison. */
  dailyBase: number;
  dailyIop: number;
}

/** The month's Monthly report per owner: SA servicing value (Base) and IOP. Final once uploaded. */
export interface MonthlyServedValues {
  servedValueByOwner: Map<string, number>;
  iopValueByOwner: Map<string, number>;
}

const emptyVolume = (): OwnerMtdVolumeResult => ({
  servedVolume: 0, baseVolume: 0, iopVolume: 0, baseSource: 'daily', iopSource: 'daily', dailyBase: 0, dailyIop: 0,
});

/**
 * The newest weekly-report entry for `period`, by the end date of its week
 * (upload order as the tie-breaker).
 */
export function latestWeeklyEntryForPeriod(weeklyStats: WeeklyStatsEntry[], period: string): WeeklyStatsEntry | null {
  let latest: WeeklyStatsEntry | null = null;
  let latestEnd = '';
  weeklyStats.forEach(w => {
    if (!periodsMatch(w.reportingMonth, period)) return;
    const end = parseWeekDateRange(w.reportingWeek)?.end || '';
    if (!latest || end >= latestEnd) {
      latest = w;
      latestEnd = end;
    }
  });
  return latest;
}

export type SettlementReport =
  | { kind: 'monthly'; month: string; iso: string; isFallback: boolean }
  | { kind: 'weekly'; entry: WeeklyStatsEntry; iso: string; isFallback: boolean };

/**
 * The report the Settlement Ledger shows for `period`: that month's report,
 * else the most recent earlier month that has one (the first days of a new
 * month have no report yet). Within the chosen month the Monthly report is
 * final and wins over the latest weekly report. `month` is the label the
 * monthly rows are stored under.
 */
export function pickSettlementReport(
  period: string,
  monthlyMonths: string[],
  weeklyStats: WeeklyStatsEntry[],
): SettlementReport | null {
  const iso = toIsoPeriod(period);
  const valid = (m: string) => /^\d{4}-\d{2}$/.test(m) && m <= iso;
  const months = new Set(
    [...monthlyMonths.map(m => toIsoPeriod(m)), ...weeklyStats.map(w => toIsoPeriod(w.reportingMonth || ''))].filter(valid),
  );
  const chosen = months.has(iso) ? iso : Array.from(months).sort().pop();
  if (!chosen) return null;
  const isFallback = chosen !== iso;
  const monthly = monthlyMonths.find(m => toIsoPeriod(m) === chosen);
  if (monthly) return { kind: 'monthly', month: monthly, iso: chosen, isFallback };
  const entry = latestWeeklyEntryForPeriod(weeklyStats, chosen);
  return entry ? { kind: 'weekly', entry, iso: chosen, isFallback } : null;
}

/**
 * The last day a report covers: its week's end date when that falls in the
 * report's month (weekly reports are month-to-date), else undefined (the
 * whole month).
 */
export function reportEndDate(entry: WeeklyStatsEntry | null | undefined): string | undefined {
  if (!entry) return undefined;
  const end = parseWeekDateRange(entry.reportingWeek)?.end;
  return end && end.slice(0, 7) === toIsoPeriod(entry.reportingMonth || '') ? end : undefined;
}

/**
 * Daily MGT IOP for `period`, month-to-date up to `endDate` (ISO, inclusive)
 * when given: the whole company, or one servicing owner when ownerId is set.
 */
export function dailyIopForPeriod(
  classifiedRows: ClassifiedRow[],
  period: string,
  ownerId?: string,
  endDate?: string,
): number {
  let total = 0;
  for (const cr of filterClassifiedRowsToPeriod(classifiedRows, period)) {
    if (cr.bucket !== 'IOP') continue;
    if (ownerId && cr.auditRecord?.ownerId !== ownerId) continue;
    if (endDate && rowIsoDate(cr) > endDate) continue;
    total += cr.auditRecord?.amount || 0;
  }
  return total;
}

/** Volume with no owner, keyed like the weekly / monthly reports' unassigned bucket. */
export const UNASSIGNED_OWNER_KEY = '__unassigned__';

function mtdOwnerKey(cr: ClassifiedRow): string {
  const ownerId = cr.auditRecord?.ownerId;
  return !ownerId || ownerId === 'UNASSIGNED' ? UNASSIGNED_OWNER_KEY : ownerId;
}

/**
 * Month-to-date Base and IOP served per owner, plus volume with no owner under
 * UNASSIGNED_OWNER_KEY (counted in company totals). Only rows dated in
 * `period` count. Each type is the greater of Daily MGT and the latest weekly
 * report for the month (Base = the report's SA servicing value, IOP = its IOP
 * column); the telco weekly report is itself month-to-date, so weeks are never
 * added together. The month's own Monthly report (`monthly`) is final for both.
 * servedVolume, the KPI 1 served value, is Base + IOP.
 */
export function calculateMtdVolumes(
  allClassifiedRows: ClassifiedRow[],
  weeklyStats?: WeeklyStatsEntry[],
  period?: string,
  monthly?: MonthlyServedValues | null
): Map<string, OwnerMtdVolumeResult> {
  const result = new Map<string, OwnerMtdVolumeResult>();
  const get = (ownerId: string) => {
    let v = result.get(ownerId);
    if (!v) result.set(ownerId, (v = emptyVolume()));
    return v;
  };

  for (const cr of filterClassifiedRowsToPeriod(allClassifiedRows, period)) {
    if (cr.bucket !== 'BASE' && cr.bucket !== 'IOP') continue;
    const v = get(mtdOwnerKey(cr));
    const amount = cr.auditRecord?.amount || 0;
    if (cr.bucket === 'BASE') v.dailyBase += amount;
    else v.dailyIop += amount;
  }

  const report = new Map<string, { base: number; iop: number }>();
  let source: MtdSource = 'daily';
  if (monthly) {
    source = 'monthly';
    monthly.servedValueByOwner.forEach((base, ownerId) => report.set(ownerId, { base, iop: monthly.iopValueByOwner.get(ownerId) || 0 }));
    monthly.iopValueByOwner.forEach((iop, ownerId) => { if (!report.has(ownerId)) report.set(ownerId, { base: 0, iop }); });
  } else if (weeklyStats?.length && period) {
    const entry = latestWeeklyEntryForPeriod(weeklyStats, period);
    if (entry) source = 'weekly';
    // The weekly IOP column covers in-base wakalas serviced elsewhere, so it
    // never feeds KPI 1 IOP (off-base wakalas served by our owners = Daily MGT).
    (entry?.byOwner || []).forEach(b => {
      if (b.ownerId) report.set(b.ownerId, { base: b.value || 0, iop: 0 });
    });
  }
  report.forEach((_, ownerId) => get(ownerId));

  result.forEach((v, ownerId) => {
    const r = report.get(ownerId) || { base: 0, iop: 0 };
    if (source === 'monthly') {
      v.baseVolume = r.base;
      v.iopVolume = r.iop;
      v.baseSource = v.iopSource = 'monthly';
    } else {
      v.baseVolume = Math.max(v.dailyBase, r.base);
      v.iopVolume = v.dailyIop;
      v.baseSource = r.base > v.dailyBase ? 'weekly' : 'daily';
      v.iopSource = 'daily';
    }
    v.servedVolume = v.baseVolume + v.iopVolume;
  });

  return result;
}

/**
 * MTD volumes for one owner, or the whole company's Daily MGT when ownerId is
 * omitted. Pass weeklyStats + period (and the Monthly report) to apply the
 * report rules of calculateMtdVolumes; omitting them keeps pure Daily MGT.
 */
export function calculateOwnerMtdVolume(
  classifiedRows: ClassifiedRow[],
  ownerId?: string,
  weeklyStats?: WeeklyStatsEntry[],
  period?: string,
  monthly?: MonthlyServedValues | null
): OwnerMtdVolumeResult {
  if (!ownerId) {
    const total = emptyVolume();
    for (const cr of filterClassifiedRowsToPeriod(classifiedRows, period)) {
      if (cr.bucket !== 'BASE' && cr.bucket !== 'IOP') continue;
      const amount = cr.auditRecord?.amount || 0;
      if (cr.bucket === 'BASE') total.baseVolume += amount;
      else total.iopVolume += amount;
    }
    total.dailyBase = total.baseVolume;
    total.dailyIop = total.iopVolume;
    total.servedVolume = total.baseVolume + total.iopVolume;
    return total;
  }

  return calculateMtdVolumes(classifiedRows, weeklyStats, period, monthly).get(ownerId) || emptyVolume();
}

export interface KPI1Result {
  ownerId: string;
  ownerName: string;
  period: string;
  servedVolume: number;        // Base + IOP combined, excluding SA_INTERNAL
  baseServed: number;
  iopServed: number;
  baseSource: MtdSource;
  iopSource: MtdSource;
  monthlyTarget: number;
  baseTarget: number;
  iopTarget: number;
  paDayTarget: number;         // monthlyTarget / 24
  achievementPercentage: number;   // uncapped: Base 70% + IOP 30% (weightedKpi1)
  displayPercentage: number;       // Math.min(achievementPercentage, 100) for display only
  status: KPI1Status;
  hasTarget: boolean;
}

function getStatus(pct: number): 'Green' | 'Blue' | 'Yellow' | 'Red' {
  if (pct >= 90) return 'Green';
  if (pct >= 70) return 'Blue';
  if (pct >= 60) return 'Yellow';
  return 'Red';
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Sums KPI 1 monthly targets across every owner for a given period.
 * Shared by TargetsView's "Company Total" row and the Dashboard's
 * "Monthly Goal Progress" card, so both always show the same number.
 */
export function getCompanyTotalKPI1Target(
  owners: Owner[],
  period: string,
  manualTargets?: ManualOwnerTarget[]
): { total: number; hasAny: boolean } {
  const actualManualTargets = manualTargets || getSavedManualOwnerTargets();
  let total = 0;
  let hasAny = false;
  owners.forEach(owner => {
    const res = resolveOwnerTarget(owner.id || '', period, actualManualTargets);
    if (res.source === 'manual') {
      total += res.monthlyTarget;
      hasAny = true;
    }
  });
  return { total, hasAny };
}

/**
 * Computes KPI 1 (Total Serviced Volume against monthly target) for every owner, for a given period.
 * Consumes ALREADY-classified rows (get these via getClassifiedRowsCached
 * in the caller) — this function does no classification itself, only
 * aggregation, so it stays fast and independently testable.
 * Pass weeklyStats (e.g. from readWeeklyStatsHistory()) so an uploaded
 * Weekly Report counts toward the target, and `monthly` once the month's
 * Monthly report is uploaded (final) — see calculateMtdVolumes.
 */
export function calculateKPI1(
  classifiedRows: ClassifiedRow[],
  owners: Owner[],
  period: string,
  manualTargets?: ManualOwnerTarget[],
  weeklyStats?: WeeklyStatsEntry[],
  monthly?: MonthlyServedValues | null
): KPI1Result[] {
  const results: KPI1Result[] = [];
  const actualManualTargets = manualTargets || getSavedManualOwnerTargets();

  // Aggregate served volume (BASE + IOP combined) per owner
  const mtdVolumes = calculateMtdVolumes(classifiedRows, weeklyStats, period, monthly);

  for (const owner of owners) {
    if (!owner) continue;
    const ownerId = owner.id || '';
    
    // Resolve target (manual override)
    const targetRes = resolveOwnerTarget(
      ownerId,
      period,
      actualManualTargets
    );

    const monthlyTarget = targetRes.monthlyTarget || 0;
    const paDayTarget = monthlyTarget / 24;
    const ownerVolume = (ownerId && mtdVolumes.get(ownerId)) || emptyVolume();
    const servedVolume = ownerVolume.servedVolume;

    // Uncapped: Base 70% + IOP 30% against their own targets
    const achievementPercentage = weightedKpi1(ownerVolume.baseVolume, targetRes.baseTarget, ownerVolume.iopVolume, targetRes.iopTarget);
    // Capped display percentage
    const displayPercentage = Math.min(100, achievementPercentage);

    results.push({
      ownerId,
      ownerName: owner.name || 'Unknown Owner',
      period,
      servedVolume,
      baseServed: ownerVolume.baseVolume,
      iopServed: ownerVolume.iopVolume,
      baseSource: ownerVolume.baseSource,
      iopSource: ownerVolume.iopSource,
      monthlyTarget,
      baseTarget: targetRes.baseTarget,
      iopTarget: targetRes.iopTarget,
      paDayTarget,
      achievementPercentage: round1(achievementPercentage),
      displayPercentage: round1(displayPercentage),
      status: getStatus(displayPercentage),
      hasTarget: targetRes.source !== 'none' && monthlyTarget > 0,
    });
  }

  return results;
}
