import { useSyncExternalStore } from 'react';
import { notificationDeliveryMessage, subscribeNotificationDelivery } from '../notifications/delivery';
import { useMonitoring } from './monitoringContext';

/** The keyboard card's fixed-height notice region (the upper card shows its guidance inside the camera view). */
export default function MonitoringNotice() {
  const deliveryMessage = useSyncExternalStore(subscribeNotificationDelivery, notificationDeliveryMessage, notificationDeliveryMessage);
  const { keyboard } = useMonitoring();
  const { isRunning, isPaused, failed } = keyboard.controls;
  const error = keyboard.snapshot.phase === 'error';
  const content = !isRunning ? (failed
    ? <p role="alert" className="text-danger">{keyboard.snapshot.message || '키보드 분석 연결을 확인해 주세요.'}</p>
    : <p>시작하면 카메라와 분석을 준비합니다.</p>)
    : isPaused ? <p>일시정지 중입니다. 재개하면 같은 기준으로 관찰을 이어갑니다.</p>
      : <p role={error ? 'alert' : undefined} className={error ? 'text-danger' : undefined}>{keyboard.snapshot.message || '손과 키보드가 보이도록 카메라를 맞춰 주세요.'}</p>;
  return <div role="region" tabIndex={0} aria-label="키보드 측정 안내" aria-live="polite" className="h-28 overflow-y-auto rounded-xl bg-surface-muted p-2 text-xs leading-4 text-muted [scrollbar-gutter:stable]">
    <div className="space-y-2">{content}{deliveryMessage && <p>{deliveryMessage}</p>}</div>
  </div>;
}
