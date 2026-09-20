import { useParams } from 'react-router-dom';
import { getLearningMode } from '../data/modes';
import KeyboardSession from '../features/keyboard/KeyboardSession';
import PostureSession from '../features/posture/PostureSession';
import EyeSession from '../features/eye/EyeSession';

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
