import { useEffect, useMemo, useState } from 'react';
import { fetchWakalaStatusHistory } from '../lib/wakalaStatus.functions';
import { readWeeklyStatsHistory, refreshWeeklyStatsHistory } from '../utils/weeklyHistory';
import { ownerWeeklySeries, type WeeklyStatsEntry } from '../utils/weeklyKpiEngine';
import { normalizeMsisdn } from '../utils/msisdn';
import { getOwnerPortfolio } from '../utils/ownerPortfolio';
import { scoreOwnerKpis, KPI_WEIGHTS, KPI1_SPLIT } from '../utils/ownerKpiScore';
import { CLOUD_HYDRATED_EVENT } from '../lib/cloudSyncEvents';

/** KPI 1 by type: served value, its target, and where the served figure came from. */
export interface Kpi1ByType {
  baseServed: number;
  baseTarget: number;
  baseSource: string;
  iopServed: number;
  iopTarget: number;
  iopSource: string;
}

interface Props {
  ownerId: string;
  ownerName: string;
  period: string;
  kpi1: Kpi1ByType;
  registryVersion?: number;
}

const n = (v: number) => Math.round(v).toLocaleString();
const p = (v: number) => `${Math.round(v)}%`;

function tone(actual: number) {
  if (actual >= 70) return 'bg-brand-success-container/60 text-brand-success';
  if (actual >= 40) return 'bg-amber-100 text-amber-800';
  return 'bg-brand-error-container/60 text-brand-error';
}

