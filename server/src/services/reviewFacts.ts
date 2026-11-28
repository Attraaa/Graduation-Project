import type { ReviewInput } from './aiReview.js';

/*
 * AI 총평의 "사실 목록"입니다. 변화 방향, 표본 부족, 잘한 점·개선할 점 문장, 참고용 안내와 기본 요약까지 여기서 정하고,
 * 모델은 기간 요약만 다시 씁니다. 아래 기준값은 비교 시험 전의 잠정값이며 건강 기준이 아닙니다.
 */
const SAME_SCORE = 2; // 점수 변화가 이보다 작으면 "비슷함"
const SAME_BLINK = 1; // 분당 깜빡임 변화가 이보다 작으면 "비슷함"
const HIGH_SCORE = 80;
const LOW_SCORE = 60;
const LOW_DEVIATION = 10; // 제대로 관찰한 시간 중 기준 자세에서 벗어나 있던 시간 비율(%)
const HIGH_DEVIATION = 30;
const LOW_VALID = 70; // 측정 시간 중 얼굴과 어깨가 보여 분석한 시간 비율(%)
const SHORT_UPPER_MINUTES = 30;
const SHORT_EYE_MINUTES = 10;
const REGULAR_SESSIONS_PER_DAY = 0.5;
const FEW_JUDGED = 200;
const LOW_COVERAGE = 50;
const HIGH_CONSISTENCY = 90;
const FREQUENT_KEY_RATE = 20;
/** The screen shows this many strengths and improvements. */
export const SHOWN_CANDIDATES = 3;

type Area = '상체' | '깜빡임' | '타자';
export interface ReviewFacts {
  days: 7 | 30;
  records: string[];
  /** The records a summary needs: scores, measuring time and blinking. Detail ratios stay out so a model cannot misread them. */
  highlights: string[];
  strengths: string[];
  improvements: string[];
  cautions: string[];
  /** Areas whose records are only indicative, for the note the code adds to a summary. */
  limited: Area[];
  /** A plain summary from the records, for when no model is available or its summary fails the checks. */
  overview: string;
}
type Candidates = Pick<ReviewFacts, 'strengths' | 'improvements'>;
/** A clause of the plain summary: its form before another clause, and its form at the end of the sentence. */
type Clause = [joined: string, last: string];
type Draft = ReviewFacts & { clauses: Clause[]; blink: string | null };

const KEY_NAMES: Record<string, string> = { Semicolon: '; 키', Comma: ', 키', Period: '. 키', Slash: '/ 키', Space: '스페이스바' };
const keyName = (code: string) => (code.startsWith('Key') ? `${code.slice(3)} 키` : KEY_NAMES[code] ?? code);

function duration(minutes: number) {
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60), rest = total % 60;
  return hours ? `${hours}시간${rest ? ` ${rest}분` : ''}` : `${rest}분`;
}

function caution(facts: Draft, area: Area, line: string) {
  facts.cautions.push(line);
  if (!facts.limited.includes(area)) facts.limited.push(area);
}

function highlight(facts: Draft, line: string) {
  facts.records.push(line);
  facts.highlights.push(line);
}

/** Rounded values are compared, so the numbers in one line always add up. */
function change(current: number, previous: number | null, days: number, unit: string, same: number, [up, down]: [string, string]) {
  if (previous === null) return { text: `직전 ${days}일 기록 없음`, delta: null };
  const delta = Math.round(current) - Math.round(previous);
  const moved = Math.abs(delta) < same ? '비슷함' : `${Math.abs(delta)}${unit} ${delta > 0 ? up : down}`;
  return { text: `직전 ${days}일 ${Math.round(previous)}${unit}, ${moved}`, delta: Math.abs(delta) < same ? 0 : delta };
}

/**
 * One score line and at most one candidate for it: a change wins over the level. Nothing is judged when the
 * sample is too thin to trust. Returns whether an improvement was added, so the next score can skip repeating advice.
 */
