import {
  getViewerManifestApiOrigin,
  type ViewerManifestEnvironment,
} from './manifestClient';
import {
  parseViewerManifestScene,
  VIEWER_MANIFEST_FIRE_ID_RE,
  type ViewerManifestScene,
} from './viewerManifest';

export interface PublicSpatialSceneLoadOptions {
  readonly environment?: ViewerManifestEnvironment;
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal;
}

export class PublicSpatialSceneError extends Error {
  constructor(readonly status: number | null, message: string) {
    super(message);
    this.name = 'PublicSpatialSceneError';
  }
}

export async function loadPublicSpatialScene(
  fireId: string,
  options: PublicSpatialSceneLoadOptions = {},
): Promise<ViewerManifestScene> {
  const origin = getViewerManifestApiOrigin(options.environment);
  if (!origin || !VIEWER_MANIFEST_FIRE_ID_RE.test(fireId)) {
    throw new PublicSpatialSceneError(null, 'La scène 3D publique n’est pas configurée.');
  }
  const response = await (options.fetchImpl ?? fetch)(
    `${origin}/api/v1/incident/${encodeURIComponent(fireId)}/spatial-scene/bootstrap`,
    { cache: 'no-store', credentials: 'omit', signal: options.signal },
  );
  if (!response.ok) {
    throw new PublicSpatialSceneError(response.status, 'La scène 3D publique est indisponible.');
  }
  try {
    const scene = parseViewerManifestScene(await response.json());
    if (!scene || scene.files.length === 0) {
      throw new PublicSpatialSceneError(null, 'La scène 3D publique ne contient aucun fichier.');
    }
    return scene;
  } catch (error) {
    if (error instanceof PublicSpatialSceneError) throw error;
    throw new PublicSpatialSceneError(null, 'La scène 3D publique est invalide.');
  }
}
