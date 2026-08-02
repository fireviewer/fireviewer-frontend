import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadPublicIncidentView, publicIncidentDownloadUrl, type PublicIncidentView } from '../../lib/publicIncidentView';
import { loadPublicSpatialScene } from '../../lib/publicSpatialScene';
import { getViewerManifestApiOrigin } from '../../lib/manifestClient';
import type { ViewerManifestStatusCode, ViewerManifestSummary } from '../../lib/viewerManifest';
import { IncidentGlbViewer } from './IncidentGlbViewer';
import { PublicEmergencyNotice } from './FireWarningPublicShell';
import { PublicIcon, type PublicIconName } from './PublicIcon';
import type { TiledSceneViewPreset, TiledSceneWgs84Line, TiledSceneWgs84Polygon } from './TiledSpatialScene3D';
import incidentsHero from '../../assets/public/fire-hero-incidents.jpg';
import './public-incident.css';

const TiledSpatialScene3D = lazy(async () => {
  const module = await import('./TiledSpatialScene3D');
  return { default: module.TiledSpatialScene3D };
});

const STATUS: Record<ViewerManifestStatusCode, string> = { CANDIDATE: 'À vérifier', UNDER_REVIEW: 'À vérifier', ACTIVE_CONFIRMED: 'Actif', MONITORING: 'Sous surveillance', EXTINGUISHED: 'Éteint', CLOSED: 'Incident clos', SUSPENDED: 'Indisponible', REJECTED: 'Retiré' };
const VERIFICATION: Record<PublicIncidentView['verification'], string> = { verified: 'Vérifiée', corroborated: 'Recoupée', review_required: 'À revoir' };
const RESOURCE_KIND: Record<NonNullable<PublicIncidentView['official_resources']>[number]['kind'], string> = { safety: 'Consignes', press: 'Point presse', official_update: 'Mise à jour', authority: 'Service officiel' };
const FACT_CATEGORY: Record<string, string> = { fire_activity: 'Activité du feu', burned_area: 'Surface touchée', resources: 'Moyens engagés', evacuation: 'Évacuations', access: 'Accès', infrastructure: 'Infrastructures', weather: 'Météo', other: 'Autre information' };
const SPATIAL_KIND: Record<NonNullable<PublicIncidentView['daily_intelligence']>[number]['spatial_results'][number]['kind'], string> = { active_fire_point: 'Point actif', smoke_origin_point: 'Origine probable de fumée', visible_fire_front: 'Front visible', probable_activity_envelope: 'Zone probable d’activité', burned_area_polygon: 'Zone parcourue' };

type MapDay = {
  readonly analysis_id: string;
  readonly local_date: string;
  readonly intelligence: NonNullable<PublicIncidentView['daily_intelligence']>[number] | null;
};

function date(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Non publiée';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(new Date(value));
}

function day(value: string): string { return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeZone: 'Europe/Paris' }).format(new Date(`${value}T12:00:00Z`)); }
function hour(value: string): string { return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(new Date(value)); }

function Card({ title, icon, children, className = '' }: { readonly title: string; readonly icon: PublicIconName; readonly children: ReactNode; readonly className?: string }) {
  return <section className={`fw-incident-card ${className}`}><header><PublicIcon name={icon} size={21} /><h2>{title}</h2></header>{children}</section>;
}

function EmptySection({ title, text, icon = 'info' }: { readonly title: string; readonly text: string; readonly icon?: PublicIconName }) {
  return <section className="fw-incident-empty"><PublicIcon name={icon} size={26} /><div><h2>{title}</h2><p>{text}</p></div></section>;
}

function Disclosure({ title, description, icon, summary, className = '', children }: { readonly title: string; readonly description: string; readonly icon: PublicIconName; readonly summary?: string; readonly className?: string; readonly children: ReactNode }) {
  return <details className={`fw-incident-disclosure ${className}`}><summary><PublicIcon name={icon} size={22} /><span><strong>{title}</strong><small>{description}</small></span>{summary ? <em>{summary}</em> : null}<PublicIcon name="chevron-down" size={20} /></summary><div className="fw-incident-disclosure__body">{children}</div></details>;
}

