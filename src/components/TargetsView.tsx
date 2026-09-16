import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'motion/react';
import { Owner, ManualOwnerTarget, PriorityWakala, BaseWakala } from '../types';
import { useAuth } from './AuthContext';
import {
  getSavedManualOwnerTargets,
  saveManualOwnerTarget
} from '../utils/targetResolution';
import { calculateKPI1, KPI1Result, getCompanyTotalKPI1Target } from '../utils/kpiEngine';
import { calculateKPI2, KPI2Result } from '../utils/kpi2Engine';
import { getDailyServicingRows } from '../utils/indexedDB';
import { loadAllWeeklyRows } from '../utils/weeklyStore';
import { getServicedStatusFromColumn, mergeServicedStatus } from '../utils/servicingStatus';
import { getActivityRules, isActiveByRule, isServedByRule, extractTxnCounts, type TxnCounts } from '../utils/activityRules';
import { normalizeMsisdn } from '../utils/msisdn';
import { getClassifiedRowsCached } from '../utils/classificationCache';
import { Target, X, ArrowLeft, Loader2, SlidersHorizontal, MoreVertical } from 'lucide-react';
import PageHeaderBanner from './PageHeaderBanner';
import PeriodSelector from './PeriodSelector';
import { useReportingPeriod } from './ReportingPeriodContext';
import { CLOUD_HYDRATED_EVENT } from '../lib/cloudSyncEvents';

