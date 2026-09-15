import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

/** Persists one uploaded monthly KPI report to Postgres (replaces that month). */
export const saveMonthlyServicingRows = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { reportingMonth: string; rows: any[] }) => {
    if (!input || typeof input.reportingMonth !== 'string' || !input.reportingMonth.trim()) {
      throw new Error('reportingMonth is required');
    }
    if (!Array.isArray(input.rows)) throw new Error('rows[] is required');
    return input;
  })
  .handler(async ({ data, context }) => {
    const { saveMonthlyRows } = await import('./monthly.server');
    const saved = await saveMonthlyRows(context.supabase as any, {
      reportingMonth: data.reportingMonth,
      rows: data.rows,
      uploadedBy: context.userId,
    });
    return { saved };
  });

export const fetchMonthlyServicingRows = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { reportingMonth?: string }) => input ?? {})
  .handler(async ({ data, context }) => {
    const { loadMonthlyRows } = await import('./monthly.server');
    return { rows: await loadMonthlyRows(context.supabase as any, data?.reportingMonth) };
  });

export const fetchMonthlyMonths = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listMonthlyMonths } = await import('./monthly.server');
    return { months: await listMonthlyMonths(context.supabase as any) };
  });

export const deleteMonthlyServicingRows = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { reportingMonth: string }) => {
    if (!input || typeof input.reportingMonth !== 'string') throw new Error('reportingMonth is required');
    return input;
  })
  .handler(async ({ data, context }) => {
    const { deleteMonthlyRows } = await import('./monthly.server');
    await deleteMonthlyRows(context.supabase as any, data.reportingMonth);
    return { ok: true };
  });
