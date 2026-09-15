import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export interface WakalaStatusEvaluationInput {
  msisdn: string;
  ownerId?: string | null;
  ownerName?: string | null;
  cashInTxns?: number;
  cashOutTxns?: number;
  totalTxns?: number;
  totalValue?: number;
  isActive: boolean;
}

/**
 * Records the Active/Inactive evaluation of every wakala for one reporting
 * week, so historical months keep the status that applied then instead of
 * today's status. Re-evaluating a week overwrites only that week's rows.
 */
export const saveWakalaStatusHistory = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      reportingWeek: string;
      reportingMonth?: string | null;
      threshold: number;
      ruleMode: string;
      evaluations: WakalaStatusEvaluationInput[];
    }) => {
      if (!input || !String(input.reportingWeek || '').trim()) throw new Error('reportingWeek is required');
      if (!Array.isArray(input.evaluations)) throw new Error('evaluations[] is required');
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const week = String(data.reportingWeek).trim();

    const rows = data.evaluations
      .filter(e => e && String(e.msisdn || '').trim())
      .map(e => ({
        msisdn: String(e.msisdn).trim(),
        owner_id: e.ownerId || null,
        owner_name: e.ownerName || null,
        reporting_week: week,
        reporting_month: data.reportingMonth || null,
        cash_in_txns: Number(e.cashInTxns) || 0,
        cash_out_txns: Number(e.cashOutTxns) || 0,
        total_txns: Number(e.totalTxns) || 0,
        total_value: Number(e.totalValue) || 0,
        is_active: !!e.isActive,
        threshold_used: Number(data.threshold) || 0,
        rule_mode: data.ruleMode === 'separate' ? 'separate' : 'combined',
        evaluated_at: new Date().toISOString(),
      }));

    const { error: delError } = await supabase
      .from('wakala_status_history')
      .delete()
      .eq('reporting_week', week);
    if (delError) throw new Error(`wakala_status_history clear: ${delError.message}`);

    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from('wakala_status_history').insert(rows.slice(i, i + 500));
      if (error) throw new Error(`wakala_status_history insert: ${error.message}`);
    }

    return { saved: rows.length };
  });

/** Reads recorded weekly status rows (optionally one week or one month). */
export const fetchWakalaStatusHistory = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { reportingWeek?: string; reportingMonth?: string; ownerId?: string }) => input ?? {})
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const PAGE = 1000;
    const out: any[] = [];
    for (let from = 0; ; from += PAGE) {
      let query = supabase
        .from('wakala_status_history')
        .select('*')
        .order('reporting_week', { ascending: true })
        .range(from, from + PAGE - 1);
      if (data?.reportingWeek) query = query.eq('reporting_week', data.reportingWeek);
      if (data?.reportingMonth) query = query.eq('reporting_month', data.reportingMonth);
      if (data?.ownerId) query = query.eq('owner_id', data.ownerId);
      const { data: page, error } = await query;
      if (error) throw new Error(`wakala_status_history read: ${error.message}`);
      out.push(...(page ?? []));
      if (!page || page.length < PAGE) break;
    }
    return { rows: out };
  });
