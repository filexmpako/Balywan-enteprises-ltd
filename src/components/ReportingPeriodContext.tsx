import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  deriveAutoReportingPeriod,
  deriveBusinessReportingPeriod,
  getAvailableReportingPeriods,
  formatPeriodDisplay,
  toIsoPeriod
} from '../utils/periodUtils';
import { getActivityRules } from '../utils/activityRules';
import { CLOUD_HYDRATED_EVENT } from '../lib/cloudSyncEvents';

interface ReportingPeriodContextType {
  currentPeriod: string;           // ISO format e.g. "2026-07"
  displayPeriod: string;           // Formatted display e.g. "July 2026"
  setCurrentPeriod: (period: string) => void;
  isManuallySet: boolean;
  resetToAutoDetect: () => void;
  availablePeriods: string[];      // List of available period ISO strings e.g. ["2026-08", "2026-07"]
  autoDetectedPeriod: string;     // Default month: the Settings override, else the business rule
  /** The month the business rule picks from the data (ignores the Settings override). */
  dataDetectedPeriod: string;
  /** Month fixed in Settings for everyone, or null when automatic. */
  settingsOverride: string | null;
}

const STORAGE_KEY_PERIOD = 'currentReportingPeriod';
const STORAGE_KEY_MANUAL = 'isReportingPeriodManuallySet';
const STORAGE_KEY_DATA_PERIOD = 'dataReportingPeriodCache';

const readOverride = (): string | null => getActivityRules().reportingPeriodOverride ?? null;
const readManual = (): string | null => {
  if (localStorage.getItem(STORAGE_KEY_MANUAL) !== 'true') return null;
  const saved = localStorage.getItem(STORAGE_KEY_PERIOD);
  return saved && saved.trim() !== '' ? toIsoPeriod(saved.trim()) : null;
};
const readCachedDataPeriod = (): string => {
  try {
    const cached = localStorage.getItem(STORAGE_KEY_DATA_PERIOD);
    if (cached && /^\d{4}-\d{2}$/.test(cached)) return cached;
  } catch {
    /* fall through */
  }
  return deriveAutoReportingPeriod();
};

const ReportingPeriodContext = createContext<ReportingPeriodContextType>({
  currentPeriod: deriveAutoReportingPeriod(),
  displayPeriod: formatPeriodDisplay(deriveAutoReportingPeriod()),
  setCurrentPeriod: () => {},
  isManuallySet: false,
  resetToAutoDetect: () => {},
  availablePeriods: getAvailableReportingPeriods(),
  autoDetectedPeriod: deriveAutoReportingPeriod(),
  dataDetectedPeriod: deriveAutoReportingPeriod(),
  settingsOverride: null,
});

/**
 * Which month every page reports on, in priority order:
 *   1. a month picked in the header on this device (browsing; "manual"),
 *   2. the month fixed in Settings for everyone,
 *   3. the business rule: stay on a month until its Monthly report is
 *      uploaded and the next month's Daily MGT exists.
 */
export const ReportingPeriodProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [manualPeriod, setManualPeriod] = useState<string | null>(() => readManual());
  const [settingsOverride, setSettingsOverride] = useState<string | null>(() => readOverride());
  const [dataDetectedPeriod, setDataDetectedPeriod] = useState<string>(() => readCachedDataPeriod());
  const [availablePeriods, setAvailablePeriods] = useState<string[]>(() => getAvailableReportingPeriods());

  const autoDetectedPeriod = settingsOverride || dataDetectedPeriod;
  const currentPeriod = manualPeriod || autoDetectedPeriod;

  // Re-reads the local choices (header pick, Settings override, period list).
  const syncState = useCallback(() => {
    setManualPeriod(readManual());
    setSettingsOverride(readOverride());
    setAvailablePeriods(getAvailableReportingPeriods());
  }, []);

  // Evaluates the business rule from the Daily MGT date range and the
  // months that have a Monthly report.
  const refreshDataPeriod = useCallback(async () => {
    try {
      const [{ getDailyServicingRows }, { fetchMonthlyMonths }] = await Promise.all([
        import('../utils/indexedDB'),
        import('../lib/monthly.functions'),
      ]);
      // A failed read must not count as "no data" (that would flip the month
      // back); it throws and the last good value is kept.
      const [rows, monthly] = await Promise.all([getDailyServicingRows(), fetchMonthlyMonths()]);
      if (!Array.isArray(monthly?.months)) throw new Error('monthly months unavailable');
      let earliest: string | null = null;
      let latest: string | null = null;
      for (const r of rows || []) {
        const d = String(r?.['Servicing Date'] ?? '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
        if (!earliest || d < earliest) earliest = d;
        if (!latest || d > latest) latest = d;
      }
      const period = deriveBusinessReportingPeriod(earliest, latest, monthly?.months ?? []);
      setDataDetectedPeriod(period);
      try {
        localStorage.setItem(STORAGE_KEY_DATA_PERIOD, period);
      } catch {
        /* cache only */
      }
    } catch (err) {
      console.warn('[reporting-period] auto detection failed; keeping last value', err);
    }
  }, []);

  useEffect(() => {
    void refreshDataPeriod();
    const handleChoice = () => syncState();
    const handleData = () => {
      syncState();
      void refreshDataPeriod();
    };

    window.addEventListener('reportingPeriodChanged', handleChoice);
    window.addEventListener('activity-rules-updated', handleChoice);
    window.addEventListener('storage', handleChoice);
    window.addEventListener('servicing-rows-updated', handleData);
    window.addEventListener('weekly-kpi-updated', handleData);
    window.addEventListener(CLOUD_HYDRATED_EVENT, handleData);

    return () => {
      window.removeEventListener('reportingPeriodChanged', handleChoice);
      window.removeEventListener('activity-rules-updated', handleChoice);
      window.removeEventListener('storage', handleChoice);
      window.removeEventListener('servicing-rows-updated', handleData);
      window.removeEventListener('weekly-kpi-updated', handleData);
      window.removeEventListener(CLOUD_HYDRATED_EVENT, handleData);
    };
  }, [syncState, refreshDataPeriod]);

  const setCurrentPeriod = useCallback((newPeriod: string) => {
    const trimmed = newPeriod.trim();
    if (!trimmed) return;
    const iso = toIsoPeriod(trimmed);

    localStorage.setItem(STORAGE_KEY_PERIOD, iso);
    localStorage.setItem(STORAGE_KEY_MANUAL, 'true');
    setManualPeriod(iso);

    window.dispatchEvent(new Event('reportingPeriodChanged'));
  }, []);

  const resetToAutoDetect = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY_MANUAL);
    localStorage.removeItem(STORAGE_KEY_PERIOD);
    setManualPeriod(null);

    window.dispatchEvent(new Event('reportingPeriodChanged'));
  }, []);

  const displayPeriod = formatPeriodDisplay(currentPeriod);

  return (
    <ReportingPeriodContext.Provider
      value={{
        currentPeriod,
        displayPeriod,
        setCurrentPeriod,
        isManuallySet: manualPeriod !== null,
        resetToAutoDetect,
        availablePeriods,
        autoDetectedPeriod,
        dataDetectedPeriod,
        settingsOverride,
      }}
    >
      {children}
    </ReportingPeriodContext.Provider>
  );
};

export const useReportingPeriod = () => useContext(ReportingPeriodContext);
