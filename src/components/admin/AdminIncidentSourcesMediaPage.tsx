import { useCallback, useEffect, useState } from 'react';
import type { AdminAgentOperationType, AdminIncidentSourcesMediaWorkspace } from '../../lib/adminApi';
import { uploadIncidentDailySatellitePackage } from '../../lib/dailySatelliteUpload';
import { useAdminApi, useAdminMutation, useAdminQuery } from './AdminApiContext';
import { AdminEmptyState, AdminErrorState, AdminLoadingState, AdminMutationFeedback, AdminPageHeader, AdminStateLabel, formatAdminDate } from './AdminPageState';
import { AdminIncidentWorkspaceNav } from './AdminIncidentWorkspaceNav';

function externalHref(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

const ANALYSIS_LABELS: Record<AdminAgentOperationType, { title: string; detail: string }> = {
  user_media: { title: 'Analyser les fichiers reçus', detail: 'Photos, vidéos et audios transmis avec consentement.' },
  source_research: { title: 'Rechercher et analyser les sources publiques', detail: 'Recherche bornée à la coupure de la fenêtre sélectionnée.' },
  satellite_media: { title: 'Analyser les images satellites', detail: 'Produits satellite, points chauds et vues thermiques disponibles.' },
};

function elapsedLabel(value: string | null, now: number): string {
  if (!value) return 'Jamais lancé';
  const elapsedSeconds = Math.max(0, Math.floor((now - Date.parse(value)) / 1_000));
  if (elapsedSeconds < 60) return `Il y a ${elapsedSeconds} s`;
  if (elapsedSeconds < 3_600) return `Il y a ${Math.floor(elapsedSeconds / 60)} min ${elapsedSeconds % 60} s`;
  if (elapsedSeconds < 86_400) return `Il y a ${Math.floor(elapsedSeconds / 3_600)} h ${Math.floor((elapsedSeconds % 3_600) / 60)} min`;
  return `Il y a ${Math.floor(elapsedSeconds / 86_400)} j`;
}

function SourceEditor({ source, onSave, pending }: {
  readonly source: AdminIncidentSourcesMediaWorkspace['sources'][number];
  readonly onSave: (sourceKey: string, input: { type: string; trust: string; display_name: string | null; public_display_name: string | null; public_license: string | null; public_reference_url: string | null; public_transformations: readonly string[]; enabled: boolean; reason: string }) => void;
  readonly pending: boolean;
}) {
  const [publicName, setPublicName] = useState(source.public_display_name ?? '');
  const [trust, setTrust] = useState(source.trust);
  const [enabled, setEnabled] = useState(source.enabled);
  const hasChanges = publicName.trim() !== (source.public_display_name ?? '')
    || trust !== source.trust
    || enabled !== source.enabled;
  return (
    <details className="admin-source-editor">
      <summary>Modifier l’affichage de cette source</summary>
      <div className="admin-source-editor__grid">
        <label className="admin-field"><span>Niveau de confiance</span><select value={trust} onChange={(event) => setTrust(event.currentTarget.value)}><option value="unverified">Non vérifiée</option><option value="partner">Partenaire</option><option value="institutional">Institutionnelle</option><option value="operator">Opérateur terrain</option></select></label>
        <label className="admin-field"><span>Nom affiché au public</span><input value={publicName} maxLength={255} onChange={(event) => setPublicName(event.currentTarget.value)} placeholder={source.display_name ?? source.source_key} /></label>
        <label className="admin-source-editor__enabled"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.currentTarget.checked)} /> Utiliser cette source</label>
      </div>
      <button type="button" className="button button--primary" disabled={pending || !hasChanges} onClick={() => onSave(source.source_key, {
        type: source.type,
        trust,
        display_name: source.display_name,
        public_display_name: publicName.trim() || null,
        public_license: source.public_license,
        public_reference_url: source.public_reference_url,
        public_transformations: source.public_transformations,
        enabled,
        reason: 'Registre source mis à jour manuellement depuis la fiche incident.',
      })}>Enregistrer</button>
    </details>
  );
}

