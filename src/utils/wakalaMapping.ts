import { BaseWakala, Owner, WakalaEntry } from '../types';
import { resolveOwnerMatch } from './ownerMatch';

export interface OwnerWakalaMapping {
  byOwnerId: Map<string, WakalaEntry[]>;
  unmatched: BaseWakala[];   // ownerName present but no matching Owner found
  unassigned: BaseWakala[];  // ownerName was #N/A/blank in the source file
}

function toWakalaEntry(record: BaseWakala): WakalaEntry {
  return {
    id: `bwi-${record.msisdn}`,
    name: record.fullName || record.code || record.msisdn,
    msisdn: record.msisdn,
    region: record.district || record.siteWard || 'Unknown',
    dateAdded: record.creationDate || '',
    source: 'bulk-import',
    code: record.code,
    siteId: record.siteId,
    siteWard: record.siteWard,
    district: record.district,
    alternateNumber: record.alternateNumber,
    ownerMatchStatus: 'Matched',
  };
}

/**
 * Groups the full Base Wakala Index by resolved Owner. Pure/derived —
 * never mutates or persists into ownersList. Call fresh whenever
 * baseWakalaIndex or the owner roster changes.
 */
export function buildOwnerWakalaMap(baseWakalas: BaseWakala[], owners: Owner[]): OwnerWakalaMapping {
  const byOwnerId = new Map<string, WakalaEntry[]>();
  const unmatched: BaseWakala[] = [];
  const unassigned: BaseWakala[] = [];

  for (const record of baseWakalas) {
    const result = resolveOwnerMatch(record.ownerName, owners);

    if (result.status === 'Matched' && result.matchedOwner && result.matchedOwner.id) {
      const entry = toWakalaEntry(record);
      const ownerId = result.matchedOwner.id;
      const existing = byOwnerId.get(ownerId);
      existing ? existing.push(entry) : byOwnerId.set(ownerId, [entry]);
    } else if (result.status === 'Unmatched') {
      unmatched.push(record);
    } else {
      unassigned.push(record);
    }
  }

  return { byOwnerId, unmatched, unassigned };
}
