# 통계·학습이력 개편 (UI 개편 2차) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 통계(상체·키보드·안구 탭, 7/30일 기간 비교)와 학습이력(주간·월간 달력, 기록 줄, 오른쪽 상세, 기록 없는 날)을 확정된 데이터 위젯 시안대로 바꾼다.

**Architecture:** 대시보드의 순수 계산 함수 `features/dashboard/summary.ts`를 넓혀(날짜 helper, 정책 묶음 고르기, 날짜별 값, 날짜별 기록 줄) 새 폴더 `features/statistics/`와 `features/history/`의 순수 계산(`period.ts`, `calendar.ts`)이 같이 쓴다. 불러오기 훅이 기존 `recordsApi()`로 데이터를 가져오고, 화면 부품은 계산 결과와 콜백만 받는다. 키보드 통계는 계산 코드를 그대로 두고 모양만 바꾼다. 서버, `database/` 계약, 측정 화면은 바꾸지 않는다.

**Tech Stack:** React 19, TypeScript(`verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUnusedLocals`), Tailwind CSS v4(`@theme` 토큰), recharts 3.8, lucide-react, react-router-dom 7(HashRouter), `node --test`(Node 내장 TS 실행), esbuild + `react-dom/server`(UI SSR 테스트).

**설계 문서:** [docs/superpowers/specs/2026-10-06-stats-history-redesign-design.md](../specs/2026-10-06-stats-history-redesign-design.md) (확정본 `cc4ba54`)

---

## 작업 전 공통 규칙

- 브랜치는 `feat/stats-history-redesign`이다. push, PR 생성, 배포는 하지 않는다.
- **기존 파일은 삭제하지 않는다.** `features/records/StatisticsData.tsx`, `features/eye/EyeStatistics.tsx`, `EyeRecordData.tsx`의 `EyeStatisticsData`, `features/records/views.ts`의 `historyView`·`historyGraph`는 쓰지 않게 되지만 되돌리기용으로 그대로 둔다. 팀원 테스트(`record-ui.test.mjs`, `eye-record-ui.test.mjs`)는 고치지 않는다.
- 배포 DB(`moti_demo`)에 테스트 기록을 쓰지 않는다. 계산은 가짜 데이터 테스트로만 검증한다.
- 명령은 별도 표시가 없으면 `front/` 폴더에서 실행한다. Node 24.11에서 `.ts`를 바로 import한다. 시작 시점 `npm test`는 141개 통과다.
- Node 테스트가 직접 import하는 `.ts` 파일(`summary.ts`, `format.ts`, `period.ts`, `text.ts`, `calendar.ts`, `currentPolicies.ts`, `detail.ts`)은 다른 모듈을 **`.ts` 확장자를 붙여** import한다(타입 전용 import는 예외).
- 이 세션은 사용자 요청 없이 하위 에이전트를 띄우지 않으므로 executing-plans 방식(이 세션에서 순서대로)으로 진행한다.
- 커밋 메시지 끝에는 항상 다음 줄을 붙인다.

```
Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
```

## 파일 구조

| 파일 | 상태 | 책임 |
| --- | --- | --- |
| `front/src/features/dashboard/summary.ts` | 바꿈 | 날짜 helper(`shiftDate`, `periodDates`, `pastDateOrNull`), `latestPolicyGroups`, `dayValues`, `scoreFloor`, `dayEntries`(정책 거르기 선택, `source` 포함) 내보내기. 대시보드 결과는 그대로 |
| `front/src/features/dashboard/format.ts` | 바꿈 | `monthDayText`("9월 30일") 추가 |
| `front/src/features/dashboard/useDashboardData.ts` | 바꿈 | `LOGIN_REQUIRED`, `statusOf` 내보내기 |
| `front/src/features/dashboard/DayDetail.tsx` | 바꿈 | 선택 속성 `hint` |
| `front/src/features/dashboard/ScoreRing.tsx` | 바꿈 | 선택 속성 `unit`(`'점'`/`'%'`) |
| `front/src/components/layout/AppLayout.tsx` | 바꿈 | `/statistics`, `/history`도 넓은 폭 |
| `front/src/features/statistics/period.ts` | 새로 | 통계 기간·상체·안구 계산(순수 함수) |
| `front/src/features/statistics/text.ts` | 새로 | 비교 칩·퍼센트·기간 문자열 |
| `front/src/features/statistics/StatTile.tsx` | 새로 | 숫자 칸 |
| `front/src/features/statistics/parts.tsx` | 새로 | 카드 제목, 그래프 머리, 빈 안내, 학습이력 링크 |
| `front/src/features/statistics/DailyChart.tsx` | 새로 | 날짜별 그래프(흐린 날짜, 날짜 상자, 누르기) |
| `front/src/features/statistics/HourlyChart.tsx` | 새로 | 작은 시간대 그래프 |
| `front/src/features/statistics/UpperPanel.tsx`, `EyePanel.tsx` | 새로 | 상체·안구 탭 |
| `front/src/features/statistics/useStatisticsData.ts` | 새로 | 세 출처 불러오기 + 계산 연결 |
| `front/src/features/keyboard/KeyboardStatistics.tsx` | 바꿈 | 계산 그대로, props로 데이터 받기, 새 부품으로 모양 변경, 세션 목록 제거 |
| `front/src/pages/Statistics.tsx` | 바꿈 | 통계 화면 조립 |
| `front/src/features/history/currentPolicies.ts` | 새로 | 지금 앱 정책 버전과 "이전 기준" 판단 |
| `front/src/features/history/calendar.ts` | 새로 | 주·월 날짜, 불러올 범위, 이동, 기록 줄, 달력 칸, 앞뒤 기록(순수 함수) |
| `front/src/features/history/detail.ts` | 새로 | 상체 상세의 분별 점수와 숫자 칸 값(순수 함수) |
| `front/src/features/history/labels.ts` | 새로 | 모드 이름·색, 이전 기준 안내 문구 |
| `front/src/features/history/useRecordDetail.ts` | 새로 | 고른 기록의 상세 불러오기 |
| `front/src/features/history/HistoryCalendar.tsx`, `DayRecords.tsx`, `EmptyDay.tsx`, `RecordDetail.tsx` | 새로 | 달력, 기록 목록, 기록 없는 날, 오른쪽 상세 |
| `front/src/features/history/useHistoryData.ts` | 새로 | 학습이력·키보드 기록 불러오기 + 날짜별 기록 줄 |
| `front/src/pages/LearningHistory.tsx` | 바꿈 | 학습이력 화면 조립 |
| `front/tests/dashboard-summary.test.mjs`, `dashboard-format.test.mjs`, `dashboard-ui.test.mjs` | 바꿈 | 새 helper·선택 속성 테스트 추가 |
| `front/tests/statistics-period.test.mjs`, `history-calendar.test.mjs`, `stats-history-ui.test.mjs` | 새로 | 계산·화면 부품 테스트 |
| `docs/architecture.md`, `database/README.md`, `front/src/features/keyboard/README.md`, 설계 문서 | 바꿈 | 새 구조와 키보드 세션 상세 위치 |

---

### Task 1: 대시보드 계산 함수 넓히기

**Files:**
- Modify: `front/src/features/dashboard/summary.ts` (전체 교체)
- Modify: `front/src/features/dashboard/format.ts` (끝에 함수 추가)
- Modify: `front/src/features/dashboard/useDashboardData.ts:11-13`
- Test: `front/tests/dashboard-summary.test.mjs`, `front/tests/dashboard-format.test.mjs`

- [ ] **Step 1: 실패하는 테스트 쓰기**

`front/tests/dashboard-summary.test.mjs` 3행 import를 바꾼다.

```js
import { buildDashboard, dashboardDates, dayEntries, pastDateOrNull, periodDates, sessionIdOf, shiftDate } from '../src/features/dashboard/summary.ts';
```

같은 파일 맨 끝에 추가한다.

```js
test('date helpers shift across months, build periods of any length and accept only real past dates', () => {
  assert.equal(shiftDate('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftDate('2025-12-31', 1), '2026-01-01');
  assert.deepEqual(periodDates('2026-10-06', 3), ['2026-10-04', '2026-10-05', '2026-10-06']);
  assert.equal(periodDates('2026-10-06', 30)[0], '2026-09-07');
  assert.equal(pastDateOrNull('2026-10-02', TODAY), '2026-10-02');
  assert.equal(pastDateOrNull('2026-10-07', TODAY), null);
  assert.equal(pastDateOrNull('2026-02-30', TODAY), null);
  assert.equal(pastDateOrNull('10/02', TODAY), null);
  assert.equal(pastDateOrNull(null, TODAY), null);
});

test('day entries without a filter keep every policy and expose the stored records', () => {
  const old = postureRecord({ id: 'old:turtle', scorePolicyVersion: 'reference-similarity-turtle-v1' });
  const entries = dayEntries([old, postureRecord()], [], TODAY);
  assert.deepEqual(entries.map(entry => entry.id), ['old', 's1']);
  assert.equal(entries[0].source.mode, 'upper');
  assert.deepEqual(entries[0].source.records, [old]);
});
```

`front/tests/dashboard-format.test.mjs` 3행 import에 `monthDayText`를 더하고, 첫 테스트 끝(`dayLabel` 두 줄 다음)에 한 줄을 추가한다.

```js
import { headerDate, longDate, dayLabel, minutesText, clockText, scoreText, rateText, monthDayText } from '../src/features/dashboard/format.ts';
```

```js
  assert.equal(monthDayText('2026-09-30'), '9월 30일');
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/dashboard-summary.test.mjs tests/dashboard-format.test.mjs`
Expected: FAIL — `shiftDate`·`monthDayText` 등을 export하지 않는다는 `SyntaxError`(파일 전체 실패)

- [ ] **Step 3: `summary.ts` 전체 교체**

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
/** Stored records behind one timeline row. The dashboard ignores it; the history screen reads it. */
export type EntrySource =
  | { mode: 'upper'; records: PostureRecord[] }
  | { mode: 'keyboard'; stored: KeyboardStored }
  | { mode: 'eye'; record: EyeRecord };
export interface TimelineEntry {
  id: string; mode: 'upper' | 'keyboard' | 'eye';
  startedAt: number; endedAt: number; offsetMinutes: number;
  turtle: number | null; shoulder: number | null; score: number | null; rate: number | null;
  interrupted: boolean;
  source: EntrySource;
}
export interface DeviationHour { hour: number; count: number; strong: boolean }
/** Rows (keyboard: records) of the latest policy group of each mode. */
export interface PolicyGroups { turtle: StatisticsRow[]; shoulder: StatisticsRow[]; eye: EyeStatisticsRow[]; keyboard: KeyboardStored[] }
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

