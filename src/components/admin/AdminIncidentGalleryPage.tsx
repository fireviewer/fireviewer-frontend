import { useCallback, useState, type FormEvent } from 'react';
import { useAdminApi, useAdminMutation, useAdminQuery } from './AdminApiContext';
import { AdminEmptyState, AdminErrorState, AdminLoadingState, AdminMutationFeedback, AdminPageHeader, AdminStateLabel, formatAdminDate } from './AdminPageState';
import { AdminIncidentWorkspaceNav } from './AdminIncidentWorkspaceNav';

type Draft = { episodeId: string; title: string; caption: string; altText: string; mediaUrl: string; mediaKind: 'image' | 'video'; credit: string; licenseLabel: string; sourceUrl: string; reason: string };
const initialDraft: Draft = { episodeId: '', title: '', caption: '', altText: '', mediaUrl: '', mediaKind: 'image', credit: '', licenseLabel: '', sourceUrl: '', reason: '' };

/** Editorial gallery. It is intentionally separate from the source-media and agent workspaces. */
export function AdminIncidentGalleryPage({ fireId }: { readonly fireId: string }) {
  const api = useAdminApi();
  const load = useCallback((options: { signal?: AbortSignal }) => api.getIncidentGallery(fireId, options), [api, fireId]);
  const { state, reload } = useAdminQuery(load, [load]);
  const mutation = useAdminMutation();
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const propose = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = await mutation.run(`gallery:${fireId}:${JSON.stringify(draft)}`, (options) => api.createIncidentGalleryItem(fireId, {
      episode_id: draft.episodeId.trim() || null, title: draft.title.trim(), caption: draft.caption.trim() || null,
      alt_text: draft.altText.trim(), media_url: draft.mediaUrl.trim(), media_kind: draft.mediaKind,
      credit: draft.credit.trim() || null, license_label: draft.licenseLabel.trim() || null,
      source_reference_url: draft.sourceUrl.trim(), proposal_reason: draft.reason.trim(),
    }, options));
    if (result) { setDraft(initialDraft); reload(); }
  };
  const review = async (id: string, version: number, action: 'publish' | 'reject' | 'retire') => {
    const reason = action === 'publish' ? 'Publication éditoriale validée par un administrateur.' : action === 'reject' ? 'Élément éditorial non retenu après revue.' : 'Élément éditorial retiré de la publication.';
    const result = await mutation.run(`gallery-review:${id}:${action}:${version}`, (options) => api.reviewIncidentGalleryItem(fireId, id, { action, reason, expected_version: version }, options));
    if (result) reload();
  };
  if (state.kind === 'loading') return <AdminLoadingState label="Chargement de la galerie éditoriale…" />;
  if (state.kind === 'error') return <AdminErrorState error={state.error} onRetry={reload} />;
  return <section aria-labelledby="admin-gallery-title">
    <AdminPageHeader title="Galerie de l’événement"><p>Contenu éditorial autonome pour <code>{fireId}</code>. Cette page ne lit ni contribution utilisateur ni média de l’agent : elle publie seulement des éléments explicitement proposés puis validés.</p></AdminPageHeader>
    <AdminIncidentWorkspaceNav fireId={fireId} active="gallery" />
    <section className="admin-section" aria-labelledby="admin-gallery-propose-title"><div className="admin-section__heading"><div><h3 id="admin-gallery-propose-title">Proposer un élément éditorial</h3><p>Une URL publique HTTPS, une provenance et un texte alternatif sont obligatoires. La proposition reste privée jusqu’à la décision de publication.</p></div></div>
      <form className="admin-form-grid" onSubmit={(event) => void propose(event)}>
        <label className="admin-field"><span>Épisode facultatif</span><input value={draft.episodeId} onChange={(event) => set('episodeId', event.currentTarget.value)} maxLength={16} placeholder="E01" /></label>
        <label className="admin-field"><span>Type</span><select value={draft.mediaKind} onChange={(event) => set('mediaKind', event.currentTarget.value as Draft['mediaKind'])}><option value="image">Image</option><option value="video">Vidéo</option></select></label>
        <label className="admin-field"><span>Titre</span><input required value={draft.title} onChange={(event) => set('title', event.currentTarget.value)} maxLength={255} /></label>
        <label className="admin-field"><span>URL publique du média</span><input required type="url" value={draft.mediaUrl} onChange={(event) => set('mediaUrl', event.currentTarget.value)} placeholder="https://…" /></label>
        <label className="admin-field admin-field--wide"><span>Texte alternatif</span><input required value={draft.altText} onChange={(event) => set('altText', event.currentTarget.value)} maxLength={500} /></label>
        <label className="admin-field admin-field--wide"><span>Légende facultative</span><textarea value={draft.caption} onChange={(event) => set('caption', event.currentTarget.value)} maxLength={1000} /></label>
        <label className="admin-field"><span>Crédit facultatif</span><input value={draft.credit} onChange={(event) => set('credit', event.currentTarget.value)} maxLength={255} /></label>
        <label className="admin-field"><span>Licence facultative</span><input value={draft.licenseLabel} onChange={(event) => set('licenseLabel', event.currentTarget.value)} maxLength={255} /></label>
        <label className="admin-field admin-field--wide"><span>Référence de provenance</span><input required type="url" value={draft.sourceUrl} onChange={(event) => set('sourceUrl', event.currentTarget.value)} placeholder="https://…" /></label>
        <label className="admin-field admin-field--wide"><span>Motif de proposition</span><textarea required minLength={10} value={draft.reason} onChange={(event) => set('reason', event.currentTarget.value)} maxLength={1000} /></label>
        <div className="admin-form-actions"><button className="button button--primary" disabled={mutation.state.pending}>Proposer pour revue</button></div>
      </form>
    </section>
    <section className="admin-section" aria-labelledby="admin-gallery-items-title"><div className="admin-section__heading"><div><h3 id="admin-gallery-items-title">Éléments de la galerie</h3><p>La publication est une décision distincte de l’analyse des contributions.</p></div></div>{state.data.items.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Élément</th><th>État</th><th>Provenance</th><th>Revue</th></tr></thead><tbody>{state.data.items.map((item) => <tr key={item.gallery_item_id}><th scope="row">{item.title}<small><code>{item.gallery_item_id}</code> · {item.media_kind} · proposé {formatAdminDate(item.proposed_at)}</small></th><td><AdminStateLabel value={item.state} /></td><td><a href={item.source_reference_url} target="_blank" rel="noreferrer">Ouvrir la référence</a></td><td>{item.state === 'PROPOSED' ? <div className="admin-form-actions"><button className="button button--small" disabled={mutation.state.pending} onClick={() => void review(item.gallery_item_id, item.version, 'publish')}>Publier</button><button className="button button--small" disabled={mutation.state.pending} onClick={() => void review(item.gallery_item_id, item.version, 'reject')}>Rejeter</button></div> : item.state === 'PUBLISHED' ? <button className="button button--small" disabled={mutation.state.pending} onClick={() => void review(item.gallery_item_id, item.version, 'retire')}>Retirer</button> : item.review_reason ?? 'Décision enregistrée'}</td></tr>)}</tbody></table></div> : <AdminEmptyState title="Aucun élément de galerie">Ajoutez un élément éditorial indépendant lorsque ses droits et sa provenance sont qualifiés.</AdminEmptyState>}</section>
    <AdminMutationFeedback error={mutation.state.error} succeeded={mutation.state.succeeded} success="Décision de galerie enregistrée." />
  </section>;
}
