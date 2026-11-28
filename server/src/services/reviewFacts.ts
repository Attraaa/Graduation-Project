import type { ReviewInput } from './aiReview.js';

/*
 * AI 총평의 내용입니다. 숫자와 변화 방향, 날짜·시간대 흐름, 잘한 점·아쉬운 점·다음 목표, 영역마다 보여 줄 문단까지 코드가
 * 정합니다. 미니 PC의 모델은 연습할 습관 하나를 고르는 데만 쓰고, 그 문장은 총평 문단 끝에 붙습니다(aiReview.ts).
 * 상체는 이 기기에서 잰 측정 요약(localPosture)이나 서버 통계(upper) 중 하나로 씁니다.
 * 아래 기준값은 화면 안내용 잠정값이며 건강 기준이 아닙니다.
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
const FEW_JUDGED = 200;
const LOW_COVERAGE = 50;
const GOOD_COVERAGE = 80;
const HIGH_CONSISTENCY = 90;
const FREQUENT_KEY_RATE = 20;
const REGULAR_DAYS = 0.7; // 기간 중 이 비율 이상의 날에 측정하면 꾸준함
const FEW_DAYS = 0.4;
const TREND_DAYS = 3; // 날짜별 흐름을 말하려면 필요한 측정한 날 수
const TREND_GAP = 3; // 기간 앞쪽·뒤쪽 평균 차이가 이만큼 나면 흐름이 있다고 봄
const FLAT_RANGE = 5; // 날짜별 최고·최저 차이가 이보다 작으면 고름
const PEAK_DEVIATIONS = 5; // 기준 이탈이 잦은 시간대를 말하려면 필요한 전체 이탈 수
const HOUR_MINUTES = 30; // 한 시간대를 비교에 넣으려면 필요한 관찰 시간(분)
const PEAK_RATIO = 1.5; // 관찰 시간당 이탈이 전체 평균의 이 배수 이상인 시간대를 잦다고 봄
const HOUR_COUNT = 3; // 시간대별 점수를 비교하려면 필요한 시간대 수
const HOUR_GAP = 3;
const PART_GAP = 5; // 목과 좌우 균형(예전 기록은 어깨) 점수 차이를 말하는 기준
const SHOWN = 3; // 잘한 점·아쉬운 점·다음 목표를 각각 몇 개까지 보여 줄지

export type SectionKey = 'overall' | 'upper' | 'keyboard' | 'eye';
export interface SectionPlan { key: SectionKey; title: string; text: string }
export interface ReviewPlan {
  days: 7 | 30;
  headline: string;
  sections: SectionPlan[];
  strengths: string[];
  weaknesses: string[];
  goals: string[];
  caution: string | null;
}

type Pair = { current: number | null; previous: number | null };
type Day = ReviewInput['daily'][number];
interface Score { metric: 'neck' | 'side' | 'keyboard'; name: string; current: number; previous: number | null; delta: number | null; reliable: boolean }
type Point = { label: string; value: number };
/** Upper-body values from either source, so the paragraphs read the same way. */
interface Posture {
  device: boolean;
  sideName: string;
  neck: Pair; side: Pair;
  measuredMinutes: number; sessions: number; longestMinutes: number | null;
  hourly: { hour: number; values: number[]; minutes: number | null }[];
  /** Server statistics only: the device summary does not count leaving the reference posture. */
  deviations: { count: number; rate: number | null; hours: { hour: number; count: number; minutes: number }[] } | null;
  validRate: number | null;
  band: { fromPoints: number; toPoints: number; percentOfValidTime: number } | null;
}

const KEY_NAMES: Record<string, string> = { Semicolon: '; 키', Comma: ', 키', Period: '. 키', Slash: '/ 키', Space: '스페이스바' };
const keyName = (code: string) => (code.startsWith('Key') ? `${code.slice(3)} 키` : KEY_NAMES[code] ?? code);
const number = (value: number) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const present = (values: (number | null)[]) => values.filter((value): value is number => value !== null);
// Every item joined here (key names, hour names) ends without a final consonant, so 와 is always the right particle.
const joined = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')}와 ${items.at(-1)}`);

