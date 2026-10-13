import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Banknote, CalendarDays, Users } from 'lucide-react';
import type { ClassifiedRow } from '../utils/classification';
import { formatToISODate } from '../utils/mappingEngine';
import { toIsoPeriod } from '../utils/periodUtils';
import { formatDate } from '../utils/dateFormat';

interface DailyMgtSummaryProps {
  /** Classified Daily MGT rows (any months; cut to `period` here). */
  classified: ClassifiedRow[];
  /** Reporting month, ISO "YYYY-MM" or a label. */
  period: string;
  /** Only this owner's BASE / IOP transactions (owner portal); all when omitted. */
  ownerId?: string;
  periodLabel?: string;
}

interface BucketStats {
  volume: number;
  wakala: number;
  txns: number;
}

const rowDate = (cr: ClassifiedRow) =>
  formatToISODate(String(cr.row['Servicing Date'] || cr.row['date'] || cr.row['Date'] || cr.row['Timestamp'] || ''));

function statsFor(rows: ClassifiedRow[]): BucketStats {
  const wakala = new Set<string>();
  let volume = 0;
  for (const cr of rows) {
    volume += cr.auditRecord?.amount || 0;
    const m = cr.auditRecord?.normalizedMsisdn;
    if (m) wakala.add(m);
  }
  return { volume, wakala: wakala.size, txns: rows.length };
}

/** Base vs IOP colours (validated pair: teal / purple, colour-blind safe). Purple matches the IOP cards. */
const SERIES = { base: '#0d9488', iop: '#7c3aed' } as const;
/** Segment accents (decoration only — the data colours are SERIES). */
const ACCENTS = {
  volume: { bar: '#2563eb', chipBg: 'bg-blue-50', chipText: 'text-blue-700', title: 'text-blue-800' },
  wakala: { bar: '#d97706', chipBg: 'bg-amber-50', chipText: 'text-amber-700', title: 'text-amber-800' },
  txns: { bar: '#db2777', chipBg: 'bg-pink-50', chipText: 'text-pink-700', title: 'text-pink-800' },
} as const;

type Pair = { base: BucketStats; iop: BucketStats };
interface Segment {
  key: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: (typeof ACCENTS)[keyof typeof ACCENTS];
  pick: (s: BucketStats) => number;
  fmt: (n: number) => string;
}

function Swatch({ color }: { color: string }) {
  return <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} aria-hidden />;
}

/** Base | IOP share of one figure: two segments with a 2px gap, labelled on hover. */
function SplitBar({ base, iop, fmt, label }: { base: number; iop: number; fmt: (n: number) => string; label: string }) {
  const total = base + iop;
  if (total <= 0) return <div className="h-2 rounded bg-slate-100" aria-hidden />;
  const basePct = (base / total) * 100;
  const pct = (n: number) => `${Math.round((n / total) * 100)}%`;
  return (
    <div className="flex h-2 w-full gap-[2px]" role="img" aria-label={`${label}: Base ${pct(base)}, IOP ${pct(iop)}`}>
      {base > 0 && (
        <div className="h-full rounded" style={{ width: `${basePct}%`, backgroundColor: SERIES.base }} title={`Base ${pct(base)} · ${fmt(base)}`} />
      )}
      {iop > 0 && (
        <div className="h-full rounded" style={{ width: `${100 - basePct}%`, backgroundColor: SERIES.iop }} title={`IOP ${pct(iop)} · ${fmt(iop)}`} />
      )}
    </div>
  );
}

