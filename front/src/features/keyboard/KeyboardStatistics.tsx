import { useCallback, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { keyboardSummary } from '../../../../database/keyboard';
import type { KeyboardCount, KeyboardStored } from '../../../../database/keyboard';
import { recordsApi, recordValue } from '../records/api';
import { useRecordQuery } from '../records/useRecordQuery';
import Metric from '../session/Metric';
import Button from '../../components/Button';
import { percentText, reasonText, scoreText, statusText } from './labels';
import KeyboardKeyExploration from './KeyboardKeyExploration';
import { keyLabel as keyText } from './keyExploration';

const dayBefore = (day: string, n: number) => new Date(Date.parse(day) - n * 86400_000).toISOString().slice(0, 10);
const policyKey = (row: KeyboardStored) => JSON.stringify([row.record.policyVersion, row.record.recognitionVersion, row.record.nearbyCredit]);
export default function KeyboardStatistics({ owner, date }: { owner: string; date: string }) {
  const [days, setDays] = useState(7), [policy, setPolicy] = useState(''), [selectedKey, setSelectedKey] = useState('KeyA');
  const [sessionId, setSessionId] = useState('');
  const from = dayBefore(date, days - 1), prior = dayBefore(from, days);
  const load = useCallback(async () => {
    if (!owner) throw new Error('로그인하면 키보드 집계를 조회할 수 있습니다.');
    return recordValue(recordsApi().keyboardStatistics({ owner, from: prior, to: date }));
  }, [owner, prior, date]);
  const query = useRecordQuery(`${owner}:${prior}:${date}`, load);
  const loadDetail = useCallback(async () => sessionId ? recordValue(recordsApi().keyboardDetail(owner, sessionId)) : null, [owner, sessionId]);
  const detail = useRecordQuery(`${owner}:${sessionId}`, loadDetail);
  const groups = [...new Set((query.data ?? []).map(policyKey))];
  const selectedPolicy = groups.includes(policy) ? policy : groups.at(-1) ?? '';
  const records = (query.data ?? []).filter(row => policyKey(row) === selectedPolicy);
  const credit = records[0]?.record.nearbyCredit ?? 70;
  const allCounts = records.flatMap(row => row.counts);
  const counts = allCounts.filter(row => row.date >= from), previous = allCounts.filter(row => row.date < from);
  const summary = keyboardSummary(counts, credit), before = keyboardSummary(previous, credit);
  const daily = Array.from({ length: days }, (_, i) => {
    const day = dayBefore(date, days - i - 1), totals = keyboardSummary(counts.filter(row => row.date === day), credit);
    return { date: day.slice(5), score: totals.score, coverage: totals.coverage, valid: totals.valid, unknown: totals.unknown };
  });
  const byKey = new Map<string, KeyboardCount[]>();
  counts.forEach(row => byKey.set(row.code, [...(byKey.get(row.code) ?? []), row]));
  const differences = [...byKey].map(([code, rows]) => ({ code, ...keyboardSummary(rows, credit) }))
    .filter(row => row.valid > 0).toSorted((a, b) => b.nearby + b.mismatch - a.nearby - a.mismatch).slice(0, 8);
  const reasons = new Map<string, number>();
  counts.filter(row => row.verdict === 'unknown').forEach(row => reasons.set(row.reason, (reasons.get(row.reason) ?? 0) + row.count));
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center gap-3">
      <label className="text-sm font-bold text-heading">기간<select className="ml-2 rounded border border-border bg-surface p-2" value={days} onChange={event => setDays(Number(event.target.value))}><option value="7">최근 7일</option><option value="30">최근 30일</option></select></label>
      <Button variant="outline" onClick={query.retry}>키보드 집계 새로고침</Button>
      {groups.length > 1 && <label className="text-sm text-heading">정책<select className="ml-2 rounded border border-border bg-surface p-2" value={selectedPolicy} onChange={event => { setPolicy(event.target.value); setSessionId(''); }}>{groups.map(group => <option key={group} value={group}>{JSON.parse(group).join(' · ')}</option>)}</select></label>}
    </div>
    {query.loading && <p role="status" className="card-duo text-muted">키보드 집계를 불러오는 중입니다.</p>}
    {query.error && <p role="alert" className="card-duo text-red-700">{query.error}</p>}
    {query.data && <>
      {!counts.length && <p className="card-duo text-muted">선택한 기간의 키보드 집계가 없습니다. 키보드 학습을 시작하면 처리된 입력의 집계를 저장합니다.</p>}
      <p className="text-xs text-muted">{from}~{date} · 정책 {records[0]?.record.policyVersion ?? '기록 없음'} · 인식 {records[0]?.record.recognitionVersion ?? '—'}. 서로 다른 정책과 가중치는 합산하지 않습니다.</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="훈련 점수" value={scoreText(summary.score)} detail={`판정 가능한 ${summary.valid}회 · 인접 ${credit}점`} />
        <Metric label="기본표 일치율" value={percentText(summary.agreement)} detail="권장·허용 손가락 100점" />
        <Metric label="판정 가능 비율" value={percentText(summary.coverage)} detail={`보류 ${summary.unknown}회 · 미지원/단축키 ${summary.unsupported}회 별도`} />
        <Metric label="사용 일관성" value={percentText(summary.consistency)} detail={`키·Shift 상황별 10회 이상 · 대상 ${summary.consistencyTotal}회`} />
      </div>
      <section className="card-duo"><h2 className="font-black text-heading">연습 변화</h2>
        <p className="my-2 text-sm text-muted">직전 {days}일 {scoreText(before.score)} ({before.valid}회, 판정 {percentText(before.coverage)}) → 현재 {scoreText(summary.score)} ({summary.valid}회, 판정 {percentText(summary.coverage)}){summary.score !== null && before.score !== null ? ` · ${(summary.score - before.score).toFixed(1)}점 변화` : ''}</p>
        <div className="h-64" aria-label="날짜별 훈련 점수와 판정 가능 비율"><ResponsiveContainer width="100%" height="100%"><LineChart data={daily}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis domain={[0, 100]} /><Tooltip /><Line name="훈련 점수" dataKey="score" stroke="#1cb0f6" connectNulls={false} /><Line name="판정 가능 비율 (%)" dataKey="coverage" stroke="#58cc02" connectNulls={false} /></LineChart></ResponsiveContainer></div>
        <p className="text-xs text-muted">표본 수와 판정 가능 비율이 다른 기간의 점수 변화는 실제 개선과 다를 수 있습니다. 일관성은 같은 키·Shift 상황에서 가장 많이 쓴 손가락의 비율이며 점수에 가산하지 않습니다.</p>
      </section>
      <div className="keyboard-record-detail"><KeyboardKeyExploration counts={counts} nearbyCredit={credit} policyVersion={records[0]?.record.policyVersion ?? ""} selectedKey={selectedKey} onSelect={setSelectedKey} /></div>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="card-duo space-y-2"><h2 className="font-black text-heading">기본표와 자주 다른 키</h2>{differences.length ? differences.map(row => <button key={row.code} onClick={() => setSelectedKey(row.code)} className="block text-sm text-heading">{keyText(row.code)} · 인접 {row.nearby}회 / 다른 손가락 {row.mismatch}회 · {row.valid}회 중 {row.valid ? ((row.nearby + row.mismatch) / row.valid * 100).toFixed(1) : 0}%{row.valid < 10 ? ' (표본 부족)' : ''}</button>) : <p className="text-muted">판정 가능한 기록이 없습니다.</p>}</section>
        <section className="card-duo space-y-2"><h2 className="font-black text-heading">보류·제외 원인</h2>{[...reasons].map(([reason, n]) => <p key={reason} className="text-sm text-muted">{reasonText[reason]} · {n}회</p>)}{!reasons.size && <p className="text-muted">보류·제외 기록이 없습니다.</p>}</section>
      </div>
      <section className="card-duo space-y-3"><h2 className="font-black text-heading">세션 기록</h2>
        {records.filter(row => row.counts.some(count => count.date >= from) || new Date(row.record.startedAt - row.record.offsetMinutes * 60000).toISOString().slice(0, 10) >= from).map(row => <button key={row.record.id} onClick={() => setSessionId(row.record.id)} className="block text-sm text-heading">{new Date(row.record.startedAt).toLocaleString()} · {statusText[row.record.status]} · 기간 내 {row.counts.filter(count => count.date >= from).reduce((n, count) => n + count.count, 0)}회 · 상세 보기</button>)}
        {detail.error && <p role="alert" className="text-red-700">{detail.error}</p>}
        {detail.data && <div className="rounded border border-border p-3 text-sm text-muted"><p>전체 세션 · {detail.data.record.total}회 · {scoreText(keyboardSummary(detail.data.counts, detail.data.record.nearbyCredit).score)} · {detail.data.record.policyVersion}</p><p>최근 집계 시각: {new Date(detail.data.record.updatedAt).toLocaleString()} · {detail.data.record.status === 'interrupted' ? '앱 종료 등으로 중단된 세션' : detail.data.record.status === 'finished' ? '정상 종료' : '관찰 중'}</p><p>일자·키·손가락별 집계만 보관합니다. 입력 순서나 작성 내용은 조회할 수 없습니다.</p></div>}
      </section>
    </>}
  </div>;
}
