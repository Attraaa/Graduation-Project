import { isCurrentSession, type Session } from '../../utils/apiClient';

const pending = new Set<Session>();
const listeners = new Set<() => void>();
const changed = () => listeners.forEach(listener => listener());

export const recordingDeletionPending = () => [...pending].some(isCurrentSession);
export function subscribeRecordingDeletion(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function lockRecordingDeletion(session: Session) {
  if (recordingDeletionPending()) throw new Error('이미 기록을 삭제하고 있어요.');
  pending.add(session);
  changed();
  return () => { pending.delete(session); changed(); };
}
