import type { ReactNode } from 'react';
import type { TileChip } from './text';

/** One number card: label, big value with a small unit, then a comparison chip and/or a detail line. */
export default function StatTile({ label, value, unit, chip, detail }: {
  label: string; value: string; unit?: string; chip?: TileChip | null; detail?: ReactNode;
}) {
  const missing = value === '—';
  return (
    <section aria-label={label} className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-4">
      <h3 className="text-xs text-muted">{label}</h3>
      <p className="flex items-baseline gap-1">
        <span className="text-3xl font-extrabold text-heading">{value}</span>
        {unit && !missing && <span className="text-sm text-muted">{unit}</span>}
      </p>
      {chip && (
        <span className={`w-fit rounded-md px-1.5 py-0.5 text-xs font-semibold text-heading ${chip.tone === 'good' ? 'bg-mode-upper-soft' : 'bg-track'}`}>
          {chip.text}
        </span>
      )}
      {detail && <p className="text-xs text-muted">{detail}</p>}
    </section>
  );
}
