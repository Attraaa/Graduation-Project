import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Settings2 } from 'lucide-react';
import { getLearningMode } from '../../data/modes';
import type { CameraContextValue } from '../camera/context';
import './session.css';

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
  const content = <div className="learning-session">
      <button type="button" onClick={() => navigate('/dashboard')} className="session-back"><ArrowLeft size={15} /> 대시보드</button>
      <header className="session-heading">
        <div className="session-title">
          <span className={`session-mode-icon ${modeId === 'keyboard' ? 'bg-mode-keyboard-soft text-mode-keyboard' : 'bg-mode-upper-soft text-mode-upper'}`}>{mode.icon}</span>
          <div><h1>{mode.title}</h1><p>{subtitle}</p></div>
        </div>
        <div className="session-tools"><button type="button" onClick={camera.open} className="session-tool"><Settings2 size={15} />카메라 설정</button>{actions}</div>
      </header>
      {children}
    </div>;
  return content;
}