/** `date` moved by `days` calendar days (YYYY-MM-DD, UTC arithmetic so the local time zone never shifts it). */
export function shiftDate(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** `days` dates ending at `end`, oldest first. */
export function periodDates(end: string, days: number) {
  return Array.from({ length: days }, (_, index) => shiftDate(end, index - (days - 1)));
}

/** Six days before today through today, oldest first. */
export function dashboardDates(today: string) {
  return periodDates(today, DASHBOARD_DAYS);
}

/** A real YYYY-MM-DD date that is not after `today`, else null (dates read from the address bar). */
export function pastDateOrNull(value: string | null, today: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const real = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return real && value <= today ? value : null;
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

/** Each mode keeps only the policy group of its latest row (keyboard: latest updated record). */
export function latestPolicyGroups(input: Pick<DashboardInput, 'posture' | 'eye' | 'keyboard'>): PolicyGroups {
  const posture = input.posture ?? [];
  return {
    turtle: latestGroup(posture.filter(row => row.mode === 'turtle'), statisticsKey),
    shoulder: latestGroup(posture.filter(row => row.mode === 'shoulder'), statisticsKey),
    eye: latestGroup(input.eye ?? [], row => row.policyVersion),
    keyboard: latestKeyboard(input.keyboard ?? []),
  };
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

/** One date's values from already selected policy groups. */
export function dayValues(groups: PolicyGroups, date: string): DashboardDay {
  const upper = upperDay(groups.turtle, groups.shoulder, date);
  const typing = keyboardDay(groups.keyboard, date);
  const eyes = eyeDay(groups.eye, date);
  return { date, upper, keyboard: typing, eye: eyes, totalMs: upper.runMs + typing.runMs + eyes.runMs,
    hasRecords: upper.sessions > 0 || typing.present || eyes.present };
}

/** Lowest score rounded down to ten and kept below 100; 0 without scores. */
export function scoreFloor(scores: number[]) {
  return scores.length ? Math.min(90, Math.max(0, Math.floor(Math.min(...scores) / 10) * 10)) : 0;
}

interface TimelineFilter { turtle: string | null; shoulder: string | null; eye: string | null }

/**
 * Rows that started on `date`, in start order: one per upper session, keyboard and eye record.
 * Without `accept` every policy is kept (history). With it, records outside the selected groups are dropped
 * (dashboard); a null key accepts all.
 */
export function dayEntries(history: (PostureRecord | EyeRecord)[], keyboard: KeyboardStored[], date: string,
  accept?: TimelineFilter): TimelineEntry[] {
  const startsOnDate = (record: { startedAt: number; offsetMinutes: number }) =>
    localDateKey(record.startedAt, record.offsetMinutes) === date;
  const entries: TimelineEntry[] = [];
  const upper = new Map<string, PostureRecord[]>();
  for (const record of history) {
    if (!startsOnDate(record)) continue;
    if (record.mode === 'eye') {
      if (accept && accept.eye !== null && record.policyVersion !== accept.eye) continue;
      entries.push({ id: record.id, mode: 'eye', startedAt: record.startedAt, endedAt: record.startedAt + record.runMs,
        offsetMinutes: record.offsetMinutes, turtle: null, shoulder: null, score: null, rate: eyeRate(record),
        interrupted: record.status === 'interrupted', source: { mode: 'eye', record } });
      continue;
    }
    const selected = accept ? (record.mode === 'turtle' ? accept.turtle : accept.shoulder) : null;
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
      interrupted: records.some(record => record.status === 'interrupted'), source: { mode: 'upper', records } });
  }
  for (const stored of keyboard) {
    if (!startsOnDate(stored.record)) continue;
    entries.push({ id: stored.record.id, mode: 'keyboard', startedAt: stored.record.startedAt, endedAt: stored.record.updatedAt,
      offsetMinutes: stored.record.offsetMinutes, turtle: null, shoulder: null,
      score: keyboardSummary(stored.counts, stored.record.nearbyCredit).score, rate: null,
      interrupted: stored.record.status === 'interrupted', source: { mode: 'keyboard', stored } });
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

export function buildDashboard(input: DashboardInput): DashboardSummary {
  const dates = dashboardDates(input.today);
  const groups = latestPolicyGroups(input);
  const days = dates.map(date => dayValues(groups, date));
  const scores = days.flatMap(day => [day.upper.turtle, day.upper.shoulder, day.keyboard.score])
    .filter((value): value is number => value !== null);
  return {
    dates, days, today: days[days.length - 1],
    timeline: dayEntries(input.history ?? [], groups.keyboard, input.today, {
      turtle: groups.turtle[0] ? statisticsKey(groups.turtle[0]) : null,
      shoulder: groups.shoulder[0] ? statisticsKey(groups.shoulder[0]) : null,
      eye: groups.eye[0]?.policyVersion ?? null,
    }),
    deviationHours: deviationHours([...groups.turtle, ...groups.shoulder]),
    chartFloor: scoreFloor(scores),
    hasScores: scores.length > 0,
    recent: { upper: groups.turtle.length + groups.shoulder.length > 0, keyboard: groups.keyboard.length > 0, eye: groups.eye.length > 0 },
  };
}
```

- [ ] **Step 4: `format.ts` 끝에 추가**

```ts
/** "9월 30일" */
export function monthDayText(date: string) {
  const [, month, day] = parts(date);
  return `${month}월 ${day}일`;
}
```

- [ ] **Step 5: `useDashboardData.ts` 11~13행을 내보내기로 바꾸기**

```ts
export const LOGIN_REQUIRED = '로그인하면 이 계정의 기록을 볼 수 있어요.';
export const statusOf = (query: { loading: boolean; error: string | null }): SourceStatus =>
  query.loading ? 'loading' : query.error ? 'error' : 'ready';
```

- [ ] **Step 6: 통과 확인**

Run: `node --test tests/dashboard-summary.test.mjs tests/dashboard-format.test.mjs tests/dashboard-ui.test.mjs`
Expected: PASS (기존 테스트 전부 + 새 2개)

Run: `npm run typecheck`
Expected: 오류 없이 종료

- [ ] **Step 7: 커밋**

```bash
git add src/features/dashboard/summary.ts src/features/dashboard/format.ts src/features/dashboard/useDashboardData.ts tests/dashboard-summary.test.mjs tests/dashboard-format.test.mjs
git commit -m "refactor(dashboard): 통계·학습이력이 쓸 날짜·정책 묶음·기록 줄 함수 내보내기" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 대시보드 부품 선택 속성과 넓은 폭

**Files:**
- Modify: `front/src/features/dashboard/DayDetail.tsx:17-39`
- Modify: `front/src/features/dashboard/ScoreRing.tsx` (전체 교체)
- Modify: `front/src/components/layout/AppLayout.tsx` (전체 교체)
- Test: `front/tests/dashboard-ui.test.mjs`

- [ ] **Step 1: 실패하는 테스트 쓰기**

`front/tests/dashboard-ui.test.mjs`의 `const DeviationHours = ...` 다음 줄에 추가한다.

```js
const ScoreRing = await load('src/features/dashboard/ScoreRing.tsx');
```

파일 끝에 추가한다.

```js
test('day detail can carry a hint line and the ring can show a share in percent', () => {
  const day = { date: '2026-10-04', totalMs: 60_000, hasRecords: true,
    upper: { turtle: 80, shoulder: 88, sessions: 1, runMs: 60_000, deviations: 0 },
    keyboard: { score: null, coverage: null, sessions: 0, runMs: 0, present: false },
    eye: { rate: null, runMs: 0, breaks: 0, present: false } };
  assert.match(html(DayDetail, { day, hint: '눌러서 학습이력 보기 →' }), /눌러서 학습이력 보기 →/);
  assert.doesNotMatch(html(DayDetail, { day }), /학습이력/);
  const ring = html(ScoreRing, { value: 91.6, strokeClass: 'stroke-mode-upper', label: '제대로 측정', unit: '%' });
  assert.match(ring, /aria-label="제대로 측정 92%"/);
  assert.match(ring, />92%</);
  assert.match(html(ScoreRing, { value: 80, strokeClass: 'stroke-mode-upper', label: '목' }), /aria-label="목 80점"/);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/dashboard-ui.test.mjs`
Expected: FAIL — 새 테스트에서 `눌러서 학습이력 보기`를 찾지 못함

- [ ] **Step 3: `DayDetail.tsx` 17~39행 교체**

```tsx
/** Hover box for one chart day: only modes recorded that day, plus total observation and an optional hint. */
export default function DayDetail({ day, hint }: { day: DashboardDay; hint?: string }) {
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
      {hint && <p className="mt-1 text-xs font-semibold text-secondary">{hint}</p>}
    </div>
  );
}
```

- [ ] **Step 4: `ScoreRing.tsx` 전체 교체**

```tsx
const CIRCUMFERENCE = 2 * Math.PI * 16;

/** Ring for a 0–100 value. `unit` '%' is for shares such as properly measured time; scores keep '점'. */
export default function ScoreRing({ value, strokeClass, label, unit = '점' }: {
  value: number | null; strokeClass: string; label: string; unit?: '점' | '%';
}) {
  const filled = value === null ? 0 : (Math.max(0, Math.min(100, value)) / 100) * CIRCUMFERENCE;
  const spoken = value === null ? '기록 없음' : `${Math.round(value)}${unit}`;
  return (
    <figure className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 40 40" className="h-16 w-16" role="img" aria-label={`${label} ${spoken}`}>
        <circle cx="20" cy="20" r="16" fill="none" strokeWidth="5" className="stroke-track" />
        {value !== null && (
          <circle cx="20" cy="20" r="16" fill="none" strokeWidth="5" strokeLinecap="round" className={strokeClass}
            strokeDasharray={`${filled} ${CIRCUMFERENCE}`} transform="rotate(-90 20 20)" />
        )}
        <text x="20" y="20" textAnchor="middle" dominantBaseline="central" fontSize={unit === '%' ? 9 : 11} fontWeight="800"
          className="fill-heading">
          {value === null ? '—' : unit === '%' ? `${Math.round(value)}%` : Math.round(value)}
        </text>
      </svg>
      <figcaption className="text-xs text-muted">{label}</figcaption>
    </figure>
  );
}
```

- [ ] **Step 5: `AppLayout.tsx` 전체 교체**

```tsx
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../Sidebar';

// App routes share one shell; each page owns only the content inside Outlet.
// Data-widget pages (dashboard, statistics, history) need a wider canvas; other pages keep their reading width.
const WIDE_PAGES = ['/dashboard', '/statistics', '/history'];

const AppLayout = () => {
  const wide = WIDE_PAGES.includes(useLocation().pathname);
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

- [ ] **Step 6: 통과 확인**

Run: `node --test tests/dashboard-ui.test.mjs`
Expected: PASS (3 tests)

Run: `npm run typecheck && npm run lint`
Expected: 둘 다 오류 없이 종료

- [ ] **Step 7: 커밋**

```bash
git add src/features/dashboard/DayDetail.tsx src/features/dashboard/ScoreRing.tsx src/components/layout/AppLayout.tsx tests/dashboard-ui.test.mjs
git commit -m "feat(dashboard): 날짜 상자 안내 줄·고리 % 표시 선택 속성과 통계·학습이력 넓은 폭" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 통계 기간 계산 `period.ts`, 표시 문자열 `text.ts`

**Files:**
- Create: `front/src/features/statistics/period.ts`
- Create: `front/src/features/statistics/text.ts`
- Test: `front/tests/statistics-period.test.mjs`

- [ ] **Step 1: 실패하는 테스트 쓰기** — `front/tests/statistics-period.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStatistics, statisticsRange } from '../src/features/statistics/period.ts';
import { changeChip, percentLabel, previousRateChip, rangeText } from '../src/features/statistics/text.ts';

const END = '2026-10-06';
const postureRow = (over = {}) => ({ date: END, hour: '9', mode: 'turtle',
  scorePolicyVersion: 'upper-body-neck-v3-a', habitPolicyVersion: 'weighted-reference-deviation-v3',
  longestContinuousMs: 0, sessionCount: 1, recordIds: ['s1:turtle'],
  runMs: 60_000, validMs: 60_000, scoreTimeSum: 60_000 * 80, deviationMs: 0, deviationEpisodeCount: 0, ...over });
const shoulderRow = (over = {}) => postureRow({ mode: 'shoulder', scorePolicyVersion: 'upper-body-shoulder-v3-b', recordIds: ['s1:shoulder'], ...over });
const eyeRow = (over = {}) => ({ date: END, hour: '13', policyVersion: 'eye-habits-v2', sessionCount: 1,
  runMs: 600_000, validMs: 600_000, blinks: 140, breaks: 2, nearReminders: 1, openReminders: 3, ...over });
const build = (input = {}) => buildStatistics({ end: END, days: 7, posture: [], eye: [], keyboard: [], ...input });

test('the current period ends at the end date and the previous period sits right before it', () => {
  assert.deepEqual(statisticsRange(END, 7), { from: '2026-09-23', to: END,
    dates: ['2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06'],
    previousDates: ['2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29'] });
  const month = statisticsRange('2026-01-10', 30);
  assert.equal(month.dates.length, 30);
  assert.equal(month.dates[0], '2025-12-12');
  assert.equal(month.previousDates[29], '2025-12-11');
  assert.equal(month.from, '2025-11-12');
});

test('upper averages are valid-time weighted and compared as the integers shown', () => {
  const summary = build({ posture: [
    postureRow({ date: '2026-10-05', scoreTimeSum: 60_000 * 90 }),
    postureRow({ date: '2026-10-06', recordIds: ['s2:turtle'], runMs: 180_000, validMs: 180_000, scoreTimeSum: 180_000 * 70 }),
    postureRow({ date: '2026-09-29', recordIds: ['s0:turtle'], scoreTimeSum: 60_000 * 71.5 }),
  ] });
  assert.equal(summary.upper.turtle.current, 75);     // (90 x 1분 + 70 x 3분) / 4분
  assert.equal(summary.upper.turtle.previous, 71.5);
  assert.equal(summary.upper.turtle.change, 3);       // 75 - 72, 보이는 정수끼리
  assert.equal(summary.upper.shoulder.current, null);
  assert.equal(summary.upper.shoulder.change, null);
});

test('policy groups never mix, in the current or the previous period', () => {
  const summary = build({ posture: [
    postureRow({ date: '2026-09-29', scorePolicyVersion: 'upper-body-neck-v3-old', scoreTimeSum: 60_000 * 40 }),
    postureRow({ date: '2026-10-02', scorePolicyVersion: 'upper-body-neck-v3-old', scoreTimeSum: 60_000 * 40 }),
    postureRow({ date: '2026-10-06', scoreTimeSum: 60_000 * 80 }),
  ] });
  assert.equal(summary.upper.turtle.current, 80);
  assert.equal(summary.upper.turtle.previous, null);
  assert.equal(summary.days.find(day => day.date === '2026-10-02').upper.turtle, null);
});

test('sessions count once across neck, shoulder and midnight; time is the daily max of neck and shoulder', () => {
  const upper = build({ posture: [
    postureRow({ date: '2026-10-05', hour: '23', runMs: 120_000, validMs: 90_000, scoreTimeSum: 90_000 * 80,
      longestContinuousMs: 50_000, deviationEpisodeCount: 1, deviationMs: 9_000 }),
    postureRow({ date: '2026-10-06', hour: '0', runMs: 60_000, validMs: 60_000, scoreTimeSum: 60_000 * 80, longestContinuousMs: 50_000 }),
    shoulderRow({ date: '2026-10-05', hour: '23', runMs: 120_000, validMs: 120_000, scoreTimeSum: 120_000 * 90,
      longestContinuousMs: 70_000, deviationEpisodeCount: 2, deviationMs: 3_000 }),
    shoulderRow({ date: '2026-10-06', hour: '0', runMs: 60_000, validMs: 30_000, scoreTimeSum: 30_000 * 90 }),
  ] }).upper;
  assert.equal(upper.sessions, 1);
  assert.equal(upper.runMs, 180_000);                  // 10/5 max(120k, 120k) + 10/6 max(60k, 60k)
  assert.equal(upper.averageMs, 180_000);
  assert.equal(upper.longestMs, 70_000);
  assert.equal(upper.deviations, 3);
  assert.equal(upper.deviationRate, 100 * 12_000 / 300_000);
  assert.equal(upper.validRate, 100 * 300_000 / 360_000);
  assert.equal(Math.round(upper.unmeasuredMs), 30_000);  // 180k x (1 - 300/360)
});

test('hourly scores leave hours without rows empty and span the first to the last hour', () => {
  const summary = build({ posture: [postureRow({ hour: '9' }), postureRow({ hour: '11', scoreTimeSum: 60_000 * 60 })] });
  assert.deepEqual(summary.upper.hourly.map(hour => [hour.hour, hour.turtle, hour.shoulder]),
    [[9, 80, null], [10, null, null], [11, 60, null]]);
  assert.equal(summary.upper.hourlyFloor, 60);
});

test('a zero score day is 0, a day without records is null, and empty input stays empty', () => {
  const summary = build({ posture: [postureRow({ date: '2026-10-04', scoreTimeSum: 0 })] });
  assert.equal(summary.days.find(day => day.date === '2026-10-04').upper.turtle, 0);
  assert.equal(summary.days.find(day => day.date === '2026-10-03').upper.turtle, null);
  const empty = build();
  assert.equal(empty.upper.present, false);
  assert.equal(empty.upper.sessions, 0);
  assert.equal(empty.upper.averageMs, null);
  assert.equal(empty.upper.validRate, null);
  assert.equal(empty.upperFloor, 0);
  assert.deepEqual(empty.upper.hourly, []);
  assert.equal(empty.eye.present, false);
  assert.equal(empty.eyeMax, 20);
});

test('eye rate needs 30 seconds, keeps the previous period as a value and sums the totals', () => {
  const summary = build({ eye: [eyeRow({ hour: '13' }), eyeRow({ hour: '15', blinks: 100 }), eyeRow({ date: '2026-09-29', blinks: 130 })] });
  const eye = summary.eye;
  assert.equal(eye.rate, 12);                          // 240회 / 20분
  assert.equal(eye.previousRate, 13);
  assert.equal(eye.runMs, 1_200_000);
  assert.equal(eye.validMs, 1_200_000);
  assert.equal(eye.breaks, 4);
  assert.equal(eye.nearReminders, 2);
  assert.equal(eye.openReminders, 6);
  assert.equal(eye.validRate, 100);
  assert.deepEqual(eye.hourly.map(hour => [hour.hour, hour.rate]), [[13, 14], [14, null], [15, 10]]);
  assert.equal(eye.hourlyMax, 20);
  assert.equal(summary.eyeMax, 20);
  const short = build({ eye: [eyeRow({ validMs: 29_000, blinks: 10 })] }).eye;
  assert.equal(short.rate, null);
  assert.equal(short.present, true);
});

test('chips compare shown integers, the eye chip shows the previous value only', () => {
  assert.deepEqual(changeChip({ current: 84, previous: 81, change: 3 }, 7), { text: '직전 7일보다 +3', tone: 'good' });
  assert.deepEqual(changeChip({ current: 80, previous: 82, change: -2 }, 30), { text: '직전 30일보다 -2', tone: 'neutral' });
  assert.deepEqual(changeChip({ current: 80, previous: 80, change: 0 }, 7), { text: '직전 7일보다 0', tone: 'neutral' });
  assert.equal(changeChip({ current: 80, previous: null, change: null }, 7), null);
  assert.deepEqual(previousRateChip(13.4, 7), { text: '직전 7일 13회/분', tone: 'neutral' });
  assert.equal(previousRateChip(null, 7), null);
  assert.equal(percentLabel(null), '—');
  assert.equal(percentLabel(91.6), '92%');
  assert.equal(rangeText('2026-09-30', '2026-10-06'), '9월 30일 ~ 10월 6일');
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/statistics-period.test.mjs`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` (period.ts 없음)

- [ ] **Step 3: `period.ts` 만들기**

```ts
import { averageScore } from '../../../../database/contracts.ts';
import type { StatisticsRow } from '../../../../database/contracts.ts';
import { eyeRate } from '../../../../database/eye.ts';
import type { EyeStatisticsRow } from '../../../../database/eye.ts';
import type { KeyboardStored } from '../../../../database/keyboard.ts';
import { dayValues, latestPolicyGroups, periodDates, scoreFloor, sessionIdOf, shiftDate } from '../dashboard/summary.ts';
import type { DashboardDay } from '../dashboard/summary.ts';

export type PeriodDays = 7 | 30;
export interface StatisticsRange { from: string; to: string; dates: string[]; previousDates: string[] }
export interface ScoreChange { current: number | null; previous: number | null; change: number | null }
// Type aliases, not interfaces, so the rows fit the charts' index-signature data type.
export type UpperHour = { hour: number; turtle: number | null; shoulder: number | null };
export type EyeHour = { hour: number; rate: number | null };
export interface UpperPeriod {
  present: boolean;
  turtle: ScoreChange; shoulder: ScoreChange;
  runMs: number; sessions: number; averageMs: number | null; longestMs: number;
  deviations: number; deviationRate: number | null;
  validRate: number | null; unmeasuredMs: number;
  hourly: UpperHour[]; hourlyFloor: number;
}
export interface EyePeriod {
  present: boolean;
  rate: number | null; previousRate: number | null;
  validMs: number; runMs: number; breaks: number; nearReminders: number; openReminders: number;
  validRate: number | null;
  hourly: EyeHour[]; hourlyMax: number;
}
/** null means the source has not loaded (or failed); it is treated as empty. */
export interface StatisticsInput {
  end: string; days: PeriodDays;
  posture: StatisticsRow[] | null; eye: EyeStatisticsRow[] | null; keyboard: KeyboardStored[] | null;
}
export interface StatisticsSummary {
  range: StatisticsRange; days: DashboardDay[]; upper: UpperPeriod; eye: EyePeriod; upperFloor: number; eyeMax: number;
}

/** The current period ends at `end`; the previous period has the same length right before it. */
export function statisticsRange(end: string, days: PeriodDays): StatisticsRange {
  const dates = periodDates(end, days);
  const previousDates = periodDates(shiftDate(end, -days), days);
  return { from: previousDates[0], to: end, dates, previousDates };
}

const sum = <T>(rows: T[], pick: (row: T) => number) => rows.reduce((value, row) => value + pick(row), 0);
const present = (values: (number | null)[]) => values.filter((value): value is number => value !== null);
const inDates = <T extends { date: string }>(rows: T[], dates: string[]) => rows.filter(row => dates.includes(row.date));
const atHour = <T extends { hour: string }>(rows: T[], hour: number) => rows.filter(row => Number(row.hour) === hour);
const share = (part: number, whole: number) => (whole > 0 ? (100 * part) / whole : null);
const weightedScore = (rows: StatisticsRow[]) =>
  averageScore({ validMs: sum(rows, row => row.validMs), scoreTimeSum: sum(rows, row => row.scoreTimeSum) });
/** Blink-rate axis top: at least 20, otherwise the highest value rounded up to five. */
const rateCeiling = (values: (number | null)[]) => Math.max(20, Math.ceil(Math.max(0, ...present(values)) / 5) * 5);

/** Hours from the first to the last hour that has rows. */
function hourRange(rows: { hour: string }[]) {
  if (!rows.length) return [];
  const hours = rows.map(row => Number(row.hour));
  const first = Math.min(...hours), last = Math.max(...hours);
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

/** Compared as the integers shown on screen; null when either period has no value. */
function scoreChange(current: number | null, previous: number | null): ScoreChange {
  return { current, previous, change: current === null || previous === null ? null : Math.round(current) - Math.round(previous) };
}

function upperPeriod(turtle: StatisticsRow[], shoulder: StatisticsRow[], range: StatisticsRange, days: DashboardDay[]): UpperPeriod {
  const neck = inDates(turtle, range.dates), side = inDates(shoulder, range.dates);
  const both = [...neck, ...side];
  const runMs = sum(days, day => day.upper.runMs);
  const sessions = new Set(both.flatMap(row => row.recordIds).map(sessionIdOf)).size;
  const validRate = share(sum(both, row => row.validMs), sum(both, row => row.runMs));
  const hourly = hourRange(both).map(hour => ({ hour,
    turtle: weightedScore(atHour(neck, hour)), shoulder: weightedScore(atHour(side, hour)) }));
  return {
    present: both.length > 0,
    turtle: scoreChange(weightedScore(neck), weightedScore(inDates(turtle, range.previousDates))),
    shoulder: scoreChange(weightedScore(side), weightedScore(inDates(shoulder, range.previousDates))),
    runMs, sessions,
    averageMs: sessions ? runMs / sessions : null,
    longestMs: Math.max(0, ...both.map(row => row.longestContinuousMs)),
    deviations: sum(both, row => row.deviationEpisodeCount),
    deviationRate: share(sum(both, row => row.deviationMs), sum(both, row => row.validMs)),
    validRate,
    unmeasuredMs: validRate === null ? 0 : runMs * (1 - validRate / 100),
    hourly,
    hourlyFloor: scoreFloor(present(hourly.flatMap(hour => [hour.turtle, hour.shoulder]))),
  };
}

function eyeTotals(rows: EyeStatisticsRow[]) {
  return { runMs: sum(rows, row => row.runMs), validMs: sum(rows, row => row.validMs), blinks: sum(rows, row => row.blinks),
    breaks: sum(rows, row => row.breaks), nearReminders: sum(rows, row => row.nearReminders),
    openReminders: sum(rows, row => row.openReminders) };
}

function eyePeriod(rows: EyeStatisticsRow[], range: StatisticsRange): EyePeriod {
  const current = inDates(rows, range.dates);
  const totals = eyeTotals(current);
  const hourly = hourRange(current).map(hour => ({ hour, rate: eyeRate(eyeTotals(atHour(current, hour))) }));
  return {
    present: current.length > 0,
    rate: eyeRate(totals), previousRate: eyeRate(eyeTotals(inDates(rows, range.previousDates))),
    validMs: totals.validMs, runMs: totals.runMs, breaks: totals.breaks,
    nearReminders: totals.nearReminders, openReminders: totals.openReminders,
    validRate: share(totals.validMs, totals.runMs),
    hourly, hourlyMax: rateCeiling(hourly.map(hour => hour.rate)),
  };
}

/** Policy groups are chosen over both periods (dashboard rule), so the comparison never mixes policies. */
export function buildStatistics(input: StatisticsInput): StatisticsSummary {
  const range = statisticsRange(input.end, input.days);
  const groups = latestPolicyGroups(input);
  const days = range.dates.map(date => dayValues(groups, date));
  return {
    range, days,
    upper: upperPeriod(groups.turtle, groups.shoulder, range, days),
    eye: eyePeriod(groups.eye, range),
    upperFloor: scoreFloor(present(days.flatMap(day => [day.upper.turtle, day.upper.shoulder]))),
    eyeMax: rateCeiling(days.map(day => day.eye.rate)),
  };
}
```

- [ ] **Step 4: `text.ts` 만들기**

```ts
import { monthDayText } from '../dashboard/format.ts';
import type { PeriodDays, ScoreChange } from './period.ts';

export interface TileChip { text: string; tone: 'good' | 'neutral' }

/** "직전 7일보다 +3": green when it went up, grey when flat or down; none without both periods. */
export function changeChip(score: ScoreChange, days: PeriodDays): TileChip | null {
  if (score.change === null) return null;
  return { text: `직전 ${days}일보다 ${score.change > 0 ? '+' : ''}${score.change}`, tone: score.change > 0 ? 'good' : 'neutral' };
}

/** Blink rate is not a score, so the previous period is shown as a value only. */
export function previousRateChip(rate: number | null, days: PeriodDays): TileChip | null {
  return rate === null ? null : { text: `직전 ${days}일 ${Math.round(rate)}회/분`, tone: 'neutral' };
}

export const percentLabel = (value: number | null) => (value === null ? '—' : `${Math.round(value)}%`);

/** "9월 30일 ~ 10월 6일" */
export const rangeText = (from: string, to: string) => `${monthDayText(from)} ~ ${monthDayText(to)}`;
```

- [ ] **Step 5: 통과 확인**

Run: `node --test tests/statistics-period.test.mjs`
Expected: PASS (8 tests)

Run: `npm run typecheck`
Expected: 오류 없이 종료

- [ ] **Step 6: 커밋**

```bash
git add src/features/statistics/period.ts src/features/statistics/text.ts tests/statistics-period.test.mjs
git commit -m "feat(statistics): 기간·직전 기간 비교와 상체·안구 기간 계산" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 통계 공용 부품 (숫자 칸, 카드 부품, 날짜별·시간대 그래프)

**Files:**
- Create: `front/src/features/statistics/StatTile.tsx`, `parts.tsx`, `DailyChart.tsx`, `HourlyChart.tsx`
- Test: `front/tests/stats-history-ui.test.mjs`

- [ ] **Step 1: 실패하는 테스트 쓰기** — `front/tests/stats-history-ui.test.mjs`

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
const StatTile = await load('src/features/statistics/StatTile.tsx');
const html = (component, props) => renderToStaticMarkup(createElement(component, props));

test('number tiles keep missing apart from zero and show comparison chips', () => {
  const missing = html(StatTile, { label: '목 평균 점수', value: '—', unit: '점' });
  assert.match(missing, /—/);
  assert.doesNotMatch(missing, />점</);
  const zero = html(StatTile, { label: '기준에서 벗어남', value: '0', unit: '회', detail: '벗어나 있던 시간 0%' });
  assert.match(zero, />0</);
  assert.match(zero, />회</);
  assert.match(zero, /벗어나 있던 시간 0%/);
  assert.match(html(StatTile, { label: '목 평균 점수', value: '84', unit: '점', chip: { text: '직전 7일보다 +3', tone: 'good' } }),
    /직전 7일보다 \+3/);
  assert.match(html(StatTile, { label: '깜빡임 빈도', value: '14', unit: '회/분', chip: { text: '직전 7일 13회/분', tone: 'neutral' } }),
    /직전 7일 13회\/분/);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/stats-history-ui.test.mjs`
Expected: FAIL — esbuild가 `src/features/statistics/StatTile.tsx`를 찾지 못함

- [ ] **Step 3: `StatTile.tsx` 만들기**

```tsx
import type { ReactNode } from 'react';
import type { TileChip } from './text';

/** One number card: label, big value with a small unit, then a comparison chip and/or a detail line. */
export default function StatTile({ label, value, unit, chip, detail }: {
  label: string; value: string; unit?: string; chip?: TileChip | null; detail?: ReactNode;
}) {
  const missing = value === '—';
  return (
    <section aria-label={label} className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-4">
      <h3 className="text-xs text-muted">{label}</h3>
      <p className="flex items-baseline gap-1">
        <span className="text-3xl font-extrabold text-heading">{value}</span>
        {unit && !missing && <span className="text-sm text-muted">{unit}</span>}
      </p>
      {chip && (
        <span className={`w-fit rounded-md px-1.5 py-0.5 text-xs font-semibold text-heading ${chip.tone === 'good' ? 'bg-mode-upper-soft' : 'bg-track'}`}>
          {chip.text}
        </span>
      )}
      {detail && <p className="text-xs text-muted">{detail}</p>}
    </section>
  );
}
```

- [ ] **Step 4: `parts.tsx` 만들기**

```tsx
export const CARD = 'rounded-2xl border border-border bg-surface p-4';

export interface LegendItem { key: string; name: string; color: string; dashed?: boolean }

export function CardTitle({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-2">
      <h3 className="font-bold text-heading">{title}</h3>
      {note && <span className="text-xs text-muted">{note}</span>}
    </div>
  );
}

export function ChartHeader({ title, legend, hint }: { title: string; legend: LegendItem[]; hint?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-bold text-heading">{title}</h3>
      <ul className="flex flex-wrap items-center gap-3 text-xs text-muted">
        {legend.map(item => (
          <li key={item.key} className="flex items-center gap-1">
            <span aria-hidden="true" className={item.dashed ? 'h-0 w-3 border-t-2 border-dashed' : 'h-2 w-2 rounded-full'}
              style={item.dashed ? { borderColor: item.color } : { background: item.color }} />
            {item.name}
          </li>
        ))}
        {hint && <li>{hint}</li>}
      </ul>
    </div>
  );
}

export function EmptyChart({ text = '이 기간에 측정한 기록이 없어요' }: { text?: string }) {
  return <p className="flex h-72 items-center justify-center px-4 text-center text-sm text-muted">{text}</p>;
}

export function Waiting() {
  return <p className="text-sm text-muted">기록이 쌓이면 보여요</p>;
}

export function HistoryLink({ onClick, text = '학습이력에서 보기 →' }: { onClick: () => void; text?: string }) {
  return (
    <button type="button" onClick={onClick} className="mt-3 text-sm font-semibold text-secondary hover:underline">{text}</button>
  );
}
```

- [ ] **Step 5: `DailyChart.tsx` 만들기**

```tsx
import type { ReactNode } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { dayLabel } from '../dashboard/format';
import type { LegendItem } from './parts';

/**
 * Daily chart shared by the statistics tabs. Dots only on days with values and empty days are joined
 * (dashboard rule); days without this tab's records get a faded date. Clicking a day opens it in history.
 */
export default function DailyChart({ label, data, lines, today, domain, ticks, faded, detail, onSelectDate }: {
  label: string; data: Record<string, string | number | null>[]; lines: LegendItem[]; today: string;
  domain: [number, number]; ticks?: number[]; faded: Set<string>;
  detail: (date: string) => ReactNode; onSelectDate: (date: string) => void;
}) {
  return (
    <div className="h-72 cursor-pointer" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
          onClick={state => { if (typeof state.activeLabel === 'string') onSelectDate(state.activeLabel); }}>
          <CartesianGrid vertical={false} stroke="var(--color-track)" />
          <XAxis dataKey="date" tickLine={false} axisLine={false} padding={{ left: 20, right: 20 }} minTickGap={12}
            tick={props => (
              <text x={props.x} y={props.y} dy={14} textAnchor="middle" fontSize={12}
                fill={faded.has(String(props.payload.value)) ? 'var(--color-border-strong)' : 'var(--color-muted)'}>
                {dayLabel(String(props.payload.value), today)}
              </text>
            )} />
          <YAxis domain={domain} ticks={ticks} tickLine={false} axisLine={false} width={36}
            tick={{ fill: 'var(--color-muted)', fontSize: 11 }} />
          <Tooltip cursor={{ stroke: 'var(--color-border-strong)' }} filterNull={false} isAnimationActive={false}
            content={({ active, label: date }) => (active && typeof date === 'string' ? detail(date) : null)} />
          {lines.map(line => (
            <Line key={line.key} dataKey={line.key} name={line.name} type="linear" stroke={line.color} strokeWidth={2.5}
              strokeDasharray={line.dashed ? '5 4' : undefined} connectNulls isAnimationActive={false}
              dot={{ r: 4, fill: line.color, stroke: 'var(--color-surface)', strokeWidth: 2 }}
              activeDot={{ r: 6, fill: line.color, stroke: 'var(--color-surface)', strokeWidth: 2 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 6: `HourlyChart.tsx` 만들기**

```tsx
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { LegendItem } from './parts';

/** Small hour-of-day chart: a dot on every value; hours without values stay gaps (statistics rule). */
export default function HourlyChart({ label, data, lines, domain, unit }: {
  label: string; data: Record<string, number | null>[]; lines: LegendItem[]; domain: [number, number]; unit: string;
}) {
  return (
    <div className="h-28" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
          <XAxis dataKey="hour" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24}
            tick={{ fill: 'var(--color-muted)', fontSize: 11 }} tickFormatter={(hour: number) => `${hour}시`} />
          <YAxis hide domain={domain} />
          <Tooltip isAnimationActive={false} content={({ active, label: hour, payload }) => (active && payload?.length ? (
            <div className="rounded-lg border border-border bg-surface px-2 py-1 text-xs shadow">
              <p className="font-semibold text-heading">{`${hour}시`}</p>
              {payload.map(item => (
                <p key={String(item.dataKey)} className="text-muted">
                  {`${item.name} ${typeof item.value === 'number' ? `${Math.round(item.value)}${unit}` : '—'}`}
                </p>
              ))}
            </div>
          ) : null)} />
          {lines.map(line => (
            <Line key={line.key} dataKey={line.key} name={line.name} type="linear" stroke={line.color} strokeWidth={2}
              connectNulls={false} isAnimationActive={false} dot={{ r: 2.5, fill: line.color, strokeWidth: 0 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 7: 통과 확인**

Run: `node --test tests/stats-history-ui.test.mjs`
Expected: PASS (1 test)

Run: `npm run typecheck && npm run lint`
Expected: 둘 다 오류 없이 종료. `tick` 콜백의 `props.payload` 타입 오류가 나면 매개변수를 `(props: { x?: number | string; y?: number | string; payload?: { value?: unknown } })`로 적고 `props.payload?.value`를 쓴다.

- [ ] **Step 8: 커밋**

```bash
git add src/features/statistics/StatTile.tsx src/features/statistics/parts.tsx src/features/statistics/DailyChart.tsx src/features/statistics/HourlyChart.tsx tests/stats-history-ui.test.mjs
git commit -m "feat(statistics): 숫자 칸·카드 부품·날짜별/시간대 그래프" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 상체·안구 탭과 통계 불러오기 훅

**Files:**
- Create: `front/src/features/statistics/UpperPanel.tsx`, `EyePanel.tsx`, `useStatisticsData.ts`

- [ ] **Step 1: `UpperPanel.tsx` 만들기**

```tsx
import type { ReactNode } from 'react';
import ScoreRing from '../dashboard/ScoreRing';
import { minutesText, scoreText } from '../dashboard/format';
import type { DashboardDay } from '../dashboard/summary';
import DailyChart from './DailyChart';
import HourlyChart from './HourlyChart';
import StatTile from './StatTile';
import { CARD, CardTitle, ChartHeader, EmptyChart, HistoryLink, Waiting } from './parts';
import type { PeriodDays, UpperPeriod } from './period';
import { changeChip, percentLabel } from './text';

const LINES = [
  { key: 'turtle', name: '목', color: 'var(--color-mode-upper)' },
  { key: 'shoulder', name: '어깨', color: 'var(--color-mode-shoulder)' },
];

/** Upper tab: four numbers, the daily neck/shoulder chart, then hourly, quality and record cards. */
export default function UpperPanel({ upper, days, periodDays, floor, today, detail, onSelectDate, onOpenHistory }: {
  upper: UpperPeriod; days: DashboardDay[]; periodDays: PeriodDays; floor: number; today: string;
  detail: (date: string) => ReactNode; onSelectDate: (date: string) => void; onOpenHistory: () => void;
}) {
  const empty = !upper.present;
  const ticks = Array.from({ length: Math.round((100 - floor) / 10) + 1 }, (_, index) => floor + index * 10);
  const faded = new Set(days.filter(day => day.upper.sessions === 0).map(day => day.date));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatTile label="목 평균 점수" value={scoreText(upper.turtle.current)} unit="점" chip={changeChip(upper.turtle, periodDays)} />
        <StatTile label="어깨 평균 점수" value={scoreText(upper.shoulder.current)} unit="점" chip={changeChip(upper.shoulder, periodDays)} />
        <StatTile label="측정 시간" value={empty ? '—' : minutesText(upper.runMs)}
          detail={empty ? undefined : `${upper.sessions}회 측정 · 가장 길게 이어진 측정 ${minutesText(upper.longestMs)}`} />
        <StatTile label="기준에서 벗어남" value={empty ? '—' : String(upper.deviations)} unit="회"
          detail={upper.deviationRate === null ? undefined : `벗어나 있던 시간 ${percentLabel(upper.deviationRate)}`} />
      </div>
      <section aria-label="날짜별 점수" className={`${CARD} space-y-3`}>
        <ChartHeader title="날짜별 점수" legend={LINES} hint="날짜를 누르면 그날 학습이력으로 가요" />
        {empty ? <EmptyChart /> : (
          <DailyChart label="날짜별 목·어깨 점수" lines={LINES} today={today} domain={[floor, 100]} ticks={ticks}
            faded={faded} detail={detail} onSelectDate={onSelectDate}
            data={days.map(day => ({ date: day.date, turtle: day.upper.turtle, shoulder: day.upper.shoulder }))} />
        )}
      </section>
      <div className="grid gap-4 lg:grid-cols-3">
        <section aria-label="시간대별 점수" className={CARD}>
          <CardTitle title="시간대별 점수" note={`${periodDays}일 평균`} />
          {empty ? <Waiting /> : (
            <HourlyChart label="시간대별 목·어깨 점수" data={upper.hourly} lines={LINES} domain={[upper.hourlyFloor, 100]} unit="점" />
          )}
        </section>
        <section aria-label="측정 품질" className={CARD}>
          <CardTitle title="측정 품질" />
          {empty ? <Waiting /> : (
            <div className="flex items-center gap-4">
              <ScoreRing value={upper.validRate} strokeClass="stroke-mode-upper" label="제대로 측정" unit="%" />
              <div className="space-y-1 text-sm text-muted">
                <p>제대로 측정된 시간</p>
                <p>{`자리 비움 등으로 측정 못 한 시간 ${minutesText(upper.unmeasuredMs)}`}</p>
              </div>
            </div>
          )}
        </section>
        <section aria-label="측정 기록" className={CARD}>
          <CardTitle title="측정 기록" />
          {empty ? <Waiting /> : (
            <div className="space-y-1 text-sm text-muted">
              <p>{`${upper.sessions}회 · 평균 ${minutesText(upper.averageMs ?? 0)}`}</p>
              <p>{`가장 길게 이어진 측정 ${minutesText(upper.longestMs)}`}</p>
            </div>
          )}
          <HistoryLink onClick={onOpenHistory} />
        </section>
      </div>
      <p className="text-xs text-muted">점수는 기준 자세와의 화면상 유사도예요. 의학적 진단이 아니에요.</p>
    </div>
  );
}
```

- [ ] **Step 2: `EyePanel.tsx` 만들기**

```tsx
import type { ReactNode } from 'react';
import { minutesText } from '../dashboard/format';
import type { DashboardDay } from '../dashboard/summary';
import DailyChart from './DailyChart';
import HourlyChart from './HourlyChart';
import StatTile from './StatTile';
import { CARD, CardTitle, ChartHeader, EmptyChart, HistoryLink, Waiting } from './parts';
import type { EyePeriod, PeriodDays } from './period';
import { percentLabel, previousRateChip } from './text';

const LINES = [{ key: 'rate', name: '분당 깜빡임', color: 'var(--color-mode-eye)' }];

/** Eye tab with the eye mode's own terms. Blink rate is a habit guide, never a score. */
export default function EyePanel({ eye, days, periodDays, max, today, detail, onSelectDate, onOpenHistory }: {
  eye: EyePeriod; days: DashboardDay[]; periodDays: PeriodDays; max: number; today: string;
  detail: (date: string) => ReactNode; onSelectDate: (date: string) => void; onOpenHistory: () => void;
}) {
  const empty = !eye.present;
  const faded = new Set(days.filter(day => !day.eye.present).map(day => day.date));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatTile label="깜빡임 빈도" value={eye.rate === null ? '—' : String(Math.round(eye.rate))} unit="회/분"
          chip={previousRateChip(eye.previousRate, periodDays)}
          detail={!empty && eye.rate === null ? '유효 관찰 30초 이상일 때 표시' : undefined} />
        <StatTile label="유효 관찰 시간" value={empty ? '—' : minutesText(eye.validMs)}
          detail={empty ? undefined : `실행 시간 ${minutesText(eye.runMs)}`} />
        <StatTile label="눈 휴식 완료" value={empty ? '—' : String(eye.breaks)} unit="회" detail="20초 후 복귀 버튼으로 본인이 확인한 횟수" />
        <StatTile label="가까워짐 안내" value={empty ? '—' : String(eye.nearReminders)} unit="회"
          detail={empty ? undefined : `깜빡임 안내 ${eye.openReminders}회`} />
      </div>
      <section aria-label="날짜별 깜빡임 빈도" className={`${CARD} space-y-3`}>
        <ChartHeader title="날짜별 깜빡임 빈도" legend={LINES} hint="날짜를 누르면 그날 학습이력으로 가요" />
        {empty ? <EmptyChart /> : (
          <DailyChart label="날짜별 깜빡임 빈도" lines={LINES} today={today} domain={[0, max]}
            faded={faded} detail={detail} onSelectDate={onSelectDate}
            data={days.map(day => ({ date: day.date, rate: day.eye.rate }))} />
        )}
      </section>
      <div className="grid gap-4 lg:grid-cols-3">
        <section aria-label="시간대별 깜빡임" className={CARD}>
          <CardTitle title="시간대별 깜빡임" note={`${periodDays}일 평균`} />
          {empty ? <Waiting /> : (
            <HourlyChart label="시간대별 깜빡임 빈도" data={eye.hourly} lines={LINES} domain={[0, eye.hourlyMax]} unit="회/분" />
          )}
        </section>
        <section aria-label="유효 관찰 비율" className={CARD}>
          <CardTitle title="유효 관찰 비율" />
          {empty ? <Waiting /> : (
            <p className="text-sm text-muted">
              <b className="text-2xl font-extrabold text-heading">{percentLabel(eye.validRate)}</b> · 얼굴 유실은 휴식으로 계산하지 않아요
            </p>
          )}
        </section>
        <section aria-label="측정 기록" className={CARD}>
          <CardTitle title="측정 기록" />
          {empty ? <Waiting /> : <p className="text-sm text-muted">{`실행 시간 ${minutesText(eye.runMs)}`}</p>}
          <HistoryLink onClick={onOpenHistory} />
        </section>
      </div>
      <p className="text-xs text-muted">깜빡임 빈도는 생활 습관 안내용이에요. 건강 점수나 진단이 아니에요.</p>
    </div>
  );
}
```

- [ ] **Step 3: `useStatisticsData.ts` 만들기**

```ts
import { useCallback, useMemo } from 'react';
import { getCurrentUser } from '../../utils/authStore';
import { LOGIN_REQUIRED, statusOf } from '../dashboard/useDashboardData';
import { recordsApi, recordValue } from '../records/api';
import { useRecordQuery } from '../records/useRecordQuery';
import { buildStatistics, statisticsRange } from './period';
import type { PeriodDays } from './period';

/** Loads the three sources for both periods at once; tabs never reload. period.ts does all calculation. */
export function useStatisticsData(end: string, days: PeriodDays) {
  const owner = getCurrentUser()?.id ?? '';
  const { from, to } = statisticsRange(end, days);

  const loadPosture = useCallback(async () => {
    if (!owner) throw new Error(LOGIN_REQUIRED);
    return recordValue(recordsApi().statistics({ owner, from, to }));
  }, [owner, from, to]);
  const loadEye = useCallback(async () => {
    if (!owner) throw new Error(LOGIN_REQUIRED);
    return recordValue(recordsApi().eyeStatistics({ owner, from, to }));
  }, [owner, from, to]);
  const loadKeyboard = useCallback(async () => {
    if (!owner) throw new Error(LOGIN_REQUIRED);
    return recordValue(recordsApi().keyboardStatistics({ owner, from, to }));
  }, [owner, from, to]);

  const key = `${owner}:${from}:${to}`;
  const posture = useRecordQuery('statistics-posture:' + key, loadPosture);
  const eye = useRecordQuery('statistics-eye:' + key, loadEye);
  const keyboard = useRecordQuery('statistics-keyboard:' + key, loadKeyboard);

  const summary = useMemo(
    () => buildStatistics({ end, days, posture: posture.data, eye: eye.data, keyboard: keyboard.data }),
    [end, days, posture.data, eye.data, keyboard.data],
  );
  return {
    summary,
    keyboard: keyboard.data ?? [],
    status: { posture: statusOf(posture), eye: statusOf(eye), keyboard: statusOf(keyboard) },
    retry: () => { posture.retry(); eye.retry(); keyboard.retry(); },
  };
}
```

- [ ] **Step 4: 확인**

Run: `npm run typecheck && npm run lint`
Expected: 둘 다 오류 없이 종료

- [ ] **Step 5: 커밋**

```bash
git add src/features/statistics/UpperPanel.tsx src/features/statistics/EyePanel.tsx src/features/statistics/useStatisticsData.ts
git commit -m "feat(statistics): 상체·안구 탭과 세 출처 불러오기 훅" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 키보드 탭 모양 바꾸기 (계산 그대로)

**Files:**
- Modify: `front/src/features/keyboard/KeyboardStatistics.tsx` (전체 교체, 계산 줄은 그대로 옮김)
- Test: `front/tests/stats-history-ui.test.mjs`

- [ ] **Step 1: 실패하는 테스트 쓰기**

`front/tests/stats-history-ui.test.mjs`의 `const StatTile = ...` 다음 줄에 추가한다.

```js
const KeyboardStatistics = await load('src/features/keyboard/KeyboardStatistics.tsx');
```

파일 끝에 추가한다.

```js
const keyboardStored = () => ({
  record: { id: 'k1', owner: '7', startedAt: Date.parse('2026-10-02T02:00:00Z'), updatedAt: Date.parse('2026-10-02T02:20:00Z'),
    offsetMinutes: -540, status: 'finished', policyVersion: 'ansi-qwerty-touch:2.0.0',
    recognitionVersion: 'hands-label-distance-v2', nearbyCredit: 70, total: 10 },
  counts: [
    { date: '2026-10-02', code: 'KeyA', context: 'plain', finger: 'left:pinky', verdict: 'preferred', reason: 'preferred-finger', count: 8 },
    { date: '2026-10-02', code: 'KeyA', context: 'plain', finger: 'left:ring', verdict: 'nearby', reason: 'neighboring-finger', count: 2 },
  ] });

test('keyboard tab keeps its own terms, drops the session list and links to history', () => {
  const props = { date: '2026-10-02', days: 7, today: '2026-10-07', detail: () => null, onSelectDate: () => {}, onOpenHistory: () => {} };
  const out = html(KeyboardStatistics, { ...props, data: [keyboardStored()] });
  for (const term of ['훈련 점수', '기본표 일치율', '판정 가능 비율', '사용 일관성', '키별 히트맵', '기본표와 자주 다른 키', '보류·제외 원인']) {
    assert.match(out, new RegExp(term));
  }
  assert.match(out, /94\.0점/);
  assert.doesNotMatch(out, /세션 기록/);
  assert.match(out, /측정 기록은 학습이력에서 보기 →/);
  assert.match(html(KeyboardStatistics, { ...props, data: [] }), /선택한 기간의 키보드 집계가 없습니다/);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/stats-history-ui.test.mjs`
Expected: FAIL — 지금 컴포넌트는 직접 불러오는 중 상태만 그려서 `훈련 점수`가 없다(또는 기록 API 모듈 로드 오류).

- [ ] **Step 3: `KeyboardStatistics.tsx` 전체 교체**

```tsx
import { useState } from 'react';
import type { ReactNode } from 'react';
import { keyboardSummary } from '../../../../database/keyboard';
import type { KeyboardCount, KeyboardStored } from '../../../../database/keyboard';
import DailyChart from '../statistics/DailyChart';
import StatTile from '../statistics/StatTile';
import { CARD, ChartHeader, EmptyChart, HistoryLink } from '../statistics/parts';
import type { PeriodDays } from '../statistics/period';
import { contextText, fingerText, percentText, reasonText, scoreText } from './labels';

const dayBefore = (day: string, n: number) => new Date(Date.parse(day) - n * 86400_000).toISOString().slice(0, 10);
const policyKey = (row: KeyboardStored) => JSON.stringify([row.record.policyVersion, row.record.recognitionVersion, row.record.nearbyCredit]);
const keyRows = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'].map(letters => [...letters].map(letter => `Key${letter}`));
keyRows[2].push('Comma', 'Period', 'Slash');
keyRows[1].push('Semicolon');
keyRows.push(['Space']);
const keyText = (code: string) => code.startsWith('Key') ? code.slice(3) : ({ Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Space: 'Space' }[code] ?? code);
const LINES = [
  { key: 'score', name: '훈련 점수', color: 'var(--color-mode-keyboard)' },
  { key: 'coverage', name: '판정 가능 비율 (%)', color: 'var(--color-border-strong)', dashed: true },
];

/** Keyboard tab of Statistics. The calculation is unchanged; the page loads both periods and passes them in. */
export default function KeyboardStatistics({ data, date, days, today, detail, onSelectDate, onOpenHistory }: {
  data: KeyboardStored[]; date: string; days: PeriodDays; today: string;
  detail: (date: string) => ReactNode; onSelectDate: (date: string) => void; onOpenHistory: () => void;
}) {
  const [policy, setPolicy] = useState(''), [selectedKey, setSelectedKey] = useState('KeyA');
  const from = dayBefore(date, days - 1);
  const groups = [...new Set(data.map(policyKey))];
  const selectedPolicy = groups.includes(policy) ? policy : groups.at(-1) ?? '';
  const records = data.filter(row => policyKey(row) === selectedPolicy);
  const credit = records[0]?.record.nearbyCredit ?? 70;
  const allCounts = records.flatMap(row => row.counts);
  const counts = allCounts.filter(row => row.date >= from), previous = allCounts.filter(row => row.date < from);
  const summary = keyboardSummary(counts, credit), before = keyboardSummary(previous, credit);
  const daily = Array.from({ length: days }, (_, i) => {
    const day = dayBefore(date, days - i - 1), totals = keyboardSummary(counts.filter(row => row.date === day), credit);
    return { date: day, score: totals.score, coverage: totals.coverage, valid: totals.valid, unknown: totals.unknown };
  });
  const byKey = new Map<string, KeyboardCount[]>();
  counts.forEach(row => byKey.set(row.code, [...(byKey.get(row.code) ?? []), row]));
  const selected = byKey.get(selectedKey) ?? [];
  const differences = [...byKey].map(([code, rows]) => ({ code, ...keyboardSummary(rows, credit) }))
    .filter(row => row.valid > 0).toSorted((a, b) => b.nearby + b.mismatch - a.nearby - a.mismatch).slice(0, 8);
  const reasons = new Map<string, number>();
  counts.filter(row => row.verdict === 'unknown').forEach(row => reasons.set(row.reason, (reasons.get(row.reason) ?? 0) + row.count));
  const change = summary.score !== null && before.score !== null ? summary.score - before.score : null;
  const faded = new Set(daily.filter(row => !counts.some(count => count.date === row.date)).map(row => row.date));
  return <div className="space-y-4">
    {groups.length > 1 && <label className="block text-sm text-heading">정책<select className="ml-2 rounded border border-border bg-surface p-2" value={selectedPolicy} onChange={event => setPolicy(event.target.value)}>{groups.map(group => <option key={group} value={group}>{JSON.parse(group).join(' · ')}</option>)}</select></label>}
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <StatTile label="훈련 점수" value={scoreText(summary.score)} detail={`판정 가능한 ${summary.valid}회 · 인접 ${credit}점`}
        chip={change === null ? null : { text: `직전 ${days}일보다 ${change > 0 ? '+' : ''}${change.toFixed(1)}`, tone: change > 0 ? 'good' : 'neutral' }} />
      <StatTile label="기본표 일치율" value={percentText(summary.agreement)} detail="권장·허용 손가락 100점" />
      <StatTile label="판정 가능 비율" value={percentText(summary.coverage)} detail={`보류 ${summary.unknown}회 · 미지원/단축키 ${summary.unsupported}회 별도`} />
      <StatTile label="사용 일관성" value={percentText(summary.consistency)} detail={`키·Shift 상황별 10회 이상 · 대상 ${summary.consistencyTotal}회`} />
    </div>
    <section aria-label="연습 변화" className={`${CARD} space-y-3`}>
      <ChartHeader title="연습 변화" legend={LINES} hint="날짜를 누르면 그날 학습이력으로 가요" />
      {counts.length ? <DailyChart label="날짜별 훈련 점수와 판정 가능 비율" lines={LINES} today={today} domain={[0, 100]}
        faded={faded} detail={detail} onSelectDate={onSelectDate}
        data={daily.map(row => ({ date: row.date, score: row.score, coverage: row.coverage }))} />
        : <EmptyChart text="선택한 기간의 키보드 집계가 없습니다. 키보드 학습을 시작하면 처리된 입력의 집계를 저장합니다." />}
      <p className="text-sm text-muted">직전 {days}일 {scoreText(before.score)} ({before.valid}회, 판정 {percentText(before.coverage)}) → 현재 {scoreText(summary.score)} ({summary.valid}회, 판정 {percentText(summary.coverage)}){summary.score !== null && before.score !== null ? ` · ${(summary.score - before.score).toFixed(1)}점 변화` : ''}</p>
      <p className="text-xs text-muted">표본 수와 판정 가능 비율이 다른 기간의 점수 변화는 실제 개선과 다를 수 있습니다. 일관성은 같은 키·Shift 상황에서 가장 많이 쓴 손가락의 비율이며 점수에 가산하지 않습니다.</p>
    </section>
    <div className="grid gap-4 lg:grid-cols-3">
      <section aria-label="키별 히트맵" className={`${CARD} space-y-3 lg:col-span-2`}>
        <h3 className="font-bold text-heading">키별 히트맵 · 눌러서 상세 보기</h3>
        <p className="text-xs text-muted">초록: 평균 100점 · 주황: 부분 점수 포함 · 빨강: 평균 70점 미만 · 빈 키: 판정 가능한 기록 없음. 색은 훈련 가중치 표시입니다.</p>
        {keyRows.map((row, i) => <div key={i} className="flex flex-wrap gap-1">{row.map(code => {
          const total = keyboardSummary(byKey.get(code) ?? [], credit), selected = selectedKey === code;
          const color = total.score === null ? 'bg-surface-muted' : total.score === 100 ? 'bg-green-100' : total.score >= 70 ? 'bg-amber-100' : 'bg-red-100';
          return <button key={code} aria-pressed={selected} onClick={() => setSelectedKey(code)} title={`${code}: ${scoreText(total.score)}, ${total.valid}회, 보류 ${total.unknown}회`} className={`${color} min-w-12 rounded-lg border p-2 text-gray-800 ${selected ? 'border-blue-600 ring-2 ring-blue-400' : 'border-border'}`}><strong>{keyText(code)}</strong><small className="block">{total.valid}회</small></button>;
        })}</div>)}
        <h4 className="font-bold text-heading">{keyText(selectedKey)} · {scoreText(keyboardSummary(selected, credit).score)}</h4>
        <label className="block text-sm text-heading">상세 키 선택<select className="ml-2 rounded border border-border bg-surface p-2" value={selectedKey} onChange={event => setSelectedKey(event.target.value)}>{[...new Set([...keyRows.flat(), ...byKey.keys()])].map(code => <option key={code} value={code}>{keyText(code)}</option>)}</select></label>
        {selected.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm text-heading"><thead><tr><th className="p-2">상황</th><th className="p-2">손가락</th><th className="p-2">판정·원인</th><th className="p-2">횟수</th></tr></thead><tbody>{mergeRows(selected).map(([key, row]) => <tr key={key} className="border-t border-border"><td className="p-2">{contextText[row.context]}</td><td className="p-2">{row.finger ? fingerText[row.finger] : '불확실'}</td><td className="p-2">{reasonText[row.reason]}</td><td className="p-2">{row.count}</td></tr>)}</tbody></table></div> : <p className="text-sm text-muted">이 키의 집계가 없습니다.</p>}
      </section>
      <section aria-label="기본표와 자주 다른 키" className={`${CARD} space-y-2`}>
        <h3 className="font-bold text-heading">기본표와 자주 다른 키</h3>
        {differences.length ? differences.map(row => <button key={row.code} onClick={() => setSelectedKey(row.code)} className="block text-left text-sm text-heading">{keyText(row.code)} · 인접 {row.nearby}회 / 다른 손가락 {row.mismatch}회 · {row.valid}회 중 {row.valid ? ((row.nearby + row.mismatch) / row.valid * 100).toFixed(1) : 0}%{row.valid < 10 ? ' (표본 부족)' : ''}</button>) : <p className="text-sm text-muted">판정 가능한 기록이 없습니다.</p>}
        <HistoryLink onClick={onOpenHistory} text="측정 기록은 학습이력에서 보기 →" />
      </section>
    </div>
    <details className={CARD}>
      <summary className="cursor-pointer font-bold text-heading">보류·제외 원인</summary>
      <div className="mt-2 space-y-1">
        {[...reasons].map(([reason, n]) => <p key={reason} className="text-sm text-muted">{reasonText[reason]} · {n}회</p>)}
        {!reasons.size && <p className="text-sm text-muted">보류·제외 기록이 없습니다.</p>}
      </div>
    </details>
    <p className="text-xs text-muted">{from}~{date} · 정책 {records[0]?.record.policyVersion ?? '기록 없음'} · 인식 {records[0]?.record.recognitionVersion ?? '—'}. 서로 다른 정책과 가중치는 합산하지 않습니다.</p>
  </div>;
}
function mergeRows(rows: KeyboardCount[]) {
  const result = new Map<string, KeyboardCount>();
  for (const row of rows) { const key = JSON.stringify([row.context, row.finger, row.verdict, row.reason]); result.set(key, { ...row, count: (result.get(key)?.count ?? 0) + row.count }); }
  return [...result];
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/stats-history-ui.test.mjs`
Expected: PASS (2 tests)

Run: `npm run typecheck && npm run lint`
Expected: `Statistics.tsx`가 아직 옛 props(`owner`)로 `KeyboardStatistics`를 부르므로 타입 오류가 **이 한 곳만** 난다. Task 7에서 고친다. 린트는 통과.

- [ ] **Step 5: 커밋**

```bash
git add src/features/keyboard/KeyboardStatistics.tsx tests/stats-history-ui.test.mjs
git commit -m "feat(keyboard): 통계 키보드 탭 모양을 새 부품으로, 세션 목록은 학습이력으로" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 통계 화면 조립

**Files:**
- Modify: `front/src/pages/Statistics.tsx` (전체 교체)

- [ ] **Step 1: `Statistics.tsx` 전체 교체**

```tsx
import { useState, useSyncExternalStore } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import DayDetail from '../features/dashboard/DayDetail';
import { SourceError, SourceLoading } from '../features/dashboard/SourceState';
import { pastDateOrNull } from '../features/dashboard/summary';
import KeyboardStatistics from '../features/keyboard/KeyboardStatistics';
import RecordingStatus from '../features/records/RecordingStatus';
import StatisticsExamples from '../features/records/StatisticsExamples';
import { recordingMessage, subscribeRecording } from '../features/records/recording';
import { todayDateKey } from '../features/records/views';
import EyePanel from '../features/statistics/EyePanel';
import UpperPanel from '../features/statistics/UpperPanel';
import type { PeriodDays } from '../features/statistics/period';
import { rangeText } from '../features/statistics/text';
import { useStatisticsData } from '../features/statistics/useStatisticsData';

type StatMode = 'upper' | 'keyboard' | 'eye';
const MODES: { id: StatMode; name: string; dot: string }[] = [
  { id: 'upper', name: '상체', dot: 'bg-mode-upper' },
  { id: 'keyboard', name: '키보드', dot: 'bg-mode-keyboard' },
  { id: 'eye', name: '안구', dot: 'bg-mode-eye' },
];
const PERIODS: PeriodDays[] = [7, 30];
const isMode = (value: string | null): value is StatMode => MODES.some(mode => mode.id === value);

export default function Statistics() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const today = todayDateKey();
  const [end, setEnd] = useState(() => pastDateOrNull(params.get('end'), today) ?? today);
  const [days, setDays] = useState<PeriodDays>(() => (params.get('days') === '30' ? 30 : 7));
  const [mode, setMode] = useState<StatMode>(() => { const value = params.get('mode'); return isMode(value) ? value : 'upper'; });
  const { summary, keyboard, status, retry } = useStatisticsData(end, days);
  const saveMessage = useSyncExternalStore(subscribeRecording, recordingMessage, recordingMessage);
  const openHistory = (date: string) => navigate(`/history?date=${date}`);
  const detail = (date: string) => {
    const day = summary.days.find(item => item.date === date);
    return day?.hasRecords ? <DayDetail day={day} hint="눌러서 학습이력 보기 →" /> : null;
  };
  const panelStatus = mode === 'upper' ? status.posture : mode === 'eye' ? status.eye : status.keyboard;
  const shared = { today, detail, onSelectDate: openHistory, onOpenHistory: () => openHistory(end) };

  return (
    <div className="space-y-4 pb-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-heading">통계</h1>
          <p className="mt-1 text-sm text-muted">{`서버에 저장된 내 측정 기록이에요 · ${rangeText(summary.range.dates[0], end)}`}</p>
        </div>
        <div className="flex items-center gap-3">
          {end !== today && (
            <button type="button" onClick={() => setEnd(today)} className="text-sm font-semibold text-secondary hover:underline">오늘까지 보기</button>
          )}
          <div role="group" aria-label="기간" className="flex rounded-xl bg-track p-1">
            {PERIODS.map(value => (
              <button key={value} type="button" aria-pressed={days === value} onClick={() => setDays(value)}
                className={`rounded-lg px-3 py-1 text-sm font-semibold ${days === value ? 'bg-surface text-heading shadow-sm' : 'text-muted'}`}>
                {`${value}일`}
              </button>
            ))}
          </div>
        </div>
      </header>
      {saveMessage.startsWith('저장 실패') && <RecordingStatus />}
      <div role="tablist" aria-label="모드" className="flex flex-wrap gap-2">
        {MODES.map(item => (
          <button key={item.id} type="button" role="tab" aria-selected={mode === item.id} onClick={() => setMode(item.id)}
            className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold ${mode === item.id ? 'bg-heading text-surface' : 'border border-border bg-surface text-heading'}`}>
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${item.dot}`} />{item.name}
          </button>
        ))}
      </div>
      {panelStatus === 'loading' ? <SourceLoading className="h-96" />
        : panelStatus === 'error' ? <SourceError onRetry={retry} />
        : mode === 'upper' ? (
          <>
            <UpperPanel upper={summary.upper} days={summary.days} periodDays={days} floor={summary.upperFloor} {...shared} />
            <details>
              <summary className="flex cursor-pointer list-none justify-end">
                <span className="rounded-full border border-dashed border-border px-3 py-1 text-xs font-semibold text-muted">▸ AI 기능 예정 (예시)</span>
              </summary>
              <div className="mt-4"><StatisticsExamples /></div>
            </details>
          </>
        )
        : mode === 'eye' ? <EyePanel eye={summary.eye} days={summary.days} periodDays={days} max={summary.eyeMax} {...shared} />
        : <KeyboardStatistics data={keyboard} date={end} days={days} {...shared} />}
    </div>
  );
}
```

- [ ] **Step 2: 확인**

Run: `npm run typecheck && npm run lint && npm test`
Expected: 모두 통과(테스트 141 + Task 1~6에서 늘어난 수)

- [ ] **Step 3: 커밋**

```bash
git add src/pages/Statistics.tsx
git commit -m "feat(statistics): 기간·모드 탭 통계 화면 조립" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: 학습이력 계산 (`currentPolicies.ts`, `calendar.ts`, `detail.ts`)

**Files:**
- Create: `front/src/features/history/currentPolicies.ts`, `calendar.ts`, `detail.ts`
- Test: `front/tests/history-calendar.test.mjs`

- [ ] **Step 1: 실패하는 테스트 쓰기** — `front/tests/history-calendar.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarDays, canMoveForward, datesBetween, entriesByDate, leadingBlanks, loadRange, monthDates, movePeriod,
  neighborDates, periodTitle, weekDates } from '../src/features/history/calendar.ts';
import { CURRENT_POLICIES } from '../src/features/history/currentPolicies.ts';
import { upperMinutes, upperTotals } from '../src/features/history/detail.ts';

const TODAY = '2026-10-07';  // 수요일
const KST = -540;
const at = iso => Date.parse(iso);
const posture = (over = {}) => ({ id: 's1:turtle', owner: '7', mode: 'turtle',
  startedAt: at('2026-10-02T01:05:00Z'), updatedAt: at('2026-10-02T01:23:00Z'), offsetMinutes: KST,
  scorePolicyVersion: CURRENT_POLICIES.turtle, habitPolicyVersion: CURRENT_POLICIES.habit,
  longestContinuousMs: 0, status: 'finished',
  runMs: 18 * 60_000, validMs: 18 * 60_000, scoreTimeSum: 18 * 60_000 * 70, deviationMs: 0, deviationEpisodeCount: 1, ...over });
const shoulder = (over = {}) => posture({ id: 's1:shoulder', mode: 'shoulder', scorePolicyVersion: CURRENT_POLICIES.shoulder,
  scoreTimeSum: 18 * 60_000 * 86, ...over });
const eye = (over = {}) => ({ id: 'e1', owner: '7', mode: 'eye',
  startedAt: at('2026-10-02T04:00:00Z'), updatedAt: at('2026-10-02T04:10:00Z'), offsetMinutes: KST,
  policyVersion: CURRENT_POLICIES.eye, status: 'finished',
  runMs: 10 * 60_000, validMs: 10 * 60_000, blinks: 140, breaks: 0, nearReminders: 0, openReminders: 0, ...over });
const keyboard = (over = {}) => ({
  record: { id: 'k1', owner: '7', startedAt: at('2026-10-02T02:00:00Z'), updatedAt: at('2026-10-02T02:20:00Z'),
    offsetMinutes: KST, status: 'finished', policyVersion: CURRENT_POLICIES.keyboard,
    recognitionVersion: CURRENT_POLICIES.recognition, nearbyCredit: 70, total: 10, ...over },
  counts: [
    { date: '2026-10-02', code: 'KeyA', context: 'plain', finger: 'left:pinky', verdict: 'preferred', reason: 'preferred-finger', count: 8 },
    { date: '2026-10-02', code: 'KeyA', context: 'plain', finger: null, verdict: 'unknown', reason: 'ambiguous-candidates', count: 2 },
  ] });

test('weeks start on Sunday, months list every day with leading blanks', () => {
  assert.deepEqual(weekDates('2026-10-02'),
    ['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03']);
  assert.equal(monthDates('2026-02-11').length, 28);
  assert.equal(monthDates('2026-10-07')[30], '2026-10-31');
  assert.equal(leadingBlanks('month', monthDates('2026-10-07')), 4);  // 2026-10-01은 목요일
  assert.equal(leadingBlanks('week', weekDates('2026-10-07')), 0);
  assert.equal(periodTitle('week', weekDates('2026-10-02')), '9월 27일 ~ 10월 3일');
  assert.equal(periodTitle('month', monthDates('2026-10-07')), '2026년 10월');
});

test('the loaded range adds a week on each side but never passes today, and moving never passes today', () => {
  assert.deepEqual(loadRange('week', '2026-09-30', TODAY), { from: '2026-09-20', to: '2026-10-07' });
  assert.deepEqual(loadRange('week', '2026-09-16', TODAY), { from: '2026-09-06', to: '2026-09-26' });
  assert.deepEqual(loadRange('month', '2026-09-10', TODAY), { from: '2026-08-25', to: '2026-10-07' });
  assert.equal(movePeriod('week', '2026-10-03', 1, TODAY), TODAY);
  assert.equal(movePeriod('week', '2026-10-03', -1, TODAY), '2026-09-26');
  assert.equal(movePeriod('month', '2026-10-07', -1, TODAY), '2026-09-01');
  assert.equal(movePeriod('month', '2026-09-30', 1, TODAY), '2026-10-01');
  assert.equal(canMoveForward('week', TODAY, TODAY), false);
  assert.equal(canMoveForward('week', '2026-10-03', TODAY), true);
  assert.equal(canMoveForward('month', TODAY, TODAY), false);
  assert.deepEqual(datesBetween('2026-09-29', '2026-10-02'), ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
});

test('rows: one line per upper session with keyboard and eye in start order, every policy kept', () => {
  const old = posture({ id: 'old:turtle', scorePolicyVersion: 'reference-similarity-turtle-v1',
    startedAt: at('2026-10-02T00:00:00Z'), updatedAt: at('2026-10-02T00:05:00Z'),
    runMs: 5 * 60_000, validMs: 5 * 60_000, scoreTimeSum: 5 * 60_000 * 60 });
  const byDate = entriesByDate([eye({ status: 'running' }), shoulder(), posture(), old],
    [keyboard({ status: 'interrupted' })], datesBetween('2026-10-01', '2026-10-03'));
  const rows = byDate.get('2026-10-02');
  assert.deepEqual(rows.map(row => [row.mode, row.id]), [['upper', 'old'], ['upper', 's1'], ['keyboard', 'k1'], ['eye', 'e1']]);
  const [legacy, upper, typing, blink] = rows;
  assert.equal(legacy.legacy, true);
  assert.equal(legacy.shoulder, null);
  assert.equal(upper.legacy, false);
  assert.equal(upper.turtle, 70);
  assert.equal(upper.shoulder, 86);
  assert.equal(upper.running, false);
  assert.equal(typing.interrupted, true);
  assert.equal(typing.coverage, 80);
  assert.equal(blink.rate, 14);
  assert.equal(blink.running, true);
  assert.deepEqual(byDate.get('2026-10-01'), []);
});

test('legacy marks any policy that differs from what the app writes today', () => {
  const byDate = entriesByDate(
    [posture({ habitPolicyVersion: 'reference-deviation-v1' }), shoulder(), eye({ policyVersion: 'eye-habits-v1' })],
    [keyboard({ recognitionVersion: 'hands-label-distance-v1' }), keyboard({ id: 'k2', policyVersion: 'ansi-qwerty-touch:1.0.0' }), keyboard({ id: 'k3' })],
    ['2026-10-02']);
  assert.deepEqual(byDate.get('2026-10-02').map(row => [row.id, row.legacy]),
    [['s1', true], ['k1', true], ['k2', true], ['k3', false], ['e1', true]]);
});

test('calendar cells match the rows of the same date, and neighbours stay inside the loaded range', () => {
  const byDate = entriesByDate(
    [posture(), shoulder(), eye({ id: 'e2', startedAt: at('2026-10-05T04:00:00Z'), updatedAt: at('2026-10-05T04:10:00Z') })],
    [keyboard()], datesBetween('2026-09-26', TODAY));
  const [friday] = calendarDays(['2026-10-02'], byDate, TODAY);
  assert.deepEqual(friday.modes, ['upper', 'keyboard']);
  assert.equal(friday.totalMs, 38 * 60_000);  // 상체 18분 + 키보드 20분
  const week = calendarDays(weekDates(TODAY), byDate, TODAY);
  assert.deepEqual(week.slice(2, 5).map(day => [day.date, day.isToday, day.isFuture]),
    [['2026-10-06', false, false], ['2026-10-07', true, false], ['2026-10-08', false, true]]);
  assert.deepEqual(neighborDates(byDate, '2026-10-03', TODAY), { previous: '2026-10-02', next: '2026-10-05' });
  assert.deepEqual(neighborDates(byDate, TODAY, TODAY), { previous: '2026-10-05', next: null });
  assert.deepEqual(neighborDates(byDate, '2026-09-27', TODAY), { previous: null, next: '2026-10-02' });
});

test('upper detail joins neck and shoulder per minute and keeps empty minutes empty', () => {
  const minute = at('2026-10-02T01:05:00Z');
  const bucket = (over = {}) => ({ minute, runMs: 60_000, validMs: 60_000, scoreTimeSum: 60_000 * 70, deviationMs: 0, deviationEpisodeCount: 0, ...over });
  const rows = upperMinutes([
    { record: posture(), buckets: [bucket(), bucket({ minute: minute + 60_000, validMs: 0, scoreTimeSum: 0 })] },
    { record: shoulder(), buckets: [bucket({ scoreTimeSum: 60_000 * 86 })] },
  ]);
  assert.deepEqual(rows.map(row => [row.time, row.turtle, row.shoulder]), [['10:05', 70, 86], ['10:06', null, null]]);
  assert.deepEqual(upperTotals([posture(), shoulder({ validMs: 9 * 60_000 })]), { deviations: 2, validRate: 75 });
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/history-calendar.test.mjs`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` (calendar.ts 없음)

- [ ] **Step 3: `currentPolicies.ts` 만들기**

```ts
import { RECOGNITION_VERSION } from '../../../../database/keyboard.ts';
import type { EntrySource } from '../dashboard/summary.ts';
import { eyePolicy } from '../eye/eyePolicy.ts';
import { ANSI_QWERTY_TOUCH_POLICY_V1 } from '../keyboard/fingerPolicy.ts';
import { HABIT_POLICY } from '../posture/evaluation.ts';
import { shoulderScorePolicy } from '../posture/modes/shoulder.ts';
import { turtleScorePolicy } from '../posture/modes/turtle.ts';

/** Versions the app writes into new records today. Anything else was measured with an earlier standard. */
export const CURRENT_POLICIES = {
  turtle: turtleScorePolicy.version,
  shoulder: shoulderScorePolicy.version,
  habit: HABIT_POLICY.version,
  eye: eyePolicy.version,
  keyboard: `${ANSI_QWERTY_TOUCH_POLICY_V1.id}:${ANSI_QWERTY_TOUCH_POLICY_V1.version}`,
  recognition: RECOGNITION_VERSION,
};

/** "이전 기준": the row was measured with a policy the app no longer writes. */
export function isLegacy(source: EntrySource) {
  if (source.mode === 'eye') return source.record.policyVersion !== CURRENT_POLICIES.eye;
  if (source.mode === 'keyboard') {
    return source.stored.record.policyVersion !== CURRENT_POLICIES.keyboard
      || source.stored.record.recognitionVersion !== CURRENT_POLICIES.recognition;
  }
  return source.records.some(record => record.habitPolicyVersion !== CURRENT_POLICIES.habit
    || record.scorePolicyVersion !== (record.mode === 'turtle' ? CURRENT_POLICIES.turtle : CURRENT_POLICIES.shoulder));
}
```

- [ ] **Step 4: `calendar.ts` 만들기**

```ts
import type { PostureRecord } from '../../../../database/contracts.ts';
import type { EyeRecord } from '../../../../database/eye.ts';
import { keyboardSummary } from '../../../../database/keyboard.ts';
import type { KeyboardStored } from '../../../../database/keyboard.ts';
import { monthDayText } from '../dashboard/format.ts';
import { dayEntries, shiftDate } from '../dashboard/summary.ts';
import type { EntrySource, TimelineEntry } from '../dashboard/summary.ts';
import { isLegacy } from './currentPolicies.ts';

export type CalendarView = 'week' | 'month';
export type EntryMode = TimelineEntry['mode'];
/** A timeline row plus the history tags. */
export interface HistoryEntry extends TimelineEntry { legacy: boolean; running: boolean; coverage: number | null }
export interface CalendarDay { date: string; modes: EntryMode[]; totalMs: number; isToday: boolean; isFuture: boolean }

const MODES: EntryMode[] = ['upper', 'keyboard', 'eye'];
const parts = (date: string) => date.split('-').map(Number) as [number, number, number];
const utcDate = (year: number, monthIndex: number, day: number) => new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);

/** 0 = Sunday. */
export function weekdayIndex(date: string) {
  const [year, month, day] = parts(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Sunday-to-Saturday week that contains `date`. */
export function weekDates(date: string) {
  const start = shiftDate(date, -weekdayIndex(date));
  return Array.from({ length: 7 }, (_, index) => shiftDate(start, index));
}

/** Every date of the month that contains `date`. */
export function monthDates(date: string) {
  const [year, month] = parts(date);
  const length = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length }, (_, index) => utcDate(year, month - 1, index + 1));
}

export const visibleDates = (view: CalendarView, date: string) => (view === 'week' ? weekDates(date) : monthDates(date));

/** Empty cells before the first day so a month grid starts on Sunday. */
export const leadingBlanks = (view: CalendarView, dates: string[]) => (view === 'month' ? weekdayIndex(dates[0]) : 0);

/** "9월 27일 ~ 10월 3일" for a week, "2026년 10월" for a month. */
export function periodTitle(view: CalendarView, dates: string[]) {
  if (view === 'week') return `${monthDayText(dates[0])} ~ ${monthDayText(dates[dates.length - 1])}`;
  const [year, month] = parts(dates[0]);
  return `${year}년 ${month}월`;
}

/** Every date from `from` to `to`, both included. */
export function datesBetween(from: string, to: string) {
  const dates: string[] = [];
  for (let date = from; date <= to; date = shiftDate(date, 1)) dates.push(date);
  return dates;
}

/** The shown dates plus one week on each side, never past today. */
export function loadRange(view: CalendarView, date: string, today: string) {
  const dates = visibleDates(view, date);
  const to = shiftDate(dates[dates.length - 1], 7);
  return { from: shiftDate(dates[0], -7), to: to > today ? today : to };
}

/** ◀ ▶ move a week, or a month to its first day; a date past today becomes today. */
export function movePeriod(view: CalendarView, date: string, direction: -1 | 1, today: string) {
  const [year, month] = parts(date);
  const next = view === 'week' ? shiftDate(date, direction * 7) : utcDate(year, month - 1 + direction, 1);
  return next > today ? today : next;
}

/** ▶ is disabled when the next period starts after today. */
export function canMoveForward(view: CalendarView, date: string, today: string) {
  const dates = visibleDates(view, date);
  return shiftDate(dates[dates.length - 1], 1) <= today;
}

export const entryKey = (entry: TimelineEntry) => `${entry.mode}:${entry.id}`;
export const entryMs = (entry: TimelineEntry) => Math.max(0, entry.endedAt - entry.startedAt);

const statuses = (source: EntrySource) =>
  source.mode === 'upper' ? source.records.map(record => record.status)
    : source.mode === 'eye' ? [source.record.status] : [source.stored.record.status];

/** Rows per date with every policy kept: one per upper session, keyboard and eye record, in start order. */
export function entriesByDate(history: (PostureRecord | EyeRecord)[], keyboard: KeyboardStored[], dates: string[]) {
  const byDate = new Map<string, HistoryEntry[]>();
  for (const date of dates) {
    byDate.set(date, dayEntries(history, keyboard, date).map((entry): HistoryEntry => ({
      ...entry,
      legacy: isLegacy(entry.source),
      running: !entry.interrupted && statuses(entry.source).includes('running'),
      coverage: entry.source.mode === 'keyboard'
        ? keyboardSummary(entry.source.stored.counts, entry.source.stored.record.nearbyCredit).coverage : null,
    })));
  }
  return byDate;
}

/** Calendar cells: the modes and the summed length of the same rows the list shows. */
export function calendarDays(dates: string[], byDate: Map<string, HistoryEntry[]>, today: string): CalendarDay[] {
  return dates.map(date => {
    const entries = byDate.get(date) ?? [];
    return { date, modes: MODES.filter(mode => entries.some(entry => entry.mode === mode)),
      totalMs: entries.reduce((sum, entry) => sum + entryMs(entry), 0), isToday: date === today, isFuture: date > today };
  });
}

/** Closest dates with rows before and after `date` inside the loaded range; never after today. */
export function neighborDates(byDate: Map<string, HistoryEntry[]>, date: string, today: string) {
  const recorded = [...byDate].filter(([day, entries]) => entries.length > 0 && day <= today).map(([day]) => day).sort();
  return { previous: recorded.filter(day => day < date).at(-1) ?? null, next: recorded.find(day => day > date) ?? null };
}
```

- [ ] **Step 5: `detail.ts` 만들기**

```ts
import { averageScore } from '../../../../database/contracts.ts';
import type { PostureRecord, RecordDetail } from '../../../../database/contracts.ts';
import { clockText } from '../dashboard/format.ts';

export type MinuteRow = { minute: number; time: string; turtle: number | null; shoulder: number | null };

/** Neck and shoulder scores per minute of one upper session; minutes without valid time stay empty. */
export function upperMinutes(details: RecordDetail[]): MinuteRow[] {
  const rows = new Map<number, MinuteRow>();
  for (const detail of details) {
    for (const bucket of detail.buckets) {
      const row = rows.get(bucket.minute)
        ?? { minute: bucket.minute, time: clockText(bucket.minute, detail.record.offsetMinutes), turtle: null, shoulder: null };
      row[detail.record.mode] = averageScore(bucket);
      rows.set(bucket.minute, row);
    }
  }
  return [...rows.values()].sort((a, b) => a.minute - b.minute);
}

/** Tile values of one upper session: deviations of both records and the valid share of both run times. */
export function upperTotals(records: PostureRecord[]) {
  const sum = (pick: (record: PostureRecord) => number) => records.reduce((value, record) => value + pick(record), 0);
  const run = sum(record => record.runMs);
  return { deviations: sum(record => record.deviationEpisodeCount), validRate: run > 0 ? (100 * sum(record => record.validMs)) / run : null };
}
```

- [ ] **Step 6: 통과 확인**

Run: `node --test tests/history-calendar.test.mjs`
Expected: PASS (6 tests)

Run: `npm run typecheck`
Expected: 오류 없이 종료

- [ ] **Step 7: 커밋**

```bash
git add src/features/history/currentPolicies.ts src/features/history/calendar.ts src/features/history/detail.ts tests/history-calendar.test.mjs
git commit -m "feat(history): 달력·기록 줄·이전 기준·앞뒤 기록 계산" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: 학습이력 부품 (달력, 기록 목록, 기록 없는 날, 상세)

**Files:**
- Create: `front/src/features/history/labels.ts`, `useRecordDetail.ts`, `HistoryCalendar.tsx`, `DayRecords.tsx`, `EmptyDay.tsx`, `RecordDetail.tsx`
- Test: `front/tests/stats-history-ui.test.mjs`

- [ ] **Step 1: 실패하는 테스트 쓰기**

`front/tests/stats-history-ui.test.mjs` import 블록 끝(`renderToStaticMarkup` 줄 다음)에 추가한다.

```js
import { entriesByDate } from '../src/features/history/calendar.ts';
import { CURRENT_POLICIES } from '../src/features/history/currentPolicies.ts';
```

`const KeyboardStatistics = ...` 다음 줄에 추가한다.

```js
const DayRecords = await load('src/features/history/DayRecords.tsx');
const EmptyDay = await load('src/features/history/EmptyDay.tsx');
```

파일 끝에 추가한다.

```js
const posture = (over = {}) => ({ id: 's1:turtle', owner: '7', mode: 'turtle',
  startedAt: Date.parse('2026-10-02T01:05:00Z'), updatedAt: Date.parse('2026-10-02T01:23:00Z'), offsetMinutes: -540,
  scorePolicyVersion: CURRENT_POLICIES.turtle, habitPolicyVersion: CURRENT_POLICIES.habit,
  longestContinuousMs: 0, status: 'finished',
  runMs: 18 * 60_000, validMs: 18 * 60_000, scoreTimeSum: 18 * 60_000 * 70, deviationMs: 0, deviationEpisodeCount: 1, ...over });

test('record rows show the upper line, local times, and the interrupted and legacy tags', () => {
  const old = posture({ id: 'old:turtle', scorePolicyVersion: 'reference-similarity-turtle-v1', status: 'interrupted',
    startedAt: Date.parse('2026-10-02T00:00:00Z'), updatedAt: Date.parse('2026-10-02T00:05:00Z'),
    runMs: 5 * 60_000, validMs: 5 * 60_000, scoreTimeSum: 5 * 60_000 * 60 });
  const shoulder = posture({ id: 's1:shoulder', mode: 'shoulder', scorePolicyVersion: CURRENT_POLICIES.shoulder, scoreTimeSum: 18 * 60_000 * 86 });
  const entries = entriesByDate([posture(), shoulder, old], [], ['2026-10-02']).get('2026-10-02');
  const out = html(DayRecords, { date: '2026-10-02', entries, selectedKey: 'upper:s1', onSelect: () => {} });
  assert.match(out, /10월 2일 \(금\) 기록/);
  assert.match(out, /2회 · 23분/);
  assert.match(out, /상체<\/b> · 목 70 · 어깨 86/);
  assert.match(out, /10:05 – 10:23 \(18분\)/);
  assert.match(out, />중단됨</);
  assert.match(out, />이전 기준</);
  assert.match(out, /지금과 다른 점수 기준으로 측정한 기록이에요/);
  const current = html(DayRecords, { date: '2026-10-02', entries: entries.filter(entry => !entry.legacy), selectedKey: null, onSelect: () => {} });
  assert.doesNotMatch(current, /이전 기준/);
});

test('empty days: today offers the three starts and the latest record, past days offer only existing neighbours', () => {
  const none = () => {};
  const today = html(EmptyDay, { date: '2026-10-07', isToday: true, previous: '2026-10-05', next: null, onSelect: none, onStart: none });
  assert.match(today, /오늘은 아직 측정하지 않았어요/);
  for (const name of ['상체', '키보드', '안구']) assert.match(today, new RegExp(`${name}</button>`));
  assert.match(today, /가장 최근 기록: 10월 5일 \(월\) 보기/);
  const past = html(EmptyDay, { date: '2026-10-03', isToday: false, previous: '2026-10-02', next: '2026-10-04', onSelect: none, onStart: none });
  assert.match(past, /이 날은 측정 기록이 없어요/);
  assert.match(past, /← 10월 2일 \(금\) 기록 보기/);
  assert.match(past, /10월 4일 \(일\) 기록 보기 →/);
  const alone = html(EmptyDay, { date: '2026-10-03', isToday: false, previous: null, next: null, onSelect: none, onStart: none });
  assert.doesNotMatch(alone, /기록 보기/);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/stats-history-ui.test.mjs`
Expected: FAIL — esbuild가 `src/features/history/DayRecords.tsx`를 찾지 못함

- [ ] **Step 3: `labels.ts` 만들기**

```ts
export const MODE_NAME = { upper: '상체', keyboard: '키보드', eye: '안구' } as const;
export const MODE_DOT = { upper: 'bg-mode-upper', keyboard: 'bg-mode-keyboard', eye: 'bg-mode-eye' } as const;
export const LEGACY_NOTE = '"이전 기준": 지금과 다른 점수 기준으로 측정한 기록이에요. 지금 기준 기록과 합쳐서 계산하지 않아요.';
```

- [ ] **Step 4: `useRecordDetail.ts` 만들기**

```ts
import { useCallback } from 'react';
import type { RecordDetail } from '../../../../database/contracts';
import type { EyeDetail } from '../../../../database/eye';
import type { KeyboardStored } from '../../../../database/keyboard';
import { getCurrentUser } from '../../utils/authStore';
import { recordsApi, recordValue } from '../records/api';
import { useRecordQuery } from '../records/useRecordQuery';
import type { HistoryEntry } from './calendar';

export type LoadedDetail =
  | { mode: 'upper'; details: RecordDetail[] }
  | { mode: 'eye'; detail: EyeDetail }
  | { mode: 'keyboard'; stored: KeyboardStored };

/** Loads the selected row's detail: both upper records, one eye record or one keyboard session. */
export function useRecordDetail(entry: HistoryEntry | null) {
  const owner = getCurrentUser()?.id ?? '';
  const load = useCallback(async (): Promise<LoadedDetail | null> => {
    if (!entry) return null;
    const source = entry.source;
    if (source.mode === 'upper') {
      return { mode: 'upper', details: await Promise.all(source.records.map(record => recordValue(recordsApi().detail(owner, record.id)))) };
    }
    if (source.mode === 'eye') return { mode: 'eye', detail: await recordValue(recordsApi().eyeDetail(owner, source.record.id)) };
    return { mode: 'keyboard', stored: await recordValue(recordsApi().keyboardDetail(owner, source.stored.record.id)) };
  }, [owner, entry]);
  return useRecordQuery(`history-detail:${owner}:${entry ? `${entry.mode}:${entry.id}` : ''}`, load);
}
```

- [ ] **Step 5: `HistoryCalendar.tsx` 만들기**

```tsx
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { longDate, minutesText } from '../dashboard/format';
import { weekdayIndex } from './calendar';
import type { CalendarDay, CalendarView } from './calendar';
import { MODE_DOT, MODE_NAME } from './labels';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const LEGEND = ['upper', 'keyboard', 'eye'] as const;

function DayCell({ day, view, selected, onSelect }: {
  day: CalendarDay; view: CalendarView; selected: boolean; onSelect: (date: string) => void;
}) {
  const dayOfMonth = Number(day.date.slice(8));
  const recorded = day.modes.length > 0;
  const name = view === 'week' ? `${WEEKDAYS[weekdayIndex(day.date)]} ${dayOfMonth}` : String(dayOfMonth);
  const spoken = recorded
    ? `${longDate(day.date)}, ${day.modes.map(mode => MODE_NAME[mode]).join('·')} ${minutesText(day.totalMs)}`
    : `${longDate(day.date)}, 기록 없음`;
  return (
    <button type="button" disabled={day.isFuture} aria-pressed={selected} aria-label={spoken} onClick={() => onSelect(day.date)}
      className={`flex min-h-16 flex-col items-start gap-1 rounded-xl p-2 text-left ${
        selected ? 'border-2 border-heading' : day.isFuture ? 'border border-dashed border-border' : 'border border-border hover:bg-nav-active'
      } ${day.isFuture ? 'cursor-default opacity-40' : recorded ? 'bg-surface' : 'bg-surface-muted'}`}>
      <span className="flex items-center gap-1">
        <span className={`text-sm font-semibold ${recorded ? 'text-heading' : 'text-muted'}`}>{name}</span>
        {day.isToday && <span className="rounded bg-heading px-1 text-[10px] font-bold text-surface">오늘</span>}
      </span>
      {recorded && (
        <span className="flex gap-0.5">
          {day.modes.map(mode => <span key={mode} aria-hidden="true" className={`h-2 w-2 rounded-full ${MODE_DOT[mode]}`} />)}
        </span>
      )}
      {recorded && <span className="text-xs text-muted">{minutesText(day.totalMs)}</span>}
    </button>
  );
}

/** Week or month calendar: mode dots and measured time per day, faded empty days, disabled future days. */
export default function HistoryCalendar({ view, title, days, blanks, selected, canForward, onSelect, onMove }: {
  view: CalendarView; title: string; days: CalendarDay[]; blanks: number; selected: string; canForward: boolean;
  onSelect: (date: string) => void; onMove: (direction: -1 | 1) => void;
}) {
  return (
    <section aria-label="달력" className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button type="button" aria-label="이전 기간" onClick={() => onMove(-1)}
            className="rounded-lg p-1 text-heading hover:bg-nav-active"><ChevronLeft size={18} /></button>
          <h2 className="font-bold text-heading">{title}</h2>
          <button type="button" aria-label="다음 기간" disabled={!canForward} onClick={() => onMove(1)}
            className="rounded-lg p-1 text-heading hover:bg-nav-active disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent">
            <ChevronRight size={18} />
          </button>
        </div>
        <ul className="flex gap-3 text-xs text-muted">
          {LEGEND.map(mode => (
            <li key={mode} className="flex items-center gap-1">
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${MODE_DOT[mode]}`} />{MODE_NAME[mode]}
            </li>
          ))}
        </ul>
      </div>
      {view === 'month' && (
        <div className="mb-1 grid grid-cols-7 gap-2 text-center text-xs text-muted">{WEEKDAYS.map(day => <span key={day}>{day}</span>)}</div>
      )}
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: blanks }, (_, index) => <span key={`blank-${index}`} aria-hidden="true" />)}
        {days.map(day => <DayCell key={day.date} day={day} view={view} selected={day.date === selected} onSelect={onSelect} />)}
      </div>
    </section>
  );
}
```

- [ ] **Step 6: `DayRecords.tsx` 만들기**

```tsx
import type { ReactNode } from 'react';
import { clockText, longDate, minutesText, rateText, scoreText } from '../dashboard/format';
import { entryKey, entryMs } from './calendar';
import type { HistoryEntry } from './calendar';
import { LEGACY_NOTE, MODE_DOT, MODE_NAME } from './labels';

const valueText = (entry: HistoryEntry) => {
  if (entry.mode === 'upper') return `목 ${scoreText(entry.turtle)} · 어깨 ${scoreText(entry.shoulder)}`;
  if (entry.mode === 'keyboard') return entry.score === null ? '판정 자료 없음' : `${scoreText(entry.score)}점`;
  return rateText(entry.rate);
};

function Tag({ children }: { children: ReactNode }) {
  return <span className="ml-1 rounded bg-track px-1 text-xs font-normal text-muted">{children}</span>;
}

/** The selected day's rows: one line per upper session, keyboard and eye, in start order. */
export default function DayRecords({ date, entries, selectedKey, onSelect }: {
  date: string; entries: HistoryEntry[]; selectedKey: string | null; onSelect: (key: string) => void;
}) {
  const total = entries.reduce((sum, entry) => sum + entryMs(entry), 0);
  return (
    <section aria-label={`${longDate(date)} 기록`} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold text-heading">{`${longDate(date)} 기록`}</h2>
        <span className="text-xs text-muted">{`${entries.length}회 · ${minutesText(total)}`}</span>
      </div>
      <ol className="space-y-2">
        {entries.map(entry => {
          const key = entryKey(entry);
          const selected = key === selectedKey;
          return (
            <li key={key}>
              <button type="button" aria-pressed={selected} onClick={() => onSelect(key)}
                className={`flex w-full gap-3 rounded-xl p-3 text-left text-sm ${selected ? 'border-2 border-heading' : 'border border-border hover:bg-nav-active'}`}>
                <span aria-hidden="true" className={`w-1 shrink-0 rounded-full ${MODE_DOT[entry.mode]}`} />
                <span className="min-w-0">
                  <span className="block text-heading">
                    <b>{MODE_NAME[entry.mode]}</b>{` · ${valueText(entry)}`}
                    {entry.interrupted && <Tag>중단됨</Tag>}
                    {entry.running && <Tag>기록 중</Tag>}
                    {entry.legacy && <Tag>이전 기준</Tag>}
                  </span>
                  <span className="block text-xs text-muted">
                    {`${clockText(entry.startedAt, entry.offsetMinutes)} – ${clockText(entry.endedAt, entry.offsetMinutes)} (${minutesText(entryMs(entry))})${entry.coverage === null ? '' : ` · 판정 가능 ${Math.round(entry.coverage)}%`}`}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {entries.some(entry => entry.legacy) && <p className="mt-auto text-xs text-muted">{LEGACY_NOTE}</p>}
    </section>
  );
}
```

- [ ] **Step 7: `EmptyDay.tsx` 만들기**

```tsx
import { Play } from 'lucide-react';
import { longDate } from '../dashboard/format';

export type StartMode = 'upper_body' | 'keyboard' | 'eye';
const STARTS: { id: StartMode; name: string; color: string }[] = [
  { id: 'upper_body', name: '상체', color: 'bg-mode-upper' },
  { id: 'keyboard', name: '키보드', color: 'bg-mode-keyboard' },
  { id: 'eye', name: '안구', color: 'bg-mode-eye' },
];
const LINK = 'text-sm font-semibold text-secondary hover:underline';
const OUTLINE = 'rounded-full border border-border px-3 py-1.5 text-sm font-semibold text-heading hover:bg-nav-active';

/** A selected day without rows. Today offers the three starts; a past day offers its closest recorded days. */
export default function EmptyDay({ date, isToday, previous, next, onSelect, onStart }: {
  date: string; isToday: boolean; previous: string | null; next: string | null;
  onSelect: (date: string) => void; onStart: (mode: StartMode) => void;
}) {
  return (
    <section aria-label={`${longDate(date)} 기록`} className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold text-heading">{`${longDate(date)} 기록`}</h2>
        <span className="text-xs text-muted">0회</span>
      </div>
      {isToday ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="font-bold text-heading">오늘은 아직 측정하지 않았어요</p>
          <p className="text-sm text-muted">측정을 시작하면 여기에 오늘 기록이 쌓여요.</p>
          <div className="flex flex-wrap justify-center gap-2">
            {STARTS.map(mode => (
              <button key={mode.id} type="button" onClick={() => onStart(mode.id)} className={`flex items-center gap-2 ${OUTLINE}`}>
                <span aria-hidden="true" className={`flex h-6 w-6 items-center justify-center rounded-full text-white ${mode.color}`}>
                  <Play size={12} fill="currentColor" className="ml-0.5" />
                </span>
                {mode.name}
              </button>
            ))}
          </div>
          {previous && (
            <button type="button" onClick={() => onSelect(previous)} className={LINK}>{`← 가장 최근 기록: ${longDate(previous)} 보기`}</button>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="font-bold text-heading">이 날은 측정 기록이 없어요</p>
          <div className="flex flex-wrap justify-center gap-2">
            {previous && <button type="button" onClick={() => onSelect(previous)} className={OUTLINE}>{`← ${longDate(previous)} 기록 보기`}</button>}
            {next && <button type="button" onClick={() => onSelect(next)} className={OUTLINE}>{`${longDate(next)} 기록 보기 →`}</button>}
          </div>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 8: `RecordDetail.tsx` 만들기**

```tsx
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { keyboardSummary } from '../../../../database/keyboard';
import type { KeyboardStored } from '../../../../database/keyboard';
import { SourceError, SourceLoading } from '../dashboard/SourceState';
import { clockText, scoreText } from '../dashboard/format';
import { EyeDetailData } from '../eye/EyeRecordData';
import { scoreText as trainingScoreText } from '../keyboard/labels';
import { ChartHeader } from '../statistics/parts';
import { percentLabel } from '../statistics/text';
import type { HistoryEntry } from './calendar';
import { upperMinutes, upperTotals } from './detail';
import type { MinuteRow } from './detail';
import { MODE_NAME } from './labels';
import type { LoadedDetail } from './useRecordDetail';

const LINES = [
  { key: 'turtle', name: '목', color: 'var(--color-mode-upper)' },
  { key: 'shoulder', name: '어깨', color: 'var(--color-mode-shoulder)' },
];

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-muted p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-xl font-extrabold text-heading">{value}</p>
    </div>
  );
}

function MinuteChart({ rows }: { rows: MinuteRow[] }) {
  if (!rows.length) return <p className="text-sm text-muted">분별 기록이 없어요</p>;
  return (
    <div className="h-56" role="img" aria-label="분별 목·어깨 점수">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--color-track)" />
          <XAxis dataKey="time" tickLine={false} axisLine={false} minTickGap={24} tick={{ fill: 'var(--color-muted)', fontSize: 11 }} />
          <YAxis domain={[0, 100]} tickLine={false} axisLine={false} width={32} tick={{ fill: 'var(--color-muted)', fontSize: 11 }} />
          <Tooltip isAnimationActive={false} formatter={value => (typeof value === 'number' ? Math.round(value) : value)} />
          {LINES.map(line => (
            <Line key={line.key} dataKey={line.key} name={line.name} type="linear" stroke={line.color} strokeWidth={2}
              connectNulls={false} isAnimationActive={false} dot={{ r: 2, fill: line.color, strokeWidth: 0 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function KeyboardSession({ stored }: { stored: KeyboardStored }) {
  const record = stored.record;
  return (
    <div className="space-y-1 rounded-xl border border-border p-3 text-sm text-muted">
      <p>전체 세션 · {record.total}회 · {trainingScoreText(keyboardSummary(stored.counts, record.nearbyCredit).score)} · {record.policyVersion}</p>
      <p>최근 집계 시각: {new Date(record.updatedAt).toLocaleString()} · {record.status === 'interrupted' ? '앱 종료 등으로 중단된 세션' : record.status === 'finished' ? '정상 종료' : '관찰 중'}</p>
      <p>일자·키·손가락별 집계만 보관합니다. 입력 순서나 작성 내용은 조회할 수 없습니다.</p>
    </div>
  );
}

/** Right panel: tiles and a per-minute chart for upper; the existing eye table and keyboard session text. */
export default function RecordDetail({ entry, query }: {
  entry: HistoryEntry; query: { data: LoadedDetail | null; loading: boolean; error: string | null; retry: () => void };
}) {
  const totals = entry.source.mode === 'upper' ? upperTotals(entry.source.records) : null;
  const data = query.data;
  return (
    <section aria-label="기록 상세" className="space-y-4 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold text-heading">
          {`${MODE_NAME[entry.mode]} · ${clockText(entry.startedAt, entry.offsetMinutes)} – ${clockText(entry.endedAt, entry.offsetMinutes)}`}
        </h2>
        <span className="text-xs text-muted">{entry.interrupted ? '중단됨' : entry.running ? '기록 중' : '정상 종료'}</span>
      </div>
      {totals && (
        <>
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
            <Tile label="목" value={entry.turtle === null ? '—' : `${scoreText(entry.turtle)}점`} />
            <Tile label="어깨" value={entry.shoulder === null ? '—' : `${scoreText(entry.shoulder)}점`} />
            <Tile label="기준에서 벗어남" value={`${totals.deviations}회`} />
            <Tile label="제대로 측정" value={percentLabel(totals.validRate)} />
          </div>
          <ChartHeader title="분별 점수" legend={LINES} />
        </>
      )}
      {query.loading ? <SourceLoading className="h-56" />
        : query.error ? <SourceError onRetry={query.retry} />
        : data?.mode === 'upper' ? <MinuteChart rows={upperMinutes(data.details)} />
        : data?.mode === 'eye' ? <EyeDetailData detail={data.detail} />
        : data?.mode === 'keyboard' ? <KeyboardSession stored={data.stored} />
        : null}
    </section>
  );
}
```

- [ ] **Step 9: 통과 확인**

Run: `node --test tests/stats-history-ui.test.mjs`
Expected: PASS (4 tests)

Run: `npm run typecheck && npm run lint`
Expected: 둘 다 오류 없이 종료. `Tooltip formatter` 타입 오류가 나면 `formatter` 속성을 지운다(값이 소수로 보일 뿐 동작은 같다).

- [ ] **Step 10: 커밋**

```bash
git add src/features/history/labels.ts src/features/history/useRecordDetail.ts src/features/history/HistoryCalendar.tsx src/features/history/DayRecords.tsx src/features/history/EmptyDay.tsx src/features/history/RecordDetail.tsx tests/stats-history-ui.test.mjs
git commit -m "feat(history): 달력·기록 목록·기록 없는 날·오른쪽 상세 부품" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: 학습이력 화면 조립

**Files:**
- Create: `front/src/features/history/useHistoryData.ts`
- Modify: `front/src/pages/LearningHistory.tsx` (전체 교체)

- [ ] **Step 1: `useHistoryData.ts` 만들기**

```ts
import { useCallback, useMemo } from 'react';
import type { PostureRecord } from '../../../../database/contracts';
import type { EyeRecord } from '../../../../database/eye';
import { getCurrentUser } from '../../utils/authStore';
import { LOGIN_REQUIRED, statusOf } from '../dashboard/useDashboardData';
import { recordsApi, recordValue } from '../records/api';
import { useRecordQuery } from '../records/useRecordQuery';
import { datesBetween, entriesByDate, loadRange } from './calendar';
import type { CalendarView } from './calendar';

/** Loads every history page and the keyboard records of the shown period plus a week on each side. */
export function useHistoryData(view: CalendarView, date: string, today: string) {
  const owner = getCurrentUser()?.id ?? '';
  const { from, to } = loadRange(view, date, today);

  const loadHistory = useCallback(async () => {
    if (!owner) throw new Error(LOGIN_REQUIRED);
    const records: (PostureRecord | EyeRecord)[] = [];
    for (;;) {
      const page = await recordValue(recordsApi().history({ owner, from, to, offset: records.length }));
      records.push(...page.records);
      if (!page.hasMore || !page.records.length) return records;
    }
  }, [owner, from, to]);
  const loadKeyboard = useCallback(async () => {
    if (!owner) throw new Error(LOGIN_REQUIRED);
    return recordValue(recordsApi().keyboardStatistics({ owner, from, to }));
  }, [owner, from, to]);

  const key = `${owner}:${from}:${to}`;
  const history = useRecordQuery('history-records:' + key, loadHistory);
  const keyboard = useRecordQuery('history-keyboard:' + key, loadKeyboard);
  const byDate = useMemo(() => entriesByDate(history.data ?? [], keyboard.data ?? [], datesBetween(from, to)),
    [history.data, keyboard.data, from, to]);
  return {
    byDate,
    status: { history: statusOf(history), keyboard: statusOf(keyboard) },
    retry: () => { history.retry(); keyboard.retry(); },
    retryKeyboard: keyboard.retry,
  };
}
```

- [ ] **Step 2: `LearningHistory.tsx` 전체 교체**

```tsx
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SourceError, SourceLoading } from '../features/dashboard/SourceState';
import { pastDateOrNull } from '../features/dashboard/summary';
import { calendarDays, canMoveForward, entryKey, leadingBlanks, movePeriod, neighborDates, periodTitle, visibleDates } from '../features/history/calendar';
import type { CalendarView } from '../features/history/calendar';
import DayRecords from '../features/history/DayRecords';
import EmptyDay from '../features/history/EmptyDay';
import HistoryCalendar from '../features/history/HistoryCalendar';
import RecordDetail from '../features/history/RecordDetail';
import { useHistoryData } from '../features/history/useHistoryData';
import { useRecordDetail } from '../features/history/useRecordDetail';
import { todayDateKey } from '../features/records/views';

const VIEWS: { id: CalendarView; name: string }[] = [{ id: 'week', name: '주간' }, { id: 'month', name: '월간' }];

const LearningHistory = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const today = todayDateKey();
  const [date, setDate] = useState(() => pastDateOrNull(params.get('date'), today) ?? today);
  const [view, setView] = useState<CalendarView>('week');
  const [picked, setPicked] = useState<string | null>(null);
  const { byDate, status, retry, retryKeyboard } = useHistoryData(view, date, today);
  const loading = status.history === 'loading' || status.keyboard === 'loading';
  const dates = visibleDates(view, date);
  const entries = byDate.get(date) ?? [];
  const selected = entries.find(entry => entryKey(entry) === picked) ?? entries[0] ?? null;
  const detail = useRecordDetail(selected);
  const { previous, next } = neighborDates(byDate, date, today);
  const choose = (day: string) => { setDate(day); setPicked(null); };
  const statistics = `/statistics?end=${date}&days=7${selected ? `&mode=${selected.mode}` : ''}`;

  return (
    <div className="space-y-4 pb-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-heading">학습이력</h1>
          <p className="mt-1 text-sm text-muted">날짜를 고르면 그날 측정한 기록이 보여요</p>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate(statistics)} className="text-sm font-semibold text-secondary hover:underline">
            이 날까지 7일 통계 →
          </button>
          <div role="group" aria-label="달력 보기" className="flex rounded-xl bg-track p-1">
            {VIEWS.map(item => (
              <button key={item.id} type="button" aria-pressed={view === item.id} onClick={() => setView(item.id)}
                className={`rounded-lg px-3 py-1 text-sm font-semibold ${view === item.id ? 'bg-surface text-heading shadow-sm' : 'text-muted'}`}>
                {item.name}
              </button>
            ))}
          </div>
        </div>
      </header>
      {loading ? (
        <>
          <SourceLoading className="h-40" />
          <SourceLoading className="h-64" />
        </>
      ) : status.history === 'error' ? (
        <SourceError onRetry={retry} />
      ) : (
        <>
          <HistoryCalendar view={view} title={periodTitle(view, dates)} days={calendarDays(dates, byDate, today)}
            blanks={leadingBlanks(view, dates)} selected={date} canForward={canMoveForward(view, date, today)}
            onSelect={choose} onMove={direction => choose(movePeriod(view, date, direction, today))} />
          {status.keyboard === 'error' && (
            <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <span>키보드 기록을 불러오지 못했어요</span>
              <button type="button" onClick={retryKeyboard}
                className="rounded-lg border border-border px-2 py-1 font-semibold text-heading hover:bg-nav-active">다시 시도</button>
            </div>
          )}
          {selected ? (
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <DayRecords date={date} entries={entries} selectedKey={entryKey(selected)} onSelect={setPicked} />
              <RecordDetail entry={selected} query={detail} />
            </div>
          ) : (
            <EmptyDay date={date} isToday={date === today} previous={previous} next={next}
              onSelect={choose} onStart={mode => navigate(`/learn/${mode}`)} />
          )}
        </>
      )}
    </div>
  );
};

export default LearningHistory;
```

- [ ] **Step 3: 확인**

Run: `npm run typecheck && npm run lint && npm test`
Expected: 모두 통과

- [ ] **Step 4: 커밋**

```bash
git add src/features/history/useHistoryData.ts src/pages/LearningHistory.tsx
git commit -m "feat(history): 주간·월간 달력과 기록 상세 학습이력 화면 조립" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: 문서

**Files:**
- Modify: `docs/architecture.md:45`, `:66`, `:85`, `:91`
- Modify: `database/README.md:11`, `:49`, `:73`
- Modify: `front/src/features/keyboard/README.md:94-97`
- Modify: `docs/superpowers/specs/2026-10-06-stats-history-redesign-design.md` (4.5절, 5절 표)

- [ ] **Step 1: `docs/architecture.md`**

45행(대시보드 줄) 끝의 `[설계](superpowers/specs/2026-10-06-dashboard-redesign-design.md) |`를 다음으로 바꾼다.

```markdown
[설계](superpowers/specs/2026-10-06-dashboard-redesign-design.md). 통계·학습이력도 `summary.ts`(날짜 helper·정책 묶음·날짜별 값·기록 줄), `format.ts`, `DayDetail`, `ScoreRing`, `SourceState`를 가져다 씀 |
```

66행 `| front/src/pages/Statistics.tsx, LearningHistory.tsx | ... |`를 다음 세 줄로 바꾼다.

```markdown
| `front/src/pages/Statistics.tsx`, `front/src/features/statistics/` | 통계(7/30일, 직전 같은 길이 기간 비교, 상체·키보드·안구 탭). `period.ts`가 세 출처 응답으로 기간 값을 계산하는 순수 함수, `useStatisticsData.ts`가 불러옴. 키보드 탭은 `features/keyboard/KeyboardStatistics.tsx`(계산은 키보드 담당). [설계](superpowers/specs/2026-10-06-stats-history-redesign-design.md) |
| `front/src/pages/LearningHistory.tsx`, `front/src/features/history/` | 학습이력(주간·월간 달력, 시작일별 기록 줄, 오른쪽 상세, 기록 없는 날). `calendar.ts`가 달력·기록 줄·앞뒤 기록을 계산하고 `currentPolicies.ts`가 "이전 기준"을 판단. 세 모드의 세션 상세를 여기서 봄 |
| `features/records/StatisticsData.tsx`, `features/eye/EyeStatistics.tsx`, `EyeRecordData.tsx`의 `EyeStatisticsData`, `records/views.ts`의 `historyView`·`historyGraph` | 2026-10-07 통계·학습이력 개편 뒤 쓰지 않지만 되돌리기용으로 남김(기존 테스트 유지) |
```

85행을 다음으로 바꾼다.

```markdown
학습 모드 선택은 `안구 / 상체 / 키보드` 순서, 통계 탭은 대시보드와 같은 `상체 / 키보드 / 안구` 순서입니다. 통계는 7/30일 기간과 바로 앞 같은 길이 기간을 비교하고 모드별 최신 정책 묶음만 씁니다. 상체는 목·어깨를 한 그래프에, 키보드는 기존 집계·히트맵을, 안구는 깜빡임 빈도·유효 관찰·휴식·안내 횟수를 보여줍니다. 세 모드의 세션 상세는 학습이력에서 봅니다.
```

91행의 `정책별 통계·히트맵·세션 상세는 Statistics의 키보드 모드에 있습니다.`를 다음으로 바꾼다.

```markdown
정책별 통계·히트맵은 Statistics의 키보드 탭에, 세션 상세는 학습이력에 있습니다.
```

- [ ] **Step 2: `database/README.md`**

11행의 `통계의 상체 선택에서는 두 부위를 나란히 표시하고 정책별로 분리합니다. 이력과 달력 수는 부위별 기록 기준이므로 상체 1회는 기록 2개입니다.`를 다음으로 바꾼다.

```markdown
통계의 상체 탭은 두 부위를 한 그래프에 나란히 표시하고 최신 정책 묶음만 씁니다. 저장은 부위별 기록이라 상체 1회는 기록 2개이고, 학습이력 화면은 같은 세션의 두 기록을 한 줄로 묶어 보여줍니다.
```

49행의 `통계의 키보드 모드는 최근 7/30일 추이·키 히트맵·손가락 분포·원인·세션 상세를 제공합니다. 목/어깨 달력 화면에 키보드 세션을 혼합하지 않습니다.`를 다음으로 바꾼다.

```markdown
통계의 키보드 탭은 7/30일 추이·키 히트맵·손가락 분포·원인을 제공하고, 세션 상세는 학습이력에서 봅니다(2026-10-07). 학습이력 달력에는 키보드 세션도 시작일에 함께 표시합니다.
```

73행의 `통계는 최근 7/30일을 정책별로 분리하고, 학습이력은 세션과 분별 상세를 제공합니다.`를 다음으로 바꾼다.

```markdown
통계는 7/30일 중 최신 정책 묶음만 보여주고, 학습이력은 세션과 분별 상세를 제공합니다.
```

- [ ] **Step 3: `front/src/features/keyboard/README.md` 94~97행 교체**

```markdown
`KeyboardStatistics` supplies score/agreement/coverage/consistency, daily trends,
key heatmaps, finger/reason distributions and frequent differences, grouped by
identical score/recognition versions and weight. Since 2026-10-07 the Statistics
page loads the records and passes them in, and session details moved to the
learning history screen. SQLite and retry/delete/close contracts are in
[database/README.md](../../../../database/README.md).
```

- [ ] **Step 4: 설계 문서 맞추기**

4.5절의 `  - 맨 아래에 이전 기준 안내 문구(3절)를 둔다.`를 다음으로 바꾼다.

```markdown
  - 이전 기준 기록이 있으면 맨 아래에 안내 문구(3절)를 둔다.
```

5절 `features/statistics/` 표의 `UpperPanel.tsx`, `EyePanel.tsx` 줄 다음에 추가한다.

```markdown
| `parts.tsx`, `text.ts` | 탭들이 같이 쓰는 카드 제목·그래프 머리·빈 안내·학습이력 링크와 비교 칩·퍼센트·기간 문자열 |
```

5절 `features/history/` 표의 `HistoryCalendar.tsx` 줄 다음에 추가한다.

```markdown
| `detail.ts`, `labels.ts` | 상체 상세의 분별 점수·숫자 칸 값(순수 함수)과 모드 이름·색·이전 기준 문구 |
```

6.2절 상체 기간 요약의 `  - 그래프 y축 아래쪽은 대시보드처럼 가장 낮은 점수에 맞춰 10 단위로 내린다.`를 다음으로 바꾼다.

```markdown
  - 그래프 y축 아래쪽은 대시보드처럼 가장 낮은 점수에 맞춰 10 단위로 내린다. 시간대별 그래프도 시간대 값으로 같은 방식을 쓴다.
```

- [ ] **Step 5: 커밋** (저장소 루트에서)

```bash
git add docs/architecture.md database/README.md front/src/features/keyboard/README.md docs/superpowers/specs/2026-10-06-stats-history-redesign-design.md
git commit -m "docs: 통계·학습이력 개편 구조와 키보드 세션 상세 위치" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: 전체 확인

- [ ] **Step 1: 프론트 검사**

Run: `npm run typecheck && npm run lint && npm test`
Expected: 모두 통과. 테스트 수는 141 + 이번 21개(summary 2, dashboard-ui 1, period 8, history 6, stats-history-ui 4) = 162

Run: `npm run build`
Expected: 성공. 기존 큰 청크·동적 import 경고와 SSR 차트 크기 경고는 남아도 된다. 설정 임시 파일 문제로 실패하면 `npm run build -- --configLoader runner`

- [ ] **Step 2: 남겨 둔 파일 확인** (저장소 루트에서)

Run: `git diff --stat cc4ba54 -- front/src/features/records/StatisticsData.tsx front/src/features/eye/EyeStatistics.tsx front/src/features/eye/EyeRecordData.tsx front/src/features/records/views.ts front/tests/record-ui.test.mjs front/tests/eye-record-ui.test.mjs front/src/components/ModeSelector.tsx`
Expected: 출력 없음(삭제·변경 없음)

- [ ] **Step 3: 전체 검사** (저장소 루트에서)

Run: `.\moti.cmd check`
Expected: 프론트·서버·Python 검사 통과. 이 환경에서 실행할 수 없으면 실행하지 못한 이유를 기록하고 Step 1 결과로 대신한다.

- [ ] **Step 4: 실제 앱 확인 (사용자)**

로그인이 필요하므로 앱을 띄운 뒤 사용자에게 아래를 확인받는다. 배포 DB에 테스트 기록을 쓰지 않는다.
- 통계 세 탭: 숫자 4개, 날짜별 그래프(빈 날 흐린 글자, 마우스 올리면 날짜 상자, 누르면 학습이력 이동), 보조 카드, 7일/30일 전환
- 대시보드 7일 그래프와 통계 7일 날짜별 값이 같은지
- 학습이력: 주간·월간, ◀ ▶(미래 비활성), 기록 줄과 오른쪽 상세(상체·키보드·안구), 오늘·지난 날 기록 없는 화면, "이 날까지 7일 통계 →"
- 밝은/다크 테마와 창 폭 1280 이상, 1100, 800
```