function score(facts: Draft, area: Candidates, name: string, current: number | null, previous: number | null, reliable: boolean, advice: string, keepDecimal = false) {
  if (current === null) return false;
  const value = keepDecimal ? Math.round(current * 10) / 10 : Math.round(current);
  const moved = change(current, previous, facts.days, '점', SAME_SCORE, ['오름', '내려감']);
  highlight(facts, `${name} ${value}점 (${moved.text})`);
  const subject = `${name}는`;
  if (moved.delta === null) facts.clauses.push([`${subject} ${value}점이었고`, `${subject} ${value}점이었어요`]);
  else if (moved.delta > 0) facts.clauses.push([`${subject} ${moved.delta}점 올랐고`, `${subject} ${moved.delta}점 올랐어요`]);
  else if (moved.delta < 0) facts.clauses.push([`${subject} ${-moved.delta}점 내려갔고`, `${subject} ${-moved.delta}점 내려갔어요`]);
  else facts.clauses.push([`${subject} 직전과 비슷했고`, `${subject} 직전과 비슷했어요`]);
  if (!reliable) return false;
  const tip = advice ? ` ${advice}` : '';
  const before = area.improvements.length;
  if (moved.delta && moved.delta > 0) area.strengths.push(`${name}가 ${value}점으로 직전 ${facts.days}일보다 ${moved.delta}점 올랐어요.`);
  else if (moved.delta && moved.delta < 0) area.improvements.push(`${name}가 ${value}점으로 직전 ${facts.days}일보다 ${-moved.delta}점 내려갔어요.${tip}`);
  else if (value >= HIGH_SCORE) area.strengths.push(`${name}가 ${value}점으로 높았어요.`);
  else if (value < LOW_SCORE) area.improvements.push(`${name}가 ${value}점이에요.${tip}`);
  return area.improvements.length > before;
}

function upper(facts: Draft, area: Candidates, input: NonNullable<ReviewInput['upper']>) {
  const valid = input.validRate === null ? null : Math.round(input.validRate);
  const short = input.measuredMinutes < SHORT_UPPER_MINUTES;
  // With little of the body in view, counts of leaving the reference posture would read as "stayed still", so they are left out.
  const visible = valid === null || valid >= LOW_VALID;
  const reliable = !short && visible;
  const advice = '측정을 시작할 때 기준 자세를 다시 잡아 보세요.';
  const clauses = facts.clauses.length;
  const neckAdvised = score(facts, area, '목 자세 점수', input.neck.current, input.neck.previous, reliable, advice);
  score(facts, area, '좌우 균형 점수', input.balance.current, input.balance.previous, reliable, neckAdvised ? '' : advice);
  highlight(facts, `상체 측정 시간 ${duration(input.measuredMinutes)}, 측정 ${input.sessions}회`);
  // Without a score, the plain summary still says how much was measured.
  if (facts.clauses.length === clauses) {
    const measured = `상체를 ${input.sessions}번, ${duration(input.measuredMinutes)} 측정`;
    facts.clauses.push([`${measured}했고`, `${measured}했어요`]);
  }
  if (visible) {
    facts.records.push(`기준 자세에서 2초 넘게 벗어난 횟수 ${input.deviations}번`);
    if (input.deviationRate !== null) {
      const rate = Math.round(input.deviationRate);
      facts.records.push(`제대로 관찰한 시간 중 기준 자세에서 벗어나 있던 시간 ${rate}%`);
      if (reliable && rate <= LOW_DEVIATION) area.strengths.push(`기준 자세에서 벗어나 있던 시간이 ${rate}%로 짧았어요.`);
      if (reliable && rate >= HIGH_DEVIATION) area.improvements.push(`기준 자세에서 벗어나 있던 시간이 ${rate}%예요. 화면을 오래 볼 때 기준 자세를 떠올려 보세요.`);
    }
  }
  if (valid !== null) {
    facts.records.push(`측정 시간 중 얼굴과 어깨가 보여 분석한 시간 ${valid}%`);
    if (!visible) {
      caution(facts, '상체', `얼굴이나 어깨가 카메라에 보이지 않은 시간이 많아(분석한 시간 ${valid}%) 상체 점수는 참고용이에요.`);
      area.improvements.push('카메라에 얼굴과 양쪽 어깨가 모두 보이게 위치를 맞춰 보세요.');
    }
  }
  if (short) {
    caution(facts, '상체', `상체 측정 시간이 ${SHORT_UPPER_MINUTES}분이 안 돼 상체 기록은 참고용이에요.`);
    area.improvements.push('상체 측정을 더 자주, 더 오래 켜 보세요.');
  } else if (input.sessions >= facts.days * REGULAR_SESSIONS_PER_DAY) {
    area.strengths.push(`최근 ${facts.days}일 동안 상체를 ${input.sessions}번 측정했어요.`);
  }
}

