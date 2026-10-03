import { useCallback, useState } from 'react';
import { getCurrentUser } from '../utils/authStore';
import { recordsApi, recordValue } from '../features/records/api';
import { useRecordQuery } from '../features/records/useRecordQuery';
import { todayDateKey } from '../features/records/views';
import StatisticsData from '../features/records/StatisticsData';
import StatisticsExamples from '../features/records/StatisticsExamples';
import RecordingStatus from '../features/records/RecordingStatus';
import Button from '../components/Button';
import KeyboardStatistics from '../features/keyboard/KeyboardStatistics';
import EyeStatistics from '../features/eye/EyeStatistics';
import { learningModes } from '../data/modes';
import type { ModeId } from '../data/modes';

export default function Statistics() {
  const [date, setDate] = useState(todayDateKey);
  const [mode, setMode] = useState<ModeId>('upper_body');
  const owner = getCurrentUser()?.id ?? '';
  const previousDate = new Date(Date.parse(date) - 86400_000).toISOString().slice(0, 10);
  const load = useCallback(async () => {
    if (!owner) throw new Error('로그인하면 이 계정의 기록을 조회할 수 있습니다.');
    if (mode !== 'upper_body') return [];
    return recordValue(recordsApi().statistics({ owner, from: previousDate, to: date }));
  }, [owner, previousDate, date, mode]);
  const query = useRecordQuery([owner, date, mode].join(':'), load);
  const rows = query.data ?? [];
  return <div className="space-y-6">
    <header><h1 className="text-3xl font-black text-heading">나의 관찰 통계</h1>
      <p className="mt-2 text-muted">서버에 저장된 이 계정의 실제 관찰 집계입니다. 자세 유사도와 키보드 훈련 점수는 의학적 진단이 아닙니다.</p></header>
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-sm font-bold text-heading">날짜<input type="date" value={date} onChange={event => { if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) setDate(event.target.value); }} className="ml-2 rounded-xl border border-border bg-surface p-3" /></label>
      <label className="text-sm font-bold text-heading">모드<select aria-label="통계 모드" value={mode} onChange={event => setMode(event.target.value as ModeId)} className="ml-2 rounded-xl border border-border bg-surface p-3">{learningModes.map(part => <option key={part.id} value={part.id}>{part.shortTitle}</option>)}</select></label>
      {mode === 'upper_body' && <Button variant="outline" onClick={query.retry}>새로고침</Button>}
    </div>
    <RecordingStatus />
    {mode === 'eye' ? <EyeStatistics owner={owner} date={date} /> : mode === 'keyboard' ? <KeyboardStatistics owner={owner} date={date} /> : <>
    {query.loading && <p role="status" className="card-duo text-muted">기록을 불러오는 중입니다.</p>}
    {query.error && <div role="alert" className="card-duo text-muted"><p>{query.error}</p><Button variant="outline" onClick={query.retry}>다시 불러오기</Button></div>}
    {query.data && <div className="grid gap-6 lg:grid-cols-2">{(['turtle', 'shoulder'] as const).map(part => (
      <section key={part} aria-label={part === 'turtle' ? '목 통계' : '어깨 통계'}>
        <h2 className="mb-3 text-xl font-black text-heading">{part === 'turtle' ? '목 점수' : '어깨 점수'}</h2>
        <StatisticsData rows={rows.filter(row => row.date === date && row.mode === part)} previous={rows.filter(row => row.date === previousDate && row.mode === part)} />
      </section>
    ))}</div>}
    <StatisticsExamples />
    </>}
  </div>;
}
