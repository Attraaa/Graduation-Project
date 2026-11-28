import type { ReviewInput } from '../src/services/aiReview.js';

export const recordedDay: ReviewInput = {
  date: '2026-11-21',
  posture: { sessions: 3, measuredMinutes: 30, scores: [
    { metric: 'neck', mean: 82.7, validMinutes: 30,
      beforeLastTen: { mean: 90, validMinutes: 20 }, lastTen: { mean: 68, validMinutes: 10 },
      periods: [92, 91, 88, 89, 70, 66].map((mean, i) => ({ startMinute: i * 5, endMinute: (i + 1) * 5, mean, validMinutes: 5 })) },
    { metric: 'balance', mean: 82.3, validMinutes: 30,
      beforeLastTen: { mean: 82, validMinutes: 20 }, lastTen: { mean: 83, validMinutes: 10 }, periods: [] },
  ] },
  eye: { blinkRate: 14.2, validMinutes: 20 },
  keyboard: { score: 82.3, coverage: 71, consistency: 94, judged: 1240,
    frequentKeys: [{ code: 'KeyB', differentRate: 42 }, { code: 'KeyY', differentRate: 31 }, { code: 'KeyT', differentRate: 12 }] },
};
