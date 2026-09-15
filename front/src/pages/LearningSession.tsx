import { useParams } from 'react-router-dom';
import { getLearningMode } from '../data/modes';
import KeyboardSession from '../features/keyboard/KeyboardSession';
import PostureSession from '../features/posture/PostureSession';
import SessionFrame from '../features/session/SessionFrame';
import { useSessionControls } from '../features/session/useSessionControls';

function EyeSession() {
  const controls = useSessionControls();
  return (
    <SessionFrame modeId="eye" subtitle="안구 전용 분석은 준비 중입니다." controls={controls}>
      <div className="rounded-2xl border-2 border-border bg-surface p-5 text-muted">
        안구 전용 분석은 아직 연결되지 않았습니다.
      </div>
    </SessionFrame>
  );
}

export default function LearningSession() {
  const { modeId } = useParams();
  const mode = getLearningMode(modeId);
  // Changing mode discards the old camera session and its reference posture.
  if (mode.id === 'turtle' || mode.id === 'shoulder') {
    return <PostureSession key={mode.id} modeId={mode.id} />;
  }
  if (mode.id === 'keyboard') return <KeyboardSession key={mode.id} />;
  return <EyeSession />;
}
