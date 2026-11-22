import { useSyncExternalStore } from 'react';
import { AlertTriangle } from 'lucide-react';
import EyeCalibrationGuide from '../eye/EyeCalibrationGuide';
import { notificationDeliveryMessage, subscribeNotificationDelivery } from '../notifications/delivery';
import { useMonitoring } from '../session/monitoringContext';
import { upperGuidance } from './guidance';

const TONE = { info: 'bg-slate-950/80 text-white', warn: 'bg-amber-500/90 text-slate-950', error: 'bg-danger/90 text-white' };

/** 상체 카메라 화면 아래쪽 띠: 기준 자세 보정·깜빡임 보정·관찰 불가·오류 안내. 얼굴과 어깨를 가리지 않게 아래에만 둡니다. */
export default function CameraGuidance() {
  const delivery = useSyncExternalStore(subscribeNotificationDelivery, notificationDeliveryMessage, notificationDeliveryMessage);
  const { upper } = useMonitoring();
  const { controls, snapshot, eye } = upper;
  const active = controls.isRunning && !controls.isPaused;
  const lines = upperGuidance(snapshot, controls);
  if (active && eye.phase === 'error') lines.push({ tone: 'error', text: `깜빡임 분석: ${eye.message}` });
  if (delivery) lines.push({ tone: 'warn', text: delivery });
  const eyeGuide = active && eye.phase === 'calibrating' && !eye.measurement.calibrated;
  if (!lines.length && !eyeGuide) return null;
  return <div role="status" aria-live="polite" aria-label="상체 측정 안내" className="absolute inset-x-0 bottom-0 overflow-hidden">
    {lines.map(line => <div key={line.text}>
      <div role={line.tone === 'error' ? 'alert' : undefined} className={`flex items-center gap-3 px-3 py-2 ${TONE[line.tone]}`}>
        {line.badge !== undefined && <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-base font-black tabular-nums ${line.tone === 'warn' ? 'border-slate-950/60' : 'border-white/80'}`}>
          {line.badge === 'alert' ? <AlertTriangle size={15} /> : line.badge}</span>}
        <p className="min-w-0 text-xs font-semibold leading-4">{line.text}</p>
      </div>
      {line.progress !== undefined && <div className="h-1 bg-white/25"><div className="h-full bg-mode-upper" style={{ width: `${Math.round(line.progress * 100)}%` }} /></div>}
    </div>)}
    {eyeGuide && <div className="bg-slate-950/80 px-3 py-2 font-semibold [&_p]:text-white"><EyeCalibrationGuide measurement={eye.measurement} /></div>}
  </div>;
}
