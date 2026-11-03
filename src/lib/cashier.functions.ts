import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { CashierLine } from '../utils/cashier';

/**
 * Cashier accounts. A cashier reads and writes only their own month (their
 * login is linked to a personnel row); admins and float managers see every
 * cashier, set the month's capital and target, and approve or return reports.
 */

const MONTH = /^\d{4}-\d{2}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

type Caller = { staff: true; personnelId?: undefined } | { staff: false; personnelId: string };

async function resolveCaller(supabase: any, userId: string): Promise<Caller> {
  const { isMissingSetup, CashierSetupError } = await import('./cashier.server');
  const { data: staff } = await supabase.rpc('is_staff', { _user_id: userId });
  if (staff === true) return { staff: true };
  const { data: cashier, error } = await supabase.rpc('is_cashier', { _user_id: userId });
  if (isMissingSetup(error)) throw new CashierSetupError();
  if (cashier !== true) throw new Error('Only cashiers, admins and float managers can use cashier accounts.');
  const { data: personnelId } = await supabase.rpc('current_personnel_id');
  if (!personnelId) throw new Error('This cashier login is not linked to a personnel profile. Ask an admin to link it.');
  return { staff: false, personnelId: String(personnelId) };
}

async function requireStaff(supabase: any, userId: string) {
  const caller = await resolveCaller(supabase, userId);
  if (!caller.staff) throw new Error('Only admins and float managers can do this.');
}

/** Expected refusals reach the user as-is; anything else is logged with a generic message. */
async function friendly<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err: any) {
    const message = String(err?.message || '');
    if (err?.name === 'Error' && message && !/^\w+: /.test(message)) throw err;
    console.error('[cashier]', err);
    throw new Error(message.startsWith('Cashier accounts are not set up') ? message : 'The cashier change could not be saved. Please try again.');
  }
}

async function audit(supabase: any, userId: string, action: string, details: Record<string, unknown>) {
  try {
    const { appendAuditLog } = await import('./hasidadi/repo.server');
    await appendAuditLog(supabase, { userId, action, entity: 'cashier', details });
  } catch (err) {
    console.warn('[cashier] audit log not written', err);
  }
}

async function readSetup(supabase: any) {
  const [{ privilegedClient }, server] = await Promise.all([import('./privilegedClient.server'), import('./cashier.server')]);
  const db = await privilegedClient(supabase);
  return { db, server, registries: await server.loadCashierRegistries(db) };
}

/** The cashier a request is about: the caller's own for a cashier, the chosen one for staff. */
async function readPerson(supabase: any, userId: string, requested: string | undefined) {
  const caller = await resolveCaller(supabase, userId);
  const personnelId = caller.staff ? requested : caller.personnelId;
  if (!personnelId) throw new Error('Choose a cashier.');
  const setup = await readSetup(supabase);
  const p = setup.registries.personnel.find(x => String(x.id) === personnelId);
  if (!p) throw new Error('That personnel profile no longer exists.');
  const people = await setup.server.listCashierPeople(setup.db, setup.registries);
  const person = people.find(x => x.personnelId === personnelId) ?? {
    personnelId, name: String(p.name || personnelId), title: String(p.title || ''), location: String(p.location || ''),
    till: String(p.assignedTill || ''), hasAccount: !caller.staff,
  };
  return { ...setup, person };
}

/** Every cashier's month for staff: settings, volume vs target and cash summary. */
export const fetchCashierBoard = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { period: string }) => {
    if (!MONTH.test(String(input?.period || ''))) throw new Error('period must be YYYY-MM');
    return { period: input.period };
  })
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    try {
      await requireStaff(supabase, context.userId);
      const { db, server, registries } = await readSetup(supabase);
      const people = await server.listCashierPeople(db, registries);
      const months = await Promise.all(people.map(p => server.loadCashierMonth(db, registries, p, data.period)));
      return { setupRequired: false as const, months };
    } catch (err: any) {
      const { CashierSetupError } = await import('./cashier.server');
      if (err instanceof CashierSetupError) return { setupRequired: true as const, months: [] };
      throw err;
    }
  });

/** One cashier's month: their own for a cashier, any cashier's for staff. */
export const fetchCashierMonth = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { period: string; personnelId?: string }) => {
    if (!MONTH.test(String(input?.period || ''))) throw new Error('period must be YYYY-MM');
    return { period: input.period, personnelId: input.personnelId || undefined };
  })
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    try {
      const { db, server, registries, person } = await readPerson(supabase, context.userId, data.personnelId);
      return { setupRequired: false as const, month: await server.loadCashierMonth(db, registries, person, data.period) };
    } catch (err: any) {
      const { CashierSetupError } = await import('./cashier.server');
      if (err instanceof CashierSetupError) return { setupRequired: true as const, month: null };
      throw err;
    }
  });

