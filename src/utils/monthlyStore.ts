/**
 * Monthly KPI data access.
 *
 * Postgres is authoritative; IndexedDB is only an offline mirror, exactly like
 * the weekly path in weeklyStore.ts.
 */
import {
  saveMonthlyServicingRows,
  fetchMonthlyServicingRows,
  fetchMonthlyMonths,
  deleteMonthlyServicingRows,
} from '../lib/monthly.functions';
import {
  saveMonthlyServicingData,
  getServicingRows as getCachedMonthlyRows,
  clearMonthlyServicingData,
} from './indexedDB';

export async function persistMonthlyServicing(
  reportingMonth: string,
  rows: any[],
  columns: string[],
): Promise<{ saved: number; cloud: boolean }> {
  // Local mirror first so the UI stays responsive/offline-capable.
  try {
    await clearMonthlyServicingData(reportingMonth);
    await saveMonthlyServicingData(reportingMonth, rows, columns);
  } catch (e) {
    console.warn('[monthlyStore] local mirror write failed', e);
  }

  try {
    const res = await saveMonthlyServicingRows({ data: { reportingMonth, rows } });
    return { saved: res?.saved ?? rows.length, cloud: true };
  } catch (e) {
    console.warn('[monthlyStore] cloud write failed, kept offline copy', e);
    return { saved: rows.length, cloud: false };
  }
}

export async function loadMonthlyRows(reportingMonth?: string): Promise<any[]> {
  try {
    const res = await fetchMonthlyServicingRows({ data: { reportingMonth } });
    const rows = res?.rows ?? [];
    if (rows.length > 0) return rows;
  } catch (e) {
    console.warn('[monthlyStore] cloud read failed, using offline mirror', e);
  }
  try {
    return (await getCachedMonthlyRows(reportingMonth)) || [];
  } catch {
    return [];
  }
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
  try {
    await deleteMonthlyServicingRows({ data: { reportingMonth } });
  } catch (e) {
    console.warn('[monthlyStore] cloud delete failed', e);
  }
  try {
    await clearMonthlyServicingData(reportingMonth);
  } catch {
    /* offline mirror only */
  }
}
