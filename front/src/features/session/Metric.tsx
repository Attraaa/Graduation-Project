export default function Metric({ label, value, detail, compact = false }: { label: string; value: string; detail: string; compact?: boolean }) {
  const measured = compact ? value.match(/^(-?\d+(?:\.\d+)?)(점|회\/분|회|%)$/) : null;
  return (
    <div className="min-w-0 rounded-xl border border-border bg-surface-muted p-3">
      <p className={`text-xs font-bold text-muted ${compact ? 'h-8 overflow-hidden' : ''}`} title={label}>{label}</p>
      <p className={`mt-1 font-black text-heading ${compact ? 'h-9 whitespace-nowrap text-[clamp(1.125rem,2vw,1.5rem)] leading-9 tabular-nums' : 'text-2xl'}`}>{measured ? <>{measured[1]}<span className="ml-1 text-xs font-medium">{measured[2]}</span></> : value}</p>
      <p className={`mt-1 text-xs text-muted ${compact ? 'h-8 overflow-hidden' : ''}`} title={detail}>{detail}</p>
    </div>
  );
}
