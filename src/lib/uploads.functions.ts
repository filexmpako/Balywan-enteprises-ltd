import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

/**
 * Deletes an uploaded report and every database row it produced.
 * Staff-only: owners must never be able to purge company-wide data.
 */
export const deleteUploadedReport = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      uploadId?: string | null;
      fileName?: string | null;
      reportingWeek?: string | null;
      reportingMonth?: string | null;
      reportType?: string | null;
    }) => {
      if (!input || typeof input !== 'object') throw new Error('Invalid delete payload');
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    const { data: isStaff, error: roleError } = await context.supabase.rpc('is_staff', {
      _user_id: context.userId,
    });
    if (roleError) throw new Error(`role check: ${roleError.message}`);
    if (!isStaff) throw new Error('Forbidden: only staff can delete uploaded reports');

    const { purgeUpload } = await import('./uploads.server');
    const result = await purgeUpload(context.supabase as any, data);

    const { appendAuditLog } = await import('./hasidadi/repo.server');
    await appendAuditLog(context.supabase as any, {
      userId: context.userId,
      action: 'DELETE_UPLOAD',
      entity: 'file_upload_archives',
      details: { ...data, ...result, transactionRefs: undefined },
    }).catch(() => undefined);

    return result;
  });
