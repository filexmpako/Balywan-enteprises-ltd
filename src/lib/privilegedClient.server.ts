import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The service-role client for reads the caller has already been checked for,
 * or `fallback` (the caller's own RLS-scoped client) when this server has no
 * service-role key: staff still read everything through their own client.
 */
export async function privilegedClient(fallback: SupabaseClient<any, any, any>): Promise<SupabaseClient<any, any, any>> {
  try {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    void supabaseAdmin.from; // creates the client; throws when the key is missing
    return supabaseAdmin as any;
  } catch {
    return fallback;
  }
}
