import type { DailyPostureScore } from '../../../database/localReview.ts';
import type { ReviewInput } from './aiReview.js';

const HIGH_SCORE = 80;
const LOW_SCORE = 60;
const MIN_TREND_GAP = 3;
const MIN_TREND_OBSERVATION = 1;
const MIN_POSTURE_OBSERVATION = 5;
const MIN_BLINK_OBSERVATION = 10;
const MIN_JUDGED = 200;
const MIN_COVERAGE = 50;
const HIGH_CONSISTENCY = 90;
const FREQUENT_KEY_RATE = 20;
const MAX_ITEMS = 3;
const MAX_PHASES = 6;

export type SectionKey = 'overall' | 'upper' | 'keyboard' | 'eye';
export type PostureMetric = DailyPostureScore['metric'];
export interface SectionPlan { key: SectionKey; title: string; text: string }
export interface ReviewPlan {
  headline: string;
  sections: SectionPlan[];
  strengths: string[];
  weaknesses: string[];
  goals: string[];
  caution: string | null;
  focus: PostureMetric | null;
}

const METRIC_LABELS: Record<PostureMetric, string> = {
  neck: '목 점수', balance: '좌우 균형 점수', shoulder: '어깨 자세 점수',
};
const POSTURE_GOALS: Record<PostureMetric, string> = {
  neck: '화면을 오래 볼 때 중간에 턱이 앞으로 나오지 않았는지 확인하기',
  balance: '화면을 오래 볼 때 중간에 체중을 한쪽으로 싣고 있지 않은지 확인하기',
  shoulder: '화면을 오래 볼 때 중간에 양쪽 어깨에 힘을 빼고 자세 확인하기',
};
const KEY_NAMES: Record<string, string> = { Semicolon: '; 키', Comma: ', 키', Period: '. 키', Slash: '/ 키', Space: '스페이스바' };
const keyName = (code: string) => (code.startsWith('Key') ? `${code.slice(3)} 키` : KEY_NAMES[code] ?? code);
const rounded = (value: number) => Math.round(value * 10) / 10;
const count = new Intl.NumberFormat('ko-KR');

function duration(minutes: number) {
  if (minutes > 0 && minutes < 1) return '1분 미만';
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60), rest = total % 60;
  return hours ? `${hours}시간${rest ? ` ${rest}분` : ''}` : `${rest}분`;
}

function lateChange(score: DailyPostureScore) {
  const { beforeLastTen: before, lastTen: last } = score;
  if (!before || !last || before.validMinutes < MIN_TREND_OBSERVATION || last.validMinutes < MIN_TREND_OBSERVATION) return null;
  const difference = rounded(rounded(last.mean) - rounded(before.mean));
  const label = METRIC_LABELS[score.metric];
  const detail = `누적 측정의 마지막 10분에 ${label}는 평균 ${rounded(last.mean)}점이었어요.`;
  const comparison = Math.abs(difference) < MIN_TREND_GAP
    ? `앞선 구간 평균 ${rounded(before.mean)}점과 비슷했어요.`
    : `앞선 구간 평균 ${rounded(before.mean)}점보다 ${Math.abs(difference)}점 ${difference < 0 ? '낮았어요' : '높았어요'}.`;
  return { score, difference, detail: `${detail} ${comparison}`,
    volume: `앞선 구간에서 ${duration(before.validMinutes)}, 마지막 10분에서 ${duration(last.validMinutes)} 동안 유효한 ${label}를 기록했어요.` };
}

type LateChange = NonNullable<ReturnType<typeof lateChange>>;

function postureSection(posture: NonNullable<ReviewInput['posture']>, changes: LateChange[]): SectionPlan {
  const scores = posture.scores
    .map(score => `${METRIC_LABELS[score.metric]} 평균 ${rounded(score.mean)}점(유효 관찰 ${duration(score.validMinutes)})`);
  return { key: 'upper', title: '상체 자세', text: [
    `상체 자세를 ${posture.sessions}회, 총 ${duration(posture.measuredMinutes)} 동안 측정했어요.`,
    `${scores.join(', ')}을 기록했어요.`,
    ...changes.flatMap(change => [change.detail, change.volume]),
  ].join(' ') };
}

