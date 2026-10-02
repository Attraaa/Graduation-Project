// Legacy Pose and Tasks Vision both use window.Module while loading WASM.
// Serialize initialization across modes, including requests finishing after stop.
let pending: Promise<unknown> = Promise.resolve();

export function initializeMediaPipe<T>(initialize: () => Promise<T>, tasksVision = false): Promise<T> {
  const operation = pending.then(async () => {
    const scope = globalThis as typeof globalThis & { Module?: unknown; ModuleFactory?: unknown };
    if (tasksVision) {
      // Do not pass the already initialized Pose module into the Tasks factory.
      scope.Module = undefined;
      scope.ModuleFactory = undefined;
    }
    try {
      return await initialize();
    } finally {
      if (tasksVision) {
        scope.Module = undefined;
        scope.ModuleFactory = undefined;
      }
    }
  });
  pending = operation.catch(() => undefined);
  return operation;
}
