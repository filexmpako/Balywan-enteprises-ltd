import React, { useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { motion } from 'motion/react';
import { readWeeklyStatsHistory, refreshWeeklyStatsHistory } from '../utils/weeklyHistory';
import {
  ownerWeeklySeries,
  paceLabel,
  weekNumberOf,
  type WeeklyStatsEntry,
} from '../utils/weeklyKpiEngine';
import { formatNumberWithAbbreviation } from '../utils/numberFormat';

interface Props {
  ownerId: string;
  monthlyTarget: number;
  onLatestActivity?: (active: number, inactive: number) => void;
}

/**
 * Per-owner weekly checkpoints: this owner's slice of every uploaded weekly
 * workbook, accumulating toward their own monthly KPI 1 target.
 */
export default function OwnerWeeklyCheckpoints({ ownerId, monthlyTarget, onLatestActivity }: Props) {
  const [history, setHistory] = useState<WeeklyStatsEntry[]>(() => readWeeklyStatsHistory());

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      refreshWeeklyStatsHistory()
        .then(entries => {
          if (!cancelled) setHistory(entries);
        })
        .catch(err => console.error('Owner weekly checkpoints load failed:', err));
    };
    load();
    window.addEventListener('weekly-kpi-updated', load);
    return () => {
      cancelled = true;
      window.removeEventListener('weekly-kpi-updated', load);
    };
  }, []);

  const series = ownerWeeklySeries(history, ownerId);
  const latest = [...series].reverse().find(entry => entry.breakdown) || null;
  useEffect(() => {
    if (!latest?.breakdown || !onLatestActivity) return;
    const active = latest.breakdown.active ?? 0;
    const total = latest.breakdown.total ?? (active + (latest.breakdown.inactive ?? 0));
    onLatestActivity(active, Math.max(0, total - active));
  }, [latest?.reportingWeek, latest?.breakdown?.active, latest?.breakdown?.inactive, latest?.breakdown?.total, onLatestActivity]);
  if (!ownerId || history.length === 0 || !latest) return null;

  const progress = monthlyTarget > 0 ? (latest.cumulativeValue / monthlyTarget) * 100 : 0;
  const pace = paceLabel(progress, weekNumberOf(latest.reportingWeek) || series.length);
  const toneClass =
    pace.tone === 'ahead'
      ? 'bg-brand-success-container/40 text-brand-success'
      : pace.tone === 'ontrack'
        ? 'bg-brand-primary-container/40 text-brand-primary'
        : 'bg-brand-error-container/40 text-brand-error';

  return (
    <motion.div
      initial={{ y: 12, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="mt-6 rounded-2xl border border-brand-gray-border bg-brand-card p-6 shadow-ambient"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-brand-gray-border pb-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-primary-container/40">
            <CalendarClock className="h-4.5 w-4.5 text-brand-primary" />
          </span>
          <div>
            <h3 className="font-sans text-base font-bold text-brand-text">Weekly Checkpoints</h3>
            <p className="font-sans text-xs text-brand-text-variant">
              Served/unserved read from each week's servicing_status column, versus this owner's monthly target.
            </p>
          </div>
        </div>
        <span className={`inline-flex items-center rounded-full px-3 py-1 font-sans text-[10px] font-bold tracking-wider ${toneClass}`}>
          {pace.label}
        </span>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left">
          <thead>
            <tr className="border-b border-brand-gray-border">
              {['Week', 'Active', 'Served', 'Unserved', 'No Status', 'Weekly Value', 'Cumulative', 'vs Target'].map(h => (
                <th key={h} className="py-2 font-sans text-[10px] font-bold uppercase tracking-wider text-brand-text-variant">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {series.map(row => (
              <tr key={row.reportingWeek} className="border-b border-brand-gray-border/50">
                <td className="py-2.5 font-sans text-xs font-bold text-brand-text">{row.reportingWeek}</td>
                <td className="py-2.5 font-sans text-xs text-brand-text">{row.breakdown?.active ?? 0}</td>
                <td className="py-2.5 font-sans text-xs font-bold text-brand-success">{row.breakdown?.served ?? 0}</td>
                <td className="py-2.5 font-sans text-xs font-bold text-brand-error">{row.breakdown?.notServed ?? 0}</td>
                <td className="py-2.5 font-sans text-xs text-brand-text-variant">{row.breakdown?.noStatus ?? 0}</td>
                <td className="py-2.5 font-sans text-xs text-brand-text">{formatNumberWithAbbreviation(row.breakdown?.value ?? 0)}</td>
                <td className="py-2.5 font-sans text-xs text-brand-text">{formatNumberWithAbbreviation(row.cumulativeValue)}</td>
                <td className="py-2.5 font-sans text-xs font-bold text-brand-primary">
                  {monthlyTarget > 0 ? `${((row.cumulativeValue / monthlyTarget) * 100).toFixed(1)}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
