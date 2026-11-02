/**
 * Bumped after a measurement's last batch reaches the server, so screens that show records load them again.
 * A session ends with up to three records (neck, shoulder, eye); saves within a moment become one reload.
 */
let revision = 0;
let pending: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

export function recordsChanged() {
  if (pending) return;
  pending = setTimeout(() => {
    pending = null;
    revision += 1;
    listeners.forEach(listener => listener());
  }, 300);
}
export const subscribeRecordsChanged = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const recordsRevision = () => revision;
