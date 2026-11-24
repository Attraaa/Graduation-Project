import { useEffect, useRef } from 'react';
import { useMonitoring } from '../session/monitoringContext';

type Memory = { usedJSHeapSize: number; jsHeapSizeLimit: number };
type Session = { controls: { isRunning: boolean; isPaused: boolean; elapsedSeconds: number }; snapshot: { phase: string } };
const mode = (s: Session) => ({ running: s.controls.isRunning, paused: s.controls.isPaused, phase: s.snapshot.phase, seconds: s.controls.elapsedSeconds });

/**
 * 본창이 1분마다 메모리와 두 측정의 상태(실행·일시정지·단계·시간)를 진단 기록으로 보내고, 처리되지 않은 오류도 보냅니다
 * (electron/diagnostics.ts). 영상·랜드마크·점수는 보내지 않습니다. 브라우저 모드에는 통로가 없어 아무것도 하지 않습니다.
 */
export default function DiagnosticsReporter() {
  const { upper, keyboard } = useMonitoring();
  const latest = useRef({ upper, keyboard });
  useEffect(() => { latest.current = { upper, keyboard }; });
  useEffect(() => {
    const bridge = window.motiDiagnostics;
    if (!bridge) return;
    const timer = window.setInterval(() => {
      const memory = (performance as Performance & { memory?: Memory }).memory;
      bridge.sample({ heapUsedMB: memory ? memory.usedJSHeapSize / 1048576 : null, heapLimitMB: memory ? memory.jsHeapSizeLimit / 1048576 : null,
        route: location.hash, visible: document.visibilityState === 'visible', upper: mode(latest.current.upper), keyboard: mode(latest.current.keyboard) });
    }, 60_000);
    const onError = (event: ErrorEvent) => bridge.error({ kind: 'error', message: event.message, source: event.filename, line: event.lineno,
      stack: event.error instanceof Error ? event.error.stack : undefined });
    const onRejection = (event: PromiseRejectionEvent) => bridge.error({ kind: 'rejection',
      message: event.reason instanceof Error ? event.reason.message : String(event.reason), stack: event.reason instanceof Error ? event.reason.stack : undefined });
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => { window.clearInterval(timer); window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onRejection); };
  }, []);
  return null;
}
