import React, { useMemo } from 'react';
import { Target, TrendingUp, TrendingDown, Minus, ArrowUpRight, Award, ShieldAlert, Sparkles } from 'lucide-react';

interface KPI {
  id: string;
  name: string;
  target: string;
  targetVal?: number;
  achieved: string;
  achievedVal?: number;
  performance: number;
  status: string;
}

interface KPIExecutiveSummaryProps {
  parsedKpis: KPI[];
}

export default function KPIExecutiveSummary({ parsedKpis }: KPIExecutiveSummaryProps) {
  // Helper to parse numeric/currency strings
  const parseVal = (str: string): number => {
    const clean = String(str || '').replace(/[^0-9.-]/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  };

  const isCurrencyStr = (str: string): boolean => {
    return String(str || '').toUpperCase().includes('TZS') || String(str || '').includes('$');
  };

  // Compute stats
  const stats = useMemo(() => {
    if (!parsedKpis || parsedKpis.length === 0) {
      return {
        overallCompanyPerf: 0,
        companyStatus: 'Critical',
        totalKpis: 0,
        excellentCount: 0,
        goodCount: 0,
        averageCount: 0,
        criticalCount: 0,
        highestKpi: null as KPI | null,
        lowestKpi: null as KPI | null,
        rankedKpis: [] as KPI[]
      };
    }

    let totalTarget = 0;
    let totalAchieved = 0;
    let sumPerf = 0;
    let excellentCount = 0;
    let goodCount = 0;
    let averageCount = 0;
    let criticalCount = 0;

    parsedKpis.forEach(k => {
      const p = k.performance;
      sumPerf += p;

      if (p >= 95) excellentCount++;
      else if (p >= 85) goodCount++;
      else if (p >= 70) averageCount++;
      else criticalCount++;

      totalTarget += parseVal(k.target);
      totalAchieved += parseVal(k.achieved);
    });

    const overallCompanyPerf = totalTarget > 0 ? (totalAchieved / totalTarget) * 100 : sumPerf / parsedKpis.length;
    
    let companyStatus = 'Critical';
    if (overallCompanyPerf >= 95) companyStatus = 'Excellent';
    else if (overallCompanyPerf >= 85) companyStatus = 'Good';
    else if (overallCompanyPerf >= 70) companyStatus = 'Average';

    const sortedKpis = [...parsedKpis].sort((a, b) => b.performance - a.performance);
    const highestKpi = sortedKpis[0] || null;
    const lowestKpi = sortedKpis[sortedKpis.length - 1] || null;

    return {
      overallCompanyPerf,
      companyStatus,
      totalKpis: parsedKpis.length,
      excellentCount,
      goodCount,
      averageCount,
      criticalCount,
      highestKpi,
      lowestKpi,
      rankedKpis: sortedKpis
    };
  }, [parsedKpis]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Excellent':
        return { bg: 'bg-emerald-50 border-emerald-200 text-emerald-700', fill: 'bg-emerald-500' };
      case 'Good':
        return { bg: 'bg-blue-50 border-blue-200 text-blue-700', fill: 'bg-blue-500' };
      case 'Average':
        return { bg: 'bg-amber-50 border-amber-200 text-amber-700', fill: 'bg-amber-500' };
      default:
        return { bg: 'bg-rose-50 border-rose-200 text-rose-700', fill: 'bg-rose-500' };
    }
  };

  const getKpiStatus = (perf: number) => {
    if (perf >= 95) return 'Excellent';
    if (perf >= 85) return 'Good';
    if (perf >= 70) return 'Average';
    return 'Critical';
  };

  return (
    <div className="space-y-6">


      {/* 2. EXECUTIVE SUMMARY STATS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI Volume & Counts */}
        <div className="bg-brand-card rounded-2xl border border-brand-gray-border p-5 shadow-sm space-y-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-brand-text-variant block">Analyzed Targets</span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-brand-text">{stats.totalKpis} KPIs</span>
            <span className="text-[10px] text-brand-text-variant font-medium">evaluated</span>
          </div>
          <div className="grid grid-cols-4 gap-1 text-center text-[10px] font-black uppercase text-white pt-2 border-t border-brand-gray-border/50">
            <div className="bg-emerald-500 rounded px-1.5 py-0.5" title="Excellent">{stats.excellentCount}E</div>
            <div className="bg-blue-500 rounded px-1.5 py-0.5" title="Good">{stats.goodCount}G</div>
            <div className="bg-amber-500 rounded px-1.5 py-0.5" title="Average">{stats.averageCount}A</div>
            <div className="bg-rose-500 rounded px-1.5 py-0.5" title="Critical">{stats.criticalCount}C</div>
          </div>
        </div>

        {/* Status Breakdown (Excellent & Good) */}
        <div className="bg-brand-card rounded-2xl border border-brand-gray-border p-5 shadow-sm space-y-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-brand-text-variant block">Healthy Status KPI Ratio</span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-600">{(((stats.excellentCount + stats.goodCount) / (stats.totalKpis || 1)) * 100).toFixed(0)}%</span>
            <span className="text-xs text-brand-text-variant font-bold">Excellent/Good</span>
          </div>
          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-emerald-500 rounded-full"
              style={{ width: `${((stats.excellentCount + stats.goodCount) / (stats.totalKpis || 1)) * 100}%` }}
            />
          </div>
        </div>

        {/* Highest KPI */}
        <div className="bg-brand-card rounded-2xl border border-brand-gray-border p-5 shadow-sm space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-brand-text-variant block">Highest Performing Target</span>
          {stats.highestKpi ? (
            <div className="space-y-1">
              <div className="flex justify-between items-start gap-1">
                <span className="text-xs font-black text-brand-text truncate block max-w-[150px]">{stats.highestKpi.name}</span>
                <span className="bg-emerald-50 text-emerald-700 text-[10px] font-black px-1.5 py-0.5 rounded border border-emerald-100 shrink-0">
                  {stats.highestKpi.performance.toFixed(1)}%
                </span>
              </div>
              <p className="text-[10px] text-brand-text-variant font-medium">Achieved: {stats.highestKpi.achieved}</p>
            </div>
          ) : (
            <p className="text-xs text-brand-text-variant">No data available</p>
          )}
        </div>

        {/* Lowest KPI */}
        <div className="bg-brand-card rounded-2xl border border-brand-gray-border p-5 shadow-sm space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-brand-text-variant block">Lowest Performing Target</span>
          {stats.lowestKpi ? (
            <div className="space-y-1">
              <div className="flex justify-between items-start gap-1">
                <span className="text-xs font-black text-brand-text truncate block max-w-[150px]">{stats.lowestKpi.name}</span>
                <span className="bg-rose-50 text-rose-700 text-[10px] font-black px-1.5 py-0.5 rounded border border-rose-100 shrink-0">
                  {stats.lowestKpi.performance.toFixed(1)}%
                </span>
              </div>
              <p className="text-[10px] text-brand-text-variant font-medium">Achieved: {stats.lowestKpi.achieved} of {stats.lowestKpi.target}</p>
            </div>
          ) : (
            <p className="text-xs text-brand-text-variant">No data available</p>
          )}
        </div>
      </div>

      {/* 3. DYNAMIC AUTOMATIC KPI RANKING TABLE */}
      <div className="bg-brand-card rounded-2xl border border-brand-gray-border shadow-sm overflow-hidden">
        <div className="p-4 border-b border-brand-gray-border bg-slate-50 flex items-center justify-between">
          <h4 className="font-extrabold text-brand-text text-xs uppercase tracking-wider flex items-center gap-1.5">
            <Award className="h-4.5 w-4.5 text-brand-primary" />
            Automatic Target Ingestion Ranking Ledger
          </h4>
          <span className="text-[10px] font-bold text-brand-text-variant">Sorted highest performance first</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans">
            <thead>
              <tr className="bg-slate-50 border-b border-brand-gray-border text-[10px] font-bold uppercase text-brand-text-variant tracking-wider">
                <th className="px-5 py-3 text-center w-16">Rank</th>
                <th className="px-5 py-3">KPI Name</th>
                <th className="px-5 py-3">Target</th>
                <th className="px-5 py-3">MTD Achieved</th>
                <th className="px-5 py-3 text-center w-36">Performance Ratio</th>
                <th className="px-5 py-3 text-center w-32">Status Flag</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-gray-border/50">
              {stats.rankedKpis.map((kpi, idx) => {
                const calculatedStatus = getKpiStatus(kpi.performance);
                const colors = getStatusColor(calculatedStatus);

                return (
                  <tr key={kpi.id} className="hover:bg-slate-50/40">
                    <td className="px-5 py-3 text-center">
                      <span className={`inline-flex items-center justify-center h-6 w-6 rounded-full text-[11px] font-extrabold ${
                        idx === 0 ? 'bg-amber-100 text-amber-800' :
                        idx === 1 ? 'bg-slate-200 text-slate-800' :
                        idx === 2 ? 'bg-orange-100 text-orange-800' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {idx + 1}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-extrabold text-brand-text">{kpi.name}</td>
                    <td className="px-5 py-3 font-semibold text-brand-text-variant">{kpi.target}</td>
                    <td className="px-5 py-3 font-bold text-brand-text">{kpi.achieved}</td>
                    <td className="px-5 py-3 text-center">
                      <span className="text-xs font-black text-brand-primary">{kpi.performance.toFixed(1)}%</span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className={`inline-block text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${colors.bg}`}>
                        {calculatedStatus}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. INDIVIDUAL KPI CARD GRID (EXTENDED STYLING) */}
      <div className="space-y-4">
        <h4 className="text-xs font-black uppercase tracking-wider text-brand-text-variant flex items-center gap-1.5 font-sans">
          <Target className="h-4.5 w-4.5 text-brand-secondary" />
          Target Achievement & Deviations Audit Grid
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {parsedKpis.map(kpi => {
            const calculatedStatus = getKpiStatus(kpi.performance);
            const colors = getStatusColor(calculatedStatus);
            const targetNum = parseVal(kpi.target);
            const achievedNum = parseVal(kpi.achieved);
            const remainingNum = Math.max(0, targetNum - achievedNum);
            const isExceeded = achievedNum >= targetNum;
            const isCurrency = isCurrencyStr(kpi.target) || isCurrencyStr(kpi.achieved);

            // Format remaining target nicely
            const remainingStr = isExceeded 
              ? "Target Met" 
              : isCurrency 
                ? `TZS ${remainingNum.toLocaleString('en-US')}` 
                : remainingNum.toLocaleString('en-US');

            return (
              <div key={kpi.id} className="bg-brand-card rounded-2xl border border-brand-gray-border p-5 shadow-sm space-y-4 hover:shadow-ambient hover:border-brand-primary transition-all flex flex-col justify-between font-sans">
                <div className="space-y-3">
                  {/* Top line: Name + badge */}
                  <div className="flex items-start justify-between gap-3">
                    <h5 className="font-extrabold text-brand-text text-sm leading-snug">{kpi.name}</h5>
                    <span className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border shrink-0 ${colors.bg}`}>
                      {calculatedStatus}
                    </span>
                  </div>

                  {/* Core widgets */}
                  <div className="grid grid-cols-2 gap-4 border-t border-brand-gray-border/50 pt-3">
                    <div>
                      <span className="text-[9px] text-brand-text-variant font-bold uppercase tracking-wider">Monthly Target</span>
                      <p className="text-sm font-black text-brand-text mt-0.5">{kpi.target}</p>
                    </div>
                    <div>
                      <span className="text-[9px] text-brand-text-variant font-bold uppercase tracking-wider">MTD Achieved</span>
                      <p className="text-sm font-black text-brand-text mt-0.5">{kpi.achieved}</p>
                    </div>
                  </div>

                  {/* Remaining Target Field */}
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-brand-gray-border/50 flex justify-between items-center text-xs">
                    <span className="text-[10px] text-brand-text-variant font-bold uppercase tracking-wider">Remaining to target</span>
                    <strong className={`font-black ${isExceeded ? 'text-emerald-700' : 'text-slate-800'}`}>
                      {remainingStr}
                    </strong>
                  </div>
                </div>

                {/* Progress ratio & trend details */}
                <div className="space-y-3 pt-3 border-t border-brand-gray-border/30 mt-3">
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[11px] font-semibold text-brand-text-variant">
                      <span>MTD Achievement Progress</span>
                      <span className="font-black text-brand-primary">{kpi.performance.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${colors.fill}`}
                        style={{ width: `${Math.min(kpi.performance, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Trend indicator and analytical text */}
                  <div className="flex items-center gap-2 text-[10px] font-medium text-brand-text-variant bg-slate-50/60 rounded-xl px-2.5 py-1.5 border border-brand-gray-border/30">
                    {calculatedStatus === 'Excellent' || calculatedStatus === 'Good' ? (
                      <>
                        <TrendingUp className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span>Performance is strong. On track to exceed sovereign expectations.</span>
                      </>
                    ) : calculatedStatus === 'Average' ? (
                      <>
                        <Minus className="h-4 w-4 text-amber-500 shrink-0" />
                        <span>Stable but within cautionary threshold. Monitor liquidity closely.</span>
                      </>
                    ) : (
                      <>
                        <TrendingDown className="h-4 w-4 text-rose-500 shrink-0" />
                        <span>Critical target deviation detected. Immediate remediation required.</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
