// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminApiClient } from './adminApi';
import {
  prepareSpatialPackage,
  uploadPreparedIncidentSpatialPackage,
  uploadPreparedSpatialPackage,
  type BlobUploader,
  type PreparedSpatialPackage,
} from './spatialPackageUpload';

const ZONE_ID = 'TEST-ZONE-01';
const REVISION = 2;
const UPLOAD_ID = 'a'.repeat(32);

function packageFile(path: string, content: BlobPart, type: string): File {
  const file = new File([content], path.split('/').at(-1)!, { type });
  Object.defineProperty(file, 'webkitRelativePath', {
    configurable: true,
    value: `package-local/${path}`,
  });
  return file;
}

async function sha256Hex(file: File): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function validFiles(options: {
  readonly declaredModelSize?: number;
  readonly modelPath?: string;
  readonly includeModel?: boolean;
  readonly includeExtra?: boolean;
} = {}): Promise<File[]> {
  const modelPath = options.modelPath ?? 'assets/model.glb';
  const model = packageFile(modelPath, 'model-data', 'model/gltf-binary');
  const catalogText = JSON.stringify({
    assets: [{
      path: modelPath,
      sha256: 'b'.repeat(64),
      byte_count: options.declaredModelSize ?? model.size,
    }],
  });
  const catalog = packageFile('catalog.json', catalogText, 'application/json');
  const manifest = packageFile('package-manifest.json', JSON.stringify({
    package_id: 'pkg-zone-r2',
    catalog: {
      path: 'catalog.json',
      sha256: await sha256Hex(catalog),
      byte_count: catalog.size,
    },
    zones: [{ zone_id: ZONE_ID, revision_id: 'R2' }],
  }), 'application/json');
  const files = [manifest, catalog];
  if (options.includeModel !== false) files.push(model);
  if (options.includeExtra) files.push(packageFile('assets/extra.png', 'extra', 'image/png'));
  return files;
}

async function omniverseFiles(role: 'map' | 'perimeter'): Promise<File[]> {
  const entryPath = role === 'map' ? 'map.usda' : 'perimeters.usda';
  const entry = packageFile(entryPath, '#usda 1.0', 'model/vnd.usd');
  const sourceManifest = packageFile('source-usd/source/package-manifest.json', JSON.stringify({
    zones: [{ zone_id: ZONE_ID, revision_id: 'R1' }],
  }), 'application/json');
  const assets = role === 'map' ? [entry, sourceManifest] : [entry];
  const inventoryDocument = {
    file_count: assets.length,
    files: await Promise.all(assets.map(async (file) => ({
      path: file.webkitRelativePath.replace('package-local/', ''),
      byte_count: file.size,
      sha256: await sha256Hex(file),
    }))),
  };
  const inventory = packageFile('dependency-inventory.json', JSON.stringify(inventoryDocument), 'application/json');
  const packageId = role === 'map' ? 'map-omniverse-r2' : 'perimeters-omniverse-r1';
  const manifestDocument = role === 'map' ? {
    schema: 'fireviewer.omniverse-pure-map-package.v1', status: 'active', package_id: packageId, revision: REVISION,
    entry_stage: entryPath, entry_stage_sha256: await sha256Hex(entry),
    dependency_inventory: { path: 'dependency-inventory.json', sha256: await sha256Hex(inventory), file_count: assets.length },
  } : {
    schema: 'fireviewer.omniverse-progressive-perimeter-package.v1', status: 'active', layer_package_id: packageId, revision: 1,
    entry_layer: entryPath, entry_layer_sha256: await sha256Hex(entry),
    dependency_inventory: { path: 'dependency-inventory.json', sha256: await sha256Hex(inventory), file_count: assets.length },
  };
  const manifest = packageFile('manifest.json', JSON.stringify(manifestDocument), 'application/json');
  const contractDocument = role === 'map' ? {
    schema: 'fireviewer.omniverse-map-upload-contract.v1', contract_status: 'active',
    package: { package_id: packageId, revision: REVISION, entry_stage: entryPath, entry_stage_sha256: await sha256Hex(entry), manifest_sha256: await sha256Hex(manifest) },
    release: { upload_allowed: true, automatic_publication: false },
  } : {
    schema: 'fireviewer.omniverse-progressive-perimeter-layer-contract.v1', contract_status: 'active',
    layer_package: { layer_package_id: packageId, revision: 1, entry_layer: entryPath, entry_layer_sha256: await sha256Hex(entry), manifest_sha256: await sha256Hex(manifest) },
    release: { layer_attachment_allowed: true, automatic_publication: false },
    base_map: { package_id: 'map-omniverse-r2', revision: REVISION },
    progression: { layer_crs: 'EPSG:2154', state_count: 21 },
  };
  const contractPath = role === 'map' ? 'contracts/map-contract.json' : 'contracts/perimeter-contract.json';
  return [
    manifest,
    inventory,
    packageFile(contractPath, JSON.stringify(contractDocument), 'application/json'),
    ...assets,
  ];
}

