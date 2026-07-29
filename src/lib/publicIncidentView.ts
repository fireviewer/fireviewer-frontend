import { getViewerManifestApiOrigin } from './manifestClient';
import { VIEWER_MANIFEST_FIRE_ID_RE } from './viewerManifest';

export type PublicIncidentView = {
  readonly schema_version: '1.0';
  readonly fire_id: string;
  readonly canonical_name: string | null;
  readonly public_note: string | null;
  readonly status: string;
  readonly verification: 'verified' | 'corroborated' | 'review_required';
  readonly freshness_at: string;
  readonly last_human_validation_at: string | null;
  readonly participatory_observation_count?: number;
  readonly participatory_published_count?: number;
  readonly participatory_received_count?: number;
  readonly location: { readonly coordinates: readonly [number, number]; readonly horizontal_uncertainty_m: number } | null;
  readonly facts: readonly string[];
  readonly limitations: readonly string[];
  readonly episodes: readonly {
    readonly episode_id: string;
    readonly ordinal: number;
    readonly status: string;
    readonly verification_state: string;
    readonly corroborating_source_count: number;
    readonly evidence_basis_at: string | null;
    readonly estimated_area_ha: number | null;
    readonly evacuation_established: boolean;
    readonly evacuation_people_count?: number | null;
    readonly evacuation_locality?: string | null;
    readonly evacuation_authority?: 'Mairie' | 'Préfecture' | 'Police' | null;
    readonly model_generation_eligible: boolean;
    readonly review_required: boolean;
    readonly started_at: string;
    readonly last_observed_at: string;
    readonly validated_at: string | null;
    readonly ended_at: string | null;
    readonly is_current: boolean;
    readonly version: number;
  }[];
  readonly observations: readonly {
    readonly observation_id: string;
    readonly episode_id: string;
    readonly type: string;
    readonly observed_at: string;
    readonly received_at: string;
    readonly uncertainty_m: number;
    readonly area_label: string | null;
    readonly verification_state: 'CORROBORATED' | 'VERIFIED';
    readonly spatial_mode: 'GENERALIZED' | 'EXACT' | 'WITHHELD';
  }[];
  readonly evidence_projections: readonly {
    readonly projection_id: string;
    readonly episode_id: string;
    readonly kind: 'validated_marker' | 'generalized_area';
    readonly verification_state: 'CORROBORATED' | 'VERIFIED';
    readonly center: {
      readonly coordinates: readonly [number, number];
      readonly horizontal_uncertainty_m: number;
    };
    readonly radius_m: number;
    readonly label: string;
    readonly observed_at: string | null;
  }[];
  readonly active_fire_zone?: {
    readonly zone_revision_id: string;
    readonly revision: number;
    readonly valid_at: string;
    readonly geometry_geojson: Readonly<Record<string, unknown>>;
  } | null;
  readonly daily_intelligence?: readonly {
    readonly analysis_id: string;
    readonly episode_id: string;
    readonly local_date: string;
    readonly published_at: string;
    readonly report: {
      readonly report_revision_id: string;
      readonly revision: number;
      readonly title: string;
      readonly body_markdown: string;
      readonly reviewed_at: string;
    };
    readonly facts: readonly {
      readonly fact_id: string;
      readonly category: string;
      readonly fact_key: string;
      readonly as_of: string;
      readonly certainty: string;
      readonly summary: string;
      readonly value_number: number | null;
      readonly value_text: string | null;
      readonly value_boolean: boolean | null;
      readonly unit: string | null;
      readonly evidence: {
        readonly evidence_kind: string;
        readonly evidence_id: string;
        readonly source_annotation_id: string | null;
        readonly source_reference_url: string | null;
        readonly license_identifier: string | null;
      };
    }[];
    readonly spatial_results: readonly {
      readonly proposal_id: string;
      readonly kind: 'active_fire_point' | 'smoke_origin_point' | 'visible_fire_front' | 'probable_activity_envelope' | 'burned_area_polygon';
      readonly observed_at: string;
      readonly geometry_geojson: Readonly<Record<string, unknown>>;
      readonly geometry_origin: string;
      readonly horizontal_accuracy_m: number;
      readonly evidence: {
        readonly evidence_kind: string;
        readonly evidence_id: string;
        readonly source_annotation_id: string | null;
        readonly source_reference_url: string | null;
        readonly license_identifier: string | null;
      };
    }[];
  }[];
  readonly map_gallery?: readonly {
    readonly capture_id: string;
    readonly zone_revision_id: string;
    readonly local_date: string;
    readonly captured_at: string;
    readonly image_url: string;
    readonly width_px: number;
    readonly height_px: number;
  }[];
  readonly gallery?: readonly {
    readonly gallery_item_id: string;
    readonly title: string;
    readonly caption: string | null;
    readonly alt_text: string;
    readonly media_url: string;
    readonly media_kind: 'image' | 'video';
    readonly credit: string | null;
    readonly license_label: string | null;
    readonly captured_at: string | null;
    readonly published_at: string | null;
    readonly episode_id: string | null;
  }[];
  readonly official_resources?: readonly {
    readonly resource_id: string;
    readonly kind: 'safety' | 'press' | 'official_update' | 'authority';
    readonly title: string;
    readonly publisher: string;
    readonly url: string;
    readonly published_at: string | null;
    readonly episode_id: string | null;
  }[];
  readonly operational_information?: readonly {
    readonly information_id: string;
    readonly kind: 'affected_place' | 'evacuated_people' | 'mobilized_personnel' | 'mobilized_vehicles' | 'road_status' | 'access_status' | 'shelter' | 'public_service' | 'utility' | 'other';
    readonly title: string;
    readonly value_text: string | null;
    readonly value_number: number | null;
    readonly unit: string | null;
    readonly locality: string | null;
    readonly authority_kind: 'mairie' | 'prefecture' | 'police';
    readonly authority_name: string;
    readonly source_url: string;
    readonly effective_at: string | null;
    readonly published_at: string | null;
    readonly episode_id: string | null;
  }[];
  readonly sources: readonly { readonly source_id: string; readonly type: string; readonly name: string | null; readonly trust: string; readonly license: string | null; readonly external_reference: string | null; readonly transformations: readonly string[]; readonly observation_count: number }[];
  readonly timeline: readonly { readonly occurred_at: string; readonly kind: 'incident' | 'episode' | 'observation' | 'model' | 'operational'; readonly label: string; readonly episode_id: string | null }[];
  readonly model: { readonly state: 'available' | 'not_available' | 'withheld'; readonly version: number | null; readonly sha256: string | null; readonly size_bytes: number | null; readonly lod: string | null; readonly terrain_source_year: number | null; readonly generated_at: string | null; readonly public_download_available: boolean; readonly limitations: readonly string[] };
  readonly downloads: readonly { readonly id: 'incident-json' | 'timeline-csv'; readonly label: string; readonly media_type: 'application/json' | 'text/csv'; readonly url: string }[];
};