function Table({ title, head, rows }: { title: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <h4 className="mb-1.5 font-sans text-[11px] font-black uppercase tracking-wider text-brand-text">{title}</h4>
      <table className="w-full min-w-[620px] text-left font-sans text-xs">
        <thead>
          <tr className="bg-brand-primary text-primary-foreground">
            {head.map((h, i) => (
              <th key={h} className={`px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider ${i > 1 ? 'text-right' : ''}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-brand-gray-border/50 odd:bg-brand-primary-container/15">
              {r.map((c, ci) => (
                <td
                  key={ci}
                  className={`px-2.5 py-1.5 ${ci > 1 ? 'text-right font-mono' : ''} ${
                    ci === r.length - 1 ? 'font-bold bg-brand-success-container/50 text-brand-success' : 'text-brand-text'
                  }`}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function OwnerKpiOverview({ ownerId, ownerName, period, kpi1, registryVersion }: Props) {
  const [history, setHistory] = useState<WeeklyStatsEntry[]>(() => readWeeklyStatsHistory());
  const [rows, setRows] = useState<{ msisdn: string; is_served: boolean | null; is_active: boolean }[] | null>(null);

  useEffect(() => {
    const load = () => refreshWeeklyStatsHistory().then(setHistory).catch(() => {});
    load();
    window.addEventListener('weekly-kpi-updated', load);
    window.addEventListener(CLOUD_HYDRATED_EVENT, load);
    return () => {
      window.removeEventListener('weekly-kpi-updated', load);
      window.removeEventListener(CLOUD_HYDRATED_EVENT, load);
    };
  }, []);

  const latest = useMemo(() => {
    const s = ownerWeeklySeries(history, ownerId, period);
    return [...s].reverse().find(e => e.breakdown) || null;
  }, [history, ownerId, period]);

  useEffect(() => {
    setRows(null);
    if (!latest || !ownerId) return;
    let cancelled = false;
    fetchWakalaStatusHistory({ data: { reportingWeek: latest.reportingWeek, ownerId } })
      .then(res => { if (!cancelled) setRows((res.rows || []) as any); })
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [latest?.reportingWeek, ownerId]);

  const portfolio = useMemo(() => getOwnerPortfolio(ownerId, period, ownerName), [ownerId, period, ownerName, registryVersion]);

  const counts = useMemo(() => {
    const served = new Set<string>();
    const active = new Set<string>();
    (rows || []).forEach(r => {
      const k = normalizeMsisdn(r.msisdn) || r.msisdn;
      if (r.is_served === true) served.add(k);
      if (r.is_active) active.add(k);
    });
    let normalServed = 0, priorityServed = 0;
    portfolio.wakalas.forEach(w => {
      if (!served.has(normalizeMsisdn(w.msisdn) || w.msisdn)) return;
      if (w.isPriority) priorityServed++; else normalServed++;
    });
    const activeCount = rows ? active.size : latest?.breakdown?.active ?? 0;
    return { normalServed, priorityServed, active: activeCount };
  }, [rows, portfolio, latest]);

  const base = portfolio.wakalas.length;
  const s = scoreOwnerKpis({
    baseServed: kpi1.baseServed, baseTarget: kpi1.baseTarget,
    iopServed: kpi1.iopServed, iopTarget: kpi1.iopTarget,
    normalBase: portfolio.normalCount, normalServed: counts.normalServed,
    priorityBase: portfolio.priorityCount, priorityServed: counts.priorityServed,
    activeBase: base, active: counts.active,
  });
  const name = ownerName.toUpperCase();
  const totalTarget = kpi1.baseTarget + kpi1.iopTarget;

  return (
    <div className="space-y-5 rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient">
      <div className="flex items-center justify-between">
        <h3 className="font-sans text-xs font-black uppercase tracking-wider text-brand-primary font-mono">KPI Overview · {period}</h3>
        {latest && <span className="font-sans text-[10px] text-brand-text-variant">Served / Active from {latest.reportingWeek}</span>}
      </div>

      <Table
        title={`KPI 1 · SA Value Servicing · ${name} · Base ${KPI1_SPLIT.base}% / IOP ${KPI1_SPLIT.iop}%`}
        head={['Month', 'Type', 'SA Base', 'Monthly Target', 'Per Day Target', 'Served Value', 'Source', 'Achievement']}
        rows={[
          [period, 'Base', base, n(kpi1.baseTarget), n(kpi1.baseTarget / 24), n(kpi1.baseServed), kpi1.baseSource, p(s.baseShare)],
          [period, 'IOP', '', n(kpi1.iopTarget), n(kpi1.iopTarget / 24), n(kpi1.iopServed), kpi1.iopSource, p(s.iopShare)],
          ['', 'Total', base, n(totalTarget), n(totalTarget / 24), n(kpi1.baseServed + kpi1.iopServed), '', p(s.kpi1)],
        ]}
      />

      <Table
        title="KPI 2 · Agent Servicing & Priority"
        head={['Month', 'Type', 'SA Base', 'Target Served', 'Served', 'Unserved', 'Achievement']}
        rows={[
          [period, 'Normal Wakala', portfolio.normalCount, s.normalTarget, counts.normalServed, Math.max(0, portfolio.normalCount - counts.normalServed), p(s.normalShare)],
          [period, 'Priority', portfolio.priorityCount, s.priorityTarget, counts.priorityServed, Math.max(0, portfolio.priorityCount - counts.priorityServed), p(s.priorityShare)],
          ['', 'Total', base, s.normalTarget + s.priorityTarget, counts.normalServed + counts.priorityServed, Math.max(0, base - counts.normalServed - counts.priorityServed), p(s.kpi2)],
        ]}
      />

      <Table
        title="KPI 3 · Agent Activity"
        head={['Month', 'SA Name', 'SA Base', 'Active Target', 'Active', 'Inactive', 'KPI 3']}
        rows={[[period, name, base, s.activeTarget, counts.active, Math.max(0, base - counts.active), p(s.kpi3)]]}
      />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] font-sans text-xs">
          <thead>
            <tr className="bg-brand-primary-container/30 text-brand-text">
              {['Summary', 'Actual', 'Weight', 'Performance'].map((h, i) => (
                <th key={h} className={`px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider ${i ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {([
              ['KPI 1 · SA Value Servicing', s.kpi1, KPI_WEIGHTS.kpi1, s.perf.kpi1],
              ['KPI 2 · Agent Servicing & Priority', s.kpi2, KPI_WEIGHTS.kpi2, s.perf.kpi2],
              ['KPI 3 · Agent Activity', s.kpi3, KPI_WEIGHTS.kpi3, s.perf.kpi3],
            ] as const).map(([label, actual, weight, perf]) => (
              <tr key={label} className="border-b border-brand-gray-border/50">
                <td className="px-2.5 py-1.5 text-brand-text">{label}</td>
                <td className="px-2.5 py-1.5 text-right font-mono text-brand-text">{Math.round(actual)}</td>
                <td className={`px-2.5 py-1.5 text-right font-mono font-bold ${tone(actual)}`}>{weight}%</td>
                <td className="px-2.5 py-1.5 text-right font-mono text-brand-text">{p(perf)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between rounded-xl bg-amber-400 px-4 py-2.5 font-sans">
        <span className="text-xs font-black uppercase tracking-wider text-amber-950">Overall Performance</span>
        <span className="font-mono text-lg font-black text-amber-950">{p(s.overall)}</span>
      </div>
    </div>
  );
}
