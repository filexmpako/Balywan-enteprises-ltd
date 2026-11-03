import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Plus, RotateCcw, Trash2, Wallet, Target, Receipt, AlertTriangle } from 'lucide-react';
import {
  addCashierExpense, deleteCashierExpense, fetchCashierMonth, reviewCashierReport, saveCashierMonthSettings, submitCashierReport,
} from '../lib/cashier.functions';
import { sumLines, type CashierEntryKind, type CashierMonthView, type CashierReport, type CashierStatus } from '../utils/cashier';
import { formatDate, formatMonthYear } from '../utils/dateFormat';

export const tzs = (n: number) => `TZS ${Math.round(n).toLocaleString()}`;
export const signedTzs = (n: number) => `${n < 0 ? '−' : n > 0 ? '+' : ''}${tzs(Math.abs(n))}`;
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const monthLabel = (period: string) => formatMonthYear(`${period}-01T00:00:00`);

/** This month and the five before it, newest first. */
export function recentMonths(count = 6): string[] {
  const d = new Date();
  return Array.from({ length: count }, (_, i) => {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
  });
}

export function MonthSelect({ value, onChange, months }: { value: string; onChange: (p: string) => void; months: string[] }) {
  const options = months.includes(value) ? months : [value, ...months];
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="rounded-xl border border-brand-gray-border bg-brand-card px-3 py-2 text-xs font-bold text-brand-text focus:outline-none focus:border-brand-primary cursor-pointer"
    >
      {options.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
    </select>
  );
}

export function SetupNotice() {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900">
      <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
      <div>
        <p className="font-bold">Cashier accounts are not set up in the database yet.</p>
        <p className="mt-1">Apply the cashier accounts migration in Lovable, then reload this page.</p>
      </div>
    </div>
  );
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

type Loaded = { status: 'loading' } | { status: 'error'; error: string } | { status: 'setup' } | { status: 'ready'; month: CashierMonthView };

/** One cashier's month (`personnelId` for staff; a cashier always gets their own). */
export function useCashierMonth(period: string, personnelId?: string) {
  const [state, setState] = useState<Loaded>({ status: 'loading' });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    // A reload of the same month keeps the page (and any message) on screen.
    setState(s => (s.status === 'ready' && s.month.period === period && (!personnelId || s.month.person.personnelId === personnelId) ? s : { status: 'loading' }));
    fetchCashierMonth({ data: { period, personnelId } })
      .then(r => {
        if (cancelled) return;
        if (r.setupRequired || !r.month) setState({ status: 'setup' });
        else setState({ status: 'ready', month: r.month as CashierMonthView });
      })
      .catch(err => { if (!cancelled) setState({ status: 'error', error: errorText(err) }); });
    return () => { cancelled = true; };
  }, [period, personnelId, version]);
  return { state, reload: useCallback(() => setVersion(v => v + 1), []) };
}

const STATUS_STYLE: Record<CashierStatus, string> = {
  submitted: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  returned: 'bg-rose-50 text-rose-700 border-rose-200',
};
const STATUS_LABEL: Record<CashierStatus, string> = { submitted: 'Waiting approval', approved: 'Approved', returned: 'Returned' };

function StatusBadge({ status }: { status: CashierStatus }) {
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
}

