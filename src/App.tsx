import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { FireWarningHomePage } from './components/public/FireWarningHomePage';
import { FireWarningIncidentsPage } from './components/public/FireWarningIncidentsPage';
import {
  FireWarningAddEvidencePage,
  FireWarningContributionTrackingPage,
  FireWarningIncidentErrorPage,
} from './components/public/FireWarningContributionPages';
import { PublicIncidentRealPage } from './components/public/PublicIncidentRealPage';
import {
  AccessibilityPage,
  AccountPage,
  AboutPage,
  LegalPage,
  OperationPage,
  PrivacyPage,
  SettingsPage,
} from './components/public/FireWarningBasicPages';
import { PublicSiteShell } from './components/public/FireWarningPublicShell';
import { PublicIcon, type PublicIconName } from './components/public/PublicIcon';
import { getDataMode, isAbortError, loadViewerManifest } from './lib/manifestClient';
import { loadPublicIncidentView, type PublicIncidentView } from './lib/publicIncidentView';
import { VIEWER_MANIFEST_FIRE_ID_RE, type ViewerManifestSummary } from './lib/viewerManifest';
import { resolveAppRoute } from './routing';

const AdminApp = lazy(() => import('./components/admin/AdminApp'));

const LIVE_REFRESH_INTERVAL_MS = 300_000;
const E2E_REFRESH_INTERVAL_MS = 100;

export interface AppProps {
  /** Injectable uniquement par les tests ; la production reste à cinq minutes. */
  refreshIntervalMs?: number;
}

type ManifestLoadResult = Awaited<ReturnType<typeof loadViewerManifest>>;
type PublicDetailRequest = Promise<{ readonly view: PublicIncidentView | null; readonly error: unknown | null }>;

type LiveManifestState =
  | { kind: 'loading' }
  | {
      kind: 'ready';
      result: ManifestLoadResult;
      stale: boolean;
      refreshing: boolean;
      refreshError: unknown | null;
      detailRequest: PublicDetailRequest;
    }
  | { kind: 'error'; error: unknown };

interface SafeError {
  readonly title: string;
  readonly description: string;
  readonly traceId: string | null;
}

function isValidFireId(value: string): boolean {
  return VIEWER_MANIFEST_FIRE_ID_RE.test(value);
}

function errorProperty(error: unknown, key: 'status' | 'kind' | 'traceId'): unknown {
  if (!error || typeof error !== 'object') return undefined;
  return (error as Record<string, unknown>)[key];
}

function toSafeError(error: unknown): SafeError {
  const status = errorProperty(error, 'status');
  const kind = errorProperty(error, 'kind');
  const traceId = errorProperty(error, 'traceId');
  const safeTraceId = typeof traceId === 'string' && traceId.length > 0 ? traceId : null;

  if (status === 404) return { title: 'Incident introuvable', description: 'Aucune fiche publique ne correspond à cet identifiant.', traceId: safeTraceId };
  if (status === 410) return { title: 'Incident retiré', description: 'Cet incident n’est plus publié par le service.', traceId: safeTraceId };
  if (status === 503) return { title: 'Service temporairement indisponible', description: 'La fiche ne peut pas être revalidée pour le moment.', traceId: safeTraceId };
  if (kind === 'timeout') return { title: 'Délai d’attente dépassé', description: 'Le service n’a pas répondu dans le délai autorisé.', traceId: safeTraceId };
  if (kind === 'network') return { title: 'Service inaccessible', description: 'La connexion au service de consultation est indisponible.', traceId: safeTraceId };
  if (kind === 'parse') return { title: 'Réponse non conforme', description: 'La fiche reçue ne respecte pas le contrat public attendu.', traceId: safeTraceId };
  if (kind === 'configuration' || status === 400) return { title: 'Identifiant ou configuration invalide', description: 'Cette fiche publique ne peut pas être demandée.', traceId: safeTraceId };
  return { title: 'Impossible de charger la fiche', description: 'Une erreur non détaillée a interrompu la consultation publique.', traceId: safeTraceId };
}

function ManifestLoadingScreen() {
  return (
    <PublicStateScreen
      icon="flame"
      eyebrow="Fiche incendie"
      title="Chargement de l’incident"
      description="Les dernières informations publiques sont en cours de récupération."
      loading
    />
  );
}

