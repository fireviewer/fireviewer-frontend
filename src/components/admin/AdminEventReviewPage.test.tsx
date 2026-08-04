// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  EventReviewApi,
  InternalEventCandidate,
  InternalFireActivityEvent,
} from "../../lib/eventReview";
import { EventReviewWorkspace } from "./AdminEventReviewPage";

function activityEvent(
  state: InternalFireActivityEvent["state"],
  id: string,
): InternalFireActivityEvent {
  return {
    event_id: id,
    state,
    phenomenon_kind: "smoke_origin",
    geometry: { type: "Point", coordinates: [6.2, 43.3] },
    uncertainty: { type: "Polygon", coordinates: [] },
    method: "terrain_raycast",
    version: 1,
  };
}

function candidate(
  events: readonly InternalFireActivityEvent[] = [
    activityEvent("DRAFT", "FAE-draft"),
  ],
): InternalEventCandidate {
  return {
    candidate_id: "EC-private-1",
    state: "NEEDS_REVIEW",
    incident_id: null,
    incident_candidate_id: "IC-private-1",
    owner_subject: "supabase-user-private",
    observed_start_at: "2026-08-03T12:00:00Z",
    observed_end_at: null,
    message: "Une colonne de fumée est visible depuis le belvédère.",
    review_message: null,
    review_context: {
      mark_contradictory: { reason: "Horodatage à contrôler." },
    },
    state_history: [{ state: "NEEDS_REVIEW", actor: "worker-event-v2" }],
    viewpoint: {
      longitude: 6.123456,
      latitude: 43.234567,
      horizontal_accuracy_m: 25,
      altitude_m: 310,
      label: "Belvédère privé",
      yaw_deg: 83,
      fov_deg: 64,
      origin: "USER_PLACED",
    },
    evidence_assets: [
      {
        evidence_asset_id: "EA-private-1",
        file_name: "preuve-privee.jpg",
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
        model_revision: "revision-immutable-1",
        view_profile: "ground_distant_known_viewpoint",
        anchor: { x: 0.42, y: 0.61, phenomenon: "smoke_origin" },
        geometry: { type: "Point", coordinates: [6.2, 43.3] },
        uncertainty: { type: "Polygon", coordinates: [] },
        horizontal_uncertainty_m: 180,
        abstention_reason: null,
        provenance: { pipeline_revision: "event-v2" },
      },
    ],
    fire_activity_events: events,
    analysis_job: {
      job_id: "AJ-1",
      state: "COMPLETED",
      result_summary: { localized: 1, contradictory: true },
      last_error_code: null,
    },
    created_at: "2026-08-03T12:00:01Z",
    updated_at: "2026-08-03T12:05:01Z",
  };
}

function apiFor(detail: InternalEventCandidate): EventReviewApi {
  return {
    listCandidates: vi.fn(async () => ({
      items: [detail],
      total: 1,
      limit: 50,
      offset: 0,
    })),
    getCandidate: vi.fn(async () => detail),
    getEvidenceContent: vi.fn(
      async () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }),
    ),
    reviewCandidate: vi.fn(async (_token, candidateId) => ({
      candidate_id: candidateId,
      state: "NEEDS_REVIEW",
      version: 2,
    })),
    attachIncident: vi.fn(async (_token, candidateId) => ({
      candidate_id: candidateId,
      state: "NEEDS_REVIEW",
      version: 3,
    })),
    transitionEvent: vi.fn(async (_token, eventId, action) => ({
      event_id: eventId,
      state: action === "publish" ? "EDITOR_PUBLISHED" : "ANALYST_VALIDATED",
      version: 2,
    })),
  };
}

const getAccessToken = vi.fn(async () => "jwt-private-token");

