import { getViewerManifestApiOrigin } from './manifestClient';
import { VIEWER_MANIFEST_FIRE_ID_RE } from './viewerManifest';

export type PublicWgs84Position = readonly [number, number];

export type PublicEventGeometry =
  | { readonly type: 'Point'; readonly coordinates: PublicWgs84Position }
  | { readonly type: 'LineString'; readonly coordinates: readonly PublicWgs84Position[] }
  | { readonly type: 'MultiLineString'; readonly coordinates: readonly (readonly PublicWgs84Position[])[] };

export type PublicEventUncertainty =
  | { readonly type: 'Polygon'; readonly coordinates: readonly (readonly PublicWgs84Position[])[] }
  | { readonly type: 'MultiPolygon'; readonly coordinates: readonly (readonly (readonly PublicWgs84Position[])[])[] };

export type PublicFireActivityEvent = {
  readonly event_id: string;
  readonly state: 'EDITOR_PUBLISHED';
  readonly phenomenon_kind: string;
  readonly observed_start_at: string;
  readonly observed_end_at: string | null;
  readonly geometry: PublicEventGeometry;
  readonly uncertainty: PublicEventUncertainty;
  readonly method: string;
  readonly publication_revision: number;
};

export type PublicIncidentEventTimeline = {
  readonly incident_id: string;
  readonly revision: number;
  readonly events: readonly PublicFireActivityEvent[];
};

export class PublicEventTimelineError extends Error {
  constructor(readonly status: number | null, message: string) {
    super(message);
  }
}

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : null;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new PublicEventTimelineError(null, `Champ public ${field} invalide.`);
  }
  return value;
}

function isoDate(value: unknown, field: string, nullable = false): string | null {
  if (value === null && nullable) return null;
  const parsed = requiredString(value, field);
  if (!Number.isFinite(Date.parse(parsed))) {
    throw new PublicEventTimelineError(null, `Champ public ${field} invalide.`);
  }
  return parsed;
}

function revision(value: unknown, field: string, allowZero: boolean): number {
  if (!Number.isInteger(value) || (value as number) < (allowZero ? 0 : 1)) {
    throw new PublicEventTimelineError(null, `Champ public ${field} invalide.`);
  }
  return value as number;
}

function position(value: unknown, field: string): PublicWgs84Position {
  if (!Array.isArray(value) || value.length < 2 || value.length > 3) {
    throw new PublicEventTimelineError(null, `Coordonnée publique ${field} invalide.`);
  }
  const [longitude, latitude] = value;
  if (
    typeof longitude !== 'number'
    || !Number.isFinite(longitude)
    || longitude < -180
    || longitude > 180
    || typeof latitude !== 'number'
    || !Number.isFinite(latitude)
    || latitude < -90
    || latitude > 90
    || (value.length === 3 && (typeof value[2] !== 'number' || !Number.isFinite(value[2])))
  ) {
    throw new PublicEventTimelineError(null, `Coordonnée publique ${field} invalide.`);
  }
  return [longitude, latitude];
}

function line(value: unknown, field: string): readonly PublicWgs84Position[] {
  if (!Array.isArray(value) || value.length < 2) {
    throw new PublicEventTimelineError(null, `Ligne publique ${field} invalide.`);
  }
  return value.map((entry, index) => position(entry, `${field}[${index}]`));
}

function ring(value: unknown, field: string): readonly PublicWgs84Position[] {
  if (!Array.isArray(value) || value.length < 4) {
    throw new PublicEventTimelineError(null, `Anneau public ${field} invalide.`);
  }
  const points = value.map((entry, index) => position(entry, `${field}[${index}]`));
  const first = points[0]!;
  const last = points.at(-1)!;
  if (first[0] !== last[0] || first[1] !== last[1]) {
    throw new PublicEventTimelineError(null, `Anneau public ${field} non fermé.`);
  }
  return points;
}

function polygon(value: unknown, field: string): readonly (readonly PublicWgs84Position[])[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new PublicEventTimelineError(null, `Polygone public ${field} invalide.`);
  }
  return value.map((entry, index) => ring(entry, `${field}[${index}]`));
}

function eventGeometry(value: unknown, field: string): PublicEventGeometry {
  const geometry = record(value);
  if (!geometry) throw new PublicEventTimelineError(null, `Géométrie publique ${field} invalide.`);
  if (geometry.type === 'Point') {
    return { type: 'Point', coordinates: position(geometry.coordinates, `${field}.coordinates`) };
  }
  if (geometry.type === 'LineString') {
    return { type: 'LineString', coordinates: line(geometry.coordinates, `${field}.coordinates`) };
  }
  if (geometry.type === 'MultiLineString' && Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0) {
    return {
      type: 'MultiLineString',
      coordinates: geometry.coordinates.map((entry, index) => line(entry, `${field}.coordinates[${index}]`)),
    };
  }
  throw new PublicEventTimelineError(null, `Type de géométrie publique ${field} invalide.`);
}

