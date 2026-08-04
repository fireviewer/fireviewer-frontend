import type { FireViewerElevatedRole } from "../auth/SupabaseAuthContext";
import type { EventCandidateState, ViewpointOrigin } from "./eventCandidates";
import { getViewerManifestApiOrigin } from "./manifestClient";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type FireActivityEventState =
  | "DRAFT"
  | "ANALYST_VALIDATED"
  | "EDITOR_PUBLISHED"
  | "SUPERSEDED"
  | "RETRACTED";

export interface InternalEvidenceAsset {
  readonly evidence_asset_id: string;
  readonly file_name: string;
  readonly media_type: string;
  readonly size_bytes: number;
  readonly state: string;
  readonly scan_state: string;
}

export interface InternalLocalizationAttempt {
  readonly attempt_id: string;
  readonly state: string;
  readonly method: string | null;
  readonly model_id: string | null;
  readonly model_revision: string | null;
  readonly view_profile: string | null;
  readonly anchor: JsonValue;
  readonly geometry: JsonValue;
  readonly uncertainty: JsonValue;
  readonly horizontal_uncertainty_m: number | null;
  readonly abstention_reason: string | null;
  readonly provenance: JsonValue;
}

export interface InternalFireActivityEvent {
  readonly event_id: string;
  readonly state: FireActivityEventState;
  readonly phenomenon_kind: string;
  readonly geometry: JsonValue;
  readonly uncertainty: JsonValue;
  readonly method: string | null;
  readonly version: number;
}

export interface InternalEventCandidate {
  readonly candidate_id: string;
  readonly state: EventCandidateState;
  readonly incident_id: string | null;
  readonly incident_candidate_id: string | null;
  readonly owner_subject: string;
  readonly observed_start_at: string;
  readonly observed_end_at: string | null;
  readonly message: string | null;
  readonly review_message: string | null;
  readonly review_context: JsonValue;
  readonly state_history: readonly JsonValue[];
  readonly viewpoint: {
    readonly longitude: number;
    readonly latitude: number;
    readonly horizontal_accuracy_m: number;
    readonly altitude_m: number | null;
    readonly label: string | null;
    readonly yaw_deg: number | null;
    readonly fov_deg: number | null;
    readonly origin: ViewpointOrigin;
  };
  readonly evidence_assets: readonly InternalEvidenceAsset[];
  readonly localization_attempts: readonly InternalLocalizationAttempt[];
  readonly fire_activity_events: readonly InternalFireActivityEvent[];
  readonly analysis_job: {
    readonly job_id: string;
    readonly state: string;
    readonly result_summary: JsonValue;
    readonly last_error_code: string | null;
  };
  readonly created_at: string;
  readonly updated_at: string;
}

