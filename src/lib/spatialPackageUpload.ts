import { upload } from '@vercel/blob/client';
import type {
  AdminApiClient,
  AdminBlobObjectReference,
  AdminBlobUploadGrant,
  AdminIncidentPerimeterPackageImport,
  AdminIncidentSpatialPackageImport,
  AdminSpatialPackageImport,
} from './adminApi';

const PACKAGE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{2,95}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const ASSET_PREFIXES = ['assets/', 'terrain/', 'vectors/'] as const;
const REQUIRED_PATHS = ['package-manifest.json', 'catalog.json'] as const;
const DEFAULT_UPLOAD_CONCURRENCY = 6;
const DEFAULT_UPLOAD_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 400;
const DEFAULT_FINALIZATION_ATTEMPTS = 4;
const DEFAULT_FINALIZATION_RETRY_DELAY_MS = 2_000;
const DEFAULT_SESSION_KEEP_ALIVE_INTERVAL_MS = 5 * 60 * 1_000;
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.glb': 'model/gltf-binary',
  '.fwtile': 'application/vnd.fireviewer.tile',
  '.fwterrain': 'application/vnd.fireviewer.terrain',
  '.usd': 'model/vnd.usd',
  '.usda': 'model/vnd.usd',
  '.usdc': 'model/vnd.usd',
  '.usdz': 'model/vnd.usdz+zip',
  '.hdr': 'image/vnd.radiance',
  '.npz': 'application/octet-stream',
  '.jgw': 'text/plain',
};

interface CatalogAsset {
  readonly path: string;
  readonly sha256: string;
  readonly sizeBytes: number;
}

export interface PreparedPackageFile {
  readonly path: string;
  readonly file: File;
  readonly contentType: string;
}

export interface PreparedSpatialPackage {
  readonly role: 'legacy_map' | 'omniverse_map' | 'omniverse_perimeter';
  readonly packageId: string;
  readonly zoneId: string;
  readonly revision: number;
  readonly files: readonly PreparedPackageFile[];
  readonly totalSizeBytes: number;
  readonly assetCount: number;
  readonly baseMapPackageId?: string;
  readonly stateCount?: number;
}

export interface SpatialPackageUploadProgress {
  readonly phase: 'uploading' | 'finalizing';
  readonly fileIndex: number;
  readonly fileCount: number;
  readonly currentPath: string | null;
  readonly uploadedBytes: number;
  readonly totalSizeBytes: number;
  readonly percentage: number;
}

interface BlobUploadOptions {
  readonly access: 'private';
  readonly handleUploadUrl: string;
  readonly headers: Record<string, string>;
  readonly clientPayload: string;
  readonly contentType: string;
  readonly multipart: true;
  readonly abortSignal?: AbortSignal;
  readonly onUploadProgress: (event: { loaded: number; total: number; percentage: number }) => void;
}

export type BlobUploader = (
  pathname: string,
  file: File,
  options: BlobUploadOptions,
) => Promise<{ readonly pathname: string; readonly contentType: string }>;

function extension(path: string): string {
  const index = path.lastIndexOf('.');
  return index < 0 ? '' : path.slice(index).toLowerCase();
}

function contentType(path: string): string {
  const result = CONTENT_TYPES[extension(path)];
  if (!result) throw new Error(`Type de fichier non pris en charge : ${path}`);
  return result;
}

