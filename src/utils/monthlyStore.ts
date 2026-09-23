/**
 * Monthly KPI data access.
 *
 * Postgres is the only store; there is no local cache.
 */
import {
  saveMonthlyServicingRows,
  fetchMonthlyServicingRows,
  fetchMonthlyMonths,
  deleteMonthlyServicingRows,
} from '../lib/monthly.functions';

export async function persistMonthlyServicing(
  reportingMonth: string,
  rows: any[],
  columns: string[],
): Promise<{ saved: number; cloud: boolean }> {
  const res = await saveMonthlyServicingRows({ data: { reportingMonth, rows } });
  return { saved: res?.saved ?? rows.length, cloud: true };
}

export async function loadMonthlyRows(reportingMonth?: string): Promise<any[]> {
  const res = await fetchMonthlyServicingRows({ data: { reportingMonth } });
  return res?.rows ?? [];
}

export async function listStoredMonths(): Promise<string[]> {
  try {
    const res = await fetchMonthlyMonths();
    return res?.months ?? [];
  } catch {
    return [];
  }
}

export async function removeMonth(reportingMonth: string): Promise<void> {
  await deleteMonthlyServicingRows({ data: { reportingMonth } });
}
