# 대시보드 디자인 개편 (1차) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공통 색 규칙, 사이드바, 대시보드를 승인된 "데이터 위젯" 시안대로 바꾼다. 대시보드 숫자는 기존 기록 API 응답으로 앱에서 계산한다.

**Architecture:** 순수 계산 함수 `front/src/features/dashboard/summary.ts`가 서버 응답 4개(상체 통계, 안구 통계, 키보드 기록, 오늘 이력)를 카드·7일 그래프·타임라인·이탈 시간대 값으로 바꾼다. `useDashboardData.ts`가 기존 `recordsApi()`와 `useRecordQuery`로 네 곳을 불러온다. 화면 부품은 계산 결과 타입만 받는다. 서버, `database/` 계약, 측정 화면은 바꾸지 않는다.

**Tech Stack:** React 19, TypeScript(`verbatimModuleSyntax`, `erasableSyntaxOnly`), Tailwind CSS v4(`@theme` 토큰), recharts 3, lucide-react, `node --test`(Node 내장 TS 실행), esbuild + `react-dom/server`(UI SSR 테스트).

**설계 문서:** [docs/superpowers/specs/2026-10-06-dashboard-redesign-design.md](../specs/2026-10-06-dashboard-redesign-design.md)

---

## 작업 전 공통 규칙

- 브랜치는 `feat/dashboard-redesign`이다(설계 커밋 `570a983` 위). push, PR 생성, 배포는 하지 않는다.
- **기존 파일은 삭제하지 않는다.** `front/src/components/ModeSelector.tsx`는 대시보드에서 쓰지 않게 되지만 되돌리기용으로 그대로 둔다.
- 배포 DB(`moti_demo`)에 테스트 기록을 쓰지 않는다. 계산 검증은 가짜 데이터 단위 테스트로만 한다.
- 명령은 별도 표시가 없으면 `front/` 폴더에서 실행한다. Node는 22.18 이상이어야 `.ts`를 바로 import할 수 있다(이 PC는 24.11).
- 커밋 메시지 끝에는 항상 다음 줄을 붙인다.

```
Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
```

## 파일 구조

| 파일 | 상태 | 책임 |
| --- | --- | --- |
| `front/src/features/dashboard/format.ts` | 새로 | 날짜·시간·점수 표시 문자열(순수 함수) |
| `front/src/features/dashboard/summary.ts` | 새로 | 정책 묶음 선택, 날짜별 값, 타임라인, 이탈 시간대 계산(순수 함수) |
| `front/src/features/dashboard/SourceState.tsx` | 새로 | 출처 상태 타입, 불러오는 중 틀, 실패 안내 |
| `front/src/features/dashboard/ScoreRing.tsx` | 새로 | 점수 고리 SVG |
| `front/src/features/dashboard/Sparkline.tsx` | 새로 | 7일 작은 추이선 SVG |
| `front/src/features/dashboard/PlayButton.tsx` | 새로 | 모드 색 동그라미 재생 버튼 |
| `front/src/features/dashboard/ModeCard.tsx` | 새로 | 모드 카드 틀 |
| `front/src/features/dashboard/ModeCards.tsx` | 새로 | 상체·키보드·안구 카드 |
| `front/src/features/dashboard/DayDetail.tsx` | 새로 | 그래프 날짜별 상자 |
| `front/src/features/dashboard/TodayTimeline.tsx` | 새로 | 오늘 타임라인 |
| `front/src/features/dashboard/DeviationHours.tsx` | 새로 | 기준 이탈이 잦은 시간 막대 |
| `front/src/features/dashboard/WeeklyScoreChart.tsx` | 새로 | recharts 7일 점수 그래프 |
| `front/src/features/dashboard/useDashboardData.ts` | 새로 | 네 출처 불러오기 + 계산 연결 |
| `front/src/pages/Dashboard.tsx` | 바꿈 | 새 화면 조립 |
| `front/src/styles/tokens.css` | 바꿈 | 색 값 변경, 모드 색·track·nav-active 추가 |
| `front/src/components/Sidebar.tsx` | 바꿈 | 모양만 변경(동작 그대로) |
| `front/src/components/layout/AppLayout.tsx` | 바꿈 | `/dashboard`만 `max-w-7xl` |
| `front/tests/dashboard-format.test.mjs` | 새로 | format.ts 테스트 |
| `front/tests/dashboard-summary.test.mjs` | 새로 | summary.ts 테스트 |
| `front/tests/dashboard-ui.test.mjs` | 새로 | DayDetail·TodayTimeline·DeviationHours SSR 테스트 |
| `docs/architecture.md` | 바꿈 | 대시보드 구조 항목 추가 |
| `front/src/components/ModeSelector.tsx` | **그대로** | 쓰지 않지만 되돌리기용으로 유지 |

---

### Task 1: 표시 문자열 함수 `format.ts`

**Files:**
- Create: `front/src/features/dashboard/format.ts`
- Test: `front/tests/dashboard-format.test.mjs`

- [ ] **Step 1: 실패하는 테스트 작성**

`front/tests/dashboard-format.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { headerDate, longDate, dayLabel, minutesText, clockText, scoreText, rateText } from '../src/features/dashboard/format.ts';

test('dashboard dates use the stored local date and Korean weekday', () => {
  assert.equal(headerDate('2026-10-06'), '10월 6일 화요일');
  assert.equal(longDate('2026-10-04'), '10월 4일 (일)');
  assert.equal(dayLabel('2026-09-30', '2026-10-06'), '수 9/30');
  assert.equal(dayLabel('2026-10-06', '2026-10-06'), '오늘');
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
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test tests/dashboard-format.test.mjs`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` (format.ts 없음)

- [ ] **Step 3: 구현**

`front/src/features/dashboard/format.ts`:

```ts
// Display strings only. Calculation rules live in summary.ts.
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const parts = (date: string) => date.split('-').map(Number) as [number, number, number];
const weekday = (date: string) => {
  const [year, month, day] = parts(date);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
};

/** "10월 6일 화요일" */
export function headerDate(date: string) {
  const [, month, day] = parts(date);
  return `${month}월 ${day}일 ${weekday(date)}요일`;
}

/** "10월 4일 (일)" */
export function longDate(date: string) {
  const [, month, day] = parts(date);
  return `${month}월 ${day}일 (${weekday(date)})`;
}

/** Chart x-axis: "오늘" for today, otherwise "수 9/30". */
export function dayLabel(date: string, today: string) {
  if (date === today) return '오늘';
  const [, month, day] = parts(date);
  return `${weekday(date)} ${month}/${day}`;
}

/** "1시간 23분", "25분"; a short non-zero time is "1분 미만", not 0. */
export function minutesText(ms: number) {
  if (ms <= 0) return '0분';
  const minutes = Math.round(ms / 60_000);
  if (minutes === 0) return '1분 미만';
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  if (!hours) return `${rest}분`;
  return rest ? `${hours}시간 ${rest}분` : `${hours}시간`;
}

/** Local clock of the record, e.g. "09:12". */
export function clockText(epoch: number, offsetMinutes: number) {
  return new Date(epoch - offsetMinutes * 60_000).toISOString().slice(11, 16);
}

export function scoreText(value: number | null) {
  return value === null ? '—' : String(Math.round(value));
}

/** Blink rate is never a score; missing observation is "자료 부족", not zero. */
export function rateText(value: number | null) {
  return value === null ? '자료 부족' : `분당 ${Math.round(value)}회`;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test tests/dashboard-format.test.mjs`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add front/src/features/dashboard/format.ts front/tests/dashboard-format.test.mjs
git commit -m "feat(dashboard): 대시보드 표시 문자열 함수 추가" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 계산 함수 `summary.ts` — 날짜, 정책 묶음, 날짜별 값

**Files:**
- Create: `front/src/features/dashboard/summary.ts`
- Test: `front/tests/dashboard-summary.test.mjs`

- [ ] **Step 1: 실패하는 테스트 작성**

`front/tests/dashboard-summary.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDashboard, dashboardDates, sessionIdOf } from '../src/features/dashboard/summary.ts';
import { keyboardSummary } from '../../database/keyboard.ts';

const TODAY = '2026-10-06';
const KST = -540;
const at = iso => Date.parse(iso);
const build = (input = {}) => buildDashboard({ today: TODAY, posture: [], eye: [], keyboard: [], history: [], ...input });

const postureRow = (over = {}) => ({ date: TODAY, hour: '9', mode: 'turtle',
  scorePolicyVersion: 'upper-body-neck-v3-a', habitPolicyVersion: 'reference-deviation-v1',
  longestContinuousMs: 0, sessionCount: 1, recordIds: ['s1:turtle'],
  runMs: 60_000, validMs: 60_000, scoreTimeSum: 60_000 * 80, deviationMs: 0, deviationEpisodeCount: 0, ...over });
