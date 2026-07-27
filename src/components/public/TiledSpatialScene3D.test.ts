import { describe, expect, it } from 'vitest';
import { Box3, Vector3 } from 'three';
import { parseTiledSpatialCatalog } from '../../lib/tiledSpatialCatalog';
import { parseUnitySpatialCatalog } from '../../lib/unitySpatialTile';
import { terrainOcclusionProbeDistance, tileIsWithinDetailCorridor, tileIsWithinDetailDistance } from '../../lib/spatialVisibility';

const files = {
  'terrain/T00/colour.png': '/api/colour',
  'terrain/T00/elevation.cog.tif': '/api/elevation',
  'vectors/T00/features.glb': '/api/features',
};

const catalog = {
  schema_version: '1.1',
  bounds_l93_metres: [876_000, 6_403_000, 880_000, 6_407_000],
  spatial_contract: {
    grid_crs: 'EPSG:2154',
    horizontal_datum: 'RGF93',
    vertical_datum: 'NGF-IGN69',
    gltf_axes: 'local glTF (E, U, -N) metres',
    common_anchor_l93_metres: [878_000, 6_405_000],
    height_origin_ngf_ign69_m: 291,
    height_maximum_ngf_ign69_m: 1_850,
  },
  terrain_tiles: [{
    bounds_l93_metres: [876_000, 6_403_000, 880_000, 6_407_000],
    colour: { path: 'terrain/T00/colour.png' },
    elevation: { path: 'terrain/T00/elevation.cog.tif' },
  }],
  feature_tiles: [{
    tile_id: 'T00-V00',
    bounds_l93_metres: [876_000, 6_403_000, 877_000, 6_404_000],
    gltf_local_origin_l93_ngf_ign69: [876_000, 6_403_000, 291],
    features: { path: 'vectors/T00/features.glb' },
  }],
};

describe('parseTiledSpatialCatalog', () => {
  it('conserve les sources COG, orthophoto et GLB contrôlées par le manifeste', () => {
    const parsed = parseTiledSpatialCatalog(catalog, files);
    expect(parsed.terrain[0]).toEqual({
      bounds: [876_000, 6_403_000, 880_000, 6_407_000],
      colourPath: 'terrain/T00/colour.png',
      elevationPath: 'terrain/T00/elevation.cog.tif',
    });
    expect(parsed.features[0]?.path).toBe('vectors/T00/features.glb');
  });

  it('rejette une ressource qui ne passe pas par les URLs publiées', () => {
    expect(() => parseTiledSpatialCatalog(catalog, {
      ...files,
      'terrain/T00/elevation.cog.tif': '',
    })).toThrow('absent du package publié');
  });
});

describe('parseUnitySpatialCatalog', () => {
  const asset = (path: string) => ({ path, sha256: 'a'.repeat(64), byte_count: 128 });
  const unityCatalog = {
    schema: 'fireviewer.remote-tile-catalog.v1',
    catalog_version: 1,
    crs: 'EPSG:2154',
    linear_unit: 'metre',
    origin_l93_m: [650_000, 6_800_000, 75],
    exported_detail_tile_count: 1,
    lod_policy: {
      far: {
        bounds_l93_m: [640_000, 6_790_000, 660_000, 6_810_000],
        terrain: asset('assets/far/global.fwterrain'),
        imagery: asset('assets/far/global.jpg'),
      },
      detail: {
        publish_distance_m: 600,
        preload_radius_m: 750,
        maximum_resident_tile_count: 32,
      },
    },
    tiles: [{
      id: 'T0001',
      bounds_l93_m: [650_000, 6_800_000, 650_250, 6_800_250],
      payload: asset('assets/detail/T0001.fwtile'),
      imagery: asset('assets/detail/T0001.jpg'),
      sections: ['terrain', 'trees', 'buildings', 'roads', 'water'],
    }],
  };

  it('accepte le budget 32 du catalogue Unity synthétique', () => {
    expect(parseUnitySpatialCatalog(unityCatalog).lod_policy.detail.maximum_resident_tile_count).toBe(32);
  });

  it('rejette toujours un budget nul', () => {
    expect(() => parseUnitySpatialCatalog({
      ...unityCatalog,
      lod_policy: { ...unityCatalog.lod_policy, detail: { ...unityCatalog.lod_policy.detail, maximum_resident_tile_count: 0 } },
    })).toThrow('entier positif');
  });
});

