let message = '';
const listeners = new Set<() => void>();
export const notificationDeliveryMessage = () => message;
export const subscribeNotificationDelivery = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function reportNotificationDelivery(ok: boolean) {
  const next = ok ? '' : 'Windows 알림 전송을 확인하지 못했습니다. 알림 설정과 방해 금지를 확인해 주세요.';
  if (next === message) return;
  message = next; listeners.forEach(listener => listener());
}