export default function TargetsView() {
  const { user } = useAuth();
  const {
    currentPeriod: period,
    setCurrentPeriod: setPeriod,
    availablePeriods,
    autoDetectedPeriod,
    isManuallySet,
    resetToAutoDetect
  } = useReportingPeriod();
  const [owners, setOwners] = useState<Owner[]>([]);
  const [manualTargets, setManualTargets] = useState<ManualOwnerTarget[]>([]);
  const [priorityWakalas, setPriorityWakalas] = useState<PriorityWakala[]>([]);
  const [baseWakalaIndex, setBaseWakalaIndex] = useState<BaseWakala[]>([]);
  const [classifiedRows, setClassifiedRows] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [editingOwnerId, setEditingOwnerId] = useState<string | null>(null);
  const [drilldownOwnerId, setDrilldownOwnerId] = useState<string | null>(null);
  const [openMenuOwnerId, setOpenMenuOwnerId] = useState<string | null>(null);

  // Close three-dot menu on outside click
  useEffect(() => {
    if (!openMenuOwnerId) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.owner-action-menu-container')) {
        setOpenMenuOwnerId(null);
      }
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [openMenuOwnerId]);

  // Per-owner modal inputs (KPI 1 only)
  const [kpi1BaseInput, setKpi1BaseInput] = useState('');
  const [kpi1IopInput, setKpi1IopInput] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  // Global KPI 2 modal state
  const [showGlobalKpi2Modal, setShowGlobalKpi2Modal] = useState(false);
  const [globalNormalInput, setGlobalNormalInput] = useState('');
  const [globalPriorityInput, setGlobalPriorityInput] = useState('');
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [showConfirmGlobalModal, setShowConfirmGlobalModal] = useState(false);

  const loadStaticData = useCallback(() => {
    try {
      const savedOwners = localStorage.getItem('ownersList');
      setOwners(savedOwners ? JSON.parse(savedOwners) : []);
    } catch (e) { setOwners([]); }
    setManualTargets(getSavedManualOwnerTargets());
    try {
      const savedPw = localStorage.getItem('priorityWakalaList');
      setPriorityWakalas(savedPw ? JSON.parse(savedPw) : []);
    } catch (e) { setPriorityWakalas([]); }
    try {
      const savedBw = localStorage.getItem('baseWakalaIndex');
      setBaseWakalaIndex(savedBw ? JSON.parse(savedBw) : []);
    } catch (e) { setBaseWakalaIndex([]); }
  }, []);

  // The Base Wakala Index and Priority Wakala list arrive from the server after
  // sign-in, so re-read them whenever the cache is refreshed from the cloud.
  useEffect(() => {
    window.addEventListener(CLOUD_HYDRATED_EVENT, loadStaticData);
    return () => window.removeEventListener(CLOUD_HYDRATED_EVENT, loadStaticData);
  }, [loadStaticData]);

  useEffect(() => {
    loadStaticData();
    let isMounted = true;
    setIsLoading(true);
    getDailyServicingRows()
      .then(rows => {
        if (!isMounted) return;
        const savedSaTill = localStorage.getItem('saTillRegistry');
        const saTillRegistry = savedSaTill ? JSON.parse(savedSaTill) : [];
        const savedTills = localStorage.getItem('tillsList');
        const tillsList = savedTills ? JSON.parse(savedTills) : [];
        const savedOwners = localStorage.getItem('ownersList');
        const currentOwners = savedOwners ? JSON.parse(savedOwners) : [];
        const savedBw = localStorage.getItem('baseWakalaIndex');
        const currentBw = savedBw ? JSON.parse(savedBw) : [];

        const classified = getClassifiedRowsCached(
          rows || [],
          saTillRegistry,
          currentBw,
          tillsList,
          currentOwners
        );
        setClassifiedRows(classified);
      })
      .catch(() => { if (isMounted) setClassifiedRows([]); })
      .finally(() => { if (isMounted) setIsLoading(false); });
    return () => { isMounted = false; };
  }, [loadStaticData]);

  // Weekly servicing rows for the selected month. Where a wakala has a weekly
  // row, its uploaded servicing_status is the authoritative served answer and
  // overrides the Daily MGT computed rule for that wakala.
  const [weeklyServedMap, setWeeklyServedMap] = useState<Map<string, boolean>>(new Map());

  useEffect(() => {
    let isMounted = true;
    loadAllWeeklyRows()
      .then(rows => {
        if (!isMounted) return;
        const columnServedMap = new Map<string, boolean | null>();
        const countsMap = new Map<string, TxnCounts>();
        (rows || []).forEach((row: any) => {
          const month = String(row?.reportingMonth || row?.reporting_month || '').trim();
          if (month && period && month !== period) return;
          const key = normalizeMsisdn(row?.MSISDN || row?.msisdn);
          if (!key) return;
          columnServedMap.set(key, mergeServicedStatus(columnServedMap.get(key) ?? null, getServicedStatusFromColumn(row)));
          const rowCounts = extractTxnCounts(row);
          const existing = countsMap.get(key);
          countsMap.set(key, existing
            ? {
                cashIn: existing.cashIn + rowCounts.cashIn,
                cashOut: existing.cashOut + rowCounts.cashOut,
                total: existing.total + rowCounts.total,
                amount: (existing.amount || 0) + (rowCounts.amount || 0),
              }
            : rowCounts);
        });
        // Served/unserved is the uploaded servicing_status column merged with
        // the computed amount/transaction rule — a "served" reading from
        // either source wins.
        const rules = getActivityRules();
        const resolved = new Map<string, boolean>();
        countsMap.forEach((counts, key) => {
          const isActive = isActiveByRule(counts, rules);
          const merged = mergeServicedStatus(columnServedMap.get(key) ?? null, isServedByRule(counts, isActive, rules));
          if (merged !== null) resolved.set(key, merged);
        });
        setWeeklyServedMap(resolved);
      })
      .catch(() => {
        if (isMounted) setWeeklyServedMap(new Map());
      });
    return () => { isMounted = false; };
  }, [period]);

  const kpi1Results: KPI1Result[] = useMemo(() => {
    return calculateKPI1(classifiedRows, [], owners, period, manualTargets);
  }, [classifiedRows, owners, period, manualTargets]);

  const kpi2Results: KPI2Result[] = useMemo(() => {
    return calculateKPI2(classifiedRows, owners, period, manualTargets, priorityWakalas, baseWakalaIndex, weeklyServedMap);
  }, [classifiedRows, owners, period, manualTargets, priorityWakalas, baseWakalaIndex, weeklyServedMap]);

  const kpi1ByOwner = useMemo(() => {
    const m = new Map<string, KPI1Result>();
    kpi1Results.forEach(r => m.set(r.ownerId, r));
    return m;
  }, [kpi1Results]);

  const kpi2ByOwner = useMemo(() => {
    const m = new Map<string, KPI2Result>();
    kpi2Results.forEach(r => m.set(r.ownerId, r));
    return m;
  }, [kpi2Results]);

  // Company totals across all owners
  const totals = useMemo(() => {
    const kpi1Totals = getCompanyTotalKPI1Target(owners, period, manualTargets);
    let totalKpi2NormalTarget = 0;
    let totalKpi2PriorityTarget = 0;
    let hasAnyKpi2Normal = false;
    let hasAnyKpi2Priority = false;

    owners.forEach(owner => {
      const k2 = kpi2ByOwner.get(owner.id || '');
      if (k2 && k2.normalPercent !== null && k2.normalPercent !== undefined) {
        totalKpi2NormalTarget += k2.normalTarget;
        hasAnyKpi2Normal = true;
      }
      if (k2 && k2.priorityPercent !== null && k2.priorityPercent !== undefined) {
        totalKpi2PriorityTarget += k2.priorityTarget;
        hasAnyKpi2Priority = true;
      }
    });

    return {
      totalKpi1Target: kpi1Totals.total,
      totalKpi2NormalTarget,
      totalKpi2PriorityTarget,
      hasAnyKpi1: kpi1Totals.hasAny,
      hasAnyKpi2Normal,
      hasAnyKpi2Priority,
    };
  }, [owners, period, manualTargets, kpi2ByOwner]);

  const openSetTarget = (owner: Owner) => {
    const manual = manualTargets.find(m => m.ownerId === owner.id && m.period === period);
    setKpi1BaseInput(manual?.kpi1BaseTarget !== undefined ? String(manual.kpi1BaseTarget) : '');
    setKpi1IopInput(manual?.kpi1IopTarget !== undefined ? String(manual.kpi1IopTarget) : '');
    setSaveError(null);
    setEditingOwnerId(owner.id || null);
  };

  const handleConfirmSetTarget = () => {
    if (!editingOwnerId) return;
    const parseOrUndef = (v: string): number | undefined => {
      if (v.trim() === '') return undefined;
      const n = parseFloat(v);
      return !isNaN(n) && n >= 0 ? n : undefined;
    };
    const base = parseOrUndef(kpi1BaseInput);
    const iop = parseOrUndef(kpi1IopInput);

    if (base === undefined && iop === undefined) {
      setSaveError('Enter at least one value before confirming.');
      return;
    }

    const target: ManualOwnerTarget = {
      ownerId: editingOwnerId,
      period,
      kpi1BaseTarget: base,
      kpi1IopTarget: iop,
      setBy: user?.email || 'Admin',
      setAt: new Date().toISOString(),
    };
    const updated = saveManualOwnerTarget(target);
    setManualTargets(updated);
    setEditingOwnerId(null);
  };

  // Global KPI 2 handlers
  const openGlobalKpi2Modal = () => {
    const periodTargets = manualTargets.filter(
      m => m.period === period && (m.kpi2NormalPercent !== undefined || m.kpi2PriorityPercent !== undefined)
    );
    if (periodTargets.length > 0) {
      const firstNormal = periodTargets[0].kpi2NormalPercent;
      const firstPriority = periodTargets[0].kpi2PriorityPercent;
      const allSame = periodTargets.every(
        m => m.kpi2NormalPercent === firstNormal && m.kpi2PriorityPercent === firstPriority
      );
      if (allSame) {
        setGlobalNormalInput(firstNormal !== undefined ? String(firstNormal) : '');
        setGlobalPriorityInput(firstPriority !== undefined ? String(firstPriority) : '');
      } else {
        setGlobalNormalInput('');
        setGlobalPriorityInput('');
      }
    } else {
      setGlobalNormalInput('');
      setGlobalPriorityInput('');
    }
    setGlobalError(null);
    setShowGlobalKpi2Modal(true);
  };

  const handleSubmitGlobalKpi2 = () => {
    const norm = parseFloat(globalNormalInput);
    const prio = parseFloat(globalPriorityInput);
    if (
      isNaN(norm) ||
      isNaN(prio) ||
      !Number.isInteger(norm) ||
      !Number.isInteger(prio) ||
      norm < 0 ||
      norm > 100 ||
      prio < 0 ||
      prio > 100
    ) {
      setGlobalError('Percentages must be whole numbers between 0 and 100.');
      return;
    }
    setGlobalError(null);
    setShowConfirmGlobalModal(true);
  };

  const handleConfirmGlobalKpi2 = () => {
    const norm = parseInt(globalNormalInput, 10);
    const prio = parseInt(globalPriorityInput, 10);
    const currentUser = user?.email || 'Admin';
    const now = new Date().toISOString();

    owners.forEach(owner => {
      if (!owner.id) return;
      saveManualOwnerTarget({
        ownerId: owner.id,
        period,
        kpi2NormalPercent: norm,
        kpi2PriorityPercent: prio,
        setBy: currentUser,
        setAt: now,
      });
    });

    setManualTargets(getSavedManualOwnerTargets());
    setShowConfirmGlobalModal(false);
    setShowGlobalKpi2Modal(false);
  };

  const editingOwner = owners.find(o => o.id === editingOwnerId) || null;
  const drilldownOwner = owners.find(o => o.id === drilldownOwnerId) || null;

  // ============ DRILLDOWN VIEW ============
  if (drilldownOwner) {
    const k1 = kpi1ByOwner.get(drilldownOwner.id || '');
    const k2 = kpi2ByOwner.get(drilldownOwner.id || '');
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <button
          onClick={() => setDrilldownOwnerId(null)}
          className="flex items-center gap-1 text-xs font-bold text-brand-primary hover:underline cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Targets
        </button>

        {/* Profile Header banner */}
        <div className="bg-brand-primary px-5 py-6 text-white rounded-2xl shadow-ambient">
          <h2 className="text-base sm:text-lg font-black tracking-tight leading-none text-white">{drilldownOwner.name}</h2>
          <p className="text-xs text-white/85 font-medium mt-1">Progress for period {period}</p>
        </div>

        {/* KPI 1 — Consolidated & Expanded MTD Serviced Volume Card */}
        <div className="rounded-2xl border border-brand-gray-border bg-brand-card p-6 shadow-ambient flex flex-col justify-between space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="block font-sans text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">
                MTD SERVICED VOLUME (BASE + IOP)
              </span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-sans text-2xl sm:text-3xl font-black text-brand-primary font-mono">
                  TZS {k1 ? k1.servedVolume.toLocaleString() : '0'}
                </span>
              </div>
            </div>
            <div className="text-right">
              <span className="block font-sans text-[10px] font-bold text-brand-text-variant uppercase tracking-wider">
                MONTHLY TARGET
              </span>
              <span className="font-sans text-sm sm:text-base font-extrabold text-brand-text font-mono mt-1 block">
                {k1 && k1.hasTarget ? (
                  `TZS ${Math.round(k1.monthlyTarget).toLocaleString()}`
                ) : (
                  <span className="text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-lg text-xs font-sans font-bold">
                    Target Pending
                  </span>
                )}
              </span>
            </div>
          </div>

          {/* Progress Bar & Percentage */}
          {k1 && k1.hasTarget ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between font-sans text-xs font-bold">
                <span className="text-brand-text-variant">Target Fulfillment Progress</span>
                <span className={`font-mono text-sm ${
                  k1.status === 'Green' ? 'text-emerald-700' :
                  k1.status === 'Blue' ? 'text-blue-700' :
                  k1.status === 'Yellow' ? 'text-amber-700' : 'text-rose-700'
                }`}>
                  {Math.min(100, k1.achievementPercentage).toFixed(1)}% Achieved
                  {k1.achievementPercentage > 100 && (
                    <span className="text-brand-text-variant font-normal"> (real: {k1.achievementPercentage.toFixed(1)}%)</span>
                  )}
                </span>
              </div>
              <div className="h-3.5 w-full bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200">
                <div
                  className={`h-full transition-all rounded-full ${
                    k1.status === 'Green' ? 'bg-emerald-500' :
                    k1.status === 'Blue' ? 'bg-blue-500' :
                    k1.status === 'Yellow' ? 'bg-amber-500' : 'bg-rose-500'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, k1.achievementPercentage))}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="p-3 bg-amber-50/60 border border-amber-200/80 rounded-xl flex items-center justify-between text-xs text-amber-900 font-medium">
              <span>Target Fulfillment Progress</span>
              <span className="font-bold text-amber-700 bg-amber-100 border border-amber-300 px-2.5 py-0.5 rounded-lg">Target Pending</span>
            </div>
          )}
        </div>

        {/* KPI 2 — Colorful Progress Cards (Normal & Priority) */}
        <div className="space-y-3">
          <h3 className="font-bold text-sm text-brand-text">KPI 2 — Active Wakala Distribution</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Normal Wakala Card */}
            <div className="bg-brand-card rounded-2xl border border-indigo-100 p-6 shadow-ambient space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="block font-sans text-[10px] font-bold text-indigo-900 uppercase tracking-wider">
                    NORMAL WAKALA SERVICING
                  </span>
                  <span className="text-xs text-brand-text-variant font-medium mt-0.5 block">
                    {k2?.normalPercent !== null && k2?.normalPercent !== undefined ? `${k2.normalPercent}% of ${Math.round(k2.normalWakalaCount)} Wakalas` : 'No percentage set'}
                  </span>
                </div>
                {k2 && k2.hasTarget && k2.normalPercent !== null ? (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    Normal
                  </span>
                ) : (
                  <span className="text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-lg text-xs font-sans font-bold">
                    Target Pending
                  </span>
                )}
              </div>

              {k2 && k2.hasTarget && k2.normalPercent !== null ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between font-sans text-xs font-bold">
                    <span className="text-brand-text-variant">Progress</span>
                    <span className="font-mono text-sm text-indigo-700">
                      {Math.min(100, k2.normalAchievementPct).toFixed(1)}%
                      {k2.normalAchievementPct > 100 && (
                        <span className="text-[10px] text-brand-text-variant font-normal"> (real: {k2.normalAchievementPct.toFixed(1)}%)</span>
                      )}
                    </span>
                  </div>
                  <div className="h-3.5 w-full bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200">
                    <div
                      className="h-full transition-all rounded-full bg-indigo-500"
                      style={{ width: `${Math.min(100, Math.max(0, k2.normalAchievementPct))}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-amber-50/60 border border-amber-200/80 rounded-xl flex items-center justify-between text-xs text-amber-900 font-medium">
                  <span>Target Fulfillment Progress</span>
                  <span className="font-bold text-amber-700 bg-amber-100 border border-amber-300 px-2.5 py-0.5 rounded-lg">Target Pending</span>
                </div>
              )}

              <div className="pt-3 border-t border-brand-gray-border/60 grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <div className="text-[10px] text-brand-text-variant font-bold uppercase">Target</div>
                  <div className="font-mono font-bold text-brand-text mt-0.5">
                    {k2 && k2.normalPercent !== null ? Math.round(k2.normalTarget) : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-brand-text-variant font-bold uppercase">Served</div>
                  <div className="font-mono font-bold text-brand-primary mt-0.5">
                    {Math.round(k2?.normalServed ?? 0)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-brand-text-variant font-bold uppercase">Achieved</div>
                  <div className="font-mono font-bold text-indigo-700 mt-0.5">
                    {k2 && k2.normalPercent !== null ? `${Math.min(100, k2.normalAchievementPct).toFixed(1)}%` : '—'}
                  </div>
                </div>
              </div>
            </div>

            {/* Priority Wakala Card */}
            <div className="bg-brand-card rounded-2xl border border-purple-100 p-6 shadow-ambient space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="block font-sans text-[10px] font-bold text-purple-900 uppercase tracking-wider">
                    PRIORITY WAKALA SERVICING
                  </span>
                  <span className="text-xs text-brand-text-variant font-medium mt-0.5 block">
                    {k2?.priorityPercent !== null && k2?.priorityPercent !== undefined ? `${k2.priorityPercent}% of ${Math.round(k2.priorityWakalaCount)} Wakalas` : 'No percentage set'}
                  </span>
                </div>
                {k2 && k2.hasTarget && k2.priorityPercent !== null ? (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
                    Priority
                  </span>
                ) : (
                  <span className="text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-lg text-xs font-sans font-bold">
                    Target Pending
                  </span>
                )}
              </div>

              {k2 && k2.hasTarget && k2.priorityPercent !== null ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between font-sans text-xs font-bold">
                    <span className="text-brand-text-variant">Progress</span>
                    <span className="font-mono text-sm text-purple-700">
                      {Math.min(100, k2.priorityAchievementPct).toFixed(1)}%
                      {k2.priorityAchievementPct > 100 && (
                        <span className="text-[10px] text-brand-text-variant font-normal"> (real: {k2.priorityAchievementPct.toFixed(1)}%)</span>
                      )}
                    </span>
                  </div>
                  <div className="h-3.5 w-full bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200">
                    <div
                      className="h-full transition-all rounded-full bg-purple-500"
                      style={{ width: `${Math.min(100, Math.max(0, k2.priorityAchievementPct))}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-amber-50/60 border border-amber-200/80 rounded-xl flex items-center justify-between text-xs text-amber-900 font-medium">
                  <span>Target Fulfillment Progress</span>
                  <span className="font-bold text-amber-700 bg-amber-100 border border-amber-300 px-2.5 py-0.5 rounded-lg">Target Pending</span>
                </div>
              )}

              <div className="pt-3 border-t border-brand-gray-border/60 grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <div className="text-[10px] text-brand-text-variant font-bold uppercase">Target</div>
                  <div className="font-mono font-bold text-brand-text mt-0.5">
                    {k2 && k2.priorityPercent !== null ? Math.round(k2.priorityTarget) : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-brand-text-variant font-bold uppercase">Served</div>
                  <div className="font-mono font-bold text-purple-700 mt-0.5">
                    {Math.round(k2?.priorityServed ?? 0)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-brand-text-variant font-bold uppercase">Achieved</div>
                  <div className="font-mono font-bold text-purple-700 mt-0.5">
                    {k2 && k2.priorityPercent !== null ? `${Math.min(100, k2.priorityAchievementPct).toFixed(1)}%` : '—'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============ LIST VIEW ============
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeaderBanner
          icon={Target}
          title="Targets"
          subtitle="Set KPI 1 targets per owner and global KPI 2 targets for all owners."
        />
        <div className="flex items-end gap-3 shrink-0">
          <div>
            <label className="block text-[10px] mb-0.5 invisible select-none">Action</label>
            <button
              type="button"
              onClick={openGlobalKpi2Modal}
              className="px-3.5 py-1.5 rounded-lg bg-brand-primary text-white text-xs font-bold hover:opacity-90 flex items-center gap-1.5 shadow-xs transition-opacity cursor-pointer"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Set KPI 2 Target for All Owners
            </button>
          </div>

          <PeriodSelector
            currentPeriod={period}
            availablePeriods={availablePeriods}
            autoDetectedPeriod={autoDetectedPeriod}
            isManuallySet={isManuallySet}
            onSelectPeriod={(p) => setPeriod(p)}
            onAutoDetect={resetToAutoDetect}
            label="Period"
            align="right"
            showManualBadge={true}
            dropdownTitle="Select Global Period"
            dropdownSubtitle="Applies across Dashboard, KPI Reports, Audit Logs & Targets."
            id="targets-period-selector"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-brand-text-variant">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading owner data...
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-brand-gray-border overflow-hidden shadow-xs">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-extrabold border-b border-brand-gray-border">
              <tr>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">KPI 1</th>
                <th className="px-4 py-3">KPI 2 — Normal</th>
                <th className="px-4 py-3">KPI 2 — Priority</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {owners.map(owner => {
                const k1 = kpi1ByOwner.get(owner.id || '');
                const k2 = kpi2ByOwner.get(owner.id || '');
                const hasAnyTarget = Boolean(
                  k1?.hasTarget || 
                  (k2?.normalPercent !== null && k2?.normalPercent !== undefined) || 
                  (k2?.priorityPercent !== null && k2?.priorityPercent !== undefined)
                );

                return (
                  <tr key={owner.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3">
                      <motion.span
                        whileHover={{ scale: 1.12 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                        onClick={() => setDrilldownOwnerId(owner.id || null)}
                        className="font-bold text-brand-text hover:text-brand-primary inline-block cursor-pointer origin-left transition-colors"
                      >
                        {owner.name}
                      </motion.span>
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {k1?.hasTarget ? (
                        `TZS ${Math.round(k1.monthlyTarget).toLocaleString()}`
                      ) : (
                        <span className="text-slate-400 font-sans italic">Not set</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {k2 && k2.normalPercent !== null && k2.normalPercent !== undefined ? (
                        Math.round(k2.normalTarget)
                      ) : (
                        <span className="text-slate-400 font-sans italic">Not set</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {k2 && k2.priorityPercent !== null && k2.priorityPercent !== undefined ? (
                        Math.round(k2.priorityTarget)
                      ) : (
                        <span className="text-slate-400 font-sans italic">Not set</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!hasAnyTarget ? (
                        <button
                          onClick={() => openSetTarget(owner)}
                          className="text-[11px] font-extrabold text-white bg-brand-primary px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
                        >
                          Set Target
                        </button>
                      ) : (
                        <div className="relative inline-block text-left owner-action-menu-container">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuOwnerId(openMenuOwnerId === owner.id ? null : (owner.id || null));
                            }}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-brand-primary hover:bg-slate-100 transition-colors cursor-pointer"
                            title="Actions"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                          {openMenuOwnerId === owner.id && (
                            <div className="absolute right-0 mt-1 w-32 bg-white rounded-lg shadow-lg border border-brand-gray-border py-1 z-20">
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuOwnerId(null);
                                  openSetTarget(owner);
                                }}
                                className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 font-medium transition-colors cursor-pointer"
                              >
                                Edit Target
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {owners.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400 italic">No owners found.</td></tr>
              )}
            </tbody>
            {owners.length > 0 && (
              <tfoot className="bg-slate-100/90 border-t-2 border-slate-300 font-extrabold text-slate-900">
                <tr>
                  <td className="px-4 py-3 font-bold">Company Total</td>
                  <td className="px-4 py-3 font-mono">
                    {totals.hasAnyKpi1 ? (
                      `TZS ${Math.round(totals.totalKpi1Target).toLocaleString()}`
                    ) : (
                      <span className="text-slate-400 font-sans italic font-normal">Not set</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {totals.hasAnyKpi2Normal ? (
                      Math.round(totals.totalKpi2NormalTarget).toLocaleString()
                    ) : (
                      <span className="text-slate-400 font-sans italic font-normal">Not set</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {totals.hasAnyKpi2Priority ? (
                      Math.round(totals.totalKpi2PriorityTarget).toLocaleString()
                    ) : (
                      <span className="text-slate-400 font-sans italic font-normal">Not set</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Per-Owner KPI 1 Modal */}
      {editingOwner && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-extrabold text-brand-text">Set KPI 1 Target — {editingOwner.name}</h3>
              <button onClick={() => setEditingOwnerId(null)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>

            <div className="mb-4 space-y-3">
              <div className="text-[11px] font-bold text-brand-text-variant uppercase">KPI 1 — Monthly Target (TZS)</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Base Target</label>
                  <input
                    value={kpi1BaseInput}
                    onChange={e => setKpi1BaseInput(e.target.value)}
                    placeholder="e.g. 50000000"
                    className="w-full px-3 py-2 rounded-lg border border-brand-gray-border text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">IOP Target</label>
                  <input
                    value={kpi1IopInput}
                    onChange={e => setKpi1IopInput(e.target.value)}
                    placeholder="e.g. 30000000"
                    className="w-full px-3 py-2 rounded-lg border border-brand-gray-border text-sm font-mono"
                  />
                </div>
              </div>
            </div>

            {saveError && <p className="text-xs text-rose-600 font-bold mb-3">{saveError}</p>}

            <div className="flex justify-end gap-2">
              <button onClick={() => setEditingOwnerId(null)} className="px-4 py-2 text-xs font-bold text-slate-500">Cancel</button>
              <button onClick={handleConfirmSetTarget} className="px-4 py-2 text-xs font-extrabold text-white bg-brand-primary rounded-lg">Set Target</button>
            </div>
          </div>
        </div>
      )}

      {/* Global KPI 2 Modal (Step 1) */}
      {showGlobalKpi2Modal && !showConfirmGlobalModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-extrabold text-brand-text">Set KPI 2 Target for All Owners</h3>
              <button onClick={() => setShowGlobalKpi2Modal(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>

            <p className="text-xs text-brand-text-variant mb-4">
              Apply uniform Wakala servicing target percentages across all {owners.length} owners for period <strong>{period}</strong>.
            </p>

            <div className="mb-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Normal Wakala %</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={globalNormalInput}
                    onChange={e => setGlobalNormalInput(e.target.value)}
                    placeholder="e.g. 60"
                    className="w-full px-3 py-2 rounded-lg border border-brand-gray-border text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Priority Wakala %</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={globalPriorityInput}
                    onChange={e => setGlobalPriorityInput(e.target.value)}
                    placeholder="e.g. 80"
                    className="w-full px-3 py-2 rounded-lg border border-brand-gray-border text-sm font-mono"
                  />
                </div>
              </div>
            </div>

            {globalError && <p className="text-xs text-rose-600 font-bold mb-3">{globalError}</p>}

            <div className="flex justify-end gap-2">
              <button onClick={() => setShowGlobalKpi2Modal(false)} className="px-4 py-2 text-xs font-bold text-slate-500">Cancel</button>
              <button onClick={handleSubmitGlobalKpi2} className="px-4 py-2 text-xs font-extrabold text-white bg-brand-primary rounded-lg">Apply to All Owners</button>
            </div>
          </div>
        </div>
      )}

      {/* Global KPI 2 Modal (Step 2 — Confirmation) */}
      {showConfirmGlobalModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-extrabold text-brand-text text-base">Confirm Bulk Target Update</h3>
            <p className="text-xs text-slate-700 leading-relaxed">
              Apply Normal: <strong>{globalNormalInput}%</strong> / Priority: <strong>{globalPriorityInput}%</strong> to all <strong>{owners.length}</strong> owners for <strong>{period}</strong>? This will overwrite any existing KPI 2 percentages for every owner.
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowConfirmGlobalModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmGlobalKpi2}
                className="px-4 py-2 text-xs font-extrabold text-white bg-brand-primary rounded-lg hover:opacity-90"
              >
                Confirm & Overwrite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

