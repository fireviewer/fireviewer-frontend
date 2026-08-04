// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { PublicIncidentRealPage } from './PublicIncidentRealPage';
import type { PublicIncidentView } from '../../lib/publicIncidentView';
import type { ViewerManifestSummary } from '../../lib/viewerManifest';
import { loadPublicIncidentEventTimeline, type PublicIncidentEventTimeline } from '../../lib/publicEventTimeline';

vi.mock('./TiledSpatialScene3D', () => ({ TiledSpatialScene3D: ({ viewPreset, overlayWgs84Points = [], overlayWgs84Lines = [], overlayWgs84Polygons = [], overlayFocusWgs84 }: { readonly viewPreset: string; readonly overlayWgs84Points?: readonly unknown[]; readonly overlayWgs84Lines?: readonly unknown[]; readonly overlayWgs84Polygons?: readonly { readonly color: string; readonly elevation?: number; readonly renderOrder?: number }[]; readonly overlayFocusWgs84?: readonly [number, number] }) => <div data-testid="tiled-scene-preset" data-event-points={overlayWgs84Points.length} data-event-lines={overlayWgs84Lines.length} data-polygon-layers={overlayWgs84Polygons.map((item) => `${item.color}:${item.elevation ?? 4}:${item.renderOrder ?? 18}`).join(',')} data-overlay-focus={overlayFocusWgs84?.join(',') ?? ''}>Preset {viewPreset}</div> }));
vi.mock('../../lib/publicSpatialScene', () => ({ loadPublicSpatialScene: vi.fn() }));
vi.mock('../../lib/manifestClient', () => ({ getViewerManifestApiOrigin: () => 'https://api.firewarning.test' }));
vi.mock('../../lib/publicEventTimeline', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../lib/publicEventTimeline')>(),
  loadPublicIncidentEventTimeline: vi.fn(),
}));

