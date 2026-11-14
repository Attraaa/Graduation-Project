import EyeCalibrationGuide from '../eye/EyeCalibrationGuide';
import { useSyncExternalStore } from 'react';
import { notificationDeliveryMessage, subscribeNotificationDelivery } from '../notifications/delivery';
import { useMonitoring, type MonitoringMode } from './monitoringContext';

const protection = { none: '', moving: '움직임 감지 · 점수 유지', grace: '자세 변화 유예 · 점수 유지', recovering: '기준 자세 복귀 확인' };

/** Reserve the same space for preparation, calibration, observation and errors. */
export default function MonitoringNotice({ modeId }: { modeId: MonitoringMode }) {
  const deliveryMessage = useSyncExternalStore(subscribeNotificationDelivery, notificationDeliveryMessage, notificationDeliveryMessage);
  const { upper, keyboard } = useMonitoring();
  const session = modeId === 'upper_body' ? upper : keyboard;
  const { isRunning, isPaused } = session.controls;
  let content;
  if (!isRunning) content = session.controls.failed
    ? <p role="alert" className="text-danger">{modeId === 'keyboard' ? keyboard.snapshot.message || '키보드 분석 연결을 확인해 주세요.' : '카메라·분석 연결을 확인한 뒤 다시 시작해 주세요.'}</p>
    : <p>시작하면 카메라와 분석을 준비합니다.</p>;
  else if (isPaused) content = <p>일시정지 중입니다. 재개하면 같은 기준으로 관찰을 이어갑니다.</p>;
  else if (modeId === 'keyboard') content = <p role={keyboard.snapshot.phase === 'error' ? 'alert' : undefined} className={keyboard.snapshot.phase === 'error' ? 'text-danger' : undefined}>{keyboard.snapshot.message || '손과 키보드가 보이도록 카메라를 맞춰 주세요.'}</p>;
  else {
    const { snapshot, eye } = upper;
    content = <>
      {snapshot.phase === 'loading' && <p>카메라와 상체 분석을 준비하고 있습니다.</p>}
      {snapshot.phase === 'calibrating' && <div className="space-y-1"><p>얼굴과 양쪽 어깨가 보이도록 정면을 보고 기준 자세를 잠시 유지해 주세요.</p><progress aria-label="기준 자세 수집 진행률" value={snapshot.progress} max={1} className="block h-1.5 w-full accent-primary" /></div>}
      {snapshot.phase === 'unavailable' && <p>얼굴과 양쪽 어깨가 화면에 보이도록 정면을 향해 주세요.</p>}
      {snapshot.phase === 'error' && <p role="alert" className="text-danger">카메라·분석 연결을 확인한 뒤 중지하고 다시 시작해 주세요.</p>}
      {eye.phase === 'error' && <p role="alert" className="text-danger">깜빡임 분석: {eye.message}</p>}
      {eye.phase === 'calibrating' && <EyeCalibrationGuide measurement={eye.measurement} />}
      {snapshot.phase === 'observing' && <p>{(['목', '어깨'] as const).map((name, index) => {
        const result = index === 0 ? snapshot.neck : snapshot.shoulder;
        return result.protection === 'none' ? null : <span key={name} className="block">{name}: {protection[result.protection]}</span>;
      })}{snapshot.neck.protection === 'none' && snapshot.shoulder.protection === 'none' && '기준 대비 자세와 깜빡임을 관찰하고 있습니다.'}</p>}
    </>;
  }
  return <div role="region" tabIndex={0} aria-label={`${modeId === 'upper_body' ? '상체' : '키보드'} 측정 안내`} aria-live="polite" className="h-28 overflow-y-auto rounded-xl bg-surface-muted p-2 text-xs leading-4 text-muted [scrollbar-gutter:stable]">
    <div className="space-y-2">{content}{deliveryMessage && <p>{deliveryMessage}</p>}</div>
  </div>;
}
