import type { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function TrendSelection({ label, options, value, onChange, date, children }: {
  label: string; options: { value: string; label: string }[]; value: string;
  onChange: (value: string) => void; date: string; children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3 text-sm">
      <label className="flex flex-wrap items-center gap-2 font-semibold text-heading">
        {label}
        <select value={value} onChange={event => onChange(event.target.value)}
          className="max-w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-heading">
          {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <div role="status" className="order-last flex min-w-0 basis-full flex-wrap gap-x-4 gap-y-1 text-muted lg:order-none lg:basis-auto lg:grow">{children}</div>
      <Link to={`/history?date=${date}`} state={{ focusHistoryDate: true }}
        className="inline-flex shrink-0 items-center gap-1 font-semibold text-secondary-text hover:underline">
        학습이력 보기 <ArrowUpRight size={15} aria-hidden="true" />
      </Link>
    </div>
  );
}
