import type { SupabaseClient } from '@supabase/supabase-js';
import {
  COLLECTIONS,
  DOCUMENT_KEYS,
  fromRow,
  getMapper,
  toRow,
  type CollectionMapper,
} from './collections';
import type { KvSnapshot } from './kv';

type DB = SupabaseClient<any, any, any>;

export interface Workspace {
  collections: Record<string, any[]>;
  documents: Record<string, any>;
}

/**
 * Reads every row of a table, page by page. The Data API caps a single
 * response at 1000 rows regardless of .limit(), so a Base Wakala file with
 * thousands of rows silently came back truncated before this paging existed.
 */
const PAGE_SIZE = 1000;

async function selectAll(supabase: DB, table: string, columns: string, filter?: (q: any) => any): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase.from(table).select(columns);
    if (filter) query = filter(query);
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const page = data ?? [];
    out.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return out;
}

export async function loadCollection(supabase: DB, mapper: CollectionMapper): Promise<any[]> {
  const rows = await selectAll(supabase, mapper.table, '*');
  return rows.map((row: any) => fromRow(mapper, row));
}

export async function loadWorkspace(supabase: DB): Promise<Workspace> {
  const collections: Record<string, any[]> = {};
  await Promise.all(
    COLLECTIONS.map(async (mapper) => {
      collections[mapper.key] = await loadCollection(supabase, mapper);
    }),
  );

  const documents: Record<string, any> = {};
  const { data } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', DOCUMENT_KEYS as unknown as string[]);
  for (const row of data ?? []) documents[row.key] = row.value;

  return { collections, documents };
}

/** Turns a workspace into the snapshot the shared engines read through kvGet. */
export function workspaceToSnapshot(ws: Workspace): KvSnapshot {
  const snapshot: KvSnapshot = {};
  for (const [key, value] of Object.entries(ws.collections)) snapshot[key] = JSON.stringify(value);
  for (const [key, value] of Object.entries(ws.documents)) snapshot[key] = JSON.stringify(value);
  return snapshot;
}

async function clearUnresolvedBaseWakalaOwners(
  supabase: DB,
  rows: Record<string, any>[],
): Promise<void> {
  const referencedOwnerIds = Array.from(
    new Set(
      rows
        .map((row) => row.owner_id)
        .filter((ownerId) => ownerId !== null && ownerId !== undefined && String(ownerId).trim() !== '')
        .map((ownerId) => String(ownerId).trim()),
    ),
  );
  if (!referencedOwnerIds.length) return;

  const existingOwnerIds = new Set<string>();
  for (const ownerIds of chunk(referencedOwnerIds, 500)) {
    const { data, error } = await supabase.from('owners').select('owner_id').in('owner_id', ownerIds);
    if (error) throw new Error(`owners lookup: ${error.message}`);
    for (const owner of data ?? []) existingOwnerIds.add(String(owner.owner_id));
  }

  for (const row of rows) {
    if (row.owner_id === null || row.owner_id === undefined) continue;
    const sourceOwnerId = String(row.owner_id).trim();
    if (existingOwnerIds.has(sourceOwnerId)) continue;

    row.owner_id = null;
    row.extras = {
      ...(row.extras && typeof row.extras === 'object' ? row.extras : {}),
      sourceOwnerId,
    };
  }
}

/** Full replace of a collection (upsert everything, delete what disappeared). */
export async function saveCollection(supabase: DB, key: string, items: any[]): Promise<number> {
  const mapper = getMapper(key);
  if (!mapper) throw new Error(`Unknown collection: ${key}`);

  const rows = items.map((item, index) => toRow(mapper, item, index)).filter((r) => r[mapper.pk]);

  // A Base Wakala file may legitimately arrive before its owner roster. Keep
  // those rows unassigned instead of violating the FK; owner_name and the
  // source ID remain available for the later reconciliation pass.
  if (key === 'baseWakalaIndex') await clearUnresolvedBaseWakalaOwners(supabase, rows);

  for (const batch of chunk(rows, 500)) {
    const { error } = await supabase.from(mapper.table).upsert(batch, { onConflict: mapper.pk });
    if (error) throw new Error(`${mapper.table} upsert: ${error.message}`);
  }

  // Prune by diffing existing PKs instead of sending one giant NOT IN filter
  // (that overflows the request URL and fails with an empty error message).
  const keepIds = new Set(rows.map((r) => String(r[mapper.pk])));
  const existing = await selectAll(supabase, mapper.table, mapper.pk);

  const staleIds = (existing ?? [])
    .map((r: any) => String(r[mapper.pk]))
    .filter((id) => !keepIds.has(id));

  for (const batch of chunk(staleIds, 200)) {
    const { error: delError } = await supabase.from(mapper.table).delete().in(mapper.pk, batch);
    if (delError) throw new Error(`${mapper.table} prune: ${delError.message}`);
  }

  return rows.length;

}

export async function saveDocument(supabase: DB, key: string, value: any, userId?: string) {
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key, value, updated_by: userId ?? null, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(`app_settings ${key}: ${error.message}`);
}

