import { ClassifiedRow } from './classification';
import { AgentTarget, Owner, ManualOwnerTarget } from '../types';
import { resolveOwnerMatch } from './ownerMatch';
import { resolveOwnerTarget, getSavedManualOwnerTargets } from './targetResolution';
import { formatToISODate } from './mappingEngine';
import { parseWeekDateRange, type WeeklyStatsEntry } from './weeklyKpiEngine';

export type KPI1Status = 'Green' | 'Blue' | 'Yellow' | 'Red';

export interface OwnerMtdVolumeResult {
  servedVolume: number;
  baseVolume: number;
  iopVolume: number;
}

/**
 * Per owner, per week within `period`: takes the greater of Daily MGT's
 * classified served volume and the Weekly Report's own served volume for
 * that week. Daily MGT and the Weekly Report are two independent
 * descriptions of the same underlying business (the same reason "IOP
 * Remaining" compares rather than adds them) — summing them would double
 * count, so weeks are reconciled by max, not addition. Days that fall
 * outside every parsed weekly-report week (no weekly upload covers them)
 * have no counterpart to compare against, so their Daily MGT volume is
 * counted as-is.
 */
function calculateServedVolumeWithWeeklyMax(
  classifiedRows: ClassifiedRow[],
  weeklyStats: WeeklyStatsEntry[],
  period: string
): Map<string, number> {
  const rowsWithDate = classifiedRows
    .filter(cr => cr.bucket === 'BASE' || cr.bucket === 'IOP')
    .map(cr => ({
      ownerId: cr.auditRecord?.ownerId,
      amount: cr.auditRecord?.amount || 0,
      date: formatToISODate(
        String(cr.row['Servicing Date'] || cr.row['date'] || cr.row['Date'] || cr.row['Timestamp'] || '')
      ),
    }))
    .filter((r): r is { ownerId: string; amount: number; date: string } => !!r.ownerId && r.ownerId !== 'UNASSIGNED');

  const weeksInPeriod = weeklyStats.filter(w => w.reportingMonth === period);
  const coveredDates = new Set<string>();
  const servedByOwner = new Map<string, number>();

  weeksInPeriod.forEach(week => {
    const range = parseWeekDateRange(week.reportingWeek);
    if (!range) return;

    const dailyByOwner = new Map<string, number>();
    rowsWithDate.forEach(r => {
      if (r.date < range.start || r.date > range.end) return;
      coveredDates.add(r.date);
      dailyByOwner.set(r.ownerId, (dailyByOwner.get(r.ownerId) || 0) + r.amount);
    });

    const reportByOwner = new Map<string, number>();
    (week.byOwner || []).forEach(b => reportByOwner.set(b.ownerId, b.value || 0));

    const ownerIdsThisWeek = new Set([...dailyByOwner.keys(), ...reportByOwner.keys()]);
    ownerIdsThisWeek.forEach(ownerId => {
      const weekMax = Math.max(dailyByOwner.get(ownerId) || 0, reportByOwner.get(ownerId) || 0);
      servedByOwner.set(ownerId, (servedByOwner.get(ownerId) || 0) + weekMax);
    });
  });

  rowsWithDate.forEach(r => {
    if (coveredDates.has(r.date)) return;
    servedByOwner.set(r.ownerId, (servedByOwner.get(r.ownerId) || 0) + r.amount);
  });

  return servedByOwner;
}

/**
 * Calculates MTD volume breakdown (served, base, iop) across classified rows for all owners.
 * Base/IOP split always comes from Daily MGT classification. When weeklyStats + period are
 * given, `servedVolume` (the figure KPI1 achievement is measured against) is reconciled
 * week-by-week against the Weekly Report using calculateServedVolumeWithWeeklyMax, so an
 * uploaded weekly report counts toward the target instead of being invisible to it.
 */
export function calculateMtdVolumes(
  classifiedRows: ClassifiedRow[],
  weeklyStats?: WeeklyStatsEntry[],
  period?: string
): Map<string, OwnerMtdVolumeResult> {
  const result = new Map<string, OwnerMtdVolumeResult>();

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
    for (const cr of classifiedRows) {
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
