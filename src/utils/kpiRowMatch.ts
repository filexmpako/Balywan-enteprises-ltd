import type { KPIMetric } from '../types';
/**
 * Shared name-matching helpers for identifying which uploaded KPI summary rows
 * correspond to the two KPIs this app actually models with a live engine
 * (KPI 1 = Total Serviced Value, KPI 2 = Served / Active Wakala distribution).
 *
 * Any row name that matches neither must be left exactly as uploaded — the app
 * has no engine for it.
 */

function norm(name: string): string {
  return String(name || '').toLowerCase().replace(/[\s_-]+/g, ' ').trim();
}

export function isKpi1RowName(name: string): boolean {
  const n = norm(name);
  if (!n) return false;
  if (/\bkpi\s*1\b/.test(n)) return true;
  return n.includes('servicing value') || n.includes('serviced value') || n.includes('servicing val');
}

export function isKpi2RowName(name: string): boolean {
  const n = norm(name);
  if (!n) return false;
  if (/\bkpi\s*2\b/.test(n)) return true;
  return n.includes('served wakala') || n.includes('serviced wakala');
}

type LiveTotalsLike = {
  kpi1: { target: number; achieved: number } | null;
  kpi2: { target: number; achieved: number } | null;
};

function liveRow(id: string, name: string, live: { target: number; achieved: number }): KPIMetric {
  const performance = live.target > 0 ? Math.round(Math.min((live.achieved / live.target) * 100, 100) * 10) / 10 : 0;
  const status: KPIMetric['status'] =
    performance >= 100 ? 'ACHIEVED' : performance >= 75 ? 'ON TRACK' : performance >= 50 ? 'NEEDS ATTENTION' : 'CRITICAL';
  return { id, name, target: '', targetVal: live.target, achieved: '', achievedVal: live.achieved, performance, status };
}

/**
 * The uploaded KPI list plus KPI 1 / KPI 2 rows from the live engine when the
 * upload had none (a servicing report without a KPI-targets sheet), so the
 * KPI pages never go blank. The callers' live overlay fills in the labels.
 */
export function withLiveKpiRows(rows: KPIMetric[], live: LiveTotalsLike): KPIMetric[] {
  const out = [...(rows || [])];
  if (live.kpi1 && !out.some(k => isKpi1RowName(k.name))) out.unshift(liveRow('kpi-1-live', 'KPI 1 — Servicing Value', live.kpi1));
  if (live.kpi2 && !out.some(k => isKpi2RowName(k.name))) out.splice(1, 0, liveRow('kpi-2-live', 'KPI 2 — Served Wakala', live.kpi2));
  return out;
}
