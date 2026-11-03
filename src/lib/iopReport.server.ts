/**
 * Month-end IOP reports, stored one month per app_settings row
 * (`iopReport:YYYY-MM`). The rows are kept as uploaded and attributed to
 * owners when read, so owner / till / Base Wakala changes apply without a
 * re-upload. These rows are not part of the workspace every device downloads.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadWorkspace, workspaceToSnapshot } from './hasidadi/repo.server';
import { runWithSnapshot } from './hasidadi/engine-context.server';
import {
  iopAgentsForOwner, iopCicoByAgent, summarizeIopReport,
  type IopAgentHistoryLine, type IopAgentLine, type IopOwnerAgentsView, type IopRegistries, type IopReportRow, type IopReportSummary,
} from '../utils/iopReport';

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

async function readReport(supabase: DB, month: string): Promise<StoredReport | null> {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', PREFIX + month).maybeSingle();
  if (error) throw new Error(`IOP report read: ${error.message}`);
  const stored = data?.value as StoredReport | undefined;
  return stored?.rows ? stored : null;
}

/** Runs `fn` with today's owners / tills / Base Wakala Index. */
async function withRegistries<T>(supabase: DB, fn: (r: IopRegistries) => T): Promise<T> {
  const workspace = await loadWorkspace(supabase);
  const c = workspace.collections;
  return runWithSnapshot(workspaceToSnapshot(workspace), () =>
    fn({ owners: c['ownersList'] ?? [], tills: c['tillsList'] ?? [], baseWakalas: c['baseWakalaIndex'] ?? [] }),
  );
}

/** The month's report attributed with today's registries, or null when none was uploaded. */
export async function loadIopReportSummary(
  supabase: DB,
  month: string,
): Promise<(IopReportMeta & { summary: IopReportSummary }) | null> {
  const stored = await readReport(supabase, month);
  if (!stored) return null;
  const summary = await withRegistries(supabase, r => summarizeIopReport(stored.rows.map(unpack), r));
  return { month: stored.month, fileName: stored.fileName, uploadedAt: stored.uploadedAt, summary };
}

const HISTORY_MONTHS = 5;

/**
 * One owner's REWARD and CLAWBACK agents for the month, each with its CICO
 * VALUE in up to five earlier IOP reports. Null when the month has none.
 */
export async function loadIopOwnerAgents(supabase: DB, month: string, ownerId: string): Promise<IopOwnerAgentsView | null> {
  const stored = await readReport(supabase, month);
  if (!stored) return null;
  const [agents, { data: earlier, error }] = await Promise.all([
    withRegistries(supabase, r => iopAgentsForOwner(stored.rows.map(unpack), r, ownerId)),
    supabase
      .from('app_settings')
      .select('key, value')
      .like('key', `${PREFIX}%`)
      .lt('key', PREFIX + month)
      .order('key', { ascending: false })
      .limit(HISTORY_MONTHS),
  ]);
  if (error) throw new Error(`IOP report history read: ${error.message}`);
  const history = (earlier ?? [])
    .filter(e => Array.isArray((e.value as StoredReport | null)?.rows))
    .map(e => ({ month: String(e.key).slice(PREFIX.length), cico: iopCicoByAgent((e.value as StoredReport).rows.map(unpack)) }));
  const withHistory = (lines: IopAgentLine[]): IopAgentHistoryLine[] =>
    lines.map(line => ({
      ...line,
      cicoHistory: Object.fromEntries(history.filter(h => h.cico.has(line.agent)).map(h => [h.month, h.cico.get(line.agent)!])),
    }));
  return {
    month,
    earlierMonths: history.map(h => h.month),
    reward: withHistory(agents.reward),
    clawback: withHistory(agents.clawback),
  };
}