const summary: ViewerManifestSummary = { schemaVersion: '2.0', fireId: 'FR-83-00042', episodeId: 'E01', statusCode: 'MONITORING', validatedAt: null, reviewRequired: false, location: null, asset: null, scene: null, frame: null, freshness: { incident_at: '2026-07-15T10:00:00Z', terrain_source_year: null, generated_at: null }, modelState: 'not_available', publicNotice: 'Notice publique.', sources: [], history: [], journal: [] };
const view: PublicIncidentView = { schema_version: '1.0', fire_id: 'FR-83-00042', canonical_name: 'Massif test', public_note: null, status: 'MONITORING', verification: 'verified', freshness_at: '2026-07-15T10:00:00Z', last_human_validation_at: '2026-07-15T10:02:00Z', location: null, facts: ['Observation validée.'], limitations: ['Donnée datée.'], episodes: [{ episode_id: 'E01', ordinal: 1, status: 'MONITORING', verification_state: 'VERIFIED', corroborating_source_count: 1, evidence_basis_at: '2026-07-15T10:00:00Z', estimated_area_ha: 12, evacuation_established: false, model_generation_eligible: true, review_required: false, started_at: '2026-07-15T09:00:00Z', last_observed_at: '2026-07-15T10:00:00Z', validated_at: '2026-07-15T10:02:00Z', ended_at: null, is_current: true, version: 1 }], observations: [{ observation_id: 'O-1', episode_id: 'E01', type: 'institutional', observed_at: '2026-07-15T10:00:00Z', received_at: '2026-07-15T10:01:00Z', uncertainty_m: 250, area_label: 'Massif test', verification_state: 'VERIFIED', spatial_mode: 'WITHHELD' }], evidence_projections: [{ projection_id: 'P-1', episode_id: 'E01', kind: 'validated_marker', verification_state: 'VERIFIED', center: { coordinates: [6.1, 43.2], horizontal_uncertainty_m: 25 }, radius_m: 25, label: 'Image utilisateur validée', observed_at: '2026-07-15T10:00:00Z' }], sources: [], timeline: [{ occurred_at: '2026-07-15T10:00:00Z', kind: 'observation', label: 'Observation validée', episode_id: 'E01' }], model: { state: 'not_available', version: null, sha256: null, size_bytes: null, lod: null, terrain_source_year: null, generated_at: null, public_download_available: false, limitations: [] }, downloads: [] };
const eventTimeline: PublicIncidentEventTimeline = {
  incident_id: 'FR-83-00042',
  revision: 2,
  events: [{
    event_id: 'FAE-1', state: 'EDITOR_PUBLISHED', phenomenon_kind: 'active_fire', observed_start_at: '2026-07-15T10:00:00Z', observed_end_at: null,
    geometry: { type: 'Point', coordinates: [6.1, 43.2] },
    uncertainty: { type: 'Polygon', coordinates: [[[6.09, 43.19], [6.11, 43.19], [6.11, 43.21], [6.09, 43.19]]] },
    method: 'triangulation', publication_revision: 1,
  }, {
    event_id: 'FAE-2', state: 'EDITOR_PUBLISHED', phenomenon_kind: 'visible_front', observed_start_at: '2026-07-15T11:00:00Z', observed_end_at: null,
    geometry: { type: 'LineString', coordinates: [[6.12, 43.2], [6.13, 43.21]] },
    uncertainty: { type: 'Polygon', coordinates: [
      [[6.11, 43.19], [6.14, 43.19], [6.14, 43.22], [6.11, 43.22], [6.11, 43.19]],
      [[6.12, 43.2], [6.13, 43.2], [6.13, 43.21], [6.12, 43.21], [6.12, 43.2]],
    ] },
    method: 'terrain_raycast', publication_revision: 2,
  }],
};
afterEach(() => { cleanup(); localStorage.clear(); vi.mocked(loadPublicIncidentEventTimeline).mockReset(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });
function renderPage(pageSummary: ViewerManifestSummary = summary) { return render(<PublicIncidentRealPage summary={pageSummary} checkedAt="2026-07-15T10:00:00Z" stale={false} refreshing={false} onRefresh={vi.fn()} detailRequest={Promise.resolve({ view, error: null })} />); }

function spatialDay(localDate: string, analysisId: string): NonNullable<PublicIncidentView['daily_intelligence']>[number] {
  return {
    analysis_id: analysisId,
    episode_id: 'E01',
    local_date: localDate,
    published_at: `${localDate}T12:00:00Z`,
    report: { report_revision_id: `REPORT-${analysisId}`, revision: 1, title: `Situation ${localDate}`, body_markdown: 'Synthèse contrôlée.', reviewed_at: `${localDate}T11:00:00Z` },
    facts: [],
    spatial_results: [],
  };
}

it('ouvre un bulletin continu sans charger de scène 3D', async () => {
  const user = userEvent.setup();
  renderPage();
  expect(await screen.findByRole('heading', { name: 'Massif test', level: 1 })).toBeVisible();
  expect(screen.getByRole('heading', { name: /Situation au/ })).toBeVisible();
  const metricsSummary = screen.getByText('Repères de l’incident').closest('summary');
  if (!metricsSummary) throw new Error('Repères de l’incident doit être dépliable.');
  await user.click(metricsSummary);
  expect(screen.getByText('Surface estimée')).toBeVisible();
  expect(screen.queryByTestId('tiled-scene-preset')).not.toBeInTheDocument();
});

it('charge la scène seulement après la vue carte puis l’action explicite', async () => {
  const user = userEvent.setup();
  const tiledSummary: ViewerManifestSummary = { ...summary, scene: { package_id: 'test', catalog_url: '/scene/catalog', files: [{ file_id: 1, path: 'terrain.tif', kind: 'COG', url: '/scene/1', sha256: 'a'.repeat(64), size_bytes: 2048, media_type: 'image/tiff' }] }, frame: { origin_wgs84: [5.37, 44.75, 454.2], local_frame: 'ENU', meters_per_unit: 0.01, vertical_datum: 'EPSG:4979' }, modelState: 'available' };
  renderPage(tiledSummary);
  await screen.findByRole('heading', { name: 'Massif test', level: 1 });
  await user.click(screen.getByRole('button', { name: 'Ouvrir la carte' }));
  expect(screen.getByRole('heading', { name: 'Vue 3D à la demande' })).toBeVisible();
  expect(screen.queryByTestId('tiled-scene-preset')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Ouvrir la vue 3D' }));
  expect(await screen.findByTestId('tiled-scene-preset')).toHaveTextContent('Preset near');
  await user.click(screen.getByRole('button', { name: 'Vue étendue' }));
  expect(screen.getByTestId('tiled-scene-preset')).toHaveTextContent('Preset extended');
});

it('présente toutes les journées spatiales et bascule les deux calques avec la journée choisie', async () => {
  const user = userEvent.setup();
  const tiledSummary: ViewerManifestSummary = { ...summary, scene: { package_id: 'test', catalog_url: '/scene/catalog', files: [{ file_id: 1, path: 'terrain.tif', kind: 'COG', url: '/scene/1', sha256: 'a'.repeat(64), size_bytes: 2048, media_type: 'image/tiff' }] }, frame: { origin_wgs84: [5.37, 44.75, 454.2], local_frame: 'ENU', meters_per_unit: 0.01, vertical_datum: 'EPSG:4979' }, modelState: 'available' };
  const spatialView: PublicIncidentView = {
    ...view,
    daily_intelligence: [spatialDay('2026-07-12', 'analysis-12'), spatialDay('2026-07-13', 'analysis-13')],
    active_fire_zones: [
      { zone_revision_id: 'active-12', zone_kind: 'active', revision: 1, valid_at: '2026-07-12T12:00:00Z', analysis_id: 'analysis-12', geometry_geojson: { type: 'Polygon', coordinates: [[ [6.1, 43.2], [6.11, 43.2], [6.11, 43.21], [6.1, 43.2] ]] } },
      { zone_revision_id: 'active-13', zone_kind: 'active', revision: 1, valid_at: '2026-07-13T12:00:00Z', analysis_id: 'analysis-13', geometry_geojson: { type: 'Polygon', coordinates: [[ [6.12, 43.2], [6.13, 43.2], [6.13, 43.21], [6.12, 43.2] ]] } },
    ],
    burned_area_zones: [
      { zone_revision_id: 'burned-12', zone_kind: 'burned', revision: 1, valid_at: '2026-07-12T12:00:00Z', analysis_id: 'analysis-12', geometry_geojson: { type: 'Polygon', coordinates: [[ [6.1, 43.2], [6.11, 43.2], [6.11, 43.21], [6.1, 43.2] ]] } },
      { zone_revision_id: 'burned-13', zone_kind: 'burned', revision: 1, valid_at: '2026-07-13T12:00:00Z', analysis_id: 'analysis-13', geometry_geojson: { type: 'Polygon', coordinates: [[ [6.12, 43.2], [6.13, 43.2], [6.13, 43.21], [6.12, 43.2] ]] } },
    ],
  };
  render(<PublicIncidentRealPage summary={tiledSummary} checkedAt="2026-07-15T10:00:00Z" stale={false} refreshing={false} onRefresh={vi.fn()} detailRequest={Promise.resolve({ view: spatialView, error: null })} />);
  await screen.findByRole('heading', { name: 'Massif test', level: 1 });
  await user.click(screen.getByRole('button', { name: 'Ouvrir la carte' }));
  await user.click(screen.getByRole('button', { name: 'Ouvrir la vue 3D' }));
  expect(await screen.findByText('2 journées disponibles · les deux calques changent ensemble')).toBeVisible();
  const tabs = screen.getAllByRole('tab');
  expect(tabs).toHaveLength(2);
  expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
  await user.click(tabs[0]!);
  expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByText('Zone parcourue')).toBeVisible();
  expect(screen.getByText('Zone active')).toBeVisible();
  expect(screen.getByTestId('tiled-scene-preset')).toHaveAttribute('data-polygon-layers', expect.stringContaining('#dc5b35:4:18'));
  expect(screen.getByTestId('tiled-scene-preset')).toHaveAttribute('data-polygon-layers', expect.stringContaining('#ffd43b:8:28'));
  expect(screen.getByTestId('tiled-scene-preset')).toHaveAttribute('data-overlay-focus', '6.105,43.2025');
  await user.click(screen.getByRole('button', { name: /Zone parcourue/ }));
  expect(screen.getByRole('button', { name: /Zone parcourue/ })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByTestId('tiled-scene-preset')).toHaveAttribute('data-polygon-layers', '#ffd43b:8:28');
});

it('résout les fichiers de scène différés seulement après l’action explicite', async () => {
  const { loadPublicSpatialScene } = await import('../../lib/publicSpatialScene');
  vi.mocked(loadPublicSpatialScene).mockResolvedValue({
    package_id: 'test',
    catalog_url: '/scene/catalog',
    files: [{ file_id: 1, path: 'terrain.tif', kind: 'COG', url: '/scene/1', sha256: 'a'.repeat(64), size_bytes: 2048, media_type: 'image/tiff' }],
  });
  const user = userEvent.setup();
  const deferredSummary: ViewerManifestSummary = {
    ...summary,
    scene: { package_id: 'test', catalog_url: '/scene/catalog', files: [] },
    frame: { origin_wgs84: [5.37, 44.75, 454.2], local_frame: 'ENU', meters_per_unit: 0.01, vertical_datum: 'EPSG:4979' },
    modelState: 'available',
  };
  renderPage(deferredSummary);
  await screen.findByRole('heading', { name: 'Massif test', level: 1 });
  await user.click(screen.getByRole('button', { name: 'Ouvrir la carte' }));
  expect(loadPublicSpatialScene).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Ouvrir la vue 3D' }));
  expect(loadPublicSpatialScene).toHaveBeenCalledWith('FR-83-00042');
  expect(await screen.findByTestId('tiled-scene-preset')).toHaveTextContent('Preset near');
});

it('présente les mises à jour sans inventer de périmètre', async () => {
  const user = userEvent.setup();
  renderPage(); await screen.findByRole('heading', { name: 'Massif test', level: 1 });
  expect(screen.getByText('Évolution publiée')).toBeVisible();
  const timelineSummary = screen.getByText('Évolution publiée').closest('summary');
  if (!timelineSummary) throw new Error('Évolution publiée doit être dépliable.');
  await user.click(timelineSummary);
  expect(screen.getByText('Observation validée')).toBeVisible();
  expect(screen.queryByText(/longitude/i)).not.toBeInTheDocument();
});

it('intègre les synthèses quotidiennes publiées dans la chronologie', async () => {
  const user = userEvent.setup();
  const chronologicalView: PublicIncidentView = {
    ...view,
    daily_intelligence: [spatialDay('2026-07-12', 'analysis-12'), spatialDay('2026-07-13', 'analysis-13')],
  };
  render(<PublicIncidentRealPage summary={summary} checkedAt="2026-07-15T10:00:00Z" stale={false} refreshing={false} onRefresh={vi.fn()} detailRequest={Promise.resolve({ view: chronologicalView, error: null })} />);
  await screen.findByRole('heading', { name: 'Massif test', level: 1 });
  const timelineSummary = screen.getByText('Évolution publiée').closest('summary');
  if (!timelineSummary) throw new Error('Évolution publiée doit être dépliable.');
  expect(timelineSummary).toHaveTextContent('3 jours · 3 publications');
  await user.click(timelineSummary);
  const picker = screen.getByLabelText('Choisir une journée');
  expect(within(picker).getAllByRole('button')).toHaveLength(3);
  await user.click(within(picker).getByRole('button', { name: '13 juil.' }));
  expect(screen.getByText(/Synthèse quotidienne et calques publiés : Situation 2026-07-13/)).toBeVisible();
});

it('replie les repères, les informations opérationnelles et l’évolution par défaut', async () => {
  const publishedView: PublicIncidentView = {
    ...view,
    operational_information: [{ information_id: 'OP-2', kind: 'road_status', title: 'Information routière', value_text: 'Route fermée', value_number: null, unit: null, locality: 'Hameau test', authority_kind: 'prefecture', authority_name: 'Préfecture de test', source_url: 'https://example.invalid/route', effective_at: null, published_at: '2026-07-15T10:00:00Z', episode_id: 'E01' }],
  };
  render(<PublicIncidentRealPage summary={summary} checkedAt="2026-07-15T10:00:00Z" stale={false} refreshing={false} onRefresh={vi.fn()} detailRequest={Promise.resolve({ view: publishedView, error: null })} />);
  await screen.findByRole('heading', { name: 'Massif test', level: 1 });
  for (const title of ['Repères de l’incident', 'Informations opérationnelles', 'Évolution publiée']) {
    expect(screen.getByText(title).closest('details')).not.toHaveAttribute('open');
  }
});

it('affiche une information opérationnelle uniquement lorsqu’elle est fournie par le contrat public', async () => {
  const user = userEvent.setup();
  const publishedView: PublicIncidentView = {
    ...view,
    operational_information: [{ information_id: 'OP-1', kind: 'road_status', title: 'Information routière', value_text: 'Route fermée', value_number: null, unit: null, locality: 'Hameau test', authority_kind: 'prefecture', authority_name: 'Préfecture de test', source_url: 'https://example.invalid/route', effective_at: '2026-07-15T10:00:00Z', published_at: '2026-07-15T10:00:00Z', episode_id: 'E01' }],
  };
  render(<PublicIncidentRealPage summary={summary} checkedAt="2026-07-15T10:00:00Z" stale={false} refreshing={false} onRefresh={vi.fn()} detailRequest={Promise.resolve({ view: publishedView, error: null })} />);
  await screen.findByText('Informations opérationnelles');
  const operationalSummary = screen.getByText('Informations opérationnelles').closest('summary');
  if (!operationalSummary) throw new Error('Informations opérationnelles doit être dépliable.');
  await user.click(operationalSummary);
  const operationalSection = screen.getByRole('region', { name: 'Informations opérationnelles' });
  expect(within(operationalSection).getByRole('link')).toHaveAttribute('href', 'https://example.invalid/route');
  expect(screen.getByText(/Hameau test.*Préfecture de test/)).toBeVisible();
  expect(screen.queryByText('prefecture')).not.toBeInTheDocument();
});

it('affiche seulement les éléments de galerie déjà fournis par le contrat public', async () => {
  const publishedView: PublicIncidentView = {
    ...view,
    gallery: [{ gallery_item_id: 'gallery-1', title: 'Image éditoriale publiée', caption: 'Légende validée.', alt_text: 'Panache observé au-dessus du massif.', media_url: 'https://media.example.invalid/image.jpg', media_kind: 'image', credit: 'Crédit vérifié', license_label: 'Droits vérifiés', captured_at: null, published_at: '2026-07-15T10:00:00Z', episode_id: 'E01' }],
  };
  render(<PublicIncidentRealPage summary={summary} checkedAt="2026-07-15T10:00:00Z" stale={false} refreshing={false} onRefresh={vi.fn()} detailRequest={Promise.resolve({ view: publishedView, error: null })} />);
  expect(await screen.findByRole('heading', { name: 'Galerie de l’événement' })).toBeVisible();
  expect(screen.getByRole('img', { name: 'Panache observé au-dessus du massif.' })).toHaveAttribute('src', 'https://media.example.invalid/image.jpg');
  expect(screen.getByText('Légende validée.')).toBeVisible();
});

it('affiche seulement les résultats analysés déjà validés et publiés', async () => {
  const user = userEvent.setup();
  const publishedView: PublicIncidentView = {
    ...view,
    daily_intelligence: [{
      analysis_id: 'analysis-2026-07-15',
      episode_id: 'E01',
      local_date: '2026-07-15',
      published_at: '2026-07-15T12:00:00Z',
      report: {
        report_revision_id: 'SITREP-1',
        revision: 1,
        title: 'Situation validée',
        body_markdown: 'Le front reste surveillé.',
        reviewed_at: '2026-07-15T11:45:00Z',
      },
      facts: [{
        fact_id: 'FACT-1',
        category: 'resources',
        fact_key: 'teams_engaged',
        as_of: '2026-07-15T10:30:00Z',
        certainty: 'explicitly_written',
        summary: '120 personnes engagées.',
        value_number: 120,
        value_text: null,
        value_boolean: null,
        unit: 'personnes',
        evidence: {
          evidence_kind: 'article_text',
          evidence_id: 'MEDIA-1',
          source_annotation_id: null,
          source_reference_url: 'https://example.invalid/source',
          license_identifier: 'SOURCE-ONLY',
        },
      }],
      spatial_results: [{
        proposal_id: 'SPATIAL-1',
        kind: 'active_fire_point',
        observed_at: '2026-07-15T10:20:00Z',
        geometry_geojson: { type: 'Point', coordinates: [6.1, 43.2] },
        geometry_origin: 'SATELLITE_GEOTRANSFORM',
        horizontal_accuracy_m: 25,
        evidence: {
          evidence_kind: 'satellite_image',
          evidence_id: 'SAT-1',
          source_annotation_id: 'ANN-1',
          source_reference_url: null,
          license_identifier: null,
        },
      }],
    }],
    map_gallery: [{
      capture_id: 'CAPTURE-1',
      zone_revision_id: 'AZR-1',
      local_date: '2026-07-15',
      captured_at: '2026-07-15T12:00:00Z',
      image_url: '/api/v1/incident/FR-83-00042/map-gallery/CAPTURE-1',
      width_px: 960,
      height_px: 540,
    }],
  };
  render(<PublicIncidentRealPage summary={summary} checkedAt="2026-07-15T10:00:00Z" stale={false} refreshing={false} onRefresh={vi.fn()} detailRequest={Promise.resolve({ view: publishedView, error: null })} />);

  await screen.findByText('Situation analysée et validée');
  const intelligenceSummary = screen.getByText('Situation analysée et validée').closest('summary');
  if (!intelligenceSummary) throw new Error('La situation analysée doit être dépliable.');
  await user.click(intelligenceSummary);

  expect(screen.getByRole('heading', { name: 'Situation validée' })).toBeVisible();
  expect(screen.getByText('120 personnes engagées.')).toBeVisible();
  expect(screen.getByText('Point actif')).toBeVisible();
  expect(screen.getByRole('link', { name: /Voir la source/ })).toHaveAttribute('href', 'https://example.invalid/source');
  expect(screen.getByRole('heading', { name: 'Évolution cartographique' })).toBeVisible();
  expect(screen.getByRole('img', { name: /Zone de l’incendie publiée/ })).toHaveAttribute('src', 'https://api.firewarning.test/api/v1/incident/FR-83-00042/map-gallery/CAPTURE-1');
});

it('désactive la 3D sans retirer les informations publiques', async () => {
  const user = userEvent.setup();
  const tiledSummary: ViewerManifestSummary = { ...summary, scene: { package_id: 'test', catalog_url: '/scene/catalog', files: [{ file_id: 1, path: 'terrain.tif', kind: 'COG', url: '/scene/1', sha256: 'a'.repeat(64), size_bytes: 2048, media_type: 'image/tiff' }] }, frame: { origin_wgs84: [5.37, 44.75, 454.2], local_frame: 'ENU', meters_per_unit: 0.01, vertical_datum: 'EPSG:4979' }, modelState: 'available' };
  renderPage(tiledSummary); await screen.findByRole('heading', { name: 'Massif test', level: 1 });
  await user.click(screen.getByRole('button', { name: 'Ouvrir la carte' }));
  await user.click(screen.getByRole('button', { name: 'Faible connexion' }));
  expect(screen.getByRole('heading', { name: 'Vue 3D désactivée' })).toBeVisible();
  expect(localStorage.getItem('firewarning-low-data')).toBe('true');
});

it('ouvre la 3D en mode principal et conserve un repli 2D sans viewpoint privé', async () => {
  vi.stubEnv('VITE_FV_3D_PRIMARY_ENABLED', 'true');
  vi.stubGlobal('WebGLRenderingContext', class WebGLRenderingContext {});
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({} as never));
  const user = userEvent.setup();
  const tiledSummary: ViewerManifestSummary = { ...summary, scene: { package_id: 'test', catalog_url: '/scene/catalog', files: [{ file_id: 1, path: 'terrain.tif', kind: 'COG', url: '/scene/1', sha256: 'a'.repeat(64), size_bytes: 2048, media_type: 'image/tiff' }] }, frame: { origin_wgs84: [5.37, 44.75, 454.2], local_frame: 'ENU', meters_per_unit: 0.01, vertical_datum: 'EPSG:4979' }, modelState: 'available' };
  const spatialView: PublicIncidentView = {
    ...view,
    daily_intelligence: [spatialDay('2026-07-15', 'analysis-15')],
    active_fire_zones: [{ zone_revision_id: 'active-15', zone_kind: 'active', revision: 1, valid_at: '2026-07-15T12:00:00Z', analysis_id: 'analysis-15', geometry_geojson: { type: 'Polygon', coordinates: [[[6.1, 43.2], [6.11, 43.2], [6.11, 43.21], [6.1, 43.2]]] } }],
  };
  render(<PublicIncidentRealPage summary={tiledSummary} checkedAt="2026-07-15T10:00:00Z" stale={false} refreshing={false} onRefresh={vi.fn()} detailRequest={Promise.resolve({ view: spatialView, error: null })} />);
  await screen.findByRole('heading', { name: 'Massif test', level: 1 });
  await user.click(screen.getByRole('button', { name: 'Ouvrir la carte' }));
  expect(await screen.findByTestId('tiled-scene-preset')).toBeVisible();
  expect(screen.queryByText(/point de prise de vue/i)).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Vue 2D' }));
  expect(screen.getByRole('heading', { name: 'Carte 2D de secours' })).toBeVisible();
  expect(screen.getByRole('img', { name: /géométries publiées/ })).toBeVisible();
});

