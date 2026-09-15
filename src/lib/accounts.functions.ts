/**
 * Real account management, admin only.
 *
 * Every function verifies the caller holds the admin role through the caller's
 * own RLS-scoped client, and only then loads the privileged client (inside the
 * handler, never at module scope) to touch Auth. There is no client-side user
 * store any more: Supabase Auth + profiles + user_roles are the single truth.
 */
import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export type PortalRole = 'Owner' | 'FloatManager' | 'Admin';

const ROLE_TO_DB: Record<PortalRole, 'owner' | 'float_manager' | 'admin'> = {
  Owner: 'owner',
  FloatManager: 'float_manager',
  Admin: 'admin',
};

const DB_TO_ROLE: Record<string, PortalRole> = {
  owner: 'Owner',
  float_manager: 'FloatManager',
  admin: 'Admin',
};

/** Cryptographically random, human-transferable password. */
function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  const body = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  return `${body}#7`;
}

async function assertAdmin(context: any) {
  const { data, error } = await context.supabase.rpc('has_role', {
    _user_id: context.userId,
    _role: 'admin',
  });
  if (error) throw new Error(`Could not verify permissions: ${error.message}`);
  if (!data) throw new Error('Forbidden: administrator access required');
}

async function writeAuditLog(
  admin: any,
  context: any,
  action: string,
  entity: string,
  meta: Record<string, unknown>,
) {
  const actorName =
    (context.claims?.user_metadata?.full_name as string) ||
    (context.claims?.email as string) ||
    'Administrator';
  await admin.from('audit_logs').insert({
    user_id: context.userId,
    actor_name: actorName,
    action_taken: action,
    impacted_entity: entity,
    meta_details: meta as any,
    ip_address: 'server',
  });
}

export interface UserAccount {
  userId: string;
  email: string;
  username: string;
  name: string;
  role: PortalRole;
  ownerId: string | null;
  personnelId: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
}

export const listUserAccounts = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ users: UserAccount[] }> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const authUsers: any[] = [];
    for (let page = 1; page <= 20; page += 1) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(error.message);
      authUsers.push(...(data?.users ?? []));
      if (!data || data.users.length < 200) break;
    }

    const [{ data: profiles }, { data: roles }, { data: owners }, { data: personnel }] =
      await Promise.all([
        supabaseAdmin.from('profiles').select('user_id, email, full_name, username'),
        supabaseAdmin.from('user_roles').select('user_id, role'),
        supabaseAdmin.from('owners').select('owner_id, name, user_id').not('user_id', 'is', null),
        supabaseAdmin
          .from('personnel')
          .select('personnel_id, name, user_id')
          .not('user_id', 'is', null),
      ]);

    const profileByUser = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));
    const roleByUser = new Map((roles ?? []).map((r: any) => [r.user_id, r.role]));
    const ownerByUser = new Map((owners ?? []).map((o: any) => [o.user_id, o]));
    const personnelByUser = new Map((personnel ?? []).map((p: any) => [p.user_id, p]));

    const users: UserAccount[] = authUsers.map((u) => {
      const profile: any = profileByUser.get(u.id) ?? {};
      const owner: any = ownerByUser.get(u.id);
      const staff: any = personnelByUser.get(u.id);
      const dbRole = roleByUser.get(u.id);
      return {
        userId: u.id,
        email: u.email ?? profile.email ?? '',
        username: profile.username ?? (u.email ? String(u.email).split('@')[0] : ''),
        name: profile.full_name ?? owner?.name ?? staff?.name ?? u.email ?? '',
        role: DB_TO_ROLE[String(dbRole ?? 'owner')] ?? 'Owner',
        ownerId: owner?.owner_id ?? null,
        personnelId: staff?.personnel_id ?? null,
        createdAt: u.created_at ?? null,
        lastSignInAt: u.last_sign_in_at ?? null,
      };
    });

    users.sort((a, b) => a.name.localeCompare(b.name));
    return { users };
  });