function keyboardSection(keyboard: NonNullable<ReviewInput['keyboard']>, keys: string[]): SectionPlan {
  const lines = [`손가락을 판정한 입력은 ${count.format(keyboard.judged)}회였어요.`];
  if (keyboard.score !== null) lines.push(`타자 훈련 점수는 평균 ${rounded(keyboard.score)}점이었어요.`);
  if (keyboard.coverage !== null) lines.push(`손가락을 판정할 수 있었던 입력은 ${rounded(keyboard.coverage)}%였어요.`);
  if (keyboard.consistency !== null) lines.push(`같은 키를 같은 손가락으로 누른 비율은 ${rounded(keyboard.consistency)}%였어요.`);
  if (keys.length) lines.push(`권장과 다른 손가락을 자주 쓴 키는 ${keys.join(', ')}예요.`);
  return { key: 'keyboard', title: '키보드', text: lines.join(' ') };
}

function eyeSection(eye: NonNullable<ReviewInput['eye']>): SectionPlan {
  const rate = eye.blinkRate === null ? '' : ` 관찰 중 분당 평균 ${rounded(eye.blinkRate)}회 깜빡였어요.`;
  return { key: 'eye', title: '깜빡임', text: `깜빡임을 관찰한 시간은 ${duration(eye.validMinutes)}이었어요.${rate}` };
}

function dailyFeedback(input: ReviewInput, changes: LateChange[], keys: string[]) {
  const { posture, keyboard, eye } = input;
  const strengths: string[] = [], weaknesses: string[] = [], goals: string[] = [];
  const weak = (text: string, goal: string) => { weaknesses.push(text); goals.push(goal); };
  for (const change of changes) {
    if (change.difference <= -MIN_TREND_GAP) weak(change.detail, POSTURE_GOALS[change.score.metric]);
    if (change.difference >= MIN_TREND_GAP) strengths.push(change.detail);
  }
  for (const score of posture?.scores ?? []) {
    if (score.validMinutes < MIN_POSTURE_OBSERVATION) continue;
    const name = METRIC_LABELS[score.metric];
    if (score.mean >= HIGH_SCORE) strengths.push(`${name}가 유효 관찰에서 평균 ${rounded(score.mean)}점이었어요.`);
    if (score.mean < LOW_SCORE && !changes.some(change => change.score === score && change.difference <= -MIN_TREND_GAP)) {
      weak(`${name}가 유효 관찰에서 평균 ${rounded(score.mean)}점으로 낮은 편이었어요.`, POSTURE_GOALS[score.metric]);
    }
  }
  const keyboardReliable = keyboard && keyboard.judged >= MIN_JUDGED && (keyboard.coverage === null || keyboard.coverage >= MIN_COVERAGE);
  if (keyboardReliable && keyboard.score !== null) {
    if (keyboard.score >= HIGH_SCORE) strengths.push(`타자 훈련 점수가 평균 ${rounded(keyboard.score)}점이었어요.`);
    if (keyboard.score < LOW_SCORE) weak(`타자 훈련 점수가 평균 ${rounded(keyboard.score)}점으로 낮은 편이었어요.`,
      '권장 손가락을 떠올리며 천천히 연습하기');
  }
  if (keyboardReliable && keyboard.consistency !== null && keyboard.consistency >= HIGH_CONSISTENCY) {
    strengths.push(`같은 키를 같은 손가락으로 누른 비율이 ${rounded(keyboard.consistency)}%였어요.`);
  }
  if (keys.length) weak(`권장과 다른 손가락을 자주 쓴 키가 있었어요(${keys.join(', ')}).`, '다른 손가락으로 자주 누른 키를 권장 손가락으로 천천히 연습하기');
  if (keyboard?.coverage != null && keyboard.coverage < MIN_COVERAGE) {
    weak('손가락을 판정하지 못한 입력이 많았어요.', '손과 키보드가 카메라에 잘 보이게 위치 맞추기');
  }
  if (!strengths.length) {
    if (posture) strengths.push(`상체 자세를 ${posture.sessions}회 측정해 비교할 기록을 남겼어요.`);
    else if (keyboard?.judged) strengths.push(`손가락을 판정할 수 있는 타자 입력을 ${count.format(keyboard.judged)}회 기록했어요.`);
    else if (eye?.validMinutes) strengths.push('눈 깜빡임을 관찰해 다음 측정과 비교할 기록을 남겼어요.');
  }
  if (!goals.length) {
    if (posture) goals.push('다음에도 같은 작업을 할 때 측정해 자세 흐름 비교하기');
    else if (keyboard) goals.push('다음 타자 연습에서 손가락 사용이 일정한지 확인하기');
    else goals.push('다음에도 비슷한 작업을 할 때 측정해 깜빡임 기록 비교하기');
  }
  return { strengths: [...new Set(strengths)].slice(0, MAX_ITEMS), weaknesses: weaknesses.slice(0, MAX_ITEMS), goals: [...new Set(goals)].slice(0, MAX_ITEMS) };
}

