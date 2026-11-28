import type { ReactNode } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import ModalFrame from '../../components/dialog/ModalFrame';

export const INPUT = 'h-10 w-full rounded-xl border border-border bg-surface-muted px-3 text-sm text-heading placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/40';
const BUTTON_BASE = 'inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold transition disabled:cursor-default disabled:opacity-40';
export const BUTTON = `${BUTTON_BASE} border border-border bg-surface text-heading hover:bg-nav-active`;
export const BUTTON_STRONG = `${BUTTON_BASE} bg-heading text-surface hover:opacity-90`;
export const BUTTON_DANGER = `${BUTTON_BASE} bg-button-danger text-white hover:brightness-95`;

/** One settings widget with an icon, title, and content. */
export function SettingsCard({ title, icon, iconClass = 'bg-track text-heading', className = '', children }: {
  title: string; icon: ReactNode; iconClass?: string; className?: string; children: ReactNode;
}) {
  return (
    <section aria-label={title} className={`flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 ${className}`}>
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>{icon}</span>
        <h2 className="font-bold text-heading">{title}</h2>
      </div>
      {children}
    </section>
  );
}

/**
 * A form window over the settings page, in the same frame as the app dialog. Escape or the close button cancels.
 * It sits below the dialog layer, so close it before showing a notice.
 */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
      <ModalFrame aria-label={title} onDismiss={onClose} className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-extrabold text-heading">{title}</h2>
          <button type="button" onClick={onClose} aria-label="닫기"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-nav-active hover:text-heading">
            <X size={20} />
          </button>
        </div>
        {children}
      </ModalFrame>
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

/** − value +: moves to the next of `steps` below or above the value (a value between steps moves to the nearest one). */
export function Stepper({ label, value, steps, unit, onChange }: {
  label: string; value: number; steps: readonly number[]; unit: string; onChange: (value: number) => void;
}) {
  const lower = steps.filter(step => step < value).at(-1);
  const higher = steps.find(step => step > value);
  const button = 'flex h-full w-8 items-center justify-center text-muted transition hover:text-heading disabled:cursor-default disabled:opacity-30';
  return (
    <div role="group" aria-label={label} className="inline-flex h-9 shrink-0 items-center rounded-xl border border-border bg-surface-muted">
      <button type="button" aria-label={`${label} 낮추기`} disabled={lower === undefined} onClick={() => { if (lower !== undefined) onChange(lower); }}
        className={`${button} rounded-l-xl`}><Minus size={14} /></button>
      <output aria-live="polite" className="min-w-11 text-center text-sm font-bold tabular-nums text-heading">{value}{unit}</output>
      <button type="button" aria-label={`${label} 높이기`} disabled={higher === undefined} onClick={() => { if (higher !== undefined) onChange(higher); }}
        className={`${button} rounded-r-xl`}><Plus size={14} /></button>
    </div>
  );
}
