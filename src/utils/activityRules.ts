/**
 * Configurable Active / Inactive counting rule.
 *
 * A wakala counts as ACTIVE for a reporting week when its cash-in / cash-out
 * transaction count reaches the configured threshold. Admins change the
 * threshold, the combine mode and the telco penalty rate from Settings; every
 * surface (weekly engine, Base Wakala list, KPI 3, penalty card) reads the
 * rule through this module so they can never disagree.
 *
 * Stored under the synced document key `activityRules`, so it lives in
 * Postgres (app_settings) with the local cache as offline mirror.
 */

export const ACTIVITY_RULES_KEY = 'activityRules';

export interface ActivityRules {
  /** Minimum CI+CO transaction count for a wakala to be Active in the window. Count only — amount plays no part in Active/Inactive. */
  threshold: number;
  /** Minimum servicing amount for a wakala to be Served, regardless of Active/Inactive status. */
  amountThreshold: number;
  /** Minimum transaction count for an Inactive wakala to be Served (Active wakalas are judged on amount only). */
  servedTxnThreshold: number;
  /** combined = CI + CO counted together; separate = each must reach it. */
  mode: 'combined' | 'separate';
  /** Evaluation window. Weekly is the specification default. */
  window: 'weekly';
  /** Telco penalty rate applied to bank-served volume at month end. */
  penaltyRate: number;
}

export const DEFAULT_ACTIVITY_RULES: ActivityRules = {
  threshold: 25,
  amountThreshold: 600000,
  servedTxnThreshold: 6,
  mode: 'combined',
  window: 'weekly',
  penaltyRate: 0.05,
};

export function normalizeActivityRules(raw: any): ActivityRules {
  const threshold = Number(raw?.threshold);
  const amountThreshold = Number(raw?.amountThreshold);
  const servedTxnThreshold = Number(raw?.servedTxnThreshold);
  const penaltyRate = Number(raw?.penaltyRate);
  return {
    threshold: Number.isFinite(threshold) && threshold >= 0 ? threshold : DEFAULT_ACTIVITY_RULES.threshold,
    amountThreshold:
      Number.isFinite(amountThreshold) && amountThreshold >= 0
        ? amountThreshold
        : DEFAULT_ACTIVITY_RULES.amountThreshold,
    servedTxnThreshold:
      Number.isFinite(servedTxnThreshold) && servedTxnThreshold >= 0
        ? servedTxnThreshold
        : DEFAULT_ACTIVITY_RULES.servedTxnThreshold,
    mode: raw?.mode === 'separate' ? 'separate' : 'combined',
    window: 'weekly',
    penaltyRate:
      Number.isFinite(penaltyRate) && penaltyRate >= 0 ? penaltyRate : DEFAULT_ACTIVITY_RULES.penaltyRate,
  };
}

export function getActivityRules(): ActivityRules {
  try {
    const saved = localStorage.getItem(ACTIVITY_RULES_KEY);
    if (!saved) return { ...DEFAULT_ACTIVITY_RULES };
    return normalizeActivityRules(JSON.parse(saved));
  } catch {
    return { ...DEFAULT_ACTIVITY_RULES };
  }
}

/** Persists the rule (cloud sync mirrors it to Postgres) and notifies views. */
export function saveActivityRules(rules: Partial<ActivityRules>): ActivityRules {
  const next = normalizeActivityRules({ ...getActivityRules(), ...rules });
  try {
    localStorage.setItem(ACTIVITY_RULES_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event('activity-rules-updated'));
  } catch {
    /* never break the UI on a cache write */
  }
  return next;
}

export interface TxnCounts {
  cashIn: number;
  cashOut: number;
  total: number;
  amount?: number;
}

const CI_TXN_KEYS = ['CI_txns', 'CI txns', 'ci_txns', 'Cash In Txns', 'Cash-In Txns', 'CI_Count', 'CI count'];
const CO_TXN_KEYS = ['CO_txns', 'CO txns', 'co_txns', 'Cash Out Txns', 'Cash-Out Txns', 'CO_Count', 'CO count'];
const TOTAL_TXN_KEYS = ['SA_Servicing_Txns', 'SA Servicing Txns', 'sa_servicing_txns', 'Transactions', 'txns'];
const AMOUNT_KEYS = [
  'SA_Servicing_Val',
  'SA Servicing Val',
  'SA_Servicing_Value',
  'SA Servicing Value',
  'sa_servicing_val',
  'servicing_val',
  'Servicing Amount',
  'Transaction Amount',
  'Volume',
  'Amount',
  'Value',
];

function readNumber(row: any, keys: string[]): number {
  if (!row) return 0;
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      const n = parseFloat(String(v).replace(/,/g, '').trim());
      if (!isNaN(n)) return n;
    }
  }
  const normalized = keys.map(k => k.toLowerCase().replace(/[\s_-]+/g, ''));
  for (const rowKey of Object.keys(row)) {
    if (normalized.includes(rowKey.toLowerCase().replace(/[\s_-]+/g, ''))) {
      const n = parseFloat(String(row[rowKey]).replace(/,/g, '').trim());
      if (!isNaN(n)) return n;
    }
  }
  return 0;
}

/**
 * Cash-in / cash-out transaction counts for one uploaded row.
 * When the file carries no CI/CO split, the servicing transaction count is
 * used as the combined total so the rule still has real data to work with.
 */
export function extractTxnCounts(row: any): TxnCounts {
  const cashIn = readNumber(row, CI_TXN_KEYS);
  const cashOut = readNumber(row, CO_TXN_KEYS);
  const amount = readNumber(row, AMOUNT_KEYS);
  if (cashIn > 0 || cashOut > 0) {
    return { cashIn, cashOut, total: cashIn + cashOut, amount };
  }
  const total = readNumber(row, TOTAL_TXN_KEYS);
  return { cashIn: 0, cashOut: 0, total, amount };
}

/** The single Active/Inactive decision used everywhere. Transaction count only — no amount component. */
export function isActiveByRule(counts: TxnCounts, rules: ActivityRules = getActivityRules()): boolean {
  return rules.mode === 'separate'
    ? counts.cashIn >= rules.threshold && counts.cashOut >= rules.threshold
    : (counts.cashIn + counts.cashOut > 0 ? counts.cashIn + counts.cashOut : counts.total) >= rules.threshold;
}

/**
 * The single Served/Unserved decision used everywhere a computed rule
 * applies (merged with any uploaded servicing_status column via
 * mergeServicedStatus — a "served" reading from either source wins).
 * Active wakala: served once servicing value reaches the amount threshold.
 * Inactive wakala: served once transaction count OR servicing value reaches
 * its threshold.
 */
export function isServedByRule(
  counts: TxnCounts,
  isActive: boolean,
  rules: ActivityRules = getActivityRules()
): boolean {
  const amount = Number(counts.amount) || 0;
  const total = counts.cashIn + counts.cashOut > 0 ? counts.cashIn + counts.cashOut : counts.total;
  if (isActive) return amount >= rules.amountThreshold;
  return total >= rules.servedTxnThreshold || amount >= rules.amountThreshold;
}

/** Month-end telco penalty on the volume the bank served to wakalas. */
export function calculatePenalty(servedVolume: number, rules: ActivityRules = getActivityRules()): number {
  const vol = Number(servedVolume) || 0;
  return (vol * (Number(rules.penaltyRate) || 0)) / 100;
}
