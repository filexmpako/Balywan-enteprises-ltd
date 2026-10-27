import React, { useEffect, useState } from 'react';
import { CalendarClock, ChevronDown, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { readWeeklyStatsHistory, refreshWeeklyStatsHistory } from '../utils/weeklyHistory';
import {
  ownerWeeklySeries,
  paceLabel,
  weekNumberOf,
  type WeeklyStatsEntry,
} from '../utils/weeklyKpiEngine';
import { formatNumberWithAbbreviation } from '../utils/numberFormat';
import type { DetailFilter } from '../utils/weeklyReport';
import WeeklyReportTable from './WeeklyReportTable';
import { useReportingPeriod } from './ReportingPeriodContext';
import { CLOUD_HYDRATED_EVENT } from '../lib/cloudSyncEvents';

interface Props {
  ownerId: string;
  monthlyTarget: number;
  onLatestActivity?: (active: number | null, inactive: number | null) => void;
}

/**
 * Per-owner weekly checkpoints: this owner's slice of every uploaded weekly
 * workbook, accumulating toward their own monthly KPI 1 target. Each week
 * row opens that week's report for this owner's wakalas.
 */
export default function OwnerWeeklyCheckpoints({ ownerId, monthlyTarget, onLatestActivity }: Props) {
  const { currentPeriod } = useReportingPeriod();
  const [history, setHistory] = useState<WeeklyStatsEntry[]>(() => readWeeklyStatsHistory());
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null);
  const [detailFilter, setDetailFilter] = useState<Record<string, DetailFilter>>({});

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
    window.addEventListener(CLOUD_HYDRATED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener('weekly-kpi-updated', load);
      window.removeEventListener(CLOUD_HYDRATED_EVENT, load);
    };
  }, []);

  const series = ownerWeeklySeries(history, ownerId, currentPeriod);
  const latest = [...series].reverse().find(entry => entry.breakdown) || null;
  useEffect(() => {
    if (!onLatestActivity) return;
    if (!latest?.breakdown) {
      onLatestActivity(null, null);
      return;
    }
    const active = latest.breakdown.active ?? 0;
    const total = latest.breakdown.total ?? (active + (latest.breakdown.inactive ?? 0));
    onLatestActivity(active, Math.max(0, total - active));
  }, [latest?.reportingWeek, latest?.breakdown?.active, latest?.breakdown?.inactive, latest?.breakdown?.total, onLatestActivity]);

  const toggleWeek = (reportingWeek: string) => {
    setExpandedWeek(expandedWeek === reportingWeek ? null : reportingWeek);
  };

  const applyFilter = (reportingWeek: string, filter: DetailFilter, e: React.MouseEvent) => {
    e.stopPropagation();
    if (expandedWeek !== reportingWeek) toggleWeek(reportingWeek);
    setDetailFilter(prev => ({ ...prev, [reportingWeek]: prev[reportingWeek] === filter ? 'all' : filter }));
  };

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
              Click a week to open its report for this owner's wakalas.
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
            {series.map((row, index) => {
              const isExpanded = expandedWeek === row.reportingWeek;
              return (
                <React.Fragment key={row.reportingWeek}>
                  <tr
                    onClick={() => toggleWeek(row.reportingWeek)}
                    className="border-b border-brand-gray-border/50 cursor-pointer hover:bg-brand-gray-hover/40 transition-colors"
                    title="Click to see the wakalas behind this week's numbers"
                  >
                    <td className="py-2.5 font-sans text-xs font-bold text-brand-text">
                      <span className="flex items-center gap-1.5">
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 text-brand-text-variant shrink-0" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-brand-text-variant shrink-0" />
                        )}
                        {row.reportingWeek}
                      </span>
                    </td>
                    <td className="py-2.5 font-sans text-xs text-brand-text">
                      <button type="button" onClick={(e) => applyFilter(row.reportingWeek, 'active', e)} className="cursor-pointer hover:underline" title="Show only Active wakalas">
                        {row.breakdown?.active ?? 0}
                      </button>
                    </td>
                    <td className="py-2.5 font-sans text-xs font-bold text-brand-success">
                      <button type="button" onClick={(e) => applyFilter(row.reportingWeek, 'served', e)} className="cursor-pointer hover:underline" title="Show only Served wakalas">
                        {row.breakdown?.served ?? 0}
                      </button>
                    </td>
                    <td className="py-2.5 font-sans text-xs font-bold text-brand-error">
                      <button type="button" onClick={(e) => applyFilter(row.reportingWeek, 'unserved', e)} className="cursor-pointer hover:underline" title="Show only Unserved wakalas">
                        {row.breakdown?.notServed ?? 0}
                      </button>
                    </td>
                    <td className="py-2.5 font-sans text-xs text-brand-text-variant">
                      <button type="button" onClick={(e) => applyFilter(row.reportingWeek, 'nostatus', e)} className="cursor-pointer hover:underline" title="Show only wakalas with no status">
                        {row.breakdown?.noStatus ?? 0}
                      </button>
                    </td>
                    <td className="py-2.5 font-sans text-xs text-brand-text">{formatNumberWithAbbreviation(row.breakdown?.value ?? 0)}</td>
                    <td className="py-2.5 font-sans text-xs text-brand-text">{formatNumberWithAbbreviation(row.cumulativeValue)}</td>
                    <td className="py-2.5 font-sans text-xs font-bold text-brand-primary">
                      {monthlyTarget > 0 ? `${((row.cumulativeValue / monthlyTarget) * 100).toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                  <AnimatePresence>
                    {isExpanded && (
                      <tr>
                        <td colSpan={8} className="p-0">
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="bg-brand-bg m-2 rounded-xl border border-brand-gray-border p-3">
                              <WeeklyReportTable
                                reportingWeek={row.reportingWeek}
                                ownerId={ownerId}
                                filter={detailFilter[row.reportingWeek] || 'all'}
                                onFilterChange={f => setDetailFilter(prev => ({ ...prev, [row.reportingWeek]: f }))}
                                priorWeeks={series.slice(0, index).map(s => s.reportingWeek)}
                              />
                            </div>
                          </motion.div>
                        </td>
                      </tr>
                    )}
                  </AnimatePresence>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