export function buildReviewPlan(input: ReviewInput): ReviewPlan {
  const { date, posture, keyboard, eye } = input;
  const changes = (posture?.scores ?? []).flatMap(score => lateChange(score) ?? [])
    .sort((first, second) => first.difference - second.difference);
  const decline = changes.find(change => change.difference <= -MIN_TREND_GAP);
  const best = changes.at(-1);
  const rise = best && best.difference >= MIN_TREND_GAP ? best : null;
  const significant = decline ?? rise;
  const headline = significant
    ? `누적 측정의 마지막 10분에 ${METRIC_LABELS[significant.score.metric]}가 ${significant.difference < 0 ? '내려갔어요' : '올랐어요'}.`
    : '하루 동안 남긴 측정 기록을 모았어요.';
  const [, month, day] = date.split('-').map(Number);
  const recorded = [
    posture ? `상체 자세 ${posture.sessions}회(총 ${duration(posture.measuredMinutes)})` : '',
    keyboard ? `타자 입력 판정 ${count.format(keyboard.judged)}회` : '',
    eye ? `깜빡임 관찰 ${duration(eye.validMinutes)}` : '',
  ].filter(Boolean);
  const sections: SectionPlan[] = [{
    key: 'overall', title: '하루당 총평',
    text: [`${month}월 ${day}일에 ${recorded.join(', ')}을 기록했어요.`, significant?.detail].filter(Boolean).join(' '),
  }];
  if (posture) sections.push(postureSection(posture, changes));
  const keys = (keyboard?.frequentKeys ?? []).filter(key => key.differentRate >= FREQUENT_KEY_RATE)
    .map(key => `${keyName(key.code)} ${rounded(key.differentRate)}%`);
  if (keyboard) sections.push(keyboardSection(keyboard, keys));
  if (eye) sections.push(eyeSection(eye));

  const limited = [
    posture?.scores.some(score => score.validMinutes < MIN_POSTURE_OBSERVATION) ? '상체' : '',
    keyboard && (keyboard.judged < MIN_JUDGED || (keyboard.coverage !== null && keyboard.coverage < MIN_COVERAGE)) ? '키보드' : '',
    eye && eye.validMinutes < MIN_BLINK_OBSERVATION ? '깜빡임' : '',
  ].filter(Boolean);
  return { headline, sections, ...dailyFeedback(input, changes, keys), focus: decline?.score.metric ?? null,
    caution: limited.length ? `${limited.join('·')} 기록은 관찰량이 적어 참고용으로 봐 주세요.` : null };
}

// Bound the model context by combining adjacent buckets by their valid observation time.
// Each bucket contributes to one group, including the last group of a long day.
function phases(score: DailyPostureScore) {
  if (!score.periods.length) return '';
  const blocks: string[] = [];
  const size = Math.ceil(score.periods.length / MAX_PHASES);
  for (let index = 0; index < score.periods.length; index += size) {
    const group = score.periods.slice(index, index + size);
    const observed = group.reduce((sum, part) => sum + part.validMinutes, 0);
    const total = group.reduce((sum, part) => sum + part.mean * part.validMinutes, 0);
    const first = group[0], last = group[group.length - 1];
    blocks.push(`${rounded(first.startMinute)}~${rounded(last.endMinute)}분 ${rounded(total / observed)}점(관찰 ${rounded(observed)}분)`);
  }
  return `${METRIC_LABELS[score.metric]}: ${blocks.join(', ')}`;
}

export function renderRecord(plan: ReviewPlan, input: ReviewInput) {
  const chronology = (input.posture?.scores ?? []).map(phases).filter(Boolean);
  return [
    `선택한 날짜: ${input.date}`,
    ...plan.sections.filter(section => section.key !== 'overall').map(section => section.text),
    ...(chronology.length ? ['[누적 측정 시간 순서]', ...chronology] : []),
    ...plan.weaknesses,
    `다음 목표: ${plan.goals.join(', ')}`,
    plan.caution,
  ].filter(Boolean).join('\n');
}
