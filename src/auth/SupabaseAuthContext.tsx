import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';

import { isFeatureEnabled } from '../lib/featureFlags';
import { getSupabaseBrowserClient } from '../lib/supabaseClient';

export type FireViewerElevatedRole = 'analyst' | 'editor' | 'security_operator' | 'administrator';

const ELEVATED_ROLES = new Set<FireViewerElevatedRole>([
  'analyst',
  'editor',
  'security_operator',
  'administrator',
]);

export function rolesFromAppMetadata(user: User | null): readonly FireViewerElevatedRole[] {
  const rawRoles = user?.app_metadata?.roles;
  if (!Array.isArray(rawRoles)) return [];
  return [...new Set(rawRoles.filter(
    (role): role is FireViewerElevatedRole => typeof role === 'string' && ELEVATED_ROLES.has(role as FireViewerElevatedRole),
  ))];
}

export function isVerifiedSupabaseUser(user: User | null): boolean {
  return Boolean(user?.email && (user.email_confirmed_at || user.confirmed_at));
}

export function canPublishFromRoles(roles: readonly FireViewerElevatedRole[]): boolean {
  return roles.includes('editor') || roles.includes('administrator');
}

interface AuthResult {
  readonly ok: boolean;
  readonly message: string | null;
}

export interface SupabaseAuthValue {
  readonly enabled: boolean;
  readonly configured: boolean;
  readonly loading: boolean;
  readonly session: Session | null;
  readonly user: User | null;
  readonly verified: boolean;
  readonly elevatedRoles: readonly FireViewerElevatedRole[];
  readonly signIn: (email: string, password: string) => Promise<AuthResult>;
  readonly signUp: (email: string, password: string) => Promise<AuthResult>;
  readonly requestPasswordReset: (email: string) => Promise<AuthResult>;
  readonly updatePassword: (password: string) => Promise<AuthResult>;
  readonly resendVerification: () => Promise<AuthResult>;
  readonly signOut: () => Promise<void>;
  readonly accessToken: () => Promise<string | null>;
}

const disabledValue: SupabaseAuthValue = {
  enabled: false,
  configured: false,
  loading: false,
  session: null,
  user: null,
  verified: false,
  elevatedRoles: [],
  signIn: async () => ({ ok: false, message: 'Authentification désactivée.' }),
  signUp: async () => ({ ok: false, message: 'Authentification désactivée.' }),
  requestPasswordReset: async () => ({ ok: false, message: 'Authentification désactivée.' }),
  updatePassword: async () => ({ ok: false, message: 'Authentification désactivée.' }),
  resendVerification: async () => ({ ok: false, message: 'Authentification désactivée.' }),
  signOut: async () => undefined,
  accessToken: async () => null,
};

const SupabaseAuthContext = createContext<SupabaseAuthValue>(disabledValue);

function callbackUrl(path: string): string {
  return new URL(path, window.location.origin).toString();
}

function safeMessage(error: { readonly message?: string } | null): string | null {
  if (!error) return null;
  return error.message === 'Invalid login credentials'
    ? 'Adresse e-mail ou mot de passe incorrect.'
    : 'Supabase Auth a refusé cette opération.';
}

export function SupabaseAuthProvider({ children }: { readonly children: ReactNode }) {
  const enabled = isFeatureEnabled('FV_SUPABASE_AUTH_ENABLED');
  const client = enabled ? getSupabaseBrowserClient() : null;
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(client));

  useEffect(() => {
    if (!client) {
      setLoading(false);
      setSession(null);
      return undefined;
    }
    let active = true;
    void client.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session);
        setLoading(false);
      }
    });
    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        setSession(nextSession);
        setLoading(false);
      }
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [client]);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!client) return { ok: false, message: 'Supabase Auth n’est pas configuré.' };
    const { error } = await client.auth.signInWithPassword({ email, password });
    return { ok: !error, message: safeMessage(error) };
  }, [client]);

  const signUp = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!client) return { ok: false, message: 'Supabase Auth n’est pas configuré.' };
    const { error } = await client.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: callbackUrl('/compte') },
    });
    return { ok: !error, message: safeMessage(error) };
  }, [client]);

  const requestPasswordReset = useCallback(async (email: string): Promise<AuthResult> => {
    if (!client) return { ok: false, message: 'Supabase Auth n’est pas configuré.' };
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: callbackUrl('/compte/nouveau-mot-de-passe'),
    });
    return { ok: !error, message: safeMessage(error) };
  }, [client]);

  const updatePassword = useCallback(async (password: string): Promise<AuthResult> => {
    if (!client) return { ok: false, message: 'Supabase Auth n’est pas configuré.' };
    const { error } = await client.auth.updateUser({ password });
    return { ok: !error, message: safeMessage(error) };
  }, [client]);

  const resendVerification = useCallback(async (): Promise<AuthResult> => {
    if (!client || !session?.user.email) return { ok: false, message: 'Aucune adresse e-mail connectée.' };
    const { error } = await client.auth.resend({
      type: 'signup',
      email: session.user.email,
      options: { emailRedirectTo: callbackUrl('/compte') },
    });
    return { ok: !error, message: safeMessage(error) };
  }, [client, session?.user.email]);

  const signOut = useCallback(async (): Promise<void> => {
    await client?.auth.signOut({ scope: 'local' });
  }, [client]);

  const accessToken = useCallback(async (): Promise<string | null> => {
    if (!client) return null;
    const { data, error } = await client.auth.getSession();
    if (error || !isVerifiedSupabaseUser(data.session?.user ?? null)) return null;
    return data.session?.access_token ?? null;
  }, [client]);

  const user = session?.user ?? null;
  const value = useMemo<SupabaseAuthValue>(() => ({
    enabled,
    configured: Boolean(client),
    loading,
    session,
    user,
    verified: isVerifiedSupabaseUser(user),
    elevatedRoles: rolesFromAppMetadata(user),
    signIn,
    signUp,
    requestPasswordReset,
    updatePassword,
    resendVerification,
    signOut,
    accessToken,
  }), [accessToken, client, enabled, loading, requestPasswordReset, resendVerification, session, signIn, signOut, signUp, updatePassword, user]);

  return <SupabaseAuthContext.Provider value={value}>{children}</SupabaseAuthContext.Provider>;
}

export function useSupabaseAuth(): SupabaseAuthValue {
  return useContext(SupabaseAuthContext);
}

/** Le mode admin local reste compatible uniquement tant que Supabase est désactivé. */
export function useCanPublish(): boolean {
  const auth = useSupabaseAuth();
  return !isFeatureEnabled('FV_SUPABASE_AUTH_ENABLED') || canPublishFromRoles(auth.elevatedRoles);
}
