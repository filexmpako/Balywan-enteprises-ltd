export function normalizeMsisdn(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return '';
  const cleaned = String(input).replace(/\D/g, '');
  if (!cleaned) return '';

  // 10-digit starting with 06 or 07 -> 2556... or 2557...
  if (cleaned.length === 10 && (cleaned.startsWith('07') || cleaned.startsWith('06'))) {
    return `255${cleaned.slice(1)}`;
  }

  // 9-digit starting with 6 or 7 -> 2556... or 2557...
  if (cleaned.length === 9 && (cleaned.startsWith('7') || cleaned.startsWith('6'))) {
    return `255${cleaned}`;
  }

  // 12-digit starting with 255
  if (cleaned.length === 12 && cleaned.startsWith('255')) {
    return cleaned;
  }

  // General 9-digit fallback
  if (cleaned.length === 9) {
    return `255${cleaned}`;
  }

  return cleaned;
}

export function isValidTanzanianMsisdn(msisdn: string): boolean {
  return /^255[67]\d{8}$/.test(msisdn);
}

