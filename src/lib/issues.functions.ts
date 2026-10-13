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
    const { data: row, error } = await supabase
      .from('wakala_issue_messages')
      .insert({
        issue_id: data.issueId,
        sender_user_id: context.userId,
        sender_name: data.senderName || 'User',
        sender_role: data.senderRole === 'admin' ? 'admin' : 'owner',
        body: data.body.trim(),
      })
      .select('id')
      .single();
    if (error) throw new Error(`wakala_issue_messages insert: ${error.message}`);
    // The id lets photos be attached to this reply (see uploadIssuePhoto).
    return { ok: true, id: String(row?.id ?? '') };
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

const getAdminDb = async () => (await import('@/integrations/supabase/client.server')).supabaseAdmin as any;

/** Expected refusals reach the user as-is; anything else is logged with a generic message. */
async function photoErrors<T>(work: () => Promise<T>): Promise<T> {
  const { IssuePhotoError } = await import('./issuePhotos.server');
  const { ImageUploadError } = await import('./storageImages.server');
  try {
    return await work();
  } catch (err) {
    if (err instanceof IssuePhotoError || err instanceof ImageUploadError) throw new Error(err.message);
    console.error('[issue photos]', err);
    throw new Error('The photo could not be saved. Please try again.');
  }
}

/** Adds a photo to an issue (messageKey 'issue') or to one of its replies (the message id). */
export const uploadIssuePhoto = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { issueId: string; messageKey: string; dataUrl: string }) => {
    if (!input?.issueId || !input?.messageKey || typeof input.dataUrl !== 'string') throw new Error('Invalid photo upload');
    return input;
  })
  .handler(async ({ data, context }) =>
    photoErrors(async () => {
      const { storeIssuePhoto } = await import('./issuePhotos.server');
      await storeIssuePhoto(context.supabase as any, await getAdminDb(), data.issueId, data.messageKey, data.dataUrl);
      return { ok: true as const };
    }),
  );

/** Short-lived links to an issue's photos, grouped by message key ('issue' or a reply id). */
export const listIssuePhotos = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { issueId: string }) => {
    if (!input?.issueId) throw new Error('issueId is required');
    return input;
  })
  .handler(async ({ data, context }) =>
    photoErrors(async () => {
      const { listIssuePhotoLinks } = await import('./issuePhotos.server');
      return { photos: await listIssuePhotoLinks(context.supabase as any, await getAdminDb(), data.issueId) };
    }),
  );
