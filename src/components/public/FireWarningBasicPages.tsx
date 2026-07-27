import { useEffect, useState, type ReactNode } from 'react';
import aboutHero from '../../assets/public/fire-hero-about.jpg';
import accessibilityHero from '../../assets/public/fire-hero-accessibility.jpg';
import accountHero from '../../assets/public/fire-hero-account.jpg';
import incidentsHero from '../../assets/public/fire-hero-incidents.jpg';
import operationHero from '../../assets/public/fire-hero-information.jpg';
import legalHero from '../../assets/public/fire-hero-legal.jpg';
import privacyHero from '../../assets/public/fire-hero-privacy.jpg';
import reportHero from '../../assets/public/fire-hero-report.jpg';
import settingsHero from '../../assets/public/fire-hero-settings.jpg';
import { PublicIcon, type PublicIconName } from './PublicIcon';
import { PublicEmergencyNotice } from './FireWarningPublicShell';
import './firewarning-pages.css';

export type PageVisual = 'account' | 'settings' | 'community' | 'privacy' | 'accessibility' | 'legal' | 'about' | 'incidents' | 'report';

const pageHeroByVisual: Readonly<Record<PageVisual, string>> = {
  accessibility: accessibilityHero,
  account: accountHero,
  about: aboutHero,
  community: operationHero,
  incidents: incidentsHero,
  legal: legalHero,
  privacy: privacyHero,
  report: reportHero,
  settings: settingsHero,
};

export function PageHero({ title, description, visual, children }: { readonly title: string; readonly description: string; readonly visual: PageVisual; readonly children?: ReactNode }) {
  return (
    <section className={`fw-page-hero fw-page-hero--${visual}`} style={{ '--fw-page-hero': `url(${pageHeroByVisual[visual]})` } as React.CSSProperties}>
      <div className="fw-page fw-page-hero__inner"><div className="fw-page-hero__copy">{children}<h1>{title}</h1><p>{description}</p></div><PublicEmergencyNotice /></div>
    </section>
  );
}

function ActionCard({ icon, title, text, href, action, prominent = false }: { readonly icon: PublicIconName; readonly title: string; readonly text: string; readonly href: string; readonly action: string; readonly prominent?: boolean }) {
  return (
    <article className={`fw-action-card ${prominent ? 'fw-action-card--prominent' : ''}`}>
      <div className="fw-action-card__icon"><PublicIcon name={icon} size={29} /></div>
      <div><h2>{title}</h2><p>{text}</p><a className={prominent ? 'fw-button fw-button--primary' : ''} href={href}>{action}<PublicIcon name={prominent ? 'arrow' : 'chevron-right'} size={16} /></a></div>
      <PublicIcon className="fw-action-card__chevron" name="chevron-right" size={20} />
    </article>
  );
}

export function AccountPage() {
  return (
    <>
      <PageHero visual="account" title="Compte" description="Le compte est facultatif. Les fonctions de connexion et de synchronisation ne sont pas encore publiées." />
      <div className="fw-page fw-standard-page">
        <section className="fw-account-grid" aria-label="Services du compte">
          <ActionCard icon="target" title="Réglages de cet appareil" text="Mode de données et taille du texte : ces choix restent stockés localement." href="/reglages" action="Ouvrir les réglages" />
          <ActionCard icon="map" title="Incendies référencés" text="Accédez directement aux fiches, à leur fraîcheur et aux données publiées." href="/incendies" action="Voir les incendies" />
          <ActionCard icon="shield" title="Données et confidentialité" text="Consultez la portée des données publiques et les informations de confidentialité." href="/confidentialite" action="Consulter" />
        </section>
        <aside className="fw-inline-notice"><PublicIcon name="info" size={23} /><p><strong>Aucun compte ni suivi synchronisé n’est disponible dans cette version.</strong><span>Les réglages visibles ci-dessus sont réellement applicables sur cet appareil uniquement.</span></p></aside>
      </div>
    </>
  );
}

