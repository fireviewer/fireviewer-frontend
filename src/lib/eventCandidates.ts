import { upload } from "@vercel/blob/client";

import { getViewerManifestApiOrigin } from "./manifestClient";

export const EVENT_CANDIDATE_MAX_FILES = 20;
export const EVENT_CANDIDATE_MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const EVENT_CANDIDATE_MAX_VIDEO_BYTES = 500 * 1024 * 1024;
export const EVENT_CANDIDATE_MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;
export const EVENT_VIEWPOINT_MAX_ACCURACY_M = 50_000;
export const EVENT_VIEWPOINT_MIN_ALTITUDE_M = -500;
export const EVENT_VIEWPOINT_MAX_ALTITUDE_M = 10_000;

export type EvidenceMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "video/mp4"
  | "video/quicktime"
  | "video/webm";

export type ViewpointOrigin =
  | "USER_PLACED"
  | "DEVICE_GPS"
  | "NAMED_PLACE"
  | "OFFICIAL_SOURCE";

const EVIDENCE_EXTENSIONS: Readonly<
  Record<EvidenceMediaType, ReadonlySet<string>>
> = {
  "image/jpeg": new Set([".jpg", ".jpeg"]),
  "image/png": new Set([".png"]),
  "image/webp": new Set([".webp"]),
  "video/mp4": new Set([".mp4"]),
  "video/quicktime": new Set([".mov"]),
  "video/webm": new Set([".webm"]),
};

export type EventCandidateState =
  | "RECEIVED"
  | "QUEUED"
  | "ANALYZING"
  | "NEEDS_REVIEW"
  | "ABSTAINED"
  | "FAILED"
  | "VALIDATED"
  | "REJECTED";

export interface EventCandidateResponse {
  readonly candidate_id: string;
  readonly analysis_job_id: string;
  readonly tracking_id: string;
  readonly state: EventCandidateState;
  readonly incident_id: string | null;
  readonly incident_candidate_id: string | null;
  readonly observed_start_at: string;
  readonly observed_end_at: string | null;
  readonly message: string | null;
  readonly review_message: string | null;
  readonly evidence_asset_ids: readonly string[];
  readonly viewpoint: {
    readonly horizontal_accuracy_m: number;
    readonly origin: ViewpointOrigin;
    readonly has_orientation: boolean;
    readonly exact_position_withheld: true;
  };
  readonly created_at: string;
  readonly updated_at: string;
}

export interface EventCandidateListResponse {
  readonly items: readonly EventCandidateResponse[];
  readonly total: number;
}

export interface CreateEventCandidateInput {
  readonly idempotency_key: string;
  readonly incident_id?: string;
  readonly viewpoint: {
    readonly longitude: number;
    readonly latitude: number;
    readonly horizontal_accuracy_m: number;
    readonly altitude_m: number | null;
    readonly label: string | null;
    readonly yaw_deg: number | null;
    readonly fov_deg: number | null;
    readonly origin: "USER_PLACED";
  };
  readonly observed_time: {
    readonly start_at: string;
    readonly end_at: string | null;
  };
  readonly message: string | null;
  readonly evidence_asset_ids: readonly string[];
  readonly consent: {
    readonly analysis: true;
    readonly retention: true;
    readonly public_derivative: boolean;
  };
}

interface UploadAssetGrant {
  readonly evidence_asset_id: string;
  readonly pathname: string;
  readonly upload_state: string;
}

interface UploadOpening {
  readonly upload_id: string;
  readonly upload_grant: string | null;
  readonly client_payload: string;
  readonly expires_at: string | null;
  readonly assets: readonly UploadAssetGrant[];
}

interface UploadFinalization {
  readonly upload_id: string;
  readonly assets: readonly {
    readonly evidence_asset_id: string;
    readonly upload_state: string;
    readonly scan_state: string;
    readonly detected_media_type: EvidenceMediaType;
    readonly sha256: string;
  }[];
}

export interface EventCandidateRequestOptions {
  readonly accessToken: string;
  readonly fetchImpl?: typeof fetch;
  readonly apiOrigin?: string;
}

