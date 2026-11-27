import { useEffect, useRef, type ReactNode } from 'react';
import { CameraOff, Pause } from 'lucide-react';
import { useMonitoring } from './monitoringContext';
import type { MonitoringMode } from './modes';

/** Copies the existing transformed frame/overlay. Navigation never requests a camera. children draw over the frame (guidance). */
export default function MonitoringPreview({ modeId, fitHeight = false, children }: { modeId: MonitoringMode; fitHeight?: boolean; children?: ReactNode }) {
  const all = useMonitoring();
  const session = modeId === 'upper_body' ? all.upper : all.keyboard;
  const { runtime } = session.camera;
  const { isRunning, isPaused } = session.controls;
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let frame = 0, last = 0;
    const draw = (now: number) => {
      const target = canvas.current, source = runtime.current.canvas;
      if (target && now - last >= 33) {
        const context = target.getContext('2d');
        if (source?.width && source.height) {
          if (target.width !== source.width || target.height !== source.height) { target.width = source.width; target.height = source.height; }
          context?.drawImage(source, 0, 0);
          const overlay = runtime.current.overlay;
          if (overlay?.width) context?.drawImage(overlay, 0, 0, target.width, target.height);
        } else context?.clearRect(0, 0, target.width, target.height);
        last = now;
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [runtime]);
  return <div className={`relative aspect-video min-h-0 w-full overflow-hidden bg-slate-950 ${fitHeight ? 'md:aspect-auto' : ''}`}>
    <canvas ref={canvas} aria-label={`${modeId === 'upper_body' ? '상체' : '키보드'} 카메라 미리보기`} className="absolute inset-0 h-full w-full object-contain" />
    {!isRunning && <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center text-sm text-slate-300"><CameraOff size={28} /><span>시작하면 카메라가 켜집니다</span></div>}
    {isRunning && isPaused && <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/60 text-sm font-bold text-white"><Pause size={24} />일시정지 · 마지막 화면</div>}
    {children}
  </div>;
}
