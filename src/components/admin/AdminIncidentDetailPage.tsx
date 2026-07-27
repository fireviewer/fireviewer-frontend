import { useCallback, useEffect, useState } from 'react';
import { PublicIcon } from '../public/PublicIcon';
import { useAdminApi, useAdminMutation, useAdminQuery } from './AdminApiContext';
import {
  AdminErrorState,
  AdminLoadingState,
  AdminPageHeader,
  formatAdminDate,
} from './AdminPageState';

const incidentStatuses = [
  ['CANDIDATE', 'Signalé'],
  ['UNDER_REVIEW', 'À confirmer'],
  ['ACTIVE_CONFIRMED', 'Actif confirmé'],
  ['MONITORING', 'Sous surveillance'],
  ['EXTINGUISHED', 'Éteint'],
  ['CLOSED', 'Clos'],
  ['SUSPENDED', 'Suspendu'],
  ['REJECTED', 'Écarté'],
] as const;

const incidentStatusTransitions: Readonly<Record<string, readonly string[]>> = {
  CANDIDATE: ['UNDER_REVIEW', 'ACTIVE_CONFIRMED', 'REJECTED'],
  UNDER_REVIEW: ['ACTIVE_CONFIRMED', 'REJECTED'],
  ACTIVE_CONFIRMED: ['MONITORING', 'EXTINGUISHED'],
  MONITORING: ['ACTIVE_CONFIRMED', 'EXTINGUISHED'],
  EXTINGUISHED: ['CLOSED'],
  CLOSED: [],
  SUSPENDED: [],
  REJECTED: [],
};

const verificationLabels: Readonly<Record<string, string>> = {
  VERIFIED: 'Vérifié',
  CORROBORATED: 'Recoupé',
  PENDING_REVIEW: 'À vérifier',
  UNVERIFIED: 'Non vérifié',
};

function statusLabel(value: string): string {
  return incidentStatuses.find(([status]) => status === value)?.[1]
    ?? value.toLocaleLowerCase('fr-FR').replaceAll('_', ' ');
}

function verificationLabel(value: string): string {
  return verificationLabels[value]
    ?? value.toLocaleLowerCase('fr-FR').replaceAll('_', ' ');
}