export const createUserAccount = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      email: string;
      username: string;
      name?: string;
      role: PortalRole;
      password?: string;
      ownerId?: string | null;
      personnelId?: string | null;
    }) => {
      if (!input?.email?.trim()) throw new Error('An email address is required');
      if (!input?.username?.trim()) throw new Error('A username is required');
      if (!ROLE_TO_DB[input.role]) throw new Error('Unknown role');
      if (input.password && input.password.length < 8) {
        throw new Error('Password must be at least 8 characters');
      }
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const email = data.email.trim().toLowerCase();
    const username = data.username.trim().toLowerCase();
    const password = data.password?.trim() || generatePassword();
    const name = data.name?.trim() || username;

    const { data: usernameTaken } = await supabaseAdmin
      .from('profiles')
      .select('user_id')
      .ilike('username', username)
      .maybeSingle();
    if (usernameTaken) throw new Error('That username is already in use');

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username, full_name: name, role: ROLE_TO_DB[data.role] },
    });
    if (error || !created?.user) throw new Error(error?.message || 'Could not create the account');
    const userId = created.user.id;

    // handle_new_user() creates the profile and the role row from metadata;
    // make both explicit so a metadata change can never silently skip them.
    await supabaseAdmin
      .from('profiles')
      .upsert({ user_id: userId, email, full_name: name, username }, { onConflict: 'user_id' });
    await supabaseAdmin
      .from('user_roles')
      .upsert({ user_id: userId, role: ROLE_TO_DB[data.role] }, { onConflict: 'user_id,role' });

    if (data.ownerId) {
      const { error: linkError } = await supabaseAdmin
        .from('owners')
        .update({ user_id: userId })
        .eq('owner_id', data.ownerId);
      if (linkError) throw new Error(`Account created but linking failed: ${linkError.message}`);
    }
    if (data.personnelId) {
      const { error: linkError } = await supabaseAdmin
        .from('personnel')
        .update({ user_id: userId })
        .eq('personnel_id', data.personnelId);
      if (linkError) throw new Error(`Account created but linking failed: ${linkError.message}`);
    }

    await writeAuditLog(supabaseAdmin, context, 'User Created', name, {
      email,
      username,
      role: data.role,
      ownerId: data.ownerId ?? null,
      personnelId: data.personnelId ?? null,
      passwordGenerated: !data.password,
    });

    // The password is returned once so the admin can hand it over; it is never
    // stored anywhere in readable form.
    return { userId, email, username, password, generated: !data.password };
  });

export const updateUserAccount = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      userId: string;
      email?: string;
      username?: string;
      name?: string;
      role?: PortalRole;
    }) => {
      if (!input?.userId) throw new Error('userId is required');
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const email = data.email?.trim().toLowerCase();
    const username = data.username?.trim().toLowerCase();
    const name = data.name?.trim();

    if (email || name || username) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
        ...(email ? { email } : {}),
        user_metadata: {
          ...(username ? { username } : {}),
          ...(name ? { full_name: name } : {}),
        },
      });
      if (error) throw new Error(error.message);

      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({
          ...(email ? { email } : {}),
          ...(username ? { username } : {}),
          ...(name ? { full_name: name } : {}),
        })
        .eq('user_id', data.userId);
      if (profileError) throw new Error(profileError.message);
    }

    if (data.role) {
      await supabaseAdmin.from('user_roles').delete().eq('user_id', data.userId);
      const { error } = await supabaseAdmin
        .from('user_roles')
        .insert({ user_id: data.userId, role: ROLE_TO_DB[data.role] });
      if (error) throw new Error(error.message);
    }

    await writeAuditLog(supabaseAdmin, context, 'User Updated', name || data.userId, {
      userId: data.userId,
      email: email ?? null,
      username: username ?? null,
      role: data.role ?? null,
    });

    return { ok: true };
  });

export const resetUserPassword = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; password?: string }) => {
    if (!input?.userId) throw new Error('userId is required');
    if (input.password && input.password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const password = data.password?.trim() || generatePassword();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password });
    if (error) throw new Error(error.message);

    await writeAuditLog(supabaseAdmin, context, 'Password Reset', data.userId, {
      userId: data.userId,
      passwordGenerated: !data.password,
    });

    return { password, generated: !data.password };
  });

export const deleteUserAccount = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId?: string; ownerId?: string }) => {
    if (!input?.userId && !input?.ownerId) throw new Error('userId or ownerId is required');
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    let userId = data.userId ?? null;
    if (!userId && data.ownerId) {
      const { data: owner } = await supabaseAdmin
        .from('owners')
        .select('user_id')
        .eq('owner_id', data.ownerId)
        .maybeSingle();
      userId = (owner as any)?.user_id ?? null;
      if (!userId) return { ok: true, deleted: false };
    }

    if (userId === context.userId) {
      throw new Error('You cannot delete your own administrator account');
    }

    // Unlink first so the FK does not block the Auth deletion.
    await supabaseAdmin.from('owners').update({ user_id: null }).eq('user_id', userId!);
    await supabaseAdmin.from('personnel').update({ user_id: null }).eq('user_id', userId!);
    await supabaseAdmin.from('user_roles').delete().eq('user_id', userId!);
    await supabaseAdmin.from('profiles').delete().eq('user_id', userId!);

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId!);
    if (error) throw new Error(error.message);

    await writeAuditLog(supabaseAdmin, context, 'User Deleted', userId!, { userId });

    return { ok: true, deleted: true };
  });