export async function appendAuditLog(
  supabase: DB,
  entry: {
    userId?: string;
    actorName?: string;
    action: string;
    entity?: string;
    details?: any;
    oldValue?: any;
    newValue?: any;
  },
) {
  const { error } = await supabase.from('audit_logs').insert({
    user_id: entry.userId ?? null,
    actor_name: entry.actorName ?? 'System',
    action_taken: entry.action,
    impacted_entity: entry.entity ?? null,
    meta_details: entry.details ?? null,
    old_value: entry.oldValue ?? null,
    new_value: entry.newValue ?? null,
  });
  if (error) throw new Error(`audit_logs: ${error.message}`);
}

const chunk = <T,>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

function periodOf(dateStr: string): string {
  const iso = (dateStr || '').slice(0, 10);
  return iso.length >= 7 ? iso.slice(0, 7) : new Date().toISOString().slice(0, 7);
}

/** Persists classified servicing rows plus their immutable audit trail. */
export async function persistClassifiedRows(
  supabase: DB,
  uploadId: string,
  classified: Array<{ row: any; bucket: string; attributedOwnerId: string | null; attributedOwnerName: string | null; matchedVia: string; auditRecord: any }>,
) {
  const txRows = classified.map(({ row, bucket, attributedOwnerId, attributedOwnerName, matchedVia }) => {
    const date = String(row['Servicing Date'] || '').slice(0, 10) || null;
    return {
      upload_id: uploadId,
      owner_id: attributedOwnerId,
      wakala_id: null,
      transaction_ref: String(row['Transaction ID'] ?? ''),
      branch_msisdn: String(row['Branch_msisdn'] ?? ''),
      dest_msisdn: String(row['Dest_MSISDN'] ?? ''),
      reporting_date: date,
      reporting_period: periodOf(String(row['Servicing Date'] || '')),
      amount: Math.abs(Number(row['Volume (TZS)'] ?? 0)) || 0,
      bucket,
      matched_via: matchedVia,
      attributed_owner_id: attributedOwnerId,
      attributed_owner_name: attributedOwnerName,
      is_active: true,
      raw: row,
    };
  });

  for (const batch of chunk(txRows, 500)) {
    const { error } = await supabase
      .from('daily_transaction_records')
      .upsert(batch, { onConflict: 'transaction_ref,branch_msisdn' });
    if (error) throw new Error(`daily_transaction_records: ${error.message}`);
  }

  const auditRows = classified.map(({ row, bucket, matchedVia, auditRecord, attributedOwnerId, attributedOwnerName }) => ({
    upload_id: uploadId,
    reporting_period: periodOf(String(row['Servicing Date'] || '')),
    owner_id: attributedOwnerId,
    owner_name: attributedOwnerName,
    bucket,
    matched_via: matchedVia,
    transaction_ref: String(row['Transaction ID'] ?? ''),
    branch_msisdn: String(row['Branch_msisdn'] ?? ''),
    dest_msisdn: String(row['Dest_MSISDN'] ?? ''),
    amount: Math.abs(Number(row['Volume (TZS)'] ?? 0)) || 0,
    transaction_time: String(row['Servicing Timestamp'] ?? ''),
    details: auditRecord,
  }));

  for (const batch of chunk(auditRows, 500)) {
    const { error } = await supabase.from('classification_audit_records').insert(batch);
    if (error) throw new Error(`classification_audit_records: ${error.message}`);
  }

  return { transactions: txRows.length, auditRecords: auditRows.length };
}

export async function recordUpload(
  supabase: DB,
  upload: {
    uploadId: string;
    fileName: string;
    reportType: string;
    fileSize?: number;
    rowCount?: number;
    summary?: any;
    uploadedBy?: string;
    uploadedByName?: string;
  },
) {
  const { error } = await supabase.from('file_upload_archives').upsert(
    {
      upload_id: upload.uploadId,
      file_name: upload.fileName,
      report_type: upload.reportType,
      file_size: upload.fileSize ?? 0,
      status: 'Success',
      import_summary: upload.summary ?? null,
      reporting_period: new Date().toISOString().slice(0, 7),
      uploaded_by: upload.uploadedBy ?? null,
      uploaded_by_name: upload.uploadedByName ?? 'System',

    },
    { onConflict: 'upload_id' },
  );
  if (error) throw new Error(`file_upload_archives: ${error.message}`);
}

/** Owner-scoped MTD transaction read used by the KPI engines. */
export async function loadTransactions(supabase: DB, period?: string) {
  const rows = await selectAll(
    supabase,
    'daily_transaction_records',
    'raw, bucket, attributed_owner_id, reporting_date, amount',
    (q) => {
      const scoped = q.eq('is_active', true);
      return period ? scoped.eq('reporting_period', period) : scoped;
    },
  );
  return rows.map((r: any) => r.raw);
}

/** Classification audit trail read — mirrors loadTransactions but returns the audit record shape (details), not the raw row. */
export async function loadClassificationAuditRecords(supabase: DB, period?: string) {
  const rows = await selectAll(
    supabase,
    'classification_audit_records',
    'details, reporting_period',
    (q) => (period ? q.eq('reporting_period', period) : q),
  );
  return rows.map((r: any) => r.details);
}
