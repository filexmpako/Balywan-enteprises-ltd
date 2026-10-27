/**
 * Owner stamps on stored report rows. Weekly and Monthly report rows carry an
 * owner_id so owners can read their own rows (RLS). The app attributes those
 * rows from the registries every time it reads them, so the stamp must be set
 * by the very same resolver, and re-set whenever the registries change.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadWorkspace, workspaceToSnapshot, type Workspace } from './hasidadi/repo.server';
import { runWithSnapshot } from './hasidadi/engine-context.server';
import { buildMsisdnOwnerResolver } from '../utils/weeklyKpiEngine';
import { resolveOwnerMatch } from '../utils/ownerMatch';

type DB = SupabaseClient<any, any, any>;

const REPORT_TABLES = ['weekly_servicing_records', 'monthly_servicing_records'] as const;
const PAGE = 1000;
const BATCH = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** MSISDN -> owner_id, exactly as the app attributes report rows. */
function reportOwnerResolver(workspace: Workspace): (msisdn: string) => string | null {
  const c = workspace.collections;
  const resolve = runWithSnapshot(workspaceToSnapshot(workspace), () =>
    buildMsisdnOwnerResolver(c['baseWakalaIndex'] ?? [], c['ownersList'] ?? [], c['tillsList'] ?? []),
  );
  return (msisdn) => resolve(msisdn)?.ownerId || null;
}

export async function loadReportOwnerResolver(supabase: DB): Promise<(msisdn: string) => string | null> {
  return reportOwnerResolver(await loadWorkspace(supabase));
}

/** Sets owner_id on rows whose stamp differs, grouped into one update per owner. */
async function writeStamps(supabase: DB, table: string, changes: Map<string | null, any[]>): Promise<void> {
  for (const [ownerId, ids] of changes) {
    for (const batch of chunk(ids, BATCH)) {
      const { error } = await supabase.from(table).update({ owner_id: ownerId }).in('id', batch);
      if (error) throw new Error(`${table} owner update: ${error.message}`);
    }
  }
}

/**
 * Re-stamps every stored Weekly and Monthly report row with today's owner.
 * Rows already right are left alone.
 */
export async function restampReportOwners(
  supabase: DB,
  workspace: Workspace,
): Promise<{ checked: number; updated: number }> {
  const ownerOf = reportOwnerResolver(workspace);
  let checked = 0;
  let updated = 0;
  for (const table of REPORT_TABLES) {
    const changes = new Map<string | null, any[]>();
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from(table)
        .select('id, msisdn, owner_id')
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`${table} read: ${error.message}`);
      const page = data ?? [];
      for (const row of page) {
        checked++;
        const want = ownerOf(row.msisdn);
        if ((row.owner_id || null) === want) continue;
        updated++;
        const ids = changes.get(want) ?? [];
        ids.push(row.id);
        changes.set(want, ids);
      }
      if (page.length < PAGE) break;
    }
    await writeStamps(supabase, table, changes);
  }
  return { checked, updated };
}

/**
 * Base Wakala rows uploaded before their owner was registered keep only the
 * owner's name. The app resolves them by name, but owner-scoped reads go by
 * owner_id, so link every such row to the registered owner its name matches.
 * Returns how many rows were linked.
 */
export async function linkBaseWakalaOwners(supabase: DB, workspace: Workspace): Promise<number> {
  const owners = workspace.collections['ownersList'] ?? [];
  const links = new Map<string, string[]>();
  runWithSnapshot(workspaceToSnapshot(workspace), () => {
    for (const bw of workspace.collections['baseWakalaIndex'] ?? []) {
      if (!bw?.msisdn || String(bw.ownerId ?? '').trim() || !String(bw.ownerName ?? '').trim()) continue;
      const match = resolveOwnerMatch(bw.ownerName, owners, 'Report Resync');
      if (match.status !== 'Matched' || !match.matchedOwner?.id) continue;
      const msisdns = links.get(match.matchedOwner.id) ?? [];
      msisdns.push(String(bw.msisdn));
      links.set(match.matchedOwner.id, msisdns);
    }
  });
  let linked = 0;
  for (const [ownerId, msisdns] of links) {
    for (const batch of chunk(msisdns, BATCH)) {
      const { data, error } = await supabase
        .from('base_wakala_index')
        .update({ owner_id: ownerId })
        .in('msisdn', batch)
        .is('owner_id', null)
        .select('msisdn');
      if (error) throw new Error(`base_wakala_index owner link: ${error.message}`);
      linked += (data ?? []).length;
    }
  }
  return linked;
}
