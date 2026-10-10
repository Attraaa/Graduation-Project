export interface TrendPoint { at: number; neck: number | null; shoulder: number | null; keyboard: number | null }
/** UI-only five-minute history. Missing measurements remain gaps, including explicit pauses. */
export function appendTrend(points: TrendPoint[], point: TrendPoint): TrendPoint[] {
  const previous = points.at(-1);
  if (previous && point.at <= previous.at) return points;
  const gapChanged = previous && (previous.neck === null) !== (point.neck === null)
    || previous && (previous.shoulder === null) !== (point.shoulder === null)
    || previous && (previous.keyboard === null) !== (point.keyboard === null);
  if (previous && point.at - previous.at < 1000 && !gapChanged) return points;
  return [...points.filter(item => item.at >= point.at - 300_000), point].slice(-620);
}
