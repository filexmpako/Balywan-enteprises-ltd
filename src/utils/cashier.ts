/**
 * Cashier accounts: the volume a cashier's till served and the month's cash
 * position. Kept apart from the company KPIs, which do not change.
 *
 * - Volume: each send from the cashier's till(s) is BASE when it paid a wakala
 *   in our Base Wakala Index, INTERNAL when it went to one of our own tills,
 *   and IOP otherwise. Base + IOP counts toward the cashier's target.
 * - Cash: each month the cashier is given capital to return at month end.
 *   Profit = cash held (the latest daily report's total) + expenses + income
 *   − capital. Income is money brought in on top of the cash in the report.
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

export type CashierEntryKind = 'expense' | 'income';

/** An expense paid from the cash, or income brought in for the company. */
export interface CashierExpense {
  expenseId: string;
  kind: CashierEntryKind;
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
  income: number;
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
  const counted = expenses.filter(e => e.status !== 'returned');
  const total = (kind: CashierEntryKind) => counted.filter(e => (e.kind ?? 'expense') === kind).reduce((s, e) => s + e.amount, 0);
  const spent = total('expense');
  const income = total('income');
  const volumeTarget = settings?.volumeTarget ?? 0;
  const served = volume.base + volume.iop;
  return {
    capital,
    held,
    heldDate: latest?.reportDate ?? null,
    expenses: spent,
    income,
    profit: held + spent + income - capital,
    volumeTarget,
    served,
    progress: volumeTarget > 0 ? served / volumeTarget : 0,
    pendingReports: reports.filter(r => r.status === 'submitted').length,
  };
}

export interface CashierStatementView {
  person: CashierPerson;
  fromPeriod: string;
  /** The day the statement was made (Tanzania time). */
  toDate: string;
  firstPeriod: string;
  months: CashierMonthView[];
}

export interface CashierStatementTotals {
  capital: number;
  returned: number;
  expenses: number;
  income: number;
  /** Sum of each month's profit. */
  profit: number;
  base: number;
  iop: number;
  internal: number;
  reports: number;
}

/** Totals across the statement's months. */
export function totalCashierStatement(months: CashierMonthView[]): CashierStatementTotals {
  const t: CashierStatementTotals = { capital: 0, returned: 0, expenses: 0, income: 0, profit: 0, base: 0, iop: 0, internal: 0, reports: 0 };
  for (const m of months) {
    t.capital += m.summary.capital;
    t.returned += m.settings?.returnedAmount ?? 0;
    t.expenses += m.summary.expenses;
    t.income += m.summary.income;
    t.profit += m.summary.profit;
    t.base += m.volume.base;
    t.iop += m.volume.iop;
    t.internal += m.volume.internal;
    t.reports += m.reports.length;
  }
  return t;
}

export interface CashierActivity {
  date: string;
  type: 'Daily report' | 'Expense' | 'Income' | 'Capital given' | 'Capital returned';
  description: string;
  amount: number;
  status: CashierStatus | null;
}

/** Every report, expense, income and capital movement, oldest first. */
export function cashierActivities(months: CashierMonthView[]): CashierActivity[] {
  const out: CashierActivity[] = [];
  for (const m of months) {
    if (m.settings && m.settings.capital > 0) {
      out.push({ date: `${m.period}-01`, type: 'Capital given', description: `Capital for ${m.period}`, amount: m.settings.capital, status: null });
    }
    if (m.settings?.returnedAmount != null) {
      const day = (m.settings.returnedAt || '').slice(0, 10) || `${m.period}-28`;
      out.push({ date: day, type: 'Capital returned', description: `Returned for ${m.period}`, amount: m.settings.returnedAmount, status: null });
    }
    for (const r of m.reports) {
      out.push({ date: r.reportDate, type: 'Daily report', description: r.lines.map(l => l.label).join(', ') || 'Cash report', amount: r.total, status: r.status });
    }
    for (const e of m.expenses) {
      out.push({ date: e.expenseDate, type: (e.kind ?? 'expense') === 'income' ? 'Income' : 'Expense', description: e.description, amount: e.amount, status: e.status });
    }
  }
  const order = ['Capital given', 'Daily report', 'Income', 'Expense', 'Capital returned'];
  return out.sort((a, b) => a.date.localeCompare(b.date) || order.indexOf(a.type) - order.indexOf(b.type));
}
