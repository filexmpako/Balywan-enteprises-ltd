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
  /** null when the week's rows carried no servicing_status value at all. */
  isServed?: boolean | null;
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

    // Only staff may write the shared status history (RLS enforces this too).
    // Owner sessions viewing weekly data must not crash on the attempt.
    const { data: isStaff, error: staffError } = await supabase.rpc('is_staff', { _user_id: context.userId });
    if (staffError || isStaff !== true) return { saved: 0, skipped: true as const };

    // The caller has now been verified with their authenticated, RLS-scoped
    // client. Use privileged access only for this shared staff-maintained
    // history so the table policy cannot turn a valid staff upload into a
    // client-visible runtime error.
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const historyDb = supabaseAdmin as any;

    // Combines two servicing_status reads for the same wakala in one week:
    // served wins over unserved, and either beats no status at all.
    const mergeServed = (a: boolean | null | undefined, b: boolean | null | undefined): boolean | null => {
      if (a === true || b === true) return true;
      if (a === false || b === false) return false;
      return null;
    };

    const byMsisdn = new Map<string, any>();
    data.evaluations
      .filter(e => e && String(e.msisdn || '').trim())
      .forEach(e => {
        const key = String(e.msisdn).trim();
        const prev = byMsisdn.get(key);
        if (prev) {
          // Same wakala listed twice in one week: merge instead of inserting twice.
          prev.cash_in_txns += Number(e.cashInTxns) || 0;
          prev.cash_out_txns += Number(e.cashOutTxns) || 0;
          prev.total_txns += Number(e.totalTxns) || 0;
          prev.total_value += Number(e.totalValue) || 0;
          prev.is_active = prev.is_active || !!e.isActive;
          prev.is_served = mergeServed(prev.is_served, e.isServed);
          prev.owner_id = prev.owner_id || e.ownerId || null;
          prev.owner_name = prev.owner_name || e.ownerName || null;
          return;
        }
        byMsisdn.set(key, {
        msisdn: String(e.msisdn).trim(),
        owner_id: e.ownerId || null,
        owner_name: e.ownerName || null,
        reporting_week: week,
        reporting_month: data.reportingMonth || null,
        cash_in_txns: Number(e.cashInTxns) || 0,
        cash_out_txns: Number(e.cashOutTxns) || 0,
        total_txns: Number(e.totalTxns) || 0,
        total_value: Number(e.totalValue) || 0,
        is_served: e.isServed ?? null,
        is_active: !!e.isActive,
        threshold_used: Number(data.threshold) || 0,
        rule_mode: String(data.ruleMode || 'combined').slice(0, 80),
        evaluated_at: new Date().toISOString(),
        });
      });

    const rows = Array.from(byMsisdn.values());

    // Only keep owner references that really exist, otherwise the FK rejects the batch.
    const referenced = Array.from(
      new Set(rows.map(r => r.owner_id).filter((v): v is string => !!v)),
    );
    if (referenced.length) {
      const known = new Set<string>();
      for (let i = 0; i < referenced.length; i += 500) {
        const { data: owners, error: ownersError } = await historyDb
          .from('owners')
          .select('owner_id')
          .in('owner_id', referenced.slice(i, i + 500));
        if (ownersError) throw new Error(`owners lookup: ${ownersError.message}`);
        (owners ?? []).forEach((o: any) => known.add(String(o.owner_id)));
      }
      rows.forEach(r => {
        if (r.owner_id && !known.has(String(r.owner_id))) r.owner_id = null;
      });
    }


    const { error: delError } = await historyDb
      .from('wakala_status_history')
      .delete()
      .eq('reporting_week', week);
    if (delError) throw new Error(`wakala_status_history clear: ${delError.message}`);

    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await historyDb
        .from('wakala_status_history')
        .upsert(rows.slice(i, i + 500), { onConflict: 'msisdn,reporting_week' });
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
