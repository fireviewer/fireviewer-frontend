// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const discovery = vi.hoisted(() => ({
  loadRecentPublicIncidents: vi.fn(),
  publicDiscoveryOrigin: vi.fn(),
  searchPublicIncidents: vi.fn(),
}));

vi.mock('../../lib/publicDiscovery', () => discovery);

import { FireWarningIncidentsPage } from './FireWarningIncidentsPage';

const index = {
  schema_version: '1.0' as const,
  incidents: [{
    fire_id: 'FR-77-00001',
    canonical_name: 'Fontainebleau',
    status: 'ACTIVE_CONFIRMED',
    verification: 'verified' as const,
    last_observed_at: '2026-07-13T10:00:00Z',
  }],
};

describe('FireWarningIncidentsPage', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/incendies');
    discovery.publicDiscoveryOrigin.mockReset().mockReturnValue('https://api.example.test');
    discovery.loadRecentPublicIncidents.mockReset().mockResolvedValue(index);
    discovery.searchPublicIncidents.mockReset().mockResolvedValue(index);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('charge la liste publiée, sans transformer des paramètres absents en coordonnées 0,0', async () => {
    render(<FireWarningIncidentsPage />);

    await waitFor(() => expect(discovery.loadRecentPublicIncidents).toHaveBeenCalledOnce());

    expect(discovery.searchPublicIncidents).not.toHaveBeenCalled();
    expect(await screen.findByRole('heading', { name: 'Fontainebleau' })).toBeVisible();
  });
});
