import { upload } from '@vercel/blob/client';

import {
  AdminApiError,
  type AdminApiClient,
  type AdminDailySatellitePackageResult,
  type AdminRequestOptions,
} from './adminApi';

const MANIFEST_FILENAME = 'fireviewer-satellite-manifest.json';
const SAFE_FILENAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,499}$/;

interface BlobUploadProgress {
  readonly percentage: number;
}

interface BlobUploadOptions {
  readonly access: 'private';
  readonly handleUploadUrl: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly clientPayload: string;
  readonly contentType: string;
  readonly multipart: true;
  readonly onUploadProgress: (progress: BlobUploadProgress) => void;
}

export type DailySatelliteBlobUploader = (
  pathname: string,
  file: File,
  options: BlobUploadOptions,
) => Promise<{ readonly pathname: string }>;

interface ManifestItemShape {
  readonly filename: string;
  readonly sha256: string;
}

function defaultUploader(pathname: string, file: File, options: BlobUploadOptions) {
  return upload(pathname, file, options);
}

function contentType(file: File): string {
  const suffix = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (suffix === '.json' || suffix === '.geojson') return 'application/json';
  if (suffix === '.tif' || suffix === '.tiff') return 'image/tiff';
  if (suffix === '.jpg' || suffix === '.jpeg') return 'image/jpeg';
  if (suffix === '.png') return 'image/png';
  return file.type;
}

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

async function validateManifest(
  files: readonly File[],
  expectedAnalysisWindowId: string,
): Promise<void> {
  const manifestFile = files.find((file) => file.name === MANIFEST_FILENAME);
  if (!manifestFile) {
    throw new AdminApiError(
      'configuration',
      `Le lot doit contenir ${MANIFEST_FILENAME}.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await manifestFile.text());
  } catch {
    throw new AdminApiError('configuration', 'Le manifeste quotidien n’est pas un JSON valide.');
  }
  if (
    !parsed
    || typeof parsed !== 'object'
    || Array.isArray(parsed)
    || (parsed as { schema_version?: unknown }).schema_version !== '1.0'
    || (parsed as { expected_analysis_window_id?: unknown }).expected_analysis_window_id
      !== expectedAnalysisWindowId
    || !Array.isArray((parsed as { items?: unknown }).items)
  ) {
    throw new AdminApiError(
      'configuration',
      'Le manifeste ne correspond pas à la journée active.',
    );
  }
  const declaredItems = (parsed as { items: unknown[] }).items;
  const items: ManifestItemShape[] = declaredItems.map((item) => {
    if (
      !item
      || typeof item !== 'object'
      || Array.isArray(item)
      || typeof (item as { filename?: unknown }).filename !== 'string'
      || typeof (item as { sha256?: unknown }).sha256 !== 'string'
      || !/^[a-f0-9]{64}$/.test((item as { sha256: string }).sha256)
    ) {
      throw new AdminApiError('configuration', 'Un produit déclaré dans le manifeste est invalide.');
    }
    return item as ManifestItemShape;
  });
  const products = files.filter((file) => file.name !== MANIFEST_FILENAME);
  const declaredNames = items.map((item) => item.filename);
  const actualNames = products.map((file) => file.name);
  if (
    new Set(declaredNames).size !== declaredNames.length
    || declaredNames.length !== actualNames.length
    || actualNames.some((name) => !declaredNames.includes(name))
  ) {
    throw new AdminApiError(
      'configuration',
      'Les fichiers choisis ne correspondent pas à l’inventaire du manifeste.',
    );
  }
  const computedHashes = await Promise.all(products.map((file) => sha256Hex(file)));
  for (const [index, file] of products.entries()) {
    const declared = items.find((item) => item.filename === file.name);
    if (!declared || declared.sha256 !== computedHashes[index]) {
      throw new AdminApiError(
        'configuration',
        `L’empreinte de ${file.name} ne correspond pas au manifeste.`,
      );
    }
  }
}

export async function uploadIncidentDailySatellitePackage(options: {
  readonly api: AdminApiClient;
  readonly fireId: string;
  readonly expectedAnalysisWindowId: string;
  readonly files: readonly File[];
  readonly requestOptions: AdminRequestOptions;
  readonly uploader?: DailySatelliteBlobUploader;
  readonly onProgress?: (percentage: number) => void;
}): Promise<AdminDailySatellitePackageResult> {
  const files = [...options.files];
  if (files.length < 2) {
    throw new AdminApiError(
      'configuration',
      'Choisissez le manifeste et au moins un produit satellite ou point chaud.',
    );
  }
  const filenames = files.map((file) => file.name);
  if (
    filenames.some((filename) => !SAFE_FILENAME_RE.test(filename))
    || new Set(filenames).size !== filenames.length
  ) {
    throw new AdminApiError(
      'configuration',
      'Les noms de fichiers doivent être simples, sûrs et uniques.',
    );
  }
  await validateManifest(files, options.expectedAnalysisWindowId);
  const totalSizeBytes = files.reduce((total, file) => total + file.size, 0);
  const opened = await options.api.openIncidentDailySatellitePackage(
    options.fireId,
    options.expectedAnalysisWindowId,
    files.length,
    totalSizeBytes,
    options.requestOptions,
  );
  for (const file of files) {
    const normalizedContentType = contentType(file);
    if (
      file.size > opened.maximum_file_size_bytes
      || !opened.allowed_content_types.includes(normalizedContentType)
    ) {
      throw new AdminApiError(
        'configuration',
        `Le fichier ${file.name} ne respecte pas les limites du stockage privé.`,
      );
    }
  }

  const progress = new Map(files.map((file) => [file.name, 0]));
  const uploadedFilenames = new Set(opened.already_uploaded_filenames);
  for (const file of files) {
    if (uploadedFilenames.has(file.name)) progress.set(file.name, 100);
  }
  const reportProgress = () => {
    const total = [...progress.values()].reduce((sum, value) => sum + value, 0);
    options.onProgress?.(Math.round(total / files.length));
  };
  reportProgress();
  const uploader = options.uploader ?? defaultUploader;
  await Promise.all(files.filter((file) => !uploadedFilenames.has(file.name)).map(async (file) => {
    const pathname = `${opened.pathname_prefix}/${file.name}`;
    const stored = await uploader(pathname, file, {
      access: 'private',
      handleUploadUrl: options.api.getBlobUploadTokenUrl(),
      headers: { 'X-Blob-Upload-Grant': opened.upload_grant },
      clientPayload: opened.package_id,
      contentType: contentType(file),
      multipart: true,
      onUploadProgress: ({ percentage }) => {
        progress.set(file.name, Math.max(0, Math.min(100, percentage)));
        reportProgress();
      },
    });
    if (stored.pathname !== pathname) {
      throw new AdminApiError(
        'parse',
        `Le stockage privé a retourné un chemin inattendu pour ${file.name}.`,
      );
    }
    progress.set(file.name, 100);
    reportProgress();
  }));

  return options.api.finalizeIncidentDailySatellitePackage(
    opened.package_id,
    options.requestOptions,
  );
}
