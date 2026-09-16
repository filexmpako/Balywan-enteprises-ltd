/**
 * Server-only purge logic for uploaded reports.
 *
 * Deleting an upload from the Report History must also remove every row that
 * upload produced in Postgres, otherwise dashboards keep counting data the
 * admin already discarded.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

type DB = SupabaseClient<any, any, any>;

export interface PurgeInput {
  uploadId?: string | null;
  fileName?: string | null;
  reportingWeek?: string | null;
  reportingMonth?: string | null;
  reportType?: string | null;
}

export interface PurgeResult {
  uploadIds: string[];
  transactions: number;
  auditRecords: number;
  weeklyRows: number;
  monthlyRowsDeleted: number;
  monthlyServicingRows: number;
  statusHistoryRows: number;
  documentsPruned: string[];
  targetDates: string[];
  transactionRefs: string[];
}

const chunk = <T,>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

export async function purgeUpload(supabase: DB, input: PurgeInput): Promise<PurgeResult> {
  const result: PurgeResult = {
    uploadIds: [],
    transactions: 0,
    auditRecords: 0,
    weeklyRows: 0,
    monthlyRowsDeleted: 0,
    monthlyServicingRows: 0,
    statusHistoryRows: 0,
    documentsPruned: [],
    targetDates: [],
    transactionRefs: [],
  };

  // 1. Resolve which upload archive rows this report refers to.
  const uploadIds = new Set<string>();
  if (input.uploadId) uploadIds.add(String(input.uploadId));

  if (!uploadIds.size && input.fileName) {
    const { data, error } = await supabase
      .from('file_upload_archives')
      .select('upload_id')
      .eq('file_name', input.fileName);
    if (error) throw new Error(`file_upload_archives lookup: ${error.message}`);
    for (const row of data ?? []) uploadIds.add(String(row.upload_id));
  }

  result.uploadIds = Array.from(uploadIds);

  // Capture the archive metadata before the rows are deleted: the derived
  // caches (daily summaries, KPI histories) are keyed by these periods.
  for (const batch of chunk(result.uploadIds, 50)) {
    const { data, error } = await supabase
      .from('file_upload_archives')
      .select('target_date, reporting_period')
      .in('upload_id', batch);
    if (error) throw new Error(`file_upload_archives metadata: ${error.message}`);
    for (const row of data ?? []) {
      if (row.target_date) result.targetDates.push(String(row.target_date));
    }
  }

  // 2. Remove derived transaction + classification rows for those uploads.
  for (const batch of chunk(result.uploadIds, 50)) {
    const { data: refs, error: refError } = await supabase
      .from('daily_transaction_records')
      .select('transaction_ref')
      .in('upload_id', batch)
      .limit(50000);
    if (refError) throw new Error(`daily_transaction_records read: ${refError.message}`);
    for (const r of refs ?? []) {
      if (r.transaction_ref) result.transactionRefs.push(String(r.transaction_ref));
    }
    result.transactions += (refs ?? []).length;

    const { data: audits, error: auditError } = await supabase
      .from('classification_audit_records')
      .delete()
      .in('upload_id', batch)
      .select('id');
    if (auditError) throw new Error(`classification_audit_records delete: ${auditError.message}`);
    result.auditRecords += (audits ?? []).length;

    const { error: txError } = await supabase
      .from('daily_transaction_records')
      .delete()
      .in('upload_id', batch);
    if (txError) throw new Error(`daily_transaction_records delete: ${txError.message}`);

    const { error: archiveError } = await supabase
      .from('file_upload_archives')
      .delete()
      .in('upload_id', batch);
    if (archiveError) throw new Error(`file_upload_archives delete: ${archiveError.message}`);
  }

  // 3. Weekly KPI uploads keep their rows in weekly_servicing_records.
  if (input.reportingWeek) {
    const { data, error } = await supabase
      .from('weekly_servicing_records')
      .delete()
      .eq('reporting_week', input.reportingWeek)
      .select('id');
    if (error) throw new Error(`weekly_servicing_records delete: ${error.message}`);
    result.weeklyRows = (data ?? []).length;

    // The weekly upload is what produced this week's active/inactive verdicts.
    const { data: history, error: historyError } = await supabase
      .from('wakala_status_history')
      .delete()
      .eq('reporting_week', input.reportingWeek)
      .select('id');
    if (historyError) throw new Error(`wakala_status_history delete: ${historyError.message}`);
    result.statusHistoryRows += (history ?? []).length;
  }

  // 4. Monthly uploads feed the month-scoped target/summary/snapshot tables.
  if (input.reportingMonth) {
    const monthTables: Array<{ table: string; column: string }> = [
      { table: 'monthly_kpi_targets', column: 'reporting_month' },
      { table: 'performance_summaries', column: 'reporting_month' },
      { table: 'monthly_kpi_snapshots', column: 'reporting_month' },
    ];
    for (const t of monthTables) {
      const { data, error } = await supabase
        .from(t.table)
        .delete()
        .eq(t.column, input.reportingMonth)
        .select('*');
      if (error) throw new Error(`${t.table} delete: ${error.message}`);
      result.monthlyRowsDeleted += (data ?? []).length;
    }

    // Snapshot tables key on (reporting_period, period_type); both carry a
    // period_type column constrained to 'Daily' | 'Monthly', so scoping the
    // delete by period_type = 'Monthly' cannot touch daily rows.
    for (const table of ['company_performance_snapshots', 'owner_performance_snapshots']) {
      const { data, error } = await supabase
        .from(table)
        .delete()
        .eq('reporting_period', input.reportingMonth)
        .eq('period_type', 'Monthly')
        .select('*');
      if (error) throw new Error(`${table} delete: ${error.message}`);
      result.monthlyRowsDeleted += (data ?? []).length;
    }

    // Per-wakala monthly rows (the cloud copy of the uploaded workbook).
    const { data: servicing, error: servicingError } = await supabase
      .from('monthly_servicing_records')
      .delete()
      .eq('reporting_month', input.reportingMonth)
      .select('id');
    if (servicingError) throw new Error(`monthly_servicing_records delete: ${servicingError.message}`);
    result.monthlyServicingRows = (servicing ?? []).length;
  }

  // 5. Derived caches in app_settings must forget the period too, otherwise
  //    any browser re-hydrates the deleted report straight back into the UI.
  result.documentsPruned = await pruneDerivedDocuments(supabase, input);

  return result;
}

/**
 * Strips a deleted report's period out of the jsonb derived caches
 * (dashboard KPI summary, weekly/monthly histories, report registry).
 */
