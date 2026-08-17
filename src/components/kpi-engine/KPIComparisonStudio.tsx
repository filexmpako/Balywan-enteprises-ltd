import React, { useState, useMemo, useEffect } from 'react';
import { Diff, TrendingUp, TrendingDown, Minus, ArrowUpRight, ArrowDownRight, Calendar } from 'lucide-react';

interface KPI {
  id: string;
  name: string;
  target: string;
  achieved: string;
  performance: number;
  status: string;
}

interface ArchivedReport {
  reportingMonth: string;
  uploadDate: string;
  uploadedBy: string;
  fileName: string;
  status: string;
  processingTimeMs: number;
  recordsImported: number;
  kpis: KPI[];
}

interface KPIComparisonStudioProps {
  initialMonthA?: string;
}

export default function KPIComparisonStudio({ initialMonthA }: KPIComparisonStudioProps) {
  const [monthA, setMonthA] = useState<string>('');
  const [monthB, setMonthB] = useState<string>('');

  // Read historical reports from localStorage
  const historyList = useMemo((): ArchivedReport[] => {
    const saved = localStorage.getItem('kpiWorkbookHistory');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Error parsing history in Comparison Studio:", e);
      }
    }
    return [];
  }, []);

  // Set default selections
  useEffect(() => {
    if (historyList.length > 0) {
      // Find default Month A
      const defaultA = initialMonthA || historyList[0]?.reportingMonth || '';
      setMonthA(defaultA);

      // Find default Month B (the one immediately following or preceding it)
      const indexA = historyList.findIndex(h => h.reportingMonth === defaultA);
      const defaultB = historyList[indexA + 1]?.reportingMonth || historyList[0]?.reportingMonth || '';
      setMonthB(defaultB);
    }
  }, [historyList, initialMonthA]);

  // Extract selected reports
  const reportA = useMemo(() => historyList.find(h => h.reportingMonth === monthA), [historyList, monthA]);
  const reportB = useMemo(() => historyList.find(h => h.reportingMonth === monthB), [historyList, monthB]);

  // Compute comparison comparisons
  const compareData = useMemo(() => {
    if (!reportA || !reportB) {
      return {
        overallVariance: 0,
        improvedCount: 0,
        declinedCount: 0,
        unchangedCount: 0,
        kpiComparisons: [] as { name: string; perfA: number; perfB: number; diff: number; trend: 'improved' | 'declined' | 'unchanged' }[]
      };
    }

    let improvedCount = 0;
    let declinedCount = 0;
    let unchangedCount = 0;
    let sumDiff = 0;

    const kpiComparisons = reportA.kpis.map(kpiA => {
      // Find matching KPI in Report B
      const kpiB = reportB.kpis.find(k => k.name === kpiA.name);
      const perfA = kpiA.performance;
      const perfB = kpiB ? kpiB.performance : 0;
      const diff = perfA - perfB;
      sumDiff += diff;

      let trend: 'improved' | 'declined' | 'unchanged' = 'unchanged';
      if (diff > 1) {
        trend = 'improved';
        improvedCount++;
      } else if (diff < -1) {
        trend = 'declined';
        declinedCount++;
      } else {
        unchangedCount++;
      }

      return {
        name: kpiA.name,
        perfA,
        perfB,
        diff,
        trend
      };
    });

    return {
      overallVariance: kpiComparisons.length > 0 ? sumDiff / kpiComparisons.length : 0,
      improvedCount,
      declinedCount,
      unchangedCount,
      kpiComparisons
    };
  }, [reportA, reportB]);

  return (
    <div className="space-y-6">
      {/* 1. SELECTORS BLOCK */}
      <div className="bg-brand-card rounded-2xl border border-brand-gray-border p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-brand-gray-border">
          <Diff className="h-5 w-5 text-brand-primary" />
          <h4 className="font-extrabold text-brand-text text-xs uppercase tracking-wider">Multi-Month Target Comparison Studio</h4>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          {/* Selector for Month A (Current) */}
          <div className="flex-1 w-full space-y-1">
            <label className="text-[10px] font-bold text-brand-text-variant uppercase tracking-wider block">Select Active/Current Month (Month A)</label>
            <div className="flex items-center gap-2 rounded-xl bg-slate-50 border border-brand-gray-border px-3.5 py-2">
              <Calendar className="h-4 w-4 text-brand-primary" />
              <select
                value={monthA}
                onChange={(e) => setMonthA(e.target.value)}
                className="bg-transparent w-full text-xs font-black text-brand-text outline-none cursor-pointer"
              >
                <option value="">Choose Month A...</option>
                {historyList.map(h => (
                  <option key={h.reportingMonth} value={h.reportingMonth}>{h.reportingMonth}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="text-xs font-bold text-brand-text-variant select-none shrink-0 pt-4">vs</div>

          {/* Selector for Month B (Previous) */}
          <div className="flex-1 w-full space-y-1">
            <label className="text-[10px] font-bold text-brand-text-variant uppercase tracking-wider block">Select Base/Comparison Month (Month B)</label>
            <div className="flex items-center gap-2 rounded-xl bg-slate-50 border border-brand-gray-border px-3.5 py-2">
              <Calendar className="h-4 w-4 text-brand-text-variant" />
              <select
                value={monthB}
                onChange={(e) => setMonthB(e.target.value)}
                className="bg-transparent w-full text-xs font-black text-brand-text outline-none cursor-pointer"
              >
                <option value="">Choose Month B...</option>
                {historyList.map(h => (
                  <option key={h.reportingMonth} value={h.reportingMonth}>{h.reportingMonth}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Defensive check */}
      {!reportA || !reportB ? (
        <div className="bg-brand-card border border-brand-gray-border rounded-2xl p-10 text-center text-brand-text-variant font-medium text-xs">
          Please select two valid historical months from the dropdowns above to trigger comparative analysis.
        </div>
      ) : (
        <>
          {/* 2. OVERALL COMPARATIVE SUMMARY CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Overall Variance Card */}
            <div className="bg-brand-card rounded-2xl border border-brand-gray-border p-5 shadow-sm space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-brand-text-variant block">Aggregated Deviation</span>
              <div className="flex items-baseline gap-1.5">
                <span className={`text-2xl font-black ${compareData.overallVariance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {compareData.overallVariance >= 0 ? `+${compareData.overallVariance.toFixed(1)}%` : `${compareData.overallVariance.toFixed(1)}%`}
                </span>
                <span className="text-[10px] text-brand-text-variant font-bold">average shift</span>
              </div>
              <p className="text-[10px] text-brand-text-variant">Month A performance vs Month B baseline</p>
            </div>

            {/* Improved Count Card */}
            <div className="bg-brand-card rounded-2xl border border-emerald-100 bg-emerald-50/10 p-5 shadow-sm space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">✦ Improved Targets</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-emerald-700">{compareData.improvedCount} KPIs</span>
                <span className="text-xs text-emerald-600 font-bold">increased</span>
              </div>
              <p className="text-[10px] text-emerald-600">Variance shift exceeded +1.0%</p>
            </div>

            {/* Declined Count Card */}
            <div className="bg-brand-card rounded-2xl border border-rose-100 bg-rose-50/10 p-5 shadow-sm space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-800 block">✦ Declined Targets</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-rose-700">{compareData.declinedCount} KPIs</span>
                <span className="text-xs text-rose-600 font-bold">decreased</span>
              </div>
              <p className="text-[10px] text-rose-600">Variance drop worse than -1.0%</p>
            </div>

            {/* Unchanged Count Card */}
            <div className="bg-brand-card rounded-2xl border border-brand-gray-border p-5 shadow-sm space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-brand-text-variant block">✦ Unchanged Targets</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-slate-700">{compareData.unchangedCount} KPIs</span>
                <span className="text-xs text-brand-text-variant font-bold">stable</span>
              </div>
              <p className="text-[10px] text-brand-text-variant">Variance shift remained inside ±1.0%</p>
            </div>

          </div>

          {/* 3. COMPARATIVE TABLE LIST */}
          <div className="bg-brand-card rounded-2xl border border-brand-gray-border shadow-sm overflow-hidden">
            <div className="p-4 border-b border-brand-gray-border bg-slate-50">
              <h4 className="font-extrabold text-brand-text text-xs uppercase tracking-wider flex items-center gap-1.5">
                <Diff className="h-4.5 w-4.5 text-brand-primary" />
                Individual KPI Performance Comparative Ledger
              </h4>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-sans">
                <thead>
                  <tr className="bg-slate-50 border-b border-brand-gray-border text-[10px] font-bold uppercase text-brand-text-variant tracking-wider">
                    <th className="px-5 py-3">KPI Target Metric Name</th>
                    <th className="px-5 py-3 text-center">{monthA} Ratio</th>
                    <th className="px-5 py-3 text-center">{monthB} Ratio</th>
                    <th className="px-5 py-3 text-center w-36">Variance Shift</th>
                    <th className="px-5 py-3 text-center w-40">Operational Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-gray-border/50 font-medium text-brand-text">
                  {compareData.kpiComparisons.map((item, index) => {
                    return (
                      <tr key={index} className="hover:bg-slate-50/40">
                        {/* Name */}
                        <td className="px-5 py-3.5 font-extrabold">{item.name}</td>

                        {/* Month A Perf */}
                        <td className="px-5 py-3.5 text-center font-black text-brand-primary">{item.perfA.toFixed(1)}%</td>

                        {/* Month B Perf */}
                        <td className="px-5 py-3.5 text-center text-brand-text-variant">{item.perfB.toFixed(1)}%</td>

                        {/* Variance diff */}
                        <td className="px-5 py-3.5 text-center font-black">
                          <span className={item.diff > 0 ? 'text-emerald-600' : item.diff < 0 ? 'text-rose-600' : 'text-slate-600'}>
                            {item.diff > 0 ? `+${item.diff.toFixed(1)}%` : `${item.diff.toFixed(1)}%`}
                          </span>
                        </td>

                        {/* Trend Flag Badge */}
                        <td className="px-5 py-3.5 text-center">
                          {item.trend === 'improved' ? (
                            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700">
                              <ArrowUpRight className="h-3.5 w-3.5" />
                              Improved
                            </span>
                          ) : item.trend === 'declined' ? (
                            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-rose-50 border border-rose-100 text-rose-700">
                              <ArrowDownRight className="h-3.5 w-3.5" />
                              Declined
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-slate-50 border border-slate-100 text-slate-700">
                              <Minus className="h-3.5 w-3.5" />
                              Unchanged
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