beforeEach(() => {
  getAccessToken.mockClear();
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:private-evidence"),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("EventReviewWorkspace", () => {
  it("affiche le dossier privé et charge le média par Blob authentifié sans exposer la route interne", async () => {
    const api = apiFor(candidate());
    render(
      <EventReviewWorkspace
        roles={["security_operator"]}
        getAccessToken={getAccessToken}
        api={api}
      />,
    );

    expect(await screen.findByText("6.123456")).toBeVisible();
    expect(screen.getByText("43.234567")).toBeVisible();
    expect(screen.getByText("ground_distant_known_viewpoint")).toBeVisible();
    expect(screen.getByText("revision-immutable-1")).toBeVisible();
    expect(screen.getByText(/Horodatage à contrôler/)).toBeVisible();
    await waitFor(() =>
      expect(api.getEvidenceContent).toHaveBeenCalledWith(
        "jwt-private-token",
        "EA-private-1",
        expect.any(AbortSignal),
      ),
    );
    expect(
      await screen.findByRole("img", {
        name: "Preuve privée preuve-privee.jpg",
      }),
    ).toHaveAttribute("src", "blob:private-evidence");
    expect(document.body.innerHTML).not.toContain(
      "/api/v2/internal/evidence-assets/",
    );
    expect(screen.getByText(/lecture seule/)).toBeVisible();
  });

  it("autorise uniquement l’analyste à demander une preuve, attacher et valider ou rejeter un brouillon", async () => {
    const user = userEvent.setup();
    const api = apiFor(candidate());
    render(
      <EventReviewWorkspace
        roles={["analyst"]}
        getAccessToken={getAccessToken}
        api={api}
      />,
    );

    const requestButton = await screen.findByRole("button", {
      name: "Demander une preuve",
    });
    const candidateAction = requestButton.closest(".admin-detail-card");
    expect(candidateAction).not.toBeNull();
    fireEvent.change(
      within(candidateAction as HTMLElement).getByLabelText("Justification"),
      { target: { value: "Merci de fournir une vue orientée vers le nord." } },
    );
    await user.click(requestButton);
    await waitFor(() =>
      expect(api.reviewCandidate).toHaveBeenCalledWith(
        "jwt-private-token",
        "EC-private-1",
        "request_evidence",
        "Merci de fournir une vue orientée vers le nord.",
      ),
    );

    const attachButton = screen.getByRole("button", {
      name: "Attacher l’incident",
    });
    const attachCard = attachButton.closest(".admin-detail-card");
    expect(attachCard).not.toBeNull();
    fireEvent.change(
      within(attachCard as HTMLElement).getByLabelText("Identifiant incident"),
      { target: { value: "fr-83-00042" } },
    );
    fireEvent.change(
      within(attachCard as HTMLElement).getByLabelText("Justification"),
      { target: { value: "Repères terrain et chronologie concordants." } },
    );
    await user.click(attachButton);
    await waitFor(() =>
      expect(api.attachIncident).toHaveBeenCalledWith(
        "jwt-private-token",
        "EC-private-1",
        "FR-83-00042",
        "Repères terrain et chronologie concordants.",
      ),
    );

    const validateButton = screen.getByRole("button", {
      name: "Valider l’événement",
    });
    const eventCard = validateButton.closest(".admin-event-review__event");
    expect(eventCard).not.toBeNull();
    fireEvent.change(
      within(eventCard as HTMLElement).getByLabelText(
        /^Justification de la décision/,
      ),
      {
        target: {
          value: "Ancrage et incertitude contrôlés par analyste.",
        },
      },
    );
    await user.click(validateButton);
    await waitFor(() =>
      expect(api.transitionEvent).toHaveBeenCalledWith(
        "jwt-private-token",
        "FAE-draft",
        "validate",
        "Ancrage et incertitude contrôlés par analyste.",
      ),
    );
    expect(
      screen.queryByRole("button", { name: "Publier l’événement" }),
    ).not.toBeInTheDocument();
  });

  it("permet à l’analyste de rejeter un événement déjà validé", async () => {
    const user = userEvent.setup();
    const api = apiFor(
      candidate([activityEvent("ANALYST_VALIDATED", "FAE-validated")]),
    );
    render(
      <EventReviewWorkspace
        roles={["analyst"]}
        getAccessToken={getAccessToken}
        api={api}
      />,
    );

    const rejectButton = await screen.findByRole("button", {
      name: "Rejeter l’événement",
    });
    const eventCard = rejectButton.closest(".admin-event-review__event");
    expect(eventCard).not.toBeNull();
    fireEvent.change(
      within(eventCard as HTMLElement).getByLabelText(
        /^Justification de la décision/,
      ),
      { target: { value: "Contradiction officielle non résolue." } },
    );
    await user.click(rejectButton);

    await waitFor(() =>
      expect(api.transitionEvent).toHaveBeenCalledWith(
        "jwt-private-token",
        "FAE-validated",
        "reject",
        "Contradiction officielle non résolue.",
      ),
    );
    expect(
      screen.queryByRole("button", { name: "Valider l’événement" }),
    ).not.toBeInTheDocument();
  });

  it("limite l’éditeur à la publication des seuls événements ANALYST_VALIDATED", async () => {
    const user = userEvent.setup();
    const detail = candidate([
      activityEvent("DRAFT", "FAE-draft"),
      activityEvent("ANALYST_VALIDATED", "FAE-validated"),
    ]);
    const api = apiFor(detail);
    render(
      <EventReviewWorkspace
        roles={["editor"]}
        getAccessToken={getAccessToken}
        api={api}
        publicationEnabled
      />,
    );

    const publishButton = await screen.findByRole("button", {
      name: "Publier l’événement",
    });
    expect(
      screen.queryByRole("button", { name: "Valider l’événement" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Rejeter l’événement" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Demander une preuve" }),
    ).not.toBeInTheDocument();
    const eventCard = publishButton.closest(".admin-event-review__event");
    expect(eventCard).not.toBeNull();
    expect(
      within(eventCard as HTMLElement).getByText("FAE-validated"),
    ).toBeVisible();
    fireEvent.change(
      within(eventCard as HTMLElement).getByLabelText(
        /^Justification de la décision/,
      ),
      {
        target: {
          value: "Version validée et sources publiques contrôlées.",
        },
      },
    );
    await user.click(publishButton);
    await waitFor(() =>
      expect(api.transitionEvent).toHaveBeenCalledWith(
        "jwt-private-token",
        "FAE-validated",
        "publish",
        "Version validée et sources publiques contrôlées.",
      ),
    );
  });
});