function duration(minutes: number) {
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60), rest = total % 60;
  return hours ? `${hours}시간${rest ? ` ${rest}분` : ''}` : `${rest}분`;
}

function dayLabel(date: string, days: 7 | 30) {
  const [year, month, day] = date.split('-').map(Number);
  return days === 7 ? `${'일월화수목금토'[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]}요일` : `${month}월 ${day}일`;
}

function hourLabel(hour: number) {
  if (hour === 0) return '밤 12시';
  if (hour < 6) return `새벽 ${hour}시`;
  if (hour < 12) return `오전 ${hour}시`;
  if (hour === 12) return '낮 12시';
  return hour < 18 ? `오후 ${hour - 12}시` : `저녁 ${hour - 12}시`;
}

function postureOf({ localPosture, upper }: ReviewInput): Posture | null {
  if (localPosture) {
    return {
      device: true, sideName: localPosture.sideMetric === 'balance' ? '좌우 균형 점수' : '어깨 자세 점수',
      neck: localPosture.neck, side: localPosture.side, measuredMinutes: localPosture.measuredMinutes, sessions: localPosture.sessions,
      longestMinutes: localPosture.longestMinutes ?? null,
      hourly: (localPosture.hourly ?? []).map(hour => ({ hour: hour.hour, values: present([hour.neck, hour.side]), minutes: hour.minutes })),
      deviations: null, validRate: null, band: localPosture.latestNeckBand,
    };
  }
  if (!upper) return null;
  const observed = new Map(upper.deviationHours.map(hour => [hour.hour, hour.minutes]));
  return {
    device: false, sideName: '좌우 균형 점수', neck: upper.neck, side: upper.balance,
    measuredMinutes: upper.measuredMinutes, sessions: upper.sessions, longestMinutes: upper.longestMinutes,
    hourly: upper.hourly.map(hour => ({ hour: hour.hour, values: present([hour.neck, hour.balance]), minutes: observed.get(hour.hour) ?? null })),
    deviations: { count: upper.deviations, rate: upper.deviationRate, hours: upper.deviationHours },
    validRate: upper.validRate, band: null,
  };
}

const visibleOf = (posture: Posture) => posture.validRate === null || Math.round(posture.validRate) >= LOW_VALID;
const reliableOf = (posture: Posture) => posture.measuredMinutes >= SHORT_UPPER_MINUTES && visibleOf(posture);

function scoreOf(metric: Score['metric'], name: string, { current, previous }: Pair, reliable: boolean): Score | null {
  if (current === null) return null;
  const now = Math.round(current), before = previous === null ? null : Math.round(previous);
  const diff = before === null ? null : now - before;
  return { metric, name, current: now, previous: before, delta: diff === null ? null : Math.abs(diff) < SAME_SCORE ? 0 : diff, reliable };
}

/** One score against the previous period, as the first or the last clause of a sentence. Rounded values are compared, so the numbers add up. */
function changeClause({ name, current, previous, delta }: Score, days: number, last: boolean) {
  const end = (more: string, final: string) => (last ? final : more);
  if (delta === null) return `${name}는 ${current}점${end('이었고', '이었어요')}`;
  const before = `직전 ${days}일(${previous}점)`;
  if (delta === 0) return `${name}는 ${current}점으로 ${before}과 비슷${end('했고', '했어요')}`;
  return `${name}는 ${current}점으로 ${before}보다 ${Math.abs(delta)}점 ${delta > 0 ? end('올랐고', '올랐어요') : end('내려갔고', '내려갔어요')}`;
}

function pairs(scores: Score[], days: number) {
  const sentences: string[] = [];
  for (let i = 0; i < scores.length; i += 2) {
    const pair = scores.slice(i, i + 2);
    sentences.push(`${pair.map((score, j) => changeClause(score, days, j === pair.length - 1)).join(', ')}.`);
  }
  return sentences;
}

