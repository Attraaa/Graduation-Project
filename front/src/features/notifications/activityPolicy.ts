// User-approved coaching defaults; these do not change measurement/scoring policies.
// Since 2026-11-25 the user picks, per mode (upper body, keyboard), "this score or lower for this many seconds" in Settings.
export const ALERT_SCORE = Object.freeze({ min: 40, max: 95, default: 70, steps: [40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95] });
export const ALERT_SECONDS = Object.freeze({ min: 1, max: 60, default: 3, steps: [1, 2, 3, 5, 10, 15, 20, 30, 45, 60] });
export const ALERT_COOLDOWN_MS = 5000;
