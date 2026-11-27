export interface TrendPoint { at: number; neck: number | null; balance: number | null; keyboard: number | null }
const MINUTE_MS = 60_000;
const MAX_MINUTES = 5;

/** Anchor the axis to the newest frame, with a whole-minute grid even when frames arrive between seconds. */
export function liveTimeAxis(points: TrendPoint[]) {
  const end = points.at(-1)?.at ?? 0;
  const minutes = Math.max(1, Math.min(MAX_MINUTES, Math.ceil((end - (points[0]?.at ?? end)) / MINUTE_MS)));
  const start = end - minutes * MINUTE_MS;
  return { end, domain: [start, end] as [number, number], ticks: Array.from({ length: minutes + 1 }, (_, index) => start + index * MINUTE_MS) };
}

export function liveTimeLabel(at: number, end: number) {
  const seconds = Math.max(0, Math.round((end - at) / 1000));
  if (!seconds) return '최근';
  const minutes = Math.floor(seconds / 60), rest = seconds % 60;
  return `${minutes ? `${minutes}분` : ''}${rest ? `${minutes ? ' ' : ''}${rest}초` : ''} 전`;
}
/** UI-only five-minute history. Missing measurements remain gaps, including explicit pauses. */
export function appendTrend(points: TrendPoint[], point: TrendPoint): TrendPoint[] {
  const previous = points.at(-1);
  if (previous && point.at <= previous.at) return points;
  const gapChanged = previous && (previous.neck === null) !== (point.neck === null)
    || previous && (previous.balance === null) !== (point.balance === null)
    || previous && (previous.keyboard === null) !== (point.keyboard === null);
  if (previous && point.at - previous.at < 1000 && !gapChanged) return points;
  return [...points.filter(item => item.at >= point.at - MAX_MINUTES * MINUTE_MS), point].slice(-620);
}
