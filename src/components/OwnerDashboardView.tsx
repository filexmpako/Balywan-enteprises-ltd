import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Search,
  Store,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import { motion } from 'motion/react';
import MetricCard from './MetricCard';
import OwnerWeeklyCheckpoints from './OwnerWeeklyCheckpoints';
import WakalaIssuesPanel from './WakalaIssuesPanel';
import { useAuth } from './AuthContext';
import { useReportingPeriod } from './ReportingPeriodContext';
import { kvJson } from '../lib/hasidadi/kv';
import { normalizeMsisdn } from '../utils/msisdn';
import { buildOwnerWakalaMap } from '../utils/wakalaMapping';
import { listStoredWeeks, loadWeeklyRows } from '../utils/weeklyStore';
import { extractTxnCounts, getActivityRules, isActiveByRule } from '../utils/activityRules';
import { getServicedStatusFromColumn } from '../utils/servicingStatus';
import { ownerWeeklySeries, weekNumberOf, type WeeklyStatsEntry } from '../utils/weeklyKpiEngine';
import { readWeeklyStatsHistory, refreshWeeklyStatsHistory } from '../utils/weeklyHistory';
import { getSavedManualOwnerTargets, resolveOwnerTarget } from '../utils/targetResolution';
import { formatNumberWithAbbreviation } from '../utils/numberFormat';
import { listWakalaIssues, type WakalaIssue } from '../lib/issues.functions';
import type { BaseWakala, Owner, WakalaEntry } from '../types';

type Tab = 'overview' | 'wakalas' | 'reports';

interface WakalaRow {
  msisdn: string;
  name: string;
  region: string;
  code?: string;
  kind: 'Base' | 'IOP';
  txns: number;
  value: number;
  isActive: boolean;
  served: boolean | null;
  hasWeeklyData: boolean;
}

/**
 * The owner's own workspace: their wakala portfolio, their KPI standing for the
 * selected period and the reports they have raised with the admin. Every number
 * is derived from the same uploaded weekly data and system rules the admin
 * dashboard uses — owners just see their own slice.
 */