function blinkChange(eye: NonNullable<ReviewInput['eye']>) {
  if (eye.blinkRate === null) return null;
  const rate = Math.round(eye.blinkRate);
  if (eye.previousBlinkRate === null) return { rate, before: null, diff: null };
  const before = Math.round(eye.previousBlinkRate), diff = rate - before;
  return { rate, before, diff: Math.abs(diff) < SAME_BLINK ? 0 : diff };
}

/** Highest and lowest day, and whether the later half of the measured days sits higher or lower than the earlier half. */
function trend(daily: Day[], pick: (day: Day) => number | null, days: 7 | 30) {
  const points: Point[] = daily.flatMap(day => { const value = pick(day); return value === null ? [] : [{ label: dayLabel(day.date, days), value: Math.round(value) }]; });
  if (points.length < TREND_DAYS) return null;
  const best = points.reduce((top, point) => (point.value > top.value ? point : top));
  const worst = points.reduce((low, point) => (point.value < low.value ? point : low));
  const half = Math.floor(points.length / 2);
  const mean = (list: Point[]) => list.reduce((sum, point) => sum + point.value, 0) / list.length;
  return { best, worst, range: best.value - worst.value, shift: Math.round(mean(points.slice(-half)) - mean(points.slice(0, half))) };
}

function trendSentences(name: string, found: ReturnType<typeof trend>) {
  if (!found) return [];
  const sentences: string[] = [];
  if (found.range >= SAME_SCORE) {
    sentences.push(`날짜별로 보면 ${name}는 ${found.best.label}이 ${found.best.value}점으로 가장 높았고, ${found.worst.label}이 ${found.worst.value}점으로 가장 낮았어요.`);
  }
  if (found.shift >= TREND_GAP) sentences.push('기간 뒤쪽으로 갈수록 점수가 올랐어요.');
  else if (found.shift <= -TREND_GAP) sentences.push('기간 뒤쪽으로 갈수록 점수가 내려갔어요.');
  else if (found.range < FLAT_RANGE) sentences.push('날마다 점수가 크게 달라지지 않았어요.');
  return sentences;
}

/**
 * The hour whose deviations per hour of observation stand well above the average. Counts alone would only point at
 * the hour measured longest, so hours observed for less than HOUR_MINUTES are left out.
 */
function peakHour(posture: Posture) {
  const observed = (posture.deviations?.hours ?? []).filter(hour => hour.minutes >= HOUR_MINUTES);
  const total = observed.reduce((sum, hour) => sum + hour.count, 0), minutes = observed.reduce((sum, hour) => sum + hour.minutes, 0);
  if (!visibleOf(posture) || observed.length < 2 || total < PEAK_DEVIATIONS) return null;
  const rate = ({ count, minutes: time }: { count: number; minutes: number }) => (count * 60) / time;
  const peak = observed.reduce((top, hour) => (rate(hour) > rate(top) ? hour : top));
  const perHour = Math.round(rate(peak)), average = Math.round(rate({ count: total, minutes }));
  return rate(peak) >= rate({ count: total, minutes }) * PEAK_RATIO && perHour >= 1 ? { label: hourLabel(peak.hour), perHour, average } : null;
}

function hourExtremes(posture: Posture) {
  const hours = posture.hourly.filter(hour => hour.values.length && (hour.minutes === null || hour.minutes >= HOUR_MINUTES))
    .map(hour => ({ label: hourLabel(hour.hour), value: Math.round(hour.values.reduce((sum, value) => sum + value, 0) / hour.values.length) }));
  if (hours.length < HOUR_COUNT) return null;
  const best = hours.reduce((top, hour) => (hour.value > top.value ? hour : top));
  const worst = hours.reduce((low, hour) => (hour.value < low.value ? hour : low));
  return best.value - worst.value >= HOUR_GAP ? { best, worst } : null;
}

