/**
 * Helper to abbreviate numeric strings or raw numbers into standardized M (Millions) and B (Billions) formats.
 * Examples:
 * - 6340000 -> 6.34M
 * - 999000000 -> 999M
 * - 3400000000 -> 3.4B
 * - 34000000000 -> 34B
 */

export function formatNumberWithAbbreviation(num: number): string {
  if (num >= 1e9) {
    return `${Number((num / 1e9).toFixed(2))}B`;
  } else if (num >= 1e6) {
    return `${Number((num / 1e6).toFixed(2))}M`;
  }
  return num.toLocaleString('en-US');
}

export function abbreviateNumberString(valStr: string): string {
  if (!valStr) return '';
  
  // Regular expression to match numeric sequences with optional commas or periods.
  // We match word boundaries, allowing numbers like 6,340,000 or 3400000000 to be converted.
  return valStr.replace(/\b\d[\d,]+(?:\.\d+)?\b/g, (match) => {
    const plain = match.replace(/,/g, '');
    const num = parseFloat(plain);
    if (isNaN(num)) return match;
    
    if (num >= 1e9) {
      const val = num / 1e9;
      const formatted = Number(val.toFixed(2));
      return `${formatted}B`;
    } else if (num >= 1e6) {
      const val = num / 1e6;
      const formatted = Number(val.toFixed(2));
      return `${formatted}M`;
    }
    
    // Otherwise return with commas for clean reading
    return num.toLocaleString('en-US');
  });
}