function apiOrigin(explicit?: string): string {
  const value = explicit ?? getViewerManifestApiOrigin();
  if (!value) throw new Error("L’API FireViewer v2 n’est pas configurée.");
  return value;
}

function requestErrorMessage(status: number): string {
  return status === 401
    ? "Votre session a expiré. Reconnectez-vous."
    : status === 403
      ? "Votre compte ne peut pas effectuer cette action."
      : status === 413
        ? "La contribution dépasse les limites de taille du service."
        : status === 415
          ? "Le type réel d’un média ne correspond pas au type déclaré."
          : status === 422
            ? "La contribution ne respecte pas le contrat événementiel."
            : `Le service événementiel a refusé la requête (${status}).`;
}

async function jsonRequest<T>(
  path: string,
  options: EventCandidateRequestOptions,
  init: RequestInit = {},
): Promise<T> {
  const response = await (options.fetchImpl ?? fetch)(
    `${apiOrigin(options.apiOrigin)}${path}`,
    {
      ...init,
      cache: "no-store",
      credentials: "omit",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${options.accessToken}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    },
  );
  if (!response.ok) {
    // Le détail distant peut contenir des informations privées ou internes. Le
    // frontend ne rend donc qu'un motif borné issu du statut HTTP.
    throw new Error(requestErrorMessage(response.status));
  }
  return response.json() as Promise<T>;
}

async function putLocalEvidenceAsset(
  uploadId: string,
  assetId: string,
  file: File,
  options: EventCandidateRequestOptions,
): Promise<void> {
  const response = await (options.fetchImpl ?? fetch)(
    `${apiOrigin(options.apiOrigin)}/api/v2/evidence/uploads/${encodeURIComponent(uploadId)}/assets/${encodeURIComponent(assetId)}`,
    {
      method: "PUT",
      cache: "no-store",
      credentials: "omit",
      headers: {
        Authorization: `Bearer ${options.accessToken}`,
        "Content-Type": file.type,
      },
      body: file,
    },
  );
  if (!response.ok) throw new Error(requestErrorMessage(response.status));
}

function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > -1 ? fileName.slice(dot).toLowerCase() : "";
}

function isEvidenceMediaType(value: string): value is EvidenceMediaType {
  return Object.hasOwn(EVIDENCE_EXTENSIONS, value);
}

export function validateEvidenceFiles(files: readonly File[]): string | null {
  if (files.length > EVENT_CANDIDATE_MAX_FILES)
    return "Une contribution accepte au maximum vingt médias.";
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  if (totalBytes > EVENT_CANDIDATE_MAX_TOTAL_BYTES)
    return "La contribution dépasse la limite totale de 2 Go.";
  for (const file of files) {
    if (!isEvidenceMediaType(file.type))
      return `${file.name} n’utilise pas un format média accepté.`;
    if (!EVIDENCE_EXTENSIONS[file.type].has(fileExtension(file.name)))
      return `${file.name} possède une extension incohérente avec son type média.`;
    if (file.size <= 0) return `${file.name} est vide.`;
    if (
      file.type.startsWith("image/") &&
      file.size > EVENT_CANDIDATE_MAX_IMAGE_BYTES
    )
      return `${file.name} dépasse la limite de 25 Mo par image.`;
    if (
      file.type.startsWith("video/") &&
      file.size > EVENT_CANDIDATE_MAX_VIDEO_BYTES
    )
      return `${file.name} dépasse la limite de 500 Mo par vidéo.`;
  }
  return null;
}

export interface EventViewpointValidationInput {
  readonly longitude: number | null;
  readonly latitude: number | null;
  readonly horizontalAccuracyM: number;
  readonly altitudeM: number | null;
  readonly yawDeg: number | null;
  readonly fovDeg: number | null;
}