/** The overall paragraph. It ends without advice: the habit the mini PC picks is added as its last sentence. */
function overallSection(input: ReviewInput, posture: Posture | null, scores: Score[], peak: ReturnType<typeof peakHour>): SectionPlan {
  const { days, keyboard, eye, measuredDays } = input;
  const sentences: string[] = [];
  const span = measuredDays === null ? `최근 ${days}일 동안` : `최근 ${days}일 중 ${measuredDays}일 동안 측정해`;
  if (posture) {
    const where = posture.device ? '이 기기에서 ' : '';
    sentences.push(`${span} 상체를 ${where}모두 ${duration(posture.measuredMinutes)}(${posture.sessions}번) ${measuredDays === null ? '측정' : '기록'}했어요.`);
    if (keyboard) sentences.push(`키보드는 입력 ${number(keyboard.judged)}회를 판정했어요.`);
  } else if (keyboard) {
    sentences.push(`${span} 키보드 입력 ${number(keyboard.judged)}회를 판정했어요.`);
  } else {
    sentences.push(measuredDays === null ? `최근 ${days}일 동안 깜빡임을 관찰했어요.` : `최근 ${days}일 중 ${measuredDays}일 동안 깜빡임을 관찰했어요.`);
  }
  sentences.push(...pairs(scores, days));
  const compared = scores.filter(score => score.delta !== null);
  const ups = compared.filter(score => score.delta! > 0).sort((a, b) => b.delta! - a.delta!);
  if (compared.length >= 2 && ups.length && (ups.length === 1 || ups[0].delta! > ups[1].delta!)) {
    sentences.push(`${compared.length === 3 ? '세' : '두'} 점수 중 ${ups[0].name}가 가장 크게 올랐어요.`);
  }
  const blink = eye ? blinkChange(eye) : null;
  if (blink) {
    sentences.push(blink.diff === null ? `분당 깜빡임은 ${blink.rate}회였어요.`
      : blink.diff === 0 ? `분당 깜빡임은 ${blink.rate}회로 직전과 비슷했어요.`
        : `분당 깜빡임은 ${blink.rate}회로 ${Math.abs(blink.diff)}회 ${blink.diff > 0 ? '늘었어요' : '줄었어요'}.`);
  }
  if ((scores.length || blink) && !compared.length && blink?.diff == null) sentences.push(`직전 ${days}일 기록이 없어 이번에는 변화를 비교하지 않았어요.`);
  const neckTrend = posture ? trend(input.daily, day => day.neck, days) : null;
  if (peak) sentences.push(`${ups.length ? '다만 ' : ''}${peak.label} 무렵에는 기준 자세에서 벗어나는 일이 다른 시간보다 잦았어요.`);
  else if (neckTrend && Math.abs(neckTrend.shift) >= TREND_GAP) {
    sentences.push(`기간 뒤쪽으로 갈수록 목 점수가 ${neckTrend.shift > 0 ? '올랐어요' : '내려갔어요'}.`);
  }
  return { key: 'overall', title: `최근 ${days}일 총평`, text: sentences.join(' ') };
}

