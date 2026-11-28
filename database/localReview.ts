/** Only these aggregate values leave the device when a review is requested. */
export interface ObservedBand { fromPoints: number; toPoints: number; percentOfValidTime: number }
export interface LocalPostureReview {
  sessions: number;
  measuredMinutes: number;
  sideMetric: 'shoulder' | 'balance';
  neck: { current: number | null; previous: number | null };
  side: { current: number | null; previous: number | null };
  latestNeckBand: ObservedBand | null;
  /** By the hour each session started, with the minutes observed in that hour (since 2026-11-28; older apps omit it). */
  hourly?: { hour: number; neck: number | null; side: number | null; minutes: number }[];
  /** The longest single session, in minutes (since 2026-11-28). */
  longestMinutes?: number;
}
