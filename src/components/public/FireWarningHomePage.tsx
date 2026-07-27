import { useId, useState } from 'react';
import heroImage from '../../assets/public/fire-hero-home.jpg';
import { PublicIcon, type PublicIconName } from './PublicIcon';
import { PublicEmergencyNotice } from './FireWarningPublicShell';

const features: readonly { icon: PublicIconName; title: string; description: string; action: string; href: string }[] = [
  { icon: 'map', title: 'Incendies référencés', description: 'Consultez les fiches d’incidents publiées et leur état de fraîcheur.', action: 'Consulter', href: '/incendies' },
  { icon: 'shield', title: 'Comprendre les données', description: 'Découvrez ce qui est vérifié, publié ou indisponible.', action: 'Comprendre', href: '/fonctionnement' },
  { icon: 'user', title: 'Préférences locales', description: 'Adaptez uniquement les réglages disponibles sur cet appareil.', action: 'Réglages', href: '/reglages' },
];

export function FireWarningHomePage() {
  const [query, setQuery] = useState('');
  const inputId = useId();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    window.location.assign(value ? `/incendies?vue=archives&q=${encodeURIComponent(value)}` : '/incendies');
  }

  function usePosition() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      window.location.assign(`/incendies?vue=archives&latitude=${coords.latitude.toFixed(5)}&longitude=${coords.longitude.toFixed(5)}`);
    });
  }

  return (
    <>
      <section className="fw-home-hero" style={{ '--fw-hero-image': `url(${heroImage})` } as React.CSSProperties}>
        <div className="fw-home-hero__inner fw-page">
          <h1>Incendies<span>référencés</span></h1>
          <p>Consultez leur situation, la date de la dernière observation<br /> et les informations effectivement publiées.</p>
          <div className="fw-home-hero__actions">
            <a className="fw-hero-button fw-hero-button--primary" href="/incendies"><PublicIcon name="map" size={30} /><span>Consulter les incendies</span><PublicIcon name="chevron-right" size={18} /></a>
          </div>
          <PublicEmergencyNotice />
        </div>
      </section>

      <div className="fw-home-content fw-page">
        <form className="fw-search" role="search" onSubmit={submit}>
          <label className="sr-only" htmlFor={inputId}>Rechercher un lieu, une commune ou un incident</label>
          <PublicIcon name="search" size={21} />
          <input id={inputId} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un lieu, une commune ou un incident" />
          <button type="button" aria-label="Utiliser ma position" onClick={usePosition}><PublicIcon name="crosshair" size={21} /></button>
        </form>

        <section className="fw-feature-grid" aria-label="Accès principaux">
          {features.map((feature) => (
            <article className="fw-feature" key={feature.title}>
              <div className="fw-feature__icon"><PublicIcon name={feature.icon} size={34} /></div>
              <div className="fw-feature__content"><h2>{feature.title}</h2><p>{feature.description}</p><a href={feature.href}>{feature.action}<PublicIcon name="arrow" size={15} /></a></div>
              <PublicIcon className="fw-feature__mobile-chevron" name="chevron-right" size={20} />
            </article>
          ))}
        </section>

        <section className="fw-home-guide" aria-labelledby="fw-home-guide-title">
          <div className="fw-home-guide__heading"><span>Sur chaque fiche</span><h2 id="fw-home-guide-title">Une information lisible, sans extrapolation.</h2><p>Les éléments non publiés restent signalés comme indisponibles.</p></div>
          <div className="fw-home-guide__items">
            <article><PublicIcon name="info" size={23} /><div><h3>Situation</h3><p>Statut, vérification et dernière observation.</p></div></article>
            <article><PublicIcon name="map" size={23} /><div><h3>Carte et évolution</h3><p>Affichées seulement lorsqu’elles sont publiées.</p></div></article>
            <article><PublicIcon name="shield" size={23} /><div><h3>Sources et limites</h3><p>Ce qui soutient la fiche et ce qui manque.</p></div></article>
          </div>
        </section>
      </div>
    </>
  );
}
