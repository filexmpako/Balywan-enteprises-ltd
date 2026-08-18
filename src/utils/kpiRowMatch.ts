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