function upperSection(input: ReviewInput, posture: Posture, scores: Score[], peak: ReturnType<typeof peakHour>): SectionPlan {
  const sentences: string[] = [];
  const valid = posture.validRate === null ? null : Math.round(posture.validRate);
  const visible = visibleOf(posture), short = posture.measuredMinutes < SHORT_UPPER_MINUTES;
  if (short && !visible) {
    sentences.push(`상체 측정 시간이 ${duration(posture.measuredMinutes)}으로 짧고 얼굴과 어깨가 보여 분석한 시간도 ${valid}%뿐이라, 아래 내용은 참고로만 봐 주세요.`);
  } else if (short) {
    sentences.push(`상체 측정 시간이 ${duration(posture.measuredMinutes)}으로 짧아서 아래 내용은 참고로만 봐 주세요.`);
  } else if (!visible) {
    sentences.push(`측정 시간 중 얼굴과 어깨가 보여 분석한 시간이 ${valid}%뿐이라 점수는 참고로만 봐 주세요.`);
  }
  const neck = scores.find(score => score.metric === 'neck'), side = scores.find(score => score.metric === 'side');
  if (neck && side) sentences.push(`목 점수는 평균 ${neck.current}점, ${side.name}는 평균 ${side.current}점이었어요.`);
  else if (neck || side) sentences.push(`${(neck ?? side)!.name}는 평균 ${(neck ?? side)!.current}점이었어요.`);
  if (neck && side && Math.abs(neck.current - side.current) >= PART_GAP) {
    const gap = Math.abs(neck.current - side.current);
    sentences.push(neck.current < side.current
      ? `목 점수가 ${side.name}보다 ${gap}점 낮아서, 목 자세를 조금 더 신경 쓰면 좋아요.`
      : `목 점수가 ${side.name}보다 ${gap}점 높았어요.`);
  }
  const neckTrend = trend(input.daily, day => day.neck, input.days);
  sentences.push(...(neckTrend ? trendSentences('목 점수', neckTrend) : trendSentences(posture.sideName, trend(input.daily, day => day.side, input.days))));
  if (posture.deviations && visible) {
    const { count, rate } = posture.deviations;
    sentences.push(rate === null
      ? `기준 자세에서 벗어난 일은 ${number(count)}번이었어요.`
      : `기준 자세에서 벗어난 일은 ${number(count)}번이었고, 벗어나 있던 시간은 제대로 관찰한 시간의 ${Math.round(rate)}%였어요.`);
    if (peak) {
      sentences.push(`관찰한 시간에 비해 벗어나는 일은 ${peak.label} 무렵에 가장 잦아서 1시간에 ${peak.perHour}번꼴이었어요.${peak.average >= 1
        ? ` 전체 평균은 1시간에 ${peak.average}번꼴이었어요.` : ''}`);
    }
  }
  const hours = hourExtremes(posture);
  if (hours) sentences.push(`시간대별로는 ${hours.best.label} 무렵 점수가 가장 높고 ${hours.worst.label} 무렵이 가장 낮았어요.`);
  if (posture.longestMinutes !== null && posture.longestMinutes >= 1) {
    sentences.push(`한 번에 가장 길게 이어서 측정한 시간은 ${duration(posture.longestMinutes)}이었어요.`);
  }
  if (posture.band && posture.band.percentOfValidTime > 0) {
    sentences.push(`가장 최근 측정에서는 목 점수가 ${posture.band.fromPoints}~${posture.band.toPoints}점인 구간이 유효 관찰 시간의 ${Math.round(posture.band.percentOfValidTime)}%로 가장 길었어요.`);
  }
  return { key: 'upper', title: posture.sideName.startsWith('어깨') ? '목·어깨' : '목·좌우 균형', text: sentences.join(' ') };
}

function frequentKeys(keyboard: NonNullable<ReviewInput['keyboard']>) {
  return keyboard.frequentKeys.filter(key => Math.round(key.differentRate) >= FREQUENT_KEY_RATE)
    .map(key => ({ name: keyName(key.code), rate: Math.round(key.differentRate) }));
}

function keyboardSection(input: ReviewInput, keyboard: NonNullable<ReviewInput['keyboard']>): SectionPlan {
  const sentences: string[] = [];
  if (keyboard.judged < FEW_JUDGED) sentences.push(`판정한 입력이 ${number(keyboard.judged)}회로 적어서 아래 내용은 참고로만 봐 주세요.`);
  sentences.push(keyboard.score === null
    ? `손가락을 판정한 입력은 ${number(keyboard.judged)}회였어요.`
    : `손가락을 판정한 입력은 ${number(keyboard.judged)}회였고, 훈련 점수는 평균 ${Math.round(keyboard.score)}점이었어요.`);
  const found = trend(input.daily, day => day.keyboard, input.days);
  if (found && found.range >= SAME_SCORE) {
    sentences.push(`날짜별로는 ${found.best.label}이 ${found.best.value}점으로 가장 높았고, ${found.worst.label}이 ${found.worst.value}점으로 가장 낮았어요.`);
  }
  if (keyboard.consistency !== null) {
    const consistency = Math.round(keyboard.consistency);
    sentences.push(`같은 키를 같은 손가락으로 누른 비율은 ${consistency}%${consistency >= HIGH_CONSISTENCY ? '로 꾸준했어요' : '였어요'}.`);
  }
  const keys = frequentKeys(keyboard);
  if (keys.length) sentences.push(`권장과 다른 손가락을 자주 쓴 키는 ${joined(keys.map(key => `${key.name}(${key.rate}%)`))}였어요.`);
  if (keyboard.coverage !== null) {
    const coverage = Math.round(keyboard.coverage);
    sentences.push(`손가락을 판정할 수 있었던 입력은 ${coverage}%였어요.${coverage < GOOD_COVERAGE ? ' 손과 키보드가 카메라에 잘 보이게 맞추면 더 많은 입력을 판정할 수 있어요.' : ''}`);
  }
  return { key: 'keyboard', title: '키보드', text: sentences.join(' ') };
}