// Blink frequency is a measurement. Changes in the rate carry no positive or negative judgement.
function eye(facts: Draft, input: NonNullable<ReviewInput['eye']>) {
  if (input.blinkRate !== null) {
    const rate = Math.round(input.blinkRate);
    const moved = change(input.blinkRate, input.previousBlinkRate, facts.days, '회', SAME_BLINK, ['늘어남', '줄어듦']);
    highlight(facts, `분당 깜빡임 ${rate}회 (${moved.text})`);
    facts.blink = moved.delta === null ? `분당 깜빡임은 ${rate}회였어요`
      : moved.delta === 0 ? `분당 깜빡임은 ${rate}회로 직전과 비슷했어요`
        : `분당 깜빡임은 ${rate}회로 ${Math.abs(moved.delta)}회 ${moved.delta > 0 ? '늘었어요' : '줄었어요'}`;
  }
  facts.records.push(`깜빡임을 제대로 관찰한 시간 ${duration(input.validMinutes)}`);
  if (input.validMinutes < SHORT_EYE_MINUTES) caution(facts, '깜빡임', `깜빡임 관찰 시간이 ${SHORT_EYE_MINUTES}분이 안 돼 깜빡임 기록은 참고용이에요.`);
}

function keyboard(facts: Draft, area: Candidates, input: NonNullable<ReviewInput['keyboard']>) {
  const coverage = input.coverage === null ? null : Math.round(input.coverage);
  const few = input.judged < FEW_JUDGED;
  const reliable = !few && (coverage === null || coverage >= LOW_COVERAGE);
  score(facts, area, '타자 훈련 점수', input.score, input.previousScore, reliable, '권장 손가락을 떠올리며 천천히 연습해 보세요.');
  facts.records.push(`손가락을 판정한 입력 ${input.judged}회`);
  if (coverage !== null) {
    facts.records.push(`손가락을 판정할 수 있었던 입력 비율 ${coverage}%`);
    if (coverage < LOW_COVERAGE) {
      caution(facts, '타자', `손가락을 판정하지 못한 입력이 많아(판정 가능 ${coverage}%) 타자 기록은 참고용이에요.`);
      area.improvements.push('손과 키보드가 카메라에 잘 보이게 위치를 맞춰 보세요.');
    }
  }
  if (input.consistency !== null) {
    const consistency = Math.round(input.consistency);
    facts.records.push(`같은 키를 같은 손가락으로 누른 비율 ${consistency}%`);
    if (reliable && consistency >= HIGH_CONSISTENCY) area.strengths.push(`같은 키를 같은 손가락으로 누른 비율이 ${consistency}%로 꾸준했어요.`);
  }
  const keys = input.frequentKeys.filter(key => Math.round(key.differentRate) >= FREQUENT_KEY_RATE)
    .map(key => `${keyName(key.code)} ${Math.round(key.differentRate)}%`).join(', ');
  if (keys) {
    facts.records.push(`권장과 다른 손가락을 자주 쓴 키: ${keys}`);
    area.improvements.push(`자주 다른 손가락을 쓴 키(${keys})를 권장 손가락으로 천천히 연습해 보세요.`);
  }
  if (few) caution(facts, '타자', `손가락을 판정한 입력이 ${FEW_JUDGED}회가 안 돼 타자 기록은 참고용이에요.`);
}

/** Areas take turns, so the first three candidates are not all about one area. */
const interleave = (lists: string[][]) =>
  Array.from({ length: Math.max(0, ...lists.map(list => list.length)) }, (_, i) => lists.flatMap(list => (i < list.length ? [list[i]] : []))).flat();

/** An observed achievement and a next measurement to try when the scoring rules have no candidate. */
function recordingFeedback(input: ReviewInput) {
  const posture = input.localPosture ?? input.upper;
  const side = input.localPosture?.side.current ?? input.upper?.balance.current;
  if (posture && posture.sessions > 0 && (posture.neck.current !== null || side != null)) {
    const band = input.localPosture?.latestNeckBand;
    const strength = posture.neck.current !== null && band && band.fromPoints >= HIGH_SCORE && band.percentOfValidTime > 0
      ? `최근 측정에서 목 점수가 ${band.fromPoints}~${band.toPoints}점인 구간이 유효 관찰 시간의 ${band.percentOfValidTime}%였어요.`
      : `이번 기간에 상체 자세를 ${posture.sessions}회 측정해 비교할 기록을 남겼어요.`;
    return { strength, improvement: '다음에도 같은 작업을 할 때 자세를 측정해 이번 점수가 이어지는지 확인해 보세요.' };
  }
  if (input.keyboard && input.keyboard.judged > 0) {
    return { strength: `손가락을 판정할 수 있는 타자 입력을 ${input.keyboard.judged}회 기록했어요.`,
      improvement: '다음 타자 연습에서도 비슷한 속도로 입력해 손가락 사용이 일정한지 확인해 보세요.' };
  }
  if (input.eye && input.eye.validMinutes > 0) {
    const strength = input.eye.validMinutes >= 1 ? `눈 깜빡임을 ${duration(input.eye.validMinutes)} 동안 기록했어요.`
      : '눈 깜빡임을 관찰해 다음 측정과 비교할 기록을 남겼어요.';
    return { strength, improvement: '다음에도 비슷한 작업을 할 때 측정해 깜빡임 기록을 비교해 보세요.' };
  }
  return null;
}

