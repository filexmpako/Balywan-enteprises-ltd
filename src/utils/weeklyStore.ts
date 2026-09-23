/**
 * Weekly KPI data access.
 *
 * Postgres is the only store; there is no local cache.
 */
import {
  saveWeeklyServicingRows,
  fetchWeeklyServicingRows,
  fetchWeeklyWeeks,
  deleteWeeklyServicingRows,
} from '../lib/weekly.functions';

export async function persistWeeklyServicing(
  reportingWeek: string,
  reportingMonth: string,
  rows: any[],
  columns: string[]
): Promise<{ saved: number; cloud: boolean }> {
  const res = await saveWeeklyServicingRows({
    data: { reportingWeek, reportingMonth, rows },
  });
  return { saved: res?.saved ?? rows.length, cloud: true };
}

export async function loadWeeklyRows(reportingWeek: string): Promise<any[]> {
  const res = await fetchWeeklyServicingRows({ data: { reportingWeek } });
  return res?.rows ?? [];
}

export async function loadAllWeeklyRows(): Promise<any[]> {
  try {
    const res = await fetchWeeklyServicingRows({ data: {} });
    return res?.rows ?? [];
  } catch (e) {
    console.warn('[weeklyStore] cloud read failed', e);
    return [];
  }
}

export async function listStoredWeeks(): Promise<string[]> {
  try {
    const res = await fetchWeeklyWeeks();
    return res?.weeks ?? [];
  } catch {
    return [];
  }
}

export async function removeWeek(reportingWeek: string): Promise<void> {
  await deleteWeeklyServicingRows({ data: { reportingWeek } });
}
