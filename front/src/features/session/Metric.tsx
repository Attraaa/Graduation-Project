export default function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-muted p-3">
      <p className="text-xs font-bold text-muted">{label}</p>
      <p className="mt-1 text-2xl font-black text-heading">{value}</p>
      <p className="mt-1 text-xs text-muted">{detail}</p>
    </div>
  );
}