export type PublicReportCategory = 'information_obsolete' | 'location' | 'source' | 'privacy' | 'accessibility';

export type PublicIncidentReportReceipt = {
  readonly receipt_id: string;
  readonly status: 'received';
  readonly submitted_at: string;
  readonly replayed: boolean;
};

export class PublicIncidentViewError extends Error {
  constructor(readonly status: number | null, message: string) { super(message); }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function string(value: unknown, name: string, nullable = false): string | null {
  if (value === null && nullable) return null;
  if (typeof value !== 'string' || value.length === 0) throw new PublicIncidentViewError(null, `Champ ${name} invalide.`);
  return value;
}

function iso(value: unknown, name: string, nullable = false): string | null {
  const result = string(value, name, nullable);
  if (result !== null && !Number.isFinite(Date.parse(result))) throw new PublicIncidentViewError(null, `Champ ${name} invalide.`);
  return result;
}

function list(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) throw new PublicIncidentViewError(null, `Champ ${name} invalide.`);
  return value;
}

function point(
  value: unknown,
  name: string,
): { readonly coordinates: readonly [number, number]; readonly horizontal_uncertainty_m: number } {
  const item = record(value);
  if (
    !item
    || !Array.isArray(item.coordinates)
    || item.coordinates.length !== 2
    || !item.coordinates.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
    || typeof item.horizontal_uncertainty_m !== 'number'
    || !Number.isFinite(item.horizontal_uncertainty_m)
    || item.horizontal_uncertainty_m <= 0
  ) throw new PublicIncidentViewError(null, `Champ ${name} invalide.`);
  return {
    coordinates: [item.coordinates[0] as number, item.coordinates[1] as number],
    horizontal_uncertainty_m: item.horizontal_uncertainty_m,
  };
}