function SegmentCard({ seg, dayLabel, day, mtd }: { seg: Segment; dayLabel: string; day: Pair; mtd: Pair }) {
  const Icon = seg.icon;
  const rows: { label: string; color?: string; get: (p: Pair) => number; strong?: boolean }[] = [
    { label: 'Base', color: SERIES.base, get: p => seg.pick(p.base) },
    { label: 'IOP', color: SERIES.iop, get: p => seg.pick(p.iop) },
    { label: 'Total', get: p => seg.pick(p.base) + seg.pick(p.iop), strong: true },
  ];
  return (
    <div className="h-full overflow-hidden rounded-2xl border border-brand-gray-border bg-brand-card shadow-ambient">
      <div className="h-1" style={{ backgroundColor: seg.accent.bar }} />
      <div className="h-full space-y-3 p-4">
        <div className="flex items-center gap-2">
          <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${seg.accent.chipBg} ${seg.accent.chipText}`}>
            <Icon className="h-4 w-4" />
          </span>
          <h4 className={`font-sans text-xs font-black uppercase tracking-wider ${seg.accent.title}`}>{seg.title}</h4>
        </div>
        <table className="w-full font-sans text-xs">
          <thead>
            <tr className="text-[10px] font-black uppercase tracking-wider text-brand-text-variant">
              <th className="pb-1.5 text-left font-black" />
              <th className="pb-1.5 text-right font-black">{dayLabel}</th>
              <th className="pb-1.5 text-right font-black">Month to date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.label} className={`border-t border-slate-100 ${r.strong ? 'font-black' : ''} text-brand-text`}>
                <td className="py-1.5 align-middle">
                  <span className={`inline-flex items-center gap-1.5 ${r.strong ? 'font-black' : 'font-semibold text-brand-text-variant'}`}>
                    {r.color ? <Swatch color={r.color} /> : <span className="inline-block h-2.5 w-2.5" aria-hidden />}
                    {r.label}
                  </span>
                </td>
                <td className="whitespace-nowrap py-1.5 pl-3 text-right align-middle tabular-nums"><span className="inline-flex items-center">{seg.fmt(r.get(day))}</span></td>
                <td className="whitespace-nowrap py-1.5 pl-3 text-right align-middle tabular-nums"><span className="inline-flex items-center">{seg.fmt(r.get(mtd))}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="grid grid-cols-2 gap-3 pt-0.5">
          <div className="space-y-1">
            <p className="font-sans text-[10px] font-bold uppercase tracking-wider text-brand-text-variant">Day split</p>
            <SplitBar base={seg.pick(day.base)} iop={seg.pick(day.iop)} fmt={seg.fmt} label={`${seg.title} ${dayLabel}`} />
          </div>
          <div className="space-y-1">
            <p className="font-sans text-[10px] font-bold uppercase tracking-wider text-brand-text-variant">Month split</p>
            <SplitBar base={seg.pick(mtd.base)} iop={seg.pick(mtd.iop)} fmt={seg.fmt} label={`${seg.title} month to date`} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Daily MGT summary: Base and IOP volume, unique wakala served and
 * transaction count, for a picked day and month-to-date up to that day.
 * SA-internal transfers are left out (they are not wakala servicing).
 */
export default function DailyMgtSummary({ classified, period, ownerId, periodLabel }: DailyMgtSummaryProps) {
  const iso = toIsoPeriod(period);

  const monthRows = useMemo(
    () =>
      classified
        .map(cr => ({ cr, date: rowDate(cr) }))
        .filter(
          ({ cr, date }) =>
            date.slice(0, 7) === iso &&
            (cr.bucket === 'BASE' || cr.bucket === 'IOP') &&
            (!ownerId || cr.auditRecord?.ownerId === ownerId)
        ),
    [classified, iso, ownerId]
  );
  const dates = useMemo(() => Array.from(new Set(monthRows.map(r => r.date))).sort(), [monthRows]);

  const [picked, setPicked] = useState('');
  const day = dates.includes(picked) ? picked : dates[dates.length - 1] || '';
  useEffect(() => {
    if (picked && !dates.includes(picked)) setPicked('');
  }, [dates, picked]);

  const summary = useMemo(() => {
    const pick = (match: (date: string) => boolean, bucket: 'BASE' | 'IOP') =>
      statsFor(monthRows.filter(r => r.cr.bucket === bucket && match(r.date)).map(r => r.cr));
    const isDay = (d: string) => d === day;
    const toDay = (d: string) => d <= day;
    return {
      day: { base: pick(isDay, 'BASE'), iop: pick(isDay, 'IOP') },
      mtd: { base: pick(toDay, 'BASE'), iop: pick(toDay, 'IOP') },
    };
  }, [monthRows, day]);

  const tzs = (n: number) => `TZS ${Math.round(n).toLocaleString()}`;
  const num = (n: number) => n.toLocaleString();
  const segments: Segment[] = [
    { key: 'volume', title: 'Volume', icon: Banknote, accent: ACCENTS.volume, pick: s => s.volume, fmt: tzs },
    { key: 'wakala', title: 'Unique Wakala', icon: Users, accent: ACCENTS.wakala, pick: s => s.wakala, fmt: num },
    { key: 'txns', title: 'Transactions', icon: Activity, accent: ACCENTS.txns, pick: s => s.txns, fmt: num },
  ];

  return (
    <div className="space-y-2" id="daily-mgt-summary">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-brand-primary" />
          <h3 className="font-sans text-xs font-black uppercase tracking-wider text-brand-primary">Daily MGT Summary</h3>
        </div>
        {dates.length > 0 && (
          <select
            value={day}
            onChange={e => setPicked(e.target.value)}
            aria-label="Day"
            className="rounded-lg border border-brand-gray-border bg-white px-2 py-1 font-sans text-xs font-bold text-brand-text focus:outline-none focus:border-brand-primary"
          >
            {[...dates].reverse().map(d => (
              <option key={d} value={d}>{formatDate(d)}</option>
            ))}
          </select>
        )}
      </div>

      {dates.length === 0 ? (
        <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-4 shadow-ambient">
          <p className="font-sans text-sm text-brand-text-variant">No Daily MGT for {periodLabel || iso}.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4 px-1 font-sans text-[11px] font-bold text-brand-text-variant">
            <span className="inline-flex items-center gap-1.5"><Swatch color={SERIES.base} /> Base</span>
            <span className="inline-flex items-center gap-1.5"><Swatch color={SERIES.iop} /> IOP</span>
          </div>
          {/* Volume (long TZS figures) gets the full width; the two counts sit side by side. */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {segments.map(seg => (
              <div key={seg.key} className={seg.key === 'volume' ? 'lg:col-span-2' : ''}>
                <SegmentCard seg={seg} dayLabel={formatDate(day)} day={summary.day} mtd={summary.mtd} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
