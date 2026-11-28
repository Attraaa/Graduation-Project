import type { DailyPostureScore, ReviewDateRange } from '../../../database/localReview.ts';
import { dailyEvidence, duration, lateChange, METRIC_LABELS, MIN_TREND_GAP, MIN_TREND_OBSERVATION,
  POSTURE_GOALS, postureStrength, rounded, type PostureMetric, type ReviewPlan, type SectionPlan } from './reviewFacts.js';

type DatedScore = { date: string; score: DailyPostureScore };
type Change = { metric: PostureMetric; difference: number; evidence: string };
const dayName = (date: string) => {
  const [, month, day] = date.split('-').map(Number);
  return `${month}월 ${day}일`;
};
const shortDay = (date: string) => date.slice(5).replace('-', '/');
const nextCalendarDay = (from: string, to: string) => Date.parse(to) - Date.parse(from) === 86_400_000;

function comparison(from: string, to: string, previous: number, current: number, label: string, unit: string) {
  const diff = rounded(rounded(current) - rounded(previous));
  const reference = nextCalendarDay(from, to) ? '전일 대비' : `직전 측정일인 ${dayName(from)} 대비`;
  const direction = diff === 0 ? '변화가 없었어요' : `${Math.abs(diff)}${unit} ${diff > 0 ? '올랐어요' : '내려갔어요'}`;
  return `${dayName(to)} ${label}는 ${rounded(current)}${unit}으로, ${reference} (${rounded(previous)}${unit}) ${direction}.`;
}

function datedPosture(input: ReviewDateRange): DatedScore[] {
  return input.days.flatMap(day => (day.posture?.scores ?? []).map(score => ({ date: day.date, score })));
}

function postureChanges(rows: DatedScore[]): Change[] {
  const previousByMetric = new Map<PostureMetric, DatedScore>();
  const changes: Change[] = [];
  for (const row of rows) {
    const { score, date } = row;
    if (score.validMinutes < MIN_TREND_OBSERVATION) continue;
    const previous = previousByMetric.get(score.metric);
    previousByMetric.set(score.metric, row);
    // A change of score formula cannot be interpreted as an improvement or decline in posture.
    if (!previous || !score.policyVersion || previous.score.policyVersion !== score.policyVersion) continue;
    changes.push({ metric: score.metric, difference: rounded(rounded(score.mean) - rounded(previous.score.mean)),
      evidence: comparison(previous.date, date, previous.score.mean, score.mean, METRIC_LABELS[score.metric], '점') });
  }
  return changes;
}

function otherModeSections(input: ReviewDateRange): SectionPlan[] {
  const keyboard = input.days.flatMap(({ date, keyboard }) => keyboard ? [{ date, ...keyboard }] : []);
  const eye = input.days.flatMap(({ date, eye }) => eye ? [{ date, ...eye }] : []);
  const sections: SectionPlan[] = [];
  if (keyboard.length) {
    const measured = keyboard.filter(day => day.score !== null && day.judged > 0);
    sections.push({ key: 'keyboard', title: '키보드 추이', text: [
      measured.length ? measured.map(day => `${shortDay(day.date)} ${rounded(day.score!)}점(${day.judged}회 판정)`).join(' · ')
        : '선택한 기간에 비교할 수 있는 타자 점수가 적었어요.',
      ...measured.slice(1).map((day, index) =>
        comparison(measured[index].date, day.date, measured[index].score!, day.score!, '타자 훈련 점수', '점')),
    ].join('\n') });
  }
  if (eye.length) {
    const measured = eye.filter(day => day.blinkRate !== null && day.validMinutes >= MIN_TREND_OBSERVATION);
    sections.push({ key: 'eye', title: '깜빡임 기록', text: measured.length
      ? measured.map(day => `${shortDay(day.date)} 분당 ${rounded(day.blinkRate!)}회(관찰 ${duration(day.validMinutes)})`).join(' · ')
      : `유효 관찰 시간은 총 ${duration(eye.reduce((sum, day) => sum + day.validMinutes, 0))}이었어요.` });
  }
  return sections;
}

