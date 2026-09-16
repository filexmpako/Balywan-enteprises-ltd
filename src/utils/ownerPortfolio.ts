import { BaseWakala, Owner, PriorityWakala, WakalaEntry } from '../types';
import { kvJson } from '../lib/hasidadi/kv';
import { normalizeMsisdn } from './msisdn';
import { buildOwnerWakalaMap } from './wakalaMapping';

export interface PortfolioWakala extends WakalaEntry {
  kind: 'Base' | 'IOP';
  isPriority: boolean;
}

export interface OwnerPortfolio {
  wakalas: PortfolioWakala[];
  priorityCount: number;
  normalCount: number;
  hasPriorityData: boolean;
}

/**
 * Single source of truth for "which wakalas belong to this owner" across the
 * owner dashboard, the owner profile and the Targets page.
 *
 * Sources, in order: the uploaded Base Wakala Index (mapped by owner id, source
 * owner id or owner name), manually assigned tills, and the uploaded Priority
 * Wakala list for the period — a priority wakala attributed to the owner counts
 * even when the Base Wakala file has not caught up with it yet.
 */
export function getOwnerPortfolio(
  ownerId: string,
  period?: string,
  ownerNameHint?: string,
): OwnerPortfolio {
  const owners = kvJson<Owner[]>('ownersList', []);
  const base = kvJson<BaseWakala[]>('baseWakalaIndex', []);
  const tills = kvJson<any[]>('tillsList', []);
  const priorityList = kvJson<PriorityWakala[]>('priorityWakalaList', []);

  const owner = owners.find(o => o && String(o.id) === String(ownerId));
  const ownerNameLower = String(owner?.name || ownerNameHint || '').trim().toLowerCase();

  const mapping = buildOwnerWakalaMap(base, owners);
  const wakalas: PortfolioWakala[] = (mapping.byOwnerId.get(ownerId) || []).map(w => ({
    ...w,
    kind: 'Base' as const,
    isPriority: false,
  }));

  const seen = new Set(wakalas.map(w => normalizeMsisdn(w.msisdn)));

  for (const till of tills) {
    if (String(till?.ownerId || '') !== String(ownerId)) continue;
    const msisdn = String(till.transactionTill || till.msisdn || '').trim();
    const norm = normalizeMsisdn(msisdn);
    if (!msisdn || !norm || seen.has(norm)) continue;
    seen.add(norm);
    wakalas.push({
      id: `till-${msisdn}`,
      name: till.tillName || till.name || msisdn,
      msisdn,
      region: till.location || till.region || 'Unknown',
      dateAdded: till.dateAdded || '',
      kind: String(till.kind || '').toLowerCase() === 'iop' ? 'IOP' : 'Base',
      isPriority: false,
    } as PortfolioWakala);
  }

  // Priority list for the period, attributed by owner id, owner name, or by a
  // MSISDN already inside this owner's roster.
  const periodPriority = priorityList.filter(p => !period || !p?.period || p.period === period);
  const hasPriorityData = periodPriority.length > 0;
  const priorityMsisdns = new Set<string>();

  for (const pw of periodPriority) {
    const norm = normalizeMsisdn(pw?.msisdn);
    if (!norm) continue;
    const byId = pw.ownerId && String(pw.ownerId) === String(ownerId);
    const byName = pw.ownerName && ownerNameLower && pw.ownerName.trim().toLowerCase() === ownerNameLower;
    const byRoster = seen.has(norm);
    if (!byId && !byName && !byRoster) continue;

    priorityMsisdns.add(norm);
    if (!seen.has(norm)) {
      seen.add(norm);
      wakalas.push({
        id: `pw-${norm}`,
        name: pw.wakalaCode || norm,
        msisdn: pw.msisdn,
        region: 'Unknown',
        dateAdded: pw.importedAt || '',
        code: pw.wakalaCode,
        kind: 'Base',
        isPriority: true,
      } as PortfolioWakala);
    }
  }

  for (const w of wakalas) {
    const norm = normalizeMsisdn(w.msisdn);
    const alt = normalizeMsisdn((w as any).altMsisdn || (w as any).alternateNumber);
    if ((norm && priorityMsisdns.has(norm)) || (alt && priorityMsisdns.has(alt))) w.isPriority = true;
  }

  const priorityCount = wakalas.filter(w => w.isPriority).length;

  return {
    wakalas,
    priorityCount,
    normalCount: Math.max(0, wakalas.length - priorityCount),
    hasPriorityData,
  };
}
