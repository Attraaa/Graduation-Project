import { useState } from 'react';
import type { ReactNode } from 'react';
import { keyboardSummary } from '../../../../database/keyboard';
import type { KeyboardCount, KeyboardStored } from '../../../../database/keyboard';
import DailyChart from '../statistics/DailyChart';
import HourlyChart from '../statistics/HourlyChart';
import { clockText, longDate } from '../dashboard/format';
import StatTile from '../statistics/StatTile';
import { CARD, ChartHeader, EmptyChart, HistoryLink } from '../statistics/parts';
import type { PeriodDays } from '../statistics/period';
import { previousPeriodText } from '../statistics/text';
import { percentText, reasonText, scoreText } from './labels';
import KeyboardKeyExploration from './KeyboardKeyExploration';
import { keyLabel as keyText } from './keyExploration';
import { dailyKeyboardPractice } from './dailyPractice';
import TrendSelection from '../statistics/TrendSelection';

const dayBefore = (day: string, n: number) => new Date(Date.parse(day) - n * 86400_000).toISOString().slice(0, 10);
const policyKey = (row: KeyboardStored) => JSON.stringify([row.record.policyVersion, row.record.recognitionVersion, row.record.nearbyCredit]);
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
  const [pickedDate, setPickedDate] = useState('');
  const [pickedSession, setPickedSession] = useState('');
  const dayView = days === 1;
  const from = dayBefore(date, days - 1);
  const groups = [...new Set(data.map(policyKey))];
  const selectedPolicy = groups.includes(policy) ? policy : groups.at(-1) ?? '';
  const records = data.filter(row => policyKey(row) === selectedPolicy);
  const credit = records[0]?.record.nearbyCredit ?? 70;
  const allCounts = records.flatMap(row => row.counts);
  const counts = allCounts.filter(row => row.date >= from), previous = allCounts.filter(row => row.date < from);
  const summary = keyboardSummary(counts, credit), before = keyboardSummary(previous, credit);
  const daily = Array.from({ length: dayView ? 0 : days }, (_, i) => {
    const day = dayBefore(date, days - i - 1), totals = keyboardSummary(counts.filter(row => row.date === day), credit);
    return { date: day, score: totals.score, coverage: totals.coverage, valid: totals.valid, unknown: totals.unknown };
  });
  const sessions = dayView ? dailyKeyboardPractice(records, date) : [];
  const sessionTime = (index: number) => sessions[index] ? clockText(sessions[index].at, sessions[index].offsetMinutes) : '';
  const selectedDay = daily.find(row => row.date === pickedDate) ?? daily.findLast(row => row.score !== null || row.coverage !== null) ?? daily.at(-1);
  const selectedSession = sessions[Number(pickedSession || sessions.length - 1)];
  const byKey = new Map<string, KeyboardCount[]>();
  counts.forEach(row => byKey.set(row.code, [...(byKey.get(row.code) ?? []), row]));
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
        chip={change === null ? null : { text: `${previousPeriodText(days)}보다 ${change > 0 ? '+' : ''}${change.toFixed(1)}`, tone: change > 0 ? 'good' : 'neutral' }} />
      <StatTile label="기본표 일치율" value={percentText(summary.agreement)} />
      <StatTile label="판정 가능 비율" value={percentText(summary.coverage)} detail={`보류 ${summary.unknown}회 · 미지원/단축키 ${summary.unsupported}회 별도`} />
      <StatTile label="사용 일관성" value={percentText(summary.consistency)} detail={`키·Shift 상황별 10회 이상 · 대상 ${summary.consistencyTotal}회`} />
    </div>
    <section aria-label="연습 변화" className={`${CARD} space-y-3`}>
      <ChartHeader title={dayView ? '세션별 연습 변화' : '연습 변화'} legend={LINES} />
      {dayView ? sessions.some(session => session.score !== null || session.coverage !== null)
        ? <HourlyChart expanded label="세션별 훈련 점수와 판정 가능 비율" data={sessions.map(({ score, coverage }, hour) => ({ hour, score, coverage }))}
          lines={LINES} domain={[0, 100]} unit="점" labelFor={sessionTime} selectedHour={selectedSession ? sessions.indexOf(selectedSession) : undefined} />
        : <EmptyChart text={sessions.length ? '판정할 수 있는 키보드 집계가 없어요' : '이 날의 키보드 연습 기록이 없어요'} />
        : counts.length ? <DailyChart label="날짜별 훈련 점수와 판정 가능 비율" lines={LINES} today={today} domain={[0, 100]}
        faded={faded} detail={detail} onSelectDate={onSelectDate} selectedDate={selectedDay?.date}
        data={daily.map(row => ({ date: row.date, score: row.score, coverage: row.coverage }))} />
        : <EmptyChart text="선택한 기간의 키보드 집계가 없습니다. 키보드 학습을 시작하면 처리된 입력의 집계를 저장합니다." />}
      {dayView && selectedSession && <TrendSelection label="세션" options={sessions.map((_, index) => ({ value: String(index), label: sessionTime(index) }))}
        value={String(sessions.indexOf(selectedSession))} onChange={setPickedSession} date={date}>
        <span>훈련 점수 <b className="text-heading">{scoreText(selectedSession.score)}</b></span>
        <span>판정 가능 비율 <b className="text-heading">{percentText(selectedSession.coverage)}</b></span>
      </TrendSelection>}
      {!dayView && selectedDay && <TrendSelection label="날짜" options={daily.map(row => ({ value: row.date, label: longDate(row.date) }))}
        value={selectedDay.date} onChange={setPickedDate} date={selectedDay.date}>
        <span>훈련 점수 <b className="text-heading">{scoreText(selectedDay.score)}</b></span>
        <span>판정 가능 비율 <b className="text-heading">{percentText(selectedDay.coverage)}</b></span>
      </TrendSelection>}
      <p className="text-sm text-muted">{previousPeriodText(days)} {scoreText(before.score)} ({before.valid}회, 판정 {percentText(before.coverage)}) → {dayView ? '선택한 날' : '현재'} {scoreText(summary.score)} ({summary.valid}회, 판정 {percentText(summary.coverage)}){summary.score !== null && before.score !== null ? ` · ${Math.round(summary.score) - Math.round(before.score)}점 변화` : ''}</p>
      <p className="text-xs text-muted">표본 수와 판정 가능 비율이 다른 기간의 점수 변화는 실제 개선과 다를 수 있습니다. 일관성은 같은 키·Shift 상황에서 가장 많이 쓴 손가락의 비율이며 점수에 가산하지 않습니다.</p>
    </section>
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="keyboard-record-detail lg:col-span-2"><KeyboardKeyExploration counts={counts} nearbyCredit={credit} policyVersion={records[0]?.record.policyVersion ?? ""} selectedKey={selectedKey} onSelect={setSelectedKey} /></div>
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
  </div>;
}
