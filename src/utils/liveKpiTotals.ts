import { ClassifiedRow } from './classification';
import { Owner, PriorityWakala, BaseWakala, ManualOwnerTarget } from '../types';
import { calculateKPI1 } from './kpiEngine';
import { calculateKPI2 } from './kpi2Engine';
import type { WeeklyStatsEntry } from './weeklyKpiEngine';

export interface LiveKpiTotals {
  kpi1: { target: number; achieved: number } | null;
  kpi2: { target: number; achieved: number } | null;
}

/**
 * Company-wide KPI1/KPI2 target vs. achieved, recomputed live from Daily MGT
 * classification (+ Weekly Report reconciliation for KPI1). Shared by
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
  weeklyStats?: WeeklyStatsEntry[]
): LiveKpiTotals {
  const kpi1Results = calculateKPI1(classifiedRows, [], owners, period, manualTargets, weeklyStats);
  const kpi1Target = kpi1Results.reduce((s, r) => s + (r.hasTarget ? r.monthlyTarget : 0), 0);
  const kpi1Achieved = kpi1Results.reduce((s, r) => s + r.servedVolume, 0);

  const kpi2Results = calculateKPI2(classifiedRows, owners, period, manualTargets, priorityWakalas, baseWakalaIndex);
  const kpi2Target = kpi2Results.reduce((s, r) => s + (r.hasTarget ? r.normalTarget + r.priorityTarget : 0), 0);
  const kpi2Achieved = kpi2Results.reduce((s, r) => s + (r.hasTarget ? r.normalServed + r.priorityServed : 0), 0);

  return {
    kpi1: kpi1Target > 0 ? { target: kpi1Target, achieved: kpi1Achieved } : null,
    kpi2: kpi2Target > 0 ? { target: kpi2Target, achieved: kpi2Achieved } : null,
  };
}
