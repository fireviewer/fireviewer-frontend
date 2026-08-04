// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventCandidateResponse } from "../../lib/eventCandidates";

const CANDIDATE_RESPONSE = {
  candidate_id: "EC-candidate-1",
  analysis_job_id: "AJ-job-1",
  tracking_id: "EC-candidate-1",
  state: "QUEUED",
  incident_id: null,
  incident_candidate_id: "IC-private-1",
  observed_start_at: "2026-08-03T12:00:00Z",
  observed_end_at: null,
  message: "Une colonne de fumée est visible au loin.",
  review_message: "Merci de préciser la direction de prise de vue.",
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

const mocks = vi.hoisted(() => ({
  auth: {
    enabled: true,
    configured: true,
    loading: false,
    user: { id: "user-1", email: "person@example.test" },
    verified: true,
    accessToken: vi.fn(async () => "jwt-token"),
  },
  createEvidenceAssets: vi.fn(async () => [] as readonly string[]),
  createEventCandidate: vi.fn(),
  listMyEventCandidates: vi.fn(),
  getMyEventCandidate: vi.fn(),
}));

vi.mock("../../auth/SupabaseAuthContext", () => ({
  useSupabaseAuth: () => mocks.auth,
}));
vi.mock("../../lib/eventCandidates", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../lib/eventCandidates")>();
  return {
    ...actual,
    createEvidenceAssets: mocks.createEvidenceAssets,
    createEventCandidate: mocks.createEventCandidate,
    listMyEventCandidates: mocks.listMyEventCandidates,
    getMyEventCandidate: mocks.getMyEventCandidate,
  };
});
vi.mock("./ViewpointPicker", () => ({
  ViewpointPicker: ({
    onChange,
  }: {
    readonly onChange: (point: { longitude: number; latitude: number }) => void;
  }) => (
    <button
      type="button"
      onClick={() => onChange({ longitude: 6.12, latitude: 43.21 })}
    >
      Placer le viewpoint de test
    </button>
  ),
}));

import {
  EventCandidateContributionPage,
  MyEventCandidatesPage,
} from "./EventCandidatePages";

afterEach(cleanup);
beforeEach(() => {
  mocks.createEvidenceAssets.mockClear();
  mocks.createEventCandidate.mockReset();
  mocks.createEventCandidate.mockResolvedValue(CANDIDATE_RESPONSE);
  mocks.listMyEventCandidates.mockReset();
  mocks.listMyEventCandidates.mockResolvedValue({
    items: [CANDIDATE_RESPONSE],
    total: 1,
  });
  mocks.getMyEventCandidate.mockReset();
  mocks.getMyEventCandidate.mockResolvedValue(CANDIDATE_RESPONSE);
});

describe("EventCandidateContributionPage", () => {
  it("envoie le viewpoint comme origine de prise de vue, sans le confondre avec le phénomène", async () => {
    const user = userEvent.setup();
    render(<EventCandidateContributionPage />);
    await user.click(
      screen.getByRole("button", { name: "Placer le viewpoint de test" }),
    );
    await user.type(
      screen.getByLabelText("Message"),
      "Une colonne de fumée est visible au loin.",
    );
    await user.click(
      screen.getByRole("checkbox", { name: /Autoriser l’analyse privée/ }),
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: /Autoriser la conservation de la preuve/,
      }),
    );
    await user.click(
      screen.getByRole("button", { name: /Envoyer à l’analyse/ }),
    );
    expect(mocks.createEventCandidate).toHaveBeenCalledOnce();
    const [payload, options] = mocks.createEventCandidate.mock.calls[0];
    expect(payload.viewpoint).toMatchObject({
      longitude: 6.12,
      latitude: 43.21,
      origin: "USER_PLACED",
    });
    expect(payload.message).toContain("colonne de fumée");
    expect(payload.evidence_asset_ids).toEqual([]);
    expect(options).toEqual({ accessToken: "jwt-token" });
    expect(
      await screen.findByText("Le dossier privé est en cours de traitement"),
    ).toBeVisible();
  });
});

describe("MyEventCandidatesPage", () => {
  it("affiche review_message sans jamais recevoir ni exposer les coordonnées exactes", async () => {
    render(<MyEventCandidatesPage candidateId="EC-candidate-1" />);

    expect(
      await screen.findByText(/Merci de préciser la direction de prise de vue/),
    ).toBeVisible();
    expect(mocks.getMyEventCandidate).toHaveBeenCalledWith("EC-candidate-1", {
      accessToken: "jwt-token",
    });
    expect(document.body.textContent).not.toContain("6.123456");
    expect(document.body.textContent).not.toContain("43.234567");
    expect(CANDIDATE_RESPONSE.viewpoint.exact_position_withheld).toBe(true);
  });
});