it('ne charge pas la timeline v2 tant que les deux flags de publication ne sont pas actifs', async () => {
  vi.stubEnv('VITE_FV_EVENT_V2_ENABLED', 'true');
  vi.stubEnv('VITE_FV_V2_PUBLICATION_ENABLED', 'false');

  renderPage();

  await screen.findByRole('heading', { name: 'Massif test', level: 1 });
  expect(loadPublicIncidentEventTimeline).not.toHaveBeenCalled();
  expect(screen.getByText('Évolution publiée')).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Progression observée' })).not.toBeInTheDocument();
});

it('synchronise un même instant et les mêmes géométries entre texte, 3D et secours 2D', async () => {
  vi.stubEnv('VITE_FV_EVENT_V2_ENABLED', 'true');
  vi.stubEnv('VITE_FV_V2_PUBLICATION_ENABLED', 'true');
  vi.stubEnv('VITE_FV_3D_PRIMARY_ENABLED', 'true');
  vi.stubGlobal('WebGLRenderingContext', class WebGLRenderingContext {});
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({} as never));
  vi.mocked(loadPublicIncidentEventTimeline).mockResolvedValue(eventTimeline);
  const tiledSummary: ViewerManifestSummary = { ...summary, scene: { package_id: 'test', catalog_url: '/scene/catalog', files: [{ file_id: 1, path: 'terrain.tif', kind: 'COG', url: '/scene/1', sha256: 'a'.repeat(64), size_bytes: 2048, media_type: 'image/tiff' }] }, frame: { origin_wgs84: [5.37, 44.75, 454.2], local_frame: 'ENU', meters_per_unit: 0.01, vertical_datum: 'EPSG:4979' }, modelState: 'available' };
  const user = userEvent.setup();

  renderPage(tiledSummary);

  const timelinePanel = await screen.findByRole('region', { name: 'Progression observée' });
  expect(loadPublicIncidentEventTimeline).toHaveBeenCalledWith('FR-83-00042', expect.anything());
  expect(within(timelinePanel).getByText('Portion de front visible')).toBeVisible();
  expect(document.body).not.toHaveTextContent(/viewpoint|evidence_asset_ids|point de prise de vue/i);
  await user.click(screen.getByRole('button', { name: 'Ouvrir la carte' }));
  const scene = await screen.findByTestId('tiled-scene-preset');
  expect(scene).toHaveAttribute('data-event-points', '0');
  expect(scene).toHaveAttribute('data-event-lines', '1');
  expect(scene).toHaveAttribute('data-polygon-layers', expect.stringContaining('#ffca3a:6:26'));

  await user.click(screen.getByRole('button', { name: 'Vue 2D' }));
  const latestFallback = screen.getByRole('img', { name: /géométries publiées/ });
  const uncertaintyPath = latestFallback.querySelector('path');
  expect(uncertaintyPath).toHaveAttribute('fill-rule', 'evenodd');
  expect(uncertaintyPath?.getAttribute('d')?.match(/\bM\b/g)).toHaveLength(2);

  const publicTabs = within(timelinePanel).getAllByRole('tab');
  await user.click(publicTabs[0]!);
  expect(within(timelinePanel).getByText('Flamme ou foyer actif')).toBeVisible();
  expect(within(screen.getByRole('tablist', { name: 'Choisir un instant sur la carte' })).getAllByRole('tab')[0]).toHaveAttribute('aria-selected', 'true');

  const fallback = screen.getByRole('img', { name: /géométries publiées/ });
  expect(fallback).toHaveAttribute('data-event-points', '1');
  expect(fallback).toHaveAttribute('data-event-lines', '0');
  expect(fallback).toHaveAttribute('data-uncertainties', '1');
  await user.click(within(timelinePanel).getByRole('button', { name: /Incertitudes/ }));
  expect(fallback).toHaveAttribute('data-uncertainties', '0');
});

