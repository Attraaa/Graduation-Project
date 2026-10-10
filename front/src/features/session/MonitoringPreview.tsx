import { useEffect, useRef, useState } from 'react';
import { CameraOff, Pause } from 'lucide-react';
import { useMonitoring, type MonitoringMode } from './monitoringContext';

/** Copies the existing transformed frame/overlay. Navigation never requests a camera. */
export default function MonitoringPreview({ modeId }: { modeId: MonitoringMode }) {
  const all = useMonitoring();
  const session = modeId === 'upper_body' ? all.upper : all.keyboard;
  const { runtime } = session.camera;
  const { isRunning, isPaused } = session.controls;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ratio, setRatio] = useState(16 / 9);
  useEffect(() => {
    let frame = 0, last = 0;
    const draw = (now: number) => {
      const target = canvas.current, source = runtime.current.canvas;
      if (target && now - last >= 33) {
        const context = target.getContext('2d');
        if (source?.width && source.height) {
          if (target.width !== source.width || target.height !== source.height) { target.width = source.width; target.height = source.height; setRatio(source.width / source.height); }
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
  return <div className="relative w-full overflow-hidden rounded-xl bg-slate-950" style={{ aspectRatio: ratio }}>
    <canvas ref={canvas} aria-label={`${modeId === 'upper_body' ? '상체' : '키보드'} 카메라 미리보기`} className="absolute inset-0 h-full w-full object-contain" />
    {!isRunning && <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center text-sm text-slate-300"><CameraOff size={28} /><span>시작하면 카메라가 켜집니다</span></div>}
    {isRunning && isPaused && <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/60 text-sm font-bold text-white"><Pause size={24} />일시정지 · 마지막 화면</div>}
  </div>;
}
