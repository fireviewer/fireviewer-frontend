import { beforeEach, describe, expect, it, vi } from "vitest";

const uploadMock = vi.hoisted(() => vi.fn());
vi.mock("@vercel/blob/client", () => ({ upload: uploadMock }));

import {
  createEvidenceAssets,
  createEventCandidate,
  getMyEventCandidate,
  listMyEventCandidates,
  validateEventViewpoint,
  validateEvidenceFiles,
  type CreateEventCandidateInput,
  type EventCandidateResponse,
} from "./eventCandidates";

function file(name: string, type: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type });
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const CANDIDATE = {
  candidate_id: "EC-candidate-1",
  analysis_job_id: "AJ-job-1",
  tracking_id: "EC-candidate-1",
  state: "QUEUED",
  incident_id: null,
  incident_candidate_id: "IC-private-1",
  observed_start_at: "2026-08-03T12:00:00Z",
  observed_end_at: null,
  message: "Une fumée est visible au loin.",
  review_message: null,
  evidence_asset_ids: [],
  viewpoint: {
    horizontal_accuracy_m: 25,
    origin: "USER_PLACED",
    has_orientation: false,
    exact_position_withheld: true,
  },
  created_at: "2026-08-03T12:00:01Z",
  updated_at: "2026-08-03T12:00:01Z",
} satisfies EventCandidateResponse;

const INPUT: CreateEventCandidateInput = {
  idempotency_key: "123e4567-e89b-12d3-a456-426614174000",
  viewpoint: {
    longitude: 6.1,
    latitude: 43.2,
    horizontal_accuracy_m: 25,
    altitude_m: null,
    label: null,
    yaw_deg: null,
    fov_deg: null,
    origin: "USER_PLACED",
  },
  observed_time: { start_at: "2026-08-03T12:00:00.000Z", end_at: null },
  message: "Une fumée est visible au loin.",
  evidence_asset_ids: [],
  consent: { analysis: true, retention: true, public_derivative: false },
};

function finalizedUpload() {
  return {
    upload_id: "upload-1",
    assets: [
      {
        evidence_asset_id: "asset-1",
        upload_state: "VERIFIED",
        scan_state: "CLEAN",
        detected_media_type: "image/jpeg",
        sha256: "a".repeat(64),
      },
    ],
  };
}