function Toggle({ checked, onChange, label }: { readonly checked: boolean; readonly onChange: (checked: boolean) => void; readonly label: string }) {
  return <button type="button" className={`fw-toggle ${checked ? 'is-on' : ''}`} role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}><span /></button>;
}

function SettingRow({ icon, title, description, children, href }: { readonly icon: PublicIconName; readonly title: string; readonly description?: string; readonly children?: ReactNode; readonly href?: string }) {
  const content = <><PublicIcon name={icon} size={24} /><span><strong>{title}</strong>{description ? <small>{description}</small> : null}</span><span className="fw-setting-row__control">{children ?? <PublicIcon name="chevron-right" size={18} />}</span></>;
  return href ? <a className="fw-setting-row" href={href}>{content}</a> : <div className="fw-setting-row">{content}</div>;
}

export function SettingsPage() {
  const [saveData, setSaveData] = useState(false);
  const [textSize, setTextSize] = useState<'small' | 'medium' | 'large'>('medium');

  useEffect(() => {
    try {
      const stored = localStorage.getItem('fw:settings');
      if (stored) {
        const value = JSON.parse(stored) as { saveData?: boolean; textSize?: 'small' | 'medium' | 'large' };
        setSaveData(value.saveData ?? false); setTextSize(value.textSize ?? 'medium');
      }
    } catch { /* Les réglages locaux restent optionnels. */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem('fw:settings', JSON.stringify({ saveData, textSize })); } catch { /* Le navigateur peut refuser le stockage. */ }
    document.documentElement.dataset.fwTextSize = textSize;
  }, [saveData, textSize]);

  return (
    <>
      <PageHero visual="settings" title="Réglages" description="Préférences locales réellement appliquées sur cet appareil." />
      <div className="fw-page fw-standard-page">
        <aside className="fw-inline-notice"><PublicIcon name="info" size={22} /><p><span>Ces préférences sont enregistrées localement sur cet appareil.</span><span>Aucune synchronisation, notification e-mail ou SMS n’est configurée.</span></p></aside>
        <div className="fw-settings-grid">
          <section className="fw-settings-panel"><h2>Préférences générales</h2>
            <SettingRow icon="globe" title="Langue" description="Choisissez votre langue"><select aria-label="Langue"><option>Français (FR)</option><option>English (EN)</option></select></SettingRow>
            <SettingRow icon="target" title="Thème" description="Clair ou sombre"><div className="fw-segmented"><button className="is-active" type="button">Clair</button><button type="button" disabled>Sombre</button></div></SettingRow>
            <SettingRow icon="database" title="Mode données réduites" description="Réduit l’utilisation des données"><Toggle label="Mode données réduites" checked={saveData} onChange={setSaveData} /></SettingRow>
            <SettingRow icon="accessibility" title="Taille du texte" description="Ajustez la taille du texte"><div className="fw-segmented fw-segmented--text"><button type="button" className={textSize === 'small' ? 'is-active' : ''} onClick={() => setTextSize('small')}>A</button><button type="button" className={textSize === 'medium' ? 'is-active' : ''} onClick={() => setTextSize('medium')}>Moyenne</button><button type="button" className={textSize === 'large' ? 'is-active' : ''} onClick={() => setTextSize('large')}>A</button></div></SettingRow>
          </section>
          <section className="fw-settings-panel"><h2>Disponibilité du compte</h2><SettingRow icon="user" title="Compte utilisateur" description="Connexion et synchronisation non disponibles dans cette version." /><SettingRow icon="bell" title="Notifications" description="Aucun canal de notification n’est configuré." /><SettingRow icon="cookie" title="Préférences de confidentialité" description="Informations sur les données et le stockage local." href="/confidentialite#cookies" /></section>
        </div>
      </div>
    </>
  );
}