function safePath(value: string): string {
  const normalized = value.replace(/^\.\//, '');
  if (
    !normalized
    || normalized.startsWith('/')
    || normalized.includes('\\')
    || normalized.includes('\0')
    || normalized.includes('?')
    || normalized.includes('#')
    || normalized.includes(':')
    || normalized.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error(`Chemin de package interdit : ${value || '(vide)'}`);
  }
  return normalized;
}

function selectedPath(file: File): string {
  const relative = file.webkitRelativePath || file.name;
  return safePath(relative);
}

function commonRoot(paths: readonly string[]): string | null {
  if (paths.length === 0 || paths.some((path) => !path.includes('/'))) return null;
  const root = paths[0]!.split('/')[0]!;
  return paths.every((path) => path.startsWith(`${root}/`)) ? root : null;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} doit contenir un objet JSON.`);
  }
  return value as Record<string, unknown>;
}

async function readJson(file: File, label: string): Promise<Record<string, unknown>> {
  try {
    return asRecord(JSON.parse(await file.text()), label);
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`${label} n’est pas un JSON valide.`);
    throw error;
  }
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || typeof value !== 'number' || value <= 0) {
    throw new Error(`${label} doit être un entier positif.`);
  }
  return value;
}

function digest(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256_RE.test(value)) {
    throw new Error(`${label} ne contient pas une empreinte SHA-256 valide.`);
  }
  return value;
}

function collectCatalogAssets(catalog: Record<string, unknown>): CatalogAsset[] {
  const entries: CatalogAsset[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    const pathValue = record.path;
    if (typeof pathValue === 'string' && ASSET_PREFIXES.some((prefix) => pathValue.startsWith(prefix))) {
      const path = safePath(pathValue);
      contentType(path);
      entries.push({
        path,
        sha256: digest(record.sha256, `Empreinte de ${path}`),
        sizeBytes: positiveInteger(record.byte_count ?? record.size_bytes, `Taille de ${path}`),
      });
    }
    Object.values(record).forEach(visit);
  };
  visit(catalog);
  if (entries.length === 0) throw new Error('catalog.json ne déclare aucun asset spatial pris en charge.');
  const paths = entries.map((entry) => entry.path);
  if (new Set(paths).size !== paths.length) throw new Error('catalog.json déclare un chemin plusieurs fois.');
  return entries;
}

async function sha256Hex(file: File): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function mapSelectedFiles(files: readonly File[], expectedPaths: readonly string[]): Map<string, File> {
  const selected = files.map((file) => ({ file, path: selectedPath(file) }));
  const root = commonRoot(selected.map((item) => item.path));
  const expectedByBasename = new Map<string, string[]>();
  for (const path of expectedPaths) {
    const basename = path.split('/').at(-1)!;
    expectedByBasename.set(basename, [...(expectedByBasename.get(basename) ?? []), path]);
  }
  const mapped = new Map<string, File>();
  for (const item of selected) {
    let path = root ? item.path.slice(root.length + 1) : item.path;
    if (!path.includes('/')) {
      const matches = expectedByBasename.get(path) ?? [];
      if (matches.length === 1) path = matches[0]!;
    }
    path = safePath(path);
    if (!expectedPaths.includes(path)) throw new Error(`Fichier supplémentaire non déclaré : ${path}`);
    if (mapped.has(path)) throw new Error(`Fichier sélectionné plusieurs fois : ${path}`);
    mapped.set(path, item.file);
  }
  return mapped;
}

async function prepareLegacySpatialPackage(
  selectedFiles: FileList | readonly File[],
  expectedZoneId?: string,
  expectedRevision?: number,
): Promise<PreparedSpatialPackage> {
  const files = Array.from(selectedFiles);
  if (files.length < 3) throw new Error('Le dossier doit contenir le manifeste, le catalogue et au moins un asset.');

  const initiallySelected = files.map((file) => ({ file, path: selectedPath(file) }));
  const root = commonRoot(initiallySelected.map((item) => item.path));
  const metadataByName = new Map<string, File>();
  for (const item of initiallySelected) {
    const path = root ? item.path.slice(root.length + 1) : item.path;
    if (REQUIRED_PATHS.includes(path as (typeof REQUIRED_PATHS)[number])) metadataByName.set(path, item.file);
    else if (!path.includes('/') && REQUIRED_PATHS.includes(item.file.name as (typeof REQUIRED_PATHS)[number])) metadataByName.set(item.file.name, item.file);
  }
  const manifestFile = metadataByName.get('package-manifest.json');
  const catalogFile = metadataByName.get('catalog.json');
  if (!manifestFile || !catalogFile) {
    throw new Error('Le dossier doit contenir package-manifest.json et catalog.json à sa racine.');
  }

  const [manifest, catalog] = await Promise.all([
    readJson(manifestFile, 'package-manifest.json'),
    readJson(catalogFile, 'catalog.json'),
  ]);
  const packageId = manifest.package_id;
  if (typeof packageId !== 'string' || !PACKAGE_ID_RE.test(packageId)) {
    throw new Error('package-manifest.json contient un package_id invalide.');
  }
  const catalogReference = asRecord(manifest.catalog, 'Référence catalog.json');
  if (catalogReference.path !== 'catalog.json') {
    throw new Error('package-manifest.json doit référencer catalog.json.');
  }
  if (positiveInteger(catalogReference.byte_count, 'Taille de catalog.json') !== catalogFile.size) {
    throw new Error('La taille de catalog.json diffère du manifeste.');
  }
  if (digest(catalogReference.sha256, 'Empreinte de catalog.json') !== await sha256Hex(catalogFile)) {
    throw new Error('L’empreinte de catalog.json diffère du manifeste.');
  }
  const declaredTargets = Array.isArray(manifest.zones) ? manifest.zones.flatMap((zone) => {
    if (!zone || typeof zone !== 'object') return [];
    const record = zone as Record<string, unknown>;
    if (typeof record.zone_id !== 'string' || !/^[A-Z][A-Z0-9-]{2,63}$/.test(record.zone_id) || typeof record.revision_id !== 'string' || !/^R[1-9][0-9]*$/.test(record.revision_id)) return [];
    return [{ zoneId: record.zone_id, revision: Number(record.revision_id.slice(1)) }];
  }) : [];
  if (declaredTargets.length !== 1) {
    throw new Error('Le manifeste doit déclarer exactement une carte et une version technique.');
  }
  const target = declaredTargets[0]!;
  if ((expectedZoneId === undefined) !== (expectedRevision === undefined)) {
    throw new Error('La cible technique attendue est incomplète.');
  }
  if (expectedZoneId !== undefined && (target.zoneId !== expectedZoneId || target.revision !== expectedRevision)) {
    throw new Error('Le manifeste ne cible pas cette carte et cette version technique.');
  }

  const assets = collectCatalogAssets(catalog);
  const expectedPaths = [...REQUIRED_PATHS, ...assets.map((asset) => asset.path)];
  const mapped = mapSelectedFiles(files, expectedPaths);
  const missing = expectedPaths.filter((path) => !mapped.has(path));
  if (missing.length) throw new Error(`Fichier déclaré absent : ${missing[0]}`);
  for (const asset of assets) {
    if (mapped.get(asset.path)!.size !== asset.sizeBytes) {
      throw new Error(`La taille de ${asset.path} diffère de catalog.json.`);
    }
  }
  const preparedFiles = expectedPaths.map((path) => ({
    path,
    file: mapped.get(path)!,
    contentType: contentType(path),
  }));
  return {
    role: 'legacy_map',
    packageId,
    zoneId: target.zoneId,
    revision: target.revision,
    files: preparedFiles,
    totalSizeBytes: preparedFiles.reduce((total, item) => total + item.file.size, 0),
    assetCount: assets.length,
  };
}

interface OmniverseInventoryEntry {
  readonly path: string;
  readonly sha256: string;
  readonly sizeBytes: number;
}

function selectedRootFiles(files: readonly File[]): Map<string, File> {
  const selected = files.map((file) => ({ file, path: selectedPath(file) }));
  const root = commonRoot(selected.map((item) => item.path));
  return new Map(selected.map((item) => [root ? item.path.slice(root.length + 1) : item.path, item.file]));
}

function omniverseInventory(document: Record<string, unknown>): readonly OmniverseInventoryEntry[] {
  if (!Array.isArray(document.files) || document.files.length === 0 || document.file_count !== document.files.length) {
    throw new Error('dependency-inventory.json ne décrit pas un inventaire complet.');
  }
  const entries = document.files.map((value) => {
    const item = asRecord(value, 'Entrée de dependency-inventory.json');
    const path = safePath(typeof item.path === 'string' ? item.path : '');
    contentType(path);
    return {
      path,
      sha256: digest(item.sha256, `Empreinte de ${path}`),
      sizeBytes: positiveInteger(item.byte_count, `Taille de ${path}`),
    };
  });
  if (new Set(entries.map((item) => item.path)).size !== entries.length) {
    throw new Error('dependency-inventory.json déclare un chemin plusieurs fois.');
  }
  return entries;
}

async function prepareOmniverseSpatialPackage(
  files: readonly File[],
  expectedZoneId?: string,
  expectedRevision?: number,
): Promise<PreparedSpatialPackage> {
  const roots = selectedRootFiles(files);
  const manifestFile = roots.get('manifest.json');
  const inventoryFile = roots.get('dependency-inventory.json');
  const mapContractFile = roots.get('contracts/map-contract.json');
  const perimeterContractFile = roots.get('contracts/perimeter-contract.json');
  if (!manifestFile || !inventoryFile || Number(Boolean(mapContractFile)) + Number(Boolean(perimeterContractFile)) !== 1) {
    throw new Error('Le package OpenUSD doit contenir son manifeste, son inventaire et un seul contrat de rôle.');
  }
  const contractFile = mapContractFile ?? perimeterContractFile!;
  const contractPath = mapContractFile ? 'contracts/map-contract.json' : 'contracts/perimeter-contract.json';
  const role = mapContractFile ? 'omniverse_map' as const : 'omniverse_perimeter' as const;
  const [manifest, inventory, contract] = await Promise.all([
    readJson(manifestFile, 'manifest.json'),
    readJson(inventoryFile, 'dependency-inventory.json'),
    readJson(contractFile, contractPath),
  ]);
  const inventoryReference = asRecord(manifest.dependency_inventory, 'Référence de dependency-inventory.json');
  if (
    inventoryReference.path !== 'dependency-inventory.json'
    || digest(inventoryReference.sha256, 'Empreinte de dependency-inventory.json') !== await sha256Hex(inventoryFile)
  ) {
    throw new Error('dependency-inventory.json ne correspond pas au manifeste.');
  }
  const entries = omniverseInventory(inventory);
  if (inventoryReference.file_count !== entries.length) {
    throw new Error('Le nombre de dépendances diffère entre le manifeste et l’inventaire.');
  }
  const expectedPaths = ['manifest.json', 'dependency-inventory.json', contractPath, ...entries.map((item) => item.path)];
  const mapped = mapSelectedFiles(files, expectedPaths);
  const missing = expectedPaths.filter((path) => !mapped.has(path));
  if (missing.length) throw new Error(`Fichier déclaré absent : ${missing[0]}`);
  for (const entry of entries) {
    if (mapped.get(entry.path)!.size !== entry.sizeBytes) {
      throw new Error(`La taille de ${entry.path} diffère de dependency-inventory.json.`);
    }
  }
  if (contract.contract_status !== 'active' || manifest.status !== 'active') {
    throw new Error('Seul un contrat OpenUSD actif peut être importé.');
  }

  let packageId: string;
  let zoneId: string;
  let revision: number;
  let baseMapPackageId: string | undefined;
  let stateCount: number | undefined;
  let entryPath: string;
  let entrySha256: string;
  const manifestHash = await sha256Hex(manifestFile);

  if (role === 'omniverse_map') {
    if (contract.schema !== 'fireviewer.omniverse-map-upload-contract.v1' || manifest.schema !== 'fireviewer.omniverse-pure-map-package.v1') {
      throw new Error('Le contrat de carte Omniverse est incompatible.');
    }
    const packageRecord = asRecord(contract.package, 'Contrat de package carte');
    const release = asRecord(contract.release, 'Décision de publication carte');
    packageId = typeof packageRecord.package_id === 'string' ? packageRecord.package_id : '';
    revision = positiveInteger(packageRecord.revision, 'Révision de carte');
    entryPath = typeof packageRecord.entry_stage === 'string' ? safePath(packageRecord.entry_stage) : '';
    entrySha256 = digest(packageRecord.entry_stage_sha256, 'Empreinte de map.usda');
    if (
      release.upload_allowed !== true
      || release.automatic_publication !== false
      || packageRecord.manifest_sha256 !== manifestHash
      || manifest.package_id !== packageId
      || manifest.revision !== revision
      || manifest.entry_stage !== packageRecord.entry_stage
      || manifest.entry_stage_sha256 !== packageRecord.entry_stage_sha256
    ) {
      throw new Error('Le manifeste et le contrat de carte Omniverse ne correspondent pas.');
    }
    const sourceManifestFile = mapped.get('source-usd/source/package-manifest.json');
    if (!sourceManifestFile) throw new Error('Le manifeste de la carte source est absent.');
    const sourceManifest = await readJson(sourceManifestFile, 'source-usd/source/package-manifest.json');
    if (!Array.isArray(sourceManifest.zones) || sourceManifest.zones.length !== 1) {
      throw new Error('Le package doit déclarer exactement une zone source.');
    }
    const sourceZone = asRecord(sourceManifest.zones[0], 'Zone source');
    if (typeof sourceZone.zone_id !== 'string' || !/^[A-Z][A-Z0-9-]{2,63}$/.test(sourceZone.zone_id)) {
      throw new Error('La zone source du package est invalide.');
    }
    zoneId = sourceZone.zone_id;
    if (expectedZoneId !== undefined && (zoneId !== expectedZoneId || revision !== expectedRevision)) {
      throw new Error('La carte Omniverse ne cible pas cette zone et cette révision.');
    }
  } else {
    if (contract.schema !== 'fireviewer.omniverse-progressive-perimeter-layer-contract.v1' || manifest.schema !== 'fireviewer.omniverse-progressive-perimeter-package.v1') {
      throw new Error('Le contrat de périmètres Omniverse est incompatible.');
    }
    if (expectedZoneId === undefined || expectedRevision === undefined) {
      throw new Error('Le package de périmètres doit être sélectionné depuis un projet possédant sa carte Omniverse.');
    }
    const packageRecord = asRecord(contract.layer_package, 'Contrat du calque de périmètres');
    const release = asRecord(contract.release, 'Décision de rattachement des périmètres');
    const baseMap = asRecord(contract.base_map, 'Carte de rattachement');
    const progression = asRecord(contract.progression, 'Progression des périmètres');
    packageId = typeof packageRecord.layer_package_id === 'string' ? packageRecord.layer_package_id : '';
    entryPath = typeof packageRecord.entry_layer === 'string' ? safePath(packageRecord.entry_layer) : '';
    entrySha256 = digest(packageRecord.entry_layer_sha256, 'Empreinte du calque USD');
    zoneId = expectedZoneId;
    revision = expectedRevision;
    baseMapPackageId = typeof baseMap.package_id === 'string' ? baseMap.package_id : undefined;
    stateCount = positiveInteger(progression.state_count, 'Nombre d’états temporels');
    if (
      release.layer_attachment_allowed !== true
      || release.automatic_publication !== false
      || packageRecord.manifest_sha256 !== manifestHash
      || manifest.layer_package_id !== packageId
      || manifest.entry_layer !== packageRecord.entry_layer
      || manifest.entry_layer_sha256 !== packageRecord.entry_layer_sha256
      || baseMap.revision !== revision
      || progression.layer_crs !== 'EPSG:2154'
    ) {
      throw new Error('Le manifeste de périmètres ne correspond pas à la carte active.');
    }
  }
  if (!PACKAGE_ID_RE.test(packageId)) throw new Error('Le package OpenUSD contient un identifiant invalide.');
  const entry = entries.find((item) => item.path === entryPath);
  if (!entry || entry.sha256 !== entrySha256) {
    throw new Error('Le stage OpenUSD principal ne correspond pas à l’inventaire.');
  }
  const preparedFiles = expectedPaths.map((path) => ({
    path,
    file: mapped.get(path)!,
    contentType: contentType(path),
  }));
  return {
    role,
    packageId,
    zoneId,
    revision,
    files: preparedFiles,
    totalSizeBytes: preparedFiles.reduce((total, item) => total + item.file.size, 0),
    assetCount: entries.length,
    baseMapPackageId,
    stateCount,
  };
}

export async function prepareSpatialPackage(
  selectedFiles: FileList | readonly File[],
  expectedZoneId?: string,
  expectedRevision?: number,
): Promise<PreparedSpatialPackage> {
  const files = Array.from(selectedFiles);
  const roots = selectedRootFiles(files);
  if (roots.has('manifest.json') || roots.has('dependency-inventory.json')) {
    return prepareOmniverseSpatialPackage(files, expectedZoneId, expectedRevision);
  }
  return prepareLegacySpatialPackage(files, expectedZoneId, expectedRevision);
}

function defaultUploader(pathname: string, file: File, options: BlobUploadOptions) {
  return upload(pathname, file, options);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'erreur réseau inconnue';
}

async function retryDelay(delayMs: number, attempt: number, signal?: AbortSignal): Promise<void> {
  if (delayMs <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(resolve, delayMs * attempt);
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timeout);
      reject(new DOMException('Upload annulé.', 'AbortError'));
    }, { once: true });
  });
}

export async function uploadPreparedSpatialPackage(
  api: AdminApiClient,
  zoneId: string,
  revision: number,
  prepared: PreparedSpatialPackage,
  reason: string,
  idempotencyKey: string,
  onProgress: (progress: SpatialPackageUploadProgress) => void,
  options: {
    readonly signal?: AbortSignal;
    readonly uploader?: BlobUploader;
    readonly concurrency?: number;
    readonly uploadAttempts?: number;
    readonly retryDelayMs?: number;
    readonly finalizationAttempts?: number;
    readonly finalizationRetryDelayMs?: number;
    readonly sessionKeepAliveIntervalMs?: number;
    readonly incidentTarget?: {
      readonly fireId: string;
      readonly expectedIncidentVersion: number;
    };
  } = {},
): Promise<AdminSpatialPackageImport | AdminIncidentSpatialPackageImport | AdminIncidentPerimeterPackageImport> {
  const grantInput = {
    package_id: prepared.packageId,
    file_count: prepared.files.length,
    total_size_bytes: prepared.totalSizeBytes,
  };
  const grant: AdminBlobUploadGrant = options.incidentTarget
    ? await api.createIncidentSpatialPackageUploadGrant(
      options.incidentTarget.fireId,
      grantInput,
      { signal: options.signal },
    )
    : await api.createSpatialPackageUploadGrant(
      zoneId,
      revision,
      grantInput,
      { signal: options.signal },
    );
  const uploader = options.uploader ?? defaultUploader;
  const concurrency = Math.max(1, Math.min(8, Math.trunc(options.concurrency ?? DEFAULT_UPLOAD_CONCURRENCY)));
  const uploadAttempts = Math.max(1, Math.min(5, Math.trunc(options.uploadAttempts ?? DEFAULT_UPLOAD_ATTEMPTS)));
  const retryDelayMs = Math.max(0, Math.trunc(options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS));
  const finalizationAttempts = Math.max(
    1,
    Math.min(6, Math.trunc(options.finalizationAttempts ?? DEFAULT_FINALIZATION_ATTEMPTS)),
  );
  const finalizationRetryDelayMs = Math.max(
    0,
    Math.trunc(options.finalizationRetryDelayMs ?? DEFAULT_FINALIZATION_RETRY_DELAY_MS),
  );
  const sessionKeepAliveIntervalMs = Math.max(
    1,
    Math.min(
      10 * 60 * 1_000,
      Math.trunc(
        options.sessionKeepAliveIntervalMs ?? DEFAULT_SESSION_KEEP_ALIVE_INTERVAL_MS,
      ),
    ),
  );
  let nextSessionKeepAliveAt = Date.now() + sessionKeepAliveIntervalMs;
  let sessionKeepAlivePromise: Promise<void> | null = null;
  const keepAdminSessionAlive = async (force = false): Promise<void> => {
    if (!force && Date.now() < nextSessionKeepAliveAt) return;
    if (!sessionKeepAlivePromise) {
      nextSessionKeepAliveAt = Date.now() + sessionKeepAliveIntervalMs;
      sessionKeepAlivePromise = api.refreshAdminSession({ signal: options.signal })
        .finally(() => {
          sessionKeepAlivePromise = null;
        });
    }
    await sessionKeepAlivePromise;
  };
  const uploaded = new Array<AdminBlobObjectReference | undefined>(prepared.files.length);
  const inFlightBytes = new Array<number>(prepared.files.length).fill(0);
  let uploadedBytes = 0;
  let completedCount = 0;
  let nextIndex = 0;
  let terminalError: unknown = null;

  const emitProgress = (index: number, path: string): void => {
    const boundedBytes = Math.min(prepared.totalSizeBytes, uploadedBytes);
    onProgress({
      phase: 'uploading',
      fileIndex: completedCount,
      fileCount: prepared.files.length,
      currentPath: path,
      uploadedBytes: boundedBytes,
      totalSizeBytes: prepared.totalSizeBytes,
      percentage: Math.round((boundedBytes / prepared.totalSizeBytes) * 100),
    });
  };

  const uploadOne = async (index: number): Promise<void> => {
    const item = prepared.files[index]!;
    const pathname = `${grant.pathname_prefix}/${item.path}`;
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= uploadAttempts; attempt += 1) {
      if (options.signal?.aborted) throw new DOMException('Upload annulé.', 'AbortError');
      if (inFlightBytes[index]) {
        uploadedBytes -= inFlightBytes[index]!;
        inFlightBytes[index] = 0;
        emitProgress(index, item.path);
      }
      try {
        const result = await uploader(pathname, item.file, {
          access: 'private',
          handleUploadUrl: api.getBlobUploadTokenUrl(),
          headers: { 'X-Blob-Upload-Grant': grant.upload_grant },
          clientPayload: prepared.packageId,
          contentType: item.contentType,
          multipart: true,
          abortSignal: options.signal,
          onUploadProgress: ({ loaded }) => {
            const boundedLoaded = Math.max(0, Math.min(item.file.size, loaded));
            uploadedBytes += boundedLoaded - inFlightBytes[index]!;
            inFlightBytes[index] = boundedLoaded;
            emitProgress(index, item.path);
          },
        });
        if (result.pathname !== pathname || result.contentType !== item.contentType) {
          throw new Error(`Vercel Blob a retourné des métadonnées inattendues pour ${item.path}.`);
        }
        uploadedBytes += item.file.size - inFlightBytes[index]!;
        inFlightBytes[index] = item.file.size;
        uploaded[index] = {
          path: item.path,
          pathname: result.pathname,
          size_bytes: item.file.size,
          content_type: item.contentType,
        };
        completedCount += 1;
        emitProgress(index, item.path);
        break;
      } catch (error) {
        lastError = error;
        if (isAbortError(error) || attempt === uploadAttempts) break;
        await retryDelay(retryDelayMs, attempt, options.signal);
      }
    }
    if (uploaded[index]) {
      await keepAdminSessionAlive();
      return;
    }
    if (isAbortError(lastError)) throw lastError;
    throw new Error(
      `Échec de l’envoi de ${item.path} après ${uploadAttempts} tentatives : ${errorMessage(lastError)}.`,
      { cause: lastError },
    );
  };

  const worker = async (): Promise<void> => {
    while (terminalError === null) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= prepared.files.length) return;
      try {
        await uploadOne(index);
      } catch (error) {
        terminalError = error;
      }
    }
  };

  await Promise.all(Array.from(
    { length: Math.min(concurrency, prepared.files.length) },
    () => worker(),
  ));
  if (terminalError !== null) throw terminalError;
  await keepAdminSessionAlive(true);
  const finalizedObjects = uploaded.map((item, index) => {
    if (!item) throw new Error(`Objet uploadé manquant : ${prepared.files[index]!.path}.`);
    return item;
  });
  onProgress({
    phase: 'finalizing',
    fileIndex: prepared.files.length,
    fileCount: prepared.files.length,
    currentPath: null,
    uploadedBytes: prepared.totalSizeBytes,
    totalSizeBytes: prepared.totalSizeBytes,
    percentage: 100,
  });
  let finalizationError: unknown = null;
  for (let attempt = 1; attempt <= finalizationAttempts; attempt += 1) {
    try {
      if (options.incidentTarget) {
        const finalize = prepared.role === 'omniverse_perimeter'
          ? api.finalizeIncidentPerimeterPackageFromBlob.bind(api)
          : api.finalizeIncidentSpatialPackageFromBlob.bind(api);
        return await finalize(
          options.incidentTarget.fireId,
          {
            upload_id: grant.upload_id,
            package_id: prepared.packageId,
            zone_id: prepared.zoneId,
            revision: prepared.revision,
            expected_incident_version: options.incidentTarget.expectedIncidentVersion,
            primary_profile: 'local',
            reason,
            objects: finalizedObjects,
          },
          { idempotencyKey, signal: options.signal },
        );
      }
      return await api.finalizeSpatialPackageFromBlob(
        zoneId,
        revision,
        {
          upload_id: grant.upload_id,
          package_id: prepared.packageId,
          reason,
          objects: finalizedObjects,
        },
        { idempotencyKey, signal: options.signal },
      );
    } catch (error) {
      finalizationError = error;
      if (isAbortError(error) || attempt === finalizationAttempts) break;
      await retryDelay(finalizationRetryDelayMs, attempt, options.signal);
    }
  }
  if (isAbortError(finalizationError)) throw finalizationError;
  throw new Error(
    `Finalisation du package impossible après ${finalizationAttempts} tentatives : ${errorMessage(finalizationError)}.`,
    { cause: finalizationError },
  );
}

export async function uploadPreparedIncidentSpatialPackage(
  api: AdminApiClient,
  fireId: string,
  expectedIncidentVersion: number,
  prepared: PreparedSpatialPackage,
  reason: string,
  idempotencyKey: string,
  onProgress: (progress: SpatialPackageUploadProgress) => void,
  options: Omit<NonNullable<Parameters<typeof uploadPreparedSpatialPackage>[7]>, 'incidentTarget'> = {},
): Promise<AdminIncidentSpatialPackageImport> {
  if (prepared.role === 'omniverse_perimeter') {
    throw new Error('Le package de périmètres doit utiliser son import séparé.');
  }
  const result = await uploadPreparedSpatialPackage(
    api,
    prepared.zoneId,
    prepared.revision,
    prepared,
    reason,
    idempotencyKey,
    onProgress,
    { ...options, incidentTarget: { fireId, expectedIncidentVersion } },
  );
  if (!('manifest_revision' in result)) throw new Error('La carte finalisée n’a pas été rattachée au projet.');
  return result;
}

export async function uploadPreparedIncidentPerimeterPackage(
  api: AdminApiClient,
  fireId: string,
  expectedIncidentVersion: number,
  prepared: PreparedSpatialPackage,
  reason: string,
  idempotencyKey: string,
  onProgress: (progress: SpatialPackageUploadProgress) => void,
  options: Omit<NonNullable<Parameters<typeof uploadPreparedSpatialPackage>[7]>, 'incidentTarget'> = {},
): Promise<AdminIncidentPerimeterPackageImport> {
  if (prepared.role !== 'omniverse_perimeter') {
    throw new Error('Le second import attend un package USD temporel de périmètres.');
  }
  const result = await uploadPreparedSpatialPackage(
    api,
    prepared.zoneId,
    prepared.revision,
    prepared,
    reason,
    idempotencyKey,
    onProgress,
    { ...options, incidentTarget: { fireId, expectedIncidentVersion } },
  );
  if (!('base_map_package_id' in result)) {
    throw new Error('Les périmètres finalisés n’ont pas été rattachés à la carte du projet.');
  }
  return result;
}
