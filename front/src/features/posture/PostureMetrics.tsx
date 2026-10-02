import Metric from '../session/Metric';
import type { EvaluationSummary, MonitorSnapshot } from './monitorTypes';

const formatTime = (seconds: number) =>
  String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
const scoreText = (score: number | null) => score === null ? '—' : `${Math.round(score)}점`;

/** Presentation only: formulas and thresholds belong to scoring/evaluation. */
function PartMetrics({ result, elapsedSeconds, isRunning }: {
  result: EvaluationSummary;
  elapsedSeconds: number;
  isRunning: boolean;
}) {
  const currentScore = isRunning ? result.currentScore : null;
  const deviation = isRunning ? result.currentDeviation : null;
  const coverage = elapsedSeconds > 0 ? Math.min(100, result.validMs / (elapsedSeconds * 1000) * 100) : null;
  const unknownSeconds = Math.max(0, elapsedSeconds - result.validMs / 1000);
  return (
    <>
      <div>
        <h2 className="mb-3 text-sm font-black text-heading">기준 자세 유사도</h2>
        {isRunning && result.protection !== 'none' && <p role="status" className="mb-3 text-sm text-muted">
          {result.protection === 'moving' ? '움직임 감지 · 점수 유지 중'
            : result.protection === 'recovering' ? '기준 자세 복귀 확인 중 · 점수 유지 중' : '자세 변화 유예 · 점수 유지 중'}
        </p>}
        <div className="grid grid-cols-2 gap-3">
          <Metric label="현재 점수" value={scoreText(currentScore)} detail="기준 자세와의 화면상 유사도" />
          <Metric label="세션 평균" value={scoreText(result.averageScore)} detail="유효 관찰 시간으로 가중한 점수" />
          <Metric label="가중 편차" value={deviation === null ? '—' : `${(deviation * 100).toFixed(1)}%`} detail="부위별 비율 지표의 가중합" />
          <Metric label="유효 관찰 시간" value={formatTime(result.validMs / 1000)} detail="점수 계산에 포함된 시간" />
        </div>
      </div>
      <div>
        <h2 className="mb-3 text-sm font-black text-heading">관찰 습관 정보</h2>
        <div className="grid grid-cols-2 gap-3">
          <Metric label="세션 시간" value={formatTime(elapsedSeconds)} detail="모델 준비·기준 수집 시간 포함" />
          <Metric label="관측률" value={coverage === null ? '—' : `${coverage.toFixed(1)}%`} detail={`관찰 미확인 ${formatTime(unknownSeconds)} · 휴식 판정 아님`} />
          <Metric label="연속 관찰" value={formatTime(isRunning ? result.continuousMs / 1000 : 0)} detail={`최장 ${formatTime(result.longestContinuousMs / 1000)} · 실제 착석시간 아님`} />
          <Metric label="지속된 기준 이탈" value={`${result.deviationEpisodeCount}회`} detail={`확정 후 관찰 ${formatTime(result.deviationMs / 1000)}`} />
        </div>
      </div>
      <p className="text-xs leading-relaxed text-muted">
        점수는 개인 기준과의 유사도이며 건강·질환·해부학적 정상 여부를 진단하지 않습니다.
        관찰이 끊기면 현재 점수는 표시하지 않고, 세션 평균에는 확인한 구간만 남깁니다.
        기준 이탈은 자세가 달라진 구간이며 잘못된 자세나 오사용이라는 뜻이 아닙니다.
        초기 점수·지속시간 설정은 실제 촬영 검증에 따라 조정할 예정입니다. 결과는 이 PC에 저장됩니다.
      </p>
    </>
  );
}

export default function PostureMetrics({ snapshot, elapsedSeconds, isRunning }: {
  snapshot: MonitorSnapshot; elapsedSeconds: number; isRunning: boolean;
}) {
  return <div className="grid gap-6 lg:grid-cols-2">
    {([['목 점수', snapshot.neck], ['어깨 점수', snapshot.shoulder]] as const).map(([title, result]) => (
      <section key={title} className="space-y-4 rounded-xl border border-border p-4">
        <h2 className="text-lg font-black text-heading">{title}</h2>
        <PartMetrics result={result} elapsedSeconds={elapsedSeconds} isRunning={isRunning} />
      </section>
    ))}
  </div>;
}
