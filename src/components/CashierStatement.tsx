import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Printer, X } from 'lucide-react';
import { fetchCashierStatement } from '../lib/cashier.functions';
import { cashierActivities, totalCashierStatement, type CashierStatementView } from '../utils/cashier';
import { formatDate, formatDateTime } from '../utils/dateFormat';
import { useAuth } from './AuthContext';
import { useCompany } from './CompanyContext';
import { SetupNotice, monthLabel, signedTzs, tzs } from './CashierPanels';

const PRINT_ROOT_ID = 'cashier-statement-print';
const day = (iso: string) => formatDate(`${iso.slice(0, 10)}T00:00:00`);

/** Months from `first` to `last` (YYYY-MM), newest first. */
function monthRange(first: string, last: string): string[] {
  const out: string[] = [];
  let [y, m] = last.split('-').map(Number);
  for (let i = 0; i < 24; i++) {
    const p = `${y}-${String(m).padStart(2, '0')}`;
    out.push(p);
    if (p <= first) break;
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  return out;
}

const STATUS: Record<string, string> = { submitted: 'Waiting approval', approved: 'Approved', returned: 'Returned' };

function Statement({ statement, printedBy }: { statement: CashierStatementView; printedBy: string }) {
  const { companyName } = useCompany();
  const totals = useMemo(() => totalCashierStatement(statement.months), [statement]);
  const activities = useMemo(() => cashierActivities(statement.months), [statement]);
  const p = statement.person;
  const th = 'border-b border-slate-300 px-2 py-1.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-600 print:px-1 print:text-[8px]';
  const td = 'border-b border-slate-200 px-2 py-1.5 text-[11px] text-slate-900 print:px-1 print:text-[9px]';
  const num = `${td} text-right tabular-nums whitespace-nowrap`;
  return (
    <article className="mx-auto max-w-[900px] bg-white p-6 text-slate-900 sm:p-8 print:max-w-none print:p-0">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-slate-900 pb-4">
        <div>
          <p className="text-lg font-black uppercase tracking-tight">{companyName}</p>
          <p className="text-sm font-bold">Cashier statement</p>
        </div>
        <div className="text-right text-[11px] leading-5">
          <p><span className="text-slate-500">Period:</span> <b>{monthLabel(statement.fromPeriod)}</b> to <b>{day(statement.toDate)}</b></p>
          <p><span className="text-slate-500">Printed:</span> {formatDateTime(new Date())}</p>
          <p><span className="text-slate-500">By:</span> {printedBy}</p>
        </div>
      </header>

      <section className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-[12px] sm:grid-cols-4">
        <p><span className="text-slate-500">Cashier</span><br /><b>{p.name}</b></p>
        <p><span className="text-slate-500">Title</span><br />{p.title || '—'}</p>
        <p><span className="text-slate-500">Location</span><br />{p.location || '—'}</p>
        <p><span className="text-slate-500">Till</span><br /><span className="font-mono">{p.till || '—'}</span></p>
      </section>

      <section className="mt-5">
        <h2 className="text-xs font-black uppercase tracking-wider">Summary</h2>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([
            ['Capital given', tzs(totals.capital)],
            ['Capital returned', tzs(totals.returned)],
            ['Expenses', tzs(totals.expenses)],
            ['Income', tzs(totals.income)],
            ['Profit', signedTzs(totals.profit)],
            ['Base volume', tzs(totals.base)],
            ['IOP volume', tzs(totals.iop)],
            ['Internal', tzs(totals.internal)],
          ] as const).map(([label, value]) => (
            <div key={label} className="rounded-lg border border-slate-300 px-3 py-2">
              <p className="text-[10px] font-bold uppercase text-slate-500">{label}</p>
              <p className="text-sm font-black tabular-nums">{value}</p>
            </div>
          ))}
        </div>
        <p className="mt-1.5 text-[10px] text-slate-500">
          Profit each month = cash held (latest daily report) + expenses + income − capital. Returned reports and entries are not counted.
        </p>
      </section>

      <section className="mt-5 break-inside-avoid">
        <h2 className="text-xs font-black uppercase tracking-wider">By month</h2>
        <div className="mt-2 overflow-x-auto print:overflow-visible">
          <table className="w-full min-w-[640px] border-collapse print:min-w-0">
            <thead>
              <tr>
                <th className={th}>Month</th>
                <th className={`${th} text-right`}>Capital</th>
                <th className={`${th} text-right`}>Served (Base + IOP)</th>
                <th className={`${th} text-right`}>Target</th>
                <th className={`${th} text-right`}>Cash held</th>
                <th className={`${th} text-right`}>Expenses</th>
                <th className={`${th} text-right`}>Income</th>
                <th className={`${th} text-right`}>Profit</th>
              </tr>
            </thead>
            <tbody>
              {statement.months.map(m => (
                <tr key={m.period}>
                  <td className={`${td} whitespace-nowrap`}>{monthLabel(m.period)}</td>
                  <td className={num}>{tzs(m.summary.capital)}</td>
                  <td className={num}>{tzs(m.summary.served)}</td>
                  <td className={num}>{m.summary.volumeTarget ? `${tzs(m.summary.volumeTarget)} (${Math.round(m.summary.progress * 100)}%)` : '—'}</td>
                  <td className={num}>{tzs(m.summary.held)}</td>
                  <td className={num}>{tzs(m.summary.expenses)}</td>
                  <td className={num}>{tzs(m.summary.income)}</td>
                  <td className={`${num} font-bold`}>{signedTzs(m.summary.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-5">
        <h2 className="text-xs font-black uppercase tracking-wider">All activity ({activities.length})</h2>
        {activities.length === 0 ? (
          <p className="mt-2 text-[11px] text-slate-500">No activity in this period.</p>
        ) : (
          <div className="mt-2 overflow-x-auto print:overflow-visible">
            <table className="w-full min-w-[640px] border-collapse print:min-w-0">
              <thead>
                <tr>
                  <th className={th}>Date</th>
                  <th className={th}>Type</th>
                  <th className={th}>Details</th>
                  <th className={`${th} text-right`}>Amount</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {activities.map((a, i) => (
                  <tr key={i} className="break-inside-avoid">
                    <td className={`${td} whitespace-nowrap`}>{day(a.date)}</td>
                    <td className={`${td} whitespace-nowrap font-semibold`}>{a.type}</td>
                    <td className={td}>{a.description}</td>
                    <td className={num}>{tzs(a.amount)}</td>
                    <td className={`${td} whitespace-nowrap`}>{a.status ? STATUS[a.status] : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer className="mt-10 grid grid-cols-2 gap-10 text-[11px] break-inside-avoid">
        <div><div className="h-10 border-b border-slate-400" /><p className="mt-1 text-slate-600">Cashier signature</p></div>
        <div><div className="h-10 border-b border-slate-400" /><p className="mt-1 text-slate-600">Checked by (admin / float manager)</p></div>
      </footer>
    </article>
  );
}

/**
 * The cashier's statement: everything from the first record (or a chosen
 * month) up to today, printable or saved as PDF from the print dialog.
 */
function StatementOverlay({ personnelId, onClose }: { personnelId?: string; onClose: () => void }) {
  const { user } = useAuth();
  const [fromPeriod, setFromPeriod] = useState<string | undefined>(undefined);
  const [state, setState] = useState<{ status: 'loading' } | { status: 'setup' } | { status: 'error'; error: string } | { status: 'ready'; statement: CashierStatementView }>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    fetchCashierStatement({ data: { personnelId, fromPeriod } })
      .then(r => { if (!cancelled) setState(r.setupRequired || !r.statement ? { status: 'setup' } : { status: 'ready', statement: r.statement as CashierStatementView }); })
      .catch(err => { if (!cancelled) setState({ status: 'error', error: err instanceof Error ? err.message : String(err) }); });
    return () => { cancelled = true; };
  }, [personnelId, fromPeriod]);

  // Printing shows only the statement.
  useEffect(() => {
    document.body.classList.add('printing-statement');
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('printing-statement');
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const ready = state.status === 'ready' ? state.statement : null;
  const months = ready ? monthRange(ready.firstPeriod, ready.toDate.slice(0, 7)) : [];

  return createPortal(
    <div id={PRINT_ROOT_ID} role="dialog" aria-modal="true" aria-label="Cashier statement" className="fixed inset-0 z-[100] overflow-y-auto bg-slate-900/60 font-sans">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-[900px] flex-wrap items-center gap-2 px-4 py-3">
          <FileText className="h-5 w-5 text-brand-primary" />
          <p className="flex-1 text-sm font-black text-slate-900">Statement</p>
          {ready && (
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
              From
              <select
                value={ready.fromPeriod}
                onChange={e => setFromPeriod(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-bold text-slate-900 cursor-pointer"
              >
                {months.map(m => <option key={m} value={m}>{monthLabel(m)}{m === ready.firstPeriod ? ' (first record)' : ''}</option>)}
              </select>
            </label>
          )}
          <button type="button" disabled={!ready} onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-xl bg-brand-primary px-3.5 py-2 text-xs font-bold text-white disabled:opacity-50 cursor-pointer">
            <Printer className="h-4 w-4" /> Print / Save PDF
          </button>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 cursor-pointer" aria-label="Close statement">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="mx-auto my-4 max-w-[900px] px-2 sm:px-4 print:m-0 print:p-0">
        {state.status === 'loading' && <p className="rounded-xl bg-white p-4 text-xs text-slate-600">Preparing the statement…</p>}
        {state.status === 'setup' && <SetupNotice />}
        {state.status === 'error' && <p className="rounded-xl bg-rose-50 p-4 text-xs font-semibold text-rose-700">{state.error}</p>}
        {ready && <div className="rounded-xl shadow-xl print:shadow-none"><Statement statement={ready} printedBy={user?.name || 'Unknown'} /></div>}
      </div>
    </div>,
    document.body,
  );
}

/** "Statement" button: opens the printable statement for the cashier (their own, or `personnelId` for staff). */
export function CashierStatementButton({ personnelId }: { personnelId?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-brand-gray-border bg-brand-card px-3 py-2 text-xs font-bold text-brand-text hover:border-brand-primary cursor-pointer"
      >
        <FileText className="h-4 w-4" /> Statement
      </button>
      {open && <StatementOverlay personnelId={personnelId} onClose={() => setOpen(false)} />}
    </>
  );
}
