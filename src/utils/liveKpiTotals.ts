import { ClassifiedRow } from './classification';
import { Owner, PriorityWakala, BaseWakala, ManualOwnerTarget } from '../types';
import { calculateKPI1, calculateMtdVolumes, latestWeeklyEntryForPeriod, UNASSIGNED_OWNER_KEY } from './kpiEngine';
import { calculateKPI2 } from './kpi2Engine';
import { weightedKpi1 } from './ownerKpiScore';
import type { WeeklyStatsEntry } from './weeklyKpiEngine';
import type { MonthlyKpiOverride } from './monthlySettlement';

export interface LiveKpiTotals {
  /** `percent`: Base 70% + IOP 30% against the summed Base and IOP targets. */
  kpi1: { target: number; achieved: number; percent: number } | null;
  kpi2: { target: number; achieved: number } | null;
}

/**
 * Company-wide KPI1/KPI2 target vs. achieved, recomputed live from Daily MGT
 * classification (+ Weekly Report reconciliation for KPI1), or from the
 * month's Monthly report when it is uploaded (final for both KPIs). Without
 * one, KPI2 takes the month's weekly servicing_status (`weeklyServed`, see
 * loadWeeklyServedMap) where given. Achieved counts every wakala, including
 * those with no owner. Shared by
 * DashboardView and KPIReportsView so their "Telecom-Reported KPIs" rows can
 * never independently drift from each other for the same period.
 */
export function computeLiveKpiTotals(
  classifiedRows: ClassifiedRow[],
  owners: Owner[],
  period: string,
  manualTargets: ManualOwnerTarget[],
  priorityWakalas: PriorityWakala[],
  baseWakalaIndex: BaseWakala[],
  weeklyStats?: WeeklyStatsEntry[],
  monthly?: MonthlyKpiOverride | null,
  weeklyServed?: Map<string, boolean> | null
): LiveKpiTotals {
  const kpi1Results = calculateKPI1(classifiedRows, owners, period, manualTargets, weeklyStats, monthly);
  let baseTarget = 0;
  let iopTarget = 0;
  kpi1Results.forEach(r => {
    if (!r.hasTarget) return;
    baseTarget += r.baseTarget;
    iopTarget += r.iopTarget;
  });
  const kpi1Target = baseTarget + iopTarget;
  // Every wakala counts toward the company figure, with or without an owner.
  let baseAchieved = 0;
  let iopAchieved = 0;
  calculateMtdVolumes(classifiedRows, weeklyStats, period, monthly).forEach(v => {
    baseAchieved += v.baseVolume;
    iopAchieved += v.iopVolume;
  });
  const kpi1Achieved = baseAchieved + iopAchieved;

  const weekly = monthly ? null : weeklyServed || null;
  const kpi2Results = calculateKPI2(classifiedRows, owners, period, manualTargets, priorityWakalas, baseWakalaIndex, monthly?.servedByMsisdn ?? weekly ?? undefined);
  const kpi2Target = kpi2Results.reduce((s, r) => s + (r.hasTarget ? r.normalTarget + r.priorityTarget : 0), 0);
  const kpi2Achieved =
    kpi2Results.reduce((s, r) => s + (r.hasTarget ? r.normalServed + r.priorityServed : 0), 0) +
    (monthly
      ? monthly.unassignedServed
      : weekly
        ? latestWeeklyEntryForPeriod(weeklyStats || [], period)?.byOwner.find(b => b.ownerId === UNASSIGNED_OWNER_KEY)?.served ?? 0
        : 0);

  return {
    kpi1: kpi1Target > 0
      ? { target: kpi1Target, achieved: kpi1Achieved, percent: weightedKpi1(baseAchieved, baseTarget, iopAchieved, iopTarget) }
      : null,
    kpi2: kpi2Target > 0 ? { target: kpi2Target, achieved: kpi2Achieved } : null,
  };
}
