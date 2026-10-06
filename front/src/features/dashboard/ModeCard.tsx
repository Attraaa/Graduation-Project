import type { ReactNode } from 'react';

export default function ModeCard({ title, subtitle, icon, iconClass, action, className = '', children }: {
  title: string; subtitle?: string; icon: ReactNode; iconClass: string; action: ReactNode; className?: string; children: ReactNode;
}) {
  return (
    <section aria-label={`${title} 모드`} className={`flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>{icon}</span>
          <h2 className="font-bold text-heading">{title}</h2>
          {subtitle && <span className="truncate text-xs text-muted">{subtitle}</span>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
