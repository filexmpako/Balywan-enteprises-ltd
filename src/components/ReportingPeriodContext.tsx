import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { 
  deriveAutoReportingPeriod, 
  getAvailableReportingPeriods, 
  formatPeriodDisplay,
  toIsoPeriod 
} from '../utils/periodUtils';

interface ReportingPeriodContextType {
  currentPeriod: string;           // ISO format e.g. "2026-07"
  displayPeriod: string;           // Formatted display e.g. "July 2026"
  setCurrentPeriod: (period: string) => void;
  isManuallySet: boolean;
  resetToAutoDetect: () => void;
  availablePeriods: string[];      // List of available period ISO strings e.g. ["2026-08", "2026-07"]
  autoDetectedPeriod: string;     // Currently derived fallback period
}

const STORAGE_KEY_PERIOD = 'currentReportingPeriod';
const STORAGE_KEY_MANUAL = 'isReportingPeriodManuallySet';

const ReportingPeriodContext = createContext<ReportingPeriodContextType>({
  currentPeriod: deriveAutoReportingPeriod(),
  displayPeriod: formatPeriodDisplay(deriveAutoReportingPeriod()),
  setCurrentPeriod: () => {},
  isManuallySet: false,
  resetToAutoDetect: () => {},
  availablePeriods: getAvailableReportingPeriods(),
  autoDetectedPeriod: deriveAutoReportingPeriod()
});

export const ReportingPeriodProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isManuallySet, setIsManuallySet] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEY_MANUAL) === 'true';
  });

  const [availablePeriods, setAvailablePeriods] = useState<string[]>(() => {
    return getAvailableReportingPeriods();
  });

  const [autoDetectedPeriod, setAutoDetectedPeriod] = useState<string>(() => {
    return deriveAutoReportingPeriod();
  });

  const [currentPeriod, setCurrentPeriodState] = useState<string>(() => {
    const isManual = localStorage.getItem(STORAGE_KEY_MANUAL) === 'true';
    if (isManual) {
      const saved = localStorage.getItem(STORAGE_KEY_PERIOD);
      if (saved && saved.trim() !== '') {
        return toIsoPeriod(saved.trim());
      }
    }
    return deriveAutoReportingPeriod();
  });

  // Re-evaluates period state whenever storage or custom events trigger
  const syncState = useCallback(() => {
    const isManual = localStorage.getItem(STORAGE_KEY_MANUAL) === 'true';
    const available = getAvailableReportingPeriods();
    const autoDerived = deriveAutoReportingPeriod();

    setIsManuallySet(isManual);
    setAvailablePeriods(available);
    setAutoDetectedPeriod(autoDerived);

    if (isManual) {
      const saved = localStorage.getItem(STORAGE_KEY_PERIOD);
      if (saved && saved.trim() !== '') {
        setCurrentPeriodState(toIsoPeriod(saved.trim()));
        return;
      }
    }
    setCurrentPeriodState(autoDerived);
  }, []);

  useEffect(() => {
    const handlePeriodChange = () => syncState();

    window.addEventListener('reportingPeriodChanged', handlePeriodChange);
    window.addEventListener('storage', handlePeriodChange);
    window.addEventListener('servicing-rows-updated', handlePeriodChange);
    window.addEventListener('agentTargets_updated', handlePeriodChange);

    return () => {
      window.removeEventListener('reportingPeriodChanged', handlePeriodChange);
      window.removeEventListener('storage', handlePeriodChange);
      window.removeEventListener('servicing-rows-updated', handlePeriodChange);
      window.removeEventListener('agentTargets_updated', handlePeriodChange);
    };
  }, [syncState]);

  const setCurrentPeriod = useCallback((newPeriod: string) => {
    const trimmed = newPeriod.trim();
    if (!trimmed) return;
    const iso = toIsoPeriod(trimmed);

    localStorage.setItem(STORAGE_KEY_PERIOD, iso);
    localStorage.setItem(STORAGE_KEY_MANUAL, 'true');

    setCurrentPeriodState(iso);
    setIsManuallySet(true);

    window.dispatchEvent(new Event('reportingPeriodChanged'));
  }, []);

  const resetToAutoDetect = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY_MANUAL);
    localStorage.removeItem(STORAGE_KEY_PERIOD);

    const autoDerived = deriveAutoReportingPeriod();
    setCurrentPeriodState(autoDerived);
    setIsManuallySet(false);

    window.dispatchEvent(new Event('reportingPeriodChanged'));
  }, []);

  const displayPeriod = formatPeriodDisplay(currentPeriod);

  return (
    <ReportingPeriodContext.Provider
      value={{
        currentPeriod,
        displayPeriod,
        setCurrentPeriod,
        isManuallySet,
        resetToAutoDetect,
        availablePeriods,
        autoDetectedPeriod
      }}
    >
      {children}
    </ReportingPeriodContext.Provider>
  );
};

export const useReportingPeriod = () => useContext(ReportingPeriodContext);
