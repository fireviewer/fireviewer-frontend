import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { useSupabaseAuth } from "../../auth/SupabaseAuthContext";
import {
  createEvidenceAssets,
  createEventCandidate,
  getMyEventCandidate,
  listMyEventCandidates,
  validateEventViewpoint,
  validateEvidenceFiles,
  type EventCandidateListResponse,
  type EventCandidateResponse,
  type EventCandidateState,
} from "../../lib/eventCandidates";
import { PublicIcon } from "./PublicIcon";
import { PageHero } from "./FireWarningBasicPages";
import { ViewpointPicker } from "./ViewpointPicker";
import "./event-candidates.css";

const STATE_LABEL: Readonly<Record<EventCandidateState, string>> = {
  RECEIVED: "Reçue",
  QUEUED: "En file d’analyse",
  ANALYZING: "Analyse en cours",
  NEEDS_REVIEW: "Revue analyste requise",
  ABSTAINED: "Analyse abstenue",
  FAILED: "Analyse interrompue",
  VALIDATED: "Validée",
  REJECTED: "Écartée",
};

function AuthRequired() {
  return (
    <section className="fv-event-auth-required">
      <PublicIcon name="lock" size={32} />
      <h2>Compte vérifié requis</h2>
      <p>
        Connectez-vous avec une adresse e-mail vérifiée avant d’envoyer ou de
        consulter vos contributions.
      </p>
      <a className="fw-button fw-button--primary" href="/compte">
        Se connecter
      </a>
    </section>
  );
}

function CandidateReceipt({
  candidate,
}: {
  readonly candidate: EventCandidateResponse;
}) {
  return (
    <section className="fv-event-receipt" aria-live="polite">
      <PublicIcon name="check-circle" size={38} />
      <p className="fw-kicker">Contribution enregistrée</p>
      <h2>Le dossier privé est en cours de traitement</h2>
      <p>
        Une analyse automatique peut proposer une localisation ou s’abstenir.
        Rien n’est publié sans validation analyste puis décision éditoriale.
      </p>
      <dl>
        <div>
          <dt>Identifiant de suivi</dt>
          <dd>
            <code>{candidate.tracking_id}</code>
          </dd>
        </div>
        <div>
          <dt>État</dt>
          <dd>{STATE_LABEL[candidate.state]}</dd>
        </div>
        <div>
          <dt>Créée le</dt>
          <dd>{new Date(candidate.created_at).toLocaleString("fr-FR")}</dd>
        </div>
      </dl>
      <a
        className="fw-button fw-button--primary"
        href={`/mes-contributions/${candidate.candidate_id}`}
      >
        Suivre le traitement
      </a>
    </section>
  );
}

interface FormState {
  readonly longitude: number | null;
  readonly latitude: number | null;
  readonly accuracy: string;
  readonly altitude: string;
  readonly label: string;
  readonly yaw: string;
  readonly fov: string;
  readonly observedStart: string;
  readonly observedEnd: string;
  readonly message: string;
  readonly consentAnalysis: boolean;
  readonly consentRetention: boolean;
  readonly consentPublicDerivative: boolean;
}

function initialDateTime(): string {
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
  return now.toISOString().slice(0, 16);
}

const INITIAL_STATE: FormState = {
  longitude: null,
  latitude: null,
  accuracy: "25",
  altitude: "",
  label: "",
  yaw: "",
  fov: "",
  observedStart: initialDateTime(),
  observedEnd: "",
  message: "",
  consentAnalysis: false,
  consentRetention: false,
  consentPublicDerivative: false,
};

function optionalNumber(value: string): number | null {
  return value.trim() ? Number(value) : null;
}

