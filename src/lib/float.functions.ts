import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { FloatAction } from './float.server';

/**
 * Float requests and loans: read the list, and change one record at a time
 * (see float.server.ts). Float data is never saved as a whole list.
 */

const getAdminDb = async () => (await import('@/integrations/supabase/client.server')).supabaseAdmin as any;

async function actorFor(context: { supabase: unknown; userId: string }) {
  const { resolveActor } = await import('./float.server');
  return resolveActor(context.supabase as any, context.userId);
}

/** Expected refusals reach the user as-is; anything else is logged with a generic message. */
async function friendly<T>(work: () => Promise<T>): Promise<T> {
  const { FloatActionError } = await import('./float.server');
  try {
    return await work();
  } catch (err) {
    if (err instanceof FloatActionError) throw new Error(err.message);
    console.error('[float]', err);
    throw new Error('The float change could not be saved. Please try again.');
  }
}

export const fetchFloatData = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadFloatData } = await import('./float.server');
    return loadFloatData(context.supabase as any);
  });

export const runFloatActionFn = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { action: FloatAction }) => {
    if (!input?.action || typeof input.action.type !== 'string') throw new Error('Invalid float action');
    return input;
  })
  .handler(async ({ data, context }) =>
    friendly(async () => {
      const { runFloatAction } = await import('./float.server');
      await runFloatAction(context.supabase as any, getAdminDb, await actorFor(context), data.action);
      return { ok: true as const };
    }),
  );

export const uploadFloatReceipt = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { requestId: string; dataUrl: string }) => {
    if (!input?.requestId || typeof input.dataUrl !== 'string') throw new Error('Invalid receipt upload');
    return input;
  })
  .handler(async ({ data, context }) =>
    friendly(async () => {
      const { storeReceipt } = await import('./float.server');
      const receiptId = await storeReceipt(await getAdminDb(), await actorFor(context), data.requestId, data.dataUrl);
      return { receiptId };
    }),
  );

export const fetchFloatReceiptUrl = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { receiptId: string }) => {
    if (!input?.receiptId) throw new Error('Invalid receipt');
    return input;
  })
  .handler(async ({ data, context }) =>
    friendly(async () => {
      const { receiptLink } = await import('./float.server');
      return { url: await receiptLink(await getAdminDb(), await actorFor(context), data.receiptId) };
    }),
  );
