import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

/**
 * Server functions for the Hasidadi platform.
 *
 * Every handler runs as the signed-in user, so Postgres RLS enforces the
 * owner-isolation rules (owners only ever see their own rows; staff see all).
 */

export const fetchWorkspace = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadWorkspace } = await import('./hasidadi/repo.server');
    return loadWorkspace(context.supabase as any);
  });

export const saveCollection = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { key: string; items: any[] }) => {
    if (!input || typeof input.key !== 'string' || !Array.isArray(input.items)) {
      throw new Error('Invalid collection payload');
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { saveCollection: save } = await import('./hasidadi/repo.server');
    const count = await save(context.supabase as any, data.key, data.items);
    return { saved: count };
  });

export const saveDocument = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { key: string; value: any }) => {
    if (!input || typeof input.key !== 'string') throw new Error('Invalid document payload');
    return input;
  })
  .handler(async ({ data, context }) => {
    const { saveDocument: save } = await import('./hasidadi/repo.server');
    await save(context.supabase as any, data.key, data.value, context.userId);
    return { ok: true };
  });

export const appendAuditLog = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { action: string; entity?: string; details?: any; actorName?: string }) => {
    if (!input || typeof input.action !== 'string') throw new Error('Invalid audit entry');
    return input;
  })
  .handler(async ({ data, context }) => {
    const { appendAuditLog: append } = await import('./hasidadi/repo.server');
    await append(context.supabase as any, { ...data, userId: context.userId });
    return { ok: true };
  });

/**
 * Authoritative ingestion: classification runs on the server against the
 * database registries, and the results are written to Postgres in one pass.
 */
export const ingestServicingRows = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      rows: any[];
      fileName?: string;
      reportType?: string;
      fileSize?: number;
      uploadedByName?: string;
    }) => {
      if (!input || !Array.isArray(input.rows)) throw new Error('rows[] is required');
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    const [{ loadWorkspace, workspaceToSnapshot, persistClassifiedRows, recordUpload, appendAuditLog: append }, { runWithSnapshot }, engine] =
      await Promise.all([
        import('./hasidadi/repo.server'),
        import('./hasidadi/engine-context.server'),
        import('../utils/classification'),
      ]);

    const supabase = context.supabase as any;
    const workspace = await loadWorkspace(supabase);
    const snapshot = workspaceToSnapshot(workspace);

    const classified = runWithSnapshot(snapshot, () =>
      engine.classifyServicingRows(
        data.rows,
        workspace.collections['saTillRegistry'] ?? [],
        workspace.collections['baseWakalaIndex'] ?? [],
        workspace.collections['tillsList'] ?? [],
        workspace.collections['ownersList'] ?? [],
      ),
    );
    const summary = engine.summarizeClassification(classified);

    const uploadId = `UPL-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // The archive row must exist first: transactions and audit records carry an
    // upload_id foreign key back to it.
    await recordUpload(supabase, {
      uploadId,
      fileName: data.fileName || 'Daily_MGT_Report',
      reportType: data.reportType || 'Daily MGT',
      fileSize: data.fileSize,
      rowCount: data.rows.length,
      summary,
      uploadedBy: context.userId,
      uploadedByName: data.uploadedByName,
    });

    const counts = await persistClassifiedRows(supabase, uploadId, classified as any);


    await append(supabase, {
      userId: context.userId,
      actorName: data.uploadedByName,
      action: 'INGEST_MGT_TRANSACTIONS',
      entity: 'daily_transaction_records',
      details: { uploadId, ...counts, summary },
    });

    return { uploadId, summary, ...counts, classified };
  });

/** Server-side transaction read used to warm the offline cache. */
export const fetchTransactions = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { period?: string }) => input ?? {})
  .handler(async ({ data, context }) => {
    const { loadTransactions } = await import('./hasidadi/repo.server');
    return loadTransactions(context.supabase as any, data?.period);
  });
