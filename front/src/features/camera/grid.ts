import layout from '../../../../keyboard-detect/data/perfect_map.json' with { type: 'json' };
import type { CameraProfile, GridSettings, Point, Quad } from './profile.ts';
import { framePoint, normalizeFraming } from './framing.ts';

export const displayedGrid = (profile: CameraProfile): GridSettings => ({ ...profile.grid,
  quad: profile.grid.quad.map(point => framePoint(point, profile)) as Quad });
export const analysisGrid = (profile: CameraProfile) => ({ ...profile.grid, framing: normalizeFraming(profile) });

const keys = layout.keys as Record<string, number[][]>;
const all = Object.values(keys).flat();
const minX = Math.min(...all.map(p => p[0])), minY = Math.min(...all.map(p => p[1]));
const spanX = Math.max(...all.map(p => p[0])) - minX, spanY = Math.max(...all.map(p => p[1])) - minY;

/** Project the complete keyboard outline, not the centers of its corner keys. */
function homography(source: Point[], quad: Quad): (point: Point) => Point {
  const rows = source.flatMap(([x, y], i) => {
    const [u, v] = quad[i];
    return [[x, y, 1, 0, 0, 0, -u * x, -u * y, u], [0, 0, 0, x, y, 1, -v * x, -v * y, v]];
  });
  for (let i = 0; i < 8; i++) {
    const pivot = rows.slice(i).reduce((best, row, j) => Math.abs(row[i]) > Math.abs(rows[best][i]) ? i + j : best, i);
    [rows[i], rows[pivot]] = [rows[pivot], rows[i]];
    const divisor = rows[i][i];
    if (Math.abs(divisor) < 1e-10) throw new Error('Invalid keyboard boundary');
    rows[i] = rows[i].map(n => n / divisor);
    rows.forEach((row, j) => { if (j !== i) { const factor = row[i]; rows[j] = row.map((n, k) => n - factor * rows[i][k]); } });
  }
  const h = rows.map(row => row[8]);
  return ([x, y]) => { const d = h[6] * x + h[7] * y + 1; return [(h[0] * x + h[1] * y + h[2]) / d, (h[3] * x + h[4] * y + h[5]) / d]; };
}
export const projector = (quad: Quad) => homography([[0, 0], [1, 0], [1, 1], [0, 1]], quad);
export function gridPolygons(grid: GridSettings): Record<string, Point[]> {
  const project = projector(grid.quad);
  return Object.fromEntries(Object.entries(keys).map(([name, polygon]) => [name, polygon.map(p => {
    let x = (p[0] - minX) / spanX, y = (p[1] - minY) / spanY;
    if (grid.flipX) x = 1 - x;
    if (grid.flipY) y = 1 - y;
    for (let i = 0; i < grid.turns; i++) [x, y] = [1 - y, x];
    return project([x, y]);
  })]));
}
/** Extend the auto mapper's corner-key centers to the actual outer keyboard boundary. */
export function automaticQuad(polygons: Record<string, number[][]>, width: number, height: number): Quad | null {
  const names = ['~', 'Backspace', 'R-Ctrl', 'L-Ctrl'];
  const center = (p: number[][]): Point => [p.reduce((n, q) => n + q[0], 0) / p.length, p.reduce((n, q) => n + q[1], 0) / p.length];
  if (names.some(name => !polygons[name] || !keys[name])) return null;
  // Corner key widths differ; fit all four actual centers, rather than assuming a rectangle.
  const src = names.map(name => center(keys[name]));
  const dest = names.map(name => { const p = center(polygons[name]); return [p[0] / width, p[1] / height] as Point; }) as Quad;
  const project = homography(src, dest);
  return [[minX, minY], [minX + spanX, minY], [minX + spanX, minY + spanY], [minX, minY + spanY]].map(([x, y]) =>
    project([x, y])) as Quad;
}