export function buildRangeReviewPlan(input: ReviewDateRange): ReviewPlan {
  const posture = datedPosture(input);
  const changes = postureChanges(posture);
  const declines = changes.filter(change => change.difference <= -MIN_TREND_GAP)
    .sort((a, b) => a.difference - b.difference);
  const rises = changes.filter(change => change.difference >= MIN_TREND_GAP)
    .sort((a, b) => b.difference - a.difference);
  const lateDeclines = posture.flatMap(({ date, score }) => {
    const change = lateChange(score);
    return change && change.difference <= -MIN_TREND_GAP
      ? [{ metric: score.metric, difference: change.difference, evidence: `${dayName(date)}에는 ${change.detail}` }]
      : [];
  }).sort((a, b) => a.difference - b.difference);
  const issues = [...declines, ...lateDeclines];
  const notable = issues[0] ?? rises[0];
  const latest = input.days.at(-1)!;
  const concern = issues[0];
  const lowest = [...posture].sort((a, b) => a.score.mean - b.score.mean)[0];
  const reason = concern ? { focus: concern.metric, evidence: concern.evidence }
    : lowest ? { focus: lowest.score.metric, evidence: `${dayName(lowest.date)} ${METRIC_LABELS[lowest.score.metric]}는 유효 관찰 ${duration(lowest.score.validMinutes)}에서 평균 ${rounded(lowest.score.mean)}점이었어요.` }
      : dailyEvidence(latest);
  const missing = (Date.parse(input.to) - Date.parse(input.from)) / 86_400_000 + 1 - input.days.length;
  const sections: SectionPlan[] = [{
    key: 'overall', title: '기간 총평',
    text: [`${dayName(input.from)}~${dayName(input.to)} 중 ${input.days.length}일의 기록을 분석했어요.`, notable?.evidence].filter(Boolean).join(' '),
  }];
  if (posture.length) {
    const days = input.days.flatMap(day => day.posture ? [
      `${dayName(day.date)} · ${day.posture.scores.map(score => `${METRIC_LABELS[score.metric]} ${rounded(score.mean)}점`).join(', ')}`,
    ] : []);
    sections.push({ key: 'upper', title: '상체 자세 추이', text: [
      ...days, ...changes.map(change => change.evidence), ...lateDeclines.slice(0, 2).map(change => change.evidence),
    ].join('\n') });
  }
  sections.push(...otherModeSections(input));
  const positives = posture.flatMap(({ date, score }) => {
    const strength = postureStrength(score);
    return strength ? [`${dayName(date)}에는 ${strength}`] : [];
  });
  const uniqueProblems = issues.filter((issue, index) => issues.findIndex(row => row.metric === issue.metric) === index);
  const goals = uniqueProblems.map(issue => `${issue.evidence} ${POSTURE_GOALS[issue.metric]}`);
  if (!goals.length) {
    const next = reason.focus === 'keyboard' ? '같은 키의 손가락 사용 비교하기'
      : reason.focus === 'eye' ? '유사한 화면 작업에서 깜빡임 기록 비교하기' : POSTURE_GOALS[reason.focus];
    goals.push(`${reason.evidence} ${next}`);
  }
  const cautions = [
    missing ? `측정 기록이 없는 ${missing}일은 비교에서 제외했어요.` : '',
    posture.some(row => row.score.validMinutes < 5) ? '관찰 시간이 짧은 자세 점수는 참고용으로 봐 주세요.' : '',
  ];
  return {
    headline: notable ? `${METRIC_LABELS[notable.metric]}가 ${notable.difference < 0 ? '내려간' : '올라간'} 구간이 있었어요.` : '선택한 기간의 측정 결과를 모았어요.',
    sections, strengths: [...rises.map(change => change.evidence), ...positives].slice(0, 3),
    weaknesses: uniqueProblems.slice(0, 3).map(issue => issue.evidence), goals: goals.slice(0, 3),
    caution: cautions.filter(Boolean).join(' ') || null,
    ...reason,
  };
}

export function renderRangeRecord(plan: ReviewPlan, input: ReviewDateRange) {
  const days = input.days.map(day => {
    const scores = (day.posture?.scores ?? []).map(score =>
      `${METRIC_LABELS[score.metric]} ${rounded(score.mean)}점(${duration(score.validMinutes)} 관찰)`);
    if (day.keyboard?.score != null) scores.push(`타자 ${rounded(day.keyboard.score)}점`);
    if (day.eye?.blinkRate != null) scores.push(`깜빡임 분당 ${rounded(day.eye.blinkRate)}회`);
    return `${day.date} ${scores.join(', ')}`;
  });
  return [`선택한 기간: ${input.from}~${input.to}`, ...days, ...plan.weaknesses, ...plan.strengths, plan.caution].filter(Boolean).join('\n');
}
