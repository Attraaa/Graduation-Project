import type { ReactNode } from 'react';

export const INPUT = 'h-10 w-full rounded-xl border border-border bg-surface-muted px-3 text-sm text-heading placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/40';
const BUTTON_BASE = 'inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold transition disabled:cursor-default disabled:opacity-40';
export const BUTTON = `${BUTTON_BASE} border border-border bg-surface text-heading hover:bg-nav-active`;
export const BUTTON_STRONG = `${BUTTON_BASE} bg-heading text-surface hover:opacity-90`;
export const BUTTON_DANGER = `${BUTTON_BASE} bg-danger text-white hover:brightness-95`;
// Written out in full: Tailwind only generates classes it can read as plain text.
const RANGE = 'block h-2 w-full cursor-pointer appearance-none rounded-full'
  + ' [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none'
  + ' [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-mode-upper'
  + ' [&::-webkit-slider-thumb]:bg-[#fff] [&::-webkit-slider-thumb]:shadow'
  + ' [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full'
  + ' [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-mode-upper [&::-moz-range-thumb]:bg-[#fff] [&::-moz-range-thumb]:shadow';

/** One settings widget, same anatomy as a dashboard mode card: icon chip, title, optional note, then content. */
export function SettingsCard({ title, note, icon, iconClass = 'bg-track text-heading', className = '', children }: {
  title: string; note?: string; icon: ReactNode; iconClass?: string; className?: string; children: ReactNode;
}) {
  return (
    <section aria-label={title} className={`flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 ${className}`}>
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>{icon}</span>
        <h2 className="font-bold text-heading">{title}</h2>
        {note && <span className="ml-auto text-xs text-muted">{note}</span>}
      </div>
      {children}
    </section>
  );
}

/** A small caption above its control. Pass `htmlFor` when the control is a single input. */
export function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      {htmlFor
        ? <label htmlFor={htmlFor} className="block text-xs font-semibold text-muted">{label}</label>
        : <p className="text-xs font-semibold text-muted">{label}</p>}
      {children}
    </div>
  );
}

/** Same look as the period and calendar switches on the statistics and history screens, stretched to the card width. */
export function Segmented<T extends string>({ label, options, value, onChange }: {
  label: string; options: readonly { id: T; name: string }[]; value: T; onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="grid auto-cols-fr grid-flow-col rounded-xl bg-track p-1">
      {options.map(option => (
        <button key={option.id} type="button" aria-pressed={value === option.id} onClick={() => onChange(option.id)}
          className={`rounded-lg py-1.5 text-sm font-semibold transition ${value === option.id ? 'bg-surface text-heading shadow-sm' : 'text-muted hover:text-heading'}`}>
          {option.name}
        </button>
      ))}
    </div>
  );
}

export function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={`flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors ${checked ? 'bg-primary' : 'bg-border-strong'}`}>
      <span aria-hidden="true" className={`h-6 w-6 rounded-full bg-[#fff] shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  );
}

/** A range with its value chip and end labels. The filled part follows the 20px thumb's centre. */
export function Slider({ id, label, valueText, min, max, minLabel, maxLabel, value, onChange }: {
  id: string; label: string; valueText: string; min: number; max: number; minLabel: string; maxLabel: string;
  value: number; onChange: (value: number) => void;
}) {
  const ratio = (value - min) / (max - min);
  const stop = `calc(${ratio * 100}% + ${(0.5 - ratio) * 20}px)`;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-semibold text-heading">{label}</label>
        <output htmlFor={id} className="rounded-md bg-mode-upper-soft px-1.5 py-0.5 text-xs font-semibold tabular-nums text-heading">{valueText}</output>
      </div>
      <input id={id} type="range" min={min} max={max} value={value} onChange={event => onChange(Number(event.target.value))}
        style={{ background: `linear-gradient(to right, var(--color-mode-upper) ${stop}, var(--color-track) ${stop})` }}
        className={RANGE} />
      <div className="flex justify-between text-xs text-muted"><span>{minLabel}</span><span>{maxLabel}</span></div>
    </div>
  );
}
