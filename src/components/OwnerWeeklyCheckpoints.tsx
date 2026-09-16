import React, { useEffect, useMemo, useState } from 'react';
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
import { fetchWakalaStatusHistory } from '../lib/wakalaStatus.functions';
import { normalizeMsisdn } from '../utils/msisdn';
import { BaseWakala } from '../types';

interface Props {
  ownerId: string;
  monthlyTarget: number;
  onLatestActivity?: (active: number, inactive: number) => void;
}

interface WakalaStatusRow {
  msisdn: string;
  is_active: boolean;
  is_served: boolean | null;
  cash_in_txns: number;
  cash_out_txns: number;
  total_txns: number;
  total_value: number;
}

/** msisdn -> a readable name, resolved from whatever registries are cached locally. */
function buildWakalaNameMap(): Map<string, string> {
  const map = new Map<string, string>();
  try {
    const base: BaseWakala[] = JSON.parse(localStorage.getItem('baseWakalaIndex') || '[]');
    base.forEach(w => {
      const norm = normalizeMsisdn(w.msisdn);
      if (norm) map.set(norm, w.fullName || w.wakalaName || w.code || w.wakalaCode || w.msisdn);
    });
  } catch { /* best-effort */ }
  try {
    const tills: any[] = JSON.parse(localStorage.getItem('tillsList') || '[]');
    tills.forEach(t => {
      const norm = normalizeMsisdn(t.transactionTill || t.msisdn);
      if (norm && !map.has(norm)) map.set(norm, t.tillName || t.name || t.transactionTill || t.msisdn);
    });
  } catch { /* best-effort */ }
  return map;
}

/**
 * Per-owner weekly checkpoints: this owner's slice of every uploaded weekly
 * workbook, accumulating toward their own monthly KPI 1 target. Each week
 * row can be expanded to show exactly which wakalas were active/inactive
 * and served/unserved that week.
 */
export default function OwnerWeeklyCheckpoints({ ownerId, monthlyTarget, onLatestActivity }: Props) {
  const [history, setHistory] = useState<WeeklyStatsEntry[]>(() => readWeeklyStatsHistory());
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null);
  const [weekDetail, setWeekDetail] = useState<Record<string, WakalaStatusRow[] | 'loading' | 'error'>>({});
  const nameMap = useMemo(buildWakalaNameMap, [expandedWeek]);

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

  const toggleWeek = (reportingWeek: string) => {
    if (expandedWeek === reportingWeek) {
      setExpandedWeek(null);
      return;
    }
    setExpandedWeek(reportingWeek);
    if (weekDetail[reportingWeek]) return;
    setWeekDetail(prev => ({ ...prev, [reportingWeek]: 'loading' }));
    fetchWakalaStatusHistory({ data: { reportingWeek, ownerId } })
      .then(res => {
        setWeekDetail(prev => ({ ...prev, [reportingWeek]: (res.rows || []) as WakalaStatusRow[] }));
      })
      .catch(err => {
        console.error('Wakala status detail load failed:', err);
        setWeekDetail(prev => ({ ...prev, [reportingWeek]: 'error' }));
      });
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
              Click a week to see the wakalas behind the numbers.
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
            {series.map(row => {
              const isExpanded = expandedWeek === row.reportingWeek;
              const detail = weekDetail[row.reportingWeek];
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
                              {detail === 'loading' && (
                                <p className="py-3 text-center font-sans text-xs text-brand-text-variant">Loading wakalas…</p>
                              )}
                              {detail === 'error' && (
                                <p className="py-3 text-center font-sans text-xs text-brand-error">Could not load wakala detail for this week.</p>
                              )}
                              {Array.isArray(detail) && detail.length === 0 && (
                                <p className="py-3 text-center font-sans text-xs text-brand-text-variant">No wakala-level detail recorded for this week.</p>
                              )}
                              {Array.isArray(detail) && detail.length > 0 && (
                                <div className="overflow-x-auto">
                                  <table className="w-full min-w-[620px] text-left">
                                    <thead>
                                      <tr>
                                        {['Wakala', 'MSISDN', 'Status', 'Served', 'Txns', 'Total Value', 'Served Value'].map(h => (
                                          <th key={h} className="py-1.5 font-sans text-[9px] font-bold uppercase tracking-wider text-brand-text-variant">
                                            {h}
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {detail.map(w => {
                                        const norm = normalizeMsisdn(w.msisdn) || w.msisdn;
                                        const name = nameMap.get(norm) || w.msisdn;
                                        return (
                                          <tr key={w.msisdn} className="border-t border-brand-gray-border/40">
                                            <td className="py-1.5 font-sans text-xs font-semibold text-brand-text">{name}</td>
                                            <td className="py-1.5 font-sans text-[11px] text-brand-text-variant">{w.msisdn}</td>
                                            <td className="py-1.5">
                                              <span className={`rounded-full px-2 py-0.5 font-sans text-[9px] font-bold ${w.is_active ? 'bg-brand-success-container/40 text-brand-success' : 'bg-brand-error-container/40 text-brand-error'}`}>
                                                {w.is_active ? 'Active' : 'Inactive'}
                                              </span>
                                            </td>
                                            <td className="py-1.5">
                                              {w.is_served === null || w.is_served === undefined ? (
                                                <span className="rounded-full px-2 py-0.5 font-sans text-[9px] font-bold bg-brand-gray-hover text-brand-text-variant">No Status</span>
                                              ) : (
                                                <span className={`rounded-full px-2 py-0.5 font-sans text-[9px] font-bold ${w.is_served ? 'bg-brand-success-container/40 text-brand-success' : 'bg-brand-error-container/40 text-brand-error'}`}>
                                                  {w.is_served ? 'Served' : 'Unserved'}
                                                </span>
                                              )}
                                            </td>
                                            <td className="py-1.5 font-sans text-xs text-brand-text">{w.total_txns}</td>
                                            <td className="py-1.5 font-sans text-xs text-brand-text">{formatNumberWithAbbreviation(w.total_value)}</td>
                                            <td className="py-1.5 font-sans text-xs font-bold text-brand-success">
                                              {w.is_served ? formatNumberWithAbbreviation(w.total_value) : '—'}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
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
