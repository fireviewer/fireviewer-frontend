import { describe, expect, it, vi } from "vitest";

import {
  createEventReviewApi,
  eventReviewPermissions,
  parseInternalEventCandidate,
} from "./eventReview";

const CANDIDATE = {
  candidate_id: "EC-private-1",
  state: "NEEDS_REVIEW",
  incident_id: null,
  incident_candidate_id: "IC-private-1",
  owner_subject: "supabase-user-1",
  observed_start_at: "2026-08-03T12:00:00Z",
  observed_end_at: null,
  message: "Une colonne de fumée est visible.",
  review_message: null,
  review_context: {
    mark_contradictory: { reason: "Sources temporelles divergentes." },
  },
  state_history: [{ state: "NEEDS_REVIEW", actor: "worker" }],
  viewpoint: {
    longitude: 6.123456,
    latitude: 43.234567,
    horizontal_accuracy_m: 25,
    altitude_m: 310,
    label: "Belvédère",
    yaw_deg: 83,
    fov_deg: 64,
    origin: "USER_PLACED",
  },
  evidence_assets: [
    {
      evidence_asset_id: "EA-private-1",
      file_name: "preuve.jpg",
      media_type: "image/jpeg",
      size_bytes: 1_024,
      state: "VERIFIED",
      scan_state: "CLEAN",
    },
  ],
  localization_attempts: [
    {
      attempt_id: "LA-1",
      state: "PROPOSED",
      method: "terrain_raycast",
      model_id: "fireviewer/dinov3-v3",
      model_revision: "0123456789abcdef",
      view_profile: "ground_distant_known_viewpoint",
      anchor: { x: 0.42, y: 0.61, phenomenon: "smoke_origin" },
      geometry: { type: "Point", coordinates: [6.2, 43.3] },
      uncertainty: { type: "Polygon", coordinates: [] },
      horizontal_uncertainty_m: 180,
      abstention_reason: null,
      provenance: { pipeline_revision: "event-v2" },
    },
  ],
  fire_activity_events: [
    {
      event_id: "FAE-1",
      state: "DRAFT",
      phenomenon_kind: "smoke_origin",
      geometry: { type: "Point", coordinates: [6.2, 43.3] },
      uncertainty: { type: "Polygon", coordinates: [] },
      method: "terrain_raycast",
      version: 1,
    },
  ],
  analysis_job: {
    job_id: "AJ-1",
    state: "COMPLETED",
    result_summary: { localized: 1, contradictory: true },
    last_error_code: null,
  },
  created_at: "2026-08-03T12:00:01Z",
  updated_at: "2026-08-03T12:05:01Z",
};

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("event review v2 API", () => {
  it("sépare strictement les permissions de lecture, analyse et publication", () => {
    expect(eventReviewPermissions(["security_operator"])).toEqual({
      canRead: true,
      canAnalyze: false,
      canPublish: false,
    });
    expect(eventReviewPermissions(["analyst"])).toEqual({
      canRead: true,
      canAnalyze: true,
      canPublish: false,
    });
    expect(eventReviewPermissions(["editor"])).toEqual({
      canRead: true,
      canAnalyze: false,
      canPublish: true,
    });
    expect(eventReviewPermissions(["administrator"])).toEqual({
      canRead: true,
      canAnalyze: true,
      canPublish: true,
    });
    expect(eventReviewPermissions([])).toEqual({
      canRead: false,
      canAnalyze: false,
      canPublish: false,
    });
  });

  it("parse le dossier privé complet et refuse un viewpoint incomplet", () => {
    const parsed = parseInternalEventCandidate(CANDIDATE);
    expect(parsed.viewpoint).toMatchObject({
      longitude: 6.123456,
      latitude: 43.234567,
    });
    expect(parsed.localization_attempts[0]).toMatchObject({
      view_profile: "ground_distant_known_viewpoint",
      model_revision: "0123456789abcdef",
    });
    expect(parsed.analysis_job.result_summary).toEqual({
      localized: 1,
      contradictory: true,
    });
    expect(() =>
      parseInternalEventCandidate({
        ...CANDIDATE,
        viewpoint: { ...CANDIDATE.viewpoint, longitude: undefined },
      }),
    ).toThrow(/Réponse interne v2 invalide/);
  });

  it("utilise uniquement les routes internes v2 avec Bearer et charge le Blob privé", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ items: [CANDIDATE], total: 1, limit: 50, offset: 0 }),
      )
      .mockResolvedValueOnce(jsonResponse(CANDIDATE))
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "Content-Type": "image/jpeg" },
        }),
      );
    const api = createEventReviewApi({
      apiOrigin: "https://api.example.test",
      fetchImpl,
    });

    await expect(
      api.listCandidates("jwt-token", { state: "NEEDS_REVIEW" }),
    ).resolves.toMatchObject({ total: 1 });
    await expect(
      api.getCandidate("jwt-token", "EC-private-1"),
    ).resolves.toMatchObject({ candidate_id: "EC-private-1" });
    await expect(
      api.getEvidenceContent("jwt-token", "EA-private-1"),
    ).resolves.toBeInstanceOf(Blob);

    expect(fetchImpl.mock.calls.map(([input]) => String(input))).toEqual([
      "https://api.example.test/api/v2/internal/event-candidates?state=NEEDS_REVIEW&limit=50&offset=0",
      "https://api.example.test/api/v2/internal/event-candidates/EC-private-1",
      "https://api.example.test/api/v2/internal/evidence-assets/EA-private-1/content",
    ]);
    for (const [, init] of fetchImpl.mock.calls) {
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        "Bearer jwt-token",
      );
      expect(init?.credentials).toBe("omit");
      expect(init?.cache).toBe("no-store");
    }
    expect(
      fetchImpl.mock.calls.every(
        ([input]) => !String(input).includes("/api/v1/admin"),
      ),
    ).toBe(true);
  });

  it("envoie les actions et justifications sur les seules mutations v2", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          candidate_id: "EC-private-1",
          state: "NEEDS_REVIEW",
          version: 2,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          candidate_id: "EC-private-1",
          state: "NEEDS_REVIEW",
          version: 3,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          event_id: "FAE-1",
          state: "ANALYST_VALIDATED",
          version: 2,
        }),
      );
    const api = createEventReviewApi({
      apiOrigin: "https://api.example.test",
      fetchImpl,
    });

    await api.reviewCandidate(
      "jwt-token",
      "EC-private-1",
      "mark_contradictory",
      "Les heures des deux sources divergent.",
    );
    await api.attachIncident(
      "jwt-token",
      "EC-private-1",
      "FR-83-00042",
      "Rattachement confirmé par les repères terrain.",
    );
    await api.transitionEvent(
      "jwt-token",
      "FAE-1",
      "validate",
      "Géométrie et incertitude contrôlées par analyste.",
    );

    expect(fetchImpl.mock.calls.map(([input]) => String(input))).toEqual([
      "https://api.example.test/api/v2/internal/event-candidates/EC-private-1/review",
      "https://api.example.test/api/v2/internal/event-candidates/EC-private-1/attach-incident",
      "https://api.example.test/api/v2/internal/fire-activity-events/FAE-1/validate",
    ]);
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toEqual({
      action: "mark_contradictory",
      reason: "Les heures des deux sources divergent.",
    });
    expect(JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body))).toEqual({
      incident_id: "FR-83-00042",
      reason: "Rattachement confirmé par les repères terrain.",
    });
    expect(JSON.parse(String(fetchImpl.mock.calls[2]?.[1]?.body))).toEqual({
      reason: "Géométrie et incertitude contrôlées par analyste.",
    });
  });
});
