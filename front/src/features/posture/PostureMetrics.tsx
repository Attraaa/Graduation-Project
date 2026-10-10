import Metric from '../session/Metric';
import type { MonitorSnapshot } from './monitorTypes';
import type { EyeSnapshot } from '../eye/measurement';

const scoreText = (score: number | null) => score === null ? '—' : `${Math.round(score)}점`;
const rateText = (rate: number | null | undefined) => rate == null ? '—' : `${rate.toFixed(1)}회/분`;
const protection = { none: '', moving: '움직임 감지 · 점수 유지', grace: '자세 변화 유예 · 점수 유지', recovering: '기준 자세 복귀 확인' };

/** Compact presentation; scoring and observation policies remain unchanged. */
export default function PostureMetrics({ snapshot, eye, isRunning }: {
  snapshot: MonitorSnapshot; eye?: EyeSnapshot; isRunning: boolean;
}) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
    {([['목 점수', snapshot.neck], ['어깨 점수', snapshot.shoulder]] as const).map(([label, result]) => <div key={label} className="min-w-0">
      <Metric compact label={label} value={scoreText(isRunning ? result.currentScore : null)} detail={`세션 평균 ${scoreText(result.averageScore)}`} />
      {isRunning && result.protection !== 'none' && <p className="mt-1 text-xs text-muted">{protection[result.protection]}</p>}
    </div>)}
    <Metric compact label="깜빡임 빈도" value={rateText(isRunning ? eye?.recentBlinksPerMinute : null)} detail={`세션 평균 ${rateText(eye?.blinksPerMinute)}`} />
  </div>;
}