export interface InternalEventCandidateList {
  readonly items: readonly InternalEventCandidate[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface EventReviewPermissions {
  readonly canRead: boolean;
  readonly canAnalyze: boolean;
  readonly canPublish: boolean;
}

export function eventReviewPermissions(
  roles: readonly FireViewerElevatedRole[],
): EventReviewPermissions {
  return {
    canRead: roles.some((role) =>
      ["analyst", "editor", "security_operator", "administrator"].includes(
        role,
      ),
    ),
    canAnalyze: roles.includes("analyst") || roles.includes("administrator"),
    canPublish: roles.includes("editor") || roles.includes("administrator"),
  };
}

export interface EventReviewListQuery {
  readonly state?: EventCandidateState;
  readonly limit?: number;
  readonly offset?: number;
}

export interface EventReviewMutationResult {
  readonly candidate_id?: string;
  readonly event_id?: string;
  readonly state: string;
  readonly version: number;
}

export interface EventReviewApi {
  readonly listCandidates: (
    accessToken: string,
    query?: EventReviewListQuery,
    signal?: AbortSignal,
  ) => Promise<InternalEventCandidateList>;
  readonly getCandidate: (
    accessToken: string,
    candidateId: string,
    signal?: AbortSignal,
  ) => Promise<InternalEventCandidate>;
  readonly getEvidenceContent: (
    accessToken: string,
    evidenceAssetId: string,
    signal?: AbortSignal,
  ) => Promise<Blob>;
  readonly reviewCandidate: (
    accessToken: string,
    candidateId: string,
    action: "reject" | "request_evidence" | "mark_contradictory",
    reason: string,
  ) => Promise<EventReviewMutationResult>;
  readonly attachIncident: (
    accessToken: string,
    candidateId: string,
    incidentId: string,
    reason: string,
  ) => Promise<EventReviewMutationResult>;
  readonly transitionEvent: (
    accessToken: string,
    eventId: string,
    action: "validate" | "reject" | "publish",
    reason: string,
  ) => Promise<EventReviewMutationResult>;
}

interface EventReviewApiOptions {
  readonly apiOrigin?: string;
  readonly fetchImpl?: typeof fetch;
}

const EVENT_STATES = new Set<EventCandidateState>([
  "RECEIVED",
  "QUEUED",
  "ANALYZING",
  "NEEDS_REVIEW",
  "ABSTAINED",
  "FAILED",
  "VALIDATED",
  "REJECTED",
]);
const EVENT_ACTIVITY_STATES = new Set<FireActivityEventState>([
  "DRAFT",
  "ANALYST_VALIDATED",
  "EDITOR_PUBLISHED",
  "SUPERSEDED",
  "RETRACTED",
]);
const VIEWPOINT_ORIGINS = new Set<ViewpointOrigin>([
  "USER_PLACED",
  "DEVICE_GPS",
  "NAMED_PLACE",
  "OFFICIAL_SOURCE",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  )
    return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value)
    throw new Error("Réponse interne v2 invalide.");
  return value;
}

function nullableString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  if (value === null) return null;
  if (typeof value !== "string")
    throw new Error("Réponse interne v2 invalide.");
  return value;
}

function requiredNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error("Réponse interne v2 invalide.");
  return value;
}

function nullableNumber(
  record: Record<string, unknown>,
  key: string,
): number | null {
  const value = record[key];
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error("Réponse interne v2 invalide.");
  return value;
}

function jsonValue(record: Record<string, unknown>, key: string): JsonValue {
  const value = record[key];
  if (!isJsonValue(value)) throw new Error("Réponse interne v2 invalide.");
  return value;
}

function parseEvidenceAsset(value: unknown): InternalEvidenceAsset {
  if (!isRecord(value)) throw new Error("Réponse interne v2 invalide.");
  return {
    evidence_asset_id: requiredString(value, "evidence_asset_id"),
    file_name: requiredString(value, "file_name"),
    media_type: requiredString(value, "media_type"),
    size_bytes: requiredNumber(value, "size_bytes"),
    state: requiredString(value, "state"),
    scan_state: requiredString(value, "scan_state"),
  };
}

function parseLocalizationAttempt(value: unknown): InternalLocalizationAttempt {
  if (!isRecord(value)) throw new Error("Réponse interne v2 invalide.");
  return {
    attempt_id: requiredString(value, "attempt_id"),
    state: requiredString(value, "state"),
    method: nullableString(value, "method"),
    model_id: nullableString(value, "model_id"),
    model_revision: nullableString(value, "model_revision"),
    view_profile: nullableString(value, "view_profile"),
    anchor: jsonValue(value, "anchor"),
    geometry: jsonValue(value, "geometry"),
    uncertainty: jsonValue(value, "uncertainty"),
    horizontal_uncertainty_m: nullableNumber(value, "horizontal_uncertainty_m"),
    abstention_reason: nullableString(value, "abstention_reason"),
    provenance: jsonValue(value, "provenance"),
  };
}

