import { describe, expect, it } from 'vitest';
import { resolveAdminRoute, resolveAppRoute } from './routing';

describe('resolveAppRoute', () => {
  it('résout toutes les pages publiques validées sans retomber sur l’ancienne interface', () => {
    expect(resolveAppRoute('/')).toEqual({ kind: 'home' });
    expect(resolveAppRoute('/demo')).toEqual({ kind: 'public-demo', fireId: 'FR-SIM-00001' });
    expect(resolveAppRoute('/demo/simulation')).toEqual({ kind: 'public-demo', fireId: 'FR-SIM-00001' });
    expect(resolveAppRoute('/incendies')).toEqual({ kind: 'public-page', section: 'incidents' });
    expect(resolveAppRoute('/incendie/FR-83-00042')).toEqual({ kind: 'public-incident', fireId: 'FR-83-00042' });
    expect(resolveAppRoute('/incendie/FR-83-00042/ajouter-preuve')).toEqual({ kind: 'public-add-evidence', fireId: 'FR-83-00042' });
    expect(resolveAppRoute('/incendie/FR-83-00042/signaler-erreur')).toEqual({ kind: 'public-incident-report', fireId: 'FR-83-00042' });
    expect(resolveAppRoute('/contribution/local-123')).toEqual({ kind: 'public-contribution', contributionId: 'local-123' });
    expect(resolveAppRoute('/signaler')).toEqual({ kind: 'public-event-contribution' });
    expect(resolveAppRoute('/contribuer')).toEqual({ kind: 'public-event-contribution' });
    expect(resolveAppRoute('/mes-contributions')).toEqual({ kind: 'public-my-event-candidates' });
    expect(resolveAppRoute('/mes-contributions/candidate-1')).toEqual({ kind: 'public-my-event-candidates', candidateId: 'candidate-1' });
    expect(resolveAppRoute('/compte')).toEqual({ kind: 'public-page', section: 'account' });
    expect(resolveAppRoute('/compte/recuperation')).toEqual({ kind: 'public-account-recovery' });
    expect(resolveAppRoute('/compte/nouveau-mot-de-passe')).toEqual({ kind: 'public-password-update' });
    expect(resolveAppRoute('/reglages')).toEqual({ kind: 'public-page', section: 'settings' });
    expect(resolveAppRoute('/fonctionnement')).toEqual({ kind: 'public-page', section: 'operation' });
    expect(resolveAppRoute('/confidentialite')).toEqual({ kind: 'public-page', section: 'privacy' });
    expect(resolveAppRoute('/accessibilite')).toEqual({ kind: 'public-page', section: 'accessibility' });
    expect(resolveAppRoute('/mentions-legales')).toEqual({ kind: 'public-page', section: 'legal' });
    expect(resolveAppRoute('/a-propos')).toEqual({ kind: 'public-page', section: 'about' });
  });

  it('retire toutes les surfaces publiques par zone technique', () => {
    expect(resolveAppRoute('/zones')).toEqual({ kind: 'public-zone-retired' });
    expect(resolveAppRoute('/zones/synthetic-zone')).toEqual({ kind: 'public-zone-retired' });
    expect(resolveAppRoute('/zones/SYNTHETIC-ZONE-01/')).toEqual({ kind: 'public-zone-retired' });
  });

  it('renvoie une route administrateur inconnue plutôt que de planter sur un encodage invalide', () => {
    expect(resolveAppRoute('/admin/zones/%E0%A4%A')).toEqual({
      kind: 'admin',
      adminRoute: { kind: 'not-found' },
    });
  });

  it('aligne les identifiants et révisions administratifs avec le contrat API', () => {
    expect(resolveAdminRoute('/admin')).toEqual({ kind: 'dashboard' });
    expect(resolveAdminRoute('/admin/carte-operationnelle')).toEqual({ kind: 'operational-map' });
    expect(resolveAdminRoute('/admin/validation')).toEqual({ kind: 'work-queue' });
    expect(resolveAdminRoute('/admin/revue-evenements')).toEqual({ kind: 'event-review' });
    expect(resolveAdminRoute('/admin/revue-evenements/EC-private-1')).toEqual({ kind: 'event-review', candidateId: 'EC-private-1' });
    expect(resolveAdminRoute('/admin/file-de-traitement')).toEqual({ kind: 'work-queue' });
    expect(resolveAdminRoute('/admin/rapprochement-spatial')).toEqual({ kind: 'spatial-matching' });
    expect(resolveAdminRoute('/admin/incidents/nouveau')).toEqual({ kind: 'new-incident' });
    expect(resolveAdminRoute('/admin/incidents/FR-83-00042/observations')).toEqual({ kind: 'incident-observations', fireId: 'FR-83-00042' });
    expect(resolveAdminRoute('/admin/incidents/FR-83-00042/sources-medias')).toEqual({ kind: 'incident-sources-media', fireId: 'FR-83-00042' });
    expect(resolveAdminRoute('/admin/incidents/FR-83-00042/galerie')).toEqual({ kind: 'incident-gallery', fireId: 'FR-83-00042' });
    expect(resolveAdminRoute('/admin/incidents/FR-83-00042/modeles-pipeline')).toEqual({ kind: 'incident-models-pipeline', fireId: 'FR-83-00042' });
    expect(resolveAdminRoute('/admin/incidents/FR-83-00042/revue-spatiale')).toEqual({ kind: 'incident-spatial-review', fireId: 'FR-83-00042' });
    expect(resolveAdminRoute('/admin/incidents/FR-83-00042/carte/importer')).toEqual({ kind: 'incident-spatial-package', fireId: 'FR-83-00042' });
    expect(resolveAdminRoute('/admin/zones/SYNTHETIC-ZONE-01')).toEqual({
      kind: 'zone-detail',
      zoneId: 'SYNTHETIC-ZONE-01',
    });
    expect(resolveAdminRoute('/admin/zones/SYNTHETIC-ZONE-01/revisions/1')).toEqual({
      kind: 'zone-revision',
      zoneId: 'SYNTHETIC-ZONE-01',
      revision: '1',
    });
    expect(resolveAdminRoute('/admin/zones/SYNTHETIC-ZONE-01/revisions/nouvelle')).toEqual({
      kind: 'new-zone-revision',
      zoneId: 'SYNTHETIC-ZONE-01',
    });
    expect(resolveAdminRoute('/admin/zones/synthetic-zone/revisions/r1')).toEqual({ kind: 'not-found' });
  });

  it('retire l’ancien envoi d’archive et résout les parcours d’information', () => {
    expect(resolveAdminRoute('/admin/zones/SYNTHETIC-ZONE-01/uploads')).toEqual({ kind: 'not-found' });
    expect(resolveAdminRoute('/admin/zones/SYNTHETIC-ZONE-01/information/nouvelle')).toEqual({
      kind: 'new-zone-information',
      zoneId: 'SYNTHETIC-ZONE-01',
    });
    expect(resolveAdminRoute('/admin/zones/SYNTHETIC-ZONE-01/information/info-001')).toEqual({
      kind: 'zone-information',
      zoneId: 'SYNTHETIC-ZONE-01',
      informationId: 'info-001',
    });
    expect(resolveAdminRoute('/admin/zones/synthetic-zone-08/uploads')).toEqual({ kind: 'not-found' });
    expect(resolveAdminRoute('/admin/contributions')).toEqual({ kind: 'not-found' });
  });
});