/** Staff: the month's capital (returned at month end), volume target and what was returned. */
export const saveCashierMonthSettings = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { personnelId: string; period: string; capital: number; volumeTarget: number; returnedAmount?: number | null; notes?: string }) => {
    if (!input?.personnelId) throw new Error('Choose a cashier.');
    if (!MONTH.test(String(input.period || ''))) throw new Error('period must be YYYY-MM');
    const capital = Number(input.capital);
    const volumeTarget = Number(input.volumeTarget);
    if (!Number.isFinite(capital) || capital < 0) throw new Error('Capital must be zero or more.');
    if (!Number.isFinite(volumeTarget) || volumeTarget < 0) throw new Error('The volume target must be zero or more.');
    const returned = input.returnedAmount === null || input.returnedAmount === undefined || String(input.returnedAmount) === '' ? null : Number(input.returnedAmount);
    if (returned !== null && (!Number.isFinite(returned) || returned < 0)) throw new Error('The returned amount must be zero or more.');
    return { personnelId: String(input.personnelId), period: input.period, capital, volumeTarget, returnedAmount: returned, notes: String(input.notes ?? '').trim() || null };
  })
  .handler(async ({ data, context }) =>
    friendly(async () => {
      const supabase = context.supabase as any;
      await requireStaff(supabase, context.userId);
      const { isMissingSetup, CashierSetupError } = await import('./cashier.server');
      const now = new Date().toISOString();
      const { error } = await supabase.from('cashier_months').upsert({
        personnel_id: data.personnelId,
        period: data.period,
        capital: data.capital,
        volume_target: data.volumeTarget,
        returned_amount: data.returnedAmount,
        returned_at: data.returnedAmount === null ? null : now,
        notes: data.notes,
        updated_by: context.userId,
        updated_at: now,
      }, { onConflict: 'personnel_id,period' });
      if (isMissingSetup(error)) throw new CashierSetupError();
      if (error) throw new Error(`cashier_months: ${error.message}`);
      await audit(supabase, context.userId, 'CASHIER_MONTH_SET', data);
      return { ok: true as const };
    }),
  );

/** Cashier: writes (or rewrites, until approved) the day's cash report. */
export const submitCashierReport = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { reportDate: string; lines: CashierLine[]; notes?: string }) => {
    if (!DAY.test(String(input?.reportDate || ''))) throw new Error('Choose the report date.');
    if (!Array.isArray(input.lines)) throw new Error('Add at least one line.');
    return { reportDate: input.reportDate, lines: input.lines, notes: String(input.notes ?? '').trim() || null };
  })
  .handler(async ({ data, context }) =>
    friendly(async () => {
      const supabase = context.supabase as any;
      const caller = await resolveCaller(supabase, context.userId);
      if (caller.staff) throw new Error('Daily reports are written by the cashier.');
      const { cleanLines, sumLines } = await import('../utils/cashier');
      const lines = cleanLines(data.lines);
      if (!lines.length) throw new Error('Add at least one line with a label and an amount.');
      const { data: existing } = await supabase.from('cashier_daily_reports').select('status')
        .eq('personnel_id', caller.personnelId).eq('report_date', data.reportDate).maybeSingle();
      if (existing?.status === 'approved') throw new Error('That day is already approved and can no longer be changed.');
      const { error } = await supabase.from('cashier_daily_reports').upsert({
        personnel_id: caller.personnelId,
        report_date: data.reportDate,
        lines,
        total: sumLines(lines),
        notes: data.notes,
        status: 'submitted',
        submitted_by: context.userId,
        submitted_at: new Date().toISOString(),
        reviewed_by: null,
        reviewed_at: null,
        review_note: null,
      }, { onConflict: 'personnel_id,report_date' });
      if (error) throw new Error(`cashier_daily_reports: ${error.message}`);
      await audit(supabase, context.userId, 'CASHIER_REPORT_SUBMIT', { personnelId: caller.personnelId, reportDate: data.reportDate, total: sumLines(lines) });
      return { ok: true as const };
    }),
  );