export function validateEventViewpoint(
  input: EventViewpointValidationInput,
): string | null {
  if (
    input.longitude === null ||
    input.latitude === null ||
    !Number.isFinite(input.longitude) ||
    !Number.isFinite(input.latitude)
  )
    return "Placez le point de prise de vue sur la carte.";
  if (
    input.longitude < -180 ||
    input.longitude > 180 ||
    input.latitude < -90 ||
    input.latitude > 90
  )
    return "Les coordonnées du point de prise de vue sont invalides.";
  if (
    !Number.isFinite(input.horizontalAccuracyM) ||
    input.horizontalAccuracyM <= 0 ||
    input.horizontalAccuracyM > EVENT_VIEWPOINT_MAX_ACCURACY_M
  )
    return "La précision horizontale doit être comprise entre 1 et 50 000 mètres.";
  if (
    input.altitudeM !== null &&
    (!Number.isFinite(input.altitudeM) ||
      input.altitudeM < EVENT_VIEWPOINT_MIN_ALTITUDE_M ||
      input.altitudeM > EVENT_VIEWPOINT_MAX_ALTITUDE_M)
  )
    return "L’altitude doit être comprise entre -500 et 10 000 mètres.";
  if (
    input.yawDeg !== null &&
    (!Number.isFinite(input.yawDeg) || input.yawDeg < 0 || input.yawDeg >= 360)
  )
    return "La direction doit être comprise entre 0° inclus et 360° exclu.";
  if (
    input.fovDeg !== null &&
    (!Number.isFinite(input.fovDeg) || input.fovDeg <= 0 || input.fovDeg >= 180)
  )
    return "Le champ de vision doit être strictement compris entre 0° et 180°.";
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

const EVENT_CANDIDATE_STATES = new Set<EventCandidateState>([
  "RECEIVED",
  "QUEUED",
  "ANALYZING",
  "NEEDS_REVIEW",
  "ABSTAINED",
  "FAILED",
  "VALIDATED",
  "REJECTED",
]);
const VIEWPOINT_ORIGINS = new Set<ViewpointOrigin>([
  "USER_PLACED",
  "DEVICE_GPS",
  "NAMED_PLACE",
  "OFFICIAL_SOURCE",
]);

function parseEventCandidateResponse(value: unknown): EventCandidateResponse {
  if (!isRecord(value) || !isRecord(value.viewpoint))
    throw new Error("La réponse du suivi événementiel est invalide.");
  const viewpoint = value.viewpoint;
  const stringFields = [
    "candidate_id",
    "analysis_job_id",
    "tracking_id",
    "observed_start_at",
    "created_at",
    "updated_at",
  ] as const;
  if (
    stringFields.some(
      (field) => typeof value[field] !== "string" || value[field].length === 0,
    )
  )
    throw new Error("La réponse du suivi événementiel est invalide.");
  if (
    !isNullableString(value.incident_id) ||
    !isNullableString(value.incident_candidate_id) ||
    !isNullableString(value.observed_end_at) ||
    !isNullableString(value.message) ||
    !isNullableString(value.review_message)
  )
    throw new Error("La réponse du suivi événementiel est invalide.");
  if (
    typeof value.state !== "string" ||
    !EVENT_CANDIDATE_STATES.has(value.state as EventCandidateState)
  )
    throw new Error("La réponse du suivi événementiel est invalide.");
  if (
    !Array.isArray(value.evidence_asset_ids) ||
    value.evidence_asset_ids.some((assetId) => typeof assetId !== "string")
  )
    throw new Error("La réponse du suivi événementiel est invalide.");
  if (
    typeof viewpoint.horizontal_accuracy_m !== "number" ||
    !Number.isFinite(viewpoint.horizontal_accuracy_m) ||
    typeof viewpoint.origin !== "string" ||
    !VIEWPOINT_ORIGINS.has(viewpoint.origin as ViewpointOrigin) ||
    typeof viewpoint.has_orientation !== "boolean" ||
    viewpoint.exact_position_withheld !== true
  ) {
    throw new Error("La réponse du suivi événementiel est invalide.");
  }
  return value as unknown as EventCandidateResponse;
}

function parseEventCandidateListResponse(
  value: unknown,
): EventCandidateListResponse {
  if (
    !isRecord(value) ||
    !Array.isArray(value.items) ||
    !Number.isInteger(value.total) ||
    Number(value.total) < 0
  )
    throw new Error("La liste du suivi événementiel est invalide.");
  return {
    items: value.items.map(parseEventCandidateResponse),
    total: Number(value.total),
  };
}

export async function createEvidenceAssets(
  files: readonly File[],
  options: EventCandidateRequestOptions,
  onProgress?: (completed: number, total: number) => void,
): Promise<readonly string[]> {
  const validation = validateEvidenceFiles(files);
  if (validation) throw new Error(validation);
  if (!files.length) return [];
  const endpoint = "/api/v2/evidence/uploads";
  const opening = await jsonRequest<UploadOpening>(endpoint, options, {
    method: "POST",
    body: JSON.stringify({
      files: files.map((file) => ({
        file_name: file.name,
        media_type: file.type,
        size_bytes: file.size,
      })),
    }),
  });
  if (opening.assets.length !== files.length)
    throw new Error("Le registre de preuves n’a pas réservé tous les médias.");

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const asset = opening.assets[index];
    if (asset.upload_state !== "PENDING_UPLOAD")
      throw new Error(
        "Le registre de preuves a retourné un état d’envoi inattendu.",
      );
    if (!opening.upload_grant) {
      await putLocalEvidenceAsset(
        opening.upload_id,
        asset.evidence_asset_id,
        file,
        options,
      );
    } else {
      if (!opening.client_payload)
        throw new Error(
          "Le stockage privé n’a pas fourni le contexte d’envoi attendu.",
        );
      const stored = await upload(asset.pathname, file, {
        access: "private",
        handleUploadUrl: `${apiOrigin(options.apiOrigin)}${endpoint}`,
        headers: {
          Authorization: `Bearer ${options.accessToken}`,
          "X-Evidence-Upload-Grant": opening.upload_grant,
          "X-Evidence-Upload-Id": opening.upload_id,
        },
        clientPayload: opening.client_payload,
        contentType: file.type,
        multipart: true,
      });
      if (stored.pathname !== asset.pathname)
        throw new Error(
          "Le stockage a retourné un chemin de preuve inattendu.",
        );
    }
    onProgress?.(index + 1, files.length);
  }
  const assetIds = opening.assets.map((asset) => asset.evidence_asset_id);

  const finalized = await jsonRequest<UploadFinalization>(
    `${endpoint}/${encodeURIComponent(opening.upload_id)}/finalize`,
    options,
    {
      method: "POST",
      body: JSON.stringify({ evidence_asset_ids: assetIds }),
    },
  );
  const finalStates = new Map(
    finalized.assets.map((asset) => [asset.evidence_asset_id, asset]),
  );
  if (
    finalized.upload_id !== opening.upload_id ||
    assetIds.some((assetId) => {
      const state = finalStates.get(assetId);
      return state?.upload_state !== "VERIFIED" || state.scan_state !== "CLEAN";
    })
  ) {
    throw new Error(
      "Au moins un média n’a pas passé le contrôle d’intégrité et le scan antivirus.",
    );
  }
  return assetIds;
}

export async function createEventCandidate(
  input: CreateEventCandidateInput,
  options: EventCandidateRequestOptions,
): Promise<EventCandidateResponse> {
  const response = await jsonRequest<unknown>(
    "/api/v2/event-candidates",
    options,
    {
      method: "POST",
      headers: { "Idempotency-Key": input.idempotency_key },
      body: JSON.stringify(input),
    },
  );
  return parseEventCandidateResponse(response);
}

export async function getMyEventCandidate(
  candidateId: string,
  options: EventCandidateRequestOptions,
): Promise<EventCandidateResponse> {
  const response = await jsonRequest<unknown>(
    `/api/v2/me/event-candidates/${encodeURIComponent(candidateId)}`,
    options,
  );
  return parseEventCandidateResponse(response);
}

export async function listMyEventCandidates(
  options: EventCandidateRequestOptions,
): Promise<EventCandidateListResponse> {
  const response = await jsonRequest<unknown>(
    "/api/v2/me/event-candidates",
    options,
  );
  return parseEventCandidateListResponse(response);
}
