import { useCallback, useEffect, useMemo, useState } from "react";

import {
  useSupabaseAuth,
  type FireViewerElevatedRole,
} from "../../auth/SupabaseAuthContext";
import type { EventCandidateState } from "../../lib/eventCandidates";
import {
  createEventReviewApi,
  eventReviewPermissions,
  type EventReviewApi,
  type InternalEventCandidate,
  type InternalEvidenceAsset,
  type InternalFireActivityEvent,
  type JsonValue,
} from "../../lib/eventReview";
import { isFeatureEnabled } from "../../lib/featureFlags";
import {
  AdminEmptyState,
  AdminLoadingState,
  AdminPageHeader,
  AdminStateLabel,
  formatAdminDate,
} from "./AdminPageState";
import "./AdminEventReviewPage.css";

const REVIEWABLE_STATES: readonly EventCandidateState[] = [
  "NEEDS_REVIEW",
  "ABSTAINED",
  "FAILED",
  "VALIDATED",
  "REJECTED",
  "ANALYZING",
  "QUEUED",
  "RECEIVED",
];

const INCIDENT_ID_PATTERN = /^FR-[0-9A-Z]{2,3}-[0-9]{5}$/;

interface EventReviewWorkspaceProps {
  readonly roles: readonly FireViewerElevatedRole[];
  readonly getAccessToken: () => Promise<string | null>;
  readonly initialCandidateId?: string;
  readonly api?: EventReviewApi;
  readonly publicationEnabled?: boolean;
}

interface LoadState<T> {
  readonly loading: boolean;
  readonly data: T | null;
  readonly error: string | null;
}

function safeError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Le service interne v2 est indisponible.";
}

function formatBytes(size: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "unit",
    unit: size >= 1_000_000 ? "megabyte" : "kilobyte",
    unitDisplay: "short",
    maximumFractionDigits: 1,
  }).format(size >= 1_000_000 ? size / 1_000_000 : size / 1_000);
}

function reasonIsValid(reason: string): boolean {
  const length = reason.trim().length;
  return length >= 10 && length <= 1_000;
}

