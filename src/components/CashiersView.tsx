import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Wallet } from 'lucide-react';
import { fetchCashierBoard } from '../lib/cashier.functions';
import type { CashierMonthView } from '../utils/cashier';
import { useReportingPeriod } from './ReportingPeriodContext';
import {
  CashierHistory, CashierSettingsForm, CashierSummary, MonthSelect, SetupNotice, monthLabel, recentMonths, signedTzs, tzs, useCashierMonth,
} from './CashierPanels';
import { CashierStatementButton } from './CashierStatement';

function CashierDetail({ personnelId, period, onBack, onChanged }: { personnelId: string; period: string; onBack: () => void; onChanged: () => void }) {
  const { state, reload } = useCashierMonth(period, personnelId);
  const changed = () => { reload(); onChanged(); };
  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs font-bold text-brand-primary cursor-pointer">
        <ArrowLeft className="h-4 w-4" /> All cashiers
      </button>
      {state.status === 'loading' && <p className="text-xs text-brand-text-variant">Loading…</p>}
      {state.status === 'setup' && <SetupNotice />}
      {state.status === 'error' && <p className="rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700">{state.error}</p>}
      {state.status === 'ready' && (
        <>
          <div>
            <h2 className="text-lg font-black text-brand-text">{state.month.person.name}</h2>
            <p className="text-xs text-brand-text-variant">{[state.month.person.title, state.month.person.location].filter(Boolean).join(' · ')}</p>
          </div>
          <CashierSummary month={state.month} />
          <CashierSettingsForm key={`${personnelId}|${period}`} month={state.month} onSaved={changed} />
          <CashierHistory month={state.month} mode="staff" onChanged={changed} />
          <footer className="flex justify-center pt-2 pb-4">
            <CashierStatementButton personnelId={personnelId} />
          </footer>
        </>
      )}
    </div>
  );
}

/**
 * Staff: every cashier's month (capital, cash held, expenses, profit, volume
 * vs target), approval of daily reports, and the month's settings.
 */
export default function CashiersView() {
  const { currentPeriod } = useReportingPeriod();
  const months = recentMonths();
  const [period, setPeriod] = useState(currentPeriod);
  const [selected, setSelected] = useState<string | null>(null);
  const [board, setBoard] = useState<{ status: 'loading' } | { status: 'setup' } | { status: 'error'; error: string } | { status: 'ready'; months: CashierMonthView[] }>({ status: 'loading' });
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion(v => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetchCashierBoard({ data: { period } })
      .then(r => { if (!cancelled) setBoard(r.setupRequired ? { status: 'setup' } : { status: 'ready', months: r.months as CashierMonthView[] }); })
      .catch(err => { if (!cancelled) setBoard({ status: 'error', error: err instanceof Error ? err.message : String(err) }); });
    return () => { cancelled = true; };
  }, [period, version]);

  const th = 'px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-brand-text-variant whitespace-nowrap';
  const td = 'px-3 py-2.5 text-xs tabular-nums whitespace-nowrap';

  return (
    <div className="mx-auto max-w-[1440px] space-y-4 p-4 sm:p-6 lg:p-8 font-sans">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><Wallet className="h-5 w-5" /></div>
          <div>
            <h1 className="text-lg font-black text-brand-text">Cashiers</h1>
            <p className="text-xs text-brand-text-variant">Daily cash reports, expenses and volume vs target · {monthLabel(period)}</p>
          </div>
        </div>
        <MonthSelect value={period} onChange={p => { setPeriod(p); }} months={months} />
      </div>

      {selected ? (
        <CashierDetail personnelId={selected} period={period} onBack={() => setSelected(null)} onChanged={refresh} />
      ) : board.status === 'loading' ? (
        <p className="text-xs text-brand-text-variant">Loading cashiers…</p>
      ) : board.status === 'setup' ? (
        <SetupNotice />
      ) : board.status === 'error' ? (
        <p className="rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700">{board.error}</p>
      ) : board.months.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-brand-gray-border bg-brand-card p-4 text-xs text-brand-text-variant">
          No cashiers yet. Give a personnel profile the title CASHIER, or create a Cashier login for it in People Management → Users.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-brand-gray-border bg-brand-card">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="border-b border-brand-gray-border bg-brand-gray-hover/40">
                <th className={th}>Cashier</th>
                <th className={`${th} text-right`}>Served (Base + IOP)</th>
                <th className={`${th} text-right`}>Target</th>
                <th className={`${th} text-right`}>Capital</th>
                <th className={`${th} text-right`}>Cash held</th>
                <th className={`${th} text-right`}>Expenses</th>
                <th className={`${th} text-right`}>Income</th>
                <th className={`${th} text-right`}>Profit</th>
                <th className={th}>Reports</th>
              </tr>
            </thead>
            <tbody>
              {board.months.map(m => {
                const s = m.summary;
                return (
                  <tr key={m.person.personnelId} onClick={() => setSelected(m.person.personnelId)} className="cursor-pointer border-b border-brand-gray-border/50 hover:bg-brand-primary/5">
                    <td className="px-3 py-2.5">
                      <p className="text-xs font-bold text-brand-text">{m.person.name}</p>
                      <p className="text-[10px] text-brand-text-variant">
                        {m.person.till || 'no till'} · {m.person.hasAccount ? 'has login' : 'no login yet'}
                      </p>
                    </td>
                    <td className={`${td} text-right font-bold text-brand-text`}>{tzs(s.served)}</td>
                    <td className={`${td} text-right text-brand-text-variant`}>
                      {s.volumeTarget ? `${tzs(s.volumeTarget)} · ${Math.round(s.progress * 100)}%` : '—'}
                    </td>
                    <td className={`${td} text-right text-brand-text`}>{tzs(s.capital)}</td>
                    <td className={`${td} text-right text-brand-text`}>{tzs(s.held)}</td>
                    <td className={`${td} text-right text-brand-text`}>{tzs(s.expenses)}</td>
                    <td className={`${td} text-right text-emerald-700`}>{tzs(s.income)}</td>
                    <td className={`${td} text-right font-bold ${s.profit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{signedTzs(s.profit)}</td>
                    <td className={td}>
                      {s.pendingReports > 0
                        ? <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">{s.pendingReports} to approve</span>
                        : <span className="text-[11px] text-brand-text-variant">{m.reports.length} this month</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
