import { useEffect, useState } from 'react';
import { Loader2, RefreshCcw } from 'lucide-react';
import { readLastResync, resyncReports, RESYNC_DONE_EVENT, type ResyncResult } from '../utils/reportResync';
import { formatDateTime } from '../utils/dateFormat';

/**
 * Re-attributes reports already uploaded to today's owners, tills and Base
 * Wakala Index. Also runs on its own after those lists change; the button is
 * for running it on demand.
 */
export default function ReportResyncPanel() {
  const [last, setLast] = useState<ResyncResult | null>(() => readLastResync());
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setLast(readLastResync());
    window.addEventListener(RESYNC_DONE_EVENT, update);
    return () => window.removeEventListener(RESYNC_DONE_EVENT, update);
  }, []);

  const run = async () => {
    setError(null);
    setProgress('Starting…');
    try {
      setLast(await resyncReports(setProgress));
    } catch (e: any) {
      setError(`Resync failed: ${e?.message || 'unknown error'}. Please try again.`);
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-brand-gray-border bg-brand-card p-4 shadow-ambient sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <p className="font-sans text-sm font-bold text-brand-text">Resync uploaded reports</p>
        <p className="font-sans text-xs text-brand-text-variant">
          Re-applies today's owners, tills and Base Wakala Index to the Daily MGT transactions and priority wakala
          already uploaded — no re-upload needed. Runs on its own after those lists change.
        </p>
        {last && !progress && (
          <p className="font-sans text-xs font-semibold text-brand-text-variant">
            Last run {formatDateTime(last.at)}: {last.transactionsUpdated.toLocaleString()} of{' '}
            {last.transactionsChecked.toLocaleString()} transactions and {last.priorityUpdated.toLocaleString()} of{' '}
            {last.priorityChecked.toLocaleString()} priority wakala updated.
          </p>
        )}
        {progress && <p className="font-sans text-xs font-semibold text-brand-primary">Resyncing {progress}</p>}
        {error && <p className="font-sans text-xs font-semibold text-rose-700">{error}</p>}
      </div>
      <button
        onClick={run}
        disabled={!!progress}
        className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-brand-gray-border bg-white px-4 py-2.5 text-xs font-bold text-brand-primary transition-all hover:bg-brand-gray-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {progress ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
        {progress ? 'Resyncing…' : 'Resync now'}
      </button>
    </div>
  );
}
