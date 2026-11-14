export default function Metric({ label, value, detail, compact = false, row = false }: { label: string; value: string; detail: string; compact?: boolean; row?: boolean }) {
  const measured = compact || row ? value.match(/^(-?\d+(?:\.\d+)?)(점|회\/분|회|%)$/) : null;
  if (row) return <div className="session-metric"><div><p className="session-metric-label">{label}</p><p className="session-metric-detail">{detail}</p></div><p className="session-metric-value">{measured ? <>{measured[1]}<span>{measured[2]}</span></> : value}</p></div>;
  return (
    <div className="min-w-0 rounded-xl border border-border bg-surface-muted p-3">
      <p className={`text-xs font-bold text-muted ${compact ? 'h-8 overflow-hidden' : ''}`} title={label}>{label}</p>
      <p className={`mt-1 font-black text-heading ${compact ? 'h-9 whitespace-nowrap text-[clamp(1.125rem,2vw,1.5rem)] leading-9 tabular-nums' : 'text-2xl'}`}>{measured ? <>{measured[1]}<span className="ml-1 text-xs font-medium">{measured[2]}</span></> : value}</p>
      <p className={`mt-1 text-xs text-muted ${compact ? 'h-8 overflow-hidden' : ''}`} title={detail}>{detail}</p>
    </div>
  );
}