it('conserve la timeline textuelle et la carte 2D complète sans WebGL', async () => {
  vi.stubEnv('VITE_FV_EVENT_V2_ENABLED', 'true');
  vi.stubEnv('VITE_FV_V2_PUBLICATION_ENABLED', 'true');
  vi.stubEnv('VITE_FV_3D_PRIMARY_ENABLED', 'true');
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
  vi.mocked(loadPublicIncidentEventTimeline).mockResolvedValue(eventTimeline);
  const tiledSummary: ViewerManifestSummary = { ...summary, scene: { package_id: 'test', catalog_url: '/scene/catalog', files: [{ file_id: 1, path: 'terrain.tif', kind: 'COG', url: '/scene/1', sha256: 'a'.repeat(64), size_bytes: 2048, media_type: 'image/tiff' }] }, frame: { origin_wgs84: [5.37, 44.75, 454.2], local_frame: 'ENU', meters_per_unit: 0.01, vertical_datum: 'EPSG:4979' }, modelState: 'available' };
  const user = userEvent.setup();

  renderPage(tiledSummary);

  expect(await screen.findByRole('heading', { name: 'Progression observée' })).toBeVisible();
  expect(await screen.findByText('Portion de front visible')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Ouvrir la carte' }));
  expect(screen.getByRole('heading', { name: 'Carte 2D de secours' })).toBeVisible();
  expect(screen.getByRole('img', { name: /géométries publiées/ })).toHaveAttribute('data-event-lines', '1');
  expect(screen.queryByTestId('tiled-scene-preset')).not.toBeInTheDocument();
});

it('conserve la chronologie publique existante si la timeline v2 est indisponible', async () => {
  vi.stubEnv('VITE_FV_EVENT_V2_ENABLED', 'true');
  vi.stubEnv('VITE_FV_V2_PUBLICATION_ENABLED', 'true');
  vi.mocked(loadPublicIncidentEventTimeline).mockRejectedValue(new Error('offline'));

  renderPage();

  expect(await screen.findByText(/progression événementielle v2 est indisponible/i)).toBeVisible();
  expect(screen.getByText('Évolution publiée')).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Progression observée' })).not.toBeInTheDocument();
});

it('considère une timeline v2 publiée vide comme l’état public autoritatif', async () => {
  vi.stubEnv('VITE_FV_EVENT_V2_ENABLED', 'true');
  vi.stubEnv('VITE_FV_V2_PUBLICATION_ENABLED', 'true');
  vi.mocked(loadPublicIncidentEventTimeline).mockResolvedValue({ ...eventTimeline, events: [] });

  renderPage();

  expect(await screen.findByRole('heading', { name: 'Progression observée' })).toBeVisible();
  expect(screen.getByText(/Aucun événement actif n’est publié/)).toBeVisible();
  expect(screen.queryByText('Évolution publiée')).not.toBeInTheDocument();
});

it('recharge la timeline v2 après une nouvelle vérification du manifeste', async () => {
  vi.stubEnv('VITE_FV_EVENT_V2_ENABLED', 'true');
  vi.stubEnv('VITE_FV_V2_PUBLICATION_ENABLED', 'true');
  vi.mocked(loadPublicIncidentEventTimeline)
    .mockResolvedValueOnce(eventTimeline)
    .mockResolvedValueOnce({ ...eventTimeline, revision: 3, events: [] });
  const detailRequest = Promise.resolve({ view, error: null });
  const props = {
    summary,
    stale: false,
    refreshing: false,
    onRefresh: vi.fn(),
    detailRequest,
  } as const;
  const rendered = render(<PublicIncidentRealPage {...props} checkedAt="2026-07-15T10:00:00Z" />);

  expect(await screen.findByText('Révision publique 2')).toBeVisible();
  rendered.rerender(<PublicIncidentRealPage {...props} checkedAt="2026-07-15T10:05:00Z" />);

  expect(await screen.findByText('Révision publique 3')).toBeVisible();
  expect(loadPublicIncidentEventTimeline).toHaveBeenCalledTimes(2);
});

it('n’injecte pas les périmètres v1 dans une publication événementielle v2', async () => {
  vi.stubEnv('VITE_FV_EVENT_V2_ENABLED', 'true');
  vi.stubEnv('VITE_FV_V2_PUBLICATION_ENABLED', 'true');
  vi.stubEnv('VITE_FV_3D_PRIMARY_ENABLED', 'true');
  vi.stubGlobal('WebGLRenderingContext', class WebGLRenderingContext {});
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({} as never));
  vi.mocked(loadPublicIncidentEventTimeline).mockResolvedValue({
    ...eventTimeline,
    events: eventTimeline.events.map((event) => event.event_id === 'FAE-2'
      ? { ...event, observed_start_at: '2026-07-15T22:30:00Z' }
      : event),
  });
  const user = userEvent.setup();
  const tiledSummary: ViewerManifestSummary = { ...summary, scene: { package_id: 'test', catalog_url: '/scene/catalog', files: [{ file_id: 1, path: 'terrain.tif', kind: 'COG', url: '/scene/1', sha256: 'a'.repeat(64), size_bytes: 2048, media_type: 'image/tiff' }] }, frame: { origin_wgs84: [5.37, 44.75, 454.2], local_frame: 'ENU', meters_per_unit: 0.01, vertical_datum: 'EPSG:4979' }, modelState: 'available' };
  const spatialView: PublicIncidentView = {
    ...view,
    daily_intelligence: [],
    active_fire_zones: [{ zone_revision_id: 'active-16', zone_kind: 'active', revision: 1, valid_at: '2026-07-15T22:15:00Z', analysis_id: 'analysis-16', geometry_geojson: { type: 'Polygon', coordinates: [[[6.1, 43.2], [6.11, 43.2], [6.11, 43.21], [6.1, 43.2]]] } }],
    burned_area_zones: [{ zone_revision_id: 'burned-16', zone_kind: 'burned', revision: 1, valid_at: '2026-07-15T22:15:00Z', analysis_id: 'analysis-16', geometry_geojson: { type: 'Polygon', coordinates: [[[6.09, 43.19], [6.12, 43.19], [6.12, 43.22], [6.09, 43.19]]] } }],
  };

  render(<PublicIncidentRealPage summary={tiledSummary} checkedAt="2026-07-15T10:00:00Z" stale={false} refreshing={false} onRefresh={vi.fn()} detailRequest={Promise.resolve({ view: spatialView, error: null })} />);
  await screen.findByRole('heading', { name: 'Progression observée' });
  await user.click(screen.getByRole('button', { name: 'Ouvrir la carte' }));
  const scene = await screen.findByTestId('tiled-scene-preset');

  expect(scene).toHaveAttribute('data-polygon-layers', '#ffca3a:6:26');
  expect(screen.queryByRole('button', { name: /Zone active/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Zone parcourue/ })).not.toBeInTheDocument();
});

