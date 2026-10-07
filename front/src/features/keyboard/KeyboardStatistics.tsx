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
