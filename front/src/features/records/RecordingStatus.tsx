import { useSyncExternalStore } from 'react';
import Button from '../../components/Button';
import { recordingMessage, subscribeRecording, retryRecordings } from './recording';

export default function RecordingStatus() {
  const message = useSyncExternalStore(subscribeRecording, recordingMessage, recordingMessage);
  return <div aria-live="polite" className="text-sm text-muted">
    <p>{message}</p>
    {message.startsWith('저장 실패') && <Button variant="outline" onClick={() => { void retryRecordings().catch(() => {}); }}>저장 재시도</Button>}
  </div>;
}
