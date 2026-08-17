import React, { useMemo } from 'react';
import { Sparkles, CheckCircle2, AlertTriangle, Lightbulb, TrendingUp, HelpCircle, ArrowUpRight } from 'lucide-react';

interface KPI {
  id: string;
  name: string;
  target: string;
  achieved: string;
  performance: number;
  status: string;
}

interface KPIBusinessInsightsProps {
  parsedKpis: KPI[];
}

export default function KPIBusinessInsights({ parsedKpis }: KPIBusinessInsightsProps) {
  const insights = useMemo(() => {
    if (!parsedKpis || parsedKpis.length === 0) {
      return {
        best: null as KPI | null,
        worst: null as KPI | null,
        exceeding: [] as KPI[],
        below: [] as KPI[],
        critical: [] as KPI[],
        close: [] as KPI[]
      };
    }

    const sorted = [...parsedKpis].sort((a, b) => b.performance - a.performance);
    const best = sorted[0] || null;
    const worst = sorted[sorted.length - 1] || null;

    const exceeding = parsedKpis.filter(k => k.performance >= 100);
    const below = parsedKpis.filter(k => k.performance < 100);
    const critical = parsedKpis.filter(k => k.performance < 70);
    const close = parsedKpis.filter(k => k.performance >= 90 && k.performance < 100);

    return {
      best,
      worst,
      exceeding,
      below,
      critical,
      close
    };
  }, [parsedKpis]);

  return (
    <div className="space-y-6">
      {/* TITLE BLOCK */}
      <div className="flex items-center gap-2 pb-2.5 border-b border-brand-gray-border font-sans">
        <Sparkles className="h-5 w-5 text-brand-secondary animate-pulse" />
        <h4 className="font-extrabold text-brand-text text-sm uppercase tracking-wider">Dynamic Ingestion Business Insights Ledger</h4>
      </div>

      {/* CORE HERO ANALYTICS RECOMMENDATIONS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* BEST PERFORMER RECOMMENDATION */}
        {insights.best && (
          <div className="bg-brand-card rounded-2xl border border-emerald-200 bg-emerald-50/15 p-5 space-y-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                <CheckCircle2 className="h-3.5 w-3.5" /> Best Performing Target
              </span>
              <strong className="text-xl font-black text-emerald-700">{insights.best.performance.toFixed(1)}%</strong>
            </div>

            <div className="space-y-1">
              <h5 className="font-extrabold text-brand-text text-sm">{insights.best.name}</h5>
              <p className="text-xs text-brand-text-variant leading-relaxed">
                This KPI is our leading target for the active month, achieving <strong>{insights.best.achieved}</strong> against a target of <strong>{insights.best.target}</strong>.
              </p>
            </div>

            <div className="p-3 bg-white/60 border border-emerald-100 rounded-xl text-[11px] text-emerald-800 font-medium leading-relaxed">
              <strong>Observation:</strong> Maintain current Wakala incentives and distribution structures that made this target excel. Use these mechanics as a blueprint for underperforming KPIs.
            </div>
          </div>
        )}

        {/* LOWEST PERFORMER RECOMMENDATION */}
        {insights.worst && (
          <div className="bg-brand-card rounded-2xl border border-rose-200 bg-rose-50/15 p-5 space-y-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded bg-rose-100 text-rose-800 border border-rose-200">
                <AlertTriangle className="h-3.5 w-3.5" /> Lowest Performing Target
              </span>
              <strong className="text-xl font-black text-rose-700">{insights.worst.performance.toFixed(1)}%</strong>
            </div>

            <div className="space-y-1">
              <h5 className="font-extrabold text-brand-text text-sm">{insights.worst.name}</h5>
              <p className="text-xs text-brand-text-variant leading-relaxed">
                Underperforming significantly. Ingested data displays <strong>{insights.worst.achieved}</strong> against a baseline target of <strong>{insights.worst.target}</strong>.
              </p>
            </div>

            <div className="p-3 bg-white/60 border border-rose-100 rounded-xl text-[11px] text-rose-800 font-medium leading-relaxed">
              <strong>Remediation:</strong> Requires immediate administrative intervention. Consider lowering float thresholds, increasing support, or restructuring Wakala commissions in lagging zones.
            </div>
          </div>
        )}
      </div>

      {/* TARGET DEVIATION LEDGER GROUPS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* EXCEEDING TARGETS */}
        <div className="bg-brand-card rounded-2xl border border-brand-gray-border p-4 shadow-sm space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <span className="text-[10px] font-bold uppercase text-emerald-700 tracking-wider block">✓ Exceeding Targets ({insights.exceeding.length})</span>
            {insights.exceeding.length > 0 ? (
              <ul className="text-xs space-y-1.5 font-bold text-brand-text pl-1">
                {insights.exceeding.map(k => (
                  <li key={k.id} className="flex justify-between items-center bg-slate-50 p-1.5 rounded-lg border border-brand-gray-border/40">
                    <span className="truncate max-w-[120px]">{k.name}</span>
                    <span className="text-emerald-600 font-black shrink-0">{k.performance.toFixed(0)}%</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-brand-text-variant">No targets exceed 100% currently.</p>
            )}
          </div>
          <p className="text-[9px] text-brand-text-variant pt-2 border-t border-brand-gray-border/40">These metrics require minimal surveillance.</p>
        </div>

        {/* CLOSE TO TARGETS */}
        <div className="bg-brand-card rounded-2xl border border-brand-gray-border p-4 shadow-sm space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <span className="text-[10px] font-bold uppercase text-blue-700 tracking-wider block">✦ Close to Target ({insights.close.length})</span>
            {insights.close.length > 0 ? (
              <ul className="text-xs space-y-1.5 font-bold text-brand-text pl-1">
                {insights.close.map(k => (
                  <li key={k.id} className="flex justify-between items-center bg-slate-50 p-1.5 rounded-lg border border-brand-gray-border/40">
                    <span className="truncate max-w-[120px]">{k.name}</span>
                    <span className="text-blue-600 font-black shrink-0">{k.performance.toFixed(0)}%</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-brand-text-variant">No targets are within 10% of 100%.</p>
            )}
          </div>
          <p className="text-[9px] text-brand-text-variant pt-2 border-t border-brand-gray-border/40">Within strike distance. Slight focus will tip these to success.</p>
        </div>

        {/* BELOW TARGETS */}
        <div className="bg-brand-card rounded-2xl border border-brand-gray-border p-4 shadow-sm space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <span className="text-[10px] font-bold uppercase text-amber-700 tracking-wider block">⚠ Lagging Targets ({insights.below.length - insights.critical.length})</span>
            {insights.below.filter(k => k.performance >= 70).length > 0 ? (
              <ul className="text-xs space-y-1.5 font-bold text-brand-text pl-1">
                {insights.below.filter(k => k.performance >= 70).map(k => (
                  <li key={k.id} className="flex justify-between items-center bg-slate-50 p-1.5 rounded-lg border border-brand-gray-border/40">
                    <span className="truncate max-w-[120px]">{k.name}</span>
                    <span className="text-amber-600 font-black shrink-0">{k.performance.toFixed(0)}%</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-brand-text-variant">No mildly lagging targets.</p>
            )}
          </div>
          <p className="text-[9px] text-brand-text-variant pt-2 border-t border-brand-gray-border/40">Adequate warning. Performance is slightly behind monthly schedule.</p>
        </div>

        {/* CRITICAL ATTENTION */}
        <div className="bg-brand-card rounded-2xl border border-brand-gray-border p-4 shadow-sm space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <span className="text-[10px] font-bold uppercase text-rose-700 tracking-wider block">☠ Critical Warnings ({insights.critical.length})</span>
            {insights.critical.length > 0 ? (
              <ul className="text-xs space-y-1.5 font-bold text-brand-text pl-1">
                {insights.critical.map(k => (
                  <li key={k.id} className="flex justify-between items-center bg-slate-50 p-1.5 rounded-lg border border-brand-gray-border/40">
                    <span className="truncate max-w-[120px]">{k.name}</span>
                    <span className="text-rose-600 font-black shrink-0">{k.performance.toFixed(0)}%</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-brand-text-variant">No critical warnings! 100% safe.</p>
            )}
          </div>
          <p className="text-[9px] text-brand-text-variant pt-2 border-t border-brand-gray-border/40">Severe deficit. Requires manual operations tuning immediately.</p>
        </div>
      </div>

      {/* 3. CORE STRATEGIC REMEDIATION ADVISORY CARD */}
      <div className="bg-brand-card rounded-2xl border border-brand-gray-border p-5 shadow-sm space-y-4">
        <h4 className="font-extrabold text-brand-text text-xs uppercase tracking-wider flex items-center gap-1.5 font-sans">
          <Lightbulb className="h-4.5 w-4.5 text-amber-500" />
          Dodoma Corporate Operations Advisory Panel
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs text-brand-text font-sans">
          <div className="p-4 rounded-xl border border-brand-gray-border bg-slate-50/50 space-y-1.5">
            <h5 className="font-extrabold text-brand-primary uppercase text-[10px] tracking-wider">A. Wakala Mobilization</h5>
            <p className="text-brand-text-variant leading-relaxed">
              Based on the <strong>{insights.exceeding.length}</strong> successful goals, Wakala registration drives are working. Scale the successful models from Zone A immediately to Arusha and Dodoma regions.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-brand-gray-border bg-slate-50/50 space-y-1.5">
            <h5 className="font-extrabold text-brand-secondary uppercase text-[10px] tracking-wider">B. Liquidity Management</h5>
            <p className="text-brand-text-variant leading-relaxed">
              With <strong>{insights.critical.length}</strong> critical warning targets, liquidity float level is struggling at the retail end. Initiate weekend cash-in-transit (CIT) routes to support active merchants.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-brand-gray-border bg-slate-50/50 space-y-1.5">
            <h5 className="font-extrabold text-brand-text uppercase text-[10px] tracking-wider">C. Incentive Adjustments</h5>
            <p className="text-brand-text-variant leading-relaxed">
              Wakala commission structures are driving high volumes in kariakoo, but ignoring outer districts. Recalibrate commissions based on regional performance margins to encourage rural servicing.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
