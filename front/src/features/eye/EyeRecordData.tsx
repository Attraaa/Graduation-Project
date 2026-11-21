import { eyeRate } from '../../../../database/eye';
import type { EyeDetail, EyeTotals } from '../../../../database/eye';
import { durationText } from '../records/views';
import Metric from '../session/Metric';

function EyeSummary({ totals }: { totals: EyeTotals }) {
  const rate = eyeRate(totals);
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
    <Metric label="관찰한 깜빡임" value={totals.blinks + '회'} detail="양쪽 눈을 감았다 뜬 동작" />
    <Metric label="깜빡임 빈도" value={rate === null ? '자료 없음' : rate.toFixed(1) + '회/분'} detail="유효 관찰 30초 이상일 때 표시 · 건강 점수 아님" />
    <Metric label="유효 관찰 시간" value={durationText(totals.validMs)} detail={'실행 시간 ' + durationText(totals.runMs) + ' · 기준 수집·유실·휴식 제외'} />
    <Metric label="눈 휴식 완료" value={totals.breaks + '회'} detail="20초 후 복귀 버튼으로 본인이 확인한 횟수" />
    <Metric label="가까워짐 안내" value={totals.nearReminders + '회'} detail="기준보다 가까워진 상태가 지속되어 안내를 시작한 횟수" />
    <Metric label="깜빡임 안내" value={totals.openReminders + '회'} detail="눈이 열린 상태가 지속되어 안내를 시작한 횟수" />
  </div>;
}
const rateText = (row: EyeTotals) => { const rate = eyeRate(row); return rate === null ? '자료 없음' : rate.toFixed(1) + '회/분'; };
export function EyeDetailData({ detail }: { detail: EyeDetail }) {
  return <div className="space-y-4" aria-label="안구 기록 상세">
    <EyeSummary totals={detail.record} />
    <p className="text-sm text-muted">상태: {detail.record.status === 'interrupted' ? '중단된 기록' : detail.record.status === 'running' ? '기록 중' : '종료'} · 정책: {detail.record.policyVersion}</p>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm">
      <caption className="py-3 text-left font-bold">분별 안구 관찰</caption>
      <thead><tr><th>시각</th><th>깜빡임</th><th>유효 시간</th><th>빈도</th><th>휴식 완료</th></tr></thead>
      <tbody>{detail.buckets.map(row => <tr key={row.minute} className="border-t border-border">
        <td className="py-2">{new Date(row.minute - detail.record.offsetMinutes * 60000).toISOString().slice(0, 16).replace('T', ' ')}</td>
        <td>{row.blinks}회</td><td>{durationText(row.validMs)}</td><td>{rateText(row)}</td><td>{row.breaks}회</td>
      </tr>)}</tbody>
    </table></div>
  </div>;
}
