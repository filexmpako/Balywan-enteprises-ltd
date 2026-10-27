import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

/** Staff only: resync rewrites company-wide data. */
async function assertStaff(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc('is_staff', { _user_id: userId });
  if (error) throw new Error(`is_staff: ${error.message}`);
  if (data !== true) throw new Error('Only admins and float managers can resync reports.');
}

/** Re-attributes stored priority wakalas from today's Base Wakala Index. */
export const resyncPriorityWakalas = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as any;
    await assertStaff(supabase, context.userId);
    const { resyncPriorityList } = await import('./resync.server');
    return resyncPriorityList(supabase);
  });

/**
 * Links Base Wakala rows that carry only an owner name to that registered
 * owner, then re-stamps stored Weekly and Monthly report rows with today's
 * owner (owners read those rows by that stamp).
 */
export const resyncReportOwners = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as any;
    await assertStaff(supabase, context.userId);
    const [{ linkBaseWakalaOwners, restampReportOwners }, { loadWorkspace, appendAuditLog }] = await Promise.all([
      import('./reportOwners.server'),
      import('./hasidadi/repo.server'),
    ]);
    let workspace = await loadWorkspace(supabase);
    const linked = await linkBaseWakalaOwners(supabase, workspace);
    if (linked > 0) workspace = await loadWorkspace(supabase);
    const { checked, updated } = await restampReportOwners(supabase, workspace);
    if (linked > 0 || updated > 0) {
      await appendAuditLog(supabase, {
        userId: context.userId,
        action: 'RESYNC_REPORT_OWNERS',
        entity: 'weekly_servicing_records, monthly_servicing_records, base_wakala_index',
        details: { indexOwnersLinked: linked, reportRowsChecked: checked, reportRowsUpdated: updated },
      });
    }
    return { linked, checked, updated };
  });

/** Re-classifies one page of a month ("YYYY-MM") of stored Daily MGT transactions against today's registries. */
export const resyncDailyTransactions = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { period: string; offset?: number }) => {
    if (!/^\d{4}-\d{2}$/.test(String(input?.period || ''))) throw new Error('period must be YYYY-MM');
    const offset = Number(input.offset ?? 0);
    if (!Number.isInteger(offset) || offset < 0) throw new Error('offset must be a whole number');
    return { period: input.period, offset };
  })
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    await assertStaff(supabase, context.userId);
    const [{ resyncTransactionsForPeriod }, { appendAuditLog }] = await Promise.all([
      import('./resync.server'),
      import('./hasidadi/repo.server'),
    ]);
    const result = await resyncTransactionsForPeriod(supabase, data.period, data.offset);
    if (result.updated > 0) {
      await appendAuditLog(supabase, {
        userId: context.userId,
        action: 'RESYNC_MGT_TRANSACTIONS',
        entity: 'daily_transaction_records',
        details: { period: data.period, offset: data.offset, checked: result.checked, updated: result.updated },
      });
    }
    return result;
  });
