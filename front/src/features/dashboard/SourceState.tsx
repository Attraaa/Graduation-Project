export type SourceStatus = 'loading' | 'error' | 'ready';

export function SourceLoading({ className = 'h-16' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-xl bg-track ${className}`} />;
}

export function SourceError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-muted">
      <span>기록을 불러오지 못했어요</span>
      <button type="button" onClick={onRetry}
        className="rounded-lg border border-border px-2 py-1 font-semibold text-heading hover:bg-nav-active">
        다시 시도
      </button>
    </div>
  );
}
