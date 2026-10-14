/**
 * Helper to abbreviate numeric strings or raw numbers into standardized M (Millions) and B (Billions) formats.
 * Examples:
 * - 6340000 -> 6.34M
 * - 999000000 -> 999M
 * - 3400000000 -> 3.4B
 * - 34000000000 -> 34B
 */

export function formatNumberWithAbbreviation(num: number): string {
  // Tolerate missing/legacy values so a stale cached record can't blank a page.
  if (num === null || num === undefined || isNaN(Number(num))) return '0';
  num = Number(num);
  if (num >= 1e9) {
    return `${Number((num / 1e9).toFixed(2))}B`;
  } else if (num >= 1e6) {
    return `${Number((num / 1e6).toFixed(2))}M`;
  }
  return num.toLocaleString('en-US');
}

