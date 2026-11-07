import type { EvaluationSummary, MonitorSnapshot } from './monitorTypes';
import { scoreMetricGain, scoreMetricValue, scorePosture, type ScoreMetric, type ScorePolicy } from './scoring';
import { turtleScorePolicy } from './modes/turtle';
import { shoulderScorePolicy } from './modes/shoulder';
import { MOTION_PROTECTION } from './scoreSettings';
import { habitPolicy } from './evaluation';

const labels: Record<ScoreMetric, string> = {
  headForward: '머리 상대 전진 (반응 ×2)', neckSlump: '귀–어깨 간격 감소',
  shoulderTilt: '양어깨 기울기 변화', shoulderShrug: '귀–어깨 간격의 상하 변화', torsoForward: '학습 모델의 조건부 보조',
};
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const points = (value: number | null) => value === null ? '—' : `${value.toFixed(1)}점`;
const reasons: Record<NonNullable<MonitorSnapshot['reason']>, string> = {
  'invalid-frame': '영상 크기나 좌표를 확인할 수 없습니다.', 'missing-landmarks': '얼굴·귀·양어깨 좌표가 부족합니다.',
  'low-confidence': '좌표 신뢰도가 낮습니다. 가림과 조명을 확인해 주세요.', 'out-of-frame': '필요한 얼굴·어깨 좌표가 화면 밖에 있습니다.',
  'shoulders-too-close': '어깨가 너무 작게 보입니다.', 'moving': '기준 수집 중 자세가 움직이고 있습니다.',
  'camera-changed': '카메라 구도가 바뀌어 기준을 다시 수집합니다.', 'interrupted': '영상이 끊겨 관찰을 보류합니다.',
  'invalid-time': '연속된 영상 시각을 확인할 수 없습니다.', 'ears-too-close': '귀 사이 폭이 너무 작게 보입니다.',
  'head-turned': '얼굴이 돌아가 비교를 보류합니다.', 'body-turned': '몸통이 돌아가 비교를 보류합니다.',
};

function protectionText(result: EvaluationSummary) {
  if (result.protection === 'moving') return '움직임 감지 · 이전 점수 유지';
  if (result.protection === 'grace') return `감점 유예 · ${Math.max(0, (MOTION_PROTECTION.graceMs - result.staticDeviationMs) / 1000).toFixed(1)}초 남음`;
  if (result.protection === 'recovering') return `기준 복귀 확인 · ${Math.max(0, (MOTION_PROTECTION.recoveryMs - result.nearReferenceMs) / 1000).toFixed(1)}초 남음`;
  return result.currentScore !== null && result.rawScore !== null && result.currentScore > result.rawScore
    ? `점진 감점 중 · 초당 최대 ${MOTION_PROTECTION.penaltyPointsPerSecond}점` : '시간 보호 적용 완료';
}

function Part({ title, policy, result, delta }: { title: string; policy: ScorePolicy; result: EvaluationSummary; delta: MonitorSnapshot['delta'] }) {
  const raw = scorePosture(delta, policy);
  const valid = raw.deviation !== null;
  const domain = Math.max(policy.zeroCreditDelta * 1.25, raw.deviation ?? 0);
  const x = (value: number) => 36 + value / domain * 288;
  const habit = habitPolicy(Number(result.habitPolicyVersion.match(/:s(\d+)$/)?.[1] ?? 50));
  return <article className="min-w-0 space-y-3 rounded-xl bg-surface-muted p-4">
    <h3 className="font-bold text-heading">{title} 계산 근거</h3>
    <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm"><span>원점수 <b>{points(raw.score)}</b></span><span>표시 점수 <b>{points(valid ? result.currentScore : null)}</b></span></div>
    <svg viewBox="0 0 350 132" role="img" aria-label={`${title} 가중 편차와 원점수 환산 곡선`} className="w-full text-muted">
      <path d="M36 10V100H330" fill="none" stroke="var(--color-border-strong)" />
      <path d={`M36 16H${x(policy.fullCreditDelta)}L${x(policy.zeroCreditDelta)} 96H324`} fill="none" stroke="var(--color-secondary)" strokeWidth="2.5" />
      <text x="2" y="20" fill="currentColor" fontSize="11">100점</text><text x="12" y="99" fill="currentColor" fontSize="11">0점</text>
      <text x="36" y="117" fill="currentColor" fontSize="11">0%</text><text x="324" y="117" textAnchor="end" fill="currentColor" fontSize="11">가중 편차 {percent(domain)}</text>
      {valid && <><path d={`M${x(raw.deviation!)} 16V100`} stroke="var(--color-border-strong)" strokeDasharray="3 3" /><circle cx={x(raw.deviation!)} cy={96 - raw.score! * .8} r="5" fill="var(--color-secondary)" /></>}
    </svg>
    <p className="text-xs text-muted">100점 범위 ≤ {percent(policy.fullCreditDelta)} · 0점 범위 ≥ {percent(policy.zeroCreditDelta)} · 사이 구간은 직선 환산</p>
    <div className="overflow-x-auto"><table className="w-full min-w-[300px] text-left text-xs [&_th]:pr-3 [&_td]:pr-3"><thead><tr className="text-muted"><th className="py-2">측정 항목</th><th>변화</th><th>비중 × 감도</th><th>기여 편차</th></tr></thead><tbody>
      {(Object.entries(policy.weights) as [ScoreMetric, number][]).map(([metric, weight]) => <tr key={metric} className="border-t border-border"><td className="py-2 pr-2">{labels[metric]}</td><td>{valid ? metric === 'shoulderTilt' ? `${(delta![metric] * 180 / Math.PI).toFixed(1)}°` : percent(delta![metric]) : '—'}</td><td>{Math.round(weight * 100)}% × {metric === 'shoulderTilt' ? '비선형 변환' : scoreMetricGain(policy, metric)}</td><td>{valid ? percent(weight * scoreMetricValue(policy, metric, delta![metric])) : '—'}</td></tr>)}
      <tr className="border-t border-border font-bold"><td className="py-2" colSpan={3}>가중 편차 합계</td><td>{valid ? percent(raw.deviation!) : '—'}</td></tr>
    </tbody></table></div>
    <p className="text-sm text-heading">{valid ? protectionText(result) : '유효한 관측을 기다리고 있습니다.'}</p>
    <p className="text-xs text-muted">이탈 집계: 편차 {percent(habit.enterDelta)} 이상 {habit.minDurationMs / 1000}초 지속, {percent(habit.exitDelta)} 이하 복귀. {valid ? ({ unknown: '미확인', 'near-reference': '진입 기준 아래', pending: '지속 시간 확인 중', away: '지속 이탈 확인' }[result.deviationState]) : '현재 보류'}</p>
    <p className="break-all text-xs text-muted">정책 {result.scorePolicyVersion}</p>
  </article>;
}

