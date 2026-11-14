/** Windows can throttle RAF after minimization despite backgroundThrottling:false.
 * Native analysis uses cancellable timers; browser previews retain RAF.
 * Consumers still reject duplicate video frames and own their in-flight work.
 */
export function scheduleAnalysisFrame(callback: FrameRequestCallback): () => void {
  if (typeof window !== 'undefined' && window.motiDesktop) {
    const timer = setTimeout(() => callback(performance.now()), 30);
    return () => clearTimeout(timer);
  }
  const frame = requestAnimationFrame(callback);
  return () => cancelAnimationFrame(frame);
}
