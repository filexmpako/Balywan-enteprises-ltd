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
