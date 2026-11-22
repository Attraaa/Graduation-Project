import EyeCalibrationGuide from '../eye/EyeCalibrationGuide';
import GuidanceBand from '../session/GuidanceBand';
import { useMonitoring } from '../session/monitoringContext';
import { upperGuidance } from './guidance';

/** 상체 카메라 화면 아래쪽 띠: 기준 자세 보정·깜빡임 보정·관찰 불가·오류 안내. 얼굴과 어깨를 가리지 않게 아래에만 둡니다. */
export default function CameraGuidance() {
  const { upper } = useMonitoring();
  const { controls, snapshot, eye } = upper;
  const active = controls.isRunning && !controls.isPaused;
  const lines = upperGuidance(snapshot, controls);
  if (active && eye.phase === 'error') lines.push({ tone: 'error', text: `깜빡임 분석: ${eye.message}` });
  const eyeGuide = active && eye.phase === 'calibrating' && !eye.measurement.calibrated;
  return <GuidanceBand label="상체 측정 안내" lines={lines}>
    {eyeGuide && <div className="bg-slate-950/80 px-3 py-2 font-semibold [&_p]:text-white"><EyeCalibrationGuide measurement={eye.measurement} /></div>}
  </GuidanceBand>;
}
