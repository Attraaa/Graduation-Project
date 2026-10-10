export default function Metric({ label, value, detail, compact = false }: { label: string; value: string; detail: string; compact?: boolean }) {
  const measured = compact ? value.match(/^(-?\d+(?:\.\d+)?)(점|회\/분|회|%)$/) : null;
  return (
    <div className="min-w-0 rounded-xl border border-border bg-surface-muted p-3">
      <p className="text-xs font-bold text-muted">{label}</p>
      <p className={`mt-1 font-black text-heading ${compact ? 'whitespace-nowrap text-[clamp(1.125rem,2vw,1.5rem)] tabular-nums' : 'text-2xl'}`}>{measured ? <>{measured[1]}<span className="ml-1 text-xs font-medium">{measured[2]}</span></> : value}</p>
      <p className="mt-1 text-xs text-muted">{detail}</p>
    </div>
  );
}
