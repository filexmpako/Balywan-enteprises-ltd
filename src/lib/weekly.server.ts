/**
 * Server-only persistence for Weekly KPI servicing rows.
 *
 * Postgres is the system of record — IndexedDB keeps only an offline mirror,
 * so weekly data survives sign-out, cache clears and device changes.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

type DB = SupabaseClient<any, any, any>;

const TABLE = 'weekly_servicing_records';

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

export interface WeeklyRowInput {
  reportingWeek: string;
  reportingMonth?: string;
  rows: any[];
  columns?: string[];
  uploadedBy?: string;
}

/** Replaces one reporting week with the freshly uploaded rows. */
export async function saveWeeklyRows(supabase: DB, input: WeeklyRowInput): Promise<number> {
  const week = String(input.reportingWeek || '').trim();
  if (!week) throw new Error('reportingWeek is required');

  // Deduplicate on MSISDN — the unique key of a weekly row.
  const byMsisdn = new Map<string, any>();
  for (const raw of input.rows || []) {
    const msisdn = String(pick(raw, ['MSISDN', 'msisdn', 'phone']) ?? '').trim();
    if (!msisdn) continue;
    const existing = byMsisdn.get(msisdn);
    const txns = num(pick(raw, ['SA_Servicing_Txns', 'SA Servicing Txns']));
    const val = num(pick(raw, ['SA_Servicing_Val', 'SA Servicing Val']));
    const statusRaw = pick(raw, ['Wakala_Status', 'Wakala Status', 'status']);
    const record = {
      reporting_week: week,
      reporting_month: input.reportingMonth || null,
      msisdn,
      owner_id: null as string | null,
      owner_name: String(pick(raw, ['Owner_Name', 'owner_name', 'Wakala Name', 'owner']) ?? '') || null,
      wakala_status: statusRaw === undefined ? null : Number(statusRaw) || 0,
      servicing_txns: existing ? Number(existing.servicing_txns) + txns : txns,
      servicing_val: existing ? Number(existing.servicing_val) + val : val,
      raw,
      uploaded_by: input.uploadedBy ?? null,
    };
    byMsisdn.set(msisdn, record);
  }

  const records = Array.from(byMsisdn.values());

  // Attribute rows to owners through the Base Wakala index so owner-scoped RLS
  // reads (and the Owner dashboard) work without a second pass.
  const { data: baseRows } = await supabase
    .from('base_wakala_index')
    .select('msisdn, alt_msisdn, owner_id')
    .not('owner_id', 'is', null)
    .limit(50000);

  const ownerByMsisdn = new Map<string, string>();
  for (const b of baseRows ?? []) {
    if (b.msisdn) ownerByMsisdn.set(String(b.msisdn).replace(/\D/g, ''), b.owner_id);
    if (b.alt_msisdn) ownerByMsisdn.set(String(b.alt_msisdn).replace(/\D/g, ''), b.owner_id);
  }
  for (const r of records) {
    const key = r.msisdn.replace(/\D/g, '');
    r.owner_id = ownerByMsisdn.get(key) ?? ownerByMsisdn.get(key.replace(/^0/, '255')) ?? null;
  }

  const { error: delError } = await supabase.from(TABLE).delete().eq('reporting_week', week);
  if (delError) throw new Error(`${TABLE} clear: ${delError.message}`);

  for (const batch of chunk(records, 500)) {
    const { error } = await supabase.from(TABLE).insert(batch);
    if (error) throw new Error(`${TABLE} insert: ${error.message}`);
  }

  return records.length;
}

export async function loadWeeklyRows(supabase: DB, reportingWeek?: string): Promise<any[]> {
  let query = supabase.from(TABLE).select('*').limit(50000);
  if (reportingWeek) query = query.eq('reporting_week', reportingWeek);
  const { data, error } = await query;
  if (error) throw new Error(`${TABLE} read: ${error.message}`);
  return (data ?? []).map((r: any) => ({
    ...(r.raw && typeof r.raw === 'object' ? r.raw : {}),
    MSISDN: r.msisdn,
    Owner_Name: r.owner_name || '',
    ownerId: r.owner_id || '',
    Wakala_Status: r.wakala_status,
    SA_Servicing_Txns: Number(r.servicing_txns) || 0,
    SA_Servicing_Val: Number(r.servicing_val) || 0,
    reportingWeek: r.reporting_week,
    reportingMonth: r.reporting_month || '',
  }));
}

export async function listWeeklyWeeks(supabase: DB): Promise<string[]> {
  const { data, error } = await supabase.from(TABLE).select('reporting_week').limit(50000);
  if (error) throw new Error(`${TABLE} weeks: ${error.message}`);
  return Array.from(new Set((data ?? []).map((r: any) => r.reporting_week))).filter(Boolean);
}

export async function deleteWeeklyRows(supabase: DB, reportingWeek: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('reporting_week', reportingWeek);
  if (error) throw new Error(`${TABLE} delete: ${error.message}`);
}