describe('terrainOcclusionProbeDistance', () => {
  it('arrête le contrôle avant l’entrée dans la tuile pour ne pas auto-masquer son relief', () => {
    const camera = new Vector3(0, 0, 100);
    const target = new Vector3(100, 0, 0);
    const volume = new Box3(new Vector3(90, -10, -20), new Vector3(110, 10, 80));

    const probeDistance = terrainOcclusionProbeDistance(camera, target, volume);
    const tileEntryDistance = camera.distanceTo(new Vector3(90, 0, 10));

    expect(probeDistance).toBeCloseTo(tileEntryDistance - 2, 5);
    expect(probeDistance).toBeLessThan(camera.distanceTo(target));
  });

  it('conserve la distance complète lorsqu’aucun volume cible n’est traversé', () => {
    const camera = new Vector3(0, 0, 100);
    const target = new Vector3(100, 0, 0);
    const volume = new Box3(new Vector3(-110, -10, -20), new Vector3(-90, 10, 80));

    expect(terrainOcclusionProbeDistance(camera, target, volume)).toBeCloseTo(camera.distanceTo(target) - 2, 5);
  });

  it('ne masque jamais la tuile qui contient déjà la caméra', () => {
    const volume = new Box3(new Vector3(-10, -10, -20), new Vector3(110, 10, 120));
    expect(terrainOcclusionProbeDistance(new Vector3(0, 0, 100), new Vector3(100, 0, 0), volume)).toBe(0);
  });
});

describe('tileIsWithinDetailDistance', () => {
  const bounds = [650_000, 6_800_000, 650_250, 6_800_250] as const;

  it('keeps a tile containing the view focus', () => {
    expect(tileIsWithinDetailDistance(650_125, 6_800_125, bounds, 600)).toBe(true);
  });

  it('keeps a tile whose edge reaches the publication distance', () => {
    expect(tileIsWithinDetailDistance(649_400, 6_800_125, bounds, 600)).toBe(true);
  });

  it('rejects a frustum tile beyond the focused publication distance', () => {
    expect(tileIsWithinDetailDistance(649_399, 6_800_125, bounds, 600)).toBe(false);
  });

});

describe('tileIsWithinDetailCorridor', () => {
  const camera = [649_000, 6_800_125] as const;
  const viewFocus = [651_500, 6_800_125] as const;

  it('keeps foreground, intermediate and focused tiles in an oblique view', () => {
    const foreground = [648_875, 6_800_000, 649_125, 6_800_250] as const;
    const intermediate = [650_125, 6_800_000, 650_375, 6_800_250] as const;
    const focused = [651_375, 6_800_000, 651_625, 6_800_250] as const;

    expect(tileIsWithinDetailCorridor(...camera, ...viewFocus, foreground, 600)).toBe(true);
    expect(tileIsWithinDetailCorridor(...camera, ...viewFocus, intermediate, 600)).toBe(true);
    expect(tileIsWithinDetailCorridor(...camera, ...viewFocus, focused, 600)).toBe(true);
  });

  it('rejects a tile outside the lateral corridor', () => {
    const outside = [650_125, 6_801_000, 650_375, 6_801_250] as const;
    expect(tileIsWithinDetailCorridor(...camera, ...viewFocus, outside, 600)).toBe(false);
  });

  it('preserves the vertical-camera distance rule when camera and focus coincide', () => {
    const bounds = [650_000, 6_800_000, 650_250, 6_800_250] as const;
    expect(tileIsWithinDetailCorridor(650_125, 6_800_125, 650_125, 6_800_125, bounds, 600)).toBe(true);
    expect(tileIsWithinDetailCorridor(649_399, 6_800_125, 649_399, 6_800_125, bounds, 600)).toBe(false);
  });
});
