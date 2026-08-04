import { FormEvent, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { loginAdmin, logoutAdmin, validateAdminSession, type AdminSession } from '../../lib/adminSession';
import { useSupabaseAuth } from '../../auth/SupabaseAuthContext';
import { isFeatureEnabled } from '../../lib/featureFlags';

interface AdminAuthGateProps {
  children: (session: AdminSession, onSignOut: () => void) => ReactNode;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function AdminAuthGate({ children }: AdminAuthGateProps) {
  const supabaseAuth = useSupabaseAuth();
  const useSupabase = isFeatureEnabled('FV_SUPABASE_AUTH_ENABLED');
  const [session, setSession] = useState<AdminSession | null>(null);
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const validationId = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  const signOut = useCallback(() => {
    validationId.current += 1;
    controllerRef.current?.abort();
    if (session) {
      void logoutAdmin(session);
    }
    setSession(null);
    setPassword('');
    setError(null);
    setChecking(false);
  }, [session]);

  const verify = useCallback(async (candidate?: { username: string; password: string }) => {
    if (useSupabase) {
      setChecking(false);
      return;
    }
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const currentValidationId = validationId.current + 1;
    validationId.current = currentValidationId;
    setChecking(true);
    setError(null);

    try {
      const validation = candidate ? await loginAdmin(candidate.username, candidate.password, { signal: controller.signal }) : await validateAdminSession({ signal: controller.signal });
      if (controller.signal.aborted || validationId.current !== currentValidationId) return;

      if (!validation.ok) {
        setSession(null);
        setError(validation.reason);
        return;
      }

      setSession(validation.session);
      setPassword('');
    } catch (caughtError) {
      if (controller.signal.aborted || validationId.current !== currentValidationId || isAbortError(caughtError)) {
        return;
      }
      setSession(null);
      setError('La vérification de session a été interrompue.');
    } finally {
      if (validationId.current === currentValidationId) setChecking(false);
    }
  }, [useSupabase]);

  useEffect(() => {
    if (useSupabase) return undefined;
    void verify();
    return () => controllerRef.current?.abort();
  }, [useSupabase, verify]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void verify({ username, password });
  };

  if (useSupabase) {
    if (supabaseAuth.loading) {
      return <main className="loading-screen" role="status"><div><strong>Validation de la session Supabase…</strong><span>Les rôles privés sont contrôlés avant l’ouverture de l’espace interne.</span></div></main>;
    }
    if (!supabaseAuth.user || !supabaseAuth.session || !supabaseAuth.verified) {
      return <main className="error-screen"><section className="error-screen__card"><span className="eyebrow">Accès privé</span><h1>Compte vérifié requis</h1><p>Connectez-vous avec un compte FireViewer vérifié. L’accès administrateur local est désactivé lorsque Supabase Auth est actif.</p><a className="button button--primary" href="/compte">Ouvrir la connexion</a></section></main>;
    }
    if (!supabaseAuth.elevatedRoles.some((role) => role === 'analyst' || role === 'editor' || role === 'security_operator' || role === 'administrator')) {
      return <main className="error-screen"><section className="error-screen__card"><span className="eyebrow">Autorisation refusée</span><h1>Rôle interne requis</h1><p>Le rôle contributeur ne donne pas accès à la revue. Les rôles élevés proviennent uniquement de <code>app_metadata.roles</code>.</p><a className="button button--primary" href="/">Retour au site public</a></section></main>;
    }
    return children(
      { token: supabaseAuth.session.access_token },
      () => { void supabaseAuth.signOut(); },
    );
  }

  if (checking) {
    return (
      <main className="loading-screen" role="status" aria-live="polite">
        <div>
          <strong>Validation de la session administrateur…</strong>
          <span>L’API vérifie les droits avant d’ouvrir l’espace privé.</span>
        </div>
      </main>
    );
  }

  if (session) {
    return children(session, signOut);
  }

  return (
    <main className="error-screen" aria-labelledby="admin-login-title">
      <form className="error-screen__card" onSubmit={submit}>
        <span className="eyebrow">Accès privé</span>
        <h1 id="admin-login-title">Connexion administrateur requise</h1>
        <p>
          Utilisez le compte administrateur local. Le mot de passe n’est jamais conservé dans le navigateur.
        </p>
        <label htmlFor="admin-username">Identifiant</label>
        <input id="admin-username" value={username} onChange={(event) => setUsername(event.currentTarget.value)} autoComplete="username" disabled={checking} />
        <label htmlFor="admin-password">Mot de passe</label>
        <input id="admin-password" type="password" value={password} onChange={(event) => setPassword(event.currentTarget.value)} autoComplete="current-password" disabled={checking} />
        {error ? <p role="alert">{error}</p> : null}
        <button type="submit" className="button button--primary" disabled={checking}>
          Ouvrir l’administration
        </button>
      </form>
    </main>
  );
}
