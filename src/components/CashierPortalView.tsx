import { useState } from 'react';
import { Power, Wallet } from 'lucide-react';
import { useAuth } from './AuthContext';
import { useCompany } from './CompanyContext';
import {
  CashierExpenseForm, CashierHistory, CashierReportForm, CashierSummary, MonthSelect, SetupNotice, recentMonths, useCashierMonth,
} from './CashierPanels';

/** The cashier's own page: volume vs target, daily cash report, expenses. */
export default function CashierPortalView({ onLogout }: { onLogout: () => void }) {
  const { user } = useAuth();
  const { companyName } = useCompany();
  const months = recentMonths();
  const [period, setPeriod] = useState(months[0]);
  const { state, reload } = useCashierMonth(period);

  return (
    <div className="min-h-screen bg-brand-bg font-sans">
      <header className="sticky top-0 z-10 border-b border-brand-gray-border bg-brand-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><Wallet className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-brand-text">{user?.name}</p>
            <p className="truncate text-[11px] text-brand-text-variant">Cashier · {companyName}</p>
          </div>
          <MonthSelect value={period} onChange={setPeriod} months={months} />
          <button type="button" onClick={onLogout} className="rounded-xl p-2 text-rose-600 hover:bg-rose-50 cursor-pointer" aria-label="Sign out">
            <Power className="h-5 w-5" />
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-4 px-4 py-5">
        {state.status === 'loading' && <p className="text-xs text-brand-text-variant">Loading your month…</p>}
        {state.status === 'setup' && <SetupNotice />}
        {state.status === 'error' && <p className="rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700">{state.error}</p>}
        {state.status === 'ready' && (
          <>
            <CashierSummary month={state.month} />
            {period === months[0] && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <CashierReportForm key={state.month.person.personnelId} month={state.month} onSaved={reload} />
                <CashierExpenseForm onSaved={reload} />
              </div>
            )}
            <CashierHistory month={state.month} mode="cashier" onChanged={reload} />
          </>
        )}
      </main>
    </div>
  );
}
