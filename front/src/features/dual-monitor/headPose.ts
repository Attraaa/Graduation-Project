type Matrix = { rows: number; columns: number; data: number[] };
type FaceResult = { faceLandmarks: unknown[]; facialTransformationMatrixes?: Matrix[] };
/** Degrees relative to the camera. A mirrored image flips the sign of yaw. */
export type HeadPose = { yaw: number; pitch: number };

const degrees = (radians: number) => radians * 180 / Math.PI;

/**
 * Head direction from MediaPipe's facial transformation matrix. This is where the face points,
 * not eye gaze, so callers compare it only with directions registered through the same camera image.
 */
export function readHeadPose(result: FaceResult): HeadPose | null {
  if (result.faceLandmarks.length !== 1) return null;
  const matrix = result.facialTransformationMatrixes?.[0];
  if (!matrix || matrix.rows !== 4 || matrix.columns !== 4 || matrix.data.length !== 16 || !matrix.data.every(Number.isFinite)) return null;
  const d = matrix.data;
  // MediaPipe packs column-major data (translation in 12..14); row-major input is accepted as well.
  const rowMajor = Math.abs(d[3]) + Math.abs(d[7]) + Math.abs(d[11]) > Math.abs(d[12]) + Math.abs(d[13]) + Math.abs(d[14]);
  const at = (row: number, column: number) => rowMajor ? d[row * 4 + column] : d[column * 4 + row];
  // Remove the model scale per column before reading the rotation.
  const scale = [0, 1, 2].map(column => Math.hypot(at(0, column), at(1, column), at(2, column)));
  if (scale.some(value => !(value > 1e-6))) return null;
  const r = (row: number, column: number) => at(row, column) / scale[column];
  // R = Ry(yaw) · Rx(pitch) · Rz(roll): yaw turns around the camera's vertical axis.
  const yaw = degrees(Math.atan2(r(0, 2), r(2, 2)));
  const pitch = degrees(Math.asin(Math.max(-1, Math.min(1, -r(1, 2)))));
  return Number.isFinite(yaw) && Number.isFinite(pitch) ? { yaw, pitch } : null;
}
