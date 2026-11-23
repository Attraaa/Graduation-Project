import type { MonitorSnapshot } from './monitorTypes';
import type { EyeSnapshot } from '../eye/measurement';
import { estimatedCva } from './modes/turtle';
import { readBaseCva } from '../settings/preferences';
import Tile from '../session/MetricTile';

/** 목 점수·추정 CVA·어깨 점수·깜빡임 빈도의 지금 값만 보여 줍니다(세션 평균은 통계). 점수 산식·임계값은 갖지 않습니다. */
export default function PostureMetrics({ snapshot, eye, isRunning, baseCva = readBaseCva() }: {
  snapshot: MonitorSnapshot; eye?: EyeSnapshot; isRunning: boolean; baseCva?: number;
}) {
  const score = (value: number | null) => isRunning && value !== null ? String(Math.round(value)) : null;
  const drop = isRunning ? snapshot.neckModel.angleDropDeg : null;
  const rate = isRunning ? eye?.recentBlinksPerMinute ?? null : null;
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
    <Tile label="목 점수" value={score(snapshot.neck.currentScore)} unit="점" />
    <Tile label="추정 CVA" value={drop === null ? null : `${Math.round(estimatedCva(baseCva, drop))}°`} />
    <Tile label="어깨 점수" value={score(snapshot.shoulder.currentScore)} unit="점" />
    <Tile label="깜빡임 빈도" value={rate === null ? null : rate.toFixed(1)} unit="회/분" />
  </div>;
}
