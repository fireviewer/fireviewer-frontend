import { describe, expect, it, vi } from 'vitest';

import type { AdminApiClient } from './adminApi';
import {
  uploadIncidentDailySatellitePackage,
  type DailySatelliteBlobUploader,
} from './dailySatelliteUpload';

async function sha256(content: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new Uint8Array(content).buffer as ArrayBuffer,
  );
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

describe('envoi des produits quotidiens', () => {
  it('valide le manifeste, envoie les fichiers privés puis finalise le lot', async () => {
    const imageContent = new Uint8Array([73, 73, 42, 0, 1, 2, 3, 4]);
    const image = new File([imageContent], 'sentinel-six-band.tif', { type: 'image/tiff' });
    const manifest = new File([JSON.stringify({
      schema_version: '1.0',
      expected_analysis_window_id: 'window-20260712',
      items: [{
        kind: 'satellite_image',
        filename: image.name,
        sha256: await sha256(imageContent),
      }],
    })], 'fireviewer-satellite-manifest.json', { type: 'application/json' });
    const openIncidentDailySatellitePackage = vi.fn().mockResolvedValue({
      package_id: 'SP-fontainebleau-20260712',
      upload_id: 'a'.repeat(32),
      pathname_prefix: 'firewarning/source-packages/upload-fixed',
      upload_grant: 'grant-signe',
      expires_at: '2026-07-12T23:00:00Z',
      maximum_file_size_bytes: 10_000,
      allowed_content_types: ['application/json', 'image/tiff'],
      already_uploaded_filenames: [],
    });
    const finalizeIncidentDailySatellitePackage = vi.fn().mockResolvedValue({
      package_id: 'SP-fontainebleau-20260712',
      package_kind: 'ADMIN_SATELLITE',
      fire_id: 'FR-77-00001',
      episode_id: 'E01',
      state: 'CONVERTED',
      known_start_date: '2026-07-12',
      known_end_date: '2026-07-12',
      analysis_authorized: true,
      publication_authorized: false,
      purge_after: '2026-08-12T23:00:00Z',
      finalized_at: '2026-07-12T20:00:00Z',
      batch_ids: ['batch-satellite-1'],
      item_count: 2,
    });
    const api = {
      openIncidentDailySatellitePackage,
      finalizeIncidentDailySatellitePackage,
      getBlobUploadTokenUrl: () => 'https://api.example.test/api/v1/admin/blob-upload-token',
    } as unknown as AdminApiClient;
    const uploader = vi.fn<DailySatelliteBlobUploader>(async (pathname, _file, options) => {
      options.onUploadProgress({ percentage: 100 });
      return { pathname };
    });
    const onProgress = vi.fn();

    await expect(uploadIncidentDailySatellitePackage({
      api,
      fireId: 'FR-77-00001',
      expectedAnalysisWindowId: 'window-20260712',
      files: [manifest, image],
      requestOptions: { idempotencyKey: 'satellite-upload-1' },
      uploader,
      onProgress,
    })).resolves.toMatchObject({ batch_ids: ['batch-satellite-1'] });

    expect(openIncidentDailySatellitePackage).toHaveBeenCalledWith(
      'FR-77-00001',
      'window-20260712',
      2,
      manifest.size + image.size,
      { idempotencyKey: 'satellite-upload-1' },
    );
    expect(uploader).toHaveBeenCalledTimes(2);
    expect(uploader.mock.calls[1]?.[2]).toMatchObject({
      access: 'private',
      handleUploadUrl: 'https://api.example.test/api/v1/admin/blob-upload-token',
      headers: { 'X-Blob-Upload-Grant': 'grant-signe' },
      clientPayload: 'SP-fontainebleau-20260712',
      contentType: 'image/tiff',
      multipart: true,
    });
    expect(finalizeIncidentDailySatellitePackage).toHaveBeenCalledWith(
      'SP-fontainebleau-20260712',
      { idempotencyKey: 'satellite-upload-1' },
    );
    expect(onProgress).toHaveBeenLastCalledWith(100);
  });

  it('refuse localement un manifeste d’une autre fenêtre', async () => {
    const image = new File(['image'], 'sentinel.png', { type: 'image/png' });
    const manifest = new File([JSON.stringify({
      schema_version: '1.0',
      expected_analysis_window_id: 'window-20260713',
      items: [{
        kind: 'satellite_image',
        filename: image.name,
        sha256: await sha256(new TextEncoder().encode('image')),
      }],
    })], 'fireviewer-satellite-manifest.json', { type: 'application/json' });
    const openIncidentDailySatellitePackage = vi.fn();
    const api = {
      openIncidentDailySatellitePackage,
    } as unknown as AdminApiClient;

    await expect(uploadIncidentDailySatellitePackage({
      api,
      fireId: 'FR-77-00001',
      expectedAnalysisWindowId: 'window-20260712',
      files: [manifest, image],
      requestOptions: { idempotencyKey: 'satellite-upload-1' },
      uploader: vi.fn(),
    })).rejects.toThrow('ne correspond pas à la journée active');
    expect(openIncidentDailySatellitePackage).not.toHaveBeenCalled();
  });

  it('reprend un dépôt quotidien sans écraser un produit déjà transféré', async () => {
    const imageContent = new Uint8Array([73, 73, 42, 0, 1, 2, 3, 4]);
    const image = new File([imageContent], 'sentinel-six-band.tif', { type: 'image/tiff' });
    const manifest = new File([JSON.stringify({
      schema_version: '1.0',
      expected_analysis_window_id: 'window-20260712',
      items: [{
        kind: 'satellite_image',
        filename: image.name,
        sha256: await sha256(imageContent),
      }],
    })], 'fireviewer-satellite-manifest.json', { type: 'application/json' });
    const api = {
      openIncidentDailySatellitePackage: vi.fn().mockResolvedValue({
        package_id: 'SP-resume',
        upload_id: 'upload-resume',
        pathname_prefix: 'firewarning/source-packages/upload-resume',
        upload_grant: 'grant-signe',
        expires_at: '2026-07-12T23:00:00Z',
        maximum_file_size_bytes: 10_000,
        allowed_content_types: ['application/json', 'image/tiff'],
        already_uploaded_filenames: ['fireviewer-satellite-manifest.json'],
      }),
      finalizeIncidentDailySatellitePackage: vi.fn().mockResolvedValue({
        package_id: 'SP-resume',
        batch_ids: ['batch-satellite-1'],
        item_count: 2,
      }),
      getBlobUploadTokenUrl: () => 'https://api.example.test/api/v1/admin/blob-upload-token',
    } as unknown as AdminApiClient;
    const uploader = vi.fn<DailySatelliteBlobUploader>(async (pathname, _file, options) => {
      options.onUploadProgress({ percentage: 100 });
      return { pathname };
    });

    await uploadIncidentDailySatellitePackage({
      api,
      fireId: 'FR-77-00001',
      expectedAnalysisWindowId: 'window-20260712',
      files: [manifest, image],
      requestOptions: { idempotencyKey: 'satellite-resume-1' },
      uploader,
    });

    expect(uploader).toHaveBeenCalledTimes(1);
    expect(uploader.mock.calls[0]?.[1].name).toBe('sentinel-six-band.tif');
  });
});
