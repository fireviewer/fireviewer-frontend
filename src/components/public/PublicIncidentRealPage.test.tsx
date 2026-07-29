// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { PublicIncidentRealPage } from './PublicIncidentRealPage';
import type { PublicIncidentView } from '../../lib/publicIncidentView';
import type { ViewerManifestSummary } from '../../lib/viewerManifest';

vi.mock('./TiledSpatialScene3D', () => ({ TiledSpatialScene3D: ({ viewPreset }: { readonly viewPreset: string }) => <div data-testid="tiled-scene-preset">Preset {viewPreset}</div> }));
vi.mock('../../lib/publicSpatialScene', () => ({ loadPublicSpatialScene: vi.fn() }));
vi.mock('../../lib/manifestClient', () => ({ getViewerManifestApiOrigin: () => 'https://api.firewarning.test' }));

const summary: ViewerManifestSummary = { schemaVersion: '2.0', fireId: 'FR-83-00042', episodeId: 'E01', statusCode: 'MONITORING', validatedAt: null, reviewRequired: false, location: null, asset: null, scene: null, frame: null, freshness: { incident_at: '2026-07-15T10:00:00Z', terrain_source_year: null, generated_at: null }, modelState: 'not_available', publicNotice: 'Notice publique.', sources: [], history: [], journal: [] };
const view: PublicIncidentView = { schema_version: '1.0', fire_id: 'FR-83-00042', canonical_name: 'Massif test', public_note: null, status: 'MONITORING', verification: 'verified', freshness_at: '2026-07-15T10:00:00Z', last_human_validation_at: '2026-07-15T10:02:00Z', location: null, facts: ['Observation validée.'], limitations: ['Donnée datée.'], episodes: [{ episode_id: 'E01', ordinal: 1, status: 'MONITORING', verification_state: 'VERIFIED', corroborating_source_count: 1, evidence_basis_at: '2026-07-15T10:00:00Z', estimated_area_ha: 12, evacuation_established: false, model_generation_eligible: true, review_required: false, started_at: '2026-07-15T09:00:00Z', last_observed_at: '2026-07-15T10:00:00Z', validated_at: '2026-07-15T10:02:00Z', ended_at: null, is_current: true, version: 1 }], observations: [{ observation_id: 'O-1', episode_id: 'E01', type: 'institutional', observed_at: '2026-07-15T10:00:00Z', received_at: '2026-07-15T10:01:00Z', uncertainty_m: 250, area_label: 'Massif test', verification_state: 'VERIFIED', spatial_mode: 'WITHHELD' }], evidence_projections: [{ projection_id: 'P-1', episode_id: 'E01', kind: 'validated_marker', verification_state: 'VERIFIED', center: { coordinates: [6.1, 43.2], horizontal_uncertainty_m: 25 }, radius_m: 25, label: 'Image utilisateur validée', observed_at: '2026-07-15T10:00:00Z' }], sources: [], timeline: [{ occurred_at: '2026-07-15T10:00:00Z', kind: 'observation', label: 'Observation validée', episode_id: 'E01' }], model: { state: 'not_available', version: null, sha256: null, size_bytes: null, lod: null, terrain_source_year: null, generated_at: null, public_download_available: false, limitations: [] }, downloads: [] };
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });
function renderPage(pageSummary: ViewerManifestSummary = summary) { return render(<PublicIncidentRealPage summary={pageSummary} checkedAt="2026-07-15T10:00:00Z" stale={false} refreshing={false} onRefresh={vi.fn()} detailRequest={Promise.resolve({ view, error: null })} />); }

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
