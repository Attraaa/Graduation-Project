import { useCallback, useState } from 'react';
import { recordsApi, recordValue } from '../records/api';
import { useRecordQuery } from '../records/useRecordQuery';
import { EyeStatisticsData } from './EyeRecordData';
import Button from '../../components/Button';

export default function EyeStatistics({ owner, date }: { owner: string; date: string }) {
  const [days, setDays] = useState(7);
  const from = new Date(Date.parse(date) - (days - 1) * 86400000).toISOString().slice(0, 10);
  const load = useCallback(async () => {
    if (!owner) throw new Error('로그인하면 이 계정의 기록을 조회할 수 있습니다.');
    return recordValue(recordsApi().eyeStatistics({ owner, from, to: date }));
  }, [owner, from, date]);
  const query = useRecordQuery([owner, from, date].join(':'), load);
  return <div className="space-y-4">
    <div className="flex items-center gap-3">
      <label className="text-sm font-bold text-heading">조회 기간<select aria-label="안구 통계 기간" value={days} onChange={event => setDays(Number(event.target.value))} className="ml-2 rounded-xl border border-border bg-surface p-3">
        <option value={7}>최근 7일</option><option value={30}>최근 30일</option>
      </select></label>
      <Button variant="outline" onClick={query.retry}>새로고침</Button>
    </div>
    {query.loading && <p role="status">안구 기록을 불러오는 중입니다.</p>}
    {query.error && <div role="alert" className="card-duo"><p>{query.error}</p><Button variant="outline" onClick={query.retry}>다시 불러오기</Button></div>}
    {query.data && <EyeStatisticsData rows={query.data} date={date} />}
  </div>;
}
