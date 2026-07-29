// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import type {
  AdminApiClient,
  AdminIncidentSourcePackageResult,
} from './adminApi';
import {
  type IncidentSourceBlobUploader,
  uploadIncidentSourcePackage,
} from './incidentSourceUpload';

function result(): AdminIncidentSourcePackageResult {
  return {
    package_id: 'SP-fontainebleau-mixed',
    package_kind: 'ADMIN_SOURCES',
    fire_id: 'FR-77-00001',
    episode_id: 'E01',
    state: 'CONVERTED',
    known_start_date: null,
    known_end_date: null,
    analysis_authorized: true,
    publication_authorized: false,
    purge_after: '2026-08-29T10:00:00Z',
    finalized_at: '2026-07-29T10:00:00Z',
    batch_ids: ['batch-20260712', 'batch-20260713'],
    item_count: 4,
    classified_item_count: 3,
    to_classify_item_count: 1,
    analysis_window_count: 2,
    date_groups: [
      {
        local_date: '2026-07-12',
        analysis_window_id: 'window-20260712',
        item_count: 1,
        batch_ids: ['batch-20260712'],
      },
      {
        local_date: '2026-07-13',
        analysis_window_id: 'window-20260713',
        item_count: 2,
        batch_ids: ['batch-20260713'],
      },
    ],
  };
}

describe('uploadIncidentSourcePackage', () => {
  it('transfère un lot multi-format sans imposer de date ou de fenêtre', async () => {
    const files = [
      new File(['photo'], 'terrain.jpg', { type: 'image/jpeg' }),
      new File(['video'], 'survol.mp4', { type: 'video/mp4' }),
      new File(['texte'], 'communique.txt', { type: 'text/plain' }),
    ];
    const openIncidentSourcePackage = vi.fn().mockResolvedValue({
      package_id: 'SP-fontainebleau-mixed',
      upload_id: 'upload-mixed',
      pathname_prefix: 'firewarning/source-packages/upload-mixed',
      upload_grant: 'grant-signe',
      expires_at: '2026-07-29T10:30:00Z',
      maximum_file_size_bytes: 100_000_000,
      allowed_content_types: ['image/jpeg', 'video/mp4', 'text/plain'],
      already_uploaded_filenames: [],
    });
    const finalizeIncidentSourcePackage = vi.fn().mockResolvedValue(result());
    const api = {
      openIncidentSourcePackage,
      finalizeIncidentSourcePackage,
      getBlobUploadTokenUrl: () => 'https://api.example.test/api/v1/admin/blob-upload-token',
    } as unknown as AdminApiClient;
    const uploader = vi.fn<IncidentSourceBlobUploader>(async (pathname, _file, options) => {
      options.onUploadProgress({ percentage: 100 });
      return { pathname };
    });
    const onProgress = vi.fn();

    await expect(uploadIncidentSourcePackage({
      api,
      fireId: 'FR-77-00001',
      files,
      requestOptions: { idempotencyKey: 'incident-source-upload-1' },
      uploader,
      onProgress,
    })).resolves.toMatchObject({
      package_id: 'SP-fontainebleau-mixed',
      analysis_window_count: 2,
      to_classify_item_count: 1,
    });

    expect(openIncidentSourcePackage).toHaveBeenCalledWith(
      'FR-77-00001',
      3,
      files.reduce((total, file) => total + file.size, 0),
      { idempotencyKey: 'incident-source-upload-1' },
    );
    expect(uploader).toHaveBeenCalledTimes(3);
    expect(uploader.mock.calls.map((call) => call[2].contentType)).toEqual([
      'image/jpeg',
      'video/mp4',
      'text/plain',
    ]);
    expect(finalizeIncidentSourcePackage).toHaveBeenCalledWith(
      'SP-fontainebleau-mixed',
      { idempotencyKey: 'incident-source-upload-1' },
    );
    expect(onProgress).toHaveBeenLastCalledWith(100);
  });

  it('réutilise le dépôt idempotent et ne renvoie pas un fichier déjà présent', async () => {
    const files = [
      new File(['photo'], 'terrain.jpg', { type: 'image/jpeg' }),
      new File(['texte'], 'communique.txt', { type: 'text/plain' }),
    ];
    const openIncidentSourcePackage = vi.fn().mockResolvedValue({
      package_id: 'SP-resume',
      upload_id: 'upload-resume',
      pathname_prefix: 'firewarning/source-packages/upload-resume',
      upload_grant: 'grant-signe',
      expires_at: '2026-07-29T10:30:00Z',
      maximum_file_size_bytes: 100_000_000,
      allowed_content_types: ['image/jpeg', 'text/plain'],
      already_uploaded_filenames: ['terrain.jpg'],
    });
    const finalizeIncidentSourcePackage = vi.fn().mockResolvedValue(result());
    const api = {
      openIncidentSourcePackage,
      finalizeIncidentSourcePackage,
      getBlobUploadTokenUrl: () => 'https://api.example.test/api/v1/admin/blob-upload-token',
    } as unknown as AdminApiClient;
    const uploader = vi.fn<IncidentSourceBlobUploader>(async (pathname, _file, options) => {
      options.onUploadProgress({ percentage: 100 });
      return { pathname };
    });
    const onProgress = vi.fn();

    await uploadIncidentSourcePackage({
      api,
      fireId: 'FR-77-00001',
      files,
      requestOptions: { idempotencyKey: 'incident-source-resume' },
      uploader,
      onProgress,
    });

    expect(uploader).toHaveBeenCalledTimes(1);
    expect(uploader.mock.calls[0]?.[1].name).toBe('communique.txt');
    expect(finalizeIncidentSourcePackage).toHaveBeenCalledWith(
      'SP-resume',
      { idempotencyKey: 'incident-source-resume' },
    );
    expect(onProgress).toHaveBeenLastCalledWith(100);
  });

  it('redirige un GeoTIFF vers le parcours satellite avant d’ouvrir un dépôt', async () => {
    const file = new File(['tiff'], 'sentinel.tif', { type: 'image/tiff' });
    const api = {
      openIncidentSourcePackage: vi.fn(),
    } as unknown as AdminApiClient;

    await expect(uploadIncidentSourcePackage({
      api,
      fireId: 'FR-77-00001',
      files: [file],
      requestOptions: { idempotencyKey: 'incident-source-upload-2' },
      uploader: vi.fn(),
    })).rejects.toThrow('parcours satellite quotidien');
    expect(api.openIncidentSourcePackage).not.toHaveBeenCalled();
  });
});
