import { Box3, Ray, Vector3 } from 'three';

export function tileIsWithinDetailDistance(
  viewFocusEast: number,
  viewFocusNorth: number,
  bounds: readonly [number, number, number, number],
  maximumDistance: number,
): boolean {
  const eastDistance = viewFocusEast < bounds[0] ? bounds[0] - viewFocusEast : viewFocusEast > bounds[2] ? viewFocusEast - bounds[2] : 0;
  const northDistance = viewFocusNorth < bounds[1] ? bounds[1] - viewFocusNorth : viewFocusNorth > bounds[3] ? viewFocusNorth - bounds[3] : 0;
  return Math.hypot(eastDistance, northDistance) <= maximumDistance;
}

export function tileIsWithinDetailCorridor(
  cameraEast: number,
  cameraNorth: number,
  viewFocusEast: number,
  viewFocusNorth: number,
  bounds: readonly [number, number, number, number],
  maximumDistance: number,
): boolean {
  if (tileIsWithinDetailDistance(cameraEast, cameraNorth, bounds, maximumDistance)) return true;
  if (tileIsWithinDetailDistance(viewFocusEast, viewFocusNorth, bounds, maximumDistance)) return true;

  const tileCentreEast = (bounds[0] + bounds[2]) / 2;
  const tileCentreNorth = (bounds[1] + bounds[3]) / 2;
  const halfDiagonal = Math.hypot(bounds[2] - bounds[0], bounds[3] - bounds[1]) / 2;
  const corridorEast = viewFocusEast - cameraEast;
  const corridorNorth = viewFocusNorth - cameraNorth;
  const corridorLengthSquared = corridorEast * corridorEast + corridorNorth * corridorNorth;
  if (corridorLengthSquared === 0) return false;

  const projection = Math.max(0, Math.min(1,
    ((tileCentreEast - cameraEast) * corridorEast + (tileCentreNorth - cameraNorth) * corridorNorth) / corridorLengthSquared,
  ));
  const nearestEast = cameraEast + projection * corridorEast;
  const nearestNorth = cameraNorth + projection * corridorNorth;
  return Math.hypot(tileCentreEast - nearestEast, tileCentreNorth - nearestNorth) <= maximumDistance + halfDiagonal;
}

export function terrainOcclusionProbeDistance(camera: Vector3, target: Vector3, volume: Box3, tolerance = 2): number {
  if (volume.containsPoint(camera)) return 0;
  const direction = target.clone().sub(camera);
  const distance = direction.length();
  if (distance <= tolerance) return 0;
  const entry = new Ray(camera, direction.normalize()).intersectBox(volume, new Vector3());
  return Math.max(0, (entry ? camera.distanceTo(entry) : distance) - tolerance);
}
