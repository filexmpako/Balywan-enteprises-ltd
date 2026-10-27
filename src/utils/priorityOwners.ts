import type { BaseWakala, Owner, PriorityWakala } from '../types';
import { normalizeMsisdn } from './msisdn';
import { resolveOwnerMatch } from './ownerMatch';

/**
 * Priority wakala → Base Wakala Index → owner. Shared by the Priority Wakala
 * upload and the report resync, so a stored priority entry is always
 * attributed the way a fresh upload would attribute it today.
 */
export interface BaseWakalaLookup {
  byCode: Map<string, BaseWakala>;
  byMsisdn: Map<string, BaseWakala>;
}

export function buildBaseWakalaLookup(baseWakalas: BaseWakala[]): BaseWakalaLookup {
  const byCode = new Map<string, BaseWakala>();
  const byMsisdn = new Map<string, BaseWakala>();
  for (const bw of baseWakalas) {
    if (!bw) continue;
    const code = bw.wakalaCode || bw.code;
    if (code && typeof code === 'string') byCode.set(code.trim().toLowerCase(), bw);
    const norm = normalizeMsisdn(bw.msisdn);
    if (norm) byMsisdn.set(norm, bw);
  }
  // Alternate numbers only fill numbers that are no wakala's main number,
  // so another wakala's alternate entry can never take over a main number;
  // one listed by wakalas of different owners names no single wakala.
  const ownersOfAlt = new Map<string, Set<string>>();
  for (const bw of baseWakalas) {
    const normAlt = normalizeMsisdn(bw?.alternateNumber || bw?.altMsisdn);
    if (!normAlt) continue;
    const set = ownersOfAlt.get(normAlt) ?? new Set<string>();
    set.add(String(bw.ownerName || bw.ownerId || '').trim().toLowerCase());
    ownersOfAlt.set(normAlt, set);
  }
  for (const bw of baseWakalas) {
    const normAlt = normalizeMsisdn(bw?.alternateNumber || bw?.altMsisdn);
    if (normAlt && !byMsisdn.has(normAlt) && ownersOfAlt.get(normAlt)!.size === 1) byMsisdn.set(normAlt, bw);
  }
  return { byCode, byMsisdn };
}

/** Code first, then main/alternate number. */
export function findBaseWakala(lookup: BaseWakalaLookup, code?: string, msisdn?: string): BaseWakala | undefined {
  const byCode = code ? lookup.byCode.get(code.trim().toLowerCase()) : undefined;
  if (byCode) return byCode;
  const norm = msisdn ? normalizeMsisdn(msisdn) : '';
  return norm ? lookup.byMsisdn.get(norm) : undefined;
}

/**
 * The owner a priority wakala belongs to: the registered owner its Base
 * Wakala row names, else that row's own owner id / name (kept so a later
 * registration under the same name still matches).
 */
export function priorityOwnerOf(bw: BaseWakala, owners: Owner[], context: string): {
  ownerId?: string;
  ownerName?: string;
  resolved: boolean;
} {
  const match = resolveOwnerMatch(bw.ownerName, owners, context);
  return {
    ownerId: match.matchedOwner?.id || bw.ownerId || undefined,
    ownerName: match.matchedOwner?.name || bw.ownerName || undefined,
    resolved: match.status === 'Matched',
  };
}

/**
 * Re-attributes stored priority entries from today's Base Wakala Index and
 * owner list. Entries whose wakala left the index keep their stored owner.
 */
export function reresolvePriorityOwners(
  list: PriorityWakala[],
  baseWakalas: BaseWakala[],
  owners: Owner[],
): { list: PriorityWakala[]; changed: number } {
  const lookup = buildBaseWakalaLookup(baseWakalas);
  let changed = 0;
  const next = list.map(entry => {
    const bw = entry ? findBaseWakala(lookup, entry.wakalaCode, entry.msisdn) : undefined;
    if (!bw) return entry;
    const { ownerId, ownerName } = priorityOwnerOf(bw, owners, 'Report Resync');
    if ((entry.ownerId || undefined) === ownerId && (entry.ownerName || undefined) === ownerName) return entry;
    changed++;
    return { ...entry, ownerId, ownerName };
  });
  return { list: next, changed };
}
