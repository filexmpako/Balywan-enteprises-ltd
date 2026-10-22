/** Owner KPI overview scoring, matching the company KPI sheet. */
export const KPI_WEIGHTS = { kpi1: 40, kpi2: 50, kpi3: 10 } as const;
export const SERVED_TARGET_RATE = 0.8;
export const ACTIVE_TARGET_RATE = 0.9;
export const KPI2_SPLIT = { normal: 70, priority: 30 } as const;

const pct = (num: number, den: number) => (den > 0 ? (num / den) * 100 : 0);
const cap = (v: number) => Math.min(100, Math.max(0, v));

export interface OwnerKpiInput {
  servedValue: number;
  monthlyTarget: number;
  normalBase: number;
  normalServed: number;
  priorityBase: number;
  priorityServed: number;
  activeBase: number;
  active: number;
}

export function scoreOwnerKpis(i: OwnerKpiInput) {
  const kpi1 = pct(i.servedValue, i.monthlyTarget);
  const normalTarget = Math.round(i.normalBase * SERVED_TARGET_RATE);
  const priorityTarget = Math.round(i.priorityBase * SERVED_TARGET_RATE);
  const normalShare = (cap(pct(i.normalServed, normalTarget)) * KPI2_SPLIT.normal) / 100;
  const priorityShare = (cap(pct(i.priorityServed, priorityTarget)) * KPI2_SPLIT.priority) / 100;
  const kpi2 = normalShare + priorityShare;
  const activeTarget = Math.round(i.activeBase * ACTIVE_TARGET_RATE);
  const kpi3 = pct(i.active, activeTarget);
  const perf = {
    kpi1: (cap(kpi1) * KPI_WEIGHTS.kpi1) / 100,
    kpi2: (cap(kpi2) * KPI_WEIGHTS.kpi2) / 100,
    kpi3: (cap(kpi3) * KPI_WEIGHTS.kpi3) / 100,
  };
  return {
    kpi1, kpi2, kpi3, normalShare, priorityShare,
    normalTarget, priorityTarget, activeTarget, perf,
    overall: perf.kpi1 + perf.kpi2 + perf.kpi3,
  };
}
