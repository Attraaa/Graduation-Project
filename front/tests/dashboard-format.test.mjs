import test from 'node:test';
import assert from 'node:assert/strict';
import { headerDate, longDate, dayLabel, minutesText, clockText, scoreText, rateText, monthDayText } from '../src/features/dashboard/format.ts';

test('dashboard dates use the stored local date and Korean weekday', () => {
  assert.equal(headerDate('2026-10-06'), '10월 6일 화요일');
  assert.equal(longDate('2026-10-04'), '10월 4일 (일)');
  assert.equal(dayLabel('2026-09-30', '2026-10-06'), '수 9/30');
  assert.equal(dayLabel('2026-10-06', '2026-10-06'), '오늘');
  assert.equal(monthDayText('2026-09-30'), '9월 30일');
});

test('durations round to minutes without hiding short sessions', () => {
  assert.equal(minutesText(0), '0분');
  assert.equal(minutesText(20_000), '1분 미만');
  assert.equal(minutesText(25 * 60_000), '25분');
  assert.equal(minutesText(83 * 60_000), '1시간 23분');
  assert.equal(minutesText(120 * 60_000), '2시간');
});

test('clock, score and blink-rate text', () => {
  assert.equal(clockText(Date.parse('2026-10-06T00:12:00Z'), -540), '09:12');
  assert.equal(scoreText(83.6), '84');
  assert.equal(scoreText(null), '—');
  assert.equal(rateText(14.2), '분당 14회');
  assert.equal(rateText(null), '자료 부족');
});