// 개발용 posture-browser 테스트 화면 전용. 실제 앱은 main의 PostureMetrics 구성을 따릅니다.
export default function ScoreExplanation({ snapshot, isRunning, paused = false }: { snapshot: MonitorSnapshot; isRunning: boolean; paused?: boolean }) {
  const delta = isRunning && !paused && snapshot.phase === 'observing' ? snapshot.delta : null;
  return <section aria-label="점수와 판정 근거" className="space-y-4 rounded-2xl border border-border bg-surface p-4">
    <h2 className="font-bold text-heading">점수와 판정 근거</h2>
    <p className="text-sm text-muted">개인 기준 대비 변화입니다. 어깨 °는 화면상 기준 대비 각도이고, %는 각도나 cm가 아닙니다. 함께 가까워지는 변화에는 원근 허용 범위를 두고, 어깨가 고정된 머리 전진에는 폭과 추정 깊이를 함께 참고합니다. 기본 측정에 골반은 필요하지 않습니다.</p>
    {delta && snapshot.evidence?.head && <div className="space-y-1 rounded-lg bg-surface-muted p-3 text-xs text-muted">
      <p>어깨 크기 변화 {percent(snapshot.evidence.head.shoulderScale - 1)} · 공통 확대 허용 {percent(snapshot.evidence.head.tolerance)} · 머리 폭 잔차 {percent(snapshot.evidence.head.width)} · 깊이 보조 {percent(snapshot.evidence.head.depth)}</p>
      <p>선택된 머리 신호: {snapshot.evidence.head.source === 'depth' ? '코·귀 추정 깊이의 합의' : '어깨 대비 귀 폭'} · 3표본 필터 전 값입니다.</p>
      <p>학습 모델: {!snapshot.evidence.modelEligible ? '이번 기준에서 보조 조건 미충족 · 기본 계산 사용'
        : snapshot.evidence.trunk.label ? ({ upright: '기준과 유사한 몸통', forward: '몸통 전방 기울임 확인', backward: '몸통 후방 기울임', lateral: '몸통 측면 기울임' }[snapshot.evidence.trunk.label])
          : snapshot.evidence.trunk.reason === 'confirming' ? '1초 연속 분류 확인 중' : '가림·구도·분류 불확실로 보조 보류'} · 현재 목 가중 편차 기여 {percent(delta.torsoForward * (turtleScorePolicy.weights.torsoForward ?? 0))}</p>
    </div>}
    {!delta && <p role="status" className="rounded-lg bg-surface-muted p-3 text-sm">{!isRunning ? '시작하고 기준을 수집하면 실제 측정 근거가 표시됩니다.' : paused ? '일시정지 중 · 현재 측정값 표시를 보류합니다.' : snapshot.reason ? reasons[snapshot.reason] : snapshot.message || '개인 기준과 유효한 관측을 기다리고 있습니다.'}</p>}
    <div className="grid gap-4 lg:grid-cols-2"><Part title="목" policy={turtleScorePolicy} result={snapshot.neck} delta={delta} /><Part title="어깨" policy={shoulderScorePolicy} result={snapshot.shoulder} delta={delta} /></div>
    <p className="text-xs text-muted">어깨 상하 항목에는 머리의 상하 움직임도 섞일 수 있습니다. 원점수에 움직임 보호·2초 유예·점진 감점·1초 복귀 확인을 적용한 것이 표시 점수입니다. 설정의 민감도는 지속 이탈 집계 기준을 바꿉니다.</p>
  </section>;
}
