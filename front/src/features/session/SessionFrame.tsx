import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Settings2 } from 'lucide-react';
import { getLearningMode } from '../../data/modes';
import type { CameraContextValue } from '../camera/context';

interface SessionFrameProps {
  modeId: string;
  subtitle: string;
  children: ReactNode;
  camera: CameraContextValue;
  actions?: ReactNode;
}

export default function SessionFrame({ modeId, subtitle, children, camera, actions }: SessionFrameProps) {
  const navigate = useNavigate();
  const mode = getLearningMode(modeId);
  const content = <div className="flex min-h-full flex-col gap-4 pb-4">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button onClick={() => navigate('/dashboard')} className="mb-3 flex items-center gap-1 text-sm font-bold text-muted">
            <ArrowLeft size={17} /> 대시보드
          </button>
          <h1 className="text-2xl font-black text-heading">{mode.title}</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={camera.open} className="flex min-h-10 items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-bold text-heading"><Settings2 size={17} />카메라 설정</button>{actions}</div>
      </header>
      {children}
    </div>;
  return content;
}