function PublicStateScreen({ icon, eyebrow, title, description, action, traceId, loading = false }: {
  readonly icon: PublicIconName;
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly action?: React.ReactNode;
  readonly traceId?: string | null;
  readonly loading?: boolean;
}) {
  return (
    <section className="fw-public-state" aria-labelledby="fw-public-state-title" role={loading ? 'status' : undefined} aria-live={loading ? 'polite' : undefined}>
      <div className="fw-page fw-public-state__inner">
        <span className="fw-public-state__icon"><PublicIcon name={icon} size={30} /></span>
        <p className="fw-public-state__eyebrow">{eyebrow}</p>
        <h1 id="fw-public-state-title">{title}</h1>
        <p className="fw-public-state__description">{description}</p>
        {traceId ? <p className="fw-public-state__trace">Code de suivi : <code>{traceId}</code></p> : null}
        {loading ? <span className="fw-public-state__progress" aria-hidden="true"><i /></span> : null}
        {action ? <div className="fw-public-state__action">{action}</div> : null}
      </div>
    </section>
  );
}

function ManifestErrorScreen({ error, onRetry }: { readonly error: unknown; readonly onRetry: () => void }) {
  const safeError = toSafeError(error);
  return (
    <PublicStateScreen
      icon="warning"
      eyebrow="Consultation interrompue"
      title={safeError.title}
      description={safeError.description}
      traceId={safeError.traceId}
      action={<button type="button" className="fw-button fw-button--primary" onClick={onRetry}>Réessayer <PublicIcon name="arrow" size={17} /></button>}
    />
  );
}

function EmptyIncidentPreview({ fireId }: { readonly fireId: string }) {
  const checkedAt = new Date().toISOString();
  const summary: ViewerManifestSummary = {
    schemaVersion: '2.0', fireId, episodeId: 'NON_PUBLIE', statusCode: 'SUSPENDED', validatedAt: null, reviewRequired: false,
    location: null, asset: null, scene: null, frame: null,
    freshness: { incident_at: '1970-01-01T00:00:00Z', terrain_source_year: null, generated_at: null },
    modelState: 'not_available', publicNotice: 'Cette instance locale ne publie aucune donnée d’incident.', sources: [], history: [], journal: [],
  };
  const demo: PublicIncidentView = {
    schema_version: '1.0', fire_id: fireId, canonical_name: 'Incident de démonstration', public_note: 'Scénario local complet destiné à vérifier la présentation d’une fiche publiée. Ces données sont synthétiques et ne décrivent pas un incident réel.', status: 'MONITORING', verification: 'verified', freshness_at: checkedAt, last_human_validation_at: checkedAt, participatory_observation_count: 18, participatory_published_count: 18, participatory_received_count: 24, location: null,
    facts: ['Scénario de démonstration locale.'], limitations: ['Les informations affichées ici sont synthétiques.', 'Aucune position, emprise ou carte réelle n’est associée à cette démonstration.'],
    episodes: [{ episode_id: 'E01', ordinal: 1, status: 'MONITORING', verification_state: 'VERIFIED', corroborating_source_count: 4, evidence_basis_at: checkedAt, estimated_area_ha: 286, evacuation_established: true, evacuation_people_count: 160, evacuation_locality: 'Hameau de démonstration', evacuation_authority: 'Préfecture', model_generation_eligible: true, review_required: false, started_at: '2026-07-20T06:20:00Z', last_observed_at: checkedAt, validated_at: checkedAt, ended_at: null, is_current: true, version: 1 }],
    observations: [], evidence_projections: [],
    official_resources: [{ resource_id: 'demo-safety', kind: 'safety', title: 'Consignes de sécurité — exemple', publisher: 'Source de démonstration', url: 'https://example.invalid/demo-safety', published_at: checkedAt, episode_id: 'E01' }, { resource_id: 'demo-update', kind: 'official_update', title: 'Point de situation — exemple', publisher: 'Source de démonstration', url: 'https://example.invalid/demo-update', published_at: checkedAt, episode_id: 'E01' }],
    operational_information: [
      { information_id: 'demo-evacuation', kind: 'evacuated_people', title: 'Personnes évacuées', value_text: null, value_number: 160, unit: 'personnes', locality: 'Hameau de démonstration', authority_kind: 'prefecture', authority_name: 'Préfecture de démonstration', source_url: 'https://example.invalid/demo-evacuation', effective_at: checkedAt, published_at: checkedAt, episode_id: 'E01' },
      { information_id: 'demo-mobilisation', kind: 'mobilized_personnel', title: 'Équipe mobilisée', value_text: null, value_number: 92, unit: 'personnes', locality: 'Secteur de démonstration', authority_kind: 'prefecture', authority_name: 'Préfecture de démonstration', source_url: 'https://example.invalid/demo-mobilisation', effective_at: checkedAt, published_at: checkedAt, episode_id: 'E01' },
      { information_id: 'demo-route', kind: 'road_status', title: 'Information routière', value_text: 'Accès temporairement restreint', value_number: null, unit: null, locality: 'Route de démonstration', authority_kind: 'police', authority_name: 'Police de démonstration', source_url: 'https://example.invalid/demo-route', effective_at: checkedAt, published_at: checkedAt, episode_id: 'E01' },
    ],
    sources: [{ source_id: 'demo-source-a', type: 'institutional', name: 'Source institutionnelle de démonstration', trust: 'institutional', license: null, external_reference: null, transformations: [], observation_count: 3 }, { source_id: 'demo-source-b', type: 'sensor', name: 'Capteur de démonstration', trust: 'partner', license: null, external_reference: null, transformations: [], observation_count: 1 }],
    timeline: [{ occurred_at: '2026-07-20T06:20:00Z', kind: 'incident', label: 'Incident référencé dans le scénario de démonstration.', episode_id: 'E01' }, { occurred_at: '2026-07-20T11:15:00Z', kind: 'observation', label: 'Premières observations synthétiques recoupées.', episode_id: 'E01' }, { occurred_at: '2026-07-21T08:10:00Z', kind: 'episode', label: 'Situation actualisée par le scénario local.', episode_id: 'E01' }, { occurred_at: checkedAt, kind: 'operational', label: 'Information routière : accès temporairement restreint.', episode_id: 'E01' }, { occurred_at: checkedAt, kind: 'observation', label: 'Validation humaine simulée pour la recette de l’interface.', episode_id: 'E01' }],
    model: { state: 'not_available', version: null, sha256: null, size_bytes: null, lod: null, terrain_source_year: null, generated_at: null, public_download_available: false, limitations: [] }, downloads: [],
  };
  return <PublicSiteShell section="incident"><div className="fw-incident-runtime"><div className="fw-incident-runtime__notice"><PublicIcon name="info" size={18} /><span>Mode local : scénario synthétique complet, séparé de toute publication réelle.</span></div><PublicIncidentRealPage summary={summary} checkedAt={checkedAt} stale refreshing={false} onRefresh={() => undefined} detailRequest={Promise.resolve({ view: demo, error: null })} emptyPreview /></div></PublicSiteShell>;
}

