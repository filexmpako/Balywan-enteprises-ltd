/** Admin-only read-only data health check: counts of gaps and broken links. */
import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export type DataHealthItem = { label: string; count: number; hint: string };
export type DataHealth = { items: DataHealthItem[]; missingDays: string[]; weeks: string[] };

export const fetchDataHealth = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { period: string }) => input)
  .handler(async ({ data, context }): Promise<DataHealth> => {
    const sb = context.supabase as any;
    const { data: isAdmin } = await sb.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
    if (!isAdmin) throw new Error('Forbidden: administrator access required');

    const count = async (table: string, f: (q: any) => any) => {
      const { count: c } = await f(sb.from(table).select('*', { count: 'exact', head: true }));
      return c ?? 0;
    };
    const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
    const [unassigned, weeklyNoOwner, dailyNoOwner, staffNoOwner, staffNoLogin, ownersNoLogin, oldFloats] = await Promise.all([
      count('base_wakala_index', q => q.is('owner_id', null)),
      count('weekly_servicing_records', q => q.is('owner_id', null)),
      count('daily_transaction_records', q => q.eq('reporting_period', data.period).is('attributed_owner_id', null)),
      count('personnel', q => q.is('owner_id', null)),
      count('personnel', q => q.is('user_id', null)),
      count('owners', q => q.is('user_id', null)),
      count('float_requests', q => q.eq('status', 'Confirmed').is('loan_id', null).lt('requested_at', weekAgo)),
    ]);

    // Missing Daily MGT days in the period, up to yesterday.
    const [y, m] = data.period.split('-').map(Number);
    const days: string[] = [];
    const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
    const today = new Date().toISOString().slice(0, 10);
    for (let d = 1; d <= last; d++) {
      const iso = `${data.period}-${String(d).padStart(2, '0')}`;
      if (iso < today) days.push(iso);
    }
    const present = await Promise.all(days.map(d => count('daily_transaction_records', q => q.eq('reporting_date', d))));
    const missingDays = days.filter((_, i) => present[i] === 0);

    const { data: wk } = await sb.from('wakala_status_history').select('reporting_week').limit(20000);
    const weeks = [...new Set(((wk ?? []) as any[]).map(r => r.reporting_week as string))].sort();

    return {
      missingDays,
      weeks,
      items: [
        { label: 'Base Wakala with no owner', count: unassigned, hint: 'Assign them in Base Wakala Index' },
        { label: 'Weekly report rows with no owner', count: weeklyNoOwner, hint: 'Caused by unassigned Base Wakala' },
        { label: 'Daily MGT rows not credited this month', count: dailyNoOwner, hint: 'Till or destination not linked to an owner' },
        { label: 'Staff with no owner', count: staffNoOwner, hint: 'Link them in People Management' },
        { label: 'Staff without a login', count: staffNoLogin, hint: 'Create accounts if they need to sign in' },
        { label: 'Owners without a login', count: ownersNoLogin, hint: 'Create an account for the owner' },
        { label: 'Floats out more than 7 days', count: oldFloats, hint: 'Follow up in the Float Manager' },
      ],
    };
  });