// Blink frequency is a measurement. Changes in the rate carry no positive or negative judgement.
function eyeSection(input: ReviewInput, eye: NonNullable<ReviewInput['eye']>): SectionPlan {
  const sentences: string[] = [];
  if (eye.validMinutes < SHORT_EYE_MINUTES) sentences.push('깜빡임을 관찰한 시간이 짧아서 아래 내용은 참고로만 봐 주세요.');
  const blink = blinkChange(eye);
  if (!blink) {
    sentences.push(`깜빡임을 제대로 관찰한 시간은 ${duration(eye.validMinutes)}이었어요.`);
  } else {
    sentences.push(`깜빡임을 제대로 관찰한 시간은 ${duration(eye.validMinutes)}이었고, 그동안 분당 ${blink.rate}회 깜빡였어요.`);
    if (blink.diff !== null) {
      sentences.push(blink.diff === 0 ? `직전 ${input.days}일(분당 ${blink.before}회)과 비슷했어요.`
        : `직전 ${input.days}일(분당 ${blink.before}회)보다 ${Math.abs(blink.diff)}회 ${blink.diff > 0 ? '늘었어요' : '줄었어요'}.`);
    }
  }
  sentences.push('깜빡임 횟수는 점수가 아니라 참고 기록이에요.');
  return { key: 'eye', title: '깜빡임', text: sentences.join(' ') };
}

function headline(scores: Score[], days: 7 | 30, measuredDays: number | null) {
  const period = days === 7 ? '한 주였어요' : '한 달이었어요';
  const short = (score: Score) => (score.metric === 'keyboard' ? '키보드 점수' : score.name);
  const ups = scores.filter(score => score.delta !== null && score.delta > 0).sort((a, b) => b.delta! - a.delta!);
  const downs = scores.filter(score => score.delta !== null && score.delta < 0).sort((a, b) => a.delta! - b.delta!);
  if (ups.length >= 2) return `${short(ups[0])}와 ${short(ups[1])}가 함께 오른 ${period}.`;
  if (ups.length && downs.length) return `${short(ups[0])}는 오르고 ${short(downs[0])}는 조금 내려간 ${period}.`;
  if (ups.length) return `${short(ups[0])}가 오른 ${period}.`;
  if (downs.length) return `${short(downs[0])}가 조금 내려간 ${period}.`;
  if (scores.some(score => score.delta === 0)) return `점수를 고르게 유지한 ${period}.`;
  return measuredDays ? `${measuredDays}일 동안 기록을 쌓은 ${period}.` : `기록을 쌓은 ${period}.`;
}

/** What was recorded, for a period whose scores give no strength or goal yet (short or first measurements). */
function recordingFeedback(input: ReviewInput, posture: Posture | null) {
  if (posture && posture.sessions > 0 && (posture.neck.current !== null || posture.side.current !== null)) {
    const band = posture.band;
    return {
      strength: posture.neck.current !== null && band && band.fromPoints >= HIGH_SCORE && band.percentOfValidTime > 0
        ? `최근 측정에서 목 점수가 ${band.fromPoints}~${band.toPoints}점인 구간이 유효 관찰 시간의 ${Math.round(band.percentOfValidTime)}%였어요.`
        : `이번 기간에 상체 자세를 ${posture.sessions}번 측정해 비교할 기록을 남겼어요.`,
      goal: '다음에도 같은 작업을 할 때 측정해 이번 점수가 이어지는지 확인하기',
    };
  }
  if (input.keyboard && input.keyboard.judged > 0) {
    return { strength: `손가락을 판정할 수 있는 타자 입력을 ${number(input.keyboard.judged)}회 기록했어요.`,
      goal: '다음 타자 연습에서도 비슷한 속도로 입력해 손가락 사용이 일정한지 확인하기' };
  }
  if (input.eye && input.eye.validMinutes > 0) {
    return { strength: input.eye.validMinutes >= 1 ? `눈 깜빡임을 ${duration(input.eye.validMinutes)} 동안 기록했어요.` : '눈 깜빡임을 관찰해 다음 측정과 비교할 기록을 남겼어요.',
      goal: '다음에도 비슷한 작업을 할 때 측정해 깜빡임 기록 비교하기' };
  }
  return null;
}

