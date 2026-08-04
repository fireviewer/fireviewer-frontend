import { useState, type FormEvent } from 'react';

import { useSupabaseAuth } from '../../auth/SupabaseAuthContext';
import { PageHero } from './FireWarningBasicPages';
import { PublicIcon } from './PublicIcon';
import './event-candidates.css';

type Mode = 'signin' | 'signup' | 'recovery';

export function SupabaseAccountPage({ initialMode = 'signin' }: { readonly initialMode?: Mode }) {
  const auth = useSupabaseAuth();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = mode === 'signin'
      ? await auth.signIn(email, password)
      : mode === 'signup'
        ? await auth.signUp(email, password)
        : await auth.requestPasswordReset(email);
    setBusy(false);
    if (!result.ok) {
      setError(result.message ?? 'Opération refusée.');
      return;
    }
    setMessage(mode === 'signin' ? 'Connexion réussie.' : mode === 'signup' ? 'Compte créé. Vérifiez votre adresse e-mail avant de contribuer.' : 'Si ce compte existe, un lien de récupération a été envoyé.');
  };

  if (!auth.enabled || !auth.configured) return <><PageHero visual="account" title="Compte" description="L’authentification événementielle est désactivée sur cette instance." /><main className="fw-page fv-event-page"><section className="fv-event-auth-required"><PublicIcon name="info" size={32} /><h2>Supabase Auth non configuré</h2><p>Les contributions v2 restent fermées. La consultation publique demeure disponible.</p></section></main></>;
  if (auth.loading) return <p role="status">Vérification de la session…</p>;

  if (auth.user) {
    return <><PageHero visual="account" title="Mon compte" description="Identité Supabase utilisée uniquement pour contribuer et accéder aux espaces autorisés." /><main className="fw-page fv-event-page"><section className="fv-event-receipt"><PublicIcon name={auth.verified ? 'check-circle' : 'warning'} size={36} /><h2>{auth.user.email}</h2><p>{auth.verified ? 'Adresse e-mail vérifiée. Le rôle contributeur est actif.' : 'Adresse e-mail non vérifiée. Les contributions restent bloquées.'}</p>{auth.elevatedRoles.length ? <p>Rôles internes : <strong>{auth.elevatedRoles.join(', ')}</strong></p> : <p>Aucun rôle interne élevé.</p>}<div className="fw-form-actions">{!auth.verified ? <button type="button" className="fw-button fw-button--outline" onClick={() => void auth.resendVerification().then((result) => setMessage(result.ok ? 'E-mail de vérification renvoyé.' : result.message))}>Renvoyer la vérification</button> : <a className="fw-button fw-button--primary" href="/signaler">Documenter un événement</a>}<a className="fw-button fw-button--outline" href="/mes-contributions">Mes contributions</a><button type="button" className="fw-button fw-button--outline" onClick={() => void auth.signOut()}>Se déconnecter</button></div>{message ? <p role="status">{message}</p> : null}</section></main></>;
  }

  return <><PageHero visual="account" title="Compte FireViewer" description="Un compte avec adresse e-mail vérifiée est obligatoire pour documenter un événement." /><main className="fw-page fv-event-page"><form className="fv-event-form fv-account-form" onSubmit={(event) => void submit(event)}><section className="fv-event-section"><div className="fw-segmented"><button type="button" className={mode === 'signin' ? 'is-active' : ''} onClick={() => setMode('signin')}>Connexion</button><button type="button" className={mode === 'signup' ? 'is-active' : ''} onClick={() => setMode('signup')}>Créer un compte</button><button type="button" className={mode === 'recovery' ? 'is-active' : ''} onClick={() => setMode('recovery')}>Mot de passe oublié</button></div><label>Adresse e-mail<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>{mode !== 'recovery' ? <label>Mot de passe<input type="password" minLength={8} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} required /></label> : null}<p><PublicIcon name="shield" size={18} /> FireViewer ne lit jamais les rôles depuis les métadonnées modifiables par l’utilisateur.</p>{error ? <p className="fw-form-error" role="alert">{error}</p> : null}{message ? <p role="status">{message}</p> : null}<button className="fw-button fw-button--primary" type="submit" disabled={busy}>{busy ? 'Traitement…' : mode === 'signin' ? 'Se connecter' : mode === 'signup' ? 'Créer le compte' : 'Envoyer le lien'}</button></section></form></main></>;
}

export function SupabasePasswordUpdatePage() {
  const auth = useSupabaseAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirmation) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    const result = await auth.updatePassword(password);
    setError(result.ok ? null : result.message);
    setMessage(result.ok ? 'Mot de passe mis à jour. Vous pouvez revenir au compte.' : null);
  };
  return <><PageHero visual="account" title="Nouveau mot de passe" description="Finalisez la récupération depuis le lien sécurisé reçu par e-mail." /><main className="fw-page fv-event-page"><form className="fv-event-form fv-account-form" onSubmit={(event) => void submit(event)}><section className="fv-event-section"><label>Nouveau mot de passe<input type="password" minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label><label>Confirmer<input type="password" minLength={8} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></label>{error ? <p className="fw-form-error" role="alert">{error}</p> : null}{message ? <p role="status">{message}</p> : null}<button className="fw-button fw-button--primary" type="submit">Enregistrer</button></section></form></main></>;
}
