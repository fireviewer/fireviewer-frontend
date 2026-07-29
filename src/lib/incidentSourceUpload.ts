import { upload } from '@vercel/blob/client';

import {
  AdminApiError,
  type AdminApiClient,
  type AdminIncidentSourcePackageResult,
  type AdminRequestOptions,
} from './adminApi';

const SAFE_FILENAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,499}$/;
const MAX_CONCURRENT_UPLOADS = 4;

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

export type IncidentSourceBlobUploader = (
  pathname: string,
  file: File,
  options: BlobUploadOptions,
) => Promise<{ readonly pathname: string }>;

function defaultUploader(pathname: string, file: File, options: BlobUploadOptions) {
  return upload(pathname, file, options);
}

function contentType(file: File): string {
  const suffix = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  const bySuffix: Readonly<Record<string, string>> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.html': 'text/html',
    '.htm': 'text/html',
  };
  return bySuffix[suffix] ?? '';
}

export async function uploadIncidentSourcePackage(options: {
  readonly api: AdminApiClient;
  readonly fireId: string;
  readonly files: readonly File[];
  readonly requestOptions: AdminRequestOptions;
  readonly uploader?: IncidentSourceBlobUploader;
  readonly onProgress?: (percentage: number) => void;
}): Promise<AdminIncidentSourcePackageResult> {
  const files = [...options.files];
  if (files.length === 0) {
    throw new AdminApiError('configuration', 'Choisissez au moins un fichier source.');
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
  const normalizedContentTypes = new Map(files.map((file) => [file.name, contentType(file)]));
  const unsupported = files.find((file) => !normalizedContentTypes.get(file.name));
  if (unsupported) {
    throw new AdminApiError(
      'configuration',
      `Le fichier ${unsupported.name} doit être envoyé par le parcours satellite quotidien ou utilise un format non pris en charge.`,
    );
  }
  const totalSizeBytes = files.reduce((total, file) => total + file.size, 0);
  const opened = await options.api.openIncidentSourcePackage(
    options.fireId,
    files.length,
    totalSizeBytes,
    options.requestOptions,
  );
  for (const file of files) {
    const normalizedContentType = normalizedContentTypes.get(file.name) ?? '';
    if (
      !normalizedContentType
      || file.size > opened.maximum_file_size_bytes
      || !opened.allowed_content_types.includes(normalizedContentType)
    ) {
      throw new AdminApiError(
        'configuration',
        `Le fichier ${file.name} ne respecte pas les formats ou limites du stockage privé.`,
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
  let nextIndex = 0;
  const pendingFiles = files.filter((file) => !uploadedFilenames.has(file.name));
  const uploadNext = async (): Promise<void> => {
    while (nextIndex < pendingFiles.length) {
      const file = pendingFiles[nextIndex];
      nextIndex += 1;
      if (!file) return;
      const pathname = `${opened.pathname_prefix}/${file.name}`;
      const stored = await uploader(pathname, file, {
        access: 'private',
        handleUploadUrl: options.api.getBlobUploadTokenUrl(),
        headers: { 'X-Blob-Upload-Grant': opened.upload_grant },
        clientPayload: opened.package_id,
        contentType: normalizedContentTypes.get(file.name) ?? file.type,
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
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(MAX_CONCURRENT_UPLOADS, pendingFiles.length) },
      () => uploadNext(),
    ),
  );

  return options.api.finalizeIncidentSourcePackage(
    opened.package_id,
    options.requestOptions,
  );
}
