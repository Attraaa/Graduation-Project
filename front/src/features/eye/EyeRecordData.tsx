import { emptyEyeTotals, eyeFields, eyeRate } from '../../../../database/eye';
import type { EyeDetail, EyeStatisticsRow, EyeTotals } from '../../../../database/eye';
import { durationText } from '../records/views';
import Metric from '../session/Metric';

export function EyeSummary({ totals }: { totals: EyeTotals }) {
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
function sumEye(rows: EyeTotals[]) {
  const total = emptyEyeTotals();
  for (const row of rows) for (const field of eyeFields) total[field] += row[field];
  return total;
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
export function EyeStatisticsData({ rows, date }: { rows: EyeStatisticsRow[]; date: string }) {
  if (!rows.length) return <p className="card-duo text-muted">선택한 기간의 안구 기록이 없습니다. 안구 모드에서 측정을 시작해 주세요.</p>;
  const policies = [...new Set(rows.map(row => row.policyVersion))];
  return <>{policies.map(policy => {
    const group = rows.filter(row => row.policyVersion === policy);
    const today = group.filter(row => row.date === date);
    const dates = [...new Set(group.map(row => row.date))].sort();
    return <section key={policy} className="card-duo space-y-4" aria-label="안구 통계">
      <h2 className="text-xl font-black text-heading">{date} 안구 통계</h2>
      <p className="text-sm text-muted">정책: {policy} · 관찰한 날짜 기준 집계입니다. 얼굴 크기 원본·영상과 건강 점수는 저장하지 않습니다.</p>
      {today.length ? <EyeSummary totals={sumEye(today)} /> : <p className="text-muted">선택한 날짜의 기록이 없습니다.</p>}
      <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <caption className="py-3 text-left font-bold">날짜별 추이</caption>
        <thead><tr><th>날짜</th><th>깜빡임</th><th>유효 시간</th><th>빈도</th><th>휴식 완료</th></tr></thead>
        <tbody>{dates.map(day => { const total = sumEye(group.filter(row => row.date === day)); return <tr key={day} className="border-t border-border">
          <td className="py-2">{day}</td><td>{total.blinks}회</td><td>{durationText(total.validMs)}</td><td>{rateText(total)}</td><td>{total.breaks}회</td>
        </tr>; })}</tbody>
      </table></div>
      <p className="text-xs text-muted">얼굴 유실은 휴식으로 계산하지 않습니다. 세션 상세는 학습이력의 시작일에서 확인할 수 있습니다.</p>
    </section>;
  })}</>;
}