function overview({ days, clauses, blink }: Draft) {
  const sentences = [
    ...(clauses.length ? [clauses.map(([joined, last], i) => (i < clauses.length - 1 ? joined : last)).join(', ')] : []),
    ...(blink ? [blink] : []),
  ];
  if (!sentences.length) return `최근 ${days}일 동안의 기록이에요.`;
  return sentences.map((sentence, i) => `${i ? '' : `최근 ${days}일 동안 `}${sentence}.`).join(' ');
}

export function buildReviewFacts(input: ReviewInput): ReviewFacts {
  const draft: Draft = {
    days: input.days, records: [], highlights: [], strengths: [], improvements: [], cautions: [], limited: [], overview: '',
    clauses: [], blink: null,
  };
  const upperArea: Candidates = { strengths: [], improvements: [] }, keyboardArea: Candidates = { strengths: [], improvements: [] };
  if (input.localPosture) {
    const { neck, side, sideMetric, sessions, measuredMinutes, latestNeckBand } = input.localPosture;
    const reliable = measuredMinutes >= SHORT_UPPER_MINUTES;
    const sideName = sideMetric === 'balance' ? '좌우 균형 점수' : '어깨 자세 점수';
    score(draft, upperArea, '목 자세 점수', neck.current, neck.previous, reliable, '화면을 볼 때 턱을 가볍게 당겨 보세요.', true);
    score(draft, upperArea, sideName, side.current, side.previous, reliable, '양쪽 어깨에 힘을 빼 보세요.', true);
    highlight(draft, `이 기기의 상체 측정 ${sessions}회, 총 ${duration(measuredMinutes)}`);
    if (latestNeckBand) highlight(draft, `가장 최근 측정의 목 최빈 구간 ${latestNeckBand.fromPoints}~${latestNeckBand.toPoints}점, 유효 관찰 시간의 ${latestNeckBand.percentOfValidTime}%`);
    if (!reliable) caution(draft, '상체', '측정 시간이 짧아 장기적인 자세 습관을 단정하기 어려워요.');
  }
  if (input.upper) upper(draft, upperArea, input.upper);
  if (input.eye) eye(draft, input.eye);
  if (input.keyboard) keyboard(draft, keyboardArea, input.keyboard);
  const strengths = interleave([upperArea.strengths, keyboardArea.strengths]);
  const improvements = interleave([upperArea.improvements, keyboardArea.improvements]);
  const fallback = recordingFeedback(input);
  if (fallback) {
    if (!strengths.length) strengths.push(fallback.strength);
    if (!improvements.length) improvements.push(fallback.improvement);
  }
  return {
    days: draft.days, records: draft.records, highlights: draft.highlights, cautions: draft.cautions, limited: draft.limited,
    strengths, improvements,
    overview: overview(draft),
  };
}

/** The sentence the code adds after any summary when some records are only indicative. */
export const cautionNote = ({ limited }: ReviewFacts) => (limited.length ? `${limited.join('·')} 기록은 측정이 부족해 참고용으로 봐 주세요.` : null);

/** Every record and candidate, for reading the whole sheet. */
export function renderReviewFacts(facts: ReviewFacts) {
  const section = (title: string, lines: string[]) => (lines.length ? [`[${title}]`, ...lines.map(line => `- ${line}`)] : []);
  return [
    `기간: 최근 ${facts.days}일`,
    ...section('기록', facts.records),
    ...section('잘한 점 후보', facts.strengths),
    ...section('개선할 점 후보', facts.improvements),
    ...section('해석 주의', facts.cautions),
  ].join('\n');
}

/** What a model sees when it writes the summary: the highlights and the candidates shown beside it. */
export function renderSummaryInput(facts: ReviewFacts) {
  const section = (title: string, lines: string[]) => (lines.length ? [`[${title}]`, ...lines.map(line => `- ${line}`)] : []);
  return [
    `기간: 최근 ${facts.days}일`,
    ...section('주요 기록', facts.highlights),
    ...section('화면에 함께 보이는 잘한 점', facts.strengths.slice(0, SHOWN_CANDIDATES)),
    ...section('화면에 함께 보이는 개선할 점', facts.improvements.slice(0, SHOWN_CANDIDATES)),
  ].join('\n');
}
