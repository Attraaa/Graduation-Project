import type { DeviationHour } from './summary';

export default function DeviationHours({ hours }: { hours: DeviationHour[] }) {
  if (!hours.length) return <p className="text-sm text-muted">상체 기록이 쌓이면 보여요</p>;
  const peak = Math.max(1, ...hours.map(hour => hour.count));
  const busiest = hours.filter(hour => hour.strong).map(hour => `${hour.hour}시`).join(', ');
  return (
    <div>
      <div className="flex h-24 items-end gap-1" role="img"
        aria-label={busiest ? `기준 이탈이 많은 시간: ${busiest}` : '기준 이탈 기록 없음'}>
        {hours.map(hour => (
          <span key={hour.hour} title={`${hour.hour}시 · ${hour.count}회`}
            className={`flex-1 rounded-t ${hour.strong ? 'bg-danger' : 'bg-danger/25'}`}
            style={{ height: `${Math.max(4, (hour.count / peak) * 100)}%` }} />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted">
        <span>{`${hours[0].hour}시`}</span>
        <span>{`${hours[hours.length - 1].hour}시`}</span>
      </div>
    </div>
  );
}