export function AdminIncidentDetailPage({ fireId }: { readonly fireId: string }) {
  const api = useAdminApi();
  const load = useCallback(
    (options: { signal?: AbortSignal }) => api.getIncident(fireId, options),
    [api, fireId],
  );
  const { state, reload } = useAdminQuery(load, [load]);
  const loadPublicationStatus = useCallback(
    (options: { signal?: AbortSignal }) => api.getIncidentPublicationStatus(fireId, options),
    [api, fireId],
  );
  const loadBulletinEntries = useCallback(
    (options: { signal?: AbortSignal }) => api.getIncidentBulletinEntries(fireId, options),
    [api, fireId],
  );
  const { state: publicationState, reload: reloadPublication } = useAdminQuery(loadPublicationStatus, [loadPublicationStatus]);
  const { state: bulletinEntriesState, reload: reloadBulletinEntries } = useAdminQuery(loadBulletinEntries, [loadBulletinEntries]);
  const mutation = useAdminMutation();
  const [status, setStatus] = useState('');
  const [publicNote, setPublicNote] = useState('');
  const [area, setArea] = useState('');
  const [evacuation, setEvacuation] = useState(false);
  const [evacuationBasis, setEvacuationBasis] = useState('');
  const [bulletinSource, setBulletinSource] = useState('');
  const [bulletinName, setBulletinName] = useState('');
  const [bulletinNote, setBulletinNote] = useState('');
  const [bulletinReason, setBulletinReason] = useState('');
  const [entryKind, setEntryKind] = useState<'fact' | 'timeline'>('fact');
  const [entryBody, setEntryBody] = useState('');
  const [entryEffectiveAt, setEntryEffectiveAt] = useState('');
  const [entryReason, setEntryReason] = useState('');
  const [retirementReason, setRetirementReason] = useState('');

  const readyIncident = state.kind === 'ready' ? state.data : null;
  const readyCurrent = readyIncident?.episodes.find((episode) => episode.is_current);
  useEffect(() => {
    setArea(
      readyCurrent?.estimated_area_ha === null
      || readyCurrent?.estimated_area_ha === undefined
        ? ''
        : String(readyCurrent.estimated_area_ha),
    );
    setEvacuation(readyCurrent?.evacuation_established ?? false);
    if (!readyCurrent?.evacuation_established) setEvacuationBasis('');
  }, [
    readyCurrent?.episode_id,
    readyCurrent?.estimated_area_ha,
    readyCurrent?.evacuation_established,
  ]);
  useEffect(() => {
    if (!readyIncident) return;
    setBulletinName(readyIncident.canonical_name ?? '');
    const firstActiveSource = readyIncident.sources.find((source) => source.enabled)?.source_key ?? '';
    setBulletinSource((currentSource) => currentSource || firstActiveSource);
  }, [readyIncident?.fire_id, readyIncident?.canonical_name, readyIncident?.sources]);

  if (state.kind === 'loading') {
    return <AdminLoadingState label="Chargement du dossier incident…" />;
  }
  if (state.kind === 'error') {
    return <AdminErrorState error={state.error} onRetry={reload} />;
  }

  const incident = state.data;
  const current = incident.episodes.find((episode) => episode.is_current);
  const hasSpatialMap = incident.models.some((model) => (
    (model.spatial_zone_id && model.spatial_zone_revision)
    || (model.asset_spatial_zone_id && model.asset_spatial_zone_revision)
  ));
  const activeSources = incident.sources.filter((source) => source.enabled);
  const sourcePreview = activeSources.slice(0, 3);
  const hasPendingObservations = incident.pending_observation_count > 0;
  const hasUrgentAction = incident.review_required || hasPendingObservations;
  const availableStatuses = incidentStatuses.filter(([value]) => (
    incidentStatusTransitions[current?.status ?? ''] ?? []
  ).includes(value));

  const transition = async () => {
    if (!current || !status) return;
    const selectedStatusLabel = statusLabel(status);
    const reason = `Statut défini manuellement sur « ${selectedStatusLabel} » depuis la fiche incident.`;
    const validationBasis = status === 'ACTIVE_CONFIRMED'
      ? `Confirmation explicite par l’opérateur depuis la fiche incident ; ${incident.sources.length} source(s) enregistrée(s) dans le dossier.`
      : undefined;
    const result = await mutation.run(
      `transition:${status}:${current.version}:${publicNote}`,
      (options) => api.transitionIncident(
        incident.fire_id,
        {
          target_status: status,
          expected_version: current.version,
          reason,
          ...(publicNote.trim() ? { public_note: publicNote.trim() } : {}),
          ...(validationBasis ? { validation_basis: validationBasis } : {}),
        },
        options,
      ),
    );
    if (result) {
      setStatus('');
      setPublicNote('');
      reload();
    }
  };

  const updateProfile = async () => {
    if (!current || (evacuation && evacuationBasis.trim().length === 0)) return;
    const parsedArea = area.trim() === '' ? null : Number(area);
    if (parsedArea !== null && (!Number.isFinite(parsedArea) || parsedArea < 0)) return;
    const result = await mutation.run(
      `profile:${current.version}:${parsedArea}:${evacuation}:${evacuationBasis}`,
      (options) => api.updateOperationalProfile(
        incident.fire_id,
        {
          expected_version: current.version,
          estimated_area_ha: parsedArea,
          evacuation_established: evacuation,
          ...(evacuation ? { evacuation_basis: evacuationBasis.trim() } : {}),
          reason: 'Informations opérationnelles mises à jour manuellement depuis la fiche incident.',
        },
        options,
      ),
    );
    if (result) reload();
  };

  const updateBulletin = async () => {
    if (!bulletinSource || bulletinReason.trim().length < 10) return;
    const result = await mutation.run(
      `bulletin:${incident.version}:${bulletinSource}:${bulletinName}:${bulletinNote}`,
      (options) => api.updateIncidentBulletin(
        incident.fire_id,
        {
          source_key: bulletinSource,
          expected_version: incident.version,
          ...(bulletinName.trim() ? { canonical_name: bulletinName.trim() } : {}),
          ...(bulletinNote.trim() ? { public_note: bulletinNote.trim() } : {}),
          reason: bulletinReason.trim(),
        },
        options,
      ),
    );
    if (result) {
      setBulletinReason('');
      reload();
      reloadPublication();
    }
  };

  const addBulletinEntry = async () => {
    if (!bulletinSource || !entryBody.trim() || !entryEffectiveAt || entryReason.trim().length < 10) return;
    const result = await mutation.run(
      `bulletin-entry:${entryKind}:${entryEffectiveAt}:${entryBody}:${entryReason}`,
      (options) => api.createIncidentBulletinEntry(
        incident.fire_id,
        {
          episode_id: current?.episode_id,
          source_key: bulletinSource,
          kind: entryKind,
          body: entryBody.trim(),
          effective_at: new Date(entryEffectiveAt).toISOString(),
          reason: entryReason.trim(),
        },
        options,
      ),
    );
    if (result) {
      setEntryBody('');
      setEntryEffectiveAt('');
      setEntryReason('');
      reload();
      reloadBulletinEntries();
    }
  };

  const retireBulletinEntry = async (entryId: string, version: number) => {
    if (retirementReason.trim().length < 10) return;
    const result = await mutation.run(
      `retire-bulletin-entry:${entryId}:${version}:${retirementReason}`,
      (options) => api.retireIncidentBulletinEntry(
        incident.fire_id,
        entryId,
        { expected_version: version, reason: retirementReason.trim() },
        options,
      ),
    );
    if (result) {
      setRetirementReason('');
      reload();
      reloadBulletinEntries();
    }
  };

  return (
    <section className="admin-incident-page" aria-label="Dossier incident">
      <AdminPageHeader
        title={incident.canonical_name ?? `Incident ${incident.territory_code}`}
        actions={<a className="button button--secondary" href="/admin/incidents">Retour aux incidents</a>}
      >
        <p>
          Incident <code>{incident.fire_id}</code> · territoire {incident.territory_code} · dernière observation{' '}
          {formatAdminDate(incident.last_observed_at)}
        </p>
      </AdminPageHeader>

      <section className="admin-section admin-incident-publication-registry" aria-labelledby="publication-registry-title">
        <header className="admin-section__heading">
          <div>
            <p className="admin-eyebrow">Publication explicite</p>
            <h2 id="publication-registry-title">Bulletin, galerie et spatial</h2>
            <p>Chaque domaine conserve son propre contrôle de publication. Le bulletin est le seul contenu éditable directement ici.</p>
          </div>
        </header>
        {publicationState.kind === 'loading' ? <p>Lecture des contrôles de publication…</p> : null}
        {publicationState.kind === 'error' ? <AdminErrorState error={publicationState.error} onRetry={reloadPublication} /> : null}
        {publicationState.kind === 'ready' ? (
          <div className="admin-publication-domains">
            {[publicationState.data.bulletin, publicationState.data.gallery, publicationState.data.spatial].map((domain) => (
              <article key={domain.domain} className="admin-publication-domain">
                <header>
                  <span className="admin-eyebrow">{domain.domain === 'bulletin' ? 'Bulletin public' : domain.domain === 'gallery' ? 'Galerie éditoriale' : 'Spatial / Unity'}</span>
                  <strong>{domain.state}</strong>
                </header>
                <p>{domain.preview_available ? 'Prévisualisation disponible.' : 'Aucune prévisualisation disponible.'}</p>
                <ul>
                  {domain.checks.map((check) => <li key={check.code}>{check.satisfied ? '✓' : '○'} {check.label}</li>)}
                </ul>
                {domain.blockers.length ? <p className="admin-publication-domain__blockers">{domain.blockers.join(' ')}</p> : null}
                {domain.domain === 'bulletin' ? <a className="button button--secondary" href="#bulletin-admin-editor">Modifier le bulletin</a> : <a className="button button--secondary" href={domain.destination}>Ouvrir la revue {domain.domain === 'gallery' ? 'éditoriale' : 'spatiale'}</a>}
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <section id="bulletin-admin-editor" className="admin-section admin-incident-bulletin-editor" aria-labelledby="bulletin-editor-title">
        <header className="admin-section__heading">
          <div>
            <p className="admin-eyebrow">Bulletin public</p>
            <h2 id="bulletin-editor-title">Aperçu et édition vérifiée</h2>
            <p>Une source active et un motif sont obligatoires. L’enregistrement met à jour la fiche publique immédiatement et crée une trace d’audit.</p>
          </div>
          {incident.visibility === 'PUBLIC' ? <a className="button button--secondary" href={`/incendie/${encodeURIComponent(incident.fire_id)}`} target="_blank" rel="noreferrer">Ouvrir la fiche publique</a> : null}
        </header>
        <div className="admin-incident-bulletin-editor__layout">
          <section className="admin-incident-bulletin-preview" aria-label="Aperçu du bulletin public">
            <p className="admin-eyebrow">Situation publiée</p>
            <h3>{incident.canonical_name ?? `Incident ${incident.fire_id}`}</h3>
            <p>{statusLabel(incident.status)} · {verificationLabel(incident.verification_state)} · dernière observation {formatAdminDate(incident.last_observed_at)}</p>
            <dl>
              {incident.estimated_area_ha !== null ? <div><dt>Surface estimée</dt><dd>{incident.estimated_area_ha.toLocaleString('fr-FR')} ha</dd></div> : null}
              {incident.evacuation_established ? <div><dt>Évacuation</dt><dd>Établie</dd></div> : null}
              <div><dt>Sources de recoupement</dt><dd>{incident.corroborating_source_count}</dd></div>
            </dl>
            {bulletinEntriesState.kind === 'ready' && bulletinEntriesState.data.entries.filter((entry) => entry.state === 'PUBLISHED').length ? <ul className="admin-incident-bulletin-preview__entries">{bulletinEntriesState.data.entries.filter((entry) => entry.state === 'PUBLISHED').map((entry) => <li key={entry.entry_id}><strong>{entry.kind === 'fact' ? 'Fait publié' : 'Évolution'}</strong><span>{entry.body}</span><small>{formatAdminDate(entry.effective_at)} · {entry.source_key}</small></li>)}</ul> : <p>Aucun fait ni élément d’évolution supplémentaire n’est publié.</p>}
          </section>
          <form className="admin-incident-bulletin-rail" onSubmit={(event) => { event.preventDefault(); void updateBulletin(); }}>
            <h3>Modifier le résumé</h3>
            <label>Source Admin existante<select value={bulletinSource} onChange={(event) => setBulletinSource(event.target.value)}><option value="">Choisir une source</option>{activeSources.map((source) => <option key={source.source_key} value={source.source_key}>Source — {source.display_name ?? source.public_display_name ?? source.source_key}</option>)}</select></label>
            <label>Nom public<input value={bulletinName} maxLength={255} onChange={(event) => setBulletinName(event.target.value)} /></label>
            <label>Résumé public<textarea rows={4} maxLength={500} value={bulletinNote} onChange={(event) => setBulletinNote(event.target.value)} /></label>
            <label>Motif de publication<textarea rows={2} maxLength={500} value={bulletinReason} onChange={(event) => setBulletinReason(event.target.value)} /></label>
            <button type="submit" className="button button--primary" disabled={mutation.state.pending || !bulletinSource || bulletinReason.trim().length < 10 || (!bulletinName.trim() && !bulletinNote.trim())}>Enregistrer et publier le bulletin</button>
          </form>
        </div>
      </section>

      <section className="admin-section admin-incident-bulletin-entries" aria-labelledby="bulletin-entry-title">
        <header className="admin-section__heading"><div><p className="admin-eyebrow">Faits et évolution</p><h2 id="bulletin-entry-title">Publications sourcées</h2><p>Les faits et éléments de chronologie sont distincts des sources, de la galerie et des sorties spatiales.</p></div></header>
        <div className="admin-detail-grid">
          <form className="admin-detail-card" onSubmit={(event) => { event.preventDefault(); void addBulletinEntry(); }}>
            <h3>Ajouter au bulletin</h3>
            <label>Type<select value={entryKind} onChange={(event) => setEntryKind(event.target.value as 'fact' | 'timeline')}><option value="fact">Fait publié</option><option value="timeline">Évolution</option></select></label>
            <label>Texte<textarea rows={3} maxLength={1000} value={entryBody} onChange={(event) => setEntryBody(event.target.value)} /></label>
            <label>Date effective<input type="datetime-local" value={entryEffectiveAt} onChange={(event) => setEntryEffectiveAt(event.target.value)} /></label>
            <label>Motif<textarea rows={2} maxLength={500} value={entryReason} onChange={(event) => setEntryReason(event.target.value)} /></label>
            <button type="submit" className="button button--secondary" disabled={mutation.state.pending || !bulletinSource || !entryBody.trim() || !entryEffectiveAt || entryReason.trim().length < 10}>Publier l’élément</button>
          </form>
          <section className="admin-detail-card"><h3>Éléments publiés et retirés</h3>{bulletinEntriesState.kind === 'loading' ? <p>Chargement…</p> : null}{bulletinEntriesState.kind === 'error' ? <AdminErrorState error={bulletinEntriesState.error} onRetry={reloadBulletinEntries} /> : null}{bulletinEntriesState.kind === 'ready' && !bulletinEntriesState.data.entries.length ? <p>Aucun élément de bulletin.</p> : null}{bulletinEntriesState.kind === 'ready' ? <><label>Motif de retrait<textarea rows={2} maxLength={500} value={retirementReason} onChange={(event) => setRetirementReason(event.target.value)} /></label>{bulletinEntriesState.data.entries.map((entry) => <div key={entry.entry_id} className="admin-bulletin-entry"><strong>{entry.kind === 'fact' ? 'Fait' : 'Évolution'} · {entry.state}</strong><p>{entry.body}</p><small>{formatAdminDate(entry.effective_at)} · source {entry.source_key}</small>{entry.state === 'PUBLISHED' ? <button type="button" className="button button--small" disabled={mutation.state.pending || retirementReason.trim().length < 10} onClick={() => void retireBulletinEntry(entry.entry_id, entry.version)}>Retirer avec motif</button> : <small>Retiré : {entry.retirement_reason}</small>}</div>)}</> : null}</section>
        </div>
      </section>

      <div className="admin-incident-cockpit">
        <section className="admin-incident-card" aria-labelledby="incident-situation-title">
          <header className="admin-incident-card__heading">
            <span className="admin-incident-card__icon"><PublicIcon name="flame" size={21} /></span>
            <div>
              <h3 id="incident-situation-title">Situation actuelle</h3>
              <p>Données opérationnelles connues à cet instant.</p>
            </div>
          </header>
          <div className="admin-incident-card__states">
            <span className="admin-state admin-state--neutral">{statusLabel(incident.status)}</span>
            <span className={`admin-state admin-state--${incident.verification_state === 'VERIFIED' ? 'success' : 'warning'}`}>
              {verificationLabel(incident.verification_state)}
            </span>
          </div>
          <dl className="admin-incident-card__facts">
            <div>
              <dt>Surface estimée</dt>
              <dd>{incident.estimated_area_ha === null ? 'Non renseignée' : `${incident.estimated_area_ha.toLocaleString('fr-FR')} ha`}</dd>
            </div>
            <div>
              <dt>Évacuation</dt>
              <dd>{incident.evacuation_established ? 'Établie' : 'Non établie'}</dd>
            </div>
            <div>
              <dt>Sources indépendantes</dt>
              <dd>{incident.corroborating_source_count}</dd>
            </div>
            <div>
              <dt>Dernière observation</dt>
              <dd>{formatAdminDate(incident.last_observed_at)}</dd>
            </div>
          </dl>
        </section>

        <section className="admin-incident-card" aria-labelledby="incident-map-title">
          <header className="admin-incident-card__heading">
            <span className="admin-incident-card__icon"><PublicIcon name="map" size={21} /></span>
            <div>
              <h3 id="incident-map-title">Carte</h3>
              <p>{hasSpatialMap ? 'Le fond 3D est lié à cet incident.' : 'Aucune carte 3D n’est encore liée à cet incident.'}</p>
            </div>
          </header>
          <div className={`admin-incident-card__availability ${hasSpatialMap ? 'is-ready' : 'is-missing'}`}>
            <PublicIcon name={hasSpatialMap ? 'check-circle' : 'info'} size={18} />
            <strong>{hasSpatialMap ? 'Carte disponible' : 'Carte à ajouter'}</strong>
          </div>
          <div className="admin-incident-card__actions">
            <a
              className="button button--primary"
              href={hasSpatialMap
                ? `/admin/incidents/${incident.fire_id}/revue-spatiale`
                : `/admin/incidents/${incident.fire_id}/carte/importer`}
            >
              {hasSpatialMap ? 'Ouvrir la carte' : 'Ajouter la carte 3D'}
            </a>
            {incident.visibility === 'PUBLIC' ? (
              <a className="button button--small" href={`/incendie/${encodeURIComponent(incident.fire_id)}`} target="_blank" rel="noreferrer">
                Voir la fiche publique
              </a>
            ) : null}
          </div>
        </section>

        <section className="admin-incident-card" aria-labelledby="incident-sources-title">
          <header className="admin-incident-card__heading">
            <span className="admin-incident-card__icon"><PublicIcon name="image" size={21} /></span>
            <div>
              <h3 id="incident-sources-title">Sources</h3>
              <p>{incident.sources.length} source{incident.sources.length !== 1 ? 's' : ''} liée{incident.sources.length !== 1 ? 's' : ''} · {incident.observations.length} observation{incident.observations.length !== 1 ? 's' : ''}.</p>
            </div>
          </header>
          {sourcePreview.length ? (
            <ul className="admin-incident-card__source-list">
              {sourcePreview.map((source) => (
                <li key={source.source_key}>
                  <PublicIcon name="check-circle" size={16} />
                  <span>{source.display_name ?? source.public_display_name ?? source.source_key}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="admin-incident-card__empty">Aucune source active disponible.</p>
          )}
          <div className="admin-incident-card__actions">
            <a className="button button--secondary" href={`/admin/incidents/${incident.fire_id}/sources-medias`}>
              Consulter les sources
            </a>
            <a className="button button--small" href={`/admin/incidents/${incident.fire_id}/galerie`}>
              Gérer la galerie
            </a>
          </div>
        </section>

        <section className={`admin-incident-card admin-incident-card--decision ${hasUrgentAction ? 'is-urgent' : 'is-steady'}`} aria-labelledby="incident-actions-title">
          <header className="admin-incident-card__heading">
            <span className="admin-incident-card__icon"><PublicIcon name={hasUrgentAction ? 'warning' : 'check-circle'} size={21} /></span>
            <div>
              <h3 id="incident-actions-title">Actions urgentes</h3>
              <p>
                {hasPendingObservations
                  ? `${incident.pending_observation_count} observation${incident.pending_observation_count > 1 ? 's attendent' : ' attend'} une décision humaine.`
                  : incident.review_required
                    ? 'La situation doit être vérifiée avant sa prochaine mise à jour.'
                    : 'Aucune action urgente n’est signalée.'}
              </p>
            </div>
          </header>
          {hasUrgentAction ? (
            <div className="admin-incident-card__actions">
              <a
                className="button button--primary"
                href={hasPendingObservations
                  ? `/admin/incidents/${incident.fire_id}/observations`
                  : `/admin/incidents/${incident.fire_id}/sources-medias`}
              >
                {hasPendingObservations ? 'Examiner les observations' : 'Vérifier les sources'}
              </a>
            </div>
          ) : (
            <div className="admin-incident-card__availability is-ready">
              <PublicIcon name="check-circle" size={18} />
              <strong>Suivi à jour</strong>
            </div>
          )}
        </section>
      </div>

      <details id="mettre-a-jour" className="admin-section admin-disclosure admin-incident-secondary">
        <summary>Mettre à jour la situation</summary>
        <div className="admin-detail-grid">
          <section className="admin-detail-card">
            <h3>Informations opérationnelles</h3>
            <label>
              Surface estimée (ha)
              <input
                type="number"
                min="0"
                step="0.1"
                value={area}
                onChange={(event) => setArea(event.target.value)}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={evacuation}
                onChange={(event) => setEvacuation(event.target.checked)}
              />{' '}
              Une évacuation est confirmée
            </label>
            {evacuation ? (
              <label>
                Source ou consigne confirmant l’évacuation
                <textarea
                  rows={2}
                  maxLength={1000}
                  value={evacuationBasis}
                  onChange={(event) => setEvacuationBasis(event.target.value)}
                />
              </label>
            ) : null}
            <button
              type="button"
              className="button button--secondary"
              disabled={mutation.state.pending || !current || (evacuation && !evacuationBasis.trim())}
              onClick={() => void updateProfile()}
            >
              Enregistrer la situation
            </button>
          </section>

          <section className="admin-detail-card">
            <h3>Changer le statut</h3>
            <label>
              Nouveau statut
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">Choisir</option>
                {availableStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>
              Note publique facultative
              <textarea rows={2} value={publicNote} maxLength={500} onChange={(event) => setPublicNote(event.target.value)} />
            </label>
            <button
              type="button"
              className="button button--primary"
              disabled={mutation.state.pending || !current || !status}
              onClick={() => void transition()}
            >
              Changer le statut
            </button>
            {!availableStatuses.length ? <p>Aucun changement de statut opérationnel n’est disponible.</p> : null}
          </section>
        </div>
      </details>

      <details id="history" className="admin-section admin-disclosure admin-incident-secondary">
        <summary>Historique et détails techniques</summary>
        <div className="admin-detail-grid">
          <section className="admin-detail-card">
            <h3>Épisodes</h3>
            {incident.episodes.map((episode) => (
              <div key={episode.episode_id}>
                <strong>{episode.episode_id}</strong> · {episode.status} · {episode.verification_state} · {episode.is_current ? 'courant' : 'historique'}
                <small>
                  {episode.corroborating_source_count} preuve(s) · dernière observation : {formatAdminDate(episode.last_observed_at)} · v{episode.version}
                </small>
              </div>
            ))}
          </section>

          <section className="admin-detail-card">
            <h3>Observations</h3>
            {incident.observations.length ? incident.observations.map((item) => (
              <div key={item.observation_id}>
                <strong>{item.observation_id}</strong> · {item.verification_state} · source {item.source_key}
                <small>{item.attached_episode_id ? `Rattachée à ${item.attached_episode_id}` : 'Non rattachée'}</small>
              </div>
            )) : <p>Aucune observation attachée.</p>}
          </section>

          <section className="admin-detail-card">
            <h3>Modèles et révisions</h3>
            {incident.models.length ? incident.models.map((model) => (
              <div key={model.revision}>
                <strong>Manifest v{model.revision}</strong> · épisode <code>{model.episode_id}</code> · {model.asset_state ?? 'sans asset'}
                <small>Asset : {model.asset_id ?? 'non associé'}{model.asset_version ? ` · version ${model.asset_version}` : ''}</small>
              </div>
            )) : <p>Aucune révision de modèle.</p>}
            <a className="button button--small" href={`/admin/incidents/${incident.fire_id}/modeles-pipeline`}>
              Ouvrir modèles et pipeline
            </a>
          </section>

          <section className="admin-detail-card">
            <h3>Audit</h3>
            {incident.audit.length ? incident.audit.map((event) => (
              <div key={event.event_id}>
                <strong>{event.action}</strong> · {event.actor_type}/{event.actor_id}
                <small>{formatAdminDate(event.occurred_at)} · {event.target_type} {event.target_id} · {event.reason}</small>
              </div>
            )) : <p>Aucun événement d’audit lié.</p>}
          </section>
        </div>
      </details>

      {mutation.state.error ? <AdminErrorState error={mutation.state.error} /> : null}
    </section>
  );
}
