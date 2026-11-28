/** The camera run stays the same when a new posture reference starts another segment. */
export const cameraEyeId = (run: string) => `camera:${run}:eye`;
export const cameraPostureId = (run: string, segment: string) => `camera:${run}:${segment}`;

export function cameraRunOf(id: string) {
  return /^camera:([a-f\d-]{36}):/i.exec(id)?.[1] ?? null;
}
