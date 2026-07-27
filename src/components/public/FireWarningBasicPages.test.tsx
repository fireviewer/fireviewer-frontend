// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { AccessibilityPage, LegalPage, OperationPage, PrivacyPage } from './FireWarningBasicPages';

afterEach(cleanup);

describe('pages secondaires FireWarning', () => {
  it('décrit le parcours de supervision sans proposer de signaler un feu', async () => {
    const user = userEvent.setup();
    render(<OperationPage />);

    expect(screen.getByText('Une personne supervise')).toBeVisible();
    expect(screen.queryByRole('link', { name: /signaler un feu/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /lire les limites/i }));
    expect(screen.getByRole('dialog', { name: 'Avant de consulter une fiche' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'J’ai compris' }));
    expect(screen.queryByRole('dialog', { name: 'Avant de consulter une fiche' })).not.toBeInTheDocument();
  });

  it('n’affiche ni placeholder légal ni promesse de conformité', () => {
    render(<LegalPage />);
    expect(screen.getByText('unicornwhodev@gmail.com')).toBeVisible();
    expect(screen.queryByText(/sera indiquée|validation juridique requise/i)).not.toBeInTheDocument();

    cleanup();
    render(<AccessibilityPage />);
    expect(screen.getByText(/Aucun audit complet de conformité RGAA/i)).toBeVisible();
    expect(screen.getByText('Pas de canal dédié publié')).toBeVisible();
  });

  it('présente la confidentialité comme une portée publiée et repliable', async () => {
    const user = userEvent.setup();
    render(<PrivacyPage />);

    const disclosure = screen.getByRole('group', { name: /réglages de cet appareil/i });
    expect(disclosure).toHaveAttribute('open');
    await user.click(screen.getByText('Réglages de cet appareil'));
    expect(disclosure).not.toHaveAttribute('open');
  });
});
