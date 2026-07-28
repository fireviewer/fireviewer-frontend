import { upload } from '@vercel/blob/client';

import { getViewerManifestApiOrigin } from './manifestClient';

const TRACKING_STORAGE_KEY = 'fw:public-contribution-tracking:v1';

export type PublicContributionState =
  | 'OPEN'
  | 'PENDING'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'PURGED';

export interface PublicContributionStatus {
  readonly contribution_id: string;
  readonly kind: 'new_fire' | 'incident_evidence';
  readonly fire_id: string | null;
  readonly state: PublicContributionState;
  readonly received_at: string | null;
  readonly reviewed_at: string | null;
  readonly review_reason: string | null;
  readonly purge_after: string;
  readonly media_count: number;
  readonly location_label: string | null;
  readonly observation_type: string;
  readonly observed_at: string;
  readonly version: number;
}

export interface PublicContributionInput {
  readonly kind: 'new_fire' | 'incident_evidence';
  readonly fire_id?: string;
  readonly location: {
    readonly mode: 'place' | 'device' | 'manual';
    readonly label: string | null;
    readonly latitude: number | null;
    readonly longitude: number | null;
    readonly uncertainty_m: number | null;
  };
  readonly observation: {
    readonly observation_type: string;
    readonly observed_at: string;
    readonly direct_observation: boolean;
    readonly description: string;
  };
  readonly media: {
    readonly file: File;
    readonly captured_at: string | null;
    readonly direction: string | null;
  } | null;
  readonly consents: {
    readonly private_analysis: true;
    readonly retain_evidence: boolean;
    readonly public_display: boolean;
    readonly spatial_display: boolean;
  };
  readonly contact_email: string | null;
}

interface OpenResponse {
  readonly contribution_id: string;
  readonly state: PublicContributionState;
  readonly tracking_token: string;
  readonly upload: {
    readonly package_id: string;
    readonly pathname_prefix: string;
    readonly upload_grant: string;
    readonly maximum_file_size_bytes: number;
    readonly allowed_content_types: readonly string[];
  } | null;
}

interface ContributionEnvelope {
  readonly contribution: PublicContributionStatus;
}

function apiOrigin(): string {
  const origin = getViewerManifestApiOrigin();
  if (!origin) throw new Error('Le service public de contribution est indisponible.');
  return origin;
}

function trackingRecords(): Record<string, string> {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(TRACKING_STORAGE_KEY) || '{}') as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, string>
      : {};
  } catch {
    return {};
  }
}

function saveTrackingToken(contributionId: string, token: string): void {
  const records = trackingRecords();
  records[contributionId] = token;
  sessionStorage.setItem(TRACKING_STORAGE_KEY, JSON.stringify(records));
}

function trackingToken(contributionId: string): string | null {
  return trackingRecords()[contributionId] || null;
}

function safeFilename(filename: string): string {
  const normalized = filename.normalize('NFKD').replace(/[^\w.-]+/g, '-');
  return normalized.slice(-180) || 'preuve';
}

async function jsonRequest<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const problem = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(problem?.detail || `Le service a refusé la contribution (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

export async function submitPublicContribution(
  input: PublicContributionInput,
  onProgress?: (percentage: number) => void,
): Promise<PublicContributionStatus> {
  const origin = apiOrigin();
  const media = input.media;
  const opened = await jsonRequest<OpenResponse>(`${origin}/api/v1/contributions/open`, {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({
      kind: input.kind,
      fire_id: input.fire_id ?? null,
      location: input.location,
      observation: input.observation,
      media: media ? {
        filename: media.file.name,
        content_type: media.file.type,
        size_bytes: media.file.size,
        captured_at: media.captured_at,
        direction: media.direction,
      } : null,
      consents: input.consents,
      contact_email: input.contact_email,
    }),
  });
  saveTrackingToken(opened.contribution_id, opened.tracking_token);

  if (media) {
    if (!opened.upload) throw new Error('L’autorisation privée d’envoi est absente.');
    if (
      media.file.size > opened.upload.maximum_file_size_bytes
      || !opened.upload.allowed_content_types.includes(media.file.type)
    ) {
      throw new Error('Le fichier ne respecte pas les limites annoncées par le serveur.');
    }
    const pathname = `${opened.upload.pathname_prefix}/0001-${safeFilename(media.file.name)}`;
    const uploaded = await upload(pathname, media.file, {
      access: 'private',
      handleUploadUrl: `${origin}/api/v1/contributions/blob-upload-token`,
      headers: { 'X-Blob-Upload-Grant': opened.upload.upload_grant },
      clientPayload: opened.upload.package_id,
      contentType: media.file.type,
      multipart: true,
      onUploadProgress: ({ percentage }) => onProgress?.(Math.round(percentage)),
    });
    if (uploaded.pathname !== pathname) {
      throw new Error('Le stockage a retourné un chemin différent de celui autorisé.');
    }
  }

  const finalized = await jsonRequest<ContributionEnvelope>(
    `${origin}/api/v1/contributions/${encodeURIComponent(opened.contribution_id)}/finalize`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${opened.tracking_token}` },
    },
  );
  return finalized.contribution;
}

export async function getPublicContribution(
  contributionId: string,
): Promise<PublicContributionStatus> {
  const token = trackingToken(contributionId);
  if (!token) throw new Error('Le jeton de suivi privé est absent de cette session.');
  const result = await jsonRequest<ContributionEnvelope>(
    `${apiOrigin()}/api/v1/contributions/${encodeURIComponent(contributionId)}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  return result.contribution;
}
