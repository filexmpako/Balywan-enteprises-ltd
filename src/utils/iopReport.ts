/**
 * The month-end IOP report: one row per servicing between a transaction till
 * and a retail agent (wakala), marked REWARD or CLAWBACK.
 *
 * - REWARD: one of our tills served a wakala outside our base; we earn it.
 *   Credited to the owner of the transaction till (company / branch tills
 *   count only in the company total).
 * - CLAWBACK: another company's till served a wakala in our base; we lose it.
 *   Credited to the wakala's owner in our Base Wakala Index (unassigned until
 *   that wakala has an owner).
 *
 * REVISED AMOUNT is the figure counted (CICO RATIO = CICO VALUE / REVISED
 * AMOUNT). Every row counts, identical rows included.
 */
import type { BaseWakala, Owner } from '../types';
import { normalizeMsisdn } from './msisdn';
import { resolveOwnerMatch } from './ownerMatch';
import { buildMsisdnOwnerResolver } from './weeklyKpiEngine';

type IopStatus = 'REWARD' | 'CLAWBACK';

export interface IopReportRow {
  till: string;
  agent: string;
  status: IopStatus;
  tillName: string;
  cicoValue: number;
  cicoRatio: number;
  revisedAmount: number;
}

/** Owner key for amounts no registered owner carries (counted in company totals). */
export const IOP_UNASSIGNED = '__unassigned__';

const HEADERS = {
  till: 'transactiontill',
  agent: 'retailagentmsisdn',
  status: 'servstatus',
  tillName: 'mgttillname',
  cicoValue: 'cicovalue',
  cicoRatio: 'cicoratio',
  revisedAmount: 'revisedamount',
} as const;

const key = (h: string) => h.toLowerCase().replace(/[^a-z]/g, '');
const num = (v: unknown) => {
  const n = parseFloat(String(v ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};

/**
 * Reads the sheet's rows (objects keyed by header). Throws when a required
 * column is missing; skips rows with no agent or an unknown status.
 */
export function parseIopReportRows(sheetRows: Record<string, unknown>[]): IopReportRow[] {
  const first = sheetRows[0] ?? {};
  const columns = new Map(Object.keys(first).map(h => [key(h), h]));
  const missing = (['till', 'agent', 'status', 'revisedAmount'] as const).filter(k => !columns.has(HEADERS[k]));
  if (missing.length) {
    throw new Error(`Missing column(s): ${missing.map(k => ({ till: 'TRANSACTION TILL', agent: 'RETAIL AGENT MSISDN', status: 'SERV_STATUS', revisedAmount: 'REVISED AMOUNT' })[k]).join(', ')}`);
  }
  const get = (row: Record<string, unknown>, k: keyof typeof HEADERS) => row[columns.get(HEADERS[k]) ?? ''];
  const out: IopReportRow[] = [];
  for (const row of sheetRows) {
    const status = String(get(row, 'status') ?? '').trim().toUpperCase();
    const agent = normalizeMsisdn(String(get(row, 'agent') ?? ''));
    if (!agent || (status !== 'REWARD' && status !== 'CLAWBACK')) continue;
    out.push({
      till: normalizeMsisdn(String(get(row, 'till') ?? '')),
      agent,
      status,
      tillName: String(get(row, 'tillName') ?? '').trim(),
      cicoValue: num(get(row, 'cicoValue')),
      cicoRatio: num(get(row, 'cicoRatio')),
      revisedAmount: num(get(row, 'revisedAmount')),
    });
  }
  return out;
}

interface IopOwnerTotals {
  ownerId: string;
  ownerName: string;
  reward: number;
  clawback: number;
  rewardRows: number;
  clawbackRows: number;
}

export interface IopReportSummary {
  reward: number;
  clawback: number;
  /** REWARD on company / branch tills (no owner). */
  companyReward: number;
  /** CLAWBACK on base wakalas with no owner yet. */
  unassignedClawback: number;
  rows: number;
  /** Per owner, plus IOP_UNASSIGNED for the company-level amounts. */
  byOwner: IopOwnerTotals[];
}

export interface IopRegistries {
  owners: Owner[];
  tills: any[];
  baseWakalas: BaseWakala[];
}

/** Attributes each row to an owner with today's registries and totals it. */
export function summarizeIopReport(rows: IopReportRow[], { owners, tills, baseWakalas }: IopRegistries): IopReportSummary {
  const ownersById = new Map(owners.map(o => [o.id, o]));
  const tillOwner = new Map<string, string>();
  for (const t of tills) {
    const msisdn = normalizeMsisdn(t?.transactionTill);
    if (!msisdn) continue;
    const id = (t.ownerId && ownersById.has(t.ownerId) ? t.ownerId : '') ||
      resolveOwnerMatch(t.assignedOwner, owners, 'IOP Report').matchedOwner?.id || '';
    tillOwner.set(msisdn, id);
  }
  const wakalaOwner = buildMsisdnOwnerResolver(baseWakalas, owners, tills);

  const byOwner = new Map<string, IopOwnerTotals>();
  const entry = (ownerId: string) => {
    let e = byOwner.get(ownerId);
    if (!e) {
      e = {
        ownerId,
        ownerName: ownerId === IOP_UNASSIGNED ? 'Unassigned' : ownersById.get(ownerId)?.name || ownerId,
        reward: 0, clawback: 0, rewardRows: 0, clawbackRows: 0,
      };
      byOwner.set(ownerId, e);
    }
    return e;
  };
  const summary: IopReportSummary = { reward: 0, clawback: 0, companyReward: 0, unassignedClawback: 0, rows: rows.length, byOwner: [] };
  for (const r of rows) {
    if (r.status === 'REWARD') {
      const e = entry(tillOwner.get(r.till) || IOP_UNASSIGNED);
      e.reward += r.revisedAmount;
      e.rewardRows++;
      summary.reward += r.revisedAmount;
      if (e.ownerId === IOP_UNASSIGNED) summary.companyReward += r.revisedAmount;
    } else {
      const e = entry(wakalaOwner(r.agent)?.ownerId || IOP_UNASSIGNED);
      e.clawback += r.revisedAmount;
      e.clawbackRows++;
      summary.clawback += r.revisedAmount;
      if (e.ownerId === IOP_UNASSIGNED) summary.unassignedClawback += r.revisedAmount;
    }
  }
  summary.byOwner = Array.from(byOwner.values()).sort(
    (a, b) => Number(a.ownerId === IOP_UNASSIGNED) - Number(b.ownerId === IOP_UNASSIGNED) || b.reward - a.reward,
  );
  return summary;
}
