import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./manifestClient', () => ({
  getViewerManifestApiOrigin: () => 'https://api.firewarning.test',
}));

import {
  loadPublicIncidentEventTimeline,
  parsePublicIncidentEventTimeline,
  PublicEventTimelineError,
  publicEventsAtInstant,
  publicEventTimelineInstants,
} from './publicEventTimeline';

const payload = {
  incident_id: 'FR-83-00042',
  revision: 3,
  events: [{
    event_id: 'FAE-2',
    state: 'EDITOR_PUBLISHED',
    phenomenon_kind: 'visible_front',
    observed_start_at: '2026-08-03T12:32:00Z',
    observed_end_at: null,
    geometry: {
      type: 'LineString',
      coordinates: [[6.1, 43.2], [6.2, 43.25]],
    },
    uncertainty: {
      type: 'Polygon',
      coordinates: [[[6.09, 43.19], [6.21, 43.19], [6.21, 43.26], [6.09, 43.19]]],
    },
    method: 'terrain_raycast',
    publication_revision: 3,
  }, {
    event_id: 'FAE-1',
    state: 'EDITOR_PUBLISHED',
    phenomenon_kind: 'active_fire',
    observed_start_at: '2026-08-03T12:00:00Z',
    observed_end_at: null,
    geometry: { type: 'Point', coordinates: [6.12, 43.22] },
    uncertainty: {
      type: 'Polygon',
      coordinates: [[[6.11, 43.21], [6.13, 43.21], [6.13, 43.23], [6.11, 43.21]]],
    },
    method: 'triangulation',
    publication_revision: 2,
  }],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parsePublicIncidentEventTimeline', () => {
  it('normalise l’ordre et ne conserve aucun champ privé, même imbriqué dans le GeoJSON', () => {
    const tainted = structuredClone(payload) as typeof payload & {
      viewpoint?: unknown;
      evidence_asset_ids?: unknown;
    };
    tainted.viewpoint = { longitude: 6.1234, latitude: 43.2345 };
    tainted.evidence_asset_ids = ['EA-private'];
    Object.assign(tainted.events[0]!, {
      viewpoint: { longitude: 6.1234, latitude: 43.2345 },
      evidence_asset_ids: ['EA-private'],
    });
    Object.assign(tainted.events[0]!.geometry, {
      viewpoint: { longitude: 6.1234, latitude: 43.2345 },
      evidence_asset_ids: ['EA-private'],
    });

    const result = parsePublicIncidentEventTimeline(tainted, 'FR-83-00042');

    expect(result.events.map((event) => event.event_id)).toEqual(['FAE-1', 'FAE-2']);
    expect(JSON.stringify(result)).not.toMatch(/viewpoint|evidence_asset_ids|EA-private/);
    expect(result.events[1]?.geometry).toEqual({
      type: 'LineString',
      coordinates: [[6.1, 43.2], [6.2, 43.25]],
    });
  });

  it('refuse une géométrie non WGS84 ou une révision incohérente', () => {
    expect(() => parsePublicIncidentEventTimeline({
      ...payload,
      events: [{ ...payload.events[0], geometry: { type: 'Point', coordinates: [250, 43.2] } }],
    }, 'FR-83-00042')).toThrow(PublicEventTimelineError);
    expect(() => parsePublicIncidentEventTimeline({
      ...payload,
      revision: 1,
    }, 'FR-83-00042')).toThrow(/Révision d’événement incohérente/);
  });

  it('sélectionne uniquement les observations du même instant sans interpoler leur activité', () => {
    const timeline = parsePublicIncidentEventTimeline(payload, 'FR-83-00042');

    expect(publicEventTimelineInstants(timeline)).toEqual([
      '2026-08-03T12:00:00Z',
      '2026-08-03T12:32:00Z',
    ]);
    expect(publicEventsAtInstant(timeline, '2026-08-03T12:32:00Z').map((event) => event.event_id)).toEqual(['FAE-2']);
    expect(publicEventsAtInstant(timeline, '2026-08-03T12:16:00Z')).toEqual([]);
  });
});

describe('loadPublicIncidentEventTimeline', () => {
  it('charge le contrat public sans authentification et sans cookies', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadPublicIncidentEventTimeline('FR-83-00042')).resolves.toMatchObject({
      incident_id: 'FR-83-00042',
      revision: 3,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.firewarning.test/api/v2/incidents/FR-83-00042/timeline',
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'omit',
        headers: { Accept: 'application/json' },
      }),
    );
  });

  it('échoue explicitement sur une réponse indisponible', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

    await expect(loadPublicIncidentEventTimeline('FR-83-00042')).rejects.toMatchObject({ status: 404 });
  });
});
