/**
 * Single source of truth for served/unserved status read from the uploaded
 * data itself (the `servicing_status` column: 1 = served, 0 = not served).
 *
 * Used by Weekly data today and by Monthly data as soon as that column starts
 * appearing in Monthly uploads. Daily MGT keeps its own computed rule — it has
 * no status column at all.
 *
 * Returns `null` when the column is genuinely absent: a missing measurement
 * must never be reported as "not served".
 */
export function getServicedStatusFromColumn(
  row: { raw?: Record<string, any> } | Record<string, any> | null | undefined,
): boolean | null {
  if (!row) return null;
  const anyRow = row as Record<string, any>;
  const raw = anyRow.raw && typeof anyRow.raw === 'object' ? anyRow.raw : anyRow;

  const direct =
    raw?.servicing_status ??
    raw?.Servicing_Status ??
    raw?.['Servicing Status'] ??
    raw?.['servicing status'] ??
    anyRow?.servicing_status ??
    anyRow?.Servicing_Status ??
    anyRow?.['Servicing Status'];

  let val = direct;

  // Loose header match (case / spacing / punctuation insensitive)
  if (val === undefined || val === null || val === '') {
    for (const source of [raw, anyRow]) {
      if (!source || typeof source !== 'object') continue;
      for (const key of Object.keys(source)) {
        if (key.toLowerCase().replace(/[\s_-]+/g, '') === 'servicingstatus') {
          const candidate = source[key];
          if (candidate !== undefined && candidate !== null && candidate !== '') {
            val = candidate;
            break;
          }
        }
      }
      if (val !== undefined && val !== null && val !== '') break;
    }
  }

  if (val === undefined || val === null || val === '') return null;
  const num = Number(val);
  if (!isNaN(num)) return num === 1;
  const text = String(val).trim().toLowerCase();
  if (['served', 'yes', 'true', 'y'].includes(text)) return true;
  if (['not served', 'unserved', 'no', 'false', 'n'].includes(text)) return false;
  return null;
}

/** Merges two per-wakala status readings (a served reading always wins). */
export function mergeServicedStatus(a: boolean | null, b: boolean | null): boolean | null {
  if (a === true || b === true) return true;
  if (a === false || b === false) return false;
  return null;
}
