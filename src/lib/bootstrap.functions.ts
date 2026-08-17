import { createServerFn } from '@tanstack/react-start';

/**
 * First-run provisioning. Callable without a session, but it is a hard no-op
 * once any profile exists, so it can never be used to mint extra accounts.
 */
const SEED_ACCOUNTS = [
  { username: 'admin', email: 'admin@hasidadi.com', name: 'Executive Admin', role: 'admin', password: 'AdminPassword123!' },
  { username: 'owner1', email: 'owner@hasidadi.com', name: 'Wakala Agent Owner', role: 'owner', password: 'OwnerPassword123!', ownerId: 'owner-1' },
  { username: 'floatmanager', email: 'floatmanager@hasidadi.com', name: 'Float Operations Manager', role: 'float_manager', password: 'FloatManagerPassword123!' },
];

export const bootstrapSeedAccounts = createServerFn({ method: 'POST' }).handler(async () => {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

  const { count, error } = await supabaseAdmin
    .from('profiles')
    .select('user_id', { count: 'exact', head: true });
  if (error) throw new Error(error.message);
  if ((count ?? 0) > 0) return { created: 0, alreadyProvisioned: true };

  let created = 0;
  for (const seed of SEED_ACCOUNTS) {
    const { data, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: seed.email,
      password: seed.password,
      email_confirm: true,
      user_metadata: { username: seed.username, full_name: seed.name, role: seed.role },
    });
    if (createError) {
      console.error('[bootstrap] could not create seed account', seed.username, createError.message);
      continue;
    }
    created += 1;

    if (seed.ownerId && data.user) {
      await supabaseAdmin
        .from('owners')
        .upsert(
          {
            owner_id: seed.ownerId,
            user_id: data.user.id,
            name: seed.name,
            master_agent_id: 'MA-0001',
            region: 'Mtwara',
            status: 'Active',
          },
          { onConflict: 'owner_id' },
        );
    }
  }

  return { created, alreadyProvisioned: false };
});
