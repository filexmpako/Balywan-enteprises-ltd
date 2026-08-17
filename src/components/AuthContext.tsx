import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { bootstrapSeedAccounts } from '@/lib/bootstrap.functions';
import { hydrateFromCloud, installCloudSync } from '@/lib/cloudSync';

export type UserRole = 'Admin' | 'Owner' | 'FloatManager';

export interface UserSession {
  username: string;
  email: string;
  name: string;
  role: UserRole;
  ownerId?: string;
  personnelId?: string;
  avatarPhotoId?: string;
}

/** Retained for compatibility with legacy imports. */
export interface StoredUser extends UserSession {
  salt?: string;
  passwordHash?: string;
}

interface AuthContextType {
  user: UserSession | null;
  portalType: 'admin' | 'owner' | 'float-manager' | null;
  setPortalType: (type: 'admin' | 'owner' | 'float-manager' | null) => void;
  login: (
    username: string,
    requestedPortal: 'admin' | 'owner' | 'float-manager',
    password?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  forgotPassword: (contactOrUsername: string) => Promise<{ success: boolean; token?: string; error?: string }>;
  resetPassword: (token: string, newPass: string) => Promise<{ success: boolean; error?: string }>;
  isLoading: boolean;
  updateUser: (name: string, email: string, avatarPhotoId?: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ROLE_MAP: Record<string, UserRole> = {
  admin: 'Admin',
  owner: 'Owner',
  float_manager: 'FloatManager',
};

const PORTAL_ROLE: Record<'admin' | 'owner' | 'float-manager', UserRole> = {
  admin: 'Admin',
  owner: 'Owner',
  'float-manager': 'FloatManager',
};

async function buildSession(userId: string, email: string): Promise<UserSession | null> {
  const [{ data: profile }, { data: roles }, { data: owner }] = await Promise.all([
    supabase.from('profiles').select('username, full_name, email, avatar').eq('user_id', userId).maybeSingle(),
    supabase.from('user_roles').select('role').eq('user_id', userId),
    supabase.from('owners').select('owner_id, avatar_photo_id').eq('user_id', userId).maybeSingle(),
  ]);

  const roleKey = roles?.[0]?.role as string | undefined;
  if (!roleKey) return null;

  return {
    username: profile?.username || email.split('@')[0],
    email: profile?.email || email,
    name: profile?.full_name || email.split('@')[0],
    role: ROLE_MAP[roleKey] ?? 'Owner',
    ownerId: owner?.owner_id ?? undefined,
    avatarPhotoId: owner?.avatar_photo_id ?? undefined,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  const [portalType, setPortalState] = useState<'admin' | 'owner' | 'float-manager' | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setIsLoading(false);
      return;
    }

    installCloudSync();

    const storedPortal = localStorage.getItem('hasidadi_portal_type') as typeof portalType;
    if (storedPortal) setPortalState(storedPortal);

    let active = true;

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const sessionUser = data.session?.user;
        if (sessionUser && active) {
          const session = await buildSession(sessionUser.id, sessionUser.email || '');
          if (session && active) {
            setUser(session);
            localStorage.setItem('hasidadi_current_user', JSON.stringify(session));
            void hydrateFromCloud();
          }
        }
      } finally {
        if (active) setIsLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        localStorage.removeItem('hasidadi_current_user');
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const setPortalType = (type: 'admin' | 'owner' | 'float-manager' | null) => {
    setPortalState(type);
    if (type) localStorage.setItem('hasidadi_portal_type', type);
    else localStorage.removeItem('hasidadi_portal_type');
  };

  const login = async (
    username: string,
    requestedPortal: 'admin' | 'owner' | 'float-manager',
    password?: string,
  ): Promise<{ success: boolean; error?: string }> => {
    if (!password) {
      return { success: false, error: 'Password parameter is strictly required to authenticate.' };
    }

    setIsLoading(true);
    try {
      const identifier = username.trim();

      // First run on a fresh backend: provision the standard operating accounts.
      try {
        await bootstrapSeedAccounts();
      } catch {
        /* already provisioned or unavailable — continue */
      }

      const { data: resolvedEmail } = await supabase.rpc('resolve_login_email', { _username: identifier });
      const email = (resolvedEmail as string | null) || (identifier.includes('@') ? identifier : '');
      if (!email) {
        return { success: false, error: 'The username provided does not match our authorized records.' };
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.user) {
        return { success: false, error: 'Authentication failed. Invalid password credential supplied.' };
      }

      const session = await buildSession(data.user.id, data.user.email || email);
      if (!session) {
        await supabase.auth.signOut();
        return { success: false, error: 'This account has no operating role assigned. Contact an administrator.' };
      }

      const expectedRole = PORTAL_ROLE[requestedPortal];
      if (session.role !== expectedRole) {
        await supabase.auth.signOut();
        return {
          success: false,
          error: `Unauthorized portal mapping. Your account possesses ${session.role} privileges, but you attempted to login to the ${expectedRole} portal.`,
        };
      }

      setUser(session);
      localStorage.setItem('hasidadi_current_user', JSON.stringify(session));
      await hydrateFromCloud();
      return { success: true };
    } catch {
      return { success: false, error: 'An unexpected error occurred during security validation.' };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    void supabase.auth.signOut();
    setUser(null);
    setPortalState(null);
    localStorage.removeItem('hasidadi_current_user');
    localStorage.removeItem('hasidadi_portal_type');
    window.location.hash = '#/';
  };

  const forgotPassword = async (
    contactOrUsername: string,
  ): Promise<{ success: boolean; token?: string; error?: string }> => {
    const identifier = contactOrUsername.trim();
    const { data: resolvedEmail } = await supabase.rpc('resolve_login_email', { _username: identifier });
    const email = (resolvedEmail as string | null) || (identifier.includes('@') ? identifier : '');
    if (!email) {
      return { success: false, error: 'The account information provided does not match our records.' };
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/#/reset`,
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  };

  const resetPassword = async (_token: string, newPass: string): Promise<{ success: boolean; error?: string }> => {
    const { error } = await supabase.auth.updateUser({ password: newPass });
    if (error) {
      return {
        success: false,
        error: 'Open the recovery link sent to your registered email before setting a new password.',
      };
    }
    return { success: true };
  };

  const updateUser = async (
    name: string,
    email: string,
    avatarPhotoId?: string,
  ): Promise<{ success: boolean; error?: string }> => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return { success: false, error: 'No active session.' };

    const { error } = await supabase
      .from('profiles')
      .update({ full_name: name, email })
      .eq('user_id', data.user.id);
    if (error) return { success: false, error: error.message };

    if (avatarPhotoId && user?.ownerId) {
      await supabase.from('owners').update({ avatar_photo_id: avatarPhotoId }).eq('owner_id', user.ownerId);
    }

    const next = { ...(user as UserSession), name, email, avatarPhotoId: avatarPhotoId ?? user?.avatarPhotoId };
    setUser(next);
    localStorage.setItem('hasidadi_current_user', JSON.stringify(next));
    return { success: true };
  };

  return (
    <AuthContext.Provider
      value={{ user, portalType, setPortalType, login, logout, forgotPassword, resetPassword, isLoading, updateUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
