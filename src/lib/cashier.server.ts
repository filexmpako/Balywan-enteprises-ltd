/**
 * Cashier accounts, server side: the month's settings, daily cash reports and
 * expenses (tables from the cashier_accounts migration) and the volume the
 * cashier's till served (from Daily MGT).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getMapper } from './hasidadi/collections';
import { loadCollection } from './hasidadi/repo.server';
import { normalizeMsisdn } from '../utils/msisdn';
import {
  classifyCashierVolume, summarizeCashierMonth,
  type CashierExpense, type CashierMonthSettings, type CashierMonthView, type CashierPerson, type CashierReport, type CashierStatementView,
} from '../utils/cashier';

type DB = SupabaseClient<any, any, any>;

/** Shown until the cashier_accounts migration has been applied. */
export const SETUP_REQUIRED = 'Cashier accounts are not set up in the database yet. Apply the cashier_accounts migration in Lovable.';

/** True when a query failed because the cashier tables / functions do not exist yet. */
export function isMissingSetup(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(String(error.code)) ||
    /does not exist|could not find the (table|function)/i.test(String(error.message));
}

export class CashierSetupError extends Error {
  constructor() { super(SETUP_REQUIRED); }
}

const check = (error: any, what: string) => {
  if (!error) return;
  if (isMissingSetup(error)) throw new CashierSetupError();
  throw new Error(`${what}: ${error.message}`);
};

interface Registries {
  personnel: any[];
  baseNumbers: Set<string>;
  ownTills: Set<string>;
}

/** Personnel, the Base Wakala Index numbers (main + alternate) and our own tills. */
export async function loadCashierRegistries(db: DB): Promise<Registries> {
  const load = (key: string) => loadCollection(db, getMapper(key)!);
  const [personnel, tills, saTills, base] = await Promise.all([
    load('personnelList'), load('tillsList'), load('saTillRegistry'), load('baseWakalaIndex'),
  ]);
  const baseNumbers = new Set<string>();
  for (const w of base) {
    for (const n of [w.msisdn, w.altMsisdn, w.alternateNumber]) {
      const m = normalizeMsisdn(n);
      if (m) baseNumbers.add(m);
    }
  }
  const ownTills = new Set<string>();
  for (const n of [
    ...tills.map(t => t.transactionTill),
    ...saTills.map(t => t.tillMsisdn),
    ...personnel.map(p => p.assignedTill),
  ]) {
    const m = normalizeMsisdn(n);
    if (m) ownTills.add(m);
  }
  return { personnel, baseNumbers, ownTills };
}

const toPerson = (p: any, accountIds: Set<string>): CashierPerson => ({
  personnelId: String(p.id),
  name: String(p.name || p.id),
  title: String(p.title || ''),
  location: String(p.location || ''),
  till: normalizeMsisdn(p.assignedTill),
  hasAccount: accountIds.has(String(p.id)),
});

/** Personnel with a cashier login, plus everyone titled CASHIER. */
export async function listCashierPeople(db: DB, registries: Registries): Promise<CashierPerson[]> {
  const { data: roles, error } = await db.from('user_roles').select('user_id, role');
  check(error, 'Cashier roles');
  const cashierUsers = new Set((roles ?? []).filter((r: any) => String(r.role) === 'cashier').map((r: any) => r.user_id));
  const { data: linked, error: linkError } = await db.from('personnel').select('personnel_id, user_id').not('user_id', 'is', null);
  check(linkError, 'Personnel accounts');
  const accountIds = new Set((linked ?? []).filter((p: any) => cashierUsers.has(p.user_id)).map((p: any) => String(p.personnel_id)));
  return registries.personnel
    .filter(p => accountIds.has(String(p.id)) || /cashier/i.test(String(p.title || '')))
    .map(p => toPerson(p, accountIds))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function loadTillSends(db: DB, till: string, period: string): Promise<{ dest: string; amount: number }[]> {
  if (!till) return [];
  const out: { dest: string; amount: number }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('daily_transaction_records')
      .select('record_id, dest_msisdn, amount')
      .eq('branch_msisdn', till)
      .eq('reporting_period', period)
      .eq('is_active', true)
      .order('record_id')
      .range(from, from + 999);
    if (error) throw new Error(`Daily MGT read: ${error.message}`);
    for (const r of data ?? []) out.push({ dest: String(r.dest_msisdn ?? ''), amount: Number(r.amount) || 0 });
    if (!data || data.length < 1000) return out;
  }
}

