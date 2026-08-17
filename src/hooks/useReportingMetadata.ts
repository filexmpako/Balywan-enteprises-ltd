import { useState, useEffect } from 'react';
import { calculateCompanyKPIs } from '../utils/mappingEngine';
import { useAuth } from '../components/AuthContext';
import { useReportingPeriod } from '../components/ReportingPeriodContext';
import { getDailyServicingRows } from '../utils/indexedDB';

export function useReportingMetadata() {
  const { user } = useAuth();
  const { displayPeriod, currentPeriod } = useReportingPeriod();

  const [lastUpload, setLastUpload] = useState<string>('—');

  useEffect(() => {
    let isMounted = true;

    const loadMetadata = async () => {
      try {
        const rows = await getDailyServicingRows();
        const kpis = await calculateCompanyKPIs(rows);
        if (isMounted) {
          setLastUpload(kpis.lastUpload || '—');
        }
      } catch (e) {
        if (isMounted) {
          setLastUpload('—');
        }
      }
    };

    loadMetadata();

    const handleUpdate = () => {
      loadMetadata();
    };

    window.addEventListener('servicing-rows-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      isMounted = false;
      window.removeEventListener('servicing-rows-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  let activeUserName = 'Admin Portal';
  if (user && user.name) {
    activeUserName = user.name;
  } else {
    try {
      const savedUser = localStorage.getItem('hasidadi_current_user');
      if (savedUser) {
        const parsed = JSON.parse(savedUser);
        if (parsed && parsed.name) {
          activeUserName = parsed.name;
        }
      }
    } catch (e) {
      // ignore
    }
  }

  return {
    reportingMonth: displayPeriod,
    currentPeriod,
    lastUpload,
    activeUserName
  };
}
