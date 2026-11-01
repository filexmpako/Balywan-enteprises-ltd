/**
 * Month-end IOP reports, stored one month per app_settings row
 * (`iopReport:YYYY-MM`). The rows are kept as uploaded and attributed to
 * owners when read, so owner / till / Base Wakala changes apply without a
 * re-upload. These rows are not part of the workspace every device downloads.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadWorkspace, workspaceToSnapshot } from './hasidadi/repo.server';
import { runWithSnapshot } from './hasidadi/engine-context.server';
import { summarizeIopReport, type IopReportRow, type IopReportSummary } from '../utils/iopReport';

type DB = SupabaseClient<any, any, any>;

const PREFIX = 'iopReport:';

type StoredRow = [string, string, 'R' | 'C', string, number, number, number];

interface StoredReport {
  month: string;
  fileName: string;
  uploadedAt: string;
  uploadedBy: string | null;
  rows: StoredRow[];
}

export interface IopReportMeta {
  month: string;
  fileName: string;
  uploadedAt: string;
}

const pack = (r: IopReportRow): StoredRow =>
  [r.till, r.agent, r.status === 'REWARD' ? 'R' : 'C', r.tillName, r.cicoValue, r.cicoRatio, r.revisedAmount];
const unpack = ([till, agent, s, tillName, cicoValue, cicoRatio, revisedAmount]: StoredRow): IopReportRow =>
  ({ till, agent, status: s === 'R' ? 'REWARD' : 'CLAWBACK', tillName, cicoValue, cicoRatio, revisedAmount });

/** Replaces the month's report. */
export async function saveIopReport(
  supabase: DB,
  input: { month: string; fileName: string; rows: IopReportRow[]; userId: string },
): Promise<number> {
  const value: StoredReport = {
    month: input.month,
    fileName: input.fileName,
    uploadedAt: new Date().toISOString(),
    uploadedBy: input.userId,
    rows: input.rows.map(pack),
  };
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: PREFIX + input.month, value, updated_by: input.userId, updated_at: value.uploadedAt }, { onConflict: 'key' });
  if (error) throw new Error(`IOP report save: ${error.message}`);
  return input.rows.length;
}

export async function deleteIopReport(supabase: DB, month: string): Promise<void> {
  const { error } = await supabase.from('app_settings').delete().eq('key', PREFIX + month);
  if (error) throw new Error(`IOP report delete: ${error.message}`);
}

/** The month's report attributed with today's registries, or null when none was uploaded. */
export async function loadIopReportSummary(
  supabase: DB,
  month: string,
): Promise<(IopReportMeta & { summary: IopReportSummary }) | null> {
  const [{ data, error }, workspace] = await Promise.all([
    supabase.from('app_settings').select('value').eq('key', PREFIX + month).maybeSingle(),
    loadWorkspace(supabase),
  ]);
  if (error) throw new Error(`IOP report read: ${error.message}`);
  const stored = data?.value as StoredReport | undefined;
  if (!stored?.rows) return null;
  const c = workspace.collections;
  const summary = runWithSnapshot(workspaceToSnapshot(workspace), () =>
    summarizeIopReport(stored.rows.map(unpack), {
      owners: c['ownersList'] ?? [],
      tills: c['tillsList'] ?? [],
      baseWakalas: c['baseWakalaIndex'] ?? [],
    }),
  );
  return { month: stored.month, fileName: stored.fileName, uploadedAt: stored.uploadedAt, summary };
}
