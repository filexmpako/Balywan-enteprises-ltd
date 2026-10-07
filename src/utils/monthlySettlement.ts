import { getServicingRows } from './indexedDB';
import { getActivityRules } from './activityRules';
import { buildMsisdnOwnerResolver, computeWeeklyStats } from './weeklyKpiEngine';
import { normalizeMsisdn } from './msisdn';
import { toIsoPeriod } from './periodUtils';
import { fetchMonthlyMonths } from '../lib/monthly.functions';

export type MonthlyReportStats = NonNullable<ReturnType<typeof computeWeeklyStats>>;

/**
 * Penalty / IOP / served / active for one uploaded Monthly report, computed
 * from that month's own stored rows with the same engine as the weekly
 * report (CP_Servicing_Val x penalty rate, the report's IOP column, owners
 * through the Base Wakala index). `monthLabel` is the stored month label.
 */
export async function loadMonthlyReportStats(monthLabel: string): Promise<MonthlyReportStats | null> {
  const rows = await getServicingRows(monthLabel);
  if (!rows.length) return null;
  const read = (key: string) => {
    try {
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch {
      return [];
    }
  };
  const resolver = buildMsisdnOwnerResolver(read('baseWakalaIndex'), read('ownersList'), read('tillsList'));
  return computeWeeklyStats(rows, resolver, getActivityRules());
}

/**
 * A month's Monthly report as the final KPI source: each owner's servicing
 * value (KPI 1) and each wakala's servicing_status (KPI 2). Wakalas the report
 * gives no owner are left out, since owner targets only cover owned wakalas.
 */
export interface MonthlyKpiOverride {
  month: string;
  servedValueByOwner: Map<string, number>;
  servedByMsisdn: Map<string, boolean>;
}

export function toMonthlyKpiOverride(month: string, stats: MonthlyReportStats): MonthlyKpiOverride {
  const servedValueByOwner = new Map<string, number>();
  stats.byOwner.forEach(b => {
    if (b.ownerId && b.ownerId !== '__unassigned__') servedValueByOwner.set(b.ownerId, b.value || 0);
  });
  const servedByMsisdn = new Map<string, boolean>();
  stats.evaluations.forEach(e => {
    const key = normalizeMsisdn(e.msisdn);
    if (key && e.isServed !== null) servedByMsisdn.set(key, e.isServed);
  });
  return { month, servedValueByOwner, servedByMsisdn };
}

/** The override for `period` when that month's own Monthly report is uploaded, else null. */
export async function loadMonthlyKpiOverride(period: string): Promise<MonthlyKpiOverride | null> {
  const iso = toIsoPeriod(period);
  const res = await fetchMonthlyMonths();
  const month = (res?.months ?? []).find(m => toIsoPeriod(m) === iso);
  if (!month) return null;
  const stats = await loadMonthlyReportStats(month);
  return stats ? toMonthlyKpiOverride(month, stats) : null;
}
