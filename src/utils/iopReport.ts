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

/**
 * Who each row belongs to with today's registries ('' = no owner): REWARD →
 * the transaction till's owner, CLAWBACK → the wakala's owner in our base.
 */
function iopRowOwner({ owners, tills, baseWakalas }: IopRegistries): (r: IopReportRow) => string {
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
  return r => (r.status === 'REWARD' ? tillOwner.get(r.till) : wakalaOwner(r.agent)?.ownerId) || '';
}

/** Attributes each row to an owner with today's registries and totals it. */
export function summarizeIopReport(rows: IopReportRow[], registries: IopRegistries): IopReportSummary {
  const ownersById = new Map(registries.owners.map(o => [o.id, o]));
  const ownerOf = iopRowOwner(registries);

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
      const e = entry(ownerOf(r) || IOP_UNASSIGNED);
      e.reward += r.revisedAmount;
      e.rewardRows++;
      summary.reward += r.revisedAmount;
      if (e.ownerId === IOP_UNASSIGNED) summary.companyReward += r.revisedAmount;
    } else {
      const e = entry(ownerOf(r) || IOP_UNASSIGNED);
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

/** One agent (wakala) on an owner's REWARD or CLAWBACK side of the report. */
export interface IopAgentLine {
  agent: string;
  /** From our Base Wakala Index or the owners' wakala lists; '' when unknown. */
  name: string;
  /** The transaction tills that served it (till name, or number when unnamed). */
  tills: string[];
  servicings: number;
  revised: number;
  /** The agent's CICO VALUE for the month (the same on each of its rows). */
  cicoValue: number;
}

export interface IopOwnerAgents {
  reward: IopAgentLine[];
  clawback: IopAgentLine[];
}

/**
 * The agents behind one owner's REWARD (wakala their tills served outside
 * the base) and CLAWBACK (their base wakala served by other companies), one
 * line per agent, largest REVISED first.
 */
export function iopAgentsForOwner(rows: IopReportRow[], registries: IopRegistries, ownerId: string): IopOwnerAgents {
  const ownerOf = iopRowOwner(registries);
  const names = new Map<string, string>();
  for (const o of registries.owners) {
    for (const w of [...(o.baseWakalas ?? []), ...(o.iopWakalas ?? [])]) {
      const m = normalizeMsisdn(w?.msisdn);
      if (m && w.name) names.set(m, w.name);
    }
  }
  for (const w of registries.baseWakalas) {
    const name = w.fullName || w.wakalaName || w.code;
    if (w.msisdn && name) names.set(w.msisdn, name);
  }

  const sides = { REWARD: new Map<string, IopAgentLine>(), CLAWBACK: new Map<string, IopAgentLine>() };
  for (const r of rows) {
    if (ownerOf(r) !== ownerId) continue;
    const side = sides[r.status];
    let line = side.get(r.agent);
    if (!line) {
      line = { agent: r.agent, name: names.get(r.agent) || '', tills: [], servicings: 0, revised: 0, cicoValue: 0 };
      side.set(r.agent, line);
    }
    const till = r.tillName || r.till;
    if (till && !line.tills.includes(till)) line.tills.push(till);
    line.servicings++;
    line.revised += r.revisedAmount;
    line.cicoValue = Math.max(line.cicoValue, r.cicoValue);
  }
  const sorted = (m: Map<string, IopAgentLine>) => Array.from(m.values()).sort((a, b) => b.revised - a.revised);
  return { reward: sorted(sides.REWARD), clawback: sorted(sides.CLAWBACK) };
}

export interface IopAgentHistoryLine extends IopAgentLine {
  /** CICO VALUE in earlier months' reports, by YYYY-MM (absent = not in that report). */
  cicoHistory: Record<string, number>;
}

export interface IopOwnerAgentsView {
  month: string;
  /** Earlier months with a stored report, newest first (at most five). */
  earlierMonths: string[];
  reward: IopAgentHistoryLine[];
  clawback: IopAgentHistoryLine[];
}

/** Each agent's CICO VALUE in a month's report. */
export function iopCicoByAgent(rows: IopReportRow[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.agent, Math.max(out.get(r.agent) ?? 0, r.cicoValue));
  return out;
}
