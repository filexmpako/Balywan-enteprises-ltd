import { BaseWakala, Owner, WakalaEntry } from '../types';
import { normalizeMsisdn } from './msisdn';
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
    alternateNumber: record.alternateNumber || record.altMsisdn,
    ownerMatchStatus: 'Matched',
    location: (record as any).location,
    photoId: (record as any).photoId,
    photoUrl: (record as any).photoUrl,
  };
}

/**
 * A Base Wakala Index record with the edits made to its owner-page entry
 * (see toWakalaEntry), or null when nothing changed. The number itself is
 * the record's key and is not edited here.
 */
export function applyWakalaEntryEdits(record: BaseWakala, entry: WakalaEntry): BaseWakala | null {
  const before = toWakalaEntry(record);
  const next: Record<string, unknown> = { ...record };
  let changed = false;
  const edit = <K extends keyof WakalaEntry>(field: K, apply: (value: WakalaEntry[K]) => void) => {
    if (JSON.stringify(entry[field] ?? null) === JSON.stringify(before[field] ?? null)) return;
    apply(entry[field]);
    changed = true;
  };
  edit('name', v => { next.fullName = v; });
  edit('code', v => { next.code = v; });
  edit('siteId', v => { next.siteId = v; });
  edit('siteWard', v => { next.siteWard = v; });
  edit('district', v => { next.district = v; });
  edit('alternateNumber', v => {
    const alt = normalizeMsisdn(v) || undefined;
    next.alternateNumber = alt;
    next.altMsisdn = alt;
  });
  edit('dateAdded', v => { next.creationDate = v; });
  edit('location', v => { next.location = v; });
  edit('photoId', v => { next.photoId = v; });
  edit('photoUrl', v => { next.photoUrl = v; });
  return changed ? (next as unknown as BaseWakala) : null;
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

  const ownersById = new Map(owners.filter(o => o && o.id).map(o => [String(o.id).trim().toLowerCase(), o]));

  for (const record of baseWakalas) {
    // An owner ID carried by the wakala file wins — it survives name spelling
    // differences and works when the owner roster is uploaded later.
    // `sourceOwnerId` is kept when a Base Wakala file arrived before its owner
    // roster, so the link resolves once the owner exists.
    const carriedOwnerId = record.ownerId || (record as any).sourceOwnerId;
    const directOwner = carriedOwnerId ? ownersById.get(String(carriedOwnerId).trim().toLowerCase()) : undefined;
    const result = directOwner
      ? { status: 'Matched' as const, matchedOwner: directOwner }
      : resolveOwnerMatch(record.ownerName, owners);


    if (result.status === 'Matched' && result.matchedOwner && result.matchedOwner.id) {
      const entry = toWakalaEntry(record);
      const ownerId = result.matchedOwner.id;
      const existing = byOwnerId.get(ownerId);
      if (existing) {
        existing.push(entry);
      } else {
        byOwnerId.set(ownerId, [entry]);
      }
    } else if (result.status === 'Unmatched') {
      unmatched.push(record);
    } else {
      unassigned.push(record);
    }
  }

  return { byOwnerId, unmatched, unassigned };
}