function Tile({ label, value, note, tone = 'text-brand-text', className = '' }: { label: string; value: string; note?: string; tone?: string; className?: string }) {
  return (
    <div className={`rounded-2xl border border-brand-gray-border bg-brand-card p-4 ${className}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-brand-text-variant">{label}</p>
      <p className={`mt-1 text-lg font-black tabular-nums ${tone}`}>{value}</p>
      {note && <p className="mt-0.5 text-[11px] text-brand-text-variant">{note}</p>}
    </div>
  );
}

const card = 'rounded-2xl border border-brand-gray-border bg-brand-card p-4 sm:p-5';
const h3 = 'flex items-center gap-2 text-xs font-black uppercase tracking-wider text-brand-primary';
const input = 'w-full rounded-lg border border-brand-gray-border bg-brand-card p-2 text-xs text-brand-text focus:outline-none focus:border-brand-primary';
const primaryBtn = 'inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-primary px-4 py-2 text-xs font-bold text-white hover:bg-brand-primary-light disabled:opacity-50 cursor-pointer';

/** Volume vs target and the month's cash position. */
export function CashierSummary({ month }: { month: CashierMonthView }) {
  const { summary: s, volume: v } = month;
  const pct = Math.round(s.progress * 100);
  return (
    <div className="space-y-3">
      <div className={card}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className={h3}><Target className="h-4 w-4" /> Volume vs target</h3>
          <span className="text-xs text-brand-text-variant">Till {month.person.till || '— not set'}</span>
        </div>
        <p className="mt-2 text-2xl font-black tabular-nums text-brand-text">
          {tzs(s.served)}
          <span className="ml-2 text-xs font-bold text-brand-text-variant">of {s.volumeTarget ? tzs(s.volumeTarget) : 'no target set'}</span>
        </p>
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-brand-gray-hover" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-brand-primary'}`} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
        <p className="mt-1 text-[11px] text-brand-text-variant">{s.volumeTarget ? `${pct}% of target · Base + IOP` : 'Base + IOP served this month'}</p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          {([['Base', v.base, v.txns.base], ['IOP', v.iop, v.txns.iop], ['Internal', v.internal, v.txns.internal]] as const).map(([label, amount, txns]) => (
            <div key={label} className="rounded-xl bg-brand-gray-hover/50 p-2.5">
              <p className="text-[10px] font-bold uppercase text-brand-text-variant">{label}</p>
              <p className="font-bold tabular-nums text-brand-text">{tzs(amount)}</p>
              <p className="text-[10px] text-brand-text-variant">{txns.toLocaleString()} txns</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-brand-text-variant">Internal = sends to our own tills; not counted toward the target.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label="Capital given" value={tzs(s.capital)} note={month.settings?.returnedAmount != null ? `Returned ${tzs(month.settings.returnedAmount)}` : 'Returned at month end'} />
        <Tile label="Cash held" value={tzs(s.held)} note={s.heldDate ? `Report of ${formatDate(`${s.heldDate}T00:00:00`)}` : 'No report yet'} />
        <Tile label="Expenses" value={tzs(s.expenses)} />
        <Tile label="Income" value={tzs(s.income)} note="Brought in for the company" tone="text-emerald-700" />
        <Tile label="Profit" value={signedTzs(s.profit)} note="Held + expenses + income − capital" tone={s.profit >= 0 ? 'text-emerald-700' : 'text-rose-700'} className="col-span-2 lg:col-span-1" />
      </div>
    </div>
  );
}

/** The cashier's daily cash report: free-form lines they add while writing it. */
export function CashierReportForm({ month, onSaved }: { month: CashierMonthView; onSaved: () => void }) {
  const [date, setDate] = useState(today());
  const existing = month.reports.find(r => r.reportDate === date);
  const template = month.reports.find(r => r.lines.length);
  const blankFrom = (r?: CashierReport) => (r?.lines.length ? r.lines.map(l => ({ label: l.label, amount: '' })) : [{ label: '', amount: '' }]);
  const [lines, setLines] = useState<{ label: string; amount: string }[]>(() => blankFrom(template));
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Opening a day that already has a report loads it for correction.
  useEffect(() => {
    if (existing) {
      setLines(existing.lines.map(l => ({ label: l.label, amount: String(l.amount) })));
      setNotes(existing.notes ?? '');
    }
  }, [existing?.reportId]);

  const locked = existing?.status === 'approved';
  const parsed = lines.map(l => ({ label: l.label.trim(), amount: Number(l.amount.replace(/,/g, '')) }));
  const total = sumLines(parsed.filter(l => l.label && Number.isFinite(l.amount)));
  const set = (i: number, patch: Partial<{ label: string; amount: string }>) => setLines(ls => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await submitCashierReport({ data: { reportDate: date, lines: parsed, notes } });
      setMessage({ ok: true, text: 'Report sent for approval.' });
      onSaved();
    } catch (err) {
      setMessage({ ok: false, text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className={`${card} space-y-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={h3}><Wallet className="h-4 w-4" /> Daily cash report</h3>
        <input type="date" value={date} max={today()} onChange={e => setDate(e.target.value)} className={`${input} w-auto`} aria-label="Report date" />
      </div>
      {existing && (
        <p className="text-[11px] text-brand-text-variant">
          This day already has a report: <StatusBadge status={existing.status} />
          {existing.status === 'returned' && existing.reviewNote ? ` — ${existing.reviewNote}` : ''}
          {locked ? ' It is approved and can no longer be changed.' : ' Saving replaces it.'}
        </p>
      )}
      <div className="space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="flex gap-2">
            <input value={l.label} onChange={e => set(i, { label: e.target.value })} placeholder="e.g. M-Pesa, NMB, Cash" className={input} disabled={locked} aria-label={`Line ${i + 1} label`} />
            <input value={l.amount} onChange={e => set(i, { amount: e.target.value })} placeholder="Amount" inputMode="numeric" className={`${input} w-40 text-right tabular-nums`} disabled={locked} aria-label={`Line ${i + 1} amount`} />
            <button type="button" onClick={() => setLines(ls => (ls.length > 1 ? ls.filter((_, j) => j !== i) : [{ label: '', amount: '' }]))} disabled={locked} className="rounded-lg px-2 text-brand-text-variant hover:bg-rose-50 hover:text-rose-600 cursor-pointer" aria-label={`Remove line ${i + 1}`}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => setLines(ls => [...ls, { label: '', amount: '' }])} disabled={locked} className="inline-flex items-center gap-1 text-xs font-bold text-brand-primary cursor-pointer">
          <Plus className="h-4 w-4" /> Add line
        </button>
        <p className="text-sm font-black tabular-nums text-brand-text">Total {tzs(total)}</p>
      </div>
      <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional) — e.g. attended by, balance before, deductions" rows={2} className={input} disabled={locked} />
      {message && <p className={`text-xs font-semibold ${message.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{message.text}</p>}
      <div className="flex justify-end">
        <button type="submit" disabled={busy || locked || total === 0} className={primaryBtn}>{busy ? 'Sending…' : 'Send for approval'}</button>
      </div>
    </form>
  );
}

/** The cashier records an expense paid from the cash, or income brought in for the company. */
export function CashierExpenseForm({ onSaved }: { onSaved: () => void }) {
  const [kind, setKind] = useState<CashierEntryKind>('expense');
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await addCashierExpense({ data: { kind, expenseDate: date, description, amount: Number(amount.replace(/,/g, '')) } });
      setDescription('');
      setAmount('');
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className={`${card} space-y-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={h3}><Receipt className="h-4 w-4" /> Record {kind === 'income' ? 'income' : 'an expense'}</h3>
        <div className="flex rounded-xl border border-brand-gray-border p-0.5 text-[11px] font-bold" role="group" aria-label="Entry type">
          {(['expense', 'income'] as const).map(k => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={`rounded-lg px-3 py-1 cursor-pointer ${kind === k ? (k === 'income' ? 'bg-emerald-600 text-white' : 'bg-brand-primary text-white') : 'text-brand-text-variant'}`}
            >
              {k === 'income' ? 'Income' : 'Expense'}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr_10rem]">
        <input type="date" value={date} max={today()} onChange={e => setDate(e.target.value)} className={input} aria-label="Date" />
        <input value={description} onChange={e => setDescription(e.target.value)} placeholder={kind === 'income' ? 'Where it came from, e.g. commission' : 'What was paid, e.g. CCM rent'} className={input} required />
        <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount" inputMode="numeric" className={`${input} text-right tabular-nums`} required />
      </div>
      {error && <p className="text-xs font-semibold text-rose-700">{error}</p>}
      <div className="flex justify-end">
        <button type="submit" disabled={busy} className={primaryBtn}>{busy ? 'Saving…' : kind === 'income' ? 'Add income' : 'Add expense'}</button>
      </div>
    </form>
  );
}

/** The month's reports, expenses and income; staff approve or return reports. */
export function CashierHistory({ month, mode, onChanged }: { month: CashierMonthView; mode: 'cashier' | 'staff'; onChanged: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const act = async (key: string, work: () => Promise<unknown>) => {
    setBusy(key);
    setError('');
    try {
      await work();
      onChanged();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  };
  const review = (r: CashierReport, decision: 'approved' | 'returned') => {
    const note = decision === 'returned' ? window.prompt('Why is this report returned? The cashier will see this.') : '';
    if (decision === 'returned' && !note?.trim()) return;
    void act(r.reportId, () => reviewCashierReport({ data: { reportId: r.reportId, decision, note: note ?? '' } }));
  };

  return (
    <div className="space-y-3">
      {error && <p className="rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700">{error}</p>}
      <div className={card}>
        <h3 className={h3}>Daily reports · {monthLabel(month.period)}</h3>
        {month.reports.length === 0 ? (
          <p className="mt-3 text-xs text-brand-text-variant">No reports this month.</p>
        ) : (
          <ul className="mt-3 divide-y divide-brand-gray-border">
            {month.reports.map(r => (
              <li key={r.reportId} className="py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => setOpen(open === r.reportId ? null : r.reportId)} className="flex-1 text-left cursor-pointer">
                    <span className="text-xs font-bold text-brand-text">{formatDate(`${r.reportDate}T00:00:00`)}</span>
                    <span className="ml-2 text-xs font-bold tabular-nums text-brand-text">{tzs(r.total)}</span>
                    <span className="ml-2"><StatusBadge status={r.status} /></span>
                  </button>
                  {mode === 'staff' && r.status === 'submitted' && (
                    <span className="flex gap-1.5">
                      <button type="button" disabled={busy === r.reportId} onClick={() => review(r, 'approved')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 cursor-pointer">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                      </button>
                      <button type="button" disabled={busy === r.reportId} onClick={() => review(r, 'returned')} className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-2.5 py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-50 cursor-pointer">
                        <RotateCcw className="h-3.5 w-3.5" /> Return
                      </button>
                    </span>
                  )}
                </div>
                {r.status === 'returned' && r.reviewNote && <p className="mt-1 text-[11px] text-rose-700">Returned: {r.reviewNote}</p>}
                {open === r.reportId && (
                  <div className="mt-2 rounded-xl bg-brand-gray-hover/40 p-3">
                    <table className="w-full text-xs">
                      <tbody>
                        {r.lines.map((l, i) => (
                          <tr key={i}>
                            <td className="py-0.5 text-brand-text">{l.label}</td>
                            <td className="py-0.5 text-right tabular-nums text-brand-text">{tzs(l.amount)}</td>
                          </tr>
                        ))}
                        <tr className="border-t border-brand-gray-border font-bold">
                          <td className="pt-1">Total</td>
                          <td className="pt-1 text-right tabular-nums">{tzs(r.total)}</td>
                        </tr>
                      </tbody>
                    </table>
                    {r.notes && <p className="mt-2 whitespace-pre-wrap text-[11px] text-brand-text-variant">{r.notes}</p>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className={card}>
        <h3 className={h3}>Expenses &amp; income · {monthLabel(month.period)}</h3>
        {month.expenses.length === 0 ? (
          <p className="mt-3 text-xs text-brand-text-variant">No expenses or income this month.</p>
        ) : (
          <ul className="mt-3 divide-y divide-brand-gray-border">
            {month.expenses.map(e => (
              <li key={e.expenseId} className="flex flex-wrap items-center gap-2 py-2 text-xs">
                <span className="w-24 text-brand-text-variant">{formatDate(`${e.expenseDate}T00:00:00`)}</span>
                <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${e.kind === 'income' ? 'bg-emerald-50 text-emerald-700' : 'bg-brand-gray-hover text-brand-text-variant'}`}>
                  {e.kind === 'income' ? 'Income' : 'Expense'}
                </span>
                <span className="flex-1 text-brand-text">{e.description}</span>
                <span className={`font-bold tabular-nums ${e.kind === 'income' ? 'text-emerald-700' : 'text-brand-text'}`}>{tzs(e.amount)}</span>
                <StatusBadge status={e.status} />
                {e.status !== 'approved' && (
                  <button
                    type="button"
                    disabled={busy === e.expenseId}
                    onClick={() => { if (window.confirm(`Remove this ${e.kind === 'income' ? 'income' : 'expense'}?`)) void act(e.expenseId, () => deleteCashierExpense({ data: { expenseId: e.expenseId } })); }}
                    className="rounded-lg p-1 text-brand-text-variant hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
                    aria-label={`Remove ${e.kind === 'income' ? 'income' : 'expense'}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[10px] text-brand-text-variant">Expenses and income are approved or returned together with that day's report.</p>
      </div>
    </div>
  );
}

/** Staff: the month's capital, volume target and what the cashier returned. */
export function CashierSettingsForm({ month, onSaved }: { month: CashierMonthView; onSaved: () => void }) {
  const s = month.settings;
  const shown = (v: number | null | undefined) => (v == null ? '' : v.toLocaleString());
  const [capital, setCapital] = useState(shown(s?.capital));
  const [target, setTarget] = useState(shown(s?.volumeTarget));
  const [returned, setReturned] = useState(shown(s?.returnedAmount));
  const [notes, setNotes] = useState(s?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const n = (v: string) => Number(v.replace(/,/g, '') || 0);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await saveCashierMonthSettings({
        data: {
          personnelId: month.person.personnelId,
          period: month.period,
          capital: n(capital),
          volumeTarget: n(target),
          returnedAmount: returned.trim() === '' ? null : n(returned),
          notes,
        },
      });
      setMessage({ ok: true, text: 'Saved.' });
      onSaved();
    } catch (err) {
      setMessage({ ok: false, text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };
  const field = (label: string, value: string, set: (v: string) => void, placeholder: string) => (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase text-brand-text-variant">{label}</span>
      <input value={value} onChange={e => set(e.target.value)} placeholder={placeholder} inputMode="numeric" className={`${input} text-right tabular-nums`} />
    </label>
  );
  return (
    <form onSubmit={submit} className={`${card} space-y-3`}>
      <h3 className={h3}>Month settings · {monthLabel(month.period)}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {field('Capital given', capital, setCapital, '0')}
        {field('Volume target (Base + IOP)', target, setTarget, '0')}
        {field('Returned at month end', returned, setReturned, 'Not yet')}
      </div>
      <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2} className={input} />
      {message && <p className={`text-xs font-semibold ${message.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{message.text}</p>}
      <div className="flex justify-end">
        <button type="submit" disabled={busy} className={primaryBtn}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  );
}
