import { kvGet, kvSet } from '../lib/hasidadi/kv';
import { ManualOwnerTarget, PriorityWakala } from '../types';
import { normalizeMsisdn } from './msisdn';

/**
 * Resolves KPI 1 target for a given owner and period. Manual only —
 * no upload fallback. Admin sets this via the Targets page.
 */
export function resolveOwnerTarget(
  ownerId: string,
  period: string,
  manualTargets: ManualOwnerTarget[]
): { monthlyTarget: number; source: 'manual' | 'none' } {
  const manual = manualTargets.find(m => m.ownerId === ownerId && m.period === period);
  if (manual && (manual.kpi1BaseTarget !== undefined || manual.kpi1IopTarget !== undefined)) {
    const monthlyTarget = (manual.kpi1BaseTarget || 0) + (manual.kpi1IopTarget || 0);
    return { monthlyTarget, source: 'manual' };
  }
  return { monthlyTarget: 0, source: 'none' };
}

/**
 * Checks whether a Wakala (by MSISDN and period) is flagged as Priority.
 * Checks manual flags first, falls back to uploaded PriorityWakala list.
 */
export function isWakalaPriority(
  msisdn: string,
  period: string,
  priorityWakalas?: PriorityWakala[],
  manualFlags?: Record<string, boolean>
): boolean {
  if (!msisdn) return false;
  const norm = normalizeMsisdn(msisdn);
  if (!norm) return false;

  // 1. Check passed-in manual flags or localStorage manual flags
  if (manualFlags && manualFlags[norm] !== undefined) {
    return Boolean(manualFlags[norm]);
  }
  try {
    const rawManual = kvGet('manualPriorityWakalas');
    if (rawManual) {
      const parsedMap = JSON.parse(rawManual);
      const periodKey = `${norm}_${period}`;
      if (parsedMap[periodKey] !== undefined) return Boolean(parsedMap[periodKey]);
      if (parsedMap[norm] !== undefined) return Boolean(parsedMap[norm]);
    }
  } catch (e) {
    // ignore parse error
  }

  // 2. Fall back to uploaded PriorityWakala list
  let pList = priorityWakalas;
  if (!pList) {
    try {
      const rawList = kvGet('priorityWakalaList');
      if (rawList) {
        pList = JSON.parse(rawList);
      }
    } catch (e) {
      pList = [];
    }
  }

  if (pList && Array.isArray(pList)) {
    return pList.some(p => {
      if (!p || !p.msisdn) return false;
      const pNorm = normalizeMsisdn(p.msisdn);
      const periodMatches = !p.period || !period || p.period === period;
      return pNorm === norm && periodMatches;
    });
  }

  return false;
}

/**
 * Helper to retrieve stored manual targets from localStorage
 */
export function getSavedManualOwnerTargets(): ManualOwnerTarget[] {
  try {
    const saved = kvGet('manualOwnerTargets');
    return saved ? JSON.parse(saved) : [];
  } catch (e) {
    return [];
  }
}

/**
 * Helper to save/update a manual owner target in localStorage
 */
export function saveManualOwnerTarget(target: ManualOwnerTarget): ManualOwnerTarget[] {
  const current = getSavedManualOwnerTargets();
  const existingIdx = current.findIndex(m => m.ownerId === target.ownerId && m.period === target.period);
  if (existingIdx >= 0) {
    current[existingIdx] = {
      ...current[existingIdx],
      ...target,
      setAt: new Date().toISOString()
    };
  } else {
    current.push({
      ...target,
      setAt: new Date().toISOString()
    });
  }
  kvSet('manualOwnerTargets', JSON.stringify(current));
  return current;
}

/**
 * Clear KPI 1 manual target override for an owner and period
 */
export function clearManualOwnerTargetKpi1Override(ownerId: string, period: string): ManualOwnerTarget[] {
  const current = getSavedManualOwnerTargets();
  const existingIdx = current.findIndex(m => m.ownerId === ownerId && m.period === period);
  if (existingIdx >= 0) {
    delete current[existingIdx].kpi1BaseTarget;
    delete current[existingIdx].kpi1IopTarget;
    if (
      current[existingIdx].kpi1BaseTarget === undefined &&
      current[existingIdx].kpi1IopTarget === undefined &&
      current[existingIdx].kpi2NormalPercent === undefined &&
      current[existingIdx].kpi2PriorityPercent === undefined
    ) {
      current.splice(existingIdx, 1);
    }
  }
  kvSet('manualOwnerTargets', JSON.stringify(current));
  return current;
}

/**
 * Clear KPI 2 manual percentage overrides for an owner and period
 */
export function clearManualOwnerTargetKpi2Override(ownerId: string, period: string): ManualOwnerTarget[] {
  const current = getSavedManualOwnerTargets();
  const existingIdx = current.findIndex(m => m.ownerId === ownerId && m.period === period);
  if (existingIdx >= 0) {
    delete current[existingIdx].kpi2NormalPercent;
    delete current[existingIdx].kpi2PriorityPercent;
    if (
      current[existingIdx].kpi1BaseTarget === undefined &&
      current[existingIdx].kpi1IopTarget === undefined &&
      current[existingIdx].kpi2NormalPercent === undefined &&
      current[existingIdx].kpi2PriorityPercent === undefined
    ) {
      current.splice(existingIdx, 1);
    }
  }
  kvSet('manualOwnerTargets', JSON.stringify(current));
  return current;
}
