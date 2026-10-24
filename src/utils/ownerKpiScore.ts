/** Owner KPI overview scoring, matching the company KPI sheet. */
export const KPI_WEIGHTS = { kpi1: 40, kpi2: 50, kpi3: 10 } as const;
const SERVED_TARGET_RATE = 0.8;
const ACTIVE_TARGET_RATE = 0.9;
const KPI2_SPLIT = { normal: 70, priority: 30 } as const;
export const KPI1_SPLIT = { base: 70, iop: 30 } as const;

const pct = (num: number, den: number) => (den > 0 ? (num / den) * 100 : 0);
const cap = (v: number) => Math.min(100, Math.max(0, v));

/**
 * KPI 1 shares (%), uncapped: Base served / Base target weighted 70% and IOP
 * served / IOP target weighted 30%. With only one of the two targets set, that
 * type carries the full weight.
 */
function kpi1Shares(baseServed: number, baseTarget: number, iopServed: number, iopTarget: number) {
  const both = baseTarget > 0 && iopTarget > 0;
  const baseWeight = both ? KPI1_SPLIT.base : baseTarget > 0 ? 100 : 0;
  const iopWeight = both ? KPI1_SPLIT.iop : iopTarget > 0 ? 100 : 0;
  return {
    base: (pct(baseServed, baseTarget) * baseWeight) / 100,
    iop: (pct(iopServed, iopTarget) * iopWeight) / 100,
  };
}

/** KPI 1 achievement (%): the Base and IOP shares added. */
export function weightedKpi1(baseServed: number, baseTarget: number, iopServed: number, iopTarget: number): number {
  const shares = kpi1Shares(baseServed, baseTarget, iopServed, iopTarget);
  return shares.base + shares.iop;
}

export interface OwnerKpiInput {
  baseServed: number;
  baseTarget: number;
  iopServed: number;
  iopTarget: number;
  normalBase: number;
  normalServed: number;
  priorityBase: number;
  priorityServed: number;
  activeBase: number;
  active: number;
}

export function scoreOwnerKpis(i: OwnerKpiInput) {
  const { base: baseShare, iop: iopShare } = kpi1Shares(i.baseServed, i.baseTarget, i.iopServed, i.iopTarget);
  const kpi1 = baseShare + iopShare;
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
    kpi1, kpi2, kpi3, baseShare, iopShare, normalShare, priorityShare,
    normalTarget, priorityTarget, activeTarget, perf,
    overall: perf.kpi1 + perf.kpi2 + perf.kpi3,
  };
}