it('écarte aussi les périmètres v1 d’un autre jour', async () => {
  vi.stubEnv('VITE_FV_EVENT_V2_ENABLED', 'true');
  vi.stubEnv('VITE_FV_V2_PUBLICATION_ENABLED', 'true');
  vi.stubEnv('VITE_FV_3D_PRIMARY_ENABLED', 'true');
  vi.stubGlobal('WebGLRenderingContext', class WebGLRenderingContext {});
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({} as never));
  vi.mocked(loadPublicIncidentEventTimeline).mockResolvedValue(eventTimeline);
  const user = userEvent.setup();
  const tiledSummary: ViewerManifestSummary = { ...summary, scene: { package_id: 'test', catalog_url: '/scene/catalog', files: [{ file_id: 1, path: 'terrain.tif', kind: 'COG', url: '/scene/1', sha256: 'a'.repeat(64), size_bytes: 2048, media_type: 'image/tiff' }] }, frame: { origin_wgs84: [5.37, 44.75, 454.2], local_frame: 'ENU', meters_per_unit: 0.01, vertical_datum: 'EPSG:4979' }, modelState: 'available' };
  const previousDayView: PublicIncidentView = {
    ...view,
    daily_intelligence: [spatialDay('2026-07-14', 'analysis-14')],
    active_fire_zones: [{ zone_revision_id: 'active-14', zone_kind: 'active', revision: 1, valid_at: '2026-07-14T12:00:00Z', analysis_id: 'analysis-14', geometry_geojson: { type: 'Polygon', coordinates: [[[6.1, 43.2], [6.11, 43.2], [6.11, 43.21], [6.1, 43.2]]] } }],
    burned_area_zones: [{ zone_revision_id: 'burned-14', zone_kind: 'burned', revision: 1, valid_at: '2026-07-14T12:00:00Z', analysis_id: 'analysis-14', geometry_geojson: { type: 'Polygon', coordinates: [[[6.09, 43.19], [6.12, 43.19], [6.12, 43.22], [6.09, 43.19]]] } }],
  };

  render(<PublicIncidentRealPage summary={tiledSummary} checkedAt="2026-07-15T10:00:00Z" stale={false} refreshing={false} onRefresh={vi.fn()} detailRequest={Promise.resolve({ view: previousDayView, error: null })} />);
  await screen.findByRole('heading', { name: 'Progression observée' });
  await user.click(screen.getByRole('button', { name: 'Ouvrir la carte' }));
  const scene = await screen.findByTestId('tiled-scene-preset');

  expect(scene).toHaveAttribute('data-polygon-layers', '#ffca3a:6:26');
  expect(screen.getByText(/événements de la révision publique 2/i)).toBeVisible();
  expect(screen.queryByRole('button', { name: /Zone active/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Zone parcourue/ })).not.toBeInTheDocument();
});
