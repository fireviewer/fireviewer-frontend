import { type ChangeEvent, type FormEvent, useCallback, useState } from 'react';
import { createAdminIdempotencyKey } from '../../lib/adminApi';
import {
  prepareSpatialPackage,
  uploadPreparedIncidentPerimeterPackage,
  uploadPreparedIncidentSpatialPackage,
  type PreparedSpatialPackage,
  type SpatialPackageUploadProgress,
} from '../../lib/spatialPackageUpload';
import { useAdminApi, useAdminQuery } from './AdminApiContext';
import { AdminErrorState, AdminLoadingState, AdminPageHeader } from './AdminPageState';

function formatBytes(value: number): string {
  if (value < 1_048_576) return `${(value / 1_024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Ko`;
  if (value < 1_073_741_824) return `${(value / 1_048_576).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
  return `${(value / 1_073_741_824).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} Go`;
}

function PackageSummary({ prepared }: { readonly prepared: PreparedSpatialPackage }) {
  return <dl className="admin-package-summary">
    <div><dt>Package</dt><dd><code>{prepared.packageId}</code></dd></div>
    <div><dt>Rôle</dt><dd>{prepared.role === 'omniverse_map' ? 'Carte Omniverse complète' : 'Périmètres USD temporels'}</dd></div>
    <div><dt>Carte détectée</dt><dd>{prepared.zoneId} · R{prepared.revision}</dd></div>
    {prepared.baseMapPackageId ? <div><dt>Carte de rattachement</dt><dd><code>{prepared.baseMapPackageId}</code></dd></div> : null}
    {prepared.stateCount ? <div><dt>États temporels</dt><dd>{prepared.stateCount}</dd></div> : null}
    <div><dt>Fichiers</dt><dd>{prepared.files.length.toLocaleString('fr-FR')}</dd></div>
    <div><dt>Poids</dt><dd>{formatBytes(prepared.totalSizeBytes)}</dd></div>
  </dl>;
}

function UploadProgress({ progress }: { readonly progress: SpatialPackageUploadProgress }) {
  return <div className="admin-upload-progress" aria-live="polite">
    <div><strong>{progress.phase === 'finalizing' ? 'Finalisation dans le projet' : `Envoi ${progress.fileIndex}/${progress.fileCount}`}</strong><span>{progress.currentPath ?? 'Contrôle et rattachement automatique'}</span></div>
    <progress max={100} value={progress.percentage}>{progress.percentage}%</progress>
    <small>{formatBytes(progress.uploadedBytes)} / {formatBytes(progress.totalSizeBytes)} · {progress.percentage}%</small>
  </div>;
}

export function AdminIncidentSpatialPackagePage({ fireId }: { readonly fireId: string }) {
  const api = useAdminApi();
  const load = useCallback(
    (options: { signal?: AbortSignal }) => api.getIncident(fireId, options),
    [api, fireId],
  );
  const { state, reload } = useAdminQuery(load, [load]);
  const [mapPrepared, setMapPrepared] = useState<PreparedSpatialPackage | null>(null);
  const [mapProgress, setMapProgress] = useState<SpatialPackageUploadProgress | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapImporting, setMapImporting] = useState(false);
  const [mapCompleted, setMapCompleted] = useState(false);
  const [perimeterPrepared, setPerimeterPrepared] = useState<PreparedSpatialPackage | null>(null);
  const [perimeterProgress, setPerimeterProgress] = useState<SpatialPackageUploadProgress | null>(null);
  const [perimeterError, setPerimeterError] = useState<string | null>(null);
  const [perimeterImporting, setPerimeterImporting] = useState(false);
  const [perimeterCompleted, setPerimeterCompleted] = useState(false);

  if (state.kind === 'loading') return <AdminLoadingState label="Chargement du projet incendie…" />;
  if (state.kind === 'error') return <AdminErrorState error={state.error} onRetry={reload} />;
  const incident = state.data;
  const currentSpatialModel = incident.models.find((model) => model.is_current && (model.spatial_zone_id || model.asset_spatial_zone_id))
    ?? incident.models.find((model) => model.spatial_zone_id || model.asset_spatial_zone_id);
  const mapZoneId = currentSpatialModel?.spatial_zone_id ?? currentSpatialModel?.asset_spatial_zone_id ?? null;
  const mapRevision = currentSpatialModel?.spatial_zone_revision ?? currentSpatialModel?.asset_spatial_zone_revision ?? null;
  const hasMap = Boolean(mapZoneId && mapRevision);

  async function chooseMap(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    setMapPrepared(null);
    setMapProgress(null);
    setMapCompleted(false);
    setMapError(null);
    try {
      if (input.files?.length) {
        const prepared = await prepareSpatialPackage(input.files);
        if (prepared.role !== 'omniverse_map') {
          throw new Error('Le premier upload attend la carte Omniverse complète avec map.usda et ses dépendances.');
        }
        setMapPrepared(prepared);
      }
    } catch (selectionError) {
      setMapError(selectionError instanceof Error ? selectionError.message : 'Le dossier de carte est invalide.');
    } finally {
      input.value = '';
    }
  }

  async function choosePerimeters(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    setPerimeterPrepared(null);
    setPerimeterProgress(null);
    setPerimeterCompleted(false);
    setPerimeterError(null);
    try {
      if (!mapZoneId || !mapRevision) throw new Error('La carte Omniverse doit être importée avant ses périmètres.');
      if (input.files?.length) {
        const prepared = await prepareSpatialPackage(input.files, mapZoneId, mapRevision);
        if (prepared.role !== 'omniverse_perimeter') {
          throw new Error('Le second upload attend le package USD temporel de périmètres.');
        }
        setPerimeterPrepared(prepared);
      }
    } catch (selectionError) {
      setPerimeterError(selectionError instanceof Error ? selectionError.message : 'Le dossier de périmètres est invalide.');
    } finally {
      input.value = '';
    }
  }

  async function importMap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mapPrepared) return;
    setMapImporting(true);
    setMapError(null);
    setMapProgress(null);
    try {
      await uploadPreparedIncidentSpatialPackage(
        api,
        incident.fire_id,
        incident.version,
        mapPrepared,
        `Import de la carte Omniverse complète du projet ${incident.fire_id}.`,
        createAdminIdempotencyKey(),
        setMapProgress,
      );
      setMapPrepared(null);
      setMapCompleted(true);
      reload();
    } catch (uploadError) {
      setMapError(uploadError instanceof Error ? uploadError.message : 'L’import de la carte Omniverse a échoué.');
    } finally {
      setMapImporting(false);
    }
  }

  async function importPerimeters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!perimeterPrepared) return;
    setPerimeterImporting(true);
    setPerimeterError(null);
    setPerimeterProgress(null);
    try {
      await uploadPreparedIncidentPerimeterPackage(
        api,
        incident.fire_id,
        incident.version,
        perimeterPrepared,
        `Rattachement du package USD temporel de périmètres au projet ${incident.fire_id}.`,
        createAdminIdempotencyKey(),
        setPerimeterProgress,
      );
      setPerimeterPrepared(null);
      setPerimeterCompleted(true);
    } catch (uploadError) {
      setPerimeterError(uploadError instanceof Error ? uploadError.message : 'L’import des périmètres a échoué.');
    } finally {
      setPerimeterImporting(false);
    }
  }

  return <section aria-labelledby="incident-map-import-title">
    <AdminPageHeader
      title="Importer la scène Omniverse"
      actions={<a className="button button--small" href={`/admin/incidents/${encodeURIComponent(fireId)}`}>Retour au projet</a>}
    >
      <p><strong>{incident.canonical_name ?? incident.fire_id}</strong> · la carte et ses périmètres restent deux packages indépendants.</p>
    </AdminPageHeader>

    {mapCompleted || hasMap ? <section className="admin-section admin-form-card--narrow">
      <h3>{mapCompleted ? 'Carte Omniverse importée' : 'Le projet possède déjà sa carte'}</h3>
      <p>La scène de base reste fixe. Les périmètres temporels sont rattachés séparément par identifiant, référentiel spatial et empreintes.</p>
      <a className="button button--primary" href={`/admin/incidents/${encodeURIComponent(fireId)}/revue-spatiale`}>Ouvrir la carte et les calques</a>
    </section> : <section className="admin-section">
      <h3 id="incident-map-import-title">1. Carte du site</h3>
      <p>Sélectionnez le dossier contenant <code>map.usda</code>, les assets, textures, payloads, manifestes et inventaires.</p>
      <form className="admin-form-card admin-form-card--narrow" onSubmit={(event) => void importMap(event)}>
        <label className="admin-file-field" htmlFor="incident-map-folder">
          <span>Choisir le dossier de carte Omniverse</span>
          <input id="incident-map-folder" type="file" multiple ref={(node) => { if (node) node.setAttribute('webkitdirectory', ''); }} onChange={(event) => void chooseMap(event)} disabled={mapImporting} />
          <small>Le dossier doit être autonome et conforme au contrat de carte actif.</small>
        </label>
        {mapPrepared ? <PackageSummary prepared={mapPrepared} /> : null}
        {mapProgress ? <UploadProgress progress={mapProgress} /> : null}
        {mapError ? <div className="admin-feedback admin-feedback--error" role="alert">{mapError}</div> : null}
        <button className="button button--primary" type="submit" disabled={!mapPrepared || mapImporting}>{mapImporting ? 'Import en cours…' : 'Importer la carte'}</button>
      </form>
    </section>}

    {hasMap ? <section className="admin-section">
      <h3>2. Périmètres temporels</h3>
      <p>Import séparé : le package ne modifie pas <code>map.usda</code> et doit cibler exactement la carte active.</p>
      <form className="admin-form-card admin-form-card--narrow" onSubmit={(event) => void importPerimeters(event)}>
        <label className="admin-file-field" htmlFor="incident-perimeter-folder">
          <span>Choisir le dossier des périmètres USD</span>
          <input id="incident-perimeter-folder" type="file" multiple ref={(node) => { if (node) node.setAttribute('webkitdirectory', ''); }} onChange={(event) => void choosePerimeters(event)} disabled={perimeterImporting} />
          <small>Le contrat doit référencer la carte {mapZoneId} · R{mapRevision} et conserver ses états successifs.</small>
        </label>
        {perimeterPrepared ? <PackageSummary prepared={perimeterPrepared} /> : null}
        {perimeterProgress ? <UploadProgress progress={perimeterProgress} /> : null}
        {perimeterCompleted ? <div className="admin-feedback admin-feedback--success" role="status">Package de périmètres vérifié et rattaché à la carte.</div> : null}
        {perimeterError ? <div className="admin-feedback admin-feedback--error" role="alert">{perimeterError}</div> : null}
        <button className="button button--primary" type="submit" disabled={!perimeterPrepared || perimeterImporting}>{perimeterImporting ? 'Import en cours…' : 'Rattacher les périmètres'}</button>
      </form>
    </section> : null}
  </section>;
}
