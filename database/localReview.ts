/** Only these aggregate values leave the device when a review is requested. */
export interface ObservedBand { fromPoints: number; toPoints: number; percentOfValidTime: number }

export interface ScorePeriod { mean: number; validMinutes: number }
export interface DailyPostureScore extends ScorePeriod {
  metric: 'neck' | 'balance' | 'shoulder';
  /** The recorder's score policy, used to compare only the same measurement criteria across dates. */
  policyVersion?: string;
  beforeLastTen: ScorePeriod | null;
  lastTen: ScorePeriod | null;
  periods: (ScorePeriod & { startMinute: number; endMinute: number })[];
}
export interface DailyPostureReview {
  sessions: number;
  measuredMinutes: number;
  scores: DailyPostureScore[];
}
export interface DailyReviewInput {
  date: string;
  posture: DailyPostureReview | null;
  eye: { blinkRate: number | null; validMinutes: number } | null;
  keyboard: {
    score: number | null; coverage: number | null; consistency: number | null;
    judged: number; frequentKeys: { code: string; differentRate: number }[];
  } | null;
}

export const MAX_REVIEW_DAYS = 7;
export interface ReviewDateRange {
  from: string;
  to: string;
  days: DailyReviewInput[];
}
export type ReviewRequest = DailyReviewInput | ReviewDateRange;