/** Sources réellement liées au dossier et métadonnées de preuve, sans média binaire. */
export function AdminIncidentSourcesMediaPage({ fireId }: { readonly fireId: string }) {
  const api = useAdminApi();
  const load = useCallback((options: { signal?: AbortSignal }) => api.getIncidentSourcesMedia(fireId, options), [api, fireId]);
  const loadOperations = useCallback((options: { signal?: AbortSignal }) => api.getIncidentAgentOperations(fireId, options), [api, fireId]);
  const { state, reload } = useAdminQuery(load, [load]);
  const { state: operations, reload: reloadOperations } = useAdminQuery(loadOperations, [loadOperations]);
  const mutation = useAdminMutation();
  const analysisMutation = useAdminMutation();
  const satelliteUploadMutation = useAdminMutation();
  const clearSatelliteUploadMutation = satelliteUploadMutation.clear;
  const [updated, setUpdated] = useState<string | null>(null);
  const [launched, setLaunched] = useState<{ type: AdminAgentOperationType; files: number } | null>(null);
  const [satelliteFiles, setSatelliteFiles] = useState<readonly File[]>([]);
  const [satelliteProgress, setSatelliteProgress] = useState(0);
  const [satelliteUploadResult, setSatelliteUploadResult] = useState<{
    readonly products: number;
    readonly batches: number;
  } | null>(null);
  const [selectedAnalysisWindowId, setSelectedAnalysisWindowId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const availableWindows = operations.kind === 'ready' ? operations.data.available_windows : [];
  const selectedWindow = operations.kind === 'ready'
    ? availableWindows.find((window) => window.analysis_window_id === selectedAnalysisWindowId) ?? availableWindows[0]
    : null;
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (selectedWindow && selectedAnalysisWindowId !== selectedWindow.analysis_window_id) {
      setSelectedAnalysisWindowId(selectedWindow.analysis_window_id);
    }
  }, [selectedAnalysisWindowId, selectedWindow]);
  useEffect(() => {
    setSatelliteFiles([]);
    setSatelliteProgress(0);
    setSatelliteUploadResult(null);
    clearSatelliteUploadMutation();
  }, [clearSatelliteUploadMutation, selectedWindow?.analysis_window_id]);
  const updateSource = async (sourceKey: string, input: Parameters<typeof api.updateSource>[1]) => {
    const result = await mutation.run(`source:${sourceKey}:${JSON.stringify(input)}`, (options) => api.updateSource(sourceKey, input, options));
    if (result !== null) { setUpdated(sourceKey); reload(); }
  };
  const runAnalysis = async (type: AdminAgentOperationType) => {
    if (operations.kind !== 'ready' || !selectedWindow) return;
    const result = await analysisMutation.run(`analysis:${fireId}:${selectedWindow.analysis_window_id}:${type}`, (options) => api.runIncidentAgentOperation(fireId, type, selectedWindow.analysis_window_id, options));
    if (result !== null) {
      setLaunched({ type, files: result.queued_files });
      reloadOperations();
    }
  };
  const uploadDailySatelliteProducts = async () => {
    if (operations.kind !== 'ready' || !selectedWindow || satelliteFiles.length === 0) return;
    setSatelliteProgress(0);
    setSatelliteUploadResult(null);
    const fingerprint = satelliteFiles
      .map((file) => `${file.name}:${file.size}:${file.lastModified}`)
      .sort()
      .join('|');
    const result = await satelliteUploadMutation.run(
      `daily-satellite:${fireId}:${selectedWindow.analysis_window_id}:${fingerprint}`,
      (options) => uploadIncidentDailySatellitePackage({
        api,
        fireId,
        expectedAnalysisWindowId: selectedWindow.analysis_window_id,
        files: satelliteFiles,
        requestOptions: options,
        onProgress: setSatelliteProgress,
      }),
    );
    if (result !== null) {
      setSatelliteUploadResult({
        products: Math.max(0, result.item_count - 1),
        batches: result.batch_ids.length,
      });
      setSatelliteFiles([]);
      setSatelliteProgress(100);
      reloadOperations();
    }
  };

  if (state.kind === 'loading') return <AdminLoadingState label="Chargement des sources et médias…" />;
  if (state.kind === 'error') return <AdminErrorState error={state.error} onRetry={reload} />;
  return (
    <section aria-labelledby="admin-incident-sources-title">
      <AdminPageHeader title="Sources et médias"><p>Registre des sources utilisées par <code>{fireId}</code> et inventaire de preuves. Aucun média brut, contributeur, trace ou fichier privé n’est rendu dans cette surface.</p></AdminPageHeader>
      <AdminIncidentWorkspaceNav fireId={fireId} active="sources-media" />
      <section className="admin-section" aria-labelledby="admin-agent-operations-title">
        <div className="admin-section__heading"><div><h3 id="admin-agent-operations-title">Lancer les analyses</h3><p>Chaque bouton envoie uniquement les lots privés déjà prêts et autorisés. Aucun résultat n’est publié sans validation humaine.</p></div></div>
        {operations.kind === 'loading' ? <AdminLoadingState label="Lecture des analyses disponibles…" /> : null}
        {operations.kind === 'error' ? <AdminErrorState error={operations.error} onRetry={reloadOperations} /> : null}
        {operations.kind === 'ready' && selectedWindow ? <><p><strong>Fenêtre préparée :</strong> {new Date(`${selectedWindow.local_date}T12:00:00`).toLocaleDateString('fr-FR')} · état {selectedWindow.campaign_day_state ?? 'courant'}</p>
          {availableWindows.length > 1 ? <label className="admin-field"><span>Fenêtre de la campagne</span><select value={selectedWindow.analysis_window_id} onChange={(event) => setSelectedAnalysisWindowId(event.currentTarget.value)} disabled={analysisMutation.state.pending || satelliteUploadMutation.state.pending}>{availableWindows.map((window) => <option key={window.analysis_window_id} value={window.analysis_window_id}>{new Date(`${window.local_date}T12:00:00`).toLocaleDateString('fr-FR')} · {window.campaign_day_state ?? 'courant'}</option>)}</select><small>La liste provient du manifeste préparé ; aucune date n’est saisie ici.</small></label> : null}
          {selectedWindow.actions.some((action) => action.operation_type === 'satellite_media' && action.schedule_state === 'required') ? <article className="admin-analysis-action" aria-labelledby="admin-daily-satellite-upload-title">
            <div>
              <h4 id="admin-daily-satellite-upload-title">Ajouter les produits de la journée</h4>
              <p>Choisissez le manifeste préparé avec ses images satellite, vues thermiques ou points chauds. La journée et les métadonnées sont vérifiées automatiquement.</p>
            </div>
            <label className="admin-field">
              <span>Fichiers du lot quotidien</span>
              <input
                type="file"
                multiple
                accept=".json,.geojson,.png,.jpg,.jpeg,.tif,.tiff,application/json,image/png,image/jpeg,image/tiff"
                disabled={satelliteUploadMutation.state.pending}
                onChange={(event) => {
                  setSatelliteFiles(Array.from(event.currentTarget.files ?? []));
                  setSatelliteProgress(0);
                  setSatelliteUploadResult(null);
                  satelliteUploadMutation.clear();
                }}
              />
            </label>
            <div className="admin-analysis-action__footer">
              <span>{satelliteFiles.length ? `${satelliteFiles.length} fichier${satelliteFiles.length > 1 ? 's' : ''} sélectionné${satelliteFiles.length > 1 ? 's' : ''}${satelliteUploadMutation.state.pending ? ` · ${satelliteProgress} %` : ''}` : 'Aucun lot sélectionné'}</span>
              <button type="button" className="button button--primary" disabled={satelliteUploadMutation.state.pending || satelliteFiles.length < 2} onClick={() => void uploadDailySatelliteProducts()}>
                {satelliteUploadMutation.state.pending ? 'Envoi privé en cours…' : 'Ajouter à cette fenêtre'}
              </button>
            </div>
            <AdminMutationFeedback
              error={satelliteUploadMutation.state.error}
              succeeded={satelliteUploadMutation.state.succeeded}
              success={satelliteUploadResult ? `${satelliteUploadResult.products} produit${satelliteUploadResult.products > 1 ? 's' : ''} ajouté${satelliteUploadResult.products > 1 ? 's' : ''} dans ${satelliteUploadResult.batches} lot${satelliteUploadResult.batches > 1 ? 's' : ''} privé${satelliteUploadResult.batches > 1 ? 's' : ''}.` : 'Produits ajoutés à cette fenêtre.'}
            />
          </article> : null}
          <div className="admin-analysis-actions">{selectedWindow.actions.map((action) => {
          const label = ANALYSIS_LABELS[action.operation_type];
          const unavailable = action.blocked_reason === 'operation_declared_absent'
            ? 'Absence déclarée'
            : action.blocked_reason === 'operation_not_scheduled'
              ? 'Non prévu pour cette fenêtre'
              : action.blocked_reason === 'dispatch_disabled'
            ? 'Déclenchement désactivé'
            : action.blocked_reason === 'already_running'
              ? 'Déjà en cours'
              : action.blocked_reason === 'already_completed'
                ? 'Analyse terminée'
              : action.blocked_reason === 'research_disabled'
                ? 'Recherche désactivée'
                : 'Entrée non disponible';
          return <article className="admin-analysis-action" key={action.operation_type}>
            <div><h4>{label.title}</h4><p>{label.detail}</p><small>Contrat : {action.schedule_state === 'required' ? 'opération prévue' : action.schedule_state === 'declared_absent' ? 'absence déclarée' : 'hors fenêtre'}</small></div>
            <dl>
              <div><dt>Fichiers à traiter</dt><dd>{action.pending_files}</dd></div>
              <div><dt>Analyses à traiter</dt><dd>{action.pending_analyses}</dd></div>
              <div><dt>En cours</dt><dd>{action.running_analyses}</dd></div>
            </dl>
            <div className="admin-analysis-action__footer">
              <span>{elapsedLabel(action.last_run_at, now)}</span>
              <button type="button" className="button button--primary" disabled={analysisMutation.state.pending || !action.can_run} onClick={() => void runAnalysis(action.operation_type)}>{action.can_run ? label.title : unavailable}</button>
            </div>
          </article>;
        })}</div></> : null}
        <AdminMutationFeedback error={analysisMutation.state.error} succeeded={analysisMutation.state.succeeded} success={launched ? `${launched.files} fichier${launched.files > 1 ? 's' : ''} envoyé${launched.files > 1 ? 's' : ''} pour l’analyse « ${ANALYSIS_LABELS[launched.type].title} ».` : 'Analyse lancée.'} />
      </section>
      <section className="admin-section" aria-labelledby="admin-incident-sources-title">
        <div className="admin-section__heading"><div><h3 id="admin-incident-sources-title">Sources liées</h3><p>Les modifications concernent le registre global de la source et produisent un audit. Les secrets d’ingestion ne sont jamais affichés ni modifiables ici.</p></div></div>
        {state.data.sources.length ? <div className="admin-source-list">{state.data.sources.map((source) => <article className="admin-source-record" key={source.source_key}><header><div><h3>{source.display_name ?? source.source_key}</h3><p><code>{source.source_key}</code> · {source.type} · {source.trust} · {source.observation_count} observation{source.observation_count > 1 ? 's' : ''}</p></div><AdminStateLabel value={source.enabled ? 'ENABLED' : 'DISABLED'} /></header><dl><div><dt>Nom public</dt><dd>{source.public_display_name ?? 'Non publié'}</dd></div><div><dt>Licence publique</dt><dd>{source.public_license ?? 'Non déclarée'}</dd></div><div><dt>Référence publique</dt><dd>{externalHref(source.public_reference_url) ? <a href={externalHref(source.public_reference_url)!} target="_blank" rel="noreferrer">Ouvrir la référence</a> : 'Non déclarée ou URL non exploitable'}</dd></div><div><dt>Transformations</dt><dd>{source.public_transformations.length ? source.public_transformations.join(' · ') : 'Aucune déclarée'}</dd></div></dl><SourceEditor source={source} pending={mutation.state.pending} onSave={(sourceKey, input) => void updateSource(sourceKey, input)} /></article>)}</div> : <AdminEmptyState title="Aucune source liée">Aucune observation ne relie actuellement une source à cet incident.</AdminEmptyState>}
      </section>
      <section className="admin-section" aria-labelledby="admin-incident-media-title"><div className="admin-section__heading"><div><h3 id="admin-incident-media-title">Références de preuve</h3><p>Inventaire métadonné, sans aperçu binaire ni données de contributeur.</p></div></div>{state.data.media_references.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Observation</th><th>Source / type</th><th>État</th><th>Preuve</th><th>Référence</th></tr></thead><tbody>{state.data.media_references.map((media) => <tr key={media.observation_id}><th scope="row"><code>{media.observation_id}</code><small>{formatAdminDate(media.observed_at)} · reçue {formatAdminDate(media.received_at)}</small></th><td>{media.source_key}<small>{media.source_type}</small></td><td><AdminStateLabel value={media.verification_state} /></td><td><code>{media.evidence_hash}</code><small>{media.evidence_license}</small></td><td>{externalHref(media.external_reference) ? <a href={externalHref(media.external_reference)!} target="_blank" rel="noreferrer">Référence externe</a> : 'Aucune référence ouvrable'}</td></tr>)}</tbody></table></div> : <AdminEmptyState title="Aucune référence de preuve">Aucune métadonnée de preuve n’est liée à cet incident.</AdminEmptyState>}</section>
      <AdminMutationFeedback error={mutation.state.error} succeeded={mutation.state.succeeded} success={updated ? `Registre de source mis à jour : ${updated}.` : 'Registre de source mis à jour.'} />
    </section>
  );
}
