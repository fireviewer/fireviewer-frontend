import { describe, expect, it, vi } from 'vitest';
import { loadPublicSpatialScene } from './publicSpatialScene';

const environment = {
  VITE_USE_MOCKS: 'false',
  VITE_API_BASE_URL: 'https://api.example.test',
};

describe('loadPublicSpatialScene', () => {
  it('charge la liste différée des fichiers seulement depuis le bootstrap public', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      package_id: 'pkg-1',
      catalog_url: '/api/v1/incident/FR-77-00001/spatial-scene/catalog',
      files: [{
        file_id: 1,
        path: 'assets/far/terrain.fwterrain',
        kind: 'FWTERRAIN',
        url: '/api/v1/incident/FR-77-00001/spatial-scene/files/1',
        sha256: 'a'.repeat(64),
        size_bytes: 1024,
        media_type: 'application/octet-stream',
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    await expect(loadPublicSpatialScene('FR-77-00001', { environment, fetchImpl }))
      .resolves.toMatchObject({ package_id: 'pkg-1', files: [{ file_id: 1 }] });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/incident/FR-77-00001/spatial-scene/bootstrap',
      expect.objectContaining({ cache: 'no-store', credentials: 'omit' }),
    );
  });

  it('refuse un bootstrap sans fichier', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      package_id: 'pkg-1',
      catalog_url: '/catalog',
      files: [],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    await expect(loadPublicSpatialScene('FR-77-00001', { environment, fetchImpl }))
      .rejects.toThrow('aucun fichier');
  });
});
