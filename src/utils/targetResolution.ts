import { kvGet, kvSet } from '../lib/hasidadi/kv';
import { ManualOwnerTarget } from '../types';
import { periodsMatch } from './periodUtils';

/**
 * Resolves KPI 1 target for a given owner and period. Manual only —
 * no upload fallback. Admin sets this via the Targets page.
 */
export function resolveOwnerTarget(
  ownerId: string,
  period: string,
  manualTargets: ManualOwnerTarget[]
): { monthlyTarget: number; baseTarget: number; iopTarget: number; source: 'manual' | 'none' } {
  const manual = manualTargets.find(m => m.ownerId === ownerId && periodsMatch(m.period, period));
  if (manual && (manual.kpi1BaseTarget !== undefined || manual.kpi1IopTarget !== undefined)) {
    const baseTarget = manual.kpi1BaseTarget || 0;
    const iopTarget = manual.kpi1IopTarget || 0;
    return { monthlyTarget: baseTarget + iopTarget, baseTarget, iopTarget, source: 'manual' };
  }
  return { monthlyTarget: 0, baseTarget: 0, iopTarget: 0, source: 'none' };
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