function geometry(value: unknown, name: string): Readonly<Record<string, unknown>> {
  const item = record(value);
  if (!item || typeof item.type !== 'string' || !Array.isArray(item.coordinates)) {
    throw new PublicIncidentViewError(null, `Géométrie ${name} invalide.`);
  }
  return item;
}

function parseView(value: unknown): PublicIncidentView {
  const root = record(value);
  if (!root || root.schema_version !== '1.0' || typeof root.fire_id !== 'string' || !VIEWER_MANIFEST_FIRE_ID_RE.test(root.fire_id)) throw new PublicIncidentViewError(null, 'La fiche publique ne respecte pas le contrat attendu.');
  const location = root.location === null ? null : point(root.location, 'location');
  const episodes = list(root.episodes, 'episodes').map((item) => {
    const itemRecord = record(item);
    if (!itemRecord || typeof itemRecord.episode_id !== 'string' || typeof itemRecord.ordinal !== 'number' || typeof itemRecord.status !== 'string' || typeof itemRecord.review_required !== 'boolean' || typeof itemRecord.is_current !== 'boolean' || typeof itemRecord.version !== 'number') throw new PublicIncidentViewError(null, 'Épisode public invalide.');
    if (typeof itemRecord.corroborating_source_count !== 'number' || typeof itemRecord.evacuation_established !== 'boolean' || typeof itemRecord.model_generation_eligible !== 'boolean') throw new PublicIncidentViewError(null, 'Épisode public invalide.');
    return { episode_id: itemRecord.episode_id, ordinal: itemRecord.ordinal, status: itemRecord.status, verification_state: string(itemRecord.verification_state, 'verification_state')!, corroborating_source_count: itemRecord.corroborating_source_count, evidence_basis_at: iso(itemRecord.evidence_basis_at, 'evidence_basis_at', true), estimated_area_ha: itemRecord.estimated_area_ha === null ? null : typeof itemRecord.estimated_area_ha === 'number' ? itemRecord.estimated_area_ha : (() => { throw new PublicIncidentViewError(null, 'Surface publique invalide.'); })(), evacuation_established: itemRecord.evacuation_established, model_generation_eligible: itemRecord.model_generation_eligible, review_required: itemRecord.review_required, started_at: iso(itemRecord.started_at, 'started_at')!, last_observed_at: iso(itemRecord.last_observed_at, 'last_observed_at')!, validated_at: iso(itemRecord.validated_at, 'validated_at', true), ended_at: iso(itemRecord.ended_at, 'ended_at', true), is_current: itemRecord.is_current, version: itemRecord.version };
  });
  const observations = list(root.observations, 'observations').map((item) => {
    const itemRecord = record(item);
    if (!itemRecord || typeof itemRecord.observation_id !== 'string' || typeof itemRecord.episode_id !== 'string' || typeof itemRecord.type !== 'string' || typeof itemRecord.uncertainty_m !== 'number' || (itemRecord.verification_state !== 'VERIFIED' && itemRecord.verification_state !== 'CORROBORATED') || !['GENERALIZED', 'EXACT', 'WITHHELD'].includes(String(itemRecord.spatial_mode))) throw new PublicIncidentViewError(null, 'Observation publique invalide.');
    return { observation_id: itemRecord.observation_id, episode_id: itemRecord.episode_id, type: itemRecord.type, observed_at: iso(itemRecord.observed_at, 'observed_at')!, received_at: iso(itemRecord.received_at, 'received_at')!, uncertainty_m: itemRecord.uncertainty_m, area_label: string(itemRecord.area_label, 'area_label', true), verification_state: itemRecord.verification_state as 'CORROBORATED' | 'VERIFIED', spatial_mode: itemRecord.spatial_mode as 'GENERALIZED' | 'EXACT' | 'WITHHELD' };
  });
  const evidenceProjections: PublicIncidentView['evidence_projections'][number][] = list(root.evidence_projections, 'evidence_projections').map((item) => {
    const itemRecord = record(item);
    if (!itemRecord || typeof itemRecord.projection_id !== 'string' || typeof itemRecord.episode_id !== 'string' || (itemRecord.kind !== 'validated_marker' && itemRecord.kind !== 'generalized_area') || (itemRecord.verification_state !== 'VERIFIED' && itemRecord.verification_state !== 'CORROBORATED') || typeof itemRecord.radius_m !== 'number' || !Number.isFinite(itemRecord.radius_m) || itemRecord.radius_m <= 0) throw new PublicIncidentViewError(null, 'Projection de preuve invalide.');
    return { projection_id: itemRecord.projection_id, episode_id: itemRecord.episode_id, kind: itemRecord.kind, verification_state: itemRecord.verification_state, center: point(itemRecord.center, 'evidence.center'), radius_m: itemRecord.radius_m, label: string(itemRecord.label, 'evidence.label')!, observed_at: iso(itemRecord.observed_at, 'evidence.observed_at', true) };
  });
  const activeZone = root.active_fire_zone == null ? null : (() => {
    const item = record(root.active_fire_zone);
    if (!item || typeof item.zone_revision_id !== 'string' || typeof item.revision !== 'number' || !Number.isInteger(item.revision) || item.revision < 1) {
      throw new PublicIncidentViewError(null, 'Périmètre public invalide.');
    }
    return {
      zone_revision_id: item.zone_revision_id,
      revision: item.revision,
      valid_at: iso(item.valid_at, 'active_fire_zone.valid_at')!,
      geometry_geojson: geometry(item.geometry_geojson, 'active_fire_zone.geometry_geojson'),
    };
  })();
  const parseAgentEvidence = (value: unknown) => {
    const item = record(value);
    if (!item || typeof item.evidence_kind !== 'string' || typeof item.evidence_id !== 'string') {
      throw new PublicIncidentViewError(null, 'Référence de preuve analysée invalide.');
    }
    const sourceReferenceUrl = string(item.source_reference_url, 'agent_evidence.source_reference_url', true);
    if (sourceReferenceUrl !== null && !sourceReferenceUrl.startsWith('https://')) {
      throw new PublicIncidentViewError(null, 'URL de provenance analysée invalide.');
    }
    return {
      evidence_kind: item.evidence_kind,
      evidence_id: item.evidence_id,
      source_annotation_id: string(item.source_annotation_id, 'agent_evidence.source_annotation_id', true),
      source_reference_url: sourceReferenceUrl,
      license_identifier: string(item.license_identifier, 'agent_evidence.license_identifier', true),
    };
  };
  const dailyIntelligence = list(root.daily_intelligence ?? [], 'daily_intelligence').map((item) => {
    const itemRecord = record(item);
    const report = record(itemRecord?.report);
    if (!itemRecord || typeof itemRecord.analysis_id !== 'string' || typeof itemRecord.episode_id !== 'string' || typeof itemRecord.local_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(itemRecord.local_date) || !report || typeof report.report_revision_id !== 'string' || typeof report.revision !== 'number' || !Number.isInteger(report.revision) || report.revision < 1 || typeof report.title !== 'string' || typeof report.body_markdown !== 'string') {
      throw new PublicIncidentViewError(null, 'Synthèse quotidienne publiée invalide.');
    }
    const facts = list(itemRecord.facts, 'daily_intelligence.facts').map((factValue) => {
      const fact = record(factValue);
      if (!fact || typeof fact.fact_id !== 'string' || typeof fact.category !== 'string' || typeof fact.fact_key !== 'string' || typeof fact.certainty !== 'string' || typeof fact.summary !== 'string') {
        throw new PublicIncidentViewError(null, 'Fait analysé public invalide.');
      }
      const valueNumber = fact.value_number === null ? null : typeof fact.value_number === 'number' && Number.isFinite(fact.value_number) ? fact.value_number : (() => { throw new PublicIncidentViewError(null, 'Valeur numérique analysée invalide.'); })();
      const valueText = string(fact.value_text, 'agent_fact.value_text', true);
      const valueBoolean = fact.value_boolean === null ? null : typeof fact.value_boolean === 'boolean' ? fact.value_boolean : (() => { throw new PublicIncidentViewError(null, 'Valeur booléenne analysée invalide.'); })();
      if ([valueNumber, valueText, valueBoolean].filter((entry) => entry !== null).length !== 1) {
        throw new PublicIncidentViewError(null, 'Valeur du fait analysé invalide.');
      }
      return {
        fact_id: fact.fact_id,
        category: fact.category,
        fact_key: fact.fact_key,
        as_of: iso(fact.as_of, 'agent_fact.as_of')!,
        certainty: fact.certainty,
        summary: fact.summary,
        value_number: valueNumber,
        value_text: valueText,
        value_boolean: valueBoolean,
        unit: string(fact.unit, 'agent_fact.unit', true),
        evidence: parseAgentEvidence(fact.evidence),
      };
    });
    const spatialResults = list(itemRecord.spatial_results, 'daily_intelligence.spatial_results').map((spatialValue) => {
      const spatial = record(spatialValue);
      const kind = String(spatial?.kind ?? '');
      if (!spatial || typeof spatial.proposal_id !== 'string' || !['active_fire_point', 'smoke_origin_point', 'visible_fire_front', 'probable_activity_envelope', 'burned_area_polygon'].includes(kind) || typeof spatial.geometry_origin !== 'string' || typeof spatial.horizontal_accuracy_m !== 'number' || !Number.isFinite(spatial.horizontal_accuracy_m) || spatial.horizontal_accuracy_m <= 0) {
        throw new PublicIncidentViewError(null, 'Résultat spatial analysé invalide.');
      }
      return {
        proposal_id: spatial.proposal_id,
        kind: kind as NonNullable<PublicIncidentView['daily_intelligence']>[number]['spatial_results'][number]['kind'],
        observed_at: iso(spatial.observed_at, 'agent_spatial.observed_at')!,
        geometry_geojson: geometry(spatial.geometry_geojson, 'agent_spatial.geometry_geojson'),
        geometry_origin: spatial.geometry_origin,
        horizontal_accuracy_m: spatial.horizontal_accuracy_m,
        evidence: parseAgentEvidence(spatial.evidence),
      };
    });
    return {
      analysis_id: itemRecord.analysis_id,
      episode_id: itemRecord.episode_id,
      local_date: itemRecord.local_date,
      published_at: iso(itemRecord.published_at, 'daily_intelligence.published_at')!,
      report: {
        report_revision_id: report.report_revision_id,
        revision: report.revision,
        title: report.title,
        body_markdown: report.body_markdown,
        reviewed_at: iso(report.reviewed_at, 'daily_intelligence.report.reviewed_at')!,
      },
      facts,
      spatial_results: spatialResults,
    };
  });
  const mapGallery = list(root.map_gallery ?? [], 'map_gallery').map((item) => {
    const itemRecord = record(item);
    if (!itemRecord || typeof itemRecord.capture_id !== 'string' || typeof itemRecord.zone_revision_id !== 'string' || typeof itemRecord.local_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(itemRecord.local_date) || typeof itemRecord.image_url !== 'string' || !itemRecord.image_url.startsWith(`/api/v1/incident/${root.fire_id}/map-gallery/`) || typeof itemRecord.width_px !== 'number' || itemRecord.width_px < 640 || typeof itemRecord.height_px !== 'number' || itemRecord.height_px < 360) {
      throw new PublicIncidentViewError(null, 'Capture cartographique publique invalide.');
    }
    return {
      capture_id: itemRecord.capture_id,
      zone_revision_id: itemRecord.zone_revision_id,
      local_date: itemRecord.local_date,
      captured_at: iso(itemRecord.captured_at, 'map_gallery.captured_at')!,
      image_url: itemRecord.image_url,
      width_px: itemRecord.width_px,
      height_px: itemRecord.height_px,
    };
  });
  const sources = list(root.sources, 'sources').map((item) => {
    const itemRecord = record(item);
    if (!itemRecord || typeof itemRecord.source_id !== 'string' || typeof itemRecord.type !== 'string' || typeof itemRecord.trust !== 'string' || typeof itemRecord.observation_count !== 'number') throw new PublicIncidentViewError(null, 'Source publique invalide.');
    return { source_id: itemRecord.source_id, type: itemRecord.type, name: string(itemRecord.name, 'name', true), trust: itemRecord.trust, license: string(itemRecord.license, 'license', true), external_reference: string(itemRecord.external_reference, 'external_reference', true), transformations: list(itemRecord.transformations, 'transformations').map((entry) => string(entry, 'transformation')!), observation_count: itemRecord.observation_count };
  });
  const officialResources = list(root.official_resources ?? [], 'official_resources').map((item) => {
    const itemRecord = record(item);
    if (!itemRecord || typeof itemRecord.resource_id !== 'string' || !['safety', 'press', 'official_update', 'authority'].includes(String(itemRecord.kind)) || typeof itemRecord.title !== 'string' || typeof itemRecord.publisher !== 'string' || typeof itemRecord.url !== 'string' || !itemRecord.url.startsWith('https://')) throw new PublicIncidentViewError(null, 'Relais officiel public invalide.');
    return { resource_id: itemRecord.resource_id, kind: itemRecord.kind as 'safety' | 'press' | 'official_update' | 'authority', title: itemRecord.title, publisher: itemRecord.publisher, url: itemRecord.url, published_at: iso(itemRecord.published_at, 'official_resource.published_at', true), episode_id: string(itemRecord.episode_id, 'official_resource.episode_id', true) };
  });
  const gallery = list(root.gallery ?? [], 'gallery').map((item) => {
    const itemRecord = record(item);
    if (!itemRecord || typeof itemRecord.gallery_item_id !== 'string' || typeof itemRecord.title !== 'string' || typeof itemRecord.alt_text !== 'string' || typeof itemRecord.media_url !== 'string' || !itemRecord.media_url.startsWith('https://') || (itemRecord.media_kind !== 'image' && itemRecord.media_kind !== 'video')) throw new PublicIncidentViewError(null, 'Élément de galerie public invalide.');
    return { gallery_item_id: itemRecord.gallery_item_id, title: itemRecord.title, caption: string(itemRecord.caption, 'gallery.caption', true), alt_text: itemRecord.alt_text, media_url: itemRecord.media_url, media_kind: itemRecord.media_kind as 'image' | 'video', credit: string(itemRecord.credit, 'gallery.credit', true), license_label: string(itemRecord.license_label, 'gallery.license_label', true), captured_at: iso(itemRecord.captured_at, 'gallery.captured_at', true), published_at: iso(itemRecord.published_at, 'gallery.published_at', true), episode_id: string(itemRecord.episode_id, 'gallery.episode_id', true) };
  });
  const operationalInformation = list(root.operational_information ?? [], 'operational_information').map((item) => {
    const itemRecord = record(item);
    const kind = String(itemRecord?.kind ?? '');
    const authorityKind = String(itemRecord?.authority_kind ?? '');
    if (!itemRecord || typeof itemRecord.information_id !== 'string' || !['affected_place', 'evacuated_people', 'mobilized_personnel', 'mobilized_vehicles', 'road_status', 'access_status', 'shelter', 'public_service', 'utility', 'other'].includes(kind) || typeof itemRecord.title !== 'string' || !['mairie', 'prefecture', 'police'].includes(authorityKind) || typeof itemRecord.authority_name !== 'string' || typeof itemRecord.source_url !== 'string' || !itemRecord.source_url.startsWith('https://')) throw new PublicIncidentViewError(null, 'Information opérationnelle publique invalide.');
    const valueText = string(itemRecord.value_text, 'operational_information.value_text', true);
    const valueNumber = itemRecord.value_number === null ? null : typeof itemRecord.value_number === 'number' && Number.isFinite(itemRecord.value_number) && itemRecord.value_number >= 0 ? itemRecord.value_number : (() => { throw new PublicIncidentViewError(null, 'Valeur opérationnelle invalide.'); })();
    if (valueText === null && valueNumber === null) throw new PublicIncidentViewError(null, 'Valeur opérationnelle absente.');
    return { information_id: itemRecord.information_id, kind: kind as NonNullable<PublicIncidentView['operational_information']>[number]['kind'], title: itemRecord.title, value_text: valueText, value_number: valueNumber, unit: string(itemRecord.unit, 'operational_information.unit', true), locality: string(itemRecord.locality, 'operational_information.locality', true), authority_kind: authorityKind as NonNullable<PublicIncidentView['operational_information']>[number]['authority_kind'], authority_name: itemRecord.authority_name, source_url: itemRecord.source_url, effective_at: iso(itemRecord.effective_at, 'operational_information.effective_at', true), published_at: iso(itemRecord.published_at, 'operational_information.published_at', true), episode_id: string(itemRecord.episode_id, 'operational_information.episode_id', true) };
  });
  const timeline = list(root.timeline, 'timeline').map((item) => {
    const itemRecord = record(item);
    if (!itemRecord || !['incident', 'episode', 'observation', 'model', 'operational'].includes(String(itemRecord.kind))) throw new PublicIncidentViewError(null, 'Événement public invalide.');
    return { occurred_at: iso(itemRecord.occurred_at, 'occurred_at')!, kind: itemRecord.kind as PublicIncidentView['timeline'][number]['kind'], label: string(itemRecord.label, 'label')!, episode_id: string(itemRecord.episode_id, 'episode_id', true) };
  });
  const model = record(root.model);
  if (!model || !['available', 'not_available', 'withheld'].includes(String(model.state)) || typeof model.public_download_available !== 'boolean') throw new PublicIncidentViewError(null, 'Métadonnées de modèle invalides.');
  const downloads: PublicIncidentView['downloads'][number][] = list(root.downloads, 'downloads').map((item) => {
    const itemRecord = record(item);
    if (!itemRecord || (itemRecord.id !== 'incident-json' && itemRecord.id !== 'timeline-csv') || (itemRecord.media_type !== 'application/json' && itemRecord.media_type !== 'text/csv')) throw new PublicIncidentViewError(null, 'Téléchargement public invalide.');
    return { id: itemRecord.id as 'incident-json' | 'timeline-csv', label: string(itemRecord.label, 'label')!, media_type: itemRecord.media_type as 'application/json' | 'text/csv', url: string(itemRecord.url, 'url')! };
  });
  const participatoryCount = (field: 'participatory_observation_count' | 'participatory_published_count' | 'participatory_received_count') => root[field] == null ? undefined : typeof root[field] === 'number' && Number.isInteger(root[field]) && root[field] >= 0 ? root[field] : (() => { throw new PublicIncidentViewError(null, 'Compteur participatif invalide.'); })();
  const participatoryObservationCount = participatoryCount('participatory_observation_count');
  const participatoryPublishedCount = participatoryCount('participatory_published_count');
  const participatoryReceivedCount = participatoryCount('participatory_received_count');
  return { schema_version: '1.0', fire_id: root.fire_id, canonical_name: string(root.canonical_name, 'canonical_name', true), public_note: string(root.public_note, 'public_note', true), status: string(root.status, 'status')!, verification: root.verification === 'verified' || root.verification === 'corroborated' || root.verification === 'review_required' ? root.verification : (() => { throw new PublicIncidentViewError(null, 'Vérification invalide.'); })(), freshness_at: iso(root.freshness_at, 'freshness_at')!, last_human_validation_at: iso(root.last_human_validation_at, 'last_human_validation_at', true), participatory_observation_count: participatoryObservationCount, participatory_published_count: participatoryPublishedCount, participatory_received_count: participatoryReceivedCount, location, facts: list(root.facts, 'facts').map((entry) => string(entry, 'fact')!), limitations: list(root.limitations, 'limitations').map((entry) => string(entry, 'limitation')!), episodes, observations, evidence_projections: evidenceProjections, active_fire_zone: activeZone, daily_intelligence: dailyIntelligence, map_gallery: mapGallery, gallery, official_resources: officialResources, operational_information: operationalInformation, sources, timeline, model: { state: model.state as PublicIncidentView['model']['state'], version: typeof model.version === 'number' ? model.version : null, sha256: string(model.sha256, 'sha256', true), size_bytes: typeof model.size_bytes === 'number' ? model.size_bytes : null, lod: string(model.lod, 'lod', true), terrain_source_year: typeof model.terrain_source_year === 'number' ? model.terrain_source_year : null, generated_at: iso(model.generated_at, 'generated_at', true), public_download_available: model.public_download_available, limitations: list(model.limitations, 'model limitation').map((entry) => string(entry, 'model limitation')!) }, downloads };
}

