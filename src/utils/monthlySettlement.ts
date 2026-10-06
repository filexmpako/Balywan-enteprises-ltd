import { getServicingRows } from './indexedDB';
import { getActivityRules } from './activityRules';
import { buildMsisdnOwnerResolver, computeWeeklyStats } from './weeklyKpiEngine';

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
