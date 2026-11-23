export default function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-surface-muted p-3">
      <p className="text-xs font-bold text-muted" title={label}>{label}</p>
      <p className="mt-1 text-2xl font-black text-heading">{value}</p>
      {detail && <p className="mt-1 text-xs text-muted" title={detail}>{detail}</p>}
    </div>
  );
}
