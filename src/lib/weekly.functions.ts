import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

/** Persists one uploaded weekly KPI report to Postgres (replaces that week). */
export const saveWeeklyServicingRows = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { reportingWeek: string; reportingMonth?: string; rows: any[] }) => {
    if (!input || typeof input.reportingWeek !== 'string' || !input.reportingWeek.trim()) {
      throw new Error('reportingWeek is required');
    }
    if (!Array.isArray(input.rows)) throw new Error('rows[] is required');
    return input;
  })
  .handler(async ({ data, context }) => {
    const { saveWeeklyRows } = await import('./weekly.server');
    const saved = await saveWeeklyRows(context.supabase as any, {
      reportingWeek: data.reportingWeek,
      reportingMonth: data.reportingMonth,
      rows: data.rows,
      uploadedBy: context.userId,
    });
    return { saved };
  });

export const fetchWeeklyServicingRows = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { reportingWeek?: string }) => input ?? {})
  .handler(async ({ data, context }) => {
    const { loadWeeklyRows } = await import('./weekly.server');
    return { rows: await loadWeeklyRows(context.supabase as any, data?.reportingWeek) };
  });

/**
 * One week's report rows as the weekly figures count them; all owners for
 * staff, or one owner's rows for staff or that owner.
 */
export const fetchWeeklyReport = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { reportingWeek: string; ownerId?: string }) => {
    if (!input || typeof input.reportingWeek !== 'string' || !input.reportingWeek.trim()) {
      throw new Error('reportingWeek is required');
    }
    return { reportingWeek: input.reportingWeek, ownerId: input.ownerId || undefined };
  })
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { data: isStaff } = await supabase.rpc('is_staff', { _user_id: context.userId });
    if (isStaff !== true) {
      const { data: ownsOwner } = data.ownerId
        ? await supabase.rpc('owns_owner', { _owner_id: data.ownerId })
        : { data: false };
      if (ownsOwner !== true) throw new Error("Not allowed to read this owner's weekly report.");
    }
    // Checked above; the full week and registries are read so each row is
    // attributed exactly as the weekly figures attribute it.
    const [{ privilegedClient }, { loadWeeklyReportRows }] = await Promise.all([
      import('./privilegedClient.server'),
      import('./weeklyReport.server'),
    ]);
    return loadWeeklyReportRows(await privilegedClient(supabase), data.reportingWeek, data.ownerId);
  });

export const fetchWeeklyWeeks = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listWeeklyWeeks } = await import('./weekly.server');
    return { weeks: await listWeeklyWeeks(context.supabase as any) };
  });

export const deleteWeeklyServicingRows = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { reportingWeek: string }) => {
    if (!input || typeof input.reportingWeek !== 'string') throw new Error('reportingWeek is required');
    return input;
  })
  .handler(async ({ data, context }) => {
    const { deleteWeeklyRows } = await import('./weekly.server');
    await deleteWeeklyRows(context.supabase as any, data.reportingWeek);
    return { ok: true };
  });
