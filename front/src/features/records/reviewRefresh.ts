let revision = 0;
const listeners = new Set<() => void>();
export function localReviewSaved() { revision++; listeners.forEach(listener => listener()); }
export const localReviewRevision = () => revision;
export const subscribeLocalReview = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
