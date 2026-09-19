import { useCallback, useState } from 'react';
import type { RecordMode } from '../../../database/contracts';
import { getCurrentUser } from '../utils/authStore';
import { recordsApi, recordValue } from '../features/records/api';
import { useRecordQuery } from '../features/records/useRecordQuery';
import { todayDateKey } from '../features/records/views';
import StatisticsData from '../features/records/StatisticsData';
import StatisticsExamples from '../features/records/StatisticsExamples';
import RecordingStatus from '../features/records/RecordingStatus';
import Button from '../components/Button';

export default function Statistics() {
  const [date, setDate] = useState(todayDateKey);
  const [mode, setMode] = useState<RecordMode>('turtle');
  const owner = getCurrentUser()?.id ?? '';
  const previousDate = new Date(Date.parse(date) - 86400_000).toISOString().slice(0, 10);
  const load = useCallback(async () => {
    if (!owner) throw new Error('로그인하면 이 계정의 기록을 조회할 수 있습니다.');
    return recordValue(recordsApi().statistics({ owner, from: previousDate, to: date, mode }));
  }, [owner, previousDate, date, mode]);
  const query = useRecordQuery([owner, date, mode].join(':'), load);
  return <div className="space-y-6">
    <header><h1 className="text-3xl font-black text-heading">나의 자세 통계</h1>
      <p className="mt-2 text-muted">이 PC에 저장된 실제 목·어깨 관찰 기록입니다. 기준 자세 유사도는 의학적 진단이 아닙니다.</p></header>
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-sm font-bold text-heading">날짜<input type="date" value={date} onChange={event => { if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) setDate(event.target.value); }} className="ml-2 rounded-xl border border-border bg-surface p-3" /></label>
      <label className="text-sm font-bold text-heading">모드<select value={mode} onChange={event => setMode(event.target.value as RecordMode)} className="ml-2 rounded-xl border border-border bg-surface p-3"><option value="turtle">목</option><option value="shoulder">어깨</option></select></label>
      <Button variant="outline" onClick={query.retry}>새로고침</Button>
    </div>
    <RecordingStatus />
    {query.loading && <p role="status" className="card-duo text-muted">기록을 불러오는 중입니다.</p>}
    {query.error && <div role="alert" className="card-duo text-muted"><p>{query.error}</p><Button variant="outline" onClick={query.retry}>다시 불러오기</Button></div>}
    {query.data && <StatisticsData rows={query.data.filter(row => row.date === date)} previous={query.data.filter(row => row.date === previousDate)} />}
    <StatisticsExamples />
  </div>;
}
