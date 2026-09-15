import React, { useState, useEffect, useMemo } from 'react';
import { ViewType, KPIMetric, TopOwner, RecentReport, AuditReport, Owner, ManualOwnerTarget, PriorityWakala, BaseWakala } from '../types';
import { dashboardKPIs, topOwners, recentReports } from '../data';
import { calculateCompanyKPIs, CompanyKPIsResult } from '../utils/mappingEngine';
import { getCompanyTotalKPI1Target, calculateKPI1 } from '../utils/kpiEngine';
import { calculateKPI2 } from '../utils/kpi2Engine';
import { getClassifiedRowsCached } from '../utils/classificationCache';
import { getSavedManualOwnerTargets } from '../utils/targetResolution';
import { isKpi1RowName, isKpi2RowName } from '../utils/kpiRowMatch';
import { formatNumberWithAbbreviation } from '../utils/numberFormat';
import { getDailyServicingRows } from '../utils/indexedDB';
import { refreshWeeklyStatsHistory, readWeeklyStatsHistory } from '../utils/weeklyHistory';
import { withCumulativeValue, weekNumberOf, paceLabel, type WeeklyStatsEntry } from '../utils/weeklyKpiEngine';

import { 
  Users, 
  UploadCloud, 
  History, 
  ExternalLink, 
  ChevronRight, 
  AlertCircle, 
  AlertTriangle,
  CheckCircle2, 
  DollarSign, 
  Activity,
  Calendar,
  Layers,
  ShieldCheck,
  Sparkles,
  UserCog,
  Target
} from 'lucide-react';
import { motion } from 'motion/react';
import PageHeaderBanner from './PageHeaderBanner';
import { useCompany } from './CompanyContext';
import { useReportingPeriod } from './ReportingPeriodContext';
import { exportKPIReportToPDF } from '../utils/pdfExport';

interface DashboardViewProps {
  onNavigate: (view: ViewType) => void;
  onSelectOwner: (name: string) => void;
}

