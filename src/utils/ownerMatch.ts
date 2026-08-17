import { Owner } from '../types';
import { logNameResolution } from './nameResolutionLog';
import { invalidateClassificationCache } from './classificationCache';

export type OwnerMatchStatus = 'Matched' | 'Unmatched' | 'Unassigned';

export interface OwnerMatchResult {
  status: OwnerMatchStatus;
  matchedOwner?: Owner;
  matchedVia?: 'alias' | 'heuristic';
}

export function normalizeOwnerName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  if (upper === '#N/A' || upper === 'N/A' || upper === 'NONE' || upper === 'NULL') return null;
  return trimmed;
}

/**
 * Resolves a raw owner-name string against the master Owner roster.
 * Priority order:
 *   1. Exact match (case-insensitive, trimmed) against any of the owner's
 *      nameAliases — this is the durable, admin-confirmed resolution path.
 *   2. Fallback heuristic (exact name/id match, then substring match either
 *      direction) — kept for backward compatibility with existing uploads.
 * Every call is logged via logNameResolution so a misattribution can be
 * traced back to exactly which rule resolved which name.
 */
export function resolveOwnerMatch(
  rawOwnerName: string | null | undefined,
  owners: Owner[],
  sourceContext: string = 'Unknown Upload'
): OwnerMatchResult {
  const ownerName = normalizeOwnerName(rawOwnerName);
  if (!ownerName) return { status: 'Unassigned' };
  if (!Array.isArray(owners) || owners.length === 0) return { status: 'Unmatched' };

  const lowerOwner = ownerName.toLowerCase();

  // 1. Alias match (exact, case-insensitive)
  const aliasMatch = owners.find(o =>
    o && (o.nameAliases || []).some(alias => alias && alias.trim().toLowerCase() === lowerOwner)
  );
  if (aliasMatch) {
    logNameResolution({
      timestamp: new Date().toISOString(),
      rawName: ownerName,
      matchedOwnerId: aliasMatch.id || '',
      matchedOwnerName: aliasMatch.name || '',
      matchedVia: 'alias',
      sourceContext,
    });
    return { status: 'Matched', matchedOwner: aliasMatch, matchedVia: 'alias' };
  }

  // 2. Fallback heuristic
  const heuristicMatch = owners.find(o => {
    if (!o) return false;
    const nameLower = o.name ? o.name.toLowerCase() : '';
    const idLower = o.id ? o.id.toLowerCase() : '';
    return (
      (nameLower && nameLower === lowerOwner) ||
      (idLower && idLower === lowerOwner) ||
      (nameLower && lowerOwner.includes(nameLower)) ||
      (nameLower && nameLower.includes(lowerOwner))
    );
  });
  if (heuristicMatch) {
    logNameResolution({
      timestamp: new Date().toISOString(),
      rawName: ownerName,
      matchedOwnerId: heuristicMatch.id || '',
      matchedOwnerName: heuristicMatch.name || '',
      matchedVia: 'heuristic',
      sourceContext,
    });
    return { status: 'Matched', matchedOwner: heuristicMatch, matchedVia: 'heuristic' };
  }

  logNameResolution({
    timestamp: new Date().toISOString(),
    rawName: ownerName,
    matchedOwnerId: null,
    matchedOwnerName: null,
    matchedVia: 'unresolved',
    sourceContext,
  });
  return { status: 'Unmatched' };
}

/**
 * Links a raw name string to an existing owner as a confirmed alias, so all
 * future uploads resolve it automatically without going through the
 * fallback heuristic. Persists to ownersList in localStorage.
 */
export function addNameAlias(ownerId: string, alias: string): void {
  const trimmedAlias = alias.trim();
  if (!trimmedAlias) return;
  try {
    const saved = localStorage.getItem('ownersList');
    if (!saved) return;
    const owners: Owner[] = JSON.parse(saved);
    const updated = owners.map(o => {
      if (!o || !o.id || o.id !== ownerId) return o;
      const existingAliases = o.nameAliases || [];
      const alreadyPresent = existingAliases.some(
        a => a.trim().toLowerCase() === trimmedAlias.toLowerCase()
      );
      if (alreadyPresent) return o;
      return { ...o, nameAliases: [...existingAliases, trimmedAlias] };
    });
    localStorage.setItem('ownersList', JSON.stringify(updated));
    invalidateClassificationCache();
  } catch (e) {
    console.error('Failed to add name alias:', e);
  }
}