export default function OwnerDashboardView() {
  const { user } = useAuth();
  const { currentPeriod } = useReportingPeriod();

  const ownerId = user?.ownerId || '';
  const ownerName = user?.name || 'Owner';

  const [tab, setTab] = useState<Tab>('overview');
  const [weeks, setWeeks] = useState<string[]>([]);
  const [selectedWeek, setSelectedWeek] = useState('');
  const [weekRows, setWeekRows] = useState<any[]>([]);
  const [loadingWeek, setLoadingWeek] = useState(true);
  const [history, setHistory] = useState<WeeklyStatsEntry[]>(() => readWeeklyStatsHistory());
  const [issues, setIssues] = useState<WakalaIssue[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'served' | 'unserved'>('all');

  // --- Owner portfolio (shared resolver: Base Wakala Index + tills + priority list) ---
  const [portfolioVersion, setPortfolioVersion] = useState(0);
  useEffect(() => {
    const bump = () => setPortfolioVersion(v => v + 1);
    window.addEventListener(CLOUD_HYDRATED_EVENT, bump);
    return () => window.removeEventListener(CLOUD_HYDRATED_EVENT, bump);
  }, []);

  const portfolio = useMemo(
    () => (ownerId ? getOwnerPortfolio(ownerId, currentPeriod, ownerName) : null),
    [ownerId, currentPeriod, ownerName, portfolioVersion],
  );
  const wakalas = portfolio?.wakalas ?? [];

  // --- Weekly data for the selected week ---
  useEffect(() => {
    let cancelled = false;
    listStoredWeeks()
      .then(list => {
        if (cancelled) return;
        const sorted = [...list].sort((a, b) => weekNumberOf(a) - weekNumberOf(b));
        setWeeks(sorted);
        setSelectedWeek(prev => prev || sorted[sorted.length - 1] || '');
        if (sorted.length === 0) setLoadingWeek(false);
      })
      .catch(() => setLoadingWeek(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedWeek) return;
    let cancelled = false;
    setLoadingWeek(true);
    loadWeeklyRows(selectedWeek)
      .then(rows => {
        if (!cancelled) setWeekRows(rows || []);
      })
      .catch(() => {
        if (!cancelled) setWeekRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingWeek(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedWeek]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      refreshWeeklyStatsHistory()
        .then(entries => {
          if (!cancelled) setHistory(entries);
        })
        .catch(() => undefined);
    };
    load();
    window.addEventListener('weekly-kpi-updated', load);
    return () => {
      cancelled = true;
      window.removeEventListener('weekly-kpi-updated', load);
    };
  }, []);

  const loadIssues = useCallback(() => {
    if (!ownerId) return;
    listWakalaIssues({ data: { ownerId } })
      .then(res => setIssues(res.issues || []))
      .catch(() => undefined);
  }, [ownerId]);

  useEffect(() => {
    loadIssues();
  }, [loadIssues]);

  // --- Per-wakala weekly numbers, keyed by normalised MSISDN ---
  const weeklyByMsisdn = useMemo(() => {
    const rules = getActivityRules();
    const map = new Map<string, { txns: number; value: number; isActive: boolean; served: boolean | null }>();
    for (const row of weekRows) {
      const msisdn = String(row?.MSISDN || row?.msisdn || '').trim();
      const norm = normalizeMsisdn(msisdn);
      if (!norm) continue;
      const counts = extractTxnCounts(row);
      const txns = counts.total || Number(row?.SA_Servicing_Txns) || 0;
      const value = counts.amount || Number(row?.SA_Servicing_Val) || 0;
      const existing = map.get(norm);
      const served = getServicedStatusFromColumn(row);
      const merged = {
        txns: (existing?.txns || 0) + txns,
        value: (existing?.value || 0) + value,
        isActive: (existing?.isActive || false) || isActiveByRule(counts, rules),
        served: existing?.served === true || served === true ? true : (existing?.served ?? served),
      };
      map.set(norm, merged);
    }
    return map;
  }, [weekRows]);

  const rows = useMemo<WakalaRow[]>(
    () =>
      wakalas.map(w => {
        const weekly = weeklyByMsisdn.get(normalizeMsisdn(w.msisdn));
        return {
          msisdn: w.msisdn,
          name: w.name,
          region: w.region,
          code: w.code,
          kind: w.kind,
          txns: weekly?.txns ?? 0,
          value: weekly?.value ?? 0,
          isActive: weekly?.isActive ?? false,
          served: weekly?.served ?? null,
          hasWeeklyData: Boolean(weekly),
        };
      }),
    [wakalas, weeklyByMsisdn],
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (q && !`${r.name} ${r.msisdn} ${r.code ?? ''} ${r.region}`.toLowerCase().includes(q)) return false;
      if (statusFilter === 'active') return r.isActive;
      if (statusFilter === 'inactive') return !r.isActive;
      if (statusFilter === 'served') return r.served === true;
      if (statusFilter === 'unserved') return r.served === false;
      return true;
    });
  }, [rows, search, statusFilter]);

  // --- KPIs ---
  const activeCount = rows.filter(r => r.isActive).length;
  const servedCount = rows.filter(r => r.served === true).length;
  const unservedCount = rows.filter(r => r.served === false).length;
  const measured = servedCount + unservedCount;
  const penetration = measured > 0 ? (servedCount / measured) * 100 : 0;
  const weekValue = rows.reduce((sum, r) => sum + r.value, 0);
  const weekTxns = rows.reduce((sum, r) => sum + r.txns, 0);

  const { monthlyTarget } = useMemo(
    () => resolveOwnerTarget(ownerId, currentPeriod, getSavedManualOwnerTargets()),
    [ownerId, currentPeriod],
  );

  const series = useMemo(() => ownerWeeklySeries(history, ownerId), [history, ownerId]);
  const cumulativeValue = series.length ? series[series.length - 1]!.cumulativeValue : 0;
  const attainment = monthlyTarget > 0 ? (cumulativeValue / monthlyTarget) * 100 : 0;

  const openIssues = issues.filter(i => i.status !== 'Resolved');

  const kpi1Tone = attainment >= 100 ? 'green' : attainment >= 70 ? 'amber' : 'red';
  const kpi2Tone = penetration >= 70 ? 'green' : penetration >= 50 ? 'amber' : 'red';
  const kpi3Tone = rows.length && activeCount / rows.length >= 0.6 ? 'green' : 'amber';

  const tabs: Array<{ id: Tab; label: string; icon: typeof BarChart3; badge?: number }> = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'wakalas', label: 'My Wakalas', icon: Store, badge: rows.length },
    { id: 'reports', label: 'My Reports', icon: MessageSquare, badge: openIssues.length },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-brand-text-variant">
            Agent Dashboard
          </p>
          <h1 className="font-sans text-2xl font-black tracking-tight text-brand-text">{ownerName}</h1>
          <p className="font-sans text-xs text-brand-text-variant">
            Period {currentPeriod}
            {selectedWeek ? ` · latest week: ${selectedWeek}` : ' · no weekly report uploaded yet'}
          </p>
        </div>
        {weeks.length > 0 && (
          <label className="flex items-center gap-2 font-sans text-xs font-semibold text-brand-text-variant">
            Week
            <select
              value={selectedWeek}
              onChange={e => setSelectedWeek(e.target.value)}
              className="rounded-xl border border-brand-gray-border bg-brand-card px-3 py-2 font-sans text-xs font-bold text-brand-text"
            >
              {weeks.map(w => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {!ownerId && (
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />
          <p className="font-sans text-xs text-amber-800">
            Your account is not linked to an agent record yet. Ask the administrator to link it so your wakalas and
            performance appear here.
          </p>
        </div>
      )}

      {/* KPI cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="KPI 1 · Servicing Value"
          value={`TZS ${formatNumberWithAbbreviation(cumulativeValue)}`}
          subValue={monthlyTarget > 0 ? `${attainment.toFixed(1)}% of ${formatNumberWithAbbreviation(monthlyTarget)}` : 'No target set'}
          icon={Target}
          variant={monthlyTarget > 0 ? (kpi1Tone as any) : 'slate'}
        />
        <MetricCard
          title="KPI 2 · Wakala Penetration"
          value={measured > 0 ? `${penetration.toFixed(1)}%` : '—'}
          subValue={measured > 0 ? `${servedCount} served · ${unservedCount} unserved` : 'No status data this week'}
          icon={TrendingUp}
          variant={measured > 0 ? (kpi2Tone as any) : 'slate'}
        />
        <MetricCard
          title="KPI 3 · Active Wakalas"
          value={`${activeCount} / ${rows.length}`}
          subValue={`Rule: ${getActivityRules().threshold} txns & TZS ${formatNumberWithAbbreviation(getActivityRules().amountThreshold)}`}
          icon={Activity}
          variant={rows.length ? (kpi3Tone as any) : 'slate'}
        />
        <MetricCard
          title="Pending Reports"
          value={openIssues.length}
          subValue={openIssues.length ? 'Awaiting admin action' : 'Nothing outstanding'}
          icon={MessageSquare}
          variant={openIssues.length ? 'amber' : 'green'}
          onClick={() => setTab('reports')}
        />
      </div>

      {/* Tabs */}
      <div className="mt-6 flex flex-wrap gap-2 border-b border-brand-gray-border">
        {tabs.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px flex items-center gap-2 rounded-t-xl px-4 py-2.5 font-sans text-xs font-bold transition-colors ${
                active
                  ? 'border-b-2 border-brand-primary bg-brand-primary-container/30 text-brand-primary'
                  : 'text-brand-text-variant hover:text-brand-text'
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
              {typeof t.badge === 'number' && t.badge > 0 && (
                <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 font-mono text-[10px] font-bold text-brand-primary">
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tab === 'overview' && (
        <div className="mt-6 space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MetricCard
              title="Week Volume"
              value={`TZS ${formatNumberWithAbbreviation(weekValue)}`}
              subValue={selectedWeek || '—'}
              icon={BarChart3}
              variant="blue"
            />
            <MetricCard
              title="Week Transactions"
              value={weekTxns.toLocaleString()}
              subValue="Cash-in + cash-out"
              icon={Activity}
              variant="indigo"
            />
            <MetricCard
              title="My Wakalas"
              value={rows.length}
              subValue={`${rows.filter(r => r.kind === 'IOP').length} IOP · ${rows.filter(r => r.kind === 'Base').length} Base`}
              icon={Users}
              variant="purple"
              onClick={() => setTab('wakalas')}
            />
          </div>

          {ownerId && <OwnerWeeklyCheckpoints ownerId={ownerId} monthlyTarget={monthlyTarget} />}

          {openIssues.length > 0 && (
            <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-6 shadow-ambient">
              <h3 className="font-sans text-base font-bold text-brand-text">Reports awaiting the admin</h3>
              <ul className="mt-3 space-y-2">
                {openIssues.slice(0, 5).map(issue => (
                  <li key={issue.id} className="flex items-center justify-between gap-3 rounded-xl bg-brand-bg px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate font-sans text-xs font-bold text-brand-text">{issue.subject}</p>
                      <p className="truncate font-sans text-[11px] text-brand-text-variant">
                        {issue.wakala_name || issue.wakala_msisdn} · {issue.category}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 font-sans text-[10px] font-bold text-amber-700">
                      {issue.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {tab === 'wakalas' && (
        <motion.div
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="mt-6 rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-text-variant" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search name, phone, code, area"
                className="w-full rounded-xl border border-brand-gray-border bg-brand-bg py-2.5 pl-9 pr-3 font-sans text-xs text-brand-text"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(['all', 'active', 'inactive', 'served', 'unserved'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={`rounded-full px-3 py-1.5 font-sans text-[11px] font-bold capitalize transition-colors ${
                    statusFilter === f
                      ? 'bg-brand-primary text-brand-accent'
                      : 'bg-brand-bg text-brand-text-variant hover:text-brand-text'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {loadingWeek ? (
            <div className="flex items-center justify-center gap-2 py-12 font-sans text-xs text-brand-text-variant">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading this week's data…
            </div>
          ) : rows.length === 0 ? (
            <p className="py-12 text-center font-sans text-xs text-brand-text-variant">
              No wakalas are registered to you yet.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[820px] text-left">
                <thead>
                  <tr className="border-b border-brand-gray-border">
                    {['Wakala', 'Phone', 'Type', 'Area', 'Status', 'Served', 'Txns', 'Value (TZS)'].map(h => (
                      <th
                        key={h}
                        className="py-2 font-sans text-[10px] font-bold uppercase tracking-wider text-brand-text-variant"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map(r => (
                    <tr key={r.msisdn} className="border-b border-brand-gray-border/50">
                      <td className="py-2.5 font-sans text-xs font-bold text-brand-text">{r.name}</td>
                      <td className="py-2.5 font-mono text-xs text-brand-text-variant">{r.msisdn}</td>
                      <td className="py-2.5 font-sans text-xs text-brand-text-variant">{r.kind}</td>
                      <td className="py-2.5 font-sans text-xs text-brand-text-variant">{r.region}</td>
                      <td className="py-2.5">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 font-sans text-[10px] font-bold ${
                            r.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {r.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-2.5 font-sans text-xs font-bold">
                        {r.served === true ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Served
                          </span>
                        ) : r.served === false ? (
                          <span className="text-rose-600">Unserved</span>
                        ) : (
                          <span className="text-brand-text-variant">No data</span>
                        )}
                      </td>
                      <td className="py-2.5 font-sans text-xs text-brand-text">{r.txns.toLocaleString()}</td>
                      <td className="py-2.5 font-sans text-xs font-bold text-brand-primary">
                        {formatNumberWithAbbreviation(r.value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredRows.length === 0 && (
                <p className="py-8 text-center font-sans text-xs text-brand-text-variant">
                  No wakalas match this filter.
                </p>
              )}
            </div>
          )}
        </motion.div>
      )}

      {tab === 'reports' && (
        <div className="mt-6">
          <WakalaIssuesPanel
            mode="owner"
            ownerId={ownerId}
            ownerName={ownerName}
            senderName={ownerName}
            wakalas={rows.map(r => ({ msisdn: r.msisdn, name: r.name }))}
          />
        </div>
      )}
    </div>
  );
}