function uncertaintyGeometry(value: unknown, field: string): PublicEventUncertainty {
  const geometry = record(value);
  if (!geometry) throw new PublicEventTimelineError(null, `Incertitude publique ${field} invalide.`);
  if (geometry.type === 'Polygon') {
    return { type: 'Polygon', coordinates: polygon(geometry.coordinates, `${field}.coordinates`) };
  }
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0) {
    return {
      type: 'MultiPolygon',
      coordinates: geometry.coordinates.map((entry, index) => polygon(entry, `${field}.coordinates[${index}]`)),
    };
  }
  throw new PublicEventTimelineError(null, `Type d’incertitude publique ${field} invalide.`);
}

export function parsePublicIncidentEventTimeline(
  value: unknown,
  expectedIncidentId?: string,
): PublicIncidentEventTimeline {
  const root = record(value);
  if (!root) throw new PublicEventTimelineError(null, 'Timeline publique invalide.');
  const incidentId = requiredString(root.incident_id, 'incident_id');
  if (!VIEWER_MANIFEST_FIRE_ID_RE.test(incidentId) || (expectedIncidentId && incidentId !== expectedIncidentId)) {
    throw new PublicEventTimelineError(null, 'Identifiant de la timeline publique invalide.');
  }
  const timelineRevision = revision(root.revision, 'revision', true);
  if (!Array.isArray(root.events)) throw new PublicEventTimelineError(null, 'Liste des événements publics invalide.');
  const seen = new Set<string>();
  const events = root.events.map((value, index): PublicFireActivityEvent => {
    const item = record(value);
    if (!item || item.state !== 'EDITOR_PUBLISHED') {
      throw new PublicEventTimelineError(null, `Événement public ${index} invalide.`);
    }
    const eventId = requiredString(item.event_id, `events[${index}].event_id`);
    if (seen.has(eventId)) throw new PublicEventTimelineError(null, 'Événement public dupliqué.');
    seen.add(eventId);
    const startAt = isoDate(item.observed_start_at, `events[${index}].observed_start_at`)!;
    const endAt = isoDate(item.observed_end_at, `events[${index}].observed_end_at`, true);
    if (endAt && Date.parse(endAt) < Date.parse(startAt)) {
      throw new PublicEventTimelineError(null, 'Intervalle public invalide.');
    }
    const publicationRevision = revision(item.publication_revision, `events[${index}].publication_revision`, false);
    if (publicationRevision > timelineRevision) {
      throw new PublicEventTimelineError(null, 'Révision d’événement incohérente avec la timeline publique.');
    }
    // Seuls les champs explicitement publics sont reconstruits. Les clés
    // inconnues, y compris privées, ne traversent jamais cette frontière.
    return {
      event_id: eventId,
      state: 'EDITOR_PUBLISHED',
      phenomenon_kind: requiredString(item.phenomenon_kind, `events[${index}].phenomenon_kind`),
      observed_start_at: startAt,
      observed_end_at: endAt,
      geometry: eventGeometry(item.geometry, `events[${index}].geometry`),
      uncertainty: uncertaintyGeometry(item.uncertainty, `events[${index}].uncertainty`),
      method: requiredString(item.method, `events[${index}].method`),
      publication_revision: publicationRevision,
    };
  }).sort((left, right) => left.observed_start_at.localeCompare(right.observed_start_at) || left.event_id.localeCompare(right.event_id));
  return { incident_id: incidentId, revision: timelineRevision, events };
}

export function publicEventTimelineInstants(timeline: PublicIncidentEventTimeline): readonly string[] {
  return [...new Set(timeline.events.map((event) => event.observed_start_at))].sort();
}

export function publicEventsAtInstant(
  timeline: PublicIncidentEventTimeline,
  observedStartAt: string | null,
): readonly PublicFireActivityEvent[] {
  if (!observedStartAt) return [];
  return timeline.events.filter((event) => event.observed_start_at === observedStartAt);
}

function timelineUrl(incidentId: string): string {
  const origin = getViewerManifestApiOrigin();
  if (!origin || !VIEWER_MANIFEST_FIRE_ID_RE.test(incidentId)) {
    throw new PublicEventTimelineError(null, 'La timeline événementielle publique n’est pas configurée.');
  }
  return `${origin}/api/v2/incidents/${encodeURIComponent(incidentId)}/timeline`;
}

export async function loadPublicIncidentEventTimeline(
  incidentId: string,
  signal?: AbortSignal,
): Promise<PublicIncidentEventTimeline> {
  let response: Response;
  try {
    response = await fetch(timelineUrl(incidentId), {
      cache: 'no-store',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new PublicEventTimelineError(null, 'La timeline événementielle publique est inaccessible.');
  }
  if (!response.ok) {
    throw new PublicEventTimelineError(response.status, 'La timeline événementielle publique est indisponible.');
  }
  return parsePublicIncidentEventTimeline(await response.json(), incidentId);
}
