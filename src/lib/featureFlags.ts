export type FireViewerFeatureFlag =
  | 'FV_EVENT_V2_ENABLED'
  | 'FV_SUPABASE_AUTH_ENABLED'
  | 'FV_OFFICIAL_CONNECTORS_ENABLED'
  | 'FV_AGENT_EVENT_PIPELINE_ENABLED'
  | 'FV_3D_PRIMARY_ENABLED'
  | 'FV_V2_PUBLICATION_ENABLED';

type FeatureEnvironment = Readonly<Record<string, unknown>>;

function runtimeEnvironment(): FeatureEnvironment {
  return import.meta.env as FeatureEnvironment;
}

/**
 * Les flags backend gardent leur nom canonique `FV_*`. Vite n'expose au
 * navigateur que les variables préfixées `VITE_`, d'où l'alias explicite.
 * Toute valeur absente ou différente de la chaîne exacte `true` échoue fermée.
 */
export function isFeatureEnabled(
  name: FireViewerFeatureFlag,
  environment: FeatureEnvironment = runtimeEnvironment(),
): boolean {
  return environment[`VITE_${name}`] === 'true' || environment[name] === 'true';
}