export function EventCandidateContributionPage({
  incidentId,
}: {
  readonly incidentId?: string;
}) {
  const auth = useSupabaseAuth();
  const [state, setState] = useState<FormState>(INITIAL_STATE);
  const [files, setFiles] = useState<readonly File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<EventCandidateResponse | null>(null);
  const submissionIntent = useRef<{
    fingerprint: string;
    idempotencyKey: string;
    evidenceAssetIds: readonly string[] | null;
  } | null>(null);
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setState((current) => ({ ...current, [key]: value }));

  const validation = useMemo(() => {
    const viewpointError = validateEventViewpoint({
      longitude: state.longitude,
      latitude: state.latitude,
      horizontalAccuracyM: Number(state.accuracy),
      altitudeM: optionalNumber(state.altitude),
      yawDeg: optionalNumber(state.yaw),
      fovDeg: optionalNumber(state.fov),
    });
    if (viewpointError) return viewpointError;
    if (
      !state.observedStart ||
      !Number.isFinite(Date.parse(state.observedStart))
    )
      return "Indiquez le moment de l’observation.";
    if (
      state.observedEnd &&
      Date.parse(state.observedEnd) < Date.parse(state.observedStart)
    )
      return "La fin de l’intervalle doit suivre son début.";
    if (!state.message.trim() && files.length === 0)
      return "Ajoutez un message ou au moins un média.";
    const mediaError = validateEvidenceFiles(files);
    if (mediaError) return mediaError;
    if (!state.consentAnalysis || !state.consentRetention)
      return "Les accords d’analyse et de conservation sont nécessaires.";
    return null;
  }, [files, state]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (validation) {
      setError(validation);
      return;
    }
    const token = await auth.accessToken();
    if (!token) {
      setError("Votre session vérifiée a expiré. Reconnectez-vous.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fingerprint = JSON.stringify({
        incidentId: incidentId ?? null,
        state,
        files: files.map((file) => [
          file.name,
          file.type,
          file.size,
          file.lastModified,
        ]),
      });
      if (submissionIntent.current?.fingerprint !== fingerprint) {
        submissionIntent.current = {
          fingerprint,
          idempotencyKey: crypto.randomUUID(),
          evidenceAssetIds: null,
        };
      }
      const intent = submissionIntent.current;
      setProgress(
        files.length
          ? `Préparation de ${files.length} média${files.length > 1 ? "s" : ""}…`
          : "Création du dossier…",
      );
      const evidenceAssetIds =
        intent.evidenceAssetIds ??
        (await createEvidenceAssets(
          files,
          { accessToken: token },
          (completed, total) =>
            setProgress(`Médias privés : ${completed}/${total}`),
        ));
      intent.evidenceAssetIds = evidenceAssetIds;
      setProgress("Mise en file de l’analyse…");
      const created = await createEventCandidate(
        {
          idempotency_key: intent.idempotencyKey,
          ...(incidentId ? { incident_id: incidentId } : {}),
          viewpoint: {
            longitude: state.longitude!,
            latitude: state.latitude!,
            horizontal_accuracy_m: Number(state.accuracy),
            altitude_m: optionalNumber(state.altitude),
            label: state.label.trim() || null,
            yaw_deg: optionalNumber(state.yaw),
            fov_deg: optionalNumber(state.fov),
            origin: "USER_PLACED",
          },
          observed_time: {
            start_at: new Date(state.observedStart).toISOString(),
            end_at: state.observedEnd
              ? new Date(state.observedEnd).toISOString()
              : null,
          },
          message: state.message.trim() || null,
          evidence_asset_ids: evidenceAssetIds,
          consent: {
            analysis: true,
            retention: true,
            public_derivative: state.consentPublicDerivative,
          },
        },
        { accessToken: token },
      );
      setReceipt(created);
      setProgress(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "La contribution n’a pas pu être enregistrée.",
      );
      setProgress(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHero
        visual="report"
        title={
          incidentId ? "Documenter cet incendie" : "Documenter un événement"
        }
        description="Ajoutez une observation datée depuis un point de prise de vue connu. FireViewer n’est ni un service d’alerte ni un contact avec les secours."
      />
      <main className="fw-page fv-event-page">
        {auth.loading ? (
          <p role="status">Vérification de la session…</p>
        ) : !auth.enabled ||
          !auth.configured ||
          !auth.user ||
          !auth.verified ? (
          <AuthRequired />
        ) : receipt ? (
          <CandidateReceipt candidate={receipt} />
        ) : (
          <form
            className="fv-event-form"
            onSubmit={(event) => void submit(event)}
            noValidate
          >
            <aside className="fv-event-safety">
              <PublicIcon name="warning" size={22} />
              <p>
                <strong>Danger immédiat : appelez le 18 ou le 112.</strong>
                <span>
                  Cette contribution documente un événement. Elle ne déclenche
                  aucune intervention et n’est jamais publiée automatiquement.
                </span>
              </p>
            </aside>
            {incidentId ? (
              <p className="fv-event-incident">
                <PublicIcon name="flame" size={18} />
                Incident proposé : <strong>{incidentId}</strong>. L’association
                sera vérifiée.
              </p>
            ) : null}
            <ViewpointPicker
              value={{ longitude: state.longitude, latitude: state.latitude }}
              onChange={(point) =>
                setState((current) => ({ ...current, ...point }))
              }
            />
            <section
              className="fv-event-section"
              aria-labelledby="viewpoint-details-title"
            >
              <h2 id="viewpoint-details-title">Précision et orientation</h2>
              <div className="fw-form-grid">
                <label>
                  Précision horizontale (m)
                  <input
                    type="number"
                    min="1"
                    max="50000"
                    value={state.accuracy}
                    onChange={(event) => update("accuracy", event.target.value)}
                    required
                  />
                </label>
                <label>
                  Nom du point, facultatif
                  <input
                    value={state.label}
                    maxLength={255}
                    onChange={(event) => update("label", event.target.value)}
                    placeholder="Belvédère, route, lieu-dit…"
                  />
                </label>
                <label>
                  Altitude (m), facultative
                  <input
                    type="number"
                    min="-500"
                    max="10000"
                    step="any"
                    value={state.altitude}
                    onChange={(event) => update("altitude", event.target.value)}
                  />
                </label>
                <label>
                  Direction de l’appareil (°), facultative
                  <input
                    type="number"
                    min="0"
                    max="359.999999"
                    step="any"
                    value={state.yaw}
                    onChange={(event) => update("yaw", event.target.value)}
                  />
                </label>
                <label>
                  Champ de vision (°), facultatif
                  <input
                    type="number"
                    min="0.000001"
                    max="179.999999"
                    step="any"
                    value={state.fov}
                    onChange={(event) => update("fov", event.target.value)}
                  />
                </label>
              </div>
            </section>
            <section
              className="fv-event-section"
              aria-labelledby="observed-time-title"
            >
              <h2 id="observed-time-title">Moment observé</h2>
              <div className="fw-form-grid">
                <label>
                  Début de l’observation
                  <input
                    type="datetime-local"
                    value={state.observedStart}
                    onChange={(event) =>
                      update("observedStart", event.target.value)
                    }
                    required
                  />
                </label>
                <label>
                  Fin, facultative
                  <input
                    type="datetime-local"
                    value={state.observedEnd}
                    onChange={(event) =>
                      update("observedEnd", event.target.value)
                    }
                  />
                </label>
              </div>
            </section>
            <section
              className="fv-event-section"
              aria-labelledby="evidence-title"
            >
              <h2 id="evidence-title">Faits et médias</h2>
              <label>
                Message
                <textarea
                  rows={7}
                  maxLength={10000}
                  value={state.message}
                  onChange={(event) => update("message", event.target.value)}
                  placeholder="Décrivez uniquement ce que vous observez : flammes, fumée, direction apparente, repères visibles…"
                />
              </label>
              <label>
                Médias privés, facultatifs
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.mp4,.mov,.webm,image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                  multiple
                  onChange={(event) => {
                    const next = Array.from(event.target.files ?? []);
                    setFiles(next);
                    setError(validateEvidenceFiles(next));
                  }}
                />
                <small>
                  {files.length
                    ? `${files.length} média${files.length > 1 ? "s" : ""} sélectionné${files.length > 1 ? "s" : ""}`
                    : "0 à 20 images ou vidéos. 25 Mo par image, 500 Mo par vidéo, 2 Go au total."}
                </small>
              </label>
            </section>
            <section
              className="fv-event-section"
              aria-labelledby="consent-title"
            >
              <h2 id="consent-title">Accords</h2>
              <label className="fv-event-check">
                <input
                  type="checkbox"
                  checked={state.consentAnalysis}
                  onChange={(event) =>
                    update("consentAnalysis", event.target.checked)
                  }
                />
                <span>
                  <strong>Autoriser l’analyse privée</strong>Le message, les
                  médias, le moment et le viewpoint seront traités ensemble.
                </span>
              </label>
              <label className="fv-event-check">
                <input
                  type="checkbox"
                  checked={state.consentRetention}
                  onChange={(event) =>
                    update("consentRetention", event.target.checked)
                  }
                />
                <span>
                  <strong>Autoriser la conservation de la preuve</strong>La
                  preuve durable reste privée sauf décision distincte.
                </span>
              </label>
              <label className="fv-event-check">
                <input
                  type="checkbox"
                  checked={state.consentPublicDerivative}
                  onChange={(event) =>
                    update("consentPublicDerivative", event.target.checked)
                  }
                />
                <span>
                  <strong>Autoriser un dérivé public</strong>Facultatif. Le
                  viewpoint exact reste privé même avec cet accord.
                </span>
              </label>
            </section>
            {error ? (
              <p className="fw-form-error" role="alert">
                <PublicIcon name="warning" size={18} />
                {error}
              </p>
            ) : null}
            {progress ? (
              <p role="status" className="fv-event-progress">
                {progress}
              </p>
            ) : null}
            <footer className="fv-event-submit">
              <p>
                La position saisie est celle de l’appareil, jamais celle du
                phénomène actif.
              </p>
              <button
                type="submit"
                className="fw-button fw-button--primary"
                disabled={busy}
              >
                {busy ? "Transmission…" : "Envoyer à l’analyse"}
                <PublicIcon name="arrow" size={17} />
              </button>
            </footer>
          </form>
        )}
      </main>
    </>
  );
}

function CandidateCard({
  candidate,
}: {
  readonly candidate: EventCandidateResponse;
}) {
  return (
    <article className="fv-candidate-card">
      <header>
        <span>{STATE_LABEL[candidate.state]}</span>
        <time dateTime={candidate.created_at}>
          {new Date(candidate.created_at).toLocaleString("fr-FR")}
        </time>
      </header>
      <h2>
        {candidate.incident_id
          ? `Incident ${candidate.incident_id}`
          : "Incident candidat privé"}
      </h2>
      <p>
        Suivi : <code>{candidate.tracking_id}</code>
      </p>
      {candidate.review_message ? (
        <p className="fv-candidate-card__review-message">
          <strong>Message de revue :</strong> {candidate.review_message}
        </p>
      ) : null}
      <a href={`/mes-contributions/${candidate.candidate_id}`}>
        Ouvrir le reçu <PublicIcon name="chevron-right" size={16} />
      </a>
    </article>
  );
}

export function MyEventCandidatesPage({
  candidateId,
}: {
  readonly candidateId?: string;
}) {
  const auth = useSupabaseAuth();
  const [listing, setListing] = useState<EventCandidateListResponse | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const token = await auth.accessToken();
    if (!token) return;
    try {
      const loaded = candidateId
        ? {
            items: [
              await getMyEventCandidate(candidateId, { accessToken: token }),
            ],
            total: 1,
          }
        : await listMyEventCandidates({ accessToken: token });
      setListing(loaded);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Le suivi est indisponible.",
      );
    }
  }, [auth, candidateId]);
  useEffect(() => {
    if (!auth.verified) return undefined;
    void load();
    const interval = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(interval);
  }, [auth.verified, load]);
  return (
    <>
      <PageHero
        visual="account"
        title={candidateId ? "Suivi de la contribution" : "Mes contributions"}
        description="Dossiers privés documentés et états issus du pipeline événementiel."
      />
      <main className="fw-page fv-event-page">
        {!auth.user || !auth.verified ? (
          <AuthRequired />
        ) : error ? (
          <p className="fw-form-error" role="alert">
            {error}
          </p>
        ) : !listing ? (
          <p role="status">Chargement du suivi…</p>
        ) : listing.items.length ? (
          <section className="fv-candidate-list">
            {listing.items.map((item) => (
              <CandidateCard key={item.candidate_id} candidate={item} />
            ))}
          </section>
        ) : (
          <section className="fv-event-auth-required">
            <PublicIcon name="message" size={32} />
            <h2>Aucune contribution</h2>
            <p>Vos événements documentés apparaîtront ici.</p>
            <a className="fw-button fw-button--primary" href="/signaler">
              Documenter un événement
            </a>
          </section>
        )}
      </main>
    </>
  );
}
