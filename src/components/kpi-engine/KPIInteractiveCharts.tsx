import React, { useState, useMemo } from 'react';
import { BarChart3, PieChart, Activity, Info } from 'lucide-react';

interface KPI {
  id: string;
  name: string;
  target: string;
  achieved: string;
  performance: number;
  status: string;
}

interface KPIInteractiveChartsProps {
  parsedKpis: KPI[];
  parsedServicing: any[];
}

export default function KPIInteractiveCharts({ 
  parsedKpis, 
  parsedServicing 
}: KPIInteractiveChartsProps) {
  const [hoverIndex, setHoverIndex] = useState<string | null>(null);

  // 1. Process Status Ratio for Donut Chart
  const statusStats = useMemo(() => {
    let excellent = 0;
    let good = 0;
    let average = 0;
    let critical = 0;

    parsedKpis.forEach(k => {
      const p = k.performance;
      if (p >= 95) excellent++;
      else if (p >= 85) good++;
      else if (p >= 70) average++;
      else critical++;
    });

    const total = parsedKpis.length || 1;
    return [
      { name: 'Excellent', count: excellent, color: '#10b981', percentage: (excellent / total) * 100 },
      { name: 'Good', count: good, color: '#3b82f6', percentage: (good / total) * 100 },
      { name: 'Average', count: average, color: '#f59e0b', percentage: (average / total) * 100 },
      { name: 'Critical', count: critical, color: '#ef4444', percentage: (critical / total) * 100 }
    ];
  }, [parsedKpis]);

  // 2. Process Top Owners for Bar Chart
  const topOwnersStats = useMemo(() => {
    const ownerAggregates: Record<string, number> = {};
    parsedServicing.forEach(row => {
      const name = String(row['Wakala Name'] || row['owner_name'] || row['Owner Name'] || row['Owner'] || row['Wakala'] || 'Unknown').trim();
      const valStr = String(row['Volume (TZS)'] || row['volume'] || row['amount'] || '0').replace(/[^0-9.-]/g, '');
      const val = parseFloat(valStr) || 0;
      ownerAggregates[name] = (ownerAggregates[name] || 0) + val;
    });

    const sorted = Object.keys(ownerAggregates).map(name => ({
      name,
      value: ownerAggregates[name]
    })).sort((a, b) => b.value - a.value);

    return sorted.slice(0, 6); // Top 6 for chart spacing
  }, [parsedServicing]);

  // 3. Process Zones/Regions for Region Chart
  const regionStats = useMemo(() => {
    const regionAggregates: Record<string, number> = {};
    parsedServicing.forEach(row => {
      const zone = String(row['Zone'] || row['region'] || row['Region'] || 'Unassigned').trim();
      const valStr = String(row['Volume (TZS)'] || row['volume'] || row['amount'] || '0').replace(/[^0-9.-]/g, '');
      const val = parseFloat(valStr) || 0;
      regionAggregates[zone] = (regionAggregates[zone] || 0) + val;
    });

    return Object.keys(regionAggregates).map(name => ({
      name,
      value: regionAggregates[name]
    })).sort((a, b) => b.value - a.value);
  }, [parsedServicing]);

  // 4. Servicing Value Distribution (Histogram Buckets)
  const bucketStats = useMemo(() => {
    let under2M = 0;
    let b2to5M = 0;
    let b5to8M = 0;
    let over8M = 0;

    parsedServicing.forEach(row => {
      const valStr = String(row['Volume (TZS)'] || row['volume'] || row['amount'] || '0').replace(/[^0-9.-]/g, '');
      const val = parseFloat(valStr) || 0;
      if (val < 2000000) under2M++;
      else if (val < 5000000) b2to5M++;
      else if (val < 8000000) b5to8M++;
      else over8M++;
    });

    return [
      { name: '< 2M TZS', count: under2M },
      { name: '2M - 5M', count: b2to5M },
      { name: '5M - 8M', count: b5to8M },
      { name: '> 8M TZS', count: over8M }
    ];
  }, [parsedServicing]);

  return (
    <div className="space-y-6">
      {/* 1. DYNAMIC GRID OF 6 INTERACTIVE CHARTS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        
        {/* CHART 1: KPI PERFORMANCE BAR CHART */}
        <div className="bg-brand-card rounded-2xl border border-brand-gray-border p-5 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="space-y-1">
            <h5 className="font-extrabold text-brand-text text-sm flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4 text-brand-primary" />
              KPI Monthly Performance Ratio
            </h5>
            <p className="text-[10px] text-brand-text-variant font-medium">Percentage complete against target values</p>
          </div>

          <div className="relative h-44 w-full flex items-end justify-between pt-6 px-2">
            {/* Background grids */}
            <div className="absolute inset-x-0 bottom-0 top-6 border-b border-dashed border-slate-100 flex flex-col justify-between text-[8px] font-mono text-brand-text-variant select-none pointer-events-none">
              <div className="border-t border-dashed border-slate-100 w-full pt-1">100%</div>
              <div className="border-t border-dashed border-slate-100 w-full pt-1">50%</div>
              <div className="w-full">0%</div>
            </div>

            {/* Drawing Bars */}
            {parsedKpis.map((kpi, index) => {
              const heightPercent = Math.min(kpi.performance, 110);
              const barHeight = `${(heightPercent / 120) * 100}%`;
              const colors = kpi.performance >= 95 ? 'from-emerald-400 to-emerald-500' :
                             kpi.performance >= 85 ? 'from-blue-400 to-blue-500' :
                             kpi.performance >= 70 ? 'from-amber-400 to-amber-500' :
                             'from-rose-400 to-rose-500';

              const keyId = `bar1-${index}`;

              return (
                <div 
                  key={kpi.id} 
                  className="relative group flex flex-col items-center flex-1 h-full z-10"
                  onMouseEnter={() => setHoverIndex(keyId)}
                  onMouseLeave={() => setHoverIndex(null)}
                >
                  <div className="absolute bottom-0 w-6 bg-slate-50 border border-slate-100 rounded-t-lg h-full overflow-hidden flex items-end">
                    <div 
                      className={`w-full bg-gradient-to-t ${colors} rounded-t-md transition-all duration-500`}
                      style={{ height: barHeight }}
                    />
                  </div>
                  
                  {/* Long KPI name vertical rotation or simple label */}
                  <span className="absolute -bottom-5 text-[8px] font-bold text-brand-text-variant truncate max-w-[44px] text-center select-none" title={kpi.name}>
                    {kpi.name.substring(0, 8)}..
                  </span>

                  {/* Intersecting custom HTML Tooltip */}
                  {hoverIndex === keyId && (
                    <div className="absolute top-0 z-50 bg-slate-900 text-white rounded-lg p-2.5 text-[10px] space-y-1 shadow-md w-36 text-center">
                      <p className="font-bold border-b border-slate-700 pb-0.5 truncate">{kpi.name}</p>
                      <p className="text-brand-secondary font-black">Performance: {kpi.performance.toFixed(1)}%</p>
                      <p className="text-slate-300">Achieved: {kpi.achieved}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="h-4" /> {/* Spacer for label */}
        </div>

        {/* CHART 2: MONTHLY TARGET VS ACHIEVEMENT DOUBLE BAR */}
        <div className="bg-brand-card rounded-2xl border border-brand-gray-border p-5 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="space-y-1">
            <h5 className="font-extrabold text-brand-text text-sm flex items-center gap-1.5">
              <Activity className="h-4 w-4 text-brand-secondary" />
              Target vs MTD Achieved (Volume Share)
            </h5>
            <p className="text-[10px] text-brand-text-variant font-medium">Raw values matching Sheet 1 targets</p>
          </div>

          <div className="relative h-44 w-full flex items-end justify-between pt-6 px-2">
            <div className="absolute inset-x-0 bottom-0 top-6 border-b border-dashed border-slate-100 flex flex-col justify-between text-[8px] font-mono text-brand-text-variant select-none pointer-events-none">
              <div className="border-t border-dashed border-slate-100 w-full pt-1">Max Scale</div>
              <div className="border-t border-dashed border-slate-100 w-full pt-1">50% Scale</div>
              <div className="w-full">0</div>
            </div>

            {parsedKpis.map((kpi, index) => {
              const targetVal = String(kpi.target).replace(/[^0-9.-]/g, '');
              const achievedVal = String(kpi.achieved).replace(/[^0-9.-]/g, '');
              const tNum = parseFloat(targetVal) || 100;
              const aNum = parseFloat(achievedVal) || 50;

              const maxNum = Math.max(tNum, aNum) || 100;
              const tHeight = `${(tNum / maxNum) * 100}%`;
              const aHeight = `${(aNum / maxNum) * 100}%`;

              const keyId = `bar2-${index}`;

              return (
                <div 
                  key={kpi.id} 
                  className="relative group flex flex-col items-center flex-1 h-full z-10"
                  onMouseEnter={() => setHoverIndex(keyId)}
                  onMouseLeave={() => setHoverIndex(null)}
                >
                  {/* Two side-by-side thin bars */}
                  <div className="absolute bottom-0 flex items-end gap-0.5 h-full">
                    {/* Target Bar (Slate-Blue) */}
                    <div 
                      className="w-3 bg-slate-300 hover:bg-slate-400 rounded-t-sm transition-all duration-300"
                      style={{ height: tHeight }}
                    />
                    {/* Achieved Bar (Brand-Primary) */}
                    <div 
                      className="w-3 bg-brand-primary hover:bg-brand-primary-light rounded-t-sm transition-all duration-300"
                      style={{ height: aHeight }}
                    />
                  </div>

                  <span className="absolute -bottom-5 text-[8px] font-bold text-brand-text-variant truncate max-w-[44px] text-center" title={kpi.name}>
                    {kpi.name.substring(0, 8)}..
                  </span>

                  {hoverIndex === keyId && (
                    <div className="absolute top-0 z-50 bg-slate-900 text-white rounded-lg p-2.5 text-[10px] space-y-1 shadow-md w-36 text-center">
                      <p className="font-bold border-b border-slate-700 pb-0.5 truncate">{kpi.name}</p>
                      <p className="text-slate-300">Target: {kpi.target}</p>
                      <p className="text-brand-secondary font-black">Achieved: {kpi.achieved}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="h-4" />
        </div>

        {/* CHART 3: KPI STATUS DISTRIBUTION DONUT */}
        <div className="bg-brand-card rounded-2xl border border-brand-gray-border p-5 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="space-y-1">
            <h5 className="font-extrabold text-brand-text text-sm flex items-center gap-1.5">
              <PieChart className="h-4 w-4 text-brand-primary" />
              Target Compliance status
            </h5>
            <p className="text-[10px] text-brand-text-variant font-medium">Compliance ratios segmented across active targets</p>
          </div>

          <div className="flex items-center justify-around h-44">
            {/* Custom SVG Circular Donut Chart */}
            <svg width="100" height="100" viewBox="0 0 42 42" className="transform -rotate-90">
              <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#e2e8f0" strokeWidth="6" />
              
              {(() => {
                let accumulatedPercent = 0;
                return statusStats.map((seg, sIdx) => {
                  if (seg.percentage === 0) return null;
                  const strokeDash = `${seg.percentage} ${100 - seg.percentage}`;
                  const strokeOffset = 100 - accumulatedPercent;
                  accumulatedPercent += seg.percentage;

                  return (
                    <circle 
                      key={sIdx}
                      cx="21" 
                      cy="21" 
                      r="15.915" 
                      fill="transparent" 
                      stroke={seg.color} 
                      strokeWidth="6" 
                      strokeDasharray={strokeDash}
                      strokeDashoffset={strokeOffset}
                    />
                  );
                });
              })()}
              
              {/* Center Circle text */}
              <circle cx="21" cy="21" r="10" fill="#ffffff" />
            </svg>

            {/* Legends */}
            <div className="space-y-1.5 text-[10px] font-bold text-brand-text">
              {statusStats.map((seg, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                  <span>{seg.name}: <strong>{seg.count}</strong></span>
                </div>
              ))}
            </div>
          </div>
          <div className="h-4" />
        </div>

        {/* CHART 4: TOP 6 PERFORMING OWNERS (VOLUMES) */}
        <div className="bg-brand-card rounded-2xl border border-brand-gray-border p-5 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="space-y-1">
            <h5 className="font-extrabold text-brand-text text-sm flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4 text-brand-primary" />
              Top Active Wakalas by Volume
            </h5>
            <p className="text-[10px] text-brand-text-variant font-medium">Aggregated transaction values from Worksheet 2</p>
          </div>

          <div className="relative h-44 w-full flex flex-col justify-between pt-4">
            {topOwnersStats.map((owner, index) => {
              const maxVal = topOwnersStats[0]?.value || 1;
              const ratio = (owner.value / maxVal) * 100;

              return (
                <div key={index} className="space-y-0.5">
                  <div className="flex justify-between text-[9px] font-bold text-brand-text">
                    <span className="truncate max-w-[150px]">{owner.name}</span>
                    <span className="text-brand-primary">{owner.value.toLocaleString('en-US')} TZS</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-brand-primary rounded-full transition-all duration-500"
                      style={{ width: `${ratio}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="h-2" />
        </div>

        {/* CHART 5: REGIONAL PERFORMANCE SHARE */}
        <div className="bg-brand-card rounded-2xl border border-brand-gray-border p-5 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="space-y-1">
            <h5 className="font-extrabold text-brand-text text-sm flex items-center gap-1.5">
              <PieChart className="h-4 w-4 text-brand-secondary" />
              Regional Share Distribution
            </h5>
            <p className="text-[10px] text-brand-text-variant font-medium">Regional contribution breakdown matching Worksheet 2 Zones</p>
          </div>

          <div className="relative h-44 w-full flex flex-col justify-center gap-2">
            {regionStats.length > 0 ? (
              regionStats.map((reg, index) => {
                const totalVal = regionStats.reduce((acc, r) => acc + r.value, 0) || 1;
                const ratio = (reg.value / totalVal) * 100;
                const colors = index === 0 ? 'bg-blue-600' : index === 1 ? 'bg-amber-500' : 'bg-emerald-500';

                return (
                  <div key={index} className="space-y-0.5">
                    <div className="flex justify-between text-[9px] font-bold text-brand-text">
                      <span className="flex items-center gap-1.5 truncate max-w-[130px]">
                        <span className={`h-2 w-2 rounded-full ${colors}`} />
                        {reg.name}
                      </span>
                      <span>{ratio.toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${colors}`}
                        style={{ width: `${ratio}%` }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center text-xs text-brand-text-variant py-10 font-medium">
                No Region or Zone data found to render distribution chart.
              </div>
            )}
          </div>
          <div className="h-2" />
        </div>

        {/* CHART 6: SERVICING VALUE DISTRIBUTION HISTOGRAM */}
        <div className="bg-brand-card rounded-2xl border border-brand-gray-border p-5 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="space-y-1">
            <h5 className="font-extrabold text-brand-text text-sm flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4 text-brand-primary" />
              Servicing Value Ticket Distribution
            </h5>
            <p className="text-[10px] text-brand-text-variant font-medium">Count of transactions across volume buckets</p>
          </div>

          <div className="relative h-44 w-full flex items-end justify-between pt-6 px-2">
            <div className="absolute inset-x-0 bottom-0 top-6 border-b border-dashed border-slate-100 flex flex-col justify-between text-[8px] font-mono text-brand-text-variant select-none pointer-events-none">
              <div className="border-t border-dashed border-slate-100 w-full pt-1">Max ticket count</div>
              <div className="border-t border-dashed border-slate-100 w-full pt-1">Half count</div>
              <div className="w-full">0</div>
            </div>

            {bucketStats.map((bucket, index) => {
              const maxVal = Math.max(...bucketStats.map(b => b.count)) || 1;
              const barHeight = `${(bucket.count / maxVal) * 100}%`;
              const keyId = `bar6-${index}`;

              return (
                <div 
                  key={index} 
                  className="relative group flex flex-col items-center flex-1 h-full z-10"
                  onMouseEnter={() => setHoverIndex(keyId)}
                  onMouseLeave={() => setHoverIndex(null)}
                >
                  <div className="absolute bottom-0 w-8 bg-slate-50 border border-slate-100 rounded-t-lg h-[90%] overflow-hidden flex items-end">
                    <div 
                      className="w-full bg-gradient-to-t from-slate-400 to-slate-500 rounded-t-md hover:from-brand-primary hover:to-brand-primary-light transition-all duration-300"
                      style={{ height: barHeight }}
                    />
                  </div>

                  <span className="absolute -bottom-5 text-[8px] font-extrabold text-brand-text-variant text-center shrink-0 w-full">
                    {bucket.name}
                  </span>

                  {hoverIndex === keyId && (
                    <div className="absolute top-0 z-50 bg-slate-900 text-white rounded-lg p-2.5 text-[10px] space-y-1 shadow-md w-36 text-center">
                      <p className="font-bold border-b border-slate-700 pb-0.5 truncate">{bucket.name}</p>
                      <p className="text-brand-secondary font-black">Tickets Count: {bucket.count} rows</p>
                      <p className="text-slate-300">{((bucket.count / (parsedServicing.length || 1)) * 100).toFixed(1)}% Share</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="h-4" />
        </div>

      </div>
    </div>
  );
}