function Timeline({ view }: { readonly view: PublicIncidentView }) {
  const groups = useMemo(() => {
    const map = new Map<string, PublicIncidentView['timeline']>();
    for (const item of view.timeline) {
      const key = item.occurred_at.slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return [...map.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [view.timeline]);
  const [selected, setSelected] = useState<string | null>(null);
  const active = selected ?? groups[0]?.[0] ?? null;
  const activeEntries = groups.find(([key]) => key === active)?.[1] ?? [];
  if (!groups.length) return null;
  const publicationCount = groups.reduce((total, [, entries]) => total + entries.length, 0);
  return <Disclosure className="fw-incident-disclosure--timeline" title="Évolution publiée" description="Les faits affichés correspondent aux informations rendues publiques." icon="calendar" summary={`${groups.length} jours · ${publicationCount} publications`}><section className="fw-incident-timeline" aria-label="Évolution publiée">{groups.length > 1 ? <div className="fw-incident-date-picker" aria-label="Choisir une journée">{groups.map(([key, entries]) => <button key={key} type="button" className={key === active ? 'is-active' : undefined} aria-pressed={key === active} onClick={() => setSelected(key)}>{new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', timeZone: 'Europe/Paris' }).format(new Date(`${key}T12:00:00Z`))}{entries.length > 1 ? ` · ${entries.length}` : ''}</button>)}</div> : null}<h3>{active ? day(active) : ''}</h3><ol>{activeEntries.map((item, index) => <li key={`${item.occurred_at}-${index}`}><time dateTime={item.occurred_at}>{hour(item.occurred_at)}</time><span>{item.label}</span></li>)}</ol></section></Disclosure>;
}

function Metrics({ view }: { readonly view: PublicIncidentView }) {
  const current = view.episodes.find((episode) => episode.is_current) ?? view.episodes[0];
  const operational = view.operational_information ?? [];
  const metricInformation = operational.filter((item) => item.kind === 'evacuated_people' || item.kind === 'mobilized_personnel' || item.kind === 'mobilized_vehicles').filter((item) => item.value_number != null).slice(0, 2);
  const metrics = [
    { label: 'État', value: STATUS[view.status as ViewerManifestStatusCode] ?? view.status, detail: VERIFICATION[view.verification] },
    current?.estimated_area_ha != null ? { label: 'Surface estimée', value: `${current.estimated_area_ha.toLocaleString('fr-FR')} ha`, detail: 'Estimation publiée' } : null,
    view.participatory_published_count != null || view.participatory_received_count != null || view.participatory_observation_count != null ? {
      label: 'Contributions participatives',
      value: `${view.participatory_published_count ?? view.participatory_observation_count ?? 0} publiés · ${view.participatory_received_count ?? view.participatory_published_count ?? view.participatory_observation_count ?? 0} reçus`,
      detail: 'Éléments transmis par des utilisateurs',
    } : null,
    ...metricInformation.map((item) => ({ label: item.title, value: `${item.value_number!.toLocaleString('fr-FR')} ${item.unit ?? ''}`.trim(), detail: [item.locality, item.authority_name].filter(Boolean).join(' · ') })),
  ].filter((item): item is { label: string; value: string; detail: string } => item !== null);
  return metrics.length ? <Disclosure className="fw-incident-disclosure--metrics" title="Repères de l’incident" description="Synthèse des informations effectivement publiées." icon="chart" summary={`${metrics.length} indicateurs`}><section className="fw-incident-metrics" aria-label="Repères de l'incident">{metrics.map((metric) => <article key={metric.label} className="fw-incident-metric"><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small></article>)}</section></Disclosure> : null;
}

function DailyIntelligence({ view }: { readonly view: PublicIncidentView }) {
  const days = view.daily_intelligence ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  if (!days.length) return null;
  const active = days.find((item) => item.analysis_id === selected) ?? days[days.length - 1]!;
  const value = (fact: NonNullable<PublicIncidentView['daily_intelligence']>[number]['facts'][number]) => {
    if (fact.value_number !== null) return `${fact.value_number.toLocaleString('fr-FR')} ${fact.unit ?? ''}`.trim();
    if (fact.value_boolean !== null) return fact.value_boolean ? 'Oui' : 'Non';
    return fact.value_text;
  };
  return <Disclosure className="fw-incident-disclosure--intelligence" title="Situation analysée et validée" description="Synthèses, faits et éléments spatiaux contrôlés avant publication." icon="shield" summary={`${days.length} journée${days.length > 1 ? 's' : ''}`}>
    <section className="fw-daily-intelligence" aria-label="Situation analysée et validée">
      {days.length > 1 ? <div className="fw-incident-date-picker" aria-label="Choisir une synthèse quotidienne">{days.map((item) => <button key={item.analysis_id} type="button" className={item.analysis_id === active.analysis_id ? 'is-active' : undefined} aria-pressed={item.analysis_id === active.analysis_id} onClick={() => setSelected(item.analysis_id)}>{new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', timeZone: 'Europe/Paris' }).format(new Date(`${item.local_date}T12:00:00Z`))}</button>)}</div> : null}
      <header><span>Publié le {date(active.published_at)}</span><h3>{active.report.title}</h3></header>
      <div className="fw-daily-intelligence__report">{active.report.body_markdown.split(/\n{2,}/).filter(Boolean).map((paragraph, index) => <p key={`${active.report.report_revision_id}-${index}`}>{paragraph}</p>)}</div>
      {active.facts.length ? <section className="fw-daily-intelligence__facts"><h4>Faits sourcés</h4><ul>{active.facts.map((fact) => <li key={fact.fact_id}><div><span>{FACT_CATEGORY[fact.category] ?? fact.category}</span><strong>{fact.summary}</strong><small>{date(fact.as_of)} · {fact.certainty.replaceAll('_', ' ')}</small></div><div className="fw-daily-intelligence__fact-value"><b>{value(fact)}</b>{fact.evidence.source_reference_url ? <a href={fact.evidence.source_reference_url} target="_blank" rel="noreferrer">Voir la source <PublicIcon name="external" size={14} /></a> : <small>Preuve conservée en privé</small>}</div></li>)}</ul></section> : null}
      {active.spatial_results.length ? <section className="fw-daily-intelligence__spatial"><h4>Éléments spatiaux publiés</h4><ul>{active.spatial_results.map((result) => <li key={result.proposal_id}><PublicIcon name="map" size={18} /><div><strong>{SPATIAL_KIND[result.kind]}</strong><small>{date(result.observed_at)} · précision annoncée ± {Math.round(result.horizontal_accuracy_m).toLocaleString('fr-FR')} m</small>{result.evidence.source_reference_url ? <a href={result.evidence.source_reference_url} target="_blank" rel="noreferrer">Source associée <PublicIcon name="external" size={14} /></a> : <span>Preuve associée conservée en privé</span>}</div></li>)}</ul></section> : null}
    </section>
  </Disclosure>;
}

function DailyMapGallery({ view, fireId }: { readonly view: PublicIncidentView; readonly fireId: string }) {
  const captures = view.map_gallery ?? [];
  if (!captures.length) return null;
  return <section className="fw-map-gallery" aria-labelledby="map-gallery-title"><header><PublicIcon name="map" size={23} /><div><h2 id="map-gallery-title">Évolution cartographique</h2><p>Captures de la zone validée et publiée.</p></div></header><ul>{captures.map((capture) => <li key={capture.capture_id}><figure><img src={publicIncidentDownloadUrl(fireId, capture.image_url)} alt={`Zone de l’incendie publiée pour le ${day(capture.local_date)}`} width={capture.width_px} height={capture.height_px} loading="lazy" /></figure><div><strong>{day(capture.local_date)}</strong><small>Capture publiée le {date(capture.captured_at)}</small></div></li>)}</ul></section>;
}

function OperationalInformation({ view }: { readonly view: PublicIncidentView }) {
  const information = view.operational_information ?? [];
  if (!information.length) return null;
  return <Disclosure className="fw-incident-disclosure--operational" title="Informations opérationnelles" description="Éléments publiés par les autorités compétentes." icon="info" summary={`${information.length} éléments`}><section className="fw-operational-information" aria-label="Informations opérationnelles"><ul>{information.map((item) => <li key={item.information_id}><a href={item.source_url} target="_blank" rel="noreferrer"><div><span>{item.title}</span><strong>{item.value_text ?? `${item.value_number!.toLocaleString('fr-FR')} ${item.unit ?? ''}`.trim()}</strong><small>{[item.locality, item.authority_name, item.effective_at ? date(item.effective_at) : null].filter(Boolean).join(' · ')}</small></div><PublicIcon name="external" size={17} /></a></li>)}</ul></section></Disclosure>;
}

function OfficialResources({ view }: { readonly view: PublicIncidentView }) {
  const resources = view.official_resources ?? [];
  if (!resources.length) return null;
  return <section className="fw-official-resources" aria-labelledby="official-resources-title"><header><PublicIcon name="shield" size={23} /><div><h2 id="official-resources-title">Informations et consignes officielles</h2><p>Relais validés avant publication.</p></div></header><ul>{resources.map((resource) => <li key={resource.resource_id}><a href={resource.url} target="_blank" rel="noreferrer"><span>{RESOURCE_KIND[resource.kind]}</span><strong>{resource.title}</strong><small>{resource.publisher}{resource.published_at ? ` · ${date(resource.published_at)}` : ''}</small><PublicIcon name="external" size={17} /></a></li>)}</ul></section>;
}

function IncidentGallery({ view }: { readonly view: PublicIncidentView }) {
  const items = view.gallery ?? [];
  if (!items.length) return null;
  return <section className="fw-incident-gallery" aria-labelledby="incident-gallery-title"><header><PublicIcon name="image" size={23} /><div><h2 id="incident-gallery-title">Galerie de l’événement</h2><p>Éléments éditoriaux validés avant publication.</p></div></header><ul>{items.map((item) => <li key={item.gallery_item_id}><figure>{item.media_kind === 'video' ? <video controls preload="metadata" aria-label={item.alt_text}><source src={item.media_url} /></video> : <img src={item.media_url} alt={item.alt_text} loading="lazy" />}</figure><div><h3>{item.title}</h3>{item.caption ? <p>{item.caption}</p> : null}{item.credit || item.license_label || item.captured_at ? <small>{[item.credit, item.license_label, item.captured_at ? date(item.captured_at) : null].filter(Boolean).join(' · ')}</small> : null}</div></li>)}</ul></section>;
}

function IncidentSources({ view, fireId }: { readonly view: PublicIncidentView; readonly fireId: string }) {
  const hasContent = view.sources.length || view.limitations.length || view.downloads.length;
  if (!hasContent) return null;
  return <details className="fw-incident-sources"><summary><PublicIcon name="info" size={20} /><span><strong>Sources et limites</strong><small>Traçabilité et périmètre des données publiées</small></span></summary><div>{view.sources.length ? <section><h2>Sources publiées</h2><ul>{view.sources.map((source) => <li key={source.source_id}><strong>{source.name ?? source.type}</strong><span>{source.trust} · {source.observation_count} observation{source.observation_count > 1 ? 's' : ''}</span>{source.external_reference ? <a href={source.external_reference} target="_blank" rel="noreferrer">Consulter la source</a> : null}</li>)}</ul></section> : null}{view.limitations.length ? <section><h2>Limites connues</h2><ul>{view.limitations.map((item) => <li key={item}>{item}</li>)}</ul></section> : null}{view.downloads.length ? <section><h2>Téléchargements</h2><ul>{view.downloads.map((item) => <li key={item.id}><a href={publicIncidentDownloadUrl(fireId, item.url)}>{item.label}</a></li>)}</ul></section> : null}</div></details>;
}

function IncidentActions({ fireId }: { readonly fireId: string }) {
  return <section className="fw-incident-actions" aria-label="Actions utiles"><div><PublicIcon name="phone" size={23} /><div><h2>Besoin d’une aide immédiate ?</h2><p>En cas de danger ou de personnes menacées, contactez les secours.</p></div></div><div className="fw-incident-actions__buttons"><a className="fw-button fw-button--outline" href="tel:18">Appeler le 18</a><a className="fw-button fw-button--outline" href="tel:112">Appeler le 112</a><a className="fw-button fw-button--primary" href={`/incendie/${fireId}/ajouter-preuve`}><PublicIcon name="plus-circle" size={17} />Ajouter une preuve</a></div></section>;
}

function polygonOverlays(geometry: Readonly<Record<string, unknown>>, color: string, opacity: number): readonly TiledSceneWgs84Polygon[] {
  const point = (value: unknown): readonly [number, number] | null => Array.isArray(value) && typeof value[0] === 'number' && Number.isFinite(value[0]) && typeof value[1] === 'number' && Number.isFinite(value[1]) ? [value[0], value[1]] : null;
  const ring = (value: unknown): readonly (readonly [number, number])[] | null => {
    if (!Array.isArray(value)) return null;
    const points = value.map(point);
    return points.every((item): item is readonly [number, number] => item !== null) && points.length >= 3 ? points : null;
  };
  const polygon = (value: unknown): TiledSceneWgs84Polygon | null => {
    if (!Array.isArray(value)) return null;
    const rings = value.map(ring).filter((item): item is readonly (readonly [number, number])[] => item !== null);
    const [outer, ...holes] = rings;
    return outer ? { outer, holes, color, opacity } : null;
  };
  const coordinates = geometry.coordinates;
  if (geometry.type === 'Polygon') { const value = polygon(coordinates); return value ? [value] : []; }
  if (geometry.type === 'MultiPolygon' && Array.isArray(coordinates)) return coordinates.flatMap((item) => { const value = polygon(item); return value ? [value] : []; });
  return [];
}

function polygonBoundaries(polygons: readonly TiledSceneWgs84Polygon[]): readonly TiledSceneWgs84Line[] {
  return polygons.flatMap((polygon) => [{ points: polygon.outer, color: polygon.color }, ...(polygon.holes ?? []).map((points) => ({ points, color: polygon.color }))]);
}

function MapPanel({ view, summary, onClose }: { readonly view: PublicIncidentView | null; readonly summary: ViewerManifestSummary; readonly onClose: () => void }) {
  const [lowData, setLowData] = useState(() => localStorage.getItem('firewarning-low-data') === 'true');
  const [open3d, setOpen3d] = useState(false);
  const [scene, setScene] = useState(() => summary.scene?.files.length ? summary.scene : null);
  const [sceneLoading, setSceneLoading] = useState(false);
  const [sceneError, setSceneError] = useState(false);
  const [preset, setPreset] = useState<TiledSceneViewPreset>('near');
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const hasSpatial = summary.modelState === 'available' && Boolean(summary.asset || summary.scene);
  const tiledSource = useMemo(() => !scene ? null : { catalogUrl: new URL(scene.catalog_url, getViewerManifestApiOrigin() ?? window.location.origin).toString(), files: Object.fromEntries(scene.files.map((file) => [file.path, new URL(file.url, getViewerManifestApiOrigin() ?? window.location.origin).toString()])) }, [scene]);
  const analysisDays = useMemo<readonly MapDay[]>(() => {
    const days = new Map<string, MapDay>();
    for (const intelligence of view?.daily_intelligence ?? []) {
      days.set(intelligence.analysis_id, { analysis_id: intelligence.analysis_id, local_date: intelligence.local_date, intelligence });
    }
    for (const zone of [...(view?.active_fire_zones ?? []), ...(view?.burned_area_zones ?? [])]) {
      if (zone.analysis_id && !days.has(zone.analysis_id)) {
        days.set(zone.analysis_id, { analysis_id: zone.analysis_id, local_date: zone.valid_at.slice(0, 10), intelligence: null });
      }
    }
    return [...days.values()].sort((left, right) => left.local_date.localeCompare(right.local_date) || left.analysis_id.localeCompare(right.analysis_id));
  }, [view]);
  const selectedDay = analysisDays.find((item) => item.analysis_id === selectedAnalysisId) ?? analysisDays.at(-1) ?? null;
  const mapLayers = useMemo(() => {
    const activeZones = (view?.active_fire_zones ?? (view?.active_fire_zone ? [view.active_fire_zone] : [])).filter((item) => item.zone_kind === 'active');
    const burnedZones = (view?.burned_area_zones ?? []).filter((item) => item.zone_kind === 'burned');
    const activeForDay = selectedDay ? activeZones.filter((item) => item.analysis_id === selectedDay.analysis_id) : activeZones.slice(-1);
    const burnedForDay = selectedDay ? burnedZones.filter((item) => item.analysis_id === selectedDay.analysis_id) : burnedZones.slice(-1);
    const legacyBurnedForDay = burnedForDay.length ? [] : selectedDay?.intelligence?.spatial_results.filter((item) => item.kind === 'burned_area_polygon') ?? [];
    const polygons = [
      ...burnedForDay.flatMap((item) => polygonOverlays(item.geometry_geojson, '#dc5b35', 0.36)),
      ...legacyBurnedForDay.flatMap((item) => polygonOverlays(item.geometry_geojson, '#dc5b35', 0.36)),
      ...activeForDay.flatMap((item) => polygonOverlays(item.geometry_geojson, '#ffca3a', 0.54)),
    ];
    return { polygons, outlines: polygonBoundaries(polygons) };
  }, [selectedDay, view]);
  const setLow = () => setLowData((value) => { localStorage.setItem('firewarning-low-data', String(!value)); return !value; });
  const openSpatialView = async () => {
    if (summary.asset || scene) {
      setOpen3d(true);
      return;
    }
    if (!summary.scene) return;
    setSceneLoading(true);
    setSceneError(false);
    try {
      setScene(await loadPublicSpatialScene(summary.fireId));
      setOpen3d(true);
    } catch {
      setSceneError(true);
    } finally {
      setSceneLoading(false);
    }
  };
  return <div className="fw-map-panel-backdrop" role="presentation">
    <aside className="fw-map-panel" role="dialog" aria-modal="true" aria-label="Carte">
      <header><div><span>Carte</span><h2>{view?.canonical_name ?? `Incident ${summary.fireId}`}</h2></div><button type="button" onClick={onClose} aria-label="Fermer la carte"><PublicIcon name="close" size={22} /></button></header>
      <div className="fw-map-panel__body">
        {!hasSpatial ? <EmptySection title="Aucune carte publiée" text="Cette fiche peut être consultée sans carte, périmètre ni représentation 3D." icon="map" /> : null}
        {hasSpatial && lowData ? <><div className="fw-map-panel__tools"><button type="button" onClick={setLow}><PublicIcon name="data" size={17} />Activer la vue 3D</button></div><EmptySection title="Vue 3D désactivée" text="Le mode faible connexion laisse la situation et l’évolution accessibles." icon="data" /></> : null}
        {hasSpatial && !lowData && !open3d ? <><div className="fw-map-panel__tools"><button type="button" onClick={setLow}><PublicIcon name="data" size={17} />Faible connexion</button></div><section className="fw-viewer-fallback"><PublicIcon name="map" size={30} /><h2>Vue 3D à la demande</h2><p>Le catalogue et les tuiles ne seront chargés qu’après votre action.</p>{sceneError ? <p role="alert">La scène 3D n’a pas pu être préparée.</p> : null}<button className="fw-button fw-button--primary" type="button" disabled={sceneLoading} onClick={() => void openSpatialView()}>{sceneLoading ? 'Préparation de la vue 3D…' : 'Ouvrir la vue 3D'} {!sceneLoading ? <PublicIcon name="arrow" size={16} /> : null}</button></section></> : null}
        {hasSpatial && !lowData && open3d ? <div className="fw-incident-viewer">
          <div className="fw-viewer-distance" aria-label="Distance de la représentation">{([['near', 'Zone proche'], ['local', 'Secteur local'], ['extended', 'Vue étendue']] as const).map(([id, label]) => <button key={id} className={preset === id ? 'is-active' : undefined} type="button" onClick={() => setPreset(id)}>{label}</button>)}</div>
          {analysisDays.length ? <section className="fw-map-day-timeline" aria-label="Chronologie des périmètres"><header><div><strong>Journée représentée</strong><small>{analysisDays.length} journées disponibles · les deux calques changent ensemble</small></div><div className="fw-map-layer-legend"><span><i className="is-burned">●</i> Zone parcourue</span><span><i className="is-active">●</i> Zone active</span></div></header><div className="fw-incident-date-picker" role="tablist" aria-label="Choisir une journée de périmètre">{analysisDays.map((item) => <button key={item.analysis_id} role="tab" type="button" className={item.analysis_id === selectedDay?.analysis_id ? 'is-active' : undefined} aria-selected={item.analysis_id === selectedDay?.analysis_id} onClick={() => setSelectedAnalysisId(item.analysis_id)}>{new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', timeZone: 'Europe/Paris' }).format(new Date(`${item.local_date}T12:00:00Z`))}</button>)}</div><p>{selectedDay ? day(selectedDay.local_date) : 'Aucune journée disponible'}</p></section> : null}
          {tiledSource ? <Suspense fallback={<div className="incident-tiled-scene__loading" role="status">Préparation de la vue 3D…</div>}><TiledSpatialScene3D source={tiledSource} overlayOriginWgs84={summary.frame?.origin_wgs84} viewPreset={preset} overlayWgs84Lines={mapLayers.outlines} overlayWgs84Polygons={mapLayers.polygons} /></Suspense> : summary.asset ? <IncidentGlbViewer assetUrl={summary.asset.url} version={summary.asset.version} sha256={summary.asset.sha256} frame={summary.frame} terrainSourceYear={summary.freshness.terrain_source_year} observations={view?.observations ?? []} /> : null}
        </div> : null}
      </div>
    </aside>
  </div>;
}

export function PublicIncidentRealPage({ summary, checkedAt: _checkedAt, stale, refreshing, onRefresh, detailRequest, emptyPreview = false, demoLabel }: { readonly summary: ViewerManifestSummary; readonly checkedAt: string; readonly stale: boolean; readonly refreshing: boolean; readonly onRefresh: () => void; readonly detailRequest?: Promise<{ readonly view: PublicIncidentView | null; readonly error: unknown | null }>; readonly emptyPreview?: boolean; readonly demoLabel?: string }) {
  const [view, setView] = useState<PublicIncidentView | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailError, setDetailError] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [shared, setShared] = useState(false);
  useEffect(() => { let alive = true; const request = detailRequest ?? loadPublicIncidentView(summary.fireId).then((loaded) => ({ view: loaded, error: null })).catch((error: unknown) => ({ view: null, error })); void request.then((result) => { if (alive) { setView(result.view); setDetailError(Boolean(result.error)); setLoading(false); } }); return () => { alive = false; }; }, [detailRequest, summary.fireId]);
  const current = view?.episodes.find((episode) => episode.is_current) ?? view?.episodes[0];
  const title = view?.canonical_name ?? (emptyPreview ? 'Fiche de démonstration' : `Incident ${summary.fireId}`);
  const status = emptyPreview ? (demoLabel ?? 'Démonstration locale') : STATUS[summary.statusCode];
  const summaryText = view?.public_note ?? (view ? `Dernier état publié : ${STATUS[view.status as ViewerManifestStatusCode] ?? view.status}.` : null);
  const share = async () => { try { await navigator.clipboard.writeText(`${window.location.origin}/incendie/${summary.fireId}`); setShared(true); window.setTimeout(() => setShared(false), 2_000); } catch { window.location.hash = 'partage-indisponible'; } };
  return <article className="fw-incident-page"><header className="fw-incident-heading" style={{ '--fw-hero-image': `url(${incidentsHero})` } as React.CSSProperties}><div className="fw-page"><a href="/incendies" className="fw-incident-back"><PublicIcon name="arrow-left" size={18} /> Incendies</a><div className="fw-incident-title-row"><div><span className="fw-incident-status">{status}</span><h1>{title}</h1><p>{summary.fireId}</p></div><button className="fw-incident-share" type="button" onClick={() => void share()}><PublicIcon name="share" size={18} />{shared ? 'Lien copié' : 'Partager'}</button></div>{view ? <p className="fw-incident-freshness"><PublicIcon name="clock" size={17} />Dernière observation : {date(current?.last_observed_at ?? view.freshness_at)}{view.last_human_validation_at ? ` · validation humaine : ${date(view.last_human_validation_at)}` : ''}</p> : null}<PublicEmergencyNotice /></div></header><main className="fw-page fw-incident-main">{loading ? <section className="fw-incident-loading" role="status"><span /><span /><span /></section> : null}{!loading && !view ? <EmptySection title={emptyPreview ? 'Données de démonstration indisponibles' : 'Aucune donnée détaillée publiée'} text={emptyPreview ? 'Le scénario local n’a pas pu être chargé.' : 'Cette fiche reste accessible, mais aucun résumé, indicateur, carte ou source détaillée n’est publié.'} /> : null}{view ? <div className="fw-incident-content-stack"><section className="fw-incident-situation"><header><div><span>Situation actuelle</span><h2>Situation au {date(current?.last_observed_at ?? view.freshness_at)}</h2></div><PublicIcon name="info" size={24} /></header><p>{summaryText}</p></section><Metrics view={view} /><DailyIntelligence view={view} /><OperationalInformation view={view} /><OfficialResources view={view} /><IncidentGallery view={view} /><DailyMapGallery view={view} fireId={summary.fireId} /><section className="fw-map-callout"><div><PublicIcon name="map" size={27} /><div><h2>Carte spatiale</h2><p>Consultez les calques et la vue 3D lorsqu’ils sont effectivement publiés.</p></div></div><button className="fw-button fw-button--primary" type="button" onClick={() => setMapOpen(true)}>Ouvrir la carte <PublicIcon name="arrow" size={16} /></button></section><Timeline view={view} /><IncidentActions fireId={summary.fireId} /><IncidentSources view={view} fireId={summary.fireId} /></div> : null}{detailError && !emptyPreview ? <p className="fw-incident-detail-error" role="alert"><PublicIcon name="info" size={18} />Certaines informations détaillées sont indisponibles. <button type="button" onClick={onRefresh} disabled={refreshing}>{refreshing ? 'Actualisation…' : 'Réessayer'}</button></p> : null}{stale && view ? <p className="fw-incident-detail-error" role="status"><PublicIcon name="warning" size={18} />Ces informations peuvent être anciennes.</p> : null}</main>{mapOpen ? <MapPanel view={view} summary={summary} onClose={() => setMapOpen(false)} /> : null}</article>;
}
