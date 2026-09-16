import { BaseWakala } from '../types';
import { normalizeMsisdn } from './msisdn';

/** msisdn -> a readable name, resolved from whatever registries are cached locally. */
export function buildWakalaNameMap(): Map<string, string> {
  const map = new Map<string, string>();
  try {
    const base: BaseWakala[] = JSON.parse(localStorage.getItem('baseWakalaIndex') || '[]');
    base.forEach(w => {
      const norm = normalizeMsisdn(w.msisdn);
      if (norm) map.set(norm, w.fullName || w.wakalaName || w.code || w.wakalaCode || w.msisdn);
    });
  } catch { /* best-effort */ }
  try {
    const tills: any[] = JSON.parse(localStorage.getItem('tillsList') || '[]');
    tills.forEach(t => {
      const norm = normalizeMsisdn(t.transactionTill || t.msisdn);
      if (norm && !map.has(norm)) map.set(norm, t.tillName || t.name || t.transactionTill || t.msisdn);
    });
  } catch { /* best-effort */ }
  return map;
}
