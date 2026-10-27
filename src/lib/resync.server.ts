import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildTransactionRows,
  loadWorkspace,
  replaceAuditRecords,
  saveCollection,
  upsertTransactionRows,
  workspaceToSnapshot,
  type ClassifiedForStore,
} from './hasidadi/repo.server';
import { runWithSnapshot } from './hasidadi/engine-context.server';
import { classifyServicingRows } from '../utils/classification';
import { reresolvePriorityOwners } from '../utils/priorityOwners';

/**
 * Report resync: brings data that was stamped at upload time in line with
 * today's registries (owners, tills, SA tills, Base Wakala Index), without a
 * re-upload. Weekly and Monthly report rows are attributed from the
 * registries when read; their owner stamps are re-set in reportOwners.server.
 */
type DB = SupabaseClient<any, any, any>;

const TAGS = ['owner_id', 'bucket', 'matched_via', 'attributed_owner_id', 'attributed_owner_name'] as const;
const same = (a: unknown, b: unknown) => String(a ?? '') === String(b ?? '');

/** Rows per resync call: small enough that rewriting a fully changed page stays well inside the hosting request time limit. */
const RESYNC_PAGE_ROWS = 1000;
const READ_PAGE = 1000;

/**
 * Re-classifies one page of a month's stored Daily MGT transactions (rows
 * `offset`.. in record order) and rewrites only the rows whose owner, bucket
 * or attribution changed (plus their audit records). Each row keeps the
 * upload it came from. `done` is true on the month's last page.
 */
export async function resyncTransactionsForPeriod(
  supabase: DB,
  period: string,
  offset = 0,
): Promise<{ checked: number; updated: number; done: boolean }> {
  const stored: any[] = [];
  for (let from = offset; from < offset + RESYNC_PAGE_ROWS; from += READ_PAGE) {
    const { data, error } = await supabase
      .from('daily_transaction_records')
      .select(`record_id, upload_id, raw, ${TAGS.join(', ')}`)
      .eq('is_active', true)
      .eq('reporting_period', period)
      .order('record_id', { ascending: true })
      .range(from, Math.min(from + READ_PAGE, offset + RESYNC_PAGE_ROWS) - 1);
    if (error) throw new Error(`daily_transaction_records: ${error.message}`);
    stored.push(...(data ?? []));
    if ((data ?? []).length < READ_PAGE) break;
  }
  const done = stored.length < RESYNC_PAGE_ROWS;
  if (!stored.length) return { checked: 0, updated: 0, done };

  const workspace = await loadWorkspace(supabase);
  const c = workspace.collections;
  const classified = runWithSnapshot(workspaceToSnapshot(workspace), () =>
    classifyServicingRows(
      stored.map((r: any) => r.raw),
      c['saTillRegistry'] ?? [],
      c['baseWakalaIndex'] ?? [],
      c['tillsList'] ?? [],
      c['ownersList'] ?? [],
    ),
  ) as unknown as ClassifiedForStore[];

  const uploadIds = stored.map((r: any) => r.upload_id);
  const txRows = await buildTransactionRows(supabase, uploadIds, classified);
  const changed = txRows.map((_, i) => i).filter((i) => TAGS.some((t) => !same(txRows[i][t], stored[i][t])));
  if (!changed.length) return { checked: stored.length, updated: 0, done };

  await upsertTransactionRows(supabase, changed.map((i) => txRows[i]));
  await replaceAuditRecords(
    supabase,
    changed.map((i) => uploadIds[i]),
    changed.map((i) => classified[i]),
  );
  return { checked: stored.length, updated: changed.length, done };
}

/** Re-attributes every stored priority wakala from today's Base Wakala Index. */
export async function resyncPriorityList(supabase: DB): Promise<{ checked: number; updated: number }> {
  const workspace = await loadWorkspace(supabase);
  const list = workspace.collections['priorityWakalaList'] ?? [];
  const { list: next, changed } = reresolvePriorityOwners(
    list,
    workspace.collections['baseWakalaIndex'] ?? [],
    workspace.collections['ownersList'] ?? [],
  );
  if (changed > 0) await saveCollection(supabase, 'priorityWakalaList', next);
  return { checked: list.length, updated: changed };
}
