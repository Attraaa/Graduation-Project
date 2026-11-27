/** Only these aggregate values leave the device when a review is requested. */
export interface ObservedBand { fromPoints: number; toPoints: number; percentOfValidTime: number }
export interface LocalPostureReview {
  sessions: number;
  measuredMinutes: number;
  sideMetric: 'shoulder' | 'balance';
  neck: { current: number | null; previous: number | null };
  side: { current: number | null; previous: number | null };
  latestNeckBand: ObservedBand | null;
}