function SecondarySafetyBanner() {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;

  return <aside className="fw-secondary-safety" role="note" aria-label="Limites importantes du service">
    <PublicIcon name="warning" size={20} />
    <p><strong>Information non officielle et non temps réel.</strong><span>FireWarning décrit des éléments datés qui peuvent être incomplets ou erronés. Ne prenez aucune décision de sécurité à partir du service : consultez les autorités et appelez le 18 ou le 112 en cas d’urgence.</span></p>
    <button type="button" onClick={() => setVisible(false)} aria-label="Masquer ce rappel pour cette page"><PublicIcon name="close" size={18} /></button>
  </aside>;
}

function ScopeDialog({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!open) return null;
  return <div className="fw-page-dialog__backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="fw-page-dialog" role="dialog" aria-modal="true" aria-labelledby="fw-scope-dialog-title">
      <header><div><PublicIcon name="shield" size={25} /><h2 id="fw-scope-dialog-title">Avant de consulter une fiche</h2></div><button type="button" onClick={onClose} aria-label="Fermer"><PublicIcon name="close" size={20} /></button></header>
      <p>Une fiche FireWarning rassemble des informations disponibles jusqu’à la date et l’heure affichées. Elle peut comporter des retards, omissions, erreurs ou localisations approximatives.</p>
      <ul>
        <li>Elle ne confirme pas qu’une zone est sûre, accessible ou évacuée.</li>
        <li>Elle ne remplace ni une consigne officielle, ni une carte opérationnelle, ni les secours.</li>
        <li>Une analyse automatisée reste une proposition de travail : une publication est revue, mais n’est pas une certification officielle.</li>
      </ul>
      <footer><strong>Danger immédiat ou départ de feu : appelez le 18 ou le 112.</strong><button className="fw-button fw-button--primary" type="button" onClick={onClose}>J’ai compris</button></footer>
    </section>
  </div>;
}

const howSteps: readonly { icon: PublicIconName; title: string; text: string }[] = [
  { icon: 'search', title: 'Un incident est documenté', text: 'La préparation commence à partir de sources identifiables ou de contributions autorisées ; ce n’est jamais un appel aux secours.' },
  { icon: 'data', title: 'Des propositions sont préparées', text: 'Les agents rapprochent les sources, dates, lieux et médias dans un espace de travail privé.' },
  { icon: 'shield', title: 'Une personne supervise', text: 'La provenance, les droits, le contexte, les données personnelles et l’incertitude sont vérifiés avant publication.' },
  { icon: 'map', title: 'La fiche est publiée', text: 'Les éléments retenus sont datés, reliés à leurs sources et présentés avec leurs limites connues.' },
  { icon: 'clock', title: 'Elle peut évoluer ou être retirée', text: 'Une information publiée peut être corrigée, requalifiée, moins précise ou retirée pendant un nouvel examen.' },
];

function Checklist({ title, items, positive }: { readonly title: string; readonly items: readonly string[]; readonly positive: boolean }) {
  return <section className={`fw-checklist ${positive ? 'is-positive' : 'is-negative'}`}><h2><PublicIcon name={positive ? 'check-circle' : 'warning'} size={24} />{title}</h2><ul>{items.map((item) => <li key={item}><PublicIcon name={positive ? 'check-circle' : 'x-circle'} size={17} />{item}</li>)}</ul></section>;
}

