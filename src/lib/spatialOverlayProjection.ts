import type { UnityOrigin } from './unitySpatialTile';

/** Converts absolute Lambert-93 metres into the East/North local scene plane. */
export function projectLambert93Overlay(origin: UnityOrigin, point: readonly [number, number]): readonly [number, number] {
  return [point[0] - origin[0], point[1] - origin[1]];
}
