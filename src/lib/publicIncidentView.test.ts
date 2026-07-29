import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./manifestClient', () => ({
  getViewerManifestApiOrigin: () => 'https://api.firewarning.test',
}));

import {
  loadPublicIncidentView,
  PublicIncidentViewError,
  submitPublicIncidentReport,
} from './publicIncidentView';

describe('submitPublicIncidentReport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retourne le reçu structuré fourni par l’API publique', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      receipt_id: 'REPORT-0001',
      status: 'received',
      submitted_at: '2026-07-15T14:22:00Z',
      replayed: false,
    }), { status: 202, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(submitPublicIncidentReport('FR-83-00042', {
      category: 'location',
      message: 'Le marqueur doit être vérifié sur le versant est.',
    })).resolves.toEqual({
      receipt_id: 'REPORT-0001',
      status: 'received',
      submitted_at: '2026-07-15T14:22:00Z',
      replayed: false,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.firewarning.test/api/v1/incident/FR-83-00042/reports',
      expect.objectContaining({ method: 'POST', credentials: 'omit' }),
    );
  });

  it('refuse un reçu non conforme au lieu d’inventer un identifiant de suivi', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'received' }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    })));

    await expect(submitPublicIncidentReport('FR-83-00042', {
      category: 'location',
      message: 'Le marqueur doit être vérifié sur le versant est.',
    })).rejects.toBeInstanceOf(PublicIncidentViewError);
  });
});

describe('loadPublicIncidentView', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('conserve les résultats quotidiens validés et leur provenance publique', async () => {
    const payload = {
      schema_version: '1.0',
      fire_id: 'FR-83-00042',
      canonical_name: 'Massif test',
      public_note: null,
      status: 'MONITORING',
      verification: 'verified',
      freshness_at: '2026-07-15T10:00:00Z',
      last_human_validation_at: '2026-07-15T10:02:00Z',
      participatory_observation_count: null,
      participatory_published_count: null,
      participatory_received_count: null,
      location: null,
      facts: [],
      limitations: [],
      episodes: [],
      observations: [],
      evidence_projections: [],
      active_fire_zone: {
        zone_revision_id: 'AZR-1',
        revision: 1,
        valid_at: '2026-07-15T10:00:00Z',
        geometry_geojson: {
          type: 'MultiPolygon',
          coordinates: [[[[6.1, 43.2], [6.2, 43.2], [6.1, 43.2]]]],
        },
      },
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
          unit: 'people',
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
      gallery: [],
      official_resources: [],
      operational_information: [],
      sources: [],
      timeline: [],
      model: {
        state: 'not_available',
        version: null,
        sha256: null,
        size_bytes: null,
        lod: null,
        terrain_source_year: null,
        generated_at: null,
        public_download_available: false,
        limitations: [],
      },
      downloads: [],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));

    const view = await loadPublicIncidentView('FR-83-00042');

    expect(view.daily_intelligence?.[0]).toMatchObject({
      analysis_id: 'analysis-2026-07-15',
      report: { report_revision_id: 'SITREP-1' },
      facts: [{ evidence: { source_reference_url: 'https://example.invalid/source' } }],
      spatial_results: [{ kind: 'active_fire_point' }],
    });
    expect(view.map_gallery?.[0]?.capture_id).toBe('CAPTURE-1');
    expect(view.active_fire_zone?.zone_revision_id).toBe('AZR-1');
  });
});