export function OperationPage() {
  const [scopeOpen, setScopeOpen] = useState(false);
  const questions: readonly { question: string; answer: string }[] = [
    { question: 'FireWarning est-il une source officielle ?', answer: 'Non. Le service complète les sources originales ; il ne produit ni consigne d’évacuation, ni instruction de déplacement, ni information opérationnelle.' },
    { question: 'Que signifie « dernière mise à jour » ?', answer: 'C’est le dernier état traité et publié par FireWarning. Cela ne signifie ni que la situation est en temps réel, ni qu’elle n’a pas changé depuis.' },
    { question: 'Que fait l’analyse automatisée ?', answer: 'Elle peut proposer un rapprochement, une date, une localisation ou une synthèse. Ces résultats ne sont pas publiés seuls et peuvent être refusés ou corrigés lors de la supervision.' },
    { question: 'Pourquoi une carte ou une zone peut-elle manquer ?', answer: 'Une absence de carte, de zone ou de média signifie seulement qu’aucun élément n’est publié à cet endroit ou à cette date. Elle ne permet pas de conclure à l’absence de danger.' },
  ];
  return (
    <>
      <PageHero visual="community" title="Comment fonctionne FireWarning ?" description="Un parcours de publication daté : sources, analyse assistée, revue humaine et informations consultables avec leurs limites." />
      <div className="fw-page fw-standard-page fw-operation-page">
        <SecondarySafetyBanner />
        <section><h2 className="fw-section-title">Comment ça marche ?</h2><div className="fw-process">{howSteps.map((step, index) => <article key={step.title}><span>{index + 1}</span><div><PublicIcon name={step.icon} size={31} /></div><h3>{step.title}</h3><p>{step.text}</p></article>)}</div></section>
        <div className="fw-operation-columns">
          <div className="fw-operation-lists"><Checklist positive title="Ce que publie FireWarning" items={['Des informations et des représentations datées lorsqu’elles ont été retenues.', 'Les sources, les corrections importantes et les limites rendues publiques.', 'Une alternative textuelle quand une carte ou une vue 3D est disponible.']} /><Checklist positive={false} title="Ce que FireWarning ne fait pas" items={['Ne reçoit pas les alertes de secours et ne déclenche aucune intervention.', 'Ne confirme pas qu’une zone est sûre, accessible ou évacuée.', 'Ne publie pas automatiquement une sortie d’agent ou un média reçu.', 'Ne garantit ni exhaustivité, ni exactitude absolue, ni temps réel.']} /></div>
          <aside className="fw-faq"><h2>Questions fréquentes</h2>{questions.map(({ question, answer }) => <details key={question}><summary>{question}<PublicIcon name="chevron-right" size={17} /></summary><p>{answer}</p></details>)}<div id="urgence" className="fw-safety-card"><PublicIcon name="shield" size={23} /><strong>Votre sécurité avant tout</strong><p>En cas d’urgence, appelez le 18 ou le 112. FireWarning ne remplace pas les services d’urgence.</p></div></aside>
        </div>
        <aside className="fw-community-cta"><PublicIcon name="shield" size={34} /><p><strong>Consultez une fiche comme un support de compréhension, jamais comme une consigne.</strong><span>Les informations essentielles restent consultables sans ouvrir de carte ni de vue 3D.</span></p><button className="fw-button fw-button--outline" type="button" onClick={() => setScopeOpen(true)}>Lire les limites <PublicIcon name="arrow" size={16} /></button><a className="fw-button fw-button--primary" href="/incendies">Consulter les incendies <PublicIcon name="arrow" size={16} /></a></aside>
      </div>
      <ScopeDialog open={scopeOpen} onClose={() => setScopeOpen(false)} />
    </>
  );
}

const privacySections: readonly { id: string; icon: PublicIconName; title: string; text: string; bullets?: readonly string[] }[] = [
  { id: 'consultation', icon: 'database', title: 'Consultation du site', text: 'La consultation d’une page peut entraîner le traitement de données techniques nécessaires à sa livraison et à sa sécurité. La présente interface n’affiche ni compte public, ni synchronisation de préférences, ni mesure d’audience facultative active.', bullets: ['Adresse demandée et informations techniques transmises par le navigateur', 'Date, heure et erreurs nécessaires au fonctionnement', 'Aucune décision individuelle automatisée à partir de ces données'] },
  { id: 'reglages', icon: 'cookie', title: 'Réglages de cet appareil', text: 'La taille du texte et le mode de données réduites sont enregistrés dans le stockage local de ce navigateur. Ils restent sur cet appareil et peuvent être supprimés depuis les données du navigateur.', bullets: ['Préférence de taille du texte', 'Préférence de données réduites', 'Brouillons locaux de contribution lorsqu’un parcours les crée'] },
  { id: 'contributions', icon: 'image', title: 'Contributions et médias', text: 'Une contribution autorisée peut être examinée dans un espace privé. Une analyse automatisée peut proposer des éléments de contexte ; elle ne rend rien public. Toute publication de média ou d’information reste distincte et soumise à une revue humaine.', bullets: ['La publication n’est jamais automatique', 'Les métadonnées inutiles peuvent être retirées ou la localisation généralisée', 'Un contenu peut être retenu, refusé, corrigé ou retiré'] },
  { id: 'limites', icon: 'lock', title: 'Informations non encore publiées', text: 'L’identité juridique définitive de l’éditeur, la liste complète des prestataires, les durées de conservation et les coordonnées dédiées aux droits ne sont pas encore publiées. Cette page ne les remplace pas par des valeurs fictives.', bullets: ['Aucun bandeau de consentement n’est affiché sans traceur facultatif réel', 'Aucun niveau de conservation n’est annoncé sans règle effectivement appliquée', 'Les droits et contacts dédiés seront publiés seulement une fois le dispositif arrêté'] },
];

