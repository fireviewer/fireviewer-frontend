// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PublicResourcesPage } from './PublicResourcesPage';

afterEach(cleanup);

describe('PublicResourcesPage', () => {
  it('publie le pack Omniverse reproductible avec son intégrité', () => {
    render(<PublicResourcesPage />);

    expect(screen.getByRole('heading', { name: 'Ressources FireViewer' })).toBeInTheDocument();
    expect(screen.getByText('1990504c41ce3da672ce4a25f8d345b67ad751c318bf769008d175f541040db0')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Télécharger/ })).toHaveAttribute(
      'href',
      'https://huggingface.co/datasets/fireviewer/omniverse-die-reproduction-pack-v1/resolve/main/fireviewer-die-2026-reproduction-download-r1.zip?download=true',
    );
  });

  it('sépare les modèles des datasets et conserve leurs liens externes', () => {
    render(<PublicResourcesPage />);

    expect(screen.getByRole('heading', { name: 'Modèles publiés' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Datasets et corpus' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /RT-DETRv2 R50/ })).toHaveAttribute('rel', 'noreferrer');
    expect(screen.getByRole('link', { name: /Fire & Smoke Detection Corpus/ })).toHaveAttribute('rel', 'noreferrer');
  });
});