describe("event candidates API v2", () => {
  beforeEach(() => uploadMock.mockReset());

  it("applique la whitelist MIME, l’extension cohérente et les limites de fichiers", () => {
    expect(
      validateEvidenceFiles([file("photo.JPG", "image/jpeg", 128)]),
    ).toBeNull();
    expect(
      validateEvidenceFiles([file("image.webp", "image/webp", 128)]),
    ).toBeNull();
    expect(
      validateEvidenceFiles([file("sequence.mov", "video/quicktime", 128)]),
    ).toBeNull();
    expect(
      validateEvidenceFiles([file("preuve.txt", "text/plain", 12)]),
    ).toContain("format média accepté");
    expect(
      validateEvidenceFiles([file("animation.gif", "image/gif", 12)]),
    ).toContain("format média accepté");
    expect(
      validateEvidenceFiles([file("photo.png", "image/jpeg", 12)]),
    ).toContain("extension incohérente");
    expect(validateEvidenceFiles([file("photo", "image/jpeg", 12)])).toContain(
      "extension incohérente",
    );
    expect(
      validateEvidenceFiles([file("photo.jpg", "image/jpeg", 0)]),
    ).toContain("vide");
    expect(
      validateEvidenceFiles(
        Array.from({ length: 21 }, (_, index) =>
          file(`${index}.jpg`, "image/jpeg", 1),
        ),
      ),
    ).toContain("vingt");
  });

  it("applique exactement les bornes numériques du viewpoint backend", () => {
    const valid = {
      longitude: 6.1,
      latitude: 43.2,
      horizontalAccuracyM: 50_000,
      altitudeM: -500,
      yawDeg: 359.999,
      fovDeg: 179.999,
    };
    expect(validateEventViewpoint(valid)).toBeNull();
    expect(
      validateEventViewpoint({ ...valid, horizontalAccuracyM: 50_001 }),
    ).toContain("50 000");
    expect(validateEventViewpoint({ ...valid, altitudeM: -501 })).toContain(
      "altitude",
    );
    expect(validateEventViewpoint({ ...valid, altitudeM: 10_001 })).toContain(
      "altitude",
    );
    expect(validateEventViewpoint({ ...valid, yawDeg: 360 })).toContain(
      "360° exclu",
    );
    expect(validateEventViewpoint({ ...valid, fovDeg: 180 })).toContain("180°");
  });

  it("parse la réponse exhaustive et transmet le JWT avec la clé idempotente", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(CANDIDATE, 202));
    const result = await createEventCandidate(INPUT, {
      accessToken: "jwt-token",
      apiOrigin: "https://api.example.test",
      fetchImpl,
    });
    expect(result.analysis_job_id).toBe("AJ-job-1");
    expect(result.review_message).toBeNull();
    expect(result.viewpoint.exact_position_withheld).toBe(true);
    const [, init] = fetchImpl.mock.calls[0];
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer jwt-token",
    );
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
      INPUT.idempotency_key,
    );
    expect(JSON.parse(String(init?.body)).idempotency_key).toBe(
      INPUT.idempotency_key,
    );
  });

  it("refuse une réponse candidate incomplète au lieu de masquer analysis_job_id", async () => {
    const { analysis_job_id: _missing, ...incomplete } = CANDIDATE;
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(incomplete, 202));
    await expect(
      createEventCandidate(INPUT, {
        accessToken: "jwt-token",
        apiOrigin: "https://api.example.test",
        fetchImpl,
      }),
    ).rejects.toThrow(/réponse du suivi événementiel est invalide/);
  });

  it("refuse un reçu sans le champ contractuel review_message", async () => {
    const { review_message: _missing, ...incomplete } = CANDIDATE;
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(incomplete, 202));
    await expect(
      createEventCandidate(INPUT, {
        accessToken: "jwt-token",
        apiOrigin: "https://api.example.test",
        fetchImpl,
      }),
    ).rejects.toThrow(/réponse du suivi événementiel est invalide/);
  });

  it("préserve l’enveloppe {items,total} et parse aussi le détail", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ items: [CANDIDATE], total: 121 }))
      .mockResolvedValueOnce(jsonResponse(CANDIDATE));
    const options = {
      accessToken: "jwt-token",
      apiOrigin: "https://api.example.test",
      fetchImpl,
    };
    await expect(listMyEventCandidates(options)).resolves.toEqual({
      items: [CANDIDATE],
      total: 121,
    });
    await expect(
      getMyEventCandidate(CANDIDATE.candidate_id, options),
    ).resolves.toEqual(CANDIDATE);
  });

  it("envoie le fichier brut par PUT local puis finalise VERIFIED + CLEAN", async () => {
    const evidence = file("photo.jpg", "image/jpeg", 128);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            upload_id: "upload-1",
            upload_grant: null,
            client_payload: "EU-package-1",
            expires_at: null,
            assets: [
              {
                evidence_asset_id: "asset-1",
                pathname: "private/asset-1/photo.jpg",
                upload_state: "PENDING_UPLOAD",
              },
            ],
          },
          201,
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(jsonResponse(finalizedUpload()));

    await expect(
      createEvidenceAssets([evidence], {
        accessToken: "jwt-token",
        apiOrigin: "https://api.example.test",
        fetchImpl,
      }),
    ).resolves.toEqual(["asset-1"]);

    expect(fetchImpl.mock.calls[1]?.[0]).toBe(
      "https://api.example.test/api/v2/evidence/uploads/upload-1/assets/asset-1",
    );
    const putInit = fetchImpl.mock.calls[1]?.[1];
    expect(putInit?.method).toBe("PUT");
    expect(putInit?.body).toBe(evidence);
    expect(new Headers(putInit?.headers).get("Content-Type")).toBe(
      "image/jpeg",
    );
    expect(new Headers(putInit?.headers).get("Authorization")).toBe(
      "Bearer jwt-token",
    );
    expect(fetchImpl.mock.calls[2]?.[0]).toBe(
      "https://api.example.test/api/v2/evidence/uploads/upload-1/finalize",
    );
  });

  it("finalise un upload Blob et ne retourne les IDs qu’après VERIFIED + CLEAN", async () => {
    uploadMock.mockResolvedValueOnce({ pathname: "private/asset-1/photo.jpg" });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            upload_id: "upload-1",
            upload_grant: "g".repeat(64),
            client_payload: "signed-context",
            expires_at: "2026-08-03T13:00:00Z",
            assets: [
              {
                evidence_asset_id: "asset-1",
                pathname: "private/asset-1/photo.jpg",
                upload_state: "PENDING_UPLOAD",
              },
            ],
          },
          201,
        ),
      )
      .mockResolvedValueOnce(jsonResponse(finalizedUpload()));
    await expect(
      createEvidenceAssets([file("photo.jpg", "image/jpeg", 128)], {
        accessToken: "jwt-token",
        apiOrigin: "https://api.example.test",
        fetchImpl,
      }),
    ).resolves.toEqual(["asset-1"]);
    expect(uploadMock).toHaveBeenCalledWith(
      "private/asset-1/photo.jpg",
      expect.any(File),
      expect.objectContaining({
        clientPayload: "signed-context",
        multipart: true,
        contentType: "image/jpeg",
      }),
    );
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(
      "https://api.example.test/api/v2/evidence/uploads/upload-1/finalize",
    );
  });
});