const shoulderRow = (over = {}) => postureRow({ mode: 'shoulder', scorePolicyVersion: 'upper-body-shoulder-v3-b', recordIds: ['s1:shoulder'], ...over });
const eyeRow = (over = {}) => ({ date: TODAY, hour: '13', policyVersion: 'eye-habits-v2', sessionCount: 1,
  runMs: 600_000, validMs: 600_000, blinks: 140, breaks: 2, nearReminders: 0, openReminders: 0, ...over });
const keyboardStored = (over = {}) => ({
  record: { id: 'k1', owner: '7', startedAt: at('2026-10-06T01:40:00Z'), updatedAt: at('2026-10-06T01:58:00Z'),
    offsetMinutes: KST, status: 'finished', policyVersion: 'ansi-qwerty-touch:2.0.0',
    recognitionVersion: 'hands-label-distance-v2', nearbyCredit: 70, total: 10, ...over },
  counts: [
    { date: TODAY, code: 'KeyA', context: 'plain', finger: 'left:pinky', verdict: 'preferred', reason: 'preferred-finger', count: 8 },
    { date: TODAY, code: 'KeyA', context: 'plain', finger: 'left:ring', verdict: 'nearby', reason: 'neighboring-finger', count: 2 },
  ] });

test('dashboardDates covers six days back to today across month and year boundaries', () => {
  assert.deepEqual(dashboardDates('2026-10-06'),
    ['2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06']);
  assert.deepEqual(dashboardDates('2026-01-03').slice(0, 2), ['2025-12-28', '2025-12-29']);
  assert.equal(sessionIdOf('abc:shoulder'), 'abc');
  assert.equal(sessionIdOf('abc:turtle'), 'abc');
});

test('upper body scores are valid-time weighted and one session counts once', () => {
  const summary = build({ posture: [
    postureRow({ hour: '9', runMs: 60_000, validMs: 60_000, scoreTimeSum: 60_000 * 90, deviationEpisodeCount: 1 }),
    postureRow({ hour: '10', runMs: 180_000, validMs: 180_000, scoreTimeSum: 180_000 * 70 }),
    shoulderRow({ hour: '9', runMs: 240_000, validMs: 240_000, scoreTimeSum: 240_000 * 88, deviationEpisodeCount: 2 }),
  ] });
  const upper = summary.today.upper;
  assert.equal(upper.turtle, 75);       // (90 x 1분 + 70 x 3분) / 4분
  assert.equal(upper.shoulder, 88);
  assert.equal(upper.sessions, 1);      // s1:turtle + s1:shoulder = 세션 1개
  assert.equal(upper.runMs, 240_000);   // 목·어깨 중 큰 값, 합이 아님
  assert.equal(upper.deviations, 3);
  assert.equal(summary.today.totalMs, 240_000);
});

test('only the latest policy group of each mode is used', () => {
  const summary = build({
    posture: [
      postureRow({ date: '2026-10-02', scorePolicyVersion: 'reference-similarity-turtle-v1', scoreTimeSum: 60_000 * 40 }),
      postureRow({ date: '2026-10-05', scoreTimeSum: 60_000 * 80 }),
    ],
    eye: [eyeRow({ date: '2026-10-05', policyVersion: 'eye-habits-v1' }), eyeRow()],
    keyboard: [
      keyboardStored({ id: 'old', policyVersion: 'ansi-qwerty-touch:1.0.0',
        startedAt: at('2026-10-04T00:50:00Z'), updatedAt: at('2026-10-04T01:00:00Z') }),
      keyboardStored(),
    ],
  });
  const day = date => summary.days.find(item => item.date === date);
  assert.equal(day('2026-10-02').upper.turtle, null);
  assert.equal(day('2026-10-05').upper.turtle, 80);
  assert.equal(day('2026-10-05').eye.present, false);
  assert.equal(day('2026-10-06').eye.present, true);
  assert.equal(day('2026-10-04').keyboard.present, false);
  assert.equal(day('2026-10-06').keyboard.sessions, 1);
});

test('days without records stay empty instead of zero', () => {
  const summary = build({ posture: [postureRow({ date: '2026-10-04' })] });
  const empty = summary.days.find(day => day.date === '2026-10-03');
  assert.equal(empty.upper.turtle, null);
  assert.equal(empty.upper.sessions, 0);
  assert.equal(empty.hasRecords, false);
  assert.equal(empty.totalMs, 0);
  assert.equal(summary.days.find(day => day.date === '2026-10-04').hasRecords, true);
  assert.deepEqual(summary.recent, { upper: true, keyboard: false, eye: false });
});

test('eye rate needs 30 seconds of valid observation and is never a score', () => {
  const short = build({ eye: [eyeRow({ validMs: 29_000, blinks: 10 })] });
  assert.equal(short.today.eye.rate, null);
  assert.equal(short.today.eye.present, true);
  assert.equal(short.today.hasRecords, true);
  const enough = build({ eye: [eyeRow()] });
  assert.equal(enough.today.eye.rate, 14);
  assert.equal(enough.today.eye.breaks, 2);
  assert.equal(enough.hasScores, false);
});

test('keyboard values match the shared keyboard summary and count sessions by start date', () => {
  const stored = keyboardStored();
  const today = build({ keyboard: [stored] }).today.keyboard;
  const expected = keyboardSummary(stored.counts, 70);
  assert.equal(today.score, expected.score);
  assert.equal(today.coverage, expected.coverage);
  assert.equal(today.sessions, 1);
  assert.equal(today.runMs, 18 * 60_000);
  assert.equal(today.present, true);
});

