// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminShell } from './AdminShell';
import { ADMIN_OPERATIONS } from './operations/adminOperations';

describe('AdminShell', () => {
  afterEach(() => {
    cleanup();
    window.history.replaceState({}, '', '/');
    vi.unstubAllEnvs();
  });

  it('montre uniquement les quatre blocs principaux', () => {
    window.history.replaceState({}, '', '/admin/zones');
    render(<AdminShell><p>Contenu de test</p></AdminShell>);

    expect(ADMIN_OPERATIONS).toHaveLength(12);
    expect(screen.getByRole('link', { name: 'Centre opérationnel' })).toHaveAttribute('href', '/admin');
    expect(screen.getByRole('link', { name: 'Validation' })).toHaveAttribute('href', '/admin/validation');
    expect(screen.getByRole('link', { name: 'Incidents' })).toHaveAttribute('href', '/admin/incidents');
    expect(screen.getByRole('link', { name: 'Système' })).toHaveAttribute('href', '/admin/systeme');
    expect(screen.queryByRole('link', { name: 'Cartes 3D' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Publications' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Audit global' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nouvelle zone' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Configuration' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Revue événements' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Validation' })).toHaveAttribute('aria-current', 'page');
  });

  it('ajoute la revue événementielle à la navigation seulement avec les deux flags requis', () => {
    vi.stubEnv('VITE_FV_EVENT_V2_ENABLED', 'true');
    vi.stubEnv('VITE_FV_SUPABASE_AUTH_ENABLED', 'true');
    window.history.replaceState({}, '', '/admin/revue-evenements');
    render(<AdminShell><p>Revue v2</p></AdminShell>);

    expect(screen.getByRole('link', { name: 'Revue événements' })).toHaveAttribute('href', '/admin/revue-evenements');
    expect(screen.getByRole('link', { name: 'Revue événements' })).toHaveAttribute('aria-current', 'page');
  });

  it('n expose pas de surface placeholder', () => {
    expect(ADMIN_OPERATIONS.some(({ availability }) => availability === 'not_available')).toBe(false);
  });

  it('navigue entre les pages admin sans recharger le document', async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, '', '/admin');
    const navigation = vi.fn();
    window.addEventListener('popstate', navigation, { once: true });
    render(<AdminShell><p>Contenu de test</p></AdminShell>);

    await user.click(screen.getByRole('link', { name: 'Validation' }));

    expect(window.location.pathname).toBe('/admin/validation');
    expect(navigation).toHaveBeenCalledOnce();
    expect(screen.getByText('Contenu de test')).toBeVisible();
  });
});
