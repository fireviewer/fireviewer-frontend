import {
  PUBLIC_DATASETS,
  PUBLIC_DOWNLOAD_PACKS,
  PUBLIC_MODELS,
  type PublicHubResource,
} from '../../lib/publicResources';
import { PageHero } from './FireWarningBasicPages';
import { PublicIcon } from './PublicIcon';

function HubResourceCard({ resource }: { readonly resource: PublicHubResource }) {
  return (
    <article className="fw-resource-link-card">
      <div className="fw-resource-link-card__heading">
        <span>{resource.status}</span>
        <PublicIcon name="external" size={17} />
      </div>
      <h3>{resource.title}</h3>
      <p>{resource.description}</p>
      <a href={resource.url} target="_blank" rel="noreferrer" aria-label={`Ouvrir ${resource.title} sur Hugging Face`}>
        Ouvrir sur Hugging Face <PublicIcon name="arrow" size={15} />
      </a>
    </article>
  );
}

export function PublicResourcesPage() {
  return (
    <>
      <PageHero
        visual="community"
        title="Ressources FireViewer"
        description="Packs de simulation reproductibles, modèles et datasets publiés avec leur statut et leur provenance."
      >
        <p className="fw-breadcrumb">Accueil <PublicIcon name="chevron-right" size={13} /> Ressources</p>
      </PageHero>

      <div className="fw-page fw-standard-page fw-resources-page">
        <section className="fw-resource-section" aria-labelledby="fw-resource-packs-title">
          <header className="fw-resource-section__heading">
            <div><PublicIcon name="database" size={27} /></div>
            <span>
              <small>Téléchargements</small>
              <h2 id="fw-resource-packs-title">Packs reproductibles</h2>
            </span>
          </header>

          <div className="fw-download-pack-list">
            {PUBLIC_DOWNLOAD_PACKS.map((pack) => (
              <article className="fw-download-pack" key={pack.id}>
                <div className="fw-download-pack__copy">
                  <span className="fw-resource-badge">OpenUSD · Omniverse</span>
                  <h3>{pack.title}</h3>
                  <p>{pack.description}</p>
                  <dl>
                    <div><dt>Archive</dt><dd>{pack.filename}</dd></div>
                    <div><dt>Taille</dt><dd>{pack.sizeLabel}</dd></div>
                    <div><dt>Publication</dt><dd>{pack.publishedAt}</dd></div>
                    <div><dt>Scène d’entrée</dt><dd><code>{pack.entryStage}</code></dd></div>
                    <div className="fw-download-pack__hash"><dt>SHA-256</dt><dd><code>{pack.sha256}</code></dd></div>
                  </dl>
                </div>
                <aside className="fw-download-pack__actions">
                  <PublicIcon name="database" size={36} />
                  <strong>Pack complet</strong>
                  <span>Simulation et reproduction technique</span>
                  <a className="fw-button fw-button--primary" href={pack.downloadUrl}>
                    Télécharger <PublicIcon name="arrow" size={16} />
                  </a>
                  <a href={pack.repositoryUrl} target="_blank" rel="noreferrer">
                    Contrat et fichiers <PublicIcon name="external" size={14} />
                  </a>
                </aside>
              </article>
            ))}
          </div>
          <p className="fw-resource-notice"><PublicIcon name="info" size={18} />Ces packs servent à la reproduction technique. Ils ne constituent ni une observation active, ni une prévision, ni une consigne de sécurité.</p>
        </section>

        <section className="fw-resource-section" aria-labelledby="fw-resource-models-title">
          <header className="fw-resource-section__heading">
            <div><PublicIcon name="monitor" size={27} /></div>
            <span>
              <small>Intelligence artificielle</small>
              <h2 id="fw-resource-models-title">Modèles publiés</h2>
            </span>
            <a href="https://huggingface.co/fireviewer/models" target="_blank" rel="noreferrer">Voir tous les modèles <PublicIcon name="external" size={14} /></a>
          </header>
          <div className="fw-resource-card-grid">{PUBLIC_MODELS.map((resource) => <HubResourceCard key={resource.id} resource={resource} />)}</div>
        </section>

        <section className="fw-resource-section" aria-labelledby="fw-resource-datasets-title">
          <header className="fw-resource-section__heading">
            <div><PublicIcon name="data" size={27} /></div>
            <span>
              <small>Données</small>
              <h2 id="fw-resource-datasets-title">Datasets et corpus</h2>
            </span>
            <a href="https://huggingface.co/fireviewer/datasets" target="_blank" rel="noreferrer">Voir tous les datasets <PublicIcon name="external" size={14} /></a>
          </header>
          <div className="fw-resource-card-grid">{PUBLIC_DATASETS.map((resource) => <HubResourceCard key={resource.id} resource={resource} />)}</div>
        </section>

        <aside className="fw-resource-governance">
          <PublicIcon name="shield" size={29} />
          <p><strong>Publication ne signifie pas promotion en production.</strong><span>La fiche de chaque ressource précise son périmètre, sa licence, ses limites et les métriques disponibles.</span></p>
          <a className="fw-button fw-button--outline" href="https://huggingface.co/fireviewer" target="_blank" rel="noreferrer">Organisation FireViewer <PublicIcon name="external" size={15} /></a>
        </aside>
      </div>
    </>
  );
}
