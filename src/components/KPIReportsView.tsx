import React, { useState, useEffect, useMemo } from 'react';
import { ViewType, KPIMetric } from '../types';
import { 
  TrendingUp, 
  TrendingDown, 
  CheckCircle, 
  DollarSign, 
  Activity, 
  ArrowUpRight, 
  ArrowDownRight, 
  DownloadCloud, 
  FileSpreadsheet,
  SlidersHorizontal,
  ChevronRight,
  ShieldCheck,
  Info
} from 'lucide-react';
import { motion } from 'motion/react';
import PageHeaderBanner from './PageHeaderBanner';
import { getServicingRows } from '../utils/indexedDB';
import { formatShortDate } from '../utils/dateFormat';
import { refreshWeeklyStatsHistory } from '../utils/weeklyHistory';
import { getServicedStatusFromColumn, mergeServicedStatus } from '../utils/servicingStatus';
import { getActivityRules, isActiveByRule, extractTxnCounts } from '../utils/activityRules';
import type { WeeklyStatsEntry } from '../utils/weeklyKpiEngine';
import { calculateCompanyKPIs } from '../utils/mappingEngine';
import { exportKPIAnalysisToPDF } from '../utils/pdfExport';
import { useReportingPeriod } from './ReportingPeriodContext';

interface KPIReportsViewProps {
  onNavigate: (view: ViewType) => void;
}

