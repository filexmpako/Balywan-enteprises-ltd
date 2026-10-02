import { ClassifiedRow } from './classification';
import { AgentTarget, Owner, ManualOwnerTarget } from '../types';
import { resolveOwnerMatch } from './ownerMatch';
import { resolveOwnerTarget, getSavedManualOwnerTargets } from './targetResolution';
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

export interface OwnerMtdVolumeResult {
  servedVolume: number;
  baseVolume: number;
  iopVolume: number;
}

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

/**
 * The weekly report the Settlement Ledger shows for `period`: that month's
 * own latest entry, else the newest entry of the most recent earlier month
 * (the first days of a new month have no report yet).
 */
export function latestWeeklyEntryAtOrBefore(weeklyStats: WeeklyStatsEntry[], period: string): WeeklyStatsEntry | null {
  const own = latestWeeklyEntryForPeriod(weeklyStats, period);
  if (own) return own;
  const iso = toIsoPeriod(period);
  const earlier = Array.from(new Set(weeklyStats.map(w => toIsoPeriod(w.reportingMonth || ''))))
    .filter(m => /^\d{4}-\d{2}$/.test(m) && m < iso)
    .sort();
  const month = earlier[earlier.length - 1];
  return month ? latestWeeklyEntryForPeriod(weeklyStats, month) : null;
}

/** Daily MGT IOP for `period`: the whole company, or one servicing owner when ownerId is given. */
export function dailyIopForPeriod(classifiedRows: ClassifiedRow[], period: string, ownerId?: string): number {
  let total = 0;
  for (const cr of filterClassifiedRowsToPeriod(classifiedRows, period)) {
    if (cr.bucket !== 'IOP') continue;
    if (ownerId && cr.auditRecord?.ownerId !== ownerId) continue;
    total += cr.auditRecord?.amount || 0;
  }
  return total;
}

/**
 * Per owner: the greater of Daily MGT's month-to-date served volume and the
 * latest weekly report's served value for the month. The telco weekly report
 * is itself month-to-date (its Month column is the whole month and its
 * values track Daily MGT's MTD totals), so weeks must not be added to each
 * other or to earlier Daily MGT days — that double counts. `classifiedRows`
 * must already be cut to `period`.
 */
function calculateServedVolumeWithWeeklyMax(
  classifiedRows: ClassifiedRow[],
  weeklyStats: WeeklyStatsEntry[],
  period: string
): Map<string, number> {
  const dailyByOwner = new Map<string, number>();
  classifiedRows.forEach(cr => {
    if (cr.bucket !== 'BASE' && cr.bucket !== 'IOP') return;
    const ownerId = cr.auditRecord?.ownerId;
    if (!ownerId || ownerId === 'UNASSIGNED') return;
    dailyByOwner.set(ownerId, (dailyByOwner.get(ownerId) || 0) + (cr.auditRecord?.amount || 0));
  });

  const reportByOwner = new Map<string, number>();
  (latestWeeklyEntryForPeriod(weeklyStats, period)?.byOwner || []).forEach(b => {
    if (b.ownerId) reportByOwner.set(b.ownerId, b.value || 0);
  });

  const servedByOwner = new Map<string, number>();
  new Set([...dailyByOwner.keys(), ...reportByOwner.keys()]).forEach(ownerId => {
    servedByOwner.set(ownerId, Math.max(dailyByOwner.get(ownerId) || 0, reportByOwner.get(ownerId) || 0));
  });
  return servedByOwner;
}

/**
 * Calculates MTD volume breakdown (served, base, iop) across classified rows for all owners.
 * Only rows dated in `period` count when a period is given. Base/IOP split always comes from
 * Daily MGT classification. When weeklyStats + period are given, `servedVolume` (the figure
 * KPI1 achievement is measured against) is the greater of Daily MGT and the latest weekly
 * report for the month (see calculateServedVolumeWithWeeklyMax).
 */