/** Strengths, weaknesses and the goals they lead to, most telling first. Nothing is judged from a sample too thin to trust. */
function lists(input: ReviewInput, posture: Posture | null, scores: Score[], peak: ReturnType<typeof peakHour>) {
  const { days, keyboard, measuredDays } = input;
  const strengths: string[] = [], weaknesses: [number, string, string][] = [];
  const weak = (rank: number, text: string, goal: string) => weaknesses.push([rank, text, goal]);
  const upperGoal = '측정을 시작할 때 기준 자세를 다시 잡고, 화면을 오래 볼 때 그 자세 떠올리기';
  const keyboardGoal = '권장 손가락을 떠올리며 천천히 타자 연습하기';
  for (const score of scores.filter(item => item.reliable)) {
    const goal = score.metric === 'keyboard' ? keyboardGoal : upperGoal;
    if (score.delta !== null && score.delta > 0) strengths.push(`${score.name}가 ${score.current}점으로 직전 ${days}일보다 ${score.delta}점 올랐어요.`);
    else if (score.delta !== null && score.delta < 0) weak(0, `${score.name}가 ${score.current}점으로 직전 ${days}일보다 ${-score.delta}점 내려갔어요.`, goal);
    else if (score.current >= HIGH_SCORE) strengths.push(`${score.name}가 ${score.current}점으로 ${score.delta === 0 ? '높게 유지됐어요' : '높았어요'}.`);
    else if (score.current < LOW_SCORE) weak(3, `${score.name}가 ${score.current}점으로 낮은 편이에요.`, goal);
  }
  if (measuredDays !== null && measuredDays >= days * REGULAR_DAYS) strengths.push(`${days}일 중 ${measuredDays}일을 측정했어요.`);
  if (measuredDays !== null && measuredDays < days * FEW_DAYS) {
    weak(5, `${days}일 중 ${measuredDays}일만 측정했어요.`, `측정하는 날을 ${Math.min(days, Math.max(measuredDays + 2, Math.ceil(days / 2)))}일 이상으로 늘리기`);
  }
  if (posture) {
    const reliable = reliableOf(posture);
    if (reliable && posture.deviations?.rate != null) {
      const rate = Math.round(posture.deviations.rate);
      if (rate <= LOW_DEVIATION) strengths.push(`기준 자세에서 벗어나 있던 시간이 ${rate}%로 짧았어요.`);
      if (rate >= HIGH_DEVIATION) weak(2, `기준 자세에서 벗어나 있던 시간이 ${rate}%로 길었어요.`, '화면을 오래 볼 때 기준 자세를 떠올려 벗어나 있는 시간 줄이기');
    }
    if (reliable && peak) {
      weak(1, `${peak.label} 무렵에 기준 자세에서 벗어나는 일이 다른 시간보다 잦았어요.`, `${peak.label} 무렵에 한 번씩 기준 자세 확인하기(오버레이를 켜 두면 점수를 바로 볼 수 있어요)`);
    }
    if (!visibleOf(posture)) weak(6, '얼굴이나 어깨가 카메라에 보이지 않은 시간이 많았어요.', '카메라에 얼굴과 양쪽 어깨가 모두 보이게 위치 맞추기');
  }
  if (keyboard) {
    const coverage = keyboard.coverage === null ? null : Math.round(keyboard.coverage);
    const reliable = keyboard.judged >= FEW_JUDGED && (coverage === null || coverage >= LOW_COVERAGE);
    if (reliable && keyboard.consistency !== null && Math.round(keyboard.consistency) >= HIGH_CONSISTENCY) {
      strengths.push(`같은 키를 같은 손가락으로 누른 비율이 ${Math.round(keyboard.consistency)}%로 꾸준했어요.`);
    }
    const keys = frequentKeys(keyboard);
    if (keys.length) {
      weak(4, `${joined(keys.map(key => `${key.name}(${key.rate}%)`))}에서 권장과 다른 손가락을 자주 썼어요.`,
        `${joined(keys.map(key => key.name))}를 권장 손가락으로 천천히 연습하기`);
    }
    if (coverage !== null && coverage < LOW_COVERAGE) weak(7, '손가락을 판정하지 못한 입력이 많았어요.', '손과 키보드가 카메라에 잘 보이게 위치 맞추기');
  }
  const ordered = weaknesses.sort((a, b) => a[0] - b[0]);
  const goals = [...new Set(ordered.map(([, , goal]) => goal))].slice(0, SHOWN);
  const fallback = recordingFeedback(input, posture);
  if (!strengths.length && fallback) strengths.push(fallback.strength);
  return {
    strengths: strengths.slice(0, SHOWN),
    weaknesses: ordered.map(([, text]) => text).slice(0, SHOWN),
    goals: goals.length ? goals : [fallback?.goal ?? '지금처럼 꾸준히 측정하며 흐름 이어 가기'],
  };
}

