import { useParams } from 'react-router-dom';
import { getLearningMode } from '../data/modes';
import KeyboardSession from '../features/keyboard/KeyboardSession';
import PostureSession from '../features/posture/PostureSession';

export default function LearningSession() {
  const { modeId } = useParams();
  const mode = getLearningMode(modeId);
  // Legacy eye links open the combined upper-body view. Runtime lives in AppLayout.
  return mode.id === 'keyboard' ? <KeyboardSession /> : <PostureSession />;
}
