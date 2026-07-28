// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const incidentApi = vi.hoisted(() => ({
  submitPublicIncidentReport: vi.fn(),
}));
const contributionApi = vi.hoisted(() => ({
  submitPublicContribution: vi.fn(),
  getPublicContribution: vi.fn(),
}));

vi.mock('../../lib/publicIncidentView', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../lib/publicIncidentView')>();
  return { ...original, submitPublicIncidentReport: incidentApi.submitPublicIncidentReport };
});
vi.mock('../../lib/publicContributions', () => contributionApi);

import {
  FireWarningContributionTrackingPage,
  FireWarningIncidentErrorPage,
  FireWarningReportPage,
} from './FireWarningContributionPages';

describe('parcours publics de contribution', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    incidentApi.submitPublicIncidentReport.mockReset();
    contributionApi.submitPublicContribution.mockReset();
    contributionApi.getPublicContribution.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('impose la barrière d’urgence puis transmet réellement la contribution privée', async () => {
    contributionApi.submitPublicContribution.mockResolvedValue({
      contribution_id: 'CONTRIB-20260715-TEST0001',
      kind: 'new_fire',
      fire_id: null,
      state: 'PENDING',
      received_at: '2026-07-15T10:00:00Z',
      reviewed_at: null,
      review_reason: null,
      purge_after: '2026-08-15T10:00:00Z',
      media_count: 0,
      location_label: 'Massif de secteur synthétique',
      observation_type: 'Fumée',
      observed_at: '2026-07-15T09:55:00Z',
      version: 1,
    });
    const user = userEvent.setup();
    render(<FireWarningReportPage />);

    expect(screen.getByRole('heading', { name: 'Danger immédiat ou personnes menacées ?' })).toBeVisible();
    expect(screen.getByRole('link', { name: /Appeler le 112/ })).toHaveAttribute('href', 'tel:112');

    await user.click(screen.getByRole('button', { name: /Je suis en sécurité, continuer/ }));
    await user.type(screen.getByLabelText('Commune, lieu-dit ou repère'), 'Massif de secteur synthétique');
    await user.click(screen.getByRole('button', { name: /Continuer/ }));

    await user.selectOptions(screen.getByLabelText('Type d’observation'), 'Fumée');
    await user.click(screen.getByRole('button', { name: /Continuer/ }));
    await user.click(screen.getByRole('button', { name: /Continuer/ }));

    await user.type(screen.getByRole('textbox', { name: /Description factuelle/ }), 'Une colonne de fumée sombre est visible depuis la route.');
    await user.click(screen.getByRole('button', { name: /Continuer/ }));

    const consents = screen.getAllByRole('checkbox');
    expect(consents).toHaveLength(4);
    for (const consent of consents) expect(consent).not.toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: /Analyser cette contribution/ }));
    await user.click(screen.getByRole('button', { name: /Continuer/ }));
    await user.click(screen.getByRole('button', { name: /Envoyer la contribution/ }));

    expect(await screen.findByRole('heading', { name: 'Les données ont été transmises en privé' })).toBeVisible();
    expect(contributionApi.submitPublicContribution).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'new_fire',
        location: expect.objectContaining({ label: 'Massif de secteur synthétique' }),
        consents: expect.objectContaining({ private_analysis: true, public_display: false }),
      }),
      expect.any(Function),
    );
    expect(localStorage.getItem('fw:contribution-drafts:v1')).toBeNull();
    expect(incidentApi.submitPublicIncidentReport).not.toHaveBeenCalled();
  });

  it('affiche le statut enregistré par le backend avec le reçu privé', async () => {
    contributionApi.getPublicContribution.mockResolvedValue({
      contribution_id: 'CONTRIB-20260715-TEST0001',
      kind: 'incident_evidence',
      fire_id: 'FR-83-00042',
      state: 'PENDING',
      received_at: '2026-07-15T10:00:00Z',
      reviewed_at: null,
      review_reason: null,
      purge_after: '2026-08-15T10:00:00Z',
      media_count: 1,
      location_label: 'Versant est',
      observation_type: 'Fumée',
      observed_at: '2026-07-15T12:00:00Z',
      version: 1,
    });

    render(<FireWarningContributionTrackingPage contributionId="CONTRIB-20260715-TEST0001" />);

    expect(await screen.findByText('Reçue · en attente de vérification')).toBeVisible();
    expect(screen.getByText('Versant est')).toBeVisible();
    expect(contributionApi.getPublicContribution).toHaveBeenCalledWith('CONTRIB-20260715-TEST0001');
  });

  it('transmet réellement un signalement d’erreur et affiche le reçu serveur', async () => {
    incidentApi.submitPublicIncidentReport.mockResolvedValue({
      receipt_id: 'REPORT-20260715-0001',
      status: 'received',
      submitted_at: '2026-07-15T14:22:00Z',
      replayed: false,
    });
    const user = userEvent.setup();
    render(<FireWarningIncidentErrorPage fireId="FR-83-00042" />);

    await user.click(screen.getByRole('radio', { name: 'Position sur le modèle' }));
    await user.type(screen.getByLabelText('Description du problème'), 'Le marqueur est placé sur le mauvais versant.');
    await user.click(screen.getByRole('checkbox', { name: /Autoriser le traitement/ }));
    await user.click(screen.getByRole('button', { name: /Transmettre le signalement/ }));

    expect(incidentApi.submitPublicIncidentReport).toHaveBeenCalledWith('FR-83-00042', expect.objectContaining({
      category: 'location',
      message: expect.stringContaining('mauvais versant'),
    }));
    expect(await screen.findByText('REPORT-20260715-0001')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'La page reste inchangée pendant la vérification' })).toBeVisible();
  });
});
