import type { IpcMain, IpcMainInvokeEvent, Notification } from 'electron';
import { notificationContent, notificationTarget } from '../src/features/notifications/contract.ts';
import type { SystemNotificationRequest, SystemNotificationResult } from '../src/features/notifications/contract.ts';

type Dependencies = {
  trusted: (event: IpcMainInvokeEvent) => void;
  supported: () => boolean;
  create: (options: ReturnType<typeof notificationContent>) => Pick<Notification, 'once' | 'show' | 'close'>;
  focus: (target: string | null) => void;
  allowed?: () => boolean;
};

export function registerNotificationHandlers(ipc: Pick<IpcMain, 'handle'>, deps: Dependencies) {
  type Kind = SystemNotificationRequest['kind'];
  const current = new Map<string, ReturnType<Dependencies['create']>>();
  const pending = new Map<string, () => void>();
  const lastRequestAt = new Map<string, number>();
  const clearKey = (key: string) => { pending.get(key)?.(); pending.delete(key); current.get(key)?.close(); current.delete(key); };
  const clear = (kind?: Kind) => {
    for (const key of new Set([...current.keys(), ...pending.keys()])) if (!kind || key === kind || key.startsWith(`${kind}:`)) clearKey(key);
  };
  ipc.handle('notifications:clear', (event, kind: unknown) => {
    deps.trusted(event);
    if (kind !== undefined && kind !== 'test' && kind !== 'posture' && kind !== 'keyboard' && kind !== 'blink' && kind !== 'issue') throw Error('잘못된 알림 정리 요청입니다.');
    clear(kind);
  });
  ipc.handle('notifications:show', async (event, input: unknown): Promise<SystemNotificationResult> => {
    deps.trusted(event);
    const options = notificationContent(input);
    const request = input as SystemNotificationRequest;
    const kind = request.kind;
    const key = kind === 'issue' ? `issue:${request.code}` : kind;
    if (kind !== 'test' && deps.allowed && !deps.allowed()) return { ok: false, status: 'suppressed', message: '현재 화면에서 상태를 확인할 수 있어 알림을 생략했습니다.' };
    if (!deps.supported()) return { ok: false, message: '이 실행 환경에서는 Windows 시스템 알림을 지원하지 않습니다.' };
    if (Date.now() - (lastRequestAt.get(key) ?? -Infinity) < 1000) return { ok: false, status: 'failed', message: '잠시 후 알림을 다시 시도해 주세요.' };
    lastRequestAt.set(key, Date.now());
    clearKey(key);
    if (kind !== 'test') clear('test');
    if (kind === 'issue') { clear('posture'); clear('keyboard'); clear('blink'); }
    return new Promise(resolve => {
      let settled = false;
      const finish = (ok: boolean, message: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        pending.delete(key);
        resolve({ ok, status: ok ? 'shown' : 'failed', message });
      };
      const timer = setTimeout(() => finish(false, '알림 표시를 확인하지 못했습니다. Windows 알림 설정과 방해 금지를 확인해 주세요.'), 5000);
      pending.set(key, () => finish(false, '알림 요청이 취소되었습니다.'));
      try {
        const notification = deps.create(options);
        current.set(key, notification);
        notification.once('show', () => finish(true, 'Windows에 알림을 보냈습니다.'));
        notification.once('failed', () => finish(false, 'Windows 알림을 표시하지 못했습니다. Windows 알림 설정을 확인해 주세요.'));
        notification.once('click', () => { if (current.get(key) === notification) deps.focus(notificationTarget(request)); });
        notification.show();
      } catch {
        finish(false, 'Windows 알림을 표시하지 못했습니다. Windows 알림 설정을 확인해 주세요.');
      }
    });
  });
  return Object.assign(clear, { automatic: () => { clear('posture'); clear('keyboard'); clear('blink'); clear('issue'); } });
}
