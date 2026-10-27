import type { ServicingRow } from './mappingEngine';
import type { ClassifiedRow } from './classification';
import { classifyServicingRows } from './classification';
import { SATill, BaseWakala, Owner } from '../types';
import { CLOUD_HYDRATED_EVENT, REGISTRIES_CHANGED_EVENT } from '../lib/cloudSyncEvents';

/** A few row sets at once: the selected month and a settlement month can differ. */
const MAX_ENTRIES = 4;
const cache = new Map<string, ClassifiedRow[]>();

function buildCacheKey(
  rows: ServicingRow[],
  saTillRegistry: SATill[],
  baseWakalaIndex: BaseWakala[],
  tillsList: any[],
  owners: Owner[]
): string {
  // Cheap signals that tell row sets apart. Registry edits that keep a list's
  // size (an owner reassigned) are caught by clearing the cache whenever the
  // registries change or are re-hydrated (listeners below).
  const aliasCount = owners.reduce((sum, o) => sum + (o.nameAliases?.length || 0), 0);
  const firstRowId = (rows[0] as any)?._id || '';
  const lastRowId = (rows[rows.length - 1] as any)?._id || '';
  const saTillUpdated = localStorage.getItem('saTillRegistry_lastUpdated') || '';
  const baseWakalaUpdated = localStorage.getItem('baseWakalaIndex_lastUpdated') || '';

  return [
    'v3',
    rows.length,
    firstRowId,
    lastRowId,
    saTillRegistry.length,
    saTillUpdated,
    baseWakalaIndex.length,
    baseWakalaUpdated,
    tillsList.length,
    owners.length,
    aliasCount,
  ].join('|');
}

/**
 * Cached wrapper around classifyServicingRows(). Returns the previous result
 * without recomputing (and without re-triggering its internal audit-log
 * write) when none of the classification inputs have changed since the last
 * call.
 */
export function getClassifiedRowsCached(
  rows: ServicingRow[],
  saTillRegistry: SATill[],
  baseWakalaIndex: BaseWakala[],
  tillsList: any[],
  owners: Owner[]
): ClassifiedRow[] {
  const key = buildCacheKey(rows, saTillRegistry, baseWakalaIndex, tillsList, owners);
  const hit = cache.get(key);
  if (hit) return hit;
  const result = classifyServicingRows(rows, saTillRegistry, baseWakalaIndex, tillsList, owners);
  cache.set(key, result);
  if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  return result;
}

function readList(key: string): any[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Classifies rows against the registries this device holds. */
export function classifyWithStoredRegistries(rows: ServicingRow[]): ClassifiedRow[] {
  return getClassifiedRowsCached(
    rows,
    readList('saTillRegistry'),
    readList('baseWakalaIndex'),
    readList('tillsList'),
    readList('ownersList'),
  );
}

/**
 * Explicitly clears the cache. Call this right after any action that changes
 * classification inputs.
 */
export function invalidateClassificationCache(): void {
  cache.clear();
}

if (typeof window !== 'undefined') {
  window.addEventListener(REGISTRIES_CHANGED_EVENT, invalidateClassificationCache);
  window.addEventListener(CLOUD_HYDRATED_EVENT, invalidateClassificationCache);
}
