import { useSyncExternalStore } from 'react';
import Button from '../../components/Button';
import { recordingMessage, subscribeRecording, retryRecordings } from './recording';

export default function RecordingStatus({ errorsOnly = false }: { errorsOnly?: boolean }) {
  const message = useSyncExternalStore(subscribeRecording, recordingMessage, recordingMessage);
  const failed = message.startsWith('저장 실패');
  if (errorsOnly && !failed) return null;
  return <div aria-live="polite" className="text-sm text-muted">
    <p>{message}</p>
    {failed && <Button variant="outline" onClick={() => { void retryRecordings().catch(() => {}); }}>저장 재시도</Button>}
  </div>;
}
