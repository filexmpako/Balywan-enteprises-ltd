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

export const WEEKLY_STATS_KEY = 'weeklyWakalaStatsHistory';

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
    servedPercent: e?.servedPercent ?? '0.0',
    notServedPercent: e?.notServedPercent ?? '0.0',
    totalValue: Number(e?.totalValue) || 0,
    totalTxns: Number(e?.totalTxns) || 0,
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

  const computed: WeeklyStatsEntry[] = [];
  for (const week of Array.from(weeks).sort((a, b) => weekNumberOf(a) - weekNumberOf(b))) {
    const rows = await loadWeeklyRows(week);
    const stats = computeWeeklyStats(rows, resolver);
    if (!stats) continue;
    computed.push({ reportingWeek: week, uploadedAt: uploadMeta.get(week) || '', ...stats });
  }

  const merged = mergeWeeklyHistory(readWeeklyStatsHistory(), computed);
  try {
    localStorage.setItem(WEEKLY_STATS_KEY, JSON.stringify(merged));
  } catch {
    /* cache write must never break the UI */
  }
  return merged;
}
