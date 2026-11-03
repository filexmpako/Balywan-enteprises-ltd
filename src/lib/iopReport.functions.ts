import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { IopReportRow } from '../utils/iopReport';

const MONTH = /^\d{4}-\d{2}$/;

async function isStaff(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase.rpc('is_staff', { _user_id: userId });
  return data === true;
}

/** True for staff; for anyone else, throws unless they own `ownerId`. */
async function canReadOwner(supabase: any, userId: string, ownerId: string | undefined): Promise<boolean> {
  if (await isStaff(supabase, userId)) return true;
  const { data: owns } = ownerId ? await supabase.rpc('owns_owner', { _owner_id: ownerId }) : { data: false };
  if (owns !== true) throw new Error("Not allowed to read this owner's IOP report.");
  return false;
}

/** Uploads (replaces) one month's IOP report. Staff only. */
export const uploadIopReport = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { month: string; fileName: string; rows: IopReportRow[] }) => {
    if (!MONTH.test(String(input?.month || ''))) throw new Error('month must be YYYY-MM');
    if (!Array.isArray(input.rows) || !input.rows.length) throw new Error('The file has no REWARD or CLAWBACK rows.');
    return { month: input.month, fileName: String(input.fileName || 'IOP report'), rows: input.rows };
  })
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    if (!(await isStaff(supabase, context.userId))) throw new Error('Only admins and float managers can upload the IOP report.');
    const [{ saveIopReport }, { appendAuditLog }] = await Promise.all([
      import('./iopReport.server'),
      import('./hasidadi/repo.server'),
    ]);
    const saved = await saveIopReport(supabase, { ...data, userId: context.userId });
    await appendAuditLog(supabase, {
      userId: context.userId,
      action: 'UPLOAD_IOP_REPORT',
      entity: 'app_settings',
      details: { month: data.month, fileName: data.fileName, rows: saved },
    });
    return { saved };
  });

/** Removes one month's IOP report. Staff only. */
export const removeIopReport = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { month: string }) => {
    if (!MONTH.test(String(input?.month || ''))) throw new Error('month must be YYYY-MM');
    return { month: input.month };
  })
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    if (!(await isStaff(supabase, context.userId))) throw new Error('Only admins and float managers can delete the IOP report.');
    const { deleteIopReport } = await import('./iopReport.server');
    await deleteIopReport(supabase, data.month);
    return { ok: true };
  });

/**
 * One month's IOP report totals: every owner and the company-level amounts
 * for staff; for an owner, only their own line.
 */
export const fetchIopReport = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { month: string; ownerId?: string }) => {
    if (!MONTH.test(String(input?.month || ''))) throw new Error('month must be YYYY-MM');
    return { month: input.month, ownerId: input.ownerId || undefined };
  })
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const staff = await canReadOwner(supabase, context.userId, data.ownerId);
    const [{ privilegedClient }, { loadIopReportSummary }] = await Promise.all([
      import('./privilegedClient.server'),
      import('./iopReport.server'),
    ]);
    const report = await loadIopReportSummary(await privilegedClient(supabase), data.month);
    if (!report || staff) return report;
    // Owners see their own line only.
    const own = report.summary.byOwner.filter(o => o.ownerId === data.ownerId);
    return {
      ...report,
      summary: {
        ...report.summary,
        reward: own[0]?.reward ?? 0,
        clawback: own[0]?.clawback ?? 0,
        companyReward: 0,
        unassignedClawback: 0,
        rows: (own[0]?.rewardRows ?? 0) + (own[0]?.clawbackRows ?? 0),
        byOwner: own,
      },
    };
  });

/** One owner's REWARD / CLAWBACK agents for the month with their earlier CICO values. Staff, or that owner. */
export const fetchIopAgents = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { month: string; ownerId: string }) => {
    if (!MONTH.test(String(input?.month || ''))) throw new Error('month must be YYYY-MM');
    if (!input.ownerId) throw new Error('ownerId is required');
    return { month: input.month, ownerId: String(input.ownerId) };
  })
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    await canReadOwner(supabase, context.userId, data.ownerId);
    const [{ privilegedClient }, { loadIopOwnerAgents }] = await Promise.all([
      import('./privilegedClient.server'),
      import('./iopReport.server'),
    ]);
    return loadIopOwnerAgents(await privilegedClient(supabase), data.month, data.ownerId);
  });
