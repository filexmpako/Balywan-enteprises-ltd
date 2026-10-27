/**
 * The week drill-down shown like the uploaded weekly report: one row per
 * wakala with the report's own columns that the calculations use.
 */
import { normalizeMsisdn } from './msisdn';

export interface WeeklyReportRow {
  msisdn: string;
  aliasCode: string;
  fullName: string;
  ciTxns: number;
  coTxns: number;
  saServicingVal: number;
  saServicingTxns: number;
  iop: number;
  cpServicingVal: number;
  /** The served reading counted: the report's servicing_status, else the rule; null = no reading. */
  served: boolean | null;
  servedFromReport: boolean;
  /** The active reading counted: the report's wakala_status, else the rule. */
  active: boolean;
  activeFromReport: boolean;
  ownerId: string | null;
  ownerName: string | null;
}

export type DetailFilter =
  | 'all' | 'active' | 'inactive' | 'served' | 'unserved' | 'nostatus'
  | 'wakalaBank' | 'iopWakala' | 'newWakala' | 'location';

export const FILTER_LABELS: Record<DetailFilter, string> = {
  all: 'All',
  active: 'Active',
  inactive: 'Inactive',
  served: 'Served',
  unserved: 'Unserved',
  nostatus: 'No Status',
  wakalaBank: 'Wakala Bank',
  iopWakala: 'IOP Wakala · Weekly',
  newWakala: 'New Wakala',
  location: 'Location',
};

export interface FilterContext {
  /** Wakalas served this week and in none of the prior lookback weeks. */
  newWakalaSet: Set<string>;
  /** msisdn -> district, from our own Base Wakala Index (never the report). */
  districtOf: Map<string, string>;
  selectedDistrict: string;
}

export const rowKey = (msisdn: string) => normalizeMsisdn(msisdn) || msisdn;

export function matchesFilter(w: WeeklyReportRow, filter: DetailFilter, ctx: FilterContext): boolean {
  switch (filter) {
    case 'active': return w.active === true;
    case 'inactive': return w.active === false;
    case 'served': return w.served === true;
    case 'unserved': return w.served === false;
    case 'nostatus': return w.served === null;
    // Wakala Bank: went through a cross-partner ("bank") servicing route this week.
    case 'wakalaBank': return w.cpServicingVal > 0;
    // IOP Wakala: serviced by a network outside our company this week.
    case 'iopWakala': return w.iop > 0;
    // New Wakala: unserved for the lookback window, served this week.
    case 'newWakala': return ctx.newWakalaSet.has(rowKey(w.msisdn));
    case 'location': return !ctx.selectedDistrict || ctx.districtOf.get(rowKey(w.msisdn)) === ctx.selectedDistrict;
    default: return true;
  }
}

/** Wakalas served in `current` that had no served reading in any of `prior`. */
export function newlyServed(current: WeeklyReportRow[], prior: WeeklyReportRow[][]): Set<string> {
  const servedBefore = new Set<string>();
  prior.forEach(rows => rows.forEach(r => { if (r.served === true) servedBefore.add(rowKey(r.msisdn)); }));
  const out = new Set<string>();
  current.forEach(r => {
    const key = rowKey(r.msisdn);
    if (r.served === true && !servedBefore.has(key)) out.add(key);
  });
  return out;
}

export interface WeeklyReportTotals {
  wakala: number;
  ciTxns: number;
  coTxns: number;
  saServicingVal: number;
  saServicingTxns: number;
  iop: number;
  cpServicingVal: number;
  served: number;
  active: number;
}

export function totalsOf(rows: WeeklyReportRow[]): WeeklyReportTotals {
  const t: WeeklyReportTotals = {
    wakala: rows.length, ciTxns: 0, coTxns: 0, saServicingVal: 0, saServicingTxns: 0, iop: 0, cpServicingVal: 0, served: 0, active: 0,
  };
  for (const r of rows) {
    t.ciTxns += r.ciTxns;
    t.coTxns += r.coTxns;
    t.saServicingVal += r.saServicingVal;
    t.saServicingTxns += r.saServicingTxns;
    t.iop += r.iop;
    t.cpServicingVal += r.cpServicingVal;
    if (r.served === true) t.served++;
    if (r.active) t.active++;
  }
  return t;
}

/** Report-style number: thousands separators, "-" for zero. */
export const reportNumber = (n: number) => (n ? Math.round(n).toLocaleString('en-US') : '-');
