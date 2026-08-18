/**
 * Weekly KPI data access.
 *
 * Postgres is authoritative; IndexedDB is only an offline mirror for field
 * use. Reads go to the server first and fall back to the local mirror when
 * offline, so weekly data survives sign-out and cache clears.
 */
import {
  saveWeeklyServicingRows,
  fetchWeeklyServicingRows,
  fetchWeeklyWeeks,
  deleteWeeklyServicingRows,
} from '../lib/weekly.functions';
import {
  saveWeeklyServicingData,
  getWeeklyServicingRows as getCachedWeeklyRows,
  clearWeeklyServicingData,
} from './indexedDB';

export async function persistWeeklyServicing(
  reportingWeek: string,
  reportingMonth: string,
  rows: any[],
  columns: string[]
): Promise<{ saved: number; cloud: boolean }> {
  // Local mirror first so the UI stays responsive/offline-capable.
  try {
    await saveWeeklyServicingData(reportingWeek, reportingMonth, rows, columns);
  } catch (e) {
    console.warn('[weeklyStore] local mirror write failed', e);
  }

  try {
    const res = await saveWeeklyServicingRows({
      data: { reportingWeek, reportingMonth, rows },
    });
    return { saved: res?.saved ?? rows.length, cloud: true };
  } catch (e) {
    console.warn('[weeklyStore] cloud write failed, kept offline copy', e);
    return { saved: rows.length, cloud: false };
  }
}

export async function loadWeeklyRows(reportingWeek: string): Promise<any[]> {
  try {
    const res = await fetchWeeklyServicingRows({ data: { reportingWeek } });
    const rows = res?.rows ?? [];
    if (rows.length > 0) return rows;
  } catch (e) {
    console.warn('[weeklyStore] cloud read failed, using offline mirror', e);
  }
  try {
    return (await getCachedWeeklyRows(reportingWeek)) || [];
  } catch {
    return [];
  }
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
  try {
    await deleteWeeklyServicingRows({ data: { reportingWeek } });
  } catch (e) {
    console.warn('[weeklyStore] cloud delete failed', e);
  }
  try {
    await clearWeeklyServicingData(reportingWeek);
  } catch {
    /* offline mirror only */
  }
}
