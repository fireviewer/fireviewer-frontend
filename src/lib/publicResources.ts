export interface PublicDownloadPack {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly filename: string;
  readonly sizeLabel: string;
  readonly sha256: string;
  readonly entryStage: string;
  readonly contract: string;
  readonly publishedAt: string;
  readonly downloadUrl: string;
  readonly repositoryUrl: string;
}

export interface PublicHubResource {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly status: string;
  readonly url: string;
}

export const PUBLIC_DOWNLOAD_PACKS: readonly PublicDownloadPack[] = [
  {
    id: 'fireviewer-die-2026-reproduction-download-r1',
    title: 'Simulation Omniverse reproductible — Die 2026',
    description: 'Scène OpenUSD autonome avec terrain, orthophoto, bâtiments, routes, végétation, périmètres temporels, caméras, scénario et configuration Flow.',
    filename: 'fireviewer-die-2026-reproduction-download-r1.zip',
    sizeLabel: '207,23 Mio',
    sha256: '1990504c41ce3da672ce4a25f8d345b67ad751c318bf769008d175f541040db0',
    entryStage: 'fireviewer-die-2026-reproduction-download-r1/dataset.usda',
    contract: 'fireviewer.omniverse-reproducible-download-bundle-contract.v1',
    publishedAt: '4 août 2026',
    downloadUrl: 'https://huggingface.co/datasets/fireviewer/omniverse-die-reproduction-pack-v1/resolve/main/fireviewer-die-2026-reproduction-download-r1.zip?download=true',
    repositoryUrl: 'https://huggingface.co/datasets/fireviewer/omniverse-die-reproduction-pack-v1',
  },
] as const;
export const PUBLIC_MODELS: readonly PublicHubResource[] = [
  {
    id: 'rtdetr-v2-r50-fire-smoke',
    title: 'RT-DETRv2 R50 — feu et fumée',
    description: 'Détection d’objets, modèle de référence FireViewer avec poids Safetensors.',
    status: 'Modèle publié',
    url: 'https://huggingface.co/fireviewer/rtdetr-v2-r50-fire-smoke',
  },
  {
    id: 'molmopoint-8b-fire-smoke-pointing',
    title: 'MolmoPoint 8B — pointage feu et fumée',
    description: 'Ancrage visuel des bases de flammes et de colonnes de fumée.',
    status: 'Modèle publié',
    url: 'https://huggingface.co/fireviewer/molmopoint-8b-fire-smoke-pointing',
  },
  {
    id: 'dfine-xlarge-fire-smoke-v2',
    title: 'D-FINE XLarge v2 — feu et fumée',
    description: 'Détection d’images avec poids Safetensors et rapports de validation.',
    status: 'Modèle publié',
    url: 'https://huggingface.co/fireviewer/dfine-xlarge-fire-smoke-v2',
  },
  {
    id: 'dinov3-vitb16-multitask-fireviewer-v3',
    title: 'DINOv3 ViT-B/16 multi-tâches v3',
    description: 'Adaptateur de segmentation et d’ancrage visuel FireViewer.',
    status: 'Modèle expérimental',
    url: 'https://huggingface.co/fireviewer/dinov3-vitb16-multitask-fireviewer-v3',
  },
  {
    id: 'segformer-b2-fire-smoke-baseline-v1',
    title: 'SegFormer-B2 — baseline feu et fumée',
    description: 'Baseline de segmentation utilisée pour les comparaisons hors ligne.',
    status: 'Baseline publiée',
    url: 'https://huggingface.co/fireviewer/segformer-b2-fire-smoke-baseline-v1',
  },
  {
    id: 'rf-detr-large-ground-fire-smoke-v2',
    title: 'RF-DETR Large — vues du sol',
    description: 'Détecteur spécialisé pour les plans larges et distants depuis le sol, exporté en ONNX.',
    status: 'Modèle spécialisé',
    url: 'https://huggingface.co/fireviewer/rf-detr-large-ground-fire-smoke-v2',
  },
  {
    id: 'rf-detr-small-ground-elite-fire-smoke-v1',
    title: 'RF-DETR Small — corpus sol élite',
    description: 'Variante légère spécialisée pour le triage des meilleures vues terrestres, exportée en ONNX.',
    status: 'Modèle spécialisé',
    url: 'https://huggingface.co/fireviewer/rf-detr-small-ground-elite-fire-smoke-v1',
  },
] as const;

export const PUBLIC_DATASETS: readonly PublicHubResource[] = [
  {
    id: 'fire-smoke-detection-corpus-v1',
    title: 'Fire & Smoke Detection Corpus v1',
    description: 'Corpus d’images et annotations de détection feu/fumée publié en shards Parquet.',
    status: 'Corpus de détection',
    url: 'https://huggingface.co/datasets/fireviewer/fire-smoke-detection-corpus-v1',
  },
  {
    id: 'fire-smoke-pointing-ground-v1',
    title: 'Fire/Smoke Pointing Ground v1',
    description: 'Vues terrestres annotées pour fire_base et smoke_column_base.',
    status: 'Corpus de pointage',
    url: 'https://huggingface.co/datasets/fireviewer/fire-smoke-pointing-ground-v1',
  },
  {
    id: 'prithvi-burnscars-training-dataset-v1',
    title: 'Prithvi Burn Scars Dataset v1',
    description: 'Paires multispectrales et masques de surfaces brûlées, avec provenance et empreintes.',
    status: 'Corpus satellitaire',
    url: 'https://huggingface.co/datasets/fireviewer/prithvi-burnscars-training-dataset-v1',
  },
  {
    id: 'firewarning-train-bundles-v1',
    title: 'Training Bundles v1',
    description: 'Archives historiques des corpus préparés par objectif ; leurs contrats doivent être relus avant réutilisation.',
    status: 'Archives de travail',
    url: 'https://huggingface.co/datasets/fireviewer/firewarning-train-bundles-v1',
  },
  {
    id: 'dinov3-cross-view-fireviewer-v1-dataset',
    title: 'DINOv3 Cross-View Dataset v1',
    description: 'Corpus expérimental Camp Swift et Gaussians on Fire. Sa présence ne promeut pas le modèle cross-view associé.',
    status: 'Corpus expérimental',
    url: 'https://huggingface.co/datasets/fireviewer/dinov3-cross-view-fireviewer-v1-dataset',
  },
] as const;
