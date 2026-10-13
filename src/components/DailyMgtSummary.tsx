import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
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
  const lines: { label: string; get: (s: { base: BucketStats; iop: BucketStats }) => string; strong?: boolean }[] = [
    { label: 'Base volume', get: s => tzs(s.base.volume) },
    { label: 'IOP volume', get: s => tzs(s.iop.volume) },
    { label: 'Total volume', get: s => tzs(s.base.volume + s.iop.volume), strong: true },
    { label: 'Unique Base wakala', get: s => num(s.base.wakala) },
    { label: 'Unique IOP wakala', get: s => num(s.iop.wakala) },
    { label: 'Base txns', get: s => num(s.base.txns) },
    { label: 'IOP txns', get: s => num(s.iop.txns) },
    { label: 'Total txns', get: s => num(s.base.txns + s.iop.txns), strong: true },
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

      <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-4 shadow-ambient">
        {dates.length === 0 ? (
          <p className="font-sans text-sm text-brand-text-variant">No Daily MGT for {periodLabel || iso}.</p>
        ) : (
          <table className="w-full font-sans text-xs">
            <thead>
              <tr className="text-[10px] font-black uppercase tracking-wider text-brand-text-variant">
                <th className="pb-2 text-left font-black"></th>
                <th className="pb-2 text-right font-black">{formatDate(day)}</th>
                <th className="pb-2 text-right font-black">Month to date</th>
              </tr>
            </thead>
            <tbody>
              {lines.map(l => (
                <tr key={l.label} className={`border-t border-slate-100 ${l.strong ? 'font-black text-brand-text' : 'text-brand-text'}`}>
                  <td className={`py-1.5 ${l.strong ? 'font-black' : 'font-semibold text-brand-text-variant'}`}>{l.label}</td>
                  <td className="py-1.5 text-right font-mono">{l.get(summary.day)}</td>
                  <td className="py-1.5 text-right font-mono">{l.get(summary.mtd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
