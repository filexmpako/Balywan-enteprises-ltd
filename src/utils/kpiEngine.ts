import { ClassifiedRow } from './classification';
import { AgentTarget, Owner, ManualOwnerTarget } from '../types';
import { resolveOwnerMatch } from './ownerMatch';
import { resolveOwnerTarget, getSavedManualOwnerTargets } from './targetResolution';

export type KPI1Status = 'Green' | 'Blue' | 'Yellow' | 'Red';

export interface OwnerMtdVolumeResult {
  servedVolume: number;
  baseVolume: number;
  iopVolume: number;
}

/**
 * Calculates MTD volume breakdown (served, base, iop) across classified rows for all owners.
 */
export function calculateMtdVolumes(
  classifiedRows: ClassifiedRow[]
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

  return result;
}

/**
 * Calculates MTD volume breakdown for a specific ownerId or overall if ownerId is omitted.
 */
export function calculateOwnerMtdVolume(
  classifiedRows: ClassifiedRow[],
  ownerId?: string
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

  const map = calculateMtdVolumes(classifiedRows);
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
 */
export function calculateKPI1(
  classifiedRows: ClassifiedRow[],
  agentTargets: AgentTarget[],
  owners: Owner[],
  period: string,
  manualTargets?: ManualOwnerTarget[]
): KPI1Result[] {
  const results: KPI1Result[] = [];
  const actualManualTargets = manualTargets || getSavedManualOwnerTargets();

  // Aggregate served volume (BASE + IOP combined) per owner
  const mtdVolumes = calculateMtdVolumes(classifiedRows);

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
