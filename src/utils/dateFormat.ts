/**
 * Single source of truth for date/time display across the app.
 * Canonical style: "16 Sep 2026" for dates, "16 Sep 2026, 14:30" for date+time.
 */

const DATE_OPTS: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' };
const SHORT_DATE_OPTS: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
const MONTH_YEAR_OPTS: Intl.DateTimeFormatOptions = { month: 'short', year: 'numeric' };
const TIME_OPTS: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

/** "16 Sep 2026" */
export function formatDate(value: Date | string | number): string {
  const d = toDate(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', DATE_OPTS);
}

/** "14:30" */
function formatTime(value: Date | string | number): string {
  const d = toDate(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-GB', TIME_OPTS);
}

/** "16 Sep 2026, 14:30" */
export function formatDateTime(value: Date | string | number): string {
  const d = toDate(value);
  if (isNaN(d.getTime())) return '—';
  return `${formatDate(d)}, ${formatTime(d)}`;
}

/** "16 Sep" — compact form for chart axes and tight spaces */
export function formatShortDate(value: Date | string | number): string {
  const d = toDate(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', SHORT_DATE_OPTS);
}

/** "Sep 2026" */
export function formatMonthYear(value: Date | string | number): string {
  const d = toDate(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', MONTH_YEAR_OPTS);
}

/**
 * "2026-09-16" for a date input. Reads Dates, ISO and display strings and
 * Excel serial day numbers (as the Base Wakala file carries them); '' when unreadable.
 */
export function toIsoDay(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, '0');
  if (/^\d+(\.\d+)?$/.test(text)) {
    const d = new Date(Math.round((Number(text) - 25569) * 86400000));
    return isNaN(d.getTime()) ? '' : `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const d = value instanceof Date ? value : new Date(text);
  return isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
