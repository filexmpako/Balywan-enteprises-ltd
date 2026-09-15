/**
 * Server-only persistence for Monthly KPI servicing rows.
 *
 * Mirrors weekly.server.ts: Postgres is the system of record, IndexedDB keeps
 * only an offline mirror, so monthly per-wakala detail survives sign-out,
 * cache clears and device changes.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeMsisdn } from '../utils/msisdn';

type DB = SupabaseClient<any, any, any>;

const TABLE = 'monthly_servicing_records';

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function num(value: any): number {
  if (value === undefined || value === null || value === '') return 0;
  const parsed = parseFloat(String(value).replace(/,/g, '').trim());
  return isNaN(parsed) ? 0 : parsed;
}

function pick(row: any, keys: string[]): any {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
  }
  const normalized = new Map(
    Object.keys(row).map((k) => [k.toLowerCase().replace(/[\s_-]+/g, ''), k]),
  );
  for (const k of keys) {
    const hit = normalized.get(k.toLowerCase().replace(/[\s_-]+/g, ''));
    if (hit && row[hit] !== undefined && row[hit] !== null && row[hit] !== '') return row[hit];
  }
  return undefined;
}

/** Merges two rows for the same MSISDN, keeping any "served" reading. */
function mergeRaw(a: any, b: any): any {
  const merged = { ...(a && typeof a === 'object' ? a : {}), ...(b && typeof b === 'object' ? b : {}) };
  const served = (row: any) =>
    Number(pick(row || {}, ['servicing_status', 'Servicing_Status', 'Servicing Status']) ?? NaN) === 1;
  if (served(a) || served(b)) merged.servicing_status = 1;
  return merged;
}

export interface MonthlyRowInput {
  reportingMonth: string;
  rows: any[];
  uploadedBy?: string;
}

/** Replaces one reporting month with the freshly uploaded rows. */
export async function saveMonthlyRows(supabase: DB, input: MonthlyRowInput): Promise<number> {
  const month = String(input.reportingMonth || '').trim();
  if (!month) throw new Error('reportingMonth is required');

  const byMsisdn = new Map<string, any>();
  (input.rows || []).forEach((raw: any, index: number) => {
    const msisdn = String(
      pick(raw, [
        'MSISDN',
        'msisdn',
        'MSISDN_NO',
        'MSISDN NO',
        'Msisdn No',
        'Agent_MSISDN',
        'Wakala_MSISDN',
        'phone',
        'Phone Number',
        'Mobile',
      ]) ?? '',
    ).trim();
    const key = normalizeMsisdn(msisdn) || `__norow_${index}`;
    const existing = byMsisdn.get(key);
    const txns = num(
      pick(raw, [
        'SA_Servicing_Txns', 'SA Servicing Txns', 'SA_Servicing_Transactions',
        'SA Servicing Transactions', 'servicing_txns', 'Servicing Transactions',
        'Transaction Count', 'Transactions', 'Txns',
      ]),
    );
    const val = num(
      pick(raw, [
        'SA_Servicing_Val', 'SA Servicing Val', 'SA_Servicing_Value',
        'SA Servicing Value', 'servicing_val', 'Servicing Amount',
        'Transaction Amount', 'Volume', 'Amount', 'Value',
      ]),
    );
    const statusRaw = pick(raw, ['Wakala_Status', 'Wakala Status', 'status']);
    byMsisdn.set(key, {
      reporting_month: month,
      msisdn: key,
      owner_id: null as string | null,
      owner_name: String(pick(raw, ['Owner_Name', 'owner_name', 'Wakala Name', 'owner']) ?? '') || null,
      wakala_status: Math.max(
        statusRaw === undefined || statusRaw === null ? 0 : Number(statusRaw) || 0,
        existing ? Number(existing.wakala_status) || 0 : 0,
      ),
      servicing_txns: existing ? Number(existing.servicing_txns) + txns : txns,
      servicing_val: existing ? Number(existing.servicing_val) + val : val,
      raw: existing ? mergeRaw(existing.raw, raw) : raw,
      uploaded_by: input.uploadedBy ?? null,
    });
  });

  const records = Array.from(byMsisdn.values());

  // Attribute rows to owners through the Base Wakala index (paginated: a single
  // Data API response is capped at 1000 rows).
  const baseRows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from('base_wakala_index')
      .select('msisdn, alt_msisdn, owner_id')
      .not('owner_id', 'is', null)
      .range(from, from + 999);
    const page = data ?? [];
    baseRows.push(...page);
    if (page.length < 1000) break;
  }

  const ownerByMsisdn = new Map<string, string>();
  for (const b of baseRows) {
    if (b.msisdn) ownerByMsisdn.set(String(b.msisdn).replace(/\D/g, ''), b.owner_id);
    if (b.alt_msisdn) ownerByMsisdn.set(String(b.alt_msisdn).replace(/\D/g, ''), b.owner_id);
  }
  for (const r of records) {
    const key = r.msisdn.replace(/\D/g, '');
    r.owner_id = ownerByMsisdn.get(key) ?? ownerByMsisdn.get(key.replace(/^0/, '255')) ?? null;
  }

  const { error: delError } = await supabase.from(TABLE).delete().eq('reporting_month', month);
  if (delError) throw new Error(`${TABLE} clear: ${delError.message}`);

  for (const batch of chunk(records, 500)) {
    const { error } = await supabase.from(TABLE).insert(batch);
    if (error) throw new Error(`${TABLE} insert: ${error.message}`);
  }

  return records.length;
}

export async function loadMonthlyRows(supabase: DB, reportingMonth?: string): Promise<any[]> {
  const PAGE = 1000;
  const data: any[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase.from(TABLE).select('*').range(from, from + PAGE - 1);
    if (reportingMonth) query = query.eq('reporting_month', reportingMonth);
    const { data: page, error } = await query;
    if (error) throw new Error(`${TABLE} read: ${error.message}`);
    data.push(...(page ?? []));
    if (!page || page.length < PAGE) break;
  }
  return data.map((r: any) => ({
    ...(r.raw && typeof r.raw === 'object' ? r.raw : {}),
    MSISDN: r.msisdn,
    Owner_Name: r.owner_name || '',
    ownerId: r.owner_id || '',
    Wakala_Status: r.wakala_status,
    SA_Servicing_Txns: Number(r.servicing_txns) || 0,
    SA_Servicing_Val: Number(r.servicing_val) || 0,
    reportingMonth: r.reporting_month,
  }));
}

export async function listMonthlyMonths(supabase: DB): Promise<string[]> {
  const PAGE = 1000;
  const months = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('reporting_month')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${TABLE} months: ${error.message}`);
    (data ?? []).forEach((r: any) => r.reporting_month && months.add(r.reporting_month));
    if (!data || data.length < PAGE) break;
  }
  return Array.from(months);
}

export async function deleteMonthlyRows(supabase: DB, reportingMonth: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('reporting_month', reportingMonth);
  if (error) throw new Error(`${TABLE} delete: ${error.message}`);
}