function parseActivityEvent(value: unknown): InternalFireActivityEvent {
  if (!isRecord(value)) throw new Error("Réponse interne v2 invalide.");
  const state = requiredString(value, "state");
  if (!EVENT_ACTIVITY_STATES.has(state as FireActivityEventState))
    throw new Error("Réponse interne v2 invalide.");
  return {
    event_id: requiredString(value, "event_id"),
    state: state as FireActivityEventState,
    phenomenon_kind: requiredString(value, "phenomenon_kind"),
    geometry: jsonValue(value, "geometry"),
    uncertainty: jsonValue(value, "uncertainty"),
    method: nullableString(value, "method"),
    version: requiredNumber(value, "version"),
  };
}

export function parseInternalEventCandidate(
  value: unknown,
): InternalEventCandidate {
  if (
    !isRecord(value) ||
    !isRecord(value.viewpoint) ||
    !isRecord(value.analysis_job) ||
    !Array.isArray(value.evidence_assets) ||
    !Array.isArray(value.localization_attempts) ||
    !Array.isArray(value.fire_activity_events) ||
    !Array.isArray(value.state_history) ||
    !value.state_history.every(isJsonValue)
  )
    throw new Error("Réponse interne v2 invalide.");
  const state = requiredString(value, "state");
  const origin = requiredString(value.viewpoint, "origin");
  if (
    !EVENT_STATES.has(state as EventCandidateState) ||
    !VIEWPOINT_ORIGINS.has(origin as ViewpointOrigin)
  ) {
    throw new Error("Réponse interne v2 invalide.");
  }
  return {
    candidate_id: requiredString(value, "candidate_id"),
    state: state as EventCandidateState,
    incident_id: nullableString(value, "incident_id"),
    incident_candidate_id: nullableString(value, "incident_candidate_id"),
    owner_subject: requiredString(value, "owner_subject"),
    observed_start_at: requiredString(value, "observed_start_at"),
    observed_end_at: nullableString(value, "observed_end_at"),
    message: nullableString(value, "message"),
    review_message: nullableString(value, "review_message"),
    review_context: jsonValue(value, "review_context"),
    state_history: value.state_history,
    viewpoint: {
      longitude: requiredNumber(value.viewpoint, "longitude"),
      latitude: requiredNumber(value.viewpoint, "latitude"),
      horizontal_accuracy_m: requiredNumber(
        value.viewpoint,
        "horizontal_accuracy_m",
      ),
      altitude_m: nullableNumber(value.viewpoint, "altitude_m"),
      label: nullableString(value.viewpoint, "label"),
      yaw_deg: nullableNumber(value.viewpoint, "yaw_deg"),
      fov_deg: nullableNumber(value.viewpoint, "fov_deg"),
      origin: origin as ViewpointOrigin,
    },
    evidence_assets: value.evidence_assets.map(parseEvidenceAsset),
    localization_attempts: value.localization_attempts.map(
      parseLocalizationAttempt,
    ),
    fire_activity_events: value.fire_activity_events.map(parseActivityEvent),
    analysis_job: {
      job_id: requiredString(value.analysis_job, "job_id"),
      state: requiredString(value.analysis_job, "state"),
      result_summary: jsonValue(value.analysis_job, "result_summary"),
      last_error_code: nullableString(value.analysis_job, "last_error_code"),
    },
    created_at: requiredString(value, "created_at"),
    updated_at: requiredString(value, "updated_at"),
  };
}

function parseCandidateList(value: unknown): InternalEventCandidateList {
  if (
    !isRecord(value) ||
    !Array.isArray(value.items) ||
    !Number.isInteger(value.total) ||
    !Number.isInteger(value.limit) ||
    !Number.isInteger(value.offset)
  )
    throw new Error("Liste interne v2 invalide.");
  return {
    items: value.items.map(parseInternalEventCandidate),
    total: Number(value.total),
    limit: Number(value.limit),
    offset: Number(value.offset),
  };
}

