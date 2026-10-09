export interface CameraFraming { zoom: number; panX: number; panY: number }
type ImagePoint = [number, number];

export function normalizeFraming(input: Partial<CameraFraming> = {}): CameraFraming {
  const zoom = typeof input.zoom === 'number' && Number.isFinite(input.zoom) ? Math.max(1, Math.min(5, input.zoom)) : 1;
  const limit = (zoom - 1) / 2;
  const pan = (value: unknown) => limit && typeof value === 'number' && Number.isFinite(value) ? Math.max(-limit, Math.min(limit, value)) : 0;
  return { zoom, panX: pan(input.panX), panY: pan(input.panY) };
}

export function zoomFraming(frame: CameraFraming, pointer: ImagePoint, delta: number): CameraFraming {
  const zoom = Math.max(1, Math.min(5, frame.zoom * Math.exp(-Math.max(-500, Math.min(500, delta)) / 600)));
  const factor = zoom / frame.zoom;
  return normalizeFraming({ zoom, panX: pointer[0] - .5 - (pointer[0] - .5 - frame.panX) * factor,
    panY: pointer[1] - .5 - (pointer[1] - .5 - frame.panY) * factor });
}

export const framePoint = (point: ImagePoint, frame: CameraFraming): ImagePoint => [
  .5 + frame.panX + (point[0] - .5) * frame.zoom, .5 + frame.panY + (point[1] - .5) * frame.zoom,
];
export function unframePoint(point: ImagePoint, frame: CameraFraming): ImagePoint {
  // Round-off at the source boundary must not invalidate a saved grid on edits.
  const boundary = (value: number) => Math.abs(value) < 1e-12 ? 0 : Math.abs(value - 1) < 1e-12 ? 1 : value;
  return [boundary(.5 + (point[0] - .5 - frame.panX) / frame.zoom),
    boundary(.5 + (point[1] - .5 - frame.panY) / frame.zoom)];
}