function caution(input: ReviewInput, posture: Posture | null) {
  const limited: string[] = [];
  const { keyboard, eye } = input;
  if (posture && !reliableOf(posture)) limited.push('상체');
  if (keyboard && (keyboard.judged < FEW_JUDGED || (keyboard.coverage !== null && Math.round(keyboard.coverage) < LOW_COVERAGE))) limited.push('키보드');
  if (eye && eye.validMinutes < SHORT_EYE_MINUTES) limited.push('깜빡임');
  return limited.length ? `${limited.join('·')} 기록은 측정이 부족해 참고용으로 봐 주세요.` : null;
}

export function buildReviewPlan(input: ReviewInput): ReviewPlan {
  const { days, keyboard, eye } = input;
  const posture = postureOf(input);
  const keyboardReliable = !!keyboard && keyboard.judged >= FEW_JUDGED && (keyboard.coverage === null || Math.round(keyboard.coverage) >= LOW_COVERAGE);
  const scores = [
    posture && scoreOf('neck', '목 점수', posture.neck, reliableOf(posture)),
    posture && scoreOf('side', posture.sideName, posture.side, reliableOf(posture)),
    keyboard && scoreOf('keyboard', '키보드 훈련 점수', { current: keyboard.score, previous: keyboard.previousScore }, keyboardReliable),
  ].filter((score): score is Score => !!score);
  const peak = posture ? peakHour(posture) : null;
  const sections = [overallSection(input, posture, scores, peak)];
  if (posture) sections.push(upperSection(input, posture, scores, peak));
  if (keyboard) sections.push(keyboardSection(input, keyboard));
  if (eye) sections.push(eyeSection(input, eye));
  return { days, headline: headline(scores, days, input.measuredDays), sections, ...lists(input, posture, scores, peak), caution: caution(input, posture) };
}

/** What the mini PC reads before it suggests one habit: the period in words and the lists shown beside it. */
export function renderRecord(plan: ReviewPlan) {
  const section = (title: string, lines: string[]) => (lines.length ? [`[${title}]`, ...lines.map(line => `- ${line}`)] : []);
  const overall = plan.sections[0].text.split(/(?<=[.!?])\s+/).filter(Boolean);
  return [
    `기간: 최근 ${plan.days}일`,
    ...section('주요 기록', [plan.headline, ...overall]),
    ...section('화면에 함께 보이는 잘한 점', plan.strengths),
    ...section('화면에 함께 보이는 개선할 점', [...plan.weaknesses, ...plan.goals]),
  ].join('\n');
}