async function pruneDerivedDocuments(supabase: DB, input: PurgeInput): Promise<string[]> {
  const pruned: string[] = [];
  const keys = [
    'weeklyKpiHistory',
    'weeklyWakalaStatsHistory',
    'kpiWorkbookHistory',
    'auditHistoryReports',
    'dashboardKPIs',
  ];

  const { data, error } = await supabase.from('app_settings').select('key, value').in('key', keys);
  if (error) throw new Error(`app_settings read: ${error.message}`);

  const docs = new Map<string, any>();
  for (const row of data ?? []) docs.set(String(row.key), row.value);

  const week = input.reportingWeek ? String(input.reportingWeek) : null;
  const month = input.reportingMonth ? String(input.reportingMonth) : null;

  const write = async (key: string, value: any) => {
    const { error: upsertError } = await supabase
      .from('app_settings')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (upsertError) throw new Error(`app_settings ${key}: ${upsertError.message}`);
    pruned.push(key);
  };

  const filterArray = async (key: string, predicate: (entry: any) => boolean) => {
    const current = docs.get(key);
    if (!Array.isArray(current)) return;
    const next = current.filter((entry) => !predicate(entry));
    if (next.length !== current.length) await write(key, next);
  };

  if (week) {
    await filterArray('weeklyKpiHistory', (e) => e?.reportingWeek === week);
    await filterArray('weeklyWakalaStatsHistory', (e) => e?.reportingWeek === week);
  }

  if (month) {
    await filterArray('kpiWorkbookHistory', (e) => e?.reportingMonth === month);

    // The dashboard KPI summary is the uploaded workbook's own numbers, so it
    // must fall back to the newest workbook still on file (or empty).
    const remaining = docs.get('kpiWorkbookHistory');
    const survivors = Array.isArray(remaining)
      ? remaining.filter((e: any) => e?.reportingMonth !== month)
      : [];
    const nextKpis = Array.isArray(survivors[0]?.kpis) ? survivors[0].kpis : [];
    const currentKpis = docs.get('dashboardKPIs');
    if (JSON.stringify(currentKpis ?? []) !== JSON.stringify(nextKpis)) {
      await write('dashboardKPIs', nextKpis);
    }
  }

  await filterArray('auditHistoryReports', (e) => {
    if (input.uploadId && e?.uploadId) return String(e.uploadId) === String(input.uploadId);
    if (input.fileName && e?.fileName) return String(e.fileName) === String(input.fileName);
    if (week) return e?.reportingWeek === week;
    if (month) return e?.reportingMonth === month;
    return false;
  });

  return pruned;
}
