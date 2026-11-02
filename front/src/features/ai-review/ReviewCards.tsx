import type { ReactNode } from 'react';
import { Lightbulb, Sparkles, ThumbsUp } from 'lucide-react';
import { CARD } from '../statistics/parts';
import type { AiReview } from './input';

function CardHeading({ icon, iconClass, children }: { icon: ReactNode; iconClass: string; children: ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 font-bold text-heading">
      <span aria-hidden="true" className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconClass}`}>{icon}</span>
      {children}
    </h3>
  );
}

function ListCard({ title, icon, iconClass, items }: { title: string; icon: ReactNode; iconClass: string; items: string[] }) {
  return (
    <section aria-label={title} className={`${CARD} space-y-3`}>
      <CardHeading icon={icon} iconClass={iconClass}>{title}</CardHeading>
      {items.length ? (
        <ul className="space-y-2 text-sm leading-relaxed text-heading">
          {items.map(item => (
            <li key={item} className="flex gap-2 before:mt-2 before:h-1.5 before:w-1.5 before:shrink-0 before:rounded-full before:bg-border-strong">{item}</li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted">이번 총평에는 따로 꼽은 내용이 없어요.</p>}
    </section>
  );
}

/** One generated review: the summary, then strengths and improvements side by side. */
export default function ReviewCards({ review }: { review: AiReview }) {
  const time = new Date(review.generatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="space-y-4">
      <section aria-label="총평" className={`${CARD} space-y-3`}>
        <CardHeading icon={<Sparkles size={16} />} iconClass="bg-track text-heading">총평</CardHeading>
        <p className="leading-relaxed text-heading">{review.summary}</p>
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        <ListCard title="잘한 점" icon={<ThumbsUp size={16} />} iconClass="bg-mode-upper-soft text-mode-upper" items={review.strengths} />
        <ListCard title="개선할 점" icon={<Lightbulb size={16} />} iconClass="bg-mode-keyboard-soft text-mode-keyboard" items={review.improvements} />
      </div>
      <p className="text-xs text-muted">{`${review.model} · ${time} 생성 · AI가 기록 수치만 보고 쓴 참고용 문장이에요. 의학적 판단이 아니며 저장하지 않아요.`}</p>
    </div>
  );
}
