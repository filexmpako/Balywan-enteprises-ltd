/**
 * Cashier accounts: the volume a cashier's till served and the month's cash
 * position. Kept apart from the company KPIs, which do not change.
 *
 * - Volume: each send from the cashier's till(s) is BASE when it paid a wakala
 *   in our Base Wakala Index, INTERNAL when it went to one of our own tills,
 *   and IOP otherwise. Base + IOP counts toward the cashier's target.
 * - Cash: each month the cashier is given capital to return at month end.
 *   Profit = cash held (the latest daily report's total) + expenses − capital.
 */
import { normalizeMsisdn } from './msisdn';

export interface CashierLine {
  label: string;
  amount: number;
}

export type CashierStatus = 'submitted' | 'approved' | 'returned';

export interface CashierReport {
  reportId: string;
  reportDate: string;
  lines: CashierLine[];
  total: number;
  notes: string | null;
  status: CashierStatus;
  submittedAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
}

export interface CashierExpense {
  expenseId: string;
  expenseDate: string;
  description: string;
  amount: number;
  status: CashierStatus;
}

export interface CashierMonthSettings {
  capital: number;
  volumeTarget: number;
  returnedAmount: number | null;
  returnedAt: string | null;
  notes: string | null;
}

export interface CashierVolume {
  base: number;
  iop: number;
  internal: number;
  txns: { base: number; iop: number; internal: number };
}

export interface CashierMonthSummary {
  capital: number;
  held: number;
  heldDate: string | null;
  expenses: number;
  profit: number;
  volumeTarget: number;
  /** Base + IOP. */
  served: number;
  /** served / target, 0–1+ (0 when there is no target). */
  progress: number;
  pendingReports: number;
}

export interface CashierPerson {
  personnelId: string;
  name: string;
  title: string;
  location: string;
  till: string;
  hasAccount: boolean;
}

export interface CashierMonthView {
  person: CashierPerson;
  period: string;
  settings: CashierMonthSettings | null;
  reports: CashierReport[];
  expenses: CashierExpense[];
  volume: CashierVolume;
  summary: CashierMonthSummary;
}

/** The report's lines with blank labels dropped and amounts as numbers. */
export function cleanLines(lines: { label?: unknown; amount?: unknown }[]): CashierLine[] {
  return (lines ?? [])
    .map(l => ({ label: String(l?.label ?? '').trim(), amount: Number(String(l?.amount ?? '').replace(/,/g, '')) }))
    .filter(l => l.label && Number.isFinite(l.amount));
}

export const sumLines = (lines: CashierLine[]) => lines.reduce((s, l) => s + l.amount, 0);

/** Splits the till's sends into Base / IOP / internal. */
export function classifyCashierVolume(
  sends: { dest: string; amount: number }[],
  { baseNumbers, ownTills }: { baseNumbers: Set<string>; ownTills: Set<string> },
): CashierVolume {
  const v: CashierVolume = { base: 0, iop: 0, internal: 0, txns: { base: 0, iop: 0, internal: 0 } };
  for (const s of sends) {
    const dest = normalizeMsisdn(s.dest);
    const kind = ownTills.has(dest) ? 'internal' : baseNumbers.has(dest) ? 'base' : 'iop';
    v[kind] += Math.abs(Number(s.amount) || 0);
    v.txns[kind]++;
  }
  return v;
}

/** The month's cash position and target progress. */
export function summarizeCashierMonth(
  settings: CashierMonthSettings | null,
  reports: CashierReport[],
  expenses: CashierExpense[],
  volume: CashierVolume,
): CashierMonthSummary {
  const latest = reports
    .filter(r => r.status !== 'returned')
    .sort((a, b) => b.reportDate.localeCompare(a.reportDate))[0];
  const capital = settings?.capital ?? 0;
  const held = latest?.total ?? 0;
  const spent = expenses.filter(e => e.status !== 'returned').reduce((s, e) => s + e.amount, 0);
  const volumeTarget = settings?.volumeTarget ?? 0;
  const served = volume.base + volume.iop;
  return {
    capital,
    held,
    heldDate: latest?.reportDate ?? null,
    expenses: spent,
    profit: held + spent - capital,
    volumeTarget,
    served,
    progress: volumeTarget > 0 ? served / volumeTarget : 0,
    pendingReports: reports.filter(r => r.status === 'submitted').length,
  };
}