test('chart floor rounds the lowest score down to ten and stays below 100', () => {
  assert.equal(build({ posture: [postureRow({ scoreTimeSum: 60_000 * 64 })] }).chartFloor, 60);
  assert.equal(build({ posture: [postureRow({ scoreTimeSum: 60_000 * 100 })] }).chartFloor, 90);
  assert.equal(build().chartFloor, 0);
  assert.equal(build().hasScores, false);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test tests/dashboard-summary.test.mjs`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` (summary.ts 없음)

- [ ] **Step 3: 구현**

`front/src/features/dashboard/summary.ts`:

```ts
import { averageScore, localDateKey } from '../../../../database/contracts.ts';
import type { PostureRecord, StatisticsRow } from '../../../../database/contracts.ts';
import { statisticsKey } from '../../../../database/aggregation.ts';
import { eyeRate } from '../../../../database/eye.ts';
import type { EyeRecord, EyeStatisticsRow } from '../../../../database/eye.ts';
import { keyboardSummary } from '../../../../database/keyboard.ts';
import type { KeyboardStored } from '../../../../database/keyboard.ts';

export const DASHBOARD_DAYS = 7;

export interface UpperDay { turtle: number | null; shoulder: number | null; sessions: number; runMs: number; deviations: number }
export interface KeyboardDay { score: number | null; coverage: number | null; sessions: number; runMs: number; present: boolean }
export interface EyeDay { rate: number | null; runMs: number; breaks: number; present: boolean }
export interface DashboardDay { date: string; upper: UpperDay; keyboard: KeyboardDay; eye: EyeDay; totalMs: number; hasRecords: boolean }
export interface TimelineEntry {
  id: string; mode: 'upper' | 'keyboard' | 'eye';
  startedAt: number; endedAt: number; offsetMinutes: number;
  turtle: number | null; shoulder: number | null; score: number | null; rate: number | null;
  interrupted: boolean;
}
export interface DeviationHour { hour: number; count: number; strong: boolean }
/** null means the source has not loaded (or failed); it is treated as empty. */
export interface DashboardInput {
  today: string;
  posture: StatisticsRow[] | null;
  eye: EyeStatisticsRow[] | null;
  keyboard: KeyboardStored[] | null;
  history: (PostureRecord | EyeRecord)[] | null;
}
export interface DashboardSummary {
  dates: string[];
  days: DashboardDay[];
  today: DashboardDay;
  timeline: TimelineEntry[];
  deviationHours: DeviationHour[];
  chartFloor: number;
  hasScores: boolean;
  recent: { upper: boolean; keyboard: boolean; eye: boolean };
}

/** Six days before today through today, oldest first. */
export function dashboardDates(today: string) {
  const [year, month, day] = today.split('-').map(Number);
  return Array.from({ length: DASHBOARD_DAYS }, (_, index) =>
    new Date(Date.UTC(year, month - 1, day - (DASHBOARD_DAYS - 1 - index))).toISOString().slice(0, 10));
}

/** An upper-body session is stored as `${sessionId}:turtle` and `${sessionId}:shoulder`. */
export const sessionIdOf = (recordId: string) => recordId.replace(/:(turtle|shoulder)$/, '');

const total = <T>(rows: T[], pick: (row: T) => number) => rows.reduce((sum, row) => sum + pick(row), 0);
const hourOrder = (row: { date: string; hour: string }) => `${row.date}T${String(Number(row.hour)).padStart(2, '0')}`;

/** Different policies are never mixed: keep only the group of the latest row. */
function latestGroup<T extends { date: string; hour: string }>(rows: T[], key: (row: T) => string) {
  if (!rows.length) return [];
  const latest = rows.reduce((last, row) => (hourOrder(row) > hourOrder(last) ? row : last));
  const selected = key(latest);
  return rows.filter(row => key(row) === selected);
}

const keyboardKey = (stored: KeyboardStored) =>
  JSON.stringify([stored.record.policyVersion, stored.record.recognitionVersion, stored.record.nearbyCredit]);

function latestKeyboard(records: KeyboardStored[]) {
  if (!records.length) return [];
  const latest = records.reduce((last, stored) => (stored.record.updatedAt > last.record.updatedAt ? stored : last));
  const selected = keyboardKey(latest);
  return records.filter(stored => keyboardKey(stored) === selected);
}

function upperDay(turtle: StatisticsRow[], shoulder: StatisticsRow[], date: string): UpperDay {
  const neck = turtle.filter(row => row.date === date), side = shoulder.filter(row => row.date === date);
  const score = (rows: StatisticsRow[]) =>
    averageScore({ validMs: total(rows, row => row.validMs), scoreTimeSum: total(rows, row => row.scoreTimeSum) });
  const sessions = new Set([...neck, ...side].flatMap(row => row.recordIds).map(sessionIdOf));
  return {
    turtle: score(neck), shoulder: score(side), sessions: sessions.size,
    runMs: Math.max(total(neck, row => row.runMs), total(side, row => row.runMs)),
    deviations: total([...neck, ...side], row => row.deviationEpisodeCount),
  };
}

function keyboardDay(records: KeyboardStored[], date: string): KeyboardDay {
  const counts = records.flatMap(stored => stored.counts.filter(count => count.date === date));
  const started = records.filter(stored => localDateKey(stored.record.startedAt, stored.record.offsetMinutes) === date);
  const summary = keyboardSummary(counts, records[0]?.record.nearbyCredit ?? 70);
  return {
    score: summary.score, coverage: summary.coverage, sessions: started.length,
    runMs: total(started, stored => Math.max(0, stored.record.updatedAt - stored.record.startedAt)),
    present: counts.length > 0 || started.length > 0,
  };
}

function eyeDay(rows: EyeStatisticsRow[], date: string): EyeDay {
  const day = rows.filter(row => row.date === date);
  return {
    rate: eyeRate({ validMs: total(day, row => row.validMs), blinks: total(day, row => row.blinks) }),
    runMs: total(day, row => row.runMs), breaks: total(day, row => row.breaks), present: day.length > 0,
  };
}

export function buildDashboard(input: DashboardInput): DashboardSummary {
  const dates = dashboardDates(input.today);
  const posture = input.posture ?? [];
  const turtle = latestGroup(posture.filter(row => row.mode === 'turtle'), statisticsKey);
  const shoulder = latestGroup(posture.filter(row => row.mode === 'shoulder'), statisticsKey);
  const eye = latestGroup(input.eye ?? [], row => row.policyVersion);
  const keyboard = latestKeyboard(input.keyboard ?? []);
  const days = dates.map((date): DashboardDay => {
    const upper = upperDay(turtle, shoulder, date);
    const typing = keyboardDay(keyboard, date);
    const eyes = eyeDay(eye, date);
    return { date, upper, keyboard: typing, eye: eyes, totalMs: upper.runMs + typing.runMs + eyes.runMs,
      hasRecords: upper.sessions > 0 || typing.present || eyes.present };
  });
  const scores = days.flatMap(day => [day.upper.turtle, day.upper.shoulder, day.keyboard.score])
    .filter((value): value is number => value !== null);
  return {
    dates, days, today: days[days.length - 1],
    timeline: [],
    deviationHours: [],
    chartFloor: scores.length ? Math.min(90, Math.max(0, Math.floor(Math.min(...scores) / 10) * 10)) : 0,
    hasScores: scores.length > 0,
    recent: { upper: turtle.length + shoulder.length > 0, keyboard: keyboard.length > 0, eye: eye.length > 0 },
  };
}
```

`timeline`과 `deviationHours`는 Task 3에서 채운다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test tests/dashboard-summary.test.mjs`
Expected: PASS (7 tests)

Run: `npm run typecheck`
Expected: 오류 없이 종료

- [ ] **Step 5: 커밋**

```bash
git add front/src/features/dashboard/summary.ts front/tests/dashboard-summary.test.mjs
git commit -m "feat(dashboard): 정책 묶음과 날짜별 대시보드 값 계산" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `summary.ts` — 오늘 타임라인과 이탈 시간대

**Files:**
- Modify: `front/src/features/dashboard/summary.ts`
- Test: `front/tests/dashboard-summary.test.mjs` (파일 끝에 추가)

- [ ] **Step 1: 실패하는 테스트 추가**

`front/tests/dashboard-summary.test.mjs` 파일 **끝에** 붙인다:

```js
const postureRecord = (over = {}) => ({ id: 's1:turtle', owner: '7', mode: 'turtle',
  startedAt: at('2026-10-06T00:12:00Z'), updatedAt: at('2026-10-06T00:37:00Z'), offsetMinutes: KST,
  scorePolicyVersion: 'upper-body-neck-v3-a', habitPolicyVersion: 'reference-deviation-v1',
  longestContinuousMs: 0, status: 'finished',
  runMs: 25 * 60_000, validMs: 25 * 60_000, scoreTimeSum: 25 * 60_000 * 84, deviationMs: 0, deviationEpisodeCount: 0, ...over });
const eyeRecord = (over = {}) => ({ id: 'e1', owner: '7', mode: 'eye',
  startedAt: at('2026-10-06T04:05:00Z'), updatedAt: at('2026-10-06T04:45:00Z'), offsetMinutes: KST,
  policyVersion: 'eye-habits-v2', status: 'finished',
  runMs: 40 * 60_000, validMs: 40 * 60_000, blinks: 560, breaks: 2, nearReminders: 0, openReminders: 0, ...over });

test('today timeline merges one upper session, keyboard and eye in start order', () => {
  const turtle = postureRecord();
  const shoulder = postureRecord({ id: 's1:shoulder', mode: 'shoulder',
    scorePolicyVersion: 'upper-body-shoulder-v3-b', scoreTimeSum: 25 * 60_000 * 89 });
  const yesterday = postureRecord({ id: 's0:turtle', startedAt: at('2026-10-05T00:12:00Z') });
  const summary = build({ history: [eyeRecord({ status: 'interrupted' }), shoulder, turtle, yesterday], keyboard: [keyboardStored()] });
  assert.deepEqual(summary.timeline.map(entry => [entry.mode, entry.id]), [['upper', 's1'], ['keyboard', 'k1'], ['eye', 'e1']]);
  const [upper, keyboard, eye] = summary.timeline;
  assert.equal(upper.turtle, 84);
  assert.equal(upper.shoulder, 89);
  assert.equal(upper.endedAt - upper.startedAt, 25 * 60_000);
  assert.equal(upper.interrupted, false);
  assert.equal(keyboard.score, keyboardSummary(keyboardStored().counts, 70).score);
  assert.equal(keyboard.endedAt - keyboard.startedAt, 18 * 60_000);
  assert.equal(eye.rate, 14);
  assert.equal(eye.interrupted, true);
});

test('timeline drops records from a policy that is not the latest', () => {
  const summary = build({ posture: [postureRow()],
    history: [postureRecord({ id: 'old:turtle', scorePolicyVersion: 'reference-similarity-turtle-v1' }), postureRecord()] });
  assert.deepEqual(summary.timeline.map(entry => entry.id), ['s1']);
});

test('deviation hours sum neck and shoulder episodes over the shown hour range', () => {
  const summary = build({ posture: [
    postureRow({ hour: '9', deviationEpisodeCount: 1 }),
    shoulderRow({ hour: '9', deviationEpisodeCount: 2 }),
    postureRow({ date: '2026-10-05', hour: '12', deviationEpisodeCount: 4 }),
  ] });
  assert.deepEqual(summary.deviationHours.map(hour => [hour.hour, hour.count, hour.strong]),
    [[9, 3, true], [10, 0, false], [11, 0, false], [12, 4, true]]);
  assert.deepEqual(build().deviationHours, []);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test tests/dashboard-summary.test.mjs`
Expected: FAIL — 새 3개 테스트가 실패(`timeline`과 `deviationHours`가 빈 배열). 기존 7개는 통과.

- [ ] **Step 3: 구현**

`front/src/features/dashboard/summary.ts`에서 `export function buildDashboard` **바로 위에** 두 함수를 추가한다:

```ts
interface TimelineFilter { turtle: string | null; shoulder: string | null; eye: string | null }

/** Today's sessions in start order. A null filter means "no statistics loaded, accept all". */
function timelineEntries(history: (PostureRecord | EyeRecord)[], keyboard: KeyboardStored[], today: string,
  accept: TimelineFilter): TimelineEntry[] {
  const startsToday = (record: { startedAt: number; offsetMinutes: number }) =>
    localDateKey(record.startedAt, record.offsetMinutes) === today;
  const entries: TimelineEntry[] = [];
  const upper = new Map<string, PostureRecord[]>();
  for (const record of history) {
    if (!startsToday(record)) continue;
    if (record.mode === 'eye') {
      if (accept.eye !== null && record.policyVersion !== accept.eye) continue;
      entries.push({ id: record.id, mode: 'eye', startedAt: record.startedAt, endedAt: record.startedAt + record.runMs,
        offsetMinutes: record.offsetMinutes, turtle: null, shoulder: null, score: null, rate: eyeRate(record),
        interrupted: record.status === 'interrupted' });
      continue;
    }
    const selected = record.mode === 'turtle' ? accept.turtle : accept.shoulder;
    if (selected !== null && statisticsKey(record) !== selected) continue;
    const id = sessionIdOf(record.id);
    upper.set(id, [...(upper.get(id) ?? []), record]);
  }
  for (const [id, records] of upper) {
    const neck = records.find(record => record.mode === 'turtle');
    const side = records.find(record => record.mode === 'shoulder');
    entries.push({ id, mode: 'upper',
      startedAt: Math.min(...records.map(record => record.startedAt)),
      endedAt: Math.max(...records.map(record => record.startedAt + record.runMs)),
      offsetMinutes: records[0].offsetMinutes,
      turtle: neck ? averageScore(neck) : null, shoulder: side ? averageScore(side) : null, score: null, rate: null,
      interrupted: records.some(record => record.status === 'interrupted') });
  }
  for (const stored of keyboard) {
    if (!startsToday(stored.record)) continue;
    entries.push({ id: stored.record.id, mode: 'keyboard', startedAt: stored.record.startedAt, endedAt: stored.record.updatedAt,
      offsetMinutes: stored.record.offsetMinutes, turtle: null, shoulder: null,
      score: keyboardSummary(stored.counts, stored.record.nearbyCredit).score, rate: null,
      interrupted: stored.record.status === 'interrupted' });
  }
  return entries.sort((a, b) => a.startedAt - b.startedAt);
}

/** Neck + shoulder deviation episodes per hour, from the first to the last hour with upper-body rows. */
function deviationHours(rows: StatisticsRow[]): DeviationHour[] {
  if (!rows.length) return [];
  const hours = rows.map(row => Number(row.hour));
  const first = Math.min(...hours), last = Math.max(...hours);
  const counts = Array.from({ length: last - first + 1 }, (_, index) =>
    total(rows.filter(row => Number(row.hour) === first + index), row => row.deviationEpisodeCount));
  const peak = Math.max(...counts);
  return counts.map((count, index) => ({ hour: first + index, count, strong: peak > 0 && count >= peak * 0.75 }));
}
```

같은 파일의 `buildDashboard` 반환값에서 다음 두 줄을:

```ts
    timeline: [],
    deviationHours: [],
```

아래로 바꾼다:

```ts
    timeline: timelineEntries(input.history ?? [], keyboard, input.today, {
      turtle: turtle[0] ? statisticsKey(turtle[0]) : null,
      shoulder: shoulder[0] ? statisticsKey(shoulder[0]) : null,
      eye: eye[0]?.policyVersion ?? null,
    }),
    deviationHours: deviationHours([...turtle, ...shoulder]),
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test tests/dashboard-summary.test.mjs`
Expected: PASS (10 tests)

Run: `npm run typecheck`
Expected: 오류 없이 종료

- [ ] **Step 5: 커밋**

```bash
git add front/src/features/dashboard/summary.ts front/tests/dashboard-summary.test.mjs
git commit -m "feat(dashboard): 오늘 타임라인과 기준 이탈 시간대 계산" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 공통 색 규칙 `tokens.css`

**Files:**
- Modify: `front/src/styles/tokens.css` (파일 전체 교체)

- [ ] **Step 1: 파일 전체를 아래 내용으로 바꾼다**

```css
/* Shared palette: prefer semantic classes (bg-surface, text-heading, border-border)
   in common components so theme changes have one source of truth. */
@theme {
  --color-brand: #26c281;
  --color-primary: #58cc02;
  --color-primary-hover: #46a302;
  --color-primary-border: #46a302;
  --color-secondary: #1cb0f6;
  --color-secondary-border: #1899d6;
  --color-danger: #ff4b4b;
  --color-danger-border: #ea2b2b;
  --color-warning: #ffc800;
  --color-warning-border: #c69b00;
  --color-surface: #ffffff;
  --color-surface-muted: #f9fafb;
  --color-background: #f3f5f8;
  --color-border: #e3e7ee;
  --color-border-strong: #d1d5db;
  --color-heading: #1d2433;
  --color-muted: #6b7280;
  --color-text: #3c3c3c;
  --color-text-light: #777777;

  /* Data-widget dashboard: mode colors, their soft icon backgrounds, ring/grid track, active nav. */
  --color-mode-upper: #58cc02;
  --color-mode-shoulder: #f5b700;
  --color-mode-keyboard: #1cb0f6;
  --color-mode-eye: #ff4b4b;
  --color-mode-upper-soft: #eaf8dc;
  --color-mode-shoulder-soft: #fff4cc;
  --color-mode-keyboard-soft: #e1f4fe;
  --color-mode-eye-soft: #ffe3e3;
  --color-track: #eef0f3;
  --color-nav-active: #eef1f6;
}

.dark-theme {
  --color-surface: #171b23;
  --color-surface-muted: #111827;
  --color-background: #0f1218;
  --color-border: #252b36;
  --color-border-strong: #4b5563;
  --color-heading: #e6e9ef;
  --color-muted: #9ca3af;
  --color-text: #e5e7eb;
  --color-text-light: #9ca3af;
  --color-mode-upper-soft: #1f3313;
  --color-mode-shoulder-soft: #3a2f0a;
  --color-mode-keyboard-soft: #0f2c3d;
  --color-mode-eye-soft: #3d1a1c;
  --color-track: #252b36;
  --color-nav-active: #222835;
}
```

바뀐 값은 밝은 테마의 `background`, `border`, `heading`과 다크 테마의 `surface`, `background`, `border`, `heading`뿐이다. 나머지는 원래 값 그대로이고, 모드 색 등 새 토큰만 추가된다.

- [ ] **Step 2: 검사**

Run: `npm run typecheck`
Expected: 오류 없이 종료

- [ ] **Step 3: 커밋**

```bash
git add front/src/styles/tokens.css
git commit -m "style(tokens): 데이터 위젯 팔레트와 모드 색 토큰 추가" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 사이드바와 레이아웃 폭

**Files:**
- Modify: `front/src/components/Sidebar.tsx` (반환 JSX와 아이콘 크기만)
- Modify: `front/src/components/layout/AppLayout.tsx` (파일 전체)

- [ ] **Step 1: `Sidebar.tsx`의 `navItems` 아이콘 크기를 28에서 22로 바꾼다**

```tsx
  const navItems = [
    { name: '학습', path: '/dashboard', icon: <Home size={22} /> },
    { name: '통계', path: '/statistics', icon: <BarChart2 size={22} /> },
    { name: '학습이력', path: '/history', icon: <CalendarDays size={22} /> },
    { name: '설정', path: '/settings', icon: <Settings size={22} /> },
  ];
```

- [ ] **Step 2: `Sidebar.tsx`의 `return (...)` 전체를 아래로 바꾼다**

`handleLogout`과 import는 그대로 둔다.

```tsx
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-border bg-surface px-4 py-3 md:relative md:w-52 md:flex-col md:justify-start md:border-r md:border-t-0 md:px-3 md:py-6">
      {/* Logo Area (Hidden on mobile) */}
      <div className="mb-8 hidden w-full px-3 md:block">
        <h1 className="text-2xl font-extrabold tracking-tight text-heading">
          Moti<span className="text-brand">.</span>
        </h1>
      </div>

      {/* Nav Items */}
      <nav className="flex w-full flex-row justify-around md:flex-col md:space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.name}
              to={item.path}
              aria-current={isActive ? 'page' : undefined}
              className={`flex items-center rounded-xl px-3 py-2.5 font-semibold transition-colors ${
                isActive ? 'bg-nav-active text-heading' : 'text-muted hover:bg-nav-active hover:text-heading'
              }`}
            >
              <div className="flex items-center justify-center md:mr-3">{item.icon}</div>
              <span className="hidden md:block">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* User Area */}
      <div className="mt-auto hidden w-full md:block">
        <Link
          to="/login"
          onClick={handleLogout}
          className="flex w-full items-center rounded-xl px-3 py-2.5 font-semibold text-[#d94b4b] transition-colors hover:bg-red-50 hover:text-[#c73737]"
        >
          <div className="flex items-center justify-center md:mr-3"><LogOut size={22} /></div>
          <span className="hidden md:block">로그아웃</span>
        </Link>
      </div>
    </div>
  );
```

- [ ] **Step 3: `AppLayout.tsx` 파일 전체를 아래로 바꾼다**

```tsx
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../Sidebar';

// App routes share one shell; each page owns only the content inside Outlet.
// The data-widget dashboard needs a wider canvas; other pages keep their reading width.
const AppLayout = () => {
  const wide = useLocation().pathname === '/dashboard';
  return (
    <div className="flex h-screen w-screen bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-8 pb-24 md:pb-8">
        <div className={`mx-auto h-full ${wide ? 'max-w-7xl' : 'max-w-4xl'}`}>
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
```

- [ ] **Step 4: 검사**

Run: `npm run typecheck && npm run lint`
Expected: 둘 다 오류 없이 종료

- [ ] **Step 5: 커밋**

```bash
git add front/src/components/Sidebar.tsx front/src/components/layout/AppLayout.tsx
git commit -m "style(layout): 사이드바 새 디자인과 대시보드 전용 넓은 폭" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 작은 화면 부품 (상태, 점수 고리, 추이선, 재생 버튼, 카드 틀)

**Files:**
- Create: `front/src/features/dashboard/SourceState.tsx`
- Create: `front/src/features/dashboard/ScoreRing.tsx`
- Create: `front/src/features/dashboard/Sparkline.tsx`
- Create: `front/src/features/dashboard/PlayButton.tsx`
- Create: `front/src/features/dashboard/ModeCard.tsx`

- [ ] **Step 1: `SourceState.tsx`**

```tsx
export type SourceStatus = 'loading' | 'error' | 'ready';

export function SourceLoading({ className = 'h-16' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-xl bg-track ${className}`} />;
}

export function SourceError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-muted">
      <span>기록을 불러오지 못했어요</span>
      <button type="button" onClick={onRetry}
        className="rounded-lg border border-border px-2 py-1 font-semibold text-heading hover:bg-nav-active">
        다시 시도
      </button>
    </div>
  );
}
```

- [ ] **Step 2: `ScoreRing.tsx`**

```tsx
const CIRCUMFERENCE = 2 * Math.PI * 16;

export default function ScoreRing({ value, strokeClass, label }: { value: number | null; strokeClass: string; label: string }) {
  const filled = value === null ? 0 : (Math.max(0, Math.min(100, value)) / 100) * CIRCUMFERENCE;
  const spoken = value === null ? '기록 없음' : `${Math.round(value)}점`;
  return (
    <figure className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 40 40" className="h-16 w-16" role="img" aria-label={`${label} ${spoken}`}>
        <circle cx="20" cy="20" r="16" fill="none" strokeWidth="5" className="stroke-track" />
        {value !== null && (
          <circle cx="20" cy="20" r="16" fill="none" strokeWidth="5" strokeLinecap="round" className={strokeClass}
            strokeDasharray={`${filled} ${CIRCUMFERENCE}`} transform="rotate(-90 20 20)" />
        )}
        <text x="20" y="20" textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="800" className="fill-heading">
          {value === null ? '—' : Math.round(value)}
        </text>
      </svg>
      <figcaption className="text-xs text-muted">{label}</figcaption>
    </figure>
  );
}
```

- [ ] **Step 3: `Sparkline.tsx`**

```tsx
export interface SparkLine { values: (number | null)[]; strokeClass: string }

const WIDTH = 60, HEIGHT = 20;

/** Seven-day trend; missing days are skipped and their neighbours joined, like the main chart. */
export default function Sparkline({ lines, label }: { lines: SparkLine[]; label: string }) {
  const values = lines.flatMap(line => line.values).filter((value): value is number => value !== null);
  if (values.length < 2) return null;
  const min = Math.min(...values), span = Math.max(...values) - min || 1;
  const points = (series: (number | null)[]) => series.flatMap((value, index) => value === null ? [] : [
    `${((index / Math.max(1, series.length - 1)) * WIDTH).toFixed(1)},${(HEIGHT - 2 - ((value - min) / span) * (HEIGHT - 4)).toFixed(1)}`,
  ]).join(' ');
  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-7 w-20" role="img" aria-label={label}>
      {lines.map(line => (
        <polyline key={line.strokeClass} points={points(line.values)} fill="none" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" className={line.strokeClass} />
      ))}
    </svg>
  );
}
```

- [ ] **Step 4: `PlayButton.tsx`**

```tsx
import { Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { ModeId } from '../../data/modes';

/** Icon-only start button; the label is both the tooltip and the accessible name. */
export default function PlayButton({ modeId, label, colorClass }: { modeId: ModeId; label: string; colorClass: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" aria-label={label} title={label} onClick={() => navigate(`/learn/${modeId}`)}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 ${colorClass}`}>
      <Play size={16} fill="currentColor" className="ml-0.5" />
    </button>
  );
}
```

- [ ] **Step 5: `ModeCard.tsx`**

```tsx
import type { ReactNode } from 'react';

export default function ModeCard({ title, subtitle, icon, iconClass, action, className = '', children }: {
  title: string; subtitle?: string; icon: ReactNode; iconClass: string; action: ReactNode; className?: string; children: ReactNode;
}) {
  return (
    <section aria-label={`${title} 모드`} className={`flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>{icon}</span>
          <h2 className="font-bold text-heading">{title}</h2>
          {subtitle && <span className="truncate text-xs text-muted">{subtitle}</span>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
```

- [ ] **Step 6: 검사**

Run: `npm run typecheck && npm run lint`
Expected: 둘 다 오류 없이 종료

- [ ] **Step 7: 커밋**

```bash
git add front/src/features/dashboard/SourceState.tsx front/src/features/dashboard/ScoreRing.tsx front/src/features/dashboard/Sparkline.tsx front/src/features/dashboard/PlayButton.tsx front/src/features/dashboard/ModeCard.tsx
git commit -m "feat(dashboard): 점수 고리·추이선·재생 버튼·카드 틀 부품 추가" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 날짜별 상자, 오늘 타임라인, 이탈 시간대 (SSR 테스트 포함)

**Files:**
- Create: `front/src/features/dashboard/DayDetail.tsx`
- Create: `front/src/features/dashboard/TodayTimeline.tsx`
- Create: `front/src/features/dashboard/DeviationHours.tsx`
- Test: `front/tests/dashboard-ui.test.mjs`

- [ ] **Step 1: 실패하는 테스트 작성**

`front/tests/dashboard-ui.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

async function load(entry) {
  const bundle = await build({ entryPoints: [entry], bundle: true, write: false,
    platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'] });
  const compiled = { exports: {} };
  new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
  return compiled.exports.default;
}
const DayDetail = await load('src/features/dashboard/DayDetail.tsx');
const TodayTimeline = await load('src/features/dashboard/TodayTimeline.tsx');
const DeviationHours = await load('src/features/dashboard/DeviationHours.tsx');
const html = (component, props) => renderToStaticMarkup(createElement(component, props));

test('day detail lists only the modes recorded that day', () => {
  const day = { date: '2026-10-04', totalMs: 35 * 60_000, hasRecords: true,
    upper: { turtle: 80, shoulder: 88, sessions: 1, runMs: 15 * 60_000, deviations: 0 },
    keyboard: { score: null, coverage: null, sessions: 0, runMs: 0, present: false },
    eye: { rate: 16, runMs: 20 * 60_000, breaks: 0, present: true } };
  const out = html(DayDetail, { day });
  assert.match(out, /10월 4일 \(일\)/);
  assert.match(out, /목 80 · 어깨 88/);
  assert.match(out, /1회 · 15분/);
  assert.match(out, /분당 16회/);
  assert.doesNotMatch(out, /키보드/);
  assert.match(out, /총 관찰 35분/);
});

test('timeline and deviation cards show empty states and interrupted sessions', () => {
  assert.match(html(TodayTimeline, { entries: [] }), /오늘 측정한 기록이 없어요/);
  assert.match(html(DeviationHours, { hours: [] }), /상체 기록이 쌓이면 보여요/);
  const entry = { id: 'e1', mode: 'eye', startedAt: Date.parse('2026-10-06T04:05:00Z'), endedAt: Date.parse('2026-10-06T04:45:00Z'),
    offsetMinutes: -540, turtle: null, shoulder: null, score: null, rate: 14, interrupted: true };
  const out = html(TodayTimeline, { entries: [entry] });
  assert.match(out, /안구/);
  assert.match(out, /분당 14회/);
  assert.match(out, /13:05 – 13:45 \(40분\)/);
  assert.match(out, /중단됨/);
  const bars = html(DeviationHours, { hours: [{ hour: 9, count: 3, strong: true }, { hour: 10, count: 0, strong: false }] });
  assert.match(bars, /기준 이탈이 많은 시간: 9시/);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test tests/dashboard-ui.test.mjs`
Expected: FAIL — esbuild가 `src/features/dashboard/DayDetail.tsx`를 찾지 못함

- [ ] **Step 3: `DayDetail.tsx`**

SSR에서 글자 사이에 `<!-- -->`가 끼지 않도록 표시 문장은 템플릿 문자열 하나로 만든다.

```tsx
import { longDate, minutesText, rateText, scoreText } from './format';
import type { DashboardDay } from './summary';

function Row({ dotClass, name, value, extra }: { dotClass: string; name: string; value: string; extra: string }) {
  return (
    <li className="grid grid-cols-[0.75rem_2.75rem_1fr_auto] items-center gap-2">
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${dotClass}`} />
      <span className="text-muted">{name}</span>
      <b className="text-heading">{value}</b>
      <span className="text-right text-muted">{extra}</span>
    </li>
  );
}

const sessionText = (sessions: number, runMs: number) => (sessions > 0 ? `${sessions}회 · ${minutesText(runMs)}` : '');

/** Hover box for one chart day: only modes recorded that day, plus total observation. */
export default function DayDetail({ day }: { day: DashboardDay }) {
  return (
    <div className="w-72 rounded-xl border border-border bg-surface p-3 text-sm shadow-lg">
      <p className="mb-2 font-bold text-heading">{longDate(day.date)}</p>
      <ul className="space-y-1">
        {day.upper.sessions > 0 && (
          <Row dotClass="bg-mode-upper" name="상체" value={`목 ${scoreText(day.upper.turtle)} · 어깨 ${scoreText(day.upper.shoulder)}`}
            extra={sessionText(day.upper.sessions, day.upper.runMs)} />
        )}
        {day.keyboard.present && (
          <Row dotClass="bg-mode-keyboard" name="키보드"
            value={day.keyboard.score === null ? '판정 자료 없음' : `${scoreText(day.keyboard.score)}점`}
            extra={sessionText(day.keyboard.sessions, day.keyboard.runMs)} />
        )}
        {day.eye.present && (
          <Row dotClass="bg-mode-eye" name="안구" value={rateText(day.eye.rate)} extra={minutesText(day.eye.runMs)} />
        )}
      </ul>
      <p className="mt-2 border-t border-border pt-2 text-muted">{`총 관찰 ${minutesText(day.totalMs)}`}</p>
    </div>
  );
}
```

- [ ] **Step 4: `TodayTimeline.tsx`**

```tsx
import { clockText, minutesText, rateText, scoreText } from './format';
import type { TimelineEntry } from './summary';

const NAME = { upper: '상체', keyboard: '키보드', eye: '안구' } as const;
const BAR = { upper: 'bg-mode-upper', keyboard: 'bg-mode-keyboard', eye: 'bg-mode-eye' } as const;

const valueText = (entry: TimelineEntry) => {
  if (entry.mode === 'upper') return `목 ${scoreText(entry.turtle)} · 어깨 ${scoreText(entry.shoulder)}`;
  if (entry.mode === 'keyboard') return entry.score === null ? '판정 자료 없음' : `${scoreText(entry.score)}점`;
  return rateText(entry.rate);
};

export default function TodayTimeline({ entries }: { entries: TimelineEntry[] }) {
  if (!entries.length) return <p className="text-sm text-muted">오늘 측정한 기록이 없어요</p>;
  return (
    <ol className="space-y-3">
      {entries.map(entry => (
        <li key={`${entry.mode}:${entry.id}`} className="flex gap-3 text-sm">
          <span aria-hidden="true" className={`w-1 shrink-0 rounded-full ${BAR[entry.mode]}`} />
          <div>
            <p className="text-heading">
              <b>{NAME[entry.mode]}</b>{` · ${valueText(entry)}`}
              {entry.interrupted && <span className="ml-1 text-xs text-muted">(중단됨)</span>}
            </p>
            <p className="text-xs text-muted">
              {`${clockText(entry.startedAt, entry.offsetMinutes)} – ${clockText(entry.endedAt, entry.offsetMinutes)} (${minutesText(entry.endedAt - entry.startedAt)})`}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 5: `DeviationHours.tsx`**

```tsx
import type { DeviationHour } from './summary';

export default function DeviationHours({ hours }: { hours: DeviationHour[] }) {
  if (!hours.length) return <p className="text-sm text-muted">상체 기록이 쌓이면 보여요</p>;
  const peak = Math.max(1, ...hours.map(hour => hour.count));
  const busiest = hours.filter(hour => hour.strong).map(hour => `${hour.hour}시`).join(', ');
  return (
    <div>
      <div className="flex h-24 items-end gap-1" role="img"
        aria-label={busiest ? `기준 이탈이 많은 시간: ${busiest}` : '기준 이탈 기록 없음'}>
        {hours.map(hour => (
          <span key={hour.hour} title={`${hour.hour}시 · ${hour.count}회`}
            className={`flex-1 rounded-t ${hour.strong ? 'bg-danger' : 'bg-danger/25'}`}
            style={{ height: `${Math.max(4, (hour.count / peak) * 100)}%` }} />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted">
        <span>{`${hours[0].hour}시`}</span>
        <span>{`${hours[hours.length - 1].hour}시`}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `node --test tests/dashboard-ui.test.mjs`
Expected: PASS (2 tests)

Run: `npm run typecheck && npm run lint`
Expected: 둘 다 오류 없이 종료

- [ ] **Step 7: 커밋**

```bash
git add front/src/features/dashboard/DayDetail.tsx front/src/features/dashboard/TodayTimeline.tsx front/src/features/dashboard/DeviationHours.tsx front/tests/dashboard-ui.test.mjs
git commit -m "feat(dashboard): 날짜별 상자·오늘 타임라인·이탈 시간대 카드" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: 7일 점수 그래프 `WeeklyScoreChart.tsx`

**Files:**
- Create: `front/src/features/dashboard/WeeklyScoreChart.tsx`

- [ ] **Step 1: 구현**

```tsx
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import DayDetail from './DayDetail';
import { dayLabel } from './format';
import type { DashboardDay } from './summary';

const LINES = [
  { key: 'turtle', name: '목', color: 'var(--color-mode-upper)' },
  { key: 'shoulder', name: '어깨', color: 'var(--color-mode-shoulder)' },
  { key: 'keyboard', name: '키보드', color: 'var(--color-mode-keyboard)' },
] as const;

/** Dots only on recorded days; empty days are skipped and joined (user decision, unlike the hourly statistics chart). */
export default function WeeklyScoreChart({ days, today, floor }: { days: DashboardDay[]; today: string; floor: number }) {
  const data = days.map(day => ({ date: day.date, turtle: day.upper.turtle, shoulder: day.upper.shoulder, keyboard: day.keyboard.score }));
  const ticks = Array.from({ length: Math.round((100 - floor) / 10) + 1 }, (_, index) => floor + index * 10);
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--color-track)" />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
            tickFormatter={(date: string) => dayLabel(date, today)} />
          <YAxis domain={[floor, 100]} ticks={ticks} tickLine={false} axisLine={false} width={36}
            tick={{ fill: 'var(--color-muted)', fontSize: 11 }} />
          <Tooltip cursor={false} filterNull={false} isAnimationActive={false}
            content={({ active, label }) => {
              const day = active ? days.find(item => item.date === label) : undefined;
              return day?.hasRecords ? <DayDetail day={day} /> : null;
            }} />
          {LINES.map(line => (
            <Line key={line.key} dataKey={line.key} name={line.name} type="linear" stroke={line.color} strokeWidth={2.5}
              connectNulls isAnimationActive={false}
              dot={{ r: 4, fill: line.color, stroke: 'var(--color-surface)', strokeWidth: 2 }}
              activeDot={{ r: 6, fill: line.color, stroke: 'var(--color-surface)', strokeWidth: 2 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

`var(--color-mode-*)` 값은 Task 6·7의 `bg-mode-*`, `stroke-mode-*` 유틸리티 클래스가 쓰고 있어서 Tailwind가 CSS 변수를 출력한다.

- [ ] **Step 2: 검사**

Run: `npm run typecheck && npm run lint`
Expected: 둘 다 오류 없이 종료. `content` 콜백 타입 오류가 나면 매개변수를 `(props: { active?: boolean; label?: unknown })`로 적고 `days.find(item => item.date === props.label)`로 바꾼다.

- [ ] **Step 3: 커밋**

```bash
git add front/src/features/dashboard/WeeklyScoreChart.tsx
git commit -m "feat(dashboard): 최근 7일 점수 그래프" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: 모드 카드 3개 `ModeCards.tsx`

**Files:**
- Create: `front/src/features/dashboard/ModeCards.tsx`

- [ ] **Step 1: 구현**

```tsx
import { Activity, Eye, Keyboard } from 'lucide-react';
import ModeCard from './ModeCard';
import PlayButton from './PlayButton';
import ScoreRing from './ScoreRing';
import Sparkline from './Sparkline';
import { SourceError, SourceLoading } from './SourceState';
import type { SourceStatus } from './SourceState';
import { minutesText, rateText } from './format';
import type { DashboardSummary } from './summary';

interface CardProps { summary: DashboardSummary; status: SourceStatus; onRetry: () => void; className?: string }

const caption = (recent: boolean, todayPresent: boolean, text: string) =>
  !recent ? '아직 기록 없음' : !todayPresent ? '오늘 기록 없음' : text;

export function UpperCard({ summary, status, onRetry, className = '' }: CardProps) {
  const today = summary.today.upper;
  return (
    <ModeCard className={className} title="상체" subtitle="목과 어깨를 함께 봐요" icon={<Activity size={18} />}
      iconClass="bg-mode-upper-soft text-mode-upper"
      action={<PlayButton modeId="upper_body" label="상체 측정 시작" colorClass="bg-mode-upper" />}>
      {status === 'loading' ? <SourceLoading /> : status === 'error' ? <SourceError onRetry={onRetry} /> : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-4">
            <ScoreRing value={today.turtle} strokeClass="stroke-mode-upper" label="목" />
            <ScoreRing value={today.shoulder} strokeClass="stroke-mode-shoulder" label="어깨" />
          </div>
          <div className="flex flex-col items-end gap-1 text-right">
            <Sparkline label="최근 7일 목·어깨 점수" lines={[
              { values: summary.days.map(day => day.upper.turtle), strokeClass: 'stroke-mode-upper' },
              { values: summary.days.map(day => day.upper.shoulder), strokeClass: 'stroke-mode-shoulder' },
            ]} />
            <p className="text-xs text-muted">
              {caption(summary.recent.upper, today.sessions > 0, `오늘 ${minutesText(today.runMs)} · 기준 이탈 ${today.deviations}회`)}
            </p>
          </div>
        </div>
      )}
    </ModeCard>
  );
}

export function KeyboardCard({ summary, status, onRetry, className = '' }: CardProps) {
  const today = summary.today.keyboard;
  return (
    <ModeCard className={className} title="키보드" icon={<Keyboard size={18} />}
      iconClass="bg-mode-keyboard-soft text-mode-keyboard"
      action={<PlayButton modeId="keyboard" label="키보드 측정 시작" colorClass="bg-mode-keyboard" />}>
      {status === 'loading' ? <SourceLoading /> : status === 'error' ? <SourceError onRetry={onRetry} /> : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ScoreRing value={today.score} strokeClass="stroke-mode-keyboard" label="손가락" />
          <div className="flex flex-col items-end gap-1 text-right">
            <Sparkline label="최근 7일 키보드 점수"
              lines={[{ values: summary.days.map(day => day.keyboard.score), strokeClass: 'stroke-mode-keyboard' }]} />
            <p className="text-xs text-muted">{caption(summary.recent.keyboard, today.present, `오늘 ${minutesText(today.runMs)}`)}</p>
            {today.present && today.coverage !== null && (
              <p className="text-xs text-muted">{`판정 가능 ${Math.round(today.coverage)}%`}</p>
            )}
          </div>
        </div>
      )}
    </ModeCard>
  );
}

export function EyeCard({ summary, status, onRetry, className = '' }: CardProps) {
  const today = summary.today.eye;
  return (
    <ModeCard className={className} title="안구" icon={<Eye size={18} />}
      iconClass="bg-mode-eye-soft text-mode-eye"
      action={<PlayButton modeId="eye" label="안구 측정 시작" colorClass="bg-mode-eye" />}>
      {status === 'loading' ? <SourceLoading /> : status === 'error' ? <SourceError onRetry={onRetry} /> : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2" aria-label={`오늘 깜빡임 ${rateText(today.rate)}`}>
            <span className="text-3xl font-extrabold text-heading">{today.rate === null ? '—' : Math.round(today.rate)}</span>
            <span className="text-xs leading-tight text-muted">회/분<br />깜빡임</span>
          </p>
          <div className="flex flex-col items-end gap-1 text-right">
            <Sparkline label="최근 7일 깜빡임 빈도"
              lines={[{ values: summary.days.map(day => day.eye.rate), strokeClass: 'stroke-mode-eye' }]} />
            <p className="text-xs text-muted">{caption(summary.recent.eye, today.present, `오늘 ${minutesText(today.runMs)}`)}</p>
            {today.present && <p className="text-xs text-muted">{`휴식 ${today.breaks}회`}</p>}
          </div>
        </div>
      )}
    </ModeCard>
  );
}
```

- [ ] **Step 2: 검사**

Run: `npm run typecheck && npm run lint`
Expected: 둘 다 오류 없이 종료

- [ ] **Step 3: 커밋**

```bash
git add front/src/features/dashboard/ModeCards.tsx
git commit -m "feat(dashboard): 상체·키보드·안구 모드 카드" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: 데이터 불러오기 훅 `useDashboardData.ts`

**Files:**
- Create: `front/src/features/dashboard/useDashboardData.ts`

- [ ] **Step 1: 구현**

```ts
import { useCallback, useMemo } from 'react';
import type { PostureRecord } from '../../../../database/contracts';
import type { EyeRecord } from '../../../../database/eye';
import { getCurrentUser } from '../../utils/authStore';
import { recordsApi, recordValue } from '../records/api';
import { useRecordQuery } from '../records/useRecordQuery';
import { todayDateKey } from '../records/views';
import type { SourceStatus } from './SourceState';
import { buildDashboard, dashboardDates } from './summary';

const LOGIN_REQUIRED = '로그인하면 이 계정의 기록을 볼 수 있어요.';
const statusOf = (query: { loading: boolean; error: string | null }): SourceStatus =>
  query.loading ? 'loading' : query.error ? 'error' : 'ready';

/** Loads the four dashboard sources in parallel; summary.ts does all calculation. */
export function useDashboardData() {
  const owner = getCurrentUser()?.id ?? '';
  const today = todayDateKey();
  const from = dashboardDates(today)[0];

  const loadPosture = useCallback(async () => {
    if (!owner) throw new Error(LOGIN_REQUIRED);
    return recordValue(recordsApi().statistics({ owner, from, to: today }));
  }, [owner, from, today]);
  const loadEye = useCallback(async () => {
    if (!owner) throw new Error(LOGIN_REQUIRED);
    return recordValue(recordsApi().eyeStatistics({ owner, from, to: today }));
  }, [owner, from, today]);
  const loadKeyboard = useCallback(async () => {
    if (!owner) throw new Error(LOGIN_REQUIRED);
    return recordValue(recordsApi().keyboardStatistics({ owner, from, to: today }));
  }, [owner, from, today]);
  const loadHistory = useCallback(async () => {
    if (!owner) throw new Error(LOGIN_REQUIRED);
    const records: (PostureRecord | EyeRecord)[] = [];
    for (;;) {
      const page = await recordValue(recordsApi().history({ owner, from: today, to: today, offset: records.length }));
      records.push(...page.records);
      if (!page.hasMore || !page.records.length) return records;
    }
  }, [owner, today]);

  const key = `${owner}:${today}`;
  const posture = useRecordQuery('dashboard-posture:' + key, loadPosture);
  const eye = useRecordQuery('dashboard-eye:' + key, loadEye);
  const keyboard = useRecordQuery('dashboard-keyboard:' + key, loadKeyboard);
  const history = useRecordQuery('dashboard-history:' + key, loadHistory);

  const summary = useMemo(
    () => buildDashboard({ today, posture: posture.data, eye: eye.data, keyboard: keyboard.data, history: history.data }),
    [today, posture.data, eye.data, keyboard.data, history.data],
  );
  return {
    today,
    summary,
    status: { posture: statusOf(posture), eye: statusOf(eye), keyboard: statusOf(keyboard), history: statusOf(history) },
    retry: () => { posture.retry(); eye.retry(); keyboard.retry(); history.retry(); },
  };
}
```

- [ ] **Step 2: 검사**

Run: `npm run typecheck && npm run lint`
Expected: 둘 다 오류 없이 종료

- [ ] **Step 3: 커밋**

```bash
git add front/src/features/dashboard/useDashboardData.ts
git commit -m "feat(dashboard): 대시보드 네 출처 동시 불러오기 훅" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: 대시보드 화면 조립 `Dashboard.tsx`

**Files:**
- Modify: `front/src/pages/Dashboard.tsx` (파일 전체 교체)
- 그대로: `front/src/components/ModeSelector.tsx` (import만 빠지고 파일은 남긴다)

- [ ] **Step 1: 파일 전체를 아래로 바꾼다**

```tsx
import DeviationHours from '../features/dashboard/DeviationHours';
import { EyeCard, KeyboardCard, UpperCard } from '../features/dashboard/ModeCards';
import { SourceError, SourceLoading } from '../features/dashboard/SourceState';
import TodayTimeline from '../features/dashboard/TodayTimeline';
import WeeklyScoreChart from '../features/dashboard/WeeklyScoreChart';
import { headerDate, minutesText } from '../features/dashboard/format';
import { useDashboardData } from '../features/dashboard/useDashboardData';

const CARD = 'rounded-2xl border border-border bg-surface p-4';
const LEGEND = [
  { name: '목', dot: 'bg-mode-upper' },
  { name: '어깨', dot: 'bg-mode-shoulder' },
  { name: '키보드', dot: 'bg-mode-keyboard' },
];

const Dashboard = () => {
  const { today, summary, status, retry } = useDashboardData();
  const scoresLoading = status.posture === 'loading' || status.keyboard === 'loading';
  const scoresFailed = status.posture === 'error' && status.keyboard === 'error';
  const scoresPartial = !scoresFailed && (status.posture === 'error' || status.keyboard === 'error');
  const observedReady = status.posture === 'ready' && status.keyboard === 'ready' && status.eye === 'ready';
  const timelineLoading = status.history === 'loading' || status.keyboard === 'loading';
  const timelineFailed = status.history === 'error' || status.keyboard === 'error';

  return (
    <div className="space-y-4 pb-4">
      <header>
        <h1 className="text-2xl font-extrabold text-heading">무엇을 모니터링 할까요?</h1>
        <p className="mt-1 text-sm text-muted">
          {observedReady ? `${headerDate(today)} · 오늘 관찰 ${minutesText(summary.today.totalMs)}` : headerDate(today)}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <UpperCard className="col-span-2" summary={summary} status={status.posture} onRetry={retry} />
        <KeyboardCard summary={summary} status={status.keyboard} onRetry={retry} />
        <EyeCard summary={summary} status={status.eye} onRetry={retry} />

        <section aria-label="최근 7일 점수" className={`${CARD} col-span-2 flex flex-col gap-3 lg:col-span-4 xl:col-span-3 xl:row-span-2`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold text-heading">최근 7일 점수</h2>
            <ul className="flex flex-wrap items-center gap-3 text-xs text-muted">
              {LEGEND.map(item => (
                <li key={item.name} className="flex items-center gap-1">
                  <span aria-hidden="true" className={`h-2 w-2 rounded-full ${item.dot}`} />{item.name}
                </li>
              ))}
              <li>안구는 점수가 없어 빠져요</li>
            </ul>
          </div>
          {scoresLoading ? <SourceLoading className="h-72" />
            : scoresFailed ? <SourceError onRetry={retry} />
            : summary.hasScores ? <WeeklyScoreChart days={summary.days} today={today} floor={summary.chartFloor} />
            : <p className="flex h-72 items-center justify-center text-sm text-muted">측정을 시작하면 최근 7일 점수가 여기에 보여요</p>}
          {scoresPartial && <SourceError onRetry={retry} />}
          <p className="text-xs text-muted">점수는 기준 자세와의 화면상 유사도와 손가락 사용 점수예요. 의학적 진단이 아니에요.</p>
        </section>

        <section aria-label="오늘 타임라인" className={`${CARD} col-span-1 space-y-3 lg:col-span-2 xl:col-span-1`}>
          <h2 className="font-bold text-heading">오늘 타임라인</h2>
          {timelineLoading ? <SourceLoading className="h-24" />
            : timelineFailed && !summary.timeline.length ? <SourceError onRetry={retry} />
            : <TodayTimeline entries={summary.timeline} />}
          {!timelineLoading && timelineFailed && summary.timeline.length > 0 && <SourceError onRetry={retry} />}
        </section>

        <section aria-label="기준 이탈이 잦은 시간" className={`${CARD} col-span-1 space-y-3 lg:col-span-2 xl:col-span-1`}>
          <div>
            <h2 className="font-bold text-heading">기준 이탈이 잦은 시간</h2>
            <p className="text-xs text-muted">최근 7일 · 상체</p>
          </div>
          {status.posture === 'loading' ? <SourceLoading className="h-24" />
            : status.posture === 'error' ? <SourceError onRetry={retry} />
            : <DeviationHours hours={summary.deviationHours} />}
        </section>
      </div>
    </div>
  );
};

export default Dashboard;
```

- [ ] **Step 2: 검사와 전체 프론트 테스트**

Run: `npm run typecheck && npm run lint && npm test`
Expected: 모두 통과. 테스트 수는 기존 개수에 이번 15개(format 3, summary 10, ui 2)가 더해진다.

- [ ] **Step 3: `ModeSelector.tsx`가 남아 있는지 확인**

Run: `git status --short front/src/components/ModeSelector.tsx`
Expected: 출력 없음(삭제·변경 없음)

- [ ] **Step 4: 커밋**

```bash
git add front/src/pages/Dashboard.tsx
git commit -m "feat(dashboard): 데이터 위젯 대시보드 화면 조립" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: 문서 갱신 `docs/architecture.md`

**Files:**
- Modify: `docs/architecture.md` (파일 구조 표)

- [ ] **Step 1: 표의 다음 두 줄을 바꾼다**

이 줄을:

```markdown
| `front/src/styles/tokens.css` | 공통 색상, 의미별 CSS 변수, 다크 테마 |
| `front/src/components/Button.tsx`, `Sidebar.tsx`, `ModeSelector.tsx` | 공유 UI. 새 화면은 공통 토큰/컴포넌트부터 사용 |
```

아래로 바꾼다:

```markdown
| `front/src/styles/tokens.css` | 공통 색상, 의미별 CSS 변수, 다크 테마, 대시보드 모드 색(`mode-*`)·`track`·`nav-active` |
| `front/src/components/Button.tsx`, `Sidebar.tsx`, `ModeSelector.tsx` | 공유 UI. 새 화면은 공통 토큰/컴포넌트부터 사용. `ModeSelector`는 2026-10-06 대시보드 개편 뒤 쓰지 않지만 되돌리기용으로 남김 |
| `front/src/pages/Dashboard.tsx`, `front/src/features/dashboard/` | 데이터 위젯 대시보드. `summary.ts`는 기존 기록 API 응답에서 모드별 최신 정책 묶음만으로 카드·7일 그래프·타임라인·이탈 시간대를 계산하는 순수 함수, `useDashboardData.ts`가 네 출처를 불러옴. [설계](superpowers/specs/2026-10-06-dashboard-redesign-design.md) |
```

- [ ] **Step 2: 커밋**

```bash
git add docs/architecture.md
git commit -m "docs(architecture): 대시보드 구조 항목 추가" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: 전체 검사와 빌드

**Files:** 없음 (검사만)

- [ ] **Step 1: 저장소 전체 검사**

저장소 루트에서 PowerShell로 실행한다:

Run: `.\moti.cmd check`
Expected: 프론트 타입·린트·테스트, 서버 빌드·테스트, Python 검사가 모두 통과한다. 실패하면 출력 전문을 기록하고, 이번 변경과 관련된 실패만 고친다.

- [ ] **Step 2: 프론트 빌드**

`front/`에서 실행한다:

Run: `npm run build`
Expected: UI와 Electron 빌드가 성공한다. 기존에 있던 큰 청크 경고와 records 정적/동적 import 안내는 남아도 된다(docs/development.md에 기록된 기존 경고).

- [ ] **Step 3: 고친 것이 있으면 커밋**

Step 1·2에서 고친 파일만 경로를 적어 add한다. 아래는 summary.ts를 고친 경우의 예시다. 고친 것이 없으면 이 단계는 건너뛴다.

```bash
git add front/src/features/dashboard/summary.ts
git commit -m "fix(dashboard): 전체 검사에서 나온 문제 수정" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: 실제 앱 확인 (사용자와 함께)

**Files:** 없음. 결과는 사용자에게 보고한다.

로그인은 사용자 계정이 필요하므로 사용자가 직접 로그인한다. 배포 DB에 테스트 기록을 새로 쓰지 않는다.

- [ ] **Step 1: 앱 실행**

저장소 루트에서 실행한다:

Run: `.\moti.cmd`
Expected: 개발 서버와 Moti Electron 창이 뜬다.

- [ ] **Step 2: 사용자에게 로그인을 요청하고 확인 항목을 함께 본다**

1. 대시보드에 카드 3개(상체, 키보드, 안구), 최근 7일 점수, 오늘 타임라인, 기준 이탈이 잦은 시간이 보인다.
2. 재생 버튼 3개에 마우스를 올리면 "상체 측정 시작" 같은 설명이 뜨고, 누르면 해당 측정 화면으로 이동한다.
3. 그래프에서 기록이 있는 날에만 점이 있고, 빈 날은 선이 이어서 지나간다. 날짜에 마우스를 올리면 그날 기록한 모드만 보이고, 기록이 없는 날은 아무것도 안 뜬다.
4. 오늘 목·어깨 점수가 통계 화면(오늘, 목·어깨)의 평균 기준 자세 유사도와 같다(반올림 차이만 허용).
5. 오늘 타임라인 항목이 학습이력의 오늘 기록과 같다(상체는 목·어깨가 한 줄).
6. 설정에서 다크 테마로 바꾸면 대시보드와 사이드바가 다크 색으로 바뀐다.
7. 창 폭을 1280px 이상, 기본(1100px), 최소(800px)로 바꾸면 설계 4.2절대로 배치가 바뀌고, 글자가 잘리거나 겹치지 않는다.
8. 다른 화면(통계, 학습이력, 설정)이 깨지지 않는다(배경·테두리·제목색만 조금 바뀜).

- [ ] **Step 3: 결과 보고**

통과·실패 항목과 캡처를 사용자에게 보여준다. 실패 항목은 원인과 수정안을 함께 적는다. 고친 경우 Task 13 검사를 다시 실행하고 커밋한다.
