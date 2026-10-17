import type { EyeSnapshot } from './measurement';

/** Guidance while the personal reference is collected. Blink sensitivity is chosen in Settings. */
export default function EyeCalibrationPanel({ active, measurement }: { active: boolean; measurement: EyeSnapshot }) {
  if (!active || measurement.calibrated) return null;
  const eyes = measurement.calibrationPhase === 'eyes';
  return <div aria-live="polite" className="rounded-xl bg-surface-muted p-3">
    <p className="mb-2 text-sm text-heading">{eyes
      ? `정면을 유지하고 양쪽 눈을 자연스럽게 3번 깜빡여 주세요. 눈을 뜬 뒤 잠시 쉬세요. 확인 ${measurement.calibrationBlinks}/3회`
      : '양쪽 눈을 편안하게 뜨고 3초간 정면을 유지하세요. 머리카락이 눈을 가리지 않도록 해 주세요.'}</p>
    <progress className="w-full accent-primary" aria-label={eyes ? '개인 눈 기준 수집' : '안구 거리 기준 수집'}
      value={measurement.progress} max={1} />
    <p className="mt-1 text-xs text-muted">기준 수집 중 깜빡임은 측정 횟수와 유효 관찰 시간에 포함하지 않습니다. 인식이 어렵다면 조명과 카메라 구도를 조절해 주세요.</p>
  </div>;
}
