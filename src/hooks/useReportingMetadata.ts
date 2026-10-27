import { useState, useEffect } from 'react';
import { useAuth } from '../components/AuthContext';
import { useReportingPeriod } from '../components/ReportingPeriodContext';
import { getDailyDateRange } from '../utils/indexedDB';

export function useReportingMetadata() {
  const { user } = useAuth();
  const { displayPeriod, currentPeriod } = useReportingPeriod();

  const [lastUpload, setLastUpload] = useState<string>('—');

  useEffect(() => {
    let isMounted = true;

    const loadMetadata = async () => {
      try {
        // Last Daily MGT date, DD/MM/YY.
        const { latest } = await getDailyDateRange();
        if (isMounted) {
          setLastUpload(latest ? `${latest.slice(8, 10)}/${latest.slice(5, 7)}/${latest.slice(2, 4)}` : '—');
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
