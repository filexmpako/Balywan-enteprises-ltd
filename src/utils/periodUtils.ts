import { kvGet, kvSet } from '../lib/hasidadi/kv';
/**
 * Utility functions for parsing, formatting, matching, and auto-deriving reporting periods.
 * Supports ISO format ("YYYY-MM"), full month names ("July 2026"), and short month names ("Jul 2026").
 */

const MONTH_NAMES_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

export interface ParsedPeriod {
  year: number;
  month: number; // 1-indexed (1..12)
  iso: string;   // "YYYY-MM"
  display: string; // "July 2026"
  shortDisplay: string; // "Jul 2026"
}

/**
 * Parses any period string into a structured ParsedPeriod object.
 */
export function parsePeriod(periodStr: string | null | undefined): ParsedPeriod | null {
  if (!periodStr || periodStr.trim() === '' || periodStr === '—') return null;

  const clean = periodStr.trim();

  // 1. Check YYYY-MM format
  const isoMatch = clean.match(/^(\d{4})[-/](0[1-9]|1[0-2]|\d)$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    if (month >= 1 && month <= 12) {
      const monthIdx = month - 1;
      const iso = `${year}-${String(month).padStart(2, '0')}`;
      return {
        year,
        month,
        iso,
        display: `${MONTH_NAMES_FULL[monthIdx]} ${year}`,
        shortDisplay: `${MONTH_NAMES_SHORT[monthIdx]} ${year}`
      };
    }
  }

  // 2. Check "Month YYYY" or "YYYY Month" or "MMM YYYY"
  const yearMatch = clean.match(/\b(20\d\d)\b/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    const lower = clean.toLowerCase();

    for (let i = 0; i < 12; i++) {
      const fullName = MONTH_NAMES_FULL[i].toLowerCase();
      const shortName = MONTH_NAMES_SHORT[i].toLowerCase();
      if (lower.includes(fullName) || lower.includes(shortName)) {
        const month = i + 1;
        const iso = `${year}-${String(month).padStart(2, '0')}`;
        return {
          year,
          month,
          iso,
          display: `${MONTH_NAMES_FULL[i]} ${year}`,
          shortDisplay: `${MONTH_NAMES_SHORT[i]} ${year}`
        };
      }
    }
  }

  return null;
}

/**
 * Normalizes a period string to its ISO representation "YYYY-MM".
 * Returns original string if unparseable.
 */
export function toIsoPeriod(periodStr: string): string {
  const parsed = parsePeriod(periodStr);
  return parsed ? parsed.iso : periodStr;
}

/**
 * Formats a period string to a human-readable display string e.g. "July 2026".
 */
export function formatPeriodDisplay(periodStr: string | null | undefined): string {
  if (!periodStr || periodStr === '—') return '—';
  const parsed = parsePeriod(periodStr);
  return parsed ? parsed.display : periodStr;
}

/**
 * Checks if two period strings represent the exact same month and year.
 */
export function periodsMatch(periodA: string | null | undefined, periodB: string | null | undefined): boolean {
  if (!periodA || !periodB) return false;
  if (periodA === periodB) return true;

  const parsedA = parsePeriod(periodA);
  const parsedB = parsePeriod(periodB);

  if (parsedA && parsedB) {
    return parsedA.iso === parsedB.iso;
  }

  return periodA.trim().toLowerCase() === periodB.trim().toLowerCase();
}

/**
 * Scans all system storage locations (agentTargets, manualOwnerTargets,
 * kpiWorkbookHistory, monthlyTargetUploads, servicing rows) to assemble
 * a deduplicated, reverse-chronologically sorted list of all available periods.
 */
export function getAvailableReportingPeriods(): string[] {
  const periodsSet = new Set<string>();

  // 1. agentTargets
  try {
    const raw = kvGet('agentTargets');
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        list.forEach(item => {
          if (item?.period) periodsSet.add(toIsoPeriod(item.period));
        });
      }
    }
  } catch (e) {}

  // 2. manualOwnerTargets
  try {
    const raw = kvGet('manualOwnerTargets');
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        list.forEach(item => {
          if (item?.period) periodsSet.add(toIsoPeriod(item.period));
        });
      }
    }
  } catch (e) {}

  // 3. kpiWorkbookHistory
  try {
    const raw = kvGet('kpiWorkbookHistory');
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        list.forEach(item => {
          if (item?.reportingMonth) periodsSet.add(toIsoPeriod(item.reportingMonth));
          if (item?.period) periodsSet.add(toIsoPeriod(item.period));
        });
      }
    }
  } catch (e) {}

  // 4. monthlyTargetUploads
  try {
    const raw = kvGet('monthlyTargetUploads');
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        list.forEach(item => {
          if (item?.period) periodsSet.add(toIsoPeriod(item.period));
        });
      }
    }
  } catch (e) {}

  // The real current month is always a valid, selectable reporting period —
  // even before any data has been uploaded for it.
  const now = new Date();
  const currentIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  periodsSet.add(currentIso);

  // Parse all discovered period strings and sort chronologically (newest first)
  const parsedList: ParsedPeriod[] = [];
  periodsSet.forEach(p => {
    const parsed = parsePeriod(p);
    if (parsed) {
      parsedList.push(parsed);
    }
  });

  // Sort descending by year then month
  parsedList.sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year;
    return b.month - a.month;
  });

  return parsedList.map(p => p.iso);
}

/**
 * Consolidated single auto-derivation function.
 * Always the real current calendar month — the "reporting month" is what we are
 * reporting for *now*, not the newest month that happens to have uploaded data.
 * (Historical periods with data remain browsable via getAvailableReportingPeriods().)
 */
export function deriveAutoReportingPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** "2026-10" -> "2026-09". */
export function previousIsoMonth(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/**
 * Automatic reporting month, following the business cycle instead of the
 * calendar: it stays on month M until M's Monthly report is uploaded AND
 * Daily MGT for M+1 exists, then flips to M+1. Days still belong to their
 * calendar month. With no Daily MGT at all it is the calendar month.
 *
 * @param earliestDaily / latestDaily  ISO dates ("YYYY-MM-DD") of the Daily MGT data
 * @param monthlyMonths  months that have an uploaded Monthly report (any label form)
 */
export function deriveBusinessReportingPeriod(
  earliestDaily: string | null,
  latestDaily: string | null,
  monthlyMonths: string[],
): string {
  const latest = latestDaily && /^\d{4}-\d{2}/.test(latestDaily) ? latestDaily.slice(0, 7) : null;
  if (!latest) return deriveAutoReportingPeriod();
  const previous = previousIsoMonth(latest);
  const earliest = earliestDaily && /^\d{4}-\d{2}/.test(earliestDaily) ? earliestDaily.slice(0, 7) : latest;
  const previousHasData = earliest <= previous;
  const previousClosed = monthlyMonths.some(m => toIsoPeriod(m) === previous);
  return previousHasData && !previousClosed ? previous : latest;
}