const num = (v: unknown) => Number(v) || 0;

/** One cashier's month: settings, reports, expenses, till volume and the summary. */
export async function loadCashierMonth(db: DB, registries: Registries, person: CashierPerson, period: string): Promise<CashierMonthView> {
  const [y, m] = period.split('-').map(Number);
  const first = `${period}-01`;
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const [settingsRes, reportsRes, expensesRes, sends] = await Promise.all([
    db.from('cashier_months').select('*').eq('personnel_id', person.personnelId).eq('period', period).maybeSingle(),
    db.from('cashier_daily_reports').select('*').eq('personnel_id', person.personnelId)
      .gte('report_date', first).lt('report_date', next).order('report_date', { ascending: false }),
    db.from('cashier_expenses').select('*').eq('personnel_id', person.personnelId)
      .gte('expense_date', first).lt('expense_date', next).order('expense_date', { ascending: false }),
    loadTillSends(db, person.till, period),
  ]);
  check(settingsRes.error, 'Cashier month');
  check(reportsRes.error, 'Cashier reports');
  check(expensesRes.error, 'Cashier expenses');
  const s = settingsRes.data;
  const settings: CashierMonthSettings | null = s
    ? { capital: num(s.capital), volumeTarget: num(s.volume_target), returnedAmount: s.returned_amount === null ? null : num(s.returned_amount), returnedAt: s.returned_at, notes: s.notes }
    : null;
  const reports: CashierReport[] = (reportsRes.data ?? []).map((r: any) => ({
    reportId: r.report_id,
    reportDate: r.report_date,
    lines: Array.isArray(r.lines) ? r.lines : [],
    total: num(r.total),
    notes: r.notes,
    status: r.status,
    submittedAt: r.submitted_at,
    reviewedAt: r.reviewed_at,
    reviewNote: r.review_note,
  }));
  const expenses: CashierExpense[] = (expensesRes.data ?? []).map((e: any) => ({
    expenseId: e.expense_id,
    kind: e.kind === 'income' ? 'income' : 'expense',
    expenseDate: e.expense_date,
    description: e.description,
    amount: num(e.amount),
    status: e.status,
  }));
  const volume = classifyCashierVolume(sends, registries);
  return { person, period, settings, reports, expenses, volume, summary: summarizeCashierMonth(settings, reports, expenses, volume) };
}

const STATEMENT_MAX_MONTHS = 24;

/** Today in Tanzania (UTC+3), YYYY-MM-DD. */
const tanzaniaToday = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);

const addMonths = (period: string, n: number) => {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** The month of the cashier's first record (month settings, report or entry), or null. */
async function firstActivityPeriod(db: DB, personnelId: string): Promise<string | null> {
  const first = (table: string, column: string) =>
    db.from(table).select(column).eq('personnel_id', personnelId).order(column, { ascending: true }).limit(1).maybeSingle();
  const [m, r, e] = await Promise.all([
    first('cashier_months', 'period'),
    first('cashier_daily_reports', 'report_date'),
    first('cashier_expenses', 'expense_date'),
  ]);
  check(m.error, 'Cashier month');
  check(r.error, 'Cashier reports');
  check(e.error, 'Cashier expenses');
  const periods = [(m.data as any)?.period, (r.data as any)?.report_date, (e.data as any)?.expense_date]
    .filter(Boolean)
    .map((v: string) => v.slice(0, 7))
    .sort();
  return periods[0] ?? null;
}

/**
 * Everything the cashier did from `fromPeriod` (default: their first record)
 * up to today, month by month. At most two years.
 */
export async function loadCashierStatement(db: DB, registries: Registries, person: CashierPerson, fromPeriod?: string): Promise<CashierStatementView> {
  const toDate = tanzaniaToday();
  const current = toDate.slice(0, 7);
  const firstPeriod = (await firstActivityPeriod(db, person.personnelId)) ?? current;
  let start = fromPeriod && fromPeriod > firstPeriod ? fromPeriod : firstPeriod;
  if (start > current) start = current;
  const earliest = addMonths(current, -(STATEMENT_MAX_MONTHS - 1));
  if (start < earliest) start = earliest;
  const periods: string[] = [];
  for (let p = start; p <= current; p = addMonths(p, 1)) periods.push(p);
  const months: CashierMonthView[] = [];
  for (const p of periods) months.push(await loadCashierMonth(db, registries, person, p));
  return { person, fromPeriod: start, toDate, firstPeriod, months };
}