function SimulatedIncidentPreview() {
  const fireId = 'FR-SIM-00001';
  const checkedAt = new Date().toISOString();
  const summary: ViewerManifestSummary = {
    schemaVersion: '2.0', fireId, episodeId: 'SIM-01', statusCode: 'SUSPENDED', validatedAt: null, reviewRequired: false,
    location: null, asset: null, scene: null, frame: null,
    freshness: { incident_at: checkedAt, terrain_source_year: null, generated_at: checkedAt },
    modelState: 'not_available', publicNotice: 'Incident simulé : aucune donnée d’incendie réel, aucun rendu Omniverse et aucune carte ne sont publiés.', sources: [], history: [], journal: [],
  };
  const demo: PublicIncidentView = {
    schema_version: '1.0', fire_id: fireId, canonical_name: 'Incident simulé — secteur expérimental', public_note: 'Cette fiche est un scénario fictif conçu pour recevoir, plus tard, des productions Omniverse identifiées comme synthétiques. Elle ne décrit aucun incendie, lieu, autorité ou opération réelle.', status: 'SUSPENDED', verification: 'review_required', freshness_at: checkedAt, last_human_validation_at: null, location: null,
    facts: ['Scénario de démonstration synthétique.', 'Aucun lieu réel ni donnée d’intervention ne sont associés à cette fiche.'], limitations: ['Aucune production Omniverse n’est encore attachée.', 'Aucune carte, emprise, image, source officielle ou donnée opérationnelle n’est publiée.', 'Tout futur élément de simulation devra rester identifié comme synthétique.'],
    episodes: [{ episode_id: 'SIM-01', ordinal: 1, status: 'SUSPENDED', verification_state: 'REVIEW_REQUIRED', corroborating_source_count: 0, evidence_basis_at: null, estimated_area_ha: null, evacuation_established: false, evacuation_people_count: null, evacuation_locality: null, evacuation_authority: null, model_generation_eligible: false, review_required: true, started_at: checkedAt, last_observed_at: checkedAt, validated_at: null, ended_at: null, is_current: true, version: 1 }],
    observations: [], evidence_projections: [], official_resources: [], operational_information: [], sources: [],
    timeline: [{ occurred_at: checkedAt, kind: 'incident', label: 'Création du scénario synthétique de démonstration.', episode_id: 'SIM-01' }, { occurred_at: checkedAt, kind: 'observation', label: 'Aucune production Omniverse n’est encore publiée pour cette fiche.', episode_id: 'SIM-01' }],
    model: { state: 'not_available', version: null, sha256: null, size_bytes: null, lod: null, terrain_source_year: null, generated_at: null, public_download_available: false, limitations: ['Aucun modèle de démonstration n’est attaché.'] }, downloads: [],
  };
  return <PublicSiteShell section="incident"><div className="fw-incident-runtime"><div className="fw-incident-runtime__notice"><PublicIcon name="info" size={18} /><span>Démonstration : incident simulé, sans référence à un incendie réel.</span></div><PublicIncidentRealPage summary={summary} checkedAt={checkedAt} stale refreshing={false} onRefresh={() => undefined} detailRequest={Promise.resolve({ view: demo, error: null })} emptyPreview demoLabel="Incident simulé" /></div></PublicSiteShell>;
}