export default function KPIReportsView({ onNavigate }: KPIReportsViewProps) {
  const [selectedSort, setSelectedSort] = useState('Achievement');
  const [saTillLastUpdated, setSaTillLastUpdated] = useState<string | null>(null);
  const [baseWakalaLastUpdated, setBaseWakalaLastUpdated] = useState<string | null>(null);

  const { displayPeriod } = useReportingPeriod();

  useEffect(() => {
    const lastUpd = localStorage.getItem('saTillRegistry_lastUpdated');
    setSaTillLastUpdated(lastUpd);
    const baseLastUpd = localStorage.getItem('baseWakalaIndex_lastUpdated');
    setBaseWakalaLastUpdated(baseLastUpd);
  }, []);

  const [wakalaStats, setWakalaStats] = useState<{
    total: number;
    active: number;
    inactive: number;
    activePercent: string;
    inactivePercent: string;
    served: number;
    notServed: number;
    servedPercent: string;
    notServedPercent: string;
    /** Wakalas whose row carried no servicing_status value at all. */
    noStatus?: number;
    activeAndServed: number;
    activeAndNotServed: number;
    inactiveAndServed: number;
    inactiveAndNotServed: number;
    loading: boolean;
    error: string | null;
  } | null>(null);

  const [kpis, setKpis] = useState<KPIMetric[]>(() => {
    const saved = localStorage.getItem('dashboardKPIs');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return [];
  });

  const [weeklyHistory, setWeeklyHistory] = useState<any[]>(() => {
    const saved = localStorage.getItem('weeklyKpiHistory');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return [];
  });

  const [weeklyWakalaStatsHistory, setWeeklyWakalaStatsHistory] = useState<WeeklyStatsEntry[]>(() => {
    try {
      const saved = localStorage.getItem('weeklyWakalaStatsHistory');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [selectedMetric, setSelectedMetric] = useState<string>('');


  const handleExportPDF = () => {
    if (kpis.length === 0) return;
    exportKPIAnalysisToPDF({
      kpis,
      wakalaStats: (wakalaStats && !wakalaStats.error) ? wakalaStats : null,
      regionalData: [],
      districtData: [],
      selectedRegion: null,
      progressMetrics,
      activeMonth,
      selectedMetric,
    });
  };

  // Auto-select first metric if none is selected
  useEffect(() => {
    if (kpis.length > 0 && !selectedMetric) {
      setSelectedMetric(kpis[0].name);
    }
  }, [kpis, selectedMetric]);

  // Use global displayPeriod for activeMonth
  const activeMonth = displayPeriod;

  // Extract unique KPI options from kpis array
  const kpiOptions = useMemo(() => {
    return kpis.map(k => k.name);
  }, [kpis]);

  // Progress metrics calculations
  const progressMetrics = useMemo(() => {
    if (!selectedMetric || kpis.length === 0) return null;

    const monthlyKpi = kpis.find(k => k.name === selectedMetric);
    if (!monthlyKpi) return null;

    const monthlyTargetVal = monthlyKpi.targetVal || 0;
    const monthlyTargetLabel = monthlyKpi.target || '0';

    // Extract weekly points for the selected metric and activeMonth
    const weeklyPoints = weeklyHistory
      .filter((h: any) => h.reportingMonth === activeMonth)
      .map((h: any) => {
        const matchedKpi = h.kpis?.find((k: any) => k.name === selectedMetric);
        const weekNum = parseInt(h.reportingWeek.match(/Week (\d+)/)?.[1] || '0', 10);
        return {
          reportingWeek: h.reportingWeek,
          weekNum,
          achievedVal: matchedKpi ? (matchedKpi.achievedVal !== undefined ? matchedKpi.achievedVal : parseFloat(String(matchedKpi.achieved || '0').replace(/[^0-9.-]/g, '')) || 0) : 0,
          achievedLabel: matchedKpi ? matchedKpi.achieved : '0',
          uploadDate: h.uploadDate,
          fileName: h.fileName
        };
      })
      .sort((a, b) => a.weekNum - b.weekNum);

    const latestWeeklyPoint = weeklyPoints.length > 0 ? weeklyPoints[weeklyPoints.length - 1] : null;
    const latestWeeklyAchievedVal = latestWeeklyPoint ? latestWeeklyPoint.achievedVal : 0;
    const latestWeeklyAchievedLabel = latestWeeklyPoint ? latestWeeklyPoint.achievedLabel : '—';

    const progressPercent = monthlyTargetVal > 0 ? Math.round((latestWeeklyAchievedVal / monthlyTargetVal) * 100) : 0;
    const remainingVal = Math.max(0, monthlyTargetVal - latestWeeklyAchievedVal);

    // Format remaining values dynamically
    let remainingLabel = remainingVal.toLocaleString('en-US');
    if (monthlyTargetLabel.includes('TZS') || monthlyTargetLabel.toLowerCase().includes('shillings') || monthlyTargetLabel.toLowerCase().includes('val')) {
      remainingLabel = `TZS ${remainingVal.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
    } else if (monthlyTargetLabel.includes('%')) {
      remainingLabel = `${remainingVal.toFixed(1)}%`;
    }

    // Trajectory Status
    let trajectoryStatus = 'NO CHECKPOINTS';
    let trajectoryColor = 'text-slate-500 bg-slate-50 border-slate-200';
    if (latestWeeklyPoint) {
      const currentWeek = latestWeeklyPoint.weekNum; // 1, 2, 3, 4
      const expectedProgress = currentWeek * 25; // 25% per week linear
      if (progressPercent >= expectedProgress) {
        trajectoryStatus = 'AHEAD OF SCHEDULE';
        trajectoryColor = 'text-emerald-700 bg-emerald-50 border-emerald-200';
      } else if (progressPercent >= expectedProgress - 15) {
        trajectoryStatus = 'ON TRACK';
        trajectoryColor = 'text-blue-700 bg-blue-50 border-blue-200';
      } else {
        trajectoryStatus = 'BEHIND SCHEDULE';
        trajectoryColor = 'text-rose-700 bg-rose-50 border-rose-200';
      }
    }

    return {
      monthlyTargetVal,
      monthlyTargetLabel,
      weeklyPoints,
      latestWeeklyPoint,
      latestWeeklyAchievedVal,
      latestWeeklyAchievedLabel,
      progressPercent,
      remainingVal,
      remainingLabel,
      trajectoryStatus,
      trajectoryColor
    };
  }, [kpis, weeklyHistory, selectedMetric, activeMonth]);

  const loadWakalaStats = async () => {
    try {
      const rows = await getServicingRows(displayPeriod);
      if (!rows || rows.length === 0) {
        setWakalaStats({
          total: 0,
          active: 0,
          inactive: 0,
          activePercent: '0',
          inactivePercent: '0',
          served: 0,
          notServed: 0,
          servedPercent: '0',
          notServedPercent: '0',
          activeAndServed: 0,
          activeAndNotServed: 0,
          inactiveAndServed: 0,
          inactiveAndNotServed: 0,
          loading: false,
          error: "No wakala data available for this month yet."
        });
        return;
      }

      // Active/inactive follows the same configurable system rule as the
      // weekly engine (transaction count + amount thresholds from Settings)
      // instead of a raw status column, so Monthly and Weekly never disagree.
      const rules = getActivityRules();

      const getFieldValue = (row: any, keys: string[]): number => {
        for (const k of keys) {
          if (row[k] !== undefined && row[k] !== null) {
            const valStr = String(row[k]).replace(/,/g, '').trim();
            const val = parseFloat(valStr);
            if (!isNaN(val)) return val;
          }
        }
        for (const rowKey of Object.keys(row)) {
          const normRowKey = rowKey.toLowerCase().replace(/[\s_-]+/g, '');
          for (const searchKey of keys) {
            const normSearchKey = searchKey.toLowerCase().replace(/[\s_-]+/g, '');
            if (normRowKey === normSearchKey) {
              const valStr = String(row[rowKey]).replace(/,/g, '').trim();
              const val = parseFloat(valStr);
              if (!isNaN(val)) return val;
            }
          }
        }
        return 0;
      };

      // Company-wide totals for averages and stats
      const companyWakalaMap = new Map<string, { txns: number; val: number; isProductSeller: boolean; isServed: boolean; isActiveStatus: boolean; servedStatus: boolean | null }>();
      let companyTotalCI = 0;
      let companyTotalCO = 0;
      let companyTotalServicingVal = 0;

      rows.forEach(row => {
        const msisdn = String(row.MSISDN || row.msisdn || row.phone || row.Phone || '').trim();
        const txns = getFieldValue(row, ['SA_Servicing_Txns', 'SA Servicing Txns', 'sa_servicing_txns']);
        const val = getFieldValue(row, ['SA_Servicing_Val', 'SA Servicing Val', 'sa_servicing_val']);
        const productSellerVal = getFieldValue(row, ['SA_Product_Sellers', 'SA Product Sellers', 'product_sellers', 'product_seller', 'Product_Sales', 'Product Sales']);
        const isProductSeller = productSellerVal > 0 || row.Product_Seller === true || String(row.Product_Seller).toLowerCase() === 'true' || String(row.Product_Seller).toLowerCase() === 'yes';
        const rowActive = isActiveByRule(extractTxnCounts(row), rules);

        const ci = getFieldValue(row, ['CI_val', 'CI val', 'ci_val', 'Cash In Value', 'Cash-In Value', 'Cash-In', 'Cash In', 'deposit', 'Deposit']);
        const co = getFieldValue(row, ['CO_val', 'CO val', 'co_val', 'Cash Out Value', 'Cash-Out Value', 'Cash-Out', 'Cash Out', 'withdrawal', 'Withdrawal']);
        
        companyTotalCI += ci;
        companyTotalCO += co;
        companyTotalServicingVal += val;

        if (msisdn) {
          const existing = companyWakalaMap.get(msisdn);
          if (existing) {
            existing.txns += txns;
            existing.val += val;
            if (isProductSeller) existing.isProductSeller = true;
            if (txns > 0 || val > 0) existing.isServed = true;
            if (rowActive) existing.isActiveStatus = true;
            existing.servedStatus = mergeServicedStatus(existing.servedStatus, getServicedStatusFromColumn(row));
          } else {
            companyWakalaMap.set(msisdn, {
              txns,
              val,
              isProductSeller,
              isServed: txns > 0 || val > 0,
              isActiveStatus: rowActive,
              servedStatus: getServicedStatusFromColumn(row)
            });
          }
        }
      });

      let companyActiveCount = 0;
      let companyServedCount = 0;
      let companyProductSellerCount = 0;

      let activeAndServed = 0;
      let activeAndNotServed = 0;
      let inactiveAndServed = 0;
      let inactiveAndNotServed = 0;

      let companyNoStatusCount = 0;
      let companyNotServedCount = 0;

      companyWakalaMap.forEach(({ isProductSeller, isActiveStatus, servedStatus }) => {
        // Served/unserved is read from the uploaded servicing_status column.
        // Monthly files do not carry it yet, so those rows are reported as
        // "no status data" rather than guessed at.
        const isServedWakala = servedStatus === true;

        if (isActiveStatus) {
          companyActiveCount++;
        }
        if (servedStatus === true) {
          companyServedCount++;
        } else if (servedStatus === false) {
          companyNotServedCount++;
        } else {
          companyNoStatusCount++;
        }
        if (isProductSeller) {
          companyProductSellerCount++;
        }

        if (isActiveStatus && isServedWakala) activeAndServed++;
        else if (isActiveStatus && !isServedWakala) activeAndNotServed++;
        else if (!isActiveStatus && isServedWakala) inactiveAndServed++;
        else if (!isActiveStatus && !isServedWakala) inactiveAndNotServed++;
      });

      const total = companyWakalaMap.size || 1;
      const active = companyActiveCount;
      const inactive = companyWakalaMap.size - active;
      const activePercent = ((active / total) * 100).toFixed(1);
      const inactivePercent = ((inactive / total) * 100).toFixed(1);

      const served = companyServedCount;
      const notServed = companyNotServedCount;
      const statusDenom = served + notServed || 1;
      const servedPercent = ((served / statusDenom) * 100).toFixed(1);
      const notServedPercent = ((notServed / statusDenom) * 100).toFixed(1);

      setWakalaStats({
        total: companyWakalaMap.size,
        noStatus: companyNoStatusCount,
        active,
        inactive,
        activePercent,
        inactivePercent,
        served,
        notServed,
        servedPercent,
        notServedPercent,
        activeAndServed,
        activeAndNotServed,
        inactiveAndServed,
        inactiveAndNotServed,
        loading: false,
        error: null
      });
    } catch (e: any) {
      console.error("Error loading wakala stats:", e);
      setWakalaStats((prev: any) => ({
        ...(prev || {}),
        total: 0,
        active: 0,
        inactive: 0,
        activePercent: '0',
        inactivePercent: '0',
        loading: false,
        error: `Error loading wakala data: ${e.message || e}`
      }));
    }
  };

  // Weekly equivalent of loadWakalaStats — same rules, shared engine, and now
  // sourced from Postgres (IndexedDB stays an offline mirror only).
  const loadWeeklyWakalaStats = async () => {
    try {
      const entries = await refreshWeeklyStatsHistory();
      setWeeklyWakalaStatsHistory(entries);
    } catch (e) {
      console.error('Error loading weekly wakala stats:', e);
    }
  };

  useEffect(() => {
    loadWakalaStats();
    loadWeeklyWakalaStats();
  }, []);


  useEffect(() => {
    const handleUpdate = () => {
      const savedKpis = localStorage.getItem('dashboardKPIs');
      if (savedKpis) {
        try {
          setKpis(JSON.parse(savedKpis));
        } catch (e) {
          setKpis([]);
        }
      } else {
        setKpis([]);
      }

      const savedWeekly = localStorage.getItem('weeklyKpiHistory');
      if (savedWeekly) {
        try {
          setWeeklyHistory(JSON.parse(savedWeekly));
        } catch (e) {
          setWeeklyHistory([]);
        }
      } else {
        setWeeklyHistory([]);
      }

      loadWakalaStats();
      loadWeeklyWakalaStats();

    };
    window.addEventListener('servicing-rows-updated', handleUpdate);
    window.addEventListener('weekly-kpi-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('servicing-rows-updated', handleUpdate);
      window.removeEventListener('weekly-kpi-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const normalizeStatus = (statusStr: string, performance?: number): 'ON TRACK' | 'ACHIEVED' | 'NEEDS ATTENTION' | 'CRITICAL' => {
    const s = String(statusStr || '').trim().toUpperCase();
    if (s.includes('ACHIEVED') || s.includes('EXCEEDED') || s.includes('MET') || s === 'SUCCESS' || s === 'GREEN' || s === 'GOOD') {
      return 'ACHIEVED';
    }
    if (s.includes('AVERAGE')) {
      return 'NEEDS ATTENTION';
    }
    if (s.includes('ATTENTION') || s.includes('WARN') || s.includes('RISK') || s.includes('BEHIND') || s === 'YELLOW') {
      return 'NEEDS ATTENTION';
    }
    if (s.includes('CRITICAL') || s.includes('BELOW') || s.includes('FAIL') || s.includes('ERROR') || s === 'RED') {
      return 'CRITICAL';
    }
    if (s.includes('ON TRACK') || s === 'OK' || s === 'NORMAL') {
      return 'ON TRACK';
    }

    // Safety net derivation using actual performance percentage
    if (performance !== undefined && !isNaN(performance)) {
      if (performance >= 100) return 'ACHIEVED';
      if (performance >= 85) return 'ON TRACK';
      if (performance >= 60) return 'NEEDS ATTENTION';
      return 'CRITICAL';
    }

    return 'ON TRACK';
  };

  const getSemanticBadgeInfo = (status: string, performance?: number) => {
    const norm = normalizeStatus(status, performance);
    switch (norm) {
      case 'ACHIEVED':
        return {
          badgeText: 'Achieved',
          bgClass: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
          progressClass: 'bg-emerald-500',
        };
      case 'NEEDS ATTENTION':
        return {
          badgeText: String(status || '').toUpperCase().includes('RISK') ? 'At Risk' : 'Needs Attention',
          bgClass: 'bg-amber-50 text-amber-700 border-amber-200/60',
          progressClass: 'bg-amber-500',
        };
      case 'CRITICAL':
        return {
          badgeText: 'Critical',
          bgClass: 'bg-rose-50 text-rose-700 border-rose-200/60',
          progressClass: 'bg-rose-500',
        };
      default:
        return {
          badgeText: 'On Track',
          bgClass: 'bg-blue-50 text-brand-primary border-blue-200/60',
          progressClass: 'bg-brand-primary-light',
        };
    }
  };

  const getStripeColorClass = (index: number) => {
    const colors = [
      'bg-brand-primary',
      'bg-brand-accent-hover',
      'bg-slate-400',
      'bg-indigo-500',
      'bg-blue-500',
      'bg-emerald-500'
    ];
    return colors[index % colors.length];
  };


  const regionalZones = [
    { zone: 'Zone A (Dar es Salaam)', percentage: 42, active: true },
    { zone: 'Zone B (Arusha/Mwanza)', percentage: 28, active: false },
    { zone: 'Zone C (Dodoma)', percentage: 18, active: false },
    { zone: 'Zone D (Zanzibar)', percentage: 12, active: false },
  ];

  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case 'EXCEEDED':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'MET':
        return 'bg-blue-50 text-brand-primary border-blue-200';
      case 'BELOW TARGET':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 max-w-[1440px] mx-auto p-4 sm:p-6 lg:p-8 font-sans"
    >
      {/* Title Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <PageHeaderBanner
            icon={TrendingUp}
            title="KPI Reports"
            subtitle="Performance intelligence and strategic economic indicators across networks."
          />
          {(saTillLastUpdated || baseWakalaLastUpdated) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {saTillLastUpdated && (
                <div className="inline-flex items-center gap-1.5 text-xs text-slate-700 bg-slate-100 dark:bg-slate-800/80 dark:text-slate-200 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span>SA Till Registry last updated: <strong>{saTillLastUpdated}</strong></span>
                </div>
              )}
              {baseWakalaLastUpdated && (
                <div className="inline-flex items-center gap-1.5 text-xs text-slate-700 bg-slate-100 dark:bg-slate-800/80 dark:text-slate-200 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700">
                  <ShieldCheck className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                  <span>Base Wakala Index last updated: <strong>{baseWakalaLastUpdated}</strong></span>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          <button 
            onClick={handleExportPDF}
            disabled={kpis.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-primary px-3.5 py-2.5 text-xs font-bold text-white shadow-ambient hover:bg-brand-primary-light transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <DownloadCloud className="h-4 w-4" />
            Export PDF
          </button>

        </div>
      </div>

      {kpis.length === 0 ? (
        <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-12 shadow-ambient text-center flex flex-col items-center justify-center gap-4 my-8" id="kpi-reports-empty-state">
          <div className="h-16 w-16 rounded-2xl bg-brand-primary/10 text-brand-primary flex items-center justify-center">
            <FileSpreadsheet className="h-8 w-8" />
          </div>
          <div className="space-y-2 max-w-md">
            <h3 className="font-sans text-lg font-bold text-brand-text">No KPI Data Uploaded Yet</h3>
            <p className="font-sans text-xs text-brand-text-variant leading-relaxed">
              No KPI data uploaded yet — go to Upload Reports to sync this month's KPI Summary
            </p>
          </div>
          <button
            onClick={() => onNavigate(ViewType.UPLOAD_REPORTS)}
            className="inline-flex items-center gap-2 bg-brand-primary text-white text-xs font-bold px-5 py-3 rounded-xl cursor-pointer hover:bg-opacity-90 transition-all shadow-sm mt-2"
            id="kpi-reports-upload-btn"
          >
            <DownloadCloud className="h-4.5 w-4.5 rotate-180" />
            Upload Reports
          </button>
        </div>
      ) : (
        <>
          {/* Three Visually Distinct Groups */}
          <div className="space-y-6">
            {/* GROUP 1: Telecom-Reported KPIs */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-brand-text uppercase tracking-wider">
                    Telecom-Reported KPIs
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-600 border border-slate-200">
                    Financial &amp; Volume Metrics
                  </span>
                </div>
                <span className="text-[11px] text-brand-text-variant font-medium hidden sm:inline">
                  Monthly Performance Targets
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {kpis.map((kpi, idx) => {
                  const badge = getSemanticBadgeInfo(kpi.status, kpi.performance);
                  const stripeColor = getStripeColorClass(idx);
                  return (
                    <div 
                      key={kpi.id} 
                      className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient relative overflow-hidden flex flex-col justify-between h-full min-h-[148px]"
                      id={`kpi-card-${kpi.id}`}
                    >
                      <div className={`absolute top-0 left-0 w-1.5 h-full ${stripeColor}`} />
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className="block text-[10px] font-bold text-brand-text-variant uppercase tracking-wider line-clamp-1">
                            {kpi.name}
                          </span>
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[9px] font-bold tracking-wider shrink-0 ${badge.bgClass}`}>
                            {badge.badgeText}
                          </span>
                        </div>
                        <span className="block text-lg sm:text-xl lg:text-2xl font-black text-brand-text tracking-tight font-mono break-words leading-tight">
                          {kpi.achieved}
                        </span>
                      </div>
                      <div className="mt-4 pt-2 border-t border-brand-gray-border/30">
                        <div className="flex justify-between items-center text-[10px] font-semibold text-brand-text-variant mb-1">
                          <span className="truncate pr-1">Target: {kpi.target}</span>
                          <span className="shrink-0">{kpi.performance}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${badge.progressClass}`} style={{ width: `${Math.min(100, kpi.performance)}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* GROUP 2: Wakala Activity Comparison */}
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/60 border border-slate-200/80">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-brand-text uppercase tracking-wider">
                    Wakala Activity Comparison
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/70">
                    Telecom Status vs. Company Rule
                  </span>
                </div>
                <span className="text-[11px] text-brand-text-variant font-medium hidden sm:inline">
                  Registration &amp; Servicing Comparison
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Custom Active Wakala (Telecom Status) Card */}
                <div 
                  className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient relative overflow-hidden flex flex-col justify-between h-full min-h-[160px]"
                  id="company-active-wakalas-card"
                >
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-600" />
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="block text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">
                        Active Wakalas (Telecom Status)
                      </span>
                      <div className="relative group shrink-0">
                        <span className="inline-flex items-center rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200/60 px-2 py-0.5 text-[9px] font-bold tracking-wider cursor-help">
                          Status Info
                        </span>
                        <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block w-64 bg-slate-900 text-white text-[11px] rounded-lg p-2.5 shadow-xl z-50 leading-relaxed font-normal">
                          Active = Registered wakalas assigned Active status in telecom servicing records (wakala_status = 1)
                        </div>
                      </div>
                    </div>
                    
                    {wakalaStats ? (
                      wakalaStats.error ? (
                        <div className="text-[11px] font-medium text-rose-500 mt-2 bg-rose-50/50 p-2 rounded-lg border border-rose-100">
                          {wakalaStats.error}
                        </div>
                      ) : (
                        <div className="mt-2.5 space-y-2 text-xs">
                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-brand-text-variant">Total Wakalas:</span>
                            <span className="font-bold text-brand-text text-[13px] font-mono">{wakalaStats.total}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-brand-text-variant">Active Status:</span>
                            <span className="font-bold text-emerald-600 text-[13px] font-mono">
                              {wakalaStats.active} <span className="text-[10px] font-semibold">({wakalaStats.activePercent}%)</span>
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-brand-text-variant">Inactive Status:</span>
                            <span className="font-bold text-rose-600 text-[13px] font-mono">
                              {wakalaStats.inactive} <span className="text-[10px] font-semibold">({wakalaStats.inactivePercent}%)</span>
                            </span>
                          </div>
                        </div>
                      )
                    ) : (
                      <span className="block text-xs text-brand-text-variant mt-2 animate-pulse">Loading stats...</span>
                    )}
                  </div>
                  
                  {wakalaStats && !wakalaStats.error && (
                    <div className="mt-4 border-t border-brand-gray-border/40 pt-2.5">
                      <div className="flex justify-between items-center text-[10px] font-semibold text-brand-text-variant mb-1">
                        <span>Active Ratio</span>
                        <span>{wakalaStats.activePercent}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full bg-emerald-600" 
                          style={{ width: `${wakalaStats.activePercent}%` }} 
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Custom Served Wakala (Company Rule) Card */}
                <div 
                  className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient relative overflow-hidden flex flex-col justify-between h-full min-h-[160px]"
                  id="company-served-wakalas-card"
                >
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-600" />
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="block text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">
                        Served Wakalas (Company Rule)
                      </span>
                      <div className="relative group shrink-0">
                        <span className="inline-flex items-center rounded-full border bg-indigo-50 text-indigo-700 border-indigo-200/60 px-2 py-0.5 text-[9px] font-bold tracking-wider cursor-help">
                          Rule Info
                        </span>
                        <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block w-64 bg-slate-900 text-white text-[11px] rounded-lg p-2.5 shadow-xl z-50 leading-relaxed font-normal">
                          Served = Active status: &gt;6 txns or &gt;600,000 TZS value; Inactive status: &gt;6 txns only
                        </div>
                      </div>
                    </div>
                    
                    {wakalaStats ? (
                      wakalaStats.error ? (
                        <div className="text-[11px] font-medium text-rose-500 mt-2 bg-rose-50/50 p-2 rounded-lg border border-rose-100">
                          {wakalaStats.error}
                        </div>
                      ) : (
                        <div className="mt-2.5 space-y-2 text-xs">
                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-brand-text-variant">Total Wakalas:</span>
                            <span className="font-bold text-brand-text text-[13px] font-mono">{wakalaStats.total}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-brand-text-variant">Served Wakalas:</span>
                            <span className="font-bold text-indigo-600 text-[13px] font-mono">
                              {wakalaStats.served} <span className="text-[10px] font-semibold">({wakalaStats.servedPercent}%)</span>
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-brand-text-variant">Not Served:</span>
                            <span className="font-bold text-amber-600 text-[13px] font-mono">
                              {wakalaStats.notServed} <span className="text-[10px] font-semibold">({wakalaStats.notServedPercent}%)</span>
                            </span>
                          </div>
                        </div>
                      )
                    ) : (
                      <span className="block text-xs text-brand-text-variant mt-2 animate-pulse">Loading stats...</span>
                    )}
                  </div>
                  
                  {wakalaStats && !wakalaStats.error && (
                    <div className="mt-4 border-t border-brand-gray-border/40 pt-2.5">
                      <div className="flex justify-between items-center text-[10px] font-semibold text-brand-text-variant mb-1">
                        <span>Served Ratio</span>
                        <span>{wakalaStats.servedPercent}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full bg-indigo-600" 
                          style={{ width: `${wakalaStats.servedPercent}%` }} 
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* GROUP 2B: Weekly Wakala Stats Trend (Served / Unserved per uploaded week) */}
            <div className="p-4 sm:p-5 bg-brand-card rounded-2xl border border-brand-gray-border/80 shadow-ambient">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-brand-text uppercase tracking-wide">
                    Weekly Wakala Stats
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/70">
                    Same Company Rule, Weekly Data
                  </span>
                </div>
                <span className="text-[11px] text-brand-text-variant font-medium hidden sm:inline">
                  {weeklyWakalaStatsHistory.length} week{weeklyWakalaStatsHistory.length === 1 ? '' : 's'} tracked
                </span>
              </div>

              {weeklyWakalaStatsHistory.length === 0 ? (
                <div className="text-[11px] font-medium text-brand-text-variant bg-brand-gray-hover/40 p-3 rounded-lg border border-brand-gray-border/50">
                  No weekly KPI data uploaded yet. Upload a Weekly KPI workbook to start building the served/unserved trend.
                </div>
              ) : (
                <div className="space-y-3">
                  {weeklyWakalaStatsHistory.map(w => (
                    <div key={`${w.reportingWeek}-${w.uploadedAt}`} className="rounded-xl border border-brand-gray-border/60 bg-brand-gray-hover/20 p-3">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-xs font-bold text-brand-text">{w.reportingWeek}</span>
                        <span className="font-mono text-[11px] font-bold text-indigo-600">{w.servedPercent}% served</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-indigo-600" style={{ width: `${w.servedPercent}%` }} />
                      </div>
                      <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                        <div className="flex justify-between sm:block">
                          <span className="font-semibold text-brand-text-variant">Total</span>
                          <span className="sm:block font-mono font-bold text-brand-text">{w.total}</span>
                        </div>
                        <div className="flex justify-between sm:block">
                          <span className="font-semibold text-brand-text-variant">Active</span>
                          <span className="sm:block font-mono font-bold text-emerald-600">{w.active}</span>
                        </div>
                        <div className="flex justify-between sm:block">
                          <span className="font-semibold text-brand-text-variant">Served</span>
                          <span className="sm:block font-mono font-bold text-indigo-600">{w.served}</span>
                        </div>
                        <div className="flex justify-between sm:block">
                          <span className="font-semibold text-brand-text-variant">Not Served</span>
                          <span className="sm:block font-mono font-bold text-amber-600">{w.notServed} <span className="text-[10px]">({w.notServedPercent}%)</span></span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>



            {/* GROUP 3: Cross-Tabulation Wakala Operational Matrix */}
            {wakalaStats && !wakalaStats.error && (
              <div className="p-4 sm:p-5 bg-brand-card rounded-2xl border border-brand-gray-border/80 shadow-ambient">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-brand-text uppercase tracking-wider">
                      Wakala Operational Matrix (Active Status vs. Served Rule)
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/70">
                      Cross-Tabulation
                    </span>
                  </div>
                  <span className="text-[11px] text-brand-text-variant font-medium">
                    Total Evaluated: <strong className="text-brand-text font-mono">{wakalaStats.total}</strong> Wakalas
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Active & Served */}
                  <div className="p-3.5 bg-emerald-50/60 border border-emerald-200/80 rounded-xl flex flex-col justify-between gap-1 h-full">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-[11px] text-emerald-900 uppercase tracking-wide">Active &amp; Served</span>
                      <span className="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-200/80 text-emerald-900 rounded">
                        {((wakalaStats.activeAndServed / (wakalaStats.total || 1)) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-xl font-black text-emerald-800 font-mono my-1">
                      {wakalaStats.activeAndServed}
                    </div>
                    <p className="text-[10px] text-emerald-700 leading-tight">
                      Fully operational — active telecom status &amp; meets company served threshold
                    </p>
                  </div>

                  {/* Active & Not Served */}
                  <div className="p-3.5 bg-amber-50/60 border border-amber-200/80 rounded-xl flex flex-col justify-between gap-1 h-full">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-[11px] text-amber-900 uppercase tracking-wide">Active &amp; Not Served</span>
                      <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-200/80 text-amber-900 rounded">
                        {((wakalaStats.activeAndNotServed / (wakalaStats.total || 1)) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-xl font-black text-amber-800 font-mono my-1">
                      {wakalaStats.activeAndNotServed}
                    </div>
                    <p className="text-[10px] text-amber-700 leading-tight">
                      Underperforming — registered active but below activity threshold (re-engagement target)
                    </p>
                  </div>

                  {/* Inactive & Served */}
                  <div className="p-3.5 bg-sky-50/60 border border-sky-200/80 rounded-xl flex flex-col justify-between gap-1 h-full">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-[11px] text-sky-900 uppercase tracking-wide">Inactive &amp; Served</span>
                      <span className="px-1.5 py-0.5 text-[9px] font-bold bg-sky-200/80 text-sky-900 rounded">
                        {((wakalaStats.inactiveAndServed / (wakalaStats.total || 1)) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-xl font-black text-sky-800 font-mono my-1">
                      {wakalaStats.inactiveAndServed}
                    </div>
                    <p className="text-[10px] text-sky-700 leading-tight">
                      Recent activity on inactive account — pending status update in telecom records
                    </p>
                  </div>

                  {/* Inactive & Not Served */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col justify-between gap-1 h-full">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-[11px] text-slate-700 uppercase tracking-wide">Inactive &amp; Not Served</span>
                      <span className="px-1.5 py-0.5 text-[9px] font-bold bg-slate-200 text-slate-700 rounded">
                        {((wakalaStats.inactiveAndNotServed / (wakalaStats.total || 1)) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-xl font-black text-slate-800 font-mono my-1">
                      {wakalaStats.inactiveAndNotServed}
                    </div>
                    <p className="text-[10px] text-slate-600 leading-tight">
                      Dormant wakalas — inactive status and no significant servicing volume
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Progress Toward Target Tracker */}
          {progressMetrics && (
            <div className="bg-brand-card rounded-2xl border border-brand-gray-border shadow-ambient p-6 mt-6 animate-fade-in" id="kpi-weekly-progress-tracker">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-brand-gray-border/50 pb-5 mb-6">
                <div>
                  <h3 className="text-sm font-bold text-brand-text flex items-center gap-2">
                    <Activity size={16} className="text-brand-primary" />
                    Weekly Progress Toward Monthly Target ({activeMonth})
                  </h3>
                  <p className="text-xs text-brand-text-variant mt-1">
                    Track incremental progress and run trajectory forecasting using the latest weekly KPI checkpoint.
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  <label className="text-xs font-bold text-brand-text-variant uppercase tracking-wider whitespace-nowrap">
                    Selected KPI:
                  </label>
                  <select
                    value={selectedMetric}
                    onChange={(e) => setSelectedMetric(e.target.value)}
                    className="rounded-xl border border-brand-gray-border bg-white px-3.5 py-2 text-xs font-bold text-brand-text focus:border-brand-primary focus:outline-none shadow-xs"
                  >
                    {kpiOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Status Comparison Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-slate-50/50 rounded-xl p-4 border border-brand-gray-border/60">
                  <span className="block text-[10px] font-bold text-brand-text-variant uppercase tracking-wider mb-1">
                    Monthly Target
                  </span>
                  <span className="block text-xl font-black text-brand-text">
                    {progressMetrics.monthlyTargetLabel}
                  </span>
                  <span className="block text-[10px] text-brand-text-variant mt-1.5 leading-none">
                    Target baseline set for {activeMonth}
                  </span>
                </div>

                <div className="bg-slate-50/50 rounded-xl p-4 border border-brand-gray-border/60">
                  <span className="block text-[10px] font-bold text-brand-text-variant uppercase tracking-wider mb-1">
                    Latest Weekly Achieved
                  </span>
                  <span className="block text-xl font-black text-brand-text">
                    {progressMetrics.latestWeeklyAchievedLabel}
                  </span>
                  <span className="block text-[10px] text-brand-text-variant mt-1.5 leading-none">
                    {progressMetrics.latestWeeklyPoint 
                      ? `From ${progressMetrics.latestWeeklyPoint.reportingWeek}`
                      : 'No weekly data uploaded yet'}
                  </span>
                </div>

                <div className="bg-slate-50/50 rounded-xl p-4 border border-brand-gray-border/60">
                  <span className="block text-[10px] font-bold text-brand-text-variant uppercase tracking-wider mb-1">
                    Target Achievement %
                  </span>
                  <span className="block text-xl font-black text-brand-text">
                    {progressMetrics.progressPercent}%
                  </span>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className={`inline-block h-2 w-2 rounded-full ${
                      progressMetrics.progressPercent >= 100 
                        ? 'bg-emerald-500' 
                        : progressMetrics.progressPercent >= 50 
                          ? 'bg-blue-500' 
                          : 'bg-amber-500'
                    }`} />
                    <span className="text-[10px] font-bold text-brand-text-variant">
                      {progressMetrics.progressPercent >= 100 ? 'Target Achieved' : 'In Progress'}
                    </span>
                  </div>
                </div>

                <div className="bg-slate-50/50 rounded-xl p-4 border border-brand-gray-border/60">
                  <span className="block text-[10px] font-bold text-brand-text-variant uppercase tracking-wider mb-1">
                    Trajectory Forecast
                  </span>
                  <span className="block text-xl font-black text-brand-text">
                    {progressMetrics.trajectoryStatus === 'NO CHECKPOINTS' ? 'No Data' : progressMetrics.progressPercent + '%'}
                  </span>
                  <div className="mt-1.5">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-extrabold tracking-wider ${progressMetrics.trajectoryColor}`}>
                      {progressMetrics.trajectoryStatus}
                    </span>
                  </div>
                </div>
              </div>

              {/* Progress Bar Gauge */}
              <div className="bg-slate-50/20 border border-brand-gray-border/50 rounded-xl p-5 mb-6">
                <div className="flex justify-between items-center text-xs font-bold text-brand-text mb-2">
                  <span>Cumulative Monthly Target Achievement</span>
                  <span className="text-brand-primary">{progressMetrics.progressPercent}%</span>
                </div>
                <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden relative">
                  <div 
                    className="h-full rounded-full bg-brand-primary transition-all duration-500 relative overflow-hidden" 
                    style={{ width: `${Math.min(100, progressMetrics.progressPercent)}%` }}
                  >
                    <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/20 to-transparent animate-[shimmer_2s_infinite]" />
                  </div>
                </div>
                <div className="flex justify-between text-[10px] text-brand-text-variant mt-2 font-semibold">
                  <span>0% Achieved</span>
                  {progressMetrics.remainingVal > 0 ? (
                    <span className="text-rose-600 font-bold">Remaining to target: {progressMetrics.remainingLabel}</span>
                  ) : (
                    <span className="text-emerald-600 font-bold">Target fully met! (Exceeded by {Math.abs(progressMetrics.remainingVal).toLocaleString()})</span>
                  )}
                  <span>100% Target</span>
                </div>
              </div>

              {/* Timeline of Weekly Checkpoints */}
              <div>
                <h4 className="text-xs font-extrabold text-brand-text uppercase tracking-wider mb-4">
                  Weekly Checkpoint Trajectory
                </h4>

                {progressMetrics.weeklyPoints.length === 0 ? (
                  <div className="bg-slate-50/50 rounded-xl border border-dashed border-brand-gray-border p-8 text-center flex flex-col items-center justify-center">
                    <Info className="h-7 w-7 text-brand-text-variant mb-2" />
                    <p className="text-xs font-bold text-brand-text">No weekly checkpoints uploaded for {activeMonth} yet</p>
                    <p className="text-[11px] text-brand-text-variant mt-1 max-w-sm">
                      Upload Weekly KPI workbooks on the Upload Reports page to log weekly progress and track trajectories.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 relative">
                    {/* Background connector line */}
                    <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-100 -translate-y-1/2 hidden sm:block z-0" />
                    
                    {['Week 1', 'Week 2', 'Week 3', 'Week 4'].map((weekName, index) => {
                      const weekNum = index + 1;
                      const point = progressMetrics.weeklyPoints.find(p => p.weekNum === weekNum);
                      const isLogged = !!point;
                      
                      return (
                        <div 
                          key={weekName} 
                          className={`relative rounded-xl p-4 border transition-all z-10 flex flex-col justify-between min-h-[110px] ${
                            isLogged 
                              ? 'bg-white border-brand-primary/40 shadow-xs' 
                              : 'bg-slate-50/30 border-brand-gray-border/40 opacity-70'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-brand-text">{weekName}</span>
                              <span className={`h-2.5 w-2.5 rounded-full ${isLogged ? 'bg-brand-primary' : 'bg-slate-300'}`} />
                            </div>
                            {isLogged ? (
                              <span className="block text-base font-extrabold text-brand-text mt-2">
                                {point.achievedLabel}
                              </span>
                            ) : (
                              <span className="block text-xs font-medium text-slate-400 mt-2">
                                Pending upload
                              </span>
                            )}
                          </div>

                          {isLogged && (
                            <div className="mt-3 text-[10px] text-brand-text-variant border-t border-slate-100 pt-2 flex justify-between items-center">
                              <span>Uploaded:</span>
                              <span className="font-bold text-brand-text">
                                {formatShortDate(point.uploadDate)}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

        </>
      )}
    </motion.div>
  );
}
