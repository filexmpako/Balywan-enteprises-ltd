import IopLabel, { type IopSource } from './IopLabel';

/**
 * Daily MGT IOP minus the report's IOP over the same month-to-date window:
 * positive (green) when Daily IOP is higher, negative (red) when it is lower.
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
  const windowLabel = endDate ? `1–${Number(endDate.slice(8, 10))} ${monthLabel}` : monthLabel;
  const diff = daily - report;
  const sign = diff > 0 ? '+' : diff < 0 ? '−' : '';
  const tone = diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-rose-600' : 'text-slate-500';
  return (
    <div className="border-t border-slate-100 pt-2 font-sans">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-brand-text-variant">
          <IopLabel source="daily" /> − <IopLabel source={reportKind} />
        </span>
        <span className={`text-sm font-black ${tone}`}>
          {sign}TZS {Math.abs(diff).toLocaleString()}
        </span>
      </div>
      <p className="mt-0.5 text-[10px] text-slate-500">
        Daily IOP {windowLabel}: TZS {daily.toLocaleString()}
      </p>
    </div>
  );
}