describe('préparation du package spatial côté navigateur', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepte exactement le manifeste, le catalogue et les assets déclarés', async () => {
    const prepared = await prepareSpatialPackage(await validFiles(), ZONE_ID, REVISION);

    expect(prepared).toMatchObject({ packageId: 'pkg-zone-r2', assetCount: 1 });
    expect(prepared.files.map((item) => item.path)).toEqual([
      'package-manifest.json',
      'catalog.json',
      'assets/model.glb',
    ]);
    expect(prepared.totalSizeBytes).toBe(prepared.files.reduce((total, item) => total + item.file.size, 0));
  });

  it('distingue une carte Omniverse complète et ses périmètres séparés', async () => {
    const map = await prepareSpatialPackage(await omniverseFiles('map'));
    const perimeters = await prepareSpatialPackage(await omniverseFiles('perimeter'), ZONE_ID, REVISION);

    expect(map).toMatchObject({
      role: 'omniverse_map', packageId: 'map-omniverse-r2', zoneId: ZONE_ID, revision: REVISION,
    });
    expect(perimeters).toMatchObject({
      role: 'omniverse_perimeter', packageId: 'perimeters-omniverse-r1', zoneId: ZONE_ID,
      revision: REVISION, baseMapPackageId: 'map-omniverse-r2', stateCount: 21,
    });
    expect(map.files.map((item) => item.path)).toContain('map.usda');
    expect(perimeters.files.map((item) => item.path)).toContain('perimeters.usda');
  });

  it.each([
    ['assets/far/global.fwterrain', 'application/vnd.fireviewer.terrain'],
    ['assets/detail/tile.fwtile', 'application/vnd.fireviewer.tile'],
    ['assets/imagery/tile.jpg', 'image/jpeg'],
  ])('accepte l’asset Unity distant %s', async (modelPath, expectedContentType) => {
    const prepared = await prepareSpatialPackage(await validFiles({ modelPath }), ZONE_ID, REVISION);

    expect(prepared.files.at(-1)).toMatchObject({ path: modelPath, contentType: expectedContentType });
  });

  it('refuse un dossier sans manifeste ou catalogue', async () => {
    const files = await validFiles();
    files[0] = packageFile('metadata.json', '{}', 'application/json');

    await expect(prepareSpatialPackage(files, ZONE_ID, REVISION))
      .rejects.toThrow('package-manifest.json et catalog.json');
  });

  it('refuse un fichier supplémentaire et un asset absent', async () => {
    await expect(prepareSpatialPackage(await validFiles({ includeExtra: true }), ZONE_ID, REVISION))
      .rejects.toThrow('Fichier supplémentaire non déclaré');

    const files = await validFiles({ includeModel: false });
    files.push(packageFile('assets/preview.png', 'preview', 'image/png'));
    await expect(prepareSpatialPackage(files, ZONE_ID, REVISION))
      .rejects.toThrow('Fichier supplémentaire non déclaré');
  });

  it('refuse une taille différente, un type inconnu et un chemin parent', async () => {
    await expect(prepareSpatialPackage(await validFiles({ declaredModelSize: 99 }), ZONE_ID, REVISION))
      .rejects.toThrow('taille de assets/model.glb diffère');
    await expect(prepareSpatialPackage(await validFiles({ modelPath: 'assets/model.exe' }), ZONE_ID, REVISION))
      .rejects.toThrow('Type de fichier non pris en charge');

    const files = await validFiles();
    Object.defineProperty(files[2], 'webkitRelativePath', { configurable: true, value: 'package-local/../model.glb' });
    await expect(prepareSpatialPackage(files, ZONE_ID, REVISION)).rejects.toThrow('Chemin de package interdit');
  });
});

