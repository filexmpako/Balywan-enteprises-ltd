import type { ServicingRow } from './mappingEngine';
import type { ClassifiedRow } from './classification';
import { classifyServicingRows } from './classification';
import { SATill, BaseWakala, Owner } from '../types';

let cachedKey: string | null = null;
let cachedResult: ClassifiedRow[] | null = null;

function buildCacheKey(
  rows: ServicingRow[],
  saTillRegistry: SATill[],
  baseWakalaIndex: BaseWakala[],
  owners: Owner[]
): string {
  // Cheap signals that change whenever classification inputs actually change.
  // Row count + first/last row id catches Daily MGT data changes; registry
  // sizes + their persisted "last updated" timestamps catch SA Till / Base
  // Wakala re-uploads (even ones that don't change record count); owner
  // count + total alias count catches new owners and alias-resolution edits.
  const aliasCount = owners.reduce((sum, o) => sum + (o.nameAliases?.length || 0), 0);
  const firstRowId = (rows[0] as any)?._id || '';
  const lastRowId = (rows[rows.length - 1] as any)?._id || '';
  const saTillUpdated = localStorage.getItem('saTillRegistry_lastUpdated') || '';
  const baseWakalaUpdated = localStorage.getItem('baseWakalaIndex_lastUpdated') || '';

  return [
    'v2',
    rows.length,
    firstRowId,
    lastRowId,
    saTillRegistry.length,
    saTillUpdated,
    baseWakalaIndex.length,
    baseWakalaUpdated,
    owners.length,
    aliasCount,
  ].join('|');
}

/**
 * Cached wrapper around classifyServicingRows(). Returns the previous result
 * without recomputing (and without re-triggering its internal audit-log
 * write) when none of the classification inputs have changed since the last
 * call. This is what stops the full dataset from being reclassified on every
 * page navigation via Header -> useReportingMetadata -> calculateCompanyKPIs.
 */
export function getClassifiedRowsCached(
  rows: ServicingRow[],
  saTillRegistry: SATill[],
  baseWakalaIndex: BaseWakala[],
  tillsList: any[],
  owners: Owner[]
): ClassifiedRow[] {
  const key = buildCacheKey(rows, saTillRegistry, baseWakalaIndex, owners);
  if (cachedKey === key && cachedResult) {
    return cachedResult;
  }
  const result = classifyServicingRows(rows, saTillRegistry, baseWakalaIndex, tillsList, owners);
  cachedKey = key;
  cachedResult = result;
  return result;
}

/**
 * Explicitly clears the cache. Call this right after any action that changes
 * classification inputs but might not be reliably caught by the cheap key
 * check above (belt-and-suspenders alongside buildCacheKey's own detection).
 */
export function invalidateClassificationCache(): void {
  cachedKey = null;
  cachedResult = null;
}