export function calculateMtdVolumes(
  allClassifiedRows: ClassifiedRow[],
  weeklyStats?: WeeklyStatsEntry[],
  period?: string
): Map<string, OwnerMtdVolumeResult> {
  const result = new Map<string, OwnerMtdVolumeResult>();
  const classifiedRows = filterClassifiedRowsToPeriod(allClassifiedRows, period);

  for (const cr of classifiedRows) {
    if (cr.bucket !== 'BASE' && cr.bucket !== 'IOP') continue;
    const actingOwnerId = cr.auditRecord?.ownerId;
    if (!actingOwnerId || actingOwnerId === 'UNASSIGNED') continue;
    const amount = cr.auditRecord?.amount || 0;

    let existing = result.get(actingOwnerId);
    if (!existing) {
      existing = { servedVolume: 0, baseVolume: 0, iopVolume: 0 };
      result.set(actingOwnerId, existing);
    }

    existing.servedVolume += amount;
    if (cr.bucket === 'BASE') {
      existing.baseVolume += amount;
    } else if (cr.bucket === 'IOP') {
      existing.iopVolume += amount;
    }
  }

  if (weeklyStats && weeklyStats.length > 0 && period) {
    const weeklyMaxServed = calculateServedVolumeWithWeeklyMax(classifiedRows, weeklyStats, period);
    weeklyMaxServed.forEach((servedVolume, ownerId) => {
      let existing = result.get(ownerId);
      if (!existing) {
        existing = { servedVolume: 0, baseVolume: 0, iopVolume: 0 };
        result.set(ownerId, existing);
      }
      existing.servedVolume = servedVolume;
    });
  }

  return result;
}

/**
 * Calculates MTD volume breakdown for a specific ownerId or overall if ownerId is omitted.
 * Pass weeklyStats + period to reconcile servedVolume against the Weekly Report
 * (see calculateMtdVolumes) — omitting them keeps the pure Daily MGT total.
 */
export function calculateOwnerMtdVolume(
  classifiedRows: ClassifiedRow[],
  ownerId?: string,
  weeklyStats?: WeeklyStatsEntry[],
  period?: string
): OwnerMtdVolumeResult {
  if (!ownerId) {
    let totalServed = 0;
    let totalBase = 0;
    let totalIop = 0;
    for (const cr of filterClassifiedRowsToPeriod(classifiedRows, period)) {
      if (cr.bucket !== 'BASE' && cr.bucket !== 'IOP') continue;
      const amount = cr.auditRecord?.amount || 0;
      totalServed += amount;
      if (cr.bucket === 'BASE') totalBase += amount;
      else if (cr.bucket === 'IOP') totalIop += amount;
    }
    return { servedVolume: totalServed, baseVolume: totalBase, iopVolume: totalIop };
  }

  const map = calculateMtdVolumes(classifiedRows, weeklyStats, period);
  return map.get(ownerId) || { servedVolume: 0, baseVolume: 0, iopVolume: 0 };
}

export interface KPI1Result {
  ownerId: string;
  ownerName: string;
  period: string;
  servedVolume: number;        // Base + IOP combined, excluding SA_INTERNAL
  monthlyTarget: number;
  paDayTarget: number;         // monthlyTarget / 24
  achievementPercentage: number;   // uncapped, real value
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
 * Weekly Report counts toward the target — see calculateMtdVolumes.
 */
export function calculateKPI1(
  classifiedRows: ClassifiedRow[],
  agentTargets: AgentTarget[],
  owners: Owner[],
  period: string,
  manualTargets?: ManualOwnerTarget[],
  weeklyStats?: WeeklyStatsEntry[]
): KPI1Result[] {
  const results: KPI1Result[] = [];
  const actualManualTargets = manualTargets || getSavedManualOwnerTargets();

  // Aggregate served volume (BASE + IOP combined) per owner
  const mtdVolumes = calculateMtdVolumes(classifiedRows, weeklyStats, period);

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
    const ownerVolume = ownerId ? (mtdVolumes.get(ownerId) || { servedVolume: 0, baseVolume: 0, iopVolume: 0 }) : { servedVolume: 0, baseVolume: 0, iopVolume: 0 };
    const servedVolume = ownerVolume.servedVolume;

    // Uncapped achievement percentage
    const achievementPercentage = monthlyTarget > 0 ? (servedVolume / monthlyTarget) * 100 : 0;
    // Capped display percentage
    const displayPercentage = Math.min(100, achievementPercentage);

    results.push({
      ownerId,
      ownerName: owner.name || 'Unknown Owner',
      period,
      servedVolume,
      monthlyTarget,
      paDayTarget,
      achievementPercentage: round1(achievementPercentage),
      displayPercentage: round1(displayPercentage),
      status: getStatus(displayPercentage),
      hasTarget: targetRes.source !== 'none' && monthlyTarget > 0,
    });
  }

  return results;
}
