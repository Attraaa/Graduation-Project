import type { MonitorSnapshot } from './monitorTypes';
import type { EyeSnapshot } from '../eye/measurement';
import { estimatedCva, neckLoadPct } from './modes/turtle';
import { readBaseCva } from '../settings/preferences';
import ScoreDial from '../session/ScoreDial';
import RateGauge from '../session/RateGauge';

/**
 * 상체 열의 지금 값: 목 점수(아래에 같은 값에서 환산한 추정 CVA)·어깨 점수 다이얼과 깜빡임 빈도 반원 계기(시안 27).
 * 지금 값만 보여 주며(세션 평균은 통계) 점수 산식·임계값은 갖지 않습니다.
 */
export default function PostureMetrics({ snapshot, eye, isRunning, baseCva = readBaseCva() }: {
  snapshot: MonitorSnapshot; eye?: EyeSnapshot; isRunning: boolean; baseCva?: number;
}) {
  const score = (value: number | null) => isRunning ? value : null;
  const neck = score(snapshot.neck.currentScore);
  const rate = isRunning ? eye?.recentBlinksPerMinute ?? null : null;
  return <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.15fr)] items-start gap-2">
    <ScoreDial label="목 점수" value={neck} strokeClass="stroke-mode-upper"
      detail={{ label: '추정 CVA', value: neck === null ? null : `${Math.round(estimatedCva(baseCva, neckLoadPct(neck)))}°` }} />
    <ScoreDial label="어깨 점수" value={score(snapshot.shoulder.currentScore)} strokeClass="stroke-mode-shoulder" />
    <RateGauge label="깜빡임 빈도" value={rate} />
  </div>;
}