function PublicIncidentAddressRequiredScreen() {
  return (
    <PublicStateScreen
      icon="search"
      eyebrow="Recherche d’incident"
      title="Identifiant d’incident requis"
      description="Utilisez la recherche de l’accueil ou la liste des incendies en cours pour ouvrir une fiche."
      action={<a className="fw-button fw-button--primary" href="/incendies">Voir les incendies <PublicIcon name="arrow" size={17} /></a>}
    />
  );
}

function SimulatedDemoApp() {
  return <SimulatedIncidentPreview />;
}

function resolveRefreshInterval(explicitInterval?: number): number {
  if (typeof explicitInterval === 'number' && Number.isFinite(explicitInterval) && explicitInterval > 0) return explicitInterval;
  if (import.meta.env.DEV && import.meta.env.VITE_E2E_TEST_MODE === 'true') return E2E_REFRESH_INTERVAL_MS;
  return LIVE_REFRESH_INTERVAL_MS;
}

function LiveManifestApp({ fireId, refreshIntervalMs }: { readonly fireId: string; readonly refreshIntervalMs?: number }) {
  const refreshInterval = resolveRefreshInterval(refreshIntervalMs);
  const [state, setState] = useState<LiveManifestState>({ kind: 'loading' });
  const latestSuccessRef = useRef<ManifestLoadResult | null>(null);
  const requestRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (!isValidFireId(fireId)) {
      setState({ kind: 'error', error: { status: 400, kind: 'configuration' } });
      return;
    }
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    const previousResult = latestSuccessRef.current;
    // Start the independent, richer projection at the same time as the lightweight manifest.
    // Its failure must never prevent the manifest fallback from rendering.
    const detailRequest: PublicDetailRequest = loadPublicIncidentView(fireId, controller.signal)
      .then((view) => ({ view, error: null }))
      .catch((error: unknown) => ({ view: null, error }));
    if (previousResult) {
      setState((current) => ({
        kind: 'ready',
        result: previousResult,
        stale: current.kind === 'ready' ? current.stale : false,
        refreshing: true,
        refreshError: current.kind === 'ready' ? current.refreshError : null,
        detailRequest,
      }));
    } else {
      setState({ kind: 'loading' });
    }
    try {
      const result = await loadViewerManifest(fireId, { signal: controller.signal });
      if (controller.signal.aborted || requestRef.current !== requestId) return;
      latestSuccessRef.current = result;
      document.title = `Fire-Viewer — ${result.summary.fireId}`;
      setState({ kind: 'ready', result, stale: false, refreshing: false, refreshError: null, detailRequest });
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error) || requestRef.current !== requestId) return;
      if (previousResult) setState({ kind: 'ready', result: previousResult, stale: true, refreshing: false, refreshError: error, detailRequest });
      else setState({ kind: 'error', error });
    }
  }, [fireId]);

  useEffect(() => {
    void refresh();
    return () => controllerRef.current?.abort();
  }, [refresh]);

  useEffect(() => {
    const revalidateWhenVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const interval = window.setInterval(revalidateWhenVisible, refreshInterval);
    document.addEventListener('visibilitychange', revalidateWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', revalidateWhenVisible);
    };
  }, [refresh, refreshInterval]);

  if (state.kind === 'loading') return <PublicSiteShell section="incident"><ManifestLoadingScreen /></PublicSiteShell>;
  if (state.kind === 'error') return <PublicSiteShell section="incident"><ManifestErrorScreen error={state.error} onRetry={() => void refresh()} /></PublicSiteShell>;

  const safeRefreshError = state.refreshError ? toSafeError(state.refreshError) : null;
  return (
    <PublicSiteShell section="incident">
      <div className="fw-incident-runtime">
        <div className="fw-incident-runtime__notice"><PublicIcon name="shield" size={18} /><span>{state.result.summary.publicNotice}</span></div>
        {safeRefreshError ? (
          <div className="fw-incident-runtime__warning" role="status">
            <PublicIcon name="warning" size={18} />
            <span>{safeRefreshError.title}. Les données affichées sont le dernier manifeste validé.{safeRefreshError.traceId ? ` Code de suivi : ${safeRefreshError.traceId}.` : ''}</span>
          </div>
        ) : null}
        <PublicIncidentRealPage
          summary={state.result.summary}
          checkedAt={state.result.checkedAt}
          stale={state.stale}
          refreshing={state.refreshing}
          onRefresh={() => void refresh()}
          detailRequest={state.detailRequest}
        />
      </div>
    </PublicSiteShell>
  );
}

