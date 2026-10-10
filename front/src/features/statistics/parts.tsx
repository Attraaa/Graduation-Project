export const CARD = 'rounded-2xl border border-border bg-surface p-4';

export interface LegendItem { key: string; name: string; color: string; dashed?: boolean }

export function CardTitle({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-2">
      <h3 className="font-bold text-heading">{title}</h3>
      {note && <span className="text-xs text-muted">{note}</span>}
    </div>
  );
}

export function ChartHeader({ title, legend, hint }: { title: string; legend: LegendItem[]; hint?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-bold text-heading">{title}</h3>
      <ul className="flex flex-wrap items-center gap-3 text-xs text-muted">
        {legend.map(item => (
          <li key={item.key} className="flex items-center gap-1">
            <span aria-hidden="true" className={item.dashed ? 'h-0 w-3 border-t-2 border-dashed' : 'h-2 w-2 rounded-full'}
              style={item.dashed ? { borderColor: item.color } : { background: item.color }} />
            {item.name}
          </li>
        ))}
        {hint && <li>{hint}</li>}
      </ul>
    </div>
  );
}

export function EmptyChart({ text = '이 기간에 측정한 기록이 없어요' }: { text?: string }) {
  return <p className="flex h-72 items-center justify-center px-4 text-center text-sm text-muted">{text}</p>;
}

export function Waiting() {
  return <p className="text-sm text-muted">기록이 쌓이면 보여요</p>;
}

export function HistoryLink({ onClick, text = '학습이력에서 보기 →' }: { onClick: () => void; text?: string }) {
  return (
    <button type="button" onClick={onClick} className="mt-3 text-sm font-semibold text-secondary hover:underline">{text}</button>
  );
}
