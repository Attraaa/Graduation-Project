import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { getLearningMode } from '../../data/modes';
import type { useSessionControls } from './useSessionControls';

interface SessionFrameProps {
  modeId: string;
  subtitle: string;
  controls: ReturnType<typeof useSessionControls>;
  children: ReactNode;
}

export default function SessionFrame({ modeId, subtitle, controls, children }: SessionFrameProps) {
  const navigate = useNavigate();
  const mode = getLearningMode(modeId);
  const { isRunning, deviceId, devices, setDeviceId } = controls;
  return (
    <div className="flex min-h-full flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button onClick={() => navigate('/dashboard')} className="mb-3 flex items-center gap-1 text-sm font-bold text-muted">
            <ArrowLeft size={17} /> 대시보드
          </button>
          <h1 className="text-2xl font-black text-heading">{mode.title}</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        </div>
        <label className="flex flex-col gap-1 text-sm font-bold text-muted">
          사용할 카메라
          <select value={deviceId} disabled={isRunning} onChange={event => setDeviceId(event.target.value)}
            className="max-w-64 rounded-xl border-2 border-border bg-surface p-2 text-heading disabled:opacity-60">
            <option value="">기본 카메라</option>
            {devices.filter(device => device.deviceId).map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>{device.label || '카메라 ' + (index + 1)}</option>
            ))}
          </select>
        </label>
      </header>
      {children}
    </div>
  );
}
