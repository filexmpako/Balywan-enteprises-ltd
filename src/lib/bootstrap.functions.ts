import { createServerFn } from '@tanstack/react-start';

/**
 * First-run provisioning of the single administrator account.
 *
 * Callable without a session, but it is a hard no-op once any profile exists,
 * so it can never be used to mint extra accounts. The password is never
 * hardcoded: it is either supplied through the ADMIN_BOOTSTRAP_PASSWORD server
 * secret or randomly generated, logged once server-side and returned once to
 * the caller that triggered setup.
 */
const ADMIN_EMAIL = 'admin@hasidadi.com';
const ADMIN_USERNAME = 'admin';
const ADMIN_NAME = 'Executive Admin';

function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return `${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')}#7`;
}

export const bootstrapSeedAccounts = createServerFn({ method: 'POST' }).handler(async () => {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

  const { count, error } = await supabaseAdmin
    .from('profiles')
    .select('user_id', { count: 'exact', head: true });
  if (error) throw new Error(error.message);
  if ((count ?? 0) > 0) {
    return { created: 0, alreadyProvisioned: true, email: null, password: null };
  }

  const password = process.env['ADMIN_BOOTSTRAP_PASSWORD']?.trim() || generatePassword();
  const generated = !process.env['ADMIN_BOOTSTRAP_PASSWORD']?.trim();

  const { error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password,
    email_confirm: true,
    user_metadata: { username: ADMIN_USERNAME, full_name: ADMIN_NAME, role: 'admin' },
  });
  if (createError) {
    console.error('[bootstrap] could not create the administrator account', createError.message);
    return { created: 0, alreadyProvisioned: false, email: null, password: null };
  }

  // Surfaced once: in the server log, and to the one-time setup screen.
  console.warn(
    `[bootstrap] administrator account created for ${ADMIN_EMAIL}. ` +
      `Sign in with the ${generated ? 'generated' : 'configured'} password shown on the setup screen and change it immediately.`,
  );
  if (generated) console.warn(`[bootstrap] one-time administrator password: ${password}`);

  return { created: 1, alreadyProvisioned: false, email: ADMIN_EMAIL, password };
});