function JsonBlock({
  value,
  label,
}: {
  readonly value: JsonValue;
  readonly label: string;
}) {
  if (value === null || (Array.isArray(value) && value.length === 0)) {
    return (
      <p className="admin-event-review__empty-value">{label} non renseigné.</p>
    );
  }
  if (
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  ) {
    return (
      <p className="admin-event-review__empty-value">{label} non renseigné.</p>
    );
  }
  return (
    <pre className="admin-event-review__json" aria-label={label}>
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function PrivateEvidencePreview({
  asset,
  api,
  getAccessToken,
}: {
  readonly asset: InternalEvidenceAsset;
  readonly api: EventReviewApi;
  readonly getAccessToken: () => Promise<string | null>;
}) {
  const reviewable = asset.state === "VERIFIED" && asset.scan_state === "CLEAN";
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!reviewable) return undefined;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    void (async () => {
      try {
        const token = await getAccessToken();
        if (!token) throw new Error("La session interne a expiré.");
        const blob = await api.getEvidenceContent(
          token,
          asset.evidence_asset_id,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
      } catch (caught) {
        if (!controller.signal.aborted) setError(safeError(caught));
      }
    })();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [api, asset.evidence_asset_id, getAccessToken, reviewable]);

  return (
    <figure className="admin-event-review__asset">
      <figcaption>
        <strong>{asset.file_name}</strong>
        <span>
          {asset.media_type} · {formatBytes(asset.size_bytes)}
        </span>
        <span>
          <AdminStateLabel value={asset.state} />{" "}
          <AdminStateLabel value={asset.scan_state} />
        </span>
      </figcaption>
      {!reviewable ? (
        <p>
          Preuve non diffusable dans la revue tant que la vérification et
          l’analyse antivirus ne sont pas validées.
        </p>
      ) : null}
      {reviewable && !source && !error ? (
        <p role="status">Chargement privé du média…</p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      {source && asset.media_type.startsWith("image/") ? (
        <img src={source} alt={`Preuve privée ${asset.file_name}`} />
      ) : null}
      {source && asset.media_type.startsWith("video/") ? (
        <video
          src={source}
          controls
          preload="metadata"
          aria-label={`Preuve privée ${asset.file_name}`}
        />
      ) : null}
    </figure>
  );
}

function CandidateSummary({
  candidate,
  selected,
  onSelect,
}: {
  readonly candidate: InternalEventCandidate;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <button
      className={`admin-event-review__candidate ${selected ? "is-selected" : ""}`}
      type="button"
      data-candidate-id={candidate.candidate_id}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span>
        <AdminStateLabel value={candidate.state} />
      </span>
      <strong>
        {candidate.incident_id ??
          candidate.incident_candidate_id ??
          "Incident candidat privé"}
      </strong>
      <code>{candidate.candidate_id}</code>
      <time dateTime={candidate.updated_at}>
        {formatAdminDate(candidate.updated_at)}
      </time>
    </button>
  );
}

function EventDecision({
  event,
  canAnalyze,
  canPublish,
  publicationEnabled,
  busy,
  onTransition,
}: {
  readonly event: InternalFireActivityEvent;
  readonly canAnalyze: boolean;
  readonly canPublish: boolean;
  readonly publicationEnabled: boolean;
  readonly busy: boolean;
  readonly onTransition: (
    eventId: string,
    action: "validate" | "reject" | "publish",
    reason: string,
  ) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const validReason = reasonIsValid(reason);
  const draft = event.state === "DRAFT";
  const publishable = event.state === "ANALYST_VALIDATED";
  const rejectable = draft || publishable;
  const hasAction = (canAnalyze && rejectable) || (canPublish && publishable);

  return (
    <article className="admin-event-review__event">
      <header>
        <div>
          <h4>{event.phenomenon_kind}</h4>
          <code>{event.event_id}</code>
        </div>
        <AdminStateLabel value={event.state} />
      </header>
      <dl>
        <div>
          <dt>Méthode</dt>
          <dd>{event.method ?? "Non renseignée"}</dd>
        </div>
        <div>
          <dt>Version</dt>
          <dd>{event.version}</dd>
        </div>
      </dl>
      <details>
        <summary>Géométrie et incertitude</summary>
        <h5>Géométrie</h5>
        <JsonBlock value={event.geometry} label="Géométrie de l’événement" />
        <h5>Incertitude</h5>
        <JsonBlock
          value={event.uncertainty}
          label="Incertitude de l’événement"
        />
      </details>
      {hasAction ? (
        <div className="admin-event-review__decision">
          <label>
            Justification de la décision
            <textarea
              value={reason}
              onChange={(eventChange) =>
                setReason(eventChange.currentTarget.value)
              }
              minLength={10}
              maxLength={1_000}
              rows={3}
            />
            <small>
              Entre 10 et 1 000 caractères. La justification est auditée.
            </small>
          </label>
          <div className="admin-form-actions">
            {canAnalyze && draft ? (
              <button
                className="button button--primary"
                type="button"
                disabled={!validReason || busy}
                onClick={() =>
                  void onTransition(event.event_id, "validate", reason)
                }
              >
                Valider l’événement
              </button>
            ) : null}
            {canAnalyze && rejectable ? (
              <button
                className="button button--danger-ghost"
                type="button"
                disabled={!validReason || busy}
                onClick={() =>
                  void onTransition(event.event_id, "reject", reason)
                }
              >
                Rejeter l’événement
              </button>
            ) : null}
            {canPublish && publishable ? (
              <button
                className="button button--primary"
                type="button"
                disabled={!publicationEnabled || !validReason || busy}
                onClick={() =>
                  void onTransition(event.event_id, "publish", reason)
                }
              >
                Publier l’événement
              </button>
            ) : null}
          </div>
          {canPublish && publishable && !publicationEnabled ? (
            <p>La publication v2 est désactivée sur cette instance.</p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function CandidateDetail({
  candidate,
  roles,
  api,
  getAccessToken,
  publicationEnabled,
  onReload,
}: {
  readonly candidate: InternalEventCandidate;
  readonly roles: readonly FireViewerElevatedRole[];
  readonly api: EventReviewApi;
  readonly getAccessToken: () => Promise<string | null>;
  readonly publicationEnabled: boolean;
  readonly onReload: () => Promise<void>;
}) {
  const permissions = eventReviewPermissions(roles);
  const [reason, setReason] = useState("");
  const [incidentId, setIncidentId] = useState("");
  const [incidentReason, setIncidentReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(
    async (
      key: string,
      operation: (token: string) => Promise<unknown>,
      success: string,
    ) => {
      setBusy(key);
      setError(null);
      setFeedback(null);
      try {
        const token = await getAccessToken();
        if (!token) throw new Error("La session interne a expiré.");
        await operation(token);
        setFeedback(success);
        await onReload();
      } catch (caught) {
        setError(safeError(caught));
      } finally {
        setBusy(null);
      }
    },
    [getAccessToken, onReload],
  );

  const review = async (
    action: "reject" | "request_evidence" | "mark_contradictory",
  ) => {
    if (!reasonIsValid(reason)) return;
    await mutate(
      action,
      (token) =>
        api.reviewCandidate(
          token,
          candidate.candidate_id,
          action,
          reason.trim(),
        ),
      "La décision de revue a été enregistrée.",
    );
  };

  const attachIncident = async () => {
    if (!INCIDENT_ID_PATTERN.test(incidentId) || !reasonIsValid(incidentReason))
      return;
    await mutate(
      "attach",
      (token) =>
        api.attachIncident(
          token,
          candidate.candidate_id,
          incidentId,
          incidentReason.trim(),
        ),
      "Le candidat a été rattaché à l’incident.",
    );
  };

  const transitionEvent = async (
    eventId: string,
    action: "validate" | "reject" | "publish",
    transitionReason: string,
  ) => {
    await mutate(
      `${eventId}-${action}`,
      (token) =>
        api.transitionEvent(token, eventId, action, transitionReason.trim()),
      "La transition de l’événement a été enregistrée.",
    );
  };

  return (
    <article
      className="admin-event-review__detail"
      aria-labelledby="event-review-candidate-title"
    >
      <header className="admin-event-review__detail-header">
        <div>
          <span className="eyebrow">Candidat événementiel privé</span>
          <h3 id="event-review-candidate-title">{candidate.candidate_id}</h3>
          <p>
            Observé le {formatAdminDate(candidate.observed_start_at)}
            {candidate.observed_end_at
              ? ` au ${formatAdminDate(candidate.observed_end_at)}`
              : ""}
          </p>
        </div>
        <AdminStateLabel value={candidate.state} />
      </header>

      {feedback ? (
        <p className="admin-feedback admin-feedback--success" role="status">
          {feedback}
        </p>
      ) : null}
      {error ? (
        <p className="admin-feedback admin-feedback--error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="admin-event-review__overview">
        <section
          className="admin-detail-card"
          aria-labelledby="event-review-message"
        >
          <h3 id="event-review-message">Contribution et rattachement</h3>
          <p>
            {candidate.message ??
              "Aucun message, la contribution repose sur ses médias."}
          </p>
          <dl>
            <div>
              <dt>Incident</dt>
              <dd>{candidate.incident_id ?? "Non rattaché"}</dd>
            </div>
            <div>
              <dt>Candidat privé</dt>
              <dd>{candidate.incident_candidate_id ?? "Aucun"}</dd>
            </div>
            <div>
              <dt>Contributeur</dt>
              <dd>
                <code>{candidate.owner_subject}</code>
              </dd>
            </div>
            <div>
              <dt>Job</dt>
              <dd>
                <code>{candidate.analysis_job.job_id}</code>
              </dd>
            </div>
            <div>
              <dt>État analyse</dt>
              <dd>{candidate.analysis_job.state}</dd>
            </div>
          </dl>
          {candidate.review_message ? (
            <div>
              <strong>Message de revue</strong>
              <p>{candidate.review_message}</p>
            </div>
          ) : null}
        </section>

        <section
          className="admin-detail-card admin-event-review__viewpoint"
          aria-labelledby="event-review-viewpoint"
        >
          <h3 id="event-review-viewpoint">Point de prise de vue exact</h3>
          <p>
            <strong>Donnée privée.</strong> Ces coordonnées ne doivent jamais
            être copiées dans une réponse publique.
          </p>
          <dl>
            <div>
              <dt>Longitude</dt>
              <dd>{candidate.viewpoint.longitude.toFixed(6)}</dd>
            </div>
            <div>
              <dt>Latitude</dt>
              <dd>{candidate.viewpoint.latitude.toFixed(6)}</dd>
            </div>
            <div>
              <dt>Précision</dt>
              <dd>{candidate.viewpoint.horizontal_accuracy_m} m</dd>
            </div>
            <div>
              <dt>Altitude</dt>
              <dd>
                {candidate.viewpoint.altitude_m === null
                  ? "Non renseignée"
                  : `${candidate.viewpoint.altitude_m} m`}
              </dd>
            </div>
            <div>
              <dt>Origine</dt>
              <dd>{candidate.viewpoint.origin}</dd>
            </div>
            <div>
              <dt>Lieu</dt>
              <dd>{candidate.viewpoint.label ?? "Non nommé"}</dd>
            </div>
            <div>
              <dt>Direction</dt>
              <dd>
                {candidate.viewpoint.yaw_deg === null
                  ? "Inconnue"
                  : `${candidate.viewpoint.yaw_deg}°`}
              </dd>
            </div>
            <div>
              <dt>Champ de vision</dt>
              <dd>
                {candidate.viewpoint.fov_deg === null
                  ? "Inconnu"
                  : `${candidate.viewpoint.fov_deg}°`}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="admin-section" aria-labelledby="event-review-assets">
        <div className="admin-section__heading">
          <div>
            <h3 id="event-review-assets">Médias privés</h3>
            <p>
              {candidate.evidence_assets.length} preuve(s), servies uniquement
              avec le jeton interne.
            </p>
          </div>
        </div>
        {candidate.evidence_assets.length ? (
          <div className="admin-event-review__assets">
            {candidate.evidence_assets.map((asset) => (
              <PrivateEvidencePreview
                key={asset.evidence_asset_id}
                asset={asset}
                api={api}
                getAccessToken={getAccessToken}
              />
            ))}
          </div>
        ) : (
          <AdminEmptyState title="Aucun média">
            Cette contribution repose sur son message.
          </AdminEmptyState>
        )}
      </section>

      <section
        className="admin-section"
        aria-labelledby="event-review-analysis"
      >
        <div className="admin-section__heading">
          <div>
            <h3 id="event-review-analysis">
              Analyse, contradictions et résultat
            </h3>
            <p>
              Les sorties du modèle restent des propositions soumises à revue
              humaine.
            </p>
          </div>
        </div>
        <div className="admin-event-review__analysis-grid">
          <div>
            <h4>Résumé du job</h4>
            <JsonBlock
              value={candidate.analysis_job.result_summary}
              label="Résumé du job d’analyse"
            />
            {candidate.analysis_job.last_error_code ? (
              <p>
                Dernière erreur :{" "}
                <code>{candidate.analysis_job.last_error_code}</code>
              </p>
            ) : null}
          </div>
          <div>
            <h4>Contexte de revue et contradictions</h4>
            <JsonBlock
              value={candidate.review_context}
              label="Contexte de revue"
            />
          </div>
        </div>
      </section>

      <section
        className="admin-section"
        aria-labelledby="event-review-localizations"
      >
        <div className="admin-section__heading">
          <div>
            <h3 id="event-review-localizations">Localisations et ancrages</h3>
            <p>
              {candidate.localization_attempts.length} tentative(s) tracée(s).
            </p>
          </div>
        </div>
        {candidate.localization_attempts.length ? (
          <div className="admin-event-review__attempts">
            {candidate.localization_attempts.map((attempt) => (
              <article
                key={attempt.attempt_id}
                className="admin-event-review__attempt"
              >
                <header>
                  <div>
                    <h4>
                      {attempt.view_profile ?? "Profil de vue non renseigné"}
                    </h4>
                    <code>{attempt.attempt_id}</code>
                  </div>
                  <AdminStateLabel value={attempt.state} />
                </header>
                <dl>
                  <div>
                    <dt>Méthode</dt>
                    <dd>{attempt.method ?? "Non renseignée"}</dd>
                  </div>
                  <div>
                    <dt>Modèle</dt>
                    <dd>{attempt.model_id ?? "Non renseigné"}</dd>
                  </div>
                  <div>
                    <dt>Révision</dt>
                    <dd>{attempt.model_revision ?? "Non renseignée"}</dd>
                  </div>
                  <div>
                    <dt>Incertitude horizontale</dt>
                    <dd>
                      {attempt.horizontal_uncertainty_m === null
                        ? "Non renseignée"
                        : `${attempt.horizontal_uncertainty_m} m`}
                    </dd>
                  </div>
                  <div>
                    <dt>Abstention</dt>
                    <dd>{attempt.abstention_reason ?? "Non"}</dd>
                  </div>
                </dl>
                <details>
                  <summary>Ancrage, géométrie et provenance</summary>
                  <h5>Ancrage pixel</h5>
                  <JsonBlock
                    value={attempt.anchor}
                    label="Ancrage de localisation"
                  />
                  <h5>Géométrie</h5>
                  <JsonBlock
                    value={attempt.geometry}
                    label="Géométrie de localisation"
                  />
                  <h5>Incertitude</h5>
                  <JsonBlock
                    value={attempt.uncertainty}
                    label="Incertitude de localisation"
                  />
                  <h5>Provenance</h5>
                  <JsonBlock
                    value={attempt.provenance}
                    label="Provenance de localisation"
                  />
                </details>
              </article>
            ))}
          </div>
        ) : (
          <AdminEmptyState title="Aucune localisation">
            Le pipeline n’a produit aucune tentative exploitable.
          </AdminEmptyState>
        )}
      </section>

      <section className="admin-section" aria-labelledby="event-review-events">
        <div className="admin-section__heading">
          <div>
            <h3 id="event-review-events">Événements d’activité</h3>
            <p>
              Validation analyste puis publication éditeur, sans route legacy.
            </p>
          </div>
        </div>
        {candidate.fire_activity_events.length ? (
          <div className="admin-event-review__events">
            {candidate.fire_activity_events.map((event) => (
              <EventDecision
                key={event.event_id}
                event={event}
                canAnalyze={permissions.canAnalyze}
                canPublish={permissions.canPublish}
                publicationEnabled={publicationEnabled}
                busy={busy !== null}
                onTransition={transitionEvent}
              />
            ))}
          </div>
        ) : (
          <AdminEmptyState title="Aucun événement proposé">
            Rattachez le candidat ou demandez une preuve complémentaire.
          </AdminEmptyState>
        )}
      </section>

      {permissions.canAnalyze && candidate.state === "NEEDS_REVIEW" ? (
        <section
          className="admin-section admin-event-review__actions"
          aria-labelledby="event-review-actions"
        >
          <div className="admin-section__heading">
            <div>
              <h3 id="event-review-actions">Décision analyste</h3>
              <p>
                Ces actions sont auditables et restent dans le pipeline
                événementiel v2.
              </p>
            </div>
          </div>
          <div className="admin-event-review__action-grid">
            <div className="admin-detail-card">
              <h3>Qualifier la contribution</h3>
              <label>
                Justification
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.currentTarget.value)}
                  minLength={10}
                  maxLength={1_000}
                  rows={4}
                />
              </label>
              <small>Entre 10 et 1 000 caractères.</small>
              <small>
                Ce message peut apparaître dans le reçu du contributeur : ne
                recopiez ni coordonnées exactes ni donnée personnelle.
              </small>
              <div className="admin-form-actions">
                <button
                  className="button button--secondary"
                  type="button"
                  disabled={!reasonIsValid(reason) || busy !== null}
                  onClick={() => void review("request_evidence")}
                >
                  Demander une preuve
                </button>
                <button
                  className="button button--secondary"
                  type="button"
                  disabled={!reasonIsValid(reason) || busy !== null}
                  onClick={() => void review("mark_contradictory")}
                >
                  Marquer contradictoire
                </button>
                <button
                  className="button button--danger-ghost"
                  type="button"
                  disabled={!reasonIsValid(reason) || busy !== null}
                  onClick={() => void review("reject")}
                >
                  Rejeter le candidat
                </button>
              </div>
            </div>
            {candidate.incident_candidate_id ? (
              <div className="admin-detail-card">
                <h3>Rattacher à un incident</h3>
                <label>
                  Identifiant incident
                  <input
                    value={incidentId}
                    onChange={(event) =>
                      setIncidentId(event.currentTarget.value.toUpperCase())
                    }
                    placeholder="FR-83-00042"
                    pattern="FR-[0-9A-Z]{2,3}-[0-9]{5}"
                  />
                </label>
                <label>
                  Justification
                <textarea
                    value={incidentReason}
                    onChange={(event) =>
                      setIncidentReason(event.currentTarget.value)
                    }
                    minLength={10}
                    maxLength={1_000}
                  rows={3}
                />
              </label>
              <small>
                Cette justification peut apparaître dans le reçu du
                contributeur. Conservez le point de vue exact dans la revue
                privée.
              </small>
                <div className="admin-form-actions">
                  <button
                    className="button button--primary"
                    type="button"
                    disabled={
                      !INCIDENT_ID_PATTERN.test(incidentId) ||
                      !reasonIsValid(incidentReason) ||
                      busy !== null
                    }
                    onClick={() => void attachIncident()}
                  >
                    Attacher l’incident
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : (
        <p className="admin-event-review__readonly">
          Votre rôle ouvre cette revue en lecture seule
          {permissions.canPublish
            ? ", avec publication limitée aux événements déjà validés"
            : ""}
          .
        </p>
      )}

      <section className="admin-section" aria-labelledby="event-review-history">
        <div className="admin-section__heading">
          <div>
            <h3 id="event-review-history">Historique versionné</h3>
            <p>
              États, acteurs, raisons et actions de revue conservés par le
              backend.
            </p>
          </div>
        </div>
        <div className="admin-event-review__history">
          <JsonBlock
            value={candidate.state_history}
            label="Historique du candidat"
          />
        </div>
      </section>
    </article>
  );
}

export function EventReviewWorkspace({
  roles,
  getAccessToken,
  initialCandidateId,
  api: providedApi,
  publicationEnabled = true,
}: EventReviewWorkspaceProps) {
  const api = useMemo(
    () => providedApi ?? createEventReviewApi(),
    [providedApi],
  );
  const permissions = eventReviewPermissions(roles);
  const [filter, setFilter] = useState<EventCandidateState>("NEEDS_REVIEW");
  const [selectedId, setSelectedId] = useState<string | null>(
    initialCandidateId ?? null,
  );
  const [list, setList] = useState<
    LoadState<readonly InternalEventCandidate[]>
  >({ loading: true, data: null, error: null });
  const [detail, setDetail] = useState<LoadState<InternalEventCandidate>>({
    loading: Boolean(initialCandidateId),
    data: null,
    error: null,
  });

  const loadList = useCallback(
    async (signal?: AbortSignal) => {
      setList((current) => ({ ...current, loading: true, error: null }));
      try {
        const token = await getAccessToken();
        if (!token) throw new Error("La session interne a expiré.");
        const loaded = await api.listCandidates(
          token,
          { state: filter, limit: 50, offset: 0 },
          signal,
        );
        if (signal?.aborted) return;
      setList({ loading: false, data: loaded.items, error: null });
      if (!initialCandidateId) {
        setSelectedId((current) =>
          current && loaded.items.some((item) => item.candidate_id === current)
            ? current
            : (loaded.items[0]?.candidate_id ?? null),
        );
      }
      } catch (caught) {
        if (!signal?.aborted)
          setList({ loading: false, data: null, error: safeError(caught) });
      }
    },
    [api, filter, getAccessToken, initialCandidateId],
  );

  const loadDetail = useCallback(
    async (candidateId: string, signal?: AbortSignal) => {
      setDetail((current) => ({ ...current, loading: true, error: null }));
      try {
        const token = await getAccessToken();
        if (!token) throw new Error("La session interne a expiré.");
        const loaded = await api.getCandidate(token, candidateId, signal);
        if (!signal?.aborted)
          setDetail({ loading: false, data: loaded, error: null });
      } catch (caught) {
        if (!signal?.aborted)
          setDetail({ loading: false, data: null, error: safeError(caught) });
      }
    },
    [api, getAccessToken],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadList(controller.signal);
    return () => controller.abort();
  }, [loadList]);

  useEffect(() => {
    setSelectedId(initialCandidateId ?? null);
  }, [initialCandidateId]);

  useEffect(() => {
    if (!selectedId) {
      setDetail({ loading: false, data: null, error: null });
      return undefined;
    }
    const controller = new AbortController();
    void loadDetail(selectedId, controller.signal);
    return () => controller.abort();
  }, [loadDetail, selectedId]);

  const reload = useCallback(async () => {
    await loadList();
    if (selectedId) await loadDetail(selectedId);
  }, [loadDetail, loadList, selectedId]);

  if (!permissions.canRead)
    return (
      <AdminEmptyState title="Rôle interne requis">
        Cette page exige un rôle analyste, éditeur, opérateur sécurité ou
        administrateur.
      </AdminEmptyState>
    );

  return (
    <section
      className="admin-event-review"
      aria-labelledby="admin-event-review-title"
    >
      <AdminPageHeader
        title="Revue événementielle v2"
        actions={
          <button
            type="button"
            className="button button--small"
            onClick={() => void reload()}
          >
            Actualiser
          </button>
        }
      >
        <p id="admin-event-review-title">
          Un seul dossier rassemble contribution, point de vue privé, médias,
          localisations, contradictions et décisions.
        </p>
      </AdminPageHeader>
      <div className="admin-event-review__toolbar">
        <label>
          État des candidats
          <select
            value={filter}
            onChange={(event) =>
              setFilter(event.currentTarget.value as EventCandidateState)
            }
          >
            {REVIEWABLE_STATES.map((state) => (
              <option key={state} value={state}>
                {state.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <p>{list.data?.length ?? 0} candidat(s) chargés.</p>
      </div>
      <div className="admin-event-review__layout">
        <aside
          className="admin-event-review__queue"
          aria-label="Candidats à revoir"
        >
          {list.loading ? (
            <AdminLoadingState label="Chargement des candidats v2…" />
          ) : null}
          {list.error ? (
            <p className="admin-feedback admin-feedback--error" role="alert">
              {list.error}
            </p>
          ) : null}
          {!list.loading && !list.error && !list.data?.length ? (
            <AdminEmptyState title="Aucun candidat">
              Aucun candidat ne correspond à cet état.
            </AdminEmptyState>
          ) : null}
          {list.data?.map((candidate) => (
            <CandidateSummary
              key={candidate.candidate_id}
              candidate={candidate}
              selected={selectedId === candidate.candidate_id}
              onSelect={() => setSelectedId(candidate.candidate_id)}
            />
          ))}
        </aside>
        <div className="admin-event-review__workspace">
          {detail.loading ? (
            <AdminLoadingState label="Chargement du dossier événementiel…" />
          ) : null}
          {detail.error ? (
            <p className="admin-feedback admin-feedback--error" role="alert">
              {detail.error}
            </p>
          ) : null}
          {!detail.loading && !detail.error && detail.data ? (
            <CandidateDetail
              key={detail.data.candidate_id}
              candidate={detail.data}
              roles={roles}
              api={api}
              getAccessToken={getAccessToken}
              publicationEnabled={publicationEnabled}
              onReload={reload}
            />
          ) : null}
          {!selectedId && !detail.loading ? (
            <AdminEmptyState title="Sélectionnez un candidat">
              Le détail privé et ses décisions apparaîtront ici.
            </AdminEmptyState>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function AdminEventReviewPage({
  candidateId,
}: {
  readonly candidateId?: string;
}) {
  const auth = useSupabaseAuth();
  const enabled =
    isFeatureEnabled("FV_EVENT_V2_ENABLED") &&
    isFeatureEnabled("FV_SUPABASE_AUTH_ENABLED");
  if (!enabled)
    return (
      <AdminEmptyState title="Revue événementielle désactivée">
        Les deux flags événement v2 et Supabase Auth doivent être actifs.
      </AdminEmptyState>
    );
  return (
    <EventReviewWorkspace
      roles={auth.elevatedRoles}
      getAccessToken={auth.accessToken}
      initialCandidateId={candidateId}
      publicationEnabled={isFeatureEnabled("FV_V2_PUBLICATION_ENABLED")}
    />
  );
}