function parseMutationResult(value: unknown): EventReviewMutationResult {
  if (!isRecord(value)) throw new Error("Réponse de mutation v2 invalide.");
  const candidateId = value.candidate_id;
  const eventId = value.event_id;
  if (
    (typeof candidateId !== "string" && typeof eventId !== "string") ||
    (candidateId !== undefined && typeof candidateId !== "string") ||
    (eventId !== undefined && typeof eventId !== "string") ||
    typeof value.state !== "string" ||
    !Number.isInteger(value.version)
  ) {
    throw new Error("Réponse de mutation v2 invalide.");
  }
  return {
    ...(typeof candidateId === "string" ? { candidate_id: candidateId } : {}),
    ...(typeof eventId === "string" ? { event_id: eventId } : {}),
    state: value.state,
    version: Number(value.version),
  };
}

function safeRequestMessage(status: number): string {
  if (status === 401) return "La session interne a expiré.";
  if (status === 403) return "Votre rôle ne permet pas cette opération.";
  if (status === 404)
    return "La ressource v2 demandée est introuvable ou désactivée.";
  if (status === 409)
    return "L’état de la ressource ne permet plus cette opération.";
  if (status === 422)
    return "La justification ou la cible ne respecte pas le contrat v2.";
  return `Le service interne v2 a refusé la requête (${status}).`;
}

function resolveOrigin(explicit?: string): string {
  const origin = explicit ?? getViewerManifestApiOrigin();
  if (!origin) throw new Error("L’API FireViewer v2 n’est pas configurée.");
  return origin.replace(/\/$/, "");
}

async function checkedResponse(
  response: Response,
  parseJson: boolean,
): Promise<unknown> {
  if (!response.ok) throw new Error(safeRequestMessage(response.status));
  return parseJson ? response.json() : response.blob();
}

export function createEventReviewApi(
  options: EventReviewApiOptions = {},
): EventReviewApi {
  const fetchImpl = options.fetchImpl ?? fetch;
  const origin = resolveOrigin(options.apiOrigin);
  const request = async (
    path: string,
    accessToken: string,
    init: RequestInit = {},
    parseJson = true,
  ): Promise<unknown> => {
    const response = await fetchImpl(`${origin}${path}`, {
      ...init,
      cache: "no-store",
      credentials: "omit",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(parseJson ? { Accept: "application/json" } : {}),
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    return checkedResponse(response, parseJson);
  };

  return {
    async listCandidates(accessToken, query = {}, signal) {
      const params = new URLSearchParams({
        state: query.state ?? "NEEDS_REVIEW",
        limit: String(query.limit ?? 50),
        offset: String(query.offset ?? 0),
      });
      return parseCandidateList(
        await request(
          `/api/v2/internal/event-candidates?${params}`,
          accessToken,
          { signal },
        ),
      );
    },
    async getCandidate(accessToken, candidateId, signal) {
      return parseInternalEventCandidate(
        await request(
          `/api/v2/internal/event-candidates/${encodeURIComponent(candidateId)}`,
          accessToken,
          { signal },
        ),
      );
    },
    async getEvidenceContent(accessToken, evidenceAssetId, signal) {
      return (await request(
        `/api/v2/internal/evidence-assets/${encodeURIComponent(evidenceAssetId)}/content`,
        accessToken,
        { signal },
        false,
      )) as Blob;
    },
    async reviewCandidate(accessToken, candidateId, action, reason) {
      return parseMutationResult(
        await request(
          `/api/v2/internal/event-candidates/${encodeURIComponent(candidateId)}/review`,
          accessToken,
          { method: "POST", body: JSON.stringify({ action, reason }) },
        ),
      );
    },
    async attachIncident(accessToken, candidateId, incidentId, reason) {
      return parseMutationResult(
        await request(
          `/api/v2/internal/event-candidates/${encodeURIComponent(candidateId)}/attach-incident`,
          accessToken,
          {
            method: "POST",
            body: JSON.stringify({ incident_id: incidentId, reason }),
          },
        ),
      );
    },
    async transitionEvent(accessToken, eventId, action, reason) {
      return parseMutationResult(
        await request(
          `/api/v2/internal/fire-activity-events/${encodeURIComponent(eventId)}/${action}`,
          accessToken,
          { method: "POST", body: JSON.stringify({ reason }) },
        ),
      );
    },
  };
}
