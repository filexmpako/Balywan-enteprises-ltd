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
export function formatTime(value: Date | string | number): string {
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