describe('envoi direct vers Vercel Blob', () => {
  it('utilise le multipart privé puis finalise exactement les objets reçus', async () => {
    const prepared: PreparedSpatialPackage = {
      role: 'legacy_map',
      packageId: 'pkg-zone-r2',
      zoneId: ZONE_ID,
      revision: REVISION,
      assetCount: 1,
      files: [
        { path: 'package-manifest.json', file: new File(['manifest'], 'package-manifest.json'), contentType: 'application/json' },
        { path: 'catalog.json', file: new File(['catalog'], 'catalog.json'), contentType: 'application/json' },
        { path: 'assets/model.glb', file: new File(['model'], 'model.glb'), contentType: 'model/gltf-binary' },
      ],
      totalSizeBytes: 20,
    };
    const finalize = vi.fn().mockResolvedValue({
      package_id: prepared.packageId,
      state: 'DRAFT',
      upload_id: UPLOAD_ID,
      object_count: 3,
      total_size_bytes: 20,
      asset_count: 1,
      validation_summary: 'Objets contrôlés.',
      trace_id: 'trace-finalize',
    });
    const api = {
      createSpatialPackageUploadGrant: vi.fn().mockResolvedValue({
        upload_id: UPLOAD_ID,
        pathname_prefix: `packages/${UPLOAD_ID}`,
        upload_grant: 'grant-signe',
        expires_at: '2026-07-14T10:10:00Z',
        maximum_file_size_bytes: 5_000_000_000,
        allowed_content_types: ['application/json', 'model/gltf-binary'],
      }),
      getBlobUploadTokenUrl: () => 'https://api.example.test/api/v1/admin/blob-upload-token',
      refreshAdminSession: vi.fn().mockResolvedValue(undefined),
      finalizeSpatialPackageFromBlob: finalize,
    } as unknown as AdminApiClient;
    const uploader = vi.fn(async (pathname: string, file: File, options: Parameters<BlobUploader>[2]) => {
      options.onUploadProgress({ loaded: file.size, total: file.size, percentage: 100 });
      return { pathname, contentType: options.contentType };
    });
    const progress = vi.fn();

    const result = await uploadPreparedSpatialPackage(
      api,
      ZONE_ID,
      REVISION,
      prepared,
      'Import direct contrôlé du package.',
      'idempotency-1',
      progress,
      { uploader },
    );

    expect(result.object_count).toBe(3);
    expect(uploader).toHaveBeenCalledTimes(3);
    expect(uploader.mock.calls[0]?.[2]).toEqual(expect.objectContaining({
      access: 'private',
      multipart: true,
      handleUploadUrl: 'https://api.example.test/api/v1/admin/blob-upload-token',
      headers: { 'X-Blob-Upload-Grant': 'grant-signe' },
    }));
    expect(finalize).toHaveBeenCalledWith(
      ZONE_ID,
      REVISION,
      expect.objectContaining({
        upload_id: UPLOAD_ID,
        package_id: prepared.packageId,
        objects: [
          expect.objectContaining({ path: 'package-manifest.json', pathname: `packages/${UPLOAD_ID}/package-manifest.json` }),
          expect.objectContaining({ path: 'catalog.json', pathname: `packages/${UPLOAD_ID}/catalog.json` }),
          expect.objectContaining({ path: 'assets/model.glb', pathname: `packages/${UPLOAD_ID}/assets/model.glb` }),
        ],
      }),
      { idempotencyKey: 'idempotency-1', signal: undefined }, // gitleaks:allow -- fixture de test.
    );
    expect(progress.mock.calls.at(-1)?.[0]).toMatchObject({ phase: 'finalizing', percentage: 100 });
  });

  it('finalise dans le projet sans appeler le parcours technique de zone', async () => {
    const prepared = await prepareSpatialPackage(await validFiles());
    const finalizeProject = vi.fn().mockResolvedValue({
      fire_id: 'FR-99-00001', episode_id: 'E01', package_id: prepared.packageId,
      package_state: 'PREVIEWABLE', zone_id: prepared.zoneId, revision: prepared.revision,
      manifest_revision: 2, incident_version: 8, object_count: prepared.files.length,
      total_size_bytes: prepared.totalSizeBytes, asset_count: prepared.assetCount,
      trace_id: 'trace-project-finalize',
    });
    const api = {
      createIncidentSpatialPackageUploadGrant: vi.fn().mockResolvedValue({
        upload_id: UPLOAD_ID, pathname_prefix: `packages/${UPLOAD_ID}`, upload_grant: 'grant-project',
        expires_at: '2026-07-14T10:10:00Z', maximum_file_size_bytes: 5_000_000_000,
        allowed_content_types: ['application/json', 'model/gltf-binary'],
      }),
      createSpatialPackageUploadGrant: vi.fn(),
      getBlobUploadTokenUrl: () => 'https://api.example.test/api/v1/admin/blob-upload-token',
      refreshAdminSession: vi.fn().mockResolvedValue(undefined),
      finalizeIncidentSpatialPackageFromBlob: finalizeProject,
      finalizeSpatialPackageFromBlob: vi.fn(),
    } as unknown as AdminApiClient;
    const uploader = vi.fn(async (pathname: string, file: File, options: Parameters<BlobUploader>[2]) => {
      options.onUploadProgress({ loaded: file.size, total: file.size, percentage: 100 });
      return { pathname, contentType: options.contentType };
    });

    const result = await uploadPreparedIncidentSpatialPackage(
      api, 'FR-99-00001', 7, prepared,
      'Import du fond 3D depuis le projet incendie.', 'project-import-0001', vi.fn(),
      { uploader },
    );

    expect(result.package_state).toBe('PREVIEWABLE');
    expect(api.createSpatialPackageUploadGrant).not.toHaveBeenCalled();
    expect(api.finalizeSpatialPackageFromBlob).not.toHaveBeenCalled();
    expect(finalizeProject).toHaveBeenCalledWith(
      'FR-99-00001',
      expect.objectContaining({
        zone_id: ZONE_ID, revision: REVISION, expected_incident_version: 7,
        package_id: prepared.packageId,
      }),
      { idempotencyKey: 'project-import-0001', signal: undefined },
    );
  });

  it('maintient la session admin active pendant un transfert long et avant la finalisation', async () => {
    const files = Array.from({ length: 3 }, (_, index) => ({
      path: `assets/tile-${index}.fwtile`,
      file: new File([`tile-${index}`], `tile-${index}.fwtile`),
      contentType: 'application/vnd.fireviewer.tile',
    }));
    const prepared: PreparedSpatialPackage = {
      role: 'legacy_map',
      packageId: 'pkg-session-r2',
      zoneId: ZONE_ID,
      revision: REVISION,
      assetCount: files.length,
      files,
      totalSizeBytes: files.reduce((total, item) => total + item.file.size, 0),
    };
    const refreshAdminSession = vi.fn().mockResolvedValue(undefined);
    const finalize = vi.fn().mockResolvedValue({
      package_id: prepared.packageId,
      object_count: files.length,
    });
    const api = {
      createSpatialPackageUploadGrant: vi.fn().mockResolvedValue({
        upload_id: UPLOAD_ID,
        pathname_prefix: `packages/${UPLOAD_ID}`,
        upload_grant: 'grant-signe',
      }),
      getBlobUploadTokenUrl: () => 'https://api.example.test/api/v1/admin/blob-upload-token',
      refreshAdminSession,
      finalizeSpatialPackageFromBlob: finalize,
    } as unknown as AdminApiClient;
    const uploader = vi.fn(async (
      pathname: string,
      file: File,
      options: Parameters<BlobUploader>[2],
    ) => {
      await new Promise((resolve) => setTimeout(resolve, 2));
      options.onUploadProgress({ loaded: file.size, total: file.size, percentage: 100 });
      return { pathname, contentType: options.contentType };
    });

    await uploadPreparedSpatialPackage(
      api,
      ZONE_ID,
      REVISION,
      prepared,
      'Import long avec maintien de session.',
      'idempotency-session',
      vi.fn(),
      { uploader, concurrency: 1, sessionKeepAliveIntervalMs: 1 },
    );

    expect(refreshAdminSession.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(refreshAdminSession.mock.invocationCallOrder[0])
      .toBeLessThan(finalize.mock.invocationCallOrder[0]!);
  });

  it('borne la concurrence, réessaie un fichier en échec et conserve l’ordre de finalisation', async () => {
    const files = Array.from({ length: 9 }, (_, index) => ({
      path: `assets/tile-${index}.fwtile`,
      file: new File([`tile-${index}`], `tile-${index}.fwtile`),
      contentType: 'application/vnd.fireviewer.tile',
    }));
    const prepared: PreparedSpatialPackage = {
      role: 'legacy_map',
      packageId: 'pkg-concurrent-r2',
      zoneId: ZONE_ID,
      revision: REVISION,
      assetCount: files.length,
      files,
      totalSizeBytes: files.reduce((total, item) => total + item.file.size, 0),
    };
    let active = 0;
    let maximumActive = 0;
    const attempts = new Map<string, number>();
    const uploader = vi.fn(async (pathname: string, file: File, options: Parameters<BlobUploader>[2]) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      const attempt = (attempts.get(pathname) ?? 0) + 1;
      attempts.set(pathname, attempt);
      await new Promise((resolve) => setTimeout(resolve, pathname.endsWith('tile-0.fwtile') ? 8 : 2));
      active -= 1;
      if (pathname.endsWith('tile-4.fwtile') && attempt === 1) throw new Error('coupure transitoire');
      options.onUploadProgress({ loaded: file.size, total: file.size, percentage: 100 });
      return { pathname, contentType: options.contentType };
    });
    const finalize = vi.fn().mockResolvedValue({ package_id: prepared.packageId, object_count: files.length });
    const api = {
      createSpatialPackageUploadGrant: vi.fn().mockResolvedValue({
        upload_id: UPLOAD_ID,
        pathname_prefix: `packages/${UPLOAD_ID}`,
        upload_grant: 'grant-signe',
        expires_at: '2026-07-14T11:00:00Z',
        maximum_file_size_bytes: 5_000_000_000,
        allowed_content_types: ['application/vnd.fireviewer.tile'],
      }),
      getBlobUploadTokenUrl: () => 'https://api.example.test/api/v1/admin/blob-upload-token',
      refreshAdminSession: vi.fn().mockResolvedValue(undefined),
      finalizeSpatialPackageFromBlob: finalize,
    } as unknown as AdminApiClient;

    await uploadPreparedSpatialPackage(
      api,
      ZONE_ID,
      REVISION,
      prepared,
      'Import concurrent contrôlé.',
      'idempotency-concurrent',
      vi.fn(),
      { uploader, concurrency: 3, uploadAttempts: 2, retryDelayMs: 0 },
    );

    expect(maximumActive).toBe(3);
    expect(attempts.get(`packages/${UPLOAD_ID}/assets/tile-4.fwtile`)).toBe(2);
    expect(finalize.mock.calls[0]?.[2].objects.map((item: { path: string }) => item.path))
      .toEqual(files.map((item) => item.path));
  });

  it('arrête le lot avec le chemin en erreur après épuisement des tentatives', async () => {
    const prepared: PreparedSpatialPackage = {
      role: 'legacy_map',
      packageId: 'pkg-failure-r2',
      zoneId: ZONE_ID,
      revision: REVISION,
      assetCount: 1,
      files: [{
        path: 'assets/broken.fwtile',
        file: new File(['broken'], 'broken.fwtile'),
        contentType: 'application/vnd.fireviewer.tile',
      }],
      totalSizeBytes: 6,
    };
    const api = {
      createSpatialPackageUploadGrant: vi.fn().mockResolvedValue({
        upload_id: UPLOAD_ID,
        pathname_prefix: `packages/${UPLOAD_ID}`,
        upload_grant: 'grant-signe',
      }),
      getBlobUploadTokenUrl: () => 'https://api.example.test/api/v1/admin/blob-upload-token',
      refreshAdminSession: vi.fn().mockResolvedValue(undefined),
      finalizeSpatialPackageFromBlob: vi.fn(),
    } as unknown as AdminApiClient;
    const uploader = vi.fn().mockRejectedValue(new Error('réseau indisponible'));

    await expect(uploadPreparedSpatialPackage(
      api,
      ZONE_ID,
      REVISION,
      prepared,
      'Import en échec contrôlé.',
      'idempotency-failure',
      vi.fn(),
      { uploader, concurrency: 2, uploadAttempts: 3, retryDelayMs: 0 },
    )).rejects.toThrow('assets/broken.fwtile après 3 tentatives');
    expect(uploader).toHaveBeenCalledTimes(3);
    expect(api.finalizeSpatialPackageFromBlob).not.toHaveBeenCalled();
  });

  it('réessaie uniquement la finalisation sans renvoyer les objets', async () => {
    const prepared: PreparedSpatialPackage = {
      role: 'legacy_map',
      packageId: 'pkg-finalization-r2',
      zoneId: ZONE_ID,
      revision: REVISION,
      assetCount: 1,
      files: [{
        path: 'assets/final.fwtile',
        file: new File(['final'], 'final.fwtile'),
        contentType: 'application/vnd.fireviewer.tile',
      }],
      totalSizeBytes: 5,
    };
    const finalize = vi.fn()
      .mockRejectedValueOnce(new Error('service momentanément indisponible'))
      .mockResolvedValue({ package_id: prepared.packageId, object_count: 1 });
    const api = {
      createSpatialPackageUploadGrant: vi.fn().mockResolvedValue({
        upload_id: UPLOAD_ID,
        pathname_prefix: `packages/${UPLOAD_ID}`,
        upload_grant: 'grant-signe',
      }),
      getBlobUploadTokenUrl: () => 'https://api.example.test/api/v1/admin/blob-upload-token',
      refreshAdminSession: vi.fn().mockResolvedValue(undefined),
      finalizeSpatialPackageFromBlob: finalize,
    } as unknown as AdminApiClient;
    const uploader = vi.fn(async (pathname: string, _file: File, options: Parameters<BlobUploader>[2]) => ({
      pathname,
      contentType: options.contentType,
    }));

    await uploadPreparedSpatialPackage(
      api,
      ZONE_ID,
      REVISION,
      prepared,
      'Finalisation résiliente.',
      'idempotency-finalization',
      vi.fn(),
      { uploader, finalizationAttempts: 2, finalizationRetryDelayMs: 0 },
    );

    expect(uploader).toHaveBeenCalledTimes(1);
    expect(finalize).toHaveBeenCalledTimes(2);
  });
});