function PublicZoneRetiredScreen() {
  return (
    <PublicSiteShell section="home">
      <PublicStateScreen
        icon="map"
        eyebrow="Adresse retirée"
        title="Les zones techniques ne sont pas publiques"
        description="Chaque page publique correspond à un incendie unique. Les anciennes cartes par zone ne sont plus accessibles."
        action={<a className="fw-button fw-button--primary" href="/incendies">Voir les incendies <PublicIcon name="arrow" size={17} /></a>}
      />
    </PublicSiteShell>
  );
}

function PublicPage({ section }: { readonly section: Extract<ReturnType<typeof resolveAppRoute>, { kind: 'public-page' }>['section'] }) {
  const content = section === 'incidents' ? <FireWarningIncidentsPage />
    : section === 'account' ? <AccountPage />
        : section === 'settings' ? <SettingsPage />
          : section === 'operation' ? <OperationPage />
            : section === 'privacy' ? <PrivacyPage />
              : section === 'accessibility' ? <AccessibilityPage />
                : section === 'legal' ? <LegalPage /> : <AboutPage />;
  return <PublicSiteShell section={section}>{content}</PublicSiteShell>;
}

export default function App({ refreshIntervalMs }: AppProps) {
  const [route, setRoute] = useState(() => resolveAppRoute());
  useEffect(() => {
    const updateRoute = () => setRoute(resolveAppRoute());
    window.addEventListener('popstate', updateRoute);
    return () => window.removeEventListener('popstate', updateRoute);
  }, []);
  if (route.kind === 'admin') {
    return <Suspense fallback={<div className="admin-route-loading" role="status">Chargement de l’administration…</div>}><AdminApp route={route.adminRoute} /></Suspense>;
  }
  if (route.kind === 'public-demo') return <SimulatedDemoApp />;

  const publicContent = route.kind === 'public-zone-retired' ? <PublicZoneRetiredScreen />
    : route.kind === 'home' ? <PublicSiteShell section="home"><FireWarningHomePage /></PublicSiteShell>
      : route.kind === 'public-page' ? <PublicPage section={route.section} />
        : route.kind === 'public-add-evidence' ? <PublicSiteShell section="incident"><FireWarningAddEvidencePage fireId={route.fireId} /></PublicSiteShell>
          : route.kind === 'public-incident-report' ? <PublicSiteShell section="incident"><FireWarningIncidentErrorPage fireId={route.fireId} /></PublicSiteShell>
            : route.kind === 'public-contribution' ? <PublicSiteShell section="account"><FireWarningContributionTrackingPage contributionId={route.contributionId} /></PublicSiteShell>
              : route.kind === 'public-incident-address-required' ? <PublicSiteShell section="incident"><PublicIncidentAddressRequiredScreen /></PublicSiteShell>
                : getDataMode() !== 'api' ? <EmptyIncidentPreview fireId={route.fireId} />
                  : <LiveManifestApp fireId={route.fireId} refreshIntervalMs={refreshIntervalMs} />;

  return publicContent;
}
