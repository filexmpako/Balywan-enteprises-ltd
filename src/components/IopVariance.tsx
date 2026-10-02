import IopLabel, { type IopSource } from './IopLabel';

/** "September 2026" -> "Sep 2026"; ISO end date adds the month-to-date range ("1–28 Sep"). */
export function shortMonth(monthLabel: string, endDate?: string): string {
  const [name = '', year = ''] = String(monthLabel || '').split(' ');
  const mon = name.slice(0, 3);
  return endDate ? `1–${Number(endDate.slice(8, 10))} ${mon}` : `${mon} ${year}`.trim();
}

/**
 * Accumulated Daily MGT IOP shown beside the report's IOP, over the same
 * month-to-date window, with Δ = Daily − report: green when Daily is higher,
 * red when it is lower.
 */
export default function IopVariance({
  daily,
  report,
  reportKind,
  monthLabel,
  endDate,
}: {
  daily: number;
  report: number;
  reportKind: IopSource;
  monthLabel: string;
  /** Last day (ISO) the report covers; omitted = the whole month. */
  endDate?: string;
}) {
  const diff = daily - report;
  const sign = diff > 0 ? '+' : diff < 0 ? '−' : '';
  const tone = diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-rose-600' : 'text-slate-500';
  return (
    <div className="space-y-1 border-t border-slate-100 pt-2 font-sans text-xs">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10px] font-bold uppercase tracking-wider text-brand-text-variant">
          <IopLabel source="daily" /> <span className="normal-case font-semibold">{shortMonth(monthLabel, endDate)}</span>
        </span>
        <span className="font-black text-brand-text">TZS {daily.toLocaleString()}</span>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10px] font-bold uppercase tracking-wider text-brand-text-variant">
          Δ Daily − {reportKind === 'monthly' ? 'Monthly' : 'Weekly'}
        </span>
        <span className={`font-black ${tone}`}>
          {sign}TZS {Math.abs(diff).toLocaleString()}
        </span>
      </div>
    </div>
  );
}
