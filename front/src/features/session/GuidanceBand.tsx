import { useSyncExternalStore, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { notificationDeliveryMessage, subscribeNotificationDelivery } from '../notifications/delivery';

export interface GuidanceLine {
  text: string;
  tone: 'info' | 'warn' | 'error';
  /** 남은 초(숫자) 또는 경고 표시. */
  badge?: number | 'alert';
  progress?: number;
}
const TONE = { info: 'bg-slate-950/80 text-white', warn: 'bg-amber-500/90 text-slate-950', error: 'bg-danger/90 text-white' };

/**
 * 카메라 화면 아래쪽 안내 띠(상체·키보드 카드 공통). 회색 안내 칸 대신 미리보기 안에 겹쳐 그리며,
 * 알릴 것이 없으면 아무것도 그리지 않아 화면을 가리지 않습니다. Windows 알림 전송 실패 안내도 여기 붙습니다.
 */
export default function GuidanceBand({ label, lines, children }: { label: string; lines: GuidanceLine[]; children?: ReactNode }) {
  const delivery = useSyncExternalStore(subscribeNotificationDelivery, notificationDeliveryMessage, notificationDeliveryMessage);
  const shown = delivery ? [...lines, { tone: 'warn' as const, text: delivery }] : lines;
  if (!shown.length && !children) return null;
  return <div role="status" aria-live="polite" aria-label={label} className="absolute inset-x-0 bottom-0 overflow-hidden">
    {shown.map(line => <div key={line.text}>
      <div role={line.tone === 'error' ? 'alert' : undefined} className={`flex items-center gap-3 px-3 py-2 ${TONE[line.tone]}`}>
        {line.badge !== undefined && <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-base font-black tabular-nums ${line.tone === 'warn' ? 'border-slate-950/60' : 'border-white/80'}`}>
          {line.badge === 'alert' ? <AlertTriangle size={15} /> : line.badge}</span>}
        <p className="min-w-0 text-xs font-semibold leading-4">{line.text}</p>
      </div>
      {line.progress !== undefined && <div className="h-1 bg-white/25"><div className="h-full bg-mode-upper" style={{ width: `${Math.round(line.progress * 100)}%` }} /></div>}
    </div>)}
    {children}
  </div>;
}
