import type { EyeSensitivity } from './eyePolicy';
import type { EyeSnapshot } from './measurement';

export default function EyeCalibrationPanel({ sensitivity, locked, active, measurement, onSensitivityChange }: {
  sensitivity: EyeSensitivity; locked: boolean; active: boolean; measurement: EyeSnapshot;
  onSensitivityChange: (value: EyeSensitivity) => void;
}) {
  const eyes = measurement.calibrationPhase === 'eyes';
  return <div className="space-y-3 rounded-xl bg-surface-muted p-3">
    <label className="flex flex-wrap items-center gap-2 text-sm font-bold text-heading">
      깜빡임 민감도
      <select aria-label="깜빡임 민감도" value={sensitivity} disabled={locked}
        className="rounded-lg border border-border bg-surface px-3 py-2 text-heading disabled:opacity-60"
        onChange={event => onSensitivityChange(event.target.value as EyeSensitivity)}>
        <option value="low">낮음</option><option value="normal">보통</option><option value="high">높음</option>
      </select>
    </label>
    <p className="text-xs text-muted">높음은 약한 눈 감김도 더 쉽게 판정합니다. 윙크는 세지 않습니다. 민감도는 측정을 중지한 뒤 바꿀 수 있습니다.</p>
    {active && !measurement.calibrated && <div aria-live="polite">
      <p className="mb-2 text-sm text-heading">{eyes
        ? `정면을 유지하고 양쪽 눈을 자연스럽게 3번 깜빡여 주세요. 눈을 뜬 뒤 잠시 쉬세요. 확인 ${measurement.calibrationBlinks}/3회`
        : '양쪽 눈을 편안하게 뜨고 3초간 정면을 유지하세요. 머리카락이 눈을 가리지 않도록 해 주세요.'}</p>
      <progress className="w-full accent-primary" aria-label={eyes ? '개인 눈 기준 수집' : '안구 거리 기준 수집'}
        value={measurement.progress} max={1} />
      <p className="mt-1 text-xs text-muted">기준 수집 중 깜빡임은 측정 횟수와 유효 관찰 시간에 포함하지 않습니다. 인식이 어렵다면 조명과 카메라 구도를 조절해 주세요.</p>
    </div>}
  </div>;
}