/** Staff: approves or returns a daily report, with that day's expenses. */
export const reviewCashierReport = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { reportId: string; decision: 'approved' | 'returned'; note?: string }) => {
    if (!input?.reportId) throw new Error('Choose a report.');
    if (input.decision !== 'approved' && input.decision !== 'returned') throw new Error('Approve or return the report.');
    if (input.decision === 'returned' && !String(input.note ?? '').trim()) throw new Error('Say why the report is returned.');
    return { reportId: String(input.reportId), decision: input.decision, note: String(input.note ?? '').trim() || null };
  })
  .handler(async ({ data, context }) =>
    friendly(async () => {
      const supabase = context.supabase as any;
      await requireStaff(supabase, context.userId);
      const now = new Date().toISOString();
      const { data: report, error } = await supabase.from('cashier_daily_reports')
        .update({ status: data.decision, reviewed_by: context.userId, reviewed_at: now, review_note: data.note })
        .eq('report_id', data.reportId)
        .select('personnel_id, report_date, total')
        .maybeSingle();
      if (error) throw new Error(`cashier_daily_reports: ${error.message}`);
      if (!report) throw new Error('That report no longer exists.');
      const { error: expError } = await supabase.from('cashier_expenses')
        .update({ status: data.decision, reviewed_by: context.userId, reviewed_at: now })
        .eq('personnel_id', report.personnel_id)
        .eq('expense_date', report.report_date)
        .neq('status', 'approved');
      if (expError) throw new Error(`cashier_expenses: ${expError.message}`);
      await audit(supabase, context.userId, data.decision === 'approved' ? 'CASHIER_REPORT_APPROVE' : 'CASHIER_REPORT_RETURN', {
        reportId: data.reportId, personnelId: report.personnel_id, reportDate: report.report_date, total: report.total, note: data.note,
      });
      return { ok: true as const };
    }),
  );

/** Cashier: records an expense paid from the cash they hold, or income brought in for the company. */
export const addCashierExpense = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { expenseDate: string; description: string; amount: number; kind?: 'expense' | 'income' }) => {
    if (!DAY.test(String(input?.expenseDate || ''))) throw new Error('Choose the date.');
    const description = String(input.description ?? '').trim();
    if (!description) throw new Error(input.kind === 'income' ? 'Say where the income came from.' : 'Describe the expense.');
    const amount = Number(String(input.amount ?? '').replace(/,/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('The amount must be more than zero.');
    return { expenseDate: input.expenseDate, description, amount, kind: input.kind === 'income' ? 'income' as const : 'expense' as const };
  })
  .handler(async ({ data, context }) =>
    friendly(async () => {
      const supabase = context.supabase as any;
      const caller = await resolveCaller(supabase, context.userId);
      if (caller.staff) throw new Error('Expenses and income are recorded by the cashier.');
      const { error } = await supabase.from('cashier_expenses').insert({
        personnel_id: caller.personnelId,
        expense_date: data.expenseDate,
        description: data.description,
        amount: data.amount,
        status: 'submitted',
        created_by: context.userId,
        // Sent only for income so expenses keep working before the income column exists.
        ...(data.kind === 'income' ? { kind: 'income' } : {}),
      });
      if (error && data.kind === 'income' && /kind/.test(String(error.message))) {
        throw new Error('Income needs a small database update first. Ask the admin to run the cashier income SQL.');
      }
      if (error) throw new Error(`cashier_expenses: ${error.message}`);
      await audit(supabase, context.userId, data.kind === 'income' ? 'CASHIER_INCOME_ADD' : 'CASHIER_EXPENSE_ADD', { personnelId: caller.personnelId, ...data });
      return { ok: true as const };
    }),
  );

/** Removes an expense or income entry: the cashier's own until approved; staff any. */
export const deleteCashierExpense = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { expenseId: string }) => {
    if (!input?.expenseId) throw new Error('Choose an expense.');
    return { expenseId: String(input.expenseId) };
  })
  .handler(async ({ data, context }) =>
    friendly(async () => {
      const supabase = context.supabase as any;
      await resolveCaller(supabase, context.userId);
      const { data: removed, error } = await supabase.from('cashier_expenses').delete().eq('expense_id', data.expenseId).select('expense_id');
      if (error) throw new Error(`cashier_expenses: ${error.message}`);
      if (!removed?.length) throw new Error('That expense is approved or no longer exists.');
      await audit(supabase, context.userId, 'CASHIER_EXPENSE_DELETE', data);
      return { ok: true as const };
    }),
  );

/** Everything one cashier did from `fromPeriod` (default: their first record) up to today, for printing. */
export const fetchCashierStatement = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { personnelId?: string; fromPeriod?: string }) => {
    if (input?.fromPeriod && !MONTH.test(input.fromPeriod)) throw new Error('fromPeriod must be YYYY-MM');
    return { personnelId: input?.personnelId || undefined, fromPeriod: input?.fromPeriod || undefined };
  })
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    try {
      const { db, server, registries, person } = await readPerson(supabase, context.userId, data.personnelId);
      return { setupRequired: false as const, statement: await server.loadCashierStatement(db, registries, person, data.fromPeriod) };
    } catch (err: any) {
      const { CashierSetupError } = await import('./cashier.server');
      if (err instanceof CashierSetupError) return { setupRequired: true as const, statement: null };
      throw err;
    }
  });
