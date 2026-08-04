import type {
  PublicFireActivityEvent,
  PublicIncidentEventTimeline,
} from '../../lib/publicEventTimeline';
import { PublicIcon } from './PublicIcon';

const PHENOMENON_LABELS: Readonly<Record<string, string>> = {
  active_fire: 'Flamme ou foyer actif',
  visible_front: 'Portion de front visible',
  smoke_origin: 'Origine probable de fumée',
  thermal_hotspot: 'Hotspot thermique',
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Paris',
  }).format(new Date(value));
}

function formatInstant(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  }).format(new Date(value));
}

function geometryLabel(event: PublicFireActivityEvent): string {
  if (event.geometry.type === 'Point') return 'Point observé';
  if (event.geometry.type === 'LineString') return 'Segment de front observé';
  return `${event.geometry.coordinates.length} segments de front observés`;
}

export function PublicEventTimelinePanel({
  timeline,
  instants,
  selectedAt,
  selectedEvents,
  showUncertainty,
  onSelect,
  onToggleUncertainty,
}: {
  readonly timeline: PublicIncidentEventTimeline;
  readonly instants: readonly string[];
  readonly selectedAt: string | null;
  readonly selectedEvents: readonly PublicFireActivityEvent[];
  readonly showUncertainty: boolean;
  readonly onSelect: (observedStartAt: string) => void;
  readonly onToggleUncertainty: () => void;
}) {
  return <section className="fw-public-event-timeline" aria-labelledby="fw-public-event-timeline-title">
    <header>
      <div>
        <span>Événements validés et publiés</span>
        <h2 id="fw-public-event-timeline-title">Progression observée</h2>
        <p>Chaque instant correspond au début publié d’une observation. Aucun état intermédiaire n’est inventé.</p>
      </div>
      <small>Révision publique {timeline.revision}</small>
    </header>
    {instants.length ? <>
      <div className="fw-public-event-timeline__controls">
        <div className="fw-public-event-timeline__instants" role="tablist" aria-label="Choisir un instant publié">
          {instants.map((instant) => <button
            key={instant}
            type="button"
            role="tab"
            aria-selected={instant === selectedAt}
            className={instant === selectedAt ? 'is-active' : undefined}
            onClick={() => onSelect(instant)}
          >{formatInstant(instant)}</button>)}
        </div>
        <button
          type="button"
          className={showUncertainty ? 'is-active' : undefined}
          aria-pressed={showUncertainty}
          onClick={onToggleUncertainty}
        ><PublicIcon name="data" size={16} />Incertitudes</button>
      </div>
      <section className="fw-public-event-timeline__selection" aria-live="polite" aria-label="Événements démarrés à l’instant sélectionné">
        <h3>{selectedAt ? `Observations démarrées le ${formatDate(selectedAt)}` : 'Instant non sélectionné'}</h3>
        <ul>
          {selectedEvents.map((event) => <li key={event.event_id}>
            <PublicIcon name="map" size={19} />
            <div>
              <strong>{PHENOMENON_LABELS[event.phenomenon_kind] ?? 'Phénomène actif publié'}</strong>
              <span>{geometryLabel(event)}</span>
              <small>{event.observed_end_at ? `Du ${formatDate(event.observed_start_at)} au ${formatDate(event.observed_end_at)}` : formatDate(event.observed_start_at)} · méthode {event.method}</small>
            </div>
          </li>)}
        </ul>
      </section>
    </> : <p className="fw-public-event-timeline__empty">Aucun événement actif n’est publié dans la timeline événementielle.</p>}
  </section>;
}