function baseUrl(fireId: string): string {
  const origin = getViewerManifestApiOrigin();
  if (!origin || !VIEWER_MANIFEST_FIRE_ID_RE.test(fireId)) throw new PublicIncidentViewError(null, 'La fiche détaillée publique n’est pas configurée.');
  return `${origin}/api/v1/incident/${encodeURIComponent(fireId)}`;
}

export async function loadPublicIncidentView(fireId: string, signal?: AbortSignal): Promise<PublicIncidentView> {
  let response: Response;
  try { response = await fetch(`${baseUrl(fireId)}/public-view`, { cache: 'no-store', credentials: 'omit', signal }); }
  catch (error) { if (error instanceof DOMException && error.name === 'AbortError') throw error; throw new PublicIncidentViewError(null, 'La fiche détaillée est inaccessible.'); }
  if (!response.ok) throw new PublicIncidentViewError(response.status, 'La fiche détaillée est indisponible.');
  return parseView(await response.json());
}

export async function submitPublicIncidentReport(fireId: string, input: { readonly category: PublicReportCategory; readonly message: string }): Promise<PublicIncidentReportReceipt> {
  const response = await fetch(`${baseUrl(fireId)}/reports`, { method: 'POST', cache: 'no-store', credentials: 'omit', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(input) });
  if (!response.ok) throw new PublicIncidentViewError(response.status, 'Le signalement n’a pas pu être transmis.');
  const payload = await response.json() as Partial<PublicIncidentReportReceipt>;
  if (typeof payload.receipt_id !== 'string' || payload.status !== 'received' || typeof payload.submitted_at !== 'string') {
    throw new PublicIncidentViewError(null, 'Le reçu du signalement est invalide.');
  }
  return {
    receipt_id: payload.receipt_id,
    status: payload.status,
    submitted_at: payload.submitted_at,
    replayed: payload.replayed === true,
  };
}

export function publicIncidentDownloadUrl(fireId: string, relativeUrl: string): string {
  const origin = getViewerManifestApiOrigin();
  if (!origin || !relativeUrl.startsWith(`/api/v1/incident/${fireId}/`)) throw new PublicIncidentViewError(null, 'Lien de téléchargement invalide.');
  return `${origin}${relativeUrl}`;
}
