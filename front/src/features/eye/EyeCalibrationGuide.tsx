import type { EyeSnapshot } from './measurement';

export default function EyeCalibrationGuide({ measurement }: { measurement: EyeSnapshot }) {
  if (measurement.calibrated) return null;
  const eyes = measurement.calibrationPhase === 'eyes';
  return <div aria-live="polite" className="space-y-1 text-xs text-muted">
    <p>{eyes
      ? `깜빡임 보정 · 정면을 보고 양쪽 눈을 3번 깜빡여 주세요. 확인 ${measurement.calibrationBlinks}/3회`
      : '깜빡임 보정 · 양쪽 눈을 편안하게 뜨고 3초간 정면을 유지해 주세요.'}</p>
    <progress className="h-1.5 w-full accent-primary" aria-label={eyes ? '개인 눈 기준 수집' : '안구 거리 기준 수집'} value={measurement.progress} max={1} />
  </div>;
}
