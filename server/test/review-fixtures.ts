import type { ReviewInput } from '../src/services/aiReview.js';

/** Review inputs shared by the fact-sheet and route tests: a full week, a thin week, a keyboard-only month and device summaries. */
export const dates = ['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21'];
export const hours = [9, 10, 11, 14, 15, 16, 21];
export const week: ReviewInput = {
  days: 7, measuredDays: 6,
  daily: dates.map((date, i) => ({ date, neck: [null, 76, 78, 80, 82, 84, 79][i], side: [null, 82, 83, 83, 84, 84, 82][i], keyboard: [null, 78, 80, null, 83, 85, 82][i] })),
  upper: {
    neck: { current: 80.6, previous: 73.2 }, balance: { current: 83.1, previous: 84.4 }, measuredMinutes: 960, sessions: 32,
    deviations: 47, deviationRate: 3.2, validRate: 90, longestMinutes: 12,
    hourly: hours.map((hour, i) => ({ hour, neck: [86, 84, 82, 78, 74, 77, 80][i], balance: [88, 86, 85, 82, 80, 81, 83][i] })),
    deviationHours: hours.map((hour, i) => ({ hour, count: [3, 2, 4, 6, 19, 9, 4][i], minutes: [150, 120, 140, 160, 180, 130, 80][i] })),
  },
  eye: { blinkRate: 14.2, previousBlinkRate: 16.4, validMinutes: 300 },
  keyboard: { score: 82.3, previousScore: 78.1, coverage: 71, consistency: 88, judged: 1240,
    frequentKeys: [{ code: 'KeyB', differentRate: 42 }, { code: 'KeyY', differentRate: 31 }, { code: 'KeyT', differentRate: 12 }] },
};
export const thin: ReviewInput = {
  days: 7, measuredDays: 2, daily: [],
  upper: { neck: { current: 64, previous: null }, balance: { current: 71, previous: null }, measuredMinutes: 22, sessions: 2,
    deviations: 9, deviationRate: 34, validRate: 62, longestMinutes: 6, hourly: [], deviationHours: [] },
  eye: null, keyboard: null,
};
export const keyboardMonth: ReviewInput = {
  days: 30, measuredDays: 9, daily: [], upper: null, eye: null,
  keyboard: { score: 66.4, previousScore: 71.9, coverage: 92, consistency: 93, judged: 5210, frequentKeys: [{ code: 'Semicolon', differentRate: 38 }] },
};
/** Device summaries (localPosture) of a full week, measured with the 좌우 균형 score. */
export const deviceWeek: ReviewInput = {
  days: 7, measuredDays: 5,
  daily: dates.map((date, i) => ({ date, neck: [null, 74, null, 79, 81, 83, null][i], side: [null, 88, null, 86, 87, 85, null][i], keyboard: null })),
  localPosture: {
    sideMetric: 'balance', sessions: 9, measuredMinutes: 340, longestMinutes: 55,
    neck: { current: 80.4, previous: 76.2 }, side: { current: 86.3, previous: 86.9 },
    latestNeckBand: { fromPoints: 80, toPoints: 85, percentOfValidTime: 63.6 },
    hourly: [{ hour: 9, neck: 84, side: 88, minutes: 120 }, { hour: 13, neck: 78, side: 86, minutes: 90 }, { hour: 16, neck: 76, side: 84, minutes: 130 }],
  },
  upper: null, eye: null, keyboard: null,
};