export default function DashboardView({ onNavigate, onSelectOwner }: DashboardViewProps) {
  const { companyName } = useCompany();
  const { displayPeriod, currentPeriod } = useReportingPeriod();
  const [validationWarnings, setValidationWarnings] = useState<any[]>(() => {
    const saved = localStorage.getItem('kpiValidationWarnings');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return [];
  });

  useEffect(() => {
    const reloadWarnings = () => {
      const saved = localStorage.getItem('kpiValidationWarnings');
      if (saved) {
        try {
          setValidationWarnings(JSON.parse(saved));
        } catch (e) {}
      } else {
        setValidationWarnings([]);
      }
    };
    window.addEventListener('people-reclassified', reloadWarnings);
    window.addEventListener('storage', reloadWarnings);
    return () => {
      window.removeEventListener('people-reclassified', reloadWarnings);
      window.removeEventListener('storage', reloadWarnings);
    };
  }, []);

  // Weekly KPI progression — appended as each new weekly workbook is uploaded.
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStatsEntry[]>(() => readWeeklyStatsHistory());

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      refreshWeeklyStatsHistory()
        .then(entries => {
          if (!cancelled) setWeeklyStats(entries);
        })
        .catch(err => console.error('Weekly KPI progression load failed:', err));
    };
    load();
    window.addEventListener('weekly-kpi-updated', load);
    window.addEventListener('people-reclassified', load);
    return () => {
      cancelled = true;
      window.removeEventListener('weekly-kpi-updated', load);
      window.removeEventListener('people-reclassified', load);
    };
  }, []);

  const [rawKpis, setRawKpis] = useState<KPIMetric[]>(() => {
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

  // Live engine inputs (same set TargetsView loads) so KPI1/KPI2 summary rows
  // recompute from accumulated Daily MGT data instead of the frozen upload.
  const [liveTotals, setLiveTotals] = useState<{
    kpi1: { target: number; achieved: number } | null;
    kpi2: { target: number; achieved: number } | null;
  }>({ kpi1: null, kpi2: null });

  const kpis: KPIMetric[] = useMemo(() => {
    return rawKpis.map(kpi => {
      const applyLive = (targetVal: number, achievedVal: number, isCurrency: boolean): KPIMetric => {
        const realPct = targetVal > 0 ? (achievedVal / targetVal) * 100 : 0;
        const performance = Math.round(Math.min(realPct, 100) * 10) / 10;
        return {
          ...kpi,
          targetVal,
          achievedVal,
          target: isCurrency ? `TZS ${formatNumberWithAbbreviation(targetVal)}` : `${Math.round(targetVal).toLocaleString('en-US')}`,
          achieved: isCurrency ? `TZS ${formatNumberWithAbbreviation(achievedVal)}` : `${Math.round(achievedVal).toLocaleString('en-US')}`,
          performance,
        };
      };

      if (isKpi1RowName(kpi.name) && liveTotals.kpi1) {
        return applyLive(liveTotals.kpi1.target, liveTotals.kpi1.achieved, true);
      }
      if (isKpi2RowName(kpi.name) && liveTotals.kpi2) {
        return applyLive(liveTotals.kpi2.target, liveTotals.kpi2.achieved, false);
      }
      // Not modelled by any engine in this app — leave exactly as uploaded.
      return kpi;
    });
  }, [rawKpis, liveTotals]);

  const realPerformanceByKpiId = useMemo(() => {
    const m = new Map<string, number>();
    rawKpis.forEach(kpi => {
      const live = isKpi1RowName(kpi.name) ? liveTotals.kpi1 : (isKpi2RowName(kpi.name) ? liveTotals.kpi2 : null);
      if (live && live.target > 0) {
        const realPct = (live.achieved / live.target) * 100;
        if (realPct > 100) m.set(kpi.id, Math.round(realPct * 10) / 10);
      }
    });
    return m;
  }, [rawKpis, liveTotals]);


  const computeTopOwnersList = (rows: any[]): TopOwner[] => {
    if (rows && rows.length > 0) {
      const firstRow = rows[0];
      let volCol = '';
      for (const key of Object.keys(firstRow)) {
        const kLower = key.toLowerCase();
        if (kLower.includes('volume') || kLower.includes('amount') || kLower.includes('value')) {
          volCol = key;
          break;
        }
      }

      if (volCol) {
        const agentSums: { [agentId: string]: number } = {};
        const agentZones: { [agentId: string]: string } = {};
        const agentNames: { [agentId: string]: string } = {};

        rows.forEach(row => {
          const agentId = row['Agent ID'] || row['AgentID'] || row['masterAgentId'] || '';
          const zone = row['Zone'] || row['Region'] || 'Master';
          const name = row['Wakala Name'] || row['Name'] || '';
          
          let volStr = String(row[volCol] || '0').replace(/,/g, '').trim();
          const val = parseFloat(volStr) || 0;

          if (agentId) {
            agentSums[agentId] = (agentSums[agentId] || 0) + val;
            if (zone) agentZones[agentId] = zone;
            if (name && !agentNames[agentId]) agentNames[agentId] = name;
          }
        });

        const savedOwnersRaw = localStorage.getItem('ownersList');
        const activeOwnersList: any[] = savedOwnersRaw ? JSON.parse(savedOwnersRaw) : [];

        const mappedOwners = Object.keys(agentSums).map(agentId => {
          const matchedOwner = activeOwnersList.find((o: any) => o.masterAgentId === agentId);
          const name = matchedOwner ? matchedOwner.name : (agentNames[agentId] || `Agent ${agentId}`);
          const zone = matchedOwner ? matchedOwner.region : (agentZones[agentId] || 'Master');
          const totalVal = agentSums[agentId];

          return {
            name,
            zone,
            totalVal,
            agentId
          };
        });

        mappedOwners.sort((a, b) => b.totalVal - a.totalVal);

        const maxVal = mappedOwners[0]?.totalVal || 1;
        
        return mappedOwners.slice(0, 4).map((item, idx) => {
          const pct = maxVal > 0 ? Math.round((item.totalVal / maxVal) * 1000) / 10 : 0;
          let formattedAmt = '';
          const val = item.totalVal;
          if (val >= 1000000) {
            formattedAmt = `TZS ${(val / 1000000).toFixed(1)}M`;
          } else if (val >= 1000) {
            formattedAmt = `TZS ${(val / 1000).toFixed(0)}K`;
          } else {
            formattedAmt = `TZS ${val}`;
          }

          return {
            rank: idx + 1,
            name: item.name,
            zone: item.zone,
            percentage: pct,
            amount: formattedAmt
          };
        });
      }
    }
    return [];
  };

  const defaultCompanyKPIs: CompanyKPIsResult = {
    openingFloat: 0,
    floatReceived: 0,
    floatServed: 0,
    closingFloat: 0,
    mtdOpeningFloat: 0,
    mtdFloatReceived: 0,
    mtdFloatServed: 0,
    mtdClosingFloat: 0,
    totalPenalty: 0,
    unattributedPenalty: 0,
    penaltyByOwner: {},
    totalIopVolume: 0,
    iopVolumeByOwner: {},
    reportingMonth: '—',
    lastUpload: '—',
    latestDay: '',
    earliestDay: ''
  };

  const [companyKPIs, setCompanyKPIs] = useState<CompanyKPIsResult>(defaultCompanyKPIs);
  const [topOwnersList, setTopOwnersList] = useState<TopOwner[]>([]);
  const [monthlyGoal, setMonthlyGoal] = useState<{ total: number; hasAny: boolean }>({ total: 0, hasAny: false });

  // Dynamic Recent Reports list derived from the persisted audit history logs
  const [recentReportsList, setRecentReportsList] = useState<RecentReport[]>(() => {
    const savedReports = localStorage.getItem('auditHistoryReports');
    if (savedReports) {
      try {
        const reports = JSON.parse(savedReports);
        if (Array.isArray(reports) && reports.length > 0) {
          return reports.slice(0, 4).map((r: AuditReport) => {
            let statusVal: 'success' | 'warning' | 'error' = 'success';
            if (r.status === 'Failed') statusVal = 'error';
            else if (r.status === 'Processing') statusVal = 'warning';
            return {
              name: r.fileName,
              time: r.date.toUpperCase(),
              zone: r.type.toUpperCase(),
              status: statusVal
            };
          });
        }
      } catch (e) {
        console.error("Failed to load dynamic reports list:", e);
      }
    }
    return [];
  });

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      let rows: any[] = [];
      try {
        rows = await getDailyServicingRows();
      } catch (e) {
        console.error("Failed to load daily servicing rows in DashboardView:", e);
      }

      if (isMounted) {
        const kpis = await calculateCompanyKPIs(rows);
        if (isMounted) {
          setCompanyKPIs({ ...kpis, reportingMonth: displayPeriod });
          setTopOwnersList(computeTopOwnersList(rows));

          // Monthly Goal Progress card data
          try {
            const savedOwners = localStorage.getItem('ownersList');
            const realOwners = savedOwners ? JSON.parse(savedOwners) : [];
            const goal = getCompanyTotalKPI1Target(realOwners, currentPeriod);
            setMonthlyGoal(goal);
          } catch (e) {
            console.error('Failed to compute monthly goal:', e);
          }

          // Live KPI1 / KPI2 company-wide totals from accumulated daily data
          try {
            const owners: Owner[] = JSON.parse(localStorage.getItem('ownersList') || '[]');
            const saTillRegistry = JSON.parse(localStorage.getItem('saTillRegistry') || '[]');
            const tillsList = JSON.parse(localStorage.getItem('tillsList') || '[]');
            const baseWakalaIndex: BaseWakala[] = JSON.parse(localStorage.getItem('baseWakalaIndex') || '[]');
            const priorityWakalas: PriorityWakala[] = JSON.parse(localStorage.getItem('priorityWakalaList') || '[]');
            const manualTargets: ManualOwnerTarget[] = getSavedManualOwnerTargets();

            const classified = getClassifiedRowsCached(rows || [], saTillRegistry, baseWakalaIndex, tillsList, owners);

            const kpi1Results = calculateKPI1(classified, [], owners, currentPeriod, manualTargets);
            const kpi1Target = kpi1Results.reduce((s, r) => s + (r.hasTarget ? r.monthlyTarget : 0), 0);
            const kpi1Achieved = kpi1Results.reduce((s, r) => s + r.servedVolume, 0);

            const kpi2Results = calculateKPI2(classified, owners, currentPeriod, manualTargets, priorityWakalas, baseWakalaIndex);
            const kpi2Target = kpi2Results.reduce((s, r) => s + (r.hasTarget ? r.normalTarget + r.priorityTarget : 0), 0);
            const kpi2Achieved = kpi2Results.reduce((s, r) => s + (r.hasTarget ? r.normalServed + r.priorityServed : 0), 0);

            if (isMounted) {
              setLiveTotals({
                kpi1: kpi1Target > 0 ? { target: kpi1Target, achieved: kpi1Achieved } : null,
                kpi2: kpi2Target > 0 ? { target: kpi2Target, achieved: kpi2Achieved } : null,
              });
            }
          } catch (e) {
            console.error('Failed to compute live KPI1/KPI2 totals:', e);
          }
        }
      }
    };

    loadData();

    const handleUpdate = () => {
      loadData();

      const savedKpis = localStorage.getItem('dashboardKPIs');
      if (savedKpis) {
        try {
          setRawKpis(JSON.parse(savedKpis));
        } catch (e) {
          setRawKpis([]);
        }
      } else {
        setRawKpis([]);
      }


      const savedReports = localStorage.getItem('auditHistoryReports');
      if (savedReports) {
        try {
          const reports = JSON.parse(savedReports);
          if (Array.isArray(reports)) {
            setRecentReportsList(reports.slice(0, 4).map((r: AuditReport) => {
              let statusVal: 'success' | 'warning' | 'error' = 'success';
              if (r.status === 'Failed') statusVal = 'error';
              else if (r.status === 'Processing') statusVal = 'warning';
              return {
                name: r.fileName,
                time: r.date.toUpperCase(),
                zone: r.type.toUpperCase(),
                status: statusVal
              };
            }));
          } else {
            setRecentReportsList([]);
          }
        } catch (e) {
          setRecentReportsList([]);
        }
      } else {
        setRecentReportsList([]);
      }
    };

    window.addEventListener('servicing-rows-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      isMounted = false;
      window.removeEventListener('servicing-rows-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [displayPeriod, currentPeriod]);

  // Dynamic metrics calculation based on uploaded KPI report
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  const day = now.getDate();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const daysRemaining = totalDays - day;
  const elapsedDays = Math.max(day, 1);

  const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const currentMonthName = monthNames[month];
  const nextUploadDate = `${totalDays} ${currentMonthName}`;

  // Filter financial KPIs
  const financialKPIs = kpis.filter(k => 
    k.target.toUpperCase().includes('TZS') || 
    k.name.toLowerCase().includes('value') || 
    k.name.toLowerCase().includes('float') || 
    k.name.toLowerCase().includes('liquidity')
  );

  const activeFinancialKPIs = financialKPIs.length > 0 ? financialKPIs : kpis;

  const totalTargetVal = activeFinancialKPIs.reduce((sum, k) => sum + (k.targetVal || 0), 0);
  const totalAchievedVal = activeFinancialKPIs.reduce((sum, k) => sum + (k.achievedVal || 0), 0);

  // Set currency prefix to TZS exclusively
  const currencyPrefix = 'TZS ';

  const formatValue = (val: number, prefix: string) => {
    if (val >= 1000000) {
      return `${prefix}${(val / 1000000).toFixed(1)}M`;
    }
    if (val >= 1000) {
      return `${prefix}${(val / 1000).toFixed(1)}K`;
    }
    return `${prefix}${val}`;
  };

  const displayTarget = formatValue(totalTargetVal, currencyPrefix);
  const displayAchieved = formatValue(totalAchievedVal, currencyPrefix);

  const overallPerf = totalTargetVal > 0 ? (totalAchievedVal / totalTargetVal) * 100 : 0;
  const overallPerfString = `${overallPerf.toFixed(1)}%`;

  const projectedVal = (totalAchievedVal / elapsedDays) * totalDays;
  const displayProjected = formatValue(projectedVal, currencyPrefix);

  const projDiffPercent = totalTargetVal > 0 ? ((projectedVal - totalTargetVal) / totalTargetVal) * 100 : 0;
  const projDiffString = projDiffPercent >= 0 
    ? `+${projDiffPercent.toFixed(1)}% of Target` 
    : `${projDiffPercent.toFixed(1)}% of Target`;

  const finalAchievedY = Math.max(10, Math.min(90, 100 - overallPerf));

  // Animation variant for staggered list entrances
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.08 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 25 } }
  };

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
          normalized: 'ACHIEVED' as const,
          badgeText: 'Achieved',
          bgClass: 'bg-status-success-bg text-status-success-text border-status-success-border/60',
          progressClass: 'bg-status-success-text',
          indicatorColor: 'text-status-success-text'
        };
      case 'NEEDS ATTENTION':
        return {
          normalized: 'NEEDS ATTENTION' as const,
          badgeText: String(status || '').toUpperCase().includes('RISK') ? 'At Risk' : 'Needs Attention',
          bgClass: 'bg-status-warning-bg text-status-warning-text border-status-warning-border/60',
          progressClass: 'bg-status-warning-text',
          indicatorColor: 'text-status-warning-text'
        };
      case 'CRITICAL':
        return {
          normalized: 'CRITICAL' as const,
          badgeText: 'Critical',
          bgClass: 'bg-status-error-bg text-status-error-text border-status-error-border/60',
          progressClass: 'bg-status-error-text',
          indicatorColor: 'text-status-error-text'
        };
      default:
        return {
          normalized: 'ON TRACK' as const,
          badgeText: 'On Track',
          bgClass: 'bg-status-info-bg text-brand-primary border-status-info-border/60',
          progressClass: 'bg-brand-primary-light',
          indicatorColor: 'text-brand-primary'
        };
    }
  };

  const getStatusStyle = (status: string, performance?: number) => {
    return getSemanticBadgeInfo(status, performance).bgClass;
  };

  const getProgressColor = (status: string, performance?: number) => {
    return getSemanticBadgeInfo(status, performance).progressClass;
  };

  const getActionRecommendation = (kpiName: string) => {
    const nameLower = kpiName.toLowerCase();
    if (nameLower.includes('value') || nameLower.includes('servicing')) {
      return "Mobilize top regional distributors in underperforming zones and adjust local liquidity float rules.";
    }
    if (nameLower.includes('active') || nameLower.includes('wakala')) {
      return "Substantial inactive wakalas detected. Implement localized promotional incentives and dispatch territory support.";
    }
    if (nameLower.includes('product') || nameLower.includes('seller')) {
      return "Low seller engagement. Conduct targeted onboarding workshops and evaluate terminal commissions.";
    }
    return "Perform localized operational audit. Contact regional owners to optimize terminal liquidity limits.";
  };

  const highPriorityKPIs = kpis.filter(kpi => {
    const norm = getSemanticBadgeInfo(kpi.status, kpi.performance).normalized;
    return norm === 'CRITICAL' || norm === 'NEEDS ATTENTION';
  });

  const handleExportPDF = () => {
    exportKPIReportToPDF({
      kpis,
      overallPerfString,
      displayTarget,
      displayAchieved,
      displayProjected,
      projDiffString,
      daysRemaining,
      nextUploadDate,
    });
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 max-w-[1440px] mx-auto p-4 sm:p-6 lg:p-8"
    >
      {/* Upper Welcome Header */}
      <PageHeaderBanner
        icon={UserCog}
        title="Dashboard"
        subtitle={`Real-time oversight of ${companyName} intelligence and monthly KPI targets.`}
      />

      {/* Today and Month to Date Rows */}
      {companyKPIs.reportingMonth === '—' ? (
        <div className="bg-brand-card border border-brand-gray-border rounded-2xl p-8 shadow-ambient flex flex-col items-center justify-center text-center gap-4 py-12">
          <div className="h-14 w-14 rounded-2xl bg-brand-primary/10 text-brand-primary flex items-center justify-center">
            <UploadCloud className="h-7 w-7" />
          </div>
          <div className="space-y-1 max-w-md">
            <h4 className="font-sans text-base font-black text-slate-800">
              No Data Ingested Yet
            </h4>
            <p className="font-sans text-xs text-brand-text-variant font-medium leading-relaxed">
              No data uploaded yet — go to Upload Reports to get started.
            </p>
          </div>
          <button
            onClick={() => onNavigate(ViewType.UPLOAD_REPORTS)}
            className="mt-2 inline-flex items-center gap-2 bg-brand-primary text-white text-xs font-bold px-4 py-2.5 rounded-xl cursor-pointer hover:bg-opacity-90 transition-all shadow-sm"
          >
            <UploadCloud className="h-4 w-4" />
            Upload Reports
          </button>
        </div>
      ) : (
        <>
          {/* Today Row */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <Calendar className="h-4 w-4 text-brand-primary" />
              <h3 className="font-sans text-xs font-black uppercase tracking-wider text-brand-primary">Today ({companyKPIs.latestDay})</h3>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient flex flex-col justify-between">
                <div>
                  <span className="block font-sans text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">Total Volume</span>
                  <span className="block font-sans text-xl font-black text-status-info-text mt-2 font-mono">
                    TZS {companyKPIs.floatServed.toLocaleString()}
                  </span>
                </div>
                <span className="inline-block mt-3 self-start font-sans text-[10px] font-bold text-status-info-text bg-status-info-bg px-2 py-0.5 rounded">
                  TOTAL SERVICED TODAY
                </span>
              </div>
            </div>
          </div>

          {/* Month to Date Row */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <Activity className="h-4 w-4 text-brand-primary" />
              <h3 className="font-sans text-xs font-black uppercase tracking-wider text-brand-primary">Month to Date ({companyKPIs.reportingMonth})</h3>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-5 shadow-ambient flex flex-col justify-between">
                <div>
                  <span className="block font-sans text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">Total Volume</span>
                  <span className="block font-sans text-xl font-black text-status-info-text mt-2 font-mono">
                    TZS {companyKPIs.mtdFloatServed.toLocaleString()}
                  </span>
                </div>
                <span className="inline-block mt-3 self-start font-sans text-[10px] font-bold text-status-info-text bg-status-info-bg px-2 py-0.5 rounded">
                  TOTAL SERVICED MONTH-TO-DATE
                </span>
              </div>
            </div>
          </div>

          {/* Monthly Goal Progress Card */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <Target className="h-4 w-4 text-amber-500" />
              <h3 className="font-sans text-xs font-black uppercase tracking-wider text-amber-600">Monthly Goal Progress</h3>
            </div>
            <div className="rounded-2xl border-2 border-amber-400 bg-amber-400 p-5 shadow-ambient">
              {!monthlyGoal.hasAny ? (
                <div className="text-center py-2">
                  <p className="font-sans text-sm font-bold text-black/70">No monthly targets set yet</p>
                  <p className="font-sans text-xs text-black/50 mt-1">Set targets on the Targets page to track progress here.</p>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
                    <div>
                      <span className="block font-sans text-[10px] font-black text-black/60 uppercase tracking-wider">Company Monthly Target</span>
                      <span className="block font-sans text-2xl font-black text-black font-mono mt-1">
                        TZS {Math.round(monthlyGoal.total).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="block font-sans text-[10px] font-black text-black/60 uppercase tracking-wider">Served So Far (MTD)</span>
                      <span className="block font-sans text-lg font-extrabold text-black font-mono mt-1">
                        TZS {companyKPIs.mtdFloatServed.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div className="w-full h-3 bg-black/15 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-black rounded-full transition-all"
                      style={{ width: `${Math.min(100, monthlyGoal.total > 0 ? (companyKPIs.mtdFloatServed / monthlyGoal.total) * 100 : 0)}%` }}
                    />
                  </div>
                  <span className="block text-right font-sans text-xs font-black text-black mt-1.5">
                    {monthlyGoal.total > 0 ? Math.min(100, Math.round((companyKPIs.mtdFloatServed / monthlyGoal.total) * 100)) : 0}% of goal
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Phase 4 Derived Metrics Row */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <ShieldCheck className="h-4 w-4 text-brand-primary" />
              <h3 className="font-sans text-xs font-black uppercase tracking-wider text-brand-primary">Derived Metrics & Settlement Ledger</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Total Penalty */}
              <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-5 shadow-ambient flex flex-col justify-between">
                <div>
                  <span className="block font-sans text-[10px] font-bold text-rose-800 uppercase tracking-wider">Total Penalty</span>
                  <span className="block font-sans text-xl font-black text-rose-950 mt-2 font-mono">
                    TZS {(companyKPIs.totalPenalty || 0).toLocaleString()}
                  </span>
                </div>
                <span className="inline-block mt-3 self-start font-sans text-[10px] font-bold text-rose-800 bg-rose-200/70 px-2 py-0.5 rounded">
                  CP SERVICING VAL
                </span>
              </div>

              {/* IOP Volume */}
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-ambient flex flex-col justify-between">
                <div>
                  <span className="block font-sans text-[10px] font-bold text-emerald-800 uppercase tracking-wider">IOP Volume</span>
                  <span className="block font-sans text-xl font-black text-emerald-950 mt-2 font-mono">
                    TZS {(companyKPIs.totalIopVolume || 0).toLocaleString()}
                  </span>
                </div>
                <span className="inline-block mt-3 self-start font-sans text-[10px] font-bold text-emerald-800 bg-emerald-200/70 px-2 py-0.5 rounded">
                  EXTERNAL SERVICED VOLUME
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* 1. KPI Performance Summary Container (Upper big card) */}
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="rounded-2xl border border-brand-gray-border bg-brand-card p-6 shadow-ambient"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-brand-gray-border pb-5">
          <div>
            <h3 className="font-sans text-lg font-bold text-brand-text">KPI Performance Summary</h3>
            <p className="font-sans text-xs text-brand-text-variant mt-0.5">Real-time status of critical monthly performance indicators.</p>
          </div>
          {companyKPIs.reportingMonth !== '—' && kpis.length > 0 && (
            <button 
              onClick={() => onNavigate(ViewType.KPI_REPORTS)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-gray-hover px-4 py-2 font-sans text-xs font-bold text-brand-primary hover:bg-brand-primary-container/40 transition-colors cursor-pointer"
              id="view-full-kpi-report-btn"
            >
              Full Report
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {companyKPIs.reportingMonth === '—' || kpis.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-10 gap-4">
            <div className="h-14 w-14 rounded-2xl bg-brand-primary/10 text-brand-primary flex items-center justify-center">
              <UploadCloud className="h-7 w-7" />
            </div>
            <div className="space-y-1 max-w-sm">
              <h4 className="font-sans text-sm font-bold text-brand-text">No KPI Summary Available</h4>
              <p className="font-sans text-xs text-brand-text-variant font-medium leading-relaxed">
                No KPI reports have been processed yet. Go to Upload Reports to ingest a KPI report or workbook.
              </p>
            </div>
            <button
              onClick={() => onNavigate(ViewType.UPLOAD_REPORTS)}
              className="inline-flex items-center gap-2 bg-brand-primary text-white text-xs font-bold px-4 py-2.5 rounded-xl cursor-pointer hover:bg-opacity-90 transition-all shadow-sm"
            >
              <UploadCloud className="h-4 w-4" />
              Upload Reports
            </button>
          </div>
        ) : (
          <>
            {/* High-Priority KPIs Attention Summary Block */}
            {highPriorityKPIs.length > 0 ? (
              <div className="mt-5 p-4 rounded-2xl border border-brand-gray-border bg-brand-gray-hover/30">
                <div className="flex items-center gap-2 mb-3">
                  <span className="flex h-2.5 w-2.5 rounded-full bg-status-error-text animate-pulse shrink-0" />
                  <h4 className="font-sans text-xs font-bold uppercase tracking-wider text-status-error-text">Action Required: Priority KPI Attention Summary</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {highPriorityKPIs.map(kpi => {
                    const badge = getSemanticBadgeInfo(kpi.status, kpi.performance);
                    const isCritical = badge.normalized === 'CRITICAL';
                    return (
                      <div 
                        key={`high-priority-${kpi.id}`}
                        className="p-6 rounded-[24px] bg-brand-card border border-brand-gray-border/80 shadow-[0_8px_30px_rgba(0,0,0,0.04)] flex flex-col justify-between transition-all duration-300 hover:scale-[1.01] hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)]"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              {isCritical ? (
                                <span className="inline-flex items-center gap-1 px-3 py-1 font-sans text-[10px] font-black uppercase tracking-wider text-white bg-status-error-text border border-status-error-border rounded-lg shadow-sm animate-pulse">
                                  <AlertCircle className="h-3.5 w-3.5 text-white" />
                                  CRITICAL
                                </span>
                              ) : (
                                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-sans text-[10px] font-bold uppercase tracking-wider ${badge.bgClass}`}>
                                  <AlertCircle className="h-3 w-3" />
                                  {badge.badgeText}
                                </span>
                              )}
                              <h5 className="font-sans text-sm font-extrabold text-brand-text mt-3.5">{kpi.name}</h5>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="block font-sans text-[10px] text-brand-text-variant uppercase font-bold tracking-wider">MTD Perf.</span>
                              <span className={`font-mono text-base font-black ${isCritical ? 'text-status-error-text' : 'text-status-warning-text'}`}>{kpi.performance}%</span>
                            </div>
                          </div>
                          <p className="font-sans text-xs text-brand-text-variant font-medium mt-3 leading-relaxed">
                            {getActionRecommendation(kpi.name)}
                          </p>
                        </div>
                        <div className="mt-5 pt-3.5 border-t border-dashed border-brand-gray-border flex items-center justify-between text-[11px]">
                          <span className="font-sans font-medium text-brand-text-variant">Target: <strong className="font-mono text-brand-text font-bold">{kpi.target}</strong></span>
                          <span className="font-sans font-medium text-brand-text-variant">Achieved: <strong className="font-mono text-brand-text font-bold">{kpi.achieved}</strong></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="mt-5 p-4 rounded-2xl border border-status-success-border/30 bg-status-success-bg/30 flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-status-success-bg/80 text-status-success-text shrink-0">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <h5 className="font-sans text-xs font-bold text-status-success-text">Operational Summary Healthy</h5>
                  <p className="font-sans text-xs text-status-success-text/90 mt-0.5">All tracked key performance indicators are currently on track or achieved. Operational targets are stabilized.</p>
                </div>
              </div>
            )}

            {/* Every KPI as its own status card */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {kpis.map((kpi) => {
                const badge = getSemanticBadgeInfo(kpi.status, kpi.performance);
                return (
                  <button
                    key={kpi.id}
                    onClick={() => onNavigate(ViewType.KPI_REPORTS)}
                    className="text-left p-5 rounded-2xl bg-brand-card border border-brand-gray-border shadow-xs hover:shadow-ambient hover:border-brand-primary/40 transition-all cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary-container/40 text-brand-primary shrink-0">
                          <Layers className="h-5 w-5" />
                        </div>
                        <h4 className="font-sans text-sm font-extrabold text-brand-text leading-snug">{kpi.name}</h4>
                      </div>
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-sans text-[10px] font-bold tracking-wider whitespace-nowrap ${badge.bgClass}`}>
                        {badge.badgeText}
                      </span>
                    </div>

                    <div className="mt-4 flex items-end justify-between">
                      <div>
                        <p className="font-sans text-[10px] font-bold uppercase tracking-wider text-brand-text-variant">Performance</p>
                        <p className="font-mono text-2xl font-black text-brand-text">
                          {kpi.performance}%
                          {realPerformanceByKpiId.has(kpi.id) && (
                            <span className="ml-1 font-sans text-[10px] font-semibold text-brand-primary align-middle">
                              real: {realPerformanceByKpiId.get(kpi.id)}%
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-sans text-[10px] font-bold uppercase tracking-wider text-brand-text-variant">MTD Achieved</p>
                        <p className="font-mono text-sm font-bold text-brand-primary">{kpi.achieved}</p>
                      </div>
                    </div>

                    <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-brand-gray-hover/40">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, kpi.performance)}%` }}
                        transition={{ duration: 1, ease: 'easeOut' }}
                        className={`h-full rounded-full ${getProgressColor(kpi.status, kpi.performance)}`}
                      />
                    </div>

                    <p className="mt-2.5 font-sans text-[11px] text-brand-text-variant">
                      Target: <strong className="font-mono text-brand-text">{kpi.target}</strong>
                    </p>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </motion.div>

      {/* Weekly KPI Progression — appended per uploaded weekly workbook */}
      {weeklyStats.length > 0 && (() => {
        const series = withCumulativeValue(weeklyStats);
        const latest = series[series.length - 1];
        const target = monthlyGoal?.hasAny ? monthlyGoal.total : 0;
        const progress = target > 0 ? (latest.cumulativeValue / target) * 100 : 0;
        const pace = paceLabel(progress, weekNumberOf(latest.reportingWeek) || series.length);
        const toneClass =
          pace.tone === 'ahead'
            ? 'bg-brand-success-container/40 text-brand-success'
            : pace.tone === 'ontrack'
              ? 'bg-brand-primary-container/40 text-brand-primary'
              : 'bg-brand-error-container/40 text-brand-error';

        return (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="rounded-2xl border border-brand-gray-border bg-brand-card p-6 shadow-ambient"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-brand-gray-border pb-5">
              <div>
                <h3 className="font-sans text-lg font-bold text-brand-text">Weekly KPI Progression</h3>
                <p className="font-sans text-xs text-brand-text-variant mt-0.5">
                  Served / unserved wakalas per uploaded week, accumulating toward the monthly KPI 1 target.
                </p>
              </div>
              <span className={`inline-flex items-center rounded-full px-3 py-1 font-sans text-[10px] font-bold tracking-wider ${toneClass}`}>
                {pace.label}
              </span>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-5">
              <div className="rounded-xl bg-brand-gray-hover p-4">
                <p className="font-sans text-[10px] font-bold uppercase tracking-wider text-brand-text-variant">Latest Week</p>
                <p className="font-sans text-xl font-bold text-brand-text mt-1">{latest.reportingWeek}</p>
              </div>
              <div className="rounded-xl bg-brand-gray-hover p-4">
                <p className="font-sans text-[10px] font-bold uppercase tracking-wider text-brand-text-variant">Served Wakalas</p>
                <p className="font-sans text-xl font-bold text-brand-success mt-1">
                  {latest.served} <span className="text-xs text-brand-text-variant">({latest.servedPercent}%)</span>
                </p>
              </div>
              <div className="rounded-xl bg-brand-gray-hover p-4">
                <p className="font-sans text-[10px] font-bold uppercase tracking-wider text-brand-text-variant">Unserved Wakalas</p>
                <p className="font-sans text-xl font-bold text-brand-error mt-1">
                  {latest.notServed} <span className="text-xs text-brand-text-variant">({latest.notServedPercent}%)</span>
                </p>
              </div>
              <div className="rounded-xl bg-brand-gray-hover p-4">
                <p className="font-sans text-[10px] font-bold uppercase tracking-wider text-brand-text-variant">Cumulative vs Target</p>
                <p className="font-sans text-xl font-bold text-brand-primary mt-1">
                  {target > 0 ? `${progress.toFixed(1)}%` : '—'}
                </p>
                <p className="font-sans text-[10px] text-brand-text-variant mt-0.5">
                  {formatNumberWithAbbreviation(latest.cumulativeValue)}
                  {target > 0 ? ` / ${formatNumberWithAbbreviation(target)}` : ''}
                </p>
              </div>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left">
                <thead>
                  <tr className="border-b border-brand-gray-border">
                    {['Week', 'Active', 'Inactive', 'Served', 'Unserved', 'Weekly Value', 'Cumulative', 'vs Target'].map(h => (
                      <th key={h} className="py-2 font-sans text-[10px] font-bold uppercase tracking-wider text-brand-text-variant">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {series.map(entry => (
                    <tr key={entry.reportingWeek} className="border-b border-brand-gray-border/50">
                      <td className="py-2.5 font-sans text-xs font-bold text-brand-text">{entry.reportingWeek}</td>
                      <td className="py-2.5 font-sans text-xs text-brand-text">{entry.active}</td>
                      <td className="py-2.5 font-sans text-xs text-brand-text">{entry.inactive}</td>
                      <td className="py-2.5 font-sans text-xs font-bold text-brand-success">{entry.served}</td>
                      <td className="py-2.5 font-sans text-xs font-bold text-brand-error">{entry.notServed}</td>
                      <td className="py-2.5 font-sans text-xs text-brand-text">{formatNumberWithAbbreviation(entry.totalValue)}</td>
                      <td className="py-2.5 font-sans text-xs text-brand-text">{formatNumberWithAbbreviation(entry.cumulativeValue)}</td>
                      <td className="py-2.5 font-sans text-xs font-bold text-brand-primary">
                        {target > 0 ? `${((entry.cumulativeValue / target) * 100).toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        );
      })()}
    </motion.div>
  );
}
