/**
 * Builds (and caches) the running weekly stats history that the Admin
 * Dashboard, the KPI Reports page and the Owner dashboard all read.
 *
 * Rows come from Postgres via weeklyStore (IndexedDB is only an offline
 * mirror). The computed series itself is stored under
 * `weeklyWakalaStatsHistory`, a synced document key, so it also persists
 * server-side and survives sign-out.
 */
import { BaseWakala, Owner } from '../types';
import { listStoredWeeks, loadWeeklyRows } from './weeklyStore';
import {
  buildMsisdnOwnerResolver,
  computeWeeklyStats,
  mergeWeeklyHistory,
  weekNumberOf,
  type WeeklyStatsEntry,
} from './weeklyKpiEngine';

import { getActivityRules } from './activityRules';
import { saveWakalaStatusHistory } from '../lib/wakalaStatus.functions';

export const WEEKLY_STATS_KEY = 'weeklyWakalaStatsHistory';

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/**
 * Best-effort "YYYY-MM" from a week label such as "Week 2 July 2026".
 * Used only when the stored rows carry no reporting_month.
 */
function monthFromWeek(week: string): string {
  const label = String(week || '').toLowerCase();
  const year = label.match(/(20\d{2})/)?.[1];
  const monthIndex = MONTH_NAMES.findIndex(m => label.includes(m.slice(0, 3)));
  if (!year || monthIndex < 0) return '';
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

/** Entries cached before the engine gained value/txn/owner fields lack them. */
function normalizeEntry(e: any): WeeklyStatsEntry {
  return {
    reportingWeek: e?.reportingWeek || '',
    uploadedAt: e?.uploadedAt || '',
    total: Number(e?.total) || 0,
    active: Number(e?.active) || 0,
    inactive: Number(e?.inactive) || 0,
    served: Number(e?.served) || 0,
    notServed: Number(e?.notServed) || 0,
    noStatus: Number(e?.noStatus) || 0,
    servedPercent: e?.servedPercent ?? '0.0',
    notServedPercent: e?.notServedPercent ?? '0.0',
    totalValue: Number(e?.totalValue) || 0,
    totalTxns: Number(e?.totalTxns) || 0,
    baseValue: Number(e?.baseValue) || 0,
    iopValue: Number(e?.iopValue) || 0,
    cashInTxns: Number(e?.cashInTxns) || 0,
    cashOutTxns: Number(e?.cashOutTxns) || 0,
    penalty: Number(e?.penalty) || 0,
    reportingMonth: e?.reportingMonth || '',
    byOwner: Array.isArray(e?.byOwner) ? e.byOwner : [],
  };
}

export function readWeeklyStatsHistory(): WeeklyStatsEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(WEEKLY_STATS_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(e => e && e.reportingWeek).map(normalizeEntry);
  } catch {
    return [];
  }
}

function readWeeklyKpiHistory(): any[] {
  try {
    const parsed = JSON.parse(localStorage.getItem('weeklyKpiHistory') || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Recomputes every stored week and merges it into the running series.
 * Append-only: a new week is added, a re-uploaded week replaces only itself.
 */
export async function refreshWeeklyStatsHistory(): Promise<WeeklyStatsEntry[]> {
  const owners: Owner[] = (() => {
    try {
      return JSON.parse(localStorage.getItem('ownersList') || '[]');
    } catch {
      return [];
    }
  })();
  const baseWakalaIndex: BaseWakala[] = (() => {
    try {
      return JSON.parse(localStorage.getItem('baseWakalaIndex') || '[]');
    } catch {
      return [];
    }
  })();
  const tillsList: any[] = (() => {
    try {
      return JSON.parse(localStorage.getItem('tillsList') || '[]');
    } catch {
      return [];
    }
  })();

  const resolver = buildMsisdnOwnerResolver(baseWakalaIndex, owners, tillsList);
  const uploadMeta = new Map<string, string>();
  readWeeklyKpiHistory().forEach(h => {
    if (h?.reportingWeek) uploadMeta.set(h.reportingWeek, h.uploadDate || '');
  });

  const weeks = new Set<string>(await listStoredWeeks());
  uploadMeta.forEach((_v, week) => weeks.add(week));

  const rules = getActivityRules();
  const computed: WeeklyStatsEntry[] = [];
  for (const week of Array.from(weeks).sort((a, b) => weekNumberOf(a) - weekNumberOf(b))) {
    const rows = await loadWeeklyRows(week);
    const stats = computeWeeklyStats(rows, resolver, rules);
    if (!stats) continue;
    const { evaluations, ...entry } = stats;
    const reportingMonth =
      rows.find((r: any) => r?.reportingMonth)?.reportingMonth || monthFromWeek(week);
    computed.push({ reportingWeek: week, reportingMonth, uploadedAt: uploadMeta.get(week) || '', ...entry });

    // Record the status that applied in this week so historical reports keep
    // it, instead of re-reading today's status.
    try {
      await saveWakalaStatusHistory({
        data: {
          reportingWeek: week,
          reportingMonth: reportingMonth || null,
          threshold: rules.threshold,
          ruleMode: rules.mode,
          evaluations: evaluations.map(e => ({
            msisdn: e.msisdn,
            ownerId: e.ownerId,
            ownerName: e.ownerName,
            cashInTxns: e.cashInTxns,
            cashOutTxns: e.cashOutTxns,
            totalTxns: e.totalTxns,
            totalValue: e.totalValue,
            isActive: e.isActive,
          })),
        },
      });
    } catch (err) {
      console.warn('[weekly] status history not recorded for', week, err);
    }
  }

  const merged = mergeWeeklyHistory(readWeeklyStatsHistory(), computed);
  try {
    localStorage.setItem(WEEKLY_STATS_KEY, JSON.stringify(merged));
  } catch {
    /* cache write must never break the UI */
  }
  return merged;
}