export function PrivacyPage() {
  return (
    <>
      <PageHero visual="privacy" title="Confidentialité" description="Ce qui est traité par l’interface publique aujourd’hui, ce qui reste local à votre navigateur et ce qui n’est pas encore publié." />
      <div className="fw-page fw-standard-page fw-policy-layout">
        <div className="fw-policy-cards"><SecondarySafetyBanner />{privacySections.map((item) => <details id={item.id} aria-labelledby={`${item.id}-title`} className="fw-policy-card" key={item.id} open><summary><PublicIcon name={item.icon} size={28} /><h2 id={`${item.id}-title`}>{item.title}</h2><PublicIcon name="chevron-down" size={18} /></summary><div><p>{item.text}</p>{item.bullets ? <ul>{item.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul> : null}</div></details>)}</div>
        <aside className="fw-policy-summary"><section><h2><PublicIcon name="shield" size={25} />Portée de cette page</h2><ul>{['Elle décrit les comportements publics vérifiés de cette version.', 'Elle ne prétend pas constituer la politique complète tant que les champs juridiques bloquants ne sont pas arrêtés.', 'Aucune donnée, durée, prestataire ou voie de recours n’est inventé.'].map((item) => <li key={item}><PublicIcon name="check-circle" size={17} />{item}</li>)}</ul></section><a className="fw-document-link" href="mailto:unicornwhodev@gmail.com"><PublicIcon name="mail" size={25} /><span><strong>Contact général du projet</strong>unicornwhodev@gmail.com</span><PublicIcon name="external" size={18} /></a></aside>
      </div>
    </>
  );
}

const accessibilityItems: readonly { icon: PublicIconName; title: string; text: string }[] = [
  { icon: 'keyboard', title: 'Navigation et focus', text: 'Les parcours publics utilisent des boutons et liens natifs, une hiérarchie de titres et un focus visible. Cette mise en œuvre doit encore être vérifiée par un audit et des tests avec technologies d’assistance.' },
  { icon: 'accessibility', title: 'Lecture et réglages', text: 'La taille du texte et le mode de données réduites sont réglables localement sur l’appareil. Les informations essentielles restent dans le contenu textuel.' },
  { icon: 'map', title: 'Alternative à la 3D', text: 'La vue 3D est optionnelle. Une fiche doit pouvoir être comprise avec son résumé, ses dates, ses sources, ses limites et sa chronologie, même sans carte ou scène chargée.' },
  { icon: 'monitor', title: 'Limites connues', text: 'Les cartes, scènes 3D, médias tiers, documents externes et fonctions d’administration peuvent présenter des difficultés qui ne sont pas encore mesurées de manière exhaustive.' },
];

export function AccessibilityPage() {
  return (
    <>
      <PageHero visual="accessibility" title="Accessibilité" description="État actuel de l’interface, alternatives aux vues 3D et limites connues. Aucun niveau de conformité n’est revendiqué sans audit valide."><p className="fw-breadcrumb">Accueil <PublicIcon name="chevron-right" size={13} /> Accessibilité</p></PageHero>
      <div className="fw-page fw-standard-page fw-accessibility-layout">
        <SecondarySafetyBanner />
        <section className="fw-accessibility-summary"><h2><PublicIcon name="accessibility" size={29} />État publié</h2><p>FireWarning est expérimental. Aucun audit complet de conformité RGAA n’a été publié ; le service ne revendique donc aucun niveau de conformité sur la seule base de cette page.</p><ul>{['Contenu principal utilisable sans ouvrir une scène 3D', 'Réglages de texte et de données réduites disponibles localement', 'Limites de la 3D et des contenus tiers signalées explicitement'].map((item) => <li key={item}><PublicIcon name="check-circle" size={16} />{item}</li>)}</ul></section>
        <div className="fw-accessibility-cards">{accessibilityItems.map((item) => <details key={item.title}><summary><PublicIcon name={item.icon} size={29} /><span>{item.title}</span><PublicIcon name="chevron-down" size={18} /></summary><p>{item.text}</p>{item.title === 'Lecture et réglages' ? <a href="/reglages">Ouvrir les réglages <PublicIcon name="arrow" size={15} /></a> : null}</details>)}</div>
        <aside className="fw-accessibility-status"><PublicIcon name="shield" size={42} /><p><strong>Pas de canal dédié publié</strong><span>Une adresse de contact accessibilité et un mode de réponse ne sont pas encore publiés. Ils ne sont pas remplacés ici par un formulaire ou une promesse de traitement.</span></p></aside>
      </div>
    </>
  );
}

const legalItems: readonly { icon: PublicIconName; title: string; text: string }[] = [
  { icon: 'info', title: 'Statut de cette page', text: 'FireWarning reste un projet expérimental. Cette page publie uniquement les informations juridiques effectivement établies pour la version visible ; elle ne se présente pas comme les mentions légales définitives d’un service pleinement ouvert.' },
  { icon: 'user', title: 'Projet et maintenance', text: 'Le projet est développé et maintenu bénévolement sous le nom public Unicorn Who Dev. Le code source est disponible dans le dépôt officiel FireViewer.' },
  { icon: 'monitor', title: 'Hébergement du prototype', text: 'Le prototype public est déployé via Vercel. La liste complète des prestataires qui pourraient traiter des données, leurs rôles et leurs lieux de traitement n’est pas encore publiée.' },
  { icon: 'shield', title: 'Utilisation du service', text: 'FireWarning est une représentation visuelle, géographique et chronologique d’éléments publics et autorisés relatifs aux incendies. Il n’est ni une source officielle, ni un service d’alerte, ni un outil opérationnel.' },
  { icon: 'warning', title: 'Responsabilité et sécurité', text: 'Les informations sont datées, indicatives et susceptibles de correction. Elles ne déterminent pas qu’une zone est sûre, accessible ou évacuée et ne remplacent pas les autorités ou les secours.' },
  { icon: 'image', title: 'Code et contenus', text: 'Le code suit la licence indiquée dans le dépôt officiel. Les sources, cartes, médias, données et ressources tierces conservent leurs droits, licences et conditions propres.' },
  { icon: 'mail', title: 'Contact général', text: 'Pour les questions générales sur le projet : unicornwhodev@gmail.com. Les canaux juridiques dédiés (données personnelles, accessibilité, droit d’auteur, sécurité et droit de réponse) ne sont pas encore publiés.' },
];

export function LegalPage() {
  return (
    <>
      <PageHero visual="legal" title="Mentions légales" description="Informations établies pour le prototype FireWarning et état transparent des éléments juridiques qui ne sont pas encore publiés." />
      <div className="fw-page fw-standard-page fw-legal-layout">
        <aside className="fw-legal-summary"><h2>Sommaire</h2>{legalItems.map((item, index) => <a key={item.title} href={`#legal-${index + 1}`}><strong>{String(index + 1).padStart(2, '0')}</strong>{item.title}</a>)}<section><PublicIcon name="mail" size={28} /><strong>Contact général</strong><p><a href="mailto:unicornwhodev@gmail.com">unicornwhodev@gmail.com</a></p></section></aside>
        <div className="fw-legal-content"><SecondarySafetyBanner />{legalItems.map((item, index) => <section id={`legal-${index + 1}`} key={item.title}><PublicIcon name={item.icon} size={28} /><div><h2>{item.title}</h2><p>{item.text}</p>{item.title === 'Projet et maintenance' ? <a className="fw-inline-link" href="https://github.com/charli-dev420/fireviewer" target="_blank" rel="noreferrer">Voir le dépôt officiel <PublicIcon name="external" size={14} /></a> : null}</div></section>)}</div>
      </div>
    </>
  );
}

export function AboutPage() {
  const [scopeOpen, setScopeOpen] = useState(false);
  const commitments: readonly { icon: PublicIconName; title: string; text: string }[] = [
    { icon: 'flame', title: 'Comprendre dans l’espace et le temps', text: 'Une fiche peut réunir une chronologie, des emprises datées, des sources et, quand elle existe, une représentation du territoire.' },
    { icon: 'monitor', title: 'Rester lisible sans 3D', text: 'La situation, les dates, les sources et les limites restent consultables sans charger une scène spatiale ni une connexion rapide.' },
    { icon: 'shield', title: 'Séparer analyse et publication', text: 'Les traitements agentiques préparent des propositions privées ; une personne habilitée décide séparément ce qui peut être publié.' },
  ];

  return (
    <>
      <PageHero visual="about" title="À propos de FireWarning" description="Comprendre un incendie dans l’espace et dans le temps, sans se substituer aux autorités, aux secours ou aux outils opérationnels." />
      <div className="fw-page fw-standard-page fw-about-page">
        <SecondarySafetyBanner />
        <div className="fw-about-grid">
          <Checklist positive title="Pourquoi le projet existe" items={['Après l’incendie de Zone synthétique, des informations, images et observations étaient disponibles mais dispersées.', 'Le projet cherche à les replacer dans leur territoire, leurs dates et leurs incertitudes.', 'Une même fiche peut rester utile comme archive visuelle et chronologique après un événement.']} />
          <Checklist positive={false} title="Un outil complémentaire" items={['Aucun appel aux secours ni système de détection.', 'Aucune instruction d’évacuation, de déplacement ou de confinement.', 'Aucune déclaration qu’une zone est sûre ou accessible.', 'Aucune prévision de propagation ni garantie d’exhaustivité en temps réel.']} />
        </div>
        <section className="fw-about-commitments" aria-labelledby="fw-about-commitments-title">
          <div className="fw-about-commitments__heading">
            <span>Notre approche</span>
            <h2 id="fw-about-commitments-title">Trois engagements concrets</h2>
            <p>Un projet open source, bénévole et sans objectif financier, développé sous le nom public Unicorn Who Dev.</p>
          </div>
          <div className="fw-about-commitments__grid">
            {commitments.map((commitment) => (
              <article key={commitment.title}>
                <div><PublicIcon name={commitment.icon} size={25} /></div>
                <h3>{commitment.title}</h3>
                <p>{commitment.text}</p>
              </article>
            ))}
          </div>
        </section>
        <aside className="fw-about-actions">
          <div><PublicIcon name="info" size={27} /><p><strong>Comprendre avant d’utiliser</strong><span>Les sources, dates et limites doivent toujours être consultées avant toute interprétation.</span></p></div>
          <button className="fw-button fw-button--outline" type="button" onClick={() => setScopeOpen(true)}>Lire les limites <PublicIcon name="arrow" size={16} /></button>
          <a className="fw-button fw-button--outline" href="/fonctionnement">Comment ça fonctionne ? <PublicIcon name="arrow" size={16} /></a>
          <a className="fw-button fw-button--primary" href="/incendies">Voir les incendies en cours <PublicIcon name="arrow" size={16} /></a>
        </aside>
      </div>
      <ScopeDialog open={scopeOpen} onClose={() => setScopeOpen(false)} />
    </>
  );
}
