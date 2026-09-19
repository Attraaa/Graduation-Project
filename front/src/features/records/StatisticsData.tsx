import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { averageScore } from '../../../../database/contracts';
import type { StatisticsRow } from '../../../../database/contracts';
import { summarizeStatistics, statisticsKey, scoreDifference } from '../../../../database/aggregation';
import Metric from '../session/Metric';
import { durationText } from './views';

export default function StatisticsData({ rows, previous }: { rows: StatisticsRow[]; previous: StatisticsRow[] }) {
  const groups = summarizeStatistics(rows);
  const previousGroups = summarizeStatistics(previous);
  if (!groups.length) return <p className="card-duo text-muted">선택한 날짜와 모드의 기록이 없습니다. 학습을 시작하면 실제 기록이 표시됩니다.</p>;
  return <div className="space-y-6">{groups.map(group => {
    const key = statisticsKey(group);
    const difference = scoreDifference(group, previousGroups.find(row => statisticsKey(row) === key));
    const chart = Array.from({ length: 24 }, (_, hour) => {
      const row = rows.find(row => statisticsKey(row) === key && Number(row.hour) === hour);
      return { time: String(hour).padStart(2, '0') + ':00', score: row ? averageScore(row) : null };
    });
    return <section key={key} className="card-duo space-y-5">
      <h2 className="text-xl font-black text-heading">{group.mode === 'turtle' ? '목' : '어깨'} 기준 자세 유사도</h2>
      <p className="text-xs text-muted">점수 정책: {group.scorePolicyVersion} · 관찰 정책: {group.habitPolicyVersion}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Metric label="평균 기준 자세 유사도" value={group.average === null ? '자료 없음' : group.average.toFixed(1) + '점'} detail="유효 관측 시간으로 가중한 평균" />
        <Metric label="전일 대비 유사도 변화" value={difference === null ? '비교 자료 없음' : (difference >= 0 ? '+' : '') + difference.toFixed(1) + '점'} detail="같은 모드·정책의 전일 평균과 비교" />
        <Metric label="관측률" value={group.coverage === null ? '자료 없음' : group.coverage.toFixed(1) + '%'} detail="유효 관측 시간 / 실행 시간" />
        <Metric label="실행 시간" value={durationText(group.runMs)} detail="모델 준비·기준 수집 시간 포함" />
        <Metric label="유효 관측 시간" value={durationText(group.validMs)} detail="관찰 가능한 구간만 합산" />
        <Metric label="미관측 시간" value={durationText(group.unknownMs)} detail="휴식이나 정상 자세로 해석하지 않음" />
        <Metric label="지속된 기준 이탈" value={group.deviationEpisodeCount + '회'} detail="기존 관찰 정책으로 확정한 구간" />
        <Metric label="확정 후 기준 이탈 시간" value={durationText(group.deviationMs)} detail={group.deviationRate === null ? '유효 관측 자료 없음' : '유효 시간의 ' + group.deviationRate.toFixed(1) + '%'} />
        <Metric label="관측 구간이 포함된 기록" value={group.sessionCount + '개'} detail={'포함 기록 전체의 최장 연속 관찰 ' + durationText(group.longestContinuousMs)} />
      </div>
      <h3 className="font-black text-heading">시간대별 기준 자세 유사도</h3>
      <div className="h-64"><ResponsiveContainer width="100%" height="100%">
        <LineChart data={chart}><CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis dataKey="time" /><YAxis domain={[0, 100]} /><Tooltip />
          <Line dataKey="score" name="기준 자세 유사도" type="linear" connectNulls={false} stroke="var(--color-primary)" strokeWidth={3} />
        </LineChart>
      </ResponsiveContainer></div>
      <p className="text-sm text-muted">자료가 없는 시간은 선으로 연결하지 않습니다. 관측 시간과 관측률이 다른 날의 점수 차이를 건강 개선으로 단정할 수 없습니다.</p>
    </section>;
  })}</div>;
}
