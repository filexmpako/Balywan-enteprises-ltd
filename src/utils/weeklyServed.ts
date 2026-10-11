import { loadAllWeeklyRows } from './weeklyStore';
import { getActivityRules, isActiveByRule, isServedByRule, extractTxnCounts, type TxnCounts } from './activityRules';
import { normalizeMsisdn } from './msisdn';
import { periodsMatch } from './periodUtils';
import {
  getActiveStatusFromColumn,
  getServicedStatusFromColumn,
  mergeServicedStatus,
  preferColumnStatus,
} from './servicingStatus';

/**
 * Served status per wakala (normalized MSISDN -> served) from the weekly
 * reports of `period`. The uploaded servicing_status / wakala_status columns
 * are final when present; the system rules only fill a wakala with no status
 * reading. Weekly rows are stored under a month label ("September 2026"),
 * matched to `period` in any format ("2026-09").
 */
export function buildWeeklyServedMap(rows: any[], period: string): Map<string, boolean> {
  const columnServedMap = new Map<string, boolean | null>();
  const columnActiveMap = new Map<string, boolean | null>();
  const countsMap = new Map<string, TxnCounts>();
  (rows || []).forEach((row: any) => {
    const month = String(row?.reportingMonth || row?.reporting_month || '').trim();
    if (!periodsMatch(month, period)) return;
    const key = normalizeMsisdn(row?.MSISDN || row?.msisdn);
    if (!key) return;
    columnServedMap.set(key, mergeServicedStatus(columnServedMap.get(key) ?? null, getServicedStatusFromColumn(row)));
    columnActiveMap.set(key, mergeServicedStatus(columnActiveMap.get(key) ?? null, getActiveStatusFromColumn(row)));
    const rowCounts = extractTxnCounts(row);
    const existing = countsMap.get(key);
    countsMap.set(key, existing
      ? {
          cashIn: existing.cashIn + rowCounts.cashIn,
          cashOut: existing.cashOut + rowCounts.cashOut,
          total: existing.total + rowCounts.total,
          amount: (existing.amount || 0) + (rowCounts.amount || 0),
        }
      : rowCounts);
  });
  const rules = getActivityRules();
  const resolved = new Map<string, boolean>();
  countsMap.forEach((counts, key) => {
    const isActive = preferColumnStatus(columnActiveMap.get(key) ?? null, isActiveByRule(counts, rules));
    resolved.set(key, preferColumnStatus(columnServedMap.get(key) ?? null, isServedByRule(counts, isActive, rules)));
  });
  return resolved;
}

/** The weekly served map for `period`, or null when that month has no weekly rows. */
export async function loadWeeklyServedMap(period: string): Promise<Map<string, boolean> | null> {
  const map = buildWeeklyServedMap(await loadAllWeeklyRows(), period);
  return map.size > 0 ? map : null;
}
