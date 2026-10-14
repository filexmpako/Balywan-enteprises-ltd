/**
 * Monthly KPI data access.
 *
 * Postgres is the only store; there is no local cache.
 */
import {
  saveMonthlyServicingRows,
  deleteMonthlyServicingRows,
} from '../lib/monthly.functions';

export async function persistMonthlyServicing(
  reportingMonth: string,
  rows: any[],
): Promise<{ saved: number; cloud: boolean }> {
  const res = await saveMonthlyServicingRows({ data: { reportingMonth, rows } });
  return { saved: res?.saved ?? rows.length, cloud: true };
}

export async function removeMonth(reportingMonth: string): Promise<void> {
  await deleteMonthlyServicingRows({ data: { reportingMonth } });
}
