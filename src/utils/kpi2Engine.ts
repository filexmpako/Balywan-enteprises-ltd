import { ClassifiedRow } from './classification';
import { Owner, PriorityWakala, BaseWakala, ManualOwnerTarget } from '../types';
import { KPI1Status } from './kpiEngine';
import { normalizeMsisdn } from './msisdn';
import { buildOwnerWakalaMap } from './wakalaMapping';
import { getSavedManualOwnerTargets } from './targetResolution';

export interface KPI2Result {
  ownerId: string;
  ownerName: string;
  period: string;
  normalServed: number;
  normalTarget: number;
  normalPercent: number | null;   // the admin-set % this target was derived from, for display
  normalAchievementPct: number;   // uncapped
  priorityServed: number;
  priorityTarget: number;
  priorityPercent: number | null;
  priorityAchievementPct: number; // uncapped
  achieved: boolean;
  status: KPI1Status;
  hasTarget: boolean;
  normalWakalaCount: number;
  priorityWakalaCount: number;
}

function getStatus(score: number): KPI1Status {
  if (score >= 90) return 'Green';
  if (score >= 70) return 'Blue';
  if (score >= 60) return 'Yellow';
  return 'Red';
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Calculates KPI 2 (Active Wakala Distribution vs Target) for every owner.
 * Target counts are derived directly from each owner's own admin-set
 * percentage against their own real wakala roster — no company-wide
 * figure is involved.
 */
export function calculateKPI2(
  classifiedRows: ClassifiedRow[],
  owners: Owner[],
  period: string,
  manualTargets?: ManualOwnerTarget[],
  priorityWakalasParam?: PriorityWakala[],
  baseWakalasParam?: BaseWakala[],
  /**
   * Authoritative per-wakala served status (normalized MSISDN -> served),
   * sourced from the uploaded servicing_status column (Weekly data).
   * When a wakala is present here, the Daily MGT computed rule is ignored
   * for that wakala; otherwise the computed rule applies unchanged.
   */
  servedOverride?: Map<string, boolean>
): KPI2Result[] {
  const actualManualTargets = (manualTargets && Array.isArray(manualTargets)) ? manualTargets : getSavedManualOwnerTargets();
  const priorityWakalas: PriorityWakala[] = priorityWakalasParam || (() => {
    try {
      const saved = localStorage.getItem('priorityWakalaList');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  })();

  const periodPriorityWakalas = priorityWakalas.filter(p => !p.period || p.period === period);

  const baseWakalaIndex: BaseWakala[] = baseWakalasParam || [];
  const ownerWakalaMapping = buildOwnerWakalaMap(baseWakalaIndex, owners);

  const results: KPI2Result[] = [];

  for (const owner of owners) {
    if (!owner) continue;
    const ownerId = owner.id || '';
    const ownerNameLower = (owner.name || '').trim().toLowerCase();

    const ownerEntries = ownerWakalaMapping.byOwnerId.get(ownerId) || [];
    const wakalasMap = new Map<string, { msisdn: string }>();
    ownerEntries.forEach(entry => {
      const m = normalizeMsisdn(entry.msisdn);
      if (m) wakalasMap.set(m, { msisdn: m });
    });

    const ownerPriorityMsisdns = new Set<string>();
    for (const pw of periodPriorityWakalas) {
      const pwMsisdn = normalizeMsisdn(pw.msisdn);
      const matchesByOwnerId = pw.ownerId && ownerId && pw.ownerId === ownerId;
      const matchesByOwnerName = pw.ownerName && ownerNameLower && pw.ownerName.trim().toLowerCase() === ownerNameLower;
      const matchesByMsisdn = pwMsisdn && wakalasMap.has(pwMsisdn);

      if (matchesByOwnerId || matchesByOwnerName || matchesByMsisdn) {
        if (pwMsisdn) {
          ownerPriorityMsisdns.add(pwMsisdn);
          if (!wakalasMap.has(pwMsisdn)) {
            wakalasMap.set(pwMsisdn, { msisdn: pwMsisdn });
          }
        }
      }
    }

    const priorityWakalaCount = ownerPriorityMsisdns.size;
    const normalWakalaCount = Math.max(0, wakalasMap.size - priorityWakalaCount);

    // Resolve this owner's admin-set percentages for this period
    const manual = actualManualTargets.find(m => m.ownerId === ownerId && m.period === period);
    const normalPercent = manual?.kpi2NormalPercent ?? null;
    const priorityPercent = manual?.kpi2PriorityPercent ?? null;

    const normalTarget = normalPercent !== null
      ? round1(normalWakalaCount * (normalPercent / 100))
      : 0;
    const priorityTarget = priorityPercent !== null
      ? round1(priorityWakalaCount * (priorityPercent / 100))
      : 0;

    // Evaluate served status per wakala (unchanged serving logic from before)
    let normalServed = 0;
    let priorityServed = 0;

    wakalasMap.forEach(({ msisdn }) => {
      const wClean = normalizeMsisdn(msisdn);
      const wRows = classifiedRows.filter(cr => {
        const rowClean = normalizeMsisdn(
          cr.auditRecord?.normalizedMsisdn ||
          cr.auditRecord?.rawMsisdn ||
          cr.row['Branch_msisdn'] ||
          cr.row['transactionTill'] ||
          cr.row['Agent ID'] ||
          cr.row['AgentID'] ||
          cr.row['MSISDN'] ||
          cr.row['msisdn'] ||
          ''
        );
        return rowClean === wClean;
      });

      const totalTxns = wRows.reduce((sum, cr) => {
        const keys = ['SA_Servicing_Txns', 'SA Servicing Txns', 'sa_servicing_txns'];
        for (const k of keys) {
          if (cr.row[k] !== undefined) {
            const val = parseFloat(String(cr.row[k]).replace(/,/g, ''));
            if (!isNaN(val)) return sum + val;
          }
        }
        return sum + 1;
      }, 0);

      const totalVal = wRows.reduce((sum, cr) => sum + (cr.auditRecord?.amount || 0), 0);

      const isActive = wRows.some(cr => {
        const row = cr.row as Record<string, any>;
        if (!row) return false;
        const val = row.wakala_status ?? row.Wakala_Status ?? row['Wakala Status'] ?? row['wakala status'] ?? row.status ?? row.Status;
        if (val === undefined || val === null || val === '') return false;
        return Number(val) === 1;
      });

      const computedServed = isActive ? (totalTxns > 6 || totalVal > 600000) : (totalTxns > 6);
      const override = servedOverride?.get(wClean);
      const isServed = override !== undefined ? override : computedServed;

      if (isServed) {
        if (ownerPriorityMsisdns.has(wClean)) {
          priorityServed++;
        } else {
          normalServed++;
        }
      }
    });

    const normalAchievementPct = normalTarget > 0
      ? round1((normalServed / normalTarget) * 100)
      : (normalPercent !== null && normalWakalaCount === 0 ? 100 : 0);

    const priorityAchievementPct = priorityTarget > 0
      ? round1((priorityServed / priorityTarget) * 100)
      : (priorityPercent !== null && priorityWakalaCount === 0 ? 100 : 0);

    const achieved = normalAchievementPct >= 100 && priorityAchievementPct >= 100;

    const cappedNormal = Math.min(normalAchievementPct, 100);
    const cappedPriority = Math.min(priorityAchievementPct, 100);
    const weakerPct = Math.min(cappedNormal, cappedPriority);
    const status = getStatus(weakerPct);

    const hasTarget = normalPercent !== null || priorityPercent !== null;

    results.push({
      ownerId,
      ownerName: owner.name || 'Unknown Owner',
      period,
      normalServed,
      normalTarget,
      normalPercent,
      normalAchievementPct,
      priorityServed,
      priorityTarget,
      priorityPercent,
      priorityAchievementPct,
      achieved,
      status,
      hasTarget,
      normalWakalaCount,
      priorityWakalaCount
    });
  }

  return results;
}
