import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export interface WakalaIssue {
  id: string;
  owner_id: string;
  owner_name: string;
  wakala_msisdn: string;
  wakala_name: string | null;
  category: string;
  subject: string;
  description: string;
  status: 'Open' | 'In Progress' | 'Resolved';
  priority: 'Low' | 'Normal' | 'High';
  resolution_note: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Owner raises an issue about a problem wakala; RLS keeps it to their own. */
export const createWakalaIssue = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      ownerId: string;
      ownerName: string;
      wakalaMsisdn: string;
      wakalaName?: string;
      category?: string;
      subject: string;
      description: string;
      priority?: string;
    }) => {
      if (!input?.ownerId) throw new Error('ownerId is required');
      if (!String(input.wakalaMsisdn || '').trim()) throw new Error('wakalaMsisdn is required');
      if (!String(input.subject || '').trim()) throw new Error('subject is required');
      if (!String(input.description || '').trim()) throw new Error('description is required');
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { data: row, error } = await supabase
      .from('wakala_issues')
      .insert({
        owner_id: data.ownerId,
        owner_name: data.ownerName || 'Owner',
        created_by: context.userId,
        wakala_msisdn: String(data.wakalaMsisdn).trim(),
        wakala_name: data.wakalaName || null,
        category: data.category || 'Other',
        subject: data.subject.trim(),
        description: data.description.trim(),
        priority: ['Low', 'Normal', 'High'].includes(String(data.priority)) ? data.priority : 'Normal',
      })
      .select('*')
      .single();
    if (error) throw new Error(`wakala_issues insert: ${error.message}`);
    return { issue: row as WakalaIssue };
  });

/** Lists issues visible to the caller (own issues for owners, all for staff). */
export const listWakalaIssues = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: { ownerId?: string; status?: string }) => input ?? {})
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    let query = supabase.from('wakala_issues').select('*').order('created_at', { ascending: false });
    if (data?.ownerId) query = query.eq('owner_id', data.ownerId);
    if (data?.status) query = query.eq('status', data.status);
    const { data: rows, error } = await query;
    if (error) throw new Error(`wakala_issues read: ${error.message}`);
    return { issues: (rows ?? []) as WakalaIssue[] };
  });

export const listIssueMessages = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { issueId: string }) => {
    if (!input?.issueId) throw new Error('issueId is required');
    return input;
  })
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { data: rows, error } = await supabase
      .from('wakala_issue_messages')
      .select('*')
      .eq('issue_id', data.issueId)
      .order('created_at', { ascending: true });
    if (error) throw new Error(`wakala_issue_messages read: ${error.message}`);
    return { messages: rows ?? [] };
  });

export const postIssueMessage = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { issueId: string; body: string; senderName: string; senderRole?: string }) => {
    if (!input?.issueId) throw new Error('issueId is required');
    if (!String(input.body || '').trim()) throw new Error('body is required');
    return input;
  })
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { error } = await supabase.from('wakala_issue_messages').insert({
      issue_id: data.issueId,
      sender_user_id: context.userId,
      sender_name: data.senderName || 'User',
      sender_role: data.senderRole === 'admin' ? 'admin' : 'owner',
      body: data.body.trim(),
    });
    if (error) throw new Error(`wakala_issue_messages insert: ${error.message}`);
    return { ok: true };
  });

/** Staff-only: move an issue through Open -> In Progress -> Resolved. */
export const updateIssueStatus = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { issueId: string; status: string; resolutionNote?: string }) => {
    if (!input?.issueId) throw new Error('issueId is required');
    if (!['Open', 'In Progress', 'Resolved'].includes(input.status)) throw new Error('invalid status');
    return input;
  })
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { data: isStaff } = await supabase.rpc('is_staff', { _user_id: context.userId });
    if (!isStaff) throw new Error('Forbidden');

    const patch: Record<string, any> = { status: data.status };
    if (data.resolutionNote !== undefined) patch.resolution_note = data.resolutionNote;
    if (data.status === 'Resolved') {
      patch.resolved_at = new Date().toISOString();
      patch.resolved_by = context.userId;
    }
    const { error } = await supabase.from('wakala_issues').update(patch).eq('id', data.issueId);
    if (error) throw new Error(`wakala_issues update: ${error.message}`);
    return { ok: true };
  });
